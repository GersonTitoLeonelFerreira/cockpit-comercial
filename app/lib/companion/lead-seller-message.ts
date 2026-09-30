import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import type {
  PublishedCommercialMethod,
} from './lead-method-guidance'

import type {
  CommercialReasoning,
} from './commercial-reasoning-contract'

import type {
  SellerFacingCommercialRole,
} from '../server/seller-facing-reasoning-projection'

import {
  composeStrategyGroundedMessage,
  evaluateCommercialMessageDraft,
  repairCommercialMessageDraft,
  type CommercialMessageCriticViolation,
  type CommercialMessageStrategy,
} from './commercial-message-strategy'

import {
  buildFactEvidenceRegistry,
  companyItemsFromKnowledgeReferences,
  comparableText,
  describeUnsupportedClaims,
  factTraceEntries,
  groundClaims,
  stripUnsupportedClaims,
  unsupportedClaims,
  type FactEvidenceExclusion,
  type FactEvidenceRegistry,
  type FactTraceEntry,
} from './commercial-fact-grounding'

// FASE 16.9 — MENSAGEM deixou de receber uma orientação própria
// (SellerMessageGuidance) descolada do Commercial Reasoning canônico que
// já sustenta AGORA/ANÁLISE/CLIENTE. O gerador de mensagem só REDIGE:
// situação, papéis, objeção, técnica, conhecimento de empresa e
// restrições (do_not_do) chegam prontos do mesmo `CommercialReasoning`
// carregado por `loadCanonicalSellerReasoning`, nunca recalculados aqui.
export type SellerMessageCanonicalReasoning =
  Pick<
    CommercialReasoning,
    | 'status'
    | 'decision'
    | 'decision_reason'
    | 'current_situation'
    | 'objective_now'
    | 'do_not_do'
    | 'selected_techniques'
    | 'company_knowledge_used'
    | 'limitations'
  >

export type SellerMessageCommercialRole =
  SellerFacingCommercialRole

export type SellerMessageCurrentInteraction = {
  direction: 'incoming' | 'outgoing'
  occurred_at: string | null
  text: string
  // Id canônico da mensagem no ledger (proveniência). Opcional para
  // chamadores legados; sem ele a interação ainda é fonte primária, mas
  // não rastreável por id.
  message_id?: string | null
}

// Diagnóstico INTERNO da geração (log, telemetria, testes, auditoria). O
// vendedor nunca vê isto: `error` é sempre uma frase seller-facing simples.
export type SellerMessageGenerationDiagnostics = {
  // provider = redação do modelo aprovada; strategy_grounded = copy
  // montada da estratégia canônica depois de o modelo não convergir.
  source?: 'provider' | 'strategy_grounded'
  stage?:
    | 'input'
    | 'generation'
    | 'customer_facing_review'
    | 'post_review_repair'
  failures: string[]
  // Proveniência das afirmações da mensagem entregue (ou da última
  // rejeitada) e das fontes descartadas. Nunca exposto em produção.
  fact_trace?: FactTraceEntry[]
  blocked_claims?: FactTraceEntry[]
  excluded_evidence?: FactEvidenceExclusion[]
}

export type SellerMessageGenerationResult =
  | {
      status: 'ready'
      message: string
      error: null
      diagnostics?: SellerMessageGenerationDiagnostics
      // Avisos seller-facing: por que algo pedido não entrou na copy
      // (ex.: valor sem confirmação oficial).
      advisories?: string[]
    }
  | {
      status: 'error'
      message: null
      error: string
      diagnostics?: SellerMessageGenerationDiagnostics
    }
  | {
      // Silêncio canônico: a estratégia proíbe mensagem (opt-out do
      // cliente). Não é erro — a extensão não insere nem copia nada.
      status: 'no_message'
      message: null
      error: null
      reason: string
    }

// Frases seller-facing: nunca o diagnóstico técnico do critic.
export const SELLER_FACING_UNSAFE_MESSAGE =
  'Não foi possível gerar uma mensagem segura com o contexto disponível.'

export const SELLER_FACING_UNAVAILABLE_MESSAGE =
  'Não foi possível gerar a mensagem agora. Tente novamente em instantes.'

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
          'canonical_contradiction',
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
  const normalized: SellerMessageCurrentInteraction[] = []

  for (const message of value) {
    const text = clean(message.text)

    if (!text) {
      continue
    }

    normalized.push({
      direction: message.direction,
      occurred_at: message.occurred_at,
      text,
      ...(message.message_id
        ? { message_id: message.message_id }
        : {}),
    })
  }

  return normalized
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

const PROTECTED_FACT_FAILURE =
  'A mensagem trouxe valor, percentual, data ou horário sem base no contexto.'

