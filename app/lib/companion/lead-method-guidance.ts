import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

export type LeadMethodGuidanceStatus =
  | 'ready'
  | 'missing_method'
  | 'invalid_method'
  | 'no_summary'
  | 'error'

export type LeadMethodGuidance = {
  status: LeadMethodGuidanceStatus
  method_name: string | null
  method_config_version_id: string | null
  stage_key: string | null
  stage_name: string | null
  stage_reason: string | null
  next_step: string | null
  error: string | null
}

export type PublishedCommercialMethodStage = {
  key: string
  name: string
  display_order: number
  objective: string | null
  completion_criteria: string[]
  partial_completion_criteria: string[]
  deepen_when: string[]
  sufficient_when: string[]
  advance_when: string[]
  wait_when: string[]
  stop_asking_when: string[]
  recommended_questions: string[]
  common_mistakes: string[]
}

export type PublishedCommercialMethod = {
  id: string
  version_number: number | null
  source_contract_version: string | null
  name: string
  description: string
  structure_source:
    | 'structured_definition'
    | 'declared_description'
    | 'legacy_steps'
    | 'description_only'
  principles: string[]
  stages: PublishedCommercialMethodStage[]
  business_context: {
    business_description: string | null
    target_audience: string | null
    value_proposition: string | null
  }
  seller_rules: {
    communication_tone: string | null
    required_behaviors: string[]
    prohibited_behaviors: string[]
  }
}

const PROMPT_VERSION = 'lead-method-guidance-v3'
const OUTPUT_CONTRACT_VERSION = 'lead-method-guidance-v3'
const MAX_NEXT_STEP_LENGTH = 1400

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeKey(value: unknown, fallback: string): string {
  const normalized = normalizeText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

function normalizeComparableText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDeclaredStageNames(value: unknown): string[] {
  if (typeof value !== 'string') {
    return []
  }

  const lines = value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*•\d.)]+\s*/, '')
        .trim(),
    )
    .filter(Boolean)

  if (lines.length < 3) {
    return []
  }

  const candidates = lines
    .slice(1)
    .filter((line) =>
      line.length <= 60 &&
      !line.includes(':') &&
      !/[.!?;]$/.test(line),
    )

  if (
    candidates.length < 2 ||
    candidates.length > 10 ||
    candidates.length !== lines.length - 1
  ) {
    return []
  }

  const unique = new Map<string, string>()

  for (const candidate of candidates) {
    const comparable = normalizeComparableText(candidate)

    if (comparable && !unique.has(comparable)) {
      unique.set(comparable, candidate)
    }
  }

  return [...unique.values()]
}

function normalizeStructuredStages(
  definition: unknown,
): PublishedCommercialMethodStage[] {
  if (!isRecord(definition) || !Array.isArray(definition.stages)) {
    return []
  }

  return definition.stages
    .map((rawStage, index) => {
      if (!isRecord(rawStage)) {
        return null
      }

      const name = normalizeText(rawStage.name)

      if (!name) {
        return null
      }

      return {
        key: normalizeKey(rawStage.key, `stage_${index + 1}`),
        name,
        display_order:
          typeof rawStage.display_order === 'number' &&
          Number.isFinite(rawStage.display_order)
            ? rawStage.display_order
            : index + 1,
        objective: normalizeText(rawStage.objective),
        completion_criteria:
          normalizeTextArray(rawStage.completion_criteria),
        partial_completion_criteria:
          normalizeTextArray(rawStage.partial_completion_criteria),
        deepen_when:
          normalizeTextArray(rawStage.deepen_when),
        sufficient_when:
          normalizeTextArray(rawStage.sufficient_when),
        advance_when:
          normalizeTextArray(rawStage.advance_when),
        wait_when:
          normalizeTextArray(rawStage.wait_when),
        stop_asking_when:
          normalizeTextArray(rawStage.stop_asking_when),
        recommended_questions:
          normalizeTextArray(rawStage.recommended_questions),
        common_mistakes:
          normalizeTextArray(rawStage.common_mistakes),
      } satisfies PublishedCommercialMethodStage
    })
    .filter(
      (stage): stage is PublishedCommercialMethodStage => Boolean(stage),
    )
    .sort((left, right) =>
      left.display_order - right.display_order,
    )
}

