// Testes de E2 (Trilha E) para app/api/companion/enrich-lead/route.ts,
// focados exclusivamente na REVOGAÇÃO GLOBAL IMEDIATA (STEP 2A.4,
// Authorization Hardening C): token válido + membership ativa não bastam
// — profiles.is_active_global=false (ou ausente) precisa bloquear
// IMEDIATAMENTE, antes de qualquer leitura/escrita em leads, sales_cycles
// ou lead_profiles.
//
// Mesma infraestrutura de apply-suggestion/route.test.mjs (ver comentário
// lá): hook de resolução adicional para next/server e aliases `@/...`, e
// node:test's `mock.module` para substituir @supabase/supabase-js por um
// cliente falso determinístico. A rota real roda de ponta a ponta — este
// arquivo nunca testa o texto de origem, só o comportamento observável.

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
  companyA: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'bbbbbbbb-0000-4000-8000-0000000000a1',
  lead: 'bbbbbbbb-0000-4000-8000-0000000000c1',
  cycle: 'bbbbbbbb-0000-4000-8000-0000000000d1',
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

function validEnrichmentBody(overrides = {}) {
  return {
    lead_id: IDS.lead,
    cycle_id: IDS.cycle,
    field: 'profession',
    value: 'Advogado',
    expected_current_value: null,
    evidence_message_ids: ['msg-1'],
    confirmed_by_human: true,
    ...overrides,
  }
}

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/enrich-lead', {
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

function assertNoLeadDataTouched(fake) {
  assert.equal(
    fake.calls.some((call) => call.table === 'leads'),
    false,
    'profile globalmente inativo/ausente/com erro nunca pode ler a tabela leads',
  )

  assert.equal(
    fake.calls.some((call) => call.table === 'sales_cycles'),
    false,
    'profile globalmente inativo/ausente/com erro nunca pode ler a tabela sales_cycles',
  )

  assert.equal(
    fake.calls.some((call) => call.table === 'lead_profiles'),
    false,
    'profile globalmente inativo/ausente/com erro nunca pode ler ou escrever lead_profiles',
  )

  assert.equal(
    fake.calls.some((call) => call.method === 'update' || call.method === 'insert'),
    false,
    'nenhuma escrita pode ocorrer quando o profile gate bloqueia a requisição',
  )

  assert.equal(fake.rpcCalls.length, 0, 'a RPC de aplicação do enriquecimento nunca pode ser chamada')
}

// ---------------------------------------------------------------------
// REVOGAÇÃO GLOBAL IMEDIATA — profile.is_active_global=false
// ---------------------------------------------------------------------

test('enrich-lead: token válido + membership ativa, mas profile.is_active_global=false — 403 profile_inactive, ZERO leitura/escrita de lead', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', { ...ACTIVE_PROFILE, is_active_global: false }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validEnrichmentBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'profile_inactive')

  assertNoLeadDataTouched(fake)
})

// ---------------------------------------------------------------------
// profile ausente é tratado como globalmente inativo (fail closed)
// ---------------------------------------------------------------------

test('enrich-lead: profile ausente (null) é tratado como globalmente inativo — 403 profile_inactive, ZERO leitura/escrita de lead', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validEnrichmentBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'profile_inactive')

  assertNoLeadDataTouched(fake)
})

// ---------------------------------------------------------------------
// falha ao consultar profile nunca expõe mensagem interna do banco e
// nunca permite prosseguir para dados do lead
// ---------------------------------------------------------------------

test('enrich-lead: falha ao consultar profile — profile_lookup_failed, ZERO leitura/escrita de lead, sem mensagem interna do banco', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', null, { message: 'detalhe interno do banco' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validEnrichmentBody() }))
  const payload = await readJson(response)

  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'profile_lookup_failed')

  assertNoLeadDataTouched(fake)
})