function isFactualFailure(failure: string | null): boolean {
  return Boolean(
    failure &&
      (failure === PROTECTED_FACT_FAILURE ||
        failure.startsWith('A mensagem afirmou fato sem evidência válida')),
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

function roleLabel(
  role: SellerMessageCommercialRole['role'],
): string {
  switch (role) {
    case 'prospect':
      return 'prospect (quem pode contratar)'
    case 'intermediary':
      return 'intermediário/interlocutor (está na conversa, mas pode não ser quem contrata)'
    case 'decision_maker':
      return 'decisor'
    case 'influencer':
      return 'influenciador'
    case 'user':
      return 'usuário do serviço'
    case 'beneficiary':
      return 'beneficiário'
    default:
      return role
  }
}

function describeRoles(
  roles: readonly SellerMessageCommercialRole[],
): string[] {
  return roles.map((role) => {
    const who =
      role.scope === 'current_contact'
        ? 'a pessoa que está nesta conversa'
        : 'uma pessoa relacionada à oportunidade, fora desta conversa'

    const label =
      role.label ? ` (${role.label})` : ''

    return `${who}${label} é ${roleLabel(role.role)}.`
  })
}

function hasThirdPartyOpportunity(
  roles: readonly SellerMessageCommercialRole[],
): boolean {
  return (
    roles.some(
      (role) =>
        role.scope === 'current_contact' &&
        role.role === 'intermediary',
    ) &&
    roles.some(
      (role) =>
        role.scope === 'related' &&
        role.role === 'prospect',
    )
  )
}

function describeCanonicalReasoning(
  reasoning: SellerMessageCanonicalReasoning | null,
): Record<string, unknown> | null {
  if (!reasoning) {
    return null
  }

  return {
    status: reasoning.status,
    current_situation: reasoning.current_situation,
    objective_now: reasoning.objective_now,
    do_not_do: reasoning.do_not_do,
    selected_techniques: reasoning.selected_techniques.map(
      (technique) => ({
        title: technique.title,
        why_applicable: technique.why_applicable,
        risks: technique.risks,
      }),
    ),
    company_knowledge_used: reasoning.company_knowledge_used.map(
      (item) => ({
        title: item.title,
        why_relevant: item.why_relevant,
        grounded_content:
          item.grounded_content,
      }),
    ),
  }
}

type MessageAttempt = {
  message: string | null
  failure: string | null
  failure_kind?:
    | 'validation'
    | 'transient'
    | null
}

function sellerIntentMode(
  intent: string,
): 'follow_strategy' | 'explicit_override' {
  const normalized =
    comparable(intent)

  if (
    normalized ===
      'quero responder ao ponto principal desta conversa' ||
    normalized ===
      'responder ao ponto principal desta conversa'
  ) {
    return 'follow_strategy'
  }

  return 'explicit_override'
}

function strictStrategyCorrection(
  strategy:
    CommercialMessageStrategy | null,
): string | null {
  if (
    !strategy?.required_action_type
  ) {
    return null
  }

  const pieces = [
    `A saída anterior falhou. Gere uma nova mensagem cuja ação comercial seja obrigatoriamente "${strategy.required_action_type}".`,
    strategy.desired_microcommitment
      ? `O microcompromisso obrigatório é: ${strategy.desired_microcommitment}`
      : null,
    strategy.blocked_action_types
      ?.length
      ? `Não use estas ações já executadas/bloqueadas: ${strategy.blocked_action_types.join(', ')}.`
      : null,
    'Não reformule uma ação bloqueada com outras palavras.',
  ]

  return pieces
    .filter(
      (item): item is string =>
        Boolean(item),
    )
    .join(' ')
}

function normalizeNameToken(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z'-]/g,
      '',
    )
}

function addressedGreetingName(
  message: string,
): string | null {
  const match =
    message.match(
      /^(?:oi|olá|ola|bom dia|boa tarde|boa noite)\s*,?\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3})(?:[!,]|$)/iu,
    )

  return match?.[1]?.trim() ?? null
}

function formalToneAllowsFullName(
  strategy:
    CommercialMessageStrategy | null,
): boolean {
  const tone =
    comparable(
      strategy?.tone ?? '',
    )

  return /\b(formal|institucional|cerimonioso)\b/
    .test(
      tone,
    )
}

function validateMessage({
  message,
  summary,
  interaction,
  intent,
  messageStrategy,
  recipientName,
  registry,
}: {
  message: string
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
  reasoning: SellerMessageCanonicalReasoning | null
  messageStrategy:
    CommercialMessageStrategy | null
  recipientName: string | null
  registry: FactEvidenceRegistry
}): string | null {
  if (message.length > MAX_MESSAGE_LENGTH) {
    return 'A mensagem excedeu o tamanho permitido.'
  }

  const addressedName =
    addressedGreetingName(
      message,
    )

  if (addressedName) {
    if (!recipientName) {
      return 'A mensagem usou um nome de destinatário sem existir identidade canônica para esse nome.'
    }

    const expectedFirstName =
      recipientName
        .trim()
        .split(/\s+/)[0] ??
      ''

    const addressedToken =
      normalizeNameToken(
        addressedName,
      )
    const expectedFirstToken =
      normalizeNameToken(
        expectedFirstName,
      )
    const expectedFullToken =
      normalizeNameToken(
        recipientName,
      )

    if (
      addressedToken !==
        expectedFirstToken &&
      addressedToken !==
        expectedFullToken
    ) {
      return `A mensagem chamou o cliente de "${addressedName}", mas o destinatário canônico é "${recipientName}".`
    }

    if (
      addressedToken ===
        expectedFullToken &&
      addressedToken !==
        expectedFirstToken &&
      !formalToneAllowsFullName(
        messageStrategy,
      )
    ) {
      return `A saudação usou o nome completo "${addressedName}" sem necessidade de formalidade. Use apenas "${expectedFirstName}" para manter naturalidade no WhatsApp.`
    }
  }

  // FIREWALL DE PROVENIÊNCIA: fato só vem de fonte com autoridade
  // (fala real do cliente/vendedor ou configuração vigente da empresa).
  // Resumo, reasoning e memória são DERIVADOS e não sustentam fato —
  // senão um erro de uma camada anterior vira "verdade" aqui.
  const primaryText = registry.sources
    .filter(
      (source) =>
        source.authority === 'primary_customer' ||
        source.authority === 'primary_seller',
    )
    .map((source) => source.text)
    .join('\n')
  const companyText = registry.sources
    .filter(
      (source) =>
        source.authority === 'company_authoritative',
    )
    .map((source) => source.text)
    .join('\n')

  // Valor e percentual: preço atual só da configuração vigente; valor de
  // mensagem antiga só com enquadramento histórico explícito.
  const claims =
    groundClaims(
      message,
      registry,
      { perspective: 'customer_facing' },
    )
  const unsupported =
    unsupportedClaims(claims)

  if (
    unsupported.some(
      (claim) =>
        claim.kind === 'price' ||
        claim.kind === 'percentage',
    )
  ) {
    return PROTECTED_FACT_FAILURE
  }

  // Data/horário: citados na conversa real, na agenda que o próprio
  // vendedor informou agora ou em fato oficial da empresa.
  if (
    hasUnsupportedProtectedFact({
      message: message
        .replace(/R\$\s*\d[\d.,]*/giu, ' ')
        .replace(/\b\d+(?:[.,]\d+)?\s*%/gu, ' '),
      allowedContext: [
        primaryText,
        companyText,
        intent,
      ].join('\n'),
    })
  ) {
    return PROTECTED_FACT_FAILURE
  }

  const unsupportedFact =
    describeUnsupportedClaims(unsupported)

  if (unsupportedFact) {
    return unsupportedFact
  }

  // Conceitos de TÓPICO (proposta, contrato, pagamento…): podem vir da
  // conversa real, do conhecimento oficial ou da ação pedida pelo vendedor.
  const unsupportedConcept =
    findUnsupportedGroundedConcept(
      message,
      [primaryText, companyText, intent].join('\n'),
    )

  if (unsupportedConcept) {
    return `A mensagem introduziu ${unsupportedConcept} sem base na conversa real, no conhecimento oficial ou na intenção explícita do vendedor.`
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

  // Especificidade (não é fato): basta citar algum assunto concreto da
  // conversa ou do resumo. Mas o que se SUGERE ao redator vem só das falas
  // reais do cliente — sugerir um termo do resumo lavaria o termo para a
  // copy.
  const contextAnchors =
    getSpecificAnchors(
      [
        summary,
        ...interaction.map((entry) => entry.text),
      ].join('\n'),
    )
  const primaryAnchors =
    getSpecificAnchors(
      registry.sources
        .filter(
          (source) =>
            source.authority === 'primary_customer',
        )
        .map((source) => source.text)
        .join('\n'),
    )
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
      (primaryAnchors.length > 0
        ? `Use naturalmente ao menos um elemento concreto da conversa real, como: ${primaryAnchors.slice(0, 5).join(', ')}.`
        : 'Use naturalmente ao menos um elemento concreto da conversa real.')
    )
  }

  return null
}

