;(function initPanelStabilityRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const INTENT_SELECTOR = '[data-yolen-seller-message-intent]'
  const BOTTOM_THRESHOLD_PX = 80
  const RESUME_GUARD_MS = 2000

  const innerHtmlDescriptor =
    typeof Element !== 'undefined'
      ? Object.getOwnPropertyDescriptor(
          Element.prototype,
          'innerHTML',
        )
      : null

  let panel = null
  let conversationLabel = null
  let restoring = false
  let restoreSequence = 0
  let interactionLocked = false
  let pendingPanelHtml = null
  let resumeGuardUntil = 0
  let resumeGuardTimerId = 0
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

  function captureScroll(targetPanel) {
    if (!targetPanel || restoring) {
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

  function applyPanelHtml(targetPanel, html) {
    if (
      !targetPanel ||
      !innerHtmlDescriptor?.set
    ) {
      return
    }

    innerHtmlDescriptor.set.call(
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
      targetPanel.__yolenInnerHtmlGuardInstalled === true ||
      !innerHtmlDescriptor?.get ||
      !innerHtmlDescriptor?.set
    ) {
      return
    }

    targetPanel.__yolenInnerHtmlGuardInstalled = true

    Object.defineProperty(
      targetPanel,
      'innerHTML',
      {
        configurable: true,
        enumerable: false,
        get() {
          return innerHtmlDescriptor.get.call(this)
        },
        set(value) {
          const mustPreserveCurrentDom =
            (
              interactionLocked &&
              this.querySelector?.(INTENT_SELECTOR)
            ) ||
            (
              isResumeGuardActive() &&
              this.childElementCount > 0
            )

          if (mustPreserveCurrentDom) {
            pendingPanelHtml = String(value ?? '')
            return
          }

          innerHtmlDescriptor.set.call(
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

  function lockInteraction(input) {
    const currentPanel = getPanel()

    if (
      !currentPanel ||
      !input ||
      !currentPanel.contains(input)
    ) {
      return
    }

    bindPanel(currentPanel)
    captureScroll(currentPanel)
    interactionLocked = true
    pendingPanelHtml = null
  }

  function unlockInteraction({
    applyPending = true,
  } = {}) {
    if (!interactionLocked) {
      return
    }

    interactionLocked = false

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
      pendingPanelHtml = null
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
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (input) {
        lockInteraction(input)
        return
      }

      if (
        interactionLocked &&
        !event.target?.closest?.(`#${PANEL_ID}`)
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

      lockInteraction(input)
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
    'focusin',
    (event) => {
      const input = event.target?.closest?.(INTENT_SELECTOR)

      if (input) {
        lockInteraction(input)
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
        lockInteraction(input)
      }
    },
    true,
  )

  root.addEventListener(
    'focus',
    () => {
      beginResumeGuard()
    },
    true,
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