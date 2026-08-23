// Testes de integração da rota somente-leitura
// GET /api/companion/analysis-job-status (POST, seguindo o mesmo padrão de
// transporte de client-context/route.ts).
//
// Cobre os itens obrigatórios da Frente "Deep Result Delivery" que dizem
// respeito ao backend:
// (1) queued -> running -> succeeded devolve o resultado persistido;
// (2) failed devolve failure_code, sem resultado;
// (3) superseded devolve status sem resultado (nunca vira corrente);
// (16) tenant A não pode ler job de tenant B (IDOR) -> 404, nunca o dado;
// (17) usuário sem vínculo com o ciclo não pode ler (mesmo tenant);
// (18) job superseded nunca é devolvido como se fosse resultado atual;
// (26)/(27) o endpoint é puramente leitura: nenhuma chamada de
// insert/update/rpc é sequer suportada pelo fake admin — qualquer
// tentativa de escrita faria o teste falhar com erro, não silenciosamente.

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

// companion-analysis-job-reader.ts (importado por route.ts via alias
// acima) tem, por sua vez, imports relativos sem extensão para
// stateful-copilot-background-job.ts e stateful-copilot-contract.ts — o
// loader compartilhado da suíte padrão (npm run test:companion) resolve
// exatamente esse caso; route-alias-resolve-loader.mjs sozinho não cobre
// especificadores relativos.
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

const ANALYSIS_JOB_ID_A =
  'a'.repeat(64)

const ANALYSIS_JOB_ID_B =
  'b'.repeat(64)

const ACTIVE_MEMBERSHIP_A = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

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
      const rows = (tables[this.table] ?? []).filter((row) =>
        matchesFilters(row, this.filters),
      )

      return { data: rows, error: null }
    }

    maybeSingle() {
      const result = this.resolveRows()
      return Promise.resolve({ data: result.data[0] ?? null, error: null })
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
    memberships: [ACTIVE_MEMBERSHIP_A],
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

function eventRow({
  companyId = IDS.companyA,
  cycleId = IDS.cycleA,
  conversationKey = CONVERSATION_KEY,
  candidateStateVersion = 1,
  normalizedOutput,
}) {
  return {
    company_id: companyId,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    candidate_state_version: candidateStateVersion,
    generated_at: '2026-08-23T12:00:00.000Z',
    normalized_output: normalizedOutput,
  }
}

function deepOutput(overrides = {}) {
  return {
    contract_version: 'phase-5.2-stateful-copilot-v3',
    previous_state_version: null,
    analyzed_message_ids: ['m1'],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    interpretation: {
      what_changed: null,
      what_remains_valid: [],
      current_moment: {
        summary: 'Cliente pediu desconto no plano anual.',
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
      customer_need: null,
      uncertainties: [],
    },
    state_patch: {
      facts_to_add: [],
      fact_ids_to_supersede: [],
      needs_to_add: [],
      need_ids_to_resolve: [],
      open_loops_to_add: [],
      open_loop_ids_to_resolve: [],
      objections_to_add: [],
      objection_ids_to_resolve: [],
      objection_ids_to_supersede: [],
      commitments_to_upsert: [],
      signals_to_add: [],
      signal_ids_to_resolve: [],
      uncertainties_to_add: [],
      uncertainty_ids_to_resolve: [],
    },
    strategy: {
      method_application: 'SPIN',
      rationale: 'Cliente já demonstrou interesse comercial.',
      next_move: 'Oferecer condição especial para o plano anual.',
      recommended_question: null,
      suggested_message: 'Consigo um desconto de 10% no plano anual, fechamos hoje?',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    operational_suggestions: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: ['m1'],
    memory_ids: [],
    ...overrides,
  }
}

function statusRequest({ token, body }) {
  return new Request('http://localhost/api/companion/analysis-job-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? bearerHeader(token) : {}) },
    body: JSON.stringify(body ?? {}),
  })
}

async function callStatus(fixtures, token, body) {
  adminBox.admin = createFakeAdmin(fixtures)
  const response = await POST(statusRequest({ token, body }))
  return { status: response.status, body: await response.json() }
}

// ---------------------------------------------------------------------
// (1) queued/running/succeeded
// ---------------------------------------------------------------------

test('queued: devolve o status sem resultado', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'queued' }))

  const { status, body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.status, 'queued')
  assert.equal(body.data.result, null)
})

test('running: devolve o status sem resultado', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'running' }))

  const { body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(body.data.status, 'running')
  assert.equal(body.data.result, null)
})

test('succeeded: devolve o resultado persistido em companion_commercial_state_events', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'succeeded', candidateStateVersion: 1 }))
  fixtures.events.push(
    eventRow({ candidateStateVersion: 1, normalizedOutput: deepOutput() }),
  )

  const { status, body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 200)
  assert.equal(body.data.status, 'succeeded')
  assert.equal(body.data.candidate_state_version, 1)
  assert.equal(
    body.data.result.strategy.suggested_message,
    'Consigo um desconto de 10% no plano anual, fechamos hoje?',
  )
  assert.equal(body.data.result.commercial_relevance, 'commercial')
})

