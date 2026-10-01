// Rodada 5 (Parte A): recusas da RPC de captura viram códigos próprios e
// aparecem no log sem conteúdo. Mesma infraestrutura das outras rotas do
// Companion (mock.module de @supabase/supabase-js + token real assinado).
// Nada aqui toca o banco: o cliente é falso. Textos e telefones sintéticos.

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
  company: 'cccccccc-0000-4000-8000-000000000001',
  user: 'cccccccc-0000-4000-8000-0000000000a1',
  cycle: 'cccccccc-0000-4000-8000-0000000000d1',
  device: 'cccccccc-0000-4000-8000-0000000000e1',
}

// Chave no formato do WhatsApp: carrega o telefone. Nunca pode ir crua
// para o log.
const PHONE = '5511987654321'
const SECRET_TEXT = 'Texto sigiloso do cliente sobre o pagamento'
const CONVERSATION_KEY = `Cliente Teste::${PHONE}@c.us`

function messageKey(suffix) {
  return `false_${PHONE}@c.us_${suffix}`
}

function captureMessage(overrides = {}) {
  return {
    message_key: messageKey('AAA1'),
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: '2026-10-01T12:00:00.000Z',
    observed_at: '2026-10-01T12:01:00.000Z',
    base_version: null,
    content_type: 'text',
    text_content: SECRET_TEXT,
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  }
}

function envelope(messages) {
  return {
    contract_version: 'pt4-c-v4',
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    device_key: IDS.device,
    observed_at: '2026-10-01T12:01:00.000Z',
    messages,
  }
}

