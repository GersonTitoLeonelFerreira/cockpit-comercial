// FASE 4A.1 — autoridade canônica do workspace seller-facing
// (companion-workspace-runtime.js, contrato v1.1.0 §12 / gate A3).
//
// Carrega o módulo diretamente (sem DOM) e prova: lista/ordem/rótulos
// canônicos imutáveis, validação, navegação por teclado pura, HTML de
// abas/painéis/barra com a mesma semântica ARIA/CSS de antes da extração,
// ausência de dependência de plataforma e o wiring estático no
// content-script.js/manifest.json.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url))
const MODULE_PATH = `${SRC_DIR}companion-workspace-runtime.js`
const workspace = require(MODULE_PATH)

const moduleSource = readFileSync(MODULE_PATH, 'utf8')
const contentScriptSource = readFileSync(`${SRC_DIR}content-script.js`, 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

function whatsappScripts() {
  return manifest.content_scripts.find((entry) => entry.js?.includes('src/content-script.js')).js
}

test('SELLER_AREAS é exatamente now/message/analysis/client, nessa ordem', () => {
  assert.deepEqual([...workspace.SELLER_AREAS], ['now', 'message', 'analysis', 'client'])
})

test('SELLER_AREAS, SELLER_AREA_LABELS e a API são imutáveis', () => {
  assert.ok(Object.isFrozen(workspace.SELLER_AREAS))
  assert.ok(Object.isFrozen(workspace.SELLER_AREA_LABELS))
  assert.ok(Object.isFrozen(workspace))
  assert.throws(() => {
    'use strict'
    workspace.SELLER_AREAS.push('fifth')
  })
  assert.equal(workspace.SELLER_AREAS.length, 4)
})

test('SELLER_AREA_LABELS são os rótulos canônicos', () => {
  assert.deepEqual({ ...workspace.SELLER_AREA_LABELS }, {
    now: 'Agora',
    message: 'Mensagem',
    analysis: 'Análise',
    client: 'Cliente',
  })
})

test('isValidSellerArea aceita as quatro áreas', () => {
  for (const area of ['now', 'message', 'analysis', 'client']) {
    assert.equal(workspace.isValidSellerArea(area), true, area)
  }
})

test('isValidSellerArea rejeita área inválida', () => {
  for (const area of ['agora', 'NOW', '', null, undefined, 'fifth', 1]) {
    assert.equal(workspace.isValidSellerArea(area), false, String(area))
  }
})

test('normalizeSellerArea devolve a área válida ou o fallback', () => {
  assert.equal(workspace.normalizeSellerArea('client'), 'client')
  assert.equal(workspace.normalizeSellerArea('invalid'), 'now')
  assert.equal(workspace.normalizeSellerArea(undefined), 'now')
  assert.equal(workspace.normalizeSellerArea('invalid', 'analysis'), 'analysis')
})

test('ArrowRight avança para a próxima área', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('now', 'ArrowRight'), 'message')
  assert.equal(workspace.getNextSellerAreaForKeydown('message', 'ArrowRight'), 'analysis')
})

test('ArrowDown avança para a próxima área', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('analysis', 'ArrowDown'), 'client')
})

test('ArrowLeft volta para a área anterior', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('client', 'ArrowLeft'), 'analysis')
})

test('ArrowUp volta para a área anterior', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('message', 'ArrowUp'), 'now')
})

test('Home vai para now', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('client', 'Home'), 'now')
})

test('End vai para client', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('now', 'End'), 'client')
})

test('wrap client → now', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('client', 'ArrowRight'), 'now')
  assert.equal(workspace.getNextSellerAreaForKeydown('client', 'ArrowDown'), 'now')
})

test('wrap now → client', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('now', 'ArrowLeft'), 'client')
  assert.equal(workspace.getNextSellerAreaForKeydown('now', 'ArrowUp'), 'client')
})

test('tecla desconhecida → null', () => {
  for (const key of ['Enter', ' ', 'Tab', 'a', undefined]) {
    assert.equal(workspace.getNextSellerAreaForKeydown('now', key), null, String(key))
  }
})

test('área atual inválida → null', () => {
  assert.equal(workspace.getNextSellerAreaForKeydown('invalid', 'ArrowRight'), null)
  assert.equal(workspace.getNextSellerAreaForKeydown(null, 'Home'), null)
})

test('tab ativa: aria-selected=true, tabindex=0, classe ativa e ids/ARIA canônicos', () => {
  const html = workspace.getSellerAreaTabHtml('analysis', 'Análise', 'analysis')
  assert.match(html, /id="yolen-seller-tab-analysis"/)
  assert.match(html, /class="yolen-seller-tab yolen-seller-tab--active"/)
  assert.match(html, /type="button"/)
  assert.match(html, /role="tab"/)
  assert.match(html, /data-yolen-seller-area="analysis"/)
  assert.match(html, /aria-selected="true"/)
  assert.match(html, /aria-controls="yolen-seller-panel-analysis"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, />\s*Análise\s*<\/button>/)
})

