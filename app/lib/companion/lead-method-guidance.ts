import type {
  CommercialMethodDefinition,
  CommercialMethodStageDefinition,
} from './commercial-method-contract'

import {
  COMMERCIAL_METHOD_CONTRACT_VERSION,
  validateCommercialMethodDefinition,
} from './commercial-method-contract'

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

export type PublishedCommercialMethod = {
  id: string
  version_number: number | null
  name: string
  definition: CommercialMethodDefinition
}

type LegacyCommercialMethodStep = {
  step_order: number
  name: string
  objective: string
  completion_criteria: string[]
  recommended_questions: string[]
  is_required: boolean
}

const PROMPT_VERSION = 'lead-method-guidance-v1'
const OUTPUT_CONTRACT_VERSION = 'lead-method-guidance-v1'
const MAX_NEXT_STEP_LENGTH = 1400

function buildStructuredOutputFormat(
  method: PublishedCommercialMethod,
) {
  const stageKeys = method.definition.stages.map(
    (stage) => stage.key,
  )

  return {
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
          enum: stageKeys,
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
  }
}

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
    .map(normalizeText)
    .filter((item): item is string => Boolean(item))
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

function normalizeLegacyMethodSteps(value: unknown): LegacyCommercialMethodStep[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((rawStep) => {
      if (!isRecord(rawStep)) {
        return null
      }

      const stepOrder = rawStep.step_order
      const name = normalizeText(rawStep.name)
      const objective = normalizeText(rawStep.objective)
      const completionCriteria = normalizeTextArray(
        rawStep.completion_criteria,
      )
      const recommendedQuestions = normalizeTextArray(
        rawStep.recommended_questions,
      )

      if (
        !Number.isSafeInteger(stepOrder) ||
        Number(stepOrder) <= 0 ||
        !name ||
        !objective ||
        completionCriteria.length === 0
      ) {
        return null
      }

      return {
        step_order: Number(stepOrder),
        name,
        objective,
        completion_criteria: completionCriteria,
        recommended_questions: recommendedQuestions,
        is_required: rawStep.is_required !== false,
      }
    })
    .filter((step): step is LegacyCommercialMethodStep => Boolean(step))
    .sort((left, right) => left.step_order - right.step_order)
}

function buildMethodFromLegacySteps({
  configuredName,
  configuredDescription,
  legacySteps,
}: {
  configuredName: string
  configuredDescription: string | null
  legacySteps: LegacyCommercialMethodStep[]
}): CommercialMethodDefinition | null {
  if (legacySteps.length === 0) {
    return null
  }

  const definition: CommercialMethodDefinition = {
    contract_version: COMMERCIAL_METHOD_CONTRACT_VERSION,
    name: configuredName,
    description:
      configuredDescription ||
      `Método comercial ${configuredName} configurado na Yolen.`,
    principles: [
      'O método orienta o raciocínio comercial sem transformar as etapas em um checklist mecânico.',
      'Evidências já existentes no relacionamento podem satisfazer etapas sem exigir que o vendedor repita perguntas.',
    ],
    stages: legacySteps.map((step) => ({
      key: `legacy_step_${step.step_order}`,
      display_order: step.step_order,
      name: step.name,
      objective: step.objective,
      requirement: step.is_required ? 'required' : 'optional',
      completion_criteria: step.completion_criteria,
      partial_completion_criteria: [],
      skip_conditions: [],
      recommended_questions: step.recommended_questions,
      common_mistakes: [],
      deepen_when: [],
      sufficient_when: step.completion_criteria,
      advance_when: step.completion_criteria,
      wait_when: [],
      stop_asking_when: step.completion_criteria,
      dimensions: [],
    })),
  }

  const validation = validateCommercialMethodDefinition(definition)
  return validation.valid ? definition : null
}

export function normalizePublishedCommercialMethod(
  value: unknown,
  legacyStepsValue: unknown = [],
): PublishedCommercialMethod | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizeText(value.id)
  const configuredName = normalizeText(value.commercial_method_name)
  const configuredDescription = normalizeText(
    value.commercial_method_description,
  )
  const rawDefinition = value.commercial_method_definition

  if (!id || !configuredName) {
    return null
  }

  if (isRecord(rawDefinition)) {
    try {
      const typedDefinition = rawDefinition as CommercialMethodDefinition
      const validation = validateCommercialMethodDefinition(typedDefinition)

      if (validation.valid) {
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
    } catch {
      // Configurações publicadas em commercial-method-v1 podem não possuir
      // a estrutura v2 embutida. Nesse caso, usamos os passos persistidos
      // oficialmente em company_commercial_method_steps logo abaixo.
    }
  }

  const legacySteps = normalizeLegacyMethodSteps(legacyStepsValue)
  const legacyDefinition = buildMethodFromLegacySteps({
    configuredName,
    configuredDescription,
    legacySteps,
  })

  if (!legacyDefinition) {
    return null
  }

  return {
    id,
    version_number:
      typeof value.version_number === 'number' &&
      Number.isFinite(value.version_number)
        ? value.version_number
        : null,
    name: configuredName,
    definition: legacyDefinition,
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

  const genericOnly = new Set([
    'retomar a negociacao',
    'acompanhar o lead',
    'fazer follow up',
    'realizar follow up',
    'avancar a negociacao',
    'entrar em contato com o cliente',
    'aguardar retorno',
  ])

  if (!normalized) {
    return true
  }

  if (genericOnly.has(normalized)) {
    return true
  }

  return normalized.length < 18
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

  const response = await provider({
    prompt_version: PROMPT_VERSION,
    output_contract_version: OUTPUT_CONTRACT_VERSION,
    system_prompt: [
      'Você é o motor V2 de orientação por método comercial do Yolen Companion.',
      'Use o resumo consolidado como a única fonte de fatos sobre o cliente e a negociação.',
      'Use o método comercial publicado pela empresa como estrutura de raciocínio, nunca como checklist mecânico.',
      'Identifique a etapa que representa o trabalho comercial ainda necessário agora. Não copie automaticamente a etapa do CRM.',
      'O campo stage_key deve usar exatamente uma das chaves de etapa fornecidas no método comercial.',
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
    structured_output_format: buildStructuredOutputFormat(method),
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
