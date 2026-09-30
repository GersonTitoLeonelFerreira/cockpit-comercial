// Provedor Claude (API de Mensagens da Anthropic) com a MESMA interface do
// provedor OpenAI (StatefulCopilotProvider).
//
// O Companion continua igual: os mesmos prompts, os mesmos contratos JSON,
// os mesmos normalizadores e o mesmo painel. Só muda quem responde. Este
// arquivo traduz a requisição já montada pelo pipeline para o formato do
// Claude e devolve o JSON no mesmo formato que o executor já espera.
//
// Diferenças que este provedor absorve:
// - Raciocínio: liga o raciocínio adaptativo com um esforço por etapa
//   (diagnóstico pensa mais; comunicação e chamadas auxiliares pensam
//   menos, para caber no tempo). O limite de tokens soma uma folga para o
//   raciocínio, porque no Claude ele conta dentro de max_tokens.
// - Saída estruturada: o schema estrito da OpenAI vira output_config.format.
//   Palavras-chave que o Claude não aceita (minLength, maxItems...) saem do
//   schema e viram texto na descrição do campo; o normalizador do contrato
//   continua validando tudo depois. Se o schema passar dos limites do
//   Claude, ou a API recusar o formato, o schema vai no prompt e o JSON é
//   extraído do texto.
// - Enums: a API não garante maiúsculas/minúsculas dos enums; o valor volta
//   para a grafia exata do schema antes de chegar ao normalizador.

import {
  StatefulCopilotExecutionError,
  type StatefulCopilotProvider,
  type StatefulCopilotProviderRequest,
  type StatefulCopilotProviderResponse,
  type StatefulCopilotUsage,
} from './stateful-copilot-executor'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract'

export const ANTHROPIC_MESSAGES_URL =
  'https://api.anthropic.com/v1/messages'

export const ANTHROPIC_API_VERSION =
  '2023-06-01'

export const DEFAULT_COMPANION_ANTHROPIC_MODEL =
  'claude-sonnet-5-5'

export const COMPANION_ANTHROPIC_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export type CompanionAnthropicEffort =
  (typeof COMPANION_ANTHROPIC_EFFORTS)[number]

export type CompanionAnthropicStage =
  | 'diagnostic'
  | 'communication'
  | 'auxiliary'

export type CompanionAnthropicThinking =
  | 'adaptive'
  | 'disabled'

export type CompanionAnthropicOutputMode =
  | 'grammar'
  | 'prompt'
  | 'none'

type JsonRecord =
  Record<string, unknown>

type EnvLike =
  Record<string, string | undefined>

type StageDefaults = {
  effort: CompanionAnthropicEffort
  timeout_ms: number
  max_output_tokens: number
  prompt_cache: boolean
}

// Diagnóstico: é a leitura da conversa, onde a qualidade mais importa.
// Comunicação e auxiliares: textos curtos, com o vendedor esperando.
// O cache de prompt fica desligado no diagnóstico porque o schema dele muda
// a cada estado (IDs de memória), e trocar o formato invalida o cache.
export const COMPANION_ANTHROPIC_STAGE_DEFAULTS:
  Readonly<Record<CompanionAnthropicStage, StageDefaults>> =
    Object.freeze({
      diagnostic: {
        effort: 'medium',
        timeout_ms: 120_000,
        max_output_tokens: 8_000,
        prompt_cache: false,
      },
      communication: {
        effort: 'low',
        timeout_ms: 75_000,
        max_output_tokens: 8_000,
        prompt_cache: true,
      },
      auxiliary: {
        effort: 'low',
        timeout_ms: 45_000,
        max_output_tokens: 2_000,
        prompt_cache: true,
      },
    })

// Folga de tokens para o raciocínio, somada ao limite de saída pedido.
export const COMPANION_ANTHROPIC_THINKING_ALLOWANCE:
  Readonly<Record<CompanionAnthropicEffort, number>> =
    Object.freeze({
      low: 4_000,
      medium: 12_000,
      high: 20_000,
      xhigh: 32_000,
      max: 48_000,
    })

const MAX_TOTAL_OUTPUT_TOKENS =
  64_000

const MIN_OUTPUT_TOKENS =
  256

const MIN_TIMEOUT_MS =
  10

const MAX_TIMEOUT_MS =
  170_000

const MAX_RESPONSE_LENGTH =
  2_000_000

// Limites documentados da saída estruturada do Claude.
export const ANTHROPIC_GRAMMAR_MAX_UNION_PARAMETERS =
  16

export const ANTHROPIC_GRAMMAR_MAX_OPTIONAL_PARAMETERS =
  24

const TRANSIENT_STATUS_CODES =
  new Set([408, 409, 429, 500, 502, 503, 504, 529])

const TRANSIENT_RETRY_DELAY_MS =
  1_500

const TRANSIENT_RETRY_MIN_REMAINING_MS =
  20_000

const SUPPORTED_STRING_FORMATS =
  new Set([
    'date-time',
    'time',
    'date',
    'duration',
    'email',
    'hostname',
    'uri',
    'ipv4',
    'ipv6',
    'uuid',
  ])

const DROPPED_SCHEMA_KEYWORDS =
  new Set([
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'pattern',
    'patternProperties',
    'propertyNames',
    'contains',
    'minContains',
    'maxContains',
    'dependentRequired',
    'dependentSchemas',
    'unevaluatedProperties',
    'unevaluatedItems',
  ])

export type StatefulCopilotAnthropicProviderOptions = {
  api_key?: string | null

  // Modelo para todas as etapas. Sem ele, cada etapa usa a variável de
  // ambiente dela (ou o padrão).
  model?: string | null

  // Modelo só da comunicação (tem prioridade sobre `model` nessa etapa).
  communication_model?: string | null

  // Esforço para todas as etapas. Sem ele, cada etapa usa a variável de
  // ambiente dela (ou o padrão da etapa).
  effort?: CompanionAnthropicEffort | null

  timeout_ms?: number
  max_output_tokens?: number
  fetch_impl?: typeof fetch
  env?: EnvLike
  sleep?: (ms: number) => Promise<void>
  log?: (event: string, fields: JsonRecord) => void
}

