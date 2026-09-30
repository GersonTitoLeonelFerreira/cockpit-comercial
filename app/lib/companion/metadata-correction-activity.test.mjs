// Correção de captura não é atividade nova da conversa.
//
// Caso real (Júlia, HML): o PDF enviado pela vendedora foi gravado como
// incoming (versão 1, observada em 29/09 com o resto da conversa). Com a
// correção da direção na captura, ele ganha uma versão 2 outgoing observada
// dias depois. Como versão > 1 contava pela hora da observação, só o PDF
// viraria a "sessão atual" e a primeira leitura depois de zerar o estado
// leria uma mensagem só. Nenhum texto de cliente real neste arquivo.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeMessageActivityTimestamps,
  findContentOriginVersion,
} from './message-activity-time.ts'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract.ts'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
  buildCompanionDiagnosticInput,
} from './diagnostic-input.ts'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  buildStatefulCopilotInput,
} from './stateful-copilot-input.ts'

import {
  buildStatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan.ts'

import {
  buildCanonicalLedger,
  selectStatefulDiagnosticMessages,
} from './stateful-copilot-real-context-loader.ts'

const COMPANY = '10000000-0000-4000-8000-000000000001'
const CYCLE = '20000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000000'

// Conversa de um dia só (29/09), toda observada numa captura às 22:35,
// com um anexo enviado pela vendedora no meio.
const SESSION = [
  ['101', 'k-101', 'incoming', '2026-09-29T20:30:00Z', 'Mensagem 1 da cliente'],
  ['102', 'k-102', 'outgoing', '2026-09-29T20:31:00Z', 'Mensagem 2 da vendedora'],
  ['103', 'k-103', 'incoming', '2026-09-29T20:36:00Z', 'Mensagem 3 da cliente'],
  ['104', 'k-pdf', 'incoming', '2026-09-29T20:37:00Z', '[Arquivo: grade.pdf]'],
  ['105', 'k-105', 'outgoing', '2026-09-29T20:38:00Z', 'Mensagem 5 da vendedora'],
  ['106', 'k-106', 'incoming', '2026-09-29T20:39:00Z', 'Mensagem 6 da cliente'],
]

const FIRST_CAPTURE = '2026-09-29T22:35:42Z'
const CORRECTION_CAPTURE = '2026-10-01T14:00:00Z'

function row({
  id,
  key,
  version = 1,
  direction,
  occurredAt,
  observedAt = FIRST_CAPTURE,
  text,
  isDeleted = false,
}) {
  return {
    id,
    company_id: COMPANY,
    cycle_id: CYCLE,
    conversation_key: CONVERSATION,
    message_key: key,
    version,
    direction,
    author_kind:
      direction === 'incoming'
        ? 'customer'
        : 'human_agent',
    occurred_at: occurredAt,
    observed_at: observedAt,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
    is_deleted: isDeleted,
    deletion_reason: isDeleted ? 'explicit_deletion' : null,
  }
}

function sessionRows() {
  return SESSION.map(([id, key, direction, occurredAt, text]) =>
    row({ id, key, direction, occurredAt, text }),
  )
}

// A captura corrigida grava a versão 2 do anexo, agora outgoing.
function directionCorrectionRow() {
  return row({
    id: '120',
    key: 'k-pdf',
    version: 2,
    direction: 'outgoing',
    occurredAt: '2026-09-29T20:37:00Z',
    observedAt: CORRECTION_CAPTURE,
    text: '[Arquivo: grade.pdf]',
  })
}

function canonical(rows) {
  return buildCanonicalLedger({
    rows,
    companyId: COMPANY,
    cycleId: CYCLE,
    conversationKey: CONVERSATION,
  }).canonicalMessages
}

function diagnosticInput(canonicalMessages, referenceTime) {
  return buildCompanionDiagnosticInput({
    company_id: COMPANY,
    cycle_id: CYCLE,
    conversation_key: CONVERSATION,
    current_crm_status: 'contato',
    reference_time: referenceTime,
    messages: canonicalMessages,
    commercial_config: null,
    products: [],
  })
}

function statefulInput(canonicalMessages, {
  referenceTime = '2026-10-01T14:05:00Z',
  previousState = null,
} = {}) {
  const diagnostic =
    diagnosticInput(canonicalMessages, referenceTime)

  return buildStatefulCopilotInput({
    diagnostic_input: diagnostic,
    previous_state: previousState,
    known_message_ids: canonicalMessages.map((message) => message.id),
  })
}

function previousState(updatedAt) {
  return {
    contract_version: STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
    cycle_id: CYCLE,
    version: 1,
    commercial_role: 'buyer',
    current_moment: { summary: 'Leitura anterior.', evidence_message_ids: ['106'] },
    current_priority: { summary: 'Prioridade anterior.', evidence_message_ids: ['106'] },
    last_analyzed_message_ids: ['106'],
    last_evidence_message_ids: ['106'],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}

const ALL_SESSION_IDS = ['101', '102', '103', '105', '106']

// ---------------------------------------------------------------------------
// Origem do conteúdo
// ---------------------------------------------------------------------------

test('versão que só corrige metadados herda a origem do conteúdo; edição, exclusão e transcrição não', () => {
  const base = {
    version: 1,
    observed_at: '2026-09-29T22:35:42Z',
    text_content: 'olá',
    audio_transcription: null,
    is_deleted: false,
  }

  const later = '2026-10-01T14:00:00Z'

  // direção/autoria/tipo mudaram, conteúdo igual → origem na versão 1
  assert.equal(
    findContentOriginVersion([base, { ...base, version: 2, observed_at: later }]).version,
    1,
  )

  // edição, transcrição e exclusão → origem na versão nova
  for (const change of [
    { text_content: 'olá, tudo bem?' },
    { audio_transcription: 'transcrição nova' },
    { is_deleted: true },
  ]) {
    assert.equal(
      findContentOriginVersion([base, { ...base, ...change, version: 2, observed_at: later }]).version,
      2,
    )
  }

  // correção de metadados depois de uma edição → origem na edição
  assert.equal(
    findContentOriginVersion([
      base,
      { ...base, text_content: 'editado', version: 2, observed_at: later },
      { ...base, text_content: 'editado', version: 3, observed_at: '2026-10-02T10:00:00Z' },
    ]).version,
    2,
  )
})

test('correção de direção fica na hora da conversa; edição real continua sendo atividade de agora', () => {
  const activity =
    computeMessageActivityTimestamps([
      { id: 'a', version: 1, occurred_at: '2026-09-29T20:36:00Z', observed_at: FIRST_CAPTURE },
      {
        id: 'pdf',
        version: 2,
        occurred_at: '2026-09-29T20:37:00Z',
        observed_at: CORRECTION_CAPTURE,
        content_version: 1,
        content_observed_at: FIRST_CAPTURE,
      },
      { id: 'edit', version: 2, occurred_at: '2026-09-29T20:38:00Z', observed_at: CORRECTION_CAPTURE },
    ])

  assert.equal(activity.get('pdf'), Date.parse(FIRST_CAPTURE))
  assert.equal(activity.get('edit'), Date.parse(CORRECTION_CAPTURE))
})

// ---------------------------------------------------------------------------
// Ledger → sessão (context loader)
// ---------------------------------------------------------------------------

test('o ledger marca só a correção de metadados com a origem do conteúdo', () => {
  const messages =
    canonical([...sessionRows(), directionCorrectionRow()])

  const pdf =
    messages.find((message) => message.message_key === 'k-pdf')

  assert.equal(pdf.id, '120')
  assert.equal(pdf.direction, 'outgoing')
  assert.equal(pdf.content_version, 1)
  assert.equal(pdf.content_observed_at, new Date(FIRST_CAPTURE).toISOString())

  for (const message of messages) {
    if (message.message_key !== 'k-pdf') {
      assert.equal('content_version' in message, false, message.id)
    }
  }
})

test('context loader: depois da correção de direção a sessão atual continua sendo a conversa inteira', () => {
  const selected =
    selectStatefulDiagnosticMessages(
      canonical([...sessionRows(), directionCorrectionRow()]),
    ).map((message) => message.id)

  assert.deepEqual(
    [...selected].sort(),
    [...ALL_SESSION_IDS, '120'].sort(),
  )
})

test('context loader: edição real observada dias depois continua sendo a sessão de agora', () => {
  const edited =
    row({
      id: '121',
      key: 'k-106',
      version: 2,
      direction: 'incoming',
      occurredAt: '2026-09-29T20:39:00Z',
      observedAt: CORRECTION_CAPTURE,
      text: 'Mensagem 6 da cliente (editada)',
    })

  const messages =
    canonical([...sessionRows(), edited])

  assert.equal(
    'content_version' in messages.find((message) => message.id === '121'),
    false,
  )

  const plan =
    buildStatefulCopilotExecutionPlan(
      statefulInput(messages),
    )

  assert.equal(plan.mode, 'model')
  assert.deepEqual(
    plan.request.normalization_context.available_message_ids,
    ['121'],
  )
})

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

test('primeira leitura depois de uma correção de direção lê a sessão inteira, não só o anexo', () => {
  const messages =
    canonical([...sessionRows(), directionCorrectionRow()])

  const plan =
    buildStatefulCopilotExecutionPlan(
      statefulInput(messages),
    )

  assert.equal(plan.mode, 'model')
  assert.equal(plan.analysis_selection.kind, 'first_read')
  assert.deepEqual(
    [...plan.request.normalization_context.available_message_ids].sort(),
    [...ALL_SESSION_IDS, '120'].sort(),
  )

  // A origem do conteúdo só agrupa a sessão: o modelo recebe a mensagem
  // como sempre recebeu.
  const payload =
    JSON.parse(plan.request.user_prompt)

  const promptPdf =
    payload.input.diagnostic_input.conversation.messages
      .find((message) => message.id === '120')

  assert.equal(promptPdf.direction, 'outgoing')
  assert.equal('content_version' in promptPdf, false)
  assert.equal('content_observed_at' in promptPdf, false)
})

test('com leitura anterior, a correção de direção dispara releitura da sessão inteira sem contar como conteúdo novo', () => {
  const messages =
    canonical([...sessionRows(), directionCorrectionRow()])

  const plan =
    buildStatefulCopilotExecutionPlan(
      statefulInput(messages, {
        previousState: previousState('2026-09-30T18:27:05.720Z'),
      }),
    )

  assert.equal(plan.mode, 'model')
  assert.deepEqual(plan.analysis_selection, {
    kind: 'full_session',
    forced: false,
    new_or_changed_message_ids: ['120'],
    new_content_message_ids: [],
  })
  assert.deepEqual(
    [...plan.request.normalization_context.available_message_ids].sort(),
    [...ALL_SESSION_IDS, '120'].sort(),
  )
})

test('com leitura anterior e sem nenhuma versão nova, nada muda (não chama o modelo)', () => {
  const plan =
    buildStatefulCopilotExecutionPlan(
      statefulInput(canonical(sessionRows()), {
        referenceTime: '2026-09-30T18:34:00Z',
        previousState: previousState('2026-09-30T18:27:05.720Z'),
      }),
    )

  assert.equal(plan.mode, 'unchanged')
})

test('a origem do conteúdo precisa ser uma versão anterior da mesma mensagem', () => {
  const [first] = canonical(sessionRows())

  assert.throws(
    () =>
      diagnosticInput(
        [{ ...first, content_version: 1, content_observed_at: FIRST_CAPTURE }],
        '2026-10-01T14:05:00Z',
      ),
    (error) => error.code === 'INVALID_MESSAGE_CONTENT_ORIGIN',
  )
})

test('entrada do diagnóstico repassa a origem do conteúdo só da mensagem corrigida', () => {
  const diagnostic =
    diagnosticInput(
      canonical([...sessionRows(), directionCorrectionRow()]),
      '2026-10-01T14:05:00Z',
    )

  assert.equal(diagnostic.input_version, COMPANION_DIAGNOSTIC_INPUT_VERSION)
  assert.equal(diagnostic.diagnostic_contract_version, COMPANION_DIAGNOSTIC_CONTRACT_VERSION)

  const withOrigin =
    diagnostic.conversation.messages
      .filter((message) => 'content_version' in message)
      .map((message) => [message.id, message.content_version])

  assert.deepEqual(withOrigin, [['120', 1]])
})
