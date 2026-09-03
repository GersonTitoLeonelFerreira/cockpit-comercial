import type { CommercialProductPricing } from '../commercial-product-contract'

import {
  CANDIDATE_GENERATION_MODE,
  CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION,
  MESSAGE_CANDIDATE_CONTRACT_VERSION,
  type CandidateGenerationInputV1,
  type CandidateGenerationLimitationV1,
  type CandidateGenerationResultV1,
  type MessageCandidateV1,
} from './message-candidate'

import type {
  CommunicationStylePlanV1,
  MessagePlanContentRequirementV1,
  MessagePlanFactRequirementV1,
  MessagePlanV1,
  QuestionPlanV1,
} from './message-plan'

import {
  stableUniqueStrings,
  type SourceTraceV1,
} from './source-trace'

type CandidateVariant = 'direct' | 'contextual' | 'conversational'

type RealizedSegmentV1 = {
  text: string
  content_requirements: MessagePlanContentRequirementV1[]
  fact_requirement_keys: string[]
}

type CandidateDraftV1 = {
  text: string
  content_requirements_covered: MessagePlanContentRequirementV1[]
  fact_requirements_used: string[]
  question_count: number
}

const INTERNAL_JARGON_PATTERNS = [
  /\bcommercial move\b/iu,
  /\bknowledge gap\b/iu,
  /\bgovernance\b/iu,
  /\bmethod alignment\b/iu,
  /\bdecision criterion\b/iu,
  /\bmessage planner\b/iu,
  /\bframework\b/iu,
  /\bprovenance\b/iu,
] as const

const EXPLICIT_FRAMEWORK_PATTERNS = [
  /\bSPIN\b/u,
  /\bGAP\b/u,
  /\bSandler\b/u,
  /\bJOLT\b/u,
  /\bMEDDPICC\b/u,
  /\bChallenger\b/u,
  /\bCialdini\b/u,
] as const

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /[.!?]$/u.test(trimmed) ? trimmed : trimmed + '.'
}

