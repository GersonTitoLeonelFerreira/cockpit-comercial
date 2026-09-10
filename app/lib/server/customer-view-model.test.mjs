import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCustomerViewModel,
  CUSTOMER_VIEW_MODEL_UNAVAILABLE_REASONS,
} from './customer-view-model.ts'

function evidence(summary, overrides = {}) {
  return {
    summary,
    evidence_message_ids: ['message-1'],
    memory_ids: [],
    ...overrides,
  }
}

function buildCustomer(overrides = {}) {
  return {
    objectives: [],
    problems: [],
    impacts: [],
    needs: [],
    interests: [],
    decision_criteria: [],
    preferences: [],
    open_questions: [],
    objections: [],
    uncertainties: [],
    discussed_products: [],
    primary_product_interest: null,
    competitors: [],
    commitments: [],
    missing_discovery: [],
    resolved_information: [],
    superseded_information: [],
    communication: {
      patterns: [],
      events: [],
    },
    ...overrides,
  }
}

function buildReading(customerOverrides = {}, readingOverrides = {}) {
  return {
    commercial_relevance: 'commercial',
    commercial_role: 'buyer',
    customer: buildCustomer(customerOverrides),
    ...readingOverrides,
  }
}

function buildCurrentReading(customerOverrides = {}, readingOverrides = {}, sourceOverrides = {}) {
  return {
    company_id: 'company-1',
    cycle_id: 'cycle-1',
    conversation_key: 'whatsapp:5511988887777',
    state_record_id: 'state-1',
    state_version: 3,
    reading: buildReading(customerOverrides, readingOverrides),
    source_event_id: 'event-1',
    generated_at: '2026-09-10T12:00:00.000Z',
    state_updated_at: '2026-09-10T11:59:00.000Z',
    ...sourceOverrides,
  }
}

test('sem leitura atual: available true, unavailable_reason no_reading, tudo vazio', () => {
  const vm = buildCustomerViewModel(null)

  assert.equal(vm.available, true)
  assert.equal(vm.unavailable_reason, 'no_reading')
  assert.deepEqual(vm.preferences, [])
  assert.deepEqual(vm.communication_patterns, [])
  assert.deepEqual(vm.knowledge_gaps, [])
  assert.deepEqual(vm.opportunity_context.objectives, [])
  assert.equal(vm.opportunity_context.primary_product_interest, null)
  assert.equal(vm.provenance.reference_time, null)
})

test('unavailable reasons são exaustivos e só têm no_reading (loader nunca produz no_context)', () => {
  assert.deepEqual(
    CUSTOMER_VIEW_MODEL_UNAVAILABLE_REASONS,
    ['no_reading'],
  )
})

test('com leitura: available true, unavailable_reason null', () => {
  const vm = buildCustomerViewModel(buildCurrentReading())

  assert.equal(vm.available, true)
  assert.equal(vm.unavailable_reason, null)
})

// Mandato §19 — regra não-negociável: CLIENTE nunca aplica o gate de
// neutralidade de AGORA/ANÁLISE. Uma leitura non_commercial ainda deve
// mostrar o que existir em customer.*.
test('sessão non_commercial não esconde fatos do cliente (sem branch neutral)', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading(
      { needs: [evidence('Trabalha à noite, prefere contato fora do horário comercial.')] },
      { commercial_relevance: 'non_commercial', commercial_role: 'unknown' },
    ),
  )

  assert.equal(vm.available, true)
  assert.equal(vm.unavailable_reason, null)
  assert.equal(vm.opportunity_context.needs.length, 1)
})

test('sessão uncertain também não esconde fatos do cliente', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading(
      { preferences: [evidence('Prefere WhatsApp a ligação.')] },
      { commercial_relevance: 'uncertain', commercial_role: 'unknown' },
    ),
  )

  assert.equal(vm.preferences.length, 1)
})

test('preferences e communication_patterns são passthrough evidenciado', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      preferences: [evidence('Prefere WhatsApp a ligação.')],
      communication: {
        patterns: [{
          ...evidence('Sempre responde rápido pela manhã.'),
          observation_type: 'pattern',
          behavior: 'requests_data_or_numbers',
        }],
        events: [],
      },
    }),
  )

  assert.equal(vm.preferences.length, 1)
  assert.equal(vm.preferences[0].summary, 'Prefere WhatsApp a ligação.')
  assert.equal(vm.communication_patterns.length, 1)
  assert.equal(vm.communication_patterns[0].behavior, 'requests_data_or_numbers')
})

