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
    suggestionApplyLoading: false,
    suggestionApplyResult: null,
    suggestionApplyError: null,
    suggestedMessageCopyStatus: null,
    suggestedMessageLastRegisteredKey: null,
    pendingSuggestedMessageSend: null,
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
      suggestionApplyLoading: false,
      suggestionApplyResult: null,
      suggestionApplyError: null,
      suggestedMessageCopyStatus: null,
      suggestedMessageLastRegisteredKey: null,
      pendingSuggestedMessageSend: null,
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
      details.push(`Etapa atual: ${getStageLabel(resolution.cycle.status)}`)
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

  function getStageLabel(status) {
    const labels = {
      novo: 'Novo',
      contato: 'Contato',
      respondeu: 'Agenda',
      negociacao: 'Negociação',
      pausado: 'Pausado',
      ganho: 'Ganho',
      perdido: 'Perdido',
      cancelado: 'Cancelado',
    }

    return labels[status] || status || '-'
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

  function isOpenSuggestionStatus(status) {
    return ['novo', 'contato', 'respondeu', 'negociacao', 'pausado'].includes(status)
  }

  function canApplyCurrentSuggestion() {
    const suggestion = state.conversationAnalysis?.suggestion

    return (
      canAnalyzeCurrentConversation() &&
      Boolean(state.conversationAnalysis?.saved_coaching?.id) &&
      Boolean(suggestion) &&
      isOpenSuggestionStatus(suggestion.recommended_status) &&
      !state.conversationAnalysisLoading &&
      !state.suggestionApplyLoading &&
      !state.suggestionApplyResult
    )
  }

  function getAnalysisStatusClass() {
    if (state.conversationAnalysisError || state.suggestionApplyError) {
      return 'yolen-status-warning'
    }

    if (state.suggestionApplyResult || state.conversationAnalysis) {
      return 'yolen-status-success'
    }

    return 'yolen-status-neutral'
  }

  function getAnalysisTitle() {
    if (state.suggestionApplyLoading) {
      return 'Aplicando sugestão na Yolen...'
    }

    if (state.suggestionApplyError) {
      return 'Erro ao aplicar sugestão'
    }

    if (state.suggestionApplyResult) {
      return state.suggestionApplyResult.already_applied
        ? 'Sugestão já estava aplicada na Yolen'
        : 'Sugestão aplicada na Yolen'
    }

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

  function formatSuggestionDate(value) {
    if (!value) {
      return null
    }

    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return value
    }
  }

  function getAnalysisDescription() {
    if (state.suggestionApplyLoading) {
      return 'A Yolen está atualizando o ciclo, registrando evento e preservando o histórico.'
    }

    if (state.suggestionApplyError) {
      return escapeHtml(state.suggestionApplyError)
    }

    if (state.suggestionApplyResult) {
      const result = state.suggestionApplyResult
      const details = []

      details.push(
        result.already_applied
          ? `Etapa já aplicada: ${getStageLabel(result.status)}`
          : `Etapa aplicada: ${getStageLabel(result.status)}`,
      )

      if (result.previous_status) {
        details.push(`Etapa anterior: ${getStageLabel(result.previous_status)}`)
      }

      if (result.next_action) {
        details.push(`Próxima ação: ${result.next_action}`)
      }

      if (result.next_action_date) {
        details.push(`Data: ${formatSuggestionDate(result.next_action_date)}`)
      }

      details.push(
        result.already_applied
          ? 'Nenhum evento duplicado foi criado'
          : 'Evento registrado no histórico',
      )

      return escapeHtml(details.join(' · '))
    }

    if (state.conversationAnalysisLoading) {
      return 'A Yolen está lendo as mensagens visíveis e calculando a melhor atualização comercial.'
    }

    if (state.conversationAnalysisError) {
      return escapeHtml(state.conversationAnalysisError)
    }

    const suggestion = state.conversationAnalysis?.suggestion

    if (suggestion) {
      const details = []
      const savedCoaching = state.conversationAnalysis?.saved_coaching

      details.push(`Etapa sugerida: ${getStageLabel(suggestion.recommended_status)}`)

      if (typeof suggestion.confidence === 'number') {
        details.push(`Confiança: ${Math.round(suggestion.confidence * 100)}%`)
      }

      if (suggestion.next_action) {
        details.push(`Próxima ação: ${suggestion.next_action}`)
      }

      if (suggestion.next_action_date) {
        details.push(`Data: ${formatSuggestionDate(suggestion.next_action_date)}`)
      }

      if (suggestion.result_detail) {
        details.push(`Detalhe: ${suggestion.result_detail}`)
      }

      if (savedCoaching?.id) {
        details.push(
          savedCoaching.reused
            ? 'Histórico: já salvo na Yolen'
            : 'Histórico: salvo na Yolen',
        )

        if (savedCoaching.incremental) {
          details.push('Escopo: apenas mensagens novas')
        } else {
          details.push('Escopo: conversa visível')
        }
      }

      if (!isOpenSuggestionStatus(suggestion.recommended_status)) {
        details.push('Aplicação automática bloqueada nesta fase')
      }

      if (state.suggestedMessageCopyStatus) {
        details.push(state.suggestedMessageCopyStatus)
      }

      return escapeHtml(details.join(' · '))
    }

    if (!canAnalyzeCurrentConversation()) {
      return 'A análise só é liberada quando o lead está localizado e a regra de carteira permite leitura.'
    }

    return 'Clique para enviar as mensagens visíveis desta conversa ao Copiloto da Yolen.'
  }

  function getSuggestedMessage() {
    const message = state.conversationAnalysis?.coaching?.suggested_message

    return typeof message === 'string' && message.trim() ? message.trim() : null
  }

  function getSuggestedMessageHtml() {
    const message = getSuggestedMessage()

    if (!message) {
      return ''
    }

    return `
      <div class="yolen-card-description">
        <strong>Mensagem sugerida</strong><br>
        ${escapeHtml(message)}
      </div>
    `
  }

  function getWhatsAppComposer() {
    const main = getMainConversationRoot()
    const root = main || document

    const selectors = [
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"][data-tab]',
      'footer [contenteditable="true"]',
      '[data-testid="conversation-compose-box-input"]',
      '[contenteditable="true"][role="textbox"]',
    ]

    for (const selector of selectors) {
      const candidates = Array.from(root.querySelectorAll(selector))

      const composer = candidates.find((element) => {
        if (element.closest(`#${PANEL_ID}`)) {
          return false
        }

        const ariaLabel = element.getAttribute('aria-label') || ''
        const dataLexicalEditor = element.getAttribute('data-lexical-editor')

        if (/pesquisar|search|filtrar|buscar/i.test(ariaLabel)) {
          return false
        }

        return dataLexicalEditor === 'true' || element.isContentEditable
      })

      if (composer) {
        return composer
      }
    }

    return null
  }

  function selectComposerContents(composer) {
    const selection = window.getSelection()

    if (!selection) {
      return false
    }

    const range = document.createRange()
    range.selectNodeContents(composer)

    selection.removeAllRanges()
    selection.addRange(range)

    return true
  }

  function dispatchComposerInput(composer, message) {
    try {
      composer.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: message,
        }),
      )
    } catch {
      composer.dispatchEvent(
        new Event('input', {
          bubbles: true,
          cancelable: true,
        }),
      )
    }

    composer.dispatchEvent(
      new Event('change', {
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  function writeTextInComposer(composer, message) {
    composer.focus()
    selectComposerContents(composer)

    let inserted = false

    try {
      document.execCommand('delete')
      inserted = document.execCommand('insertText', false, message)
    } catch {
      inserted = false
    }

    if (!inserted) {
      composer.textContent = message
    }

    dispatchComposerInput(composer, message)
    composer.focus()

    return true
  }

  async function insertSuggestedMessageInWhatsApp() {
    const message = getSuggestedMessage()

    if (!message) {
      return
    }

    const composer = getWhatsAppComposer()

    if (!composer) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Não encontrei o campo de mensagem do WhatsApp. Copie e cole manualmente.',
      }

      renderPanel()
      return
    }

    const currentComposerText = normalizeMessageText(composer.textContent)

    if (currentComposerText) {
      const confirmed = window.confirm(
        'O campo do WhatsApp já tem texto. Substituir pela mensagem sugerida?',
      )

      if (!confirmed) {
        state = {
          ...state,
          suggestedMessageCopyStatus: 'Inserção cancelada',
        }

        renderPanel()
        return
      }
    }

    writeTextInComposer(composer, message)

    try {
      const registration = await registerSuggestedMessageAction('inserted')

      state = {
        ...state,
        suggestedMessageCopyStatus: registration.alreadyRegistered
          ? 'Mensagem inserida no WhatsApp. Uso já estava registrado na Yolen. Revise antes de enviar.'
          : registration.registered
            ? 'Mensagem inserida no WhatsApp e registrada na Yolen. Revise antes de enviar.'
            : 'Mensagem inserida no campo do WhatsApp. Revise antes de enviar.',
        suggestedMessageLastRegisteredKey:
          registration.registrationKey || state.suggestedMessageLastRegisteredKey,
        pendingSuggestedMessageSend: {
          cycleId: state.leadResolution?.cycle?.id || null,
          coachingNoteId: state.conversationAnalysis?.saved_coaching?.id || null,
          conversationKey: state.conversationKey,
          message,
        },
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          error instanceof Error && error.message
            ? `Mensagem inserida, mas não registrada: ${error.message}`
            : 'Mensagem inserida, mas não registrada na Yolen. Revise antes de enviar.',
      }

      renderPanel()
    }
  }


  function getAnalysisActionButton() {
    if (!canAnalyzeCurrentConversation() || state.conversationAnalysisLoading) {
      return ''
    }

    const analyzeButton = `
      <button class="yolen-secondary-button" type="button" data-yolen-action="analyze-conversation">
        Analisar conversa com IA
      </button>
    `

    const copyMessageButton = getSuggestedMessage()
      ? `
        <button class="yolen-secondary-button" type="button" data-yolen-action="copy-suggested-message">
          Copiar mensagem
        </button>
      `
      : ''

    const insertMessageButton = getSuggestedMessage()
      ? `
        <button class="yolen-secondary-button" type="button" data-yolen-action="insert-suggested-message">
          Inserir no WhatsApp
        </button>
      `
      : ''

    if (!state.conversationAnalysis?.suggestion) {
      return `
        <button class="yolen-primary-button" type="button" data-yolen-action="analyze-conversation">
          Analisar conversa com IA
        </button>
      `
    }

    if (!canApplyCurrentSuggestion()) {
      return `
        ${insertMessageButton}
        ${copyMessageButton}
        ${analyzeButton}
      `
    }

    return `
      <button class="yolen-primary-button" type="button" data-yolen-action="apply-suggestion">
        Aplicar sugestão na Yolen
      </button>

      ${insertMessageButton}
      ${copyMessageButton}
      ${analyzeButton}
    `
  }

  function getAnalysisCardHtml() {
    return `
      <div class="yolen-card ${getAnalysisStatusClass()}">
        <div class="yolen-section-label">Análise da conversa</div>
        <div class="yolen-card-title">${escapeHtml(getAnalysisTitle())}</div>
        <div class="yolen-card-description">${getAnalysisDescription()}</div>
        ${getSuggestedMessageHtml()}
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
          <div class="yolen-rule">Não envia mensagem automaticamente</div>
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

    panel.querySelector('[data-yolen-action="apply-suggestion"]')?.addEventListener('click', () => {
      applyCurrentSuggestion()
    })

    panel.querySelector('[data-yolen-action="copy-suggested-message"]')?.addEventListener('click', () => {
      copySuggestedMessage()
    })

    panel.querySelector('[data-yolen-action="insert-suggested-message"]')?.addEventListener('click', () => {
      insertSuggestedMessageInWhatsApp()
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
      suggestionApplyLoading: false,
      suggestionApplyResult: null,
      suggestionApplyError: null,
      suggestedMessageCopyStatus: null,
      suggestedMessageLastRegisteredKey: null,
      pendingSuggestedMessageSend: null,
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

  async function registerSuggestedMessageAction(action, options = {}) {
    const cycleId = options.cycleId || state.leadResolution?.cycle?.id
    const message = options.message || getSuggestedMessage()
    const coachingNoteId =
      options.coachingNoteId || state.conversationAnalysis?.saved_coaching?.id || null

    if (!cycleId || !message || !window.YolenCompanionApi?.registerMessageAction) {
      return {
        registered: false,
        alreadyRegistered: false,
        registrationKey: null,
      }
    }

    const registrationKey = [
      cycleId,
      coachingNoteId || '-',
      action,
      message,
    ].join('::')

    if (state.suggestedMessageLastRegisteredKey === registrationKey) {
      return {
        registered: false,
        alreadyRegistered: false,
        registrationKey,
      }
    }

    const result = await window.YolenCompanionApi.registerMessageAction({
      cycle_id: cycleId,
      action,
      message,
      coaching_note_id: coachingNoteId,
    })

    if (!result?.ok || !result.payload?.ok) {
      throw new Error(
        result?.payload?.error ||
          'Não foi possível registrar o uso da mensagem sugerida na Yolen.',
      )
    }

    return {
      registered: result.payload?.data?.already_registered !== true,
      alreadyRegistered: result.payload?.data?.already_registered === true,
      registrationKey,
    }
  }

  function getComposerText() {
    const composer = getWhatsAppComposer()

    if (!composer) {
      return ''
    }

    return normalizeMessageText(composer.textContent)
  }

  function isWhatsAppSendButtonTarget(target) {
    if (!target || typeof target.closest !== 'function') {
      return false
    }

    const button = target.closest('button,[role="button"]')

    if (!button || button.closest(`#${PANEL_ID}`)) {
      return false
    }

    const ariaLabel = button.getAttribute('aria-label') || ''
    const title = button.getAttribute('title') || ''
    const text = `${ariaLabel} ${title}`

    if (/enviar|send/i.test(text)) {
      return true
    }

    return Boolean(
      button.querySelector('[data-icon="send"]') ||
        button.querySelector('[data-testid="send"]'),
    )
  }

  function isComposerEnterTarget(target) {
    if (!target || typeof target.closest !== 'function') {
      return false
    }

    const composer = target.closest('[contenteditable="true"]')

    if (!composer || composer.closest(`#${PANEL_ID}`)) {
      return false
    }

    return composer === getWhatsAppComposer()
  }

  async function registerManualSuggestedMessageSend(finalMessage) {
    const pending = state.pendingSuggestedMessageSend

    if (!pending?.cycleId || !pending.message) {
      return
    }

    if (pending.conversationKey !== state.conversationKey) {
      return
    }

    const messageToRegister = normalizeMessageText(finalMessage || pending.message)

    if (!messageToRegister || messageToRegister.length < 2) {
      return
    }

    try {
      const registration = await registerSuggestedMessageAction('sent', {
        cycleId: pending.cycleId,
        coachingNoteId: pending.coachingNoteId,
        message: messageToRegister,
      })

      state = {
        ...state,
        suggestedMessageCopyStatus: registration.alreadyRegistered
          ? 'Envio manual já estava registrado na Yolen'
          : registration.registered
            ? 'Envio manual registrado na Yolen'
            : state.suggestedMessageCopyStatus,
        suggestedMessageLastRegisteredKey:
          registration.registrationKey || state.suggestedMessageLastRegisteredKey,
        pendingSuggestedMessageSend: null,
      }

      renderPanel()
    } catch {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Mensagem enviada manualmente, mas a Yolen não conseguiu registrar o envio.',
        pendingSuggestedMessageSend: null,
      }

      renderPanel()
    }
  }

  function scheduleManualSendRegistration() {
    const currentMessage = getComposerText()

    if (!currentMessage) {
      return
    }

    window.setTimeout(() => {
      registerManualSuggestedMessageSend(currentMessage)
    }, 250)
  }

  function observeManualWhatsAppSend() {
    document.addEventListener(
      'click',
      (event) => {
        if (isWhatsAppSendButtonTarget(event.target)) {
          scheduleManualSendRegistration()
        }
      },
      true,
    )

    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          isComposerEnterTarget(event.target)
        ) {
          scheduleManualSendRegistration()
        }
      },
      true,
    )
  }



  async function copySuggestedMessage() {
    const message = getSuggestedMessage()

    if (!message) {
      return
    }

    try {
      await navigator.clipboard.writeText(message)
    } catch {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Não foi possível copiar automaticamente. Selecione e copie a mensagem manualmente.',
      }

      renderPanel()
      return
    }

    try {
      const registration = await registerSuggestedMessageAction('copied')

      state = {
        ...state,
        suggestedMessageCopyStatus: registration.alreadyRegistered
          ? 'Mensagem copiada. Uso já estava registrado na Yolen'
          : registration.registered
            ? 'Mensagem copiada e registrada na Yolen'
            : 'Mensagem copiada',
        suggestedMessageLastRegisteredKey:
          registration.registrationKey || state.suggestedMessageLastRegisteredKey,
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          error instanceof Error && error.message
            ? `Mensagem copiada, mas não registrada: ${error.message}`
            : 'Mensagem copiada, mas não registrada na Yolen.',
      }

      renderPanel()
    }
  }

  function buildApplyConfirmationText() {
    const suggestion = state.conversationAnalysis?.suggestion
    const currentStatus = state.leadResolution?.cycle?.status || '-'

    if (!suggestion) {
      return 'Confirmar aplicação da sugestão na Yolen?'
    }

    const lines = [
      'Confirmar aplicação da sugestão na Yolen?',
      '',
      `De: ${getStageLabel(currentStatus)}`,
      `Para: ${getStageLabel(suggestion.recommended_status)}`,
    ]

    if (suggestion.next_action) {
      lines.push(`Próxima ação: ${suggestion.next_action}`)
    }

    if (suggestion.next_action_date) {
      lines.push(`Data: ${formatSuggestionDate(suggestion.next_action_date)}`)
    }

    lines.push('')
    lines.push('Essa ação vai atualizar o ciclo e registrar evento no histórico.')

    return lines.join('\n')
  }

  async function applyCurrentSuggestion() {
    if (!canApplyCurrentSuggestion()) {
      return
    }

    const suggestion = state.conversationAnalysis?.suggestion
    const cycleId = state.leadResolution?.cycle?.id

    if (!suggestion || !cycleId) {
      state = {
        ...state,
        suggestionApplyLoading: false,
        suggestionApplyResult: null,
        suggestionApplyError: 'Sugestão ou ciclo não localizado para aplicação.',
      }

      renderPanel()
      return
    }

    const confirmed = window.confirm(buildApplyConfirmationText())

    if (!confirmed) {
      return
    }

    state = {
      ...state,
      suggestionApplyLoading: true,
      suggestionApplyResult: null,
      suggestionApplyError: null,
    }

    renderPanel()

    try {
      const result = await window.YolenCompanionApi.applySuggestion({
        cycle_id: cycleId,
        applied_status: suggestion.recommended_status,
        next_action: suggestion.next_action,
        next_action_date: suggestion.next_action_date,
        edited_summary: suggestion.summary,
        suggestion,
        source: 'whatsapp_companion',
      })

      if (!result?.ok || !result.payload?.ok || !result.payload?.data) {
        state = {
          ...state,
          suggestionApplyLoading: false,
          suggestionApplyResult: null,
          suggestionApplyError:
            result?.payload?.error ||
            'Não foi possível aplicar a sugestão na Yolen.',
        }

        renderPanel()
        return
      }

      const applied = result.payload.data

      state = {
        ...state,
        suggestionApplyLoading: false,
        suggestionApplyResult: applied,
        suggestionApplyError: null,
        leadResolution: state.leadResolution
          ? {
              ...state.leadResolution,
              cycle: {
                ...state.leadResolution.cycle,
                status: applied.status,
                previous_status: applied.previous_status,
                next_action: applied.next_action,
                next_action_date: applied.next_action_date,
              },
            }
          : state.leadResolution,
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        suggestionApplyLoading: false,
        suggestionApplyResult: null,
        suggestionApplyError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao aplicar sugestão na Yolen.',
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
    observeManualWhatsAppSend()
    startSessionAutoRefresh()
    loadYolenSession({
      showLoading: true,
      resolveLeadAfterLoad: true,
    })
  }

  start()
})()