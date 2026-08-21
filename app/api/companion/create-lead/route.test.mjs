// Testes de E2 (Trilha E) para app/api/companion/create-lead/route.ts.
//
// Este arquivo NÃO importa `route.ts` "no escuro": ele registra um hook de
// resolução adicional (só para os specifiers que o loader compartilhado
// não cobre — `next/server` e imports de VALOR via `@/...`) e usa
// `node:test`'s `mock.module` (nativo do Node, sem dependência nova) para
// substituir `@supabase/supabase-js` por um cliente falso determinístico.
// A rota real é executada de ponta a ponta — nenhuma lógica de negócio é
// reimplementada aqui.
//
// Roda separadamente da suíte padrão (`npm run test:companion`), porque
// depende da flag `--experimental-test-module-mocks`, que não está no
// script padrão (ver README/entrega da E2 para o comando exato).

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { createStepAdmin, deleteStep, insertStep, selectStep } from '../../../lib/companion/e2-test-support/fake-companion-admin.mjs'
import { bearerHeader, buildExpiredToken, buildToken, installFakeSupabaseEnv } from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

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
  companyB: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  existingLead: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  otherLead: 'aaaaaaaa-0000-4000-8000-0000000000c2',
  createdLead: 'aaaaaaaa-0000-4000-8000-0000000000c9',
  createdCycle: 'aaaaaaaa-0000-4000-8000-0000000000d9',
}

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

const ACTIVE_PROFILE = { id: IDS.userA, is_active_global: true }

function useAdmin(steps) {
  const fake = createStepAdmin(steps)
  adminBox.admin = fake.admin
  return fake
}

function postRequest({ token, body }) {
  return new Request('http://localhost/api/companion/create-lead', {
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
    name: 'Maria Compradora',
    phone: '11988887777',
    ...overrides,
  }
}

async function readJson(response) {
  return response.json()
}

// ---------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------

test('create-lead: token ausente é rejeitado antes de qualquer acesso ao banco', async () => {
  const fake = useAdmin([])
  const response = await POST(postRequest({ token: null, body: validBody() }))

  assert.equal(response.status, 401)
  assert.equal((await readJson(response)).status, 'INVALID_COMPANION_TOKEN')
  assert.equal(fake.calls.length, 0)
})

test('create-lead: token com assinatura inválida é rejeitado', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const tampered = `${token.slice(0, -4)}0000`

  const response = await POST(postRequest({ token: tampered, body: validBody() }))

  assert.equal(response.status, 401)
  assert.equal(fake.calls.length, 0)
})

test('create-lead: token expirado é rejeitado', async () => {
  const fake = useAdmin([])
  const token = buildExpiredToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 401)
  assert.equal((await readJson(response)).status, 'INVALID_COMPANION_TOKEN')
  assert.equal(fake.calls.length, 0)
})

// ---------------------------------------------------------------------
// Validação de payload (nenhuma chamada ao banco antes de validar)
// ---------------------------------------------------------------------

test('create-lead: nome ausente é rejeitado sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ name: '' }) }))

  assert.equal(response.status, 400)
  assert.equal((await readJson(response)).code, 'name_required')
  assert.equal(fake.calls.length, 0)
})

test('create-lead: telefone ausente é rejeitado sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ phone: '' }) }))

  assert.equal(response.status, 400)
  assert.equal((await readJson(response)).code, 'phone_required')
  assert.equal(fake.calls.length, 0)
})

test('create-lead: CPF inválido é rejeitado sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ cpf_cnpj: '111.111.111-11' }) }))

  assert.equal(response.status, 400)
  assert.equal((await readJson(response)).code, 'invalid_document')
  assert.equal(fake.calls.length, 0)
})

test('create-lead: e-mail inválido é rejeitado sem tocar o banco', async () => {
  const fake = useAdmin([])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ email: 'nao-e-email' }) }))

  assert.equal(response.status, 400)
  assert.equal((await readJson(response)).code, 'invalid_email')
  assert.equal(fake.calls.length, 0)
})

// ---------------------------------------------------------------------
// Membership / perfil
// ---------------------------------------------------------------------

test('create-lead: usuário sem vínculo ativo com a empresa é bloqueado', async () => {
  useAdmin([selectStep('company_memberships', null)])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 403)
  assert.equal((await readJson(response)).status, 'NO_COMPANY_PERMISSION')
})

test('create-lead: usuário globalmente inativo é bloqueado mesmo com membership ativa', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', { id: IDS.userA, is_active_global: false }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))

  assert.equal(response.status, 403)
  assert.equal((await readJson(response)).status, 'USER_INACTIVE')
})

// ---------------------------------------------------------------------
// Isolamento por company_id: toda query relevante carrega o company_id do
// TOKEN (nunca do corpo da requisição).
// ---------------------------------------------------------------------

