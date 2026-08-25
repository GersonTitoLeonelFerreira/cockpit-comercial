// Testes de integração das rotas de "Resumo persistente do lead"
// (route.ts = GET/fetch; save/route.ts = SAVE compare-and-set), reutilizando
// a mesma infraestrutura de teste de rota já usada por outras rotas do
// Companion (ver register-conversation-route.test.mjs).
//
// Cobre os cenários obrigatórios da Etapa 1:
// 1) lead sem resumo -> null; 2) salvar primeiro resumo -> version = 1;
// 3) buscar novamente -> retorna o resumo salvo; 4) atualizar com
// expected_version correto -> incrementa; 5) atualizar com expected_version
// desatualizado -> conflito (409), sem sobrescrever; 6) A -> B: resumo de um
// lead nunca aparece ao resolver outro; 7) tenant A -> tenant B: usuário sem
// membership ativa na empresa é rejeitado; 8) troca de conversa (outro
// cycle_id) resolve identidade de outro lead; 9) reload: um novo GET depois
// do SAVE continua enxergando o resumo salvo; 10) nenhum SAVE ocorre sem
// chamada explícita à rota /save (a rota GET nunca grava).

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
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

import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const adminBox = { admin: null }

import { mock } from 'node:test'

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

const { POST: fetchPOST } = await import('./route.ts')
const { POST: savePOST } = await import('./save/route.ts')

const IDS = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  companyB: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  otherUserA: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  userB: 'bbbbbbbb-0000-4000-8000-0000000000b1',
  cycleA: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  cycleA2: 'aaaaaaaa-0000-4000-8000-0000000000d2',
  leadA: 'aaaaaaaa-0000-4000-8000-0000000000e1',
  leadA2: 'aaaaaaaa-0000-4000-8000-0000000000e2',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const CONVERSATION_KEY_2 = 'whatsapp:+5547999990002'

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function buildQueryClass(tables, tableErrors = {}) {
  return class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.inFilters = []
      this.maximum = null
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    in(column, values) {
      this.inFilters.push({ column, values })
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    resolveRows() {
      const injectedError = tableErrors[this.table]

      if (injectedError) {
        return { data: null, error: injectedError }
      }

      const rows = (tables[this.table] ?? []).filter(
        (row) =>
          matchesFilters(row, this.filters) &&
          this.inFilters.every((filter) => filter.values.includes(row[filter.column])),
      )

      const limited = this.maximum === null ? rows : rows.slice(0, this.maximum)

      return { data: limited, error: null }
    }

    maybeSingle() {
      const result = this.resolveRows()

      if (result.error) {
        return Promise.resolve({ data: null, error: result.error })
      }

      return Promise.resolve({ data: result.data[0] ?? null, error: null })
    }

    then(onFulfilled, onRejected) {
      return Promise.resolve(this.resolveRows()).then(onFulfilled, onRejected)
    }
  }
}

