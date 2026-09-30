// R9 — ciclo de vida do job de análise profunda.
//
// Causa comprovada em dados reais (Júlia e outros contatos, 2026-09-29/30):
// a primeira análise de uma conversa sem leitura anterior falhava a
// validação do contrato do modelo em 43% dos casos; cada nova tentativa
// dependia da visibilidade de 180 s da Vercel Queue (sem diretiva de
// retry) e a 2ª tentativa in-process do motor repetia o mesmo prompt às
// cegas. Resultado: 5–15 min até terminar, enquanto a extensão desistia
// em 240 s. Além disso, um worker morto deixava o job `running` para
// sempre, bloqueando a conversa (índice one_running_per_conversation).
//
// Estes testes exercitam o worker REAL (processStatefulCopilotBackgroundMessage)
// com um duplo em memória do Supabase e simulam a fila com a MESMA diretiva
// de retry que o consumer usa em produção.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS,
  buildStatefulCopilotBackgroundJobDescriptor,
  buildStatefulCopilotBackgroundJobMessage,
  classifyStatefulCopilotBackgroundJobStaleness,
  resolveStatefulCopilotBackgroundRetryDirective,
} from './stateful-copilot-background-job.ts'

import {
  StatefulCopilotBackgroundInvalidMessageError,
  processStatefulCopilotBackgroundMessage,
} from './stateful-copilot-background-worker.ts'

const TABLE = 'companion_background_analysis_jobs'

// ---------------------------------------------------------------------------
// Duplo em memória do supabase-js (só o que o worker chama) + o índice
// único parcial one_running_per_conversation.
// ---------------------------------------------------------------------------

class FakeQuery {
  constructor(store, table, mode, payload) {
    this.store = store
    this.table = table
    this.mode = mode
    this.payload = payload
    this.filters = []
    this.orderBy = null
    this.limitN = null
  }

  eq(column, value) { this.filters.push([column, 'eq', value]); return this }
  neq(column, value) { this.filters.push([column, 'neq', value]); return this }
  gt(column, value) { this.filters.push([column, 'gt', value]); return this }
  order(column, { ascending } = {}) { this.orderBy = { column, ascending: ascending !== false }; return this }
  limit(n) { this.limitN = n; return this }
  select() { return this }

  rows() {
    return this.table === TABLE ? this.store.jobs : (this.store.other[this.table] ??= [])
  }

  matching() {
    let matched = this.rows().filter((row) =>
      this.filters.every(([column, op, value]) =>
        op === 'eq' ? row[column] === value
          : op === 'neq' ? row[column] !== value
            : row[column] > value,
      ),
    )

    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      matched = [...matched].sort((a, b) => (a[column] === b[column] ? 0 : (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1)))
    }

    return this.limitN == null ? matched : matched.slice(0, this.limitN)
  }

  applyUpdate() {
    const matched = this.matching()

    if (this.table === TABLE && this.payload?.status === 'running') {
      for (const row of matched) {
        const conflict = this.store.jobs.some((other) =>
          other !== row &&
          other.status === 'running' &&
          other.company_id === row.company_id &&
          other.cycle_id === row.cycle_id &&
          other.conversation_key === row.conversation_key,
        )

        if (conflict) {
          return { data: null, error: { code: '23505', message: 'one_running_per_conversation' } }
        }
      }
    }

    for (const row of matched) {
      Object.assign(row, this.payload)
    }

    return { data: matched, error: null }
  }

  async maybeSingle() {
    if (this.mode === 'update') {
      const result = this.applyUpdate()
      return result.error
        ? { data: null, error: result.error }
        : { data: result.data[0] ? { ...result.data[0] } : null, error: null }
    }

    const matched = this.matching()
    return matched.length > 1
      ? { data: null, error: { message: 'multiple rows' } }
      : { data: matched[0] ? { ...matched[0] } : null, error: null }
  }

  then(resolve, reject) {
    const result = this.mode === 'update'
      ? this.applyUpdate()
      : { data: this.matching().map((row) => ({ ...row })), error: null }

    return Promise.resolve(result).then(resolve, reject)
  }
}

function createStore(jobs) {
  const store = { jobs, other: {} }

  return {
    store,
    admin: {
      from(table) {
        return {
          select: (columns) => new FakeQuery(store, table, 'select', columns),
          update: (patch) => new FakeQuery(store, table, 'update', patch),
          insert: async (row) => {
            (store.other[table] ??= []).push(row)
            return { data: null, error: null }
          },
        }
      },
    },
  }
}

