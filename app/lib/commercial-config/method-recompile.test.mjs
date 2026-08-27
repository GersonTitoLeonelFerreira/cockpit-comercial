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
} = await import('./assisted-method-construction.ts')

const {
  applyBuyerDecisionArchitecture,
  createBuyerDecisionDraft,
} = await import('./buyer-decision-architecture.ts')

const {
  sanitizeMethodPrinciples,
} = await import('./method-principles.ts')

const {
  buildMethodRecompileCandidate,
  diffMethodRecompileCandidate,
  isMethodSynthesisStale,
} = await import('./method-recompile.ts')

const {
  BUYER_DECISION_QUESTIONS,
} = await import('./guided-journey/question-registry-buyer-decision.ts')

const {
  createEmptyCommercialMethodBuilderData,
} = await import('../../types/commercial-method-builder.ts')

const {
  CURRENT_METHOD_SYNTHESIS_VERSION,
} = await import('../../types/commercial-method-construction.ts')

const {
  saveCommercialMethodConstruction,
} = await import('../server/commercial-method-construction.ts')

// ============================================================================
// ONDA 8 / HOTFIX — recompilação segura de method_definition antigo.
//
// Cenário-fonte: um review_ready antigo (produzido ANTES da síntese
// inteligente da Frente B) tem Tour como REQUIRED e nenhuma etapa de
// Formalização, mesmo com respostas de diagnóstico que hoje produziriam
// Tour condicional e Formalização. As respostas continuam válidas — só a
// estrutura está desatualizada. Estes testes provam que a recompilação:
// reaproveita exatamente a síntese canônica atual, nunca mexe em
// draft_data, nunca publica nada sozinha, preserva etapas manuais, e só é
// aplicada por ação explícita.
// ============================================================================

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
    event_success_criteria: [
      {
        event: 'Tour',
        criteria: ['O cliente confirmou interesse em pelo menos um horário de treino.'],
      },
    ],
    ...overrides,
  }
}

function stageByName(draft, name) {
  return draft.stages.find(
    (stage) => stage.name.toLowerCase() === name.toLowerCase(),
  )
}

