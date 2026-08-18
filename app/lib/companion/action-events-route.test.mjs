import assert from 'node:assert/strict'
import test from 'node:test'

import { createActionEventsRouteHandlers } from './action-events-route-handler.ts'

const IDS = {
  company: '10000000-0000-4000-8000-000000000001',
  cycle: '20000000-0000-4000-8000-000000000001',
  lead: '30000000-0000-4000-8000-000000000001',
  user: '40000000-0000-4000-8000-000000000001',
  otherUser: '40000000-0000-4000-8000-000000000002',
  coachingNote: '50000000-0000-4000-8000-000000000001',
  event: '60000000-0000-4000-8000-000000000001',
}

const DEFAULT_TOKEN = {
  sub: IDS.user,
  company_id: IDS.company,
  role: 'member',
}

function validBody(overrides = {}) {
  return {
    cycle_id: IDS.cycle,
    action_type: 'suggestion_shown',
    idempotency_key: 'evt-route-001',
    coaching_note_id: IDS.coachingNote,
    conversation_key: 'Cliente Exemplo::5511999990001',
    metadata: { channel: 'whatsapp' },
    ...overrides,
  }
}

function createFakeAdmin({
  membership = {
    company_id: IDS.company,
    user_id: IDS.user,
    role: 'member',
    is_active: true,
  },
  membershipError = null,
  cycle = {
    id: IDS.cycle,
    company_id: IDS.company,
    owner_user_id: IDS.user,
  },
  cycleError = null,
  rpcData = [
    {
      event_id: IDS.event,
      occurred_at: '2026-08-18T04:30:00.000Z',
      already_registered: false,
    },
  ],
  rpcError = null,
} = {}) {
  const rpcCalls = []
  const queryCalls = []

  const admin = {
    from(table) {
      const filters = []
      const call = { table, filters }
      queryCalls.push(call)

      const builder = {
        select() {
          return builder
        },
        eq(column, value) {
          filters.push([column, value])
          return builder
        },
        async maybeSingle() {
          if (table === 'company_memberships') {
            return { data: membership, error: membershipError }
          }

          if (table === 'sales_cycles') {
            return { data: cycle, error: cycleError }
          }

          throw new Error(`Tabela não prevista no fake: ${table}`)
        },
      }

      return builder
    },
    async rpc(functionName, args) {
      rpcCalls.push({ functionName, args })
      return { data: rpcData, error: rpcError }
    },
  }

  return { admin, rpcCalls, queryCalls }
}

function createHandlers({ token = DEFAULT_TOKEN, adminConfig } = {}) {
  const fake = createFakeAdmin(adminConfig)
  const handlers = createActionEventsRouteHandlers({
    verifyRequestToken: () => token,
    getAdminClient: () => fake.admin,
  })

  return { ...fake, ...handlers }
}

function postRequest(body) {
  return new Request('http://localhost/api/companion/actions/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readJson(response) {
  return response.json()
}

test('POST rejeita token inválido', async () => {
  const { POST } = createHandlers({ token: null })
  const response = await POST(postRequest(validBody()))

  assert.equal(response.status, 401)
  assert.equal((await readJson(response)).status, 'INVALID_COMPANION_TOKEN')
})

test('POST rejeita payload inválido antes de acessar o banco', async () => {
  const { POST, queryCalls } = createHandlers()
  const response = await POST(postRequest({ action_type: 'suggestion_shown' }))

  assert.equal(response.status, 400)
  assert.equal((await readJson(response)).status, 'INVALID_ACTION_EVENT_PAYLOAD')
  assert.equal(queryCalls.length, 0)
})

test('POST rejeita membership ausente', async () => {
  const { POST } = createHandlers({
    adminConfig: { membership: null },
  })
  const response = await POST(postRequest(validBody()))

  assert.equal(response.status, 403)
  assert.equal((await readJson(response)).status, 'NO_ACTIVE_MEMBERSHIP')
})

test('POST rejeita ciclo inexistente na empresa', async () => {
  const { POST } = createHandlers({
    adminConfig: { cycle: null },
  })
  const response = await POST(postRequest(validBody()))

  assert.equal(response.status, 404)
  assert.equal((await readJson(response)).status, 'CYCLE_NOT_FOUND')
})

test('POST bloqueia member em ciclo fora da carteira', async () => {
  const { POST, rpcCalls } = createHandlers({
    adminConfig: {
      cycle: {
        id: IDS.cycle,
        company_id: IDS.company,
        owner_user_id: IDS.otherUser,
      },
    },
  })
  const response = await POST(postRequest(validBody()))

  assert.equal(response.status, 403)
  assert.equal((await readJson(response)).status, 'CYCLE_NOT_OWNED')
  assert.equal(rpcCalls.length, 0)
})

test('POST registra evento usando company e seller do token', async () => {
  const { POST, rpcCalls } = createHandlers()
  const response = await POST(postRequest(validBody()))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'ACTION_EVENT_REGISTERED')
  assert.equal(payload.data.already_registered, false)
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].functionName, 'rpc_record_companion_action_event')
  assert.equal(rpcCalls[0].args.p_company_id, IDS.company)
  assert.equal(rpcCalls[0].args.p_seller_user_id, IDS.user)
})

test('POST preserva resposta de retry idempotente', async () => {
  const { POST } = createHandlers({
    adminConfig: {
      rpcData: [
        {
          event_id: IDS.event,
          occurred_at: '2026-08-18T04:30:00.000Z',
          already_registered: true,
        },
      ],
    },
  })
  const response = await POST(postRequest(validBody()))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.already_registered, true)
})

