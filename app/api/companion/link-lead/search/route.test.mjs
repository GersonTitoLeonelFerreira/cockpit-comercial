// Testes de E2 para app/api/companion/link-lead/search/route.ts.
// Mesma infraestrutura de resolve-lead/route.test.mjs (ver comentário lá):
// hook de resolução adicional para next/server, e node:test's
// `mock.module` para substituir @supabase/supabase-js por um cliente
// falso determinístico. A rota real roda de ponta a ponta.
//
// Ordem real de chamadas ao banco desta rota:
//   - member: company_memberships -> sales_cycles (ciclos possuídos,
//     nunca company-wide) -> leads (match do termo, já restrito aos leads
//     possuídos).
//   - admin/manager: company_memberships -> leads (candidatos
//     company-wide) -> sales_cycles (ciclos dos candidatos) -> profiles
//     (só se houver owner a exibir).
// A role usada é sempre a de company_memberships (membership ATUAL), nunca
// a do token — por isso todo teste de autorização varia role no token e/ou
// na membership fixture, para provar qual delas realmente decide.

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

function membership(role) {
  return {
    company_id: IDS.companyA,
    user_id: IDS.userA,
    role,
    is_active: true,
  }
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

for (const wildcardQuery of ['__', '_%', '%_']) {
  test(`link-lead/search: "${wildcardQuery}" nunca vira busca ampla/enumeração via ILIKE`, async () => {
    const fake = useAdmin([])
    const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

    const response = await POST(postRequest({ token, body: { query: wildcardQuery } }))
    const payload = await readJson(response)

    // Depois de remover os wildcards, sobra menos de 2 caracteres úteis —
    // nunca deve virar uma busca ampla company-wide.
    assert.equal(response.status, 400)
    assert.equal(payload.status, 'QUERY_TOO_SHORT')
    assert.equal(fake.calls.length, 0)
  })
}

test('link-lead/search: member só recebe lead OWNED_BY_ME — a própria consulta de ciclos já é escopada ao usuário', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    selectStep('leads', [
      leadRow(IDS.leadOwnedByMe),
      // Defesa em profundidade: mesmo que a consulta de leads devolvesse
      // algo fora do escopo, o código nunca deveria incluir.
      leadRow(IDS.leadOtherCompany, { company_id: IDS.companyB }),
    ]),
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

  assert.deepEqual(
    fake.calls.map((call) => call.table),
    ['company_memberships', 'sales_cycles', 'leads'],
  )

  const ownedCyclesCall = fake.calls[1]
  const ownerFilter = ownedCyclesCall.filters.find((f) => f.column === 'owner_user_id')
  assert.equal(ownerFilter.value, IDS.userA)
})

test('link-lead/search: member sem nenhum ciclo aberto próprio recebe lista vazia sem consultar leads', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', []),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.deepEqual(payload.leads, [])
  assert.equal(
    fake.calls.some((call) => call.table === 'leads'),
    false,
  )
})

test('link-lead/search: lead soft-deleted nunca aparece, mesmo com ciclo aberto próprio', async () => {
  useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA }),
      cycleRow({ leadId: IDS.leadDeleted, ownerUserId: IDS.userA }),
    ]),
    selectStep('leads', [
      leadRow(IDS.leadOwnedByMe),
      leadRow(IDS.leadDeleted, { deleted_at: '2026-01-01T00:00:00.000Z' }),
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 1)
  assert.ok(!payload.leads.some((lead) => lead.id === IDS.leadDeleted))
})

test('link-lead/search: admin encontra leads de outros vendedores, do pool e sem ciclo (company-wide) com owner_name', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('admin')),
    selectStep('leads', [
      leadRow(IDS.leadOwnedByMe),
      leadRow(IDS.leadOwnedByOther),
      leadRow(IDS.leadPool),
      leadRow(IDS.leadNoCycle),
      leadRow(IDS.leadOtherCompany, { company_id: IDS.companyB }),
      leadRow(IDS.leadDeleted, { deleted_at: '2026-01-01T00:00:00.000Z' }),
    ]),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA }),
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
      cycleRow({ leadId: IDS.leadPool, ownerUserId: null }),
      cycleRow({ leadId: IDS.leadOtherCompany, companyId: IDS.companyB, ownerUserId: IDS.userA }),
    ]),
    selectStep('profiles', [
      { id: IDS.userA, full_name: 'Vendedor Um' },
      { id: IDS.otherSeller, full_name: 'Vendedor Dois' },
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

  assert.ok(!ids.includes(IDS.leadOtherCompany))
  assert.ok(!ids.includes(IDS.leadDeleted))

  const other = payload.leads.find((lead) => lead.id === IDS.leadOwnedByOther)
  assert.equal(other.owner_name, 'Vendedor Dois')

  const pool = payload.leads.find((lead) => lead.id === IDS.leadPool)
  assert.equal(pool.owner_name, null)

  assert.equal(fake.calls.at(-1).table, 'profiles')
})

