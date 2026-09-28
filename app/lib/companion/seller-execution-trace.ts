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

export type SellerExecutionCustomerIntent = {
  kind: SellerExecutionCustomerIntentKind
  confidence: SellerExecutionConfidence
  evidence_message_id: string
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

function inferCustomerIntent(
  message: DiagnosticInputMessage,
): SellerExecutionCustomerIntent {
  const text =
    normalizeText(
      messageText(message),
    )

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
    ].map(normalizeText),
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
    includesAny(
      normalized,
      [
        'perfeito',
        'entendi',
        'claro',
        'combinado',
        'otimo',
        'ótimo',
        'que otimo',
        'que ótimo',
      ].map(normalizeText),
    ) &&
    wordCount(text) <= 14
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

  const events:
    SellerExecutionEvent[] = []

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

      customerMessageSinceLastSeller =
        true

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

    const followsContext =
      actionFollowsIntent({
        action,
        intent:
          activeCustomerIntent,
      })

    const repeatsPriorAction =
      !customerMessageSinceLastSeller &&
      lastSellerAction === action

    const sequenceBreakFromIntent =
      followsContext === false &&
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
    })

    lastSellerAction =
      action

    customerMessageSinceLastSeller =
      false
  }

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
  }
}