export class StatefulCopilotAnthropicProviderError
  extends StatefulCopilotExecutionError {
  constructor({
    code,
    message,
    status_code,
    retryable,
    details = null,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
    details?: JsonRecord | null
  }) {
    super({
      code,
      message,
      status_code,
      retryable,
      details,
    })

    this.name =
      'StatefulCopilotAnthropicProviderError'
  }
}

function fail(args: {
  code: string
  message: string
  status_code: number
  retryable: boolean
  details?: JsonRecord | null
}): never {
  throw new StatefulCopilotAnthropicProviderError(args)
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray(value) === false
  )
}

function normalizeOptionalString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function boundedInteger({
  value,
  fallback,
  minimum,
  maximum,
}: {
  value: unknown
  fallback: number
  minimum: number
  maximum: number
}): number {
  if (
    typeof value !== 'number' ||
    Number.isFinite(value) === false
  ) {
    return fallback
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(value),
    ),
  )
}

function parseEffort(
  value: unknown,
): CompanionAnthropicEffort | null {
  const normalized =
    normalizeOptionalString(value)?.toLowerCase()

  return (
    COMPANION_ANTHROPIC_EFFORTS.find(
      (effort) => effort === normalized,
    ) ?? null
  )
}

export function isClaudeModelName(
  value: unknown,
): value is string {
  const normalized =
    normalizeOptionalString(value)

  return (
    normalized !== null &&
    normalized.toLowerCase().startsWith('claude-')
  )
}

// ---------------------------------------------------------------------------
// Etapa, modelo, esforço e raciocínio
// ---------------------------------------------------------------------------

export function resolveCompanionAnthropicStage(
  request: Pick<StatefulCopilotProviderRequest, 'output_contract_version'>,
): CompanionAnthropicStage {
  if (
    request.output_contract_version ===
    STATEFUL_COPILOT_CONTRACT_VERSION
  ) {
    return 'diagnostic'
  }

  if (
    request.output_contract_version ===
    STATEFUL_COMMUNICATION_CONTRACT_VERSION
  ) {
    return 'communication'
  }

  return 'auxiliary'
}

const STAGE_MODEL_ENV:
  Readonly<Record<CompanionAnthropicStage, string | null>> = {
    diagnostic: 'COMPANION_ANTHROPIC_DIAGNOSTIC_MODEL',
    communication: 'COMPANION_ANTHROPIC_COMMUNICATION_MODEL',
    auxiliary: null,
  }

const STAGE_EFFORT_ENV:
  Readonly<Record<CompanionAnthropicStage, string | null>> = {
    diagnostic: 'COMPANION_ANTHROPIC_DIAGNOSTIC_EFFORT',
    communication: 'COMPANION_ANTHROPIC_COMMUNICATION_EFFORT',
    auxiliary: null,
  }

export function resolveCompanionAnthropicModel({
  stage,
  options,
  env,
}: {
  stage: CompanionAnthropicStage
  options: StatefulCopilotAnthropicProviderOptions
  env: EnvLike
}): string {
  if (
    stage === 'communication' &&
    isClaudeModelName(options.communication_model)
  ) {
    return options.communication_model.trim()
  }

  if (isClaudeModelName(options.model)) {
    return options.model.trim()
  }

  const stageEnvKey =
    STAGE_MODEL_ENV[stage]

  const stageModel =
    stageEnvKey
      ? normalizeOptionalString(env[stageEnvKey])
      : null

  return (
    stageModel ??
    normalizeOptionalString(env.COMPANION_ANTHROPIC_MODEL) ??
    DEFAULT_COMPANION_ANTHROPIC_MODEL
  )
}

export function resolveCompanionAnthropicEffort({
  stage,
  options,
  env,
}: {
  stage: CompanionAnthropicStage
  options: StatefulCopilotAnthropicProviderOptions
  env: EnvLike
}): CompanionAnthropicEffort {
  const explicit =
    parseEffort(options.effort)

  if (explicit) {
    return explicit
  }

  const stageEnvKey =
    STAGE_EFFORT_ENV[stage]

  const stageEffort =
    stageEnvKey
      ? parseEffort(env[stageEnvKey])
      : null

  if (stageEffort) {
    return stageEffort
  }

  // COMPANION_ANTHROPIC_EFFORT vale para as chamadas auxiliares; as duas
  // etapas principais só mudam pela variável própria.
  if (stage === 'auxiliary') {
    const auxiliaryEffort =
      parseEffort(env.COMPANION_ANTHROPIC_EFFORT)

    if (auxiliaryEffort) {
      return auxiliaryEffort
    }
  }

  return COMPANION_ANTHROPIC_STAGE_DEFAULTS[stage].effort
}

// Haiku 4.5 não aceita o parâmetro de esforço nem o raciocínio adaptativo.
export function supportsAdaptiveThinking(
  model: string,
): boolean {
  return /haiku/i.test(model) === false
}

export function resolveCompanionAnthropicThinking({
  model,
  env,
}: {
  model: string
  env: EnvLike
}): CompanionAnthropicThinking {
  const configured =
    normalizeOptionalString(env.COMPANION_ANTHROPIC_THINKING)?.toLowerCase()

  if (configured === 'disabled' || configured === 'off') {
    return 'disabled'
  }

  return supportsAdaptiveThinking(model)
    ? 'adaptive'
    : 'disabled'
}

// ---------------------------------------------------------------------------
// Schema: tradução do schema estrito da OpenAI para o Claude
// ---------------------------------------------------------------------------

export type AnthropicSchemaPreparation = {
  schema: JsonRecord
  union_parameter_count: number
  optional_parameter_count: number
  grammar_eligible: boolean
}

