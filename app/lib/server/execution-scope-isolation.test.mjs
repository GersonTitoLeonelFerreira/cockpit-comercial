// R10 — isolamento real entre HOMOLOG (Vercel Preview) e PRODUÇÃO.
//
// Os dois ambientes usam o MESMO banco. Estes testes exercitam o código
// REAL (identidade do job, worker, recuperação de órfão, polling, reader,
// writer, etapa do método, orquestrador) contra um duplo em memória que
// guarda as tabelas canônicas e as tabelas homolog lado a lado, com o
// índice one_running_per_conversation e o índice único de escopo emulados
// POR TABELA — exatamente como no banco.
//
// Invariantes provadas:
//   A  mesmo contexto/watermark → job de produção ≠ job de homolog
//   B  PROD running não bloqueia HML          C  HML running não bloqueia PROD
//   D  lease/órfão do worker nunca cruza escopo
//   E  recuperação do produtor nunca cruza escopo (HML nunca reivindica legado)
//   F  polling HML não lê job/resultado PROD (e vice-versa)
//   G  resultado derivado HML não muda a visão PROD
//   H  resultado derivado PROD não aparece como se fosse HML
//   I  dado-fonte continua disponível para HML (ver route-execution-scope)
//   J  multiempresa continua isolado dentro do escopo
//   +  worker rejeita job de outro escopo; CRM/Agenda nunca são escritos

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

import {
  COMPANION_DERIVED_STORAGE,
  companionDerivedTable,
  companionRowExecutionScope,
  companionStatePersistenceRpc,
  resolveCompanionExecutionScope,
} from '../companion/companion-execution-scope.ts'

import {
  STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,
  buildStatefulCopilotBackgroundJobDescriptor,
  buildStatefulCopilotBackgroundJobMessage,
  parseStatefulCopilotBackgroundJobMessage,
} from './stateful-copilot-background-job.ts'

import {
  StatefulCopilotBackgroundInvalidMessageError,
  buildStatefulCopilotBackgroundRuntimeOptions,
  processStatefulCopilotBackgroundMessage,
} from './stateful-copilot-background-worker.ts'

import {
  recoverStaleCompanionAnalysisJob,
} from './companion-analysis-job-retry.ts'

import {
  CompanionAnalysisJobReadError,
  loadCompanionAnalysisJobStatus,
} from './companion-analysis-job-reader.ts'

import {
  loadCompanionMethodStage,
  saveCompanionMethodStage,
} from './companion-method-stage-store.ts'

import {
  createStatefulCopilotServerRuntimeOrchestrator,
} from './stateful-copilot-runtime-orchestrator.ts'

import {
  createStatefulCopilotSupabaseReader,
} from '../companion/stateful-copilot-supabase-reader.ts'

import {
  createStatefulCopilotComposition,
} from '../companion/stateful-copilot-composition.ts'

const JOBS = 'companion_background_analysis_jobs'
const JOBS_HML = 'companion_background_analysis_jobs_homolog'
const STATES = 'companion_commercial_states'
const STATES_HML = 'companion_commercial_states_homolog'
const EVENTS = 'companion_commercial_state_events'
const EVENTS_HML = 'companion_commercial_state_events_homolog'
const STAGE = 'companion_method_stage_state'
const STAGE_HML = 'companion_method_stage_state_homolog'
const DIAGNOSTICS = 'companion_runtime_path_diagnostics'

const JOB_TABLES = new Set([JOBS, JOBS_HML])
const CRM_AGENDA_TABLES = ['sales_cycles', 'cycle_events', 'leads']

const COMPANY_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const COMPANY_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const USER_A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const CYCLE_A = 'aaaaaaaa-0000-4000-8000-0000000000d1'
const CYCLE_B = 'bbbbbbbb-0000-4000-8000-0000000000d1'
const CONVERSATION = 'whatsapp:+5544000023820'

// ---------------------------------------------------------------------------
// Banco em memória com as tabelas canônicas e homolog lado a lado.
// ---------------------------------------------------------------------------

