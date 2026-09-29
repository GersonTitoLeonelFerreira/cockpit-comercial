import type {
  CompanionDiagnosticInput,
  DiagnosticInputMessage,
} from './diagnostic-input'

export const SELLER_EXECUTION_TRACE_VERSION =
  'seller-execution-trace-v1' as const

export const SELLER_EXECUTION_ACTION_TYPES = [
  'rapport_opening',
  'discovery_question',
  'qualification_question',
  'clarification_question',
  'factual_response',
  'value_explanation',
  'product_presentation',
  'price_presentation',
  'objection_probe',
  'objection_response',
  'factual_proof',
  'commitment_request',
  'scheduling_open_question',
  'scheduling_guided_choice',
  'follow_up',
  'reengagement',
  'close_request',
  'confirmation',
  'stage_jump_unrelated_offer',
  'pressure_or_false_urgency',
  'unknown',
] as const

export type SellerExecutionActionType =
  (typeof SELLER_EXECUTION_ACTION_TYPES)[number]

export type SellerExecutionConfidence =
  'low' | 'medium' | 'high'

export type SellerExecutionLevel =
  'low' | 'medium' | 'high' | 'unknown'

export type SellerExecutionQuestionQuality =
  | 'guided_choice'
  | 'open'
  | 'closed'
  | 'none'
  | 'unknown'

export type SellerExecutionObservedOutcome =
  | 'customer_replied'
  | 'customer_rejected_options'
  | 'customer_accepted'
  | 'customer_silent_before_next_seller_action'
  | 'no_outcome_observed'

export type SellerExecutionCustomerIntentKind =
  | 'scheduling'
  | 'close'
  | 'payment_objection'
  | 'objection'
  | 'pricing'
  | 'product_interest'
  | 'third_party_interest'
  | 'general_interest'
  | 'deferral'
  | 'disengaged'
  | 'unknown'

export type SellerExecutionSignal =
  | 'seller_already_asked_open_question'
  | 'guided_choice_used'
  | 'sequence_break'
  | 'premature_product_offer'
  | 'duplicate_followup'
  | 'customer_intent_hot'
  | 'microcommitment_available'
  | 'seller_message_overloaded'
  | 'client_sparse_seller_rich'
  | 'late_discovery_after_close_intent'
  | 'generic_response_candidate'
  | 'customer_rejected_options'
  | 'request_not_addressed'

export type SellerExecutionCustomerIntent = {
  kind: SellerExecutionCustomerIntentKind
  confidence: SellerExecutionConfidence
  evidence_message_id: string
}

// Referência temporal explícita dita pelo cliente ("hoje", "amanhã",
// "sexta"). É evidência textual, não cálculo: o módulo temporal decide se
// essa janela já passou em relação ao instante avaliado.
export type SellerExecutionTimeReference =
  | 'same_day'
  | 'next_day'
  | 'this_week'
  | null

export type SellerExecutionCustomerSignal = {
  message_id: string
  occurred_at: string
  kind: SellerExecutionCustomerIntentKind
  confidence: SellerExecutionConfidence
  time_reference: SellerExecutionTimeReference
  // Marcadores textuais de entusiasmo realmente escritos pelo cliente.
  // Só eles autorizam recuperação emocional numa retomada — nunca um
  // interesse neutro ("quero saber sobre X").
  expressed_enthusiasm: boolean
}

// Turno do vendedor: sequência contígua de mensagens humanas outgoing sem
// resposta do cliente entre elas e com intervalo curto (rajada). Uma oferta
// enviada em várias bolhas (texto, planos, links, CTA) é UMA ação comercial;
// julgar só a última bolha fazia elogio e crítica apontarem para IDs
// diferentes da mesma ação.
export type SellerExecutionTurn = {
  turn_id: string
  message_ids: string[]
  started_at: string
  ended_at: string
  action_types: SellerExecutionActionType[]
  dominant_action_type: SellerExecutionActionType
  // Mensagens do cliente que este turno respondeu (rajada do cliente
  // imediatamente anterior). Vazio quando o turno é follow-up sem resposta
  // do cliente entre turnos.
  responds_to_customer_message_ids: string[]
  // Intenção mais forte presente na rajada do cliente respondida.
  pending_customer_intent:
    SellerExecutionCustomerIntent | null
  // null = não havia pedido comercial pendente para endereçar.
  addresses_customer_request: boolean | null
  // Latência desde a primeira mensagem ainda não respondida do cliente.
  response_latency_ms: number | null
  negative_signals: SellerExecutionSignal[]
  breaks_active_customer_goal: boolean
  observed_outcome:
    SellerExecutionObservedOutcome
}

export type SellerExecutionEvent = {
  message_id: string
  occurred_at: string
  action_type: SellerExecutionActionType
  commercial_objective: string
  method_stage: null
  target_commitment: string | null
  content_summary: string
  customer_intent_before_action:
    SellerExecutionCustomerIntent | null

  quality: {
    relevance: SellerExecutionLevel
    specificity: SellerExecutionLevel
    question_quality:
      SellerExecutionQuestionQuality
    persuasion_quality: 'unknown'
    friction: SellerExecutionLevel
    pressure_risk: SellerExecutionLevel
  }

  sequence: {
    follows_previous_context:
      boolean | null
    repeats_prior_action: boolean
    advances_stage: boolean
    skips_required_step: null
    breaks_active_customer_goal: boolean
  }

  observed_outcome:
    SellerExecutionObservedOutcome

  signals: SellerExecutionSignal[]
  evidence_message_ids: string[]

  turn_id: string
  timing: {
    // Primeira mensagem do cliente ainda sem resposta quando esta ação
    // aconteceu (null quando a ação não responde a nenhuma fala nova).
    responds_to_customer_message_id: string | null
    response_latency_ms: number | null
    previous_message_gap_ms: number | null
  }
}

