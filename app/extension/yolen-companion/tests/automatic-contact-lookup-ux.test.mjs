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

  assert.match(
    lookupBlock,
    /autoLookupAttemptedKeys\.has\(\s*lookupIdentity/,
  )

  assert.match(
    lookupBlock,
    /autoLookupAttemptedKeys\.add\(\s*lookupIdentity/,
  )

  assert.match(
    lookupBlock,
    /cachedPhonesByLookupIdentity\.set\(\s*lookupIdentity,\s*phone/,
  )

  assert.match(
    lookupBlock,
    /if \(!hadContactPanelOpen\) \{[\s\S]*closeContactInfoPanel\(\)/,
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

  assert.match(
    refreshBlock,
    /lastResolvedContactLookupIdentity !==\s*contactLookupIdentity/,
  )

  assert.match(
    refreshBlock,
    /!autoLookupAttemptedKeys\.has\(\s*contactLookupIdentity/,
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
