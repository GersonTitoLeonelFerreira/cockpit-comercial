import type {
  CommercialMethodBuilderData,
  CommercialMethodBuilderDraftInput,
  CommercialMethodBuilderStep,
} from '@/app/types/commercial-method-builder'

const VALID_STEPS = new Set([1, 2, 3, 4])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean'
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'string'
}

function isCompanyProfile(value: unknown): boolean {
  if (!isRecord(value)) return false
  const offer = value.offer
  const customer = value.customer
  const complexity = value.complexity

  if (!isRecord(offer) || !isRecord(customer) || !isRecord(complexity)) {
    return false
  }

  return (
    hasString(offer, 'type') &&
    isStringArray(offer.main_offerings) &&
    isNullableBoolean(offer.has_recurring_revenue) &&
    isNullableBoolean(offer.has_plans_or_packages) &&
    hasString(customer, 'buyer_type') &&
    isStringArray(customer.priority_segments) &&
    isStringArray(customer.decision_makers) &&
    hasString(complexity, 'typical_timing') &&
    isNullableBoolean(complexity.multiple_decision_makers) &&
    isStringArray(complexity.sales_events) &&
    isStringArray(value.channels) &&
    isStringArray(value.other_channels)
  )
}

function isOfferItem(value: unknown): boolean {
  if (!isRecord(value)) return false

  return (
    hasString(value, 'id') &&
    hasString(value, 'name') &&
    hasString(value, 'kind') &&
    hasString(value, 'description') &&
    isStringArray(value.benefits) &&
    isStringArray(value.differentiators) &&
    isStringArray(value.limitations)
  )
}

function isCommercialRules(value: unknown): boolean {
  if (!isRecord(value)) return false

  const pricing = value.pricing
  const payment = value.payment
  const discounts = value.discounts
  const contracts = value.contracts
  const documentation = value.documentation
  const restrictions = value.restrictions
  const policies = value.policies

  if (
    !Array.isArray(value.offers) ||
    !value.offers.every(isOfferItem) ||
    !isRecord(pricing) ||
    !isRecord(payment) ||
    !isRecord(discounts) ||
    !isRecord(contracts) ||
    !isRecord(documentation) ||
    !isRecord(restrictions) ||
    !isRecord(policies)
  ) {
    return false
  }

  return (
    hasString(pricing, 'model') &&
    isNullableBoolean(pricing.has_price_table) &&
    isNullableBoolean(pricing.seller_can_negotiate) &&
    hasString(pricing, 'negotiation_notes') &&
    isStringArray(payment.methods) &&
    isNullableBoolean(payment.allows_installments) &&
    isNullableBoolean(payment.has_recurring_payment) &&
    isNullableBoolean(payment.requires_entry_payment) &&
    hasString(payment, 'notes') &&
    hasString(discounts, 'policy') &&
    hasString(discounts, 'limit_without_approval') &&
    hasString(discounts, 'approval_rule') &&
    isNullableBoolean(contracts.uses_contract) &&
    hasString(contracts, 'formalization') &&
    hasString(contracts, 'duration') &&
    hasString(contracts, 'renewal') &&
    hasString(contracts, 'cancellation') &&
    isStringArray(documentation.required_documents) &&
    isStringArray(documentation.required_data) &&
    isStringArray(documentation.prerequisites) &&
    isStringArray(restrictions.forbidden_promises) &&
    isStringArray(restrictions.approval_required) &&
    isStringArray(restrictions.incompatible_offers) &&
    isStringArray(restrictions.specific_rules) &&
    hasString(policies, 'cancellation') &&
    hasString(policies, 'refund') &&
    hasString(policies, 'exchange') &&
    hasString(policies, 'deadline') &&
    hasString(policies, 'warranty') &&
    hasString(policies, 'sla')
  )
}

