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
  'lead-seller-message-v2-context-quality'
const OUTPUT_CONTRACT_VERSION =
  'lead-seller-message-v2-context-quality'
const REVIEW_PROMPT_VERSION =
  'lead-seller-message-customer-facing-review-v2'
const REVIEW_OUTPUT_CONTRACT_VERSION =
  'lead-seller-message-customer-facing-review-v2'
const MAX_MESSAGE_LENGTH = 1200

const STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_seller_message_v2_context_quality',
  description:
    'Mensagem de WhatsApp contextual escrita em nome do vendedor e dirigida ao cliente, criada somente após intenção explícita do vendedor.',
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
  name: 'yolen_lead_seller_message_customer_facing_review_v2',
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


const CONTEXT_STOPWORDS = new Set([
  'acao',
  'agora',
  'ainda',
  'atendimento',
  'assunto',
  'atual',
  'cliente',
  'comercial',
  'com',
  'como',
  'contexto',
  'conversa',
  'depois',
  'duvida',
  'entender',
  'existe',
  'fazer',
  'informacao',
  'informacoes',
  'melhor',
  'momento',
  'natural',
  'para',
  'pessoal',
  'pessoa',
  'precisa',
  'precisou',
  'pergunta',
  'perguntou',
  'questao',
  'responder',
  'retorno',
  'situacao',
  'sobre',
  'vendedor',
  'verificar',
])

const SHORT_CONTEXT_ANCHORS = new Set([
  'app',
  'cpf',
  'cnpj',
  'pix',
])

type GroundedConcept = {
  label: string
  output: RegExp
  evidence: RegExp
}

const GROUNDED_CONCEPTS: GroundedConcept[] = [
  {
    label: 'matrícula/inscrição',
    output: /\b(matricul|inscri)\w*/,
    evidence: /\b(matricul|inscri)\w*/,
  },
  {
    label: 'cadastro',
    output: /\bcadastr\w*/,
    evidence: /\bcadastr\w*/,
  },
  {
    label: 'contrato',
    output: /\bcontrat\w*/,
    evidence: /\bcontrat\w*/,
  },
  {
    label: 'documento/CPF/CNPJ',
    output: /\b(document\w*|cpf|cnpj)\b/,
    evidence: /\b(document\w*|cpf|cnpj)\b/,
  },
  {
    label: 'Gympass/Wellhub/check-in/aplicativo',
    output: /\b(gympass|wellhub|check\s*in|aplicativo|app)\b/,
    evidence: /\b(gympass|wellhub|check\s*in|aplicativo|app)\b/,
  },
  {
    label: 'proposta/orçamento',
    output: /\b(proposta|orcamento)\w*/,
    evidence: /\b(proposta|orcamento)\w*/,
  },
  {
    label: 'pagamento/parcelamento',
    output: /\b(pagament|pagar|parcela|parcelament|cartao|pix|boleto|finance)\w*/,
    evidence: /\b(pagament|pagar|parcela|parcelament|cartao|pix|boleto|finance)\w*/,
  },
  {
    label: 'compra/fechamento',
    output: /\b(compra|comprar|adquir|fechar|fechamento|efetivar)\w*/,
    evidence: /\b(compra|comprar|adquir|fechar|fechamento|efetivar)\w*/,
  },
  {
    label: 'preço/investimento/desconto',
    output: /\b(preco|valor|investimento|desconto)\w*/,
    evidence: /\b(preco|valor|investimento|desconto)\w*/,
  },
  {
    label: 'objeção',
    output: /\b(objecao|resistencia)\w*/,
    evidence: /\b(objecao|resistencia)\w*/,
  },
  {
    label: 'cancelamento',
    output: /\b(cancelar|cancelamento|cancelado)\w*/,
    evidence: /\b(cancelar|cancelamento|cancelado)\w*/,
  },
]

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

function comparable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSpecificAnchors(value: string): string[] {
  const unique = new Set<string>()

  comparable(value)
    .split(' ')
    .filter(Boolean)
    .forEach((token) => {
      if (
        (token.length >= 4 || SHORT_CONTEXT_ANCHORS.has(token)) &&
        !CONTEXT_STOPWORDS.has(token) &&
        !/^\d+$/.test(token)
      ) {
        unique.add(token)
      }
    })

  return [...unique]
}

function mentionsAnyAnchor(
  value: string,
  anchors: readonly string[],
) {
  if (anchors.length === 0) {
    return false
  }

  const tokens = new Set(
    comparable(value).split(' ').filter(Boolean),
  )

  return anchors.some((anchor) => tokens.has(anchor))
}

function sellerIntentAllowsContextLightMessage(intent: string) {
  return /\b(agradec|obrigad|desped|encerr|disposicao|cumpriment|paraben|pedir desculp|desculp)\w*/.test(
    comparable(intent),
  )
}