test('tab inativa: aria-selected=false, tabindex=-1, sem classe ativa', () => {
  const html = workspace.getSellerAreaTabHtml('analysis', 'Análise', 'now')
  assert.match(html, /aria-selected="false"/)
  assert.match(html, /tabindex="-1"/)
  assert.doesNotMatch(html, /yolen-seller-tab--active/)
})

test('panel ativo sem hidden, com ARIA/ids canônicos e conteúdo intacto', () => {
  const html = workspace.getSellerAreaPanelHtml('client', '<div data-x="1">conteúdo</div>', 'client')
  assert.match(html, /id="yolen-seller-panel-client"/)
  assert.match(html, /class="yolen-seller-panel"/)
  assert.match(html, /role="tabpanel"/)
  assert.match(html, /aria-labelledby="yolen-seller-tab-client"/)
  assert.match(html, /data-yolen-seller-panel="client"/)
  assert.doesNotMatch(html, /\shidden\b/)
  assert.ok(html.includes('<div data-x="1">conteúdo</div>'), 'conteúdo da área não é escapado nem alterado')
})

test('panel inativo com hidden', () => {
  const html = workspace.getSellerAreaPanelHtml('client', '', 'now')
  assert.match(html, /\shidden\s*>/)
})

test('tabs bar: tablist canônica com as quatro abas na ordem oficial', () => {
  const html = workspace.getSellerAreaTabsBarHtml('message')
  assert.match(html, /class="yolen-seller-tabs"/)
  assert.match(html, /role="tablist"/)
  assert.match(html, /aria-label="Áreas do Yolen Companion"/)
  const order = [...html.matchAll(/data-yolen-seller-area="([a-z]+)"/g)].map((match) => match[1])
  assert.deepEqual(order, ['now', 'message', 'analysis', 'client'])
  const selected = [...html.matchAll(/data-yolen-seller-area="([a-z]+)"\s+aria-selected="true"/g)].map((match) => match[1])
  assert.deepEqual(selected, ['message'])
})

test('tabs bar: rótulos canônicos, com sobrescrita parcial caindo no canônico', () => {
  const labels = [...workspace.getSellerAreaTabsBarHtml('now').matchAll(/>\s*([^<>]+?)\s*<\/button>/g)].map((match) => match[1])
  assert.deepEqual(labels, ['Agora', 'Mensagem', 'Análise', 'Cliente'])

  const custom = [...workspace.getSellerAreaTabsBarHtml('now', { client: 'Contato' }).matchAll(/>\s*([^<>]+?)\s*<\/button>/g)].map((match) => match[1])
  assert.deepEqual(custom, ['Agora', 'Mensagem', 'Análise', 'Contato'])
})

test('HTML escapa area e label', () => {
  const html = workspace.getSellerAreaTabHtml('x"><script>', '<b>&\'', 'now')
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('x&quot;&gt;&lt;script&gt;'))
  assert.ok(html.includes('&lt;b&gt;&amp;&#039;'))
  const panel = workspace.getSellerAreaPanelHtml('a"b', '', 'now')
  assert.ok(panel.includes('yolen-seller-panel-a&quot;b'))
})

test('módulo é platform-neutral: sem DOM, sem extensão e sem termos de plataforma', () => {
  const forbidden = [
    'web.whatsapp.com',
    'app.manychat.com',
    '#main',
    'data-pre-plain-text',
    'subscriber_id',
    'wa_id',
    'JID',
    'React Fiber',
    'MutationObserver',
    'querySelector',
    'document',
    'window',
    'chrome',
    'browser',
    'composer',
    'data-testid',
  ]
  for (const term of forbidden) {
    assert.ok(!moduleSource.includes(term), `companion-workspace-runtime.js contém "${term}"`)
  }
})

test('wiring: content-script.js consome o runtime canônico e não mantém lista/HTML locais', () => {
  assert.match(contentScriptSource, /YolenCompanionWorkspaceRuntime/)
  assert.match(contentScriptSource, /Módulo do workspace canônico do Companion não carregado\./)
  assert.doesNotMatch(contentScriptSource, /\b(?:const|let|var)\s+SELLER_AREAS\b/)
  assert.doesNotMatch(contentScriptSource, /\bSELLER_AREAS\b/)
  assert.doesNotMatch(contentScriptSource, /function\s+getSellerArea(?:TabHtml|PanelHtml|TabsBarHtml)\s*\(/)
  for (const call of [
    'workspaceRuntime.isValidSellerArea',
    'workspaceRuntime.getNextSellerAreaForKeydown',
    'workspaceRuntime.getSellerAreaPanelHtml',
    'workspaceRuntime.getSellerAreaTabsBarHtml',
  ]) {
    assert.ok(contentScriptSource.includes(call), `content-script.js não usa ${call}`)
  }
})

test('wiring: manifest do WhatsApp carrega companion-workspace-runtime.js antes de content-script.js', () => {
  const scripts = whatsappScripts()
  const runtimeIndex = scripts.indexOf('src/companion-workspace-runtime.js')
  const contentScriptIndex = scripts.indexOf('src/content-script.js')
  assert.ok(runtimeIndex >= 0, 'módulo ausente do content_script do WhatsApp')
  assert.ok(runtimeIndex < contentScriptIndex, 'módulo precisa carregar antes de content-script.js')
})
