import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../scripts/typescript-test-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

const {
  retryCompanionAnalysisJob,
} = await import('./companion-analysis-job-retry.ts')

const IDS = {
  company: 'aaaaaaaa-0000-4000-8000-000000000001',
  user: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const JOB_ID = 'b71f88ea13bd4b300015d296857d7de3afb7a8ba3b4875cc545f370919e258e1'
const WATERMARK = 'watermark-1'
const CONVERSATION = 'whatsapp:+5511999999999'

function fixtures() {
  return {
    memberships: [{
      company_id: IDS.company,
      user_id: IDS.user,
      role: 'member',
      is_active: true,
    }],
    profiles: [{
      id: IDS.user,
      is_active_global: true,
    }],
    cycles: [{
      id: IDS.cycle,
      company_id: IDS.company,
      owner_user_id: IDS.user,
    }],
    jobs: [{
      analysis_job_id: JOB_ID,
      company_id: IDS.company,
      cycle_id: IDS.cycle,
      conversation_key: CONVERSATION,
      message_watermark: WATERMARK,
      status: 'failed',
      requested_at: '2026-08-23T10:00:00.000Z',
      updated_at: '2026-08-23T10:02:00.000Z',
      started_at: '2026-08-23T10:00:01.000Z',
      completed_at: '2026-08-23T10:02:00.000Z',
      runtime_mode: 'failed',
      response_source: 'stateful',
      candidate_state_version: null,
      failure_code: 'STATEFUL_BACKGROUND_FAILED',
      failure_path: 'worker',
      failure_invariant: 'retryable=false',
      communication_attempts: 2,
      attempt_count: 5,
      automatic_crm_write: false,
      automatic_agenda_write: false,
    }],
    events: [],
  }
}

function matches(row, filters) {
  return filters.every(({ column, value }) => row[column] === value)
}

function createAdmin(data, hooks = {}) {
  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.mode = 'read'
      this.updateValues = null
      this.maxRows = null
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    limit(count) {
      this.maxRows = count
      return this
    }

    update(values) {
      this.mode = 'update'
      this.updateValues = values
      return this
    }

    tableRows() {
      if (this.table === 'company_memberships') return data.memberships
      if (this.table === 'profiles') return data.profiles ?? []
      if (this.table === 'sales_cycles') return data.cycles
      if (this.table === 'companion_background_analysis_jobs') return data.jobs
      if (this.table === 'companion_commercial_state_events') return data.events
      return []
    }

    async resolveRows() {
      const rows = this.tableRows()
      const matching = rows.filter((row) => matches(row, this.filters))

      if (this.mode === 'update') {
        if (hooks.beforeUpdate) {
          await hooks.beforeUpdate({
            table: this.table,
            filters: [...this.filters],
            values: { ...this.updateValues },
            matching,
          })
        }

        const current = rows.filter((row) => matches(row, this.filters))
        for (const row of current) {
          Object.assign(row, this.updateValues)
        }
        return current
      }

      return this.maxRows === null
        ? matching
        : matching.slice(0, this.maxRows)
    }

    async maybeSingle() {
      const rows = await this.resolveRows()
      return {
        data: rows[0]
          ? { ...rows[0] }
          : null,
        error: null,
      }
    }

    then(resolve, reject) {
      return this.resolveRows()
        .then((rows) => ({ data: rows, error: null }))
        .then(resolve, reject)
    }
  }

  return {
    from(table) {
      return new Query(table)
    },
  }
}

function token() {
  return {
    sub: IDS.user,
    company_id: IDS.company,
    role: 'member',
    iat: 1,
    exp: 9999999999,
  }
}

function retryArgs(data, publish, hooks) {
  return {
    admin: createAdmin(data, hooks),
    token: token(),
    analysis_job_id: JOB_ID,
    device_key: 'device-key-1',
    publish,
  }
}

test('T26: failed -> queued publica uma única nova entrega e preserva requested_at', async () => {
  const data = fixtures()
  const published = []
  const result = await retryCompanionAnalysisJob(
    retryArgs(data, async (...args) => published.push(args)),
  )

  assert.equal(result.status, 'queued')
  assert.equal(data.jobs[0].status, 'queued')
  assert.equal(data.jobs[0].requested_at, '2026-08-23T10:00:00.000Z')
  assert.equal(data.jobs[0].failure_code, null)
  assert.equal(published.length, 1)
  assert.equal(published[0][1].requested_at, '2026-08-23T10:00:00.000Z')
  assert.notEqual(published[0][2].idempotencyKey, JOB_ID)
  assert.match(published[0][2].idempotencyKey, new RegExp(`^${JOB_ID}:retry:`))
})

