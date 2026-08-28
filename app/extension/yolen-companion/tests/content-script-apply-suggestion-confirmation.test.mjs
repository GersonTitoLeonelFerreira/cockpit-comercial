// Blocker 1 (Fase 12A, Frente 2B): confirmação humana fail-closed.
//
// content-script.js é grande demais e depende do DOM real do WhatsApp Web
// para ser testado comportamentalmente ponta a ponta neste harness (mesmo
// padrão já usado por content-script-capture-wiring.test.mjs). Este teste
// verifica estruturalmente que:
//   1. applyCurrentSuggestion só chama a API depois do `if (!confirmed) return`;
//   2. o payload enviado para applySuggestion inclui `confirmed_by_human: true`;
//   3. isso acontece DEPOIS do early-return de cancelamento (ou seja, o
//      campo nunca é enviado como true sem o vendedor ter confirmado).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test('applyCurrentSuggestion só chama a API após a confirmação humana (window.confirm)', () => {
  const functionStart = contentScript.indexOf(
    'async function applyCurrentSuggestion()',
  )

  assert.notEqual(functionStart, -1, 'applyCurrentSuggestion deveria existir')

  const functionEnd = contentScript.indexOf(
    '\n  async function',
    functionStart + 1,
  )

  const functionBody = contentScript.slice(
    functionStart,
    functionEnd === -1 ? undefined : functionEnd,
  )

  const confirmIndex = functionBody.indexOf('window.confirm(')
  const earlyReturnIndex = functionBody.indexOf('if (!confirmed) {')
  const applyCallIndex = functionBody.indexOf(
    'window.YolenCompanionApi.applySuggestion(',
  )
  const confirmedFieldIndex = functionBody.indexOf('confirmed_by_human: true')

  assert.ok(confirmIndex >= 0, 'deveria chamar window.confirm')
  assert.ok(earlyReturnIndex >= 0, 'deveria ter o early-return de cancelamento')
  assert.ok(applyCallIndex >= 0, 'deveria chamar applySuggestion')
  assert.ok(
    confirmedFieldIndex >= 0,
    'o payload deveria declarar confirmed_by_human: true',
  )

  assert.ok(
    confirmIndex < earlyReturnIndex,
    'window.confirm precisa vir antes do early-return',
  )
  assert.ok(
    earlyReturnIndex < applyCallIndex,
    'o early-return de cancelamento precisa vir antes da chamada à API — ' +
      'garante que confirmed_by_human:true só é alcançável após confirmação real',
  )
  assert.ok(
    confirmedFieldIndex > applyCallIndex &&
      confirmedFieldIndex < applyCallIndex + 900,
    'confirmed_by_human deveria estar dentro do mesmo objeto de payload da chamada applySuggestion',
  )
})