function isQuestionLikeHypothesis(value: string) {
  const normalized = comparable(value)

  return (
    value.includes('?') ||
    /\b(perguntou|pergunta|quer saber|duvida)\s+(se|como)\b/.test(
      normalized,
    )
  )
}

function looksLikeQuestionAffirmation(value: string) {
  const normalized = comparable(value)

  return (
    /^(sim|isso mesmo|exatamente|correto|correta|certo|certa)\b/.test(
      normalized,
    ) ||
    /\b(e so|basta)\b/.test(normalized)
  )
}

function sellerIntentExplicitlyProvidesAnswer(intent: string) {
  return /\b(confirmar que|dizer que|informar que|responder que|explicar que)\b/.test(
    comparable(intent),
  )
}

function summaryHasDeclarativeSupport(summary: string) {
  return /\b(confirmad|regra|funciona|deve|e feito|e necessario|orientacao oficial|foi informado)\b/.test(
    comparable(summary),
  )
}

function getProtectedFacts(value: string) {
  return value.match(
    /R\$\s*\d[\d.,]*|\b\d+(?:[.,]\d+)?\s*%|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)\b/giu,
  ) ?? []
}

function normalizeProtectedTime(
  value: string,
): string | null {
  const match =
    normalizeForGrounding(value).match(
      /^(?:0?(\d)|1(\d)|2([0-3]))(?::([0-5]\d)|h([0-5]\d)?)$/,
    )

  if (!match) {
    return null
  }

  const hour =
    match[1] !== undefined
      ? Number(match[1])
      : match[2] !== undefined
        ? 10 + Number(match[2])
        : 20 + Number(match[3])

  const minuteText =
    match[4] ??
    match[5] ??
    '00'

  const minute = Number(
    minuteText.padStart(2, '0'),
  )

  return `${hour}:${String(minute).padStart(2, '0')}`
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

  const allowedTimes =
    new Set(
      getProtectedFacts(allowedContext)
        .map(normalizeProtectedTime)
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    )

  return getProtectedFacts(message).some(
    (fact) => {
      const normalizedFact =
        normalizeForGrounding(fact)

      if (
        normalizedContext.includes(
          normalizedFact,
        )
      ) {
        return false
      }

      const normalizedTime =
        normalizeProtectedTime(fact)

      if (
        normalizedTime &&
        allowedTimes.has(
          normalizedTime,
        )
      ) {
        return false
      }

      return true
    },
  )
}

function findUnsupportedGroundedConcept(
  output: string,
  allowedContext: string,
): string | null {
  const normalizedOutput = comparable(output)
  const normalizedContext = comparable(allowedContext)

  for (const concept of GROUNDED_CONCEPTS) {
    if (
      concept.output.test(normalizedOutput) &&
      !concept.evidence.test(normalizedContext)
    ) {
      return concept.label
    }
  }

  return null
}

type MessageAttempt = {
  message: string | null
  failure: string | null
}

function validateMessage({
  message,
  summary,
  interaction,
  intent,
}: {
  message: string
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
}): string | null {
  if (message.length > MAX_MESSAGE_LENGTH) {
    return 'A mensagem excedeu o tamanho permitido.'
  }

  const interactionText = interaction
    .map((entry) => entry.text)
    .join('\n')
  const factualContext = [summary, interactionText]
    .filter(Boolean)
    .join('\n')
  const allowedContext = [
    factualContext,
    intent,
  ].filter(Boolean).join('\n')

  if (
    hasUnsupportedProtectedFact({
      message,
      allowedContext,
    })
  ) {
    return 'A mensagem trouxe valor, percentual, data ou horário sem base no contexto.'
  }

  const unsupportedConcept =
    findUnsupportedGroundedConcept(
      message,
      allowedContext,
    )

  if (unsupportedConcept) {
    return `A mensagem introduziu ${unsupportedConcept} sem base no contexto ou na intenção explícita do vendedor.`
  }

  const lastInteraction =
    interaction[interaction.length - 1] ?? null
  const questionSource =
    lastInteraction?.direction === 'incoming'
      ? lastInteraction.text
      : interaction.length === 0
        ? summary
        : ''

  if (
    questionSource &&
    isQuestionLikeHypothesis(questionSource) &&
    looksLikeQuestionAffirmation(message) &&
    !sellerIntentExplicitlyProvidesAnswer(intent) &&
    !summaryHasDeclarativeSupport(summary)
  ) {
    return (
      'A mensagem confirmou como fato uma hipótese que aparece apenas como pergunta do cliente. ' +
      'Responda sem validar a hipótese, a menos que exista apoio declarativo no contexto ou na intenção explícita do vendedor.'
    )
  }

  const contextAnchors =
    getSpecificAnchors(factualContext)
  const intentAnchors =
    getSpecificAnchors(intent)
  const richContext =
    contextAnchors.length >= 2

  if (
    richContext &&
    !sellerIntentAllowsContextLightMessage(intent) &&
    !mentionsAnyAnchor(message, contextAnchors) &&
    !mentionsAnyAnchor(message, intentAnchors)
  ) {
    return (
      'O contexto contém fatos específicos, mas a mensagem ficou intercambiável entre clientes. ' +
      `Use naturalmente ao menos um elemento concreto pertinente, como: ${contextAnchors.slice(0, 5).join(', ')}.`
    )
  }

  return null
}

