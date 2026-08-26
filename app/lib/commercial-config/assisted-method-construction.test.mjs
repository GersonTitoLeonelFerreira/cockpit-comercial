import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendConstructionStage,
  auditCommercialMethodConstruction,
  buildCommercialMethodDefinitionFromConstruction,
  getGenericCommercialMethodGuidance,
  moveConstructionStage,
  removeConstructionStage,
  suggestInitialMethodConstruction,
} from './assisted-method-construction.ts'
import {
  validateCommercialMethodDefinition,
} from '../companion/commercial-method-contract.ts'

function diagnosis(overrides = {}) {
  const base = {
    company_profile: {
      offer: {
        type: 'service',
        main_offerings: ['Plano principal'],
        has_recurring_revenue: true,
        has_plans_or_packages: true,
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
      channels: ['WhatsApp'],
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
        methods: ['PIX', 'Cartão'],
        allows_installments: true,
        has_recurring_payment: true,
        requires_entry_payment: false,
        notes: '',
      },
      discounts: {
        policy: 'manager_only',
        limit_without_approval: '',
        approval_rule: 'Falar com gestor',
      },
      contracts: {
        uses_contract: true,
        formalization: 'Digital',
        duration: '12 meses',
        renewal: 'Automática',
        cancellation: 'Conforme contrato',
      },
      documentation: {
        required_documents: [],
        required_data: [],
        prerequisites: [],
      },
      restrictions: {
        forbidden_promises: ['Não prometer resultado garantido'],
        approval_required: ['Desconto'],
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
        sources: ['WhatsApp'],
        arrives_knowing_need: false,
        seller_discovery_needed: true,
      },
      discovery: {
        asks_before_presenting: true,
        needs_to_discover: ['objetivo principal'],
        indispensable_information: ['motivo do contato'],
      },
      presentation: {
        touchpoints: [],
        notes: '',
      },
      commercial: {
        price_timing: 'Depois de entender a necessidade.',
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
      complexity: {
        ...base.company_profile.complexity,
        ...(overrides.company_profile?.complexity ?? {}),
      },
    },
    commercial_rules: {
      ...base.commercial_rules,
      ...(overrides.commercial_rules ?? {}),
      discounts: {
        ...base.commercial_rules.discounts,
        ...(overrides.commercial_rules?.discounts ?? {}),
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

function fillStage(stage, label = stage.name) {
  return {
    ...stage,
    name: label,
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etapa',
    objective: `Compreender ou concluir o resultado fictício da etapa ${label}.`,
    completion_criteria: [`Existe evidência fictícia suficiente para ${label}.`],
    partial_completion_criteria: [],
    skip_conditions: stage.requirement === 'conditional'
      ? [`A oportunidade fictícia não exige ${label}.`]
      : [],
    recommended_questions: [`Pergunta fictícia confirmada para ${label}?`],
    common_mistakes: [`Erro fictício a evitar em ${label}.`],
    deepen_when: [`Ainda falta informação fictícia relevante em ${label}.`],
    sufficient_when: [`A informação fictícia de ${label} já permite decidir.`],
    advance_when: [`A evidência fictícia de ${label} está confirmada.`],
    wait_when: [],
    stop_asking_when: [`Novas perguntas fictícias não alterariam a decisão em ${label}.`],
    dimensions: [],
  }
}

function completeDraft(draft) {
  return {
    ...draft,
    method_name: 'Método de teste',
    method_description: 'Método fictício criado somente para validar o construtor.',
    principles: ['Usar apenas fatos confirmados no cenário fictício.'],
    stages: draft.stages.map((stage) => fillStage(stage)),
  }
}

test('1) diagnóstico simples gera sugestão curta', () => {
  const draft = suggestInitialMethodConstruction(diagnosis())
  assert.ok(draft.stages.length >= 2)
  assert.ok(draft.stages.length <= 4)
})

test('2) venda complexa pode gerar estrutura maior', () => {
  const draft = suggestInitialMethodConstruction(diagnosis({
    company_profile: {
      complexity: {
        typical_timing: 'months',
        multiple_decision_makers: true,
        sales_events: ['Demonstração', 'Proposta formal'],
      },
    },
    current_sales_process: {
      commercial: { has_negotiation: true },
      follow_up: { happens: true, reasons: ['Decisão interna'] },
    },
  }))

  assert.ok(draft.stages.length >= 5)
})

test('3) sem proposta formal não força etapa Proposta', () => {
  const draft = suggestInitialMethodConstruction(diagnosis())
  assert.equal(draft.stages.some((stage) => /proposta/i.test(stage.name)), false)
})

test('4) tour presente pode aparecer como sugestão', () => {
  const draft = suggestInitialMethodConstruction(diagnosis({
    company_profile: { complexity: { sales_events: ['Tour'] } },
    current_sales_process: { presentation: { touchpoints: ['Tour'] } },
  }))
  assert.equal(draft.stages.some((stage) => stage.name === 'Tour'), true)
})

test('5) gestor pode rejeitar etapa sugerida', () => {
  const draft = suggestInitialMethodConstruction(diagnosis())
  const rejectedId = draft.stages[0].id
  const next = removeConstructionStage(draft, rejectedId)
  assert.equal(next.stages.some((stage) => stage.id === rejectedId), false)
})

test('6) gestor pode adicionar e reordenar etapas', () => {
  const initial = suggestInitialMethodConstruction(diagnosis())
  const added = appendConstructionStage(initial, 'Etapa criada pelo gestor')
  const id = added.stages.at(-1).id
  const moved = moveConstructionStage(added, id, -1)
  assert.equal(moved.stages.at(-2).id, id)
})

test('7) objetivo genérico recebe orientação pedagógica', () => {
  assert.ok(getGenericCommercialMethodGuidance('Vender'))
  assert.ok(getGenericCommercialMethodGuidance('Entender o cliente'))
  assert.equal(getGenericCommercialMethodGuidance('Identificar o motivo principal do contato e o resultado esperado.'), null)
})

test('8) critérios confirmados persistem na saída do contrato', () => {
  const draft = completeDraft(suggestInitialMethodConstruction(diagnosis()))
  draft.stages[0].completion_criteria = ['Critério confirmado pelo gestor.']
  const { definition } = buildCommercialMethodDefinitionFromConstruction(draft)
  assert.deepEqual(definition.stages[0].completion_criteria, ['Critério confirmado pelo gestor.'])
})

test('9) pergunta sugerida pode ser editada antes de chegar ao contrato', () => {
  const draft = completeDraft(suggestInitialMethodConstruction(diagnosis()))
  draft.stages[0].recommended_questions = ['Pergunta editada pelo gestor?']
  const { definition } = buildCommercialMethodDefinitionFromConstruction(draft)
  assert.deepEqual(definition.stages[0].recommended_questions, ['Pergunta editada pelo gestor?'])
})

test('10) Base Comercial não vira etapa', () => {
  const draft = suggestInitialMethodConstruction(diagnosis({
    commercial_rules: {
      discounts: { policy: 'manager_only', approval_rule: 'Gestor aprova 10%' },
      contracts: { uses_contract: true, duration: '12 meses' },
    },
  }))
  const names = draft.stages.map((stage) => stage.name.toLowerCase()).join(' | ')
  assert.doesNotMatch(names, /pix|cart[aã]o|desconto|contrato|12 meses/)
})

test('11) saída completa é compatível com commercial-method-v2', () => {
  const draft = completeDraft(suggestInitialMethodConstruction(diagnosis()))
  const { definition, validation } = buildCommercialMethodDefinitionFromConstruction(draft)
  assert.equal(definition.contract_version, 'commercial-method-v2')
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
  assert.equal(validateCommercialMethodDefinition(definition).valid, true)
})

test('diagnóstico de qualidade usa evidências e não inventa score percentual', () => {
  const draft = suggestInitialMethodConstruction(diagnosis())
  const audit = auditCommercialMethodConstruction(draft, diagnosis())
  assert.ok(audit.some((item) => item.level === 'warning'))
  assert.equal(audit.some((item) => /%|pontua[cç][aã]o|score/i.test(item.message)), false)
})

test('ATO test-only: diagnóstico com Tour permite chegar a Acolher / Tour / Obter sem semântica real pré-definida', () => {
  let draft = suggestInitialMethodConstruction(diagnosis({
    company_profile: { complexity: { sales_events: ['Tour'] } },
    current_sales_process: { presentation: { touchpoints: ['Tour'] } },
  }))

  assert.equal(draft.stages.length, 3)
  assert.equal(draft.stages[1].name, 'Tour')

  draft = {
    ...draft,
    method_name: 'ATO — fixture fictícia',
    method_description: 'Semântica fictícia criada exclusivamente para teste.',
    principles: ['Princípio fictício de teste.'],
    stages: [
      fillStage(draft.stages[0], 'Acolher'),
      fillStage(draft.stages[1], 'Tour'),
      fillStage(draft.stages[2], 'Obter'),
    ],
  }

  const { definition, validation } = buildCommercialMethodDefinitionFromConstruction(draft)
  assert.deepEqual(definition.stages.map((stage) => stage.name), ['Acolher', 'Tour', 'Obter'])
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
})