// Correção específica por violação: o reparo precisa dizer ao redator O
// QUE mudar, não só que "falhou".
const STRATEGY_VIOLATION_MESSAGES:
  ReadonlyArray<[
    CommercialMessageCriticViolation,
    string,
  ]> = [
    [
      'generic_message',
      'A mensagem ficou genérica demais para o contexto atual. Cite naturalmente o assunto concreto que o cliente trouxe.',
    ],
    [
      'repeats_recent_seller_action',
      'A mensagem repete uma ação recente do vendedor sem fato novo. Não reformule a pergunta ou oferta que ficou sem resposta.',
    ],
    [
      'assumes_current_intent',
      'A mensagem tratou a intenção antiga do cliente como confirmada (pediu data, escolha, pagamento ou fechamento). Primeiro descubra se o interesse continua.',
    ],
    [
      'message_too_long',
      'A mensagem excedeu o tamanho permitido pela estratégia. Reduza para poucas frases curtas.',
    ],
    [
      'excessive_questions',
      'A mensagem empilhou perguntas demais; reduza para um único microcompromisso claro (sem "tudo bem?" competindo com a pergunta principal).',
    ],
    [
      'pressure_risk',
      'A mensagem introduziu pressão ou urgência artificial. Remova escassez, prazo ou urgência que não estejam nos fatos oficiais.',
    ],
    [
      'fabricated_enthusiasm',
      'A mensagem atribuiu ao cliente um entusiasmo que ele não demonstrou. Use apenas o que ele realmente disse.',
    ],
    [
      'technique_mismatch',
      'A mensagem não executou a técnica comercial escolhida para este momento.',
    ],
    [
      'generic_filler',
      'A mensagem usou fechamento genérico que não ajuda o cliente a tomar o próximo microcompromisso. Remova frases como "fico à disposição" e termine na pergunta principal.',
    ],
    [
      'weak_microcommitment',
      'A mensagem de retomada não formulou um microcompromisso comercial claro em forma de pergunta.',
    ],
  ]

function strategyFailureMessage(
  violations:
    readonly CommercialMessageCriticViolation[],
): string | null {
  if (violations.length === 0) {
    return null
  }

  const messages =
    STRATEGY_VIOLATION_MESSAGES
      .filter(
        ([violation]) =>
          violations.includes(
            violation,
          ),
      )
      .map(
        ([, message]) =>
          message,
      )

  return messages.length > 0
    ? messages.join(' ')
    : 'A mensagem não passou pelo critic da estratégia comercial.'
}

function evaluateAgainstStrategy({
  message,
  interaction,
  messageStrategy,
}: {
  message: string
  interaction: readonly SellerMessageCurrentInteraction[]
  messageStrategy:
    CommercialMessageStrategy | null
}) {
  return messageStrategy
    ? evaluateCommercialMessageDraft({
        message,
        strategy:
          messageStrategy,
        recent_outgoing_messages:
          interaction
            .filter(
              entry =>
                entry.direction ===
                  'outgoing',
            )
            .map(
              entry =>
                entry.text,
            ),
      })
    : {
        passed: true,
        violations:
          [] as CommercialMessageCriticViolation[],
      }
}

