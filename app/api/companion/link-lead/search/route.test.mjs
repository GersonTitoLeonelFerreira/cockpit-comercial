// Testes de E2 para app/api/companion/link-lead/search/route.ts.
// Mesma infraestrutura de resolve-lead/route.test.mjs (ver comentário lá):
// hook de resolução adicional para next/server, e node:test's
// `mock.module` para substituir @supabase/supabase-js por um cliente
// falso determinístico. A rota real roda de ponta a ponta.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { createStepAdmin, selectStep } from '../../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import { bearerHeader, buildToken, installFakeSupabaseEnv } from '../../../../lib/companion/e2-test-support/fake-companion-token.mjs'

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
  leadOwnedByMe: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  leadOwnedByOther: 'aaaaaaaa-0000-4000-8000-0000000000c2',
  leadPool: 'aaaaaaaa-0000-4000-8000-0000000000c3',
  leadNoCycle: 'aaaaaaaa-0000-4000-8000-0000000000c4',
  leadOtherCompany: 'bbbbbbbb-0000-4000-8000-0000000000c5',
  leadDeleted: 'aaaaaaaa-0000-4000-8000-0000000000c6',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

function leadRow(id, overrides = {}) {
  return {
    id,
    company_id: IDS.companyA,
    name: 'Cliente Exemplo',
    phone: '11988887777',
    deleted_at: null,
    ...overrides,
  }
}

const CANDIDATE_LEADS = [
  leadRow(IDS.leadOwnedByMe),
  leadRow(IDS.leadOwnedByOther),
  leadRow(IDS.leadPool),
  leadRow(IDS.leadNoCycle),
  leadRow(IDS.leadOtherCompany, { company_id: IDS.companyB }),
  leadRow(IDS.leadDeleted, { deleted_at: '2026-01-01T00:00:00.000Z' }),
]

function cycleRow({ leadId, companyId = IDS.companyA, ownerUserId, status = 'contato' }) {
  return {
    id: `cycle-${leadId}`,
    lead_id: leadId,
    company_id: companyId,
    status,
    owner_user_id: ownerUserId,
    updated_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
  }
}

const CANDIDATE_CYCLES = [
  cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA }),
  cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
  cycleRow({ leadId: IDS.leadPool, ownerUserId: null }),
  cycleRow({ leadId: IDS.leadOtherCompany, companyId: IDS.companyB, ownerUserId: IDS.userA }),
  // leadNoCycle: propositalmente sem nenhum ciclo.
]

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/link-lead/search', {
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

test('link-lead/search: sem token é rejeitado antes de qualquer acesso ao banco', async () => {
  const fake = useAdmin([])

  const response = await POST(postRequest({ token: null, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(payload.status, 'INVALID_COMPANION_TOKEN')
  assert.equal(fake.calls.length, 0)
})

test('link-lead/search: token inválido (assinatura incorreta) é rejeitado', async () => {
  const fake = useAdmin([])

  const response = await POST(
    postRequest({ token: 'garbage.not-a-real-token', body: { query: 'Cliente' } }),
  )

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

test('link-lead/search: membership inativa é bloqueada', async () => {
  useAdmin([selectStep('company_memberships', null)])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.status, 'NO_COMPANY_PERMISSION')
})

test('link-lead/search: query vazia é recusada sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { query: '' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'QUERY_TOO_SHORT')
  assert.equal(fake.calls.length, 0)
})

test('link-lead/search: query curta demais (1 caractere, sem dígitos suficientes) é recusada', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { query: 'a' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'QUERY_TOO_SHORT')
  assert.equal(fake.calls.length, 0)
})

test('link-lead/search: member só recebe lead OWNED_BY_ME — nunca de outro vendedor, do pool, sem ciclo ou de outra empresa', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', CANDIDATE_LEADS),
    selectStep('sales_cycles', CANDIDATE_CYCLES),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 1)
  assert.equal(payload.leads[0].id, IDS.leadOwnedByMe)
  assert.equal(payload.leads[0].owner_name, null)
  assert.equal(payload.leads[0].cycle_status, 'contato')
  assert.ok(payload.leads[0].phone_hint.endsWith('7777'))

  // Nenhuma consulta a profiles: member nunca vê owner_name.
  assert.equal(
    fake.calls.some((call) => call.table === 'profiles'),
    false,
  )
})