test('T27: publish falha compensa queued -> failed e nunca deixa job órfão', async () => {
  const data = fixtures()
  const result = await retryCompanionAnalysisJob(
    retryArgs(data, async () => {
      throw new Error('queue unavailable')
    }),
  )

  assert.equal(result.status, 'failed')
  assert.equal(data.jobs[0].status, 'failed')
  assert.equal(data.jobs[0].failure_code, 'QUEUE_PUBLISH_FAILED')
  assert.ok(data.jobs[0].completed_at)
})

test('T28: dois retries concorrentes têm um único vencedor do CAS e uma publicação', async () => {
  const data = fixtures()
  const published = []

  const publish = async (...args) => {
    published.push(args)
  }

  const [left, right] = await Promise.all([
    retryCompanionAnalysisJob(retryArgs(data, publish)),
    retryCompanionAnalysisJob(retryArgs(data, publish)),
  ])

  assert.equal(published.length, 1)
  assert.equal(data.jobs[0].status, 'queued')
  assert.ok(['queued', 'running'].includes(left.status) || left.status === 'queued')
  assert.ok(['queued', 'running'].includes(right.status) || right.status === 'queued')
})

test('T29: compensação antiga não derruba queued de tentativa posterior', async () => {
  const data = fixtures()

  let releaseCompensation
  const compensationGate = new Promise((resolve) => {
    releaseCompensation = resolve
  })

  let compensationEnteredResolve
  const compensationEntered = new Promise((resolve) => {
    compensationEnteredResolve = resolve
  })

  let holdOldCompensation = true

  const oldAttempt = retryCompanionAnalysisJob(
    retryArgs(
      data,
      async () => {
        throw new Error('old publish failed')
      },
      {
        async beforeUpdate({ values }) {
          if (
            holdOldCompensation &&
            values.failure_code === 'QUEUE_PUBLISH_FAILED'
          ) {
            compensationEnteredResolve()
            await compensationGate
          }
        },
      },
    ),
  )

  await compensationEntered

  /*
   * Simula uma transição legítima posterior enquanto a compensação antiga
   * ainda está atrasada. O updated_at novo é a proteção que a compensação
   * antiga precisa respeitar.
   */
  data.jobs[0].status = 'failed'
  data.jobs[0].updated_at = '2099-01-01T00:00:00.000Z'
  data.jobs[0].failure_code = 'LATER_RETRYABLE_FAILURE'

  await new Promise((resolve) => setTimeout(resolve, 5))

  holdOldCompensation = false
  const newer = await retryCompanionAnalysisJob(
    retryArgs(data, async () => {}),
  )

  assert.equal(newer.status, 'queued')
  const newerUpdatedAt = data.jobs[0].updated_at

  releaseCompensation()
  await oldAttempt

  assert.equal(data.jobs[0].status, 'queued')
  assert.equal(data.jobs[0].updated_at, newerUpdatedAt)
  assert.equal(data.jobs[0].failure_code, null)
})

test('refresh manual reabre succeeded quando allow_succeeded=true', async () => {
  const data = fixtures()

  data.jobs[0].status = 'succeeded'
  data.jobs[0].candidate_state_version = 1

  data.events.push({
    company_id: IDS.company,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION,
    candidate_state_version: 1,
    output_contract_version: 'phase-5.2-stateful-copilot-v4',
    generated_at: '2026-08-23T10:01:00.000Z',
    normalized_output: {
      contract_version: 'phase-5.2-stateful-copilot-v4',
      commercial_role: 'buyer',
      commercial_relevance: 'commercial',
      interpretation: {
        current_moment: {
          summary: 'ok',
        },
      },
      strategy: {
        next_move: 'seguir',
        recommended_question: null,
        suggested_message: null,
      },
      communication: {
        contract_version: 'phase-5.2-communication-v5',
        commercial_reading: {
          contract_version: 'commercial-reading-v1',
        },
      },
    },
  })

  const published = []

  const result =
    await retryCompanionAnalysisJob({
      ...retryArgs(
        data,
        async (...args) => {
          published.push(args)
        },
      ),
      allow_succeeded: true,
    })

  assert.equal(result.status, 'queued')
  assert.equal(data.jobs[0].status, 'queued')
  assert.equal(
    data.jobs[0].candidate_state_version,
    null,
  )
  assert.equal(published.length, 1)
})

