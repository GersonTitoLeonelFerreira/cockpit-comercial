import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  readWhatsAppCompositionSource,
  sliceFunction,
} from './support/whatsapp-composition-source.mjs'

const api = readFileSync(
  new URL('../src/yolen-api.js', import.meta.url),
  'utf8',
)

const background = readFileSync(
  new URL('../src/background.js', import.meta.url),
  'utf8',
)

const contentScript = readWhatsAppCompositionSource()

test('telemetria C1 passa pela API e background autenticado da extensão', () => {
  assert.match(
    api,
    /async function registerActionEvent\(payload\)[\s\S]*REGISTER_ACTION_EVENT/,
  )

  assert.match(
    api,
    /registerMessageAction,\s*registerActionEvent,\s*transcribeAudio/,
  )

  assert.match(
    background,
    /message\.action === 'REGISTER_ACTION_EVENT'[\s\S]*\/api\/companion\/actions\/events/,
  )
})

test('envelope usa exatamente o contrato da C1 sem conteúdo de conversa em metadata', () => {
  const start = contentScript.indexOf(
    'async function registerCompanionActionTelemetry',
  )

  const end = contentScript.indexOf(
    'async function analyzeCurrentConversation',
    start,
  )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  const block = contentScript.slice(
    start,
    end,
  )

  assert.match(block, /cycle_id:\s*cycleId/)
  assert.match(block, /action_type:\s*actionType/)
  assert.match(block, /idempotency_key:/)
  assert.match(block, /coaching_note_id:/)
  assert.match(block, /conversation_key:/)
  assert.match(block, /metadata,/)

  for (const forbidden of [
    'conversation_text',
    'messages',
    'suggested_message',
    'text_content',
    'audio_transcription',
  ]) {
    assert.equal(
      block.includes(forbidden),
      false,
      'metadata de telemetria não pode carregar ' + forbidden,
    )
  }
})

test('instrumenta os seis fatos de interação com sugestão', () => {
  for (const actionType of [
    'suggestion_shown',
    'suggestion_copied',
    'suggestion_inserted',
    'suggestion_ignored',
    'suggestion_edited',
    'suggestion_sent',
  ]) {
    assert.ok(
      contentScript.includes(
        "'" + actionType + "'",
      ),
      'ação ausente: ' + actionType,
    )
  }

  assert.match(
    contentScript,
    /registerSuggestionShownTelemetry\(\{[\s\S]*analysis:[\s\S]*result\.payload\.data/,
  )

  assert.match(
    contentScript,
    /navigator\.clipboard\.writeText\(message\)[\s\S]*suggestion_copied/,
  )

  const insertStart =
    contentScript.indexOf(
      'async function insertSuggestedMessageInChannel()',
    )

  const insertEnd =
    contentScript.indexOf(
      'function getAnalysisActionButton()',
      insertStart,
    )

  assert.notEqual(insertStart, -1)
  assert.notEqual(insertEnd, -1)

  const insertBlock =
    contentScript.slice(
      insertStart,
      insertEnd,
    )

  // FASE 5 (contrato §7): a escrita no composer e a verificação ficam no
  // adapter (applyMessage); o Core monta o contexto, chama applyMessage e
  // só emite telemetria depois da confirmação técnica.
  const contextPosition =
    insertBlock.indexOf(
      'const pendingSend =',
    )

  const applyPosition =
    insertBlock.indexOf(
      'channelAdapter.applyMessage(',
    )

  const confirmationPosition =
    insertBlock.indexOf(
      'if (!applyResult.applied) {',
    )

  const telemetryPosition =
    insertBlock.indexOf(
      "'suggestion_inserted'",
    )

  assert.ok(contextPosition >= 0)
  assert.ok(applyPosition > contextPosition)
  assert.ok(
    confirmationPosition >
      applyPosition,
  )
  assert.ok(
    telemetryPosition >
      confirmationPosition,
  )

  assert.doesNotMatch(
    insertBlock,
    /writeTextInComposer\(|textContent/,
  )

  const applyBlock =
    sliceFunction(
      contentScript,
      'async function applyMessage(message, expected = {}) {',
    )

  assert.match(
    applyBlock,
    /try \{[\s\S]*writeTextInComposer\([\s\S]*\} catch \{/,
  )

  assert.match(
    applyBlock,
    /for \([\s\S]*attempt < 8[\s\S]*await sleep\(50\)/,
  )

  assert.match(
    applyBlock,
    /await sleep\(50\)[\s\S]*isProbablySameMessage\([\s\S]*reason: 'apply_verification_failed'/,
  )

  assert.match(
    contentScript,
    /wasEdited[\s\S]*suggestion_edited[\s\S]*suggestion_sent/,
  )
})

test('instrumenta aceite e rejeição separados para CRM e Agenda', () => {
  for (const actionType of [
    'crm_accepted',
    'crm_rejected',
    'agenda_accepted',
    'agenda_rejected',
  ]) {
    assert.ok(
      contentScript.includes(
        "'" + actionType + "'",
      ),
      'ação ausente: ' + actionType,
    )
  }

  assert.match(
    contentScript,
    /crmChanged[\s\S]*accepted[\s\S]*crm_accepted[\s\S]*crm_rejected/,
  )

  assert.match(
    contentScript,
    /agendaChanged[\s\S]*accepted[\s\S]*agenda_accepted[\s\S]*agenda_rejected/,
  )

  assert.match(
    contentScript,
    /registerSuggestionDecisionTelemetry\(\{[\s\S]*accepted: confirmed[\s\S]*suggestion,[\s\S]*cycleId/,
  )
})

test('telemetria nova não substitui o histórico legado de uso da mensagem', () => {
  assert.match(
    contentScript,
    /registerSuggestedMessageAction\(\s*'copied',/,
  )

  assert.match(
    contentScript,
    /registerSuggestedMessageAction\(\s*'inserted',/,
  )

  assert.match(
    contentScript,
    /registerSuggestedMessageAction\('sent'/,
  )

  assert.match(
    background,
    /\/api\/companion\/message-action/,
  )
})
