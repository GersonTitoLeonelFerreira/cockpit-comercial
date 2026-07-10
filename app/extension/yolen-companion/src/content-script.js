;(function initYolenCompanion() {
  const PANEL_ID = 'yolen-companion-panel'
  const ROOT_CLASS = 'yolen-companion-root'
  const WHATSAPP_APP_SELECTOR = '#app'
  const SESSION_REFRESH_INTERVAL_MS = 5000
  const HASH_SESSION_KEY = 'yolen_companion_session'

  let sessionRefreshTimerId = 0

  let state = {
    connected: false,
    loading: true,
    userName: null,
    companyName: null,
    companyRole: null,
    conversationTitle: null,
    messageCount: 0,
    audioCount: 0,
    lastError: null,
    lastSessionSyncAt: null,
  }

  function waitForWhatsAppApp() {
    return new Promise((resolve) => {
      const existingApp = document.querySelector(WHATSAPP_APP_SELECTOR)

      if (existingApp) {
        resolve(existingApp)
        return
      }

      const observer = new MutationObserver(() => {
        const app = document.querySelector(WHATSAPP_APP_SELECTOR)

        if (app) {
          observer.disconnect()
          resolve(app)
        }
      })

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    })
  }

  function createPanel() {
    const existingPanel = document.getElementById(PANEL_ID)

    if (existingPanel) {
      return existingPanel
    }

    const panel = document.createElement('aside')
    panel.id = PANEL_ID
    panel.className = ROOT_CLASS

    document.body.appendChild(panel)

    return panel
  }

  function decodeBase64Url(value) {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const binary = window.atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

    return new TextDecoder().decode(bytes)
  }

  async function captureSessionFromHash() {
    const hash = window.location.hash || ''

    if (!hash.includes(HASH_SESSION_KEY)) {
      return false
    }

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const encodedSession = params.get(HASH_SESSION_KEY)

    if (!encodedSession) {
      return false
    }

    try {
      const session = JSON.parse(decodeBase64Url(encodedSession))
      const result = await window.YolenCompanionApi.setSession(session)

      if (result?.ok) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search)
        return true
      }

      state = {
        ...state,
        connected: false,
        loading: false,
        lastError:
          result?.payload?.error ||
          'Não foi possível salvar a sessão do Companion.',
      }

      renderPanel()
      return false
    } catch (error) {
      state = {
        ...state,
        connected: false,
        loading: false,
        lastError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao capturar sessão do Companion.',
      }

      renderPanel()
      return false
    }
  }

  function getConversationTitle() {
    const header = document.querySelector('header')
    const titleByAttribute = header?.querySelector('span[title]')?.getAttribute('title')

    if (titleByAttribute && titleByAttribute.trim()) {
      return titleByAttribute.trim()
    }

    const textCandidates = Array.from(header?.querySelectorAll('span') || [])
      .map((element) => element.textContent?.trim())
      .filter(Boolean)

    return textCandidates[0] || null
  }

  function getVisibleMessagesCount() {
    const messagesWithPreText = document.querySelectorAll('[data-pre-plain-text]')
    const messageRows = document.querySelectorAll('[role="row"]')

    return Math.max(messagesWithPreText.length, messageRows.length, 0)
  }

  function getVisibleAudioCount() {
    const audioSelectors = [
      'audio',
      '[aria-label*="áudio" i]',
      '[aria-label*="audio" i]',
      '[aria-label*="mensagem de voz" i]',
      '[aria-label*="voice message" i]',
      '[data-icon="audio-download"]',
      '[data-icon="ptt"]',
      '[data-icon="audio-play"]',
    ]

    const detected = new Set()

    audioSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        detected.add(element)
      })
    })

    return detected.size
  }

  function refreshConversationSnapshot() {
    state = {
      ...state,
      conversationTitle: getConversationTitle(),
      messageCount: getVisibleMessagesCount(),
      audioCount: getVisibleAudioCount(),
    }

    renderPanel()
  }

  function getConnectionLabel() {
    if (state.loading) {
      return 'Conectando com a Yolen...'
    }

    if (state.connected) {
      return 'Yolen conectada'
    }

    return 'Yolen não conectada'
  }

  function getConnectionClass() {
    if (state.loading) {
      return 'yolen-status-neutral'
    }

    if (state.connected) {
      return 'yolen-status-success'
    }

    return 'yolen-status-warning'
  }

  function getConnectionDescription() {
    if (state.connected) {
      const syncedAt = state.lastSessionSyncAt
        ? ` · Sincronizado: ${state.lastSessionSyncAt}`
        : ''

      return `Usuário: ${escapeHtml(state.userName || 'Sem nome')} · Perfil: ${escapeHtml(
        state.companyRole || '-',
      )}${syncedAt}`
    }

    return escapeHtml(
      state.lastError || 'Clique em Conectar Yolen para iniciar o Companion.',
    )
  }

  function openYolen(path) {
    const baseUrl =
      window.YolenCompanionApi?.getBaseUrl?.() ||
      'https://cockpit-commercial-vocn.vercel.app'

    window.open(`${baseUrl}${path}`, '_blank', 'noopener,noreferrer')
  }

  function getPrimaryButtonLabel() {
    return state.connected ? 'Abrir Yolen' : 'Conectar Yolen'
  }

  function getPrimaryButtonAction() {
    return state.connected ? 'open-yolen' : 'connect-yolen'
  }

  function renderPanel() {
    const panel = createPanel()

    panel.innerHTML = `
      <div class="yolen-panel-header">
        <div class="yolen-brand">
          <div class="yolen-logo">Y</div>
          <div>
            <div class="yolen-title">Yolen Companion</div>
            <div class="yolen-subtitle">${
              state.companyName
                ? `Empresa ativa: ${escapeHtml(state.companyName)}`
                : 'Empresa ativa não carregada'
            }</div>
          </div>
        </div>

        <button class="yolen-icon-button" type="button" data-yolen-action="refresh" title="Atualizar leitura">
          ↻
        </button>
      </div>

      <div class="yolen-card ${getConnectionClass()}">
        <div class="yolen-card-title">${getConnectionLabel()}</div>
        <div class="yolen-card-description">
          ${getConnectionDescription()}
        </div>
      </div>

      <div class="yolen-card">
        <div class="yolen-section-label">Conversa aberta</div>
        <div class="yolen-lead-name">
          ${escapeHtml(state.conversationTitle || 'Nenhuma conversa detectada')}
        </div>

        <div class="yolen-metrics">
          <div class="yolen-metric">
            <span class="yolen-metric-number">${state.messageCount}</span>
            <span class="yolen-metric-label">mensagens visíveis</span>
          </div>

          <div class="yolen-metric">
            <span class="yolen-metric-number">${state.audioCount}</span>
            <span class="yolen-metric-label">áudios detectados</span>
          </div>
        </div>
      </div>

      <div class="yolen-card yolen-status-neutral">
        <div class="yolen-card-title">Próximo bloco: localizar lead</div>
        <div class="yolen-card-description">
          Nesta primeira versão, o Companion apenas conecta com a Yolen e lê o contexto visual.
          No próximo bloco, vamos consultar se o telefone existe na empresa ativa.
        </div>
      </div>

      <div class="yolen-card">
        <div class="yolen-section-label">Regras preservadas</div>

        <div class="yolen-rule-list">
          <div class="yolen-rule">Não cria lead dentro da extensão</div>
          <div class="yolen-rule">Não puxa lead do Pool</div>
          <div class="yolen-rule">Não transfere carteira</div>
          <div class="yolen-rule">Não aplica ação sem aprovação</div>
        </div>
      </div>

      <div class="yolen-actions">
        <button class="yolen-primary-button" type="button" data-yolen-action="${getPrimaryButtonAction()}">
          ${getPrimaryButtonLabel()}
        </button>

        <button class="yolen-secondary-button" type="button" data-yolen-action="refresh">
          Atualizar leitura
        </button>
      </div>
    `

    panel.querySelectorAll('[data-yolen-action="refresh"]').forEach((button) => {
      button.addEventListener('click', () => {
        refreshConversationSnapshot()
        loadYolenSession({ showLoading: true })
      })
    })

    panel.querySelector('[data-yolen-action="open-yolen"]')?.addEventListener('click', () => {
      openYolen('/leads')
    })

    panel.querySelector('[data-yolen-action="connect-yolen"]')?.addEventListener('click', () => {
      openYolen('/companion/connect')
    })
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function getCurrentTimeLabel() {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date())
  }

  async function loadYolenSession(options = {}) {
    const showLoading = options.showLoading === true

    if (showLoading) {
      state = {
        ...state,
        loading: true,
        lastError: null,
      }

      renderPanel()
    }

    try {
      const result = await window.YolenCompanionApi.getMe()

      if (!result?.ok || !result.payload?.ok) {
        state = {
          ...state,
          connected: false,
          loading: false,
          userName: null,
          companyName: null,
          companyRole: null,
          lastError:
            result?.payload?.error ||
            'Não foi possível confirmar a sessão da Yolen.',
        }

        renderPanel()
        return
      }

      state = {
        ...state,
        connected: true,
        loading: false,
        userName: result.payload.user?.full_name || result.payload.user?.email || null,
        companyName: result.payload.active_company?.name || null,
        companyRole: result.payload.active_company?.role || null,
        lastError: null,
        lastSessionSyncAt: getCurrentTimeLabel(),
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        connected: false,
        loading: false,
        lastError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao conectar com a Yolen.',
      }

      renderPanel()
    }
  }

  function startSessionAutoRefresh() {
    if (sessionRefreshTimerId) {
      window.clearInterval(sessionRefreshTimerId)
    }

    sessionRefreshTimerId = window.setInterval(() => {
      loadYolenSession({ showLoading: false })
    }, SESSION_REFRESH_INTERVAL_MS)
  }

  function observeWhatsAppChanges() {
    const observer = new MutationObserver(() => {
      window.clearTimeout(observeWhatsAppChanges.timeoutId)

      observeWhatsAppChanges.timeoutId = window.setTimeout(() => {
        refreshConversationSnapshot()
      }, 600)
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  observeWhatsAppChanges.timeoutId = 0

  async function start() {
    await waitForWhatsAppApp()

    createPanel()
    renderPanel()
    await captureSessionFromHash()
    refreshConversationSnapshot()
    observeWhatsAppChanges()
    startSessionAutoRefresh()
    loadYolenSession({ showLoading: true })
  }

  start()
})()