test('link-lead/search: manager tem a mesma visibilidade company-wide que admin', async () => {
  useAdmin([
    selectStep('company_memberships', membership('manager')),
    selectStep('leads', [
      leadRow(IDS.leadOwnedByMe),
      leadRow(IDS.leadOwnedByOther),
      leadRow(IDS.leadPool),
      leadRow(IDS.leadNoCycle),
    ]),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA }),
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
      cycleRow({ leadId: IDS.leadPool, ownerUserId: null }),
    ]),
    selectStep('profiles', [
      { id: IDS.userA, full_name: 'Vendedor Um' },
      { id: IDS.otherSeller, full_name: 'Vendedor Dois' },
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 4)
})

// --- Correção 1: role da membership ATUAL é quem decide, nunca a do token ---

test('link-lead/search: token diz admin, membership atual diz member -> comportamento de MEMBER', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    selectStep('leads', [leadRow(IDS.leadOwnedByMe)]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 1)
  assert.equal(payload.leads[0].owner_name, null)
  assert.equal(
    fake.calls.some((call) => call.table === 'profiles'),
    false,
  )
})

test('link-lead/search: token diz manager, membership atual diz member -> comportamento de MEMBER', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', []),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.deepEqual(payload.leads, [])
  assert.equal(
    fake.calls.some((call) => call.table === 'leads'),
    false,
  )
})

test('link-lead/search: token diz member, membership atual diz admin -> comportamento de ADMIN', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('admin')),
    selectStep('leads', [leadRow(IDS.leadOwnedByOther)]),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
    ]),
    selectStep('profiles', [{ id: IDS.otherSeller, full_name: 'Vendedor Dois' }]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 1)
  assert.equal(payload.leads[0].id, IDS.leadOwnedByOther)
  assert.equal(payload.leads[0].owner_name, 'Vendedor Dois')
  assert.equal(fake.calls[1].table, 'leads')
})

test('link-lead/search: token diz member, membership atual diz manager -> comportamento de MANAGER', async () => {
  useAdmin([
    selectStep('company_memberships', membership('manager')),
    selectStep('leads', [leadRow(IDS.leadPool)]),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadPool, ownerUserId: null })]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 1)
  assert.equal(payload.leads[0].id, IDS.leadPool)
})

// --- Correção 3: owner_name nunca cai para e-mail ---

test('link-lead/search: owner sem full_name nunca expõe e-mail como owner_name', async () => {
  useAdmin([
    selectStep('company_memberships', membership('admin')),
    selectStep('leads', [leadRow(IDS.leadOwnedByOther)]),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
    ]),
    selectStep('profiles', [{ id: IDS.otherSeller, full_name: null, email: 'seller@company.com' }]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)
  const raw = JSON.stringify(payload)

  assert.equal(response.status, 200)
  assert.equal(payload.leads[0].owner_name, null)
  assert.ok(!raw.includes('seller@company.com'))
})

// --- Correção 4: limite pré-autorização nunca descarta lead próprio do member ---

test('link-lead/search: caminho member começa pela carteira própria (sales_cycles escopado por owner_user_id), nunca por uma busca company-wide em leads', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    selectStep('leads', [leadRow(IDS.leadOwnedByMe)]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 1)
  assert.equal(payload.leads[0].id, IDS.leadOwnedByMe)

  // Prova direta de "portfolio-first": a segunda chamada ao banco (logo
  // após a membership) é sales_cycles, nunca leads — e ela já chega
  // filtrada por company_id do token E owner_user_id do usuário, nunca
  // uma varredura company-wide sem dono. `leads` só é consultada DEPOIS,
  // e já restrita (`in`) ao conjunto de ids que essa consulta devolveu.
  assert.deepEqual(
    fake.calls.map((call) => call.table),
    ['company_memberships', 'sales_cycles', 'leads'],
  )

  const ownedCyclesCall = fake.calls[1]
  assert.deepEqual(
    ownedCyclesCall.filters.map((filter) => [filter.column, filter.value]),
    [
      ['company_id', IDS.companyA],
      ['owner_user_id', IDS.userA],
    ],
  )

  const leadsMatchCall = fake.calls[2]
  const leadsInFilter = leadsMatchCall.filters.find((filter) => filter.op === 'in')
  assert.equal(leadsInFilter.column, 'id')
  assert.deepEqual(leadsInFilter.values, [IDS.leadOwnedByMe])
})

test('link-lead/search: nunca retorna mais que MAX_RESULTS (10) leads para member', async () => {
  const manyLeadIds = Array.from(
    { length: 15 },
    (_, index) => `aaaaaaaa-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
  )
  const manyCycles = manyLeadIds.map((leadId) => cycleRow({ leadId, ownerUserId: IDS.userA }))
  const manyLeads = manyLeadIds.map((id) => leadRow(id))

  useAdmin([
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', manyCycles),
    selectStep('leads', manyLeads),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { query: 'Cliente' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.leads.length, 10)
})

test('link-lead/search: resposta nunca contém CPF/CNPJ/e-mail completo/endereço/identidade externa bruta', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', membership('admin')),
    selectStep('leads', [leadRow(IDS.leadOwnedByOther)]),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
    ]),
    selectStep('profiles', [{ id: IDS.otherSeller, full_name: 'Vendedor Dois' }]),
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
    selectStep('company_memberships', membership('member')),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    selectStep('leads', [leadRow(IDS.leadOwnedByMe)]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

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
