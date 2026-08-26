;(function initConversationIsolationRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const REFRESH_SELECTOR = '[data-yolen-action="refresh"]'
  const REGION_SELECTOR = '[data-yolen-region]'
  const CHAT_ROW_SELECTOR = [
    '#pane-side [aria-selected="true"]',
    '#pane-side [data-selected="true"]',
    '[data-testid="chat-list"] [aria-selected="true"]',
  ].join(',')

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

    const titledNodes = Array.from(
      header.querySelectorAll('[title]'),
    )

    for (const node of titledNodes) {
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

    // Quando o WhatsApp oferece data-id/JID (ou, como segunda opção,
    // avatar da linha selecionada), essa identidade estrutural é
    // authoritative. Não concatenamos o nome visível: mudanças cosméticas
    // do header/sidebar não podem criar um falso boundary e contatos
    // homônimos continuam separados pelo identificador forte.
    if (strongIdentity) {
      return `selected:${strongIdentity}`
    }

    // Número não salvo é uma identidade melhor que texto arbitrário do
    // header e não depende da formatação visual do WhatsApp.
    if (looksLikePhone(title)) {
      return `phone:${onlyDigits(title)}`
    }

    const selectedTitle =
      getSelectedChatTitle()

    // Fallback deliberado para versões do WhatsApp que não exponham
    // data-id/avatar. Não promovemos data-testid/aria-label genéricos a
    // identidade porque esses atributos podem ser iguais em várias linhas.
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
      // Browsers antigos podem não aceitar Event no mesmo formato.
    }

    panel
      ?.querySelectorAll(REGION_SELECTOR)
      .forEach((region) => {
        delete region.dataset
          .yolenRegionActionLock
      })
  }

  function clearSellerFacingRegions(panel) {
    if (!panel) {
      return
    }

    panel
      .querySelectorAll(REGION_SELECTOR)
      .forEach((region) => {
        region.replaceChildren()
        region.dataset
          .yolenConversationEpoch =
          String(conversationEpoch)
        region.dataset
          .yolenConversationKey =
          currentConversationKey || ''
      })

    panel.scrollTop = 0
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

    // Boundary forte: a interação do contato anterior deixa de ter
    // prioridade assim que a identidade real do header muda. Primeiro
    // libera locks, depois remove o DOM seller-facing antigo e só então
    // força o content-script a recalcular a nova conversa.
    releasePanelInteractionLocks(panel)
    clearSellerFacingRegions(panel)

    if (!clickRefreshButton(refreshButton)) {
      requestContentScriptRefresh()
    }
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
    // Não depende do observer do content-script. Portanto uma leitura
    // automática de "Dados do contato" pode continuar em voo sem impedir
    // que uma mudança REAL A→B seja reconhecida como boundary.
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
