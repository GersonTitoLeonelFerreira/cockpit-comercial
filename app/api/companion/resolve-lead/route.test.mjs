// Testes de E2 (Trilha E) para app/api/companion/resolve-lead/route.ts.
// Mesma infraestrutura de create-lead-route.test.mjs (ver comentário lá):
// hook de resolução adicional para next/server, e node:test's
// `mock.module` para substituir @supabase/supabase-js por um cliente
// falso determinístico. A rota real roda de ponta a ponta.
//
// Nota: resolve-lead/route.ts implementa sua PRÓPRIA verificação de token
// (não importa companion-token.ts) — mas usa o mesmo algoritmo HMAC, então
// os tokens assinados por `buildToken`/`buildExpiredToken` (que usam
// createCompanionToken de companion-token.ts) são válidos aqui também.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { createStepAdmin, selectStep } from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
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
  lead: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  otherLead: 'aaaaaaaa-0000-4000-8000-0000000000c2',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

const LEAD_ROW = {
  id: IDS.lead,
  company_id: IDS.companyA,
  name: 'Cliente Exemplo',
  phone: '11988887777',
  email: 'cliente@example.com',
  cpf_cnpj: '52998224725',
  deleted_at: null,
}

const LEAD_PROFILE_ROW = {
  lead_id: IDS.lead,
  email: 'cliente@example.com',
  cpf: '52998224725',
  cnpj: null,
  birth_date: null,
  profession: null,
  cep: null,
  address_street: null,
  address_number: null,
  address_complement: null,
  address_neighborhood: null,
  address_city: null,
  address_state: null,
  phone_mobile: null,
}

function openCycle(overrides = {}) {
  return {
    id: IDS.cycle,
    lead_id: IDS.lead,
    company_id: IDS.companyA,
    status: 'contato',
    owner_user_id: IDS.userA,
    current_group_id: null,
    next_action: null,
    next_action_date: null,
    updated_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/resolve-lead', {
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
// Autenticação
// ---------------------------------------------------------------------

test('resolve-lead: token ausente é rejeitado antes de qualquer acesso ao banco', async () => {
  const fake = useAdmin([])
  const response = await POST(postRequest({ token: null, body: { phone: '11988887777' } }))

  assert.equal(response.status, 401)
  assert.equal((await readJson(response)).status, 'INVALID_COMPANION_TOKEN')
  assert.equal(fake.calls.length, 0)
})

test('resolve-lead: token expirado é rejeitado', async () => {
  const fake = useAdmin([])
  const token = buildExpiredToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

test('resolve-lead: telefone não detectável responde NO_PHONE_DETECTED sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'NO_PHONE_DETECTED')
  assert.equal(fake.calls.length, 0)
})

test('resolve-lead: usuário sem vínculo ativo é bloqueado', async () => {
  useAdmin([selectStep('company_memberships', null)])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))

  assert.equal(response.status, 403)
  assert.equal((await readJson(response)).status, 'NO_COMPANY_PERMISSION')
})

// ---------------------------------------------------------------------
// Ausência de lead / lead existente nos vários estados
// ---------------------------------------------------------------------

test('resolve-lead: lead inexistente responde NOT_FOUND', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', []),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'NOT_FOUND')
  assert.equal(payload.lead, null)
})

test('resolve-lead: lead existente com ciclo aberto de propriedade do solicitante responde OWNED_BY_ME e expõe cpf_cnpj/lead_profile', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [LEAD_ROW]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', [openCycle({ owner_user_id: IDS.userA })]),
    selectStep('profiles', { id: IDS.userA, full_name: 'Vendedor Um', email: 'vendedor@example.com' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'OWNED_BY_ME')
  assert.equal(payload.lead.cpf_cnpj, '52998224725')
  assert.ok(payload.lead_profile)
  assert.equal(payload.flags.is_owned_by_me, true)
  assert.equal(payload.actions.can_apply_suggestion, true)
})

