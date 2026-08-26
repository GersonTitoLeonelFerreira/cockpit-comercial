import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL('../../../scripts/typescript-test-loader.mjs', import.meta.url),
  ),
  import.meta.url,
)

const {
  suggestInitialMethodConstruction,
  buildCommercialMethodDefinitionFromConstruction,
} = await import('./assisted-method-construction.ts')

const {
  applyBuyerDecisionArchitecture,
  createBuyerDecisionDraft,
} = await import('./buyer-decision-architecture.ts')

const {
  createEmptyCommercialMethodBuilderData,
} = await import('../../types/commercial-method-builder.ts')

const {
  getVisibleQuestions,
  isQuestionAnswered,
} = await import('./guided-journey/types.ts')

const {
  STAGE_QUESTIONS,
} = await import('./guided-journey/question-registry-stage.ts')

// ONDA 8 / FRENTE B — Síntese inteligente do método comercial.
//
// Estes testes comprovam, na camada de lógica (sem UI), que: (1) a Yolen
// pré-constrói etapas a partir do diagnóstico em vez de perguntar de novo;
// (2) Tour e outras atividades só viram etapa obrigatória quando o
// diagnóstico realmente confirma isso; (3) Formalização e Follow-up
// permanecem semanticamente distintos de Decisão; (4) nada disso quebra o
// contrato commercial-method-v2 nem depende de uma v3.

function academiaData() {
  const data = createEmptyCommercialMethodBuilderData()

  data.company_profile.offer.type = 'service'
  data.company_profile.offer.purchase_frequency = 'recurring'
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.complexity.multiple_decision_makers = false
  data.company_profile.complexity.sales_events = ['Tour']
  data.company_profile.buyer_behavior.contact_is_decision_maker = 'yes'
  data.company_profile.buyer_behavior.closes_on_first_contact = true
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'

  data.current_sales_process.presentation.touchpoints = ['Tour']
  data.current_sales_process.sales_events_detail = [
    {
      event: 'Tour',
      frequency: 'sometimes',
      success_definition:
        'O cliente conheceu a estrutura e confirmou interesse em pelo menos um horário de treino.',
      depends_on_customer_knowledge: 'no',
    },
  ]

  data.current_sales_process.follow_up.happens = true
  data.current_sales_process.follow_up.reasons = [
    'Precisa decidir com o cônjuge',
    'Quer comparar outras academias antes de decidir',
  ]

  data.current_sales_process.formalization = {
    steps: ['Matrícula', 'Pagamento'],
    can_reverse: true,
    operational_approval_after_decision: false,
    sale_completed_when: 'O pagamento da matrícula foi confirmado no sistema.',
  }

  data.current_sales_process.closing.completion_actions = [
    'Cliente confirma que quer se matricular',
  ]

  return data
}

function saasComplexData() {
  const data = createEmptyCommercialMethodBuilderData()

  data.company_profile.offer.type = 'service'
  data.company_profile.customer.buyer_type = 'company'
  data.company_profile.complexity.typical_timing = 'months'
  data.company_profile.complexity.multiple_decision_makers = true
  data.company_profile.complexity.sales_events = ['Demonstração', 'Proposta']
  data.commercial_rules.contracts.uses_contract = true
  data.commercial_rules.pricing.model = 'variable'

  return data
}

function decisionWithDefaults(data, overrides = {}) {
  return {
    ...createBuyerDecisionDraft(data),
    approval_or_blocker: 'no',
    formal_process: 'no',
    investment_justification: 'no',
    real_urgency: 'no',
    solution_customization: 'standard',
    operation_intensity: 'high_volume_short',
    buyer_commitment_signals: [
      'O cliente confirmou verbalmente que quer se matricular e perguntou como pagar.',
    ],
    ...overrides,
  }
}

function synthesize(data, decisionOverrides = {}) {
  const initial = suggestInitialMethodConstruction(data)
  const decision = decisionWithDefaults(data, decisionOverrides)
  return applyBuyerDecisionArchitecture(initial, data, decision)
}

function stageByName(draft, name) {
  return draft.stages.find(
    (stage) => stage.name.toLowerCase() === name.toLowerCase(),
  )
}

// A) academia gera estrutura enxuta.
test('A) academia gera estrutura enxuta (poucas etapas)', () => {
  const draft = synthesize(academiaData())
  assert.ok(
    draft.stages.length <= 6,
    `esperado poucas etapas, recebido ${draft.stages.length}: ${draft.stages.map((stage) => stage.name).join(', ')}`,
  )
})

// B) Tour = conditional.
test('B) Tour informado como "somente às vezes" vira etapa condicional, não obrigatória', () => {
  const draft = synthesize(academiaData())
  const tour = stageByName(draft, 'Tour')
  assert.ok(tour, 'esperava encontrar a etapa Tour')
  assert.equal(tour.requirement, 'conditional')
  assert.ok(tour.skip_conditions.length > 0, 'etapa condicional precisa de skip_conditions preenchidos')
})