// Validação seller-facing + critic da estratégia sobre a mesma mensagem.
// Quando a ÚNICA falha é trivialmente reparável (frase de disponibilidade
// vazia, "tudo bem?" competindo com a pergunta comercial), aplica o reparo
// determinístico e revalida o resultado com o MESMO critic — estratégia
// válida chega a copy válida sem afrouxar nenhuma regra.
function checkCandidateMessage({
  message,
  summary,
  interaction,
  intent,
  reasoning,
  messageStrategy,
  recipientName,
  registry,
}: {
  message: string
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
  reasoning: SellerMessageCanonicalReasoning | null
  messageStrategy: CommercialMessageStrategy | null
  recipientName: string | null
  registry: FactEvidenceRegistry
}): {
  message: string
  failure: string | null
  repaired: boolean
} {
  const validate = (
    candidate: string,
  ) => {
    const validationFailure =
      validateMessage({
        message: candidate,
        summary,
        interaction,
        intent,
        reasoning,
        messageStrategy,
        recipientName,
        registry,
      })

    const critic =
      evaluateAgainstStrategy({
        message: candidate,
        interaction,
        messageStrategy,
      })

    return {
      failure:
        validationFailure ||
        strategyFailureMessage(
          critic.violations,
        ),
      violations:
        critic.violations,
    }
  }

  const first =
    validate(message)

  if (!first.failure) {
    return {
      message,
      failure: null,
      repaired: false,
    }
  }

  // Segurança factual MUDA a copy, não a elimina: a afirmação sem
  // proveniência sai (trecho ou sentença) e o resto passa de novo pelas
  // MESMAS regras. Só vale se sobrar uma mensagem de verdade.
  if (isFactualFailure(first.failure)) {
    const stripped =
      stripUnsupportedClaims(
        message,
        registry,
      )

    registry.blocked.push(
      ...unsupportedClaims(
        groundClaims(message, registry),
      ),
    )

    if (
      stripped &&
      stripped !== message &&
      stripped.split(/\s+/).length >= 5 &&
      (!message.includes('?') || stripped.includes('?'))
    ) {
      const second =
        validate(stripped)

      if (!second.failure) {
        return {
          message: stripped,
          failure: null,
          repaired: true,
        }
      }

      const secondRepairable =
        second.violations.length > 0 &&
        second.violations.every(
          violation =>
            violation === 'generic_filler' ||
            violation === 'excessive_questions',
        )

      if (secondRepairable) {
        const repaired =
          repairCommercialMessageDraft(stripped)

        if (repaired.message && !validate(repaired.message).failure) {
          return {
            message: repaired.message,
            failure: null,
            repaired: true,
          }
        }
      }
    }
  }

  const repairable =
    first.violations.length > 0 &&
    first.violations.every(
      violation =>
        violation ===
          'generic_filler' ||
        violation ===
          'excessive_questions',
    )

  if (repairable) {
    const repaired =
      repairCommercialMessageDraft(
        message,
      )

    if (
      repaired.repairs.length > 0 &&
      repaired.message &&
      repaired.message !== message
    ) {
      const second =
        validate(
          repaired.message,
        )

      if (!second.failure) {
        return {
          message:
            repaired.message,
          failure: null,
          repaired: true,
        }
      }
    }
  }

  return {
    message,
    failure:
      first.failure,
    repaired: false,
  }
}

function describeTemporalFrame(
  strategy:
    CommercialMessageStrategy | null,
): string[] {
  const frame =
    strategy?.temporal_frame

  if (!frame) {
    return []
  }

  return [
    `Instante atual da conversa: ${frame.evaluated_at}. Considere o tempo que passou desde as mensagens citadas.`,
    ...frame.guidance,
  ]
}