test('POST usa role atual da membership e ignora privilégio antigo do token', async () => {
  const { POST, rpcCalls } = createHandlers({
    token: { ...DEFAULT_TOKEN, role: 'admin' },
    adminConfig: {
      membership: {
        company_id: IDS.company,
        user_id: IDS.user,
        role: 'member',
        is_active: true,
      },
      cycle: {
        id: IDS.cycle,
        company_id: IDS.company,
        owner_user_id: IDS.otherUser,
      },
    },
  })
  const response = await POST(postRequest(validBody()))

  assert.equal(response.status, 403)
  assert.equal((await readJson(response)).status, 'CYCLE_NOT_OWNED')
  assert.equal(rpcCalls.length, 0)
})

test('POST reconhece manager pela membership atual mesmo com token antigo de member', async () => {
  const { POST, rpcCalls } = createHandlers({
    token: { ...DEFAULT_TOKEN, role: 'member' },
    adminConfig: {
      membership: {
        company_id: IDS.company,
        user_id: IDS.user,
        role: 'manager',
        is_active: true,
      },
      cycle: {
        id: IDS.cycle,
        company_id: IDS.company,
        owner_user_id: IDS.otherUser,
      },
    },
  })
  const response = await POST(postRequest(validBody()))

  assert.equal(response.status, 200)
  assert.equal(rpcCalls.length, 1)
})

test('GET rejeita token inválido', async () => {
  const { GET } = createHandlers({ token: null })
  const response = await GET(
    new Request('http://localhost/api/companion/actions/events'),
  )

  assert.equal(response.status, 401)
  assert.equal((await readJson(response)).status, 'INVALID_COMPANION_TOKEN')
})

test('GET rejeita action_type inválido', async () => {
  const { GET, rpcCalls } = createHandlers()
  const response = await GET(
    new Request(
      'http://localhost/api/companion/actions/events?action_type=not_real',
    ),
  )

  assert.equal(response.status, 400)
  assert.equal((await readJson(response)).status, 'INVALID_ACTION_TYPE')
  assert.equal(rpcCalls.length, 0)
})

test('GET rejeita lead_id malformado', async () => {
  const { GET, rpcCalls } = createHandlers()
  const response = await GET(
    new Request(
      'http://localhost/api/companion/actions/events?lead_id=not-a-uuid',
    ),
  )

  assert.equal(response.status, 400)
  const payload = await readJson(response)
  assert.equal(payload.status, 'INVALID_ACTION_EVENT_QUERY')
  assert.equal(payload.validation.path, 'lead_id')
  assert.equal(rpcCalls.length, 0)
})

test('GET encaminha filtros de cycle, lead, ação, período e limite', async () => {
  const { GET, rpcCalls } = createHandlers({
    adminConfig: {
      membership: {
        company_id: IDS.company,
        user_id: IDS.user,
        role: 'manager',
        is_active: true,
      },
      rpcData: [{ id: IDS.event }],
    },
  })
  const url = new URL('http://localhost/api/companion/actions/events')
  url.searchParams.set('cycle_id', IDS.cycle)
  url.searchParams.set('lead_id', IDS.lead)
  url.searchParams.set('action_type', 'suggestion_sent')
  url.searchParams.set('since', '2026-08-01T00:00:00.000Z')
  url.searchParams.set('until', '2026-08-31T23:59:59.999Z')
  url.searchParams.set('limit', '75')

  const response = await GET(new Request(url))

  assert.equal(response.status, 200)
  assert.equal(rpcCalls.length, 1)
  assert.deepEqual(rpcCalls[0], {
    functionName: 'rpc_list_companion_action_events',
    args: {
      p_company_id: IDS.company,
      p_requesting_user_id: IDS.user,
      p_is_admin_or_manager: true,
      p_cycle_id: IDS.cycle,
      p_lead_id: IDS.lead,
      p_action_type: 'suggestion_sent',
      p_since: '2026-08-01T00:00:00.000Z',
      p_until: '2026-08-31T23:59:59.999Z',
      p_limit: 75,
    },
  })
})

test('GET usa role atual da membership para limitar member', async () => {
  const { GET, rpcCalls } = createHandlers({
    token: { ...DEFAULT_TOKEN, role: 'admin' },
    adminConfig: {
      membership: {
        company_id: IDS.company,
        user_id: IDS.user,
        role: 'member',
        is_active: true,
      },
      rpcData: [],
    },
  })
  const response = await GET(
    new Request('http://localhost/api/companion/actions/events'),
  )

  assert.equal(response.status, 200)
  assert.equal(rpcCalls[0].args.p_is_admin_or_manager, false)
  assert.equal(rpcCalls[0].args.p_requesting_user_id, IDS.user)
})

test('GET usa role atual da membership para liberar manager', async () => {
  const { GET, rpcCalls } = createHandlers({
    token: { ...DEFAULT_TOKEN, role: 'member' },
    adminConfig: {
      membership: {
        company_id: IDS.company,
        user_id: IDS.user,
        role: 'manager',
        is_active: true,
      },
      rpcData: [],
    },
  })
  const response = await GET(
    new Request('http://localhost/api/companion/actions/events'),
  )

  assert.equal(response.status, 200)
  assert.equal(rpcCalls[0].args.p_is_admin_or_manager, true)
})
