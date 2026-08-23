import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionConversationRegistrationError,
  computeConversationWatermark,
  loadCanonicalConversationForRegistration,
} from './companion-conversation-registration-loader.ts'

const COMPANY_A = '10000000-0000-4000-8000-000000000001'
const COMPANY_B = '10000000-0000-4000-8000-000000000002'

const CYCLE_A = '20000000-0000-4000-8000-000000000001'
const CYCLE_A2 = '20000000-0000-4000-8000-000000000002'

const LEAD_A = '40000000-0000-4000-8000-000000000001'
const LEAD_A2 = '40000000-0000-4000-8000-000000000002'

const OWNER_USER_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_USER_ID = '30000000-0000-4000-8000-000000000002'

const CONVERSATION_KEY = 'whatsapp:+5547999990001'

function buildToken({ companyId = COMPANY_A, userId = OWNER_USER_ID, role = 'member' } = {}) {
  return {
    sub: userId,
    company_id: companyId,
    role,
    iat: 1,
    exp: 9_999_999_999,
  }
}

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function createFakeAdmin({ memberships = [], cycles = [], reconciliation = [], messages = [] } = {}) {
  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    conversation_message_reconciliation_state: reconciliation,
    conversation_messages: messages,
  }

  class Query {
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

  return {
    from(table) {
      return new Query(table)
    },
  }
}

function membershipRow(overrides = {}) {
  return {
    company_id: COMPANY_A,
    user_id: OWNER_USER_ID,
    role: 'member',
    is_active: true,
    ...overrides,
  }
}

function cycleRow(overrides = {}) {
  return {
    id: CYCLE_A,
    company_id: COMPANY_A,
    lead_id: LEAD_A,
    owner_user_id: OWNER_USER_ID,
    ...overrides,
  }
}

function textMessage({ id, messageKey, version = 1, direction = 'incoming', occurredAt, text, isDeleted = false }) {
  return {
    id,
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    message_key: messageKey,
    version,
    direction,
    occurred_at: occurredAt,
    content_type: 'text',
    text_content: isDeleted ? null : text,
    audio_transcription: null,
    is_deleted: isDeleted,
  }
}

