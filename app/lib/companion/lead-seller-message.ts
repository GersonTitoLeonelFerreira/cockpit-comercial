import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import type {
  PublishedCommercialMethod,
} from './lead-method-guidance'

export type SellerMessageGuidance = {
  status: string
  method_name: string | null
  stage_name: string | null
  next_step: string | null
}

export type SellerMessageCurrentInteraction = {
  direction: 'incoming' | 'outgoing'
  occurred_at: string | null
  text: string
}

export type SellerMessageGenerationResult =
  | {
      status: 'ready'
      message: string
      error: null
    }
  | {
      status: 'error'
      message: null
      error: string
    }

const PROMPT_VERSION =
  'lead-seller-message-v1'
const OUTPUT_CONTRACT_VERSION =
  'lead-seller-message-v1'
const MAX_MESSAGE_LENGTH = 1200

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_seller_message_v1',
  description:
    'Mensagem de WhatsApp criada somente após intenção explícita do vendedor.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      message: {
        type: 'string',
      },
    },
    required: ['message'],
  },
} as const

function clean(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.replace(/\s+/g, ' ').trim()

  return normalized || null
}

function normalizeCurrentInteraction(
  value: readonly SellerMessageCurrentInteraction[],
) {
  return value
    .map((message) => ({
      direction: message.direction,
      occurred_at: message.occurred_at,
      text: clean(message.text),
    }))
    .filter(
      (
        message,
      ): message is SellerMessageCurrentInteraction =>
        Boolean(message.text),
    )
}

function normalizeForGrounding(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

function getProtectedFacts(value: string) {
  return value.match(
    /R\$\s*\d[\d.,]*|\b\d+(?:[.,]\d+)?\s*%|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{1,2}h(?:\d{2})?\b/giu,
  ) ?? []
}

function hasUnsupportedProtectedFact({
  message,
  allowedContext,
}: {
  message: string
  allowedContext: string
}) {
  const normalizedContext =
    normalizeForGrounding(allowedContext)

  return getProtectedFacts(message).some(
    (fact) =>
      !normalizedContext.includes(
        normalizeForGrounding(fact),
      ),
  )
}

export async function composeSellerMessage({
  workingSummary,
  currentInteraction = [],
  sellerIntent,
  method,
  guidance,
  provider,
}: {
  workingSummary: string | null
  currentInteraction?: readonly SellerMessageCurrentInteraction[]
  sellerIntent: string | null
  method: PublishedCommercialMethod
  guidance: SellerMessageGuidance | null
  provider: StatefulCopilotProvider
}): Promise<SellerMessageGenerationResult> {
  const summary = clean(workingSummary)
  const intent = clean(sellerIntent)
  const interaction =
    normalizeCurrentInteraction(
      currentInteraction,
    )

  if (!summary) {
    return {
      status: 'error',
      message: null,
      error:
        'Não há resumo suficiente para gerar a mensagem.',
    }
  }

  if (!intent) {
    return {
      status: 'error',
      message: null,
      error:
        'Diga primeiro o que você quer fazer agora.',
    }
  }

  try {
    const response = await provider({
      prompt_version: PROMPT_VERSION,
      output_contract_version:
        OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você escreve uma mensagem de WhatsApp para o vendedor da Yolen, mas somente porque o vendedor informou explicitamente o que quer fazer agora.',
        'A intenção do vendedor é a ação principal a executar. A orientação da Yolen é recomendação e contexto, não uma ordem que bloqueia o vendedor.',
        'Use o resumo e a interação canônica atual como únicas fontes de fatos sobre o relacionamento e o cliente.',
        'A intenção do vendedor autoriza a ação pedida e os detalhes operacionais que ele escreveu, mas não prova fatos anteriores sobre o cliente.',
        'Use o método comercial publicado e as regras do vendedor como limites de condução.',
        'Se não houver orientação comercial ativa, não transforme automaticamente uma conversa pessoal, administrativa ou operacional em venda.',
        'Não invente preço, desconto, prazo, compromisso, disponibilidade, objeção, necessidade, nome de produto, condição comercial ou qualquer fato que não esteja no resumo.',
        'Não prometa que algo será feito se isso não estiver sustentado no contexto.',
        'Escreva como mensagem real de WhatsApp: natural, clara, humana e pronta para revisão do vendedor.',
        'Evite linguagem de robô, jargão de CRM, explicações sobre o método, listas longas e texto excessivamente formal.',
        'Entregue somente a mensagem, sem comentário adicional.',
      ].join('\n'),
      user_prompt: JSON.stringify({
        seller_intent: intent,
        working_summary: summary,
        current_interaction: interaction,
        yolen_guidance:
          guidance
            ? {
                status: guidance.status,
                method_name:
                  guidance.method_name,
                stage_name:
                  guidance.stage_name,
                next_step:
                  guidance.next_step,
              }
            : null,
        published_method: {
          name: method.name,
          description: method.description,
          stages: method.stages,
          business_context:
            method.business_context,
          seller_rules:
            method.seller_rules,
        },
      }),
      structured_output_format:
        STRUCTURED_OUTPUT_FORMAT,
    })

    if (typeof response.content !== 'string') {
      throw new Error('invalid_output')
    }

    const parsed = JSON.parse(response.content) as {
      message?: unknown
    }

    const message = clean(parsed.message)

    if (!message) {
      throw new Error('empty_message')
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return {
        status: 'error',
        message: null,
        error:
          'A mensagem ficou longa demais. Ajuste sua intenção e tente novamente.',
      }
    }

    const allowedContext = [
      summary,
      intent,
      ...interaction.map(
        (entry) => entry.text,
      ),
    ].join('\n')

    if (
      hasUnsupportedProtectedFact({
        message,
        allowedContext,
      })
    ) {
      return {
        status: 'error',
        message: null,
        error:
          'A mensagem trouxe um valor, percentual, data ou horário sem base no contexto. Ajuste sua intenção e tente novamente.',
      }
    }

    return {
      status: 'ready',
      message,
      error: null,
    }
  } catch {
    return {
      status: 'error',
      message: null,
      error:
        'Não foi possível gerar a mensagem agora. Tente novamente.',
    }
  }
}
