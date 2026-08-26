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
const providerBox = {
  calls: [],
  workingSummary:
    'Resumo composto a partir das fontes factuais.',
}

import { mock } from 'node:test'

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

mock.module(
  '../../../lib/companion/stateful-copilot-openai-provider',
  {
    namedExports: {
      createStatefulCopilotOpenAIProvider:
        () => async (request) => {
          providerBox.calls.push(request)
          return {
            content: JSON.stringify({
              working_summary:
                providerBox.workingSummary,
            }),
            provider: 'test',
          }
        },
    },
  },
)

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
function createFakeAdmin({
  memberships,
  cycles,
  summaries = [],
  registrations = [],
  legacyHistory = [],
  reconciliation = [],
  messages = [],
  tableErrors = {},
  rpcError = null,
}) {
  const rpcCalls = []
  let nextId = 1

  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    conversation_message_reconciliation_state:
      reconciliation,
    conversation_messages: messages,
    companion_conversation_registrations:
      registrations,
    ai_coaching_notes: legacyHistory,
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

// O supabase-js real fala com o banco através do PostgREST (REST API), não
// de uma conexão SQL direta — por isso, para uma tabela/função ausente,
// PostgREST devolve PGRST205/PGRST202 ("... in the schema cache"), não os
// códigos brutos do Postgres (42P01/42883) usados nos dois testes acima.
// Esse foi exatamente o gap que fez o teste real em produção/preview cair
// no LEAD_SUMMARY_QUERY_FAILED genérico (500) em vez do
// LEAD_SUMMARY_SCHEMA_NOT_READY_* explícito (503).
test('erro de schema ausente no formato REAL do PostgREST (PGRST205) na BUSCA é detectado explicitamente', async () => {
  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    tableErrors: {
      companion_lead_conversation_summaries: {
        code: 'PGRST205',
        message:
          "Could not find the table 'public.companion_lead_conversation_summaries' in the schema cache",
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
})

test('erro de schema ausente no formato REAL do PostgREST (PGRST202) no SAVE é detectado explicitamente', async () => {
  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    rpcError: {
      code: 'PGRST202',
      message:
        "Could not find the function public.rpc_save_companion_lead_conversation_summary(p_company_id, p_lead_id, p_actor_user_id, p_conversation_key, p_summary, p_expected_version, p_last_message_watermark) in the schema cache",
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

function canonicalConversationFixtures({
  text =
    'Preciso organizar o follow-up da equipe.',
  occurredAt = '2026-08-25T14:00:00.000Z',
} = {}) {
  return {
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-1',
      },
    ],
    messages: [
      {
        id: 'message-1',
        company_id: IDS.companyA,
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        message_key: 'whatsapp-message-1',
        version: 1,
        direction: 'incoming',
        occurred_at: occurredAt,
        content_type: 'text',
        text_content: text,
        audio_transcription: null,
        is_deleted: false,
      },
    ],
  }
}

function audioMessageRow({
  id = 'message-audio-1',
  messageKey = 'whatsapp-audio-1',
  direction = 'incoming',
  occurredAt = '2026-08-25T14:05:00.000Z',
  transcription = null,
} = {}) {
  return {
    id,
    company_id: IDS.companyA,
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    message_key: messageKey,
    version: 1,
    direction,
    occurred_at: occurredAt,
    content_type: 'audio',
    text_content: null,
    audio_transcription: transcription,
    is_deleted: false,
  }
}

function registeredHistoryRow(overrides = {}) {
  return {
    company_id: IDS.companyA,
    cycle_id: IDS.cycleA,
    lead_id: IDS.leadA,
    conversation_key: CONVERSATION_KEY,
    watermark: 'registered-watermark-1',
    summary_text:
      'A cliente confirmou que precisa organizar o follow-up da equipe.',
    message_count: 22,
    created_at: '2026-08-25T14:30:00.000Z',
    ...overrides,
  }
}

function savedSummaryRow(overrides = {}) {
  return {
    id: 'summary-1',
    company_id: IDS.companyA,
    lead_id: IDS.leadA,
    conversation_key: CONVERSATION_KEY,
    summary:
      'Resumo persistente aprovado pelo vendedor.',
    version: 1,
    last_message_watermark:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    created_at: '2026-08-25T12:00:00.000Z',
    updated_at: '2026-08-25T12:00:00.000Z',
    created_by: IDS.userA,
    updated_by: IDS.userA,
    ...overrides,
  }
}

test('lead recém-criado com mensagens canônicas forma working summary', async () => {
  providerBox.calls = []
  providerBox.workingSummary =
    'A cliente precisa organizar o follow-up da equipe.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    ...canonicalConversationFixtures(),
  }).admin

  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
      },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(
    body.data.working_summary,
    providerBox.workingSummary,
  )
  assert.equal(
    body.data.working_summary_source,
    'conversation_only',
  )
  assert.equal(body.data.messages_used_count, 1)

  const prompt = JSON.parse(
    providerBox.calls[0].user_prompt,
  )
  assert.equal(
    prompt.current_or_new_messages[0].text,
    'Preciso organizar o follow-up da equipe.',
  )
})

test('conversa registrada alimenta o working summary quando é a única memória histórica', async () => {
  providerBox.calls = []

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    registrations: [registeredHistoryRow()],
  }).admin

  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
      },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(
    body.data.working_summary,
    registeredHistoryRow().summary_text,
  )
  assert.equal(
    body.data.working_summary_source,
    'registered_history',
  )
  assert.equal(body.data.has_unsaved_changes, true)
  assert.equal(providerBox.calls.length, 0)
})