// ---------------------------------------------------------------------
// (2) failed
// ---------------------------------------------------------------------

test('failed: devolve failure_code, nunca um resultado', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'failed', failureCode: 'STATEFUL_BACKGROUND_FAILED' }))

  const { body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(body.data.status, 'failed')
  assert.equal(body.data.failure_code, 'STATEFUL_BACKGROUND_FAILED')
  assert.equal(body.data.result, null)
})

// ---------------------------------------------------------------------
// (3) / (18) superseded nunca vira corrente
// ---------------------------------------------------------------------

test('superseded: devolve o status, nunca um resultado (job velho jamais vira corrente)', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'superseded' }))

  const { body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(body.data.status, 'superseded')
  assert.equal(body.data.result, null)
})

// ---------------------------------------------------------------------
// (16) isolamento de tenant — cenário proibido do Controle Mestre:
// usuário Empresa A descobre analysis_job_id de Empresa B.
// ---------------------------------------------------------------------

test('tenant A não localiza job pertencente a tenant B, mesmo sabendo o analysis_job_id exato', async () => {
  const tokenA = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()

  // Job de verdade pertence à empresa B — nunca aparece nas fixtures de A,
  // simulando exatamente "service_role consulta e API devolve B" se a
  // filtragem falhar.
  fixtures.jobs.push(
    jobRow({
      analysisJobId: ANALYSIS_JOB_ID_B,
      companyId: IDS.companyB,
      cycleId: 'bbbbbbbb-0000-4000-8000-0000000000d1',
      status: 'succeeded',
      candidateStateVersion: 1,
    }),
  )

  const { status, body } = await callStatus(fixtures, tokenA, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_B,
  })

  assert.equal(status, 404)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'ANALYSIS_JOB_NOT_FOUND')
  assert.equal(body.data, undefined)
})

test('tenant A não localiza job da própria empresa se o cycle_id informado não bate (isolamento de ciclo)', async () => {
  const tokenA = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'succeeded', candidateStateVersion: 1, cycleId: IDS.cycleA }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1, normalizedOutput: deepOutput() }))

  const { status, body } = await callStatus(fixtures, tokenA, {
    cycle_id: IDS.cycleA2,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 403, 'cycleA2 não pertence à carteira de userA')
  assert.equal(body.code, 'ANALYSIS_JOB_PERMISSION_DENIED')
})

// ---------------------------------------------------------------------
// (17) usuário sem vínculo ativo com a empresa nunca lê nada
// ---------------------------------------------------------------------

test('usuário sem membership ativa na empresa não localiza o job', async () => {
  const strangerToken = buildToken({ sub: 'cccccccc-0000-4000-8000-0000000000f1', companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'succeeded', candidateStateVersion: 1 }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1, normalizedOutput: deepOutput() }))

  const { status, body } = await callStatus(fixtures, strangerToken, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 403)
  assert.equal(body.code, 'ANALYSIS_JOB_MEMBERSHIP_REQUIRED')
})

// ---------------------------------------------------------------------
// Validação básica de transporte
// ---------------------------------------------------------------------

test('sem token: 401', async () => {
  const fixtures = baseFixtures()
  const { status, body } = await callStatus(fixtures, null, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 401)
  assert.equal(body.code, 'INVALID_COMPANION_SESSION')
})

test('analysis_job_id malformado (não sha256): 400, nunca consulta o banco', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()

  const { status, body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: 'not-a-real-hash',
  })

  assert.equal(status, 400)
  assert.equal(body.code, 'INVALID_ANALYSIS_JOB_ARGUMENT')
})

test('job inexistente para o escopo correto: 404', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()

  const { status, body } = await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(status, 404)
  assert.equal(body.code, 'ANALYSIS_JOB_NOT_FOUND')
})

// ---------------------------------------------------------------------
// (26)/(27) somente leitura — o fake admin não expõe insert/update/rpc;
// qualquer tentativa de escrita quebraria estes testes já acima com um
// erro de "is not a function", nunca silenciosamente. Este teste reforça
// explicitamente que uma leitura bem-sucedida não deixou nenhuma marca de
// escrita nas tabelas em memória (mesmas referências antes/depois).
// ---------------------------------------------------------------------

test('leitura succeeded não muta nenhuma linha das tabelas consultadas', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  fixtures.jobs.push(jobRow({ status: 'succeeded', candidateStateVersion: 1 }))
  fixtures.events.push(eventRow({ candidateStateVersion: 1, normalizedOutput: deepOutput() }))

  const jobsBefore = JSON.stringify(fixtures.jobs)
  const eventsBefore = JSON.stringify(fixtures.events)

  await callStatus(fixtures, token, {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    analysis_job_id: ANALYSIS_JOB_ID_A,
  })

  assert.equal(JSON.stringify(fixtures.jobs), jobsBefore)
  assert.equal(JSON.stringify(fixtures.events), eventsBefore)
})
