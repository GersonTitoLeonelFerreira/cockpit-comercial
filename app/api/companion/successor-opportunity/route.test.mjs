// Rodada 5 (Parte B): POST /api/companion/successor-opportunity.
// Cliente falso (nada toca o banco), token real assinado, ids sintéticos.
// Foco: confirmação obrigatória, verificações refeitas antes da RPC, ator
// e empresa sempre do token, resposta sem lead_id, migração não aplicada.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { bearerHeader, buildToken, installFakeSupabaseEnv } from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const adminBox = { admin: null }

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

const { POST } = await import('./route.ts')

const IDS = {
  company: '40000000-0000-4000-8000-000000000001',
  otherCompany: '40000000-0000-4000-8000-000000000002',
  me: '40000000-0000-4000-8000-0000000000a1',
  other: '40000000-0000-4000-8000-0000000000a2',
  lead: '40000000-0000-4000-8000-0000000000b1',
  closed: '40000000-0000-4000-8000-0000000000c1',
  created: '40000000-0000-4000-8000-0000000000c9',
}

function fakeAdmin({
  role = 'member',
  profileActive = true,
  source = { status: 'ganho', owner_user_id: IDS.me, won_owner_user_id: IDS.me, lost_owner_user_id: null },
  leadDeleted = false,
  cycles = null,
  rpcResult = { data: { success: true, cycle_id: IDS.created, lead_id: IDS.lead }, error: null },
} = {}) {
  const calls = { rpc: [], reads: [] }
  const sourceRow = source
    ? { id: IDS.closed, company_id: IDS.company, lead_id: IDS.lead, ...source }
    : null

  const tables = {
    company_memberships: role
      ? [{ company_id: IDS.company, user_id: IDS.me, role, is_active: true }]
      : [],
    profiles: [{ id: IDS.me, is_active_global: profileActive }],
    leads: [{ id: IDS.lead, company_id: IDS.company, deleted_at: leadDeleted ? '2026-09-30T00:00:00Z' : null }],
    sales_cycles: cycles ?? (sourceRow ? [sourceRow] : []),
  }

  function query(table) {
    const filters = []
    const run = () => {
      calls.reads.push({ table, filters: [...filters] })
      const rows = (tables[table] ?? []).filter((row) =>
        filters.every(([column, value]) => row[column] === value),
      )
      return rows
    }

    const builder = {
      select() {
        return builder
      },
      eq(column, value) {
        filters.push([column, value])
        return builder
      },
      maybeSingle() {
        return Promise.resolve({ data: run()[0] ?? null, error: null })
      },
      then(resolve, reject) {
        return Promise.resolve({ data: run(), error: null }).then(resolve, reject)
      },
    }

    return builder
  }

  return {
    calls,
    from: query,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args })
      return rpcResult
    },
  }
}

function request(body, { companyId = IDS.company } = {}) {
  const token = buildToken({ sub: IDS.me, companyId })

  return new Request('http://localhost/api/companion/successor-opportunity', {
    method: 'POST',
    headers: { ...bearerHeader(token), 'content-type': 'application/json', origin: 'moz-extension://test' },
    body: JSON.stringify(body),
  })
}

async function post(body, admin, options) {
  adminBox.admin = admin
  const response = await POST(request(body, options))
  return { response, payload: await response.json() }
}

const VALID = {
  cycle_id: IDS.closed,
  opportunity_type: 'recompra',
  confirmed_by_human: true,
}

test('sem confirmação humana explícita nada é criado', async () => {
  for (const confirmed of [undefined, false, 'true', 1]) {
    const admin = fakeAdmin()
    const { response, payload } = await post({ ...VALID, confirmed_by_human: confirmed }, admin)

    assert.equal(response.status, 400)
    assert.equal(payload.status, 'CONFIRMATION_REQUIRED')
    assert.equal(admin.calls.rpc.length, 0)
  }
})

test('tipo obrigatório e só os cinco da Yolen', async () => {
  for (const type of [undefined, '', 'pool', 'REATIVACAO']) {
    const admin = fakeAdmin()
    const { response, payload } = await post({ ...VALID, opportunity_type: type }, admin)

    assert.equal(response.status, 400)
    assert.equal(payload.code, 'invalid_opportunity_type')
    assert.equal(admin.calls.rpc.length, 0)
  }
})

