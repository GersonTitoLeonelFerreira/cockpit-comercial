import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

export type LeadMethodCurrentInteractionMessage = {
  direction: 'incoming' | 'outgoing'
  occurred_at: string | null
  text: string
}

export type LeadMethodApplicability =
  | {
      status: 'apply_method'
      reason: string
    }
  | {
      status: 'no_commercial_action'
      reason: string
    }
  | {
      status: 'error'
      reason: string
    }

const PROMPT_VERSION =
  'lead-method-applicability-v1'
const OUTPUT_CONTRACT_VERSION =
  'lead-method-applicability-v1'

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_method_applicability_v1',
  description:
    'Decide se existe uma ação comercial seller-facing que justifique aplicar o método publicado agora.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      decision: {
        type: 'string',
        enum: [
          'apply_method',
          'no_commercial_action',
        ],
      },
      reason: {
        type: 'string',
      },
    },
    required: [
      'decision',
      'reason',
    ],
  },
} as const

function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  return value.replace(/\s+/g, ' ').trim() || null
}

function parseApplicability(
  content: unknown,
): LeadMethodApplicability | null {
  if (typeof content !== 'string') {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    return null
  }

  const record = parsed as Record<string, unknown>
  const reason = text(record.reason)

  if (!reason) {
    return null
  }

  if (record.decision === 'apply_method') {
    return {
      status: 'apply_method',
      reason,
    }
  }

  if (record.decision === 'no_commercial_action') {
    return {
      status: 'no_commercial_action',
      reason,
    }
  }

  return null
}

export async function classifyLeadMethodApplicability({
  workingSummary,
  currentInteraction,
  provider,
}: {
  workingSummary: string | null
  currentInteraction:
    readonly LeadMethodCurrentInteractionMessage[]
  provider: StatefulCopilotProvider
}): Promise<LeadMethodApplicability> {
  const summary = text(workingSummary)

  if (!summary) {
    return {
      status: 'no_commercial_action',
      reason:
        'Não há resumo suficiente para sustentar uma orientação comercial.',
    }
  }

  try {
    const response = await provider({
      prompt_version: PROMPT_VERSION,
      output_contract_version:
        OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o gate de aplicabilidade comercial do Yolen Companion.',
        'Sua única função é decidir se existe uma ação comercial seller-facing real que justifique aplicar o método de vendas agora.',
        'Separe rigorosamente MEMÓRIA DO RELACIONAMENTO de INTERAÇÃO ATUAL.',
        'O working_summary preserva tudo que a Yolen sabe do relacionamento e não deve ser apagado por uma conversa neutra.',
        'current_interaction representa o que está acontecendo agora e deve ter peso principal para decidir se o vendedor precisa de orientação comercial neste momento.',
        'Escolha apply_method quando a interação atual é de compra, venda, prospecção, negociação, objeção, descoberta de necessidade, proposta, decisão, follow-up comercial ou quando há no resumo uma pendência comercial real e atual que faz sentido retomar agora.',
        'Escolha no_commercial_action quando a interação atual é claramente pessoal/social, contratação ou emprego, assunto interno da equipe, suporte/administrativo, cobrança operacional sem venda, fornecedor/parceiro ou outro contexto que não peça uma ação de venda agora.',
        'Uma pessoa existir como lead no CRM não prova que a conversa atual é uma oportunidade de venda.',
        'Histórico comercial antigo pode coexistir com conversa pessoal atual. Não force o método apenas porque existe histórico.',
        'Uma saudação neutra pode ainda justificar apply_method quando o resumo mostra uma pendência comercial explícita e atual que deve ser retomada com aquela pessoa.',
        'Não invente intenção de compra, necessidade, objeção ou oportunidade.',
        'Não gere próximo passo e não escolha etapa do método. Entregue somente decision e reason.',
      ].join('\n'),
      user_prompt: JSON.stringify({
        working_summary: summary,
        current_interaction:
          currentInteraction.map((message) => ({
            direction: message.direction,
            occurred_at: message.occurred_at,
            text: message.text,
          })),
      }),
      structured_output_format:
        STRUCTURED_OUTPUT_FORMAT,
    })

    const parsed =
      parseApplicability(response.content)

    if (parsed) {
      return parsed
    }

    return {
      status: 'error',
      reason:
        'A IA não retornou uma decisão válida sobre a aplicabilidade comercial.',
    }
  } catch {
    return {
      status: 'error',
      reason:
        'Falha transitória ao verificar se existe um próximo passo comercial.',
    }
  }
}