test('preferences e communication_patterns têm cap de 5', () => {
  const many = Array.from({ length: 8 }, (_, index) => evidence(`Preferência ${index + 1}`))
  const manyPatterns = Array.from({ length: 8 }, (_, index) => ({
    ...evidence(`Padrão ${index + 1}`),
    observation_type: 'pattern',
    behavior: 'direct_questions',
  }))

  const vm = buildCustomerViewModel(
    buildCurrentReading({
      preferences: many,
      communication: { patterns: manyPatterns, events: [] },
    }),
  )

  assert.equal(vm.preferences.length, 5)
  assert.equal(vm.communication_patterns.length, 5)
})

// mandato §22 — lacunas vêm de missing_discovery primeiro.
test('knowledge_gaps prioriza missing_discovery quando existe', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      missing_discovery: [{
        ...evidence('Ainda não sabemos se ele decide sozinho.'),
        topic: 'decision_maker',
      }],
      open_questions: [evidence('Pergunta genérica em aberto.')],
    }),
  )

  assert.equal(vm.knowledge_gaps.length, 1)
  assert.equal(vm.knowledge_gaps[0].summary, 'Ainda não sabemos se ele decide sozinho.')
  assert.equal(vm.knowledge_gaps[0].topic, 'decision_maker')
})

// Mesma lógica de getActiveMissingDiscovery, agora no presenter.
test('knowledge_gaps exclui missing_discovery já resolvida/substituída', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      missing_discovery: [
        { ...evidence('Já foi resolvido.', { memory_ids: ['gap-1'] }), topic: 'budget' },
        { ...evidence('Ainda em aberto.', { memory_ids: ['gap-2'] }), topic: 'timeline' },
      ],
      resolved_information: [{
        ...evidence('Orçamento confirmado.', { memory_ids: ['gap-1'] }),
        category: 'missing_discovery',
      }],
    }),
  )

  assert.equal(vm.knowledge_gaps.length, 1)
  assert.equal(vm.knowledge_gaps[0].summary, 'Ainda em aberto.')
})

test('knowledge_gaps exclui missing_discovery substituída por superseded_information', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      missing_discovery: [
        { ...evidence('Substituída.', { memory_ids: ['gap-3'] }), topic: 'budget' },
      ],
      superseded_information: [{
        ...evidence('Informação anterior substituída.', { memory_ids: ['gap-3'] }),
        category: 'missing_discovery',
      }],
    }),
  )

  assert.equal(vm.knowledge_gaps.length, 0)
})

test('knowledge_gaps cai para open_questions/uncertainties só quando missing_discovery está vazio', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      missing_discovery: [],
      open_questions: [evidence('Qual é o prazo de decisão?')],
      uncertainties: [evidence('Não sabemos se ele é o decisor final.')],
    }),
  )

  assert.equal(vm.knowledge_gaps.length, 2)
  assert.equal(vm.knowledge_gaps.every((gap) => gap.topic === null), true)
})

test('knowledge_gaps nunca inventa texto genérico quando nenhuma fonte tem conteúdo', () => {
  const vm = buildCustomerViewModel(buildCurrentReading())

  assert.deepEqual(vm.knowledge_gaps, [])
})

test('knowledge_gaps respeita cap de 3', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      missing_discovery: Array.from({ length: 5 }, (_, index) => ({
        ...evidence(`Lacuna ${index + 1}`),
        topic: 'budget',
      })),
    }),
  )

  assert.equal(vm.knowledge_gaps.length, 3)
})

// mandato §17/§18 — objeções e compromissos nunca aparecem no CustomerViewModel.
test('objections e commitments nunca vazam para o CustomerViewModel', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      objections: [evidence('Achou caro.')],
      commitments: [{
        ...evidence('Demonstração confirmada.'),
        status: 'confirmed',
        scheduled_at: '2026-09-11T15:00:00.000Z',
        proposed_at: '2026-09-10T12:00:00.000Z',
      }],
    }),
  )

  const serialized = JSON.stringify(vm)

  assert.doesNotMatch(serialized, /Achou caro/)
  assert.doesNotMatch(serialized, /Demonstração confirmada/)
  assert.equal('objections' in vm, false)
  assert.equal('commitments' in vm, false)
})