test('create-lead: toda consulta é filtrada pelo company_id do token, nunca do corpo', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    insertStep('leads', [{ id: IDS.createdLead, company_id: IDS.companyA }]),
    insertStep('lead_profiles', null),
    insertStep('sales_cycles', [{ id: IDS.createdCycle }]),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  // O corpo tenta injetar um company_id diferente - a rota nem lê esse campo.
  const response = await POST(
    postRequest({ token, body: { ...validBody(), company_id: IDS.companyB } }),
  )

  assert.equal(response.status, 201)

  for (const call of fake.calls) {
    const companyFilter = call.filters.find((f) => f.column === 'company_id')

    if (companyFilter) {
      assert.equal(companyFilter.value, IDS.companyA, `chamada em "${call.table}" vazou company_id errado no filtro`)
    }

    if (call.method === 'insert' && call.payload && 'company_id' in call.payload) {
      assert.equal(call.payload.company_id, IDS.companyA, `insert em "${call.table}" vazou company_id errado no payload`)
    }
  }
})

// ---------------------------------------------------------------------
// Lead inexistente -> criação bem-sucedida (happy path)
// ---------------------------------------------------------------------

test('create-lead: lead inexistente é criado com sucesso (lead + profile + cycle + evento)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    insertStep('leads', [
      {
        id: IDS.createdLead,
        company_id: IDS.companyA,
        name: 'Maria Compradora',
        phone: '11988887777',
        email: null,
        cpf_cnpj: null,
        deleted_at: null,
      },
    ]),
    insertStep('lead_profiles', null),
    insertStep('sales_cycles', [{ id: IDS.createdCycle, lead_id: IDS.createdLead, owner_user_id: IDS.userA, status: 'novo' }]),
    insertStep('cycle_events', null),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 201)
  assert.equal(payload.status, 'CREATED')
  assert.equal(payload.data.lead_id, IDS.createdLead)
  assert.equal(payload.data.cycle_id, IDS.createdCycle)
  assert.equal(payload.data.owner_user_id, IDS.userA)
  assert.equal(payload.data.placement, 'OWNED_BY_ME')
  assert.equal(fake.remaining.length, 0, 'todos os passos esperados deveriam ter sido consumidos')
})

test('create-lead: falha ao gravar evento de auditoria (cycle_events) NÃO bloqueia a criação do lead', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    insertStep('leads', [{ id: IDS.createdLead, company_id: IDS.companyA, deleted_at: null }]),
    insertStep('lead_profiles', null),
    insertStep('sales_cycles', [{ id: IDS.createdCycle }]),
    insertStep('cycle_events', null, { message: 'timeout ao gravar auditoria' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 201)
  assert.equal(payload.status, 'CREATED')
})

// ---------------------------------------------------------------------
// Lead já existente / conflitos de identidade
// ---------------------------------------------------------------------

test('create-lead: telefone já vinculado a lead ativo bloqueia criação (active_lead_conflict)', async () => {
  const existingLead = {
    id: IDS.existingLead,
    company_id: IDS.companyA,
    name: 'Cliente Existente',
    phone: '11988887777',
    email: null,
    cpf_cnpj: null,
    deleted_at: null,
  }
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', [existingLead]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'active_lead_conflict')
  assert.equal(payload.conflict.lead_id, IDS.existingLead)
  assert.equal(payload.conflict.matched_by, 'phone')
})

test('create-lead: variação de telefone (nono dígito) do mesmo número ainda detecta duplicidade', async () => {
  // Lead cadastrado SEM o nono dígito e sem DDI; requisição chega COM o
  // nono dígito e sem DDI - buildPhoneVariants deve equalizar as duas
  // formas e leadMatchesPhoneVariants deve reconhecer o mesmo contato.
  const existingLead = {
    id: IDS.existingLead,
    company_id: IDS.companyA,
    name: 'Cliente Existente',
    phone: '1188887777',
    email: null,
    cpf_cnpj: null,
    deleted_at: null,
  }
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', [existingLead]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody({ phone: '11988887777' }) }))
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'active_lead_conflict')
  assert.equal(payload.conflict.lead_id, IDS.existingLead)
})

test('create-lead: e-mail já vinculado a outro lead ativo bloqueia criação (active_lead_conflict por e-mail)', async () => {
  const existingLead = {
    id: IDS.existingLead,
    company_id: IDS.companyA,
    name: 'Cliente Existente',
    phone: '11900001111',
    email: 'cliente@example.com',
    cpf_cnpj: null,
    deleted_at: null,
  }
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    selectStep('leads', [existingLead]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: validBody({ email: 'cliente@example.com' }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'active_lead_conflict')
  assert.equal(payload.conflict.matched_by, 'email')
})

test('create-lead: CPF coincidente em lead_profiles de outro lead bloqueia criação (document_lead_conflict)', async () => {
  const existingLead = {
    id: IDS.existingLead,
    company_id: IDS.companyA,
    name: 'Cliente Existente',
    phone: '11900002222',
    email: null,
    cpf_cnpj: null,
    deleted_at: null,
  }
  const validCpf = '52998224725'

  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []), // busca por telefone: nada
    selectStep('leads', []), // direct cpf_cnpj match on leads: nada
    selectStep('lead_profiles', [{ lead_id: IDS.existingLead, cpf: validCpf, cnpj: null }]),
    selectStep('leads', [existingLead]), // leads com esses ids
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: validBody({ cpf_cnpj: validCpf }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'document_lead_conflict')
  assert.equal(payload.conflict.lead_id, IDS.existingLead)
})

