import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyBuyerDecisionArchitecture,
  buildBuyerDecisionStageAssist,
  createBuyerDecisionDraft,
  getBuyerDecisionBlockingIssues,
  getBuyerDecisionProfile,
  getBuyerDecisionVisibility,
  getSellerActivityOnlyGuidance,
  validateBuyerDecisionDraft,
} from './buyer-decision-architecture.ts'
import {
  suggestInitialMethodConstruction,
} from './assisted-method-construction.ts'

function diagnosis(overrides = {}) {
  const base = {
    company_profile: {
      offer: {
        type: 'product',
        main_offerings: ['Oferta principal'],
        has_recurring_revenue: false,
        has_plans_or_packages: false,
      },
      customer: {
        buyer_type: 'person',
        priority_segments: [],
        decision_makers: [],
      },
      complexity: {
        typical_timing: 'first_contact',
        multiple_decision_makers: false,
        sales_events: [],
      },
      channels: ['Presencial'],
      other_channels: [],
    },
    commercial_rules: {
      offers: [],
      pricing: {
        model: 'fixed',
        has_price_table: true,
        seller_can_negotiate: false,
        negotiation_notes: '',
      },
      payment: {
        methods: ['Cartão'],
        allows_installments: true,
        has_recurring_payment: false,
        requires_entry_payment: false,
        notes: '',
      },
      discounts: {
        policy: 'none',
        limit_without_approval: '',
        approval_rule: '',
      },
      contracts: {
        uses_contract: false,
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
        sources: ['Loja'],
        arrives_knowing_need: true,
        seller_discovery_needed: false,
      },
      discovery: {
        asks_before_presenting: false,
        needs_to_discover: [],
        indispensable_information: [],
      },
      presentation: {
        touchpoints: [],
        notes: '',
      },
      commercial: {
        price_timing: 'No atendimento.',
        has_negotiation: false,
        common_questions: [],
        common_objections: [],
      },
      closing: {
        completion_actions: ['Pagamento'],
        notes: '',
      },
      follow_up: {
        happens: false,
        reasons: [],
        cadence: '',
      },
      losses: ['Preço'],
    },
  }

  return {
    ...base,
    ...overrides,
    company_profile: {
      ...base.company_profile,
      ...(overrides.company_profile ?? {}),
      offer: {
        ...base.company_profile.offer,
        ...(overrides.company_profile?.offer ?? {}),
      },
      customer: {
        ...base.company_profile.customer,
        ...(overrides.company_profile?.customer ?? {}),
      },
      complexity: {
        ...base.company_profile.complexity,
        ...(overrides.company_profile?.complexity ?? {}),
      },
    },
    commercial_rules: {
      ...base.commercial_rules,
      ...(overrides.commercial_rules ?? {}),
      pricing: {
        ...base.commercial_rules.pricing,
        ...(overrides.commercial_rules?.pricing ?? {}),
      },
      contracts: {
        ...base.commercial_rules.contracts,
        ...(overrides.commercial_rules?.contracts ?? {}),
      },
    },
    current_sales_process: {
      ...base.current_sales_process,
      ...(overrides.current_sales_process ?? {}),
      lead_entry: {
        ...base.current_sales_process.lead_entry,
        ...(overrides.current_sales_process?.lead_entry ?? {}),
      },
      discovery: {
        ...base.current_sales_process.discovery,
        ...(overrides.current_sales_process?.discovery ?? {}),
      },
      presentation: {
        ...base.current_sales_process.presentation,
        ...(overrides.current_sales_process?.presentation ?? {}),
      },
      commercial: {
        ...base.current_sales_process.commercial,
        ...(overrides.current_sales_process?.commercial ?? {}),
      },
      closing: {
        ...base.current_sales_process.closing,
        ...(overrides.current_sales_process?.closing ?? {}),
      },
      follow_up: {
        ...base.current_sales_process.follow_up,
        ...(overrides.current_sales_process?.follow_up ?? {}),
      },
    },
  }
}

function decisionFor(data, overrides = {}) {
  const visibility = getBuyerDecisionVisibility(data)
  const initial = createBuyerDecisionDraft(data)
  const base = {
    ...initial,
    approval_or_blocker: visibility.show_approval_and_blockers ? 'no' : '',
    decision_criteria: visibility.show_decision_criteria ? ['Preço'] : [],
    formal_process: visibility.show_formal_process ? 'no' : '',
    investment_justification: visibility.show_investment_justification ? 'no' : '',
    real_urgency: visibility.show_real_urgency ? 'no' : '',
    event_success_criteria: initial.event_success_criteria.map((item) => ({
      ...item,
      criteria: [`O cliente validou o objetivo necessário em ${item.event}.`],
    })),
    solution_customization: 'standard',
    operation_intensity: 'high_volume_short',
    buyer_commitment_signals: ['O cliente confirmou que quer comprar nas condições apresentadas'],
  }

  return {
    ...base,
    ...overrides,
  }
}

