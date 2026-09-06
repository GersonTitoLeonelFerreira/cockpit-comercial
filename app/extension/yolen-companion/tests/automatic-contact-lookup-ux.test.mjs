import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test('grupo e bloqueado antes da busca automatica de telefone', () => {
  assert.match(
    contentScript,
    /function isGroupConversationHeader\(\)/,
  )

  assert.match(
    contentScript,
    /label\.includes\('em grupo'\)/,
  )

  const lookupStart = contentScript.indexOf(
    'async function runAutomaticContactLookup(conversationKey)',
  )
  const lookupEnd = contentScript.indexOf(
    'function clearLeadStateForNewConversation()',
    lookupStart,
  )

  const lookupBlock = contentScript.slice(
    lookupStart,
    lookupEnd,
  )

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

  const refreshStart = contentScript.indexOf(
    'function refreshConversationSnapshot()',
  )
  const refreshEnd = contentScript.indexOf(
    'function getConnectionLabel()',
    refreshStart,
  )

  const refreshBlock = contentScript.slice(
    refreshStart,
    refreshEnd,
  )

  assert.match(
    refreshBlock,
    /const isGroupConversation =\s*isGroupConversationHeader\(\)/,
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
    const lookupStart =
      contentScript.indexOf(
        'async function runAutomaticContactLookup(conversationKey)',
      )

    const lookupEnd =
      contentScript.indexOf(
        'function clearLeadStateForNewConversation()',
        lookupStart,
      )

    assert.notEqual(lookupStart, -1)
    assert.notEqual(lookupEnd, -1)

    const lookupBlock =
      contentScript.slice(
        lookupStart,
        lookupEnd,
      )

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

    assert.match(
      lookupBlock,
      /A Yolen não altera a navegação do WhatsApp/,
    )

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
