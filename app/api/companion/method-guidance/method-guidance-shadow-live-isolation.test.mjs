// Testes de isolamento live x shadow do POST /api/companion/method-guidance
// (operation=generate_message), reutilizando a infraestrutura de teste de
// rota já usada por outras rotas do Companion (ver
// register-conversation-route.test.mjs, lead-summary-route.test.mjs).
//
// Cobre os cenários obrigatórios da Shadow Validation (Message
// Intelligence Engine V1):
// 1) a rota continua devolvendo o resultado legacy;
// 2) MIE nunca substitui o resultado legacy;
// 3) falha ao publicar o job shadow não altera o status HTTP nem o body
//    da geração legacy;
// 4) falha ao inserir a run shadow (execution failure antes mesmo do
//    worker) não altera a geração legacy;
// 5-8) nenhum campo relacionado ao MIE (selected/blocked/no_acceptable/
//    shadow/candidate/score/gate) aparece no corpo da resposta;
// 9) nenhum arquivo da extensão precisa mudar — não testado aqui
//    (comprovado por não termos tocado nenhum arquivo em
//    app/extension/**, ver relatório).
//
// Também comprova device independence do lado do enqueue: o job nunca
// carrega device_key, mesmo a rota conhecendo apenas identidade/token.

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

const realNextServer =
  await import('next/server')

const afterBox = {
  callbacks: [],
}

mock.module('next/server', {
  namedExports: {
    NextResponse:
      realNextServer.NextResponse,
    after(callback) {
      afterBox.callbacks.push(callback)
    },
  },
})

const adminBox = {
  admin: null,
  tables: null,
}

const sendBox = {
  calls: [],
  shouldFail: false,
  pending: null,
}

const providerBox = {
  calls: [],
  onCall: null,
}

const queryBox = {
  beforeResolve: null,
}

test.afterEach(() => {
  queryBox.beforeResolve = null
})

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => adminBox.admin,
  },
})

mock.module('@vercel/queue', {
  namedExports: {
    send: async (topic, message, options) => {
      sendBox.calls.push({ topic, message, options })

      if (sendBox.pending) {
        await sendBox.pending
      }

      if (sendBox.shouldFail) {
        throw new Error('fake queue publish failure')
      }

      return { id: 'fake-message-id' }
    },
  },
})

mock.module(
  '../../../lib/companion/stateful-copilot-openai-provider',
  {
    namedExports: {
      createStatefulCopilotOpenAIProvider:
        () => async (request) => {
          providerBox.calls.push(request)

          if (providerBox.onCall) {
            await providerBox.onCall(request)
          }

          const isReview =
            'changed' in
            (request.structured_output_format?.schema
              ?.properties ?? {})

          return {
            provider: 'test',
            content: isReview
              ? JSON.stringify({
                  message:
                    'Olá! Vou verificar isso com calma e te retorno em breve.',
                  changed: false,
                  issue_code: 'none',
                })
              : JSON.stringify({
                  message:
                    'Olá! Vou verificar isso com calma e te retorno em breve.',
                }),
          }
        },
    },
  },
)

const {
  loadCanonicalLedgerAtReferenceTime,
} =
  await import(
    '../../../lib/companion/stateful-copilot-real-context-loader.ts'
  )

const { POST } = await import('./route.ts')