// Reproduz, à mão, exatamente o que a Controle Mestre reportou como
// materializado ANTES da Frente B: Tour required, sem Formalização, sem
// synthesis_version (versão anterior a este rastreamento).
function staleAcademiaConstruction(data) {
  const decision = {
    ...decisionWithDefaults(data),
    confirmed: true,
  }

  return {
    construction_version: 'assisted-method-construction-v1',
    // synthesis_version ausente de propósito — construção anterior a este
    // rastreamento.
    construction_step: 'review',
    method_name: 'Método Academia',
    method_description: 'Método comercial da academia.',
    principles: [
      'A profundidade da conversa deve ser proporcional à complexidade real da decisão.',
    ],
    active_stage_id: 'stage-descoberta-old',
    buyer_decision: decision,
    stages: [
      {
        id: 'stage-descoberta-old',
        source: 'yolen_suggestion',
        suggestion_basis: [],
        key: 'descoberta',
        name: 'Descoberta',
        objective: 'Entender o objetivo do aluno.',
        requirement: 'required',
        completion_criteria: ['O aluno explicou o que busca.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
      {
        id: 'stage-tour-old',
        source: 'yolen_suggestion',
        suggestion_basis: [],
        key: 'tour',
        name: 'Tour',
        objective: 'Apresentar a estrutura.',
        // Bug relatado: Tour materializado como required, mesmo com
        // frequency: 'sometimes' no diagnóstico.
        requirement: 'required',
        completion_criteria: ['O tour foi realizado.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
      {
        id: 'stage-apresentacao-old',
        source: 'yolen_suggestion',
        suggestion_basis: [],
        key: 'apresentacao',
        name: 'Apresentação',
        objective: 'Apresentar os planos.',
        requirement: 'required',
        completion_criteria: ['Os planos foram apresentados.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
      {
        id: 'stage-decisao-old',
        source: 'yolen_suggestion',
        suggestion_basis: [],
        key: 'decisao_de_compra',
        name: 'Decisão de compra',
        objective: 'Confirmar que o cliente decidiu.',
        requirement: 'required',
        completion_criteria: ['O cliente confirmou que quer se matricular.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
      // Sem etapa de Formalização — bug relatado.
      {
        id: 'stage-followup-old',
        source: 'yolen_suggestion',
        suggestion_basis: [],
        key: 'follow_up',
        name: 'Follow-up',
        objective: 'Retomar contato.',
        requirement: 'conditional',
        completion_criteria: ['O cliente retomou o contato.'],
        partial_completion_criteria: [],
        skip_conditions: ['O cliente já decidiu.'],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
    ],
  }
}

test('1) builder antigo sem synthesis_version detecta atualização disponível', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)

  assert.equal(isMethodSynthesisStale(stale), true)

  const candidate = buildMethodRecompileCandidate(data, stale)
  assert.ok(candidate)
  assert.equal(candidate.synthesis_version, CURRENT_METHOD_SYNTHESIS_VERSION)
  assert.equal(isMethodSynthesisStale(candidate), false)
})

test('2) recompile candidate não altera draft_data (diagnóstico)', () => {
  const data = academiaData()
  const snapshot = JSON.parse(JSON.stringify(data))
  const stale = staleAcademiaConstruction(data)

  buildMethodRecompileCandidate(data, stale)

  assert.deepEqual(data, snapshot)
})

test('3) Tour antiga required vira conditional no candidate atual', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  const oldTour = stageByName(stale, 'Tour')
  const newTour = stageByName(candidate, 'Tour')

  assert.equal(oldTour.requirement, 'required')
  assert.equal(newTour.requirement, 'conditional')
})

test('4) Formalização ausente é adicionada pelo candidate atual', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  assert.equal(stageByName(stale, 'Formalização'), undefined)
  const formalizacao = stageByName(candidate, 'Formalização')
  assert.ok(formalizacao)
  assert.match(
    formalizacao.completion_criteria.join(' '),
    /pagamento da matrícula/i,
  )
})

test('5) Follow-up continua conditional no candidate', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  assert.equal(stageByName(candidate, 'Follow-up').requirement, 'conditional')
})

test('6) published atual não muda durante o recompile', async () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  const { store, publishedVersions } = makeStore(data, stale)

  const publishedBefore = JSON.parse(JSON.stringify(publishedVersions[0]))

  await saveCommercialMethodConstruction(
    fakeSupabase(store, publishedVersions),
    COMPANY_A,
    USER_A,
    { status: 'review_ready', construction: candidate },
  )

  assert.deepEqual(publishedVersions[0], publishedBefore)
})

test('7) usuário rejeita a atualização: método atual permanece intacto', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const snapshot = JSON.parse(JSON.stringify(stale))

  // "Rejeitar" é simplesmente não aplicar o candidate: nada no fluxo de
  // cálculo do candidate pode mutar `stale`.
  buildMethodRecompileCandidate(data, stale)

  assert.deepEqual(stale, snapshot)
})

test('8) usuário aceita: novo review_ready é salvo com o candidate', async () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  const { store, publishedVersions } = makeStore(data, stale)

  const saved = await saveCommercialMethodConstruction(
    fakeSupabase(store, publishedVersions),
    COMPANY_A,
    USER_A,
    { status: 'review_ready', construction: candidate },
  )

  assert.equal(saved.status, 'review_ready')
  assert.equal(saved.method_synthesis_version, CURRENT_METHOD_SYNTHESIS_VERSION)
  assert.equal(saved.method_definition?.stages.some((s) => s.name === 'Formalização'), true)
  assert.equal(
    saved.method_definition?.stages.find((s) => s.name === 'Tour')?.requirement,
    'conditional',
  )
})

test('9) nova publicação depois do recompile cria nova versão ativa', async () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  const { store, publishedVersions } = makeStore(data, stale)
  const supabase = fakeSupabase(store, publishedVersions)

  const savedConstruction = await saveCommercialMethodConstruction(
    supabase,
    COMPANY_A,
    USER_A,
    { status: 'review_ready', construction: candidate },
  )

  const { data: rows, error } = await supabase.rpc(
    'rpc_publish_builder_commercial_method',
    {
      p_company_id: COMPANY_A,
      p_expected_method_updated_at: savedConstruction.method_updated_at,
    },
  )

  assert.equal(error, null)
  const result = rows[0]
  assert.equal(result.already_published, false)

  const published = publishedVersions.find((v) => v.status === 'published')
  assert.equal(published.version_number, result.version_number)
  assert.equal(
    published.commercial_method_definition.stages.some((s) => s.name === 'Formalização'),
    true,
  )
  assert.equal(publishedVersions.filter((v) => v.status === 'published').length, 1)
  assert.equal(publishedVersions.find((v) => v.status === 'archived').version_number, 10)
})