function uniqueTraces(traces: readonly SourceTraceV1[]): SourceTraceV1[] {
  const seen = new Set<string>()
  const result: SourceTraceV1[] = []

  for (const trace of traces) {
    const key = JSON.stringify({
      source_type: trace.source_type,
      source_id: trace.source_id,
      source_version: trace.source_version,
      observed_at: trace.observed_at,
      source_cycle_id: trace.source_cycle_id ?? null,
      inheritance: trace.inheritance ?? null,
      evidence_message_ids: stableUniqueStrings(trace.evidence_message_ids ?? []),
      evidence_memory_ids: stableUniqueStrings(trace.evidence_memory_ids ?? []),
    })

    if (!seen.has(key)) {
      seen.add(key)
      result.push(trace)
    }
  }

  return result.sort(
    (left, right) =>
      left.source_type.localeCompare(right.source_type) ||
      (left.source_id ?? '').localeCompare(
        right.source_id ?? '',
        'en',
        { numeric: true },
      ),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPricing(value: unknown): value is CommercialProductPricing {
  return isRecord(value) && typeof value.model === 'string' && value.currency === 'BRL'
}

function formatBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function recurrenceText(recurrence: CommercialProductPricing['recurrence']): string {
  if (!recurrence) return ''

  return {
    monthly: 'por mês',
    quarterly: 'por trimestre',
    semiannual: 'por semestre',
    annual: 'por ano',
  }[recurrence]
}

function formatPricing(
  pricing: CommercialProductPricing,
  style: CommunicationStylePlanV1,
  variant: CandidateVariant,
): string | null {
  if (pricing.model === 'quote_required') {
    return variant === 'contextual'
      ? 'O valor é definido por cotação, então precisa ser calculado para o caso antes de ser informado como preço fechado.'
      : 'O valor depende de cotação e precisa ser confirmado para o caso.'
  }

  if (pricing.model === 'free') return 'Não há cobrança para este item.'
  if (pricing.model === 'unknown' || typeof pricing.amount !== 'number') return null

  const amount = formatBRL(pricing.amount)
  const qualifier = pricing.amount_qualifier === 'starting_at' ? 'a partir de ' : ''

  if (pricing.model === 'recurring') {
    const recurrence = recurrenceText(pricing.recurrence)
    if (style.target_length === 'short') {
      return sentence((qualifier + amount + ' ' + recurrence).trim())
    }
    return sentence(('O valor é ' + qualifier + amount + ' ' + recurrence).trim())
  }

  if (pricing.model === 'installment' && pricing.installment_count) {
    if (pricing.installment_amount_basis === 'per_installment') {
      return sentence(
        String(pricing.installment_count) +
          ' parcelas de ' +
          qualifier +
          amount,
      )
    }

    return sentence(
      'O valor total é ' +
        qualifier +
        amount +
        ', dividido em ' +
        String(pricing.installment_count) +
        ' parcelas',
    )
  }

  return sentence('O valor é ' + qualifier + amount)
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim())
}

function sellerIntentText(
  plan: MessagePlanV1,
): string {
  return normalizeText(
    plan.seller_intent.value,
  )
}

function relationshipContinuationIntent(
  plan: MessagePlanV1,
): boolean {
  const intent =
    sellerIntentText(plan)

  return [
    'conversa descontraida',
    'conversa casual',
    'fortalecer vinculo',
    'fortalecer relacionamento',
    'sem objetivo comercial',
    'responder de forma casual',
  ].some(term =>
    intent.includes(term),
  )
}

function operationalSupportIntent(
  plan: MessagePlanV1,
): boolean {
  const intent =
    sellerIntentText(plan)

  return [
    'oferecer apoio para pendencias operacionais',
    'oferecer apoio para pendencias atuais',
    'oferecer apoio operacional',
    'apoio para pendencias operacionais',
  ].some(term =>
    intent.includes(term),
  )
}

function commercialRedirectIntent(
  plan: MessagePlanV1,
): boolean {
  const intent =
    sellerIntentText(plan)

  return [
    'desviar delicadamente o assunto para o foco principal da negociacao',
    'voltar ao foco principal da negociacao',
    'retomar o foco principal da negociacao',
    'redirecionar para a negociacao',
    'retomar o assunto principal da negociacao',
  ].some(term =>
    intent.includes(term),
  )
}

function sellerIntentRequestsClarification(
  plan: MessagePlanV1,
): boolean {
  const intent =
    sellerIntentText(plan)

  return [
    'perguntar',
    'clarificar',
    'esclarecer',
    'entender melhor',
    'descobrir',
    'pedir contexto',
    'pedir informacao',
    'pedir informação',
    'confirmar com o cliente se',
    'confirmar com a cliente se',
    'perguntar ao cliente se',
    'perguntar para o cliente se',
  ].some(term =>
    intent.includes(
      normalizeText(term),
    ),
  )
}

function sellerIntentConfirmationQuestion(
  plan: MessagePlanV1,
): string | null {
  const raw =
    plan.seller_intent.value
      .trim()

  const match =
    raw.match(
      /^confirmar com (?:o|a) cliente se\s+(.+)$/iu,
    ) ??
    raw.match(
      /^perguntar (?:ao|para o|à|a) cliente se\s+(.+)$/iu,
    )

  const body =
    match?.[1]
      ?.trim()
      .replace(/[.!?]+$/u, '') ??
    ''

  if (!body) {
    return null
  }

  return (
    body.charAt(0)
      .toLocaleUpperCase(
        'pt-BR',
      ) +
    body.slice(1) +
    '?'
  )
}

function sellerIntentPreferenceQuestion(
  plan: MessagePlanV1,
): string | null {
  const raw =
    plan.seller_intent.value
      .trim()

  const optionsMatch =
    raw.match(
      /prefer[eê]ncia\s+de\s+formato\s*\(([^)]+)\)/iu,
    ) ??
    raw.match(
      /perguntar\s+(?:a\s+)?prefer[eê]ncia[^()]*\(([^)]+)\)/iu,
    )

  const options =
    optionsMatch?.[1]
      ?.trim()
      .replace(/\s+/gu, ' ') ??
    ''

  if (
    options &&
    /\bou\b/iu.test(
      options,
    )
  ) {
    return (
      'Você prefere ' +
      options +
      '?'
    )
  }

  if (
    /prefer[eê]ncia\s+de\s+formato/iu.test(
      raw,
    ) ||
    /perguntar\s+qual\s+formato/iu.test(
      raw,
    )
  ) {
    return 'Qual formato você prefere?'
  }

  const preferenceMatch =
    raw.match(
      /perguntar\s+(?:a\s+)?prefer[eê]ncia\s+de\s+([\p{L}\s]+?)(?:[.,;]|$)/iu,
    )

  const subject =
    preferenceMatch?.[1]
      ?.trim()
      .replace(/\s+/gu, ' ') ??
    ''

  if (!subject) {
    return null
  }

  return (
    'Qual ' +
    subject +
    ' você prefere?'
  )
}

