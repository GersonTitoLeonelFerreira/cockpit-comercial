;(function initYolenPageBridge() {
    const MESSAGE_SOURCE = 'YOLEN_COMPANION_PAGE_BRIDGE'
    const REFRESH_INTERVAL_MS = 15000
  
    function isYolenPage() {
      return (
        window.location.origin === 'http://localhost:3000' ||
        window.location.origin === 'https://cockpit-comercial-vocn.vercel.app'
      )
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