async function runAttempt({
  summary,
  interaction,
  intent,
  method,
  guidance,
  provider,
  correctionReason,
}: {
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
  method: PublishedCommercialMethod
  guidance: SellerMessageGuidance | null
  provider: StatefulCopilotProvider
  correctionReason?: string | null
}): Promise<MessageAttempt> {
  const factualContext = [
    summary,
    ...interaction.map((entry) => entry.text),
  ].join('\n')
  const contextAnchors =
    getSpecificAnchors(factualContext)
  const correction = correctionReason
    ? [
        'A tentativa anterior não passou pela validação seller-facing.',
        `Motivo: ${correctionReason}`,
        'Gere novamente sem inventar fatos e sem relaxar o contrato.',
      ]
    : []

  try {
    const response = await provider({
      prompt_version: PROMPT_VERSION,
      output_contract_version:
        OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você escreve uma mensagem de WhatsApp EM NOME DO VENDEDOR DA YOLEN e DIRIGIDA AO CLIENTE com quem ele está conversando.',
        'seller_intent é uma instrução privada do vendedor sobre o que ELE quer comunicar. Nunca responda ao seller_intent como se o vendedor fosse o destinatário.',
        'Transforme a intenção do vendedor em uma fala pronta que o próprio vendedor poderia enviar diretamente ao cliente.',
        'Exemplo: seller_intent="Quero fazer uma pergunta para avançar com clareza." exige uma pergunta ao CLIENTE; é proibido responder "Pode mandar sua pergunta".',
        'A intenção do vendedor é a ação principal a executar. Ela é soberana sobre a orientação da Yolen, que funciona como recomendação e contexto, não como ordem.',
        'Use o resumo e a interação canônica atual como únicas fontes de fatos sobre o relacionamento e o cliente.',
        'Mensagens de current_interaction com direction="outgoing" já foram enviadas pelo vendedor. Não repita como nova mensagem uma pergunta, confirmação, explicação ou cobrança que acabou de ser enviada, salvo se houver nova resposta incoming que justifique a repetição.',
        'Uma entrada marcada como "[mensagem de áudio deste participante ainda sem transcrição disponível]" é um áudio real cujo conteúdo é desconhecido: nunca invente ou presuma o que foi dito nele.',
        'A intenção do vendedor autoriza a ação pedida e os detalhes operacionais que ele escreveu, mas não prova fatos anteriores sobre o cliente.',
        'Uma pergunta ou hipótese escrita pelo cliente não prova que a resposta sugerida dentro dela seja verdadeira. Não confirme a hipótese como fato sem apoio declarativo no contexto.',
        'Use o método comercial publicado e as regras do vendedor como limites de condução, nunca como evidência de fatos do cliente.',
        'Se não houver orientação comercial ativa, não transforme automaticamente uma conversa pessoal, administrativa, contratual, de suporte ou operacional em venda.',
        'Não invente preço, desconto, prazo, compromisso, disponibilidade, objeção, necessidade, nome de produto, matrícula, cadastro, documento pendente, condição de contrato ou qualquer outro fato não sustentado.',
        'Não prometa que algo será feito se isso não estiver sustentado no contexto ou explicitamente solicitado pelo vendedor como sua própria ação.',
        'Quando o contexto trouxer fatos concretos e a intenção não for apenas agradecer, despedir ou encerrar, a mensagem deve usar naturalmente pelo menos um elemento concreto pertinente. Não devolva um texto que serviria para dezenas de clientes.',
        'Escreva como mensagem real de WhatsApp: natural, clara, humana e pronta para revisão do vendedor.',
        'Evite linguagem de robô, jargão de CRM, abstrações comerciais, listas longas e texto excessivamente formal.',
        'A saída precisa ser customer-facing: deve falar com o cliente, nunca com o vendedor nem com a Yolen.',
        'Entregue somente a mensagem, sem comentário adicional.',
        ...correction,
      ].join('\n'),
      user_prompt: JSON.stringify({
        seller_intent: intent,
        working_summary: summary,
        current_interaction: interaction,
        context_specificity_anchors:
          contextAnchors.slice(0, 12),
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
      return {
        message: null,
        failure:
          'A IA não retornou mensagem estruturada.',
      }
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(response.content)
    } catch {
      return {
        message: null,
        failure:
          'A IA retornou mensagem em formato inválido.',
      }
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return {
        message: null,
        failure:
          'A IA retornou mensagem em formato inválido.',
      }
    }

    const message = clean(
      (parsed as Record<string, unknown>).message,
    )

    if (!message) {
      return {
        message: null,
        failure: 'A mensagem veio vazia.',
      }
    }

    const failure = validateMessage({
      message,
      summary,
      interaction,
      intent,
    })

    return failure
      ? { message: null, failure }
      : { message, failure: null }
  } catch {
    return {
      message: null,
      failure:
        'Falha transitória ao gerar a mensagem.',
    }
  }
}

async function reviewCustomerFacingMessage({
  candidateMessage,
  summary,
  interaction,
  intent,
  guidance,
  provider,
}: {
  candidateMessage: string
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
  guidance: SellerMessageGuidance | null
  provider: StatefulCopilotProvider
}): Promise<MessageAttempt> {
  try {
    const response = await provider({
      prompt_version: REVIEW_PROMPT_VERSION,
      output_contract_version: REVIEW_OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o gate final de papel comunicacional da Yolen.',
        'Revise uma mensagem que será enviada pelo vendedor diretamente ao cliente.',
        'seller_intent é uma instrução privada do vendedor. A mensagem final precisa EXECUTAR essa intenção como fala do vendedor PARA o cliente.',
        'Detecte role_inversion: mensagem que responde ao vendedor, pede ao vendedor que faça algo ou trata o vendedor como destinatário.',
        'Detecte context_conflict: repetir uma pergunta, confirmação, explicação ou cobrança que já aparece como última ação outgoing sem nova resposta incoming que justifique a repetição.',
        'Uma entrada de áudio ainda sem transcrição não autoriza inferir nenhum conteúdo.',
        'Se houver inversão de papel, intenção não executada, mensagem não customer-facing ou conflito com o contexto, reescreva usando somente os fatos disponíveis.',
        'Se a mensagem já estiver correta, devolva exatamente a mesma mensagem e issue_code="none".',
        'Nunca acrescente preço, percentual, data, horário, promessa ou fato não presente nas fontes.',
        'Retorne somente o JSON do schema.',
      ].join('\n'),
      user_prompt: JSON.stringify({
        seller_intent: intent,
        candidate_message: candidateMessage,
        working_summary: summary,
        current_interaction: interaction,
        yolen_guidance:
          guidance
            ? {
                status: guidance.status,
                method_name: guidance.method_name,
                stage_name: guidance.stage_name,
                next_step: guidance.next_step,
              }
            : null,
      }),
      structured_output_format: CUSTOMER_FACING_REVIEW_FORMAT,
    })

    if (typeof response.content !== 'string') {
      return {
        message: null,
        failure: 'O gate customer-facing não retornou saída estruturada.',
      }
    }

    const parsed = JSON.parse(response.content) as {
      message?: unknown
      changed?: unknown
      issue_code?: unknown
    }

    const message = clean(parsed.message)

    if (!message) {
      return {
        message: null,
        failure: 'O gate customer-facing retornou mensagem vazia.',
      }
    }

    const validationFailure = validateMessage({
      message,
      summary,
      interaction,
      intent,
    })

    if (validationFailure) {
      return {
        message: null,
        failure: validationFailure,
      }
    }

    return {
      message,
      failure: null,
    }
  } catch {
    return {
      message: null,
      failure:
        'Falha no gate customer-facing da mensagem. A mensagem não foi liberada.',
    }
  }
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
    normalizeCurrentInteraction(currentInteraction)

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

  const first = await runAttempt({
    summary,
    interaction,
    intent,
    method,
    guidance,
    provider,
  })

  let candidate = first.message
  let generationFailure = first.failure

  if (!candidate) {
    const corrected = await runAttempt({
      summary,
      interaction,
      intent,
      method,
      guidance,
      provider,
      correctionReason:
        first.failure ||
        'A primeira saída não passou pela validação.',
    })

    candidate = corrected.message
    generationFailure =
      corrected.failure || first.failure
  }

  if (!candidate) {
    return {
      status: 'error',
      message: null,
      error:
        generationFailure ||
        'Não foi possível gerar uma mensagem específica e segura agora.',
    }
  }

  const reviewed = await reviewCustomerFacingMessage({
    candidateMessage: candidate,
    summary,
    interaction,
    intent,
    guidance,
    provider,
  })

  if (!reviewed.message) {
    return {
      status: 'error',
      message: null,
      error:
        reviewed.failure ||
        'A mensagem não passou pelo gate customer-facing.',
    }
  }

  return {
    status: 'ready',
    message: reviewed.message,
    error: null,
  }
}
