// Testes de autorização (STALE COMPANION TOKEN ROLE) para
// app/api/companion/audio-transcriptions/route.ts — não existia cobertura
// de autorização real para este endpoint (só route-platform.test.mjs, que
// cobre normalização de plataforma). A rota autoriza por ownership
// (member) ou role administrativa (admin/manager); a role autorizativa
// precisa ser SEMPRE a membership ATUAL do banco, nunca tokenPayload.role
// — o token dura até 6h e pode ficar desatualizado se a role da pessoa
// mudar nesse meio-tempo. Mesma infraestrutura de fake admin/token dos
// outros testes de rota desta pasta (ver route-platform.test.mjs).

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
  otherSeller: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

const ACTIVE_PROFILE = {
  id: IDS.userA,
  is_active_global: true,
}

const CYCLE_OWNED_BY_OTHER = {
  id: IDS.cycle,
  company_id: IDS.companyA,
  owner_user_id: IDS.otherSeller,
}

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token }) {
  return new Request('http://localhost/api/companion/audio-transcriptions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? bearerHeader(token) : {}),
    },
    body: JSON.stringify({ cycle_id: IDS.cycle }),
  })
}

async function readJson(response) {
  return response.json()
}

test('audio-transcriptions DOWNGRADE: token diz admin mas a membership ATUAL é member, ciclo de outro vendedor — 403, ZERO transcrições retornadas', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', CYCLE_OWNED_BY_OTHER),
  ])
  // Token assinado com role=admin — pode ter sido emitido ANTES do
  // rebaixamento para member. A membership live (acima) já é member.
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(postRequest({ token }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(
    fake.calls.some((call) => call.table === 'cycle_events'),
    false,
    'downgrade nunca pode ler as transcrições privadas de cycle_events',
  )
})

test('audio-transcriptions UPGRADE: token diz member mas a membership ATUAL é admin, ciclo de outro vendedor — acesso permitido conforme regra administrativa', async () => {
  useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'admin' }),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', CYCLE_OWNED_BY_OTHER),
    selectStep('cycle_events', [
      {
        event_type: 'companion_audio_transcribed',
        occurred_at: '2026-09-15T01:05:00.000Z',
        metadata: {
          platform: 'manychat',
          channel: 'whatsapp',
          audio_target_key: 'manychat:native-mid-1',
          transcription_text: 'Transcrição autorizada por role live.',
        },
      },
    ]),
  ])
  // Token assinado com role=member — pode ter sido emitido ANTES da
  // promoção a admin. A membership live (acima) já é admin.
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.transcriptions.length, 1)
  assert.equal(payload.data.transcriptions[0].text, 'Transcrição autorizada por role live.')
})

test('audio-transcriptions: member dono do ciclo sempre acessa as próprias transcrições, sem depender de role administrativa', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', { id: IDS.cycle, company_id: IDS.companyA, owner_user_id: IDS.userA }),
    selectStep('cycle_events', []),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.transcriptions.length, 0)
})

// ---------------------------------------------------------------------
// REVOGAÇÃO GLOBAL IMEDIATA — token válido + membership ativa não
// bastam: profiles.is_active_global=false precisa bloquear IMEDIATAMENTE.
// ---------------------------------------------------------------------

test('audio-transcriptions: token válido + membership ativa, mas profile.is_active_global=false — 403, ZERO texto de transcrição retornado', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', { ...ACTIVE_PROFILE, is_active_global: false }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(
    fake.calls.some((call) => call.table === 'cycle_events'),
    false,
    'profile globalmente inativo nunca pode ler transcrições de cycle_events',
  )
})
