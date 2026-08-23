// Testes de integração das rotas de "Registrar conversa"
// (preview/route.ts e confirm/route.ts), reutilizando a mesma infraestrutura
// de teste de rota já usada por outras rotas do Companion em
// app/lib/companion/e2-test-support/ (ver message-action/route.test.mjs).
//
// Cobre os cenários obrigatórios da Fase 12A:
// A) registro normal; B) idempotência (mesmo watermark, dois cliques);
// C) nova versão (novo watermark permitido); E) isolamento de tenant;
// F) isolamento de ciclo; G) nenhuma mutação operacional (sales_cycles
// nunca recebe update/insert/delete neste fluxo); J) retry sem duplicidade.

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

import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()
process.env.OPENAI_API_KEY = 'fake-key-for-tests'

const adminBox = { admin: null }

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

const originalFetch = globalThis.fetch

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Resumo gerado pelo fetch global de teste.',
            }),
          },
        },
      ],
    }),
    { status: 200 },
  )

const { POST: previewPOST } = await import('./preview/route.ts')
const { POST: confirmPOST } = await import('./confirm/route.ts')

process.on('exit', () => {
  globalThis.fetch = originalFetch
})

const IDS = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  companyB: 'bbbbbbbb-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycleA: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  cycleA2: 'aaaaaaaa-0000-4000-8000-0000000000d2',
  leadA: 'aaaaaaaa-0000-4000-8000-0000000000e1',
  leadA2: 'aaaaaaaa-0000-4000-8000-0000000000e2',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'

const ACTIVE_MEMBERSHIP = {
  company_id: IDS.companyA,
  user_id: IDS.userA,
  role: 'member',
  is_active: true,
}

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function buildQueryClass(tables) {
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
      return Promise.resolve({ data: result.data[0] ?? null, error: null })
    }

    then(onFulfilled, onRejected) {
      return Promise.resolve(this.resolveRows()).then(onFulfilled, onRejected)
    }
  }
}

function createFakeAdmin({ memberships, cycles, reconciliation, messages }) {
  const registrations = []
  const rpcCalls = []
  let nextId = 1

  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    conversation_message_reconciliation_state: reconciliation,
    conversation_messages: messages,
    companion_conversation_registrations: registrations,
  }

  const Query = buildQueryClass(tables)

  const admin = {
    from(table) {
      return new Query(table)
    },

    async rpc(name, params) {
      rpcCalls.push({ name, params })

      if (name !== 'rpc_register_companion_conversation_summary') {
        return { data: null, error: { message: `RPC inesperada: ${name}` } }
      }

      const existing = registrations.find(
        (row) =>
          row.company_id === params.p_company_id &&
          row.cycle_id === params.p_cycle_id &&
          row.watermark === params.p_watermark,
      )

      if (existing) {
        return {
          data: [
            {
              registration_id: existing.id,
              occurred_at: existing.created_at,
              summary_text: existing.summary_text,
              already_registered: true,
            },
          ],
          error: null,
        }
      }

      const row = {
        id: `registration-${nextId}`,
        company_id: params.p_company_id,
        cycle_id: params.p_cycle_id,
        lead_id: params.p_lead_id,
        watermark: params.p_watermark,
        summary_text: params.p_summary_text,
        created_at: `2026-08-22T12:00:0${nextId}.000Z`,
      }

      nextId += 1
      registrations.push(row)

      return {
        data: [
          {
            registration_id: row.id,
            occurred_at: row.created_at,
            summary_text: row.summary_text,
            already_registered: false,
          },
        ],
        error: null,
      }
    },
  }

  return { admin, registrations, rpcCalls }
}

function textMessage({ id, cycleId, messageKey, direction = 'incoming', occurredAt, text }) {
  return {
    id,
    company_id: IDS.companyA,
    cycle_id: cycleId,
    conversation_key: CONVERSATION_KEY,
    message_key: messageKey,
    version: 1,
    direction,
    occurred_at: occurredAt,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
    is_deleted: false,
  }
}

function baseFixtures({ cycleId = IDS.cycleA, leadId = IDS.leadA, extraMessage } = {}) {
  const messages = [
    textMessage({
      id: 1,
      cycleId,
      messageKey: 'msg-1',
      occurredAt: '2026-08-20T10:00:00.000Z',
      text: 'Olá, quero saber mais sobre o plano.',
    }),
    textMessage({
      id: 2,
      cycleId,
      messageKey: 'msg-2',
      direction: 'outgoing',
      occurredAt: '2026-08-20T10:05:00.000Z',
      text: 'Claro! Temos o plano mensal e o anual.',
    }),
  ]

  const reconciliation = [
    { company_id: IDS.companyA, conversation_key: CONVERSATION_KEY, current_message_id: 1 },
    { company_id: IDS.companyA, conversation_key: CONVERSATION_KEY, current_message_id: 2 },
  ]

  if (extraMessage) {
    messages.push(textMessage({ id: 3, cycleId, ...extraMessage }))
    reconciliation.push({
      company_id: IDS.companyA,
      conversation_key: CONVERSATION_KEY,
      current_message_id: 3,
    })
  }

  return {
    memberships: [ACTIVE_MEMBERSHIP],
    cycles: [
      { id: IDS.cycleA, company_id: IDS.companyA, lead_id: IDS.leadA, owner_user_id: IDS.userA },
      { id: IDS.cycleA2, company_id: IDS.companyA, lead_id: IDS.leadA2, owner_user_id: IDS.userA },
    ],
    reconciliation,
    messages,
  }
}