test('succeeded/superseded e queued/running VIVOS nunca são reabertos', async () => {
  for (const status of ['succeeded', 'superseded', 'queued', 'running']) {
    const data = fixtures()
    data.jobs[0].status = status
    // queued/running com sinal de execução recente: há entrega viva.
    if (status === 'queued' || status === 'running') {
      const now = new Date().toISOString()
      data.jobs[0].updated_at = now
      data.jobs[0].started_at = status === 'running' ? now : null
    }
    if (status === 'succeeded') {
      data.jobs[0].candidate_state_version = 1
      data.events.push({
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION,
        candidate_state_version: 1,
        output_contract_version: 'phase-5.2-stateful-copilot-v4',
        generated_at: '2026-08-23T10:01:00.000Z',
        normalized_output: {
          contract_version: 'phase-5.2-stateful-copilot-v4',
          commercial_role: 'buyer',
          commercial_relevance: 'commercial',
          interpretation: { current_moment: { summary: 'ok' } },
          strategy: {
            next_move: 'seguir',
            recommended_question: null,
            suggested_message: null,
          },
          communication: {
            contract_version: 'phase-5.2-communication-v5',
            commercial_reading: {
              contract_version: 'commercial-reading-v1',
            },
          },
        },
      })
    }

    let publishes = 0
    const result = await retryCompanionAnalysisJob(
      retryArgs(data, async () => { publishes += 1 }),
    )

    assert.equal(result.status, status)
    assert.equal(publishes, 0)
  }
})

// R9 — job órfão: `queued` sem sinal de execução além do limite ou
// `running` com lease vencido. "Tentar novamente" precisa recuperar de
// verdade (reabrir + republicar), uma única vez, sem trocar a identidade.
for (const scenario of [
  { status: 'queued', updated_at: '2026-08-23T10:00:00.000Z', started_at: null },
  { status: 'running', updated_at: '2026-08-23T10:00:01.000Z', started_at: '2026-08-23T10:00:01.000Z' },
]) {
  test(`órfão ${scenario.status}: retry reabre e publica uma única entrega nova`, async () => {
    const data = fixtures()
    Object.assign(data.jobs[0], {
      status: scenario.status,
      updated_at: scenario.updated_at,
      started_at: scenario.started_at,
      completed_at: null,
      failure_code: null,
    })

    const published = []
    const result = await retryCompanionAnalysisJob(
      retryArgs(data, async (topic, message, options) => {
        published.push({ topic, message, options })
      }),
    )

    assert.equal(result.status, 'queued')
    assert.equal(published.length, 1)
    assert.equal(published[0].message.analysis_job_id, JOB_ID)
    assert.equal(published[0].message.requested_at, '2026-08-23T10:00:00.000Z')
    assert.match(published[0].options.idempotencyKey, new RegExp(`^${JOB_ID}:recover:`))
    assert.equal(data.jobs[0].status, 'queued')
    assert.equal(data.jobs[0].started_at, null)
    assert.equal(data.jobs[0].attempt_count, 0)
  })
}

test('órfão: dois retries concorrentes têm um único vencedor e uma publicação', async () => {
  const data = fixtures()
  Object.assign(data.jobs[0], {
    status: 'queued',
    updated_at: '2026-08-23T10:00:00.000Z',
    started_at: null,
    completed_at: null,
  })

  let publishes = 0
  const publish = async () => { publishes += 1 }

  const [first, second] = await Promise.all([
    retryCompanionAnalysisJob(retryArgs(data, publish)),
    retryCompanionAnalysisJob(retryArgs(data, publish)),
  ])

  assert.equal(publishes, 1)
  assert.equal(first.status, 'queued')
  assert.equal(second.status, 'queued')
})

test('"Atualizar análise" (succeeded reaberto) publica com force_reanalysis; "Tentar novamente" (failed) não', async () => {
  const refreshed = fixtures()

  refreshed.jobs[0].status = 'succeeded'
  refreshed.jobs[0].candidate_state_version = 1

  refreshed.events.push({
    company_id: IDS.company,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION,
    candidate_state_version: 1,
    output_contract_version: 'phase-5.2-stateful-copilot-v4',
    generated_at: '2026-08-23T10:01:00.000Z',
    normalized_output: {
      contract_version: 'phase-5.2-stateful-copilot-v4',
      commercial_role: 'buyer',
      commercial_relevance: 'commercial',
      interpretation: { current_moment: { summary: 'ok' } },
      strategy: {
        next_move: 'seguir',
        recommended_question: null,
        suggested_message: null,
      },
      communication: {
        contract_version: 'phase-5.2-communication-v5',
        commercial_reading: { contract_version: 'commercial-reading-v1' },
      },
    },
  })

  const refreshPublished = []

  await retryCompanionAnalysisJob({
    ...retryArgs(
      refreshed,
      async (...args) => {
        refreshPublished.push(args)
      },
    ),
    allow_succeeded: true,
  })

  assert.equal(refreshPublished.length, 1)
  assert.equal(refreshPublished[0][1].force_reanalysis, true)

  const failedPublished = []

  await retryCompanionAnalysisJob(
    retryArgs(
      fixtures(),
      async (...args) => {
        failedPublished.push(args)
      },
    ),
  )

  assert.equal(failedPublished.length, 1)
  assert.equal('force_reanalysis' in failedPublished[0][1], false)
})