async function runAttempt({
  summary,
  interaction,
  intent,
  method,
  reasoning,
  messageStrategy,
  roles,
  recipientName,
  provider,
  correctionReason,
  registry,
}: {
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
  method: PublishedCommercialMethod
  reasoning: SellerMessageCanonicalReasoning | null
  messageStrategy: CommercialMessageStrategy | null
  roles: readonly SellerMessageCommercialRole[]
  recipientName: string | null
  provider: StatefulCopilotProvider
  correctionReason?: string | null
  registry: FactEvidenceRegistry
}): Promise<MessageAttempt> {
  // Âncoras de especificidade só da conversa real (nunca do resumo).
  const contextAnchors =
    getSpecificAnchors(
      interaction
        .map((entry) => entry.text)
        .join('\n'),
    )
  const correction = correctionReason
    ? [
        'A tentativa anterior não passou pela validação seller-facing.',
        `Motivo: ${correctionReason}`,
        'Gere novamente sem inventar fatos e sem relaxar o contrato.',
      ]
    : []
  const thirdParty = hasThirdPartyOpportunity(roles)
  const intentMode =
    sellerIntentMode(
      intent,
    )

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
        'A intenção do vendedor é a ação principal a executar somente quando seller_intent_mode="explicit_override". Quando seller_intent_mode="follow_strategy", ela apenas autoriza executar o próximo passo canônico decidido por commercial_reasoning/message_strategy.',
        'Se seller_intent_mode="follow_strategy", não volte ao ponto literal da conversa se isso repetir uma ação bloqueada ou contrariar a técnica selecionada.',
        'Fatos sobre o cliente vêm SOMENTE de current_interaction (falas reais) e de message_strategy.context_reference. working_summary e commercial_reasoning são leituras DERIVADAS: use-as para entender a situação, nunca como prova de fato — se algo (pessoa, relação familiar, preferência, objeção, pedido, compromisso) só aparece ali, não afirme.',
        'Fatos sobre a empresa (preço atual, promoção, desconto, benefício, gratuidade, condição) vêm SOMENTE do conhecimento oficial em commercial_reasoning.company_knowledge_used/message_strategy.facts_allowed. A intenção do vendedor escolhe estilo, técnica e objetivo, mas não cria preço, desconto ou benefício.',
        'Mensagens de current_interaction com direction="outgoing" já foram enviadas pelo vendedor. Não repita como nova mensagem uma pergunta, confirmação, explicação ou cobrança que acabou de ser enviada, salvo se houver nova resposta incoming que justifique a repetição.',
        'Uma entrada marcada como "[mensagem de áudio deste participante ainda sem transcrição disponível]" é um áudio real cujo conteúdo é desconhecido: nunca invente ou presuma o que foi dito nele.',
        'A intenção do vendedor autoriza a ação pedida e os detalhes operacionais que ele escreveu, mas não prova fatos anteriores sobre o cliente.',
        'Uma pergunta ou hipótese escrita pelo cliente não prova que a resposta sugerida dentro dela seja verdadeira. Não confirme a hipótese como fato sem apoio declarativo no contexto.',
        'Use o método comercial publicado e as regras do vendedor como limites de condução, nunca como evidência de fatos do cliente.',
        'Se não houver orientação comercial ativa, não transforme automaticamente uma conversa pessoal, administrativa, contratual, de suporte ou operacional em venda.',
        'Não invente preço, desconto, prazo, compromisso, disponibilidade, objeção, necessidade, nome de produto, matrícula, cadastro, documento pendente, condição de contrato ou qualquer outro fato não sustentado.',
        'Não prometa que algo será feito se isso não estiver sustentado no contexto ou explicitamente solicitado pelo vendedor como sua própria ação.',
        'Quando o contexto trouxer fatos concretos e a intenção não for apenas agradecer, despedir ou encerrar, a mensagem deve usar naturalmente pelo menos um elemento concreto pertinente. Não devolva um texto que serviria para dezenas de clientes.',
        'commercial_reasoning, quando presente, já decidiu a situação atual, o objetivo agora, a técnica aplicável e o conhecimento de empresa relevante. Você NÃO pode redecidir nenhum desses pontos — apenas redigir a mensagem dentro deles.',
        'message_strategy é o plano determinístico de redação derivado do mesmo reasoning e do coaching. Quando presente, execute objective, relationship_bridge, context_reference, technique_id, desired_microcommitment, required_action_type e tone sem criar uma estratégia paralela.',
        'Se message_strategy.required_action_type estiver preenchido, a mensagem PRECISA executar essa ação comercial e não outra.',
        'A mensagem deve perseguir UM único microcompromisso principal. Evite empilhar perguntas; por padrão use no máximo uma pergunta clara.',
        'Não desperdice a única pergunta com uma saudação fática como "tudo bem?" quando o objetivo comercial exige uma resposta clara. A pergunta principal deve executar o microcompromisso comercial.',
        'A técnica selecionada precisa aparecer na CONDUÇÃO da mensagem, não no vocabulário. Nunca cite nome de técnica ao cliente.',
        'Em retomada contextual, reconheça continuidade e reabra o objetivo já demonstrado; não reformule a mesma pergunta operacional que ficou sem resposta.',
        'Em diagnóstico de objeção, faça uma pergunta curta para entender a causa antes de argumentar, conceder ou prescrever.',
        'Quando houver conhecimento oficial relevante em facts_allowed/company_knowledge_used, conecte-o ao contexto do cliente em vez de listar benefícios genéricos.',
        'Prefira mensagem curta e natural. Remova introduções, explicações e frases de disponibilidade que não aumentem a chance do microcompromisso desejado.',
        'message_strategy.prohibited_moves é limite duro: nunca faça nada listado ali.',
        'message_strategy.temporal_frame descreve o TEMPO da conversa. Se requalify_before_continuing=true, a intenção antiga não está confirmada: não peça data, horário, escolha, pagamento ou fechamento — faça uma pergunta de baixo esforço que descubra como está o interesse hoje, relembrando de forma concreta o que o cliente queria.',
        'message_strategy.reactivation_tactics lista as táticas legítimas para este momento. Use-as na condução (recuperação de contexto, pergunta de mudança de estado, permissão, quebra de padrão), nunca como vocabulário técnico.',
        'Persuasão sem invenção: nunca atribua ao cliente entusiasmo, urgência, escassez, perda, relacionamento ou necessidade que ele não demonstrou. Recuperação emocional só quando temporal_frame.enthusiasm_evidenced=true.',
        'Não termine com frases de disponibilidade como "fico à disposição" ou "qualquer dúvida estou aqui": a mensagem termina na pergunta do microcompromisso.',
        'message_strategy.facts_allowed contém somente conhecimento de empresa já autorizado pelo reasoning. message_strategy.facts_required_but_missing descreve fatos que ainda NÃO estão disponíveis e nunca podem ser inventados.',
        'Nunca faça nada que apareça em commercial_reasoning.do_not_do.',
        'Só use um fato de commercial_reasoning.company_knowledge_used como conhecimento de empresa; nunca introduza uma regra, política ou condição da empresa que não esteja ali.',
        ...(thirdParty
          ? [
              'customer_roles indica uma oportunidade de terceiro: quem está nesta conversa (current_contact) é um intermediário, e o prospect real está em related. Dirija a mensagem à pessoa que está de fato nesta conversa, ajudando-a a encaminhar/avançar o prospect relacionado. Nunca trate o intermediário como se ele fosse o comprador direto.',
            ]
          : []),
        'Escreva como mensagem real de WhatsApp: natural, clara, humana e pronta para revisão do vendedor.',
        'Evite linguagem de robô, jargão de CRM, abstrações comerciais, listas longas e texto excessivamente formal.',
        'A saída precisa ser customer-facing: deve falar com o cliente, nunca com o vendedor nem com a Yolen.',
        recipientName
          ? `O nome canônico do destinatário atual é "${recipientName}". Em WhatsApp, use preferencialmente só o primeiro nome "${recipientName.trim().split(/\s+/)[0] ?? recipientName}" na saudação. Só use o nome completo se message_strategy.tone exigir tratamento formal. Nunca use nome extraído de mensagem outgoing do vendedor.`
          : 'Não existe nome canônico seguro do destinatário neste contexto. Não invente nem copie para a saudação um nome visto em mensagem outgoing do vendedor.',
        'Entregue somente a mensagem, sem comentário adicional.',
        ...describeTemporalFrame(
          messageStrategy,
        ),
        ...correction,
      ].join('\n'),
      user_prompt: JSON.stringify({
        seller_intent: intent,
        seller_intent_mode:
          intentMode,
        working_summary: summary,
        current_interaction: interaction,
        context_specificity_anchors:
          contextAnchors.slice(0, 12),
        commercial_reasoning:
          describeCanonicalReasoning(reasoning),
        message_strategy:
          messageStrategy,
        customer_roles:
          describeRoles(roles),
        recipient_name:
          recipientName,
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

    const checked =
      checkCandidateMessage({
        message,
        summary,
        interaction,
        intent,
        reasoning,
        messageStrategy,
        recipientName,
        registry,
      })

    const strategyFailure =
      checked.failure
    return strategyFailure
      ? {
          message: null,
          failure:
            strategyFailure,
        }
      : {
          message:
            checked.message,
          failure: null,
        }
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
  reasoning,
  messageStrategy,
  roles,
  recipientName,
  provider,
  registry,
}: {
  candidateMessage: string
  summary: string
  interaction: readonly SellerMessageCurrentInteraction[]
  intent: string
  reasoning: SellerMessageCanonicalReasoning | null
  messageStrategy: CommercialMessageStrategy | null
  roles: readonly SellerMessageCommercialRole[]
  recipientName: string | null
  provider: StatefulCopilotProvider
  registry: FactEvidenceRegistry
}): Promise<MessageAttempt> {
  const thirdParty = hasThirdPartyOpportunity(roles)
  const intentMode =
    sellerIntentMode(
      intent,
    )

  try {
    const response = await provider({
      prompt_version: REVIEW_PROMPT_VERSION,
      output_contract_version: REVIEW_OUTPUT_CONTRACT_VERSION,
      system_prompt: [
        'Você é o gate final de papel comunicacional e comercial da Yolen.',
        'Revise uma mensagem que será enviada pelo vendedor diretamente ao cliente.',
        'seller_intent é uma instrução privada do vendedor. A mensagem final precisa EXECUTAR essa intenção como fala do vendedor PARA o cliente.',
        'Se seller_intent_mode="follow_strategy", seller_intent apenas autoriza seguir commercial_reasoning/message_strategy; não use essa frase genérica para reconstruir uma ação antiga já bloqueada.',
        'Se message_strategy.required_action_type estiver preenchido, preserve essa ação comercial na revisão.',
        'Detecte role_inversion: mensagem que responde ao vendedor, pede ao vendedor que faça algo ou trata o vendedor como destinatário.',
        'Detecte context_conflict: repetir uma pergunta, confirmação, explicação ou cobrança que já aparece como última ação outgoing sem nova resposta incoming que justifique a repetição.',
        'Detecte canonical_contradiction: a mensagem contraria commercial_reasoning.current_situation, ignora commercial_reasoning.objective_now, faz algo listado em commercial_reasoning.do_not_do, contraria message_strategy.objective/context_reference, viola message_strategy.prohibited_moves ou usa algo de message_strategy.facts_required_but_missing como se fosse fato disponível; quando customer_roles indicar terceiro, também é contradição tratar o intermediário desta conversa como se ele fosse o prospect/comprador.',
        'Uma entrada de áudio ainda sem transcrição não autoriza inferir nenhum conteúdo.',
        'Se houver inversão de papel, intenção não executada, mensagem não customer-facing, conflito com o contexto ou contradição canônica, reescreva usando somente os fatos disponíveis e as decisões já tomadas por commercial_reasoning.',
        'A revisão deve preservar um único microcompromisso, no máximo uma pergunta principal, a técnica definida em message_strategy e o limite de pressão do contexto.',
        'Em retomada, a pergunta principal deve perguntar diretamente pelo microcompromisso comercial; "tudo bem?" não conta como avanço.',
        'Remova frases vazias como "fico à disposição", "posso ajudar com o que for necessário" ou "para avançarmos" quando elas não acrescentarem uma ação concreta.',
        'Se a mensagem já estiver correta, devolva exatamente a mesma mensagem e issue_code="none".',
        'Nunca acrescente preço, percentual, data, horário, promessa ou fato não presente nas fontes.',
        'working_summary e commercial_reasoning são leituras derivadas, não fontes: remova da mensagem qualquer fato sobre o cliente (pessoa, relação familiar, preferência, objeção, pedido) que não esteja em current_interaction ou em message_strategy.context_reference.',
        recipientName
          ? `O nome canônico do destinatário é "${recipientName}". Em WhatsApp, prefira o primeiro nome "${recipientName.trim().split(/\s+/)[0] ?? recipientName}" salvo quando message_strategy.tone exigir formalidade; qualquer outro nome é role_inversion/context_conflict.`
          : 'Sem nome canônico do destinatário, remova qualquer saudação nominal que possa ter sido copiada do vendedor.',
        ...(thirdParty
          ? [
              'customer_roles indica uma oportunidade de terceiro: quem está nesta conversa é o intermediário, o prospect real está em related. A mensagem precisa falar com o intermediário e ajudá-lo a encaminhar o prospect, nunca tratar o intermediário como comprador direto.',
            ]
          : []),
        'Retorne somente o JSON do schema.',
      ].join('\n'),
      user_prompt: JSON.stringify({
        seller_intent: intent,
        seller_intent_mode:
          intentMode,
        candidate_message: candidateMessage,
        working_summary: summary,
        current_interaction: interaction,
        commercial_reasoning:
          describeCanonicalReasoning(reasoning),
        message_strategy:
          messageStrategy,
        customer_roles:
          describeRoles(roles),
        recipient_name:
          recipientName,
      }),
      structured_output_format: CUSTOMER_FACING_REVIEW_FORMAT,
    })

    if (typeof response.content !== 'string') {
      return {
        message: null,
        failure: 'O gate customer-facing não retornou saída estruturada.',
        failure_kind:
          'transient',
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
        failure_kind:
          'transient',
      }
    }

    const checked =
      checkCandidateMessage({
        message,
        summary,
        interaction,
        intent,
        reasoning,
        messageStrategy,
        recipientName,
        registry,
      })

    if (checked.failure) {
      return {
        message: null,
        failure:
          `A mensagem revisada não passou pelo critic da estratégia comercial: ${checked.failure}`,
        failure_kind:
          'validation',
      }
    }

    return {
      message:
        checked.message,
      failure: null,
      failure_kind: null,
    }
  } catch {
    return {
      message: null,
      failure:
        'Falha no gate customer-facing da mensagem. A mensagem não foi liberada.',
      failure_kind:
        'transient',
    }
  }
}

