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

test('apply-suggestion: confirmed_by_human omitido é FAIL CLOSED (rejeitado, nenhuma escrita)', async () => {
  const fake = useAdmin([])
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

  assert.equal(response.status, 400)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /confirmação humana/i)
  assert.equal(
    fake.calls.length,
    0,
    'ausência de confirmed_by_human precisa ser fail-closed: nenhuma leitura/escrita no CRM',
  )
})

test('apply-suggestion: confirmed_by_human com valor truthy não-booleano (ex.: "true" string, 1) é FAIL CLOSED', async () => {
  for (const nonBooleanTruthy of ['true', 1, 'yes', {}]) {
    const fake = useAdmin([])
    const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

    const response = await POST(
      postRequest({
        token,
        body: {
          cycle_id: IDS.cycle,
          applied_status: 'negociacao',
          suggestion: suggestion(),
          confirmed_by_human: nonBooleanTruthy,
        },
      }),
    )

    assert.equal(
      response.status,
      400,
      `confirmed_by_human=${JSON.stringify(nonBooleanTruthy)} deveria ser rejeitado (só === true é aceito)`,
    )
    assert.equal(fake.calls.length, 0)
  }
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
        confirmed_by_human: true,
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

test('apply-suggestion: ciclo de outra empresa (tenant errado) não é encontrado, mesmo com confirmação válida', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    // A query real filtra por company_id do token; um ciclo de outra
    // empresa nunca bateria o filtro e o Supabase real devolveria null.
    selectStep('sales_cycles', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: {
        cycle_id: 'aaaaaaaa-0000-4000-8000-0000000000ff',
        applied_status: 'negociacao',
        suggestion: suggestion(),
        confirmed_by_human: true,
      },
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 404)
  assert.equal(payload.ok, false)
  assert.equal(
    fake.calls.some((call) => call.method === 'update' || call.method === 'insert'),
    false,
    'nenhuma escrita deveria acontecer para um ciclo de outro tenant',
  )
})

test('apply-suggestion: replay da mesma sugestão já confirmada contra ciclo inalterado é idempotente (não escreve de novo)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    // O ciclo já está no estado que a sugestão pediria (replay de uma
    // aplicação anterior bem-sucedida) — o route.ts detecta que nada
    // mudaria e responde already_applied:true sem tocar em update/insert.
    selectStep('sales_cycles', openCycle({ status: 'negociacao' })),
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
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.data.already_applied, true)
  assert.equal(
    fake.calls.some((call) => call.method === 'update' || call.method === 'insert'),
    false,
    'replay contra um ciclo já no estado desejado não deveria gerar nova escrita',
  )
})