// C) cliente decidido → Formalização, não Follow-up obrigatório.
test('C) Formalização existe e nunca é obrigatória por causa de Follow-up', () => {
  const draft = synthesize(academiaData())
  const formalization = stageByName(draft, 'Formalização')
  const followUp = stageByName(draft, 'Follow-up')

  assert.ok(formalization, 'esperava uma etapa de Formalização (matrícula + pagamento informados)')
  assert.ok(followUp, 'esperava uma etapa de Follow-up (follow_up.happens=true)')
  assert.equal(followUp.requirement, 'conditional', 'Follow-up nunca deveria ser required por padrão')
  assert.ok(
    followUp.skip_conditions.some((item) => /decidiu|decis(a|ã)o/i.test(item)),
    'skip_conditions do Follow-up deveria cobrir "cliente já decidiu"',
  )
})

// D) decisão pendente → follow-up aplicável.
test('D) Follow-up traz wait_when/advance_when derivados dos motivos de adiamento informados', () => {
  const draft = synthesize(academiaData())
  const followUp = stageByName(draft, 'Follow-up')

  assert.ok(followUp)
  assert.ok(followUp.wait_when.length > 0, 'esperava wait_when preenchido a partir de follow_up.reasons')
  assert.ok(
    followUp.wait_when.some((item) => /cônjuge|comparar/i.test(item)),
    'wait_when deveria referenciar os motivos reais informados no diagnóstico',
  )
})

// E) venda simples sem formalização relevante não cria etapa desnecessária.
test('E) venda simples sem sinal de formalização não cria a etapa Formalização', () => {
  const data = createEmptyCommercialMethodBuilderData()
  data.company_profile.offer.type = 'product'
  data.company_profile.customer.buyer_type = 'person'
  data.company_profile.complexity.typical_timing = 'first_contact'
  data.company_profile.buyer_behavior.closes_on_first_contact = true
  data.company_profile.buyer_behavior.workload_pattern = 'high_volume_short'
  data.current_sales_process.follow_up.happens = false

  const draft = synthesize(data, {
    formal_process: 'no',
    approval_or_blocker: 'no',
  })

  assert.equal(stageByName(draft, 'Formalização'), undefined)
})

// F) B2B complexo pode criar Formalização.
test('F) B2B complexo com processo formal confirmado cria Formalização required', () => {
  const data = saasComplexData()
  const draft = synthesize(data, {
    formal_process: 'yes',
    formal_process_steps: ['TI', 'Jurídico', 'Compras'],
    approval_or_blocker: 'yes',
    participant_roles: ['TI', 'Jurídico'],
  })

  const formalization = stageByName(draft, 'Formalização')
  assert.ok(formalization)
  assert.equal(formalization.requirement, 'required')
})

// G/H/I) Demo, Teste e Orçamento não viram etapa automaticamente quando
// informados como opcionais em uma venda complexa.
test('G/H/I) eventos marcados como opcionais não geram uma etapa obrigatória cada', () => {
  const data = saasComplexData()
  data.company_profile.complexity.sales_events = ['Demonstração', 'Teste', 'Orçamento']
  data.current_sales_process.presentation.touchpoints = ['Demonstração', 'Teste', 'Orçamento']
  data.current_sales_process.sales_events_detail = [
    { event: 'Demonstração', frequency: 'optional', success_definition: 'Cliente pediu explicitamente uma demo.', depends_on_customer_knowledge: 'sometimes' },
    { event: 'Teste', frequency: 'optional', success_definition: 'Cliente pediu para testar antes de decidir.', depends_on_customer_knowledge: 'sometimes' },
    { event: 'Orçamento', frequency: 'optional', success_definition: 'Cliente pediu um orçamento formal por escrito.', depends_on_customer_knowledge: 'sometimes' },
  ]

  const initial = suggestInitialMethodConstruction(data)
  const requiredEventStages = initial.stages.filter((stage) =>
    ['demonstração', 'teste', 'orçamento'].includes(stage.name.toLowerCase()) &&
    stage.requirement === 'required',
  )

  assert.equal(
    requiredEventStages.length,
    0,
    `nenhum desses eventos opcionais deveria virar etapa obrigatória própria, recebido: ${requiredEventStages.map((s) => s.name).join(', ')}`,
  )
})

// J) campos já conhecidos são pré-preenchidos.
test('J) etapas Decisão, Formalização e Tour chegam com campos pré-preenchidos, rastreáveis ao diagnóstico', () => {
  const draft = synthesize(academiaData())

  const decisionStage = stageByName(draft, 'Decisão de compra')
  const formalization = stageByName(draft, 'Formalização')
  const tour = stageByName(draft, 'Tour')

  assert.ok(decisionStage.objective, 'objective da Decisão deveria vir preenchido')
  assert.ok(decisionStage.completion_criteria.length > 0)
  assert.ok(decisionStage.advance_when.length > 0)
  assert.ok(
    decisionStage.completion_criteria.some((item) => /matricular/i.test(item)),
    'completion_criteria deveria refletir o sinal de decisão realmente informado',
  )

  assert.ok(formalization.objective)
  assert.ok(
    formalization.completion_criteria.some((item) => /pagamento da matrícula/i.test(item)),
    'completion_criteria da Formalização deveria refletir sale_completed_when informado',
  )

  assert.ok(tour.objective, 'objective do Tour deveria vir do success_definition informado')
  assert.equal(tour.objective, 'O cliente conheceu a estrutura e confirmou interesse em pelo menos um horário de treino.')
})

