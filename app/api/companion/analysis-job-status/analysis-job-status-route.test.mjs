import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

register(
  fileURLToPath(
    new URL(
      '../../../../scripts/typescript-test-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const adminBox = { admin: null }

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

const { POST } = await import('./route.ts')

const IDS = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  companyB: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  userOther: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  cycleA: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  cycleA2: 'aaaaaaaa-0000-4000-8000-0000000000d2',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const ANALYSIS_JOB_ID_A = 'a'.repeat(64)
const ANALYSIS_JOB_ID_B = 'b'.repeat(64)

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function buildQueryClass(tables) {
  return class Query {
    constructor(table) {
      this.table = table
      this.filters = []
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

    resolveRows() {
      const rows = (tables[this.table] ?? []).filter((row) =>
        matchesFilters(row, this.filters),
      )

      return this.maxRows === null
        ? rows
        : rows.slice(0, this.maxRows)
    }

    maybeSingle() {
      const rows = this.resolveRows()
      return Promise.resolve({
        data: rows[0] ?? null,
        error: null,
      })
    }

    then(resolve, reject) {
      return Promise.resolve({
        data: this.resolveRows(),
        error: null,
      }).then(resolve, reject)
    }
  }
}

function createFakeAdmin({ memberships, cycles, jobs, events }) {
  const Query = buildQueryClass({
    company_memberships: memberships,
    sales_cycles: cycles,
    companion_background_analysis_jobs: jobs,
    companion_commercial_state_events: events,
  })

  return {
    from(table) {
      return new Query(table)
    },
  }
}

function baseFixtures() {
  return {
    memberships: [{
      company_id: IDS.companyA,
      user_id: IDS.userA,
      role: 'member',
      is_active: true,
    }],
    cycles: [
      {
        id: IDS.cycleA,
        company_id: IDS.companyA,
        owner_user_id: IDS.userA,
      },
      {
        id: IDS.cycleA2,
        company_id: IDS.companyA,
        owner_user_id: IDS.userOther,
      },
    ],
    jobs: [],
    events: [],
  }
}

function jobRow({
  analysisJobId = ANALYSIS_JOB_ID_A,
  companyId = IDS.companyA,
  cycleId = IDS.cycleA,
  conversationKey = CONVERSATION_KEY,
  status,
  candidateStateVersion = null,
  failureCode = null,
}) {
  return {
    analysis_job_id: analysisJobId,
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    message_watermark: 'watermark-1',
    status,
    candidate_state_version: candidateStateVersion,
    failure_code: failureCode,
  }
}

function commercialReading(overrides = {}) {
  return {
    contract_version: 'commercial-reading-v1',
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    ...overrides,
  }
}

function deepOutput(overrides = {}) {
  return {
    contract_version: 'phase-5.2-stateful-copilot-v3',
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    interpretation: {
      current_moment: {
        summary: 'Cliente pediu desconto no plano anual.',
      },
    },
    strategy: {
      next_move: 'Aprofundar valor antes de negociar.',
      recommended_question: 'Qual impacto isso gera hoje?',
      suggested_message: 'Posso mostrar como isso reduz perda de follow-up.',
    },
    communication: {
      contract_version: 'phase-5.2-communication-v5',
      commercial_reading: commercialReading(),
    },
    state_patch: {
      should_never_leave_api: true,
    },
    operational_suggestions: {
      crm: { should_change_crm_stage: false },
      agenda: { should_change_agenda: false },
    },
    ...overrides,
  }
}

function eventRow({
  candidateStateVersion = 1,
  outputContractVersion = 'phase-5.2-stateful-copilot-v3',
  normalizedOutput = deepOutput(),
}) {
  return {
    company_id: IDS.companyA,
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    candidate_state_version: candidateStateVersion,
    output_contract_version: outputContractVersion,
    generated_at: '2026-08-23T12:00:00.000Z',
    normalized_output: normalizedOutput,
  }
}

function statusRequest({ token, body }) {
  return new Request('http://localhost/api/companion/analysis-job-status', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? bearerHeader(token) : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
}

async function callStatus(fixtures, token, body) {
  adminBox.admin = createFakeAdmin(fixtures)
  const response = await POST(statusRequest({ token, body }))
  return {
    status: response.status,
    body: await response.json(),
  }
}

test('queued: cliente envia somente analysis_job_id; ciclo/conversa são derivados server-side', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'queued' }))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
    cycle_id: 'valor-ignorado-do-cliente',
    conversation_key: 'valor-ignorado-do-cliente',
  })

  assert.equal(status, 200)
  assert.equal(body.data.status, 'queued')
  assert.equal(body.data.cycle_id, IDS.cycleA)
  assert.equal(body.data.conversation_key, CONVERSATION_KEY)
  assert.equal(body.data.result, null)
})

test('running: retorna metadata sem resultado', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'running' }))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 200)
  assert.equal(body.data.status, 'running')
  assert.equal(body.data.result, null)
})

test('succeeded: projeta DTO seller-facing e não expõe normalized_output cru', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    status: 'succeeded',
    candidateStateVersion: 1,
  }))
  fixtures.events.push(eventRow({}))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 200)
  assert.equal(body.data.status, 'succeeded')
  assert.equal(body.data.candidate_state_version, 1)
  assert.equal(body.data.result.contract_version, 'phase12a-deep-seller-v1')
  assert.equal(body.data.result.engine_source, 'stateful')
  assert.equal(body.data.result.summary, 'Cliente pediu desconto no plano anual.')
  assert.equal(body.data.result.recommended_next_approach, 'Aprofundar valor antes de negociar.')
  assert.equal(body.data.result.commercial_reading.contract_version, 'commercial-reading-v1')
  assert.equal(body.data.result.state_patch, undefined)
  assert.equal(body.data.result.operational_suggestions, undefined)
  assert.equal(body.data.result.communication, undefined)
})

