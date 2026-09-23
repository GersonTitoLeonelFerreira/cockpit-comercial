// UX8 FASE D: design final da aba MENSAGEM, fiel à imagem de
// referência. A arquitetura/lógica (FASE C) não muda — só UI, hierarquia
// visual, layout e microinteração sobre o comportamento existente.
// Prova via texto-fonte (CSS + runtime); a prova via DOM real
// (estabilidade geométrica sob conteúdo longo, estados idle/loading/
// ready/no_message/error) está em
// tests/e3-dom/ux8-message-design-dom.test.mjs.
//
// Itens 14 (A->B limpa resultado), 15 (resposta atrasada protegida), 18
// (mount único) e 19 (AGORA sem composer) já são provados por
// tests/e3-dom/ux8-message-tab-dom.test.mjs e
// tests/ux8-message-tab-structure.test.mjs (FASE C) — não duplicados
// aqui; a mudança de classes/CSS desta fase não altera esse contrato,
// confirmado pela própria suíte continuar verde.
//
// STEP 2B.5-D1: a lógica de estado/geração/render (getPresets, o HTML do
// composer, o event delegation) foi extraída de seller-message-runtime.js
// para o engine compartilhado companion-seller-message-engine.js (usado
// tanto por WhatsApp quanto por ManyChat) — seller-message-runtime.js hoje
// só contém o composer adapter WhatsApp-specific e a criação do engine.
// As asserções abaixo passaram a checar o arquivo onde cada trecho
// realmente mora agora, preservando a MESMA garantia semântica de antes.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [sellerRuntime, sellerMessageEngine, styles] = await Promise.all([
  readFile('app/extension/yolen-companion/src/seller-message-runtime.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-seller-message-engine.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/styles.css', 'utf8'),
])

function cssBlock(source, selectorLine) {
  const start = source.indexOf(selectorLine)
  const end = source.indexOf('}', start)
  return { start, block: source.slice(start, end) }
}

test('1+2) textarea tem geometria limitada e não usa resize vertical', () => {
  const { start, block } = cssBlock(styles, '.yolen-message-intent {')

  assert.notEqual(start, -1)
  assert.match(block, /height:\s*96px/)
  assert.match(block, /resize:\s*none/)
  assert.match(block, /overflow-y:\s*auto/)
  assert.doesNotMatch(block, /min-height/)
})

test('3) o card de resultado tem max-height e overflow interno próprio, separado do texto', () => {
  const { start, block } = cssBlock(styles, '.yolen-message-result-scroll {')

  assert.notEqual(start, -1)
  assert.match(block, /max-height:\s*200px/)
  assert.match(block, /overflow-y:\s*auto/)
})

test('4+5+6) ações ficam lado a lado (grid), Incluir é a ação primária e Copiar é secundária', () => {
  const { start, block } = cssBlock(styles, '.yolen-message-actions {')

  assert.notEqual(start, -1)
  assert.match(block, /display:\s*grid/)
  assert.match(block, /grid-template-columns:\s*1fr 1fr/)

  const resultBlockStart = sellerMessageEngine.indexOf(
    "'<div class=\"yolen-message-actions\">'",
  )
  const resultBlockEnd = sellerMessageEngine.indexOf(
    "'</div>',",
    resultBlockStart,
  )
  const resultBlock = sellerMessageEngine.slice(
    resultBlockStart,
    resultBlockEnd,
  )

  assert.notEqual(resultBlockStart, -1)
  assert.match(
    resultBlock,
    /yolen-primary-button.*data-yolen-seller-message-action="insert"/,
  )
  assert.match(
    resultBlock,
    /yolen-secondary-button.*data-yolen-seller-message-action="copy"/,
  )
})

test('7) o botão Gerar mensagem usa a mesma classe/estrutura em idle e loading — só o conteúdo interno muda', () => {
  const start = sellerMessageEngine.indexOf(
    "'<button type=\"button\" class=\"yolen-primary-button yolen-message-generate\"",
  )
  const end = sellerMessageEngine.indexOf("'</button>',", start)
  const block = sellerMessageEngine.slice(start, end)

  assert.notEqual(start, -1)
  // Uma única declaração de botão (não dois branches de HTML
  // diferentes) — loading só troca o texto interno, nunca a tag/classe.
  assert.match(block, /state\.status === 'loading'/)
  assert.match(block, /Gerando…/)
  assert.match(block, /Gerar mensagem/)

  const generateCssStart = styles.indexOf('.yolen-message-generate {')
  const generateCssEnd = styles.indexOf('}', generateCssStart)
  const generateCssBlock = styles.slice(generateCssStart, generateCssEnd)

  assert.match(generateCssBlock, /min-height:\s*40px/)
  assert.match(generateCssBlock, /width:\s*100%/)
})

