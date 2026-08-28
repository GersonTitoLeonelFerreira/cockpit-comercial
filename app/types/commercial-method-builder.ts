export const COMMERCIAL_METHOD_BUILDER_CONTRACT_VERSION =
  'commercial-method-builder-v1' as const

export type CommercialMethodBuilderContractVersion =
  typeof COMMERCIAL_METHOD_BUILDER_CONTRACT_VERSION

export type CommercialMethodBuilderStep = 1 | 2 | 3 | 4

export type BuyerType =
  | 'person'
  | 'company'
  | 'both'
  | ''

export type OfferType =
  | 'product'
  | 'service'
  | 'both'
  | ''

export type SalesTiming =
  | 'first_contact'
  | 'days'
  | 'weeks'
  | 'months'
  | 'varies'
  | ''

export type PricingModel =
  | 'fixed'
  | 'variable'
  | 'mixed'
  | 'not_defined'
  | ''

export type DiscountPolicy =
  | 'none'
  | 'seller_with_limit'
  | 'manager_only'
  | 'case_by_case'
  | ''

export type YesNoUnknown = boolean | null

export type YesSometimesNo = '' | 'yes' | 'sometimes' | 'no'

export type NeverSometimesOften = '' | 'rarely' | 'sometimes' | 'often'

export type CustomizationDepth = '' | 'standard' | 'some_adjustments' | 'highly_customized'

export type WorkloadPattern = '' | 'high_volume_short' | 'balanced' | 'few_complex'

export type InitiatorType = '' | 'customer' | 'seller' | 'both'

export type PricingTiming =
  | ''
  | 'early'
  | 'after_understanding'
  | 'after_demo'
  | 'in_proposal'
  | 'varies'

export type PricingFlowModel = '' | 'fixed' | 'ranges' | 'personalized'

export type SellerPriceControl = '' | 'no' | 'with_limit' | 'with_approval'

export type SameAsFirstSale = '' | 'same' | 'similar' | 'different'

export type SalesEventFrequency = '' | 'always' | 'sometimes' | 'optional'

export interface CommercialBuilderSalesEventDetail {
  event: string
  frequency: SalesEventFrequency
  success_definition: string
  depends_on_customer_knowledge: YesSometimesNo
}

/**
 * Camada adicional de granularidade usada pela Jornada Guiada (Onda 8 / Fase 2B).
 * Sempre opcional na leitura de rascunhos antigos: use
 * `normalizeCommercialMethodBuilderData` para preencher valores padrão antes
 * de renderizar ou rotear perguntas. Nunca torne obrigatória em validação de
 * rascunhos existentes — isso quebraria drafts criados pelo formulário
 * anterior (Fase 1/2).
 */
export interface CommercialBuilderBuyerBehavior {
  has_multiple_customer_types: YesNoUnknown
  types_need_different_approach: NeverSometimesOften
  contact_is_decision_maker: YesSometimesNo
  closes_on_first_contact: YesNoUnknown
  workload_pattern: WorkloadPattern
  needs_multiple_conversations: NeverSometimesOften
  initiator: InitiatorType
  arrives_knowing_specific_offer: YesSometimesNo
  arrives_knowing_problem: YesSometimesNo
}

export interface CommercialBuilderProblemContext {
  objective_matters: YesNoUnknown
  problem_matters: YesNoUnknown
  problem_importance_matters: YesNoUnknown
  consequence_influences_decision: YesNoUnknown
  needs_future_vision: YesNoUnknown
}

export interface CommercialBuilderDiscoveryDepth {
  needs_understanding_before_recommending: YesNoUnknown
  what_to_understand: string[]
  changes_recommendation: string[]
  has_nice_to_have_info: YesNoUnknown
  nice_to_have_info: string[]
  too_many_questions_hurts: YesSometimesNo
  stop_asking_when: string
}

export interface CommercialBuilderPresentationDepth {
  style: CustomizationDepth
  must_be_clear_before: string[]
  must_be_clear_to_customer: string[]
  presented_too_early: string[]
  over_explained: string[]
}

export interface CommercialBuilderPricingFlow {
  timing: PricingTiming
  model: PricingFlowModel
  needed_before_pricing: string[]
  early_price_hurts: YesSometimesNo
  seller_can_change_price: SellerPriceControl
  change_rule: string
}

export interface CommercialBuilderObjections {
  common_doubts: string[]
  blocking_objections: string[]
  needs_understanding_before_response: YesSometimesNo
  disqualifying_objections: string[]
  stop_convincing_when: string
}

export interface CommercialBuilderDecisionEvidence {
  real_decision_fact: string
  assumed_commitment: YesNoUnknown
  commitment_description: string
  team_advances_without_commitment: YesNoUnknown
}

export interface CommercialBuilderFormalization {
  steps: string[]
  can_reverse: YesNoUnknown
  operational_approval_after_decision: YesNoUnknown
  sale_completed_when: string
}