test('10) sanitizeMethodPrinciples separa concatenação relatada sem alterar o significado', () => {
  const concatenated = [
    'Demonstração, tour, teste ou reunião devem ter um resultado esperado; realizar a atividade não é suficiente para avançar. A profundidade da conversa deve ser proporcional à complexidade real da decisão.',
  ]

  const fixed = sanitizeMethodPrinciples(concatenated)

  assert.deepEqual(fixed, [
    'Demonstração, tour, teste ou reunião devem ter um resultado esperado; realizar a atividade não é suficiente para avançar.',
    'A profundidade da conversa deve ser proporcional à complexidade real da decisão.',
  ])
})

test('10b) sanitizeMethodPrinciples remove duplicatas exatas sem tocar princípios livres do gestor', () => {
  const withDuplicates = [
    'Avanço real exige evidência do comprador; atividade do vendedor, sozinha, não prova progresso.',
    'Avanço real exige evidência do comprador; atividade do vendedor, sozinha, não prova progresso.',
    'Nunca prometer desconto sem aprovação do gestor.',
  ]

  const fixed = sanitizeMethodPrinciples(withDuplicates)

  assert.deepEqual(fixed, [
    'Avanço real exige evidência do comprador; atividade do vendedor, sozinha, não prova progresso.',
    'Nunca prometer desconto sem aprovação do gestor.',
  ])
})

test('10c) síntese real da academia nunca produz princípios concatenados ou duplicados', () => {
  const data = academiaData()
  const initial = suggestInitialMethodConstruction(data)
  const decision = decisionWithDefaults(data)
  const draft = applyBuyerDecisionArchitecture(initial, data, decision)

  assert.deepEqual(draft.principles, sanitizeMethodPrinciples(draft.principles))
  assert.equal(draft.principles.length, new Set(draft.principles).size)
})

test('11) não repete pergunta quando o diagnóstico já respondeu (customização e ritmo)', () => {
  const data = academiaData()
  // academiaData já respondeu workload_pattern; não respondeu customization_depth.
  data.company_profile.offer.customization_depth = 'standard'

  const decision = createBuyerDecisionDraft(data)
  assert.equal(decision.operation_intensity, 'high_volume_short')
  assert.equal(decision.solution_customization, 'standard')

  const context = { diagnosis: data, decision }
  const customizationQuestion = BUYER_DECISION_QUESTIONS.find((q) => q.id === 'Q_customization')
  const intensityQuestion = BUYER_DECISION_QUESTIONS.find((q) => q.id === 'Q_operation_intensity')

  assert.equal(customizationQuestion.showWhen(context), false)
  assert.equal(intensityQuestion.showWhen(context), false)
})

