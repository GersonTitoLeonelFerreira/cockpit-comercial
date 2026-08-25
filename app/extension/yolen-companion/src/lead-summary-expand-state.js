;(function initLeadSummaryExpandState(root) {
  const EXPAND_KEY_ATTR = 'data-yolen-preserve-details'
  const SUMMARY_SELECTOR = '.yolen-lead-summary-toggle'
  const DETAILS_SELECTOR = `.yolen-lead-summary-details[${EXPAND_KEY_ATTR}]`
  const expandedBySummary = new Map()
  let restoreQueued = false

  function getSummaryIdentity(details) {
    if (!details) {
      return null
    }

    const readyRoot = details.closest?.('.yolen-lead-summary--ready')
    const hiddenValue = readyRoot
      ?.querySelector?.('[data-yolen-textarea="lead-summary"]')
      ?.value

    if (typeof hiddenValue === 'string' && hiddenValue.trim()) {
      return hiddenValue.trim()
    }

    const fullText = details
      .querySelector?.('.yolen-lead-summary-full-text')
      ?.textContent

    return typeof fullText === 'string' && fullText.trim()
      ? fullText.trim()
      : null
  }

  function applyRememberedState(details) {
    const identity = getSummaryIdentity(details)

    if (!identity || !expandedBySummary.has(identity)) {
      return
    }

    details.open = expandedBySummary.get(identity) === true
  }

  function restoreAll() {
    restoreQueued = false

    document
      .querySelectorAll?.(DETAILS_SELECTOR)
      ?.forEach?.(applyRememberedState)
  }

  function queueRestore() {
    if (restoreQueued) {
      return
    }

    restoreQueued = true

    Promise.resolve().then(restoreAll)
  }

  function toggleDetails(details, event) {
    if (!details) {
      return
    }

    const identity = getSummaryIdentity(details)

    if (!identity) {
      return
    }

    event?.preventDefault?.()

    const nextOpen = !details.open
    expandedBySummary.set(identity, nextOpen)
    details.open = nextOpen

    // renderPanel() pode substituir o HTML inteiro no mesmo clique. Se isso
    // acontecer, reaplica a intenção do vendedor no novo nó renderizado.
    queueRestore()
  }

  document.addEventListener(
    'click',
    event => {
      const summary = event.target?.closest?.(SUMMARY_SELECTOR)

      if (!summary) {
        return
      }

      const details = summary.closest?.(DETAILS_SELECTOR)
      toggleDetails(details, event)
    },
    true,
  )

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(mutations => {
      const panelChanged = mutations.some(mutation => {
        const target = mutation.target
        const element = target?.nodeType === 1
          ? target
          : target?.parentElement

        return Boolean(
          element?.closest?.('#yolen-companion-panel') ||
          Array.from(mutation.addedNodes || []).some(node =>
            node?.nodeType === 1 && (
              node.matches?.('#yolen-companion-panel') ||
              node.querySelector?.(DETAILS_SELECTOR)
            ),
          ),
        )
      })

      if (panelChanged) {
        queueRestore()
      }
    })

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  root.YolenLeadSummaryExpandState = Object.freeze({
    getSummaryIdentity,
    applyRememberedState,
    restoreAll,
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
