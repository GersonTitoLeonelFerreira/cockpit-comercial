// Fase 12A, Frente 2B (re-auditoria do Controle Mestre): teste
// estrutural de "caller" para LeadCopilotPanel.tsx.
//
// Renderizar este componente exigiria uma infraestrutura de teste de
// React (@testing-library/react) que não existe neste repositório — o
// mesmo motivo pelo qual content-script.js (extensão) é testado
// estruturalmente em vez de comportamentalmente. Este teste confirma,
// lendo o código-fonte real, que:
//   1. confirmed_by_human: true só aparece dentro da chamada a
//      applyAISuggestion feita por handleApply;
//   2. handleApply só é acionado pelo clique explícito no botão
//      "Aplicar sugestão" (onClick={handleApply}) — não existe nenhum
//      outro caminho automático que chame applyAISuggestion.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./LeadCopilotPanel.tsx', import.meta.url),
  'utf8',
)

test('applyAISuggestion só é chamado dentro de handleApply, e handleApply só é acionado pelo clique no botão de aplicar', () => {
  const handleApplyStart = source.indexOf(
    'const handleApply = async () => {',
  )

  assert.notEqual(handleApplyStart, -1)

  const handleApplyEnd = source.indexOf(
    '\n  const handleReject',
    handleApplyStart,
  )

  assert.notEqual(handleApplyEnd, -1)

  const handleApplyBody = source.slice(
    handleApplyStart,
    handleApplyEnd,
  )

  assert.match(
    handleApplyBody,
    /await applyAISuggestion\(\{/,
  )

  assert.match(
    handleApplyBody,
    /confirmed_by_human:\s*true,/,
    'a chamada dentro de handleApply precisa enviar confirmed_by_human: true',
  )

  // Fora de handleApply, applyAISuggestion nunca deveria ser chamado —
  // nenhum outro fluxo (analyze, reject, effects) pode aplicar a
  // sugestão sem o clique explícito do vendedor.
  const applyCallCount = (
    source.match(/applyAISuggestion\(/g) || []
  ).length

  assert.equal(
    applyCallCount,
    1,
    'applyAISuggestion só pode ser chamado uma vez no componente inteiro, dentro de handleApply',
  )

  assert.match(
    source,
    /onClick=\{handleApply\}/,
    'o botão precisa acionar handleApply explicitamente no clique',
  )
})
