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

test('succeeded/superseded/queued/running nunca são reabertos', async () => {
  for (const status of ['succeeded', 'superseded', 'queued', 'running']) {
    const data = fixtures()
    data.jobs[0].status = status
    if (status === 'succeeded') {
      data.jobs[0].candidate_state_version = 1
      data.events.push({
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION,
        candidate_state_version: 1,
        output_contract_version: 'phase-5.2-stateful-copilot-v3',
        generated_at: '2026-08-23T10:01:00.000Z',
        normalized_output: {
          contract_version: 'phase-5.2-stateful-copilot-v3',
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