function createMemoryDb(seed = {}) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows]))
  const reads = []
  const writes = []
  const rpcCalls = []

  const rowsOf = (table) => {
    if (!tables.has(table)) {
      tables.set(table, [])
    }

    return tables.get(table)
  }

  const conflict = (message) => ({ data: null, error: { code: '23505', message } })

  class Query {
    constructor(table) {
      this.table = table
      this.mode = 'select'
      this.filters = []
      this.orderBy = null
      this.limitN = null
      this.window = null
      this.payload = null
      this.onConflict = null
    }

    select() { return this }
    insert(payload) { this.mode = 'insert'; this.payload = payload; return this }
    update(payload) { this.mode = 'update'; this.payload = payload; return this }
    upsert(payload, options = {}) { this.mode = 'upsert'; this.payload = payload; this.onConflict = options.onConflict ?? null; return this }
    eq(column, value) { this.filters.push((row) => row[column] === value); return this }
    neq(column, value) { this.filters.push((row) => row[column] !== value); return this }
    gt(column, value) { this.filters.push((row) => row[column] > value); return this }
    in(column, values) { this.filters.push((row) => values.includes(row[column])); return this }
    is(column, value) { this.filters.push((row) => (row[column] ?? null) === value); return this }
    order(column, { ascending = true } = {}) { this.orderBy = { column, ascending }; return this }
    limit(n) { this.limitN = n; return this }
    range(from, to) { this.window = [from, to]; return this }

    matching() {
      let rows = rowsOf(this.table).filter((row) => this.filters.every((filter) => filter(row)))

      if (this.orderBy) {
        const { column, ascending } = this.orderBy
        rows = [...rows].sort((a, b) =>
          a[column] === b[column] ? 0 : (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1),
        )
      }

      if (this.window) {
        rows = rows.slice(this.window[0], this.window[1] + 1)
      }

      return this.limitN == null ? rows : rows.slice(0, this.limitN)
    }

    execute() {
      if (this.mode === 'select') {
        reads.push(this.table)
        return { data: this.matching().map((row) => ({ ...row })), error: null }
      }

      writes.push({ table: this.table, method: this.mode, payload: this.payload })
      const rows = rowsOf(this.table)

      if (this.mode === 'insert') {
        const row = { ...this.payload }

        if (JOB_TABLES.has(this.table)) {
          const duplicate = rows.some((other) =>
            other.analysis_job_id === row.analysis_job_id ||
            (
              other.company_id === row.company_id &&
              other.cycle_id === row.cycle_id &&
              other.conversation_key === row.conversation_key &&
              other.message_watermark === row.message_watermark
            ),
          )

          if (duplicate) {
            return conflict('scope_unique')
          }
        }

        rows.push(row)
        return { data: [{ ...row }], error: null }
      }

      if (this.mode === 'upsert') {
        const keys = String(this.onConflict ?? '').split(',').filter(Boolean)
        const existing = keys.length
          ? rows.find((row) => keys.every((key) => row[key] === this.payload[key]))
          : null

        if (existing) {
          Object.assign(existing, this.payload)
        } else {
          rows.push({ ...this.payload })
        }

        return { data: null, error: null }
      }

      const matched = this.matching()

      if (JOB_TABLES.has(this.table) && this.payload?.status === 'running') {
        for (const row of matched) {
          const busy = rows.some((other) =>
            other !== row &&
            other.status === 'running' &&
            other.company_id === row.company_id &&
            other.cycle_id === row.cycle_id &&
            other.conversation_key === row.conversation_key,
          )

          if (busy) {
            return conflict('one_running_per_conversation')
          }
        }
      }

      for (const row of matched) {
        Object.assign(row, this.payload)
      }

      return { data: matched.map((row) => ({ ...row })), error: null }
    }

    maybeSingle() {
      const result = this.execute()

      if (result.error) {
        return Promise.resolve(result)
      }

      return Promise.resolve(
        result.data && result.data.length > 1
          ? { data: null, error: { message: 'multiple rows' } }
          : { data: result.data?.[0] ?? null, error: null },
      )
    }

    single() {
      return this.maybeSingle()
    }

    then(resolve, reject) {
      return Promise.resolve(this.execute()).then(resolve, reject)
    }
  }

  return {
    admin: {
      from: (table) => new Query(table),
      rpc: async (name, params) => {
        rpcCalls.push({ name, params })
        return { data: null, error: null }
      },
    },
    rowsOf,
    reads,
    writes,
    rpcCalls,
    snapshot: (table) => JSON.parse(JSON.stringify(rowsOf(table))),
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function legacyProductionJobId({ company_id, cycle_id, conversation_key, message_watermark }) {
  return createHash('sha256')
    .update(JSON.stringify([
      STATEFUL_COPILOT_BACKGROUND_JOB_VERSION,
      company_id,
      cycle_id,
      conversation_key,
      message_watermark,
    ]))
    .digest('hex')
}

function descriptor(scope, overrides = {}) {
  return buildStatefulCopilotBackgroundJobDescriptor({
    execution_scope: scope,
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION,
    message_watermark: 'wm-1',
    requested_at: '2026-09-30T10:00:00.000Z',
    ...overrides,
  })
}

function message(scope, overrides = {}) {
  return buildStatefulCopilotBackgroundJobMessage({
    descriptor: descriptor(scope, overrides),
    device_key: 'device-a',
  })
}

function jobRow(job, overrides = {}) {
  return {
    analysis_job_id: job.analysis_job_id,
    execution_scope: job.execution_scope,
    company_id: job.company_id,
    cycle_id: job.cycle_id,
    conversation_key: job.conversation_key,
    message_watermark: job.message_watermark,
    requested_at: job.requested_at,
    status: 'queued',
    started_at: null,
    completed_at: null,
    updated_at: job.requested_at,
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

function succeededRuntime(calls) {
  return async (input) => {
    calls?.push(input)

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
        communication_intervention_needed: true,
        communication_message_present: true,
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
}

function runWorker(db, rawMessage, scope, { delivery_count = 1, runtime } = {}) {
  return processStatefulCopilotBackgroundMessage(
    rawMessage,
    { delivery_count },
    {
      create_admin_client: () => db.admin,
      run_runtime: runtime ?? succeededRuntime(),
      execution_scope: scope,
    },
  )
}

function assertNoCrmAgendaWrites(db) {
  for (const table of CRM_AGENDA_TABLES) {
    assert.equal(
      db.writes.some((write) => write.table === table),
      false,
      `análise nunca escreve ${table} (CRM/Agenda)`,
    )
  }

  for (const write of db.writes) {
    if (write.payload && 'automatic_crm_write' in write.payload) {
      assert.equal(write.payload.automatic_crm_write, false)
      assert.equal(write.payload.automatic_agenda_write, false)
    }
  }
}

async function withEnv(values, fn) {
  const keys = Object.keys(values)
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  for (const key of keys) {
    if (values[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = values[key]
    }
  }

  try {
    return await fn()
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previous[key]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Escopo do deployment
// ---------------------------------------------------------------------------

test('escopo vem do ambiente do deployment, nunca do commit; preview nunca vira produção', () => {
  assert.equal(resolveCompanionExecutionScope({ VERCEL_ENV: 'production' }), 'production')
  assert.equal(resolveCompanionExecutionScope({ VERCEL_ENV: 'preview' }), 'homolog')
  assert.equal(
    resolveCompanionExecutionScope({ VERCEL_ENV: 'preview', COMPANION_EXECUTION_SCOPE: 'production' }),
    'homolog',
    'override nunca transforma um preview em produção',
  )
  assert.equal(
    resolveCompanionExecutionScope({ VERCEL_ENV: 'production', COMPANION_EXECUTION_SCOPE: 'homolog' }),
    'production',
  )
  assert.equal(resolveCompanionExecutionScope({ NODE_ENV: 'development' }), 'homolog', 'next dev local não escreve o que a produção lê')
  assert.equal(resolveCompanionExecutionScope({ COMPANION_EXECUTION_SCOPE: 'homolog' }), 'homolog')
  assert.equal(resolveCompanionExecutionScope({}), 'production')
  assert.equal(
    resolveCompanionExecutionScope({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'c77d26c2a56dc45f9956fd223b7c91fa38a1c95c' }),
    resolveCompanionExecutionScope({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'ef9891cdb8666c163a57d7ac7bbf59c1cdf1db5d' }),
    'dois previews de commits diferentes são o mesmo HOMOLOG',
  )
})

test('armazenamento derivado por escopo; legado sem escopo é produção', () => {
  assert.deepEqual(
    Object.keys(COMPANION_DERIVED_STORAGE).map((key) => companionDerivedTable(key, 'homolog')),
    [JOBS_HML, STATES_HML, EVENTS_HML, STAGE_HML],
  )
  assert.deepEqual(
    Object.keys(COMPANION_DERIVED_STORAGE).map((key) => companionDerivedTable(key, 'production')),
    [JOBS, STATES, EVENTS, STAGE],
  )
  assert.equal(companionStatePersistenceRpc('production'), 'rpc_persist_stateful_copilot_state')
  assert.equal(companionStatePersistenceRpc('homolog'), 'rpc_persist_stateful_copilot_state_homolog')
  assert.equal(companionRowExecutionScope({}), 'production')
  assert.equal(companionRowExecutionScope({ execution_scope: null }), 'production')
  assert.equal(companionRowExecutionScope({ execution_scope: 'homolog' }), 'homolog')
  assert.equal(companionRowExecutionScope({ execution_scope: 'staging' }), null)
})

// ---------------------------------------------------------------------------
// A — identidade do job
// ---------------------------------------------------------------------------

test('A: mesmo contexto/watermark gera jobs diferentes em produção e homolog', () => {
  const production = descriptor('production')
  const homolog = descriptor('homolog')

  assert.notEqual(production.analysis_job_id, homolog.analysis_job_id)
  assert.equal(production.execution_scope, 'production')
  assert.equal(homolog.execution_scope, 'homolog')
  assert.equal(descriptor('production').analysis_job_id, production.analysis_job_id, 'determinístico')
  assert.equal(descriptor('homolog').analysis_job_id, homolog.analysis_job_id, 'determinístico')

  const legacy = legacyProductionJobId(production)
  assert.notEqual(production.analysis_job_id, legacy)
  assert.notEqual(homolog.analysis_job_id, legacy)

  assert.throws(
    () => descriptor(undefined),
    /execution_scope/,
    'job sem escopo explícito não existe',
  )
})

test('A: id legado (sem escopo) é aceito só como produção; homolog nunca o reivindica', () => {
  const production = descriptor('production')
  const legacy = legacyProductionJobId(production)

  assert.equal(descriptor('production', { analysis_job_id: legacy }).analysis_job_id, legacy)
  assert.throws(() => descriptor('homolog', { analysis_job_id: legacy }), /analysis_job_id/)
  assert.throws(() => descriptor('homolog', { analysis_job_id: production.analysis_job_id }), /analysis_job_id/)
  assert.throws(() => descriptor('production', { analysis_job_id: descriptor('homolog').analysis_job_id }), /analysis_job_id/)

  // Mensagem publicada antes do escopo existir: produção.
  const legacyMessage = { ...message('production'), analysis_job_id: legacy }
  delete legacyMessage.execution_scope
  assert.equal(parseStatefulCopilotBackgroundJobMessage(legacyMessage).execution_scope, 'production')

  // Mensagem adulterada: escopo homolog com id de produção.
  assert.throws(
    () => parseStatefulCopilotBackgroundJobMessage({ ...message('production'), execution_scope: 'homolog' }),
    /analysis_job_id/,
  )
  assert.throws(
    () => parseStatefulCopilotBackgroundJobMessage({ ...message('homolog'), execution_scope: 'staging' }),
    /execution_scope/,
  )
})

// ---------------------------------------------------------------------------
// Worker: escopo do deployment
// ---------------------------------------------------------------------------

test('worker só executa job do próprio escopo (ack, zero banco, zero IA)', async () => {
  for (const [deploymentScope, jobScope] of [['homolog', 'production'], ['production', 'homolog']]) {
    const db = createMemoryDb()
    const runtimeCalls = []

    await assert.rejects(
      () => runWorker(db, message(jobScope), deploymentScope, { runtime: succeededRuntime(runtimeCalls) }),
      (error) =>
        error instanceof StatefulCopilotBackgroundInvalidMessageError &&
        error.message === 'BACKGROUND_EXECUTION_SCOPE_MISMATCH',
    )

    assert.equal(db.reads.length + db.writes.length, 0)
    assert.equal(runtimeCalls.length, 0)
  }
})

test('runtime do worker carrega o escopo do job até contexto e persistência', async () => {
  assert.equal(buildStatefulCopilotBackgroundRuntimeOptions(COMPANY_A, 'homolog').execution_scope, 'homolog')
  assert.equal(buildStatefulCopilotBackgroundRuntimeOptions(COMPANY_A, 'production').execution_scope, 'production')

  for (const scope of ['homolog', 'production']) {
    const seen = {}
    const orchestrator = createStatefulCopilotServerRuntimeOrchestrator({
      ...buildStatefulCopilotBackgroundRuntimeOptions(COMPANY_A, scope),
      dependencies: {
        create_context_loader(options) {
          seen.context = options
          return async () => { throw new Error('stop after factories') }
        },
        create_composition(options) {
          seen.composition = options
          return { writer: async () => ({}), provider: async () => ({}), create_memory_id: () => 'x' }
        },
      },
    })

    await orchestrator({
      company_id: COMPANY_A,
      cycle_id: CYCLE_A,
      conversation_key: CONVERSATION,
      device_key: 'device-a',
      reference_time: '2026-09-30T10:00:00.000Z',
      v1_response: undefined,
    })

    assert.equal(seen.context?.execution_scope, scope)
    assert.equal(seen.composition?.execution_scope, scope)
  }
})

// ---------------------------------------------------------------------------
// B / C — one-running-per-conversation e "job mais novo" por escopo
// ---------------------------------------------------------------------------

test('B: PROD running (e PROD mais novo) não bloqueia nem supersede HML', async () => {
  const prodRunning = descriptor('production', { message_watermark: 'wm-prod' })
  const prodNewer = descriptor('production', { message_watermark: 'wm-prod-2', requested_at: '2026-09-30T10:05:00.000Z' })
  const hml = message('homolog')

  const db = createMemoryDb({
    [JOBS]: [
      jobRow(prodRunning, { status: 'running', started_at: new Date().toISOString() }),
      jobRow(prodNewer),
    ],
    [JOBS_HML]: [jobRow(hml)],
  })
  const prodBefore = db.snapshot(JOBS)

  await runWorker(db, hml, 'homolog')

  assert.equal(db.rowsOf(JOBS_HML)[0].status, 'succeeded')
  assert.deepEqual(db.snapshot(JOBS), prodBefore, 'nenhuma linha de produção mudou')
  assert.equal(db.writes.some((write) => write.table === JOBS), false)
  assert.equal(db.reads.includes(JOBS), false, 'worker HML nem lê a tabela de produção')
  assertNoCrmAgendaWrites(db)
})

test('C: HML running (e HML mais novo) não bloqueia nem supersede PROD', async () => {
  const hmlRunning = descriptor('homolog', { message_watermark: 'wm-hml' })
  const hmlNewer = descriptor('homolog', { message_watermark: 'wm-hml-2', requested_at: '2026-09-30T10:05:00.000Z' })
  const prod = message('production')

  const db = createMemoryDb({
    [JOBS_HML]: [
      jobRow(hmlRunning, { status: 'running', started_at: new Date().toISOString() }),
      jobRow(hmlNewer),
    ],
    [JOBS]: [jobRow(prod)],
  })
  const hmlBefore = db.snapshot(JOBS_HML)

  await runWorker(db, prod, 'production')

  assert.equal(db.rowsOf(JOBS)[0].status, 'succeeded')
  assert.deepEqual(db.snapshot(JOBS_HML), hmlBefore)
  assert.equal(db.reads.includes(JOBS_HML), false)
  assertNoCrmAgendaWrites(db)
})

test('B/C: dentro do mesmo escopo a regra one-running-per-conversation continua valendo', async () => {
  const running = descriptor('homolog', { message_watermark: 'wm-running' })
  const next = message('homolog', { message_watermark: 'wm-next' })
  const db = createMemoryDb({
    [JOBS_HML]: [
      jobRow(running, { status: 'running', started_at: new Date().toISOString() }),
      jobRow(next),
    ],
  })

  await assert.rejects(() => runWorker(db, next, 'homolog'), /BACKGROUND_CONVERSATION_BUSY/)
  assert.equal(db.rowsOf(JOBS_HML)[1].status, 'queued')
})

// ---------------------------------------------------------------------------
// D / E — órfão: lease do worker e recuperação do produtor
// ---------------------------------------------------------------------------

test('D: lease vencido só é liberado no próprio escopo', async () => {
  const expired = '2026-09-14T04:47:27.000Z'
  const hmlOrphan = descriptor('homolog', { message_watermark: 'wm-old', requested_at: expired })
  const prodOrphan = descriptor('production', { message_watermark: 'wm-old', requested_at: expired })
  const prod = message('production', { message_watermark: 'wm-new' })

  const db = createMemoryDb({
    [JOBS]: [jobRow(prodOrphan, { status: 'running', started_at: expired }), jobRow(prod)],
    [JOBS_HML]: [jobRow(hmlOrphan, { status: 'running', started_at: expired })],
  })

  await runWorker(db, prod, 'production')

  assert.equal(db.rowsOf(JOBS)[0].status, 'failed')
  assert.equal(db.rowsOf(JOBS)[0].failure_code, 'BACKGROUND_WORKER_LEASE_EXPIRED')
  assert.equal(db.rowsOf(JOBS)[1].status, 'succeeded')
  assert.equal(db.rowsOf(JOBS_HML)[0].status, 'running', 'órfão homolog nunca é encerrado pela produção')

  const hml = message('homolog', { message_watermark: 'wm-new' })
  db.rowsOf(JOBS_HML).push(jobRow(hml))
  const prodBefore = db.snapshot(JOBS)

  await runWorker(db, hml, 'homolog')

  assert.equal(db.rowsOf(JOBS_HML)[0].status, 'failed')
  assert.equal(db.rowsOf(JOBS_HML)[1].status, 'succeeded')
  assert.deepEqual(db.snapshot(JOBS), prodBefore)
})

test('E: recuperação de órfão do produtor nunca cruza escopo; HML nunca reivindica job legado', async () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z')
  const staleAt = '2026-09-30T11:00:00.000Z'
  const legacyProd = descriptor('production', { requested_at: staleAt })
  const legacyId = legacyProductionJobId(legacyProd)
  const legacyRow = jobRow({ ...legacyProd, analysis_job_id: legacyId }, { updated_at: staleAt })
  delete legacyRow.execution_scope

  const db = createMemoryDb({ [JOBS]: [legacyRow] })
  const published = []
  const publish = async (topic, payload, options) => { published.push({ topic, payload, options }) }
  const staleJob = { ...legacyRow, started_at: null }

  const fromHomolog = await recoverStaleCompanionAnalysisJob({
    admin: db.admin, job: staleJob, device_key: 'device-a', publish, now_ms: now, execution_scope: 'homolog',
  })

  assert.deepEqual(fromHomolog, { recovered: false, status: 'queued' })
  assert.equal(db.writes.length, 0, 'homolog não escreve nada ao ver job de produção')
  assert.equal(published.length, 0)
  assert.equal(db.rowsOf(JOBS)[0].updated_at, staleAt)

  const fromProduction = await recoverStaleCompanionAnalysisJob({
    admin: db.admin, job: staleJob, device_key: 'device-a', publish, now_ms: now, execution_scope: 'production',
  })

  assert.equal(fromProduction.recovered, true, 'produção recupera o próprio legado')
  assert.equal(published.length, 1)
  assert.equal(published[0].payload.analysis_job_id, legacyId)
  assert.equal(published[0].payload.execution_scope, 'production')
  assert.equal(db.writes.every((write) => write.table === JOBS || write.table === DIAGNOSTICS), true)

  // Órfão homolog: recuperado só pelo homolog, só na tabela homolog.
  const hml = descriptor('homolog', { requested_at: staleAt })
  const hmlDb = createMemoryDb({ [JOBS_HML]: [jobRow(hml, { updated_at: staleAt })] })
  const hmlPublished = []

  const prodOnHml = await recoverStaleCompanionAnalysisJob({
    admin: hmlDb.admin, job: { ...jobRow(hml, { updated_at: staleAt }) }, device_key: 'device-a',
    publish: async (...args) => { hmlPublished.push(args) }, now_ms: now, execution_scope: 'production',
  })
  assert.equal(prodOnHml.recovered, false)
  assert.equal(hmlDb.writes.length, 0)

  const hmlOnHml = await recoverStaleCompanionAnalysisJob({
    admin: hmlDb.admin, job: { ...jobRow(hml, { updated_at: staleAt }) }, device_key: 'device-a',
    publish: async (topic, payload) => { hmlPublished.push(payload) }, now_ms: now, execution_scope: 'homolog',
  })
  assert.equal(hmlOnHml.recovered, true)
  assert.equal(hmlPublished[0].execution_scope, 'homolog')
  assert.equal(hmlDb.writes.every((write) => write.table === JOBS_HML || write.table === DIAGNOSTICS), true)
})

// ---------------------------------------------------------------------------
// F / G / H — polling e resultados derivados
// ---------------------------------------------------------------------------

function sourceTables() {
  return {
    company_memberships: [{ company_id: COMPANY_A, user_id: USER_A, role: 'member', is_active: true }],
    profiles: [{ id: USER_A, is_active_global: true }],
    sales_cycles: [
      { id: CYCLE_A, company_id: COMPANY_A, owner_user_id: USER_A },
      { id: CYCLE_B, company_id: COMPANY_B, owner_user_id: USER_A },
    ],
  }
}

function deepOutput(summary) {
  return {
    contract_version: 'phase-5.2-stateful-copilot-v4',
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    interpretation: { current_moment: { summary } },
    strategy: {
      next_move: 'Aprofundar valor antes de negociar.',
      recommended_question: null,
      suggested_message: null,
    },
    communication: {
      contract_version: 'phase-5.2-communication-v5',
      commercial_reading: {
        contract_version: 'commercial-reading-v1',
        commercial_role: 'buyer',
        commercial_relevance: 'commercial',
      },
    },
    operational_suggestions: {
      crm: { should_change_crm_stage: false },
      agenda: { should_change_agenda: false },
    },
  }
}

function eventRow(summary, scope) {
  return {
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION,
    candidate_state_version: 1,
    output_contract_version: 'phase-5.2-stateful-copilot-v4',
    generated_at: '2026-09-30T10:00:30.000Z',
    normalized_output: deepOutput(summary),
    ...(scope ? { execution_scope: scope } : {}),
  }
}

const TOKEN_A = { sub: USER_A, company_id: COMPANY_A, role: 'member' }

async function readStatus(db, analysis_job_id, execution_scope, token = TOKEN_A) {
  return loadCompanionAnalysisJobStatus({ admin: db.admin, token, analysis_job_id, execution_scope })
}

test('F: polling HML nunca lê job de produção (nem legado); polling PROD nunca lê job HML', async () => {
  const prod = descriptor('production')
  const legacyId = legacyProductionJobId(prod)
  const hml = descriptor('homolog')
  const legacyRow = jobRow({ ...prod, analysis_job_id: legacyId }, { status: 'running', started_at: '2026-09-30T10:00:01.000Z' })
  delete legacyRow.execution_scope

  const db = createMemoryDb({
    ...sourceTables(),
    [JOBS]: [jobRow(prod, { status: 'running', started_at: '2026-09-30T10:00:01.000Z' }), legacyRow],
    [JOBS_HML]: [jobRow(hml)],
  })

  for (const id of [prod.analysis_job_id, legacyId]) {
    await assert.rejects(
      () => readStatus(db, id, 'homolog'),
      (error) => error instanceof CompanionAnalysisJobReadError && error.status_code === 404,
    )
  }

  await assert.rejects(
    () => readStatus(db, hml.analysis_job_id, 'production'),
    (error) => error instanceof CompanionAnalysisJobReadError && error.status_code === 404,
  )

  const hmlStatus = await readStatus(db, hml.analysis_job_id, 'homolog')
  assert.equal(hmlStatus.status, 'queued')
  assert.equal(hmlStatus.execution_scope, 'homolog')

  const legacyStatus = await readStatus(db, legacyId, 'production')
  assert.equal(legacyStatus.status, 'running', 'legado continua visível para a produção')
  assert.equal(legacyStatus.execution_scope, 'production')
})

test('G/H: resultado do job vem só dos eventos do próprio escopo', async () => {
  const prod = descriptor('production')
  const hml = descriptor('homolog')
  const succeeded = { status: 'succeeded', candidate_state_version: 1, started_at: '2026-09-30T10:00:05.000Z', completed_at: '2026-09-30T10:00:30.000Z' }

  const db = createMemoryDb({
    ...sourceTables(),
    [JOBS]: [jobRow(prod, succeeded)],
    [JOBS_HML]: [jobRow(hml, succeeded)],
    [EVENTS]: [eventRow('Leitura de PRODUÇÃO.')],
    [EVENTS_HML]: [eventRow('Leitura de HOMOLOG.', 'homolog')],
  })

  const prodStatus = await readStatus(db, prod.analysis_job_id, 'production')
  const hmlStatus = await readStatus(db, hml.analysis_job_id, 'homolog')

  assert.equal(prodStatus.result.summary, 'Leitura de PRODUÇÃO.', 'G: HML não altera o que a produção mostra')
  assert.equal(hmlStatus.result.summary, 'Leitura de HOMOLOG.', 'H: produção não aparece como se fosse HML')
  assert.equal(prodStatus.execution_scope, 'production')
  assert.equal(hmlStatus.execution_scope, 'homolog')

  // Sem evento homolog, o HML falha fechado — nunca cai no resultado de produção.
  db.rowsOf(EVENTS_HML).length = 0
  await assert.rejects(
    () => readStatus(db, hml.analysis_job_id, 'homolog'),
    (error) => error instanceof CompanionAnalysisJobReadError && error.code === 'DEEP_RESULT_INTEGRITY_ERROR',
  )
})

function stateRow(version, scope) {
  return {
    id: `state-${scope ?? 'legacy'}-${version}`,
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION,
    state_version: version,
    state_contract_version: 'phase-5.1-commercial-state-v1',
    state_updated_at: '2026-09-30T10:00:00.000Z',
    state_snapshot: {},
    persisted_at: '2026-09-30T10:00:00.000Z',
    ...(scope ? { execution_scope: scope } : {}),
  }
}

test('G/H: estado anterior (Reasoning/memória) é lido só do próprio escopo', async () => {
  const request = {
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION,
    known_message_ids: [],
    active_message_ids: [],
  }

  const onlyProduction = createMemoryDb({ [STATES]: [stateRow(6)] })
  const hmlRead = await createStatefulCopilotSupabaseReader({ client: onlyProduction.admin, execution_scope: 'homolog' })(request)
  assert.equal(hmlRead.mode, 'missing', 'H: estado de produção (legado) não existe para o HML')
  assert.deepEqual(onlyProduction.reads, [STATES_HML])

  const onlyHomolog = createMemoryDb({ [STATES_HML]: [stateRow(9, 'homolog')] })
  const prodRead = await createStatefulCopilotSupabaseReader({ client: onlyHomolog.admin, execution_scope: 'production' })(request)
  assert.equal(prodRead.mode, 'missing', 'G: estado HML não existe para a produção')
  assert.deepEqual(onlyHomolog.reads, [STATES])
})

test('G: composição entrega reader e writer do escopo do job (RPC: ver stateful-copilot-supabase-writer.test)', () => {
  for (const scope of ['homolog', 'production']) {
    const seen = []

    createStatefulCopilotComposition({
      client: {},
      execution_scope: scope,
      dependencies: {
        create_reader: (options) => { seen.push(['reader', options.execution_scope]); return async () => null },
        create_writer: (options) => { seen.push(['writer', options.execution_scope]); return async () => null },
        create_provider: () => async () => ({}),
      },
    })

    assert.deepEqual(seen, [['reader', scope], ['writer', scope]])
  }
})

test('G: etapa do método avançada pelo HML nunca muda a etapa que a produção mostra', async () => {
  const db = createMemoryDb({
    [STAGE]: [{
      company_id: COMPANY_A, cycle_id: CYCLE_A, conversation_key: CONVERSATION,
      method_config_version_id: 'cfg-1', stage_key: 'descoberta', stage_name: 'Descoberta',
      stage_display_order: 1, stage_reason: null, updated_at: '2026-09-29T10:00:00.000Z',
    }],
  })
  const args = { admin: db.admin, companyId: COMPANY_A, cycleId: CYCLE_A, conversationKey: CONVERSATION }

  await withEnv({ VERCEL_ENV: 'preview' }, () =>
    saveCompanionMethodStage({
      ...args, methodConfigVersionId: 'cfg-1', stageKey: 'fechamento', stageName: 'Fechamento', stageDisplayOrder: 4, stageReason: 'hml',
    }),
  )

  assert.equal(db.rowsOf(STAGE)[0].stage_key, 'descoberta')
  assert.equal(db.rowsOf(STAGE_HML)[0].stage_key, 'fechamento')

  const production = await withEnv({ VERCEL_ENV: 'production' }, () => loadCompanionMethodStage(args))
  const homolog = await withEnv({ VERCEL_ENV: 'preview' }, () => loadCompanionMethodStage(args))
  assert.equal(production.stage_key, 'descoberta')
  assert.equal(homolog.stage_key, 'fechamento')
})

// ---------------------------------------------------------------------------
// J — multiempresa
// ---------------------------------------------------------------------------

test('J: dentro do escopo homolog, outra empresa nunca bloqueia nem é lida', async () => {
  const otherCompany = descriptor('homolog', { company_id: COMPANY_B, cycle_id: CYCLE_B, message_watermark: 'wm-b' })
  const mine = message('homolog')

  const db = createMemoryDb({
    ...sourceTables(),
    [JOBS_HML]: [
      jobRow(otherCompany, { status: 'running', started_at: new Date().toISOString() }),
      jobRow(mine),
    ],
  })

  await runWorker(db, mine, 'homolog')
  assert.equal(db.rowsOf(JOBS_HML)[1].status, 'succeeded')
  assert.equal(db.rowsOf(JOBS_HML)[0].status, 'running')

  await assert.rejects(
    () => readStatus(db, otherCompany.analysis_job_id, 'homolog'),
    (error) => error instanceof CompanionAnalysisJobReadError && error.status_code === 404,
  )
})

// ---------------------------------------------------------------------------
// Guarda estrutural: nenhum acesso a armazenamento derivado sem escopo.
// ---------------------------------------------------------------------------

async function listSourceFiles(dir) {
  const entries = await readdir(new URL(dir, import.meta.url), { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = `${dir}${entry.name}`

    if (entry.isDirectory()) {
      if (!['node_modules', 'extension', 'e2-test-support'].includes(entry.name)) {
        files.push(...await listSourceFiles(`${path}/`))
      }
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(path)
    }
  }

  return files
}

test('nenhum código do app acessa tabela derivada ou RPC de estado sem passar pelo escopo', async () => {
  const files = await listSourceFiles('../../')
  const direct = /\.(from|rpc)\(\s*['"`](companion_background_analysis_jobs|companion_commercial_states|companion_commercial_state_events|companion_method_stage_state|rpc_persist_stateful_copilot_state)(_homolog)?['"`]/
  const offenders = []

  for (const file of files) {
    if (file.endsWith('companion-execution-scope.ts') || file.includes('database.types')) {
      continue
    }

    const source = await readFile(new URL(file, import.meta.url), 'utf8')

    if (direct.test(source)) {
      offenders.push(file)
    }
  }

  assert.ok(files.length > 100, 'varredura cobriu o app')
  assert.deepEqual(offenders, [])
})
