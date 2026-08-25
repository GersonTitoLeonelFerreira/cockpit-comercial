;(function initPanelStabilityRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const INTENT_SELECTOR = '[data-yolen-seller-message-intent]'
  const BOTTOM_THRESHOLD_PX = 80

  let panel = null
  let conversationLabel = null
  let restoring = false
  let restoreSequence = 0
  let scrollSnapshot = {
    top: 0,
    distanceFromBottom: 0,
    nearBottom: false,
  }
  let intentFocusSnapshot = null

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

  function captureIntentSelection(target) {
    if (!target?.matches?.(INTENT_SELECTOR)) {
      return
    }

    intentFocusSnapshot = {
      focused: true,
      start:
        Number.isInteger(target.selectionStart)
          ? target.selectionStart
          : null,
      end:
        Number.isInteger(target.selectionEnd)
          ? target.selectionEnd
          : null,
      direction:
        typeof target.selectionDirection === 'string'
          ? target.selectionDirection
          : 'none',
    }
  }

  function bindPanel(targetPanel) {
    if (!targetPanel || targetPanel.__yolenStabilityBound === true) {
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

  function restoreIntentFocus() {
    if (!intentFocusSnapshot?.focused) {
      return
    }

    const input = document.querySelector(INTENT_SELECTOR)

    if (!input) {
      return
    }

    try {
      input.focus({ preventScroll: true })
    } catch {
      input.focus()
    }

    if (
      intentFocusSnapshot.start !== null &&
      typeof input.setSelectionRange === 'function'
    ) {
      const maxLength = String(input.value || '').length
      const start = Math.min(
        intentFocusSnapshot.start,
        maxLength,
      )
      const end = Math.min(
        intentFocusSnapshot.end ?? start,
        maxLength,
      )

      try {
        input.setSelectionRange(
          start,
          end,
          intentFocusSnapshot.direction,
        )
      } catch {
        // O foco já foi restaurado; seleção é apenas melhoria de UX.
      }
    }
  }

  function restorePanelInteraction(targetPanel) {
    if (!targetPanel) {
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
          restoreIntentFocus()
          restoring = false
        })
      })
    })
  }

  function handlePanelMutation() {
    const currentPanel = getPanel()

    if (!currentPanel) {
      panel = null
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
      conversationLabel = nextConversationLabel
      scrollSnapshot = {
        top: 0,
        distanceFromBottom: 0,
        nearBottom: false,
      }
      intentFocusSnapshot = null
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
    'focusin',
    (event) => {
      if (event.target?.matches?.(INTENT_SELECTOR)) {
        captureIntentSelection(event.target)
        return
      }

      intentFocusSnapshot = null
    },
    true,
  )

  for (const eventName of ['input', 'select', 'keyup', 'mouseup']) {
    document.addEventListener(
      eventName,
      (event) => {
        captureIntentSelection(event.target)
      },
      true,
    )
  }

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
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
