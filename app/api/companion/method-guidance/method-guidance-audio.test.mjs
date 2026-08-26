// Onda 7 / Frente 2 — Áudio como conteúdo real da interação atual.
//
// A rota /api/companion/method-guidance usa loadCanonicalMessages() para
// montar a "interação atual" (current_interaction) que alimenta tanto o
// gate de aplicabilidade (classifyLeadMethodApplicability) quanto a
// geração da mensagem sugerida (composeSellerMessage). Este arquivo cobre
// especificamente que um áudio transcrito chega como fala real do
// participante nessa interação, e que um áudio ainda sem transcrição não
// vira um buraco silencioso nem inventa conteúdo.

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
  sellerMessage: 'Mensagem gerada para revisão do vendedor.',
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

          if (
            request.prompt_version ===
            'lead-seller-message-v1'
          ) {
            return {
              content: JSON.stringify({
                message: providerBox.sellerMessage,
              }),
              provider: 'test',
            }
          }

          throw new Error(
            `prompt inesperado no teste: ${request.prompt_version}`,
          )
        },
    },
  },
)

const { POST } = await import('./route.ts')

const IDS = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  userA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycleA: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  leadA: 'aaaaaaaa-0000-4000-8000-0000000000e1',
  configVersionA: 'aaaaaaaa-0000-4000-8000-0000000000f1',
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
      this.orderColumn = null
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

    order(column) {
      this.orderColumn = column
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    resolveRows() {
      let rows = (tables[this.table] ?? []).filter(
        (row) =>
          matchesFilters(row, this.filters) &&
          this.inFilters.every((filter) => filter.values.includes(row[filter.column])),
      )

      if (this.orderColumn === 'version_number') {
        rows = [...rows].sort((a, b) => b.version_number - a.version_number)
      }

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

function createFakeAdmin({
  memberships,
  cycles,
  configVersions = [],
  methodSteps = [],
  reconciliation = [],
  messages = [],
}) {
  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    company_commercial_config_versions: configVersions,
    company_commercial_method_steps: methodSteps,
    conversation_message_reconciliation_state: reconciliation,
    conversation_messages: messages,
  }

  const Query = buildQueryClass(tables)

  return {
    from(table) {
      return new Query(table)
    },
  }
}

function fixtures() {
  return {
    memberships: [ACTIVE_MEMBERSHIP],
    cycles: [
      {
        id: IDS.cycleA,
        company_id: IDS.companyA,
        lead_id: IDS.leadA,
        owner_user_id: IDS.userA,
      },
    ],
    configVersions: [
      {
        id: IDS.configVersionA,
        status: 'published',
        version_number: 1,
        commercial_method_name: 'Método de teste',
        commercial_method_description:
          'Descrição válida do método comercial de teste.',
        commercial_method_contract_version: 'commercial-method-v1',
        commercial_method_definition: null,
        business_description: 'Empresa de teste.',
        target_audience: 'Público de teste.',
        value_proposition: 'Proposta de teste.',
        communication_tone: 'Tom neutro.',
        required_behaviors: ['Ser claro.'],
        prohibited_behaviors: ['Inventar fatos.'],
        company_id: IDS.companyA,
      },
    ],
  }
}

function audioMessageRow({
  id,
  messageKey,
  direction = 'incoming',
  occurredAt,
  transcription = null,
}) {
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

function generateMessageRequest({ token, body }) {
  return new Request('http://localhost/api/companion/method-guidance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? bearerHeader(token) : {}) },
    body: JSON.stringify({
      cycle_id: IDS.cycleA,
      conversation_key: CONVERSATION_KEY,
      operation: 'generate_message',
      seller_intent: 'Responder ao cliente agora.',
      working_summary: 'Resumo de teste do lead.',
      ...body,
    }),
  })
}

test('seller-message recebe a interação atual com a transcrição do áudio (não apenas o resumo)', async () => {
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
      audioMessageRow({
        id: 'message-audio-1',
        messageKey: 'whatsapp-audio-1',
        occurredAt: '2026-08-25T14:00:00.000Z',
        transcription: 'Quero saber se ainda dá tempo de mudar o plano.',
      }),
    ],
  })

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(generateMessageRequest({ token }))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.status, 'ready')
  assert.equal(body.data.message, providerBox.sellerMessage)

  const sellerMessageCall = providerBox.calls.find(
    (call) => call.prompt_version === 'lead-seller-message-v1',
  )
  const prompt = JSON.parse(sellerMessageCall.user_prompt)

  assert.equal(prompt.current_interaction.length, 1)
  assert.equal(prompt.current_interaction[0].direction, 'incoming')
  assert.equal(
    prompt.current_interaction[0].text,
    'Quero saber se ainda dá tempo de mudar o plano.',
  )
})

test('áudio ainda sem transcrição entra na interação atual como marcador técnico, nunca some silenciosamente nem inventa conteúdo', async () => {
  providerBox.calls = []

  adminBox.admin = createFakeAdmin({
    ...fixtures(),
    reconciliation: [
      {
        company_id: IDS.companyA,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 'message-audio-2',
      },
    ],
    messages: [
      audioMessageRow({
        id: 'message-audio-2',
        messageKey: 'whatsapp-audio-2',
        occurredAt: '2026-08-25T14:00:00.000Z',
        transcription: null,
      }),
    ],
  })

  const token = buildToken({ sub: IDS.userA, companyId: IDS.companyA })

  const response = await POST(generateMessageRequest({ token }))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.status, 'ready')

  const sellerMessageCall = providerBox.calls.find(
    (call) => call.prompt_version === 'lead-seller-message-v1',
  )
  const prompt = JSON.parse(sellerMessageCall.user_prompt)

  assert.equal(prompt.current_interaction.length, 1)
  assert.match(prompt.current_interaction[0].text, /ainda sem transcrição/i)
  assert.doesNotMatch(
    prompt.current_interaction[0].text,
    /cancelar|comprar|proposta|pagamento/i,
  )
})