export type SellerExecutionTrace = {
  contract_version:
    typeof SELLER_EXECUTION_TRACE_VERSION

  summary: {
    seller_message_count: number
    classified_message_count: number
    client_context_confidence:
      SellerExecutionConfidence
    seller_execution_confidence:
      SellerExecutionConfidence
    active_customer_intent:
      SellerExecutionCustomerIntent | null
    sequence_break_detected: boolean
    evidence_message_ids: string[]
  }

  events: SellerExecutionEvent[]
  turns: SellerExecutionTurn[]
  customer_signals: SellerExecutionCustomerSignal[]
}

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function messageText(
  message: DiagnosticInputMessage,
): string {
  return (
    message.text_content ??
    message.audio_transcription ??
    ''
  ).trim()
}

function wordCount(
  value: string,
): number {
  const normalized =
    value.trim()

  return normalized
    ? normalized.split(/\s+/).length
    : 0
}

function unique<T>(
  values: T[],
): T[] {
  return Array.from(
    new Set(values),
  )
}

function includesAny(
  value: string,
  patterns: string[],
): boolean {
  return patterns.some(
    pattern =>
      value.includes(pattern),
  )
}

// Encerramento explícito pelo cliente: resolveu, comprou/contratou em outro
// lugar ou disse que não tem mais interesse. Verificado ANTES de fechamento
// porque "já fiz matrícula em outra" ou "fechei com outra empresa" contêm
// vocabulário de fechamento mas significam o oposto para esta venda.
const DISENGAGEMENT_PATTERNS: readonly RegExp[] = [
  /\b(ja )?(fechei|comprei|contratei|assinei|matriculei|escolhi|optei)\b.{0,30}\b(outr[oa]s?|outro lugar|la mesmo|concorrente)\b/,
  /\bfiz (a )?(matricula|inscricao|compra|contratacao)\b.{0,30}\boutr[oa]s?\b/,
  /\b(ja )?(resolvi|consegui resolver|encontrei|achei)\b.{0,20}\b(outr[oa]s?|por conta|sozinh[oa]|em outro lugar)\b/,
  /\bnao (tenho|tenho mais) interesse\b/,
  /\bnao (preciso|quero) mais\b/,
  /\bnao faz mais sentido\b/,
  /\bpode (cancelar|me tirar|tirar meu)\b/,
  /\bdesisti\b(?!\s+de\s+(cancel|desist))/,
  /\bvou ficar com (a )?outr[oa]\b/,
]

// Adiamento explícito com horizonte ("mês que vem", "te aviso", "vou
// pensar"). Não é objeção nem encerramento: muda a expectativa de tempo de
// resposta e, portanto, a leitura de silêncio.
const DEFERRAL_PATTERNS: readonly RegExp[] = [
  /\bvou pensar\b/,
  /\b(te|lhe) (aviso|falo|retorno|chamo)\b/,
  /\b(depois|mais tarde) (te|eu) (aviso|falo|retorno|chamo|vejo)\b/,
  /\b(mes|semana) que vem\b/,
  /\bproxim[oa] (mes|semana)\b/,
  /\bdepois d[ao]s? (ferias|festas|pagamento|viagem)\b/,
  /\bmais (pra|para) frente\b/,
  /\b(fim|final) do mes\b/,
]

function matchesAny(
  value: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some(
    pattern =>
      pattern.test(value),
  )
}

export function detectCustomerTimeReference(
  text: string,
): SellerExecutionTimeReference {
  const normalized =
    normalizeText(text)

  if (
    /\b(hoje|hj|agora|ainda hoje|daqui a pouco|nesta tarde|nesta manha|essa tarde|essa noite|hoje a noite)\b/.test(
      normalized,
    )
  ) {
    return 'same_day'
  }

  if (
    /\b(amanha|amanh)\b/.test(
      normalized,
    )
  ) {
    return 'next_day'
  }

  if (
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|essa semana|esta semana|fim de semana|final de semana)\b/.test(
      normalized,
    )
  ) {
    return 'this_week'
  }

  return null
}

function expressesEnthusiasm(
  text: string,
): boolean {
  const normalized =
    normalizeText(text)

  return (
    /\b(amei|adorei|adoraria|animad[oa]|empolgad[oa]|ansios[oa]|quero muito|to doid[oa]|estou doid[oa]|nao vejo a hora|perfeito demais|maravilh)\w*/.test(
      normalized,
    ) ||
    /!{2,}/.test(text)
  )
}

export function inferCustomerIntentFromText(
  text: string,
  messageId: string,
): SellerExecutionCustomerIntent {
  return inferCustomerIntent({
    id: messageId,
    text_content: text,
    audio_transcription: null,
  } as DiagnosticInputMessage)
}