function isCurrentSalesProcess(value: unknown): boolean {
  if (!isRecord(value)) return false

  const leadEntry = value.lead_entry
  const discovery = value.discovery
  const presentation = value.presentation
  const commercial = value.commercial
  const closing = value.closing
  const followUp = value.follow_up

  if (
    !isRecord(leadEntry) ||
    !isRecord(discovery) ||
    !isRecord(presentation) ||
    !isRecord(commercial) ||
    !isRecord(closing) ||
    !isRecord(followUp)
  ) {
    return false
  }

  return (
    isStringArray(leadEntry.sources) &&
    isNullableBoolean(leadEntry.arrives_knowing_need) &&
    isNullableBoolean(leadEntry.seller_discovery_needed) &&
    isNullableBoolean(discovery.asks_before_presenting) &&
    isStringArray(discovery.needs_to_discover) &&
    isStringArray(discovery.indispensable_information) &&
    isStringArray(presentation.touchpoints) &&
    hasString(presentation, 'notes') &&
    hasString(commercial, 'price_timing') &&
    isNullableBoolean(commercial.has_negotiation) &&
    isStringArray(commercial.common_questions) &&
    isStringArray(commercial.common_objections) &&
    isStringArray(closing.completion_actions) &&
    hasString(closing, 'notes') &&
    isNullableBoolean(followUp.happens) &&
    isStringArray(followUp.reasons) &&
    hasString(followUp, 'cadence') &&
    isStringArray(value.losses)
  )
}

export function isCommercialMethodBuilderData(
  value: unknown,
): value is CommercialMethodBuilderData {
  if (!isRecord(value)) return false

  return (
    isCompanyProfile(value.company_profile) &&
    isCommercialRules(value.commercial_rules) &&
    isCurrentSalesProcess(value.current_sales_process)
  )
}

export function parseCommercialMethodBuilderDraftInput(
  value: unknown,
): CommercialMethodBuilderDraftInput | null {
  if (!isRecord(value)) return null

  const currentStep = value.current_step
  const completedSteps = value.completed_steps

  if (
    typeof currentStep !== 'number' ||
    !VALID_STEPS.has(currentStep) ||
    !Array.isArray(completedSteps) ||
    !completedSteps.every(
      (step) => typeof step === 'number' && VALID_STEPS.has(step),
    ) ||
    typeof value.ready_for_method !== 'boolean' ||
    !isCommercialMethodBuilderData(value.data)
  ) {
    return null
  }

  return value as unknown as CommercialMethodBuilderDraftInput
}

export function getCommercialMethodBuilderVisibility(
  data: CommercialMethodBuilderData,
) {
  const buyerType = data.company_profile.customer.buyer_type
  const discountPolicy = data.commercial_rules.discounts.policy
  const usesContract = data.commercial_rules.contracts.uses_contract

  return {
    showB2BDecisionMakers:
      buyerType === 'company' || buyerType === 'both',
    showContractDetails: usesContract === true,
    showDiscountLimit: discountPolicy === 'seller_with_limit',
    showDiscountApprovalRule:
      discountPolicy === 'seller_with_limit' ||
      discountPolicy === 'manager_only' ||
      discountPolicy === 'case_by_case',
  }
}

export function goToPreviousBuilderStep(
  step: CommercialMethodBuilderStep,
): CommercialMethodBuilderStep {
  return Math.max(1, step - 1) as CommercialMethodBuilderStep
}

export function advanceCommercialMethodBuilder(
  step: CommercialMethodBuilderStep,
  completedSteps: CommercialMethodBuilderStep[],
) {
  const completed = Array.from(
    new Set([...completedSteps, step]),
  ).sort() as CommercialMethodBuilderStep[]

  return {
    current_step: Math.min(4, step + 1) as CommercialMethodBuilderStep,
    completed_steps: completed,
  }
}