test('11b) pergunta continua aparecendo quando o diagnóstico não respondeu', () => {
  const data = createEmptyCommercialMethodBuilderData()
  const decision = createBuyerDecisionDraft(data)
  const context = { diagnosis: data, decision }

  const customizationQuestion = BUYER_DECISION_QUESTIONS.find((q) => q.id === 'Q_customization')
  const intensityQuestion = BUYER_DECISION_QUESTIONS.find((q) => q.id === 'Q_operation_intensity')

  assert.equal(customizationQuestion.showWhen(context), true)
  assert.equal(intensityQuestion.showWhen(context), true)
})

test('12) etapa adicionada manualmente pelo gestor é preservada, não apagada silenciosamente', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  stale.stages.push({
    id: 'stage-manual-financeiro',
    source: 'manager',
    suggestion_basis: [],
    key: 'aprovacao_financeira',
    name: 'Aprovação financeira interna',
    objective: 'Confirmar aprovação do financeiro da academia.',
    requirement: 'conditional',
    completion_criteria: ['O financeiro aprovou o plano.'],
    partial_completion_criteria: [],
    skip_conditions: ['Não há aprovação financeira nesse caso.'],
    recommended_questions: [],
    common_mistakes: [],
    deepen_when: [],
    sufficient_when: [],
    advance_when: [],
    wait_when: [],
    stop_asking_when: [],
    dimensions: [],
  })

  const candidate = buildMethodRecompileCandidate(data, stale)

  const preserved = candidate.stages.find((s) => s.key === 'aprovacao_financeira')
  assert.ok(preserved)
  assert.equal(preserved.name, 'Aprovação financeira interna')
  assert.equal(preserved.source, 'manager')

  const diff = diffMethodRecompileCandidate(stale, candidate)
  const manualEntry = diff.stages.find((entry) => entry.key === 'aprovacao_financeira')
  assert.equal(manualEntry.change, 'unchanged')
})

test('12b) diff mostra visivelmente qualquer mudança de requirement (nunca sobrescreve silenciosamente)', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  const diff = diffMethodRecompileCandidate(stale, candidate)
  const tourEntry = diff.stages.find((entry) => entry.key === 'tour')

  assert.equal(tourEntry.change, 'changed')
  assert.equal(tourEntry.previous_requirement, 'required')
  assert.equal(tourEntry.next_requirement, 'conditional')

  const formalizacaoEntry = diff.stages.find((entry) => entry.key === 'formalizacao')
  assert.equal(formalizacaoEntry.change, 'added')
  assert.equal(diff.has_changes, true)
})

test('21) recompilação da academia resulta na estrutura esperada pela Controle Mestre', () => {
  const data = academiaData()
  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  // Descoberta e Apresentação separada só são sugeridas quando o
  // diagnóstico indica isso (needs_discovery / mais de um evento de
  // apresentação); este fixture de academia mínima não indica nenhuma das
  // duas — estrutura enxuta é o comportamento correto (ver teste A em
  // smart-method-synthesis.test.mjs, mesma base de dados). O que a Controle
  // Mestre pediu para validar (Tour condicional, Formalização presente,
  // Decisão distinta de Formalização, Follow-up condicional) está coberto
  // abaixo.
  const names = candidate.stages.map((s) => s.name)
  assert.ok(names.includes('Tour'))
  assert.ok(names.includes('Decisão de compra'))
  assert.ok(names.includes('Formalização'))
  assert.ok(names.includes('Follow-up'))

  assert.equal(stageByName(candidate, 'Tour').requirement, 'conditional')
  assert.equal(stageByName(candidate, 'Follow-up').requirement, 'conditional')
  assert.notEqual(
    stageByName(candidate, 'Decisão de compra').name,
    stageByName(candidate, 'Formalização').name,
  )

  const formalizacaoText = stageByName(candidate, 'Formalização').completion_criteria.join(' ')
  assert.match(formalizacaoText, /pagamento da matrícula/i)
})

