;(function initYolenCompanion() {
  const PANEL_ID = 'yolen-companion-panel'
  const ROOT_CLASS = 'yolen-companion-root'
  const WHATSAPP_APP_SELECTOR = '#app'
  const SESSION_REFRESH_INTERVAL_MS = 5000
  const HASH_SESSION_KEY = 'yolen_companion_session'
  const AUTO_CONTACT_LOOKUP_DELAY_MS = 900
  const AUTO_CONTACT_LOOKUP_TIMEOUT_MS = 3500

  let sessionRefreshTimerId = 0
  let lastResolvedConversationKey = null
  let leadResolutionInFlight = false
  let autoContactLookupInFlight = false

  const autoLookupAttemptedKeys = new Set()
  const cachedPhonesByConversationKey = new Map()

  let state = {
    connected: false,
    loading: true,
    userName: null,
    companyName: null,
    companyRole: null,
    conversationTitle: null,
    conversationKey: null,
    conversationPhone: null,
    phoneSource: null,
    isSelfConversation: false,
    messageCount: 0,
    audioCount: 0,
    lastError: null,
    lastSessionSyncAt: null,
    leadResolutionLoading: false,
    leadResolution: null,
    leadResolutionError: null,
    autoLookupStatus: null,
    conversationAnalysisLoading: false,
    conversationAnalysis: null,
    conversationAnalysisError: null,
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
        window.history.replaceState(
          null,
          document.title,
          window.location.pathname + window.location.search,
        )
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

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function isLikelyPhone(value) {
    const digits = onlyDigits(value)

    if (digits.length < 10 || digits.length > 13) {
      return false
    }

    if (/^(\d)\1+$/.test(digits)) {
      return false
    }

    return true
  }

  function extractPhoneFromText(value) {
    const text = String(value || '')
    const matches = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || []

    for (const match of matches) {
      if (isLikelyPhone(match)) {
        return onlyDigits(match)
      }
    }

    return null
  }

  function isProfileOrContactPanelText(value) {
    const normalized = String(value || '').trim().toLowerCase()

    return (
      normalized === 'dados do contato' ||
      normalized === 'dados do perfil' ||
      normalized === 'contact info' ||
      normalized === 'profile'
    )
  }

  function isIgnoredHeaderText(value) {
    const normalized = String(value || '').trim().toLowerCase()

    return (
      !normalized ||
      normalized === 'dados do contato' ||
      normalized === 'dados do perfil' ||
      normalized === 'clique para mostrar os dados do contato' ||
      normalized === 'click here for contact info'
    )
  }

  function getMainConversationRoot() {
    return (
      document.querySelector('#main') ||
      document.querySelector('[data-testid="conversation-panel-wrapper"]') ||
      null
    )
  }

  function getMainHeader() {
    const main = getMainConversationRoot()

    if (!main) {
      return null
    }

    return main.querySelector('header')
  }

  function getMainHeaderTextCandidates() {
    const header = getMainHeader()
    const candidates = []

    if (!header) {
      return candidates
    }

    header.querySelectorAll('[title]').forEach((element) => {
      const title = element.getAttribute('title')?.trim()

      if (title && !title.startsWith('wds-') && title.length > 1) {
        candidates.push(title)
      }
    })

    header.querySelectorAll('span, div').forEach((element) => {
      const text = element.textContent?.trim()

      if (text && !text.startsWith('wds-') && text.length > 1 && text.length < 120) {
        candidates.push(text)
      }
    })

    return Array.from(new Set(candidates)).filter((candidate) => {
      return !isIgnoredHeaderText(candidate)
    })
  }

  function getSelectedChatElement() {
    return document.querySelector('[aria-selected="true"]')
  }

  function getSelectedChatTitle() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return null
    }

    const titleElements = selectedElement.querySelectorAll('[title]')

    for (const titleElement of titleElements) {
      const title = titleElement.getAttribute('title')?.trim()

      if (title && title.length > 1 && !title.startsWith('wds-')) {
        return title
      }
    }

    const autoTextElements = selectedElement.querySelectorAll('[dir="auto"]')

    for (const autoTextElement of autoTextElements) {
      const text = autoTextElement.textContent?.trim()

      if (text && text.length > 1 && text.length < 90) {
        return text
      }
    }

    return null
  }

  function getSelectedChatTextSnapshot() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return ''
    }

    return String(selectedElement.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)
  }

  function getConversationKey(title) {
    const selectedSnapshot = getSelectedChatTextSnapshot()
    const safeTitle = String(title || '').trim()

    return `${safeTitle}::${selectedSnapshot}`
  }

  function findContactInfoPanel() {
    const possibleTitles = Array.from(document.querySelectorAll('span, div, h1, h2, header'))

    for (const element of possibleTitles) {
      const text = element.textContent?.trim()

      if (!isProfileOrContactPanelText(text)) {
        continue
      }

      let current = element

      for (let index = 0; index < 10; index += 1) {
        const parent = current.parentElement

        if (!parent || parent === document.body || parent.id === PANEL_ID) {
          break
        }

        const parentText = parent.textContent || ''
        const parentTextLength = parentText.length

        if (
          parentTextLength > 40 &&
          parentTextLength < 7000 &&
          parentText.toLowerCase().includes(text.toLowerCase())
        ) {
          return parent
        }

        current = parent
      }
    }

    return null
  }

  function getContactPanelPhone() {
    const panel = findContactInfoPanel()

    if (!panel) {
      return null
    }

    const candidates = []

    panel.querySelectorAll('[title], span, div, a').forEach((element) => {
      const title = element.getAttribute?.('title')?.trim()
      const text = element.textContent?.trim()

      if (title && title.length < 140) {
        candidates.push(title)
      }

      if (text && text.length < 220) {
        candidates.push(text)
      }
    })

    for (const candidate of Array.from(new Set(candidates))) {
      const phone = extractPhoneFromText(candidate)

      if (phone) {
        return phone
      }
    }

    return null
  }

  function isSelfConversationTitle(title) {
    const normalized = String(title || '').toLowerCase()

    return (
      normalized.includes('(você)') ||
      normalized.includes('mensagens para mim') ||
      normalized.includes('message yourself')
    )
  }

  function getConversationTitle() {
    const selectedTitle = getSelectedChatTitle()

    if (selectedTitle) {
      return selectedTitle
    }

    const headerCandidates = getMainHeaderTextCandidates()
    const headerTitle = headerCandidates.find((candidate) => !isIgnoredHeaderText(candidate))

    return headerTitle || null
  }

  function getConversationPhone(title, conversationKey) {
    const headerCandidates = getMainHeaderTextCandidates()

    for (const candidate of headerCandidates) {
      if (isLikelyPhone(candidate)) {
        return {
          phone: onlyDigits(candidate),
          source: 'Cabeçalho da conversa',
        }
      }
    }

    if (isSelfConversationTitle(title)) {
      return {
        phone: null,
        source: null,
      }
    }

    const selectedTitle = getSelectedChatTitle()

    if (selectedTitle && isLikelyPhone(selectedTitle)) {
      return {
        phone: onlyDigits(selectedTitle),
        source: 'Contato selecionado',
      }
    }

    const cachedPhone = cachedPhonesByConversationKey.get(conversationKey)

    if (cachedPhone) {
      return {
        phone: cachedPhone,
        source: 'Dados do contato automático',
      }
    }

    return {
      phone: null,
      source: null,
    }
  }

  function getVisibleMessagesCount() {
    const main = getMainConversationRoot() || document
    const messagesWithPreText = main.querySelectorAll('[data-pre-plain-text]')
    const messageRows = main.querySelectorAll('[role="row"]')

    return Math.max(messagesWithPreText.length, messageRows.length, 0)
  }

  function getVisibleAudioCount() {
    const main = getMainConversationRoot() || document
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
      main.querySelectorAll(selector).forEach((element) => {
        detected.add(element)
      })
    })

    return detected.size
  }

  function normalizeMessageText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u200e/g, '')
      .trim()
  }

  function collectVisibleConversationText() {
    const main = getMainConversationRoot()

    if (!main) {
      return ''
    }

    const lines = []
    const messageNodes = Array.from(main.querySelectorAll('[data-pre-plain-text]'))

    messageNodes.forEach((node) => {
      const prePlainText = node.getAttribute('data-pre-plain-text') || ''
      const text = normalizeMessageText(node.textContent)

      if (!text) {
        return
      }

      const cleanPreText = normalizeMessageText(prePlainText)

      lines.push(`${cleanPreText} ${text}`.trim())
    })

    if (lines.length === 0) {
      const fallbackRows = Array.from(main.querySelectorAll('[role="row"]'))

      fallbackRows.forEach((row) => {
        const text = normalizeMessageText(row.textContent)

        if (text && text.length > 2 && text.length < 1200) {
          lines.push(text)
        }
      })
    }

    if (state.audioCount > 0) {
      lines.push(`[Yolen Companion: ${state.audioCount} áudio(s) visível(is) detectado(s), ainda sem transcrição.]`)
    }

    return Array.from(new Set(lines))
      .slice(-80)
      .join('\n')
      .trim()
      .slice(0, 24000)
  }

  function getClickableHeaderTarget() {
    const header = getMainHeader()

    if (!header) {
      return null
    }

    const roleButton = header.querySelector('[role="button"]')

    if (roleButton) {
      return roleButton
    }

    const clickable = Array.from(header.querySelectorAll('div, span, button')).find((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 80 && rect.height > 20
    })

    return clickable || header
  }

  function clickElement(element) {
    if (!element) {
      return false
    }

    const rect = element.getBoundingClientRect()
    const clientX = rect.left + rect.width / 2
    const clientY = rect.top + rect.height / 2

    element.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    )

    element.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    )

    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      }),
    )

    return true
  }

  function closeContactInfoPanel() {
    const panel = findContactInfoPanel()

    if (!panel) {
      return
    }

    const closeButton =
      panel.querySelector('[aria-label*="Fechar" i]') ||
      panel.querySelector('[aria-label*="Close" i]') ||
      panel.querySelector('[data-icon="x"]')?.closest('button')

    if (closeButton) {
      clickElement(closeButton)
      return
    }

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
      }),
    )
  }

  async function waitForContactPanelPhone(timeoutMs) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const phone = getContactPanelPhone()

      if (phone) {
        return phone
      }

      await sleep(200)
    }

    return null
  }

  async function runAutomaticContactLookup(conversationKey) {
    if (autoContactLookupInFlight) {
      return
    }

    if (!state.connected || state.isSelfConversation || state.conversationPhone) {
      return
    }

    if (!conversationKey || autoLookupAttemptedKeys.has(conversationKey)) {
      return
    }

    autoLookupAttemptedKeys.add(conversationKey)
    autoContactLookupInFlight = true

    const lookupTitle = state.conversationTitle
    const hadContactPanelOpen = Boolean(findContactInfoPanel())

    state = {
      ...state,
      autoLookupStatus: 'Abrindo dados do contato automaticamente...',
    }

    renderPanel()

    try {
      if (!hadContactPanelOpen) {
        const clicked = clickElement(getClickableHeaderTarget())

        if (!clicked) {
          state = {
            ...state,
            autoLookupStatus: 'Não consegui abrir os dados do contato automaticamente.',
          }

          renderPanel()
          return
        }

        await sleep(AUTO_CONTACT_LOOKUP_DELAY_MS)
      }

      const phone = await waitForContactPanelPhone(AUTO_CONTACT_LOOKUP_TIMEOUT_MS)

      if (state.conversationKey !== conversationKey || state.conversationTitle !== lookupTitle) {
        return
      }

      if (!phone) {
        state = {
          ...state,
          autoLookupStatus:
            'Telefone não apareceu nos dados do contato. A consulta não foi feita.',
        }

        renderPanel()
        return
      }

      cachedPhonesByConversationKey.set(conversationKey, phone)

      state = {
        ...state,
        conversationPhone: phone,
        phoneSource: hadContactPanelOpen ? 'Dados do contato' : 'Dados do contato automático',
        autoLookupStatus: null,
      }

      renderPanel()

      if (!hadContactPanelOpen) {
        await sleep(250)
        closeContactInfoPanel()
      }

      if (state.connected) {
        resolveCurrentLead()
      }
    } finally {
      autoContactLookupInFlight = false
    }
  }

  function clearLeadStateForNewConversation() {
    state = {
      ...state,
      leadResolutionLoading: false,
      leadResolution: null,
      leadResolutionError: null,
      autoLookupStatus: null,
      conversationAnalysisLoading: false,
      conversationAnalysis: null,
      conversationAnalysisError: null,
    }
  }

  function refreshConversationSnapshot() {
    const conversationTitle = getConversationTitle()
    const conversationKey = getConversationKey(conversationTitle)
    const isSelfConversation = isSelfConversationTitle(conversationTitle)
    const phoneResult = getConversationPhone(conversationTitle, conversationKey)
    const previousConversationKey = state.conversationKey
    const conversationChanged = previousConversationKey !== conversationKey

    state = {
      ...state,
      conversationTitle,
      conversationKey,
      conversationPhone: phoneResult.phone,
      phoneSource: phoneResult.source,
      isSelfConversation,
      messageCount: getVisibleMessagesCount(),
      audioCount: getVisibleAudioCount(),
    }

    if (conversationChanged) {
      lastResolvedConversationKey = null
      clearLeadStateForNewConversation()
    }

    if (isSelfConversation) {
      lastResolvedConversationKey = null
      clearLeadStateForNewConversation()
      renderPanel()
      return
    }

    renderPanel()

    if (state.connected && phoneResult.phone && lastResolvedConversationKey !== conversationKey) {
      lastResolvedConversationKey = conversationKey
      resolveCurrentLead()
      return
    }

    if (state.connected && !phoneResult.phone && conversationKey) {
      window.setTimeout(() => {
        runAutomaticContactLookup(conversationKey)
      }, 300)
    }
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

  function getLeadStatusClass() {
    const status = state.leadResolution?.status

    if (status === 'OWNED_BY_ME') {
      return 'yolen-status-success'
    }

    if (status === 'NOT_FOUND' || status === 'NO_PHONE_DETECTED') {
      return 'yolen-status-warning'
    }

    return 'yolen-status-neutral'
  }

  function getLeadStatusTitle() {
    if (state.isSelfConversation) {
      return 'Conversa do próprio usuário'
    }

    if (state.leadResolutionLoading) {
      return 'Localizando lead...'
    }

    if (state.leadResolutionError) {
      return 'Erro ao localizar lead'
    }

    if (!state.connected) {
      return 'Lead não consultado'
    }

    if (!state.conversationPhone) {
      return 'Telefone não detectado'
    }

    return state.leadResolution?.user_message || 'Lead ainda não consultado'
  }

  function getLeadStatusDescription() {
    if (state.isSelfConversation) {
      return 'O Companion não vincula conversa com você mesmo a um lead comercial.'
    }

    if (state.leadResolutionLoading) {
      return 'A Yolen está verificando esse telefone apenas na empresa ativa.'
    }

    if (state.leadResolutionError) {
      return escapeHtml(state.leadResolutionError)
    }

    if (!state.connected) {
      return 'Conecte a Yolen para consultar o vínculo comercial.'
    }

    if (!state.conversationPhone) {
      return escapeHtml(
        state.autoLookupStatus ||
          'O Companion tentará abrir os dados do contato automaticamente para localizar o telefone.',
      )
    }

    const resolution = state.leadResolution

    if (!resolution) {
      return 'Clique em Atualizar leitura para consultar esse telefone.'
    }

    const details = []

    if (resolution.lead?.name) {
      details.push(`Lead: ${resolution.lead.name}`)
    }

    if (resolution.cycle?.status) {
      details.push(`Etapa atual: ${resolution.cycle.status}`)
    }

    if (resolution.cycle?.owner_name) {
      details.push(`Responsável: ${resolution.cycle.owner_name}`)
    }

    if (resolution.phone_variants?.length) {
      details.push(`Busca: ${resolution.phone_variants.join(', ')}`)
    }

    return escapeHtml(details.join(' · ') || resolution.user_message)
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

  function getLeadActionButton() {
    if (state.leadResolutionLoading || state.isSelfConversation) {
      return ''
    }

    const resolution = state.leadResolution

    if (!resolution || !state.connected) {
      return ''
    }

    if (resolution.status === 'NOT_FOUND') {
      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="create-lead-yolen">
          Criar lead na Yolen
        </button>
      `
    }

    if (resolution.status === 'IN_POOL') {
      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="open-pool">
          Abrir Pool na Yolen
        </button>
      `
    }

    return `
      <button class="yolen-secondary-button" type="button" data-yolen-action="open-cycle-yolen">
        Abrir vínculo na Yolen
      </button>
    `
  }

  function canAnalyzeCurrentConversation() {
    return (
      state.connected &&
      !state.isSelfConversation &&
      state.leadResolution?.cycle?.id &&
      state.leadResolution?.actions?.can_analyze_conversation === true
    )
  }

  function getAnalysisStatusClass() {
    if (state.conversationAnalysisError) {
      return 'yolen-status-warning'
    }

    if (state.conversationAnalysis) {
      return 'yolen-status-success'
    }

    return 'yolen-status-neutral'
  }

  function getAnalysisTitle() {
    if (state.conversationAnalysisLoading) {
      return 'Analisando conversa...'
    }

    if (state.conversationAnalysisError) {
      return 'Erro na análise da IA'
    }

    if (state.conversationAnalysis?.suggestion?.summary) {
      return state.conversationAnalysis.suggestion.summary
    }

    if (!canAnalyzeCurrentConversation()) {
      return 'Análise ainda indisponível'
    }

    return 'Conversa pronta para análise'
  }

  function getAnalysisDescription() {
    if (state.conversationAnalysisLoading) {
      return 'A Yolen está lendo as mensagens visíveis e calculando a melhor atualização comercial.'
    }

    if (state.conversationAnalysisError) {
      return escapeHtml(state.conversationAnalysisError)
    }

    const suggestion = state.conversationAnalysis?.suggestion

    if (suggestion) {
      const details = []

      details.push(`Etapa sugerida: ${suggestion.recommended_status}`)

      if (typeof suggestion.confidence === 'number') {
        details.push(`Confiança: ${Math.round(suggestion.confidence * 100)}%`)
      }

      if (suggestion.next_action) {
        details.push(`Próxima ação: ${suggestion.next_action}`)
      }

      if (suggestion.result_detail) {
        details.push(`Detalhe: ${suggestion.result_detail}`)
      }

      return escapeHtml(details.join(' · '))
    }

    if (!canAnalyzeCurrentConversation()) {
      return 'A análise só é liberada quando o lead está localizado e a regra de carteira permite leitura.'
    }

    return 'Clique para enviar as mensagens visíveis desta conversa ao Copiloto da Yolen.'
  }

  function getAnalysisActionButton() {
    if (!canAnalyzeCurrentConversation() || state.conversationAnalysisLoading) {
      return ''
    }

    return `
      <button class="yolen-primary-button" type="button" data-yolen-action="analyze-conversation">
        Analisar conversa com IA
      </button>
    `
  }

  function getAnalysisCardHtml() {
    return `
      <div class="yolen-card ${getAnalysisStatusClass()}">
        <div class="yolen-section-label">Análise da conversa</div>
        <div class="yolen-card-title">${escapeHtml(getAnalysisTitle())}</div>
        <div class="yolen-card-description">${getAnalysisDescription()}</div>
        <div class="yolen-inline-actions">
          ${getAnalysisActionButton()}
        </div>
      </div>
    `
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

        <div class="yolen-card-description">
          Telefone detectado: ${escapeHtml(state.conversationPhone || 'não detectado')}
          ${
            state.phoneSource
              ? ` · Fonte: ${escapeHtml(state.phoneSource)}`
              : ''
          }
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

      <div class="yolen-card ${getLeadStatusClass()}">
        <div class="yolen-section-label">Vínculo na Yolen</div>
        <div class="yolen-card-title">${getLeadStatusTitle()}</div>
        <div class="yolen-card-description">${getLeadStatusDescription()}</div>
        <div class="yolen-inline-actions">
          ${getLeadActionButton()}
        </div>
      </div>

      ${getAnalysisCardHtml()}

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
        const currentKey = state.conversationKey

        if (currentKey) {
          autoLookupAttemptedKeys.delete(currentKey)
          cachedPhonesByConversationKey.delete(currentKey)
        }

        lastResolvedConversationKey = null
        refreshConversationSnapshot()
        loadYolenSession({ showLoading: true })

        if (!state.isSelfConversation) {
          resolveCurrentLead()
        }
      })
    })

    panel.querySelector('[data-yolen-action="open-yolen"]')?.addEventListener('click', () => {
      openYolen('/leads')
    })

    panel.querySelector('[data-yolen-action="connect-yolen"]')?.addEventListener('click', () => {
      openYolen('/companion/connect')
    })

    panel.querySelector('[data-yolen-action="create-lead-yolen"]')?.addEventListener('click', () => {
      const url = state.leadResolution?.actions?.create_lead_url || '/leads'
      openYolen(url)
    })

    panel.querySelector('[data-yolen-action="open-pool"]')?.addEventListener('click', () => {
      const url = state.leadResolution?.actions?.pool_url || '/pool'
      openYolen(url)
    })

    panel.querySelector('[data-yolen-action="open-cycle-yolen"]')?.addEventListener('click', () => {
      const url = state.leadResolution?.actions?.open_yolen_url || '/leads'
      openYolen(url)
    })

    panel.querySelector('[data-yolen-action="analyze-conversation"]')?.addEventListener('click', () => {
      analyzeCurrentConversation()
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

      if (options.resolveLeadAfterLoad === true && !state.isSelfConversation) {
        resolveCurrentLead()

        if (!state.conversationPhone && state.conversationKey) {
          runAutomaticContactLookup(state.conversationKey)
        }
      }
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

  async function resolveCurrentLead() {
    if (leadResolutionInFlight) {
      return
    }

    if (!state.connected || state.isSelfConversation) {
      return
    }

    if (!state.conversationPhone) {
      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: null,
        leadResolutionError: null,
      }

      renderPanel()
      return
    }

    const phoneAtRequest = state.conversationPhone
    const keyAtRequest = state.conversationKey

    leadResolutionInFlight = true

    state = {
      ...state,
      leadResolutionLoading: true,
      leadResolution: null,
      leadResolutionError: null,
    }

    renderPanel()

    try {
      const result = await window.YolenCompanionApi.resolveLead({
        phone: phoneAtRequest,
        display_name: state.conversationTitle,
      })

      if (state.conversationPhone !== phoneAtRequest || state.conversationKey !== keyAtRequest) {
        return
      }

      if (!result?.ok || !result.payload?.ok) {
        state = {
          ...state,
          leadResolutionLoading: false,
          leadResolution: null,
          leadResolutionError:
            result?.payload?.error ||
            'Não foi possível consultar o vínculo na Yolen.',
        }

        renderPanel()
        return
      }

      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: result.payload,
        leadResolutionError: null,
      }

      renderPanel()
    } catch (error) {
      if (state.conversationPhone !== phoneAtRequest || state.conversationKey !== keyAtRequest) {
        return
      }

      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: null,
        leadResolutionError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao localizar lead na Yolen.',
      }

      renderPanel()
    } finally {
      leadResolutionInFlight = false
    }
  }

  async function analyzeCurrentConversation() {
    if (!canAnalyzeCurrentConversation()) {
      return
    }

    const cycleId = state.leadResolution?.cycle?.id
    const conversationText = collectVisibleConversationText()

    if (!cycleId) {
      state = {
        ...state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError: 'Ciclo comercial não localizado para análise.',
      }

      renderPanel()
      return
    }

    if (!conversationText || conversationText.length < 15) {
      state = {
        ...state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError:
          'Não há texto suficiente visível na conversa para análise. Áudios ainda não entram como transcrição.',
      }

      renderPanel()
      return
    }

    state = {
      ...state,
      conversationAnalysisLoading: true,
      conversationAnalysis: null,
      conversationAnalysisError: null,
    }

    renderPanel()

    try {
      const result = await window.YolenCompanionApi.analyzeConversation({
        cycle_id: cycleId,
        conversation_text: conversationText,
        source: 'whatsapp',
      })

      if (!result?.ok || !result.payload?.ok || !result.payload?.data) {
        state = {
          ...state,
          conversationAnalysisLoading: false,
          conversationAnalysis: null,
          conversationAnalysisError:
            result?.payload?.error ||
            'Não foi possível analisar a conversa com IA.',
        }

        renderPanel()
        return
      }

      state = {
        ...state,
        conversationAnalysisLoading: false,
        conversationAnalysis: result.payload.data,
        conversationAnalysisError: null,
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao analisar conversa com IA.',
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
    loadYolenSession({
      showLoading: true,
      resolveLeadAfterLoad: true,
    })
  }

  start()
})()