function describeDroppedConstraint(
  key: string,
  value: unknown,
): string {
  switch (key) {
    case 'minLength':
      return `mínimo de ${String(value)} caracteres`
    case 'maxLength':
      return `máximo de ${String(value)} caracteres`
    case 'minimum':
      return `valor mínimo ${String(value)}`
    case 'maximum':
      return `valor máximo ${String(value)}`
    case 'exclusiveMinimum':
      return `valor maior que ${String(value)}`
    case 'exclusiveMaximum':
      return `valor menor que ${String(value)}`
    case 'multipleOf':
      return `múltiplo de ${String(value)}`
    case 'maxItems':
      return value === 0
        ? 'lista sempre vazia []'
        : `no máximo ${String(value)} itens`
    case 'uniqueItems':
      return value === true
        ? 'itens sem repetição'
        : `uniqueItems ${String(value)}`
    case 'pattern':
      return `seguir o padrão ${String(value)}`
    default:
      return `${key}: ${JSON.stringify(value)}`
  }
}

function isObjectSchema(
  node: JsonRecord,
): boolean {
  return (
    node.type === 'object' ||
    (
      Array.isArray(node.type) &&
      node.type.includes('object')
    ) ||
    isRecord(node.properties)
  )
}

function mapRecordValues(
  value: unknown,
  mapper: (child: unknown) => unknown,
): unknown {
  if (!isRecord(value)) {
    return value
  }

  const mapped: JsonRecord = {}

  for (const [key, child] of Object.entries(value)) {
    mapped[key] = mapper(child)
  }

  return mapped
}

export function prepareSchemaForAnthropic(
  schema: unknown,
): AnthropicSchemaPreparation {
  let unionCount = 0
  let optionalCount = 0

  const sanitize = (
    node: unknown,
  ): unknown => {
    if (Array.isArray(node)) {
      return node.map(sanitize)
    }

    if (!isRecord(node)) {
      return node
    }

    const output: JsonRecord = {}
    const notes: string[] = []

    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' || key === '$defs' || key === 'definitions') {
        output[key] = mapRecordValues(value, sanitize)
        continue
      }

      if (key === 'items' || key === 'anyOf' || key === 'allOf') {
        output[key] = sanitize(value)
        continue
      }

      if (key === 'oneOf') {
        // O Claude aceita anyOf; para saída estruturada o efeito é o mesmo.
        output.anyOf = sanitize(value)
        continue
      }

      if (key === 'minItems') {
        if (typeof value === 'number' && value > 1) {
          output.minItems = 1
          notes.push(`pelo menos ${value} itens`)
        } else {
          output.minItems = value
        }

        continue
      }

      if (key === 'format') {
        if (
          typeof value === 'string' &&
          SUPPORTED_STRING_FORMATS.has(value)
        ) {
          output.format = value
        } else {
          notes.push(`formato ${String(value)}`)
        }

        continue
      }

      if (DROPPED_SCHEMA_KEYWORDS.has(key)) {
        notes.push(describeDroppedConstraint(key, value))
        continue
      }

      output[key] = value
    }

    if (isObjectSchema(output)) {
      output.additionalProperties = false

      const propertyNames =
        isRecord(output.properties)
          ? Object.keys(output.properties)
          : []

      const required =
        new Set(
          Array.isArray(output.required)
            ? output.required.filter(
                (entry): entry is string => typeof entry === 'string',
              )
            : [],
        )

      optionalCount +=
        propertyNames.filter((name) => !required.has(name)).length
    }

    if (Array.isArray(output.anyOf) || Array.isArray(output.type)) {
      unionCount += 1
    }

    if (notes.length > 0) {
      const existing =
        normalizeOptionalString(output.description)

      output.description = [
        existing,
        `Restrições: ${notes.join('; ')}.`,
      ]
        .filter(Boolean)
        .join(' ')
    }

    return output
  }

  const sanitized =
    sanitize(schema)

  const preparedSchema =
    isRecord(sanitized)
      ? sanitized
      : {}

  return {
    schema: preparedSchema,
    union_parameter_count: unionCount,
    optional_parameter_count: optionalCount,
    grammar_eligible:
      isRecord(sanitized) &&
      unionCount <= ANTHROPIC_GRAMMAR_MAX_UNION_PARAMETERS &&
      optionalCount <= ANTHROPIC_GRAMMAR_MAX_OPTIONAL_PARAMETERS,
  }
}

// ---------------------------------------------------------------------------
// Enums: devolve a grafia exata do schema (a API não garante maiúsculas)
// ---------------------------------------------------------------------------

function matchStringChoice(
  value: string,
  choices: readonly unknown[],
): string | null {
  if (choices.includes(value)) {
    return value
  }

  const lowered =
    value.toLowerCase()

  const match =
    choices.find(
      (choice): choice is string =>
        typeof choice === 'string' &&
        choice.toLowerCase() === lowered,
    )

  return match ?? null
}

function chooseObjectBranch(
  value: JsonRecord,
  branches: readonly unknown[],
): JsonRecord | null {
  const keys =
    Object.keys(value)

  let best: JsonRecord | null = null
  let bestScore = -1

  for (const branch of branches) {
    if (!isRecord(branch) || !isRecord(branch.properties)) {
      continue
    }

    const properties =
      branch.properties

    const score =
      keys.filter((key) => key in properties).length

    if (score > bestScore) {
      best = branch
      bestScore = score
    }
  }

  return best
}

export function canonicalizeEnumCasing(
  value: unknown,
  schema: unknown,
): unknown {
  if (!isRecord(schema)) {
    return value
  }

  if (typeof value === 'string') {
    if (Array.isArray(schema.enum)) {
      return matchStringChoice(value, schema.enum) ?? value
    }

    if (typeof schema.const === 'string') {
      return matchStringChoice(value, [schema.const]) ?? value
    }
  }

  if (Array.isArray(schema.anyOf)) {
    if (typeof value === 'string') {
      for (const branch of schema.anyOf) {
        const candidate =
          canonicalizeEnumCasing(value, branch)

        if (candidate !== value) {
          return candidate
        }
      }

      return value
    }

    if (Array.isArray(value)) {
      const arrayBranch =
        schema.anyOf.find(
          (branch) =>
            isRecord(branch) &&
            (branch.type === 'array' || isRecord(branch.items)),
        )

      return arrayBranch
        ? canonicalizeEnumCasing(value, arrayBranch)
        : value
    }

    if (isRecord(value)) {
      const objectBranch =
        chooseObjectBranch(value, schema.anyOf)

      return objectBranch
        ? canonicalizeEnumCasing(value, objectBranch)
        : value
    }

    return value
  }

  if (Array.isArray(value)) {
    return isRecord(schema.items)
      ? value.map((item) => canonicalizeEnumCasing(item, schema.items))
      : value
  }

  if (isRecord(value) && isRecord(schema.properties)) {
    const properties =
      schema.properties

    const output: JsonRecord = {}

    for (const [key, child] of Object.entries(value)) {
      output[key] =
        key in properties
          ? canonicalizeEnumCasing(child, properties[key])
          : child
    }

    return output
  }

  return value
}

