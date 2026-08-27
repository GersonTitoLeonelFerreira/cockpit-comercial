// Testes de E2 (Trilha E) para app/api/companion/apply-suggestion/route.ts.
// Mesma infraestrutura de create-lead-route.test.mjs/resolve-lead-route.test.mjs
// (ver comentário lá): hook de resolução adicional para next/server, e
// node:test's `mock.module` para substituir @supabase/supabase-js por um
// cliente falso determinístico. A rota real roda de ponta a ponta.
//
// Foco: (1) apply-suggestion importa verifyCompanionRequestToken de
// companion-token.ts (antes tinha uma verificação local duplicada); (2) o
// gate de confirmação humana explícita (confirmed_by_human) adicionado
// para fechar o achado de auditoria de que este endpoint gravava
// `applied_with_user_approval: true` de forma incondicional, sem checar
// nenhum sinal de confirmação vindo do payload.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import {
  createStepAdmin,
  insertStep,
  selectStep,
  updateStep,
} from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import { bearerHeader, buildExpiredToken, buildToken, installFakeSupabaseEnv } from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

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
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

function openCycle(overrides = {}) {
  return {
    id: IDS.cycle,
    company_id: IDS.companyA,
    status: 'contato',
    owner_user_id: IDS.userA,
    next_action: null,
    next_action_date: null,
    ...overrides,
  }
}

function suggestion(overrides = {}) {
  return {
    recommended_status: 'negociacao',
    confidence: 0.8,
    action_channel: null,
    action_result: null,
    result_detail: null,
    next_action: null,
    next_action_date: null,
    summary: 'Cliente demonstrou interesse.',
    tags: [],
    should_close_won: false,
    should_close_lost: false,
    close_reason: null,
    reason_for_recommendation: 'Cliente respondeu positivamente.',
    source: 'ai',
    ...overrides,
  }
}

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/apply-suggestion', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? bearerHeader(token) : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
}

async function readJson(response) {
  return response.json()
}

// ---------------------------------------------------------------------
// Autenticação (agora via verifyCompanionRequestToken compartilhado)
// ---------------------------------------------------------------------

test('apply-suggestion: token ausente é rejeitado antes de qualquer acesso ao banco', async () => {
  const fake = useAdmin([])
  const response = await POST(
    postRequest({ token: null, body: { cycle_id: IDS.cycle, applied_status: 'negociacao', suggestion: suggestion() } }),
  )

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

test('apply-suggestion: token expirado é rejeitado', async () => {
  const fake = useAdmin([])
  const token = buildExpiredToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: { cycle_id: IDS.cycle, applied_status: 'negociacao', suggestion: suggestion() },
    }),
  )

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

// ---------------------------------------------------------------------
// Gate de confirmação humana explícita
// ---------------------------------------------------------------------

test('apply-suggestion: confirmed_by_human=false é rejeitado antes de qualquer escrita no CRM', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: {
        cycle_id: IDS.cycle,
        applied_status: 'negociacao',
        suggestion: suggestion(),
        confirmed_by_human: false,
      },
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /confirmação humana/i)
  assert.equal(fake.calls.length, 0, 'nenhuma leitura/escrita deveria acontecer antes do gate de confirmação')
})

test('apply-suggestion: confirmed_by_human omitido preserva o comportamento atual da extensão (aplica normalmente)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', openCycle()),
    updateStep('sales_cycles', null),
    insertStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: {
        cycle_id: IDS.cycle,
        applied_status: 'negociacao',
        suggestion: suggestion(),
      },
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)

  const appliedEvent = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'insert',
  )
  assert.ok(appliedEvent, 'deveria registrar um cycle_event')
  assert.equal(
    appliedEvent.payload.metadata.companion.applied_with_user_approval,
    true,
    'sem confirmed_by_human explícito, o comportamento atual (extensão já confirma via window.confirm) é preservado',
  )
})

test('apply-suggestion: confirmed_by_human=true explícito também aplica e registra o sinal real recebido', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', openCycle()),
    updateStep('sales_cycles', null),
    insertStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: {
        cycle_id: IDS.cycle,
        applied_status: 'negociacao',
        suggestion: suggestion(),
        confirmed_by_human: true,
      },
    }),
  )

  assert.equal(response.status, 200)

  const appliedEvent = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'insert',
  )
  assert.equal(appliedEvent.payload.metadata.companion.applied_with_user_approval, true)
})

test('apply-suggestion: consulta do ciclo usa o company_id do token, mesmo que o corpo tente injetar outro', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', openCycle()),
    updateStep('sales_cycles', null),
    insertStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  await POST(
    postRequest({
      token,
      body: {
        cycle_id: IDS.cycle,
        applied_status: 'negociacao',
        suggestion: suggestion(),
        company_id: 'bbbbbbbb-0000-4000-8000-000000000002',
      },
    }),
  )

  const cycleLookup = fake.calls.find((call) => call.table === 'sales_cycles' && call.method === 'select')
  assert.ok(cycleLookup)
  assert.ok(
    cycleLookup.filters.some((filter) => filter.column === 'company_id' && filter.value === IDS.companyA),
    'a busca do ciclo deve filtrar pelo company_id do token, não pelo do corpo',
  )
})