// Fatos externos que o vendedor pediu para afirmar (valor, promoção,
// benefício, urgência) sem fonte oficial: a copy não os usa e o vendedor
// fica sabendo por quê.
function sellerInstructionAdvisories(
  intent: string,
  registry: FactEvidenceRegistry,
): string[] {
  const advisories = new Set<string>()

  for (const claim of unsupportedClaims(groundClaims(intent, registry))) {
    if (claim.kind === 'price' || claim.kind === 'percentage') {
      const shown =
        claim.kind === 'price'
          ? `R$ ${Number(claim.value).toFixed(2).replace('.', ',')}`
          : claim.value

      advisories.add(
        `Não usei ${shown} porque não encontrei esse valor confirmado na configuração da empresa.`,
      )
    } else if (
      claim.kind === 'promotion' ||
      claim.kind === 'benefit' ||
      claim.kind === 'urgency' ||
      claim.kind === 'company_statement'
    ) {
      advisories.add(
        'Não afirmei a condição pedida porque não encontrei essa condição confirmada na configuração da empresa.',
      )
    }
  }

  return [...advisories]
}

function groundStrategyReference(
  strategy: CommercialMessageStrategy | null,
  registry: FactEvidenceRegistry,
  note: (failure: string) => void,
): CommercialMessageStrategy | null {
  const reference = strategy?.context_reference

  if (!strategy || !reference?.text) {
    return strategy
  }

  const customerSources = registry.sources.filter(
    (source) =>
      source.source_type === 'customer_message' ||
      source.source_type === 'customer_audio_transcription',
  )

  if (
    customerSources.some(
      (source) =>
        source.source_id === reference.evidence_message_id ||
        (!reference.evidence_message_id &&
          source.comparable === comparableText(reference.text)),
    )
  ) {
    return strategy
  }

  const anchors = reference.anchors ?? []
  const replacement = [...customerSources]
    .sort((left, right) =>
      String(right.occurred_at ?? '').localeCompare(
        String(left.occurred_at ?? ''),
      ),
    )
    .map((source) => ({
      source,
      shared: anchors.filter((anchor) =>
        source.comparable.split(' ').includes(anchor),
      ),
    }))
    .find((candidate) => candidate.shared.length >= 2)

  note(
    replacement
      ? `context_reference_replaced: ${reference.evidence_message_id ?? '-'} → ${replacement.source.source_id ?? '-'}`
      : `context_reference_dropped: ${reference.evidence_message_id ?? '-'}`,
  )

  return {
    ...strategy,
    context_reference: replacement
      ? {
          ...reference,
          text: replacement.source.text,
          evidence_message_id:
            replacement.source.source_id ??
            reference.evidence_message_id,
          anchors: replacement.shared,
        }
      : null,
  }
}