test('failed e superseded nunca devolvem result', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  for (const jobStatus of ['failed', 'superseded']) {
    const fixtures = baseFixtures()
    fixtures.jobs.push(jobRow({
      status: jobStatus,
      failureCode: 'STATEFUL_BACKGROUND_FAILED',
    }))

    const { status, body } = await callStatus(fixtures, token, {
      analysis_job_id: ANALYSIS_JOB_ID_A,
    })

    assert.equal(status, 200)
    assert.equal(body.data.status, jobStatus)
    assert.equal(body.data.result, null)
  }
})

test('tenant A não localiza job B mesmo conhecendo analysis_job_id exato', async () => {
  const tokenA = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    analysisJobId: ANALYSIS_JOB_ID_B,
    companyId: IDS.companyB,
    cycleId: 'bbbbbbbb-0000-4000-8000-0000000000d1',
    status: 'succeeded',
    candidateStateVersion: 1,
  }))

  const { status, body } = await callStatus(fixtures, tokenA, {
    analysis_job_id: ANALYSIS_JOB_ID_B,
  })

  assert.equal(status, 404)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'ANALYSIS_JOB_NOT_FOUND')
  assert.equal(body.data, undefined)
})

test('member fora da carteira recebe 404 uniforme', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    cycleId: IDS.cycleA2,
    status: 'queued',
  }))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 404)
  assert.equal(body.code, 'ANALYSIS_JOB_NOT_FOUND')
})

test('member com owner null recebe 404 uniforme', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.cycles[0].owner_user_id = null
  fixtures.jobs.push(jobRow({ status: 'queued' }))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 404)
  assert.equal(body.code, 'ANALYSIS_JOB_NOT_FOUND')
})

test('membership.role atual vence role antiga do token após downgrade', async () => {
  const oldAdminToken = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
    role: 'admin',
  })
  const fixtures = baseFixtures()
  fixtures.memberships[0].role = 'member'
  fixtures.jobs.push(jobRow({
    cycleId: IDS.cycleA2,
    status: 'queued',
  }))

  const { status } = await callStatus(fixtures, oldAdminToken, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 404)
})

test('manager atual pode ler outro owner da mesma empresa mesmo com token antigo member', async () => {
  const oldMemberToken = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
    role: 'member',
  })
  const fixtures = baseFixtures()
  fixtures.memberships[0].role = 'manager'
  fixtures.jobs.push(jobRow({
    cycleId: IDS.cycleA2,
    status: 'queued',
  }))

  const { status, body } = await callStatus(fixtures, oldMemberToken, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 200)
  assert.equal(body.data.status, 'queued')
})

test('0 eventos para succeeded falha fechado com DEEP_RESULT_INTEGRITY_ERROR', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    status: 'succeeded',
    candidateStateVersion: 1,
  }))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 500)
  assert.equal(body.code, 'DEEP_RESULT_INTEGRITY_ERROR')
})

test('2 eventos correspondentes falham fechado; nunca escolhe o primeiro', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    status: 'succeeded',
    candidateStateVersion: 1,
  }))
  fixtures.events.push(
    eventRow({}),
    eventRow({}),
  )

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 500)
  assert.equal(body.code, 'DEEP_RESULT_INTEGRITY_ERROR')
})

test('evento histórico V2 não satisfaz o join V3', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    status: 'succeeded',
    candidateStateVersion: 1,
  }))
  fixtures.events.push(eventRow({
    outputContractVersion: 'stateful-copilot-v2',
  }))

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 500)
  assert.equal(body.code, 'DEEP_RESULT_INTEGRITY_ERROR')
})

test('output/communication/commercial-reading incompatível falha fechado', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  for (const normalizedOutput of [
    deepOutput({ contract_version: 'stateful-copilot-v2' }),
    deepOutput({ communication: { contract_version: 'old', commercial_reading: commercialReading() } }),
    deepOutput({ communication: { contract_version: 'phase-5.2-communication-v5', commercial_reading: commercialReading({ contract_version: 'old' }) } }),
  ]) {
    const fixtures = baseFixtures()
    fixtures.jobs.push(jobRow({
      status: 'succeeded',
      candidateStateVersion: 1,
    }))
    fixtures.events.push(eventRow({ normalizedOutput }))

    const { status, body } = await callStatus(fixtures, token, {
      analysis_job_id: ANALYSIS_JOB_ID_A,
    })

    assert.equal(status, 500)
    assert.equal(body.code, 'DEEP_RESULT_INTEGRITY_ERROR')
  }
})

test('sem token = 401; analysis_job_id malformado = 400', async () => {
  let response = await callStatus(baseFixtures(), null, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })
  assert.equal(response.status, 401)

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  response = await callStatus(baseFixtures(), token, {
    analysis_job_id: 'not-a-real-hash',
  })
  assert.equal(response.status, 400)
  assert.equal(response.body.code, 'INVALID_ANALYSIS_JOB_ARGUMENT')
})

test('leitura succeeded é somente SELECT e não muta fixtures', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({
    status: 'succeeded',
    candidateStateVersion: 1,
  }))
  fixtures.events.push(eventRow({}))

  const before = JSON.stringify(fixtures)
  const { status } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 200)
  assert.equal(JSON.stringify(fixtures), before)
})
