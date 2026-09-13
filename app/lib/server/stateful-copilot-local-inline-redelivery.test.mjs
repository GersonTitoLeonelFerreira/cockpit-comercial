import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStatefulCopilotBackgroundJobDescriptor,
  buildStatefulCopilotBackgroundJobMessage,
} from './stateful-copilot-background-job.ts'

import {
  processStatefulCopilotBackgroundMessage,
} from './stateful-copilot-background-worker.ts'

class FakeQueryBuilder {
  constructor(rows, mode, payload) {
    this.rows = rows
    this.mode = mode
    this.payload = payload
    this.filters = []
    this.orderBy = null
    this.limitN = null
  }

  eq(column, value) {
    this.filters.push({ column, op: 'eq', value })
    return this
  }

  gt(column, value) {
    this.filters.push({ column, op: 'gt', value })
    return this
  }

  order(column, { ascending } = {}) {
    this.orderBy = {
      column,
      ascending: ascending !== false,
    }
    return this
  }

  limit(value) {
    this.limitN = value
    return this
  }

  select() {
    return this
  }

  matches(row) {
    return this.filters.every((filter) => {
      if (filter.op === 'eq') {
        return row[filter.column] === filter.value
      }

      if (filter.op === 'gt') {
        return row[filter.column] > filter.value
      }

      return true
    })
  }

  matchingRows() {
    let matched = this.rows.filter(
      row => this.matches(row),
    )

    if (this.orderBy) {
      const { column, ascending } = this.orderBy

      matched = [...matched].sort((first, second) => {
        if (first[column] === second[column]) {
          return 0
        }

        const direction =
          first[column] > second[column]
            ? 1
            : -1

        return ascending
          ? direction
          : -direction
      })
    }

    if (this.limitN != null) {
      matched = matched.slice(0, this.limitN)
    }

    return matched
  }

  async maybeSingle() {
    const matched = this.matchingRows()

    if (matched.length > 1) {
      return {
        data: null,
        error: {
          message: 'fake: multiple rows',
        },
      }
    }

    if (this.mode === 'update') {
      if (matched.length === 1) {
        Object.assign(
          matched[0],
          this.payload,
        )

        return {
          data: { ...matched[0] },
          error: null,
        }
      }

      return {
        data: null,
        error: null,
      }
    }

    return {
      data:
        matched[0]
          ? { ...matched[0] }
          : null,
      error: null,
    }
  }

  then(resolve) {
    for (const row of this.matchingRows()) {
      Object.assign(row, this.payload)
    }

    resolve({
      data: null,
      error: null,
    })
  }
}

function createFakeAdmin(rows) {
  return {
    from(table) {
      const tableRows =
        table === 'companion_background_analysis_jobs'
          ? rows
          : []

      return {
        select(columns) {
          return new FakeQueryBuilder(
            tableRows,
            'select',
            columns,
          )
        },

        update(patch) {
          return new FakeQueryBuilder(
            tableRows,
            'update',
            patch,
          )
        },

        insert() {
          return Promise.resolve({
            data: null,
            error: null,
          })
        },
      }
    },
  }
}

function buildMessage() {
  const descriptor =
    buildStatefulCopilotBackgroundJobDescriptor({
      company_id: 'company-local',
      cycle_id: 'cycle-local',
      conversation_key:
        'phone:5511953442244',
      message_watermark:
        'local-watermark',
      requested_at:
        '2026-09-13T01:51:05.000Z',
    })

  return buildStatefulCopilotBackgroundJobMessage({
    descriptor,
    device_key: 'device-local',
  })
}

function seedQueuedRow(message) {
  return {
    analysis_job_id:
      message.analysis_job_id,
    company_id:
      message.company_id,
    cycle_id:
      message.cycle_id,
    conversation_key:
      message.conversation_key,
    message_watermark:
      message.message_watermark,
    requested_at:
      message.requested_at,
    status: 'queued',
    started_at: null,
    completed_at: null,
    updated_at: null,
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
  }
}