export async function composeSellerMessage({
  workingSummary,
  currentInteraction = [],
  sellerIntent,
  method,
  reasoning = null,
  messageStrategy = null,
  roles = [],
  recipientName = null,
  provider,
  factRegistry = null,
}: {
  workingSummary: string | null
  currentInteraction?: readonly SellerMessageCurrentInteraction[]
  sellerIntent: string | null
  method: PublishedCommercialMethod
  reasoning?: SellerMessageCanonicalReasoning | null
  messageStrategy?: CommercialMessageStrategy | null
  roles?: readonly SellerMessageCommercialRole[]
  recipientName?: string | null
  provider: StatefulCopilotProvider
  // Evidências com proveniência (ledger com integridade de observação +
  // configuração vigente da empresa). Sem ele, a interação recebida e a
  // referência da estratégia são as fontes primárias.
  factRegistry?: FactEvidenceRegistry | null
}): Promise<SellerMessageGenerationResult> {
  // Opt-out do cliente vale antes de qualquer outra checagem: nenhuma
  // intenção do vendedor autoriza nova mensagem depois de "não quero mais
  // receber contato".
  if (messageStrategy?.outbound_allowed === false) {
    return {
      status: 'no_message',
      message: null,
      error: null,
      reason:
        'O cliente pediu para não receber mais contato; nenhuma mensagem deve ser enviada.',
    }
  }

  const summary = clean(workingSummary)
  const intent = clean(sellerIntent)
  const canonicalRecipientName =
    clean(recipientName) || null
  const interaction =
    normalizeCurrentInteraction(currentInteraction)

  if (!summary) {
    return {
      status: 'error',
      message: null,
      error:
        'Não há resumo suficiente para gerar a mensagem.',
      diagnostics: {
        stage: 'input',
        failures: ['missing_working_summary'],
      },
    }
  }

  if (!intent) {
    return {
      status: 'error',
      message: null,
      error:
        'Diga primeiro o que você quer fazer agora.',
      diagnostics: {
        stage: 'input',
        failures: ['missing_seller_intent'],
      },
    }
  }

  // Diagnóstico interno acumulado (nunca seller-facing).
  const failures: string[] = []

  const registry =
    factRegistry ??
    buildFactEvidenceRegistry({
      company_id: null,
      messages: [
        ...interaction.map((entry, index) => ({
          id: entry.message_id ?? `interaction-${index}`,
          direction: entry.direction,
          text: entry.text,
          occurred_at: entry.occurred_at,
        })),
        ...(messageStrategy?.context_reference?.text
          ? [{
              id:
                messageStrategy.context_reference
                  .evidence_message_id ??
                'context-reference',
              direction: 'incoming',
              text:
                messageStrategy.context_reference.text,
            }]
          : []),
      ],
      company_items:
        companyItemsFromKnowledgeReferences({
          company_id: null,
          references:
            reasoning?.company_knowledge_used ?? [],
        }),
      seller_instruction: intent,
    })

  const note = (
    failure: string | null | undefined,
  ) => {
    if (failure) {
      failures.push(failure)
    }
  }

  // A referência de contexto só vale se for uma fala REAL e visível do
  // cliente. Se a mensagem citada não é evidência válida (apagada ou fora
  // da conversa que o vendedor vê), usa-se a fala válida mais recente do
  // mesmo assunto; sem ela, não há referência.
  messageStrategy =
    groundStrategyReference(
      messageStrategy,
      registry,
      note,
    )

  const attempt = (
    correctionReason?: string | null,
  ) =>
    runAttempt({
      summary,
      interaction,
      intent,
      method,
      reasoning,
      messageStrategy,
      roles,
      recipientName:
        canonicalRecipientName,
      provider,
      correctionReason,
      registry,
    })

  const review = (
    candidateMessage: string,
  ) =>
    reviewCustomerFacingMessage({
      candidateMessage,
      summary,
      interaction,
      intent,
      reasoning,
      messageStrategy,
      roles,
      recipientName:
        canonicalRecipientName,
      provider,
      registry,
    })

  const fail = (
    stage: SellerMessageGenerationDiagnostics['stage'],
    sellerFacing: string = SELLER_FACING_UNSAFE_MESSAGE,
  ): SellerMessageGenerationResult => ({
    status: 'error',
    message: null,
    error: sellerFacing,
    diagnostics: {
      stage,
      failures: [...failures],
      excluded_evidence: [...registry.excluded],
    },
  })

  const advisories =
    sellerInstructionAdvisories(
      intent,
      registry,
    )

  const ready = (
    message: string,
    source: SellerMessageGenerationDiagnostics['source'],
  ): SellerMessageGenerationResult => ({
    status: 'ready',
    message,
    error: null,
    diagnostics: {
      source,
      failures: [...failures],
      fact_trace:
        factTraceEntries(
          groundClaims(message, registry),
        ),
      blocked_claims:
        factTraceEntries(
          registry.blocked.filter(
            (claim, index, all) =>
              all.findIndex((other) => other.claim_id === claim.claim_id) === index,
          ),
        ),
      excluded_evidence: [...registry.excluded],
    },
    ...(advisories.length > 0
      ? { advisories }
      : {}),
  })

  // Recuperação semântica: quando o redator não converge, a própria
  // estratégia canônica monta a copy (retomada ancorada na fala real do
  // cliente). Ela passa pela MESMA validação + critic; se não passar, não
  // existe copy segura.
  let groundedUsed = false

  const strategyGrounded = (): string | null => {
    if (groundedUsed) {
      return null
    }

    groundedUsed = true

    const grounded =
      composeStrategyGroundedMessage({
        strategy:
          messageStrategy,
        recipient_name:
          canonicalRecipientName,
      })

    if (!grounded) {
      note('strategy_grounded_unavailable')
      return null
    }

    const checked =
      checkCandidateMessage({
        message:
          grounded.message,
        summary,
        interaction,
        intent,
        reasoning,
        messageStrategy,
        recipientName:
          canonicalRecipientName,
        registry,
      })

    if (checked.failure) {
      note(`strategy_grounded_rejected: ${checked.failure}`)
      return null
    }

    return checked.message
  }

  // 1) Redação pelo modelo: até 3 tentativas (livre, corrigida, estrita).
  const first = await attempt()

  let candidate = first.message
  let source: SellerMessageGenerationDiagnostics['source'] =
    'provider'

  note(first.failure)

  if (!candidate) {
    const corrected =
      await attempt(
        first.failure ||
          'A primeira saída não passou pela validação.',
      )

    candidate = corrected.message
    note(corrected.failure)
  }

  if (
    !candidate &&
    messageStrategy
      ?.required_action_type
  ) {
    const lastFailure =
      failures[failures.length - 1] ?? null

    const repaired =
      await attempt(
        // O reparo estrito precisa carregar o motivo CONCRETO da falha
        // anterior; sem ele o redator repetia o mesmo defeito (ex.: o
        // "fico à disposição" que derrubou a tentativa anterior).
        [
          lastFailure,
          strictStrategyCorrection(
            messageStrategy,
          ),
        ]
          .filter(
            (item): item is string =>
              Boolean(item),
          )
          .join(' ') ||
          'A saída anterior não executou a estratégia canônica.',
      )

    candidate = repaired.message
    note(repaired.failure)
  }

  // 2) O modelo não convergiu: copy da estratégia canônica.
  if (!candidate) {
    candidate = strategyGrounded()
    source = 'strategy_grounded'
  }

  if (!candidate) {
    return fail('generation')
  }

  // 3) Gate customer-facing (nunca pulado).
  const reviewed =
    await review(candidate)

  if (reviewed.message) {
    return ready(reviewed.message, source)
  }

  note(reviewed.failure)

  // O reparo pós-review existe para corrigir uma REESCRITA inválida do
  // reviewer, não para mascarar indisponibilidade do próprio gate.
  // Timeout, JSON malformado ou saída estruturada ausente encerram aqui:
  // regenerar uma mensagem já validada só adicionaria latência/custo sem
  // evidência de que a copy precisa ser alterada.
  if (
    reviewed.failure_kind !==
      'validation'
  ) {
    return fail(
      'customer_facing_review',
      SELLER_FACING_UNAVAILABLE_MESSAGE,
    )
  }

  // A copy da estratégia foi recusada pelo próprio gate: não há outra copy
  // segura a oferecer.
  if (source === 'strategy_grounded') {
    return fail('customer_facing_review')
  }

  const postReviewRepair =
    await attempt(
      [
        reviewed.failure ||
          'A revisão final invalidou a mensagem.',
        strictStrategyCorrection(
          messageStrategy,
        ),
        'A mensagem já chegou a esta etapa após passar pela geração e pelo critic inicial. Corrija somente o conflito apontado pela revisão e preserve a ação canônica.',
      ]
        .filter(
          (item): item is string =>
            Boolean(item),
        )
        .join(' '),
    )

  note(postReviewRepair.failure)

  if (postReviewRepair.message) {
    const secondReview =
      await review(
        postReviewRepair.message,
      )

    if (secondReview.message) {
      return ready(
        secondReview.message,
        'provider',
      )
    }

    note(secondReview.failure)

    if (
      secondReview.failure_kind !==
        'validation'
    ) {
      return fail(
        'post_review_repair',
        SELLER_FACING_UNAVAILABLE_MESSAGE,
      )
    }
  }

  // Última recuperação: a copy da estratégia, também pelo gate.
  const grounded =
    strategyGrounded()

  if (grounded) {
    const groundedReview =
      await review(grounded)

    if (groundedReview.message) {
      return ready(
        groundedReview.message,
        'strategy_grounded',
      )
    }

    note(groundedReview.failure)
  }

  return fail('post_review_repair')
}
