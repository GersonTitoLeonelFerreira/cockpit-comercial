// Ordem dentro do mesmo minuto no backend.
//
// O horário do WhatsApp só tem minuto. O backend desempatava o minuto pelo
// message_key, e as chaves recebidas (3A…) vinham sempre antes das enviadas
// pelo WhatsApp Web (3EB0…): a IA lia toda a cliente antes da vendedora.
// Agora vale a ordem de gravação no ledger (id da primeira versão), que a
// captura grava na ordem da conversa. Textos sintéticos.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCompanionDiagnosticInput,
} from './diagnostic-input.ts'

import {
  buildStatefulCopilotInput,
} from './stateful-copilot-input.ts'

import {
  buildStatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan.ts'

import {
  buildCanonicalLedger,
} from './stateful-copilot-real-context-loader.ts'

const COMPANY = '10000000-0000-4000-8000-000000000001'
const CYCLE = '20000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000000'
const SAME_MINUTE = '2026-09-29T20:39:00Z'
const CAPTURE = '2026-09-29T22:35:42Z'

function row({ id, key, version = 1, direction, text, observedAt = CAPTURE }) {
  return {
    id,
    company_id: COMPANY,
    cycle_id: CYCLE,
    conversation_key: CONVERSATION,
    message_key: key,
    version,
    direction,
    author_kind: direction === 'incoming' ? 'customer' : 'human_agent',
    occurred_at: SAME_MINUTE,
    observed_at: observedAt,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
  }
}

// Gravadas na ordem da conversa (ids crescentes); em ordem de chave a
// cliente (3A…) viria toda antes.
function conversationRows() {
  return [
    row({ id: '501', key: '3EB0C', direction: 'outgoing', text: 'vendedora 1' }),
    row({ id: '502', key: '3EB0A', direction: 'outgoing', text: 'vendedora 2' }),
    row({ id: '503', key: '3AB', direction: 'incoming', text: 'cliente 1' }),
    row({ id: '504', key: '3EB0B', direction: 'outgoing', text: 'vendedora 3' }),
    row({ id: '505', key: '3AA', direction: 'incoming', text: 'cliente 2' }),
  ]
}

function diagnosticMessages(rows) {
  const { canonicalMessages } =
    buildCanonicalLedger({
      rows,
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
    })

  return buildCompanionDiagnosticInput({
    company_id: COMPANY,
    cycle_id: CYCLE,
    conversation_key: CONVERSATION,
    current_crm_status: 'contato',
    reference_time: '2026-09-30T18:00:00Z',
    messages: canonicalMessages,
    commercial_config: null,
    products: [],
  })
}

test('mesmo minuto: a entrada do diagnóstico segue a ordem de gravação no ledger, não o message_key', () => {
  const input =
    diagnosticMessages(conversationRows())

  assert.deepEqual(
    input.conversation.messages.map((message) => message.text_content),
    ['vendedora 1', 'vendedora 2', 'cliente 1', 'vendedora 3', 'cliente 2'],
  )

  // Nenhum campo novo no contrato da entrada.
  assert.equal('ledger_order_id' in input.conversation.messages[0], false)
})

test('mesmo minuto: mensagem editada (versão nova, id maior) continua no lugar dela', () => {
  const input =
    diagnosticMessages([
      ...conversationRows(),
      row({
        id: '900',
        key: '3AB',
        version: 2,
        direction: 'incoming',
        text: 'cliente 1 (editada)',
        observedAt: '2026-09-30T10:00:00Z',
      }),
    ])

  assert.deepEqual(
    input.conversation.messages.map((message) => message.text_content),
    ['vendedora 1', 'vendedora 2', 'cliente 1 (editada)', 'vendedora 3', 'cliente 2'],
  )
})

test('mesmo minuto: o modelo recebe a conversa na ordem de gravação', () => {
  const plan =
    buildStatefulCopilotExecutionPlan(
      buildStatefulCopilotInput({
        diagnostic_input:
          diagnosticMessages(conversationRows()),
        previous_state: null,
        known_message_ids: ['501', '502', '503', '504', '505'],
      }),
    )

  assert.equal(plan.mode, 'model')

  const payload =
    JSON.parse(plan.request.user_prompt)

  assert.deepEqual(
    payload.input.diagnostic_input.conversation.messages.map((message) => message.id),
    ['501', '502', '503', '504', '505'],
  )
})