// `rpcError`, quando definido, simula uma tabela/RPC ainda não aplicada no
// banco real (migration ausente no deploy) — reproduz exatamente o FAIL de
// integração real reportado: um deploy cujo código já tem a rota, mas cujo
// banco Postgres conectado ainda não recebeu a migration desta etapa.
function createFakeAdmin({ memberships, cycles, summaries = [], tableErrors = {}, rpcError = null }) {
  const rpcCalls = []
  let nextId = 1

  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    conversation_message_reconciliation_state: [],
    conversation_messages: [],
    companion_lead_conversation_summaries: summaries,
  }

  const Query = buildQueryClass(tables, tableErrors)

  const admin = {
    from(table) {
      return new Query(table)
    },

    async rpc(name, params) {
      rpcCalls.push({ name, params })

      if (name !== 'rpc_save_companion_lead_conversation_summary') {
        return { data: null, error: { message: `RPC inesperada: ${name}` } }
      }

      if (rpcError) {
        return { data: null, error: rpcError }
      }

      const existingIndex = summaries.findIndex(
        (row) => row.company_id === params.p_company_id && row.lead_id === params.p_lead_id,
      )

      const existing = existingIndex >= 0 ? summaries[existingIndex] : null

      if (!existing) {
        if (params.p_expected_version !== null && params.p_expected_version !== 0) {
          return {
            data: [
              {
                id: null,
                company_id: params.p_company_id,
                lead_id: params.p_lead_id,
                conversation_key: null,
                summary: null,
                version: null,
                last_message_watermark: null,
                created_at: null,
                updated_at: null,
                created_by: null,
                updated_by: null,
                conflict: true,
                current_version: 0,
              },
            ],
            error: null,
          }
        }

        const row = {
          id: `summary-${nextId}`,
          company_id: params.p_company_id,
          lead_id: params.p_lead_id,
          conversation_key: params.p_conversation_key,
          summary: params.p_summary,
          version: 1,
          last_message_watermark: params.p_last_message_watermark,
          created_at: `2026-08-25T12:00:0${nextId}.000Z`,
          updated_at: `2026-08-25T12:00:0${nextId}.000Z`,
          created_by: params.p_actor_user_id,
          updated_by: params.p_actor_user_id,
        }

        nextId += 1
        summaries.push(row)

        return {
          data: [{ ...row, conflict: false, current_version: row.version }],
          error: null,
        }
      }

      if (params.p_expected_version !== existing.version) {
        return {
          data: [{ ...existing, conflict: true, current_version: existing.version }],
          error: null,
        }
      }

      existing.summary = params.p_summary
      existing.version += 1
      existing.conversation_key = params.p_conversation_key
      existing.last_message_watermark = params.p_last_message_watermark
      existing.updated_by = params.p_actor_user_id
      existing.updated_at = `2026-08-25T12:30:0${nextId}.000Z`
      nextId += 1

      return {
        data: [{ ...existing, conflict: false, current_version: existing.version }],
        error: null,
      }
    },
  }

  return { admin, summaries, rpcCalls }
}

function fixtures() {
  return {
    memberships: [
      ACTIVE_MEMBERSHIP,
      { company_id: IDS.companyA, user_id: IDS.otherUserA, role: 'member', is_active: true },
      { company_id: IDS.companyB, user_id: IDS.userB, role: 'admin', is_active: true },
    ],
    cycles: [
      { id: IDS.cycleA, company_id: IDS.companyA, lead_id: IDS.leadA, owner_user_id: IDS.userA },
      {
        id: IDS.cycleA2,
        company_id: IDS.companyA,
        lead_id: IDS.leadA2,
        owner_user_id: IDS.userA,
      },
    ],
  }
}

function fetchRequest({ token, body }) {
  return new Request('http://localhost/api/companion/lead-summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? bearerHeader(token) : {}) },
    body: JSON.stringify(body ?? {}),
  })
}

function saveRequest({ token, body }) {
  return new Request('http://localhost/api/companion/lead-summary/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? bearerHeader(token) : {}) },
    body: JSON.stringify(body ?? {}),
  })
}

test('sem token -> 401 em ambas as rotas, com código distinguível (auth inválida != tenant inválido != schema ausente)', async () => {
  adminBox.admin = createFakeAdmin(fixtures()).admin

  const fetchResponse = await fetchPOST(fetchRequest({ body: { cycle_id: IDS.cycleA } }))
  const fetchBody = await fetchResponse.json()
  assert.equal(fetchResponse.status, 401)
  assert.equal(fetchBody.code, 'INVALID_COMPANION_SESSION')

  const saveResponse = await savePOST(
    saveRequest({ body: { cycle_id: IDS.cycleA, summary: 'x' } }),
  )
  const saveBody = await saveResponse.json()
  assert.equal(saveResponse.status, 401)
  assert.equal(saveBody.code, 'INVALID_COMPANION_SESSION')
})

test('1) lead sem resumo -> null', async () => {
  adminBox.admin = createFakeAdmin(fixtures()).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )

  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.summary, null)
  assert.equal(body.data.identity.lead_id, IDS.leadA)
})