test('resumo persistente tem prioridade sobre registro equivalente do mesmo snapshot', async () => {
  providerBox.calls = []
  const summary = savedSummaryRow()

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    summaries: [summary],
    registrations: [
      registeredHistoryRow({
        watermark:
          summary.last_message_watermark,
        created_at:
          '2026-08-25T13:00:00.000Z',
      }),
    ],
  }).admin

  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
      },
    }),
  )
  const body = await response.json()

  assert.equal(
    body.data.working_summary,
    summary.summary,
  )
  assert.equal(
    body.data.working_summary_source,
    'canonical',
  )
  assert.equal(body.data.has_unsaved_changes, false)
  assert.equal(providerBox.calls.length, 0)
})

test('registros repetidos não duplicam fatos no contexto histórico', async () => {
  providerBox.calls = []
  const repeatedSummary =
    'A cliente confirmou interesse no piloto.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    registrations: [
      registeredHistoryRow({
        conversation_key:
          'whatsapp:+5547999990010',
        summary_text: repeatedSummary,
        created_at:
          '2026-08-24T10:00:00.000Z',
      }),
      registeredHistoryRow({
        conversation_key:
          'whatsapp:+5547999990011',
        watermark: 'registered-watermark-2',
        summary_text: repeatedSummary,
        created_at:
          '2026-08-25T10:00:00.000Z',
      }),
    ],
  }).admin

  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
      },
    }),
  )
  const body = await response.json()

  assert.equal(
    body.data.working_summary,
    repeatedSummary,
  )
  assert.equal(body.data.registered_history_count, 2)
  assert.equal(
    body.data.registered_history_distinct_count,
    1,
  )
  assert.equal(providerBox.calls.length, 0)
})

test('dado canônico novo vence resumo persistente stale', async () => {
  providerBox.calls = []
  providerBox.workingSummary =
    'A cliente agora declarou que precisa organizar o follow-up.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    summaries: [
      savedSummaryRow({
        summary:
          'A cliente ainda não havia declarado uma necessidade.',
        last_message_watermark:
          'watermark-antigo',
      }),
    ],
    ...canonicalConversationFixtures(),
  }).admin

  const token = buildToken({
    sub: IDS.userA,
    companyId: IDS.companyA,
  })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
      },
    }),
  )
  const body = await response.json()

  assert.equal(
    body.data.working_summary,
    providerBox.workingSummary,
  )
  assert.equal(
    body.data.working_summary_source,
    'canonical_plus_conversation',
  )
  assert.equal(body.data.has_unsaved_changes, true)

  const prompt = JSON.parse(
    providerBox.calls[0].user_prompt,
  )
  assert.match(prompt.saved_summary, /ainda não/i)
  assert.match(
    prompt.current_or_new_messages[0].text,
    /follow-up/i,
  )
})

