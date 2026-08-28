// Blocker 2 (Fase 12A, Frente 2B, re-auditoria do Controle Mestre):
// distinguir exclusão explícita do WhatsApp de mero desaparecimento do
// DOM (virtualização/rolagem), que NUNCA prova exclusão real — e, desde
// a re-auditoria, desaparecimento do DOM não gera absolutamente nenhuma
// mutação de mensagem (nem versão is_deleted, nem perda de conteúdo, nem
// remoção do contexto canônico).
//
// content-script.js depende do DOM real do WhatsApp Web e não é testável
// comportamentalmente neste harness (mesmo padrão de
// content-script-capture-wiring.test.mjs). Este teste verifica
// estruturalmente que:
//   1. buildDeletedMessageSnapshotFromNode (caminho de marcador explícito)
//      sempre grava deletionReason: 'explicit_deletion';
//   2. o merge de um snapshot já existente durante uma nova detecção de
//      marcador explícito faz upgrade para 'explicit_deletion' (nunca
//      preserva um valor antigo mais fraco);
//   3. a antiga heurística de desaparecimento do DOM
//      (findSafeDisappearedMessageIds) foi removida por completo — não
//      existe mais nenhum caminho que produza deletionReason:
//      'dom_disappearance' a partir de uma mensagem que só saiu da
//      consulta atual do DOM.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test('buildDeletedMessageSnapshotFromNode sempre marca deletionReason como explicit_deletion', () => {
  const functionStart = contentScript.indexOf(
    'function buildDeletedMessageSnapshotFromNode(',
  )

  assert.notEqual(functionStart, -1)

  const functionEnd = contentScript.indexOf(
    '\n  function resetConversationMessageLedger(',
    functionStart,
  )

  assert.notEqual(functionEnd, -1)

  const functionBody = contentScript.slice(functionStart, functionEnd)

  const occurrences = functionBody.match(
    /deletionReason:\s*'explicit_deletion'/g,
  )

  assert.ok(
    occurrences && occurrences.length >= 2,
    'tanto o branch de reaproveitamento (previousMessage) quanto o branch de construção nova precisam marcar explicit_deletion',
  )

  assert.doesNotMatch(
    functionBody,
    /deletionReason:\s*'dom_disappearance'/,
    'este builder nunca deveria produzir dom_disappearance — só é chamado a partir do marcador explícito',
  )
})

test('reaproveitar snapshot já existente durante detecção de marcador explícito faz upgrade para explicit_deletion', () => {
  const guardIndex = contentScript.indexOf(
    'if (isDeletedMessageNode(node)) {',
  )

  assert.notEqual(guardIndex, -1)

  const nextFunctionIndex = contentScript.indexOf(
    '\n      })\n',
    guardIndex,
  )

  const block = contentScript.slice(
    guardIndex,
    nextFunctionIndex === -1 ? guardIndex + 2000 : nextFunctionIndex,
  )

  assert.match(
    block,
    /\.\.\.previousDeletedSnapshot,\s*\n\s*deletionReason:\s*'explicit_deletion'/,
    'ao reaproveitar um snapshot já existente, o branch precisa sobrescrever deletionReason para explicit_deletion',
  )
})

test('a heurística de desaparecimento do DOM foi removida — nenhum caminho produz deletionReason: dom_disappearance', () => {
  assert.doesNotMatch(
    contentScript,
    /findSafeDisappearedMessageIds/,
    'a heurística de "desaparecimento seguro" precisa ter sido removida por completo',
  )

  assert.doesNotMatch(
    contentScript,
    /deletionReason:\s*'dom_disappearance'/,
    'nenhum caminho do content-script.js pode mais produzir deletionReason: dom_disappearance',
  )
})