test('2-3-4-5) salvar primeiro resumo, reler, versionar e detectar conflito', async () => {
  const { admin, summaries } = createFakeAdmin(fixtures())
  adminBox.admin = admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const firstSave = await savePOST(
    saveRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        summary: 'Larissa perde oportunidades por falta de follow-up.',
        expected_version: null,
      },
    }),
  )
  const firstBody = await firstSave.json()

  assert.equal(firstSave.status, 200)
  assert.equal(firstBody.ok, true)
  assert.equal(firstBody.data.summary.version, 1)
  assert.equal(summaries.length, 1)

  // 3) reler -> mesmo resumo (reload da extensão continua disponível)
  const reread = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const rereadBody = await reread.json()

  assert.equal(rereadBody.data.summary.summary, firstBody.data.summary.summary)
  assert.equal(rereadBody.data.summary.version, 1)

  // 4) expected_version correto -> incrementa
  const secondSave = await savePOST(
    saveRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        summary: 'Proposta de piloto de 90 dias apresentada.',
        expected_version: 1,
      },
    }),
  )
  const secondBody = await secondSave.json()

  assert.equal(secondSave.status, 200)
  assert.equal(secondBody.data.summary.version, 2)

  // 5) expected_version desatualizado -> conflito, sem sobrescrever
  const staleSave = await savePOST(
    saveRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        summary: 'Tentativa de sobrescrita indevida.',
        expected_version: 1,
      },
    }),
  )
  const staleBody = await staleSave.json()

  assert.equal(staleSave.status, 409)
  assert.equal(staleBody.ok, false)
  assert.equal(staleBody.code, 'LEAD_SUMMARY_VERSION_CONFLICT')
  assert.equal(staleBody.data.current_version, 2)
  assert.equal(summaries[0].version, 2)
  assert.equal(summaries[0].summary, 'Proposta de piloto de 90 dias apresentada.')
})

test('6) A -> B: cycle_id de outro lead nunca retorna o resumo do primeiro', async () => {
  const { admin } = createFakeAdmin(fixtures())
  adminBox.admin = admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  await savePOST(
    saveRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        summary: 'Resumo do lead A.',
        expected_version: null,
      },
    }),
  )

  const otherLeadRead = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA2, conversation_key: CONVERSATION_KEY_2 },
    }),
  )
  const otherLeadBody = await otherLeadRead.json()

  assert.equal(otherLeadBody.data.identity.lead_id, IDS.leadA2)
  assert.equal(otherLeadBody.data.summary, null)
})

test('7) tenant isolation: usuário sem membership ativa é rejeitado, com código distinguível de auth inválida', async () => {
  adminBox.admin = createFakeAdmin(fixtures()).admin

  const token = buildToken({ sub: IDS.userB, companyId: IDS.companyA })

  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 403)
  assert.equal(body.code, 'LEAD_SUMMARY_MEMBERSHIP_REQUIRED')
  assert.notEqual(body.code, 'INVALID_COMPANION_SESSION')
})

test('erro de schema ausente (migration não aplicada) na BUSCA é detectado explicitamente, nunca vira um 500 genérico indistinguível', async () => {
  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    tableErrors: {
      companion_lead_conversation_summaries: {
        code: '42P01',
        message: 'relation "public.companion_lead_conversation_summaries" does not exist',
      },
    },
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.code, 'LEAD_SUMMARY_SCHEMA_NOT_READY_QUERY')
  assert.notEqual(body.code, 'LEAD_SUMMARY_QUERY_FAILED')
  assert.notEqual(body.code, 'LEAD_SUMMARY_UNEXPECTED_ERROR')
})

test('erro de schema ausente (migration não aplicada) no SAVE é detectado explicitamente, nunca vira um 500 genérico indistinguível', async () => {
  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    rpcError: {
      code: '42883',
      message:
        'function public.rpc_save_companion_lead_conversation_summary(uuid, uuid, uuid, text, text, integer, text) does not exist',
    },
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await savePOST(
    saveRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        summary: 'Resumo de teste.',
        expected_version: null,
      },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.code, 'LEAD_SUMMARY_SCHEMA_NOT_READY_PERSIST')
  assert.notEqual(body.code, 'LEAD_SUMMARY_PERSIST_FAILED')
})

test('8) troca de conversa: outro cycle_id resolve identidade de outro lead', async () => {
  adminBox.admin = createFakeAdmin(fixtures()).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const first = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const second = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA2, conversation_key: CONVERSATION_KEY_2 },
    }),
  )

  const firstBody = await first.json()
  const secondBody = await second.json()

  assert.equal(firstBody.data.identity.lead_id, IDS.leadA)
  assert.equal(secondBody.data.identity.lead_id, IDS.leadA2)
  assert.notEqual(firstBody.data.identity.lead_id, secondBody.data.identity.lead_id)
})

test('10) a rota de leitura nunca grava (nenhum SAVE sem ação explícita)', async () => {
  const { admin, summaries } = createFakeAdmin(fixtures())
  adminBox.admin = admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )

  assert.equal(summaries.length, 0)
})