const IDS = {
  company: 'aaaaaaaa-0000-4000-8000-000000000001',
  user: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  cycle: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  lead: 'aaaaaaaa-0000-4000-8000-0000000000e1',
  configVersion: 'aaaaaaaa-0000-4000-8000-0000000000f1',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function buildQueryClass(tables) {
  return class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.inFilters = []
      this.upperBounds = []
      this.rangeFrom = null
      this.rangeTo = null
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

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    range(from, to) {
      this.rangeFrom = from
      this.rangeTo = to
      return this
    }

    order() {
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    insert(row) {
      const rows = Array.isArray(row) ? row : [row]

      for (const item of rows) {
        tables[this.table].push({ ...item })
      }

      return {
        then: (onFulfilled) =>
          Promise.resolve({ data: rows, error: null }).then(onFulfilled),
      }
    }

    update(patch) {
      this.pendingPatch = patch
      return this
    }

    resolveRows() {
      queryBox.beforeResolve?.({
        table: this.table,
        filters: this.filters.map((item) => ({ ...item })),
        upperBounds: this.upperBounds.map((item) => ({ ...item })),
      })

      let rows = (tables[this.table] ?? []).filter(
        (row) =>
          matchesFilters(row, this.filters) &&
          this.inFilters.every((filter) =>
            filter.values.includes(row[filter.column]),
          ) &&
          this.upperBounds.every((filter) =>
            row[filter.column] <= filter.value,
          ),
      )

      if (this.pendingPatch) {
        for (const row of rows) {
          Object.assign(row, this.pendingPatch)
        }

        return { data: rows, error: null }
      }

      if (
        this.rangeFrom !== null &&
        this.rangeTo !== null
      ) {
        rows = rows.slice(
          this.rangeFrom,
          this.rangeTo + 1,
        )
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
  reconciliation,
  messages,
  configVersions,
  shadowRuns = [],
}) {
  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    conversation_message_reconciliation_state: reconciliation,
    conversation_messages: messages,
    company_commercial_config_versions: configVersions,
    message_intelligence_shadow_runs: shadowRuns,
  }

  const Query = buildQueryClass(tables)

  return {
    admin: {
      from(table) {
        return new Query(table)
      },
    },
    shadowRuns,
    tables,
  }
}

function methodDefinition() {
  return {
    contract_version: 'commercial-method-v2',
    name: 'Método Teste',
    description: 'Método consultivo publicado.',
    principles: ['Responder fatos antes de avançar.'],
    stages: [
      {
        key: 'diagnostico',
        display_order: 1,
        name: 'Diagnóstico',
        objective: 'Entender a necessidade.',
        requirement: 'required',
        completion_criteria: ['Necessidade compreendida.'],
        partial_completion_criteria: ['Existe contexto inicial.'],
        skip_conditions: [],
        recommended_questions: ['O que você precisa resolver?'],
        common_mistakes: ['Apresentar cedo demais.'],
        deepen_when: ['A necessidade ainda estiver genérica.'],
        sufficient_when: ['A necessidade estiver clara.'],
        advance_when: ['Existe informação suficiente.'],
        wait_when: ['O cliente pediu tempo.'],
        stop_asking_when: ['A resposta já está clara.'],
        dimensions: [],
      },
    ],
  }
}

function baseFixtures() {
  return {
    memberships: [
      {
        company_id: IDS.company,
        user_id: IDS.user,
        role: 'member',
        is_active: true,
      },
    ],
    cycles: [
      {
        id: IDS.cycle,
        company_id: IDS.company,
        lead_id: IDS.lead,
        owner_user_id: IDS.user,
      },
    ],
    reconciliation: [],
    messages: [],
    configVersions: [
      {
        id: IDS.configVersion,
        version_number: 1,
        commercial_method_name: 'Método Teste',
        commercial_method_description: 'Método consultivo.',
        commercial_method_contract_version: 'commercial-method-v2',
        commercial_method_definition: methodDefinition(),
        business_description: 'Empresa de exemplo.',
        target_audience: 'Times comerciais.',
        value_proposition: 'Organizar a execução comercial.',
        communication_tone: 'Direto e claro.',
        required_behaviors: ['Responder objetivamente.'],
        prohibited_behaviors: ['Inventar condição comercial.'],
        company_id: IDS.company,
        status: 'published',
      },
    ],
  }
}

function generateMessageRequest({ token }) {
  return new Request(
    'http://localhost/api/companion/method-guidance',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? bearerHeader(token) : {}),
      },
      body: JSON.stringify({
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        operation: 'generate_message',
        seller_intent:
          'Quero confirmar que vou verificar o assunto com calma.',
      }),
    },
  )
}

async function flushAfterCallbacks() {
  const callbacks =
    afterBox.callbacks.splice(
      0,
      afterBox.callbacks.length,
    )

  await Promise.all(
    callbacks.map((callback) =>
      callback(),
    ),
  )
}