function jobMessage({ conversation = 'phone:5544000000001', watermark = 'wm-1', requested_at = '2026-09-30T00:00:00.000Z' } = {}) {
  return buildStatefulCopilotBackgroundJobMessage({
    descriptor: buildStatefulCopilotBackgroundJobDescriptor({
      execution_scope: 'production',
      company_id: 'company-a',
      cycle_id: 'cycle-a',
      conversation_key: conversation,
      message_watermark: watermark,
      requested_at,
    }),
    device_key: 'device-a',
  })
}

function jobRow(message, overrides = {}) {
  return {
    analysis_job_id: message.analysis_job_id,
    company_id: message.company_id,
    cycle_id: message.cycle_id,
    conversation_key: message.conversation_key,
    message_watermark: message.message_watermark,
    requested_at: message.requested_at,
    status: 'queued',
    started_at: null,
    completed_at: null,
    updated_at: message.requested_at,
    attempt_count: 0,
    failure_code: null,
    failure_path: null,
    failure_invariant: null,
    communication_attempts: null,
    runtime_mode: null,
    response_source: null,
    candidate_state_version: null,
    automatic_crm_write: false,
    automatic_agenda_write: false,
    ...overrides,
  }
}

function succeededRuntime({ intervention = true } = {}) {
  return {
    mode: 'active',
    response_source: 'stateful',
    stateful_executed: true,
    response: {},
    commercial_reading: {},
    stateful_execution: {
      engine_mode: 'model',
      persistence_mode: 'persisted',
      persisted: true,
      candidate_state_version: 1,
      output_contract_version: 'phase-5.2-stateful-copilot-v4',
      communication_contract_version: 'phase-5.2-communication-v5',
      communication_intervention_needed: intervention,
      communication_message_present: intervention,
      communication_attempts: 1,
      communication_recovered_after_retry: false,
      known_message_count: 4,
      active_message_count: 4,
      commercial_config_status: 'configured',
      previous_state_found: false,
    },
    stateful_failure: null,
    automatic_crm_write: false,
    automatic_agenda_write: false,
  }
}

function failedRuntime({ code, retryable, invariant = null, path = null }) {
  return {
    mode: 'active_fallback_v1',
    response_source: 'v1',
    stateful_executed: true,
    response: undefined,
    stateful_execution: {
      engine_mode: 'model',
      persistence_mode: 'not_persisted',
      persisted: false,
      candidate_state_version: null,
      communication_attempts: null,
    },
    stateful_failure: {
      code,
      retryable,
      diagnostic_failure_path: path,
      diagnostic_failure_invariant: invariant,
    },
    fallback_reason: 'stateful_failed',
    automatic_crm_write: false,
    automatic_agenda_write: false,
  }
}

// Simula a Vercel Queue: entrega, e se o worker lançar, aplica a MESMA
// diretiva de retry do consumer (afterSeconds ou ack).
async function runThroughQueue({ message, admin, runtime }) {
  let waitedSeconds = 0
  const deliveries = []

  for (let delivery = 1; delivery <= STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS + 3; delivery += 1) {
    try {
      await processStatefulCopilotBackgroundMessage(
        message,
        { delivery_count: delivery },
        { create_admin_client: () => admin, run_runtime: runtime },
      )
      deliveries.push({ delivery, outcome: 'ack' })
      return { deliveries, waitedSeconds }
    } catch (error) {
      const directive = resolveStatefulCopilotBackgroundRetryDirective({
        retryable: !(error instanceof StatefulCopilotBackgroundInvalidMessageError),
        code: error instanceof Error ? error.message : null,
        delivery_count: delivery,
      })

      deliveries.push({ delivery, outcome: error.message, directive })

      if ('acknowledge' in directive) {
        return { deliveries, waitedSeconds }
      }

      waitedSeconds += directive.afterSeconds
    }
  }

  return { deliveries, waitedSeconds }
}

// ---------------------------------------------------------------------------
// Política da fila
// ---------------------------------------------------------------------------

test('diretiva de retry: espera curta e crescente, nunca a visibilidade de 180 s', () => {
  const waits = [1, 2, 3, 4].map((delivery) =>
    resolveStatefulCopilotBackgroundRetryDirective({ retryable: true, code: 'INVALID_MODEL_OUTPUT', delivery_count: delivery }).afterSeconds,
  )

  assert.deepEqual(waits, [3, 10, 20, 30])
  assert.ok(waits.reduce((sum, value) => sum + value, 0) < 120, 'soma das esperas cabe na janela de acompanhamento')
  assert.deepEqual(
    resolveStatefulCopilotBackgroundRetryDirective({ retryable: true, code: 'BACKGROUND_CONVERSATION_BUSY', delivery_count: 2 }),
    { afterSeconds: 15 },
  )
  assert.deepEqual(
    resolveStatefulCopilotBackgroundRetryDirective({ retryable: false, code: 'x', delivery_count: 1 }),
    { acknowledge: true },
    'mensagem inválida nunca é reentregue',
  )
  assert.deepEqual(
    resolveStatefulCopilotBackgroundRetryDirective({ retryable: true, code: 'X', delivery_count: STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS + 2 }),
    { acknowledge: true },
    'teto de entregas: a recuperação passa a ser do produtor',
  )
})

