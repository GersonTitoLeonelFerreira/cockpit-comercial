// Testes de E2 para app/api/companion/link-lead/route.ts (first-link
// produtivo). Mesma infraestrutura de resolve-lead/route.test.mjs.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { createStepAdmin, selectStep } from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
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
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  companyB: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  otherSeller: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  leadOwnedByMe: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  leadOwnedByOther: 'aaaaaaaa-0000-4000-8000-0000000000c2',
  leadPool: 'aaaaaaaa-0000-4000-8000-0000000000c3',
  leadDeleted: 'aaaaaaaa-0000-4000-8000-0000000000c4',
  leadOtherCompany: 'bbbbbbbb-0000-4000-8000-0000000000c5',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

const VALID_KEY = `manychat:contact:v1:sha256:${'a'.repeat(64)}`

function leadRow(id, overrides = {}) {
  return {
    id,
    company_id: IDS.companyA,
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

function linkedRpcRow(overrides = {}) {
  return {
    status: 'LINKED',
    id: 'identity-1',
    company_id: IDS.companyA,
    lead_id: IDS.leadOwnedByMe,
    platform: 'manychat',
    external_identity_key: VALID_KEY,
    identity_source: 'manychat_safe_identity_bridge',
    channel: null,
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-19T00:00:00.000Z',
    last_seen_at: '2026-09-19T00:00:00.000Z',
    ...overrides,
  }
}

function useAdmin(steps, options) {
  const fake = createStepAdmin(steps, options)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/link-lead', {
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

function validBody(overrides = {}) {
  return {
    platform: 'manychat',
    platform_contact_key: VALID_KEY,
    lead_id: IDS.leadOwnedByMe,
    confirmed: true,
    ...overrides,
  }
}

test('link-lead: sem token é rejeitado antes de qualquer acesso ao banco', async () => {
  const fake = useAdmin([])

  const response = await POST(postRequest({ token: null, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(payload.status, 'INVALID_COMPANION_TOKEN')
  assert.equal(fake.calls.length, 0)
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: membership inativa é bloqueada', async () => {
  useAdmin([selectStep('company_memberships', null)])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.status, 'NO_COMPANY_PERMISSION')
})

test('link-lead: confirmed ausente exige CONFIRMATION_REQUIRED sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ confirmed: undefined }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'CONFIRMATION_REQUIRED')
  assert.equal(fake.calls.length, 0)
})

test('link-lead: confirmed=false exige CONFIRMATION_REQUIRED', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ confirmed: false }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'CONFIRMATION_REQUIRED')
  assert.equal(fake.calls.length, 0)
})

test('link-lead: platform diferente de manychat é recusado', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ platform: 'instagram' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'UNSUPPORTED_PLATFORM')
  assert.equal(fake.calls.length, 0)
})

test('link-lead: platform_contact_key fora do padrão seguro é recusada', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: validBody({ platform_contact_key: 'raw-subscriber-id-123' }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'INVALID_EXTERNAL_IDENTITY_KEY')
  assert.equal(fake.calls.length, 0)
})

test('link-lead: channel diferente de null/"whatsapp" é recusado', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ channel: 'instagram_dm' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'INVALID_CHANNEL')
  assert.equal(fake.calls.length, 0)
})

test('link-lead: lead de outra empresa é recusado (LEAD_NOT_FOUND, nunca chega à RPC)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: validBody({ lead_id: IDS.leadOtherCompany }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 404)
  assert.equal(payload.status, 'LEAD_NOT_FOUND')
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: lead soft-deleted é recusado, nunca chega à RPC', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', leadRow(IDS.leadDeleted, { deleted_at: '2026-01-01T00:00:00.000Z' })),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ lead_id: IDS.leadDeleted }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.status, 'SOFT_DELETED')
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: member OWNED_BY_ME chega à RPC e recebe LINKED (200)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', ACTIVE_MEMBERSHIP),
      selectStep('leads', leadRow(IDS.leadOwnedByMe)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow()] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.status, 'LINKED')
  assert.equal(payload.lead_id, IDS.leadOwnedByMe)

  assert.equal(fake.rpcCalls.length, 1)
  assert.equal(fake.rpcCalls[0].name, 'rpc_link_companion_external_identity_first')
  assert.equal(fake.rpcCalls[0].params.p_company_id, IDS.companyA)
  assert.equal(fake.rpcCalls[0].params.p_lead_id, IDS.leadOwnedByMe)
  assert.equal(fake.rpcCalls[0].params.p_actor_user_id, IDS.userA)
  assert.equal(fake.rpcCalls[0].params.p_platform, 'manychat')
  assert.equal(fake.rpcCalls[0].params.p_external_identity_key, VALID_KEY)
  assert.equal(fake.rpcCalls[0].params.p_identity_source, 'manychat_safe_identity_bridge')
  assert.equal(fake.rpcCalls[0].params.p_channel, null)
})

