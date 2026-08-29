// FASE 13 Frente 1 — Blocker 3 da reauditoria do Controle Mestre: prova,
// com um teste real (não só a classificação unitária de
// resolveStatefulCopilotBackgroundFailureOutcome), que o worker
// efetivamente percorre running -> conflict -> queued -> nova entrega ->
// succeeded, em vez de deixar o job terminalmente 'failed' já na primeira
// entrega quando o orquestrador stateful devolve um conflito de
// persistência (stateful_failure: null, stateful_execution.persistence_mode
// === 'conflict').
//
// Não existia, antes desta correção, nenhum teste que exercitasse
// processStatefulCopilotBackgroundMessage fim a fim — só testes de
// contrato de banco via SQL direto (supabase/phase-tests/phase-12a-
// background-jobs-database-contract.test.mjs) e testes baseados em
// regex/substring sobre o texto-fonte do worker
// (phase12a-background-analysis-foundation.test.mjs,
// phase12a-background-concurrency.test.mjs). Nenhum dos dois prova o
// comportamento real de retry.
//
// Em vez de subir um Postgres/PGlite completo só para isto, este teste usa
// um duplo em memória mínimo do client supabase-js — implementando apenas
// as operações que este worker realmente chama (.from().select()/.update(),
// .eq(), .gt(), .order(), .limit(), .maybeSingle(), e o await direto de um
// .update().eq() sem .select()) — injetado via o novo parâmetro
// `dependencies` de processStatefulCopilotBackgroundMessage (só existe
// para teste; em produção as duas dependências continuam sendo sempre as
// implementações reais).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStatefulCopilotBackgroundJobDescriptor,
  buildStatefulCopilotBackgroundJobMessage,
} from './stateful-copilot-background-job.ts'

import {
  buildStatefulCopilotBackgroundRuntimeOptions,
  processStatefulCopilotBackgroundMessage,
} from './stateful-copilot-background-worker.ts'

import {
  resolveStatefulCopilotActivationGate,
} from '../companion/stateful-copilot-activation-gate.ts'

const TABLE =
  'companion_background_analysis_jobs'

class FakeQueryBuilder {
  constructor(table, rows, mode, payload) {
    this.table = table
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
    this.orderBy = { column, ascending: ascending !== false }
    return this
  }

  limit(n) {
    this.limitN = n
    return this
  }

  select() {
    this._wantsSelect = true
    return this
  }

  _matches(row) {
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

  _matchingRows() {
    let matched = this.rows.filter((row) => this._matches(row))

    if (this.orderBy) {
      const { column, ascending } = this.orderBy

      matched = [...matched].sort((a, b) => {
        if (a[column] === b[column]) return 0
        const direction = a[column] > b[column] ? 1 : -1
        return ascending ? direction : -direction
      })
    }

    if (this.limitN != null) {
      matched = matched.slice(0, this.limitN)
    }

    return matched
  }

  async maybeSingle() {
    const matched = this._matchingRows()

    if (matched.length > 1) {
      return {
        data: null,
        error: { message: 'fake: multiple rows matched maybeSingle()' },
      }
    }

    if (this.mode === 'update') {
      if (matched.length === 1) {
        Object.assign(matched[0], this.payload)
        return { data: { ...matched[0] }, error: null }
      }

      return { data: null, error: null }
    }

    return { data: matched[0] ? { ...matched[0] } : null, error: null }
  }

  then(resolve) {
    // Só usado quando o worker faz `await` direto de um
    // `.update(patch).eq(...)` sem encadear `.select()/.maybeSingle()`.
    const matched = this._matchingRows()

    for (const row of matched) {
      Object.assign(row, this.payload)
    }

    resolve({ data: null, error: null })
  }
}

function createFakeAdmin(rows) {
  return {
    from(table) {
      return {
        select(columns) {
          return new FakeQueryBuilder(table, rows, 'select', columns)
        },

        update(patch) {
          return new FakeQueryBuilder(table, rows, 'update', patch)
        },
      }
    },
  }
}

function buildFallbackConflictResult() {
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
      communication_attempts: null,
      communication_recovered_after_retry: null,
      known_message_count: 1,
      active_message_count: 1,
      commercial_config_status: 'not_configured',
      previous_state_found: false,
    },
    stateful_failure: null,
    fallback_reason: 'stateful_state_not_persisted',
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
      candidate_state_version: 2,
      output_contract_version: 'phase-5.2-stateful-copilot-v4',
      communication_contract_version: 'phase-5.2-communication-v5',
      communication_intervention_needed: false,
      communication_message_present: false,
      communication_attempts: 1,
      communication_recovered_after_retry: false,
      known_message_count: 1,
      active_message_count: 1,
      commercial_config_status: 'not_configured',
      previous_state_found: true,
    },
    stateful_failure: null,
    automatic_crm_write: false,
    automatic_agenda_write: false,
  }
}

function buildMessage() {
  const descriptor = buildStatefulCopilotBackgroundJobDescriptor({
    company_id: 'company-a',
    cycle_id: 'cycle-a',
    conversation_key: 'phone:5511999999999',
    message_watermark: 'watermark-a',
    requested_at: '2026-08-27T22:10:00.000Z',
  })

  return buildStatefulCopilotBackgroundJobMessage({
    descriptor,
    device_key: 'device-a',
  })
}

