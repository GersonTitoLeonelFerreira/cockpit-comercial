// STEP 2B.5-D1 (Blocker D, Lead Enrichment): testes de rota para
// app/api/companion/lead-enrichment-context/route.ts — a action
// privilegiada que o ManyChat usa para obter lead_id + valores atuais
// não-telefônicos + resultado semântico de comparação de telefone, SEM
// jamais expor o telefone atual do lead nem aceitar lead_id vindo do
// content script (sempre derivado do próprio cycle_id autorizado).
//
// Mesma infraestrutura de enrich-lead/route-authorization.test.mjs: hook
// de resolução para next/server e aliases `@/...`, e node:test's
// `mock.module` para substituir @supabase/supabase-js por um cliente
// falso determinístico e ORDENADO (fake-companion-admin.mjs). A rota real
// roda de ponta a ponta.

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
  companyA: 'cccccccc-0000-4000-8000-000000000001',
  userA: 'cccccccc-0000-4000-8000-0000000000a1',
  userB: 'cccccccc-0000-4000-8000-0000000000a2',
  lead: 'cccccccc-0000-4000-8000-0000000000c1',
  cycle: 'cccccccc-0000-4000-8000-0000000000d1',
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

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/lead-enrichment-context', {
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

test('lead-enrichment-context: sem token — 401, ZERO leitura de qualquer tabela', async () => {
  const fake = useAdmin([])

  const response = await POST(postRequest({ body: { cycle_id: IDS.cycle } }))
  const payload = await readJson(response)

  assert.equal(response.status, 401)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'invalid_companion_token')
  assert.equal(fake.calls.length, 0)
})

test('lead-enrichment-context: cycle_id ausente/inválido — 400 invalid_scope, ZERO leitura de tabela', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { cycle_id: 'nao-e-uuid' } }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.code, 'invalid_scope')
  assert.equal(fake.calls.length, 0)
})

test('lead-enrichment-context: member que não é dono do ciclo — 403 not_cycle_owner, NUNCA lê leads/lead_profiles', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', MEMBER_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', {
      id: IDS.cycle,
      lead_id: IDS.lead,
      company_id: IDS.companyA,
      status: 'ativo',
      owner_user_id: IDS.userB,
    }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { cycle_id: IDS.cycle } }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.code, 'not_cycle_owner')

  assert.equal(
    fake.calls.some((call) => call.table === 'leads' || call.table === 'lead_profiles'),
    false,
    'nunca lê dados do lead antes de confirmar propriedade do ciclo',
  )
})

test('lead-enrichment-context: ciclo não encontrado para a empresa — 404 cycle_not_found', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', MEMBER_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: { cycle_id: IDS.cycle } }))
  const payload = await readJson(response)

  assert.equal(response.status, 404)
  assert.equal(payload.code, 'cycle_not_found')
  assert.equal(fake.calls.some((call) => call.table === 'leads'), false)
})

test('lead-enrichment-context: dono do ciclo — devolve lead_id derivado do cycle, valores atuais não-telefônicos, endereço concatenado, phone_registered=true e phone_matches SEM jamais expor o telefone atual', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', MEMBER_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', {
      id: IDS.cycle,
      lead_id: IDS.lead,
      company_id: IDS.companyA,
      status: 'ativo',
      owner_user_id: IDS.userA,
    }),
    selectStep('leads', {
      id: IDS.lead,
      company_id: IDS.companyA,
      email: null,
      cpf_cnpj: null,
      deleted_at: null,
    }),
    selectStep('lead_profiles', {
      lead_id: IDS.lead,
      company_id: IDS.companyA,
      email: 'cliente@exemplo.com',
      cpf: null,
      cnpj: null,
      birth_date: null,
      profession: 'Engenheira',
      cep: null,
      address_street: 'Rua das Flores',
      address_number: '123',
      address_complement: null,
      address_neighborhood: 'Centro',
      address_city: 'São Paulo',
      address_state: 'SP',
      phone_mobile: '11987654321',
    }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: {
        cycle_id: IDS.cycle,
        // 1187654321 é uma variante SEM o nono dígito de 11987654321 —
        // deve dar match. 11999998888 é um telefone genuinamente
        // diferente — não deve dar match.
        phone_candidates: ['1187654321', '11999998888'],
      },
    }),
  )
  const payload = await readJson(response)
  const raw = JSON.stringify(payload)

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.data.lead_id, IDS.lead)

  assert.equal(payload.data.current_values.email, 'cliente@exemplo.com')
  assert.equal(payload.data.current_values.profession, 'Engenheira')
  assert.equal(payload.data.current_values.address_raw, 'Rua das Flores, 123, Centro, São Paulo, SP')

  assert.equal(payload.data.phone_registered, true)

  assert.deepEqual(
    payload.data.phone_matches,
    [
      { normalized_value: '1187654321', matches: true },
      { normalized_value: '11999998888', matches: false },
    ],
  )

  // O telefone atual do lead (11987654321) NUNCA pode aparecer em lugar
  // nenhum da resposta serializada — nem em current_values, nem em
  // qualquer outro campo.
  assert.doesNotMatch(raw, /11987654321/)
  assert.equal(Object.prototype.hasOwnProperty.call(payload.data.current_values, 'phone_mobile'), false)
})

test('lead-enrichment-context: lead sem telefone cadastrado — phone_registered=false e nenhum candidato de telefone dá match', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', MEMBER_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('sales_cycles', {
      id: IDS.cycle,
      lead_id: IDS.lead,
      company_id: IDS.companyA,
      status: 'ativo',
      owner_user_id: IDS.userA,
    }),
    selectStep('leads', {
      id: IDS.lead,
      company_id: IDS.companyA,
      email: null,
      cpf_cnpj: null,
      deleted_at: null,
    }),
    selectStep('lead_profiles', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({
      token,
      body: { cycle_id: IDS.cycle, phone_candidates: ['11987654321'] },
    }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200)
  assert.equal(payload.data.phone_registered, false)
  assert.deepEqual(payload.data.phone_matches, [{ normalized_value: '11987654321', matches: false }])
})