test('resolve-lead: lead de propriedade de OUTRO vendedor (member) mascara cpf_cnpj e lead_profile', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [LEAD_ROW]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', [openCycle({ owner_user_id: IDS.otherSeller })]),
    selectStep('profiles', { id: IDS.otherSeller, full_name: 'Vendedor Dois', email: 'v2@example.com' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'OWNED_BY_OTHER')
  assert.equal(payload.lead.cpf_cnpj, null, 'member não-dono não deveria ver cpf_cnpj')
  assert.equal(payload.lead_profile, null, 'member não-dono não deveria ver lead_profile')
  assert.equal(payload.actions.can_apply_suggestion, false)
})

test('resolve-lead: manager vê cpf_cnpj e lead_profile mesmo sem ser dono do ciclo', async () => {
  useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'manager' }),
    selectStep('leads', [LEAD_ROW]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', [openCycle({ owner_user_id: IDS.otherSeller })]),
    selectStep('profiles', { id: IDS.otherSeller, full_name: 'Vendedor Dois', email: 'v2@example.com' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'OWNED_BY_OTHER')
  assert.equal(payload.lead.cpf_cnpj, '52998224725')
  assert.ok(payload.lead_profile)
  assert.equal(payload.flags.is_admin_or_manager, true)
})

test('resolve-lead: lead no Pool (sem dono) responde IN_POOL', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [LEAD_ROW]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', [openCycle({ owner_user_id: null })]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'IN_POOL')
  assert.equal(payload.flags.is_pool, true)
})

test('resolve-lead: lead com apenas ciclo fechado responde CLOSED_CYCLE', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [LEAD_ROW]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', [openCycle({ status: 'ganho', owner_user_id: IDS.userA })]),
    selectStep('profiles', { id: IDS.userA, full_name: 'Vendedor Um', email: 'v1@example.com' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'CLOSED_CYCLE')
  assert.equal(payload.flags.is_closed, true)
})

test('resolve-lead: lead sem nenhum ciclo comercial responde LEAD_WITHOUT_CYCLE', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [LEAD_ROW]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', []),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'LEAD_WITHOUT_CYCLE')
})

test('resolve-lead: lead excluído (soft delete) responde SOFT_DELETED', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [{ ...LEAD_ROW, deleted_at: '2026-01-01T00:00:00.000Z' }]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'SOFT_DELETED')
})

test('resolve-lead: múltiplos leads ativos com o mesmo telefone responde MULTIPLE_MATCHES', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [LEAD_ROW, { ...LEAD_ROW, id: IDS.otherLead }]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'MULTIPLE_MATCHES')
})

test('resolve-lead: variação de telefone (com/sem nono dígito) ainda resolve o mesmo lead', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', [{ ...LEAD_ROW, phone: '1188887777' }]),
    selectStep('lead_profiles', LEAD_PROFILE_ROW),
    selectStep('sales_cycles', [openCycle({ owner_user_id: IDS.userA })]),
    selectStep('profiles', { id: IDS.userA, full_name: 'Vendedor Um', email: 'v1@example.com' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'OWNED_BY_ME')
})

// ---------------------------------------------------------------------
// Isolamento por company_id e falha de leitura
// ---------------------------------------------------------------------

test('resolve-lead: consulta usa o company_id do token, mesmo se o corpo tentar injetar outro', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', []),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: { phone: '11988887777', company_id: IDS.companyB } }),
  )

  assert.equal(response.status, 200)

  for (const call of fake.calls) {
    const companyFilter = call.filters.find((f) => f.column === 'company_id')
    if (companyFilter) {
      assert.equal(companyFilter.value, IDS.companyA)
    }
  }
})

test('resolve-lead: erro ao buscar leads por telefone é reportado como LEAD_SEARCH_ERROR', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', null, { message: 'timeout no banco' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { phone: '11988887777' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'LEAD_SEARCH_ERROR')
})