function normalizeLegacyStages(
  value: unknown,
): PublishedCommercialMethodStage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((rawStage, index) => {
      if (!isRecord(rawStage)) {
        return null
      }

      const name = normalizeText(rawStage.name)

      if (!name) {
        return null
      }

      const displayOrder =
        typeof rawStage.step_order === 'number' &&
        Number.isFinite(rawStage.step_order)
          ? rawStage.step_order
          : index + 1

      return {
        key: normalizeKey(rawStage.key, `legacy_step_${displayOrder}`),
        name,
        display_order: displayOrder,
        objective: normalizeText(rawStage.objective),
        completion_criteria:
          normalizeTextArray(rawStage.completion_criteria),
        partial_completion_criteria: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        recommended_questions:
          normalizeTextArray(rawStage.recommended_questions),
        common_mistakes: [],
      } satisfies PublishedCommercialMethodStage
    })
    .filter(
      (stage): stage is PublishedCommercialMethodStage => Boolean(stage),
    )
    .sort((left, right) =>
      left.display_order - right.display_order,
    )
}

function buildDeclaredStages(
  names: string[],
): PublishedCommercialMethodStage[] {
  return names.map((name, index) => ({
    key: normalizeKey(name, `declared_stage_${index + 1}`),
    name,
    display_order: index + 1,
    objective: null,
    completion_criteria: [],
    partial_completion_criteria: [],
    deepen_when: [],
    sufficient_when: [],
    advance_when: [],
    wait_when: [],
    stop_asking_when: [],
    recommended_questions: [],
    common_mistakes: [],
  }))
}

function buildEmptyGuidance(
  status: LeadMethodGuidanceStatus,
  method?: PublishedCommercialMethod | null,
  error?: string | null,
): LeadMethodGuidance {
  return {
    status,
    method_name: method?.name ?? null,
    method_config_version_id: method?.id ?? null,
    stage_key: null,
    stage_name: null,
    stage_reason: null,
    next_step: null,
    error: error ?? null,
  }
}

export function normalizePublishedCommercialMethod(
  value: unknown,
  legacySteps: unknown = [],
): PublishedCommercialMethod | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizeText(value.id)
  const name = normalizeText(value.commercial_method_name)
  const description = normalizeText(
    value.commercial_method_description,
  )

  if (!id || !name || !description) {
    return null
  }

  const rawDefinition = value.commercial_method_definition
  const structuredStages =
    normalizeStructuredStages(rawDefinition)
  const legacyNormalizedStages =
    normalizeLegacyStages(legacySteps)
  const declaredStageNames =
    extractDeclaredStageNames(
      value.commercial_method_description,
    )

  let stages: PublishedCommercialMethodStage[] = []
  let structureSource:
    PublishedCommercialMethod['structure_source'] =
      'description_only'
  let principles: string[] = []

  if (structuredStages.length > 0) {
    stages = structuredStages
    structureSource = 'structured_definition'
    principles = isRecord(rawDefinition)
      ? normalizeTextArray(rawDefinition.principles)
      : []
  } else if (declaredStageNames.length > 0) {
    /*
     * Compatibilidade honesta com commercial-method-v1.
     * Se a própria descrição publicada enumera as etapas, ela é a fonte
     * canônica. Não misturamos automaticamente filhos legados com nomes
     * diferentes, pois isso foi exatamente o que fazia "Metodo ATO" chegar
     * ao Companion como outro método de quatro etapas.
     */
    stages = buildDeclaredStages(declaredStageNames)
    structureSource = 'declared_description'
  } else if (legacyNormalizedStages.length > 0) {
    stages = legacyNormalizedStages
    structureSource = 'legacy_steps'
  }

  return {
    id,
    version_number:
      typeof value.version_number === 'number' &&
      Number.isFinite(value.version_number)
        ? value.version_number
        : null,
    source_contract_version:
      normalizeText(value.commercial_method_contract_version),
    name,
    description,
    structure_source: structureSource,
    principles,
    stages,
    business_context: {
      business_description:
        normalizeText(value.business_description),
      target_audience:
        normalizeText(value.target_audience),
      value_proposition:
        normalizeText(value.value_proposition),
    },
    seller_rules: {
      communication_tone:
        normalizeText(value.communication_tone),
      required_behaviors:
        normalizeTextArray(value.required_behaviors),
      prohibited_behaviors:
        normalizeTextArray(value.prohibited_behaviors),
    },
  }
}