function sellerIntentSupportSegment(
  plan: MessagePlanV1,
): RealizedSegmentV1 | null {
  const intent =
    sellerIntentText(plan)

  if (
    commercialRedirectIntent(
      plan,
    )
  ) {
    return {
      text:
        plan.communication_style
          .formality === 'formal'
          ? 'Recebi, obrigado. Podemos retomar o ponto principal da negociação.'
          : 'Recebi, obrigado. Podemos retomar o ponto principal da negociação.',
      content_requirements:
        plan.content_requirements.includes(
          'propose_next_step',
        )
          ? ['propose_next_step']
          : [],
      fact_requirement_keys: [],
    }
  }

  if (
    operationalSupportIntent(
      plan,
    )
  ) {
    const confirmsCommitment =
      plan.content_requirements.includes(
        'confirm_commitment',
      )

    const acknowledgesNonCommercial =
      plan.content_requirements.includes(
        'acknowledge_non_commercial',
      )

    return {
      text:
        confirmsCommitment
          ? 'Combinado. Se precisar de ajuda com as pendências, pode me chamar.'
          : 'Se precisar de ajuda com as pendências, pode me chamar.',
      content_requirements:
        confirmsCommitment
          ? ['confirm_commitment']
          : acknowledgesNonCommercial
            ? ['acknowledge_non_commercial']
            : [],
      fact_requirement_keys: [],
    }
  }

  if (
    intent.includes(
      'reafirmar disponibilidade',
    ) &&
    intent.includes(
      'demonstracao',
    )
  ) {
    return {
      text:
        plan.communication_style
          .formality === 'formal'
          ? 'Permaneço à disposição para a demonstração.'
          : 'Estou à disposição para a demonstração.',
      content_requirements: [],
      fact_requirement_keys: [],
    }
  }

  return null
}

function sellerIntentReceiptAcknowledgement(
  plan: MessagePlanV1,
): string | null {
  const raw =
    plan.seller_intent.value
      .trim()

  const match =
    raw.match(
      /^confirmar recebimento\s+(do|da|dos|das)\s+(.+)$/iu,
    )

  if (!match) {
    return null
  }

  const articleMap:
    Record<string, string> = {
      do: 'o',
      da: 'a',
      dos: 'os',
      das: 'as',
    }

  const article =
    articleMap[
      match[1]
        .toLocaleLowerCase(
          'pt-BR',
        )
    ]

  const subject =
    match[2]
      .trim()
      .replace(/[.!?]+$/u, '')

  if (!article || !subject) {
    return null
  }

  return plan.communication_style
    .formality === 'formal'
    ? sentence(
        'Confirmo o recebimento ' +
          match[1]
            .toLocaleLowerCase(
              'pt-BR',
            ) +
          ' ' +
          subject,
      )
    : sentence(
        'Recebi ' +
          article +
          ' ' +
          subject,
      )
}

function sellerIntentRequiresSilentWait(
  plan: MessagePlanV1,
): boolean {
  const intent =
    sellerIntentText(plan)

  return [
    'aguardar o cliente',
    'aguardar a cliente',
    'esperar o cliente',
    'esperar a cliente',
    'aguardar retorno do cliente',
    'aguardar retorno da cliente',
    'aguardar o retorno do cliente',
    'aguardar o retorno da cliente',
  ].some(term =>
    intent.includes(term),
  )
}

function styleFactPrefix(
  style: CommunicationStylePlanV1,
  variant: CandidateVariant,
): string {
  if (style.target_length === 'short' || style.directness === 'direct') return ''
  if (variant === 'contextual') return 'Sobre isso, '
  if (style.target_length === 'long') return 'O que está confirmado é o seguinte: '
  return ''
}

function factText(
  requirement: MessagePlanFactRequirementV1,
  style: CommunicationStylePlanV1,
  variant: CandidateVariant,
): string | null {
  if (requirement.assertion_policy === 'must_not_assert') return null

  if (requirement.assertion_policy === 'describe_constraint_only') {
    if (
      requirement.requirement_key === 'product.pricing' &&
      isPricing(requirement.value) &&
      requirement.value.model === 'quote_required'
    ) {
      return formatPricing(requirement.value, style, variant)
    }

    return variant === 'contextual'
      ? 'Essa informação depende de uma confirmação antes de poder ser tratada como definitiva.'
      : 'Essa informação precisa ser confirmada antes de ser passada como definitiva.'
  }

  if (typeof requirement.value === 'string' && requirement.value.trim()) {
    return sentence(styleFactPrefix(style, variant) + requirement.value.trim())
  }

  if (isPricing(requirement.value)) {
    return formatPricing(requirement.value, style, variant)
  }

  const values = safeStringArray(requirement.value)
  if (values.length === 0) return null

  if (requirement.requirement_key === 'product.allowed_claims') {
    return sentence(styleFactPrefix(style, variant) + values.join(' '))
  }

  if (requirement.requirement_key === 'product.payment_conditions') {
    return sentence(
      'As condições de pagamento confirmadas são: ' + values.join(' '),
    )
  }

  if (requirement.requirement_key === 'product.contract_conditions') {
    return sentence(
      'As condições contratuais confirmadas são: ' + values.join(' '),
    )
  }

  return null
}

