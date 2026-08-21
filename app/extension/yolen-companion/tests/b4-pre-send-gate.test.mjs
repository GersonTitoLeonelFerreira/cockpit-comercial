import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

const styles = readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8',
)

const startMarker = '// B4_PRE_SEND_GATE_START'
const endMarker = '// B4_PRE_SEND_GATE_END'

const start = contentScript.indexOf(startMarker)
const end = contentScript.indexOf(endMarker, start)

assert.ok(start >= 0)
assert.ok(end > start)

const gateSource = contentScript.slice(
  start + startMarker.length,
  end,
)

const decisionStart =
  gateSource.indexOf(
    '  function decidePreSendAttempt(',
  )

const decisionEnd =
  gateSource.indexOf(
    '  function getCurrentPreSendGateKey()',
    decisionStart,
  )

assert.ok(decisionStart >= 0)
assert.ok(decisionEnd > decisionStart)

const decisionSource =
  gateSource.slice(
    decisionStart,
    decisionEnd,
  )

const decidePreSendAttempt = new Function(
  '"use strict";\n' +
    decisionSource +
    '\nreturn decidePreSendAttempt;',
)()

test('sem alerta o envio continua normal', () => {
  assert.equal(
    decidePreSendAttempt({
      gateKey: null,
      bypassKey: null,
      cancelable: true,
      collapsed: false,
    }),
    'allow',
  )
})

test('alerta válido pausa a tentativa', () => {
  assert.equal(
    decidePreSendAttempt({
      gateKey: 'gate-1',
      bypassKey: null,
      cancelable: true,
      collapsed: false,
    }),
    'block',
  )
})

test('Enviar mesmo assim permite somente uma tentativa', () => {
  assert.equal(
    decidePreSendAttempt({
      gateKey: 'gate-1',
      bypassKey: 'gate-1',
      cancelable: true,
      collapsed: false,
    }),
    'allow_once',
  )

  assert.match(
    gateSource,
    /preSendBypassKey:\s*null/,
  )

  assert.match(
    gateSource,
    /preSendBypassKey:\s*gateKey/,
  )
})

test('evento não cancelável permanece fail-open', () => {
  assert.equal(
    decidePreSendAttempt({
      gateKey: 'gate-1',
      bypassKey: null,
      cancelable: false,
      collapsed: false,
    }),
    'allow',
  )
})

test('Companion recolhido permanece fail-open', () => {
  assert.equal(
    decidePreSendAttempt({
      gateKey: 'gate-1',
      bypassKey: null,
      cancelable: true,
      collapsed: true,
    }),
    'allow',
  )
})

test('bloqueio usa cancelamento somente no gate', () => {
  assert.match(
    gateSource,
    /event\.preventDefault\(\)/,
  )

  assert.match(
    gateSource,
    /event\.stopPropagation\(\)/,
  )

  assert.match(
    gateSource,
    /event\.stopImmediatePropagation\(\)/,
  )
})

test('Shift Enter e modificadores permanecem fora do gate', () => {
  const observerStart = contentScript.indexOf(
    'function observeManualWhatsAppSend()',
  )

  assert.ok(observerStart >= 0)

  const observer = contentScript.slice(
    observerStart,
    observerStart + 1800,
  )

  assert.match(observer, /event\.shiftKey/)
  assert.match(observer, /event\.altKey/)
  assert.match(observer, /event\.ctrlKey/)
  assert.match(observer, /event\.metaKey/)
})

test('gate possui as três decisões humanas', () => {
  assert.match(gateSource, /Revisar mensagem/)
  assert.match(gateSource, /Usar sugestão Yolen/)
  assert.match(gateSource, /Enviar mesmo assim/)
})

test('Revisar mensagem não modifica o draft', () => {
  const review = gateSource.match(
    /function reviewCurrentPreSendDraft\(\) \{([\s\S]*?)\n  \}/,
  )

  assert.ok(review)

  assert.equal(
    /execCommand|writeTextInComposer|textContent\s*=/.test(
      review[1],
    ),
    false,
  )
})

test('Usar sugestão reutiliza inserção e não o envio', () => {
  assert.match(
    gateSource,
    /insertSuggestedMessageInWhatsAppWithOptions\(\{\s*replaceExisting:\s*true/,
  )

  assert.match(
    contentScript,
    /options\.replaceExisting !== true/,
  )
})

test('alteração do draft revoga gate e bypass', () => {
  assert.match(
    contentScript,
    /preSendDraft:\s*normalizedDraft,[\s\S]*preSendGateOpen:\s*false,[\s\S]*preSendBypassKey:\s*null/,
  )
})

test('gate continua vinculado à conversa e análise atuais', () => {
  assert.match(
    gateSource,
    /preSendAssessmentConversationKey !==[\s\S]*state\.conversationKey/,
  )

  assert.match(
    gateSource,
    /preSendAssessmentFingerprint !==[\s\S]*analyzedConversationFingerprint/,
  )

  assert.match(
    gateSource,
    /isCurrentAnalysisOutdated\(\)/,
  )
})

test('B4.3 não cria IA API telemetria CRM ou Agenda', () => {
  for (const forbidden of [
    'fetch(',
    'analyzeConversation(',
    'window.YolenCompanionApi',
    'registerActionEvent(',
    'fireCompanionActionTelemetry(',
    'applyCurrentSuggestion(',
    'crm_accepted',
    'crm_rejected',
    'agenda_accepted',
    'agenda_rejected',
  ]) {
    assert.equal(
      gateSource.includes(forbidden),
      false,
      forbidden,
    )
  }
})

test('existe somente um resolvedor de botão Enviar', () => {
  const matches =
    contentScript.match(
      /function getWhatsAppSendButton\(\)/g,
    ) || []

  assert.equal(matches.length, 1)
})

test('UX específica do gate foi adicionada', () => {
  assert.match(
    styles,
    /\.yolen-pre-send-gate-copy/,
  )

  assert.match(
    styles,
    /\.yolen-pre-send-actions/,
  )

  assert.match(
    styles,
    /\.yolen-pre-send-send-anyway/,
  )
})