async function callGenerateMessage({
  flushAfter = true,
} = {}) {
  const token = buildToken({
    sub: IDS.user,
    companyId: IDS.company,
  })

  const response = await POST(
    generateMessageRequest({ token }),
  )

  const body = await response.json()

  if (flushAfter) {
    await flushAfterCallbacks()
  }

  return { response, body }
}

function fullResponseKeySet(value, prefix = '') {
  const keys = new Set()

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    for (const [key, nested] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      keys.add(path)

      for (const nestedKey of fullResponseKeySet(nested, path)) {
        keys.add(nestedKey)
      }
    }
  }

  return keys
}

const FORBIDDEN_RESPONSE_KEY_PATTERN =
  /shadow|candidate|hard_gate|critic|mie_|selected_overall_score|would_surface|governance|technique_selection|commercial_move|situation/i

test(
  '1/2/5/6/7/8. resposta de generate_message só contém o resultado legacy — nenhum campo do MIE aparece',
  async () => {
    sendBox.shouldFail = false
    sendBox.calls = []
    sendBox.pending = null
    providerBox.calls = []
    providerBox.onCall = null
    afterBox.callbacks = []

    const { admin } =
      createFakeAdmin(baseFixtures())
    adminBox.admin = admin

    const { response, body } =
      await callGenerateMessage()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)

    assert.deepEqual(
      Object.keys(body).sort(),
      ['data', 'ok'],
    )

    assert.deepEqual(
      Object.keys(body.data).sort(),
      ['error', 'message', 'status'],
    )

    for (const key of fullResponseKeySet(body)) {
      assert.equal(
        FORBIDDEN_RESPONSE_KEY_PATTERN.test(key),
        false,
        `campo "${key}" não deveria estar na resposta seller-facing`,
      )
    }
  },
)

test(
  '3. falha ao publicar o job shadow não altera status HTTP nem body da geração legacy',
  async () => {
    const { admin } =
      createFakeAdmin(baseFixtures())
    adminBox.admin = admin

    sendBox.shouldFail = false
    sendBox.calls = []
    sendBox.pending = null
    providerBox.calls = []
    providerBox.onCall = null
    afterBox.callbacks = []
    const { response: okResponse, body: okBody } =
      await callGenerateMessage()

    const { admin: admin2 } =
      createFakeAdmin(baseFixtures())
    adminBox.admin = admin2

    sendBox.shouldFail = true
    sendBox.calls = []
    const { response: failResponse, body: failBody } =
      await callGenerateMessage()

    assert.equal(okResponse.status, failResponse.status)
    assert.deepEqual(okBody, failBody)
  },
)

test(
  '4. falha ao persistir a run shadow (insert) não altera a geração legacy',
  async () => {
    const fixtures = baseFixtures()

    const { admin } =
      createFakeAdmin(fixtures)

    // Simula falha ao inserir em message_intelligence_shadow_runs:
    // remove a tabela do admin para provocar erro na primitive de
    // enqueue, sem tocar em nenhuma outra tabela usada pelo caminho
    // legacy.
    const originalFrom = admin.from.bind(admin)
    admin.from = (table) => {
      if (table === 'message_intelligence_shadow_runs') {
        return {
          insert: () => ({
            then: (onFulfilled) =>
              Promise.resolve({
                data: null,
                error: { message: 'table missing (test)' },
              }).then(onFulfilled),
          }),
        }
      }

      return originalFrom(table)
    }

    adminBox.admin = admin
    sendBox.shouldFail = false
    sendBox.calls = []
    sendBox.pending = null
    providerBox.calls = []
    providerBox.onCall = null
    afterBox.callbacks = []

    const { response, body } =
      await callGenerateMessage()

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(typeof body.data.status, 'string')

    // Nenhuma mensagem chegou a ser publicada na fila, já que o
    // enqueue nunca chega a existir uma run persistida para publicar.
    assert.equal(sendBox.calls.length, 0)
  },
)