export interface CommercialBuilderRenewal {
  has_explicit_renewal: YesNoUnknown
  when_starts: string
  can_expand: YesNoUnknown
  expansion_signal: string
  same_as_first_sale: SameAsFirstSale
}

export interface CommercialBuilderOfferItem {
  id: string
  name: string
  kind: 'product' | 'service' | 'both'
  description: string
  benefits: string[]
  differentiators: string[]
  limitations: string[]
}

export type PurchaseFrequency = '' | 'one_time' | 'recurring' | 'both'

export interface CommercialBuilderCompanyProfile {
  offer: {
    type: OfferType
    main_offerings: string[]
    has_recurring_revenue: YesNoUnknown
    has_plans_or_packages: YesNoUnknown
    customization_depth?: CustomizationDepth
    purchase_frequency?: PurchaseFrequency
    plan_variation_dimensions?: string[]
  }
  customer: {
    buyer_type: BuyerType
    priority_segments: string[]
    decision_makers: string[]
  }
  complexity: {
    typical_timing: SalesTiming
    multiple_decision_makers: YesNoUnknown
    sales_events: string[]
  }
  channels: string[]
  other_channels: string[]
  /** Opcional — ver CommercialBuilderBuyerBehavior. Backfill via normalizer. */
  buyer_behavior?: CommercialBuilderBuyerBehavior
}

export interface CommercialBuilderCommercialRules {
  offers: CommercialBuilderOfferItem[]
  pricing: {
    model: PricingModel
    has_price_table: YesNoUnknown
    seller_can_negotiate: YesNoUnknown
    negotiation_notes: string
  }
  payment: {
    methods: string[]
    allows_installments: YesNoUnknown
    has_recurring_payment: YesNoUnknown
    requires_entry_payment: YesNoUnknown
    notes: string
  }
  discounts: {
    policy: DiscountPolicy
    limit_without_approval: string
    approval_rule: string
  }
  contracts: {
    uses_contract: YesNoUnknown
    formalization: string
    duration: string
    renewal: string
    cancellation: string
  }
  documentation: {
    required_documents: string[]
    required_data: string[]
    prerequisites: string[]
  }
  restrictions: {
    forbidden_promises: string[]
    approval_required: string[]
    incompatible_offers: string[]
    specific_rules: string[]
  }
  policies: {
    cancellation: string
    refund: string
    exchange: string
    deadline: string
    warranty: string
    sla: string
  }
}

export interface CommercialBuilderCurrentSalesProcess {
  lead_entry: {
    sources: string[]
    arrives_knowing_need: YesNoUnknown
    seller_discovery_needed: YesNoUnknown
  }
  discovery: {
    asks_before_presenting: YesNoUnknown
    needs_to_discover: string[]
    indispensable_information: string[]
  }
  presentation: {
    touchpoints: string[]
    notes: string
  }
  commercial: {
    price_timing: string
    has_negotiation: YesNoUnknown
    common_questions: string[]
    common_objections: string[]
  }
  closing: {
    completion_actions: string[]
    notes: string
  }
  follow_up: {
    happens: YesNoUnknown
    reasons: string[]
    cadence: string
  }
  losses: string[]
  /** Campos opcionais adicionados pela Jornada Guiada. Ver normalizer. */
  problem_context?: CommercialBuilderProblemContext
  discovery_depth?: CommercialBuilderDiscoveryDepth
  sales_events_detail?: CommercialBuilderSalesEventDetail[]
  presentation_depth?: CommercialBuilderPresentationDepth
  pricing_flow?: CommercialBuilderPricingFlow
  objections?: CommercialBuilderObjections
  decision_evidence?: CommercialBuilderDecisionEvidence
  formalization?: CommercialBuilderFormalization
  renewal?: CommercialBuilderRenewal
  disqualification_signals?: string[]
}

export interface CommercialMethodBuilderData {
  company_profile: CommercialBuilderCompanyProfile
  commercial_rules: CommercialBuilderCommercialRules
  current_sales_process: CommercialBuilderCurrentSalesProcess
}

export interface CommercialMethodBuilderDraftInput {
  current_step: CommercialMethodBuilderStep
  completed_steps: CommercialMethodBuilderStep[]
  ready_for_method: boolean
  data: CommercialMethodBuilderData
}