function fakeAdmin({ rpcResult, knownMessageKeys = [] }) {
  const calls = { rpc: [], selects: [] }

  return {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args })
      return rpcResult
    },
    from(table) {
      const query = {
        table,
        filters: [],
        select(columns) {
          query.columns = columns
          return query
        },
        eq(column, value) {
          query.filters.push(['eq', column, value])
          return query
        },
        in(column, values) {
          query.filters.push(['in', column, values])
          calls.selects.push(query)
          return Promise.resolve({
            data: values
              .filter((key) => knownMessageKeys.includes(key))
              .map((key) => ({ message_key: key })),
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

async function postCapturingLogs(body, admin) {
  adminBox.admin = admin
  const logs = []
  const warn = console.warn
  console.warn = (...args) => {
    logs.push(args.map(String).join(' '))
  }

  try {
    const response = await POST(request(body))
    return { response, payload: await response.json(), logs }
  } finally {
    console.warn = warn
  }
}

function assertSafeLog(logs) {
  assert.ok(logs.length >= 1, 'a recusa precisa aparecer no log')

  for (const line of logs) {
    assert.match(line, /YOLEN_CAPTURE_INGESTION/)
    assert.doesNotMatch(line, new RegExp(PHONE))
    assert.doesNotMatch(line, /sigiloso|pagamento/)
    assert.doesNotMatch(line, /Cliente Teste/)
  }
}

function readLog(logs) {
  const line = logs.find((entry) => entry.includes('capture_rejected'))
  return JSON.parse(line.slice(line.indexOf('{')))
}

const RPC_VALIDATIONS = [
  {
    code: 'OBSERVED_AT_INVALID',
    message: 'observed_at contém uma data inválida',
  },
  {
    code: 'OBSERVED_AT_IN_FUTURE',
    message: 'observed_at não pode estar mais de cinco minutos no futuro',
  },
  {
    code: 'BASE_VERSION_WITHOUT_CANONICAL_STATE',
    message: 'base_version não pode ser informada quando a mensagem ainda não possui estado canônico',
  },
]

for (const validation of RPC_VALIDATIONS) {
  test(`RPC recusa "${validation.message}" → 400 ${validation.code}, no log sem conteúdo`, async () => {
    const admin = fakeAdmin({
      rpcResult: { data: null, error: { code: 'P0001', message: validation.message } },
      knownMessageKeys: [messageKey('AAA1')],
    })

    const { response, payload, logs } = await postCapturingLogs(
      envelope([
        captureMessage(),
        captureMessage({
          message_key: messageKey('BBB2'),
          observed_at: '2026-10-01T12:02:00.000Z',
          base_version: '3',
        }),
      ]),
      admin,
    )

    assert.equal(response.status, 400)
    assert.equal(payload.ok, false)
    assert.equal(payload.status, 'CAPTURE_INGESTION_REJECTED')
    assert.equal(payload.validation.code, validation.code)

    assertSafeLog(logs)
    const log = readLog(logs)
    assert.equal(log.source, 'rpc')
    assert.equal(log.code, validation.code)
    assert.equal(log.http_status, 400)
    assert.equal(log.pg_code, 'P0001')
    assert.equal(log.validation, validation.message)
    assert.equal(log.cycle_id, IDS.cycle)
    assert.equal(log.batch_size, 2)
  })
}

test('observed_at no futuro aponta a mensagem (índice e chave na resposta, impressão da chave no log)', async () => {
  const admin = fakeAdmin({
    rpcResult: { data: null, error: { code: 'P0001', message: RPC_VALIDATIONS[1].message } },
  })

  const { payload, logs } = await postCapturingLogs(
    envelope([
      captureMessage(),
      captureMessage({ message_key: messageKey('BBB2'), observed_at: '2026-10-01T12:03:00.000Z' }),
    ]),
    admin,
  )

  assert.equal(payload.validation.message_index, 1)
  assert.equal(payload.validation.message_key, messageKey('BBB2'))

  const log = readLog(logs)
  assert.equal(log.message_index, 1)
  assert.match(log.message_ref, /^[0-9a-f]{12}$/)
})

test('base_version sem estado canônico: a rota só LÊ o ledger e devolve as chaves desconhecidas', async () => {
  const admin = fakeAdmin({
    rpcResult: { data: null, error: { code: 'P0001', message: RPC_VALIDATIONS[2].message } },
    knownMessageKeys: [messageKey('AAA1')],
  })

  const { payload, logs } = await postCapturingLogs(
    envelope([
      captureMessage({ base_version: '2' }),
      captureMessage({ message_key: messageKey('BBB2'), base_version: '3' }),
      captureMessage({ message_key: messageKey('CCC3') }),
    ]),
    admin,
  )

  assert.deepEqual(payload.validation.message_keys, [messageKey('BBB2')])
  assert.equal(admin.calls.selects.length, 1)
  assert.equal(admin.calls.selects[0].table, 'conversation_messages')
  assert.deepEqual(admin.calls.selects[0].filters, [
    ['eq', 'company_id', IDS.company],
    ['eq', 'conversation_key', CONVERSATION_KEY],
    ['in', 'message_key', [messageKey('AAA1'), messageKey('BBB2')]],
  ])

  const log = readLog(logs)
  assert.equal(log.message_refs_without_state.length, 1)
  assert.match(log.message_refs_without_state[0], /^[0-9a-f]{12}$/)
})

test('PostgREST recusa o corpo (PGRST102) → 500 com código próprio no log', async () => {
  const admin = fakeAdmin({
    rpcResult: { data: null, error: { code: 'PGRST102', message: 'Empty or invalid json' } },
  })

  const { response, payload, logs } = await postCapturingLogs(envelope([captureMessage()]), admin)

  assert.equal(response.status, 500)
  assert.equal(payload.validation.code, 'CAPTURE_RPC_BODY_REJECTED')
  assertSafeLog(logs)
  assert.equal(readLog(logs).pg_code, 'PGRST102')
})

test('metade de emoji no texto chega à RPC como U+FFFD (o corpo nunca leva surrogate solto)', async () => {
  const admin = fakeAdmin({
    rpcResult: {
      data: [{
        inserted_count: 1,
        unchanged_count: 0,
        conflict_count: 0,
        last_observed_message_id: '10',
        state_version: '1',
        message_results: [
          { message_key: messageKey('AAA1'), synced: true, canonical_version: '1', reason: null },
        ],
      }],
      error: null,
    },
  })

  const brokenEmoji = 'Fechado! \uD83D'

  const { response } = await postCapturingLogs(
    envelope([captureMessage({ text_content: brokenEmoji })]),
    admin,
  )

  assert.equal(response.status, 200)
  const sent = admin.calls.rpc[0].args.p_messages[0].text_content
  assert.equal(sent, 'Fechado! �')
  assert.equal(sent.isWellFormed(), true)
  assert.doesNotMatch(JSON.stringify(admin.calls.rpc[0].args), /\\ud83d/i)
})

test('message_key com metade de emoji é recusada no contrato com índice da mensagem, sem chave crua no log', async () => {
  const admin = fakeAdmin({ rpcResult: { data: null, error: null } })

  const { response, payload, logs } = await postCapturingLogs(
    envelope([
      captureMessage(),
      captureMessage({ message_key: `${messageKey('BBB2')}\uD83D` }),
    ]),
    admin,
  )

  assert.equal(response.status, 400)
  assert.equal(payload.validation.code, 'MALFORMED_TEXT')
  assert.equal(payload.validation.path, 'messages[1].message_key')
  assert.equal(payload.validation.message_index, 1)
  assert.equal(admin.calls.rpc.length, 0)

  assertSafeLog(logs)
  const log = readLog(logs)
  assert.equal(log.source, 'contract')
  assert.equal(log.message_index, 1)
})
