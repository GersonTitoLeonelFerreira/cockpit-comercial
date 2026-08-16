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
  'lookup so marca a conversa como tentada depois de acionar o perfil',
  () => {
    const block = getLookupBlock()

    const clickIndex = block.indexOf(
      'const clicked = clickElement(getClickableHeaderTarget())',
    )

    const successMarkIndex = block.indexOf(
      'autoLookupAttemptedKeys.add(',
      clickIndex,
    )

    assert.ok(clickIndex >= 0)
    assert.ok(successMarkIndex > clickIndex)

    const beforeClick = block.slice(
      0,
      clickIndex,
    )

    assert.doesNotMatch(
      beforeClick,
      /autoLookupAttemptedKeys\.add\(/,
    )
  },
)

test(
  'falha de preparacao pode aguardar o DOM sem provocar nova abertura visual ilimitada',
  () => {
    const block = getLookupBlock()

    assert.match(
      contentScript,
      /AUTO_CONTACT_LOOKUP_MAX_PREPARE_RETRIES = 4/,
    )

    assert.match(
      block,
      /autoLookupPrepareRetryCounts\.get\(/,
    )

    assert.match(
      block,
      /AUTO_CONTACT_LOOKUP_PREPARE_RETRY_MS/,
    )

    assert.match(
      block,
      /retryCount <\s*AUTO_CONTACT_LOOKUP_MAX_PREPARE_RETRIES/,
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