function contentSegment(
  requirement: MessagePlanContentRequirementV1,
  plan: MessagePlanV1,
  variant: CandidateVariant,
): RealizedSegmentV1 | null {
  const formal = plan.communication_style.formality === 'formal'
  const direct = plan.communication_style.directness === 'direct'
  const move = plan.commercial_move.move

  const segment = (text: string): RealizedSegmentV1 => ({
    text,
    content_requirements: [requirement],
    fact_requirement_keys: [],
  })

  switch (requirement) {
    case 'acknowledge_customer_point':
      return segment(
        formal
          ? 'Compreendo o ponto.'
          : direct
            ? 'Entendi.'
            : variant === 'contextual'
              ? 'Faz sentido levantar esse ponto.'
              : 'Entendi seu ponto.',
      )

    case 'address_objection':
      return segment(
        variant === 'contextual'
          ? 'Vale entender exatamente o que está pesando antes de avançar.'
          : 'Vamos separar o que está pesando nesse ponto.',
      )

    case 'confirm_decision_criterion':
      if (
        plan.question_plan.should_ask &&
        plan.question_plan.purpose === 'confirm_decision_criterion'
      ) {
        return null
      }
      return segment(
        'Vou considerar o ponto que você já indicou como mais importante.',
      )

    case 'reduce_decision_risk':
      return segment(
        variant === 'contextual'
          ? 'Para facilitar a decisão, faz sentido ficar apenas no que está confirmado e evitar qualquer suposição.'
          : 'Para decidir com mais segurança, vamos ficar no que está confirmado.',
      )

    case 'recover_process':
      return segment(
        variant === 'contextual'
          ? 'Podemos retomar do ponto que ficou pendente e seguir sem pular etapa.'
          : 'Podemos retomar do ponto que ficou pendente.',
      )

    case 'respect_customer_timing':
      return segment(
        formal ? 'Sem problema, respeito o seu tempo.' : 'Sem problema, respeito seu tempo.',
      )

    case 'close_without_pressure':
      return segment(
        move === 'close_conversation'
          ? 'Obrigado pelo retorno.'
          : variant === 'contextual'
            ? 'Combinado, sem pressa.'
            : 'Combinado.',
      )

    case 'acknowledge_non_commercial':
      if (
        relationshipContinuationIntent(
          plan,
        ) ||
        operationalSupportIntent(
          plan,
        )
      ) {
        return null
      }

      return segment(
        formal
          ? 'Certo, compreendido.'
          : 'Certo.',
      )

    case 'answer_requested_information':
    case 'explain_quote_requirement':
    case 'surface_verified_difference':
    case 'clarify_missing_information':
    case 'propose_next_step':
    case 'confirm_commitment':
      return null
  }
}

function renderFacts(
  plan: MessagePlanV1,
  variant: CandidateVariant,
): RealizedSegmentV1[] {
  const result: RealizedSegmentV1[] = []
  const requirements = [...plan.fact_requirements].sort(
    (left, right) => left.requirement_key.localeCompare(right.requirement_key),
  )

  for (const requirement of requirements) {
    if (requirement.assertion_policy === 'must_not_assert') continue
    if (
      requirement.status === 'forbidden' ||
      requirement.requirement_key === 'product.forbidden_claims'
    ) {
      continue
    }

    const shouldUse =
      requirement.necessity === 'required' ||
      (
        requirement.requirement_key === 'product.allowed_claims' &&
        plan.content_requirements.includes('surface_verified_difference')
      )

    if (!shouldUse) continue

    const text = factText(requirement, plan.communication_style, variant)
    if (!text) continue

    const covered: MessagePlanContentRequirementV1[] = []

    if (
      requirement.requirement_key === 'product.pricing' &&
      requirement.assertion_policy === 'describe_constraint_only'
    ) {
      if (plan.content_requirements.includes('answer_requested_information')) {
        covered.push('answer_requested_information')
      }
      if (plan.content_requirements.includes('explain_quote_requirement')) {
        covered.push('explain_quote_requirement')
      }
    } else if (
      requirement.necessity === 'required' &&
      plan.content_requirements.includes('answer_requested_information')
    ) {
      covered.push('answer_requested_information')
    }

    if (
      requirement.requirement_key === 'product.allowed_claims' &&
      plan.content_requirements.includes('surface_verified_difference')
    ) {
      covered.push('surface_verified_difference')
    }

    result.push({
      text,
      content_requirements: covered,
      fact_requirement_keys: [requirement.requirement_key],
    })
  }

  return result
}

