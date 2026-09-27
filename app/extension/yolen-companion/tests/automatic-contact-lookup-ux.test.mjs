import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readWhatsAppCompositionSource,
  readContactLookupFlow,
  readConversationSnapshotFlow,
} from './support/whatsapp-composition-source.mjs'

const contentScript = readWhatsAppCompositionSource()

test('grupo e bloqueado antes da busca automatica de telefone', () => {
  assert.match(
    contentScript,
    /function isGroupConversationHeader\(\)/,
  )

  assert.match(
    contentScript,
    /label\.includes\('em grupo'\)/,
  )

  // FASE 5: aquisição da evidência (adapter) seguida da decisão (Core).
  const lookupBlock = readContactLookupFlow(contentScript)

  assert.match(
    lookupBlock,
    /state\.isGroupConversation/,
  )

  // conversationKey (não lookupIdentity, o nome normalizado — colide
  // entre contatos homônimos) é a chave de tentativa desde a UX8
  // Automatic Passive Lead Resolution.
  assert.match(
    lookupBlock,
    /autoLookupAttemptedKeys\.has\(\s*conversationKey/,
  )

  assert.match(
    lookupBlock,
    /autoLookupAttemptedKeys\.add\(\s*conversationKey/,
  )

  assert.match(
    lookupBlock,
    /cachedPhonesByLookupIdentity\.set\(\s*lookupIdentity,\s*phone/,
  )

  assert.match(
    lookupBlock,
    /if \(!hadContactPanelOpen\) \{[\s\S]*closeContactInfoPanelAndWait\(\)/,
  )

  assert.doesNotMatch(
    lookupBlock,
    /refreshConversationSnapshot\(\)/,
  )
})

test('titulo principal do header nao vira lista de participantes do grupo', () => {
  assert.match(
    contentScript,
    /function getMainHeaderPrimaryTitle\(\)/,
  )

  const titleStart = contentScript.indexOf(
    'function getConversationTitle()',
  )
  const titleEnd = contentScript.indexOf(
    'function getConversationPhone(',
    titleStart,
  )

  const titleBlock = contentScript.slice(
    titleStart,
    titleEnd,
  )

  const primaryIndex = titleBlock.indexOf(
    'getMainHeaderPrimaryTitle()',
  )
  const candidatesIndex = titleBlock.indexOf(
    'getMainHeaderTextCandidates()',
  )

  assert.ok(primaryIndex >= 0)
  assert.ok(candidatesIndex > primaryIndex)

  assert.match(
    contentScript,
    /\.split\('\\n'\)/,
  )
})

test('fechamento do perfil usa o header Dados do contato e espera restaurar a conversa', () => {
  assert.match(
    contentScript,
    /function findContactInfoHeader\(\)/,
  )

  assert.match(
    contentScript,
    /async function closeContactInfoPanelAndWait\(\)/,
  )

  const closeStart = contentScript.indexOf(
    'function closeContactInfoPanel()',
  )
  const closeEnd = contentScript.indexOf(
    'async function closeContactInfoPanelAndWait()',
    closeStart,
  )

  const closeBlock = contentScript.slice(
    closeStart,
    closeEnd,
  )

  assert.match(
    contentScript,
    /function getContactInfoCloseControl\(\)/,
  )

  assert.match(
    closeBlock,
    /getContactInfoCloseControl\(\)/,
  )
})

test('resolucao do lead usa identidade estavel da consulta e nao repete por mutation', () => {
  assert.match(
    contentScript,
    /let lastResolvedContactLookupIdentity = null/,
  )

  // FASE 5: leitura da conversa (adapter) seguida da decisão (Core).
  const refreshBlock = readConversationSnapshotFlow(contentScript)

  // Contrato atual: isGroupConversation também considera a classificação
  // persistida do bridge (bridgeSaysGroup) além do header — ver
  // "Persist bridge-confirmed group classification" — mas continua
  // incluindo isGroupConversationHeader() como uma das fontes.
  assert.match(
    refreshBlock,
    /const isGroupConversation =\s*bridgeSaysGroup \|\|\s*isGroupConversationHeader\(\)/,
  )

  // O gate de deduplicação usa conversationKey (identidade única por
  // conversa) desde a UX8 Automatic Passive Lead Resolution —
  // contactLookupIdentity (nome normalizado) colide entre contatos
  // homônimos e não pode mais governar sozinho essa decisão.
  assert.match(
    refreshBlock,
    /lastResolvedConversationKey !==\s*conversationKey/,
  )

  assert.match(
    refreshBlock,
    /!autoLookupAttemptedKeys\.has\(\s*conversationKey/,
  )

  const groupBranchIndex = refreshBlock.indexOf(
    'if (isGroupConversation) {',
  )
  const scheduleLookupIndex = refreshBlock.lastIndexOf(
    'runAutomaticContactLookup(',
  )

  assert.ok(groupBranchIndex >= 0)
  assert.ok(scheduleLookupIndex > groupBranchIndex)

  assert.match(
    contentScript,
    /Grupos não são vinculados a leads/,
  )
})


test(
  'busca automatica nunca clica na interface do WhatsApp para obter telefone',
  () => {
    // FASE 5: aquisição da evidência (adapter) seguida da decisão (Core).
    const lookupBlock = readContactLookupFlow(contentScript)

    assert.ok(lookupBlock)

    assert.doesNotMatch(
      lookupBlock,
      /getClickableHeaderTarget\(/,
    )

    assert.doesNotMatch(
      lookupBlock,
      /clickElement\(/,
    )

    assert.match(
      lookupBlock,
      /if \(!hadContactPanelOpen\)/,
    )

    // Copy canônica do Core com o nome do canal declarado pelo adapter
    // (contrato §5) — para o WhatsApp o texto exibido é o mesmo.
    assert.match(
      lookupBlock,
      /A Yolen não altera a navegação do \$\{platformDisplayName\}/,
    )
    assert.match(contentScript, /displayName: 'WhatsApp'/)

    assert.doesNotMatch(
      contentScript,
      /function getClickableHeaderTarget\(/,
    )
  },
)

test(
  'sem header real nenhum item lateral vira titulo da conversa',
  () => {
    const start =
      contentScript.indexOf(
        'function getConversationTitle()',
      )

    const end =
      contentScript.indexOf(
        'function getConversationPhone(',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const block =
      contentScript.slice(
        start,
        end,
      )

    assert.match(
      block,
      /const main =\s*getMainConversationRoot\(\)/,
    )

    assert.match(
      block,
      /if \(!main\) \{\s*return null\s*\}/,
    )

    assert.doesNotMatch(
      block,
      /return getSelectedChatTitle\(\)/,
    )

    assert.match(
      block,
      /return null/,
    )
  },
)