function stageNames(draft) {
  return draft.stages.map((stage) => stage.name)
}

test('A) B2C simples oculta perguntas enterprise e mantém método curto', () => {
  const data = diagnosis({
    company_profile: {
      complexity: {
        sales_events: ['Tour'],
      },
    },
    current_sales_process: {
      presentation: { touchpoints: ['Tour'] },
    },
  })
  const visibility = getBuyerDecisionVisibility(data)

  assert.equal(visibility.show_approval_and_blockers, false)
  assert.equal(visibility.show_formal_process, false)
  assert.equal(visibility.show_investment_justification, false)

  const decision = decisionFor(data)
  assert.deepEqual(validateBuyerDecisionDraft(data, decision), [])
  const profile = getBuyerDecisionProfile(data, decision)
  assert.equal(profile.depth, 'light')

  const applied = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(data),
    data,
    decision,
  )

  assert.ok(applied.stages.length <= 4)
  assert.equal(stageNames(applied).includes('Alinhamento da decisão'), false)
  assert.equal(stageNames(applied).includes('Formalização'), false)
  assert.doesNotMatch(
    `${applied.principles.join(' ')} ${applied.stages.flatMap((stage) => stage.suggestion_basis).join(' ')}`,
    /champion|economic buyer|procurement/i,
  )
})

test('B) B2B simples ganha alguma profundidade sem inventar processo formal', () => {
  const data = diagnosis({
    company_profile: {
      customer: { buyer_type: 'company' },
      complexity: {
        typical_timing: 'days',
        multiple_decision_makers: false,
        sales_events: ['Proposta formal'],
      },
    },
    current_sales_process: {
      presentation: { touchpoints: ['Proposta'] },
    },
  })
  const decision = decisionFor(data, {
    approval_or_blocker: 'no',
    decision_criteria: ['Preço', 'Suporte'],
    real_urgency: 'no',
    operation_intensity: 'balanced',
  })

  assert.deepEqual(validateBuyerDecisionDraft(data, decision), [])
  const profile = getBuyerDecisionProfile(data, decision)
  assert.equal(profile.depth, 'moderate')

  const applied = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(data),
    data,
    decision,
  )

  assert.equal(stageNames(applied).includes('Alinhamento da decisão'), false)
  assert.equal(stageNames(applied).includes('Formalização'), false)
  assert.doesNotMatch(
    applied.stages.flatMap((stage) => stage.suggestion_basis).join(' '),
    /jur[ií]dico|compras|seguran[cç]a|cadastro de fornecedor/i,
  )
})

test('C) B2B complexo aprofunda decisão, critérios e formalização sem inventar fatos', () => {
  const data = diagnosis({
    company_profile: {
      customer: { buyer_type: 'company' },
      complexity: {
        typical_timing: 'months',
        multiple_decision_makers: true,
        sales_events: ['Demonstração', 'Proposta formal'],
      },
    },
    commercial_rules: {
      pricing: { model: 'variable' },
      contracts: { uses_contract: true },
    },
    current_sales_process: {
      lead_entry: { seller_discovery_needed: true },
      discovery: {
        asks_before_presenting: true,
        needs_to_discover: ['necessidade técnica'],
      },
      presentation: { touchpoints: ['Demonstração', 'Proposta'] },
      follow_up: { happens: true, reasons: ['Aprovação interna'] },
    },
  })
  const initial = createBuyerDecisionDraft(data)
  const decision = {
    ...initial,
    approval_or_blocker: 'yes',
    participant_roles: ['TI', 'Jurídico', 'Compras'],
    decision_criteria: ['Integração', 'Segurança'],
    formal_process: 'yes',
    formal_process_steps: ['TI', 'Jurídico', 'Compras'],
    investment_justification: 'yes',
    investment_justification_notes: 'Precisa justificar ganho operacional.',
    real_urgency: 'yes',
    urgency_drivers: ['Fim de contrato atual'],
    event_success_criteria: initial.event_success_criteria.map((item) => ({
      ...item,
      criteria: [
        item.event === 'Demonstração'
          ? 'O cliente validou que a integração atende ao requisito técnico'
          : 'Os responsáveis concordaram em avaliar as condições apresentadas',
      ],
    })),
    solution_customization: 'highly_customized',
    operation_intensity: 'few_complex',
    buyer_commitment_signals: ['Os responsáveis confirmaram que querem contratar nas condições acordadas'],
    formalization_steps: ['Assinatura do contrato', 'Cadastro de fornecedor'],
  }

  assert.deepEqual(validateBuyerDecisionDraft(data, decision), [])
  const profile = getBuyerDecisionProfile(data, decision)
  assert.equal(profile.depth, 'deep')
  assert.equal(profile.decision_process, 'required')
  assert.equal(profile.formal_buying_process, 'required')

  const applied = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(data),
    data,
    decision,
  )
  const names = stageNames(applied)

  assert.ok(names.includes('Alinhamento da decisão'))
  assert.ok(names.includes('Formalização'))
  assert.ok(applied.principles.some((item) => /fatores que pesam|escolha/i.test(item)))
  assert.ok(applied.principles.some((item) => /aprova|impedir/i.test(item)))

  const basis = applied.stages.flatMap((stage) => stage.suggestion_basis).join(' ')
  assert.match(basis, /TI/)
  assert.match(basis, /Jur[ií]dico/)
  assert.match(basis, /Compras/)
  assert.doesNotMatch(basis, /Financeiro/)
})

