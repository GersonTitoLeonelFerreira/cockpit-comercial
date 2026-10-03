// Rodada 10 (HML), item J: a rota de captura pede p_allow_closed_cycle = true
// só com a leitura completa ligada (COMPANION_FULL_READING_PANEL=on e
// VERCEL_ENV=preview) e só para ciclo encerrado. Enquanto a migração não
// for aplicada, a RPC recusa e a rota responde com um código próprio, sem
// aviso de falha no painel. Cliente do banco falso; dados sintéticos.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

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
  company: 'dddddddd-0000-4000-8000-000000000001',
  user: 'dddddddd-0000-4000-8000-0000000000a1',
  cycle: 'dddddddd-0000-4000-8000-0000000000d1',
  device: 'dddddddd-0000-4000-8000-0000000000e1',
}

const CONVERSATION_KEY = 'whatsapp:sintetico:contato-001'
const CLOSED_AT = '2026-10-01T12:00:00.000Z'
const MESSAGE_KEY = 'mensagem-sintetica-001'

function envelope() {
  return {
    contract_version: 'pt4-c-v4',
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    device_key: IDS.device,
    observed_at: '2026-10-02T12:01:00.000Z',
    messages: [{
      message_key: MESSAGE_KEY,
      direction: 'incoming',
      author_kind: 'customer',
      occurred_at: '2026-10-02T12:00:00.000Z',
      observed_at: '2026-10-02T12:01:00.000Z',
      base_version: null,
      content_type: 'text',
      text_content: 'Mensagem sintética depois do fechamento.',
      audio_transcription: null,
      is_deleted: false,
    }],
  }
}

const RPC_OK = {
  data: [{
    inserted_count: 1,
    unchanged_count: 0,
    conflict_count: 0,
    last_observed_message_id: '10',
    state_version: '1',
    message_results: [
      { message_key: MESSAGE_KEY, synced: true, canonical_version: '1', reason: null },
    ],
  }],
  error: null,
}

function fakeAdmin({ rpcResult, cycle, ledger = [] }) {
  const calls = { rpc: [], tables: [] }

  return {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args })
      return rpcResult
    },
    from(table) {
      calls.tables.push(table)

      const query = {
        filters: [],
        select() {
          return query
        },
        eq(column, value) {
          query.filters.push(['eq', column, value])
          return query
        },
        gt(column, value) {
          query.filters.push(['gt', column, value])
          return query
        },
        order() {
          return query
        },
        in() {
          return Promise.resolve({ data: [], error: null })
        },
        limit() {
          if (table !== 'conversation_messages') {
            return Promise.resolve({ data: [], error: null })
          }

          const after = query.filters.find(([kind]) => kind === 'gt')?.[2]

          return Promise.resolve({
            data: ledger.filter((row) => !after || Date.parse(row.occurred_at) > Date.parse(after)),
            error: null,
          })
        },
        maybeSingle() {
          return Promise.resolve({
            data: table === 'sales_cycles' ? cycle : null,
            error: null,
          })
        },
      }

      return query
    },
  }
}

function request(body) {
  const token = buildToken({ sub: IDS.user, companyId: IDS.company })

  return new Request('http://localhost/api/companion/capture/messages', {
    method: 'POST',
    headers: {
      ...bearerHeader(token),
      'content-type': 'application/json',
      origin: 'moz-extension://test',
    },
    body: JSON.stringify(body),
  })
}

