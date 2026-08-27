// Fase 12A, Frente 2B — Blocker 4: memória durável do cliente vs. estado
// transacional do ciclo.

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
  buildDurableMemorySeedFromPriorState,
  applyDurableMemorySeedToFreshState,
  DURABLE_MEMORY_SEED_SUMMARY_PREFIX,
} = await import('./durable-memory-seed.ts')

function baseMemoryItem(overrides = {}) {
  return {
    id: 'mem-1',
    evidence_message_ids: ['msg-old-1'],
    memory_status: 'active',
    created_in_state_version: 3,
    updated_in_state_version: 3,
    closed_in_state_version: null,
    ...overrides,
  }
}

function priorStateFixture(overrides = {}) {
  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-old',
    version: 3,
    commercial_role: 'buyer',
    current_moment: { summary: 'x', evidence_message_ids: [] },
    current_priority: { summary: 'x', evidence_message_ids: [] },
    last_analyzed_message_ids: [],
    last_evidence_message_ids: [],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

test('buildDurableMemorySeedFromPriorState herda apenas facts client.* ativos e objections ativas', () => {
  const priorState = priorStateFixture({
    facts: [
      baseMemoryItem({
        id: 'fact-objective',
        kind: 'client.objective',
        value: null,
        summary: 'Quer emagrecer para a maratona.',
        confidence: 'high',
      }),
      baseMemoryItem({
        id: 'fact-superseded',
        kind: 'client.objective',
        value: null,
        summary: 'Objetivo antigo já superado.',
        confidence: 'high',
        memory_status: 'superseded',
        closed_in_state_version: 3,
      }),
      baseMemoryItem({
        id: 'fact-unknown-kind',
        kind: 'internal.not_client_taxonomy',
        value: 'x',
        summary: 'Não é memória do cliente.',
        confidence: 'medium',
      }),
    ],
    needs: [
      baseMemoryItem({
        id: 'need-1',
        kind: 'client.need_something',
        summary: 'Precisa de horário à noite.',
        confidence: 'medium',
      }),
    ],
    objections: [
      baseMemoryItem({
        id: 'objection-1',
        kind: 'client.objection.price',
        summary: 'Achou o plano caro.',
        confidence: 'medium',
      }),
    ],
    commitments: [
      baseMemoryItem({
        id: 'commitment-1',
        commitment_status: 'proposed',
        scheduled_at: null,
        proposed_at: '2026-08-01T10:00:00.000Z',
      }),
    ],
  })

  const seed = buildDurableMemorySeedFromPriorState(priorState)

  assert.ok(seed, 'deveria produzir um seed quando há memória durável')
  assert.equal(seed.source_cycle_id, 'cycle-old')

  assert.equal(seed.facts.length, 1, 'needs, commitments e facts fora da taxonomia client.* não são herdados')
  assert.equal(seed.facts[0].kind, 'client.objective')
  assert.equal(seed.facts[0].value, null)
  assert.match(seed.facts[0].summary, new RegExp(`^${DURABLE_MEMORY_SEED_SUMMARY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.equal(seed.facts[0].confidence, 'medium', 'confiança alta é rebaixada ao atravessar o ciclo')

  assert.equal(seed.objections.length, 1)
  assert.equal(seed.objections[0].kind, 'client.objection.price')
  assert.match(seed.objections[0].summary, /Achou o plano caro\.$/)
})

test('buildDurableMemorySeedFromPriorState retorna null quando não há nada herdável', () => {
  const priorState = priorStateFixture({
    facts: [
      baseMemoryItem({
        id: 'fact-1',
        kind: 'client.objective',
        value: null,
        summary: 'x',
        confidence: 'low',
        memory_status: 'superseded',
        closed_in_state_version: 3,
      }),
    ],
  })

  assert.equal(
    buildDurableMemorySeedFromPriorState(priorState),
    null,
  )
})

test('buildDurableMemorySeedFromPriorState é fail-safe: entradas malformadas são ignoradas, nunca lançam', () => {
  assert.equal(buildDurableMemorySeedFromPriorState(null), null)
  assert.equal(buildDurableMemorySeedFromPriorState(undefined), null)
  assert.equal(buildDurableMemorySeedFromPriorState('não é objeto'), null)
  assert.equal(buildDurableMemorySeedFromPriorState({}), null)

  const priorState = priorStateFixture({
    facts: [
      { kind: 'client.objective' }, // sem summary/confidence/memory_status
      null,
      'string-invalida',
      baseMemoryItem({
        id: 'fact-ok',
        kind: 'client.objective',
        value: null,
        summary: 'Fato válido.',
        confidence: 'low',
      }),
    ],
    objections: [
      { kind: 'client.objection.x' }, // sem summary/confidence
    ],
  })

  const seed = buildDurableMemorySeedFromPriorState(priorState)

  assert.ok(seed)
  assert.equal(seed.facts.length, 1)
  assert.equal(seed.objections.length, 0)
})

function createMemoryIdStub() {
  const calls = []
  return {
    calls,
    create_memory_id: (input) => {
      calls.push(input)
      return `stub-id-${calls.length}`
    },
  }
}

function candidateStateFixture(overrides = {}) {
  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-new',
    version: 1,
    commercial_role: 'buyer',
    current_moment: { summary: 'x', evidence_message_ids: [] },
    current_priority: { summary: 'x', evidence_message_ids: [] },
    last_analyzed_message_ids: ['msg-new-1'],
    last_evidence_message_ids: ['msg-new-1'],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-08-27T10:00:00.000Z',
    updated_at: '2026-08-27T10:00:00.000Z',
    ...overrides,
  }
}

test('applyDurableMemorySeedToFreshState só age quando previousState é null', () => {
  const { create_memory_id, calls } = createMemoryIdStub()

  const seed = {
    source_cycle_id: 'cycle-old',
    facts: [{ kind: 'client.objective', value: null, summary: 'x', confidence: 'medium' }],
    objections: [],
  }

  const candidateState = candidateStateFixture()

  const resultWithPrevious = applyDurableMemorySeedToFreshState({
    candidateState,
    previousState: candidateStateFixture({ version: 2 }),
    seed,
    create_memory_id,
  })

  assert.equal(resultWithPrevious, candidateState, 'não deve tocar o estado quando o ciclo já tem estado anterior')
  assert.equal(calls.length, 0)

  const resultWithoutSeed = applyDurableMemorySeedToFreshState({
    candidateState,
    previousState: null,
    seed: null,
    create_memory_id,
  })

  assert.equal(resultWithoutSeed, candidateState, 'não deve tocar o estado quando não há seed')
  assert.equal(calls.length, 0)
})

test('applyDurableMemorySeedToFreshState insere facts e objections herdados com evidence vazia e ids próprios', () => {
  const { create_memory_id, calls } = createMemoryIdStub()

  const seed = {
    source_cycle_id: 'cycle-old',
    facts: [{ kind: 'client.objective', value: null, summary: '[Herdado do ciclo anterior deste cliente] Quer emagrecer.', confidence: 'medium' }],
    objections: [{ kind: 'client.objection.price', summary: '[Herdado do ciclo anterior deste cliente] Achou caro.', confidence: 'low' }],
  }

  const candidateState = candidateStateFixture({
    facts: [
      {
        id: 'fresh-fact-1',
        kind: 'client.problem',
        value: null,
        summary: 'Fato observado nesta primeira mensagem.',
        confidence: 'high',
        evidence_message_ids: ['msg-new-1'],
        memory_status: 'active',
        created_in_state_version: 1,
        updated_in_state_version: 1,
        closed_in_state_version: null,
      },
    ],
  })

  const result = applyDurableMemorySeedToFreshState({
    candidateState,
    previousState: null,
    seed,
    create_memory_id,
  })

  assert.notEqual(result, candidateState)
  assert.equal(result.facts.length, 2, 'preserva o fato observado nesta conversa e acrescenta o herdado')
  assert.equal(result.facts[0].id, 'fresh-fact-1')

  const seededFact = result.facts[1]
  assert.equal(seededFact.kind, 'client.objective')
  assert.deepEqual(seededFact.evidence_message_ids, [])
  assert.equal(seededFact.memory_status, 'active')
  assert.equal(seededFact.created_in_state_version, 1)
  assert.equal(seededFact.updated_in_state_version, 1)
  assert.equal(seededFact.closed_in_state_version, null)

  assert.equal(result.objections.length, 1)
  assert.deepEqual(result.objections[0].evidence_message_ids, [])

  // create_memory_id foi chamado com um item_index fora do intervalo usado
  // pelo motor para os próprios itens do turno (nunca colide).
  for (const call of calls) {
    assert.ok(call.item_index >= 1_000_000)
    assert.equal(call.cycle_id, 'cycle-new')
    assert.equal(call.state_version, 1)
  }
})

test('applyDurableMemorySeedToFreshState não introduz itens quando o seed veio vazio', () => {
  const { create_memory_id } = createMemoryIdStub()

  const candidateState = candidateStateFixture()

  const result = applyDurableMemorySeedToFreshState({
    candidateState,
    previousState: null,
    seed: { source_cycle_id: 'cycle-old', facts: [], objections: [] },
    create_memory_id,
  })

  assert.equal(result, candidateState)
})