test(
  'shadow job publicado nunca carrega device_key nem nenhum campo shadow no payload que chega ao Companion',
  async () => {
    const { admin } =
      createFakeAdmin(baseFixtures())
    adminBox.admin = admin

    sendBox.shouldFail = false
    sendBox.calls = []
    sendBox.pending = null
    providerBox.calls = []
    providerBox.onCall = null
    afterBox.callbacks = []

    const { body } =
      await callGenerateMessage()

    assert.equal(sendBox.calls.length, 1)

    const publishedJob = sendBox.calls[0].message

    assert.equal('device_key' in publishedJob, false)
    assert.equal(
      publishedJob.company_id,
      IDS.company,
    )
    assert.equal(
      publishedJob.cycle_id,
      IDS.cycle,
    )
    assert.equal(
      typeof publishedJob.shadow_run_id,
      'string',
    )

    // O corpo devolvido ao Companion nunca referencia shadow_run_id
    // nem qualquer outro identificador do shadow job.
    assert.equal(
      JSON.stringify(body).includes(
        publishedJob.shadow_run_id,
      ),
      false,
    )
  },
)


test(
  'cutoff é congelado antes da geração: mensagem que chega durante o modelo legacy não entra naquele contexto e fica posterior ao reference_time shadow',
  async () => {
    const fixtures =
      baseFixtures()

    fixtures.messages = [
      {
        id: 1,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'before-cutoff',
        version: 1,
        direction: 'incoming',
        occurred_at:
          '2026-09-01T00:00:00.000Z',
        observed_at:
          '2026-09-01T00:00:01.000Z',
        text_content:
          'Mensagem que já existia antes da geração.',
        audio_transcription: null,
        content_type: 'text',
        is_deleted: false,
      },
    ]

    fixtures.reconciliation = [
      {
        company_id: IDS.company,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 1,
        message_key: 'before-cutoff',
      },
    ]

    const {
      admin,
      tables,
    } =
      createFakeAdmin(fixtures)

    adminBox.admin = admin
    adminBox.tables = tables

    sendBox.shouldFail = false
    sendBox.calls = []
    sendBox.pending = null
    providerBox.calls = []
    afterBox.callbacks = []

    let insertedObservedAt = null
    let inserted = false

    providerBox.onCall = async () => {
      if (inserted) {
        return
      }

      inserted = true
      insertedObservedAt =
        new Date(
          Date.now() + 60_000,
        ).toISOString()

      tables.conversation_messages.push({
        id: 2,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'during-generation',
        version: 1,
        direction: 'incoming',
        occurred_at:
          insertedObservedAt,
        observed_at:
          insertedObservedAt,
        text_content:
          'Mensagem nova durante a geração.',
        audio_transcription: null,
        content_type: 'text',
        is_deleted: false,
      })

      tables.conversation_message_reconciliation_state.push({
        company_id: IDS.company,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 2,
        message_key: 'during-generation',
      })
    }

    const {
      response,
    } =
      await callGenerateMessage()

    assert.equal(
      response.status,
      200,
    )

    assert.equal(
      sendBox.calls.length,
      1,
    )

    const job =
      sendBox.calls[0].message

    assert.ok(insertedObservedAt)
    assert.ok(
      Date.parse(job.reference_time) <
        Date.parse(insertedObservedAt),
    )

    assert.equal(
      JSON.stringify(providerBox.calls)
        .includes(
          'Mensagem nova durante a geração.',
        ),
      false,
    )
  },
)

