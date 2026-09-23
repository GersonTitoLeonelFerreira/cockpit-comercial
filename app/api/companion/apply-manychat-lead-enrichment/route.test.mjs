// STEP 2B.5-D1.1 (hardening do Lead Enrichment): testes de rota para
// app/api/companion/apply-manychat-lead-enrichment/route.ts — a action
// privilegiada exclusiva do ManyChat que NUNCA aceita lead_id do content
// script (só cycle_id, já autorizado pelo token) e, para
// field === 'phone_mobile', SEMPRE deriva expected_current_value lendo
// lead_profiles.phone_mobile no próprio momento do apply — o telefone
// atual nunca cruza a fronteira vindo do cliente nem volta na resposta.
//
// Mesma infraestrutura de lead-enrichment-context/route.test.mjs: hook
// de resolução para next/server e aliases `@/...`, e node:test's
// `mock.module` para substituir @supabase/supabase-js por um cliente
// falso determinístico e ORDENADO (fake-companion-admin.mjs). A rota
// real roda de ponta a ponta.

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
  companyA: 'dddddddd-0000-4000-8000-000000000001',
  companyB: 'dddddddd-0000-4000-8000-000000000002',
  userA: 'dddddddd-0000-4000-8000-0000000000a1',
  userB: 'dddddddd-0000-4000-8000-0000000000a2',
  lead: 'dddddddd-0000-4000-8000-0000000000c1',
  cycle: 'dddddddd-0000-4000-8000-0000000000d1',
}

const MEMBER_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

const ACTIVE_PROFILE = {
  id: IDS.userA,
  is_active_global: true,
}

const OWNED_CYCLE = {
  id: IDS.cycle,
  lead_id: IDS.lead,
  company_id: IDS.companyA,
  status: 'ativo',
  owner_user_id: IDS.userA,
}

const LEAD_ROW = {
  id: IDS.lead,
  company_id: IDS.companyA,
  email: null,
  cpf_cnpj: null,
  deleted_at: null,
}

function successRpcResponder() {
  return { data: { ok: true, already_applied: false } }
}

function useAdmin(steps, options = {}) {
  const fake = createStepAdmin(steps, options)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/apply-manychat-lead-enrichment', {
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
    cycle_id: IDS.cycle,
    field: 'profession',
    value: 'Advogada',
    expected_current_value: null,
    evidence_message_ids: ['msg-1'],
    confirmed_by_human: true,
    ...overrides,
  }
}

test('apply-manychat-lead-enrichment: sem token — 401, ZERO leitura de qualquer tabela', async () => {
  const fake = useAdmin([])

  const response = await POST(postRequest({ body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'invalid_companion_token')
  assert.equal(fake.calls.length, 0)
})

test('apply-manychat-lead-enrichment: cycle_id inválido — 400 invalid_scope', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ cycle_id: 'nao-e-uuid' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.code, 'invalid_scope')
  assert.equal(fake.calls.length, 0)
})

test('apply-manychat-lead-enrichment: sem confirmação humana explícita — 400', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ confirmed_by_human: false }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.code, 'human_confirmation_required')
  assert.equal(fake.calls.length, 0)
})

test('apply-manychat-lead-enrichment: campo não suportado — 400 unsupported_field', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ field: 'not_a_real_field' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.code, 'unsupported_field')
  assert.equal(fake.calls.length, 0)
})

// ---------------------------------------------------------------------
// lead_id nunca é lido do body — mesmo que o content tente enviar um,
// a derivação a partir do ciclo é a ÚNICA fonte.
// ---------------------------------------------------------------------

test('apply-manychat-lead-enrichment: lead_id no body é completamente ignorado — servidor deriva do ciclo mesmo assim', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', MEMBER_MEMBERSHIP),
      selectStep('profiles', ACTIVE_PROFILE),
      selectStep('sales_cycles', OWNED_CYCLE),
      selectStep('leads', LEAD_ROW),
      selectStep('lead_profiles', { lead_id: IDS.lead, company_id: IDS.companyA, profession: null, phone_mobile: null }),
    ],
    { rpcResponder: successRpcResponder },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      // lead_id de um lead completamente diferente/inexistente — a rota
      // nunca lê este campo do body.
      body: { ...validBody(), lead_id: 'attacker-controlled-lead-id' },
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(fake.rpcCalls[0].params.p_lead_id, IDS.lead)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'lead_id'), false)
})

test('apply-manychat-lead-enrichment: ciclo de OUTRA empresa — nunca encontrado (404 cycle_not_found), nunca lê leads/lead_profiles', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', MEMBER_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    // O ciclo pertence à companyA de verdade, mas o token afirma
    // companyB — o filtro .eq('company_id', companyB) nunca encontra o
    // ciclo real de companyA.
    selectStep('sales_cycles', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyB })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 404)
  assert.equal(payload.code, 'cycle_not_found')
  assert.equal(fake.calls.some((call) => call.table === 'leads' || call.table === 'lead_profiles'), false)
})