// ---------------------------------------------------------------------------
// Conformidade com o schema original
// ---------------------------------------------------------------------------
//
// Quando o schema vai no prompt (a API recusou a gramática), nada obriga o
// Claude a seguir as restrições que a gramática garantiria. Os desvios
// observados em produção de teste foram estruturais: lista obrigatória
// omitida ou nula, ID de mensagem em lista de memória que precisa ficar
// vazia, ID repetido. Este passo aplica o schema ORIGINAL (com maxItems e
// enums) à resposta, fazendo só o que a gramática teria feito: completa
// listas e nulos obrigatórios, tira chaves fora do schema, tira itens fora
// do enum, corta listas acima do máximo e remove IDs repetidos. Texto e
// decisões do modelo não mudam. O normalizador do contrato continua
// validando tudo depois.

export type SchemaConformanceStats = {
  filled_missing: number
  removed_extra_keys: number
  removed_invalid_items: number
  truncated_arrays: number
  removed_duplicates: number
  nulled_invalid_values: number
  global_evidence_added: number
}

export function emptySchemaConformanceStats(): SchemaConformanceStats {
  return {
    filled_missing: 0,
    removed_extra_keys: 0,
    removed_invalid_items: 0,
    truncated_arrays: 0,
    removed_duplicates: 0,
    nulled_invalid_values: 0,
    global_evidence_added: 0,
  }
}

function schemaAllowsNull(
  schema: unknown,
): boolean {
  if (!isRecord(schema)) {
    return false
  }

  if (schema.type === 'null') {
    return true
  }

  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    return true
  }

  if (Array.isArray(schema.enum) && schema.enum.includes(null)) {
    return true
  }

  return (
    Array.isArray(schema.anyOf) &&
    schema.anyOf.some(schemaAllowsNull)
  )
}

function isArraySchema(
  schema: unknown,
): boolean {
  return (
    isRecord(schema) &&
    (
      schema.type === 'array' ||
      (Array.isArray(schema.type) && schema.type.includes('array')) ||
      isRecord(schema.items)
    )
  )
}

function schemaChoices(
  schema: unknown,
): readonly unknown[] | null {
  if (!isRecord(schema)) {
    return null
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum
  }

  if ('const' in schema) {
    return [schema.const]
  }

  return null
}

// Enum de um item de lista, direto ou dentro de anyOf (ex.: enum | null).
function itemChoices(
  schema: unknown,
): readonly unknown[] | null {
  const direct =
    schemaChoices(schema)

  if (direct) {
    return direct
  }

  if (isRecord(schema) && Array.isArray(schema.anyOf)) {
    const collected: unknown[] = []

    for (const branch of schema.anyOf) {
      const choices =
        schemaChoices(branch)

      if (choices) {
        collected.push(...choices)
      } else if (!(isRecord(branch) && branch.type === 'null')) {
        return null
      }
    }

    return collected.length > 0
      ? collected
      : null
  }

  return null
}

function matchChoice(
  value: unknown,
  choices: readonly unknown[],
): { matched: boolean; value: unknown } {
  if (choices.includes(value)) {
    return { matched: true, value }
  }

  if (typeof value === 'string') {
    const canonical =
      matchStringChoice(value, choices)

    if (canonical !== null) {
      return { matched: true, value: canonical }
    }
  }

  return { matched: false, value }
}

function missingValueFor(
  schema: unknown,
): { fill: boolean; value: unknown } {
  if (isArraySchema(schema) && !schemaAllowsNull(schema)) {
    return { fill: true, value: [] }
  }

  if (schemaAllowsNull(schema)) {
    return { fill: true, value: null }
  }

  if (isArraySchema(schema)) {
    return { fill: true, value: [] }
  }

  return { fill: false, value: undefined }
}

