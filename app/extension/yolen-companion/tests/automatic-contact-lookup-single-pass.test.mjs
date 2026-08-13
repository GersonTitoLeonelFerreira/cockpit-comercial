import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const contentScript = readFileSync(
  new URL("../src/content-script.js", import.meta.url),
  "utf8",
)

test("busca automatica do contato executa um unico ciclo visual", () => {
  const lookupStart = contentScript.indexOf(
    "async function runAutomaticContactLookup(conversationKey)",
  )
  const lookupEnd = contentScript.indexOf(
    "function clearLeadStateForNewConversation()",
    lookupStart,
  )

  assert.notEqual(lookupStart, -1)
  assert.notEqual(lookupEnd, -1)

  const lookupBlock = contentScript.slice(
    lookupStart,
    lookupEnd,
  )

  const resolvedKeyIndex = lookupBlock.indexOf(
    "lastResolvedConversationKey =",
  )
  const resolveLeadIndex = lookupBlock.indexOf(
    "resolveCurrentLead()",
  )
  const finishLookupIndex = lookupBlock.indexOf(
    "autoContactLookupInFlight = false",
  )
  const clearObserverIndex = lookupBlock.indexOf(
    "window.clearTimeout(",
    finishLookupIndex,
  )
  const finalRefreshIndex = lookupBlock.indexOf(
    "refreshConversationSnapshot()",
    clearObserverIndex,
  )

  assert.ok(resolvedKeyIndex >= 0)
  assert.ok(resolveLeadIndex > resolvedKeyIndex)
  assert.ok(finishLookupIndex > resolveLeadIndex)
  assert.ok(clearObserverIndex > finishLookupIndex)
  assert.ok(finalRefreshIndex > clearObserverIndex)

  const observerStart = contentScript.indexOf(
    "function observeWhatsAppChanges()",
  )
  const observerEnd = contentScript.indexOf(
    "observeWhatsAppChanges.timeoutId = 0",
    observerStart,
  )

  assert.notEqual(observerStart, -1)
  assert.notEqual(observerEnd, -1)

  const observerBlock = contentScript.slice(
    observerStart,
    observerEnd,
  )

  const suppressionIndex = observerBlock.indexOf(
    "if (autoContactLookupInFlight) {",
  )
  const observerRefreshIndex = observerBlock.indexOf(
    "refreshConversationSnapshot()",
  )

  assert.ok(suppressionIndex >= 0)
  assert.ok(observerRefreshIndex > suppressionIndex)
})
