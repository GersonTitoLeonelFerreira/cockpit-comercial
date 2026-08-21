// Testes de E2 (Trilha E) para app/api/companion/transcribe-audio/route.ts —
// prioridade 2 da E2: fallback gpt-4o-mini-transcribe -> whisper-1,
// totalmente mockado, SEM nenhum consumo real da API da OpenAI. A rota
// chama `fetch('https://api.openai.com/...')` diretamente (não usa SDK da
// OpenAI), então o mock aqui é só substituir `globalThis.fetch` por uma
// função determinística durante cada teste — nenhuma dependência nova,
// nenhuma chamada de rede real.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { createStepAdmin, insertStep, selectStep, updateStep } from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import { bearerHeader, buildToken, installFakeSupabaseEnv } from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

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

const ACTIVE_CYCLE = { id: IDS.cycle, company_id: IDS.companyA, status: 'contato', owner_user_id: IDS.userA }

// >=100 bytes, ID3 (mp3) para o detector de formato reconhecer algo válido.
const FAKE_AUDIO_BASE64 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200, 1)]).toString('base64')

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

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/transcribe-audio', {
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
    audio_base64: FAKE_AUDIO_BASE64,
    mime_type: 'audio/mpeg',
    audio_index: 0,
    ...overrides,
  }
}

async function readJson(response) {
  return response.json()
}

// ---------------------------------------------------------------------
// Autenticação / validação básica
// ---------------------------------------------------------------------

test('transcribe-audio: token ausente é rejeitado antes de qualquer chamada externa', async () => {
  const fake = useAdmin([])
  const fetchQueue = useFetchQueue([])

  const response = await POST(postRequest({ token: null, body: validBody() }))

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
  assert.equal(fetchQueue.calls.length, 0)
})

test('transcribe-audio: ciclo inexistente responde 404 sem chamar a OpenAI', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', null),
  ])
  const fetchQueue = useFetchQueue([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 404)
  assert.equal(fetchQueue.calls.length, 0)
})

// ---------------------------------------------------------------------
// Cache por fingerprint: áudio já transcrito não deve chamar a OpenAI de novo
// ---------------------------------------------------------------------

test('transcribe-audio: áudio já transcrito (mesmo fingerprint) reaproveita o cache e NÃO chama a OpenAI', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', {
      id: 'evt-cached',
      occurred_at: '2026-08-18T04:30:00.000Z',
      metadata: { transcription_text: 'Texto já transcrito antes.', audio_target_key: 'k0', audio_index: 0 },
    }),
    updateStep('cycle_events'),
  ])
  const fetchQueue = useFetchQueue([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ audio_target_key: 'k0' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.already_transcribed, true)
  assert.equal(payload.data.text, 'Texto já transcrito antes.')
  assert.equal(fetchQueue.calls.length, 0, 'reaproveitar cache não deveria custar nenhuma chamada à OpenAI')
})

// ---------------------------------------------------------------------
// Fallback gpt-4o-mini-transcribe -> whisper-1
// ---------------------------------------------------------------------

test('transcribe-audio: sucesso na primeira tentativa (gpt-4o-mini-transcribe) não tenta whisper-1', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(200, { text: 'Transcrição de sucesso.' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.text, 'Transcrição de sucesso.')
  assert.equal(payload.data.already_transcribed, false)
  assert.equal(fetchQueue.calls.length, 1, 'só deveria ter tentado o modelo primário')
})

test('transcribe-audio: falha "processing failed" no modelo primário aciona fallback para whisper-1 com sucesso', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(422, { error: { message: 'processing failed for this audio' } }),
    async () => jsonFetchResponse(200, { text: 'Transcrição via whisper-1.' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.text, 'Transcrição via whisper-1.')
  assert.equal(fetchQueue.calls.length, 2, 'deveria ter tentado o modelo primário e depois o fallback')
})

test('transcribe-audio: falha "unsupported" no modelo primário também aciona fallback', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(400, { error: { message: 'Unsupported file format' } }),
    async () => jsonFetchResponse(200, { text: 'Transcrição via whisper-1 (unsupported).' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(fetchQueue.calls.length, 2)
})

test('transcribe-audio: erro NÃO elegível ao fallback (ex.: limite de taxa) propaga sem tentar whisper-1', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
  ])
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(429, { error: { message: 'Rate limit exceeded' } }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 500)
  assert.match(payload.error, /Rate limit exceeded/)
  assert.equal(fetchQueue.calls.length, 1, 'erro não elegível ao fallback não deveria tentar whisper-1')
})

test('transcribe-audio: falha nos DOIS modelos propaga o erro do fallback (whisper-1)', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
  ])
  const fetchQueue = useFetchQueue([
    async () => jsonFetchResponse(422, { error: { message: 'processing failed' } }),
    async () => jsonFetchResponse(500, { error: { message: 'internal error on whisper-1' } }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 500)
  assert.match(payload.error, /internal error on whisper-1/)
  assert.equal(fetchQueue.calls.length, 2)
})

// ---------------------------------------------------------------------
// Isolamento multiempresa da busca por fingerprint em cache
// ---------------------------------------------------------------------

test('transcribe-audio: busca de transcrição em cache é filtrada pelo company_id do token', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', null),
    insertStep('cycle_events', null),
  ])
  useFetchQueue([async () => jsonFetchResponse(200, { text: 'ok' })])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  await POST(postRequest({ token, body: validBody() }))

  const cacheLookup = fake.calls.find((c) => c.table === 'cycle_events' && c.method === 'select')
  const companyFilter = cacheLookup.filters.find((f) => f.column === 'company_id')

  assert.equal(companyFilter.value, IDS.companyA)
})