function conformNode(
  value: unknown,
  schema: unknown,
  stats: SchemaConformanceStats,
  key: string | null,
): unknown {
  if (!isRecord(schema)) {
    return value
  }

  if (Array.isArray(schema.anyOf)) {
    if (value === null && schemaAllowsNull(schema)) {
      return null
    }

    const branches =
      schema.anyOf.filter(isRecord)

    if (Array.isArray(value)) {
      const arrayBranch =
        branches.find(isArraySchema)

      return arrayBranch
        ? conformNode(value, arrayBranch, stats, key)
        : value
    }

    if (isRecord(value)) {
      const objectBranch =
        chooseObjectBranch(value, branches)

      return objectBranch
        ? conformNode(value, objectBranch, stats, key)
        : value
    }

    if (value === undefined || value === null) {
      return value
    }

    const choiceBranches =
      branches.filter((branch) => schemaChoices(branch) !== null)

    for (const branch of choiceBranches) {
      const match =
        matchChoice(value, schemaChoices(branch) ?? [])

      if (match.matched) {
        return match.value
      }
    }

    const freeBranch =
      branches.find(
        (branch) =>
          schemaChoices(branch) === null &&
          branch.type !== 'null',
      )

    if (freeBranch) {
      return conformNode(value, freeBranch, stats, key)
    }

    // Valor fora de todos os enums de um campo que aceita nulo: a gramática
    // nunca deixaria sair; nulo é o valor seguro.
    if (choiceBranches.length > 0 && schemaAllowsNull(schema)) {
      stats.nulled_invalid_values += 1
      return null
    }

    return value
  }

  const choices =
    schemaChoices(schema)

  if (choices) {
    return matchChoice(value, choices).value
  }

  if (isArraySchema(schema)) {
    if (value === null && !schemaAllowsNull(schema)) {
      stats.filled_missing += 1
      return []
    }

    if (!Array.isArray(value)) {
      return value
    }

    let items =
      value.map((item) =>
        conformNode(item, schema.items, stats, key),
      )

    const allowed =
      itemChoices(schema.items)

    if (allowed) {
      const before =
        items.length

      items =
        items.filter((item) => allowed.includes(item))

      stats.removed_invalid_items += before - items.length
    }

    const isIdList =
      (key !== null && key.endsWith('_ids')) ||
      allowed !== null

    if (
      isIdList &&
      items.every((item) => typeof item === 'string')
    ) {
      const unique =
        [...new Set(items)]

      stats.removed_duplicates += items.length - unique.length
      items = unique
    }

    if (
      typeof schema.maxItems === 'number' &&
      schema.maxItems >= 0 &&
      items.length > schema.maxItems
    ) {
      items = items.slice(0, schema.maxItems)
      stats.truncated_arrays += 1
    }

    return items
  }

  if (isRecord(value) && isRecord(schema.properties)) {
    const properties =
      schema.properties

    const output: JsonRecord = {}

    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey in properties) {
        output[childKey] =
          conformNode(childValue, properties[childKey], stats, childKey)
      } else if (schema.additionalProperties === false) {
        stats.removed_extra_keys += 1
      } else {
        output[childKey] = childValue
      }
    }

    const required =
      Array.isArray(schema.required)
        ? schema.required.filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : []

    for (const requiredKey of required) {
      if (output[requiredKey] !== undefined) {
        continue
      }

      const missing =
        missingValueFor(properties[requiredKey])

      if (missing.fill) {
        output[requiredKey] = missing.value
        stats.filled_missing += 1
      }
    }

    return output
  }

  return value
}

export function conformToSchema(
  value: unknown,
  schema: unknown,
  stats: SchemaConformanceStats = emptySchemaConformanceStats(),
): unknown {
  return conformNode(value, schema, stats, null)
}

// Diagnóstico: a lista global de evidências é, por contrato, a união das
// evidências citadas nos demais campos. O Claude às vezes deixa de repetir
// alguma; este passo completa a lista global com as que foram citadas.
export function completeGlobalEvidence(
  output: unknown,
  stats: SchemaConformanceStats = emptySchemaConformanceStats(),
): unknown {
  if (!isRecord(output) || !Array.isArray(output.evidence_message_ids)) {
    return output
  }

  const globalIds =
    output.evidence_message_ids.filter(
      (id): id is string => typeof id === 'string',
    )

  const seen =
    new Set(globalIds)

  const visit = (
    node: unknown,
  ) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!isRecord(node)) {
      return
    }

    for (const [childKey, childValue] of Object.entries(node)) {
      if (
        childKey === 'evidence_message_ids' &&
        Array.isArray(childValue)
      ) {
        for (const id of childValue) {
          if (typeof id === 'string' && !seen.has(id)) {
            seen.add(id)
            globalIds.push(id)
            stats.global_evidence_added += 1
          }
        }

        continue
      }

      visit(childValue)
    }
  }

  for (const [childKey, childValue] of Object.entries(output)) {
    if (childKey !== 'evidence_message_ids') {
      visit(childValue)
    }
  }

  return {
    ...output,
    evidence_message_ids: globalIds,
  }
}

// ---------------------------------------------------------------------------
// Texto de saída
// ---------------------------------------------------------------------------

export function extractJsonText(
  text: string,
): string {
  const trimmed =
    text.trim()

  const fenced =
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)

  const candidate =
    fenced
      ? fenced[1].trim()
      : trimmed

  try {
    JSON.parse(candidate)
    return candidate
  } catch {
    // tenta o maior trecho entre chaves
  }

  const first =
    candidate.indexOf('{')

  const last =
    candidate.lastIndexOf('}')

  if (first >= 0 && last > first) {
    const slice =
      candidate.slice(first, last + 1)

    try {
      JSON.parse(slice)
      return slice
    } catch {
      // devolve o texto como veio; o executor acusa JSON inválido
    }
  }

  return candidate
}

function finalizeContent({
  text,
  originalSchema,
  stage,
  stats,
}: {
  text: string
  originalSchema: JsonRecord | null
  stage: CompanionAnthropicStage
  stats: SchemaConformanceStats
}): string {
  const jsonText =
    extractJsonText(text)

  if (!originalSchema) {
    return jsonText
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(jsonText)
  } catch {
    // Devolve o texto como veio; o executor acusa JSON inválido.
    return jsonText
  }

  let conformed =
    conformToSchema(parsed, originalSchema, stats)

  if (stage === 'diagnostic') {
    conformed =
      completeGlobalEvidence(conformed, stats)
  }

  return JSON.stringify(conformed)
}