test('link-lead/search: lead soft-deleted nunca aparece, mesmo se retornado pela consulta bruta', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', CANDIDATE_LEADS),
    selectStep('sales_cycles', CANDIDATE_CYCLES),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.ok(!payload.leads.some((lead) => lead.id === IDS.leadDeleted))
})

test('link-lead/search: admin encontra leads de outros vendedores, do pool e sem ciclo (company-wide) com owner_name', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'admin' }),
    selectStep('leads', CANDIDATE_LEADS),
    selectStep('sales_cycles', CANDIDATE_CYCLES),
    selectStep('profiles', [
      { id: IDS.userA, full_name: 'Vendedor Um', email: 'v1@example.com' },
      { id: IDS.otherSeller, full_name: 'Vendedor Dois', email: 'v2@example.com' },
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)

  const ids = payload.leads.map((lead) => lead.id).sort()
  assert.deepEqual(
    ids,
    [IDS.leadNoCycle, IDS.leadOwnedByMe, IDS.leadOwnedByOther, IDS.leadPool].sort(),
  )

  // Nunca inclui lead de outra empresa, mesmo que a consulta bruta o traga.
  assert.ok(!ids.includes(IDS.leadOtherCompany))

  const other = payload.leads.find((lead) => lead.id === IDS.leadOwnedByOther)
  assert.equal(other.owner_name, 'Vendedor Dois')

  const pool = payload.leads.find((lead) => lead.id === IDS.leadPool)
  assert.equal(pool.owner_name, null)

  assert.equal(fake.calls.at(-1).table, 'profiles')
})

test('link-lead/search: manager tem a mesma visibilidade company-wide que admin', async () => {
  useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'manager' }),
    selectStep('leads', CANDIDATE_LEADS),
    selectStep('sales_cycles', CANDIDATE_CYCLES),
    selectStep('profiles', [
      { id: IDS.userA, full_name: 'Vendedor Um', email: 'v1@example.com' },
      { id: IDS.otherSeller, full_name: 'Vendedor Dois', email: 'v2@example.com' },
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 4)
})

test('link-lead/search: nunca retorna mais que MAX_RESULTS (10) leads', async () => {
  const manyLeads = Array.from({ length: 15 }, (_, index) =>
    leadRow(`aaaaaaaa-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`),
  )
  const manyCycles = manyLeads.map((lead) => cycleRow({ leadId: lead.id, ownerUserId: IDS.userA }))

  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', manyLeads),
    selectStep('sales_cycles', manyCycles),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 10)
})

test('link-lead/search: resposta nunca contém CPF/CNPJ/e-mail completo/endereço/identidade externa bruta', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'admin' }),
    selectStep('leads', CANDIDATE_LEADS),
    selectStep('sales_cycles', CANDIDATE_CYCLES),
    selectStep('profiles', [
      { id: IDS.userA, full_name: 'Vendedor Um', email: 'v1@example.com' },
      { id: IDS.otherSeller, full_name: 'Vendedor Dois', email: 'v2@example.com' },
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  const forbiddenKeys = ['cpf', 'cnpj', 'cpf_cnpj', 'email', 'address', 'endereco', 'notes']

  for (const lead of payload.leads) {
    for (const key of forbiddenKeys) {
      assert.equal(Object.prototype.hasOwnProperty.call(lead, key), false)
    }
  }

  assert.equal(
    fake.calls.some((call) => call.table === 'lead_external_identities'),
    false,
  )
})

test('link-lead/search: phone query usa dígitos e nunca aceita company_id vindo do corpo', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [leadRow(IDS.leadOwnedByMe)]),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: { query: '9888', company_id: IDS.companyB },
    }),
  )

  assert.equal(response.status, 200)

  for (const call of fake.calls) {
    const companyFilter = call.filters.find((f) => f.column === 'company_id')
    if (companyFilter) {
      assert.equal(companyFilter.value, IDS.companyA)
    }
  }
})