// ---------------------------------------------------------------------
// Áudio como conteúdo real da conversa (Onda 7 / Frente 2)
// ---------------------------------------------------------------------

test('conversa somente texto: pipeline funciona normalmente sem nenhum campo de áudio envolvido', async () => {
  providerBox.calls = []
  providerBox.workingSummary =
    'A cliente precisa organizar o follow-up da equipe.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    ...canonicalConversationFixtures(),
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.pending_audio_transcription_count, 0)

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  assert.equal(prompt.current_or_new_messages.every((message) => message.kind === 'text'), true)
})

test('texto + áudio transcrito do cliente: a transcrição entra no resumo como fala do cliente (speaker=cliente, kind=audio)', async () => {
  providerBox.calls = []
  providerBox.workingSummary = 'A cliente prefere pagar no boleto.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-1',
      },
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-1',
      },
    ],
    messages: [
      canonicalConversationFixtures().messages[0],
      audioMessageRow({
        direction: 'incoming',
        occurredAt: '2026-08-25T14:05:00.000Z',
        transcription: 'Prefiro pagar no boleto.',
      }),
    ],
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.pending_audio_transcription_count, 0)
  assert.equal(body.data.messages_used_count, 2)

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  const audioEntry = prompt.current_or_new_messages.find(
    (message) => message.kind === 'audio',
  )

  assert.ok(audioEntry, 'esperava encontrar a mensagem de áudio no prompt')
  assert.equal(audioEntry.speaker, 'cliente')
  assert.equal(audioEntry.text, 'Prefiro pagar no boleto.')
})

test('áudio transcrito do vendedor entra corretamente como fala do vendedor (speaker=vendedor)', async () => {
  providerBox.calls = []
  providerBox.workingSummary = 'O vendedor confirmou o prazo de entrega.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-seller',
      },
    ],
    messages: [
      audioMessageRow({
        id: 'message-audio-seller',
        messageKey: 'whatsapp-audio-seller',
        direction: 'outgoing',
        occurredAt: '2026-08-25T14:10:00.000Z',
        transcription: 'Confirmo que o prazo é de dez dias úteis.',
      }),
    ],
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )

  assert.equal(response.status, 200)

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  assert.equal(prompt.current_or_new_messages.length, 1)
  assert.equal(prompt.current_or_new_messages[0].speaker, 'vendedor')
  assert.equal(prompt.current_or_new_messages[0].kind, 'audio')
  assert.equal(
    prompt.current_or_new_messages[0].text,
    'Confirmo que o prazo é de dez dias úteis.',
  )
})

test('áudio sem transcrição não inventa conteúdo, mas também não vira um buraco silencioso: entra como marcador técnico', async () => {
  providerBox.calls = []
  providerBox.workingSummary = 'Existe um áudio da cliente pendente de transcrição.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-1',
      },
    ],
    messages: [
      audioMessageRow({ transcription: null }),
    ],
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.pending_audio_transcription_count, 1)
  // O resumo é composto (não fica vazio/"empty") mesmo só com o áudio pendente.
  assert.equal(body.data.working_summary_source, 'conversation_only')

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  assert.equal(prompt.current_or_new_messages.length, 1)
  assert.equal(prompt.current_or_new_messages[0].kind, 'audio')
  assert.match(
    prompt.current_or_new_messages[0].text,
    /ainda sem transcrição/i,
  )
  // Nunca inventa palavras específicas de conteúdo comercial no marcador.
  assert.doesNotMatch(
    prompt.current_or_new_messages[0].text,
    /cancelar|comprar|proposta|pagamento|boleto/i,
  )
})

test('mesmo áudio não duplica fatos: apenas uma entrada aparece no prompt mesmo com múltiplas versões físicas da mensagem', async () => {
  providerBox.calls = []
  providerBox.workingSummary = 'A cliente quer cancelar.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    // Duas versões físicas do mesmo message_key: a primeira sem
    // transcrição, a segunda (vigente) já transcrita. O ponteiro de
    // reconciliação aponta só para a versão vigente.
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-v2',
      },
    ],
    messages: [
      {
        ...audioMessageRow({
          id: 'message-audio-v1',
          transcription: null,
        }),
        version: 1,
      },
      {
        ...audioMessageRow({
          id: 'message-audio-v2',
          transcription: 'Quero cancelar o plano.',
        }),
        version: 2,
      },
    ],
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.messages_used_count, 1)

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  assert.equal(prompt.current_or_new_messages.length, 1)
  assert.equal(prompt.current_or_new_messages[0].text, 'Quero cancelar o plano.')
})