async function post(admin, env) {
  const saved = {
    COMPANION_FULL_READING_PANEL: process.env.COMPANION_FULL_READING_PANEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  adminBox.admin = admin

  const logs = []
  const warn = console.warn
  console.warn = (...args) => {
    logs.push(args.map(String).join(' '))
  }

  try {
    const response = await POST(request(envelope()))
    return { response, payload: await response.json(), logs }
  } finally {
    console.warn = warn

    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

const HML = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }
const OFF = { COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: undefined }
const PRODUCTION = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' }

const WON = { status: 'ganho', won_at: CLOSED_AT, closed_at: CLOSED_AT, lost_at: null, canceled_at: null, stage_entered_at: CLOSED_AT }
const OPEN = { status: 'negociacao', won_at: null, closed_at: null, lost_at: null, canceled_at: null, stage_entered_at: CLOSED_AT }

const CLOSED_REFUSAL = {
  data: null,
  error: { code: 'P0001', message: 'Ciclo comercial encerrado não aceita captura de mensagens' },
}

const MISSING_FUNCTION = {
  data: null,
  error: {
    code: 'PGRST202',
    message: 'Could not find the function public.rpc_ingest_companion_messages with the given parameters in the schema cache',
  },
}

test('E3: flag desligada — chamada de hoje (sem o parâmetro, sem ler o ciclo) e a recusa de hoje', async () => {
  const admin = fakeAdmin({ rpcResult: CLOSED_REFUSAL, cycle: WON })
  const { response, payload } = await post(admin, OFF)

  assert.equal('p_allow_closed_cycle' in admin.calls.rpc[0].args, false)
  assert.equal(admin.calls.tables.includes('sales_cycles'), false)
  assert.equal(response.status, 409)
  assert.equal(payload.status, 'CAPTURE_INGESTION_REJECTED')
  assert.equal(payload.validation.code, 'CAPTURE_CYCLE_CLOSED')
  assert.equal('closed_cycle' in payload, false)
})

test('E3: produção (VERCEL_ENV=production) com a flag ligada continua igual a hoje', async () => {
  const admin = fakeAdmin({ rpcResult: RPC_OK, cycle: WON })
  const { response, payload } = await post(admin, PRODUCTION)

  assert.equal(response.status, 200)
  assert.equal('p_allow_closed_cycle' in admin.calls.rpc[0].args, false)
  assert.equal(admin.calls.tables.includes('sales_cycles'), false)
  assert.equal('closed_cycle' in payload, false)
})

test('E3: HML com ciclo aberto — mesma chamada de hoje, sem o parâmetro', async () => {
  const admin = fakeAdmin({ rpcResult: RPC_OK, cycle: OPEN })
  const { response, payload } = await post(admin, HML)

  assert.equal(response.status, 200)
  assert.equal('p_allow_closed_cycle' in admin.calls.rpc[0].args, false)
  assert.equal('closed_cycle' in payload, false)
})

test('E3: HML com ciclo encerrado — manda p_allow_closed_cycle = true e diz se o cliente escreveu depois do encerramento', async () => {
  const customerAfter = [
    { direction: 'incoming', author_kind: 'customer', occurred_at: '2026-10-02T12:00:00.000Z', content_type: 'text', text_content: 'Oi, tudo bem?' },
  ]

  const admin = fakeAdmin({ rpcResult: RPC_OK, cycle: WON, ledger: customerAfter })
  const { response, payload } = await post(admin, HML)

  assert.equal(response.status, 200)
  assert.equal(admin.calls.rpc[0].args.p_allow_closed_cycle, true)
  assert.deepEqual(payload.closed_cycle, { status: 'ganho', service: true })

  // Só o vendedor escreveu depois do encerramento: as abas não abrem.
  const sellerOnly = [
    { direction: 'outgoing', author_kind: 'human_agent', occurred_at: '2026-10-02T12:00:00.000Z', content_type: 'text', text_content: 'Obrigado pela compra!' },
    { direction: 'incoming', author_kind: 'customer', occurred_at: '2026-09-30T12:00:00.000Z', content_type: 'text', text_content: 'Antes do fechamento.' },
  ]

  const second = await post(fakeAdmin({ rpcResult: RPC_OK, cycle: WON, ledger: sellerOnly }), HML)

  assert.deepEqual(second.payload.closed_cycle, { status: 'ganho', service: false })
})

test('E4: defesa — banco sem a migração (função sem o parâmetro) — 409 com código próprio, sem conteúdo no log', async () => {
  const admin = fakeAdmin({ rpcResult: MISSING_FUNCTION, cycle: WON })
  const { response, payload, logs } = await post(admin, HML)

  assert.equal(response.status, 409)
  assert.equal(payload.status, 'CLOSED_CYCLE_CAPTURE_UNAVAILABLE')
  assert.equal(payload.validation.code, 'CLOSED_CYCLE_CAPTURE_UNAVAILABLE')
  assert.equal(payload.validation.message_index, null)

  const line = logs.find((entry) => entry.includes('capture_rejected'))

  assert.match(line, /CLOSED_CYCLE_CAPTURE_UNAVAILABLE/)
  assert.match(line, /PGRST202/)
  assert.doesNotMatch(line, /sintética|fechamento/)
})

test('E4: a RPC ainda recusa o ciclo encerrado — mesmo código próprio', async () => {
  const admin = fakeAdmin({ rpcResult: CLOSED_REFUSAL, cycle: { ...WON, status: 'perdido', lost_at: CLOSED_AT } })
  const { response, payload } = await post(admin, HML)

  assert.equal(admin.calls.rpc[0].args.p_allow_closed_cycle, true)
  assert.equal(response.status, 409)
  assert.equal(payload.status, 'CLOSED_CYCLE_CAPTURE_UNAVAILABLE')
})
