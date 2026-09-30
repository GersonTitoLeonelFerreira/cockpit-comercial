import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BACKFILL_OBSERVATION_TOLERANCE_MS,
  computeMessageActivityTimestamps,
} from './message-activity-time.ts'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract.ts'

import {
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
} from './diagnostic-input.ts'

import {
  buildStatefulCopilotInput,
} from './stateful-copilot-input.ts'

import {
  buildStatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan.ts'

import {
  selectStatefulDiagnosticMessages,
} from './stateful-copilot-real-context-loader.ts'

const ms = (iso) => Date.parse(iso)

// ---------------------------------------------------------------------------
// Regra de atividade
// ---------------------------------------------------------------------------

test('primeira leitura: tudo observado junto vale pela hora da observação (como antes)', () => {
  const activity =
    computeMessageActivityTimestamps([
      { id: 'a', version: 1, occurred_at: '2026-09-23T14:08:00Z', observed_at: '2026-09-29T22:35:40Z' },
      { id: 'b', version: 1, occurred_at: '2026-09-25T14:14:00Z', observed_at: '2026-09-29T22:35:55Z' },
      { id: 'c', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: '2026-09-29T22:36:13Z' },
    ])

  assert.equal(activity.get('a'), ms('2026-09-29T22:35:40Z'))
  assert.equal(activity.get('b'), ms('2026-09-29T22:35:55Z'))
  assert.equal(activity.get('c'), ms('2026-09-29T22:36:13Z'))
})

test('mensagem antiga capturada depois vale pela hora em que aconteceu', () => {
  const activity =
    computeMessageActivityTimestamps([
      { id: 'abril', version: 1, occurred_at: '2026-04-09T21:08:00Z', observed_at: '2026-09-30T16:30:58Z' },
      { id: 'b', version: 1, occurred_at: '2026-09-25T14:14:00Z', observed_at: '2026-09-29T22:36:13Z' },
      { id: 'c', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: '2026-09-29T22:36:13Z' },
    ])

  assert.equal(activity.get('abril'), ms('2026-04-09T21:08:00Z'))
  assert.equal(activity.get('b'), ms('2026-09-29T22:36:13Z'))
  assert.equal(activity.get('c'), ms('2026-09-29T22:36:13Z'))
})

test('versão nova (edição, exclusão, transcrição) continua valendo pela observação', () => {
  const activity =
    computeMessageActivityTimestamps([
      { id: 'editada', version: 2, occurred_at: '2026-09-20T10:00:00Z', observed_at: '2026-09-30T16:00:00Z' },
      { id: 'b', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: '2026-09-29T22:36:13Z' },
    ])

  assert.equal(activity.get('editada'), ms('2026-09-30T16:00:00Z'))
})

test('captura um pouco depois, dentro da tolerância, não muda nada', () => {
  const observedLater =
    new Date(ms('2026-09-29T22:36:13Z') + BACKFILL_OBSERVATION_TOLERANCE_MS - 60_000).toISOString()

  const activity =
    computeMessageActivityTimestamps([
      { id: 'a', version: 1, occurred_at: '2026-09-29T20:30:00Z', observed_at: observedLater },
      { id: 'b', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: '2026-09-29T22:36:13Z' },
    ])

  assert.equal(activity.get('a'), ms(observedLater))
})

test('mensagens do mesmo minuto não se acusam de histórico recuperado', () => {
  const activity =
    computeMessageActivityTimestamps([
      { id: 'a', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: '2026-09-30T10:00:00Z' },
      { id: 'b', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: '2026-09-29T22:36:13Z' },
    ])

  assert.equal(activity.get('a'), ms('2026-09-30T10:00:00Z'))
})

test('hora inválida cai para a outra hora disponível', () => {
  const activity =
    computeMessageActivityTimestamps([
      { id: 'sem-ocorrencia', version: 1, occurred_at: 'invalida', observed_at: '2026-09-29T22:36:13Z' },
      { id: 'sem-observacao', version: 1, occurred_at: '2026-09-29T20:40:00Z', observed_at: 'invalida' },
    ])

  assert.equal(activity.get('sem-ocorrencia'), ms('2026-09-29T22:36:13Z'))
  assert.equal(activity.get('sem-observacao'), ms('2026-09-29T20:40:00Z'))
})

// ---------------------------------------------------------------------------
// Cenário da Júlia no pipeline real (seleção + plano do diagnóstico)
// ---------------------------------------------------------------------------

function message({ id, sequence, direction, occurredAt, observedAt, text, version = 1 }) {
  return {
    id,
    message_key: `message-${id}`,
    version,
    sequence,
    direction,
    author_kind: direction === 'incoming' ? 'customer' : 'human_agent',
    occurred_at: occurredAt,
    observed_at: observedAt,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
  }
}

function juliaMessages() {
  return [
    message({
      id: '3460',
      sequence: 1,
      direction: 'outgoing',
      occurredAt: '2026-04-09T21:08:00Z',
      // capturada hoje, depois de um novo login no WhatsApp
      observedAt: '2026-09-30T16:30:58Z',
      text: 'A gente sente sua falta por aqui! Agora temos aulas coletivas.',
    }),
    message({
      id: '3410',
      sequence: 2,
      direction: 'incoming',
      occurredAt: '2026-09-29T20:37:00Z',
      observedAt: '2026-09-29T22:36:13Z',
      text: 'E o nosso plano inclui as aulas coletivas também?',
    }),
    message({
      id: '3411',
      sequence: 3,
      direction: 'outgoing',
      occurredAt: '2026-09-29T20:39:00Z',
      observedAt: '2026-09-29T22:36:13Z',
      text: 'No plano de vocês não é incluso as aulas coletivas, mas dá para acrescentar por 30,00.',
    }),
    message({
      id: '3412',
      sequence: 4,
      direction: 'incoming',
      occurredAt: '2026-09-29T20:39:00Z',
      observedAt: '2026-09-29T22:36:13Z',
      text: 'Tabom, dps eu vejo para incluir',
    }),
  ]
}

function scenarioInput(messages) {
  return buildStatefulCopilotInput({
    diagnostic_input: {
      input_version: COMPANION_DIAGNOSTIC_INPUT_VERSION,
      diagnostic_contract_version: COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
      company_id: 'company-1',
      cycle_id: 'cycle-1',
      conversation_key: 'conversation-1',
      current_crm_status: 'novo',
      reference_time: '2026-09-30T17:41:14Z',
      analysis_precondition: { status: 'ready', limitations: [] },
      conversation: {
        active_message_ids: messages.map((entry) => entry.id),
        excluded_message_ids: [],
        messages,
        excluded_messages: [],
      },
      commercial_context: {
        configured: false,
        config_version_id: null,
        config_version_number: null,
        config_contract_version: null,
        business_description: null,
        target_audience: null,
        value_proposition: null,
        communication_tone: null,
        required_behaviors: [],
        prohibited_behaviors: [],
        sales_method: {
          configured: false,
          contract_version: null,
          name: null,
          description: null,
          principles: [],
          definition: null,
          steps: [],
        },
        products: [],
        facts: [],
        objection_guides: [],
      },
    },
    previous_state: null,
    known_message_ids: messages.map((entry) => entry.id),
  })
}

test('Júlia: a mensagem de abril capturada hoje não vira a conversa de hoje', () => {
  const plan =
    buildStatefulCopilotExecutionPlan(scenarioInput(juliaMessages()))

  assert.equal(plan.mode, 'model')

  const payload =
    JSON.parse(plan.request.user_prompt)

  // Antes da correção: ['3460'] (só a mensagem de abril).
  assert.deepEqual(
    [...payload.required_analyzed_message_ids].sort(),
    ['3410', '3411', '3412'],
  )

  const bridgeTexts =
    payload.input.diagnostic_input.conversation.context_bridge_messages
      .map((entry) => entry.text_content)
      .join(' | ')

  assert.match(bridgeTexts, /sente sua falta/)
})

test('Júlia: a seleção do ledger põe a conversa recente na sessão atual', () => {
  const ledger =
    juliaMessages().map((entry) => ({
      id: entry.id,
      company_id: 'company-1',
      cycle_id: 'cycle-1',
      conversation_key: 'conversation-1',
      message_key: entry.message_key,
      version: entry.version,
      direction: entry.direction,
      author_kind: entry.author_kind,
      occurred_at: entry.occurred_at,
      observed_at: entry.observed_at,
      content_type: entry.content_type,
      text_content: entry.text_content,
      audio_transcription: null,
      is_deleted: false,
      deletion_reason: null,
    }))

  const selected =
    selectStatefulDiagnosticMessages(ledger)
      .map((entry) => entry.id)

  for (const id of ['3410', '3411', '3412']) {
    assert.ok(selected.includes(id), id)
  }
})
