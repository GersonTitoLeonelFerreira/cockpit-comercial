import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test('busca automatica do contato executa um unico ciclo visual', () => {
  const lookupStart = contentScript.indexOf(
    'async function runAutomaticContactLookup(conversationKey)',
  )
  const lookupEnd = contentScript.indexOf(
    'function clearLeadStateForNewConversation()',
    lookupStart,
  )

  assert.notEqual(lookupStart, -1)
  assert.notEqual(lookupEnd, -1)

  const lookupBlock = contentScript.slice(
    lookupStart,
    lookupEnd,
  )

  const closeIndex = lookupBlock.indexOf(
    'closeContactInfoPanelAndWait()',
  )
  // Escopado a partir de closeIndex: a UX8 Automatic Passive Lead
  // Resolution acrescentou um ramo passivo (JID de DOM) que também marca
  // resolução antes deste ponto — o invariante testado aqui é
  // especificamente o ciclo baseado no painel de contato já aberto, que
  // continua fechando o painel automático antes de marcar resolvido.
  const resolvedKeyIndex = lookupBlock.indexOf(
    'lastResolvedConversationKey =',
    closeIndex,
  )
  const resolveLeadIndex = lookupBlock.indexOf(
    'resolveCurrentLead()',
    resolvedKeyIndex,
  )
  const finishLookupIndex = lookupBlock.indexOf(
    'autoContactLookupInFlight = false',
  )
  const replayPendingIndex = lookupBlock.indexOf(
    'autoContactLookupConversationRefreshPending',
    finishLookupIndex,
  )
  const replayRefreshIndex = lookupBlock.indexOf(
    'processObservedWhatsAppChange()',
    replayPendingIndex,
  )

  assert.ok(closeIndex >= 0)
  assert.ok(resolvedKeyIndex > closeIndex)
  assert.ok(resolveLeadIndex > resolvedKeyIndex)
  assert.ok(finishLookupIndex > resolveLeadIndex)
  assert.ok(replayPendingIndex > finishLookupIndex)
  assert.ok(replayRefreshIndex > replayPendingIndex)

  assert.doesNotMatch(
    lookupBlock,
    /refreshConversationSnapshot\(\)/,
  )

  const observerStart = contentScript.indexOf(
    'function observeWhatsAppChanges()',
  )
  const observerEnd = contentScript.indexOf(
    'observeWhatsAppChanges.timeoutId = 0',
    observerStart,
  )

  assert.notEqual(observerStart, -1)
  assert.notEqual(observerEnd, -1)

  const observerBlock = contentScript.slice(
    observerStart,
    observerEnd,
  )

  const immediateClearIndex = observerBlock.indexOf(
    'YolenCompanionSellerMessageRuntime',
  )
  const suppressionIndex = observerBlock.indexOf(
    'if (autoContactLookupInFlight) {',
  )
  const queuedRefreshIndex = observerBlock.indexOf(
    'autoContactLookupConversationRefreshPending =',
    suppressionIndex,
  )
  const observerRefreshIndex = observerBlock.indexOf(
    'processObservedWhatsAppChange()',
    suppressionIndex,
  )

  assert.ok(immediateClearIndex >= 0)
  assert.ok(suppressionIndex > immediateClearIndex)
  assert.ok(queuedRefreshIndex > suppressionIndex)
  assert.ok(observerRefreshIndex > suppressionIndex)
})