function seedQueuedRow(message) {
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

test(
  'conflito de persistência não deixa o job terminalmente failed na primeira entrega: running -> conflict -> queued -> nova entrega -> succeeded',
  async () => {
    const message = buildMessage()
    const rows = [seedQueuedRow(message)]
    const admin = createFakeAdmin(rows)

    let runRuntimeCallCount = 0

    const runRuntime = async () => {
      runRuntimeCallCount += 1

      return runRuntimeCallCount === 1
        ? buildFallbackConflictResult()
        : buildActiveResult()
    }

    // Primeira entrega (delivery_count: 1): o worker reivindica o job
    // (queued -> running), o runtime devolve o fallback de conflito de
    // persistência, e o worker precisa recolocar o job em 'queued' e
    // lançar para sinalizar nova entrega à Vercel Queue — nunca gravar
    // 'failed' direto por causa de um conflito transitório.
    await assert.rejects(
      () =>
        processStatefulCopilotBackgroundMessage(
          message,
          { delivery_count: 1 },
          {
            create_admin_client: () => admin,
            run_runtime: runRuntime,
          },
        ),
      (error) => {
        assert.equal(
          error.name,
          'StatefulCopilotBackgroundRetryError',
        )

        assert.equal(
          error.message,
          'STATEFUL_STATE_WRITE_CONFLICT',
        )

        return true
      },
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'queued')
    assert.equal(rows[0].started_at, null)
    assert.equal(rows[0].failure_code, 'STATEFUL_STATE_WRITE_CONFLICT')

    // Segunda entrega (delivery_count: 2) — simula a redelivery real da
    // Vercel Queue após o throw acima. Desta vez o runtime tem sucesso.
    await processStatefulCopilotBackgroundMessage(
      message,
      { delivery_count: 2 },
      {
        create_admin_client: () => admin,
        run_runtime: runRuntime,
      },
    )

    assert.equal(runRuntimeCallCount, 2)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'succeeded')
    assert.equal(rows[0].candidate_state_version, 2)
  },
)

test(
  'precondição de análise bloqueada não é retryable: fica failed já na primeira entrega, sem redelivery',
  async () => {
    const message = buildMessage()
    const rows = [seedQueuedRow(message)]
    const admin = createFakeAdmin(rows)

    const runRuntime = async () => ({
      mode: 'active_fallback_v1',
      response_source: 'v1',
      stateful_executed: true,
      response: undefined,
      stateful_execution: {
        engine_mode: 'blocked',
        persistence_mode: 'skipped',
        persisted: false,
        candidate_state_version: null,
        output_contract_version: null,
        communication_contract_version: null,
        communication_intervention_needed: null,
        communication_message_present: null,
        communication_attempts: null,
        communication_recovered_after_retry: null,
        known_message_count: 0,
        active_message_count: 0,
        commercial_config_status: 'not_configured',
        previous_state_found: false,
      },
      stateful_failure: null,
      fallback_reason: 'stateful_output_unavailable',
      automatic_crm_write: false,
      automatic_agenda_write: false,
    })

    await processStatefulCopilotBackgroundMessage(
      message,
      { delivery_count: 1 },
      {
        create_admin_client: () => admin,
        run_runtime: runRuntime,
      },
    )

    assert.equal(rows[0].status, 'failed')
    assert.equal(rows[0].failure_code, 'ANALYSIS_PRECONDITION_BLOCKED')
  },
)


test(
  'runtime padrão do worker do Companion é V2-only por construção, sem depender das ENVs de rollout',
  () => {
    const companyId =
      'aaaaaaaa-0000-4000-8000-000000000001'

    const options =
      buildStatefulCopilotBackgroundRuntimeOptions(
        companyId,
      )

    assert.equal(
      options.configured_mode,
      'active',
    )

    assert.equal(
      options.configured_company_ids,
      companyId,
    )

    assert.equal(
      options.configured_engine_version,
      'v2',
    )

    const activation =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,
        configured_mode:
          options.configured_mode,
        configured_company_ids:
          options.configured_company_ids,
        configured_engine_version:
          options.configured_engine_version,
      })

    assert.equal(
      activation.mode,
      'active',
    )
    assert.equal(
      activation.engine_version,
      'v2',
    )
    assert.equal(
      activation.should_execute_stateful,
      true,
    )
    assert.equal(
      activation.should_expose_stateful_result,
      true,
    )
    assert.equal(
      activation.preserve_v1_response,
      false,
    )
  },
)


test(
  'worker V2-only registra violação explícita se o runtime devolver v1',
  async () => {
    const message =
      buildMessage()

    const rows = [
      seedQueuedRow(
        message,
      ),
    ]

    const admin =
      createFakeAdmin(
        rows,
      )

    const runRuntime =
      async () => ({
        mode:
          'v1',

        response_source:
          'v1',

        stateful_executed:
          false,

        response:
          undefined,

        stateful_execution:
          null,

        stateful_failure:
          null,

        activation: {
          reason:
            'globally_disabled',
        },

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })

    await processStatefulCopilotBackgroundMessage(
      message,
      {
        delivery_count:
          1,
      },
      {
        create_admin_client:
          () => admin,

        run_runtime:
          runRuntime,
      },
    )

    assert.equal(
      rows[0].status,
      'failed',
    )

    assert.equal(
      rows[0].runtime_mode,
      'v1',
    )

    assert.equal(
      rows[0].failure_code,
      'V2_ONLY_ACTIVATION_BYPASSED',
    )

    assert.equal(
      rows[0].failure_path,
      'activation',
    )

    assert.equal(
      rows[0].failure_invariant,
      'V2_ONLY_ACTIVE_REQUIRED',
    )
  },
)