test('apply-manychat-lead-enrichment: member sem ownership do ciclo — 403 not_cycle_owner, nunca chama a RPC', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', MEMBER_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', { ...OWNED_CYCLE, owner_user_id: IDS.userB }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.code, 'not_cycle_owner')
  assert.equal(fake.rpcCalls.length, 0)
})

test('apply-manychat-lead-enrichment: campo não-telefone — expected_current_value do content é usado sem alteração (comportamento normal)', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', MEMBER_MEMBERSHIP),
      selectStep('profiles', ACTIVE_PROFILE),
      selectStep('sales_cycles', OWNED_CYCLE),
      selectStep('leads', LEAD_ROW),
      selectStep('lead_profiles', { lead_id: IDS.lead, company_id: IDS.companyA, profession: 'Advogada anterior', phone_mobile: null }),
    ],
    { rpcResponder: successRpcResponder },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: validBody({ field: 'profession', value: 'Advogada', expected_current_value: 'Advogada anterior' }),
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(fake.rpcCalls[0].params.p_expected_current_value, 'Advogada anterior')
})

// ---------------------------------------------------------------------
// Telefone — 8/8: nunca retorna o valor atual, mas ainda permite
// confirmação mesmo quando já existe um telefone diferente cadastrado.
// ---------------------------------------------------------------------

test('apply-manychat-lead-enrichment: telefone AUSENTE — confirmação funciona com expected_current_value=null derivado no servidor', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', MEMBER_MEMBERSHIP),
      selectStep('profiles', ACTIVE_PROFILE),
      selectStep('sales_cycles', OWNED_CYCLE),
      selectStep('leads', LEAD_ROW),
      selectStep('lead_profiles', { lead_id: IDS.lead, company_id: IDS.companyA, phone_mobile: null }),
    ],
    { rpcResponder: successRpcResponder },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      // O content NUNCA conhece o telefone atual — sempre manda null,
      // mesmo/especialmente quando o valor real também é null.
      body: validBody({ field: 'phone_mobile', value: '11988887777', expected_current_value: null }),
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(fake.rpcCalls[0].params.p_expected_current_value, null)
})

test('apply-manychat-lead-enrichment: telefone DIFERENTE de um já cadastrado — confirmação FUNCIONA e o servidor usa o telefone real (nunca o que o content mandou) como expected_current_value', async () => {
  const REAL_CURRENT_PHONE = '11987654321'

  const fake = useAdmin(
    [
      selectStep('company_memberships', MEMBER_MEMBERSHIP),
      selectStep('profiles', ACTIVE_PROFILE),
      selectStep('sales_cycles', OWNED_CYCLE),
      selectStep('leads', LEAD_ROW),
      selectStep('lead_profiles', { lead_id: IDS.lead, company_id: IDS.companyA, phone_mobile: REAL_CURRENT_PHONE }),
    ],
    { rpcResponder: successRpcResponder },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      // O content manda expected_current_value=null (nunca soube o
      // valor real) — a rota IGNORA isso e usa o valor que ELA MESMA
      // acabou de ler do banco.
      body: validBody({ field: 'phone_mobile', value: '11999998888', expected_current_value: null }),
    }),
  )
  const payload = await readJson(response)
  const raw = JSON.stringify(payload)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)

  assert.equal(
    fake.rpcCalls[0].params.p_expected_current_value,
    REAL_CURRENT_PHONE,
    'o servidor usa o telefone REAL lido agora mesmo, nunca o null que o content mandou',
  )
  assert.equal(fake.rpcCalls[0].params.p_value, '11999998888')

  // O telefone atual (11987654321) NUNCA pode aparecer em nenhum lugar
  // da resposta serializada ao content.
  assert.doesNotMatch(raw, /11987654321/)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'lead_id'), false)
})

test('apply-manychat-lead-enrichment: RPC rejeita como stale_current_value — 409, propagado normalmente', async () => {
  const fake = useAdmin(
    [
      selectStep('company_memberships', MEMBER_MEMBERSHIP),
      selectStep('profiles', ACTIVE_PROFILE),
      selectStep('sales_cycles', OWNED_CYCLE),
      selectStep('leads', LEAD_ROW),
      selectStep('lead_profiles', { lead_id: IDS.lead, company_id: IDS.companyA, phone_mobile: '11987654321' }),
    ],
    {
      rpcResponder: () => ({
        data: { ok: false, code: 'stale_current_value', error: 'O cadastro mudou.' },
      }),
    },
  )
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: validBody({ field: 'phone_mobile', value: '11999998888', expected_current_value: null }),
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'stale_current_value')
  assert.equal(fake.rpcCalls.length, 1, 'a RPC roda uma vez — a rejeição vem da própria RPC, nunca de um segundo compare-and-set')
})
