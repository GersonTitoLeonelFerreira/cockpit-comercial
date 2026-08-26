import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyBuyerDecisionArchitecture,
  createBuyerDecisionDraft,
} from '../commercial-config/buyer-decision-architecture.ts'
import {
  suggestInitialMethodConstruction,
} from '../commercial-config/assisted-method-construction.ts'
import {
  CommercialMethodConstructionValidationError,
  getCommercialMethodConstruction,
  saveCommercialMethodConstruction,
  startCommercialMethodConstruction,
} from './commercial-method-construction.ts'

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'
const USER_A = '20000000-0000-4000-8000-000000000001'
const USER_B = '20000000-0000-4000-8000-000000000002'

function diagnosis() {
  return {
    company_profile: {
      offer: {
        type: 'service',
        main_offerings: ['Serviço principal'],
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
        price_timing: 'Durante o atendimento.',
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
}

function row(companyId, userId, overrides = {}) {
  return {
    company_id: companyId,
    ready_for_method: true,
    draft_data: diagnosis(),
    method_construction_status: 'not_started',
    method_construction: null,
    method_definition: null,
    method_started_at: null,
    method_updated_at: null,
    updated_at: '2026-08-26T04:00:00.000Z',
    updated_by: userId,
    ...overrides,
  }
}

class FakeQuery {
  constructor(store) {
    this.store = store
    this.filters = []
    this.mode = 'select'
    this.payload = null
  }

  select() {
    return this
  }

  eq(field, value) {
    this.filters.push([field, value])
    return this
  }

  update(payload) {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  matches(item) {
    return this.filters.every(([field, value]) => item[field] === value)
  }

  async maybeSingle() {
    const matches = this.store.filter((item) => this.matches(item))
    return {
      data: matches[0] ?? null,
      error: matches.length > 1 ? { message: 'multiple rows' } : null,
    }
  }

  async single() {
    if (this.mode !== 'update') {
      const found = this.store.find((item) => this.matches(item)) ?? null
      return { data: found, error: found ? null : { message: 'row not found' } }
    }

    const index = this.store.findIndex((item) => this.matches(item))
    if (index < 0) {
      return { data: null, error: { message: 'row not found' } }
    }

    this.store[index] = {
      ...this.store[index],
      ...this.payload,
      updated_at: '2026-08-26T05:00:00.000Z',
    }

    return { data: this.store[index], error: null }
  }
}

function fakeSupabase(store) {
  return {
    from(table) {
      assert.equal(table, 'company_commercial_method_builder_drafts')
      return new FakeQuery(store)
    },
  }
}

function completeConstruction(data, initial) {
  const decision = {
    ...createBuyerDecisionDraft(data),
    confirmed: true,
    solution_customization: 'standard',
    operation_intensity: 'high_volume_short',
    buyer_commitment_signals: [
      'O cliente confirmou que quer comprar nas condições apresentadas.',
    ],
  }

  const calibrated = applyBuyerDecisionArchitecture(
    initial,
    data,
    decision,
  )

  return {
    ...calibrated,
    construction_step: 'review',
    method_name: 'Método de teste',
    method_description: 'Método fictício para validar persistência e revisão.',
    principles: [
      'Avançar somente com evidência suficiente do comprador.',
    ],
    stages: calibrated.stages.map((stage) => ({
      ...stage,
      objective: `Confirmar o resultado necessário da etapa ${stage.name}.`,
      completion_criteria: [
        `O cliente confirmou evidência suficiente para concluir ${stage.name}.`,
      ],
      partial_completion_criteria: [],
      skip_conditions:
        stage.requirement === 'conditional'
          ? [`A oportunidade não exige ${stage.name}.`]
          : [],
      recommended_questions: [],
      common_mistakes: [],
      deepen_when: [
        `Ainda falta informação relevante para concluir ${stage.name}.`,
      ],
      sufficient_when: [
        `A informação confirmada já é suficiente para decidir em ${stage.name}.`,
      ],
      advance_when: [
        `O cliente confirmou o resultado necessário para avançar de ${stage.name}.`,
      ],
      wait_when: [],
      stop_asking_when: [
        `Novas perguntas não alterariam a decisão em ${stage.name}.`,
      ],
      dimensions: [],
    })),
  }
}

test('construção inicia em not_started e muda para editing sem criar method_definition', async () => {
  const store = [row(COMPANY_A, USER_A)]
  const supabase = fakeSupabase(store)

  const before = await getCommercialMethodConstruction(supabase, COMPANY_A)
  assert.equal(before?.status, 'not_started')
  assert.equal(before?.construction, null)
  assert.equal(before?.method_definition, null)

  const started = await startCommercialMethodConstruction(
    supabase,
    COMPANY_A,
    USER_A,
  )

  assert.equal(started.status, 'editing')
  assert.ok(started.construction)
  assert.equal(started.method_definition, null)
  assert.equal(store[0].updated_by, USER_A)
})

test('retomada devolve o mesmo rascunho já iniciado sem regenerar a estrutura', async () => {
  const data = diagnosis()
  const construction = suggestInitialMethodConstruction(data)
  const store = [
    row(COMPANY_A, USER_A, {
      method_construction_status: 'editing',
      method_construction: construction,
      method_started_at: '2026-08-26T04:10:00.000Z',
      method_updated_at: '2026-08-26T04:20:00.000Z',
    }),
  ]

  const resumed = await startCommercialMethodConstruction(
    fakeSupabase(store),
    COMPANY_A,
    USER_A,
  )

  assert.equal(resumed.status, 'editing')
  assert.equal(resumed.construction, construction)
  assert.equal(resumed.method_started_at, '2026-08-26T04:10:00.000Z')
  assert.equal(store[0].method_updated_at, '2026-08-26T04:20:00.000Z')
})

test('rascunho incompleto persiste em editing e method_definition permanece nulo', async () => {
  const data = diagnosis()
  const construction = suggestInitialMethodConstruction(data)
  construction.stages[0].completion_criteria = ['Critério ainda em construção.']

  const store = [row(COMPANY_A, USER_A)]
  const saved = await saveCommercialMethodConstruction(
    fakeSupabase(store),
    COMPANY_A,
    USER_A,
    { status: 'editing', construction },
  )

  assert.equal(saved.status, 'editing')
  assert.deepEqual(
    saved.construction?.stages[0].completion_criteria,
    ['Critério ainda em construção.'],
  )
  assert.equal(saved.method_definition, null)
})

test('review_ready inválido falha antes de persistir method_definition', async () => {
  const data = diagnosis()
  const construction = suggestInitialMethodConstruction(data)
  const store = [
    row(COMPANY_A, USER_A, {
      method_construction_status: 'editing',
      method_construction: construction,
      method_started_at: '2026-08-26T04:10:00.000Z',
      method_updated_at: '2026-08-26T04:20:00.000Z',
    }),
  ]

  await assert.rejects(
    saveCommercialMethodConstruction(
      fakeSupabase(store),
      COMPANY_A,
      USER_A,
      { status: 'review_ready', construction },
    ),
    CommercialMethodConstructionValidationError,
  )

  assert.equal(store[0].method_construction_status, 'editing')
  assert.equal(store[0].method_definition, null)
})

test('review_ready válido materializa commercial-method-v2 sem publicar configuração', async () => {
  const data = diagnosis()
  const initial = suggestInitialMethodConstruction(data)
  const construction = completeConstruction(data, initial)
  const store = [
    row(COMPANY_A, USER_A, {
      method_construction_status: 'editing',
      method_construction: initial,
      method_started_at: '2026-08-26T04:10:00.000Z',
      method_updated_at: '2026-08-26T04:20:00.000Z',
    }),
    row(COMPANY_B, USER_B),
  ]

  const saved = await saveCommercialMethodConstruction(
    fakeSupabase(store),
    COMPANY_A,
    USER_A,
    { status: 'review_ready', construction },
  )

  assert.equal(saved.status, 'review_ready')
  assert.equal(saved.method_definition?.contract_version, 'commercial-method-v2')
  assert.equal(saved.method_definition?.name, 'Método de teste')
  assert.equal(store[1].company_id, COMPANY_B)
  assert.equal(store[1].method_construction_status, 'not_started')
  assert.equal(store[1].method_definition, null)
})