test('17) nenhum auto-send foi introduzido pelo redesign', () => {
  assert.doesNotMatch(sellerRuntime, /sendButton\.click\(/)
  assert.doesNotMatch(sellerRuntime, /composer\.dispatchEvent\([^)]*submit/)
  assert.doesNotMatch(sellerRuntime, /\.submit\(\)/)
  assert.doesNotMatch(sellerMessageEngine, /sendButton\.click\(/)
  assert.doesNotMatch(sellerMessageEngine, /composer\.dispatchEvent\([^)]*submit/)
  assert.doesNotMatch(sellerMessageEngine, /\.submit\(\)/)
  assert.match(
    sellerMessageEngine,
    /A Yolen não envia mensagens automaticamente\. Revise antes de enviar\./,
  )
})

test('ensureStyles() foi removido — CSS estrutural da UX8 vive só em styles.css', () => {
  assert.doesNotMatch(sellerRuntime, /function ensureStyles/)
  assert.doesNotMatch(sellerRuntime, /ensureStyles\(\)/)
  assert.doesNotMatch(sellerRuntime, /document\.createElement\('style'\)/)
  assert.doesNotMatch(sellerMessageEngine, /function ensureStyles/)
  assert.doesNotMatch(sellerMessageEngine, /ensureStyles\(\)/)
  assert.doesNotMatch(sellerMessageEngine, /documentRef\.createElement\('style'\)/)
})

test('classes UX8 novas existem e as antigas yolen-seller-message-* (CSS, não data-attributes) não sobraram', () => {
  for (const selector of [
    '.yolen-message-workspace',
    '.yolen-message-objective-card',
    '.yolen-message-objective-title',
    '.yolen-message-objective-help',
    '.yolen-message-presets',
    '.yolen-message-preset',
    '.yolen-message-preset--active',
    '.yolen-message-intent-field',
    '.yolen-message-intent',
    '.yolen-message-intent-counter',
    '.yolen-message-generate',
    '.yolen-message-result-card',
    '.yolen-message-result-label',
    '.yolen-message-result-scroll',
    '.yolen-message-result-text',
    '.yolen-message-actions',
    '.yolen-message-footnote',
    '.yolen-message-status',
    '.yolen-message-feedback',
  ]) {
    assert.ok(styles.includes(selector), `styles.css precisa definir ${selector}`)
  }

  // data-yolen-seller-message-* são hooks de comportamento (ações,
  // preset index, campo de intenção, mount, box) — não são classes CSS e
  // não mudam nesta fase. Só as CLASSES de apresentação
  // (class="yolen-seller-message-...") precisam ter sumido.
  assert.doesNotMatch(
    sellerRuntime,
    /class="yolen-seller-message-/,
  )
  assert.doesNotMatch(
    sellerMessageEngine,
    /class="yolen-seller-message-/,
  )
})

test('contador de caracteres existe e é atualizado fora do ciclo de re-render (preserva foco/cursor)', () => {
  assert.match(
    sellerMessageEngine,
    /data-yolen-seller-message-counter/,
  )
  assert.match(
    sellerMessageEngine,
    /INTENT_MAX_LENGTH/,
  )

  const inputListenerMatch = sellerMessageEngine.match(
    /documentRef\.addEventListener\(\s*'input',[\s\S]*?(?=documentRef\.addEventListener\(\s*'click',)/,
  )

  assert.ok(inputListenerMatch, 'listener de input não encontrado no engine')

  const inputListenerBlock = inputListenerMatch[0]

  assert.match(
    inputListenerBlock,
    /data-yolen-seller-message-counter/,
  )
  // O contador é atualizado no MESMO listener que já atualiza
  // button.disabled diretamente (sem queueRender) — não pode haver uma
  // chamada de render aqui, ou a textarea perderia foco a cada tecla.
  assert.doesNotMatch(inputListenerBlock, /queueRender\(\)/)
})

test('a barra de abas usa grid de 4 colunas — achado da inspeção visual desta fase (a 4ª aba, Cliente, quebrava linha)', () => {
  // Ajuste mínimo estritamente necessário para a aba MENSAGEM "encaixar"
  // corretamente sob a barra de abas (seção 20 da autorização da FASE
  // D): o grid ainda estava fixo em 3 colunas desde antes da FASE C
  // adicionar a 4ª área (message), fazendo CLIENTE quebrar para uma
  // segunda linha. Nenhum teste anterior pegava isso porque jsdom não
  // calcula layout real — só apareceu na inspeção visual real desta
  // fase (seção 25).
  const start = styles.indexOf('.yolen-seller-tabs {')
  const end = styles.indexOf('}', start)
  const block = styles.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(block, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
})

test('presets continuam vindo da orientação contextual (getPresets), com estado ativo calculado, não strings fixas', () => {
  assert.doesNotMatch(
    sellerMessageEngine,
    /'Responder ao ponto principal'|'Confirmar próximos passos'|'Pedir mais contexto'/,
  )
  assert.match(sellerMessageEngine, /function getPresets\(/)
  assert.match(sellerMessageEngine, /shortPresetLabel\(/)
  assert.match(
    sellerMessageEngine,
    /yolen-message-preset--active/,
  )
  assert.match(
    sellerMessageEngine,
    /preset\.trim\(\) === trimmedIntent/,
  )
})