function previewRequest({ token, body }) {
  return new Request('http://localhost/api/companion/register-conversation/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? bearerHeader(token) : {}) },
    body: JSON.stringify(body ?? {}),
  })
}

function confirmRequest({ token, body }) {
  return new Request('http://localhost/api/companion/register-conversation/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? bearerHeader(token) : {}) },
    body: JSON.stringify(body ?? {}),
  })
}

async function previewSnapshot(fixtures, token) {
  adminBox.admin = createFakeAdmin(fixtures).admin

  const response = await previewPOST(
    previewRequest({
      token,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY },
    }),
  )

  return response.json()
}

// ---------------------------------------------------------------------
// A. Registro normal
// ---------------------------------------------------------------------

test('preview: gera o resumo e devolve watermark quando não há registro anterior', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const body = await previewSnapshot(baseFixtures(), token)

  assert.equal(body.ok, true)
  assert.equal(body.data.already_registered, false)
  assert.equal(body.data.summary_text, 'Resumo gerado pelo fetch global de teste.')
  assert.equal(typeof body.data.watermark, 'string')
  assert.ok(body.data.watermark.length > 0)
})

test('confirm: registra a conversa e não altera nenhuma linha de sales_cycles', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()

  const preview = await previewSnapshot(fixtures, token)

  const { admin, registrations, rpcCalls } = createFakeAdmin(fixtures)
  adminBox.admin = admin

  const response = await confirmPOST(
    confirmRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        watermark: preview.data.watermark,
        summary_text: preview.data.summary_text,
      },
    }),
  )

  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.already_registered, false)
  assert.equal(body.data.summary_text, preview.data.summary_text)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].company_id, IDS.companyA)
  assert.equal(registrations[0].cycle_id, IDS.cycleA)
  assert.equal(registrations[0].lead_id, IDS.leadA)

  // A RPC é o único ponto de escrita: nenhuma chamada tenta gravar em
  // sales_cycles (nenhum .update()/.insert() é sequer suportado pelo fake).
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, 'rpc_register_companion_conversation_summary')
  assert.equal(rpcCalls[0].params.p_company_id, IDS.companyA)
  assert.equal(rpcCalls[0].params.p_cycle_id, IDS.cycleA)
  assert.equal(rpcCalls[0].params.p_lead_id, IDS.leadA)
  assert.equal(rpcCalls[0].params.p_seller_user_id, IDS.userA)
})

// ---------------------------------------------------------------------
// B. Idempotência — mesmo watermark, dois cliques
// J. Retry — repetir após uma resposta perdida não duplica
// ---------------------------------------------------------------------

test('confirm: dois cliques com o mesmo watermark persistem só um registro (idempotência / retry)', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  const preview = await previewSnapshot(fixtures, token)

  const { admin, registrations, rpcCalls } = createFakeAdmin(fixtures)
  adminBox.admin = admin

  const confirmBody = {
    cycle_id: IDS.cycleA,
    conversation_key: CONVERSATION_KEY,
    watermark: preview.data.watermark,
    summary_text: preview.data.summary_text,
  }

  const first = await (await confirmPOST(confirmRequest({ token, body: confirmBody }))).json()
  const second = await (await confirmPOST(confirmRequest({ token, body: confirmBody }))).json()

  assert.equal(first.ok, true)
  assert.equal(first.data.already_registered, false)

  assert.equal(second.ok, true)
  assert.equal(second.data.already_registered, true)
  assert.equal(second.data.registration_id, first.data.registration_id)

  assert.equal(registrations.length, 1, 'apenas um registro deve ser persistido')
  assert.equal(rpcCalls.length, 2, 'a RPC é chamada duas vezes, mas só grava uma vez')
})

// ---------------------------------------------------------------------
// C. Nova versão — mensagem nova gera um novo watermark e um novo registro
// ---------------------------------------------------------------------

