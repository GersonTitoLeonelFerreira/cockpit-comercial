;(function initYolenManyChatMainWorldProbeBootstrap(root) {
  'use strict'

  const PROBE_HASH = '#yolen-mainworld-identity-probe'
  const API_NAME = 'YolenManyChatMainWorldIdentityProbe'
  const MAX_ATTEMPTS = 80
  const RETRY_MS = 100

  const runtimeWindow = root.window ?? root
  const runtimeDocument = root.document ?? runtimeWindow?.document ?? null
  const runtimeNavigator = root.navigator ?? runtimeWindow?.navigator ?? null

  // O ManyChat pode normalizar/remover o hash durante o bootstrap do SPA.
  // Guardamos a intenção no document_start e instalamos o probe quando o
  // body e a API MAIN-world estiverem disponíveis.
  const armedAtDocumentStart =
    runtimeWindow?.location?.hash === PROBE_HASH

  root.__YOLEN_MANYCHAT_MAINWORLD_PROBE_ARMED_AT_START__ =
    armedAtDocumentStart

  if (!armedAtDocumentStart || !runtimeDocument) {
    return
  }

  let attempts = 0
  let stopped = false

  const install = () => {
    if (stopped) return true

    const api = root[API_NAME]
    if (
      !runtimeDocument.body ||
      !api ||
      typeof api.installProbe !== 'function'
    ) {
      return false
    }

    const existing = runtimeDocument.getElementById?.(api.PROBE_BUTTON_ID)
    if (existing) {
      stopped = true
      return true
    }

    const syntheticWindowRef = {
      location: {
        hash: PROBE_HASH,
      },
    }

    const installed = api.installProbe({
      window: syntheticWindowRef,
      document: runtimeDocument,
      navigator: runtimeNavigator,
    })

    if (installed) {
      stopped = true
      root.__YOLEN_MANYCHAT_MAINWORLD_PROBE_BOOTSTRAPPED__ = true
      return true
    }

    return false
  }

  const retry = () => {
    if (install()) return

    attempts += 1
    if (attempts >= MAX_ATTEMPTS) return

    runtimeWindow.setTimeout(retry, RETRY_MS)
  }

  if (runtimeDocument.readyState === 'loading') {
    runtimeDocument.addEventListener('DOMContentLoaded', retry, {
      once: true,
    })
  }

  retry()
})(typeof globalThis !== 'undefined' ? globalThis : this)
