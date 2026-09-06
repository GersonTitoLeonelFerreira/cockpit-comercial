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
  // UX8 Automatic Passive Lead Resolution (harden): o fail-closed agora
  // MARCA a tentativa (para não reagendar a cada mutation do WhatsApp
  // enquanto nada muda — retry ilimitado) em vez de deixá-la em aberto
  // para sempre. O invariante que este teste protege continua o mesmo:
  // nenhuma navegação/clique acontece aqui — só a consequência de
  // "consumir a tentativa" mudou intencionalmente. A garantia de que
  // marcar não tranca a conversa para sempre (reentrada ao abrir o
  // painel manualmente) é provada em
  // tests/e3-dom/automatic-passive-lead-resolution-race.test.mjs.
  'sem painel aberto lookup falha fechado sem navegar, e marca a tentativa para não reagendar indefinidamente',
  () => {
    const block = getLookupBlock()

    const failClosedIndex = block.indexOf(
      'if (!hadContactPanelOpen) {',
    )

    const failClosedEnd = block.indexOf(
      '\n      }\n',
      failClosedIndex,
    )

    assert.ok(failClosedIndex >= 0)
    assert.ok(failClosedEnd > failClosedIndex)

    const failClosedBlock = block.slice(
      failClosedIndex,
      failClosedEnd,
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

    assert.match(
      failClosedBlock,
      /autoLookupAttemptedKeys\.add\(\s*conversationKey/,
    )

    // Mas isso não pode travar a conversa para sempre: reentrar quando o
    // vendedor abriu o painel manualmente precisa continuar possível.
    const reentryGuardIndex = block.indexOf(
      'autoLookupAttemptedKeys.has(',
    )
    const reentryGuardEnd = block.indexOf(
      '\n    ) {\n      return\n    }',
      reentryGuardIndex,
    )
    const reentryGuardBlock = block.slice(
      reentryGuardIndex,
      reentryGuardEnd,
    )

    assert.ok(reentryGuardIndex >= 0)
    assert.ok(reentryGuardEnd > reentryGuardIndex)
    assert.match(
      reentryGuardBlock,
      /!findContactInfoPanel\(\)/,
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
