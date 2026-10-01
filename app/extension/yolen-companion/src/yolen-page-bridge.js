;(function initYolenPageBridge() {
    const MESSAGE_SOURCE = 'YOLEN_COMPANION_PAGE_BRIDGE'
    // O token do Companion vale 6 h. Antes cada aba da Yolen pedia
    // /api/companion/connect a cada 15 s (centenas de chamadas por quarto
    // de hora com algumas abas abertas). Agora: ao abrir, a cada 5 min
    // com a aba visível, e ao sair da aba/janela (troca de empresa chega
    // à extensão quando o vendedor volta para o WhatsApp/ManyChat).
    const REFRESH_INTERVAL_MS = 5 * 60 * 1000
    const MIN_REFRESH_GAP_MS = 30 * 1000
    let lastRefreshAt = 0
    let refreshInFlight = false
  
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
  
    function isHidden() {
      return document.visibilityState === 'hidden'
    }
  
    async function refreshSession({ force = false } = {}) {
      if (!isYolenPage()) {
        return
      }
  
      if (isLoginPage()) {
        return
      }
  
      const now = Date.now()
  
      if (
        refreshInFlight ||
        (!force && now - lastRefreshAt < MIN_REFRESH_GAP_MS)
      ) {
        return
      }
  
      refreshInFlight = true
      lastRefreshAt = now
  
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
      } finally {
        refreshInFlight = false
      }
    }
  
    refreshSession({ force: true })
  
    window.setInterval(() => {
      if (!isHidden()) {
        refreshSession()
      }
    }, REFRESH_INTERVAL_MS)
  
    // Saindo da aba ou da janela: renova já (ignora o intervalo mínimo),
    // para uma troca de empresa feita agora valer no canal.
    document.addEventListener?.('visibilitychange', () => {
      refreshSession({ force: isHidden() })
    })
  
    window.addEventListener?.('blur', () => {
      refreshSession({ force: true })
    })
  
    window.addEventListener?.('focus', () => {
      refreshSession()
    })
  })()