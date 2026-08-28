// Fase 12A, Frente 2B (re-auditoria do Controle Mestre): o Controle
// Mestre confirmou que este endpoint legado (usado por
// LeadCopilotPanel.tsx via app/lib/services/ai-sales-copilot.ts) escrevia
// no CRM (rpc_apply_ai_open_suggestion_for_company) sem exigir NENHUM
// sinal de confirmação humana. Este teste cobre o mesmo contrato
// fail-closed já fechado em app/api/companion/apply-suggestion/route.ts
// para o Companion: ausente/false/não-booleano -> rejeita antes de
// qualquer leitura/escrita; somente `true` autoriza.
//
// A rota usa autenticação por cookie (next/headers + @supabase/ssr), não
// bearer token como as rotas do Companion — por isso mockamos os dois
// módulos via node:test's `mock.module`, no mesmo espírito do
// app/api/companion/apply-suggestion/route.test.mjs (que mocka
// @supabase/supabase-js). A rota real (route.ts) roda de ponta a ponta.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://fake.supabase.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'fake-anon-key'

const authBox = { user: { id: 'user-1' }, error: null }
const activeCompanyIdBox = { value: 'company-1' }
const rpcBox = { result: { data: [{ success: true, id: 'cycle-1', status: 'negociacao' }], error: null } }
const calls = []

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      get(name) {
        if (name === 'cockpit_active_company_id') {
          return activeCompanyIdBox.value === null
            ? undefined
            : { value: activeCompanyIdBox.value }
        }
        return undefined
      },
      getAll() {
        return []
      },
    }),
  },
})

mock.module('@supabase/ssr', {
  namedExports: {
    createServerClient: () => ({
      auth: {
        async getUser() {
          calls.push({ method: 'auth.getUser' })
          return { data: authBox.user ? { user: authBox.user } : null, error: authBox.error }
        },
      },
      async rpc(name, params) {
        calls.push({ method: 'rpc', name, params })
        return rpcBox.result
      },
    }),
  },
})

const { POST } = await import('./route.ts')

function suggestion(overrides = {}) {
  return {
    recommended_status: 'negociacao',
    confidence: 0.8,
    action_channel: null,
    action_result: null,
    result_detail: null,
    next_action: null,
    next_action_date: null,
    summary: 'Cliente demonstrou interesse.',
    tags: [],
    should_close_won: false,
    should_close_lost: false,
    close_reason: null,
    reason_for_recommendation: 'Cliente respondeu positivamente.',
    source: 'ai',
    ...overrides,
  }
}

function postRequest(body) {
  return new Request('http://localhost/api/ai/apply-suggestion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

async function readJson(response) {
  return response.json()
}

test.beforeEach(() => {
  calls.length = 0
  authBox.user = { id: 'user-1' }
  authBox.error = null
  activeCompanyIdBox.value = 'company-1'
  rpcBox.result = { data: [{ success: true, id: 'cycle-1', status: 'negociacao' }], error: null }
})

test('apply-suggestion (legado): confirmed_by_human=false é rejeitado antes de qualquer leitura/escrita', async () => {
  const response = await POST(
    postRequest({
      cycle_id: 'cycle-1',
      applied_status: 'negociacao',
      suggestion: suggestion(),
      confirmed_by_human: false,
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /confirmação humana/i)
  assert.equal(calls.length, 0, 'nenhuma chamada de auth/rpc deveria acontecer antes do gate')
})

test('apply-suggestion (legado): confirmed_by_human omitido é FAIL CLOSED', async () => {
  const response = await POST(
    postRequest({
      cycle_id: 'cycle-1',
      applied_status: 'negociacao',
      suggestion: suggestion(),
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /confirmação humana/i)
  assert.equal(calls.length, 0)
})

test('apply-suggestion (legado): confirmed_by_human com valor não-booleano (truthy) é FAIL CLOSED', async () => {
  for (const nonBooleanTruthy of ['true', 1, 'yes', {}]) {
    const response = await POST(
      postRequest({
        cycle_id: 'cycle-1',
        applied_status: 'negociacao',
        suggestion: suggestion(),
        confirmed_by_human: nonBooleanTruthy,
      }),
    )
    const payload = await readJson(response)

    assert.equal(response.status, 400, `valor ${JSON.stringify(nonBooleanTruthy)} deveria ser rejeitado`)
    assert.equal(payload.ok, false)
    assert.equal(calls.length, 0)
  }
})

test('apply-suggestion (legado): confirmed_by_human=true segue o fluxo normal e aplica a sugestão', async () => {
  const response = await POST(
    postRequest({
      cycle_id: 'cycle-1',
      applied_status: 'negociacao',
      suggestion: suggestion(),
      confirmed_by_human: true,
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.ok(
    calls.some((call) => call.method === 'rpc' && call.name === 'rpc_apply_ai_open_suggestion_for_company'),
    'com confirmação verdadeira, a rota deveria seguir até a RPC de aplicação',
  )
})

test('apply-suggestion (legado): o servidor nunca grava true incondicionalmente — o gate roda antes de qualquer verificação de autenticação', async () => {
  // Mesmo com o usuário "autenticado" no fake, confirmed_by_human ausente
  // precisa bloquear antes de auth.getUser ser chamado — provando que o
  // servidor não pode "compensar" a ausência do sinal fazendo a própria
  // checagem de sessão valer como confirmação.
  const response = await POST(
    postRequest({
      cycle_id: 'cycle-1',
      applied_status: 'negociacao',
      suggestion: suggestion(),
    }),
  )

  assert.equal(response.status, 400)
  assert.equal(
    calls.some((call) => call.method === 'auth.getUser'),
    false,
    'auth.getUser não deveria ter sido chamado antes do gate de confirmação humana',
  )
})