test('22) Apresentação é recompilada a partir do diagnóstico sem pedir respostas novamente', () => {
  const data = academiaData()

  data.company_profile.complexity.sales_events = [
    'Tour',
    'Demonstração',
    'Teste',
    'Orçamento',
  ]

  data.current_sales_process.presentation.touchpoints = [
    'Tour',
    'Demonstração',
    'Teste',
    'Orçamento',
  ]

  data.current_sales_process.sales_events_detail = [
    {
      event: 'Tour',
      frequency: 'sometimes',
      success_definition: 'O cliente validou que a estrutura atende ao que procura.',
      depends_on_customer_knowledge: 'sometimes',
    },
    {
      event: 'Demonstração',
      frequency: 'sometimes',
      success_definition: 'O cliente entendeu como a solução funciona na prática.',
      depends_on_customer_knowledge: 'yes',
    },
    {
      event: 'Teste',
      frequency: 'sometimes',
      success_definition: 'O cliente validou a experiência da solução.',
      depends_on_customer_knowledge: 'yes',
    },
    {
      event: 'Orçamento',
      frequency: 'sometimes',
      success_definition: 'O cliente recebeu uma proposta clara para avaliar.',
      depends_on_customer_knowledge: 'yes',
    },
  ]

  data.current_sales_process.presentation_depth = {
    style: 'some_adjustments',
    must_be_clear_before: [
      'Necessidade principal do cliente',
      'Condição que muda a recomendação',
    ],
    must_be_clear_to_customer: [
      'Solução recomendada',
      'Benefícios relevantes',
      'Valor e condições',
    ],
    presented_too_early: [
      'Apresentar antes de entender o que o cliente precisa',
    ],
    over_explained: [
      'Explicar detalhes que não mudam a decisão',
    ],
  }

  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)
  const presentation = stageByName(candidate, 'Apresentação')

  assert.ok(presentation)
  assert.ok(presentation.objective.trim())
  assert.ok(presentation.completion_criteria.length > 0)
  assert.ok(presentation.sufficient_when.length > 0)
  assert.ok(presentation.advance_when.length > 0)
  assert.ok(presentation.stop_asking_when.length > 0)
  assert.match(
    presentation.objective,
    /solução recomendada/i,
  )
  assert.match(
    presentation.completion_criteria.join(' '),
    /valor e condições/i,
  )
})

test('23) Descoberta, eventos e Formalização sempre explicam quando avançar', () => {
  const data = academiaData()

  data.current_sales_process.discovery.needs_to_discover = [
    'Necessidade principal do cliente',
  ]
  data.current_sales_process.discovery.indispensable_information = [
    'Condição que muda a recomendação',
  ]

  const stale = staleAcademiaConstruction(data)
  const candidate = buildMethodRecompileCandidate(data, stale)

  const discovery = stageByName(candidate, 'Descoberta')
  const tour = stageByName(candidate, 'Tour')
  const formalization = stageByName(candidate, 'Formalização')

  assert.ok(discovery)
  assert.ok(tour)
  assert.ok(formalization)

  assert.ok(discovery.advance_when.length > 0)
  assert.ok(tour.advance_when.length > 0)
  assert.ok(formalization.advance_when.length > 0)

  assert.match(
    discovery.advance_when.join(' '),
    /informação suficiente/i,
  )
  assert.match(
    tour.advance_when.join(' '),
    /resultado esperado/i,
  )
  assert.match(
    formalization.advance_when.join(' '),
    /formaliza|contrata|pagamento/i,
  )
})

// ============================================================================
// Infra mínima de Supabase falso para os testes 6/8/9, que exercitam o
// caminho real de save (saveCommercialMethodConstruction) e publish
// (publishBuilderCommercialMethod) sobre o candidate recompilado.
// ============================================================================

