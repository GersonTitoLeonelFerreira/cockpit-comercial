;(function initPanelStabilityRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const INTENT_SELECTOR = '[data-yolen-seller-message-intent]'
  const ACTION_SELECTOR = [
    'button',
    '[role="button"]',
    'a[href]',
    'summary',
    'input[type="button"]',
    'input[type="submit"]',
  ].join(',')
  const BOTTOM_THRESHOLD_PX = 80
  const RESUME_GUARD_MS = 2000

  const elementInnerHtmlDescriptor =
    typeof Element !== 'undefined'
      ? Object.getOwnPropertyDescriptor(
          Element.prototype,
          'innerHTML',
        )
      : null

  // Outro runtime (editable-field-stability-runtime.js) também substitui
  // `innerHTML` no mesmo painel. Não importa qual dos dois roda primeiro:
  // aqui sempre resolvemos o descriptor já instalado na instância (se
  // algum outro runtime já rodou) antes de cair para o nativo do
  // Element.prototype, para nunca sobrescrever/descartar uma proteção que
  // já esteja ativa nesse nó específico.
  function resolveBaseInnerHtmlDescriptor(targetPanel) {
    return (
      Object.getOwnPropertyDescriptor(
        targetPanel,
        'innerHTML',
      ) || elementInnerHtmlDescriptor
    )
  }

  let panel = null
  let conversationLabel = null
  let restoring = false
  let restoreSequence = 0
  let interactionLocked = false
  let interactionMode = null
  let pendingPanelHtml = null
  let actionScrollTop = null
  let actionScrollRestoreSequence = 0
  let resumeGuardUntil = 0
  let resumeGuardTimerId = 0
  let windowWasBlurred = false
  const cachedLeadResolutions = new Map()
  let scrollSnapshot = {
    top: 0,
    distanceFromBottom: 0,
    nearBottom: false,
  }

  function getPanel() {
    return document.getElementById(PANEL_ID)
  }

  function getConversationLabel(targetPanel) {
    return String(
      targetPanel
        ?.querySelector('.yolen-lead-name')
        ?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
  }

  function isResumeGuardActive() {
    return Date.now() < resumeGuardUntil
  }

  function getLeadResolutionCacheKey(payload) {
    const phone = String(
      payload?.phone || '',
    ).trim()
    const displayName = String(
      payload?.display_name || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('pt-BR')

    if (!phone && !displayName) {
      return null
    }

    return `${phone}::${displayName}`
  }

  function installResumeLeadResolutionCache() {
    const api = root.YolenCompanionApi

    if (
      !api ||
      typeof api.resolveLead !== 'function' ||
      api.__resumeLeadResolutionCacheInstalled === true
    ) {
      return
    }

    const originalResolveLead =
      api.resolveLead.bind(api)

    api.resolveLead = async function resolveLeadWithResumeCache(payload) {
      const key =
        getLeadResolutionCacheKey(payload)

      if (
        isResumeGuardActive() &&
        key &&
        cachedLeadResolutions.has(key)
      ) {
        return cachedLeadResolutions.get(key)
      }

      const result =
        await originalResolveLead(payload)

      if (
        key &&
        result?.ok &&
        result?.payload?.ok &&
        result?.payload?.data
      ) {
        cachedLeadResolutions.set(
          key,
          result,
        )
      }

      return result
    }

    api.__resumeLeadResolutionCacheInstalled = true
  }

  function captureScroll(
    targetPanel,
    { force = false } = {},
  ) {
    if (
      !targetPanel ||
      restoring ||
      (
        actionScrollTop !== null &&
        force !== true
      )
    ) {
      return
    }

    const maxScroll = Math.max(
      0,
      targetPanel.scrollHeight - targetPanel.clientHeight,
    )
    const top = Math.max(0, targetPanel.scrollTop)
    const distanceFromBottom = Math.max(
      0,
      maxScroll - top,
    )

    scrollSnapshot = {
      top,
      distanceFromBottom,
      nearBottom:
        distanceFromBottom <= BOTTOM_THRESHOLD_PX,
    }
  }

  function releaseActionScrollAnchor() {
    const currentPanel =
      getPanel()

    actionScrollTop = null
    actionScrollRestoreSequence += 1

    if (currentPanel) {
      captureScroll(
        currentPanel,
        { force: true },
      )
    }
  }

  function getRestoreTop(targetPanel) {
    const maxScroll = Math.max(
      0,
      targetPanel.scrollHeight - targetPanel.clientHeight,
    )

    if (scrollSnapshot.nearBottom) {
      return Math.max(
        0,
        maxScroll - scrollSnapshot.distanceFromBottom,
      )
    }

    return Math.min(
      scrollSnapshot.top,
      maxScroll,
    )
  }


  function restoreActionScroll(
    intendedTop,
  ) {
    if (
      typeof intendedTop !== 'number' ||
      !Number.isFinite(intendedTop)
    ) {
      return
    }

    const sequence =
      ++actionScrollRestoreSequence

    const restore = () => {
      if (
        sequence !==
        actionScrollRestoreSequence
      ) {
        return
      }

      const currentPanel =
        getPanel()

      if (!currentPanel) {
        return
      }

      const maxScroll = Math.max(
        0,
        currentPanel.scrollHeight -
          currentPanel.clientHeight,
      )

      const top = Math.min(
        Math.max(0, intendedTop),
        maxScroll,
      )

      currentPanel.scrollTop = top
      actionScrollTop = top

      // Após uma ação, o foco é preservar exatamente o ponto de trabalho
      // do vendedor. Não convertemos essa posição para "near bottom",
      // porque conteúdo novo acima/abaixo não pode mover o viewport.
      scrollSnapshot = {
        top,
        distanceFromBottom:
          Math.max(0, maxScroll - top),
        nearBottom: false,
      }
    }

    restore()

    queueMicrotask(() => {
      restore()

      root.requestAnimationFrame(() => {
        restore()

        root.requestAnimationFrame(
          restore,
        )
      })
    })
  }

  function applyPanelHtml(targetPanel, html) {
    const baseDescriptor =
      targetPanel?.__yolenPanelStabilityBaseDescriptor

    if (!targetPanel || !baseDescriptor?.set) {
      return
    }

    baseDescriptor.set.call(
      targetPanel,
      html,
    )
  }

  function applyPendingPanelHtml() {
    if (
      interactionLocked ||
      isResumeGuardActive()
    ) {
      return
    }

    const currentPanel = getPanel()
    const pendingHtml = pendingPanelHtml

    if (
      !currentPanel ||
      pendingHtml === null
    ) {
      return
    }

    pendingPanelHtml = null
    const restoreTop =
      getRestoreTop(currentPanel)

    applyPanelHtml(
      currentPanel,
      pendingHtml,
    )

    bindPanel(currentPanel)
    currentPanel.scrollTop = Math.min(
      restoreTop,
      Math.max(
        0,
        currentPanel.scrollHeight - currentPanel.clientHeight,
      ),
    )
    captureScroll(currentPanel)
  }

  function finishResumeGuard() {
    if (isResumeGuardActive()) {
      return
    }

    resumeGuardUntil = 0
    resumeGuardTimerId = 0
    applyPendingPanelHtml()
  }

  function beginResumeGuard() {
    const currentPanel = getPanel()

    if (currentPanel) {
      bindPanel(currentPanel)
      captureScroll(currentPanel)
    }

    resumeGuardUntil =
      Date.now() + RESUME_GUARD_MS

    if (resumeGuardTimerId) {
      root.clearTimeout(
        resumeGuardTimerId,
      )
    }

    resumeGuardTimerId =
      root.setTimeout(
        finishResumeGuard,
        RESUME_GUARD_MS + 50,
      )
  }

  function patchPanelInnerHtml(targetPanel) {
    if (
      !targetPanel ||
      targetPanel.__yolenInnerHtmlGuardInstalled === true
    ) {
      return
    }

    const baseDescriptor =
      resolveBaseInnerHtmlDescriptor(targetPanel)

    if (!baseDescriptor?.get || !baseDescriptor?.set) {
      return
    }

    targetPanel.__yolenInnerHtmlGuardInstalled = true
    targetPanel.__yolenPanelStabilityBaseDescriptor =
      baseDescriptor

    Object.defineProperty(
      targetPanel,
      'innerHTML',
      {
        configurable: true,
        enumerable: false,
        get() {
          return baseDescriptor.get.call(this)
        },
        set(value) {
          const mustPreserveCurrentDom =
            interactionLocked ||
            (
              isResumeGuardActive() &&
              this.childElementCount > 0
            )

          if (mustPreserveCurrentDom) {
            pendingPanelHtml = String(value ?? '')
            return
          }

          baseDescriptor.set.call(
            this,
            value,
          )
        },
      },
    )
  }

  function bindPanel(targetPanel) {
    if (!targetPanel) {
      return
    }

    patchPanelInnerHtml(targetPanel)

    if (targetPanel.__yolenStabilityBound === true) {
      return
    }

    targetPanel.__yolenStabilityBound = true

    targetPanel.addEventListener(
      'wheel',
      () => {
        releaseActionScrollAnchor()
      },
      { passive: true },
    )

    targetPanel.addEventListener(
      'touchmove',
      () => {
        releaseActionScrollAnchor()
      },
      { passive: true },
    )

    targetPanel.addEventListener(
      'scroll',
      () => {
        captureScroll(targetPanel)
      },
      { passive: true },
    )

    captureScroll(targetPanel)
  }

  function restorePanelInteraction(targetPanel) {
    if (
      !targetPanel ||
      interactionLocked ||
      isResumeGuardActive()
    ) {
      return
    }

    const sequence = ++restoreSequence
    restoring = true

    const restore = () => {
      if (sequence !== restoreSequence) {
        return
      }

      const currentPanel = getPanel()

      if (!currentPanel) {
        restoring = false
        return
      }

      bindPanel(currentPanel)
      currentPanel.scrollTop = getRestoreTop(currentPanel)
    }

    queueMicrotask(() => {
      root.requestAnimationFrame(() => {
        restore()

        root.requestAnimationFrame(() => {
          if (sequence !== restoreSequence) {
            return
          }

          restore()
          restoring = false
        })
      })
    })
  }

  function lockInteraction(target, mode) {
    const currentPanel = getPanel()

    if (
      !currentPanel ||
      !target ||
      !currentPanel.contains(target)
    ) {
      return
    }

    bindPanel(currentPanel)
    captureScroll(currentPanel)

    if (mode === 'action') {
      actionScrollTop =
        currentPanel.scrollTop
    }

    if (!interactionLocked) {
      pendingPanelHtml = null
    }

    interactionLocked = true
    interactionMode = mode
  }

  function unlockInteraction({
    applyPending = true,
  } = {}) {
    if (!interactionLocked) {
      return
    }

    interactionLocked = false
    interactionMode = null

    if (applyPending) {
      applyPendingPanelHtml()
    } else {
      pendingPanelHtml = null
    }
  }

  function handlePanelMutation() {
    const currentPanel = getPanel()

    if (!currentPanel) {
      panel = null
      interactionLocked = false
      interactionMode = null
      pendingPanelHtml = null
      return
    }

    if (panel !== currentPanel) {
      panel = currentPanel
      bindPanel(currentPanel)
    }

    const nextConversationLabel =
      getConversationLabel(currentPanel)

    if (
      conversationLabel &&
      nextConversationLabel &&
      nextConversationLabel !== conversationLabel
    ) {
      interactionLocked = false
      interactionMode = null
      pendingPanelHtml = null
      actionScrollTop = null
      actionScrollRestoreSequence += 1
      conversationLabel = nextConversationLabel
      scrollSnapshot = {
        top: 0,
        distanceFromBottom: 0,
        nearBottom: false,
      }
      restoreSequence += 1
      restoring = false
      currentPanel.scrollTop = 0
      return
    }

    if (nextConversationLabel) {
      conversationLabel = nextConversationLabel
    }

    restorePanelInteraction(currentPanel)
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      const currentPanel = getPanel()
      const target = event.target

      if (!currentPanel || !target?.closest) {
        return
      }

      const intent = target.closest(INTENT_SELECTOR)

      if (intent && currentPanel.contains(intent)) {
        releaseActionScrollAnchor()
        lockInteraction(intent, 'intent')
        return
      }

      const action = target.closest(ACTION_SELECTOR)

      if (action && currentPanel.contains(action)) {
        // Impede que um refresh assíncrono substitua o botão entre o
        // pointerdown e o click, situação em que o usuário percebe que o
        // botão "desclicou" sem executar a ação.
        lockInteraction(action, 'action')
        return
      }

      if (
        currentPanel.contains(target)
      ) {
        // Qualquer pointerdown que não seja numa ação representa navegação
        // real do vendedor (inclusive arrastar a barra de rolagem).
        releaseActionScrollAnchor()
      }

      if (
        interactionLocked &&
        !target.closest(`#${PANEL_ID}`)
      ) {
        unlockInteraction()
      }
    },
    true,
  )

  document.addEventListener(
    'mousedown',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (!input) {
        return
      }

      const currentPanel = getPanel()

      if (!currentPanel) {
        return
      }

      lockInteraction(input, 'intent')
      const intendedTop = currentPanel.scrollTop

      event.preventDefault()

      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }

      currentPanel.scrollTop = intendedTop
      captureScroll(currentPanel)
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      const action = event.target?.closest?.(ACTION_SELECTOR)
      const currentPanel = getPanel()

      if (
        interactionMode !== 'action' ||
        !action ||
        !currentPanel?.contains(action)
      ) {
        return
      }

      const intendedTop =
        actionScrollTop ??
        currentPanel.scrollTop

      // Roda depois dos handlers de click do Companion. Além de liberar
      // renders pendentes, restaura a posição capturada no pointerdown.
      // Isso neutraliza focus()/default actions do Firefox e qualquer
      // re-render que tente levar o painel ao topo.
      queueMicrotask(() => {
        if (interactionMode === 'action') {
          unlockInteraction()
        }

        restoreActionScroll(
          intendedTop,
        )
      })
    },
    true,
  )

  document.addEventListener(
    'keydown',
    (event) => {
      const currentPanel = getPanel()

      if (
        !currentPanel ||
        !currentPanel.contains(
          event.target,
        )
      ) {
        return
      }

      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      ) {
        releaseActionScrollAnchor()
      }
    },
    true,
  )

  document.addEventListener(
    'focusin',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (input) {
        lockInteraction(input, 'intent')
      }
    },
    true,
  )

  document.addEventListener(
    'focusout',
    (event) => {
      if (!event.target?.closest?.(INTENT_SELECTOR)) {
        return
      }

      queueMicrotask(() => {
        // Clicar em um botão tira o foco do textarea antes do evento click.
        // Nesse caso a trava precisa continuar até o click concluir.
        if (interactionMode === 'action') {
          return
        }

        if (
          document.activeElement?.closest?.(INTENT_SELECTOR)
        ) {
          return
        }

        unlockInteraction()
      })
    },
    true,
  )

  document.addEventListener(
    'input',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (input) {
        lockInteraction(input, 'intent')
      }
    },
    true,
  )

  for (const eventName of ['pointercancel', 'dragstart']) {
    document.addEventListener(
      eventName,
      () => {
        if (interactionMode === 'action') {
          unlockInteraction()
        }
      },
      true,
    )
  }

  // `focus` da window só representa retomada real quando houve um `blur`
  // anterior da própria janela. Um campo interno do Companion pode perder
  // foco sem que o usuário tenha saído da aba; esse caso não deve ativar o
  // resume guard nem reter rerenders legítimos.
  root.addEventListener(
    'blur',
    (event) => {
      if (
        event.target !==
        document.defaultView
      ) {
        return
      }

      windowWasBlurred = true
    },
  )

  root.addEventListener(
    'focus',
    (event) => {
      if (
        event.target !==
          document.defaultView ||
        windowWasBlurred !== true
      ) {
        return
      }

      windowWasBlurred = false
      beginResumeGuard()
    },
  )

  root.addEventListener(
    'pageshow',
    () => {
      beginResumeGuard()
    },
    true,
  )

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState === 'visible'
      ) {
        beginResumeGuard()
      }
    },
    true,
  )

  const observer = new MutationObserver((mutations) => {
    const currentPanel = getPanel()

    if (!currentPanel) {
      return
    }

    const panelChanged = mutations.some((mutation) => {
      const target = mutation.target

      if (
        target === currentPanel ||
        currentPanel.contains(target)
      ) {
        return true
      }

      return Array.from(mutation.addedNodes || []).some(
        (node) =>
          node === currentPanel ||
          node?.contains?.(currentPanel),
      )
    })

    if (panelChanged) {
      handlePanelMutation()
    }
  })

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  )

  installResumeLeadResolutionCache()

  panel = getPanel()

  if (panel) {
    bindPanel(panel)
    conversationLabel = getConversationLabel(panel) || null
  }

  root.YolenCompanionPanelStabilityRuntime = Object.freeze({
    capture() {
      const currentPanel = getPanel()
      bindPanel(currentPanel)
      captureScroll(currentPanel)
    },
    restore() {
      restorePanelInteraction(getPanel())
    },
    isInteractionLocked() {
      return interactionLocked
    },
    isResumeGuardActive,
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