test('cria: ator e empresa vêm do token; resposta só com o ciclo novo (sem lead_id)', async () => {
  const admin = fakeAdmin()
  const { response, payload } = await post(VALID, admin)

  assert.equal(response.status, 200)
  assert.deepEqual(payload, {
    ok: true,
    status: 'SUCCESSOR_CREATED',
    cycle: { id: IDS.created, status: 'novo' },
    opportunity_type: 'recompra',
  })
  assert.doesNotMatch(JSON.stringify(payload), new RegExp(IDS.lead))

  assert.equal(admin.calls.rpc.length, 1)
  assert.equal(admin.calls.rpc[0].name, 'rpc_create_successor_cycle_from_companion')
  assert.deepEqual(admin.calls.rpc[0].args, {
    p_company_id: IDS.company,
    p_actor_user_id: IDS.me,
    p_source_cycle_id: IDS.closed,
    p_opportunity_type: 'recompra',
    p_note: null,
  })
})

test('regras refeitas antes da RPC: Cancelado, ciclo de outro, lead excluído, oportunidade aberta, sem vínculo', async () => {
  const cases = [
    { admin: fakeAdmin({ source: { status: 'cancelado', owner_user_id: IDS.me, won_owner_user_id: null, lost_owner_user_id: null } }), status: 409, code: 'source_cycle_not_terminal' },
    { admin: fakeAdmin({ source: { status: 'ganho', owner_user_id: IDS.other, won_owner_user_id: IDS.other, lost_owner_user_id: null } }), status: 403, code: 'permission_denied' },
    { admin: fakeAdmin({ leadDeleted: true }), status: 409, code: 'lead_not_available' },
    {
      admin: fakeAdmin({
        cycles: [
          { id: IDS.closed, company_id: IDS.company, lead_id: IDS.lead, status: 'ganho', owner_user_id: IDS.me, won_owner_user_id: IDS.me, lost_owner_user_id: null },
          { id: IDS.created, company_id: IDS.company, lead_id: IDS.lead, status: 'contato', owner_user_id: IDS.other },
        ],
      }),
      status: 409,
      code: 'active_cycle_exists',
    },
    { admin: fakeAdmin({ role: null }), status: 403, code: 'membership_not_found' },
    { admin: fakeAdmin({ profileActive: false }), status: 403, code: 'membership_not_found' },
  ]

  for (const entry of cases) {
    const { response, payload } = await post(VALID, entry.admin)

    assert.equal(response.status, entry.status, entry.code)
    assert.equal(payload.code, entry.code)
    assert.equal(typeof payload.error, 'string')
    assert.equal(entry.admin.calls.rpc.length, 0, entry.code)
  }
})

test('admin/manager cria a partir de ciclo de outro vendedor, sempre para si (ator do token)', async () => {
  for (const role of ['admin', 'manager']) {
    const admin = fakeAdmin({ role, source: { status: 'perdido', owner_user_id: IDS.other, won_owner_user_id: null, lost_owner_user_id: IDS.other } })
    const { response } = await post(VALID, admin)

    assert.equal(response.status, 200, role)
    assert.equal(admin.calls.rpc[0].args.p_actor_user_id, IDS.me)
  }
})

test('ciclo de outra empresa não é encontrado (empresa sempre do token)', async () => {
  const admin = fakeAdmin()
  const { response, payload } = await post(VALID, admin, { companyId: IDS.otherCompany })

  assert.equal(response.status, 403)
  assert.equal(payload.code, 'membership_not_found')
  assert.equal(admin.calls.rpc.length, 0)
})

test('o banco recusa (corrida): active_cycle_exists vira 409 com mensagem clara', async () => {
  const admin = fakeAdmin({ rpcResult: { data: { success: false, error: 'active_cycle_exists', active_cycle_id: IDS.created }, error: null } })
  const { response, payload } = await post(VALID, admin)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'active_cycle_exists')
  assert.match(payload.error, /oportunidade aberta/)
  assert.doesNotMatch(JSON.stringify(payload), new RegExp(IDS.created))
})

test('migração não aplicada: 503 SUCCESSOR_RPC_UNAVAILABLE e nada criado', async () => {
  const admin = fakeAdmin({ rpcResult: { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } })
  const { response, payload } = await post(VALID, admin)

  assert.equal(response.status, 503)
  assert.equal(payload.status, 'SUCCESSOR_RPC_UNAVAILABLE')
})

test('sem token válido: 401', async () => {
  adminBox.admin = fakeAdmin()
  const response = await POST(
    new Request('http://localhost/api/companion/successor-opportunity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID),
    }),
  )

  assert.equal(response.status, 401)
})
