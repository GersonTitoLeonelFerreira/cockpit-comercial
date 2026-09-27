import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readWhatsAppCompositionSource,
  readContactLookupFlow,
  sliceFunction,
} from './support/whatsapp-composition-source.mjs'

const contentScript = readWhatsAppCompositionSource()

// FASE 5: aquisição da evidência no adapter + decisão no Core.
function getLookupBlock() {
  const block = readContactLookupFlow(contentScript)

  assert.ok(block)

  return block
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
      '\n    }\n',
      failClosedIndex,
    )

    assert.ok(failClosedIndex >= 0)
    assert.ok(failClosedEnd > failClosedIndex)

    const failClosedBlock = block.slice(
      failClosedIndex,
      failClosedEnd,
    )

    // O adapter falha fechado (sem navegar) consumindo a tentativa; o
    // Core traduz o resultado técnico na copy e marca a chave tentada.
    assert.match(
      failClosedBlock,
      /return/,
    )

    assert.match(
      failClosedBlock,
      /onLookupAttemptConsumed\(\)/,
    )

    assert.match(
      failClosedBlock,
      /outcome: 'phone_unavailable'/,
    )

    assert.doesNotMatch(
      failClosedBlock,
      /clickElement\(/,
    )

    assert.match(
      block,
      /phone_unavailable:\s*`Telefone ainda não disponível para identificação automática\. A Yolen não altera a navegação do \$\{platformDisplayName\}/,
    )

    assert.match(
      block,
      /onLookupAttemptConsumed: \(\) => \{\s*autoLookupAttemptedKeys\.add\(\s*conversationKey/,
    )

  // FASE 5: copy canônica do Core interpola o nome do canal declarado pelo
  // adapter (contrato §5); para o WhatsApp o texto exibido é o mesmo.
  assert.match(contentScript, /displayName: 'WhatsApp'/)


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

    // Contrato atual (epoch-aware): reentrada não é mais decidida por
    // "o painel existe no DOM agora" (!findContactInfoPanel()), e sim por
    // "o painel pertence ao epoch da conversa atual"
    // (!contactPanelAtLookupStart.authorized) — ver
    // getContactInfoPanelForEpoch()/refreshContactInfoPanelStructuralContext().
    // Um painel stale de uma conversa anterior (mesmo nó DOM, epoch
    // diferente) não pode mais liberar reentrada só por existir.
    // FASE 5: a pergunta "o painel pertence ao epoch da conversa atual"
    // é do adapter (hasAuthorizedContactDetails).
    assert.match(
      reentryGuardBlock,
      /!channelAdapter\.hasAuthorizedContactDetails\(\)/,
    )
    assert.match(
      sliceFunction(contentScript, 'function hasAuthorizedContactDetails() {'),
      /getContactInfoPanelForEpoch\(\s*activeChatEpoch,?\s*\)\.authorized/,
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
