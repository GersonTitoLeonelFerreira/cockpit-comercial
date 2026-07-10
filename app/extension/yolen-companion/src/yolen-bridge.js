/* global browser, chrome */

;(function initYolenCompanionBridge() {
  const PAGE_BRIDGE_SOURCE = 'YOLEN_COMPANION_PAGE_BRIDGE'

  function getRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      return browser.runtime
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return chrome.runtime
    }

    return null
  }

  function isYolenPage() {
    return (
      window.location.origin === 'http://localhost:3000' ||
      window.location.origin === 'https://cockpit-commercial-vocn.vercel.app'
    )
  }

  async function tryDirectSessionCapture() {
    if (!isYolenPage()) {
      return
    }

    try {
      const response = await fetch('/api/companion/connect', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.ok) {
        return
      }

      await sendSessionToExtension({
        ok: true,
        statusCode: response.status,
        payload,
        origin: window.location.origin,
        capturedAt: new Date().toISOString(),
      })
    } catch {
      // O page bridge injetado tenta capturar como fallback.
    }
  }

  function injectPageBridge() {
    const runtime = getRuntime()

    if (!runtime || !isYolenPage()) {
      return
    }

    if (document.getElementById('yolen-page-bridge-script')) {
      return
    }

    const script = document.createElement('script')
    script.id = 'yolen-page-bridge-script'
    script.src = runtime.getURL('src/yolen-page-bridge.js')
    script.async = false

    script.onload = () => {
      script.remove()
    }

    document.documentElement.appendChild(script)
  }

  async function sendSessionToExtension(session) {
    const runtime = getRuntime()

    if (!runtime) {
      return
    }

    await runtime.sendMessage({
      source: 'YOLEN_COMPANION_BRIDGE',
      action: 'SESSION_UPDATE',
      session,
    })
  }

  function listenToPageBridge() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return
      }

      if (event.origin !== window.location.origin) {
        return
      }

      if (event.data?.source !== PAGE_BRIDGE_SOURCE) {
        return
      }

      if (event.data?.action !== 'SESSION_CAPTURED') {
        return
      }

      if (!event.data?.session) {
        return
      }

      sendSessionToExtension(event.data.session)
    })
  }

  listenToPageBridge()
  tryDirectSessionCapture()
  injectPageBridge()
})()