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
  'lead-method-applicability-v2'
const OUTPUT_CONTRACT_VERSION =
  'lead-method-applicability-v2'

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_method_applicability_v2',
  description:
    'Decide se a interação atual contém sinal comercial suficiente para aplicar o método publicado agora.',
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
      current_signal: {
        type: 'string',
        enum: [
          'commercial',
          'direct_continuation',
          'none',
        ],
      },
      reason: {
        type: 'string',
      },
    },
    required: [
      'decision',
      'current_signal',
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
  const currentSignal = record.current_signal

  if (!reason) {
    return null
  }

  if (
    currentSignal !== 'commercial' &&
    currentSignal !== 'direct_continuation' &&
    currentSignal !== 'none'
  ) {
    return null
  }

  if (record.decision === 'no_commercial_action') {
    return {
      status: 'no_commercial_action',
      reason,
    }
  }

  if (record.decision === 'apply_method') {
    // Fail-closed: histórico comercial sozinho nunca pode reativar o método.
    // Para aplicar o ATO, a própria interação atual precisa conter sinal de
    // compra/venda ou ser continuação explícita de uma pendência comercial.
    if (currentSignal === 'none') {
      return {
        status: 'no_commercial_action',
        reason:
          'A interação atual não contém sinal comercial nem continuação explícita de uma pendência comercial.',
      }
    }

    return {
      status: 'apply_method',
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

  if (currentInteraction.length === 0) {
    return {
      status: 'no_commercial_action',
      reason:
        'Não há interação atual suficiente para justificar a aplicação do método comercial.',
    }
  }

  try {
    const response = await provider({
      prompt_version: PROMPT_VERSION,
      output_contract_version:
        OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o gate de aplicabilidade comercial do Yolen Companion.',
        'Sua única função é decidir se a INTERAÇÃO ATUAL contém evidência suficiente para aplicar o método de vendas agora.',
        'Separe rigorosamente MEMÓRIA DO RELACIONAMENTO de INTERAÇÃO ATUAL.',
        'O working_summary preserva tudo que a Yolen sabe do relacionamento. Ele serve como memória e contexto, mas NÃO autoriza sozinho uma ação comercial.',
        'current_interaction representa o que está acontecendo agora e é a fonte obrigatória para decidir se o método deve ser aplicado.',
        'Classifique current_signal como commercial quando a interação atual fala diretamente de compra, venda, prospecção, negociação, objeção, necessidade, proposta, preço, decisão, fechamento ou follow-up comercial.',
        'Classifique current_signal como direct_continuation somente quando a interação atual referencia ou continua explicitamente uma pendência comercial existente no working_summary, mesmo sem repetir todos os detalhes.',
        'Classifique current_signal como none quando a interação atual é pessoal/social, saudação neutra, contratação ou emprego, assunto interno da equipe, suporte/administrativo, cobrança operacional sem venda, fornecedor/parceiro ou outro contexto sem evidência atual de venda.',
        'Uma saudação neutra como "bom dia", sozinha, é current_signal=none mesmo que exista proposta ou objeção antiga no working_summary.',
        'Uma conversa sobre geladeira, assinatura de responsável, contratação, escala, cobrança administrativa ou assunto interno é current_signal=none quando não houver compra/venda com esse contato.',
        'Uma pessoa existir como lead no CRM não prova que a conversa atual seja oportunidade de venda.',
        'Histórico comercial antigo pode coexistir com conversa pessoal ou operacional atual. Não force o método apenas porque existe histórico.',
        'Escolha apply_method somente quando current_signal for commercial ou direct_continuation.',
        'Escolha no_commercial_action quando current_signal for none ou quando, mesmo havendo tema comercial, não exista ação seller-facing útil agora.',
        'Não invente intenção de compra, necessidade, objeção ou oportunidade.',
        'Não gere próximo passo e não escolha etapa do método. Entregue somente decision, current_signal e reason.',
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