test('cliente diz apenas por áudio "quero cancelar": o fato chega inteiro ao resumo (não é descartado por não ter texto)', async () => {
  providerBox.calls = []
  providerBox.workingSummary = 'A cliente pediu para cancelar o plano.'

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-cancel',
      },
    ],
    messages: [
      audioMessageRow({
        id: 'message-audio-cancel',
        messageKey: 'whatsapp-audio-cancel',
        transcription: 'Quero cancelar.',
      }),
    ],
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const response = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.working_summary, providerBox.workingSummary)

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  assert.equal(prompt.current_or_new_messages.length, 1)
  assert.equal(prompt.current_or_new_messages[0].speaker, 'cliente')
  assert.equal(prompt.current_or_new_messages[0].text, 'Quero cancelar.')
})

test('transcrição posterior invalida o resumo antigo: o watermark muda e a nova leitura passa a considerar a transcrição', async () => {
  providerBox.calls = []
  providerBox.workingSummary = 'A cliente confirmou que quer cancelar via áudio.'

  const pendingFixtures = {
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-cancel',
      },
    ],
    messages: [
      audioMessageRow({
        id: 'message-audio-cancel',
        messageKey: 'whatsapp-audio-cancel',
        transcription: null,
      }),
    ],
  }

  // 1) Primeira leitura: áudio ainda não transcrito. O resumo persistido
  // guarda o watermark desse estado (sem a transcrição).
  const { admin, summaries } = createFakeAdmin({
    ...fixtures(),
    ...pendingFixtures,
  })
  adminBox.admin = admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const firstRead = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const firstBody = await firstRead.json()
  const watermarkBeforeTranscription = firstBody.data.current_message_watermark

  await savePOST(
    saveRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        summary: firstBody.data.working_summary,
        expected_version: null,
      },
    }),
  )

  assert.equal(summaries[0].last_message_watermark, watermarkBeforeTranscription)

  // 2) A transcrição chega depois (mesma message_key, nova versão da
  // mensagem canônica).
  providerBox.calls = []

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    summaries,
    reconciliation: pendingFixtures.reconciliation,
    messages: [
      {
        ...audioMessageRow({
          id: 'message-audio-cancel',
          messageKey: 'whatsapp-audio-cancel',
          transcription: 'Quero cancelar.',
        }),
        version: 2,
      },
    ],
  }).admin

  const secondRead = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const secondBody = await secondRead.json()

  assert.notEqual(secondBody.data.current_message_watermark, watermarkBeforeTranscription)
  assert.equal(secondBody.data.has_unsaved_changes, true)
  assert.equal(secondBody.data.working_summary, providerBox.workingSummary)

  const prompt = JSON.parse(providerBox.calls[0].user_prompt)
  assert.equal(prompt.current_or_new_messages[0].text, 'Quero cancelar.')
})

test('troca de conversa não mistura transcrição de áudio entre conversas diferentes', async () => {
  providerBox.calls = []

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-1',
      },
    ],
    messages: [
      audioMessageRow({ transcription: 'Áudio da conversa 1.' }),
    ],
  }).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const firstConversation = await fetchPOST(
    fetchRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )
  const firstConversationBody = await firstConversation.json()

  const secondConversation = await fetchPOST(
    fetchRequest({
      token,
      body: {
        cycle_id: IDS.cycleA2,
        conversation_key: CONVERSATION_KEY_2,
      },
    }),
  )
  const secondConversationBody = await secondConversation.json()

  assert.equal(firstConversationBody.data.pending_audio_transcription_count, 0)
  assert.equal(secondConversationBody.data.pending_audio_transcription_count, 0)
  assert.equal(secondConversationBody.data.working_summary, null)
  assert.equal(secondConversationBody.data.messages_used_count, 0)
})