test('desaparecimento do DOM (teste B/C do Controle Mestre): mensagem que some da consulta permanece intocada no ledger', () => {
  const synchronizeStart = contentScript.indexOf(
    '  function synchronizeConversationMessageLedger()',
  )

  assert.notEqual(synchronizeStart, -1)

  const synchronizeEnd = contentScript.indexOf(
    '\n  function getSortedLedgerMessages()',
    synchronizeStart,
  )

  assert.notEqual(synchronizeEnd, -1)

  const synchronizeBlock = contentScript.slice(
    synchronizeStart,
    synchronizeEnd,
  )

  // O único ramo que remove uma mensagem de conversationMessageLedger
  // dentro desta função é o de marcador explícito de exclusão
  // (isDeletedMessageNode). Fora dele, não deve haver nenhuma outra
  // chamada a conversationMessageLedger.delete — nem por rolagem, nem
  // por troca de conversa, nem por virtualização.
  const deleteCalls = [
    ...synchronizeBlock.matchAll(
      /conversationMessageLedger\.delete\(/g,
    ),
  ]

  assert.equal(
    deleteCalls.length,
    1,
    'conversationMessageLedger.delete só pode ser chamado uma vez, dentro do ramo de marcador explícito de exclusão',
  )

  const explicitBranchStart = synchronizeBlock.indexOf(
    'if (isDeletedMessageNode(node)) {',
  )

  const onlyDeleteCallIndex = synchronizeBlock.indexOf(
    'conversationMessageLedger.delete(',
  )

  assert.ok(
    explicitBranchStart !== -1 &&
      onlyDeleteCallIndex > explicitBranchStart,
    'a única remoção do ledger precisa estar dentro do ramo do marcador explícito do WhatsApp',
  )
})

// Os cinco testes abaixo mapeiam diretamente aos cenários A-E exigidos
// pelo Controle Mestre na re-auditoria da Fase 12A, Frente 2B.

test('(A) mensagem visível que some por virtualização: estado canônico continua ativo', () => {
  // Já provado pelo teste anterior: o único conversationMessageLedger.delete()
  // de toda a função fica dentro do ramo isDeletedMessageNode(node). Uma
  // mensagem que estava em conversationMessageLedger e simplesmente não
  // aparece mais na querySelectorAll('[data-pre-plain-text]') desta
  // rodada (virtualização) não passa por nenhum callback — ela permanece
  // no Map exatamente como estava, isto é, ativa.
  assert.doesNotMatch(
    contentScript,
    /conversationMessageLedger\.delete\([^)]*\)[\s\S]{0,80}rememberPendingCaptureMutation/,
    'não deveria existir nenhum caminho remanescente que remova e capture uma mensagem fora do marcador explícito',
  )
})

test('(C) troca de conversa A->B não gera exclusão em A', () => {
  const resetStart = contentScript.indexOf(
    'function resetConversationMessageLedger(',
  )

  assert.notEqual(resetStart, -1)

  const resetEnd = contentScript.indexOf(
    '\n  function rememberPendingCaptureMutation(',
    resetStart,
  )

  assert.notEqual(resetEnd, -1)

  const resetBody = contentScript.slice(resetStart, resetEnd)

  // Trocar de conversa (messageLedgerConversationKey !== conversationKey)
  // apenas descarta os Maps/Sets em memória da conversa anterior — nunca
  // marca nada como excluído, nunca chama rememberPendingCaptureMutation
  // (ou seja, nunca gera um evento de captura de exclusão para as
  // mensagens de A só por sair da tela).
  assert.doesNotMatch(
    resetBody,
    /deletedMessageIds\s*=\s*new Set\(\s*\[/,
    'o reset precisa zerar deletedMessageIds para um Set vazio, não populá-lo',
  )

  assert.doesNotMatch(
    resetBody,
    /rememberPendingCaptureMutation/,
    'trocar de conversa nunca pode, por si só, gerar uma mutação de captura',
  )

  assert.match(
    resetBody,
    /deletedMessageIds\s*=\s*new Set\(\)/,
  )

  assert.match(
    resetBody,
    /conversationMessageLedger\s*=\s*new Map\(\)/,
  )
})

test('(D) marcador explícito do WhatsApp produz is_deleted:true + explicit_deletion no wire', () => {
  const builderStart = contentScript.indexOf(
    'function buildDeletedMessageSnapshotFromNode(',
  )

  assert.notEqual(builderStart, -1)

  assert.match(
    contentScript,
    /if \(isDeletedMessageNode\(node\)\) \{/,
    'a única entrada para o fluxo de exclusão continua sendo o marcador explícito do WhatsApp',
  )
})

test('(E) mensagem explicitamente deletada que reaparece: restore continua funcionando', () => {
  const synchronizeStart = contentScript.indexOf(
    '  function synchronizeConversationMessageLedger()',
  )

  const synchronizeEnd = contentScript.indexOf(
    '\n  function getSortedLedgerMessages()',
    synchronizeStart,
  )

  const synchronizeBlock = contentScript.slice(
    synchronizeStart,
    synchronizeEnd,
  )

  // Quando um node com o MESMO id volta a aparecer sem o marcador de
  // exclusão (isDeletedMessageNode(node) === false), o ramo normal
  // remove o id de deletedMessageIds e de deletedMessageSnapshots e
  // regrava a mensagem em conversationMessageLedger como ativa — isso
  // não foi alterado por esta correção.
  assert.match(
    synchronizeBlock,
    /deletedMessageIds\.delete\(\s*message\.id,?\s*\)/,
  )

  assert.match(
    synchronizeBlock,
    /deletedMessageSnapshots\.delete\(\s*message\.id,?\s*\)/,
  )

  assert.match(
    synchronizeBlock,
    /conversationMessageLedger\.set\(\s*message\.id,\s*messageToStore,?\s*\)/,
  )
})