test('create-lead: telefone e e-mail apontando para leads DIFERENTES gera conflito de múltiplos matches', async () => {
  const leadByPhone = {
    id: IDS.existingLead,
    company_id: IDS.companyA,
    name: 'Lead A',
    phone: '11988887777',
    email: null,
    cpf_cnpj: null,
    deleted_at: null,
  }
  const leadByEmail = {
    id: IDS.otherLead,
    company_id: IDS.companyA,
    name: 'Lead B',
    phone: '11900009999',
    email: 'outro@example.com',
    cpf_cnpj: null,
    deleted_at: null,
  }

  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', [leadByPhone]),
    selectStep('leads', [leadByEmail]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(
    postRequest({ token, body: validBody({ email: 'outro@example.com' }) }),
  )
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'multiple_lead_matches')
})

test('create-lead: lead excluído (soft delete) bloqueia com deleted_lead_conflict', async () => {
  const deletedLead = {
    id: IDS.existingLead,
    company_id: IDS.companyA,
    name: 'Cliente Excluído',
    phone: '11988887777',
    email: null,
    cpf_cnpj: null,
    deleted_at: '2026-01-01T00:00:00.000Z',
  }
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', [deletedLead]),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'deleted_lead_conflict')
  assert.equal(payload.conflict.lead_id, IDS.existingLead)
})

test('create-lead: criação concorrente do mesmo contato retorna concurrent_create_conflict (violação de unicidade no insert)', async () => {
  useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    insertStep('leads', null, { code: '23505', message: 'duplicate key value violates unique constraint' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 409)
  assert.equal(payload.code, 'concurrent_create_conflict')
})

// ---------------------------------------------------------------------
// Falha durante criação: rollback / estado parcial
// ---------------------------------------------------------------------

test('create-lead: falha ao criar lead_profiles reverte (deleta) o lead recém-criado', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    insertStep('leads', [{ id: IDS.createdLead, company_id: IDS.companyA, deleted_at: null }]),
    insertStep('lead_profiles', null, { message: 'falha ao gravar perfil' }),
    deleteStep('leads'),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'LEAD_PROFILE_CREATE_ERROR')
  assert.equal(fake.remaining.length, 0, 'o rollback (delete em leads) deveria ter sido chamado')

  const rollbackCall = fake.calls.at(-1)
  assert.equal(rollbackCall.table, 'leads')
  assert.equal(rollbackCall.method, 'delete')
  assert.ok(rollbackCall.filters.some((f) => f.column === 'id' && f.value === IDS.createdLead))
})

test('create-lead: falha ao criar sales_cycles reverte lead_profiles e o lead (rollback em cadeia)', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', []),
    insertStep('leads', [{ id: IDS.createdLead, company_id: IDS.companyA, deleted_at: null }]),
    insertStep('lead_profiles', null),
    insertStep('sales_cycles', null, { message: 'falha ao criar ciclo' }),
    deleteStep('lead_profiles'),
    deleteStep('leads'),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'CYCLE_CREATE_ERROR')
  assert.equal(fake.remaining.length, 0, 'os dois rollbacks (lead_profiles e leads) deveriam ter sido chamados')

  const [rollbackProfile, rollbackLead] = fake.calls.slice(-2)
  assert.equal(rollbackProfile.table, 'lead_profiles')
  assert.equal(rollbackProfile.method, 'delete')
  assert.equal(rollbackLead.table, 'leads')
  assert.equal(rollbackLead.method, 'delete')
})

// ---------------------------------------------------------------------
// Erro inesperado / erro de leitura intermediária
// ---------------------------------------------------------------------

test('create-lead: erro ao buscar leads por telefone é reportado sem criar nada', async () => {
  const fake = useAdmin([
    selectStep('company_memberships', ACTIVE_MEMBERSHIP),
    selectStep('profiles', ACTIVE_PROFILE),
    selectStep('leads', null, { message: 'timeout no banco' }),
  ])
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(postRequest({ token, body: validBody() }))
  const payload = await readJson(response)

  assert.equal(response.status, 400)
  assert.equal(payload.status, 'LEAD_SEARCH_ERROR')
  assert.equal(fake.remaining.length, 0)
})