function questionText(
  question: QuestionPlanV1,
  variant: CandidateVariant,
  formal: boolean,
): string | null {
  if (!question.should_ask || question.max_questions === 0) return null

  const requested =
    question.required_information.find(
      item => !question.known_information_skipped.includes(item),
    ) ?? null

  if (!requested || requested === 'missing_factual_information') return null

  const byInformation: Record<string, string> = {
    objective: formal
      ? 'O que você pretende alcançar com isso?'
      : 'O que você quer alcançar com isso?',
    problem: 'Qual situação você precisa resolver hoje?',
    impact: 'Que impacto isso tem hoje?',
    need: 'O que você precisa que a solução resolva?',
    budget: 'Você já definiu uma faixa de investimento?',
    timeline: 'Em que prazo você pretende resolver isso?',
    decision_maker: 'Quem mais participa dessa decisão?',
    priority: 'Qual é a prioridade principal agora?',
    decision_criteria: 'O que pesa mais para você nessa escolha?',
    current_process: 'Como você faz isso hoje?',
    product_fit: 'O que você precisa que a solução atenda?',
    other: 'O que ainda falta esclarecer para você?',
    objection_driver:
      variant === 'contextual'
        ? 'O que está pesando mais nessa percepção?'
        : 'O que pesou mais para você nesse ponto?',
    decision_uncertainty: 'O que ainda está deixando você em dúvida?',
    current_request_context: formal
      ? 'O que você precisa confirmar neste momento?'
      : 'O que você precisa confirmar agora?',
  }

  if (question.purpose === 'isolate_objection') {
    return byInformation.objection_driver
  }
  if (question.purpose === 'confirm_decision_criterion') {
    return byInformation.decision_criteria
  }
  if (question.purpose === 'reduce_uncertainty') {
    return byInformation.decision_uncertainty
  }
  if (
    question.purpose === 'clarify_request' ||
    question.purpose === 'obtain_context'
  ) {
    return byInformation.current_request_context
  }

  return byInformation[requested] ?? (
    variant === 'contextual'
      ? 'Qual ponto ainda precisa ficar claro para você?'
      : 'O que ainda precisa ser esclarecido?'
  )
}

function renderQuestion(
  plan: MessagePlanV1,
  variant: CandidateVariant,
): RealizedSegmentV1 | null {
  if (
    (
      plan.question_plan.purpose ===
        'clarify_request' ||
      plan.question_plan.purpose ===
        'obtain_context'
    ) &&
    !sellerIntentRequestsClarification(
      plan,
    )
  ) {
    return null
  }

  const text =
    sellerIntentConfirmationQuestion(
      plan,
    ) ??
    sellerIntentPreferenceQuestion(
      plan,
    ) ??
    questionText(
      plan.question_plan,
      variant,
      plan.communication_style.formality === 'formal',
    )
  if (!text) return null

  const covered: MessagePlanContentRequirementV1[] = []

  if (plan.content_requirements.includes('clarify_missing_information')) {
    covered.push('clarify_missing_information')
  }
  if (
    plan.content_requirements.includes('confirm_decision_criterion') &&
    plan.question_plan.purpose === 'confirm_decision_criterion'
  ) {
    covered.push('confirm_decision_criterion')
  }

  return {
    text,
    content_requirements: covered,
    fact_requirement_keys: [],
  }
}