test(
  'enqueue shadow artificialmente lento não atrasa o retorno legacy',
  async () => {
    const {
      admin,
      tables,
    } =
      createFakeAdmin(
        baseFixtures(),
      )

    adminBox.admin = admin
    adminBox.tables = tables

    sendBox.shouldFail = false
    sendBox.calls = []
    providerBox.calls = []
    providerBox.onCall = null
    afterBox.callbacks = []

    let releaseQueue
    sendBox.pending =
      new Promise((resolve) => {
        releaseQueue = resolve
      })

    const legacyResult =
      await Promise.race([
        callGenerateMessage({
          flushAfter: false,
        }),
        new Promise((resolve) => {
          setTimeout(
            () => resolve('timeout'),
            100,
          )
        }),
      ])

    assert.notEqual(
      legacyResult,
      'timeout',
    )

    assert.equal(
      afterBox.callbacks.length,
      1,
    )

    const afterPromise =
      flushAfterCallbacks()

    await Promise.resolve()

    assert.equal(
      sendBox.calls.length,
      1,
    )

    releaseQueue()
    await afterPromise

    sendBox.pending = null
  },
)


test(
  'adversarial T0/T1: mensagem observada após cutoff e injetada antes da resolução do contexto não entra nem no Legacy nem no MIE da run',
  async () => {
    const fixtures =
      baseFixtures()

    fixtures.messages = [
      {
        id: 1,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'before-cutoff-race',
        version: 1,
        direction: 'incoming',
        occurred_at:
          '2026-08-29T21:58:00.000Z',
        observed_at:
          '2026-08-29T21:58:01.000Z',
        text_content:
          'Mensagem legítima anterior ao cutoff.',
        audio_transcription: null,
        content_type: 'text',
        is_deleted: false,
      },
    ]

    fixtures.reconciliation = [
      {
        company_id: IDS.company,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 1,
        message_key: 'before-cutoff-race',
      },
    ]

    const {
      admin,
      tables,
    } =
      createFakeAdmin(fixtures)

    adminBox.admin = admin
    adminBox.tables = tables

    sendBox.shouldFail = false
    sendBox.calls = []
    sendBox.pending = null
    providerBox.calls = []
    providerBox.onCall = null
    afterBox.callbacks = []

    const postCutoffObservedAt =
      '2099-01-01T00:00:00.000Z'

    const postCutoffText =
      'MENSAGEM_RACE_POST_CUTOFF'

    let injected = false

    queryBox.beforeResolve = ({
      table,
    }) => {
      if (
        table !== 'conversation_messages' ||
        injected
      ) {
        return
      }

      injected = true

      tables.conversation_messages.push({
        id: 2,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'post-cutoff-race',
        version: 1,
        direction: 'incoming',
        occurred_at:
          postCutoffObservedAt,
        observed_at:
          postCutoffObservedAt,
        text_content:
          postCutoffText,
        audio_transcription: null,
        content_type: 'text',
        is_deleted: false,
      })

      // Se o caminho ainda dependesse de current reconciliation,
      // esta versão nova já estaria visível no instante da resolução.
      tables.conversation_message_reconciliation_state.push({
        company_id: IDS.company,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 2,
        message_key: 'post-cutoff-race',
      })
    }

    const {
      response,
    } =
      await callGenerateMessage()

    assert.equal(
      response.status,
      200,
    )
    assert.equal(
      injected,
      true,
    )
    assert.equal(
      sendBox.calls.length,
      1,
    )

    const job =
      sendBox.calls[0].message

    assert.ok(
      Date.parse(job.reference_time) <
        Date.parse(postCutoffObservedAt),
    )

    // Legacy: a mensagem injetada antes da resolução da query não
    // pode atravessar o cutoff e chegar ao provider.
    assert.equal(
      JSON.stringify(providerBox.calls)
        .includes(postCutoffText),
      false,
    )

    // MIE: a mesma primitive histórica, com o mesmo reference_time
    // persistido no job, também precisa excluí-la.
    const mieSnapshot =
      await loadCanonicalLedgerAtReferenceTime({
        client: admin,
        companyId: IDS.company,
        cycleId: IDS.cycle,
        conversationKey:
          CONVERSATION_KEY,
        referenceTime:
          job.reference_time,
      })

    assert.equal(
      mieSnapshot.canonicalMessages.some(
        (message) =>
          message.text_content ===
          postCutoffText,
      ),
      false,
    )

    assert.deepEqual(
      mieSnapshot.canonicalMessages.map(
        (message) =>
          message.message_key,
      ),
      ['before-cutoff-race'],
    )
  },
)