const COMPANY_A = '30000000-0000-4000-8000-000000000001'
const USER_A = '40000000-0000-4000-8000-000000000001'

function buildMethodAto() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Método ATO',
    description: 'Método publicado anterior.',
    principles: ['Princípio anterior.'],
    stages: [
      {
        key: 'atendimento',
        display_order: 1,
        name: 'Atendimento',
        objective: 'Atender.',
        requirement: 'required',
        completion_criteria: ['Cliente atendido.'],
        partial_completion_criteria: [],
        skip_conditions: [],
        recommended_questions: [],
        common_mistakes: [],
        deepen_when: [],
        sufficient_when: [],
        advance_when: [],
        wait_when: [],
        stop_asking_when: [],
        dimensions: [],
      },
    ],
  }
}

function makeStore(data, staleConstruction) {
  const builderRow = {
    company_id: COMPANY_A,
    ready_for_method: true,
    draft_data: data,
    method_construction_status: 'review_ready',
    method_construction: staleConstruction,
    method_definition: {
      contract_version: 'commercial-method-v2',
      name: staleConstruction.method_name,
      description: staleConstruction.method_description,
      principles: staleConstruction.principles,
      stages: staleConstruction.stages.map((stage, index) => ({
        key: stage.key,
        display_order: index + 1,
        name: stage.name,
        objective: stage.objective,
        requirement: stage.requirement,
        completion_criteria: stage.completion_criteria,
        partial_completion_criteria: stage.partial_completion_criteria,
        skip_conditions: stage.skip_conditions,
        recommended_questions: stage.recommended_questions,
        common_mistakes: stage.common_mistakes,
        deepen_when: stage.deepen_when,
        sufficient_when: stage.sufficient_when,
        advance_when: stage.advance_when,
        wait_when: stage.wait_when,
        stop_asking_when: stage.stop_asking_when,
        dimensions: stage.dimensions,
      })),
    },
    method_started_at: '2026-08-20T04:00:00.000Z',
    method_updated_at: '2026-08-20T04:00:00.000Z',
    method_synthesis_version: null,
    updated_at: '2026-08-20T04:00:00.000Z',
    updated_by: USER_A,
  }

  const publishedVersions = [
    {
      id: 'version-10',
      company_id: COMPANY_A,
      version_number: 10,
      status: 'published',
      draft_purpose: 'general',
      published_at: '2026-08-15T04:00:00.000Z',
      business_description: 'Academia de treino físico presencial.',
      target_audience: 'Pessoas físicas da região.',
      value_proposition: 'Treino orientado com resultado rápido.',
      communication_tone: 'Acolhedor e direto.',
      required_behaviors: ['Confirmar objetivo do aluno.'],
      prohibited_behaviors: ['Prometer resultado sem avaliação.'],
      commercial_method_contract_version: 'commercial-method-v2',
      commercial_method_name: 'Método ATO',
      commercial_method_description: 'Método publicado anterior.',
      commercial_method_definition: buildMethodAto(),
      product_profiles: [],
      objection_guides: [],
      facts: [],
    },
  ]

  return { store: [builderRow], publishedVersions }
}

class FakeQuery {
  constructor(store, table) {
    this.store = store
    this.table = table
    this.filters = []
    this.mode = 'select'
    this.payload = null
    this.orderField = null
  }

  select() {
    return this
  }

  eq(field, value) {
    this.filters.push([field, value])
    return this
  }

  in(field, values) {
    this.filters.push([field, values, 'in'])
    return this
  }

  order(field, opts) {
    this.orderField = { field, ascending: opts?.ascending !== false }
    return this
  }

  update(payload) {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  matches(item) {
    return this.filters.every(([field, value, kind]) =>
      kind === 'in' ? value.includes(item[field]) : item[field] === value,
    )
  }

  applyOrder(items) {
    if (!this.orderField) return items
    const { field, ascending } = this.orderField
    return [...items].sort((a, b) =>
      ascending ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1),
    )
  }