function nextStepSegment(
  plan: MessagePlanV1,
  variant: CandidateVariant,
): RealizedSegmentV1 | null {
  const segment = (
    text: string,
    requirement: MessagePlanContentRequirementV1 | null,
  ): RealizedSegmentV1 => ({
    text,
    content_requirements:
      requirement && plan.content_requirements.includes(requirement)
        ? [requirement]
        : [],
    fact_requirement_keys: [],
  })

  switch (plan.next_step_plan.kind) {
    case 'propose_next_step':
      return segment(
        variant === 'contextual'
          ? 'Se fizer sentido para você, podemos seguir para a próxima etapa.'
          : 'Se fizer sentido, podemos seguir para a próxima etapa.',
        'propose_next_step',
      )

    case 'confirm_commitment': {
      const receiptAcknowledgement =
        sellerIntentReceiptAcknowledgement(
          plan,
        )

      if (receiptAcknowledgement) {
        return segment(
          receiptAcknowledgement,
          'confirm_commitment',
        )
      }

      const alreadyConfirmed =
        plan.situation.evidence
          .some(
            evidence => {
              const signal =
                evidence.signal
                  .toLocaleLowerCase(
                    'pt-BR',
                  )

              return (
                signal.includes(
                  'confirmação explícita',
                ) ||
                signal.includes(
                  'compromisso explícito',
                )
              )
            },
          )

      if (alreadyConfirmed) {
        return segment(
          plan.communication_style
            .formality === 'formal'
            ? 'Confirmado.'
            : 'Combinado.',
          'confirm_commitment',
        )
      }

      return segment(
        variant === 'contextual'
          ? 'Podemos seguir com o que já ficou combinado.'
          : 'Podemos seguir com o que combinamos.',
        'confirm_commitment',
      )
    }

    case 'give_space':
      return segment('Fique à vontade para avaliar com calma.', null)

    case 'none':
    case 'clarify':
    case 'answer_and_wait':
    case 'ask':
    case 'respect_timing':
    case 'close':
    case 'escalate':
      return null
  }
}