test('órfão: queued sem sinal por 5 min e running com lease vencido; job vivo nunca é órfão', () => {
  const now = Date.parse('2026-09-30T00:10:00.000Z')

  assert.equal(classifyStatefulCopilotBackgroundJobStaleness({ status: 'queued', updated_at: '2026-09-30T00:04:59.000Z', started_at: null, now_ms: now }), 'stale_queued')
  assert.equal(classifyStatefulCopilotBackgroundJobStaleness({ status: 'queued', updated_at: '2026-09-30T00:08:00.000Z', started_at: null, now_ms: now }), 'fresh')
  assert.equal(classifyStatefulCopilotBackgroundJobStaleness({ status: 'running', updated_at: null, started_at: '2026-09-30T00:06:00.000Z', now_ms: now }), 'stale_running')
  assert.equal(classifyStatefulCopilotBackgroundJobStaleness({ status: 'running', updated_at: null, started_at: '2026-09-30T00:09:00.000Z', now_ms: now }), 'fresh')
  for (const status of ['succeeded', 'failed', 'superseded']) {
    assert.equal(classifyStatefulCopilotBackgroundJobStaleness({ status, updated_at: '2026-09-01T00:00:00.000Z', started_at: '2026-09-01T00:00:00.000Z', now_ms: now }), 'fresh')
  }
})

test('mensagem de fila inválida é identificada (ack, nunca reentrega infinita)', async () => {
  const { admin } = createStore([])

  await assert.rejects(
    () => processStatefulCopilotBackgroundMessage({ job_version: 'x' }, { delivery_count: 1 }, { create_admin_client: () => admin, run_runtime: async () => succeededRuntime() }),
    (error) => error instanceof StatefulCopilotBackgroundInvalidMessageError,
  )
})

// ---------------------------------------------------------------------------
// Worker real: job órfão e disputa por conversa
// ---------------------------------------------------------------------------

test('worker morto: running antigo de outro watermark é encerrado e a nova análise roda na PRIMEIRA entrega', async () => {
  const orphan = jobMessage({ watermark: 'wm-old', requested_at: '2026-09-14T04:47:27.000Z' })
  const fresh = jobMessage({ watermark: 'wm-new' })
  const { admin, store } = createStore([
    jobRow(orphan, { status: 'running', started_at: '2026-09-14T04:49:05.000Z', attempt_count: 5 }),
    jobRow(fresh),
  ])

  let runs = 0
  const { deliveries } = await runThroughQueue({
    message: fresh,
    admin,
    runtime: async () => { runs += 1; return succeededRuntime() },
  })

  assert.deepEqual(deliveries.map((entry) => entry.outcome), ['ack'])
  assert.equal(runs, 1)
  assert.equal(store.jobs[0].status, 'failed')
  assert.equal(store.jobs[0].failure_code, 'BACKGROUND_WORKER_LEASE_EXPIRED')
  assert.equal(store.jobs[1].status, 'succeeded')
})

test('conversa ocupada por job VIVO: espera curta; se persistir até a última entrega, estado terminal recuperável (nunca queued eterno)', async () => {
  const live = jobMessage({ watermark: 'wm-live' })
  const blocked = jobMessage({ watermark: 'wm-blocked', requested_at: '2026-09-30T00:00:05.000Z' })
  const { admin, store } = createStore([
    jobRow(live, { status: 'running', started_at: new Date().toISOString() }),
    jobRow(blocked),
  ])

  const { deliveries, waitedSeconds } = await runThroughQueue({
    message: blocked,
    admin,
    runtime: async () => succeededRuntime(),
  })

  assert.ok(deliveries.slice(0, -1).every((entry) => entry.outcome === 'BACKGROUND_CONVERSATION_BUSY'))
  assert.equal(deliveries.at(-1).outcome, 'ack')
  assert.equal(deliveries.length, STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS)
  assert.equal(waitedSeconds, 15 * (STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS - 1))
  assert.equal(store.jobs[1].status, 'failed')
  assert.equal(store.jobs[1].failure_code, 'BACKGROUND_CONVERSATION_BUSY')
  assert.equal(store.jobs[0].status, 'running', 'o job vivo nunca é derrubado')
})