test('D) varejo transacional reduz progressive disclosure e preserva estrutura mínima', () => {
  const data = diagnosis()
  const visibility = getBuyerDecisionVisibility(data)

  assert.equal(visibility.show_approval_and_blockers, false)
  assert.equal(visibility.show_decision_criteria, false)
  assert.equal(visibility.show_formal_process, false)
  assert.equal(visibility.show_investment_justification, false)
  assert.equal(visibility.show_real_urgency, false)
  assert.equal(visibility.show_event_purpose, false)

  const decision = decisionFor(data)
  const applied = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(data),
    data,
    decision,
  )

  assert.equal(getBuyerDecisionProfile(data, decision).depth, 'light')
  assert.ok(applied.stages.length <= 2)
  assert.equal(stageNames(applied).includes('Alinhamento da decisão'), false)
  assert.equal(stageNames(applied).includes('Formalização'), false)
})

test('E) decisão de compra permanece separada de pagamento, assinatura e cadastro', () => {
  const data = diagnosis({
    company_profile: {
      customer: { buyer_type: 'company' },
      complexity: { typical_timing: 'weeks', multiple_decision_makers: true },
    },
    commercial_rules: {
      contracts: { uses_contract: true },
    },
  })
  const decision = decisionFor(data, {
    approval_or_blocker: 'yes',
    participant_roles: ['Diretor'],
    decision_criteria: ['Resultado esperado'],
    formal_process: 'yes',
    formal_process_steps: ['Jurídico'],
    investment_justification: 'no',
    real_urgency: 'no',
    operation_intensity: 'few_complex',
    buyer_commitment_signals: ['O diretor confirmou que quer contratar nas condições acordadas'],
    formalization_steps: ['Pagamento', 'Assinatura', 'Cadastro'],
  })

  const applied = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(data),
    data,
    decision,
  )
  const decisionStage = applied.stages.find((stage) => stage.name === 'Decisão de compra')
  const formalizationStage = applied.stages.find((stage) => stage.name === 'Formalização')

  assert.ok(decisionStage)
  assert.ok(formalizationStage)
  assert.match(decisionStage.suggestion_basis.join(' '), /diretor confirmou/i)
  assert.doesNotMatch(decisionStage.suggestion_basis.join(' '), /pagamento|assinatura|cadastro/i)
  assert.match(formalizationStage.suggestion_basis.join(' '), /pagamento/i)

  const assist = buildBuyerDecisionStageAssist(decisionStage, data, applied.buyer_decision)
  assert.ok(assist.completion_criteria.some((item) => /diretor confirmou/i.test(item)))
  assert.equal(assist.completion_criteria.some((item) => /pagamento|assinatura|cadastro/i.test(item)), false)
})

test('F) demo realizada não conta como avanço sem evidência do comprador', () => {
  assert.ok(getSellerActivityOnlyGuidance('Demo realizada'))
  assert.ok(getSellerActivityOnlyGuidance('Enviei proposta'))
  assert.equal(
    getSellerActivityOnlyGuidance('O cliente confirmou que a integração atende ao requisito necessário'),
    null,
  )

  const data = diagnosis({
    company_profile: {
      complexity: { sales_events: ['Demonstração'] },
    },
    current_sales_process: {
      presentation: { touchpoints: ['Demonstração'] },
    },
  })
  const decision = decisionFor(data)
  const applied = applyBuyerDecisionArchitecture(
    suggestInitialMethodConstruction(data),
    data,
    decision,
  )
  const demo = applied.stages.find((stage) => stage.name === 'Demonstração')
  assert.ok(demo)

  demo.completion_criteria = ['Demo realizada']
  demo.advance_when = ['Enviei proposta']
  const blocked = getBuyerDecisionBlockingIssues(applied, data)
  assert.ok(blocked.some((issue) => /Atividade do vendedor não prova avanço/.test(issue.message)))

  demo.completion_criteria = ['O cliente confirmou que a demonstração respondeu ao requisito necessário']
  demo.advance_when = ['O cliente confirmou o próximo passo combinado']
  const safe = getBuyerDecisionBlockingIssues(applied, data)
  assert.equal(safe.some((issue) => /Atividade do vendedor não prova avanço/.test(issue.message)), false)
})
