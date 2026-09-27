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
import { readWhatsAppCompositionSource } from './support/whatsapp-composition-source.mjs'

const require = createRequire(import.meta.url)
const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url))
const MODULE_PATH = `${SRC_DIR}companion-workspace-runtime.js`
const workspace = require(MODULE_PATH)

const moduleSource = readFileSync(MODULE_PATH, 'utf8')
const contentScriptSource = readWhatsAppCompositionSource()
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

test('workspace state inicia em now por padrão', () => {
  const state =
    workspace.createSellerWorkspaceState()

  assert.equal(
    state.getActiveArea(),
    'now',
  )

  assert.ok(
    Object.isFrozen(state),
  )
})

test('workspace state respeita initialArea válida e normaliza inválida', () => {
  const clientState =
    workspace.createSellerWorkspaceState(
      'client',
    )

  assert.equal(
    clientState.getActiveArea(),
    'client',
  )

  const invalidState =
    workspace.createSellerWorkspaceState(
      'invalid',
    )

  assert.equal(
    invalidState.getActiveArea(),
    'now',
  )
})

test('workspace state altera somente para área válida', () => {
  const state =
    workspace.createSellerWorkspaceState()

  assert.equal(
    state.setActiveArea('analysis'),
    true,
  )

  assert.equal(
    state.getActiveArea(),
    'analysis',
  )

  assert.equal(
    state.setActiveArea('analysis'),
    true,
  )

  assert.equal(
    state.getActiveArea(),
    'analysis',
  )

  assert.equal(
    state.setActiveArea('invalid'),
    false,
  )

  assert.equal(
    state.getActiveArea(),
    'analysis',
  )
})

test('workspace state reset volta deterministicamente para now', () => {
  const state =
    workspace.createSellerWorkspaceState(
      'client',
    )

  assert.equal(
    state.resetActiveArea(),
    'now',
  )

  assert.equal(
    state.getActiveArea(),
    'now',
  )
})

test('instâncias de workspace state são isoladas', () => {
  const first =
    workspace.createSellerWorkspaceState()

  const second =
    workspace.createSellerWorkspaceState()

  first.setActiveArea('client')

  assert.equal(
    first.getActiveArea(),
    'client',
  )

  assert.equal(
    second.getActiveArea(),
    'now',
  )
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

test('workspace canônico compõe os quatro painéis na ordem oficial', () => {
  const html = workspace.getSellerWorkspaceHtml({
    activeArea: 'analysis',
    nowHtml: '<div data-content="now">NOW</div>',
    messageHtml: '<div data-content="message">MESSAGE</div>',
    analysisHtml: '<div data-content="analysis">ANALYSIS</div>',
    clientHtml: '<div data-content="client">CLIENT</div>',
  })

  assert.match(
    html,
    /class="yolen-seller-workspace yolen-seller-workspace--ux7"/,
  )
  assert.match(
    html,
    /data-yolen-ux-build="UX7"/,
  )

  const nowIndex =
    html.indexOf('data-yolen-seller-panel="now"')
  const messageIndex =
    html.indexOf('data-yolen-seller-panel="message"')
  const analysisIndex =
    html.indexOf('data-yolen-seller-panel="analysis"')
  const clientIndex =
    html.indexOf('data-yolen-seller-panel="client"')

  for (const index of [
    nowIndex,
    messageIndex,
    analysisIndex,
    clientIndex,
  ]) {
    assert.notEqual(index, -1)
  }

  assert.ok(nowIndex < messageIndex)
  assert.ok(messageIndex < analysisIndex)
  assert.ok(analysisIndex < clientIndex)

  assert.ok(
    html.includes('<div data-content="now">NOW</div>'),
  )
  assert.ok(
    html.includes('<div data-content="message">MESSAGE</div>'),
  )
  assert.ok(
    html.includes('<div data-content="analysis">ANALYSIS</div>'),
  )
  assert.ok(
    html.includes('<div data-content="client">CLIENT</div>'),
  )

  const analysisPanelStart =
    html.indexOf('data-yolen-seller-panel="analysis"')
  const analysisPanelEnd =
    html.indexOf('</section>', analysisPanelStart)

  const analysisPanel =
    html.slice(
      analysisPanelStart,
      analysisPanelEnd,
    )

  assert.doesNotMatch(
    analysisPanel,
    /\shidden\b/,
  )
})

test('workspace canônico normaliza activeArea inválida para now', () => {
  const html = workspace.getSellerWorkspaceHtml({
    activeArea: 'invalid',
    nowHtml: 'NOW',
    messageHtml: 'MESSAGE',
    analysisHtml: 'ANALYSIS',
    clientHtml: 'CLIENT',
  })

  const nowStart =
    html.indexOf('data-yolen-seller-panel="now"')
  const nowEnd =
    html.indexOf('</section>', nowStart)

  const nowPanel =
    html.slice(
      nowStart,
      nowEnd,
    )

  assert.doesNotMatch(
    nowPanel,
    /\shidden\b/,
  )

  const clientStart =
    html.indexOf('data-yolen-seller-panel="client"')
  const clientEnd =
    html.indexOf('</section>', clientStart)

  const clientPanel =
    html.slice(
      clientStart,
      clientEnd,
    )

  assert.match(
    clientPanel,
    /\shidden\b/,
  )
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

  assert.doesNotMatch(
    contentScriptSource,
    /\blet activeSellerArea\b/,
  )

  assert.doesNotMatch(
    contentScriptSource,
    /\bactiveSellerArea\b/,
  )

  assert.match(
    contentScriptSource,
    /workspaceRuntime\.createSellerWorkspaceState\(\)/,
  )

  assert.match(
    contentScriptSource,
    /workspaceState\.getActiveArea\(\)/,
  )

  assert.match(
    contentScriptSource,
    /workspaceState\.setActiveArea\(nextArea\)/,
  )

  assert.match(
    contentScriptSource,
    /workspaceState\.resetActiveArea\(\)/,
  )
  for (const call of [
    'workspaceRuntime.createSellerWorkspaceState',
    'workspaceRuntime.getNextSellerAreaForKeydown',
    'workspaceRuntime.getSellerWorkspaceHtml',
    'workspaceRuntime.getSellerAreaTabsBarHtml',
  ]) {
    assert.ok(contentScriptSource.replace(/\s+\./g, '.').includes(call), `content-script.js não usa ${call}`)
  }
})

test('wiring: manifest do WhatsApp carrega companion-workspace-runtime.js antes de content-script.js', () => {
  const scripts = whatsappScripts()
  const runtimeIndex = scripts.indexOf('src/companion-workspace-runtime.js')
  const contentScriptIndex = scripts.indexOf('src/content-script.js')
  assert.ok(runtimeIndex >= 0, 'módulo ausente do content_script do WhatsApp')
  assert.ok(runtimeIndex < contentScriptIndex, 'módulo precisa carregar antes de content-script.js')
})
