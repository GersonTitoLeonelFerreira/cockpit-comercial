// Blocker 2 (Fase 12A, Frente 2B): distinguir exclusão explícita do
// WhatsApp de mero desaparecimento do DOM (virtualização/rolagem), que
// NUNCA prova exclusão real.
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
//   3. o caminho de findSafeDisappearedMessageIds (heurística de DOM)
//      sempre grava deletionReason: 'dom_disappearance', nunca
//      'explicit_deletion'.

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

test('findSafeDisappearedMessageIds sempre grava deletionReason: dom_disappearance, nunca explicit_deletion', () => {
  const callIndex = contentScript.indexOf(
    'findSafeDisappearedMessageIds({',
  )

  assert.notEqual(callIndex, -1)

  const forEachIndex = contentScript.indexOf(
    'safelyDisappearedMessageIds',
    callIndex,
  )
  const forEachBodyStart = contentScript.indexOf('.forEach((messageId) => {', forEachIndex)
  const forEachBodyEnd = contentScript.indexOf(
    '\n      })\n',
    forEachBodyStart,
  )

  const block = contentScript.slice(forEachBodyStart, forEachBodyEnd)

  assert.match(
    block,
    /deletionReason:\s*'dom_disappearance'/,
    'a heurística de desaparecimento do DOM precisa marcar dom_disappearance',
  )

  assert.doesNotMatch(
    block,
    /deletionReason:\s*'explicit_deletion'/,
    'a heurística de desaparecimento do DOM NUNCA pode marcar explicit_deletion — isso provaria uma exclusão que não foi confirmada',
  )
})