function looksGeneric(nextStep: string) {
  const normalized = normalizeComparableText(nextStep)

  const genericOnly = new Set([
    'retomar a negociacao',
    'acompanhar o lead',
    'fazer follow up',
    'realizar follow up',
    'avancar a negociacao',
    'entrar em contato com o cliente',
    'aguardar retorno',
  ])

  return !normalized || genericOnly.has(normalized)
}

function buildStructuredOutputFormat(
  method: PublishedCommercialMethod,
) {
  const allowedStageNames = method.stages
    .map((stage) => stage.name)
    .filter(Boolean)

  return {
    type: 'json_schema',
    name: 'yolen_lead_method_guidance_v3',
    description:
      'Aplicação do método comercial publicado ao resumo atual do lead.',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stage_name:
          allowedStageNames.length > 0
            ? {
                type: 'string',
                enum: allowedStageNames,
              }
            : {
                type: 'string',
              },
        stage_reason: {
          type: 'string',
        },
        next_step: {
          type: 'string',
        },
      },
      required: [
        'stage_name',
        'stage_reason',
        'next_step',
      ],
    },
  } as const
}

type GuidanceAttempt = {
  guidance: LeadMethodGuidance | null
  failure: string | null
}

function resolveMethodStage(
  method: PublishedCommercialMethod,
  stageName: string,
): PublishedCommercialMethodStage | null {
  const comparable = normalizeComparableText(stageName)

  return method.stages.find(
    (stage) =>
      normalizeComparableText(stage.name) === comparable,
  ) ?? null
}

