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
  description: string
}

const PROMPT_VERSION = 'lead-method-guidance-v2'
const OUTPUT_CONTRACT_VERSION = 'lead-method-guidance-v2'
const MAX_NEXT_STEP_LENGTH = 1400

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_method_guidance_v2',
  description:
    'Leitura do método comercial publicado aplicada ao resumo atual do lead.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      stage_name: {
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
  const name = normalizeText(value.commercial_method_name)
  const description = normalizeText(
    value.commercial_method_description,
  )

  if (!id || !name || !description) {
    return null
  }

  return {
    id,
    version_number:
      typeof value.version_number === 'number' &&
      Number.isFinite(value.version_number)
        ? value.version_number
        : null,
    name,
    description,
  }
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

  return !normalized || genericOnly.has(normalized)
}

type GuidanceAttempt = {
  guidance: LeadMethodGuidance | null
  failure: string | null
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
      stage_key: null,
      stage_name: stageName,
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
        'Leia exatamente o método comercial publicado pela empresa e aplique esse texto ao resumo consolidado do lead.',
        'Não converta o método para um funil genérico, não invente etapas técnicas e não use a etapa do CRM como substituto do método.',
        'Se o texto publicado nomear passos ou etapas, use esses mesmos nomes no campo stage_name.',
        'O resumo consolidado é a única fonte de fatos sobre o cliente e a negociação.',
        'Identifique em qual parte do método publicado a conversa está e qual é o próximo movimento coerente dentro desse método.',
        'O próximo passo precisa ser uma ação única, específica e executável: diga o que o vendedor deve fazer e qual informação, confirmação ou resultado deve obter.',
        'Não responda apenas com expressões genéricas como retomar negociação, fazer follow-up, acompanhar o lead ou aguardar retorno.',
        'Não invente fatos, datas, valores, compromissos, objeções ou regras do método que não estejam nos textos recebidos.',
        'Não escreva mensagem pronta para o cliente. Nesta etapa, entregue somente orientação de ação.',
        `O campo next_step deve ter no máximo ${MAX_NEXT_STEP_LENGTH} caracteres.`,
        ...correctiveInstructions,
      ].join('\n'),
      user_prompt: JSON.stringify({
        working_summary: summary,
        published_method: {
          name: method.name,
          description: method.description,
        },
      }),
      structured_output_format: STRUCTURED_OUTPUT_FORMAT,
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