test('confirm: uma mensagem nova entre dois registros produz um segundo registro distinto', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const fixturesBefore = baseFixtures()
  const previewBefore = await previewSnapshot(fixturesBefore, token)

  const { admin: adminShared, registrations } = createFakeAdmin(fixturesBefore)
  adminBox.admin = adminShared

  await confirmPOST(
    confirmRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        watermark: previewBefore.data.watermark,
        summary_text: previewBefore.data.summary_text,
      },
    }),
  )

  const fixturesAfter = baseFixtures({
    extraMessage: {
      messageKey: 'msg-3',
      occurredAt: '2026-08-20T10:10:00.000Z',
      text: 'E qual o valor do plano anual?',
    },
  })

  // Reaproveita a MESMA tabela de registrations (mesmo "banco") para simular
  // o segundo clique acontecendo depois que a conversa mudou.
  adminBox.admin = {
    from: adminShared.from,
    rpc: adminShared.rpc,
  }

  // Mas a query de mensagens/reconciliação precisa refletir o novo estado:
  // troca as tabelas de leitura mantendo o mesmo array de registrations.
  const QueryWithNewMessages = buildQueryClass({
    company_memberships: fixturesAfter.memberships,
    sales_cycles: fixturesAfter.cycles,
    conversation_message_reconciliation_state: fixturesAfter.reconciliation,
    conversation_messages: fixturesAfter.messages,
    companion_conversation_registrations: registrations,
  })

  adminBox.admin = {
    from(table) {
      return new QueryWithNewMessages(table)
    },
    rpc: adminShared.rpc,
  }

  const previewAfter = await previewSnapshot(fixturesAfter, token)

  assert.notEqual(previewAfter.data.watermark, previewBefore.data.watermark)

  adminBox.admin = {
    from(table) {
      return new QueryWithNewMessages(table)
    },
    rpc: adminShared.rpc,
  }

  const secondConfirmResponse = await confirmPOST(
    confirmRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        watermark: previewAfter.data.watermark,
        summary_text: previewAfter.data.summary_text,
      },
    }),
  )

  const secondConfirm = await secondConfirmResponse.json()

  assert.equal(secondConfirm.ok, true)
  assert.equal(secondConfirm.data.already_registered, false)
  assert.equal(registrations.length, 2, 'a nova versão da conversa cria um segundo registro')
})

// ---------------------------------------------------------------------
// watermark obsoleto (stale) — confirm recusa quando a conversa mudou
// entre o preview e a confirmação
// ---------------------------------------------------------------------

test('confirm: recusa com 409 quando o watermark enviado não bate com o estado canônico atual', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()

  const { admin, registrations } = createFakeAdmin(fixtures)
  adminBox.admin = admin

  const response = await confirmPOST(
    confirmRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        watermark: 'watermark-que-nunca-existiu',
        summary_text: 'Resumo qualquer.',
      },
    }),
  )

  const body = await response.json()

  assert.equal(response.status, 409)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'REGISTER_CONVERSATION_STALE_WATERMARK')
  assert.equal(registrations.length, 0)
})

// ---------------------------------------------------------------------
// E. Isolamento de tenant
// ---------------------------------------------------------------------

test('preview: empresa B não consegue gerar resumo do ciclo da empresa A', async () => {
  const fixtures = baseFixtures({})
  fixtures.memberships = [
    { company_id: IDS.companyB, user_id: 'bbbbbbbb-0000-4000-8000-0000000000a1', role: 'member', is_active: true },
  ]

  adminBox.admin = createFakeAdmin(fixtures).admin

  const token = buildToken({ sub: 'bbbbbbbb-0000-4000-8000-0000000000a1', companyId: IDS.companyB })

  const response = await previewPOST(
    previewRequest({ token, body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY } }),
  )

  const body = await response.json()

  assert.equal(response.status, 404)
  assert.equal(body.ok, false)
  assert.equal(body.code, 'CONVERSATION_REGISTRATION_CYCLE_NOT_FOUND')
})

test('confirm: token ausente é rejeitado antes de tocar o banco', async () => {
  adminBox.admin = createFakeAdmin(baseFixtures()).admin

  const response = await confirmPOST(
    confirmRequest({
      token: null,
      body: { cycle_id: IDS.cycleA, conversation_key: CONVERSATION_KEY, watermark: 'x', summary_text: 'x' },
    }),
  )

  assert.equal(response.status, 401)
})

// ---------------------------------------------------------------------
// F. Isolamento de ciclo
// ---------------------------------------------------------------------

test('preview: ciclo B da mesma empresa não herda as mensagens do ciclo A', async () => {
  const fixtures = baseFixtures()
  adminBox.admin = createFakeAdmin(fixtures).admin

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await previewPOST(
    previewRequest({ token, body: { cycle_id: IDS.cycleA2, conversation_key: CONVERSATION_KEY } }),
  )

  const body = await response.json()

  assert.equal(response.status, 422)
  assert.equal(body.code, 'CONVERSATION_REGISTRATION_NO_MESSAGES')
})

test('confirm: o registro do ciclo A nunca é associado ao lead do ciclo B', async () => {
  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })
  const fixtures = baseFixtures()
  const preview = await previewSnapshot(fixtures, token)

  const { admin, registrations, rpcCalls } = createFakeAdmin(fixtures)
  adminBox.admin = admin

  await confirmPOST(
    confirmRequest({
      token,
      body: {
        cycle_id: IDS.cycleA,
        conversation_key: CONVERSATION_KEY,
        watermark: preview.data.watermark,
        summary_text: preview.data.summary_text,
      },
    }),
  )

  assert.equal(rpcCalls[0].params.p_cycle_id, IDS.cycleA)
  assert.equal(rpcCalls[0].params.p_lead_id, IDS.leadA)
  assert.notEqual(registrations[0].lead_id, IDS.leadA2)
})