function parseGuidanceResponse(
  content: unknown,
  method: PublishedCommercialMethod,
): GuidanceAttempt {
  if (typeof content !== 'string') {
    return {
      guidance: null,
      failure: 'A IA não retornou orientação pelo método.',
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    return {
      guidance: null,
      failure: 'A IA retornou orientação em formato inválido.',
    }
  }

  if (!isRecord(parsed)) {
    return {
      guidance: null,
      failure: 'A IA retornou orientação em formato inválido.',
    }
  }

  const stageName = normalizeText(parsed.stage_name)
  const stageReason = normalizeText(parsed.stage_reason)
  const nextStep = normalizeText(parsed.next_step)

  if (!stageName || !stageReason || !nextStep) {
    return {
      guidance: null,
      failure: 'A orientação veio incompleta.',
    }
  }

  const matchedStage =
    method.stages.length > 0
      ? resolveMethodStage(method, stageName)
      : null

  if (method.stages.length > 0 && !matchedStage) {
    return {
      guidance: null,
      failure: 'A orientação escolheu uma etapa que não existe no método publicado.',
    }
  }

  if (nextStep.length > MAX_NEXT_STEP_LENGTH) {
    return {
      guidance: null,
      failure: 'A orientação excedeu o tamanho permitido.',
    }
  }

  if (looksGeneric(nextStep)) {
    return {
      guidance: null,
      failure: 'A orientação ficou genérica demais.',
    }
  }

  return {
    guidance: {
      status: 'ready',
      method_name: method.name,
      method_config_version_id: method.id,
      stage_key: matchedStage?.key ?? null,
      stage_name: matchedStage?.name ?? stageName,
      stage_reason: stageReason,
      next_step: nextStep,
      error: null,
    },
    failure: null,
  }
}

async function runGuidanceAttempt({
  summary,
  method,
  provider,
  correctionReason,
}: {
  summary: string
  method: PublishedCommercialMethod
  provider: StatefulCopilotProvider
  correctionReason?: string | null
}): Promise<GuidanceAttempt> {
  const correctiveInstructions = correctionReason
    ? [
        'A tentativa anterior não passou pela validação seller-facing.',
        `Motivo da correção: ${correctionReason}`,
        'Corrija a saída sem relaxar o contrato.',
        'O próximo passo deve mencionar pelo menos um fato, objeção, pendência, decisão ou informação concreta presente no resumo quando isso for necessário para tornar a ação específica.',
        'Escolha somente uma ação executável para o vendedor e deixe claro o resultado ou confirmação que ele deve buscar.',
      ]
    : []

  try {
    const response = await provider({
      prompt_version: PROMPT_VERSION,
      output_contract_version: OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o motor V2 de orientação por método comercial do Yolen Companion.',
        'Você recebe um contrato canônico da configuração comercial PUBLICADA e o resumo consolidado do lead.',
        'O método publicado é a autoridade. Não invente outro funil e não use a etapa do CRM como substituto do método.',
        'Quando o contrato trouxer stages, escolha exatamente uma das etapas fornecidas em stage_name.',
        'Use objetivo, critérios e regras da etapa quando estiverem disponíveis. Campos vazios significam que a empresa ainda não detalhou aquela regra; não complete por suposição.',
        'O resumo consolidado é a fonte de fatos sobre o cliente e a negociação.',
        'O contexto da empresa e as regras do vendedor servem como limites para a orientação, nunca como fatos do cliente.',
        'Identifique qual parte do método ainda precisa ser trabalhada e qual é o próximo movimento coerente.',
        'O próximo passo precisa ser uma ação única, específica e executável: diga o que o vendedor deve fazer e qual informação, confirmação ou resultado deve obter.',
        'Não responda apenas com expressões genéricas como retomar negociação, fazer follow-up, acompanhar o lead ou aguardar retorno.',
        'Não invente fatos, datas, valores, compromissos, objeções ou regras que não existam nos dados recebidos.',
        'Não escreva mensagem pronta para o cliente. Nesta etapa, entregue somente orientação de ação.',
        `O campo next_step deve ter no máximo ${MAX_NEXT_STEP_LENGTH} caracteres.`,
        ...correctiveInstructions,
      ].join('\n'),
      user_prompt: JSON.stringify({
        working_summary: summary,
        published_commercial_context: {
          config_version_id: method.id,
          source_contract_version:
            method.source_contract_version,
          business_context:
            method.business_context,
          method: {
            name: method.name,
            description: method.description,
            structure_source:
              method.structure_source,
            principles: method.principles,
            stages: method.stages,
          },
          seller_rules:
            method.seller_rules,
        },
      }),
      structured_output_format:
        buildStructuredOutputFormat(method),
    })

    return parseGuidanceResponse(
      response.content,
      method,
    )
  } catch {
    return {
      guidance: null,
      failure: 'Falha transitória ao gerar a orientação pelo método.',
    }
  }
}

export async function composeLeadMethodGuidance({
  workingSummary,
  method,
  provider,
}: {
  workingSummary: string | null
  method: PublishedCommercialMethod | null
  provider: StatefulCopilotProvider
}): Promise<LeadMethodGuidance> {
  const summary = normalizeText(workingSummary)

  if (!summary) {
    return buildEmptyGuidance('no_summary', method)
  }

  if (!method) {
    return buildEmptyGuidance('missing_method')
  }

  const firstAttempt = await runGuidanceAttempt({
    summary,
    method,
    provider,
  })

  if (firstAttempt.guidance) {
    return firstAttempt.guidance
  }

  const correctiveAttempt = await runGuidanceAttempt({
    summary,
    method,
    provider,
    correctionReason:
      firstAttempt.failure ||
      'A primeira saída não passou pela validação.',
  })

  if (correctiveAttempt.guidance) {
    return correctiveAttempt.guidance
  }

  return buildEmptyGuidance(
    'error',
    method,
    correctiveAttempt.failure ||
      firstAttempt.failure ||
      'Não foi possível definir um próximo passo específico.',
  )
}
