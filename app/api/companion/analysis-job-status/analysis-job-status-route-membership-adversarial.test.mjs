// Reconciliação pós-FASE 12A (PR #206) — cobertura útil ausente
// identificada na auditoria de app/lib/server/companion-analysis-job-reader-adversarial.test.mjs
// (branch claude/adversarial-validation-progressive-inf2cq) contra o
// runtime promovido em main (PR #222, candidate 4427dd3b5406534e73661337
// 9972d997026c861f).
//
// analysis-job-status-route.test.mjs já cobre: IDOR entre empresas, member
// fora da carteira, owner null, downgrade de role do token, e um role
// elevado ('manager') lendo um ciclo de outro dono na mesma empresa — o
// mesmo comportamento que a suíte adversarial do #206 testava com role
// 'admin' (validateCyclePermission trata 'admin'/'manager' da mesma forma,
// então essa parte já está coberta).
//
// O único cenário do #206 sem equivalente material: uma membership
// ACTIVE=false. `validateMembership()` filtra `is_active = true` na própria
// query (company-analysis-job-reader.ts), então uma linha com
// `is_active: false` nunca é retornada e o acesso é negado com
// ANALYSIS_JOB_MEMBERSHIP_REQUIRED — mas nenhum teste existente prova isso
// com uma execução real da rota.

import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test, { mock } from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'

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

const {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} = await import(
  '../../../lib/companion/e2-test-support/fake-companion-token.mjs'
)

installFakeSupabaseEnv()

const adminBox = { admin: null }

const createFakeSupabaseClient =
  () => adminBox.admin

const supabaseMockOptions = {
  namedExports: {
    createClient:
      createFakeSupabaseClient,
  },
}

const require =
  createRequire(import.meta.url)

mock.module(
  import.meta.resolve(
    '@supabase/supabase-js',
  ),
  supabaseMockOptions,
)

mock.module(
  pathToFileURL(
    require.resolve(
      '@supabase/supabase-js',
    ),
  ).href,
  supabaseMockOptions,
)

const { POST } = await import('./route.ts')

const IDS = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycleA: 'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const ANALYSIS_JOB_ID_A = 'a'.repeat(64)

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function buildQueryClass(tables) {
  return class Query {
    constructor(table) {
      this.table = table
      this.filters = []
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    resolveRows() {
      return (tables[this.table] ?? []).filter((row) =>
        matchesFilters(row, this.filters),
      )
    }

    limit() {
      return this
    }

    async maybeSingle() {
      const rows = this.resolveRows()
      return {
        data: rows[0] ?? null,
        error: null,
      }
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

function jobRow({
  analysisJobId = ANALYSIS_JOB_ID_A,
  companyId = IDS.companyA,
  cycleId = IDS.cycleA,
  conversationKey = CONVERSATION_KEY,
  status,
}) {
  return {
    analysis_job_id: analysisJobId,
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    message_watermark: 'watermark-1',
    status,
    candidate_state_version: null,
    failure_code: null,
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

test('membership com is_active=false é negada mesmo com token válido e vínculo existente', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = {
    memberships: [{
      company_id: IDS.companyA,
      user_id: IDS.userA,
      role: 'member',
      is_active: false,
    }],
    cycles: [{
      id: IDS.cycleA,
      company_id: IDS.companyA,
      owner_user_id: IDS.userA,
    }],
    jobs: [jobRow({ status: 'queued' })],
    events: [],
  }

  const { status, body } = await callStatus(fixtures, token, {
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 403)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'ANALYSIS_JOB_MEMBERSHIP_REQUIRED')
  assert.equal(body.data, undefined)
})
