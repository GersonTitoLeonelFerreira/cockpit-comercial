// UX8 — Automatic Passive Lead Resolution: prova via texto-fonte de que a
// nova extração de telefone é estritamente passiva (leitura de atributos
// já presentes no DOM) e nunca introduz navegação sintética, e de que as
// chaves de dedup/cache usadas na resolução automática são identidade
// única de conversa (conversationKey), não o nome normalizado
// (contactLookupIdentity/lookupIdentity), que colide entre homônimos.
//
// Os cenários de comportamento real (resolução efetiva por JID, ambiguidade
// em #main, grupo/self, não-vazamento A->B) estão em
// tests/e3-dom/automatic-passive-lead-resolution.test.mjs.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

function blockBetween(startMarker, endMarker, fromIndex = 0) {
  const start = contentScript.indexOf(startMarker, fromIndex)
  const end = contentScript.indexOf(endMarker, start)

  assert.notEqual(start, -1, `marcador de início não encontrado: ${startMarker}`)
  assert.notEqual(end, -1, `marcador de fim não encontrado: ${endMarker}`)

  return contentScript.slice(start, end)
}

test('extractPhoneFromJid aceita só @c.us/@s.whatsapp.net e rejeita @g.us/@lid/@broadcast/@newsletter', () => {
  const block = blockBetween(
    'const PHONE_JID_DOMAINS',
    'function isProfileOrContactPanelText(',
  )

  assert.match(block, /PHONE_JID_DOMAINS/)
  assert.match(block, /'c\.us',\s*'s\.whatsapp\.net'/)

  // Allowlist estrita: não há um branch separado de rejeição para
  // g.us/lid/broadcast/newsletter porque eles simplesmente não estão na
  // allowlist — qualquer domínio fora do conjunto aceito é rejeitado.
  assert.doesNotMatch(block, /'g\.us'/)
  assert.doesNotMatch(block, /'lid'/)
})

