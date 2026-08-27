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
  'lead-seller-message-v2'
const OUTPUT_CONTRACT_VERSION =
  'lead-seller-message-v2'
const REVIEW_PROMPT_VERSION =
  'lead-seller-message-customer-facing-review-v1'
const REVIEW_OUTPUT_CONTRACT_VERSION =
  'lead-seller-message-customer-facing-review-v1'
const MAX_MESSAGE_LENGTH = 1200

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_seller_message_v2',
  description:
    'Mensagem de WhatsApp escrita em nome do vendedor e dirigida ao cliente, criada somente após intenção explícita do vendedor.',
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

const CUSTOMER_FACING_REVIEW_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_seller_message_customer_facing_review_v1',
  description:
    'Revisa se a mensagem executa a intenção do vendedor como mensagem dirigida ao cliente e corrige inversão de papéis quando necessário.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      message: {
        type: 'string',
      },
      changed: {
        type: 'boolean',
      },
      issue_code: {
        type: 'string',
        enum: [
          'none',
          'role_inversion',
          'seller_intent_not_executed',
          'not_customer_facing',
          'context_conflict',
        ],
      },
    },
    required: [
      'message',
      'changed',
      'issue_code',
    ],
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
        'Você escreve uma mensagem de WhatsApp EM NOME DO VENDEDOR DA YOLEN e DIRIGIDA AO CLIENTE com quem ele está conversando.',
        'seller_intent é uma instrução privada do vendedor sobre o que ELE quer comunicar. Nunca responda ao seller_intent como se o vendedor fosse o destinatário da mensagem.',
        'Transforme a intenção do vendedor em uma fala pronta que o próprio vendedor poderia enviar diretamente ao cliente.',
        'Exemplo de contrato de papel: seller_intent="Quero fazer uma pergunta para avançar com clareza." exige que a saída seja a pergunta dirigida ao cliente; é proibido responder "Pode mandar sua pergunta" ou pedir ao vendedor que explique o que quer perguntar.',
        'A intenção do vendedor é a ação principal a executar. A orientação da Yolen é recomendação e contexto, não uma ordem que bloqueia o vendedor.',
        'Use o resumo e a interação canônica atual como únicas fontes de fatos sobre o relacionamento e o cliente.',
        'Mensagens de current_interaction com direction="outgoing" já foram enviadas pelo vendedor. Não gere como nova mensagem algo que apenas repita uma pergunta, confirmação, explicação ou cobrança que acabou de ser enviada, salvo se houver nova resposta do cliente que justifique a repetição.',
        'A intenção do vendedor autoriza a ação pedida e os detalhes operacionais que ele escreveu, mas não prova fatos anteriores sobre o cliente.',
        'Use o método comercial publicado e as regras do vendedor como limites de condução.',
        'Se não houver orientação comercial ativa, não transforme automaticamente uma conversa pessoal, administrativa ou operacional em venda.',
        'Não invente preço, desconto, prazo, compromisso, disponibilidade, objeção, necessidade, nome de produto, condição comercial ou qualquer fato que não esteja no resumo.',
        'Não prometa que algo será feito se isso não estiver sustentado no contexto.',
        'Escreva como mensagem real de WhatsApp: natural, clara, humana e pronta para revisão do vendedor.',
        'Evite linguagem de robô, jargão de CRM, explicações sobre o método, listas longas e texto excessivamente formal.',
        'A saída precisa ser customer-facing: deve falar com o cliente, nunca com o vendedor nem com a Yolen.',
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

    const reviewResponse = await provider({
      prompt_version:
        REVIEW_PROMPT_VERSION,
      output_contract_version:
        REVIEW_OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o gate final de papel comunicacional da Yolen.',
        'Revise uma mensagem que será enviada pelo vendedor diretamente ao cliente.',
        'seller_intent é uma instrução privada do vendedor. A mensagem final precisa EXECUTAR essa intenção como fala do vendedor PARA o cliente.',
        'Detecte especialmente role_inversion: quando a mensagem responde ao vendedor, pede ao vendedor que faça algo, trata o vendedor como destinatário ou transforma "quero perguntar/confirmar/explicar/cobrar/agendar" em uma resposta ao próprio vendedor.',
        'Mensagens outgoing da current_interaction já foram enviadas. Se candidate_message repetir semanticamente a última pergunta, confirmação, explicação ou cobrança enviada e não houver nova incoming que justifique repetir, trate como context_conflict e reescreva sem duplicar a ação já executada.',
        'Se houver inversão de papel, intenção não executada, mensagem que não seja dirigida ao cliente ou conflito com o contexto, reescreva a mensagem usando somente os fatos disponíveis.',
        'Se a mensagem já estiver correta, devolva exatamente a mesma mensagem e issue_code="none".',
        'Nunca acrescente preço, percentual, data, horário, promessa ou fato não presente nas fontes.',
        'Retorne somente o JSON do schema.',
      ].join('\n'),
      user_prompt: JSON.stringify({
        seller_intent: intent,
        candidate_message: message,
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
      }),
      structured_output_format:
        CUSTOMER_FACING_REVIEW_FORMAT,
    })

    if (
      typeof reviewResponse.content !==
      'string'
    ) {
      throw new Error(
        'invalid_review_output',
      )
    }

    const reviewed = JSON.parse(
      reviewResponse.content,
    ) as {
      message?: unknown
      changed?: unknown
      issue_code?: unknown
    }

    const finalMessage =
      clean(reviewed.message)

    if (!finalMessage) {
      throw new Error(
        'empty_reviewed_message',
      )
    }

    if (
      finalMessage.length >
      MAX_MESSAGE_LENGTH
    ) {
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
        message: finalMessage,
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
      message: finalMessage,
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
