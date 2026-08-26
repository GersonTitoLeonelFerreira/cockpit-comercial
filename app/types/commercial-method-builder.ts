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

export interface CommercialBuilderOfferItem {
  id: string
  name: string
  kind: 'product' | 'service' | 'both'
  description: string
  benefits: string[]
  differentiators: string[]
  limitations: string[]
}

export interface CommercialBuilderCompanyProfile {
  offer: {
    type: OfferType
    main_offerings: string[]
    has_recurring_revenue: YesNoUnknown
    has_plans_or_packages: YesNoUnknown
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
    },
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
