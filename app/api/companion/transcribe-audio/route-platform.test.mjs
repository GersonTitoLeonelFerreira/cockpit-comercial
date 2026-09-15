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
} from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()
process.env.OPENAI_API_KEY = 'e2-fake-openai-key-not-real'

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

const ACTIVE_CYCLE = {
  id: IDS.cycle,
  company_id: IDS.companyA,
  status: 'contato',
  owner_user_id: IDS.userA,
}

const FAKE_AUDIO_BASE64 = Buffer.concat([
  Buffer.from('ID3'),
  Buffer.alloc(200, 1),
]).toString('base64')

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

const originalFetch = globalThis.fetch

function useFetchQueue(responders) {
  const calls = []
  const remaining = [...responders]

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    const responder = remaining.shift()

    if (!responder) {
      throw new Error(`[fake-fetch] fila vazia — chamada inesperada para ${url}`)
    }

    return responder({ url, init })
  }

  return { calls, remaining }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonFetchResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function postRequest(body) {
  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })

  return new Request('http://localhost/api/companion/transcribe-audio', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearerHeader(token),
    },
    body: JSON.stringify(body),
  })
}

function baseBody(overrides = {}) {
  return {
    cycle_id: IDS.cycle,
    audio_base64: FAKE_AUDIO_BASE64,
    mime_type: 'audio/mpeg',
    audio_index: 0,
    audio_target_key: 'legacy-target-0',
    ...overrides,
  }
}

function successSteps() {
  return [
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ]
}

test('payload legado sem platform preserva semântica WhatsApp', async () => {
  const fake = useAdmin(successSteps())
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(200, { text: 'Texto legado.' }),
  ])

  const response = await POST(postRequest(baseBody()))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.event_type, 'whatsapp_audio_transcribed')
  assert.equal(payload.data.platform, 'whatsapp')
  assert.equal(payload.data.channel, 'whatsapp')

  const cacheLookup = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'select',
  )
  assert.equal(
    cacheLookup.filters.some(
      (filter) =>
        filter.column === 'event_type' &&
        filter.value === 'whatsapp_audio_transcribed',
    ),
    true,
  )
  assert.equal(
    cacheLookup.filters.some(
      (filter) => filter.column === 'metadata->>platform',
    ),
    false,
  )

  const insert = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'insert',
  )
  assert.equal(insert.payload.event_type, 'whatsapp_audio_transcribed')
  assert.equal(insert.payload.metadata.source, 'whatsapp_companion')
  assert.equal(insert.payload.metadata.platform, 'whatsapp')
  assert.equal(insert.payload.metadata.channel, 'whatsapp')

  const form = fetchQueue.calls[0].init.body
  assert.equal(
    form.get('prompt'),
    'Transcreva em português do Brasil. O áudio faz parte de uma conversa comercial no WhatsApp.',
  )
})

test('ManyChat persiste evento universal e cache escopado por plataforma', async () => {
  const fake = useAdmin(successSteps())
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(200, { text: 'Texto do ManyChat.' }),
  ])

  const response = await POST(
    postRequest(
      baseBody({
        platform: 'manychat',
        channel: 'whatsapp',
        audio_target_key: 'manychat:native-mid-123',
      }),
    ),
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.event_type, 'companion_audio_transcribed')
  assert.equal(payload.data.platform, 'manychat')
  assert.equal(payload.data.channel, 'whatsapp')

  const cacheLookup = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'select',
  )
  assert.equal(
    cacheLookup.filters.some(
      (filter) =>
        filter.column === 'event_type' &&
        filter.value === 'companion_audio_transcribed',
    ),
    true,
  )
  assert.equal(
    cacheLookup.filters.some(
      (filter) =>
        filter.column === 'metadata->>platform' &&
        filter.value === 'manychat',
    ),
    true,
  )

  const insert = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'insert',
  )
  assert.equal(insert.payload.event_type, 'companion_audio_transcribed')
  assert.equal(insert.payload.metadata.source, 'manychat_companion')
  assert.equal(insert.payload.metadata.platform, 'manychat')
  assert.equal(insert.payload.metadata.channel, 'whatsapp')
  assert.equal(insert.payload.metadata.audio_target_key, 'manychat:native-mid-123')

  const form = fetchQueue.calls[0].init.body
  assert.match(form.get('prompt'), /ManyChat/)
})

test('platform desconhecida falha antes de banco e OpenAI', async () => {
  const fake = useAdmin([])
  const fetchQueue = useFetchQueue([])

  const response = await POST(
    postRequest(
      baseBody({
        platform: 'outra-plataforma',
      }),
    ),
  )
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.match(payload.error, /platform\/channel/)
  assert.equal(fake.calls.length, 0)
  assert.equal(fetchQueue.calls.length, 0)
})

test('ManyChat exige audio_target_key namespaced', async () => {
  const fake = useAdmin([])
  const fetchQueue = useFetchQueue([])

  const response = await POST(
    postRequest(
      baseBody({
        platform: 'manychat',
        channel: 'whatsapp',
        audio_target_key: 'sem-namespace',
      }),
    ),
  )
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.match(payload.error, /namespace manychat:/)
  assert.equal(fake.calls.length, 0)
  assert.equal(fetchQueue.calls.length, 0)
})

test('cache ManyChat reaproveita somente evento da própria plataforma', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', {
      id: 'evt-manychat-cached',
      occurred_at: '2026-09-15T01:00:00.000Z',
      metadata: {
        platform: 'manychat',
        channel: 'whatsapp',
        transcription_text: 'Texto já transcrito.',
        audio_target_key: 'manychat:native-mid-123',
        audio_index: 0,
      },
    }),
  ])
  const fetchQueue = useFetchQueue([])

  const response = await POST(
    postRequest(
      baseBody({
        platform: 'manychat',
        channel: 'whatsapp',
        audio_target_key: 'manychat:native-mid-123',
      }),
    ),
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.already_transcribed, true)
  assert.equal(payload.data.event_type, 'companion_audio_transcribed')
  assert.equal(payload.data.platform, 'manychat')
  assert.equal(fetchQueue.calls.length, 0)

  const cacheLookup = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'select',
  )
  assert.equal(
    cacheLookup.filters.some(
      (filter) =>
        filter.column === 'metadata->>platform' &&
        filter.value === 'manychat',
    ),
    true,
  )
})
