;(function initYolenManyChatPanelMount(root) {
  'use strict'

  const PLATFORM = 'manychat'

  // Reaproveita EXATAMENTE o shell visual já construído para o WhatsApp
  // (mesmo #id/.class, mesmo styles.css) — evidência live confirmou que
  // não existe nenhum ancestral estável do ManyChat para acoplar a UI, e a
  // estratégia recomendada foi criar uma raiz própria da Yolen em
  // document.body, com posicionamento fixed controlado só pela extensão
  // (nunca dependendo de classes internas geradas do ManyChat). O CSS de
  // #yolen-companion-panel já é position:fixed relativo à viewport, então
  // funciona de forma idêntica em qualquer página.
  const PANEL_ID = 'yolen-companion-panel'
  const ROOT_CLASS = 'yolen-companion-root'
  const COLLAPSED_CLASS = 'yolen-panel-collapsed'
  const CONVERSATION_ANCHOR_SELECTOR = '[data-test-id="chat-messages-list"]'

  function isConversationOpen(documentRef) {
    return Boolean(documentRef?.querySelector?.(CONVERSATION_ANCHOR_SELECTOR))
  }

  // document.getElementById só encontra nós de fato anexados à árvore —
  // se algo desanexar nosso elemento (ex.: um remount de SPA que limpou
  // nós de body inteiros), a busca por id sozinha nunca "ressuscitaria" o
  // MESMO elemento (encontraria null e criaria um segundo). Por isso
  // guardamos a última referência por documento (WeakMap: nunca impede
  // coleta de lixo do documento) e reanexamos o MESMO nó se ele ainda
  // existir mas tiver caído fora da árvore.
  const lastElementByDocument = new WeakMap()

  // Cria a raiz do painel se ainda não existir (idempotente — nunca cria
  // um segundo elemento) e garante que ela continua anexada a
  // document.body mesmo se algo a tiver removido (a nossa raiz nunca fica
  // DENTRO da árvore gerenciada pelo React do ManyChat, então isso só
  // aconteceria por uma limpeza ampla de document.body).
  function ensurePanelMounted({ document: documentRef = root.document } = {}) {
    if (!documentRef?.body) {
      return Object.freeze({ ready: false, reason: 'document_unavailable', element: null })
    }

    let element = documentRef.getElementById(PANEL_ID) ?? lastElementByDocument.get(documentRef) ?? null

    if (!element) {
      element = documentRef.createElement('aside')
      element.id = PANEL_ID
      element.className = ROOT_CLASS
      element.setAttribute('data-yolen-platform', PLATFORM)
    }

    if (!documentRef.body.contains(element)) {
      documentRef.body.appendChild(element)
    }

    lastElementByDocument.set(documentRef, element)

    return Object.freeze({ ready: true, reason: null, element })
  }

  // A raiz existe o tempo todo (montagem única), mas só fica visível
  // quando há uma conversa ManyChat de fato aberta — nunca aparece sobre
  // o inbox ou outras telas do ManyChat.
  function syncPanelVisibility({ document: documentRef = root.document } = {}) {
    const mounted = ensurePanelMounted({ document: documentRef })
    if (!mounted.ready) return mounted

    const open = isConversationOpen(documentRef)
    mounted.element.hidden = !open

    return Object.freeze({ ready: true, reason: null, element: mounted.element, visible: open })
  }

  function setPanelContent(html, { document: documentRef = root.document } = {}) {
    const mounted = ensurePanelMounted({ document: documentRef })
    if (!mounted.ready) return mounted

    mounted.element.innerHTML = typeof html === 'string' ? html : ''
    return mounted
  }

  function setPanelCollapsed(collapsed, { document: documentRef = root.document } = {}) {
    const mounted = ensurePanelMounted({ document: documentRef })
    if (!mounted.ready) return mounted

    mounted.element.classList.toggle(COLLAPSED_CLASS, collapsed === true)
    return mounted
  }

  function removePanel({ document: documentRef = root.document } = {}) {
    const element = documentRef?.getElementById?.(PANEL_ID)
    if (element?.parentNode) {
      element.parentNode.removeChild(element)
    }
  }

  const api = Object.freeze({
    PLATFORM,
    PANEL_ID,
    ROOT_CLASS,
    COLLAPSED_CLASS,
    CONVERSATION_ANCHOR_SELECTOR,
    isConversationOpen,
    ensurePanelMounted,
    syncPanelVisibility,
    setPanelContent,
    setPanelCollapsed,
    removePanel,
  })

  root.YolenManyChatPanelMount = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
