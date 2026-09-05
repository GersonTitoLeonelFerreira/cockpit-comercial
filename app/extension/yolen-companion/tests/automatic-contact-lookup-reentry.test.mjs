import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

function getLookupBlock() {
  const start = contentScript.indexOf(
    'async function runAutomaticContactLookup(conversationKey)',
  )
  const end = contentScript.indexOf(
    'function clearLeadStateForNewConversation()',
    start,
  )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  return contentScript.slice(
    start,
    end,
  )
}

test(
  'sem painel aberto lookup falha fechado sem navegar nem consumir tentativa',
  () => {
    const block = getLookupBlock()

    const failClosedIndex = block.indexOf(
      'if (!hadContactPanelOpen) {',
    )

    const successMarkIndex = block.indexOf(
      'autoLookupAttemptedKeys.add(',
      failClosedIndex,
    )

    assert.ok(failClosedIndex >= 0)
    assert.ok(successMarkIndex > failClosedIndex)

    const failClosedBlock = block.slice(
      failClosedIndex,
      successMarkIndex,
    )

    assert.match(
      failClosedBlock,
      /A Yolen não altera a navegação do WhatsApp/,
    )

    assert.match(
      failClosedBlock,
      /return/,
    )

    assert.doesNotMatch(
      failClosedBlock,
      /clickElement\(/,
    )

    assert.doesNotMatch(
      failClosedBlock,
      /autoLookupAttemptedKeys\.add\(/,
    )
  },
)

test(
  'politica fail-closed nao agenda retry visual de abertura',
  () => {
    const block = getLookupBlock()

    assert.doesNotMatch(
      contentScript,
      /AUTO_CONTACT_LOOKUP_PREPARE_RETRY_MS/,
    )

    assert.doesNotMatch(
      contentScript,
      /AUTO_CONTACT_LOOKUP_MAX_PREPARE_RETRIES/,
    )

    assert.doesNotMatch(
      contentScript,
      /autoLookupPrepareRetryCounts/,
    )

    assert.doesNotMatch(
      block,
      /getClickableHeaderTarget\(/,
    )

    assert.doesNotMatch(
      block,
      /clickElement\(/,
    )
  },
)

test(
  'voltar para uma conversa rearma uma unica nova tentativa automatica',
  () => {
    const refreshStart = contentScript.indexOf(
      'function refreshConversationSnapshot()',
    )
    const refreshEnd = contentScript.indexOf(
      'function getConnectionLabel()',
      refreshStart,
    )

    assert.notEqual(refreshStart, -1)
    assert.notEqual(refreshEnd, -1)

    const refreshBlock = contentScript.slice(
      refreshStart,
      refreshEnd,
    )

    const changedIndex = refreshBlock.indexOf(
      'if (contactLookupChanged) {',
    )

    const deleteAttemptIndex = refreshBlock.indexOf(
      'autoLookupAttemptedKeys.delete(',
      changedIndex,
    )

    const scheduleIndex = refreshBlock.lastIndexOf(
      'runAutomaticContactLookup(',
    )

    assert.ok(changedIndex >= 0)
    assert.ok(deleteAttemptIndex > changedIndex)
    assert.ok(scheduleIndex > deleteAttemptIndex)
  },
)