  async maybeSingle() {
    if (this.mode === 'update') {
      const index = this.store.findIndex((item) => this.matches(item))
      if (index < 0) {
        return { data: null, error: null }
      }

      this.store[index] = {
        ...this.store[index],
        ...this.payload,
        updated_at: new Date().toISOString(),
      }

      return { data: this.store[index], error: null }
    }

    const matches = this.applyOrder(this.store.filter((item) => this.matches(item)))
    return {
      data: matches[0] ?? null,
      error: matches.length > 1 && !this.orderField ? { message: 'multiple rows' } : null,
    }
  }

  async single() {
    if (this.mode !== 'update') {
      const found = this.applyOrder(this.store.filter((item) => this.matches(item)))[0] ?? null
      return { data: found, error: found ? null : { message: 'row not found' } }
    }

    const index = this.store.findIndex((item) => this.matches(item))
    if (index < 0) return { data: null, error: { message: 'row not found' } }

    this.store[index] = { ...this.store[index], ...this.payload, updated_at: new Date().toISOString() }
    return { data: this.store[index], error: null }
  }

  then(resolve, reject) {
    const matches = this.applyOrder(this.store.filter((item) => this.matches(item)))
    return Promise.resolve({ data: matches, error: null }).then(resolve, reject)
  }
}

let nextVersionNumber = 11

function fakeSupabase(builderStore, publishedVersions) {
  return {
    from(table) {
      if (table === 'company_commercial_method_builder_drafts') {
        return new FakeQuery(builderStore, table)
      }
      if (table === 'company_commercial_config_versions') {
        return new FakeQuery(publishedVersions, table)
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
    async rpc(name, args) {
      if (name !== 'rpc_publish_builder_commercial_method') {
        throw new Error(`rpc inesperada: ${name}`)
      }
      const builder = builderStore.find((row) => row.company_id === args.p_company_id)
      if (!builder) return { data: null, error: { message: 'builder não encontrado' } }
      if (builder.method_construction_status !== 'review_ready' || !builder.method_definition) {
        return { data: null, error: { message: 'A construção do método ainda não foi iniciada, ou ainda não está pronta para revisão final.' } }
      }
      if (builder.method_updated_at !== args.p_expected_method_updated_at) {
        return { data: null, error: { message: 'O método mudou desde que a página foi carregada.' } }
      }

      const currentPublished = publishedVersions.find((v) => v.company_id === args.p_company_id && v.status === 'published')
      if (!currentPublished) {
        return { data: null, error: { message: 'Ainda não existe uma configuração comercial publicada para esta empresa.' } }
      }

      const sameAsPublished =
        JSON.stringify(currentPublished.commercial_method_definition) === JSON.stringify(builder.method_definition)

      if (sameAsPublished) {
        return {
          data: [{
            company_id: args.p_company_id,
            config_version_id: currentPublished.id,
            version_number: currentPublished.version_number,
            status: 'published',
            published_at: currentPublished.published_at,
            already_published: true,
          }],
          error: null,
        }
      }

      currentPublished.status = 'archived'
      const newVersion = {
        ...currentPublished,
        id: `version-${nextVersionNumber}`,
        version_number: nextVersionNumber,
        status: 'published',
        draft_purpose: 'method_publish',
        published_at: new Date().toISOString(),
        commercial_method_contract_version: 'commercial-method-v2',
        commercial_method_name: builder.method_definition.name,
        commercial_method_description: builder.method_definition.description,
        commercial_method_definition: builder.method_definition,
      }
      nextVersionNumber += 1
      publishedVersions.push(newVersion)

      return {
        data: [{
          company_id: args.p_company_id,
          config_version_id: newVersion.id,
          version_number: newVersion.version_number,
          status: 'published',
          published_at: newVersion.published_at,
          already_published: false,
        }],
        error: null,
      }
    },
  }
}