export interface CommercialMethodBuilderDraftRecord
  extends CommercialMethodBuilderDraftInput {
  id: string
  company_id: string
  contract_version: CommercialMethodBuilderContractVersion
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

function createOfferItem(): CommercialBuilderOfferItem {
  return {
    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    kind: 'service',
    description: '',
    benefits: [],
    differentiators: [],
    limitations: [],
  }
}

export function createEmptyCommercialMethodBuilderData(): CommercialMethodBuilderData {
  return {
    company_profile: {
      offer: {
        type: '',
        main_offerings: [],
        has_recurring_revenue: null,
        has_plans_or_packages: null,
        customization_depth: '',
        purchase_frequency: '',
        plan_variation_dimensions: [],
      },
      customer: {
        buyer_type: '',
        priority_segments: [],
        decision_makers: [],
      },
      complexity: {
        typical_timing: '',
        multiple_decision_makers: null,
        sales_events: [],
      },
      channels: [],
      other_channels: [],
      buyer_behavior: createEmptyBuyerBehavior(),
    },
    commercial_rules: {
      offers: [createOfferItem()],
      pricing: {
        model: '',
        has_price_table: null,
        seller_can_negotiate: null,
        negotiation_notes: '',
      },
      payment: {
        methods: [],
        allows_installments: null,
        has_recurring_payment: null,
        requires_entry_payment: null,
        notes: '',
      },
      discounts: {
        policy: '',
        limit_without_approval: '',
        approval_rule: '',
      },
      contracts: {
        uses_contract: null,
        formalization: '',
        duration: '',
        renewal: '',
        cancellation: '',
      },
      documentation: {
        required_documents: [],
        required_data: [],
        prerequisites: [],
      },
      restrictions: {
        forbidden_promises: [],
        approval_required: [],
        incompatible_offers: [],
        specific_rules: [],
      },
      policies: {
        cancellation: '',
        refund: '',
        exchange: '',
        deadline: '',
        warranty: '',
        sla: '',
      },
    },
    current_sales_process: {
      lead_entry: {
        sources: [],
        arrives_knowing_need: null,
        seller_discovery_needed: null,
      },
      discovery: {
        asks_before_presenting: null,
        needs_to_discover: [],
        indispensable_information: [],
      },
      presentation: {
        touchpoints: [],
        notes: '',
      },
      commercial: {
        price_timing: '',
        has_negotiation: null,
        common_questions: [],
        common_objections: [],
      },
      closing: {
        completion_actions: [],
        notes: '',
      },
      follow_up: {
        happens: null,
        reasons: [],
        cadence: '',
      },
      losses: [],
      problem_context: createEmptyProblemContext(),
      discovery_depth: createEmptyDiscoveryDepth(),
      sales_events_detail: [],
      presentation_depth: createEmptyPresentationDepth(),
      pricing_flow: createEmptyPricingFlow(),
      objections: createEmptyObjections(),
      decision_evidence: createEmptyDecisionEvidence(),
      formalization: createEmptyFormalization(),
      renewal: createEmptyRenewal(),
      disqualification_signals: [],
    },
  }
}

export function createEmptyBuyerBehavior(): CommercialBuilderBuyerBehavior {
  return {
    has_multiple_customer_types: null,
    types_need_different_approach: '',
    contact_is_decision_maker: '',
    closes_on_first_contact: null,
    workload_pattern: '',
    needs_multiple_conversations: '',
    initiator: '',
    arrives_knowing_specific_offer: '',
    arrives_knowing_problem: '',
  }
}

export function createEmptyProblemContext(): CommercialBuilderProblemContext {
  return {
    objective_matters: null,
    problem_matters: null,
    problem_importance_matters: null,
    consequence_influences_decision: null,
    needs_future_vision: null,
  }
}

export function createEmptyDiscoveryDepth(): CommercialBuilderDiscoveryDepth {
  return {
    needs_understanding_before_recommending: null,
    what_to_understand: [],
    changes_recommendation: [],
    has_nice_to_have_info: null,
    nice_to_have_info: [],
    too_many_questions_hurts: '',
    stop_asking_when: '',
  }
}

export function createEmptyPresentationDepth(): CommercialBuilderPresentationDepth {
  return {
    style: '',
    must_be_clear_before: [],
    must_be_clear_to_customer: [],
    presented_too_early: [],
    over_explained: [],
  }
}

export function createEmptyPricingFlow(): CommercialBuilderPricingFlow {
  return {
    timing: '',
    model: '',
    needed_before_pricing: [],
    early_price_hurts: '',
    seller_can_change_price: '',
    change_rule: '',
  }
}

export function createEmptyObjections(): CommercialBuilderObjections {
  return {
    common_doubts: [],
    blocking_objections: [],
    needs_understanding_before_response: '',
    disqualifying_objections: [],
    stop_convincing_when: '',
  }
}

export function createEmptyDecisionEvidence(): CommercialBuilderDecisionEvidence {
  return {
    real_decision_fact: '',
    assumed_commitment: null,
    commitment_description: '',
    team_advances_without_commitment: null,
  }
}

export function createEmptyFormalization(): CommercialBuilderFormalization {
  return {
    steps: [],
    can_reverse: null,
    operational_approval_after_decision: null,
    sale_completed_when: '',
  }
}

export function createEmptyRenewal(): CommercialBuilderRenewal {
  return {
    has_explicit_renewal: null,
    when_starts: '',
    can_expand: null,
    expansion_signal: '',
    same_as_first_sale: '',
  }
}

export function createEmptyCommercialMethodBuilderDraft(): CommercialMethodBuilderDraftInput {
  return {
    current_step: 1,
    completed_steps: [],
    ready_for_method: false,
    data: createEmptyCommercialMethodBuilderData(),
  }
}
