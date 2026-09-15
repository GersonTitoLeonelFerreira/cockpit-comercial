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
  selectStep,
} from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

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
  owner_user_id: IDS.userA,
}

function request() {
  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })

  return new Request('http://localhost/api/companion/audio-transcriptions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearerHeader(token),
    },
    body: JSON.stringify({
      cycle_id: IDS.cycle,
    }),
  })
}

test('leitor retorna legado WhatsApp e evento universal ManyChat sem colisão', async () => {
  const fake = createStepAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', [
      {
        event_type: 'companion_audio_transcribed',
        occurred_at: '2026-09-15T01:05:00.000Z',
        metadata: {
          platform: 'manychat',
          channel: 'whatsapp',
          audio_target_key: 'manychat:native-mid-1',
          audio_index: 0,
          audio_fingerprint: 'fp-manychat',
          transcription_text: 'Mensagem do ManyChat.',
        },
      },
      {
        event_type: 'whatsapp_audio_transcribed',
        occurred_at: '2026-09-15T01:04:00.000Z',
        metadata: {
          audio_target_key: 'legacy-target-1',
          audio_index: 1,
          audio_fingerprint: 'fp-whatsapp',
          transcription_text: 'Mensagem antiga do WhatsApp.',
        },
      },
    ]),
  ])
  adminBox.admin = fake.admin

  const response = await POST(request())
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.transcriptions.length, 2)

  assert.deepEqual(payload.data.transcriptions[0], {
    audio_target_key: 'manychat:native-mid-1',
    audio_index: 0,
    text: 'Mensagem do ManyChat.',
    occurred_at: '2026-09-15T01:05:00.000Z',
    audio_fingerprint: 'fp-manychat',
    platform: 'manychat',
    channel: 'whatsapp',
  })

  assert.deepEqual(payload.data.transcriptions[1], {
    audio_target_key: 'legacy-target-1',
    audio_index: 1,
    text: 'Mensagem antiga do WhatsApp.',
    occurred_at: '2026-09-15T01:04:00.000Z',
    audio_fingerprint: 'fp-whatsapp',
    platform: 'whatsapp',
    channel: 'whatsapp',
  })

  const eventsLookup = fake.calls.find(
    (call) => call.table === 'cycle_events' && call.method === 'select',
  )

  assert.equal(
    eventsLookup.filters.some(
      (filter) =>
        filter.op === 'in' &&
        filter.column === 'event_type' &&
        filter.values.includes('whatsapp_audio_transcribed') &&
        filter.values.includes('companion_audio_transcribed'),
    ),
    true,
  )
})

test('deduplicação inclui plataforma para não colidir target keys iguais', async () => {
  const fake = createStepAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('sales_cycles', ACTIVE_CYCLE),
    selectStep('cycle_events', [
      {
        event_type: 'companion_audio_transcribed',
        occurred_at: '2026-09-15T01:05:00.000Z',
        metadata: {
          platform: 'manychat',
          channel: 'unknown',
          audio_target_key: 'same-target',
          transcription_text: 'ManyChat.',
        },
      },
      {
        event_type: 'whatsapp_audio_transcribed',
        occurred_at: '2026-09-15T01:04:00.000Z',
        metadata: {
          audio_target_key: 'same-target',
          transcription_text: 'WhatsApp.',
        },
      },
    ]),
  ])
  adminBox.admin = fake.admin

  const response = await POST(request())
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.transcriptions.length, 2)
  assert.deepEqual(
    payload.data.transcriptions.map((item) => item.platform),
    ['manychat', 'whatsapp'],
  )
})