function mergeSegments(
  plan: MessagePlanV1,
  variant: CandidateVariant,
): RealizedSegmentV1[] {
  const explicit = plan.content_requirements
    .map(requirement => contentSegment(requirement, plan, variant))
    .filter((item): item is RealizedSegmentV1 => item !== null)

  const facts = renderFacts(plan, variant)
  const sellerIntentSupport =
    sellerIntentSupportSegment(
      plan,
    )
  const question = renderQuestion(plan, variant)
  const sellerIntentOwnsNextStep =
    commercialRedirectIntent(
      plan,
    ) ||
    operationalSupportIntent(
      plan,
    )
  const next =
    sellerIntentOwnsNextStep
      ? null
      : nextStepSegment(
          plan,
          variant,
        )

  const ordered =
    variant === 'contextual'
      ? [
          ...explicit.filter(segment =>
            segment.content_requirements.includes('acknowledge_customer_point'),
          ),
          ...facts,
          ...explicit.filter(segment =>
            !segment.content_requirements.includes('acknowledge_customer_point'),
          ),
        ]
      : [...explicit, ...facts]

  if (sellerIntentSupport) {
    ordered.push(
      sellerIntentSupport,
    )
  }
  if (question) ordered.push(question)
  if (next) ordered.push(next)

  const seen = new Set<string>()
  return ordered.filter(segment => {
    const key = normalizeText(segment.text)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function questionCount(text: string): number {
  return (text.match(/\?/gu) ?? []).length
}

function joinSegments(
  segments: readonly RealizedSegmentV1[],
  style: CommunicationStylePlanV1,
): string {
  const texts = segments.map(segment => segment.text.trim()).filter(Boolean)

  if (style.paragraph_density === 'compact' || style.target_length === 'short') {
    return texts.join(' ')
  }

  if (texts.length <= 2) return texts.join(' ')

  const first = texts.slice(0, 2).join(' ')
  const rest = texts.slice(2).join(' ')
  return rest ? first + '\n\n' + rest : first
}

function semanticTokens(value: string): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/u)
    .filter(token => token.length >= 4)
    .map(token => token.length >= 6 ? token.slice(0, 6) : token)
}

function semanticRuleMatch(text: string, rule: string): boolean {
  const normalizedText = normalizeText(text)
  const normalizedRule = normalizeText(rule)

  if (!normalizedRule) return false
  if (normalizedText.includes(normalizedRule)) return true

  const ruleTokens = new Set(semanticTokens(normalizedRule))
  const textTokens = new Set(semanticTokens(normalizedText))
  if (ruleTokens.size === 0) return false

  let matches = 0
  for (const token of ruleTokens) {
    if (textTokens.has(token)) matches += 1
  }

  return matches / ruleTokens.size >= 0.75
}

function containsForbiddenContent(text: string, plan: MessagePlanV1): boolean {
  return plan.forbidden_content.some(item =>
    semanticRuleMatch(text, item.rule),
  )
}

function containsInternalJargon(text: string): boolean {
  return (
    INTERNAL_JARGON_PATTERNS.some(pattern => pattern.test(text)) ||
    EXPLICIT_FRAMEWORK_PATTERNS.some(pattern => pattern.test(text))
  )
}

function hasHardMustNotAssertGap(plan: MessagePlanV1): boolean {
  return plan.fact_requirements.some(
    requirement =>
      requirement.necessity === 'required' &&
      requirement.assertion_policy === 'must_not_assert' &&
      requirement.gap_impact === 'hard',
  )
}

function materialVariationAvailable(plan: MessagePlanV1): boolean {
  return (
    plan.content_requirements.length >= 2 ||
    plan.question_plan.should_ask ||
    !['none', 'answer_and_wait'].includes(plan.next_step_plan.kind)
  )
}

function requestedCandidateCount(
  plan: MessagePlanV1,
  requested: CandidateGenerationInputV1['max_candidates'],
): number {
  if (!materialVariationAvailable(plan)) return 1
  return Math.min(Math.max(requested ?? 2, 1), 3)
}

function draftCandidate(
  plan: MessagePlanV1,
  variant: CandidateVariant,
): CandidateDraftV1 | null {
  const segments = mergeSegments(plan, variant)
  const text = joinSegments(segments, plan.communication_style).trim()
  if (!text) return null

  const covered = [
    ...new Set(segments.flatMap(segment => segment.content_requirements)),
  ].sort()

  if (plan.content_requirements.some(requirement => !covered.includes(requirement))) {
    return null
  }

  const count = questionCount(text)
  if (count > plan.question_plan.max_questions) return null
  if (!plan.question_plan.should_ask && count > 0) return null
  if (containsForbiddenContent(text, plan) || containsInternalJargon(text)) return null

  return {
    text,
    content_requirements_covered: covered,
    fact_requirements_used: stableUniqueStrings(
      segments.flatMap(segment => segment.fact_requirement_keys),
    ),
    question_count: count,
  }
}

function semanticPlanFingerprint(plan: MessagePlanV1): string {
  const value = {
    status: plan.status,
    seller_intent:
      plan.seller_intent.value,
    commercial_objective: plan.commercial_objective,
    response_mode: plan.response_mode,
    commercial_move: plan.commercial_move.move,
    content_requirements: [...plan.content_requirements].sort(),
    fact_requirements: [...plan.fact_requirements]
      .sort((left, right) =>
        left.requirement_key.localeCompare(right.requirement_key),
      )
      .map(requirement => ({
        requirement_key: requirement.requirement_key,
        necessity: requirement.necessity,
        assertion_policy: requirement.assertion_policy,
        gap_impact: requirement.gap_impact,
        value: requirement.value,
      })),
    question_plan: plan.question_plan,
    next_step_plan: plan.next_step_plan,
    communication_style: plan.communication_style,
  }

  const input = JSON.stringify(value)
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function candidateProvenance(
  plan: MessagePlanV1,
  usedRequirementKeys: readonly string[],
): SourceTraceV1[] {
  const used = new Set(usedRequirementKeys)
  const factTraces = plan.fact_requirements
    .filter(requirement => used.has(requirement.requirement_key))
    .flatMap(requirement => requirement.provenance)

  return uniqueTraces([...plan.provenance, ...factTraces])
}

function generationLimitations(
  plan: MessagePlanV1,
): CandidateGenerationLimitationV1[] {
  const limitations: CandidateGenerationLimitationV1[] = []

  if (plan.communication_style.greeting_policy === 'preserve_seller') {
    limitations.push({
      code: 'SELLER_GREETING_PATTERN_NOT_IN_MESSAGE_PLAN',
      detail:
        'MessagePlanV1 informa que o greeting do seller deve ser preservado, mas não carrega o padrão textual observado. O Generator não inventa um greeting.',
    })
  }

  if (plan.communication_style.closing_policy === 'preserve_seller') {
    limitations.push({
      code: 'SELLER_CLOSING_PATTERN_NOT_IN_MESSAGE_PLAN',
      detail:
        'MessagePlanV1 informa que o closing do seller deve ser preservado, mas não carrega o padrão textual observado. O Generator não inventa um closing.',
    })
  }

  if (plan.communication_style.emoji_policy === 'preserve') {
    limitations.push({
      code: 'SELLER_EMOJI_PATTERN_NOT_IN_MESSAGE_PLAN',
      detail:
        'MessagePlanV1 pede preservação de emoji, mas não informa qual padrão observado preservar. O Generator não inventa emoji.',
    })
  }

  return limitations
}

function blockedResult(
  plan: MessagePlanV1,
  status: CandidateGenerationResultV1['status'],
  reason: string,
): CandidateGenerationResultV1 {
  return {
    contract_version: CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION,
    status,
    plan_status: plan.status,
    commercial_move: plan.commercial_move.move,
    commercial_objective: plan.commercial_objective,
    generation_allowed: false,
    candidates: [],
    limitations: generationLimitations(plan),
    reason,
  }
}

export function generateMessageCandidatesV1(
  input: CandidateGenerationInputV1,
): CandidateGenerationResultV1 {
  const plan = input.message_plan

  if (plan.status === 'blocked') {
    return blockedResult(
      plan,
      'blocked',
      'MessagePlanV1 está bloqueado por governance; nenhum candidate pode ser produzido.',
    )
  }

  if (plan.status === 'approval_required') {
    return blockedResult(
      plan,
      'approval_required',
      'MessagePlanV1 exige aprovação humana antes de qualquer geração.',
    )
  }

  if (!plan.generation_constraints.generation_allowed) {
    return blockedResult(
      plan,
      'not_generated',
      'MessagePlanV1 não autoriza geração.',
    )
  }

  if (
    sellerIntentRequiresSilentWait(
      plan,
    )
  ) {
    return blockedResult(
      plan,
      'not_generated',
      'Seller Intent determina espera silenciosa; nenhuma mensagem deve ser produzida neste momento.',
    )
  }

  if (hasHardMustNotAssertGap(plan)) {
    return {
      contract_version: CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION,
      status: 'needs_information',
      plan_status: plan.status,
      commercial_move: plan.commercial_move.move,
      commercial_objective: plan.commercial_objective,
      generation_allowed: true,
      candidates: [],
      limitations: generationLimitations(plan),
      reason:
        'Existe fato obrigatório com hard gap e must_not_assert; o Generator não completa a lacuna.',
    }
  }

  const variants: CandidateVariant[] = [
    'direct',
    'contextual',
    'conversational',
  ]
  const count = requestedCandidateCount(plan, input.max_candidates)
  const fingerprint = semanticPlanFingerprint(plan)

  const drafts = variants
    .slice(0, count)
    .map(variant => draftCandidate(plan, variant))
    .filter((candidate): candidate is CandidateDraftV1 => candidate !== null)

  const distinct = new Map<string, CandidateDraftV1>()
  for (const draft of drafts) {
    const key = normalizeText(draft.text)
    if (!distinct.has(key)) distinct.set(key, draft)
  }

  const candidates: MessageCandidateV1[] = [...distinct.values()].map(
    (draft, index) => ({
      contract_version: MESSAGE_CANDIDATE_CONTRACT_VERSION,
      candidate_id: 'candidate-' + fingerprint + '-' + String(index + 1),
      text: draft.text,
      generation_mode: CANDIDATE_GENERATION_MODE,
      commercial_move: plan.commercial_move.move,
      commercial_objective: plan.commercial_objective,
      content_requirements_covered: [...draft.content_requirements_covered],
      fact_requirements_used: [...draft.fact_requirements_used],
      question_count: draft.question_count,
      evidence: {
        message_ids: [...plan.evidence.message_ids],
        memory_ids: [...plan.evidence.memory_ids],
      },
      provenance: candidateProvenance(plan, draft.fact_requirements_used),
    }),
  )

  if (candidates.length === 0) {
    return {
      contract_version: CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION,
      status:
        plan.status === 'needs_information'
          ? 'needs_information'
          : 'not_generated',
      plan_status: plan.status,
      commercial_move: plan.commercial_move.move,
      commercial_objective: plan.commercial_objective,
      generation_allowed: true,
      candidates: [],
      limitations: generationLimitations(plan),
      reason:
        'O plano não pôde ser realizado integralmente sem violar suas próprias restrições.',
    }
  }

  return {
    contract_version: CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION,
    status:
      plan.status === 'needs_information'
        ? 'needs_information'
        : 'generated',
    plan_status: plan.status,
    commercial_move: plan.commercial_move.move,
    commercial_objective: plan.commercial_objective,
    generation_allowed: true,
    candidates,
    limitations: generationLimitations(plan),
    reason:
      'Candidates determinísticos produzidos exclusivamente a partir de MessagePlanV1.',
  }
}

export function createCandidateGeneratorV1() {
  return {
    generate: generateMessageCandidatesV1,
  }
}