export function buildSchemaInstruction(
  schema: JsonRecord,
): string {
  return [
    '## Formato obrigatório da resposta',
    'Responda somente com um único objeto JSON válido, sem nenhum texto antes ou depois e sem blocos de código.',
    'O objeto precisa seguir exatamente o JSON Schema abaixo: todos os campos listados em "required" aparecem, nenhum campo extra é permitido e os valores de "enum" são copiados exatamente como estão escritos.',
    'Nunca omita um campo: quando não houver nada a informar, use [] para listas e null para campos que aceitam nulo.',
    'Campos de memória (memory_ids, memory_id) só aceitam os IDs de memória listados no schema; IDs de mensagem nunca entram neles.',
    '<json_schema>',
    JSON.stringify(schema),
    '</json_schema>',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Requisição
// ---------------------------------------------------------------------------

type RequestPlan = {
  model: string
  max_tokens: number
  system_text: string
  user_text: string
  prompt_cache: boolean
  thinking: CompanionAnthropicThinking
  effort: CompanionAnthropicEffort | null
  output_mode: CompanionAnthropicOutputMode
  schema: JsonRecord | null
}

export function buildAnthropicRequestBody(
  plan: RequestPlan,
): JsonRecord {
  const systemText =
    plan.output_mode === 'prompt' && plan.schema
      ? `${plan.system_text}\n\n${buildSchemaInstruction(plan.schema)}`
      : plan.system_text

  const outputConfig: JsonRecord = {}

  if (plan.thinking === 'adaptive' && plan.effort) {
    outputConfig.effort =
      plan.effort
  }

  if (plan.output_mode === 'grammar' && plan.schema) {
    outputConfig.format = {
      type: 'json_schema',
      schema: plan.schema,
    }
  }

  return {
    model: plan.model,
    max_tokens: plan.max_tokens,

    system: [
      {
        type: 'text',
        text: systemText,
        ...(plan.prompt_cache
          ? { cache_control: { type: 'ephemeral' } }
          : {}),
      },
    ],

    messages: [
      {
        role: 'user',
        content: plan.user_text,
      },
    ],

    ...(plan.thinking === 'adaptive'
      ? { thinking: { type: 'adaptive' } }
      : {}),

    ...(Object.keys(outputConfig).length > 0
      ? { output_config: outputConfig }
      : {}),
  }
}

function validateProviderRequest(
  request: StatefulCopilotProviderRequest,
) {
  const invalid = (message: string): never =>
    fail({
      code: 'INVALID_ANTHROPIC_PROVIDER_REQUEST',
      message,
      status_code: 500,
      retryable: false,
    })

  if (
    typeof request.prompt_version !== 'string' ||
    request.prompt_version.trim() === ''
  ) {
    invalid('A versão do prompt recebida pelo provedor é inválida.')
  }

  if (
    typeof request.output_contract_version !== 'string' ||
    request.output_contract_version.trim() === ''
  ) {
    invalid('A versão do contrato recebida pelo provedor é inválida.')
  }

  if (
    typeof request.system_prompt !== 'string' ||
    typeof request.user_prompt !== 'string' ||
    request.system_prompt.trim() === '' ||
    request.user_prompt.trim() === ''
  ) {
    invalid('O provedor recebeu prompts vazios.')
  }

  if (!isRecord(request.structured_output_format)) {
    invalid('O provedor recebeu um formato de saída estruturada inválido.')
  }
}

function readRequestSchema(
  format: JsonRecord,
): JsonRecord | null {
  if (
    format.type === 'json_schema' &&
    isRecord(format.schema)
  ) {
    return format.schema
  }

  return null
}

// ---------------------------------------------------------------------------
// Resposta
// ---------------------------------------------------------------------------

type ParsedAnthropicMessage = {
  text: string
  model: string | null
  message_id: string | null
  stop_reason: string | null
  usage: StatefulCopilotUsage | null
  cache_read_input_tokens: number | null
  cache_creation_input_tokens: number | null
}

function readTokenCount(
  value: unknown,
): number | null {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
    ? value
    : null
}

export function parseAnthropicMessage(
  payload: unknown,
): ParsedAnthropicMessage {
  if (
    !isRecord(payload) ||
    payload.type !== 'message' ||
    !Array.isArray(payload.content)
  ) {
    fail({
      code: 'ANTHROPIC_INVALID_RESPONSE',
      message: 'O Claude retornou uma resposta com formato inesperado.',
      status_code: 502,
      retryable: true,
    })
  }

  // Blocos de raciocínio ficam de fora: só o texto final vira conteúdo.
  const text =
    payload.content
      .filter(
        (block): block is JsonRecord =>
          isRecord(block) &&
          block.type === 'text' &&
          typeof block.text === 'string',
      )
      .map((block) => block.text as string)
      .join('')
      .trim()

  const usageRecord =
    isRecord(payload.usage)
      ? payload.usage
      : {}

  const baseInput =
    readTokenCount(usageRecord.input_tokens)

  const cacheRead =
    readTokenCount(usageRecord.cache_read_input_tokens)

  const cacheCreation =
    readTokenCount(usageRecord.cache_creation_input_tokens)

  const outputTokens =
    readTokenCount(usageRecord.output_tokens)

  const totalInput =
    baseInput === null && cacheRead === null && cacheCreation === null
      ? null
      : (baseInput ?? 0) + (cacheRead ?? 0) + (cacheCreation ?? 0)

  const usage: StatefulCopilotUsage | null =
    totalInput === null && outputTokens === null
      ? null
      : {
          input_tokens: totalInput,
          output_tokens: outputTokens,
          total_tokens:
            totalInput === null || outputTokens === null
              ? null
              : totalInput + outputTokens,
        }

  return {
    text,
    model: normalizeOptionalString(payload.model),
    message_id: normalizeOptionalString(payload.id),
    stop_reason: normalizeOptionalString(payload.stop_reason),
    usage,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreation,
  }
}

function readProviderError(
  payload: unknown,
): { type: string | null; message: string } {
  if (isRecord(payload) && isRecord(payload.error)) {
    return {
      type: normalizeOptionalString(payload.error.type),
      message:
        normalizeOptionalString(payload.error.message)?.slice(0, 300) ??
        'erro sem detalhe',
    }
  }

  return {
    type: null,
    message: 'erro sem detalhe',
  }
}

function httpErrorCode(
  status: number,
): string {
  if (status === 401) {
    return 'ANTHROPIC_AUTHENTICATION_FAILED'
  }

  if (status === 403) {
    return 'ANTHROPIC_PERMISSION_DENIED'
  }

  if (status === 413) {
    return 'ANTHROPIC_REQUEST_TOO_LARGE'
  }

  if (status === 429) {
    return 'ANTHROPIC_RATE_LIMITED'
  }

  if (status === 529) {
    return 'ANTHROPIC_OVERLOADED'
  }

  if (status >= 500) {
    return 'ANTHROPIC_PROVIDER_UNAVAILABLE'
  }

  return 'ANTHROPIC_REQUEST_REJECTED'
}

function httpErrorMessage(
  status: number,
): string {
  if (status === 401) {
    return 'A autenticação com o Claude falhou.'
  }

  if (status === 403) {
    return 'O Claude recusou o acesso ao modelo solicitado.'
  }

  if (status === 429) {
    return 'O Claude atingiu um limite temporário de solicitações.'
  }

  if (status === 529) {
    return 'O Claude está sobrecarregado no momento.'
  }

  if (status >= 500) {
    return 'O Claude está temporariamente indisponível.'
  }

  return 'O Claude rejeitou a solicitação.'
}

function isFormatRejection(
  message: string,
): boolean {
  return /output_config|format|json_schema|schema|grammar|structured/i.test(message)
}

function isThinkingRejection(
  message: string,
): boolean {
  return /thinking|effort|adaptive/i.test(message)
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    isRecord(error) &&
    error.name === 'AbortError'
  )
}

function defaultLog(
  event: string,
  fields: JsonRecord,
): void {
  console.info(
    'YOLEN_COMPANION_AI_PROVIDER',
    JSON.stringify({
      event,
      ...fields,
    }),
  )
}

// Schemas que a API já recusou neste processo: as próximas chamadas vão
// direto com o schema no prompt, sem pagar outra recusa.
const grammarRejectedSchemas =
  new Set<string>()

export function resetAnthropicGrammarRejectionCache(): void {
  grammarRejectedSchemas.clear()
}

// ---------------------------------------------------------------------------
// Provedor
// ---------------------------------------------------------------------------

export function createStatefulCopilotAnthropicProvider(
  options: StatefulCopilotAnthropicProviderOptions = {},
): StatefulCopilotProvider {
  return async (
    request,
  ): Promise<StatefulCopilotProviderResponse> => {
    validateProviderRequest(request)

    const env =
      options.env ?? process.env

    const log =
      options.log ?? defaultLog

    const apiKey =
      normalizeOptionalString(
        options.api_key === undefined
          ? env.ANTHROPIC_API_KEY
          : options.api_key,
      )

    if (apiKey === null) {
      fail({
        code: 'ANTHROPIC_NOT_CONFIGURED',
        message: 'ANTHROPIC_API_KEY não está configurada para o Companion.',
        status_code: 503,
        retryable: false,
      })
    }

    const stage =
      resolveCompanionAnthropicStage(request)

    const defaults =
      COMPANION_ANTHROPIC_STAGE_DEFAULTS[stage]

    const model =
      resolveCompanionAnthropicModel({ stage, options, env })

    const initialThinking =
      resolveCompanionAnthropicThinking({ model, env })

    const effort =
      resolveCompanionAnthropicEffort({ stage, options, env })

    const timeoutMs =
      boundedInteger({
        value: options.timeout_ms,
        fallback: defaults.timeout_ms,
        minimum: MIN_TIMEOUT_MS,
        maximum: MAX_TIMEOUT_MS,
      })

    const requestedOutputTokens =
      boundedInteger({
        value: options.max_output_tokens,
        fallback: defaults.max_output_tokens,
        minimum: MIN_OUTPUT_TOKENS,
        maximum: MAX_TOTAL_OUTPUT_TOKENS,
      })

    const requestSchema =
      readRequestSchema(request.structured_output_format)

    const preparation =
      requestSchema
        ? prepareSchemaForAnthropic(requestSchema)
        : null

    const schemaKey =
      preparation
        ? JSON.stringify(preparation.schema)
        : null

    let outputMode: CompanionAnthropicOutputMode =
      !preparation
        ? 'none'
        : preparation.grammar_eligible &&
            schemaKey !== null &&
            !grammarRejectedSchemas.has(schemaKey)
          ? 'grammar'
          : 'prompt'

    let thinking =
      initialThinking

    const fetchImpl =
      options.fetch_impl ?? fetch

    const sleep =
      options.sleep ??
      ((ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms)
        }))

    const startedAt =
      Date.now()

    const deadline =
      startedAt + timeoutMs

    let formatFallbackUsed = false
    let thinkingFallbackUsed = false
    let transientRetryUsed = false
    let attempts = 0

    const baseLogFields = () => ({
      provider: 'anthropic',
      stage,
      model,
      effort: thinking === 'adaptive' ? effort : null,
      thinking,
      output_mode: outputMode,
      schema_union_parameters: preparation?.union_parameter_count ?? null,
      schema_optional_parameters: preparation?.optional_parameter_count ?? null,
      attempts,
      duration_ms: Date.now() - startedAt,
    })

    while (true) {
      attempts += 1

      const remainingMs =
        deadline - Date.now()

      if (remainingMs <= 0) {
        log('provider_call_failed', {
          ...baseLogFields(),
          failure_code: 'ANTHROPIC_REQUEST_TIMEOUT',
        })

        fail({
          code: 'ANTHROPIC_REQUEST_TIMEOUT',
          message: 'A solicitação ao Claude excedeu o tempo máximo permitido.',
          status_code: 504,
          retryable: true,
        })
      }

      const maxTokens =
        Math.min(
          MAX_TOTAL_OUTPUT_TOKENS,
          requestedOutputTokens +
            (thinking === 'adaptive'
              ? COMPANION_ANTHROPIC_THINKING_ALLOWANCE[effort]
              : 0),
        )

      const body =
        buildAnthropicRequestBody({
          model,
          max_tokens: maxTokens,
          system_text: request.system_prompt,
          user_text: request.user_prompt,
          prompt_cache: defaults.prompt_cache,
          thinking,
          effort,
          output_mode: outputMode,
          schema: preparation?.schema ?? null,
        })

      const controller =
        new AbortController()

      const timer =
        setTimeout(
          () => controller.abort(),
          remainingMs,
        )

      let response: Response
      let responseText: string

      try {
        try {
          response =
            await fetchImpl(
              ANTHROPIC_MESSAGES_URL,
              {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  accept: 'application/json',
                  'x-api-key': apiKey,
                  'anthropic-version': ANTHROPIC_API_VERSION,
                },
                signal: controller.signal,
                body: JSON.stringify(body),
              },
            )

          responseText =
            await response.text()
        } catch (error) {
          const timedOut =
            controller.signal.aborted ||
            isAbortError(error)

          log('provider_call_failed', {
            ...baseLogFields(),
            failure_code: timedOut
              ? 'ANTHROPIC_REQUEST_TIMEOUT'
              : 'ANTHROPIC_NETWORK_ERROR',
          })

          fail({
            code: timedOut
              ? 'ANTHROPIC_REQUEST_TIMEOUT'
              : 'ANTHROPIC_NETWORK_ERROR',
            message: timedOut
              ? 'A solicitação ao Claude excedeu o tempo máximo permitido.'
              : 'Não foi possível acessar o Claude.',
            status_code: timedOut ? 504 : 502,
            retryable: true,
          })
        }
      } finally {
        clearTimeout(timer)
      }

      if (responseText.length > MAX_RESPONSE_LENGTH) {
        fail({
          code: 'ANTHROPIC_RESPONSE_TOO_LARGE',
          message: 'A resposta do Claude ultrapassou o limite permitido.',
          status_code: 502,
          retryable: false,
        })
      }

      let payload: unknown = null

      try {
        payload =
          responseText.length > 0
            ? JSON.parse(responseText)
            : null
      } catch {
        payload = null
      }

      const requestId =
        normalizeOptionalString(response.headers.get('request-id'))

      if (response.ok === false) {
        const providerError =
          readProviderError(payload)

        if (
          response.status === 400 &&
          outputMode === 'grammar' &&
          !formatFallbackUsed &&
          isFormatRejection(providerError.message)
        ) {
          formatFallbackUsed = true

          if (schemaKey) {
            grammarRejectedSchemas.add(schemaKey)
          }

          log('provider_format_fallback', {
            ...baseLogFields(),
            provider_status: response.status,
            provider_error_type: providerError.type,
            provider_error_message: providerError.message,
          })

          outputMode = 'prompt'
          continue
        }

        if (
          response.status === 400 &&
          thinking === 'adaptive' &&
          !thinkingFallbackUsed &&
          isThinkingRejection(providerError.message)
        ) {
          thinkingFallbackUsed = true

          log('provider_thinking_fallback', {
            ...baseLogFields(),
            provider_status: response.status,
            provider_error_type: providerError.type,
            provider_error_message: providerError.message,
          })

          thinking = 'disabled'
          continue
        }

        if (
          TRANSIENT_STATUS_CODES.has(response.status) &&
          !transientRetryUsed &&
          deadline - Date.now() > TRANSIENT_RETRY_MIN_REMAINING_MS
        ) {
          transientRetryUsed = true

          log('provider_transient_retry', {
            ...baseLogFields(),
            provider_status: response.status,
            provider_error_type: providerError.type,
          })

          await sleep(TRANSIENT_RETRY_DELAY_MS)
          continue
        }

        const code =
          httpErrorCode(response.status)

        log('provider_call_failed', {
          ...baseLogFields(),
          failure_code: code,
          provider_status: response.status,
          provider_error_type: providerError.type,
          provider_error_message: providerError.message,
          request_id: requestId,
        })

        fail({
          code,
          message: httpErrorMessage(response.status),
          status_code: response.status,
          retryable: TRANSIENT_STATUS_CODES.has(response.status),
          details: {
            provider_status: response.status,
            provider_error_type: providerError.type,
          },
        })
      }

      const parsed =
        parseAnthropicMessage(payload)

      if (parsed.stop_reason === 'refusal') {
        log('provider_call_failed', {
          ...baseLogFields(),
          failure_code: 'ANTHROPIC_MODEL_REFUSAL',
          request_id: requestId,
        })

        fail({
          code: 'ANTHROPIC_MODEL_REFUSAL',
          message: 'O modelo recusou gerar a análise solicitada.',
          status_code: 422,
          retryable: false,
        })
      }

      if (
        parsed.stop_reason === 'max_tokens' ||
        parsed.stop_reason === 'model_context_window_exceeded'
      ) {
        log('provider_call_failed', {
          ...baseLogFields(),
          failure_code: 'ANTHROPIC_RESPONSE_INCOMPLETE',
          stop_reason: parsed.stop_reason,
          max_tokens: maxTokens,
          output_tokens: parsed.usage?.output_tokens ?? null,
          request_id: requestId,
        })

        fail({
          code: 'ANTHROPIC_RESPONSE_INCOMPLETE',
          message: 'O Claude não concluiu a resposta dentro do limite de tokens.',
          status_code: 502,
          retryable: true,
        })
      }

      if (parsed.text === '') {
        log('provider_call_failed', {
          ...baseLogFields(),
          failure_code: 'ANTHROPIC_EMPTY_OUTPUT',
          request_id: requestId,
        })

        fail({
          code: 'ANTHROPIC_EMPTY_OUTPUT',
          message: 'O Claude não retornou conteúdo textual utilizável.',
          status_code: 502,
          retryable: true,
        })
      }

      const conformance =
        emptySchemaConformanceStats()

      const content =
        finalizeContent({
          text: parsed.text,
          // O schema ORIGINAL (com maxItems e enums), não a versão
          // simplificada enviada à API.
          originalSchema: requestSchema,
          stage,
          stats: conformance,
        })

      log('provider_call_succeeded', {
        ...baseLogFields(),
        response_model: parsed.model,
        stop_reason: parsed.stop_reason,
        input_tokens: parsed.usage?.input_tokens ?? null,
        output_tokens: parsed.usage?.output_tokens ?? null,
        cache_read_input_tokens: parsed.cache_read_input_tokens,
        cache_creation_input_tokens: parsed.cache_creation_input_tokens,
        max_tokens: maxTokens,
        request_id: requestId,
        conformance,
      })

      return {
        content,
        provider: 'anthropic',
        model: parsed.model ?? model,
        request_id: requestId ?? parsed.message_id,
        usage: parsed.usage,
      }
    }
  }
}