test('mesmo job já rodando em outra entrega viva: a entrega extra não roda IA em paralelo', async () => {
  const message = jobMessage()
  const { admin, store } = createStore([
    jobRow(message, { status: 'running', started_at: new Date().toISOString(), attempt_count: 1 }),
  ])

  let runs = 0
  await assert.rejects(
    () => processStatefulCopilotBackgroundMessage(message, { delivery_count: 2 }, { create_admin_client: () => admin, run_runtime: async () => { runs += 1; return succeededRuntime() } }),
    (error) => error.message === 'BACKGROUND_JOB_ALREADY_RUNNING',
  )

  await processStatefulCopilotBackgroundMessage(message, { delivery_count: STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS }, { create_admin_client: () => admin, run_runtime: async () => { runs += 1; return succeededRuntime() } })

  assert.equal(runs, 0)
  assert.equal(store.jobs[0].status, 'running')
})

// ---------------------------------------------------------------------------
// Corpus heterogêneo: todo perfil chega a estado terminal rápido.
// O runtime aqui representa o COMPORTAMENTO observado por perfil (falha de
// contrato na 1ª análise, sucesso, precondição, áudio sem transcrição) — o
// que está sob teste é o ciclo de vida, não a IA.
// ---------------------------------------------------------------------------

const CORPUS = [
  { id: 'A', label: 'conversa longa antiga (com leitura)', outcomes: ['ok'], terminal: 'succeeded' },
  { id: 'B', label: 'conversa curta recente', outcomes: ['ok'], terminal: 'succeeded' },
  { id: 'C', label: 'lead novo sem leitura anterior (1ª tentativa viola contrato)', outcomes: ['contract', 'ok'], terminal: 'succeeded' },
  { id: 'D', label: 'lead com leitura persistida', outcomes: ['ok'], terminal: 'succeeded' },
  { id: 'E', label: 'várias sessões (conflito de escrita transitório)', outcomes: ['conflict', 'ok'], terminal: 'succeeded' },
  { id: 'F', label: 'conversa não comercial (sem intervenção)', outcomes: ['no_intervention'], terminal: 'succeeded' },
  { id: 'G', label: 'poucas mensagens (precondição bloqueada)', outcomes: ['blocked'], terminal: 'failed' },
  { id: 'H', label: 'áudio sem transcrição', outcomes: ['audio'], terminal: 'failed' },
  { id: 'I', label: 'contrato sempre inválido (esgota entregas)', outcomes: ['contract', 'contract', 'contract', 'contract', 'contract'], terminal: 'failed' },
]

function runtimeFor(outcome) {
  switch (outcome) {
    case 'ok':
      return succeededRuntime()
    case 'no_intervention':
      return succeededRuntime({ intervention: false })
    case 'contract':
      return failedRuntime({ code: 'INVALID_MODEL_OUTPUT', retryable: true, invariant: 'CUSTOMER_EVIDENCE_REQUIRED', path: 'output.state_patch.facts_to_add[0].evidence_message_ids' })
    case 'audio':
      return failedRuntime({ code: 'INVALID_MODEL_OUTPUT', retryable: true, invariant: 'AUDIO_EVIDENCE_NOT_TRANSCRIBED', path: 'output.evidence_message_ids' })
    case 'conflict':
      return { ...succeededRuntime(), mode: 'active_fallback_v1', stateful_execution: { ...succeededRuntime().stateful_execution, persistence_mode: 'conflict', persisted: false }, stateful_failure: null }
    case 'blocked':
      return { ...succeededRuntime(), mode: 'active_fallback_v1', stateful_execution: { ...succeededRuntime().stateful_execution, engine_mode: 'blocked', persistence_mode: 'not_persisted', persisted: false }, stateful_failure: null }
    default:
      throw new Error(outcome)
  }
}

for (const profile of CORPUS) {
  test(`corpus ${profile.id} — ${profile.label}: estado terminal (${profile.terminal}) sem spinner eterno`, async () => {
    const message = jobMessage({ conversation: `phone:55440000000${profile.id.charCodeAt(0)}`, watermark: `wm-${profile.id}` })
    const { admin, store } = createStore([jobRow(message)])
    let call = 0

    const { deliveries, waitedSeconds } = await runThroughQueue({
      message,
      admin,
      runtime: async () => runtimeFor(profile.outcomes[Math.min(call++, profile.outcomes.length - 1)]),
    })

    const job = store.jobs[0]

    assert.equal(job.status, profile.terminal, JSON.stringify(deliveries))
    assert.ok(!['queued', 'running'].includes(job.status))
    assert.ok(deliveries.length <= STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS)
    assert.ok(waitedSeconds <= 63, `esperas da fila somam ${waitedSeconds}s (antes: ~180 s por tentativa)`)
  })
}
