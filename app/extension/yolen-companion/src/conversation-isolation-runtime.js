;(function initConversationIsolationRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const REFRESH_SELECTOR = '[data-yolen-action="refresh"]'
  const REGION_SELECTOR = '[data-yolen-region]'
  const CHAT_ROW_SELECTOR = [
    '#pane-side [aria-selected="true"]',
    '#pane-side [data-selected="true"]',
    '[data-testid="chat-list"] [aria-selected="true"]',
  ].join(',')
  const CONVERSATION_REGION_KEYS = new Set([
    'contact-card',
    'registration-card',
    'lead-enrichment',
    'pre-send-assessment',
    'lead-summary-card',
    'seller-information-architecture',
  ])

  let conversationEpoch = 0
  let currentConversationKey = null
  let refreshRetryTimer = 0

  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function looksLikePhone(value) {
    const text = cleanText(value)
    const digits = onlyDigits(text)

    return Boolean(
      text &&
      digits.length >= 10 &&
      digits.length <= 13 &&
      text.replace(/[\d\s()+.-]/g, '').length === 0,
    )
  }

  function getMainHeader() {
    return document.querySelector('#main > header')
  }

  function getMainHeaderTitle() {
    const header = getMainHeader()

    if (!header) {
      return ''
    }

    for (const node of header.querySelectorAll('[title]')) {
      const title = cleanText(
        node.getAttribute('title'),
      )

      if (title) {
        return title
      }
    }

    return cleanText(header.textContent)
  }

  function getSelectedChatElement() {
    return document.querySelector(
      CHAT_ROW_SELECTOR,
    )
  }

  function getSelectedChatStrongIdentity() {
    const selected = getSelectedChatElement()

    if (!selected) {
      return ''
    }

    const directDataId = cleanText(
      selected.getAttribute('data-id'),
    )
    const nestedDataId = cleanText(
      selected
        .querySelector('[data-id]')
        ?.getAttribute('data-id'),
    )
    const dataId =
      directDataId || nestedDataId

    if (dataId) {
      return `data:${dataId}`
    }

    const avatarSource = cleanText(
      selected
        .querySelector('img[src]')
        ?.getAttribute('src'),
    )

    if (avatarSource) {
      return `avatar:${avatarSource}`
    }

    return ''
  }

  function getSelectedChatTitle() {
    const selected = getSelectedChatElement()

    if (!selected) {
      return ''
    }

    for (const node of selected.querySelectorAll('[title]')) {
      const title = cleanText(
        node.getAttribute('title'),
      )

      if (title) {
        return title
      }
    }

    for (const node of selected.querySelectorAll('[dir="auto"]')) {
      const text = cleanText(node.textContent)

      if (text) {
        return text
      }
    }

    return ''
  }

  function getConversationKeyFromDom() {
    const title = getMainHeaderTitle()

    if (!title) {
      return null
    }

    const strongIdentity =
      getSelectedChatStrongIdentity()

    // data-id/JID (ou avatar da linha selecionada como segunda opção) é
    // authoritative. O nome visível não entra nessa chave: sidebar, mídia
    // e mudanças cosméticas do header não podem criar falso boundary, e
    // contatos homônimos continuam separados pelo identificador forte.
    if (strongIdentity) {
      return `selected:${strongIdentity}`
    }

    if (looksLikePhone(title)) {
      return `phone:${onlyDigits(title)}`
    }

    const selectedTitle =
      getSelectedChatTitle()

    // Fallback para versões do WhatsApp sem data-id/avatar. Atributos
    // genéricos como data-testid/aria-label não são promovidos a identidade
    // porque podem ser iguais em várias linhas.
    return selectedTitle
      ? `title:${selectedTitle}::header:${title}`
      : `header:${title}`
  }

  function captureIdentity() {
    return Object.freeze({
      epoch: conversationEpoch,
      conversationKey:
        currentConversationKey ||
        getConversationKeyFromDom(),
    })
  }

  function isIdentityCurrent(identity) {
    if (!identity) {
      return false
    }

    const liveKey =
      getConversationKeyFromDom()

    return Boolean(
      identity.epoch === conversationEpoch &&
      identity.conversationKey &&
      identity.conversationKey ===
        currentConversationKey &&
      identity.conversationKey === liveKey,
    )
  }

  function getDraftIdentityKey(phone) {
    const normalizedPhone =
      onlyDigits(phone)
    const key =
      currentConversationKey ||
      getConversationKeyFromDom()

    if (!key || !normalizedPhone) {
      return null
    }

    return `${key}::${normalizedPhone}`
  }

  function dispatchOutsidePanelPointerDown() {
    const target =
      document.body ||
      document.documentElement

    if (!target) {
      return
    }

    try {
      target.dispatchEvent(
        new Event('pointerdown', {
          bubbles: true,
          cancelable: false,
        }),
      )
    } catch {
      // Compatibilidade defensiva com engines antigas.
    }
  }

  function releasePanelInteractionLocks(panel) {
    const active = document.activeElement

    if (
      active &&
      panel?.contains(active) &&
      typeof active.blur === 'function'
    ) {
      active.blur()
    }

    try {
      document.dispatchEvent(
        new Event('pointercancel', {
          bubbles: true,
          cancelable: false,
        }),
      )
    } catch {
      // Compatibilidade defensiva com engines antigas.
    }

    // panel-stability-runtime libera qualquer lock (inclusive campo com
    // foco, não apenas action lock) quando existe pointerdown fora do
    // Companion. No boundary isso precisa ser síncrono: preservar a
    // interação de A nunca pode impedir a montagem de B.
    dispatchOutsidePanelPointerDown()

    panel
      ?.querySelectorAll(REGION_SELECTOR)
      .forEach((region) => {
        delete region.dataset
          .yolenRegionActionLock
      })
  }

  function preparePanelForConversationBoundary(panel) {
    if (!panel) {
      return
    }

    panel.scrollTop = 0

    // O content-script mantém caches privados por região. Limpar apenas o
    // DOM aqui faria o cache acreditar que o HTML antigo continua aplicado.
    // Ao marcar o layout como boundary, o próximo renderPanel() entra no
    // caminho já existente de reconstrução estrutural: zera o shell,
    // limpa panelRegionHtmlCache/pending e imediatamente monta a conversa
    // nova. O full reset ocorre SOMENTE numa troca real de identidade; os
    // renders normais continuam 100% regionais.
    if (
      panel.dataset.yolenPanelLayout ===
      'regions'
    ) {
      panel.dataset.yolenPanelLayout =
        'conversation-boundary'
    }
  }

  function clearConversationRegionsFallback(panel) {
    if (!panel) {
      return
    }

    panel
      .querySelectorAll(REGION_SELECTOR)
      .forEach((region) => {
        const regionKey =
          region.getAttribute(
            'data-yolen-region',
          )

        if (
          CONVERSATION_REGION_KEYS.has(
            regionKey,
          )
        ) {
          region.replaceChildren()
        }
      })
  }

  function clickRefreshButton(button) {
    if (!button || typeof button.click !== 'function') {
      return false
    }

    button.click()
    return true
  }

  function requestContentScriptRefresh({
    retry = true,
  } = {}) {
    const panel =
      document.getElementById(PANEL_ID)
    const refreshButton =
      panel?.querySelector(REFRESH_SELECTOR)

    if (clickRefreshButton(refreshButton)) {
      return true
    }

    if (!retry) {
      return false
    }

    if (refreshRetryTimer) {
      root.clearTimeout(refreshRetryTimer)
    }

    refreshRetryTimer = root.setTimeout(() => {
      refreshRetryTimer = 0
      const retried =
        requestContentScriptRefresh({
          retry: false,
        })

      if (!retried) {
        root.dispatchEvent(
          new Event('focus'),
        )
      }
    }, 80)

    return false
  }

  function applyConversationBoundary(nextKey) {
    if (!nextKey) {
      return
    }

    conversationEpoch += 1
    currentConversationKey = nextKey

    const panel =
      document.getElementById(PANEL_ID)
    const refreshButton =
      panel?.querySelector(REFRESH_SELECTOR)

    // Boundary forte: primeiro invalida a autoridade da interação/cache de
    // A; depois o refresh síncrono do content-script monta B. O botão só é
    // consultado antes do reset, então continua utilizável para A→B→A e
    // trocas rápidas A→B→C.
    releasePanelInteractionLocks(panel)
    preparePanelForConversationBoundary(panel)

    if (clickRefreshButton(refreshButton)) {
      return
    }

    // Fallback raro (painel expandido sem botão de refresh): não deixa
    // nenhum dado seller-facing do contato anterior visível enquanto o
    // mecanismo normal tenta se recompor.
    clearConversationRegionsFallback(panel)
    requestContentScriptRefresh()
  }

  function refreshIdentityFromDom() {
    const nextKey =
      getConversationKeyFromDom()

    if (!nextKey) {
      return
    }

    if (!currentConversationKey) {
      currentConversationKey = nextKey
      return
    }

    if (nextKey !== currentConversationKey) {
      applyConversationBoundary(nextKey)
    }
  }

  async function refreshLeadResolution(identity) {
    if (!isIdentityCurrent(identity)) {
      return false
    }

    return requestContentScriptRefresh()
  }

  root.YolenCompanionConversationRuntime =
    Object.freeze({
      captureIdentity,
      isIdentityCurrent,
      getDraftIdentityKey,
      refreshLeadResolution,
      getCurrentConversationKey: () =>
        currentConversationKey,
      getConversationEpoch: () =>
        conversationEpoch,
    })

  currentConversationKey =
    getConversationKeyFromDom()

  const observer = new MutationObserver(() => {
    // Independente do observer do content-script: uma leitura automática
    // de "Dados do contato" pode continuar em voo sem impedir que uma
    // mudança REAL A→B seja reconhecida como boundary.
    refreshIdentityFromDom()
  })

  const startObserver = () => {
    const rootNode =
      document.getElementById('app') ||
      document.body ||
      document.documentElement

    if (!rootNode) {
      root.setTimeout(
        startObserver,
        50,
      )
      return
    }

    observer.observe(rootNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'title',
        'aria-label',
        'aria-selected',
        'data-selected',
        'data-id',
        'src',
      ],
    })

    refreshIdentityFromDom()
  }

  startObserver()
})(globalThis)