test('link-lead: member OWNED_BY_OTHER é bloqueado antes da RPC (LEAD_ACCESS_DENIED)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', leadRow(IDS.leadOwnedByOther)),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(
    postRequest({ token, body: validBody({ lead_id: IDS.leadOwnedByOther }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.status, 'LEAD_ACCESS_DENIED')
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: member não pode vincular lead do pool', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('leads', leadRow(IDS.leadPool)),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadPool, ownerUserId: null })]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: validBody({ lead_id: IDS.leadPool }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.status, 'LEAD_ACCESS_DENIED')
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: admin pode vincular lead de outro vendedor (company-wide, sem precisar ser owner)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'admin' }),
      selectStep('leads', leadRow(IDS.leadOwnedByOther)),
      selectStep('sales_cycles', [
        cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
      ]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow({ lead_id: IDS.leadOwnedByOther })] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(
    postRequest({ token, body: validBody({ lead_id: IDS.leadOwnedByOther }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'LINKED')
  assert.equal(fake.rpcCalls.length, 1)
})

test('link-lead: manager pode vincular lead do pool (company-wide)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'manager' }),
      selectStep('leads', leadRow(IDS.leadPool)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadPool, ownerUserId: null })]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow({ lead_id: IDS.leadPool })] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: validBody({ lead_id: IDS.leadPool }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'LINKED')
  assert.equal(fake.rpcCalls.length, 1)
})

test('link-lead: IDEMPOTENT_ALREADY_LINKED_TO_TARGET responde 200', async () => {
  useAdmin(
    [
      selectStep('company_memberships', ACTIVE_MEMBERSHIP),
      selectStep('leads', leadRow(IDS.leadOwnedByMe)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    ],
    {
      rpcResponder: () => ({
        data: [linkedRpcRow({ status: 'IDEMPOTENT_ALREADY_LINKED_TO_TARGET' })],
      }),
    },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.status, 'IDEMPOTENT_ALREADY_LINKED_TO_TARGET')
})

test('link-lead: ALREADY_LINKED_CONFLICT responde 409 e nunca revela o outro lead', async () => {
  useAdmin(
    [
      selectStep('company_memberships', ACTIVE_MEMBERSHIP),
      selectStep('leads', leadRow(IDS.leadOwnedByMe)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    ],
    {
      rpcResponder: () => ({
        data: [
          {
            status: 'ALREADY_LINKED_CONFLICT',
            id: null,
            company_id: null,
            lead_id: null,
            platform: null,
            external_identity_key: null,
            identity_source: null,
            channel: null,
            created_at: null,
            updated_at: null,
            last_seen_at: null,
          },
        ],
      }),
    },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.ok, false)
  assert.equal(payload.status, 'ALREADY_LINKED_CONFLICT')
  assert.equal(payload.lead_id, undefined)
  assert.equal(JSON.stringify(payload).includes(IDS.leadOwnedByOther), false)
})

test('link-lead: nunca chama a RPC antiga de relink (rpc_link_companion_external_identity)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', ACTIVE_MEMBERSHIP),
      selectStep('leads', leadRow(IDS.leadOwnedByMe)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow()] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  await POST(postRequest({ token, body: validBody() }))

  assert.ok(fake.rpcCalls.every((call) => call.name !== 'rpc_link_companion_external_identity'))
})

test('link-lead: nenhuma ação além de membership/leads/sales_cycles/rpc acontece (sem capture/análise)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', ACTIVE_MEMBERSHIP),
      selectStep('leads', leadRow(IDS.leadOwnedByMe)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadOwnedByMe, ownerUserId: IDS.userA })]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow()] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  await POST(postRequest({ token, body: validBody() }))

  const tablesTouched = fake.calls.map((call) => call.table)
  assert.deepEqual(tablesTouched, ['company_memberships', 'leads', 'sales_cycles'])
})

// --- Correção 1 (STEP 2A.2): role da membership ATUAL decide, nunca a do
// token — o token dura até 6h e pode ficar desatualizado. ---

test('link-lead: token diz admin, membership atual diz member -> comportamento de MEMBER (bloqueado fora da carteira)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'member' }),
    selectStep('leads', leadRow(IDS.leadOwnedByOther)),
    selectStep('sales_cycles', [
      cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
    ]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(
    postRequest({ token, body: validBody({ lead_id: IDS.leadOwnedByOther }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.status, 'LEAD_ACCESS_DENIED')
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: token diz manager, membership atual diz member -> comportamento de MEMBER (bloqueado no pool)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'member' }),
    selectStep('leads', leadRow(IDS.leadPool)),
    selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadPool, ownerUserId: null })]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'manager' })

  const response = await POST(postRequest({ token, body: validBody({ lead_id: IDS.leadPool }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.status, 'LEAD_ACCESS_DENIED')
  assert.equal(fake.rpcCalls.length, 0)
})

test('link-lead: token diz member, membership atual diz admin -> comportamento de ADMIN (chega à RPC)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'admin' }),
      selectStep('leads', leadRow(IDS.leadOwnedByOther)),
      selectStep('sales_cycles', [
        cycleRow({ leadId: IDS.leadOwnedByOther, ownerUserId: IDS.otherSeller }),
      ]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow({ lead_id: IDS.leadOwnedByOther })] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(
    postRequest({ token, body: validBody({ lead_id: IDS.leadOwnedByOther }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'LINKED')
  assert.equal(fake.rpcCalls.length, 1)
})

test('link-lead: token diz member, membership atual diz manager -> comportamento de MANAGER (chega à RPC no pool)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'manager' }),
      selectStep('leads', leadRow(IDS.leadPool)),
      selectStep('sales_cycles', [cycleRow({ leadId: IDS.leadPool, ownerUserId: null })]),
    ],
    { rpcResponder: () => ({ data: [linkedRpcRow({ lead_id: IDS.leadPool })] }) },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token, body: validBody({ lead_id: IDS.leadPool }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'LINKED')
  assert.equal(fake.rpcCalls.length, 1)
})