function baseFixtures(overrides = {}) {
  return {
    memberships: [membershipRow()],
    cycles: [cycleRow()],
    reconciliation: [
      { company_id: COMPANY_A, conversation_key: CONVERSATION_KEY, current_message_id: 1 },
      { company_id: COMPANY_A, conversation_key: CONVERSATION_KEY, current_message_id: 2 },
    ],
    messages: [
      textMessage({
        id: 1,
        messageKey: 'msg-1',
        occurredAt: '2026-08-20T10:00:00.000Z',
        text: 'Olá, quero saber mais sobre o plano.',
      }),
      textMessage({
        id: 2,
        messageKey: 'msg-2',
        direction: 'outgoing',
        occurredAt: '2026-08-20T10:05:00.000Z',
        text: 'Claro! Temos o plano mensal e o anual.',
      }),
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------
// A. Registro normal / carregamento canônico
// ---------------------------------------------------------------------

test('carrega o snapshot canônico com company/cycle/lead corretos e watermark determinístico', async () => {
  const admin = createFakeAdmin(baseFixtures())
  const token = buildToken()

  const snapshot = await loadCanonicalConversationForRegistration({
    admin,
    token,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  assert.equal(snapshot.company_id, COMPANY_A)
  assert.equal(snapshot.cycle_id, CYCLE_A)
  assert.equal(snapshot.lead_id, LEAD_A)
  assert.equal(snapshot.conversation_key, CONVERSATION_KEY)
  assert.equal(snapshot.message_count, 2)
  assert.equal(typeof snapshot.watermark, 'string')
  assert.ok(snapshot.watermark.length > 0)

  const secondSnapshot = await loadCanonicalConversationForRegistration({
    admin,
    token,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  assert.equal(
    secondSnapshot.watermark,
    snapshot.watermark,
    'o mesmo estado canônico precisa produzir o mesmo watermark',
  )
})

// ---------------------------------------------------------------------
// C. Nova versão -> novo watermark
// ---------------------------------------------------------------------

test('uma mensagem nova muda o watermark (nova versão do watermark é permitida)', async () => {
  const admin1 = createFakeAdmin(baseFixtures())
  const token = buildToken()

  const before = await loadCanonicalConversationForRegistration({
    admin: admin1,
    token,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  const fixturesWithNewMessage = baseFixtures()
  fixturesWithNewMessage.reconciliation.push({
    company_id: COMPANY_A,
    conversation_key: CONVERSATION_KEY,
    current_message_id: 3,
  })
  fixturesWithNewMessage.messages.push(
    textMessage({
      id: 3,
      messageKey: 'msg-3',
      occurredAt: '2026-08-20T10:10:00.000Z',
      text: 'E qual o valor do plano anual?',
    }),
  )

  const admin2 = createFakeAdmin(fixturesWithNewMessage)

  const after = await loadCanonicalConversationForRegistration({
    admin: admin2,
    token,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  assert.notEqual(after.watermark, before.watermark)
  assert.equal(after.message_count, 3)
})

// ---------------------------------------------------------------------
// H. Mensagens editadas/deletadas — o resumo consome só o estado canônico
// atual, mas o watermark reflete a mudança.
// ---------------------------------------------------------------------

test('uma edição (nova versão da mesma message_key) muda o watermark e o texto usado', async () => {
  const fixtures = baseFixtures()

  const before = await loadCanonicalConversationForRegistration({
    admin: createFakeAdmin(fixtures),
    token: buildToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  const editedFixtures = baseFixtures()
  // A versão 1 de msg-2 é substituída pela versão 2 (o ponteiro de
  // reconciliação passa a apontar para id=4).
  editedFixtures.reconciliation = [
    { company_id: COMPANY_A, conversation_key: CONVERSATION_KEY, current_message_id: 1 },
    { company_id: COMPANY_A, conversation_key: CONVERSATION_KEY, current_message_id: 4 },
  ]
  editedFixtures.messages.push(
    textMessage({
      id: 4,
      messageKey: 'msg-2',
      version: 2,
      direction: 'outgoing',
      occurredAt: '2026-08-20T10:05:00.000Z',
      text: 'Claro! Temos o plano mensal, semestral e o anual.',
    }),
  )

  const after = await loadCanonicalConversationForRegistration({
    admin: createFakeAdmin(editedFixtures),
    token: buildToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  assert.notEqual(after.watermark, before.watermark)

  const editedMessage = after.messages.find((message) => message.message_key === 'msg-2')
  assert.equal(editedMessage.version, 2)
  assert.match(editedMessage.text, /semestral/)
})

test('uma mensagem deletada (versão vigente is_deleted=true) some do conteúdo mas muda o watermark', async () => {
  const fixtures = baseFixtures()

  const before = await loadCanonicalConversationForRegistration({
    admin: createFakeAdmin(fixtures),
    token: buildToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  const deletedFixtures = baseFixtures()
  deletedFixtures.reconciliation = [
    { company_id: COMPANY_A, conversation_key: CONVERSATION_KEY, current_message_id: 1 },
    { company_id: COMPANY_A, conversation_key: CONVERSATION_KEY, current_message_id: 5 },
  ]
  deletedFixtures.messages.push(
    textMessage({
      id: 5,
      messageKey: 'msg-2',
      version: 2,
      direction: 'outgoing',
      occurredAt: '2026-08-20T10:05:00.000Z',
      text: null,
      isDeleted: true,
    }),
  )

  const after = await loadCanonicalConversationForRegistration({
    admin: createFakeAdmin(deletedFixtures),
    token: buildToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  assert.notEqual(after.watermark, before.watermark)
  assert.equal(after.message_count, 1, 'mensagem deletada não conta no message_count')

  const deletedMessage = after.messages.find((message) => message.message_key === 'msg-2')
  assert.equal(deletedMessage.is_deleted, true)
  assert.equal(deletedMessage.text, null)
})

// ---------------------------------------------------------------------
// I. Áudio — transcrição canônica pode entrar no resumo
// ---------------------------------------------------------------------

test('mensagem de áudio com transcrição canônica é incluída com o texto transcrito', async () => {
  const fixtures = baseFixtures()
  fixtures.reconciliation.push({
    company_id: COMPANY_A,
    conversation_key: CONVERSATION_KEY,
    current_message_id: 6,
  })
  fixtures.messages.push({
    id: 6,
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    message_key: 'msg-audio-1',
    version: 1,
    direction: 'incoming',
    occurred_at: '2026-08-20T10:07:00.000Z',
    content_type: 'audio',
    text_content: null,
    audio_transcription: 'Prefiro pagar no boleto.',
    is_deleted: false,
  })

  const snapshot = await loadCanonicalConversationForRegistration({
    admin: createFakeAdmin(fixtures),
    token: buildToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  const audioMessage = snapshot.messages.find((message) => message.message_key === 'msg-audio-1')
  assert.equal(audioMessage.content_type, 'audio')
  assert.equal(audioMessage.text, 'Prefiro pagar no boleto.')
})

test('mensagem de áudio sem transcrição não inventa texto', async () => {
  const fixtures = baseFixtures()
  fixtures.reconciliation.push({
    company_id: COMPANY_A,
    conversation_key: CONVERSATION_KEY,
    current_message_id: 7,
  })
  fixtures.messages.push({
    id: 7,
    company_id: COMPANY_A,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
    message_key: 'msg-audio-2',
    version: 1,
    direction: 'incoming',
    occurred_at: '2026-08-20T10:08:00.000Z',
    content_type: 'audio',
    text_content: null,
    audio_transcription: null,
    is_deleted: false,
  })

  const snapshot = await loadCanonicalConversationForRegistration({
    admin: createFakeAdmin(fixtures),
    token: buildToken(),
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  const audioMessage = snapshot.messages.find((message) => message.message_key === 'msg-audio-2')
  assert.equal(audioMessage.text, null)
})

// ---------------------------------------------------------------------
// E. Isolamento de tenant
// ---------------------------------------------------------------------

test('empresa B não consegue carregar o ciclo da empresa A (tenant isolation)', async () => {
  const fixtures = baseFixtures({
    memberships: [membershipRow({ company_id: COMPANY_B, user_id: OTHER_USER_ID })],
  })

  const admin = createFakeAdmin(fixtures)
  const token = buildToken({ companyId: COMPANY_B, userId: OTHER_USER_ID })

  await assert.rejects(
    () =>
      loadCanonicalConversationForRegistration({
        admin,
        token,
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
      }),
    (error) => {
      assert.ok(error instanceof CompanionConversationRegistrationError)
      assert.equal(error.code, 'CONVERSATION_REGISTRATION_CYCLE_NOT_FOUND')
      return true
    },
  )
})

test('usuário sem vínculo ativo com a empresa é bloqueado antes de tocar o ciclo', async () => {
  const admin = createFakeAdmin(baseFixtures({ memberships: [] }))
  const token = buildToken()

  await assert.rejects(
    () =>
      loadCanonicalConversationForRegistration({
        admin,
        token,
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
      }),
    (error) => {
      assert.ok(error instanceof CompanionConversationRegistrationError)
      assert.equal(error.code, 'CONVERSATION_REGISTRATION_MEMBERSHIP_REQUIRED')
      return true
    },
  )
})

test('vendedor sem ser dono do ciclo (e sem ser admin/manager) é bloqueado', async () => {
  const fixtures = baseFixtures({
    memberships: [membershipRow({ user_id: OTHER_USER_ID, role: 'member' })],
  })

  const admin = createFakeAdmin(fixtures)
  const token = buildToken({ userId: OTHER_USER_ID })

  await assert.rejects(
    () =>
      loadCanonicalConversationForRegistration({
        admin,
        token,
        cycle_id: CYCLE_A,
        conversation_key: CONVERSATION_KEY,
      }),
    (error) => {
      assert.ok(error instanceof CompanionConversationRegistrationError)
      assert.equal(error.code, 'CONVERSATION_REGISTRATION_PERMISSION_DENIED')
      return true
    },
  )
})

// ---------------------------------------------------------------------
// F. Isolamento de ciclo
// ---------------------------------------------------------------------

test('ciclo A não empresta mensagens/lead para o ciclo B da mesma empresa', async () => {
  const fixtures = baseFixtures({
    cycles: [cycleRow(), cycleRow({ id: CYCLE_A2, lead_id: LEAD_A2 })],
  })

  const admin = createFakeAdmin(fixtures)
  const token = buildToken()

  const snapshotA = await loadCanonicalConversationForRegistration({
    admin,
    token,
    cycle_id: CYCLE_A,
    conversation_key: CONVERSATION_KEY,
  })

  assert.equal(snapshotA.cycle_id, CYCLE_A)
  assert.equal(snapshotA.lead_id, LEAD_A)

  // O ciclo B existe na mesma empresa, mas não tem mensagens/reconciliação
  // próprias nesta fixture — não deve herdar as da conversa do ciclo A.
  await assert.rejects(
    () =>
      loadCanonicalConversationForRegistration({
        admin,
        token,
        cycle_id: CYCLE_A2,
        conversation_key: CONVERSATION_KEY,
      }),
    (error) => {
      assert.ok(error instanceof CompanionConversationRegistrationError)
      assert.equal(error.code, 'CONVERSATION_REGISTRATION_NO_MESSAGES')
      return true
    },
  )
})

// ---------------------------------------------------------------------
// computeConversationWatermark — pura
// ---------------------------------------------------------------------

test('computeConversationWatermark é independente da ordem de entrada (determinístico por conteúdo)', () => {
  const messages = [
    {
      message_key: 'a',
      version: 1,
      direction: 'incoming',
      occurred_at: '2026-08-20T10:00:00.000Z',
      content_type: 'text',
      text: 'oi',
      is_deleted: false,
    },
    {
      message_key: 'b',
      version: 1,
      direction: 'outgoing',
      occurred_at: '2026-08-20T10:01:00.000Z',
      content_type: 'text',
      text: 'olá',
      is_deleted: false,
    },
  ]

  const watermark1 = computeConversationWatermark(messages)
  const watermark2 = computeConversationWatermark([...messages].reverse())

  assert.equal(watermark1, watermark2)
})
