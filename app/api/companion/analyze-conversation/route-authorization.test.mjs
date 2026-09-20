// Testes de autorização (STALE COMPANION TOKEN ROLE) para
// app/api/companion/analyze-conversation/route.ts — não existia nenhuma
// cobertura end-to-end deste endpoint (só um teste de inspeção de texto
// fonte, local-inline-redelivery-wiring.test.mjs, que não roda a rota
// real). A rota autoriza por ownership (member) ou role administrativa
// (admin/manager); a role autorizativa precisa ser SEMPRE a membership
// ATUAL do banco, nunca tokenPayload.role — o token dura até 6h e pode
// ficar desatualizado se a role da pessoa mudar nesse meio-tempo.
//
// Mesma infraestrutura de fake admin/token dos outros testes de rota
// desta pasta. Além de @supabase/supabase-js, esta rota também importa
// `send` de @vercel/queue para publicar o job de análise em segundo
// plano — mockado aqui para nunca tocar a fila real do Vercel.
//
// A rota chama `.insert(...).select(...).single()`; o fake admin
// compartilhado (fake-companion-admin.mjs) só implementa `.maybeSingle()`
// — em vez de alterar esse arquivo compartilhado (fora do escopo
// autorizado desta rodada), o wrapper local `useAdmin` abaixo expõe
// `.single()` como um alias de `.maybeSingle()`, fiel ao mesmo contrato
// (uma linha ou null).

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

const adminBox = { admin: null }
const queueCalls = []

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

mock.module('@vercel/queue', {
  namedExports: {
    send: async (topic, message, options) => {
      queueCalls.push({ topic, message, options })
    },
  },
})

const { POST } = await import('./route.ts')

const IDS = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  otherSeller: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  lead: 'aaaaaaaa-0000-4000-8000-0000000000c1',
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

function cycleOwnedByOther(overrides = {}) {
  return {
    id: IDS.cycle,
    company_id: IDS.companyA,
    lead_id: IDS.lead,
    status: 'contato',
    owner_user_id: IDS.otherSeller,
    next_action: null,
    next_action_date: null,
    current_group_id: null,
    ...overrides,
  }
}

// Alias local de `.single()` -> `.maybeSingle()` (mesmo contrato: uma
// linha ou null) — nunca altera o fake admin compartilhado.
function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  const originalFrom = fake.admin.from

  fake.admin.from = (table) => {
    const builder = originalFrom(table)
    builder.single = () => builder.maybeSingle()
    return builder
  }

  adminBox.admin = fake.admin
  return fake
}

function validMessages() {
  return [
    {
      id: 'm1',
      timestamp_ms: Date.now(),
      timestamp_label: '10:00',
      date_key: '2026-09-14',
      direction: 'incoming',
      text: 'Olá, quero saber o preço.',
    },
  ]
}

function postRequest({ token, overrides = {} }) {
  return new Request('http://localhost/api/companion/analyze-conversation', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? bearerHeader(token) : {}),
    },
    body: JSON.stringify({
      cycle_id: IDS.cycle,
      conversation_key: 'conv-1',
      device_key: 'device-1',
      messages: validMessages(),
      ...overrides,
    }),
  })
}

async function readJson(response) {
  return response.json()
}

test('analyze-conversation: token válido + membership ativa, mas profile.is_active_global=false — 403, ZERO job de análise, ZERO publicação na queue', async () => {
  queueCalls.length = 0

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
    fake.calls.some((call) => call.table === 'companion_background_analysis_jobs'),
    false,
    'profile globalmente inativo nunca pode criar job de análise profunda',
  )
  assert.equal(queueCalls.length, 0, 'profile globalmente inativo nunca pode publicar na queue/worker')
})

test('analyze-conversation DOWNGRADE: token diz admin mas a membership ATUAL é member, ciclo de outro vendedor — 403, ZERO job de análise, ZERO publicação na queue', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', cycleOwnedByOther()),
  ])
  // Token assinado com role=admin — pode ter sido emitido ANTES do
  // rebaixamento para member. A membership live (acima) já é member.
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'admin' })

  const response = await POST(postRequest({ token }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(
    fake.calls.some((call) => call.table === 'companion_background_analysis_jobs'),
    false,
    'downgrade nunca pode criar job de análise profunda',
  )
  assert.equal(queueCalls.length, 0, 'downgrade nunca pode publicar na queue/worker')
})

test('analyze-conversation UPGRADE: token diz member mas a membership ATUAL é manager, ciclo de outro vendedor — não rejeita por ownership', async () => {
  queueCalls.length = 0

  const fake = useAdmin([
    selectStep('company_memberships', { ...ACTIVE_MEMBERSHIP, role: 'manager' }),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', cycleOwnedByOther()),
    selectStep('leads', { id: IDS.lead, name: 'Cliente Exemplo', phone: '11988887777', email: null, company_id: IDS.companyA }),
    selectStep('cycle_events', []),
    insertStep('companion_background_analysis_jobs', {
      analysis_job_id: 'job-upgrade-1',
      status: 'queued',
      message_watermark: 'wm-upgrade-1',
    }),
  ])
  // Token assinado com role=member — pode ter sido emitido ANTES da
  // promoção a manager. A membership live (acima) já é manager.
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA, role: 'member' })

  const response = await POST(postRequest({ token }))
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.data.deep_analysis.analysis_job_id, 'job-upgrade-1')
  assert.equal(fake.remaining.length, 0)
  assert.equal(queueCalls.length, 1, 'upgrade precisa chegar até a publicação do job na queue')
})
