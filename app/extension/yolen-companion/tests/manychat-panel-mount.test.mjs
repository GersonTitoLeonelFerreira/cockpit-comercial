import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const panelMount = require('../src/manychat-panel-mount.js')

function buildDom(bodyHtml = '') {
  return new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`)
}

const CONVERSATION_ANCHOR = '<div data-test-id="chat-messages-list"></div>'

test('monta a raiz do painel uma única vez, direto em document.body', () => {
  const dom = buildDom()
  const first = panelMount.ensurePanelMounted({ document: dom.window.document })
  const second = panelMount.ensurePanelMounted({ document: dom.window.document })

  assert.equal(first.ready, true)
  assert.equal(first.element.parentNode, dom.window.document.body)
  assert.equal(first.element, second.element, 'nunca cria um segundo elemento')
  assert.equal(
    dom.window.document.querySelectorAll(`#${panelMount.PANEL_ID}`).length,
    1,
  )
})

test('a raiz usa o mesmo #id/.class do painel já validado do WhatsApp (reaproveita o CSS existente)', () => {
  const dom = buildDom()
  const mounted = panelMount.ensurePanelMounted({ document: dom.window.document })

  assert.equal(mounted.element.id, 'yolen-companion-panel')
  assert.equal(mounted.element.className, 'yolen-companion-root')
  assert.equal(mounted.element.getAttribute('data-yolen-platform'), 'manychat')
})

test('re-anexa a raiz se algo a remover de document.body (nunca fica órfã)', () => {
  const dom = buildDom()
  const mounted = panelMount.ensurePanelMounted({ document: dom.window.document })
  mounted.element.remove()

  assert.equal(dom.window.document.body.contains(mounted.element), false)

  const resynced = panelMount.ensurePanelMounted({ document: dom.window.document })
  assert.equal(resynced.element, mounted.element)
  assert.equal(dom.window.document.body.contains(resynced.element), true)
})

test('painel fica oculto fora de uma conversa e visível dentro de uma', () => {
  const dom = buildDom()
  const hidden = panelMount.syncPanelVisibility({ document: dom.window.document })

  assert.equal(hidden.visible, false)
  assert.equal(hidden.element.hidden, true)

  dom.window.document.body.insertAdjacentHTML('beforeend', CONVERSATION_ANCHOR)
  const visible = panelMount.syncPanelVisibility({ document: dom.window.document })

  assert.equal(visible.visible, true)
  assert.equal(visible.element.hidden, false)
})

test('painel nunca aparece sobre o inbox: sair da conversa esconde de novo', () => {
  const dom = buildDom(CONVERSATION_ANCHOR)
  panelMount.syncPanelVisibility({ document: dom.window.document })

  dom.window.document.querySelector('[data-test-id="chat-messages-list"]').remove()
  const afterLeaving = panelMount.syncPanelVisibility({ document: dom.window.document })

  assert.equal(afterLeaving.visible, false)
  assert.equal(afterLeaving.element.hidden, true)
})

test('setPanelContent substitui o HTML interno sem recriar a raiz', () => {
  const dom = buildDom()
  const before = panelMount.ensurePanelMounted({ document: dom.window.document })

  panelMount.setPanelContent('<div id="agora">AGORA</div>', { document: dom.window.document })

  const after = panelMount.ensurePanelMounted({ document: dom.window.document })
  assert.equal(after.element, before.element)
  assert.equal(
    dom.window.document.querySelector('#yolen-companion-panel #agora')?.textContent,
    'AGORA',
  )
})

test('setPanelContent nunca escreve innerHTML de novo se o HTML final for idêntico ao já renderizado', () => {
  const dom = buildDom()
  panelMount.setPanelContent('<div id="agora">AGORA</div>', { document: dom.window.document })

  const mounted = panelMount.ensurePanelMounted({ document: dom.window.document })
  const node = mounted.element.querySelector('#agora')

  // Mesmo HTML de novo (ex.: renderPanel rodou de novo mas o view model não
  // mudou) — nunca deveria tocar no DOM, senão o próprio nó seria
  // recriado (identidade de referência mudaria) mesmo sem mudança visual.
  panelMount.setPanelContent('<div id="agora">AGORA</div>', { document: dom.window.document })
  assert.equal(
    mounted.element.querySelector('#agora'),
    node,
    'o nó não foi recriado — nenhuma escrita de innerHTML aconteceu',
  )

  // HTML realmente diferente ainda escreve normalmente.
  panelMount.setPanelContent('<div id="agora">AGORA (atualizado)</div>', {
    document: dom.window.document,
  })
  assert.equal(mounted.element.querySelector('#agora').textContent, 'AGORA (atualizado)')
})

test('setPanelCollapsed alterna a classe de colapso sem afetar o restante', () => {
  const dom = buildDom()
  panelMount.setPanelCollapsed(true, { document: dom.window.document })
  const collapsed = panelMount.ensurePanelMounted({ document: dom.window.document })
  assert.equal(collapsed.element.classList.contains('yolen-panel-collapsed'), true)

  panelMount.setPanelCollapsed(false, { document: dom.window.document })
  const expanded = panelMount.ensurePanelMounted({ document: dom.window.document })
  assert.equal(expanded.element.classList.contains('yolen-panel-collapsed'), false)
})

test('removePanel remove a raiz por completo (usado só em testes/cleanup)', () => {
  const dom = buildDom()
  panelMount.ensurePanelMounted({ document: dom.window.document })
  panelMount.removePanel({ document: dom.window.document })

  assert.equal(dom.window.document.getElementById('yolen-companion-panel'), null)
})
