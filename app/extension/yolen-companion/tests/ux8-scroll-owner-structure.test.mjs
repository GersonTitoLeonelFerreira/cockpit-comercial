// FASE B.1/B.2 da UX8 (scroll owner correto): antes da UX8,
// #yolen-companion-panel era, ele mesmo, o elemento rolável; depois da
// FASE B (shell flex + overflow:hidden), quem rola de verdade é
// .yolen-workspace-body. Qualquer leitura/escrita operacional de
// panel.scrollTop/scrollHeight/clientHeight ficou órfã (aponta para um
// elemento que não rola mais de verdade). Este arquivo prova, via
// texto-fonte, que nenhuma ocorrência operacional restou em
// content-script.js, panel-stability-runtime.js nem
// editable-field-stability-runtime.js — toda leitura/escrita de scroll
// passa pelo helper canônico getWorkspaceScrollContainer (duplicado
// localmente em cada uma das três IIFEs isoladas).
//
// A prova via DOM real (comportamento) está em
// tests/e3-dom/ux8-scroll-owner-dom.test.mjs e
// tests/e3-dom/ux8-editable-field-scroll-owner-dom.test.mjs.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [contentScript, panelStabilityRuntime, editableFieldStabilityRuntime] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/panel-stability-runtime.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/editable-field-stability-runtime.js', 'utf8'),
])

// Remove comentários de bloco e de linha antes de procurar por padrões
// operacionais — os próprios comentários que documentam esta correção
// mencionam "panel.scrollTop" como texto explicativo, e isso não pode
// contar como uma ocorrência operacional real.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//')
      return index === -1 ? line : line.slice(0, index)
    })
    .join('\n')
}

const DANGEROUS_PATTERNS = [
  /\bpanel\.scrollTop\b/,
  /\bpanel\.scrollHeight\b/,
  /\bpanel\.clientHeight\b/,
  /\bcurrentPanel\.scrollTop\b/,
  /\bcurrentPanel\.scrollHeight\b/,
  /\bcurrentPanel\.clientHeight\b/,
  /\btargetPanel\.scrollTop\b/,
  /\btargetPanel\.scrollHeight\b/,
  /\btargetPanel\.clientHeight\b/,
]

test('content-script.js: nenhuma leitura/escrita operacional de panel.scrollTop/scrollHeight/clientHeight sobrou fora do helper canônico', () => {
  const codeOnly = stripComments(contentScript)

  for (const pattern of DANGEROUS_PATTERNS) {
    assert.doesNotMatch(
      codeOnly,
      pattern,
      `encontrado uso operacional de "${pattern}" em content-script.js — deveria passar por getWorkspaceScrollContainer()`,
    )
  }

  // O helper canônico existe e é usado nos dois pontos que antes liam/
  // escreviam panel.scrollTop diretamente (reset de conversa e
  // preservação de foco em setActiveSellerArea).
  assert.match(
    contentScript,
    /function getWorkspaceScrollContainer\(\s*panel,?\s*\)/,
  )

  const usages = contentScript.match(
    /getWorkspaceScrollContainer\(/g,
  )

  // getWorkspaceBodyContainer() (criação) + os dois pontos operacionais
  // de leitura/escrita = pelo menos 3 chamadas.
  assert.ok(
    usages && usages.length >= 3,
    'getWorkspaceScrollContainer precisa ser reaproveitado (não reimplementar querySelector solto)',
  )
})

test('panel-stability-runtime.js: nenhuma leitura/escrita operacional de panel.scrollTop/scrollHeight/clientHeight sobrou fora do helper canônico', () => {
  const codeOnly = stripComments(panelStabilityRuntime)

  for (const pattern of DANGEROUS_PATTERNS) {
    assert.doesNotMatch(
      codeOnly,
      pattern,
      `encontrado uso operacional de "${pattern}" em panel-stability-runtime.js — deveria passar por getWorkspaceScrollContainer()`,
    )
  }

  assert.match(
    panelStabilityRuntime,
    /function getWorkspaceScrollContainer\(targetPanel\)/,
  )

  const usages = panelStabilityRuntime.match(
    /getWorkspaceScrollContainer\(/g,
  )

  // captureScroll, getRestoreTop, bindPanel, restoreActionVisualAnchor,
  // applyPendingPanelHtml, restorePanelInteraction, handlePanelMutation e
  // o listener de mousedown do intent — pelo menos 8 pontos precisam
  // resolver o scroll target pelo helper, não reimplementar o
  // querySelector.
  assert.ok(
    usages && usages.length >= 8,
    'getWorkspaceScrollContainer precisa ser reaproveitado em todos os pontos que antes usavam targetPanel.scrollTop diretamente',
  )
})

test('editable-field-stability-runtime.js: nenhuma leitura/escrita operacional de panel.scrollTop/scrollHeight/clientHeight sobrou fora do helper canônico', () => {
  const codeOnly = stripComments(editableFieldStabilityRuntime)

  for (const pattern of DANGEROUS_PATTERNS) {
    assert.doesNotMatch(
      codeOnly,
      pattern,
      `encontrado uso operacional de "${pattern}" em editable-field-stability-runtime.js — deveria passar por getWorkspaceScrollContainer()`,
    )
  }

  assert.match(
    editableFieldStabilityRuntime,
    /function getWorkspaceScrollContainer\(targetPanel\)/,
  )

  const usages = editableFieldStabilityRuntime.match(
    /getWorkspaceScrollContainer\(/g,
  )

  // restoreLockedScroll, flushPending (antes e depois da substituição de
  // innerHTML) e lock() — pelo menos 4 pontos precisam resolver o scroll
  // target pelo helper, não reimplementar o querySelector.
  assert.ok(
    usages && usages.length >= 4,
    'getWorkspaceScrollContainer precisa ser reaproveitado em todos os pontos que antes usavam currentPanel.scrollTop diretamente',
  )
})

test('getWorkspaceScrollContainer é fail-safe: devolve null sem lançar quando o workspace-body não existe (ex.: modo colapsado)', () => {
  for (const source of [contentScript, panelStabilityRuntime, editableFieldStabilityRuntime]) {
    const start = source.indexOf('function getWorkspaceScrollContainer(')
    const end = source.indexOf('\n  }', start)
    const block = source.slice(start, end)

    assert.notEqual(start, -1)
    assert.match(block, /\|\|\s*null/)
    assert.doesNotMatch(block, /throw/)
  }
})
