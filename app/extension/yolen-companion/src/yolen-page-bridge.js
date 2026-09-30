;(function initYolenPageBridge() {
    const MESSAGE_SOURCE = 'YOLEN_COMPANION_PAGE_BRIDGE'
    const REFRESH_INTERVAL_MS = 15000
  
    // Origens autorizadas pelo canal do pacote, entregues pela bridge do
    // content script (yolen-bridge.js) no próprio <script>.
    const ALLOWED_ORIGINS = String(
      document.currentScript?.dataset?.yolenAllowedOrigins || '',
    )
      .split(' ')
      .filter(Boolean)
  
    function isYolenPage() {
      return ALLOWED_ORIGINS.includes(window.location.origin)
    }
  
    function isLoginPage() {
      return window.location.pathname.startsWith('/login')
    }
  
    async function fetchSession() {
      const response = await fetch('/api/companion/connect', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
  
      const payload = await response.json().catch(() => null)
  
      return {
        ok: response.ok,
        statusCode: response.status,
        payload,
        origin: window.location.origin,
        capturedAt: new Date().toISOString(),
      }
    }
  
    async function refreshSession() {
      if (!isYolenPage()) {
        return
      }
  
      if (isLoginPage()) {
        return
      }
  
      try {
        const session = await fetchSession()
  
        if (session.ok === true && session.payload?.ok === true) {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              action: 'SESSION_CAPTURED',
              session,
            },
            window.location.origin,
          )
        }
      } catch {
        // Não publica erro para não sobrescrever sessão válida.
      }
    }
  
    refreshSession()
    window.setInterval(refreshSession, REFRESH_INTERVAL_MS)
  })()