function inferCustomerIntent(
  message: DiagnosticInputMessage,
): SellerExecutionCustomerIntent {
  const text =
    normalizeText(
      messageText(message),
    )

  if (
    matchesAny(
      text,
      DISENGAGEMENT_PATTERNS,
    )
  ) {
    return {
      kind: 'disengaged',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'quero fechar',
        'vou fechar',
        'quero contratar',
        'vamos contratar',
        'quero comprar',
        'quero assinar',
        'quero aderir',
        'quero avancar',
        'quero avançar',
        'como faco o pagamento',
        'como faço o pagamento',
        'link de pagamento',
        'matricula',
        'matrícula',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'close',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'experimental',
        'agendar',
        'agendamento',
        'marcar',
        'horario',
        'horário',
        'reuniao',
        'reunião',
        'visita',
        'demonstracao',
        'demonstração',
        'consulta',
        'apresentacao',
        'apresentação',
        'que horas',
        'quando posso ir',
        'quando consigo ir',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'scheduling',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  // Pedido com referência de tempo explícita ("consigo trazer amanhã
  // cedo?", "dá pra ir hoje?") é pedido de agenda em qualquer vertical,
  // mesmo sem as palavras "agendar/marcar".
  if (
    messageText(message).includes('?') &&
    detectCustomerTimeReference(
      text,
    ) !== null &&
    /\b(consigo|posso|podemos|pode ser|da pra|da para|tem como|daria|seria possivel|vou poder|voces conseguem|conseguem|atendem)\b/.test(
      text,
    )
  ) {
    return {
      kind: 'scheduling',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    matchesAny(
      text,
      DEFERRAL_PATTERNS,
    )
  ) {
    return {
      kind: 'deferral',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'sem limite',
        'sem cartao',
        'sem cartão',
        'nao tenho cartao',
        'não tenho cartão',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'payment_objection',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'muito caro',
        'caro',
        'nao consigo',
        'não consigo',
        'nao serve',
        'não serve',
        'nao quero',
        'não quero',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'objection',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'preco',
        'preço',
        'valor',
        'quanto custa',
        'quanto e',
        'quanto fica',
        'quanto sai',
        'qual o investimento',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'pricing',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    /\b(?:minha|meu)\s+(?:irma|irmã|irmao|irmão|esposa|marido|amiga|amigo)\b/.test(
      text,
    ) &&
    includesAny(
      text,
      [
        'quer',
        'interesse',
        'comecar',
        'começar',
        'contratar',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'third_party_interest',
      confidence: 'high',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'plano',
        'produto',
        'servico',
        'serviço',
        'solucao',
        'solução',
        'oferta',
        'proposta',
        'pacote',
        'licenca',
        'licença',
        'assinatura',
        'consultoria',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'product_interest',
      confidence: 'medium',
      evidence_message_id:
        message.id,
    }
  }

  if (
    includesAny(
      text,
      [
        'interesse',
        'como funciona',
        'queria saber',
        'quero saber',
      ].map(normalizeText),
    )
  ) {
    return {
      kind: 'general_interest',
      confidence: 'low',
      evidence_message_id:
        message.id,
    }
  }

  return {
    kind: 'unknown',
    confidence: 'low',
    evidence_message_id:
      message.id,
  }
}

function hasQuestion(
  value: string,
): boolean {
  return value.includes('?')
}

function containsSchedulingLanguage(
  value: string,
): boolean {
  return includesAny(
    value,
    [
      'experimental',
      'agendar',
      'agendamento',
      'marcar',
      'horario',
      'horário',
      'reuniao',
      'reunião',
      'visita',
      'demonstracao',
      'demonstração',
      'consulta',
      'apresentacao',
      'apresentação',
      'amanha',
      'amanhã',
      'terça',
      'terca',
      'quarta',
      'quinta',
      'sexta',
      'sabado',
      'sábado',
      'domingo',
    ].map(normalizeText),
  )
}

function containsReengagementLanguage(
  value: string,
): boolean {
  return includesAny(
    value,
    [
      'ainda faz sentido',
      'ainda quer',
      'ainda tem interesse',
      'ainda têm interesse',
      'segue interessado',
      'segue interessada',
      'continua interessado',
      'continua interessada',
      'quer seguir',
      'podemos retomar',
      'retomar',
      'retomamos',
      'retomarmos',
      'continuar',
      'continuamos',
      'seguimos',
      'ficou em aberto',
      'deixamos em aberto',
      // Retomada por mudança de estado / recuperação de contexto: a
      // pergunta se ancora no que aconteceu antes e pergunta pelo estado
      // atual, em vez de repetir o pedido operacional.
      'como ficou',
      'chegou a',
      'desde entao',
      'desde a ultima',
      'da ultima vez',
      'quando conversamos',
      'quando falamos',
      'ficou pendente',
      'ficou parado',
      'voltar a falar',
      'retomando',
      'passando para saber',
      'passando pra saber',
      'nesse periodo',
      'nesse meio tempo',
      'faz um tempo',
      'faz algum tempo',
      'ainda pretende',
      'ainda esta pensando',
      'ainda pensa em',
      'ainda e prioridade',
      'continua sendo prioridade',
      'algo mudou',
      'mudou alguma coisa',
      'conseguiu resolver',
      'ainda esta avaliando',
      'segue avaliando',
      'continua avaliando',
    ].map(normalizeText),
  )
}

const GREETING_TOKENS =
  new Set([
    'oi',
    'oii',
    'oie',
    'ola',
    'opa',
    'bom',
    'boa',
    'dia',
    'tarde',
    'noite',
    'tudo',
    'bem',
    'e',
    'ai',
    'como',
    'vai',
    'voce',
    'vc',
    'esta',
    'td',
    'blz',
    'beleza',
    'prazer',
    'hey',
    'hello',
    'tranquilo',
  ])

// Saudação pura ("Olá", "Oi, Lorena!", "Bom dia, tudo bem?"). Não é
// resposta factual nem pivô de objetivo: é abertura/rapport. Quando é tudo
// que o vendedor responde a um pedido comercial, o problema é não endereçar
// o pedido — não uma "quebra de sequência".
function isPureGreeting(
  value: string,
): boolean {
  const tokens =
    normalizeText(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

  if (
    tokens.length === 0 ||
    tokens.length > 7 ||
    !GREETING_TOKENS.has(
      tokens[0],
    )
  ) {
    return false
  }

  const nonGreeting =
    tokens.filter(
      token =>
        !GREETING_TOKENS.has(
          token,
        ),
    )

  // Até dois tokens livres cobrem o nome do cliente ("Olá, Lorena").
  return nonGreeting.length <= 2
}

function isShortAcknowledgement(
  value: string,
): boolean {
  const normalized =
    normalizeText(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  if (
    !normalized ||
    wordCount(normalized) > 8
  ) {
    return false
  }

  return /^(que (otimo|bom|legal|maravilha|show)|otimo|otima|show|beleza|maravilha|legal|certo|ok|okay|excelente|top|boa|perfeito|perfeita|entendi|entendido|claro|combinado|sem problemas?)\b/.test(
    normalized,
  )
}

function containsChoiceStructure(
  value: string,
): boolean {
  return (
    /\bou\b/.test(value) &&
    (
      /\b\d{1,2}(?::|h)\d{0,2}\b/.test(
        value,
      ) ||
      includesAny(
        value,
        [
          'manha',
          'manhã',
          'tarde',
          'noite',
          'terça',
          'terca',
          'quarta',
          'quinta',
          'sexta',
          'sabado',
          'sábado',
          'domingo',
        ].map(normalizeText),
      )
    )
  )
}

function classifySellerAction(
  text: string,
): SellerExecutionActionType {
  const normalized =
    normalizeText(text)

  if (!normalized) {
    return 'unknown'
  }

  const question =
    hasQuestion(text)

  if (
    isPureGreeting(
      text,
    )
  ) {
    return 'rapport_opening'
  }

  if (
    containsReengagementLanguage(
      normalized,
    )
  ) {
    return 'reengagement'
  }

  if (
    question &&
    containsSchedulingLanguage(
      normalized,
    ) &&
    containsChoiceStructure(
      normalized,
    )
  ) {
    return 'scheduling_guided_choice'
  }

  if (
    question &&
    containsSchedulingLanguage(
      normalized,
    )
  ) {
    return 'scheduling_open_question'
  }

  if (
    question &&
    includesAny(
      normalized,
      [
        'bloqueio',
        'limite',
        'cartao',
        'cartão',
        'objecao',
        'objeção',
        'impede',
        'dificulta',
        'o que pesa',
        'pesa mais',
        'te preocupa',
        'preocupacao',
        'preocupação',
        'o que falta para',
        'o que faltaria',
      ].map(normalizeText),
    )
  ) {
    return 'objection_probe'
  }

  if (
    question &&
    includesAny(
      normalized,
      [
        'principal objetivo',
        'principal desafio',
        'principal problema',
        'principal necessidade',
        'objetivo',
        'desafio que',
        'problema que',
        'necessidade que',
        'quantas vezes',
        'o que voce busca',
        'o que você busca',
        'o que procura',
        'qual sua prioridade',
        'qual é sua prioridade',
        'qual problema',
        'qual desafio',
        'qual necessidade',
        'o que precisa',
        'como faz hoje',
        'como voce faz hoje',
        'como você faz hoje',
      ].map(normalizeText),
    )
  ) {
    return 'discovery_question'
  }

  if (
    includesAny(
      normalized,
      [
        'ultima chance',
        'última chance',
        'so hoje',
        'só hoje',
        'agora ou perde',
      ].map(normalizeText),
    )
  ) {
    return 'pressure_or_false_urgency'
  }

  if (
    /r\$\s*\d/i.test(text) ||
    includesAny(
      normalized,
      [
        'preco',
        'preço',
        'valor',
        'custa',
        'investimento',
        'mensalidade',
        'orcamento',
        'orçamento',
        'desconto',
        'promocao',
        'promoção',
        'condicao especial',
        'condição especial',
      ].map(normalizeText),
    )
  ) {
    return 'price_presentation'
  }

  if (
    includesAny(
      normalized,
      [
        'plano',
        'produto',
        'servico',
        'serviço',
        'solucao',
        'solução',
        'oferta',
        'proposta',
        'pacote',
        'licenca',
        'licença',
        'assinatura',
        'consultoria',
        'opcoes',
        'opções',
        'beneficios',
        'benefícios',
      ].map(normalizeText),
    )
  ) {
    return 'product_presentation'
  }

  if (
    question &&
    includesAny(
      normalized,
      [
        'fechar',
        'pagamento',
        'matricula',
        'matrícula',
        'contratar',
        'comprar',
        'assinar',
        'aderir',
        'aprovar',
        'avancar',
        'avançar',
      ].map(normalizeText),
    )
  ) {
    return 'close_request'
  }

  if (
    question
  ) {
    return 'clarification_question'
  }

  if (
    (
      includesAny(
        normalized,
        [
          'perfeito',
          'entendi',
          'claro',
          'combinado',
        ].map(normalizeText),
      ) &&
      wordCount(text) <= 14
    ) ||
    isShortAcknowledgement(
      text,
    )
  ) {
    return 'confirmation'
  }

  return 'factual_response'
}

export function classifySellerActionText(
  text: string,
): SellerExecutionActionType {
  return classifySellerAction(
    text,
  )
}

function objectiveForAction(
  action:
    SellerExecutionActionType,
): string {
  switch (action) {
    case 'scheduling_open_question':
    case 'scheduling_guided_choice':
      return 'schedule'
    case 'discovery_question':
    case 'qualification_question':
      return 'discover'
    case 'clarification_question':
      return 'clarify'
    case 'price_presentation':
      return 'present_price'
    case 'product_presentation':
    case 'value_explanation':
      return 'present_solution'
    case 'objection_probe':
      return 'diagnose_objection'
    case 'objection_response':
      return 'resolve_objection'
    case 'commitment_request':
      return 'advance_commitment'
    case 'close_request':
      return 'close'
    case 'follow_up':
      return 'follow_up'
    case 'reengagement':
      return 'reengage'
    case 'confirmation':
      return 'confirm'
    case 'pressure_or_false_urgency':
      return 'pressure'
    default:
      return 'inform'
  }
}

function targetCommitmentForAction(
  action:
    SellerExecutionActionType,
): string | null {
  switch (action) {
    case 'scheduling_open_question':
    case 'scheduling_guided_choice':
      return 'schedule'
    case 'close_request':
      return 'purchase_decision'
    case 'objection_probe':
    case 'discovery_question':
    case 'clarification_question':
    case 'reengagement':
      return 'customer_answer'
    case 'commitment_request':
      return 'next_step'
    default:
      return null
  }
}

function questionQuality(
  action:
    SellerExecutionActionType,
  text: string,
): SellerExecutionQuestionQuality {
  if (
    action ===
      'scheduling_guided_choice'
  ) {
    return 'guided_choice'
  }

  if (
    action ===
      'scheduling_open_question'
  ) {
    return 'open'
  }

  if (!hasQuestion(text)) {
    return 'none'
  }

  if (
    /\b(?:sim|nao|não)\b/.test(
      normalizeText(text),
    )
  ) {
    return 'closed'
  }

  return 'open'
}

function specificityLevel(
  text: string,
): SellerExecutionLevel {
  const normalized =
    normalizeText(text)

  if (
    /r\$\s*\d/i.test(text) ||
    /\b\d{1,2}(?::|h)\d{0,2}\b/.test(
      normalized,
    ) ||
    containsChoiceStructure(
      normalized,
    )
  ) {
    return 'high'
  }

  if (wordCount(text) >= 10) {
    return 'medium'
  }

  return 'low'
}

function frictionLevel({
  action,
  text,
}: {
  action:
    SellerExecutionActionType
  text: string
}): SellerExecutionLevel {
  const words =
    wordCount(text)

  const questions =
    (text.match(/\?/g) ?? [])
      .length

  if (
    action ===
      'scheduling_open_question' ||
    words >= 55 ||
    questions >= 3
  ) {
    return 'high'
  }

  if (
    action ===
      'scheduling_guided_choice'
  ) {
    return 'low'
  }

  if (
    words >= 28 ||
    questions === 2
  ) {
    return 'medium'
  }

  return 'low'
}

function pressureRisk(
  text: string,
): SellerExecutionLevel {
  const normalized =
    normalizeText(text)

  if (
    includesAny(
      normalized,
      [
        'ultima chance',
        'última chance',
        'so hoje',
        'só hoje',
        'agora ou perde',
      ].map(normalizeText),
    )
  ) {
    return 'high'
  }

  if (
    includesAny(
      normalized,
      [
        'urgente',
        'corre',
        'nao perde',
        'não perde',
      ].map(normalizeText),
    )
  ) {
    return 'medium'
  }

  return 'low'
}

function actionFollowsIntent({
  action,
  intent,
}: {
  action:
    SellerExecutionActionType
  intent:
    SellerExecutionCustomerIntent | null
}): boolean | null {
  if (
    !intent ||
    intent.kind === 'unknown'
  ) {
    return null
  }

  if (
    action === 'reengagement'
  ) {
    return true
  }

  const allowed:
    Record<
      SellerExecutionCustomerIntentKind,
      SellerExecutionActionType[]
    > = {
      scheduling: [
        'scheduling_open_question',
        'scheduling_guided_choice',
        'clarification_question',
        'commitment_request',
        'confirmation',
      ],
      close: [
        'close_request',
        'factual_response',
        'price_presentation',
        'product_presentation',
        'objection_probe',
        'objection_response',
        'confirmation',
      ],
      payment_objection: [
        'objection_probe',
        'objection_response',
        'clarification_question',
        'factual_response',
        'confirmation',
      ],
      objection: [
        'objection_probe',
        'objection_response',
        'clarification_question',
        'factual_response',
        'confirmation',
      ],
      pricing: [
        'price_presentation',
        'factual_response',
        'clarification_question',
      ],
      product_interest: [
        'product_presentation',
        'value_explanation',
        'discovery_question',
        'clarification_question',
        'factual_response',
      ],
      third_party_interest: [
        'clarification_question',
        'factual_response',
        'commitment_request',
        'scheduling_open_question',
        'scheduling_guided_choice',
      ],
      general_interest: [
        'discovery_question',
        'clarification_question',
        'factual_response',
      ],
      deferral: [
        'confirmation',
        'factual_response',
        'clarification_question',
        'objection_probe',
        'follow_up',
        'reengagement',
      ],
      disengaged: [
        'confirmation',
        'factual_response',
        'clarification_question',
        'reengagement',
      ],
      unknown: [],
    }

  return allowed[intent.kind]
    .includes(action)
}

function advancesStage(
  action:
    SellerExecutionActionType,
): boolean {
  return [
    'product_presentation',
    'price_presentation',
    'commitment_request',
    'scheduling_open_question',
    'scheduling_guided_choice',
    'close_request',
  ].includes(action)
}

function isGenericResponseCandidate({
  action,
  text,
}: {
  action:
    SellerExecutionActionType
  text: string
}): boolean {
  if (
    ![
      'confirmation',
      'factual_response',
    ].includes(action)
  ) {
    return false
  }

  const normalized =
    normalizeText(text)

  if (
    wordCount(text) > 14
  ) {
    return false
  }

  return includesAny(
    normalized,
    [
      'claro',
      'podemos verificar',
      'vou verificar',
      'te ajudo',
      'posso ajudar',
      'sem problema',
    ].map(normalizeText),
  )
}

function outcomeAfterSellerMessage({
  messages,
  sellerIndex,
}: {
  messages: DiagnosticInputMessage[]
  sellerIndex: number
}): {
  outcome:
    SellerExecutionObservedOutcome
  evidence_message_id: string | null
} {
  for (
    let index =
      sellerIndex + 1;
    index < messages.length;
    index += 1
  ) {
    const message =
      messages[index]

    if (
      message.direction ===
        'outgoing' &&
      message.author_kind ===
        'human_agent'
    ) {
      return {
        outcome:
          'customer_silent_before_next_seller_action',
        evidence_message_id:
          message.id,
      }
    }

    if (
      message.direction !==
        'incoming' ||
      message.author_kind !==
        'customer'
    ) {
      continue
    }

    const normalized =
      normalizeText(
        messageText(message),
      )

    if (
      includesAny(
        normalized,
        [
          'nenhum',
          'nao consigo',
          'não consigo',
          'nao serve',
          'não serve',
          'nao da',
          'não dá',
        ].map(normalizeText),
      )
    ) {
      return {
        outcome:
          'customer_rejected_options',
        evidence_message_id:
          message.id,
      }
    }

    if (
      includesAny(
        normalized,
        [
          'pode ser',
          'fechado',
          'combinado',
          'esse serve',
          'quero esse',
        ].map(normalizeText),
      )
    ) {
      return {
        outcome:
          'customer_accepted',
        evidence_message_id:
          message.id,
      }
    }

    return {
      outcome:
        'customer_replied',
      evidence_message_id:
        message.id,
    }
  }

  return {
    outcome:
      'no_outcome_observed',
    evidence_message_id:
      null,
  }
}

function orderedMessages(
  input: CompanionDiagnosticInput,
): DiagnosticInputMessage[] {
  return [
    ...input.conversation.messages,
  ].sort(
    (left, right) =>
      left.sequence -
        right.sequence ||
      left.occurred_at.localeCompare(
        right.occurred_at,
      ) ||
      left.id.localeCompare(
        right.id,
      ),
  )
}

// Intervalo máximo entre bolhas do vendedor para que ainda sejam a mesma
// ação (rajada). Ofertas em várias mensagens costumam sair em segundos ou
// poucos minutos; um novo envio depois disso é um novo turno/follow-up.
export const SELLER_TURN_BURST_GAP_MS =
  10 * 60 * 1000

function timestampOf(
  message: Pick<
    DiagnosticInputMessage,
    'occurred_at'
  >,
): number | null {
  const parsed =
    Date.parse(
      message.occurred_at,
    )

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function comparableTokens(
  value: string,
): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      token =>
        token.length >= 3,
    )
}

function nearlySameText(
  left: string,
  right: string,
): boolean {
  const leftTokens =
    comparableTokens(left)

  const rightTokens =
    comparableTokens(right)

  if (
    leftTokens.length === 0 ||
    rightTokens.length === 0
  ) {
    return (
      normalizeText(left) ===
      normalizeText(right)
    )
  }

  const rightSet =
    new Set(rightTokens)

  const shared =
    leftTokens.filter(
      token =>
        rightSet.has(token),
    ).length

  return (
    shared /
      Math.max(
        leftTokens.length,
        rightTokens.length,
      ) >=
    0.8
  )
}

const DOMINANT_ACTION_PRIORITY:
  readonly SellerExecutionActionType[] = [
    'close_request',
    'price_presentation',
    'product_presentation',
    'stage_jump_unrelated_offer',
    'pressure_or_false_urgency',
    'scheduling_guided_choice',
    'scheduling_open_question',
    'objection_probe',
    'objection_response',
    'discovery_question',
    'qualification_question',
    'reengagement',
    'follow_up',
    'commitment_request',
    'value_explanation',
    'factual_proof',
    'clarification_question',
    'factual_response',
    'confirmation',
    'rapport_opening',
    'unknown',
  ]

const CONFIDENCE_RANK:
  Record<
    SellerExecutionConfidence,
    number
  > = {
    high: 3,
    medium: 2,
    low: 1,
  }

function strongestIntent(
  intents:
    readonly SellerExecutionCustomerIntent[],
): SellerExecutionCustomerIntent | null {
  return [...intents]
    .filter(
      intent =>
        intent.kind !== 'unknown',
    )
    .sort(
      (left, right) =>
        CONFIDENCE_RANK[
          right.confidence
        ] -
        CONFIDENCE_RANK[
          left.confidence
        ],
    )[0] ?? null
}

const TURN_NEGATIVE_SIGNALS:
  readonly SellerExecutionSignal[] = [
    'sequence_break',
    'premature_product_offer',
    'duplicate_followup',
    'late_discovery_after_close_intent',
  ]

function buildSellerTurns({
  events,
  drafts,
}: {
  events: SellerExecutionEvent[]
  drafts: Array<{
    event_indexes: number[]
    responds_to: DiagnosticInputMessage[]
    pending_intents: SellerExecutionCustomerIntent[]
  }>
}): SellerExecutionTurn[] {
  return drafts
    .filter(
      draft =>
        draft.event_indexes.length > 0,
    )
    .map((draft, index) => {
      const turnEvents =
        draft.event_indexes.map(
          eventIndex =>
            events[eventIndex],
        )

      const actionTypes =
        unique(
          turnEvents.map(
            event =>
              event.action_type,
          ),
        )

      const dominant =
        DOMINANT_ACTION_PRIORITY.find(
          action =>
            actionTypes.includes(
              action,
            ),
        ) ?? 'unknown'

      const pendingIntent =
        strongestIntent(
          draft.pending_intents,
        )

      // Um turno endereça o pedido quando pelo menos uma ação dele segue a
      // intenção pendente com conteúdo (não só saudação/confirmação).
      const addressesRequest =
        !pendingIntent ||
        pendingIntent.kind ===
          'disengaged'
          ? null
          : turnEvents.some(
              event =>
                event.sequence
                  .follows_previous_context ===
                  true &&
                event.action_type !==
                  'rapport_opening' &&
                event.action_type !==
                  'confirmation',
            )

      const negativeSignals =
        unique([
          ...turnEvents.flatMap(
            event =>
              event.signals.filter(
                signal =>
                  TURN_NEGATIVE_SIGNALS.includes(
                    signal,
                  ),
              ),
          ),
          ...(
            addressesRequest === false &&
            pendingIntent &&
            pendingIntent.confidence !==
              'low'
              ? [
                  'request_not_addressed' as const,
                ]
              : []
          ),
        ])

      if (
        negativeSignals.includes(
          'request_not_addressed',
        )
      ) {
        const lastEvent =
          turnEvents[
            turnEvents.length - 1
          ]

        if (
          !lastEvent.signals.includes(
            'request_not_addressed',
          )
        ) {
          lastEvent.signals.push(
            'request_not_addressed',
          )
        }
      }

      const firstEvent =
        turnEvents[0]

      const lastEvent =
        turnEvents[
          turnEvents.length - 1
        ]

      return {
        turn_id:
          `turn-${index + 1}`,
        message_ids:
          turnEvents.map(
            event =>
              event.message_id,
          ),
        started_at:
          firstEvent.occurred_at,
        ended_at:
          lastEvent.occurred_at,
        action_types:
          actionTypes,
        dominant_action_type:
          dominant,
        responds_to_customer_message_ids:
          draft.responds_to.map(
            message =>
              message.id,
          ),
        pending_customer_intent:
          pendingIntent,
        addresses_customer_request:
          addressesRequest,
        response_latency_ms:
          firstEvent.timing
            .response_latency_ms,
        negative_signals:
          negativeSignals,
        breaks_active_customer_goal:
          turnEvents.some(
            event =>
              event.sequence
                .breaks_active_customer_goal,
          ),
        observed_outcome:
          lastEvent.observed_outcome,
      }
    })
}

export function buildSellerExecutionTrace({
  diagnostic_input,
}: {
  diagnostic_input:
    CompanionDiagnosticInput
}): SellerExecutionTrace {
  const messages =
    orderedMessages(
      diagnostic_input,
    )

  let activeCustomerIntent:
    SellerExecutionCustomerIntent | null =
      null

  let lastSellerAction:
    SellerExecutionActionType | null =
      null

  let customerMessageSinceLastSeller =
    true

  let latestCustomerText = ''

  let lastSellerText = ''

  let lastSellerOccurredAt:
    number | null =
      null

  let previousMessageOccurredAt:
    number | null =
      null

  let pendingCustomerMessages:
    DiagnosticInputMessage[] = []

  let pendingCustomerIntents:
    SellerExecutionCustomerIntent[] = []

  let currentTurnIndex = -1

  const events:
    SellerExecutionEvent[] = []

  const customerSignals:
    SellerExecutionCustomerSignal[] = []

  const turnDrafts: Array<{
    event_indexes: number[]
    responds_to: DiagnosticInputMessage[]
    pending_intents: SellerExecutionCustomerIntent[]
  }> = []

  for (
    let index = 0;
    index < messages.length;
    index += 1
  ) {
    const message =
      messages[index]

    if (
      message.direction ===
        'incoming' &&
      message.author_kind ===
        'customer'
    ) {
      const inferredCustomerIntent =
        inferCustomerIntent(
          message,
        )

      if (
        inferredCustomerIntent.kind !==
          'unknown' ||
        !activeCustomerIntent
      ) {
        activeCustomerIntent =
          inferredCustomerIntent
      }

      latestCustomerText =
        messageText(message)

      const timeReference =
        detectCustomerTimeReference(
          latestCustomerText,
        )

      const enthusiasm =
        expressesEnthusiasm(
          latestCustomerText,
        )

      if (
        inferredCustomerIntent.kind !==
          'unknown' ||
        timeReference !== null ||
        enthusiasm
      ) {
        customerSignals.push({
          message_id:
            message.id,
          occurred_at:
            message.occurred_at,
          kind:
            inferredCustomerIntent.kind,
          confidence:
            inferredCustomerIntent.confidence,
          time_reference:
            timeReference,
          expressed_enthusiasm:
            enthusiasm,
        })
      }

      if (
        !customerMessageSinceLastSeller
      ) {
        pendingCustomerMessages = []
        pendingCustomerIntents = []
      }

      pendingCustomerMessages.push(
        message,
      )

      if (
        inferredCustomerIntent.kind !==
          'unknown'
      ) {
        pendingCustomerIntents.push(
          inferredCustomerIntent,
        )
      }

      customerMessageSinceLastSeller =
        true

      previousMessageOccurredAt =
        timestampOf(message)

      continue
    }

    if (
      message.direction !==
        'outgoing' ||
      message.author_kind !==
        'human_agent'
    ) {
      continue
    }

    const text =
      messageText(message)

    const action =
      classifySellerAction(
        text,
      )

    const occurredAt =
      timestampOf(message)

    // Mesma rajada = mensagens contíguas do vendedor, sem fala do cliente
    // entre elas e com intervalo curto. Bolhas de uma mesma oferta formam
    // UMA ação; follow-up em outro momento é um turno novo.
    const sameBurst =
      !customerMessageSinceLastSeller &&
      lastSellerOccurredAt !== null &&
      occurredAt !== null &&
      occurredAt - lastSellerOccurredAt <=
        SELLER_TURN_BURST_GAP_MS

    if (
      !sameBurst ||
      currentTurnIndex < 0
    ) {
      turnDrafts.push({
        event_indexes: [],
        responds_to:
          customerMessageSinceLastSeller
            ? [
                ...pendingCustomerMessages,
              ]
            : [],
        pending_intents:
          customerMessageSinceLastSeller
            ? [
                ...pendingCustomerIntents,
              ]
            : [],
      })

      currentTurnIndex =
        turnDrafts.length - 1
    }

    const firstPendingCustomerMessage =
      customerMessageSinceLastSeller
        ? pendingCustomerMessages[0] ??
          null
        : null

    const firstPendingAt =
      firstPendingCustomerMessage
        ? timestampOf(
            firstPendingCustomerMessage,
          )
        : null

    const followsContext =
      actionFollowsIntent({
        action,
        intent:
          activeCustomerIntent,
      })

    // Repetição = mesma ação comercial sem resposta do cliente entre as
    // tentativas. Dentro da mesma rajada só conta quando o conteúdo é
    // praticamente o mesmo; partes diferentes de uma mesma oferta (planos,
    // links, CTA) não são "follow-up duplicado".
    const repeatsPriorAction =
      !customerMessageSinceLastSeller &&
      lastSellerAction === action &&
      (
        !sameBurst ||
        nearlySameText(
          lastSellerText,
          text,
        )
      )

    // Saudação e reconhecimento curto não mudam o objetivo da conversa;
    // quando são tudo o que o vendedor respondeu a um pedido, o problema
    // é "pedido não endereçado" (avaliado por turno), não quebra de
    // sequência. Depois de encerramento explícito do cliente também não
    // existe mais objetivo ativo a ser "quebrado".
    const acknowledgementOnly =
      action === 'rapport_opening' ||
      action === 'confirmation'

    const sequenceBreakFromIntent =
      followsContext === false &&
      !acknowledgementOnly &&
      activeCustomerIntent?.kind !==
        'disengaged' &&
      activeCustomerIntent?.confidence ===
        'high'

    const sequenceBreakFromAbandonment =
      !customerMessageSinceLastSeller &&
      (
        lastSellerAction ===
          'scheduling_open_question' ||
        lastSellerAction ===
          'scheduling_guided_choice'
      ) &&
      (
        action ===
          'product_presentation' ||
        action ===
          'price_presentation'
      )

    const breaksActiveCustomerGoal =
      sequenceBreakFromIntent ||
      sequenceBreakFromAbandonment

    const outcome =
      outcomeAfterSellerMessage({
        messages,
        sellerIndex:
          index,
      })

    const signals:
      SellerExecutionSignal[] = []

    if (
      action ===
        'scheduling_open_question'
    ) {
      signals.push(
        'seller_already_asked_open_question',
      )
    }

    if (
      action ===
        'scheduling_guided_choice'
    ) {
      signals.push(
        'guided_choice_used',
      )
    }

    if (
      breaksActiveCustomerGoal
    ) {
      signals.push(
        'sequence_break',
      )
    }

    if (
      (
        activeCustomerIntent?.kind ===
          'general_interest' &&
        (
          action ===
            'product_presentation' ||
          action ===
            'price_presentation'
        )
      ) ||
      sequenceBreakFromAbandonment
    ) {
      signals.push(
        'premature_product_offer',
      )
    }

    if (repeatsPriorAction) {
      signals.push(
        'duplicate_followup',
      )
    }

    if (
      activeCustomerIntent?.confidence ===
        'high' &&
      [
        'scheduling',
        'close',
      ].includes(
        activeCustomerIntent.kind,
      )
    ) {
      signals.push(
        'customer_intent_hot',
        'microcommitment_available',
      )
    }

    if (
      wordCount(text) >= 55
    ) {
      signals.push(
        'seller_message_overloaded',
      )
    }

    if (
      wordCount(
        latestCustomerText,
      ) <= 4 &&
      wordCount(text) >= 12
    ) {
      signals.push(
        'client_sparse_seller_rich',
      )
    }

    if (
      activeCustomerIntent?.kind ===
        'close' &&
      action ===
        'discovery_question'
    ) {
      signals.push(
        'late_discovery_after_close_intent',
      )
    }

    if (
      isGenericResponseCandidate({
        action,
        text,
      })
    ) {
      signals.push(
        'generic_response_candidate',
      )
    }

    if (
      outcome.outcome ===
        'customer_rejected_options'
    ) {
      signals.push(
        'customer_rejected_options',
      )
    }

    const evidenceMessageIds =
      unique(
        [
          activeCustomerIntent
            ?.evidence_message_id,
          message.id,
          outcome
            .evidence_message_id,
        ].filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
      )

    events.push({
      message_id:
        message.id,
      occurred_at:
        message.occurred_at,
      action_type:
        action,
      commercial_objective:
        objectiveForAction(
          action,
        ),
      method_stage:
        null,
      target_commitment:
        targetCommitmentForAction(
          action,
        ),
      content_summary:
        text.length <= 180
          ? text
          : `${text.slice(0, 177)}...`,
      customer_intent_before_action:
        activeCustomerIntent,
      quality: {
        relevance:
          followsContext === null
            ? 'unknown'
            : followsContext
              ? 'high'
              : 'low',
        specificity:
          specificityLevel(
            text,
          ),
        question_quality:
          questionQuality(
            action,
            text,
          ),
        persuasion_quality:
          'unknown',
        friction:
          frictionLevel({
            action,
            text,
          }),
        pressure_risk:
          pressureRisk(
            text,
          ),
      },
      sequence: {
        follows_previous_context:
          followsContext,
        repeats_prior_action:
          repeatsPriorAction,
        advances_stage:
          advancesStage(
            action,
          ),
        skips_required_step:
          null,
        breaks_active_customer_goal:
          breaksActiveCustomerGoal,
      },
      observed_outcome:
        outcome.outcome,
      signals:
        unique(
          signals,
        ),
      evidence_message_ids:
        evidenceMessageIds,
      turn_id:
        `turn-${currentTurnIndex + 1}`,
      timing: {
        responds_to_customer_message_id:
          firstPendingCustomerMessage
            ?.id ??
          null,
        response_latency_ms:
          firstPendingAt !== null &&
          occurredAt !== null
            ? Math.max(
                0,
                occurredAt -
                  firstPendingAt,
              )
            : null,
        previous_message_gap_ms:
          previousMessageOccurredAt !==
            null &&
          occurredAt !== null
            ? Math.max(
                0,
                occurredAt -
                  previousMessageOccurredAt,
              )
            : null,
      },
    })

    turnDrafts[
      currentTurnIndex
    ].event_indexes.push(
      events.length - 1,
    )

    lastSellerAction =
      action

    lastSellerText =
      text

    lastSellerOccurredAt =
      occurredAt

    previousMessageOccurredAt =
      occurredAt

    customerMessageSinceLastSeller =
      false
  }

  const turns =
    buildSellerTurns({
      events,
      drafts:
        turnDrafts,
    })

  const classifiedMessageCount =
    events.filter(
      event =>
        event.action_type !==
          'unknown',
    ).length

  const sellerExecutionConfidence:
    SellerExecutionConfidence =
      events.length === 0
        ? 'low'
        : classifiedMessageCount ===
            events.length
          ? 'high'
          : 'medium'

  const clientContextConfidence:
    SellerExecutionConfidence =
      activeCustomerIntent
        ?.confidence ??
      'low'

  return {
    contract_version:
      SELLER_EXECUTION_TRACE_VERSION,
    summary: {
      seller_message_count:
        events.length,
      classified_message_count:
        classifiedMessageCount,
      client_context_confidence:
        clientContextConfidence,
      seller_execution_confidence:
        sellerExecutionConfidence,
      active_customer_intent:
        activeCustomerIntent,
      sequence_break_detected:
        events.some(
          event =>
            event.sequence
              .breaks_active_customer_goal,
        ),
      evidence_message_ids:
        unique(
          events.flatMap(
            event =>
              event.evidence_message_ids,
          ),
        ),
    },
    events,
    turns,
    customer_signals:
      customerSignals,
  }
}
