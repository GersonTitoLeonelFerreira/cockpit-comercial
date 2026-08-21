// Testes de E2 (Trilha E) para app/api/companion/message-action/route.ts —
// prioridade 2 da E2: idempotência e isolamento multiempresa deste fluxo
// legado de telemetria (o mais novo, actions/events, já tinha cobertura
// própria antes da E2). Mesma infraestrutura dos outros testes de rota
// desta pasta (ver create-lead-route.test.mjs para o racional completo).

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { createStepAdmin, insertStep, selectStep } from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
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
  companyB: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  otherSeller: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/message-action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? bearerHeader(token) : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
}

function validBody(overrides = {}) {
  return {
    cycle_id: IDS.cycle,
    action: 'copied',
    message: 'Mensagem sugerida para o cliente.',
    coaching_note_id: null,
    ...overrides,
  }
}

async function readJson(response) {
  return response.json()
}

// ---------------------------------------------------------------------
// Autenticação e validação
// ---------------------------------------------------------------------

test('message-action: token ausente é rejeitado antes de qualquer acesso ao banco', async () => {
  const fake = useAdmin([])
  const response = await POST(postRequest({ token: null, body: validBody() }))

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

test('message-action: token expirado é rejeitado', async () => {
  const fake = useAdmin([])
  const token = buildExpiredToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

test('message-action: cycle_id ausente é rejeitado sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ cycle_id: '' }) }))

  assert.equal(response.status, 400)
  assert.equal(fake.calls.length, 0)
})

test('message-action: ação inválida é rejeitada sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ action: 'apagou' }) }))

  assert.equal(response.status, 400)
  assert.equal(fake.calls.length, 0)
})

test('message-action: membership ausente é bloqueado', async () => {
  useAdmin([selectStep('company_memberships', null)])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 403)
})

test('message-action: ciclo inexistente na empresa responde 404', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 404)
})

test('message-action: member fora da carteira (ciclo de outro dono) é bloqueado', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.otherSeller }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 403)
})

test('message-action: manager registra ação em ciclo fora da própria carteira', async () => {
  useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'manager' }),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.otherSeller }),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 200)
})

// ---------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------

test('message-action: ação nova (copied) grava exatamente um evento', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ action: 'copied' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.already_registered, false)
  assert.equal(fake.remaining.length, 0)

  const inserts = fake.calls.filter((c) => c.method === 'insert')
  assert.equal(inserts.length, 1, 'ação "copied" não deveria gerar evento de contato adicional')
})

test('message-action: ação "sent" grava o evento de uso E um evento adicional de contato comercial (dois inserts por desenho)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ action: 'sent' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.already_registered, false)
  assert.equal(fake.remaining.length, 0)

  const inserts = fake.calls.filter((c) => c.method === 'insert')
  assert.equal(inserts.length, 2, 'ação "sent" deveria gravar 2 eventos: uso da sugestão + contato comercial')
})

test('message-action: reenviar a MESMA ação (mesma idempotency_key) não duplica gravação', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }),
    selectStep('cycle_events', { id: 'evt-1', occurred_at: '2026-08-18T04:30:00.000Z' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ action: 'copied' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.already_registered, true)
  assert.equal(payload.data.occurred_at, '2026-08-18T04:30:00.000Z')

  const inserts = fake.calls.filter((c) => c.method === 'insert')
  assert.equal(inserts.length, 0, 'reenvio idempotente não deveria gerar nenhum insert')
})

test('message-action: mensagens diferentes para o mesmo ciclo/ação geram idempotency_key diferentes (não colidem)', async () => {
  const fakeFirst = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  await POST(postRequest({ token, body: validBody({ action: 'copied', message: 'Mensagem A' }) }))
  const firstKeyFilter = fakeFirst.calls
    .find((c) => c.table === 'cycle_events' && c.method === 'select')
    .filters.find((f) => f.column === 'metadata->>idempotency_key')

  const fakeSecond = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])

  await POST(postRequest({ token, body: validBody({ action: 'copied', message: 'Mensagem B' }) }))
  const secondKeyFilter = fakeSecond.calls
    .find((c) => c.table === 'cycle_events' && c.method === 'select')
    .filters.find((f) => f.column === 'metadata->>idempotency_key')

  assert.notEqual(firstKeyFilter.value, secondKeyFilter.value)
})

// ---------------------------------------------------------------------
// Isolamento multiempresa
// ---------------------------------------------------------------------

test('message-action: busca e gravação são sempre filtradas pelo company_id do token', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: { ...validBody(), company_id: IDS.companyB } }),
  )

  assert.equal(response.status, 200)

  for (const call of fake.calls) {
    const companyFilter = call.filters.find((f) => f.column === 'company_id')
    if (companyFilter) {
      assert.equal(companyFilter.value, IDS.companyA)
    }
    if (call.method === 'insert' && call.payload) {
      assert.equal(call.payload.company_id, IDS.companyA)
    }
  }
})