// K) perguntas E01-E15 não são obrigatórias se a etapa já foi bem coberta
// pela síntese determinística.
test('K) etapa bem coberta pela síntese não deixa pendência nas perguntas centrais (E03_E04, E05, E08, E09, E11)', () => {
  const draft = synthesize(academiaData())
  const decisionStage = stageByName(draft, 'Decisão de compra')

  const coreIds = ['E03_E04', 'E05', 'E08', 'E09', 'E11']
  const stillUnanswered = getVisibleQuestions(STAGE_QUESTIONS, decisionStage)
    .filter((question) => coreIds.includes(question.id))
    .filter((question) => !isQuestionAnswered(question, decisionStage))

  assert.deepEqual(
    stillUnanswered.map((question) => question.id),
    [],
    'a etapa Decisão de compra deveria chegar com essas perguntas centrais já respondidas pela síntese',
  )
})

// M) alteração manual do gestor prevalece sobre sugestão.
test('M) valor já preenchido pelo gestor nunca é sobrescrito pela síntese', () => {
  const data = academiaData()
  const initial = suggestInitialMethodConstruction(data)

  const decisionIndex = initial.stages.findIndex((stage) =>
    stage.name.toLowerCase().includes('conclusão') || stage.name.toLowerCase().includes('decisão'),
  )
  assert.ok(decisionIndex >= 0)

  const managerValue = ['O gestor escreveu isto manualmente antes da síntese.']
  initial.stages[decisionIndex] = {
    ...initial.stages[decisionIndex],
    completion_criteria: managerValue,
  }

  const decision = decisionWithDefaults(data)
  const applied = applyBuyerDecisionArchitecture(initial, data, decision)
  const decisionStage = stageByName(applied, 'Decisão de compra')

  assert.deepEqual(decisionStage.completion_criteria, managerValue)
})

// N) commercial-method-v2 valida — depois de uma revisão mínima e realista
// (o gestor ainda precisa decidir a obrigatoriedade e, quando aplicável,
// preencher skip_conditions da própria mão; a síntese não deveria inventar
// isso), o resultado é um contrato V2 válido.
test('N) método sintetizado para a academia valida como commercial-method-v2 após revisão mínima', () => {
  const data = academiaData()
  const draft = synthesize(data)

  const withMethodMeta = {
    ...draft,
    method_name: 'Método Academia',
    method_description: 'Método comercial calibrado para academias com tour condicional.',
    principles: draft.principles.length > 0 ? draft.principles : ['Evidência do comprador, não atividade do vendedor, comprova avanço.'],
  }

  const { validation } = buildCommercialMethodDefinitionFromConstruction(withMethodMeta)

  assert.equal(
    validation.valid,
    true,
    `esperava definição válida, problemas: ${JSON.stringify(validation.issues)}`,
  )
})

// O) Companion consegue consumir o resultado — usa o mesmo validador do
// contrato semântico (commercial-method-contract.ts) que o runtime do
// Companion usa para aceitar uma versão publicada.
test('O) definição sintetizada é aceita pelo mesmo validador que o Companion usa para publicação', async () => {
  const { validateCommercialMethodDefinition } = await import(
    '../companion/commercial-method-contract.ts'
  )

  const data = academiaData()
  const draft = synthesize(data)
  const withMethodMeta = {
    ...draft,
    method_name: 'Método Academia',
    method_description: 'Método comercial calibrado para academias com tour condicional.',
    principles: draft.principles.length > 0 ? draft.principles : ['Evidência do comprador, não atividade do vendedor, comprova avanço.'],
  }

  const { definition } = buildCommercialMethodDefinitionFromConstruction(withMethodMeta)
  const result = validateCommercialMethodDefinition(definition)

  assert.equal(result.valid, true, `problemas: ${JSON.stringify(result.issues)}`)
  assert.equal(definition.contract_version, 'commercial-method-v2')
})

// Cenário de regressão (seção 32): a estrutura da academia não deve
// reproduzir "Tour required" nem "Follow-up required" como antes.
test('cenário de regressão: academia não reproduz Tour required nem Follow-up required', () => {
  const draft = synthesize(academiaData())

  const tour = stageByName(draft, 'Tour')
  const followUp = stageByName(draft, 'Follow-up')
  const formalization = stageByName(draft, 'Formalização')
  const decisionStage = stageByName(draft, 'Decisão de compra')

  assert.ok(tour && tour.requirement === 'conditional')
  assert.ok(followUp && followUp.requirement === 'conditional')
  assert.ok(formalization, 'decisão positiva com matrícula/pagamento deveria produzir Formalização')
  assert.ok(decisionStage, 'Decisão de compra continua distinta de Formalização')
  assert.notEqual(decisionStage.name, formalization.name)
})