test('extractPhoneFromJid nunca navega nem interage com o WhatsApp — é leitura pura de string', () => {
  const block = blockBetween(
    'const PHONE_JID_DOMAINS',
    'function isProfileOrContactPanelText(',
  )

  assert.doesNotMatch(block, /\.click\(/)
  assert.doesNotMatch(block, /dispatchEvent/)
  assert.doesNotMatch(block, /querySelector/)
  assert.doesNotMatch(block, /document\./)
})

test('resolvePassivePhoneForConversation: grupo e auto-conversa bloqueiam antes de qualquer leitura de JID', () => {
  const block = blockBetween(
    'function resolvePassivePhoneForConversation(',
    'function getVisibleMessagesCount(',
  )

  const guardIndex = block.indexOf('isSelfConversationTitle(title)')
  const groupGuardIndex = block.indexOf('isGroupConversationHeader()')
  const selectedJidIndex = block.indexOf('getSelectedChatDataId()')
  const mainScanIndex = block.indexOf('collectPhoneJidCandidatesInMain()')

  assert.ok(guardIndex >= 0)
  assert.ok(groupGuardIndex >= 0)
  assert.ok(selectedJidIndex > guardIndex)
  assert.ok(selectedJidIndex > groupGuardIndex)
  assert.ok(mainScanIndex > selectedJidIndex)
})

test('resolvePassivePhoneForConversation: linha selecionada vence antes de considerar #main (e sua ambiguidade)', () => {
  const block = blockBetween(
    'function resolvePassivePhoneForConversation(',
    'function getVisibleMessagesCount(',
  )

  const selectedReturnIndex = block.indexOf("source: 'JID da conversa selecionada'")
  const mainScanIndex = block.indexOf('collectPhoneJidCandidatesInMain()')

  assert.ok(selectedReturnIndex >= 0)
  assert.ok(mainScanIndex > selectedReturnIndex)
})

test('#main: 2+ telefones distintos são ambíguos e falham fechado (nunca escolhe "o primeiro")', () => {
  const block = blockBetween(
    'function resolvePassivePhoneForConversation(',
    'function getVisibleMessagesCount(',
  )

  const lengthCheckStart = block.indexOf('if (mainPhones.length === 1) {')
  const lengthCheckEnd = block.indexOf('}', lengthCheckStart)

  assert.ok(lengthCheckStart >= 0)

  const singleMatchBlock = block.slice(lengthCheckStart, lengthCheckEnd)
  assert.match(singleMatchBlock, /mainPhones\[0\]/)

  // Fora do branch "exatamente 1 candidato", não há mais nenhum uso de
  // mainPhones[0] — qualquer outra contagem (0 ou 2+) cai direto no
  // `return null` final, nunca escolhendo um candidato arbitrário.
  const afterBlock = block.slice(lengthCheckEnd)
  assert.doesNotMatch(afterBlock, /mainPhones\[0\]/)
  assert.match(afterBlock, /return null/)
})

test('collectPhoneJidCandidatesInMain varre só dentro de #main (getMainConversationRoot), nunca a sidebar/document inteiro', () => {
  const block = blockBetween(
    'function collectPhoneJidCandidatesInMain(',
    'function resolvePassivePhoneForConversation(',
  )

  assert.match(block, /getMainConversationRoot\(\)/)
  assert.match(block, /main\.querySelectorAll\(\s*'\[data-id\]'\s*\)/)
  assert.doesNotMatch(block, /document\.querySelectorAll/)
})

test('getConversationPhone: cachedPhonesByConversationKey (identidade única) é autoritativo; cachedPhonesByLookupIdentity (nome, colide em homônimos) não é mais lido aqui', () => {
  const block = blockBetween(
    'function getConversationPhone(',
    'function collectPhoneJidCandidatesInMain(',
  )

  assert.match(block, /cachedPhonesByConversationKey\.get\(/)
  assert.doesNotMatch(block, /cachedPhonesByLookupIdentity\.get\(/)
  assert.match(block, /resolvePassivePhoneForConversation\(/)

  // Ordem: cache por conversationKey antes da tentativa passiva de JID.
  const cacheIndex = block.indexOf('cachedPhonesByConversationKey.get(')
  const passiveIndex = block.indexOf('resolvePassivePhoneForConversation(')
  assert.ok(passiveIndex > cacheIndex)
})

test('runAutomaticContactLookup: resolução passiva roda antes do fail-closed do painel de contato, sem navegar', () => {
  const block = blockBetween(
    'async function runAutomaticContactLookup(conversationKey)',
    'function clearLeadStateForNewConversation()',
  )

  const passiveIndex = block.indexOf('resolvePassivePhoneForConversation(')
  const failClosedIndex = block.indexOf('if (!hadContactPanelOpen) {')

  assert.ok(passiveIndex >= 0)
  assert.ok(failClosedIndex > passiveIndex)

  assert.doesNotMatch(block, /getClickableHeaderTarget\(/)
  assert.doesNotMatch(block, /clickElement\(/)
  assert.doesNotMatch(block, /Escape/)
  assert.doesNotMatch(block, /findContactInfoPanel\(\)\s*\)\s*\n[\s\S]{0,40}\.click\(/)

  // Status inicial não afirma abrir nada — a resolução pode ser 100%
  // passiva e nunca tocar o painel.
  assert.match(block, /Identificando contato\.\.\./)
  assert.doesNotMatch(block, /Abrindo dados do contato automaticamente/)
})

test('autoLookupAttemptedKeys e lastResolvedConversationKey usam conversationKey (identidade única), não o nome normalizado', () => {
  const lookupBlock = blockBetween(
    'async function runAutomaticContactLookup(conversationKey)',
    'function clearLeadStateForNewConversation()',
  )

  assert.doesNotMatch(lookupBlock, /autoLookupAttemptedKeys\.(has|add)\(\s*lookupIdentity/)
  assert.match(lookupBlock, /autoLookupAttemptedKeys\.has\(\s*conversationKey/)
  assert.match(lookupBlock, /autoLookupAttemptedKeys\.add\(\s*conversationKey/)

  const refreshBlock = blockBetween(
    'function refreshConversationSnapshot()',
    'function getConnectionLabel()',
  )

  assert.doesNotMatch(refreshBlock, /lastResolvedContactLookupIdentity !==\s*contactLookupIdentity/)
  assert.match(refreshBlock, /lastResolvedConversationKey !==\s*conversationKey/)
  assert.doesNotMatch(refreshBlock, /!autoLookupAttemptedKeys\.has\(\s*contactLookupIdentity/)
  assert.match(refreshBlock, /!autoLookupAttemptedKeys\.has\(\s*conversationKey/)
})

test('não há nova navegação sintética em lugar nenhum do arquivo: nenhuma função nova usa click()/Escape/aria-selected global para navegar', () => {
  const newFunctionsBlock =
    blockBetween('function extractPhoneFromJid(', 'function isProfileOrContactPanelText(') +
    blockBetween('function getSelectedChatDataId(', 'function getSelectedChatStableIdentity(') +
    blockBetween('function collectPhoneJidCandidatesInMain(', 'function resolvePassivePhoneForConversation(') +
    blockBetween('function resolvePassivePhoneForConversation(', 'function getVisibleMessagesCount(')

  assert.doesNotMatch(newFunctionsBlock, /\.click\(/)
  assert.doesNotMatch(newFunctionsBlock, /dispatchEvent/)
  assert.doesNotMatch(newFunctionsBlock, /KeyboardEvent/)
  assert.doesNotMatch(newFunctionsBlock, /Escape/)
  assert.doesNotMatch(newFunctionsBlock, /aria-selected=["']true["']/)
})
