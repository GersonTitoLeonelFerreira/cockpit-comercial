;(function initEditableFieldStabilityRuntime(root) {
  const PANEL_ID = 'yolen-companion-panel'
  const EDITABLE_SELECTOR = [
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([readonly]):not([disabled])',
    'textarea:not([readonly]):not([disabled])',
    'select:not([disabled])',
    '[contenteditable="true"]',
  ].join(',')
  const ACTION_SELECTOR = [
    'button',
    '[role="button"]',
    'a[href]',
    'input[type="button"]',
    'input[type="submit"]',
  ].join(',')

  let panel = null
  let locked = false
  let mode = null
  let pendingHtml = null
  let baseInnerHtmlDescriptor = null
  let lockedScrollTop = null
  let restoreSequence = 0

  function getPanel() {
    return document.getElementById(PANEL_ID)
  }

  function getCurrentInnerHtmlDescriptor(targetPanel) {
    return (
      Object.getOwnPropertyDescriptor(
        targetPanel,
        'innerHTML',
      ) ||
      Object.getOwnPropertyDescriptor(
        Element.prototype,
        'innerHTML',
      )
    )
  }

  function applyThroughBase(targetPanel, value) {
    if (!targetPanel || !baseInnerHtmlDescriptor?.set) {
      return
    }

    baseInnerHtmlDescriptor.set.call(
      targetPanel,
      value,
    )
  }

  function restoreLockedScroll(targetPanel) {
    if (
      !targetPanel ||
      lockedScrollTop === null
    ) {
      return
    }

    const sequence = ++restoreSequence
    const intendedTop = lockedScrollTop

    const restore = () => {
      if (sequence !== restoreSequence) {
        return
      }

      const currentPanel = getPanel()

      if (!currentPanel) {
        return
      }

      currentPanel.scrollTop = Math.min(
        intendedTop,
        Math.max(
          0,
          currentPanel.scrollHeight - currentPanel.clientHeight,
        ),
      )
    }

    restore()
    queueMicrotask(restore)
    root.requestAnimationFrame(() => {
      restore()
      root.requestAnimationFrame(restore)
    })
  }

  function flushPending() {
    if (locked || pendingHtml === null) {
      return
    }

    const currentPanel = getPanel()
    const html = pendingHtml
    pendingHtml = null

    if (!currentPanel) {
      return
    }

    const previousTop = currentPanel.scrollTop
    applyThroughBase(currentPanel, html)
    currentPanel.scrollTop = Math.min(
      previousTop,
      Math.max(
        0,
        currentPanel.scrollHeight - currentPanel.clientHeight,
      ),
    )
  }

  function patchPanel(targetPanel) {
    if (
      !targetPanel ||
      targetPanel.__yolenEditableFieldGuardInstalled === true
    ) {
      return
    }

    baseInnerHtmlDescriptor =
      getCurrentInnerHtmlDescriptor(targetPanel)

    if (
      !baseInnerHtmlDescriptor?.get ||
      !baseInnerHtmlDescriptor?.set
    ) {
      return
    }

    targetPanel.__yolenEditableFieldGuardInstalled = true

    Object.defineProperty(
      targetPanel,
      'innerHTML',
      {
        configurable: true,
        enumerable: false,
        get() {
          return baseInnerHtmlDescriptor.get.call(this)
        },
        set(value) {
          if (locked) {
            pendingHtml = String(value ?? '')
            return
          }

          baseInnerHtmlDescriptor.set.call(
            this,
            value,
          )
        },
      },
    )
  }

  function bindPanel() {
    const currentPanel = getPanel()

    if (!currentPanel) {
      panel = null
      locked = false
      mode = null
      pendingHtml = null
      lockedScrollTop = null
      return null
    }

    if (panel !== currentPanel) {
      panel = currentPanel
      patchPanel(currentPanel)
    } else {
      patchPanel(currentPanel)
    }

    return currentPanel
  }

  function lock(target, nextMode, { preserveCurrentScroll = false } = {}) {
    const currentPanel = bindPanel()

    if (
      !currentPanel ||
      !target ||
      !currentPanel.contains(target)
    ) {
      return
    }

    if (
      preserveCurrentScroll ||
      !locked ||
      lockedScrollTop === null
    ) {
      lockedScrollTop = currentPanel.scrollTop
    }

    locked = true
    mode = nextMode

    if (nextMode === 'editable') {
      restoreLockedScroll(currentPanel)
    }
  }

  function unlock({ flush = true } = {}) {
    if (!locked) {
      return
    }

    locked = false
    mode = null
    lockedScrollTop = null
    restoreSequence += 1

    if (flush) {
      flushPending()
    } else {
      pendingHtml = null
    }
  }

  function getEditable(target) {
    return target?.closest?.(EDITABLE_SELECTOR) || null
  }

  function getAction(target) {
    return target?.closest?.(ACTION_SELECTOR) || null
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      const currentPanel = bindPanel()
      const target = event.target

      if (!currentPanel || !target?.closest) {
        return
      }

      const editable = getEditable(target)

      if (
        editable &&
        currentPanel.contains(editable)
      ) {
        lock(
          editable,
          'editable',
          { preserveCurrentScroll: true },
        )
        return
      }

      const action = getAction(target)

      if (
        action &&
        currentPanel.contains(action)
      ) {
        lock(
          action,
          'action',
          { preserveCurrentScroll: true },
        )
        return
      }

      if (
        locked &&
        !target.closest(`#${PANEL_ID}`)
      ) {
        unlock()
      }
    },
    true,
  )

  document.addEventListener(
    'focusin',
    (event) => {
      const editable = getEditable(event.target)
      const currentPanel = bindPanel()

      if (
        editable &&
        currentPanel?.contains(editable)
      ) {
        lock(editable, 'editable')
        restoreLockedScroll(currentPanel)
      }
    },
    true,
  )

  document.addEventListener(
    'input',
    (event) => {
      const editable = getEditable(event.target)
      const currentPanel = bindPanel()

      if (
        editable &&
        currentPanel?.contains(editable)
      ) {
        lock(editable, 'editable')
        restoreLockedScroll(currentPanel)
      }
    },
    true,
  )

  document.addEventListener(
    'focusout',
    (event) => {
      const editable = getEditable(event.target)

      if (!editable) {
        return
      }

      queueMicrotask(() => {
        if (mode === 'action') {
          return
        }

        const currentPanel = bindPanel()
        const activeEditable =
          getEditable(document.activeElement)

        if (
          activeEditable &&
          currentPanel?.contains(activeEditable)
        ) {
          lock(
            activeEditable,
            'editable',
            { preserveCurrentScroll: true },
          )
          return
        }

        unlock()
      })
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      const action = getAction(event.target)
      const currentPanel = bindPanel()

      if (
        mode !== 'action' ||
        !action ||
        !currentPanel?.contains(action)
      ) {
        return
      }

      root.setTimeout(() => {
        if (mode === 'action') {
          unlock()
        }
      }, 0)
    },
    true,
  )

  for (const eventName of ['pointercancel', 'dragstart']) {
    document.addEventListener(
      eventName,
      () => {
        if (mode === 'action') {
          unlock()
        }
      },
      true,
    )
  }

  const observer = new MutationObserver(() => {
    const currentPanel = getPanel()

    if (!currentPanel) {
      panel = null
      locked = false
      mode = null
      pendingHtml = null
      lockedScrollTop = null
      return
    }

    if (currentPanel !== panel) {
      panel = currentPanel
      patchPanel(currentPanel)
    }
  })

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true,
    },
  )

  bindPanel()

  root.YolenCompanionEditableFieldStabilityRuntime =
    Object.freeze({
      isLocked() {
        return locked
      },
    })
})(typeof globalThis !== 'undefined' ? globalThis : window)