// mandato §13 — objectives/needs/decision_criteria/interests/problems/impacts
// são tratados como contexto de ciclo (opção "Balanceado"), nunca como
// known_facts/preferences.
test('objectives/needs/decision_criteria/interests/problems/impacts ficam em opportunity_context, nunca em preferences', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      objectives: [evidence('Quer reduzir custo desta contratação.')],
      needs: [evidence('Precisa de atendimento fora do horário comercial.')],
      decision_criteria: [evidence('Preço é o critério principal.')],
      interests: [evidence('Interesse em automação.')],
      problems: [evidence('Leads sem follow-up.')],
      impacts: [evidence('Oportunidades perdidas.')],
    }),
  )

  assert.equal(vm.opportunity_context.objectives.length, 1)
  assert.equal(vm.opportunity_context.needs.length, 1)
  assert.equal(vm.opportunity_context.decision_criteria.length, 1)
  assert.equal(vm.opportunity_context.interests.length, 1)
  assert.equal(vm.opportunity_context.problems.length, 1)
  assert.equal(vm.opportunity_context.impacts.length, 1)
  assert.deepEqual(vm.preferences, [])
})

test('discussed_products/primary_product_interest/competitors ficam em opportunity_context', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      discussed_products: [{
        ...evidence('Demonstrou interesse na Yolen.'),
        canonical_product_id: 'product-yolen',
        name: 'Yolen',
        interest_level: 'primary',
      }],
      primary_product_interest: {
        ...evidence('Demonstrou interesse na Yolen.'),
        canonical_product_id: 'product-yolen',
        name: 'Yolen',
        interest_level: 'primary',
      },
      competitors: [{
        ...evidence('Comparando com RD Station.'),
        name: 'RD Station',
        mention_type: 'named',
      }],
    }),
  )

  assert.equal(vm.opportunity_context.discussed_products.length, 1)
  assert.equal(vm.opportunity_context.primary_product_interest.name, 'Yolen')
  assert.equal(vm.opportunity_context.competitors.length, 1)
})

test('communication.events fica em opportunity_context, distinto de communication_patterns', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      communication: {
        patterns: [{ ...evidence('Padrão recorrente.'), observation_type: 'pattern', behavior: 'direct_questions' }],
        events: [{ ...evidence('Fez pergunta direta agora.'), observation_type: 'event', behavior: 'direct_questions' }],
      },
    }),
  )

  assert.equal(vm.communication_patterns.length, 1)
  assert.equal(vm.opportunity_context.communication_events.length, 1)
})

test('opportunity_context respeita cap de 5 por campo', () => {
  const many = Array.from({ length: 8 }, (_, index) => evidence(`Item ${index + 1}`))

  const vm = buildCustomerViewModel(
    buildCurrentReading({
      objectives: many,
      needs: many,
      decision_criteria: many,
    }),
  )

  assert.equal(vm.opportunity_context.objectives.length, 5)
  assert.equal(vm.opportunity_context.needs.length, 5)
  assert.equal(vm.opportunity_context.decision_criteria.length, 5)
})

test('provenance vem direto da leitura canônica atual', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({}, {}, {
      generated_at: '2026-09-10T12:34:00.000Z',
      state_record_id: 'state-42',
      state_version: 7,
      state_updated_at: '2026-09-10T12:33:00.000Z',
    }),
  )

  assert.equal(vm.provenance.reference_time, '2026-09-10T12:34:00.000Z')
  assert.equal(vm.provenance.state_record_id, 'state-42')
  assert.equal(vm.provenance.state_version, 7)
  assert.equal(vm.provenance.state_updated_at, '2026-09-10T12:33:00.000Z')
})

// Estrutural: garante que este módulo nunca aciona MIE/auto-send/geração
// de mensagem (mandato §40) e nunca lê estado de decisão/oportunidade
// (mandato §18/§25 — nenhum campo de status/estágio/decisão aparece).
test('módulo nunca expõe função de envio/geração de mensagem, nem estado de oportunidade/decisão', async () => {
  const { readFileSync } = await import('node:fs')

  const source = readFileSync(
    new URL('./customer-view-model.ts', import.meta.url),
    'utf8',
  )

  assert.ok(!/\bsend[A-Z]|auto_send|autoSend|dispatchMessage|generateMessage|suggested_message/.test(source))
  assert.ok(!/opportunity_status|primary_decision|best_approach\.decision|CommercialReadingDecision/.test(source))
})

// Estrutural: garante que evidence_message_ids/memory_ids nunca somem
// silenciosamente do passthrough (provenance interna, mandato §26).
test('itens evidenciados preservam evidence_message_ids e memory_ids', () => {
  const vm = buildCustomerViewModel(
    buildCurrentReading({
      preferences: [evidence('Prefere WhatsApp.', { evidence_message_ids: ['m1', 'm2'], memory_ids: ['mem-1'] })],
    }),
  )

  assert.deepEqual(vm.preferences[0].evidence_message_ids, ['m1', 'm2'])
  assert.deepEqual(vm.preferences[0].memory_ids, ['mem-1'])
})