function buildRetryableConflictResult() {
  return {
    mode: 'active_fallback_v1',
    response_source: 'v1',
    stateful_executed: true,
    response: undefined,
    stateful_execution: {
      engine_mode: 'model',
      persistence_mode: 'conflict',
      persisted: false,
      candidate_state_version: null,
      output_contract_version: null,
      communication_contract_version: null,
      communication_intervention_needed: null,
      communication_message_present: null,
      communication_attempts: 2,
      communication_recovered_after_retry: false,
      known_message_count: 12,
      active_message_count: 12,
      commercial_config_status: 'not_configured',
      previous_state_found: true,
    },
    stateful_failure: null,
    fallback_reason:
      'stateful_state_not_persisted',
    automatic_crm_write: false,
    automatic_agenda_write: false,
  }
}

function buildActiveResult() {
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
      candidate_state_version: 9,
      output_contract_version:
        'phase-5.2-stateful-copilot-v4',
      communication_contract_version:
        'phase-5.2-communication-v5',
      communication_intervention_needed: true,
      communication_message_present: true,
      communication_attempts: 1,
      communication_recovered_after_retry: false,
      known_message_count: 12,
      active_message_count: 12,
      commercial_config_status: 'not_configured',
      previous_state_found: true,
    },
    stateful_failure: null,
    automatic_crm_write: false,
    automatic_agenda_write: false,
  }
}

async function withLocalInlineQueue(run) {
  const previousNodeEnv =
    process.env.NODE_ENV
  const previousInline =
    process.env.COMPANION_LOCAL_INLINE_QUEUE

  process.env.NODE_ENV =
    'development'
  process.env.COMPANION_LOCAL_INLINE_QUEUE =
    '1'

  try {
    await run()
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV =
        previousNodeEnv
    }

    if (previousInline === undefined) {
      delete process.env
        .COMPANION_LOCAL_INLINE_QUEUE
    } else {
      process.env
        .COMPANION_LOCAL_INLINE_QUEUE =
        previousInline
    }
  }
}

test(
  'local-inline redelivers retryable failure instead of terminalizing delivery 1',
  async () => {
    await withLocalInlineQueue(async () => {
      const message = buildMessage()
      const rows = [seedQueuedRow(message)]
      const admin = createFakeAdmin(rows)
      let calls = 0

      await processStatefulCopilotBackgroundMessage(
        message,
        { delivery_count: 1 },
        {
          create_admin_client: () => admin,
          run_runtime: async () => {
            calls += 1

            return calls === 1
              ? buildRetryableConflictResult()
              : buildActiveResult()
          },
        },
      )

      assert.equal(calls, 2)
      assert.equal(rows[0].status, 'succeeded')
      assert.equal(rows[0].attempt_count, 2)
      assert.equal(
        rows[0].candidate_state_version,
        9,
      )
      assert.equal(rows[0].failure_code, null)
    })
  },
)

test(
  'local-inline respeita o mesmo limite de entregas do worker e preserva a falha real',
  async () => {
    await withLocalInlineQueue(async () => {
      const message = buildMessage()
      const rows = [seedQueuedRow(message)]
      const admin = createFakeAdmin(rows)
      let calls = 0

      await processStatefulCopilotBackgroundMessage(
        message,
        { delivery_count: 1 },
        {
          create_admin_client: () => admin,
          run_runtime: async () => {
            calls += 1
            return buildRetryableConflictResult()
          },
        },
      )

      assert.equal(calls, 5)
      assert.equal(rows[0].status, 'failed')
      assert.equal(rows[0].attempt_count, 5)
      assert.equal(
        rows[0].failure_code,
        'STATEFUL_STATE_WRITE_CONFLICT',
      )
      assert.notEqual(
        rows[0].failure_code,
        'LOCAL_INLINE_WORKER_FAILED',
      )
    })
  },
)