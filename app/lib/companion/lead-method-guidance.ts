import type {
  CommercialMethodDefinition,
  CommercialMethodStageDefinition,
} from './commercial-method-contract'

import {
  validateCommercialMethodDefinition,
} from './commercial-method-contract'

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

export type PublishedCommercialMethod = {
  id: string
  version_number: number | null
  name: string
  definition: CommercialMethodDefinition
}

type ModelProvider = (input: {
  prompt_version: string
  output_contract_version: string
  system_prompt: string
  user_prompt: string
  structured_output_format: unknown
}) => Promise<{
  content?: string | null
}>

const PROMPT_VERSION = 'lead-method-guidance-v1'
const OUTPUT_CONTRACT_VERSION = 'lead-method-guidance-v1'
const MAX_NEXT_STEP_LENGTH = 1400

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_method_guidance_v1',
  description:
    'Etapa atual do método comercial e próximo passo concreto para o vendedor.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      stage_key: {
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
      'stage_key',
      'stage_reason',
      'next_step',
    ],
  },
} as const

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
): PublishedCommercialMethod | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizeText(value.id)
  const configuredName = normalizeText(value.commercial_method_name)
  const definition = value.commercial_method_definition

  if (!id || !isRecord(definition)) {
    return null
  }

  let validation

  try {
    validation = validateCommercialMethodDefinition(
      definition as CommercialMethodDefinition,
    )
  } catch {
    return null
  }

  if (!validation.valid) {
    return null
  }

  const typedDefinition = definition as CommercialMethodDefinition

  return {
    id,
    version_number:
      typeof value.version_number === 'number' &&
      Number.isFinite(value.version_number)
        ? value.version_number
        : null,
    name: configuredName || typedDefinition.name,
    definition: typedDefinition,
  }
}

function findStage(
  method: PublishedCommercialMethod,
  key: string,
): CommercialMethodStageDefinition | null {
  return (
    method.definition.stages.find(
      (stage) => stage.key === key,
    ) ?? null
  )
}

function looksGeneric(nextStep: string) {
  const normalized = nextStep
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const genericOnly = [
    'retomar a negociacao',
    'acompanhar o lead',
    'fazer follow up',
    'realizar follow up',
    'avancar a negociacao',
    'entrar em contato com o cliente',
    'aguardar retorno',
  ]

  return (
    normalized.length < 45 ||
    genericOnly.includes(normalized)
  )
}

export async function composeLeadMethodGuidance({
  workingSummary,
  method,
  provider,
}: {
  workingSummary: string | null
  method: PublishedCommercialMethod | null
  provider: ModelProvider
}): Promise<LeadMethodGuidance> {
  const summary = normalizeText(workingSummary)

  if (!summary) {
    return buildEmptyGuidance('no_summary', method)
  }

  if (!method) {
    return buildEmptyGuidance('missing_method')
  }

  const response = await provider({
    prompt_version: PROMPT_VERSION,
    output_contract_version: OUTPUT_CONTRACT_VERSION,
    system_prompt: [
      'Você é o motor V2 de orientação por método comercial do Yolen Companion.',
      'Use o resumo consolidado como a única fonte de fatos sobre o cliente e a negociação.',
      'Use o método comercial publicado pela empresa como estrutura de raciocínio, nunca como checklist mecânico.',
      'Identifique a etapa que representa o trabalho comercial ainda necessário agora. Não copie automaticamente a etapa do CRM.',
      'Se evidências do resumo já satisfazem uma etapa anterior, avance para a etapa coerente seguinte.',
      'Respeite completion_criteria, partial_completion_criteria, skip_conditions, sufficient_when, advance_when, wait_when e stop_asking_when.',
      'O próximo passo precisa ser uma ação única, específica e executável: diga o que o vendedor deve fazer e qual informação, confirmação ou resultado deve obter.',
      'Não responda apenas com expressões genéricas como retomar negociação, fazer follow-up, acompanhar o lead ou aguardar retorno.',
      'Se esperar for a decisão correta segundo o método, explique concretamente o que deve ser aguardado e qual sinal deve disparar a retomada.',
      'Não invente fatos, datas, valores, compromissos ou objeções que não estejam no resumo.',
      'Não escreva mensagem pronta para o cliente. Nesta etapa, entregue somente orientação de ação.',
      `O campo next_step deve ter no máximo ${MAX_NEXT_STEP_LENGTH} caracteres.`,
    ].join('\n'),
    user_prompt: JSON.stringify({
      working_summary: summary,
      commercial_method: method.definition,
    }),
    structured_output_format: STRUCTURED_OUTPUT_FORMAT,
  })

  if (typeof response.content !== 'string') {
    return buildEmptyGuidance(
      'error',
      method,
      'A IA não retornou orientação pelo método.',
    )
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(response.content)
  } catch {
    return buildEmptyGuidance(
      'error',
      method,
      'A IA retornou orientação em formato inválido.',
    )
  }

  if (!isRecord(parsed)) {
    return buildEmptyGuidance(
      'error',
      method,
      'A IA retornou orientação em formato inválido.',
    )
  }

  const stageKey = normalizeText(parsed.stage_key)
  const stageReason = normalizeText(parsed.stage_reason)
  const nextStep = normalizeText(parsed.next_step)
  const stage = stageKey ? findStage(method, stageKey) : null

  if (
    !stage ||
    !stageReason ||
    !nextStep ||
    nextStep.length > MAX_NEXT_STEP_LENGTH ||
    looksGeneric(nextStep)
  ) {
    return buildEmptyGuidance(
      'error',
      method,
      'A orientação não ficou específica o suficiente para ser exibida.',
    )
  }

  return {
    status: 'ready',
    method_name: method.name,
    method_config_version_id: method.id,
    stage_key: stage.key,
    stage_name: stage.name,
    stage_reason: stageReason,
    next_step: nextStep,
    error: null,
  }
}