export function validateCommercialMethodBuilderStep(
  step: CommercialMethodBuilderStep,
  data: CommercialMethodBuilderData,
): string[] {
  if (step === 1) {
    const issues: string[] = []
    const profile = data.company_profile

    if (!profile.offer.type) issues.push('Informe se a empresa vende produto, serviço ou ambos.')
    if (profile.offer.main_offerings.length === 0) issues.push('Informe pelo menos uma oferta principal.')
    if (!profile.customer.buyer_type) issues.push('Informe quem normalmente compra.')
    if (!profile.complexity.typical_timing) issues.push('Informe quanto tempo a venda normalmente leva.')
    if (profile.channels.length === 0 && profile.other_channels.length === 0) {
      issues.push('Informe pelo menos um canal comercial.')
    }

    return issues
  }

  if (step === 2) {
    const issues: string[] = []
    const rules = data.commercial_rules

    if (!rules.pricing.model) issues.push('Informe como o preço é definido.')
    if (rules.pricing.seller_can_negotiate === null) issues.push('Informe se o vendedor pode negociar condições.')
    if (!rules.discounts.policy) issues.push('Informe como funciona a política de descontos.')
    if (rules.contracts.uses_contract === null) issues.push('Informe se a empresa utiliza contrato.')

    return issues
  }

  if (step === 3) {
    const issues: string[] = []
    const process = data.current_sales_process

    if (process.lead_entry.sources.length === 0) issues.push('Informe de onde os leads normalmente chegam.')
    if (process.lead_entry.seller_discovery_needed === null) issues.push('Informe se o vendedor precisa descobrir a necessidade.')
    if (!process.commercial.price_timing.trim()) issues.push('Informe quando o preço costuma ser apresentado.')
    if (process.closing.completion_actions.length === 0) issues.push('Informe o que conclui a venda.')
    if (process.follow_up.happens === null) issues.push('Informe se existem vendas que exigem retorno.')
    if (process.losses.length === 0) issues.push('Informe pelo menos um motivo comum de perda.')

    return issues
  }

  return []
}

function labelList(values: string[], empty = 'Não informado'): string {
  const clean = values.map((value) => value.trim()).filter(Boolean)
  return clean.length > 0 ? clean.join(', ') : empty
}

function yesNo(value: boolean | null): string {
  if (value === true) return 'Sim'
  if (value === false) return 'Não'
  return 'Não informado'
}

export function buildCommercialMethodBuilderReview(
  data: CommercialMethodBuilderData,
) {
  const profile = data.company_profile
  const rules = data.commercial_rules
  const process = data.current_sales_process

  return [
    {
      key: 'operation',
      title: 'Sua operação',
      step: 1 as const,
      items: [
        `Cliente: ${profile.customer.buyer_type || 'Não informado'}`,
        `Canais: ${labelList([...profile.channels, ...profile.other_channels])}`,
        `Tempo típico da venda: ${profile.complexity.typical_timing || 'Não informado'}`,
        `Mais de uma pessoa decide: ${yesNo(profile.complexity.multiple_decision_makers)}`,
      ],
    },
    {
      key: 'offer',
      title: 'Oferta',
      step: 1 as const,
      items: [
        `Formato: ${profile.offer.type || 'Não informado'}`,
        `Principais ofertas: ${labelList(profile.offer.main_offerings)}`,
        `Existe recorrência: ${yesNo(profile.offer.has_recurring_revenue)}`,
        `Existem planos ou pacotes: ${yesNo(profile.offer.has_plans_or_packages)}`,
      ],
    },
    {
      key: 'process',
      title: 'Como a venda acontece hoje',
      step: 3 as const,
      items: [
        `Origem dos leads: ${labelList(process.lead_entry.sources)}`,
        `Apresentação: ${labelList(process.presentation.touchpoints)}`,
        `Fechamento: ${labelList(process.closing.completion_actions)}`,
        `Follow-up: ${yesNo(process.follow_up.happens)}`,
        `Perdas: ${labelList(process.losses)}`,
      ],
    },
    {
      key: 'rules',
      title: 'Regras comerciais',
      step: 2 as const,
      items: [
        `Preço: ${rules.pricing.model || 'Não informado'}`,
        `Pagamento: ${labelList(rules.payment.methods)}`,
        `Desconto: ${rules.discounts.policy || 'Não informado'}`,
        `Contrato: ${yesNo(rules.contracts.uses_contract)}`,
      ],
    },
  ]
}
