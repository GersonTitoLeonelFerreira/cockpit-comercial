;(function initYolenCompanion() {
  const PANEL_ID = 'yolen-companion-panel'
  const ROOT_CLASS = 'yolen-companion-root'
  const WHATSAPP_APP_SELECTOR = '#app'
  const SESSION_REFRESH_INTERVAL_MS = 60000
  const RUNTIME_RECOVERY_DELAY_MS = 350
  const RUNTIME_STARTED_KEY =
    '__yolenCompanionRuntimeStarted'
  const HASH_SESSION_KEY = 'yolen_companion_session'
  const PANEL_COLLAPSED_STORAGE_KEY =
    'yolen_companion_panel_collapsed'
  const AUTO_CONTACT_LOOKUP_DELAY_MS = 900
  const AUTO_CONTACT_LOOKUP_TIMEOUT_MS = 6000
  const AUTO_CONTACT_LOOKUP_PREPARE_RETRY_MS = 500
  const AUTO_CONTACT_LOOKUP_MAX_PREPARE_RETRIES = 4
  const AUTOMATIC_ANALYSIS_DELAY_MS = 8000
  const CAPTURE_INGESTION_DELAY_MS = 1200
  const CAPTURE_INGESTION_MAX_RETRY_MS = 30000
  // Depois que uma captura é persistida com sucesso para a conversa aberta,
  // um pequeno debounce antes de rebuscar o contexto operacional do
  // cliente — coalesce múltiplas ingestões próximas (ex.: várias mensagens
  // chegando em sequência) numa única requisição, em vez de uma por
  // mensagem.
  const COMPANION_CLIENT_CONTEXT_REFRESH_DELAY_MS = 500
  // Campos puramente derivados do relógio (tempo de espera, risco de SLA)
  // precisam continuar corretos mesmo sem nenhuma mensagem nova chegar —
  // este intervalo só re-renderiza o painel com os dados já carregados
  // (recalculando localmente a partir de `generated_at`), sem nenhuma
  // chamada de rede nova.
  const COMPANION_CLIENT_CONTEXT_TICK_INTERVAL_MS = 60000
  const DISAPPEARED_MESSAGE_SCROLL_GUARD_MS = 2000
  const MAX_MESSAGE_LEDGER_SIZE = 300
  const MAX_ANALYSIS_MESSAGE_COUNT = 80
  const MAX_RETAINED_PRE_RESOLUTION_CAPTURES = 20

  const messageMutationTools =
    globalThis
      .YolenCompanionMessageMutations

  const captureBatchTools =
    globalThis
      .YolenCompanionCaptureBatch

  const leadEnrichmentTools =
    globalThis
      .YolenCompanionLeadEnrichment

  const clientContextViewTools =
    globalThis
      .YolenCompanionClientContextView

  const sellerInformationViewTools =
    globalThis
      .YolenCompanionSellerInformationView

  if (!messageMutationTools) {
    throw new Error(
      'Módulo de integridade das mensagens do Companion não carregado.',
    )
  }

  if (!captureBatchTools) {
    throw new Error(
      'Módulo de construção dos lotes de captura não carregado.',
    )
  }

  if (!clientContextViewTools) {
    throw new Error(
      'Módulo de inteligência operacional do cliente não carregado.',
    )
  }

  if (!sellerInformationViewTools) {
    throw new Error(
      'Módulo de arquitetura seller-facing do Companion não carregado.',
    )
  }

  let panelCollapsed = false
  let activeSellerArea = 'now'
  let lastAcknowledgedCollapsedAttentionKey = null
  let lastRenderedDeepAnalysisResultKey = null
  let sessionRefreshTimerId = 0
  let companionClientContextTickTimerId = 0
  let companionClientContextRefreshTimerId = 0
  let runtimeRecoveryTimerId = 0
  let runtimeRecoveryInFlight = false
  let lastResolvedConversationKey = null
  let lastResolvedContactLookupIdentity = null

  const leadResolutionInFlightKeys =
    new Set()
  let autoContactLookupInFlight = false
  let capturedAudioBlobEntries = []
  let automaticAnalysisTimerId = 0
  let automaticAnalysisScheduledKey = null
  let lastSelectedChatActivitySnapshot = null
  let messageLedgerConversationKey = null
  let messageWindowFloorTimestamp = null
  let conversationMessageLedger = new Map()
  let deletedMessageIds = new Set()
  let deletedMessageSnapshots = new Map()
  let pendingCaptureMutationIds =
    new Set()
  let lastVisibleMessageSnapshots =
    new Map()
  let lastConversationScrollAt = 0
  let messageLedgerRequiresRebase = false
  let messageLedgerMutationRevision = 0
  // Incrementado a cada análise (automática ou manual) iniciada, qualquer
  // que seja a conversa. Usado por analyzeCurrentConversation() para saber,
  // quando uma resposta assíncrona chega, se ela ainda é a mais recente —
  // sem isso, uma resposta antiga da MESMA conversa poderia vencer uma
  // resposta mais nova (ex.: duplo clique em "Analisar agora").
  let conversationAnalysisRequestSequence = 0
  // Timer do poller de análise profunda em curso (setTimeout id). Cada novo
  // ciclo de análise (analyzeCurrentConversation) cancela o timer anterior
  // antes de, no máximo, agendar um novo — nunca existem dois timers vivos
  // ao mesmo tempo.
  let deepAnalysisPollTimerId = 0
  const DEEP_ANALYSIS_POLL_DELAYS_MS = [1500, 2000, 3000, 4000, 5000]
  const DEEP_ANALYSIS_POLL_TIMEOUT_MS = 240000
  let captureIngestionTimerId = 0
  let captureIngestionInFlight = false
  let captureIngestionQueued = false
  let captureIngestionRetryAttempt = 0

  const autoLookupAttemptedKeys = new Set()
  const autoLookupPrepareRetryCounts = new Map()
  const cachedPhonesByConversationKey = new Map()
  const cachedPhonesByLookupIdentity = new Map()
  const lastIngestedCaptureKeys = new Map()

  const confirmedCaptureVersionsByConversation =
    new Map()

  const pendingCaptureIngestionPlans =
    new Map()

  const retainedPreResolutionCaptures =
    new Map()

  const registeredSuggestionShownTelemetryKeys =
    new Set()

  const ignoredLeadEnrichmentCandidateKeys =
    new Set()

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
    contactLookupIdentity: null,
    isSelfConversation: false,
    isGroupConversation: false,
    messageCount: 0,
    audioCount: 0,
    lastError: null,
    lastSessionSyncAt: null,
    leadResolutionLoading: false,
    leadResolution: null,
    leadResolutionError: null,
    companionClientContext: {
      status: 'idle',
    },
    companionClientContextCycleId: null,
    companionClientContextConversationKey: null,
    autoLookupStatus: null,
    conversationAnalysisLoading: false,
    conversationAnalysis: null,
    conversationAnalysisError: null,
    analyzedConversationFingerprint: null,
    automaticAnalysisStatus: null,
    deepAnalysisStatus: null,
    deepAnalysisResult: null,
    suggestionApplyLoading: false,
    suggestionApplyResult: null,
    suggestionApplyError: null,
    suggestedMessageCopyStatus: null,
    suggestedMessageLastRegisteredKey: null,
    pendingSuggestedMessageSend: null,
    pendingSuggestedMessageSendRegistering: false,
    lastAnalysisAudioCount: 0,
    audioTranscriptionLoading: false,
    audioTranscriptionStatus: null,
    audioTranscriptionsByKey: {},
    audioBridgeStatus: 'Aguardando bridge de áudio',
    capturedAudioBlobCount: 0,
    audioTranscriptionHistoryLoading: false,
    audioTranscriptionHistoryCycleId: null,
    leadEnrichmentApplyLoadingKey: null,
    leadEnrichmentApplySuccessKey: null,
    leadEnrichmentApplyError: null,
    preSendAssessment: null,
    preSendAssessmentConversationKey: null,
    preSendAssessmentFingerprint: null,
    preSendDraft: '',
    preSendGateOpen: false,
    preSendBypassKey: null,
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

  // renderPanel() substitui panel.innerHTML por completo a cada mudança de
  // estado (sessão, ingestão, ticks periódicos...). Sem isto, qualquer
  // <details> aberto pelo vendedor (grupos do CLIENTE, "ver mais contexto")
  // fecharia sozinho e a posição de leitura dentro do painel voltaria ao
  // topo a cada atualização em segundo plano.
  function getDetailsPreservationKey(details) {
    return (
      details.getAttribute(
        'data-yolen-client-intelligence-group',
      ) ||
      details.getAttribute(
        'data-yolen-preserve-details',
      ) ||
      null
    )
  }

  function getOpenDetailsPreservationKeys(
    panel,
  ) {
    return new Set(
      Array.from(
        panel.querySelectorAll(
          'details[open]',
        ),
      )
        .map(getDetailsPreservationKey)
        .filter(Boolean),
    )
  }

  function restoreOpenDetails(
    panel,
    keys,
  ) {
    if (!keys || keys.size === 0) {
      return
    }

    panel
      .querySelectorAll('details')
      .forEach((details) => {
        const key =
          getDetailsPreservationKey(
            details,
          )

        if (key && keys.has(key)) {
          details.open = true
        }
      })
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

  function getExtensionRuntime() {
    return globalThis.browser?.runtime || globalThis.chrome?.runtime || null
  }

  function injectWhatsAppAudioBridge() {
    const runtime = getExtensionRuntime()

    if (!runtime?.getURL) {
      return
    }

    if (document.getElementById('yolen-whatsapp-audio-bridge-script')) {
      return
    }

    const script = document.createElement('script')
    script.id = 'yolen-whatsapp-audio-bridge-script'
    script.src = runtime.getURL('src/whatsapp-audio-bridge.js')
    script.async = false

    script.onload = () => {
      script.remove()
    }

    document.documentElement.appendChild(script)
  }

  function rememberCapturedWhatsAppAudioBlob(audio) {
    const blob = audio?.blob

    if (!blob || typeof blob.arrayBuffer !== 'function' || !blob.size) {
      return
    }

    const existingIndex = capturedAudioBlobEntries.findIndex((entry) => {
      return entry.objectUrl && entry.objectUrl === audio.objectUrl
    })

    const nextEntry = {
      id: audio.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      blob,
      mimeType: audio.mimeType || blob.type || '',
      size: blob.size,
      objectUrl: audio.objectUrl || '',
      capturedAt: Number(audio.capturedAt) || Date.now(),
      captureRequestId: audio.captureRequestId || null,
      durationSeconds: null,
      assignedTargetKey: null,
    }

    if (existingIndex >= 0) {
      capturedAudioBlobEntries = capturedAudioBlobEntries.map((entry, index) => {
        return index === existingIndex
          ? {
              ...entry,
              ...nextEntry,
              assignedTargetKey: entry.assignedTargetKey || null,
            }
          : entry
      })
    } else {
      capturedAudioBlobEntries = [...capturedAudioBlobEntries, nextEntry].slice(-12)
    }

    state = {
      ...state,
      audioBridgeStatus: `Bridge ativo · ${capturedAudioBlobEntries.length} áudio(s) capturado(s)`,
      capturedAudioBlobCount: capturedAudioBlobEntries.length,
    }

    getBlobDurationSeconds(blob).then((durationSeconds) => {
      if (!Number.isFinite(durationSeconds)) {
        return
      }

      capturedAudioBlobEntries = capturedAudioBlobEntries.map((entry) => {
        return entry.id === nextEntry.id
          ? {
              ...entry,
              durationSeconds,
            }
          : entry
      })
    })

    renderPanel()
  }

  function listenToWhatsAppAudioBridge() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return
      }

      if (event.origin !== window.location.origin) {
        return
      }

      if (event.data?.source !== 'YOLEN_COMPANION_WHATSAPP_AUDIO_BRIDGE') {
        return
      }

      if (event.data?.action === 'BRIDGE_READY') {
        state = {
          ...state,
          audioBridgeStatus: 'Bridge de áudio ativo',
        }

        renderPanel()
        return
      }

      if (event.data?.action !== 'AUDIO_BLOB_CAPTURED') {
        return
      }

      rememberCapturedWhatsAppAudioBlob(event.data.audio)
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

  function getSelectedChatStableIdentity() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return ''
    }

    const directDataId =
      selectedElement.getAttribute?.('data-id') || ''

    const nestedDataId =
      selectedElement
        .querySelector?.('[data-id]')
        ?.getAttribute?.('data-id') || ''

    const dataId =
      directDataId || nestedDataId

    if (dataId) {
      return `data:${dataId}`
    }

    const avatarSource =
      selectedElement
        .querySelector?.('img[src]')
        ?.getAttribute?.('src') || ''

    if (avatarSource) {
      return `avatar:${avatarSource}`
    }

    const selectedTitle =
      getSelectedChatTitle()

    return selectedTitle
      ? `title:${selectedTitle}`
      : ''
  }

  function getConversationKey(title) {
    const safeTitle =
      String(title || '').trim()

    const stableIdentity =
      getSelectedChatStableIdentity()

    if (stableIdentity) {
      return `${safeTitle}::${stableIdentity}`
    }

    return safeTitle
  }

  function getAutomaticContactLookupIdentity(title) {
    return String(title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('pt-BR')
  }

  function getMainHeaderPrimaryTitle() {
    const header = getMainHeader()

    if (!header) {
      return null
    }

    const lines =
      String(
        header.innerText ||
        header.textContent ||
        '',
      )
        .split('\n')
        .map((value) =>
          value
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean)

    const primaryTitle =
      lines.find((value) => {
        return (
          !isIgnoredHeaderText(value) &&
          value.length < 120
        )
      })

    return primaryTitle || null
  }

  function isGroupConversationHeader() {
    const header = getMainHeader()

    if (!header) {
      return false
    }

    const ariaLabels =
      Array.from(
        header.querySelectorAll('[aria-label]'),
      )
        .map((element) =>
          String(
            element.getAttribute('aria-label') || '',
          )
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('pt-BR'),
        )
        .filter(Boolean)

    return ariaLabels.some((label) => {
      return (
        label.includes('em grupo') ||
        label.includes('group video call') ||
        label.includes('video call in group') ||
        label.includes('group voice call') ||
        label.includes('voice call in group') ||
        label === 'group call'
      )
    })
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

  function collectContactPhoneCandidate(
    candidates,
    element,
  ) {
    if (!element) {
      return
    }

    const title =
      element
        .getAttribute?.('title')
        ?.trim()

    const text =
      element
        .textContent
        ?.trim()

    if (
      title &&
      title.length < 140
    ) {
      candidates.push(title)
    }

    if (
      text &&
      text.length < 220
    ) {
      candidates.push(text)
    }
  }

  function findPhoneInContactCandidates(
    candidates,
  ) {
    for (
      const candidate of
      Array.from(new Set(candidates))
    ) {
      const phone =
        extractPhoneFromText(
          candidate,
        )

      if (phone) {
        return phone
      }
    }

    return null
  }

  function getContactPanelPhone() {
    const header =
      findContactInfoHeader()

    const panel =
      findContactInfoPanel()

    if (!header && !panel) {
      return null
    }

    const candidates = []

    if (panel) {
      panel
        .querySelectorAll(
          '[title], span, div, a',
        )
        .forEach((element) => {
          collectContactPhoneCandidate(
            candidates,
            element,
          )
        })
    }

    const panelPhone =
      findPhoneInContactCandidates(
        candidates,
      )

    if (panelPhone) {
      return panelPhone
    }

    if (!header) {
      return null
    }

    const headerRect =
      header.getBoundingClientRect()

    const companionPanel =
      document.getElementById(
        PANEL_ID,
      )

    const companionRect =
      companionPanel
        ?.getBoundingClientRect?.()

    const rightBoundary =
      companionRect &&
      companionRect.left >
        headerRect.left
        ? companionRect.left
        : window.innerWidth

    const bottomBoundary =
      Math.min(
        window.innerHeight,
        headerRect.bottom + 650,
      )

    document
      .querySelectorAll(
        '[title], span, div, a',
      )
      .forEach((element) => {
        if (
          element.closest?.(
            `#${PANEL_ID}`,
          ) ||
          !isVisibleDomElement(
            element,
          )
        ) {
          return
        }

        const rect =
          element
            .getBoundingClientRect()

        if (
          rect.left <
            headerRect.left - 24 ||
          rect.left >=
            rightBoundary ||
          rect.top <
            headerRect.bottom - 8 ||
          rect.top >
            bottomBoundary
        ) {
          return
        }

        collectContactPhoneCandidate(
          candidates,
          element,
        )
      })

    return findPhoneInContactCandidates(
      candidates,
    )
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
    const primaryHeaderTitle =
      getMainHeaderPrimaryTitle()

    if (primaryHeaderTitle) {
      return primaryHeaderTitle
    }

    const headerCandidates =
      getMainHeaderTextCandidates()

    const headerTitle =
      headerCandidates.find(
        (candidate) =>
          !isIgnoredHeaderText(candidate),
      )

    if (headerTitle) {
      return headerTitle
    }

    return getSelectedChatTitle() || null
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

    const lookupIdentity =
      getAutomaticContactLookupIdentity(title)

    const cachedPhoneByLookupIdentity =
      cachedPhonesByLookupIdentity.get(
        lookupIdentity,
      )

    if (cachedPhoneByLookupIdentity) {
      return {
        phone: cachedPhoneByLookupIdentity,
        source: 'Dados do contato automático',
      }
    }

    const cachedPhone =
      cachedPhonesByConversationKey.get(
        conversationKey,
      )

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
    return getAnalysisMessageBatch().length
  }

  function isVisibleDomElement(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return false
    }

    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0
    )
  }

  function getMessageContainer(element) {
    if (!element || typeof element.closest !== 'function') {
      return null
    }

    return (
      element.closest('[data-pre-plain-text]') ||
      element.closest('.message-in, .message-out') ||
      element.closest('[data-id]') ||
      element.closest('[role="row"]')
    )
  }

  function getMessageDataId(element) {
    const container =
      getMessageContainer(element)

    if (!container) {
      return null
    }

    const dataIdElement =
      container.matches?.('[data-id]')
        ? container
        : container.closest?.('[data-id]') ||
          container.querySelector?.('[data-id]')

    const dataId =
      dataIdElement
        ?.getAttribute?.('data-id')
        ?.trim()

    return dataId || null
  }

  function getMessagePrePlainText(element) {
    if (!element) {
      return ''
    }

    const source =
      element.matches?.(
        '[data-pre-plain-text]',
      )
        ? element
        : element.closest?.(
              '[data-pre-plain-text]',
            ) ||
          element.querySelector?.(
            '[data-pre-plain-text]',
          )

    return (
      source
        ?.getAttribute?.(
          'data-pre-plain-text',
        )
        ?.trim() || ''
    )
  }

  function parseWhatsAppMessageTimestamp(
    value,
  ) {
    const text =
      String(value || '').trim()

    const timeFirstMatch = text.match(
      /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*,\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/,
    )

    const dateFirstMatch = text.match(
      /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/,
    )

    let day
    let month
    let year
    let hour
    let minute
    let second

    if (timeFirstMatch) {
      hour = Number(timeFirstMatch[1])
      minute = Number(timeFirstMatch[2])
      second = Number(
        timeFirstMatch[3] || 0,
      )
      day = Number(timeFirstMatch[4])
      month = Number(timeFirstMatch[5])
      year = Number(timeFirstMatch[6])
    } else if (dateFirstMatch) {
      day = Number(dateFirstMatch[1])
      month = Number(dateFirstMatch[2])
      year = Number(dateFirstMatch[3])
      hour = Number(dateFirstMatch[4])
      minute = Number(dateFirstMatch[5])
      second = Number(
        dateFirstMatch[6] || 0,
      )
    } else {
      return null
    }

    if (year < 100) {
      year += 2000
    }

    const date = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      0,
    )

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      return null
    }

    return {
      timestampMs: date.getTime(),
      dateKey: [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('-'),
      timestampLabel: [
        `${String(day).padStart(2, '0')}/${String(
          month,
        ).padStart(2, '0')}/${year}`,
        `${String(hour).padStart(2, '0')}:${String(
          minute,
        ).padStart(2, '0')}`,
      ].join(' '),
    }
  }

  function getMessageSenderFromPrePlainText(
    value,
  ) {
    const text =
      String(value || '').trim()

    const bracketIndex =
      text.lastIndexOf(']')

    if (bracketIndex < 0) {
      return null
    }

    const sender = text
      .slice(bracketIndex + 1)
      .replace(/:\s*$/, '')
      .trim()

    return sender || null
  }

  function messageContainerHasAudio(
    container,
  ) {
    if (!container) {
      return false
    }

    return Boolean(
      container.querySelector(
        [
          'audio',
          '[data-icon="audio-download"]',
          '[data-icon="ptt"]',
          '[data-icon="audio-play"]',
          '[data-icon="audio-pip"]',
          'button[aria-label*="mensagem de voz" i]',
          'button[aria-label*="voice message" i]',
          'button[aria-label*="reproduzir áudio" i]',
          'button[aria-label*="play audio" i]',
        ].join(','),
      ),
    )
  }

  function getCapturedMessageBodyText(
    node,
  ) {
    const container =
      getMessageContainer(node) ||
      node

    const selector = [
      '[data-testid="selectable-text"]',
      'span.selectable-text.copyable-text',
    ].join(',')

    const elements = []

    if (node.matches?.(selector)) {
      elements.push(node)
    }

    container
      .querySelectorAll?.(selector)
      .forEach((element) => {
        elements.push(element)
      })

    const candidates =
      elements.map((element) => {
        const owner =
          element.closest?.(
            '[data-pre-plain-text]',
          )

        const belongsToAnotherMessage =
          owner &&
          owner !== node &&
          owner !== container

        const isQuoted = Boolean(
          element.closest?.(
            [
              '[data-testid*="quoted" i]',
              '[data-testid*="reply" i]',
              '[aria-label*="quoted" i]',
              '[aria-label*="mensagem citada" i]',
              '[aria-label*="resposta" i]',
            ].join(','),
          ),
        )

        return {
          text:
            belongsToAnotherMessage
              ? ''
              : messageMutationTools
                  .readCapturedElementText(
                    element,
                  ),
          isQuoted,
        }
      })

    return messageMutationTools
      .pickCapturedMessageText(
        candidates,
      )
  }

  function isDeletedMessageNode(node) {
    const container =
      getMessageContainer(node) ||
      node

    if (
      container.querySelector?.(
        '[data-icon*="revoke"]',
      )
    ) {
      return true
    }

    return messageMutationTools
      .isDeletedMessageText(
        container.textContent,
      )
  }

  function markMessageLedgerForRebase() {
    messageLedgerRequiresRebase =
      true

    messageLedgerMutationRevision +=
      1
  }

    function buildReliableMessageFromNode(
    node,
    observedAt,
  ) {
    const id = getMessageDataId(node)

    if (!id) {
      return null
    }

    const prePlainText =
      getMessagePrePlainText(node)

    const timestamp =
      parseWhatsAppMessageTimestamp(
        prePlainText,
      )

    if (!timestamp) {
      return null
    }

    const container =
      getMessageContainer(node)

    const hasAudio =
      messageContainerHasAudio(container)

      const text =
      getCapturedMessageBodyText(
        node,
      )

    if (!text && !hasAudio) {
      return null
    }

    return {
      id,
      timestampMs:
        timestamp.timestampMs,
      timestampLabel:
        timestamp.timestampLabel,
      dateKey: timestamp.dateKey,
      direction:
        isOutgoingMessageNode(
          container || node,
        )
          ? 'outgoing'
          : 'incoming',
      sender:
        getMessageSenderFromPrePlainText(
          prePlainText,
        ),
        text,
        hasAudio,
        observedAt,
      }
  }

  function buildDeletedMessageSnapshotFromNode(
    node,
    previousMessage = null,
    observedAt,
  ) {
    if (previousMessage) {
      return {
        ...previousMessage,
        observedAt,
      }
    }

    const id =
      getMessageDataId(node)

    const prePlainText =
      getMessagePrePlainText(node)

    const timestamp =
      parseWhatsAppMessageTimestamp(
        prePlainText,
      )

    if (!id || !timestamp) {
      return null
    }

    const container =
      getMessageContainer(node)

    return {
      id,
      timestampMs:
        timestamp.timestampMs,
      timestampLabel:
        timestamp.timestampLabel,
      dateKey:
        timestamp.dateKey,
      direction:
        isOutgoingMessageNode(
          container || node,
        )
          ? 'outgoing'
          : 'incoming',
      sender:
        getMessageSenderFromPrePlainText(
          prePlainText,
        ),
      text: '',
      hasAudio:
        messageContainerHasAudio(
          container,
        ),
      observedAt,
    }
  }

  function resetConversationMessageLedger(
    conversationKey,
  ) {
    messageLedgerConversationKey =
      conversationKey || null

    messageWindowFloorTimestamp = null
    conversationMessageLedger =
      new Map()
    deletedMessageIds =
      new Set()
    deletedMessageSnapshots =
      new Map()
    pendingCaptureMutationIds =
      new Set()
    lastVisibleMessageSnapshots =
      new Map()
    lastConversationScrollAt = 0
    messageLedgerRequiresRebase =
      false
    messageLedgerMutationRevision =
      0
  }

  function rememberPendingCaptureMutation(
    messageId,
  ) {
    const normalizedMessageId =
      String(messageId || '').trim()

    if (!normalizedMessageId) {
      return
    }

    pendingCaptureMutationIds.delete(
      normalizedMessageId,
    )

    pendingCaptureMutationIds.add(
      normalizedMessageId,
    )

    if (
      pendingCaptureMutationIds.size >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      const oldestMessageId =
        pendingCaptureMutationIds
          .values()
          .next()
          .value

      if (oldestMessageId) {
        pendingCaptureMutationIds.delete(
          oldestMessageId,
        )
      }
    }
  }

  function synchronizeConversationMessageLedger() {
    const conversationKey =
      state.conversationKey

    if (!conversationKey) {
      return false
    }

    if (
      messageLedgerConversationKey !==
      conversationKey
    ) {
      resetConversationMessageLedger(
        conversationKey,
      )
    }

    const main =
      getMainConversationRoot()

      if (!main) {
        return false
      }

      const observedAt =
        new Date().toISOString()

      let detectedMessageMutation =
        false

      const previousVisibleMessages =
        Array.from(
          lastVisibleMessageSnapshots
            .values(),
        )

      const currentVisibleMessageSnapshots =
        new Map()

      const recentConversationScroll =
        (
          Date.now() -
          lastConversationScrollAt
        ) <
        DISAPPEARED_MESSAGE_SCROLL_GUARD_MS

    main
      .querySelectorAll(
        '[data-pre-plain-text]',
      )
      .forEach((node) => {
        const messageId =
          getMessageDataId(node)

        if (!messageId) {
          return
        }

        if (isDeletedMessageNode(node)) {
          const messageWasAlreadyDeleted =
            deletedMessageIds.has(
              messageId,
            )

          const previousMessage =
            conversationMessageLedger.get(
              messageId,
            )

          const previousDeletedSnapshot =
            deletedMessageSnapshots.get(
              messageId,
            )

          const deletedSnapshot =
            messageWasAlreadyDeleted &&
            previousDeletedSnapshot
              ? previousDeletedSnapshot
              : buildDeletedMessageSnapshotFromNode(
                  node,
                  previousMessage,
                  observedAt,
                )

          conversationMessageLedger.delete(
            messageId,
          )

          if (deletedSnapshot) {
            deletedMessageSnapshots.set(
              messageId,
              deletedSnapshot,
            )
          }

          if (!messageWasAlreadyDeleted) {
            deletedMessageIds.add(
              messageId,
            )

            rememberPendingCaptureMutation(
              messageId,
            )

            detectedMessageMutation =
              true
          }

          return
        }

        const message =
          buildReliableMessageFromNode(
            node,
            observedAt,
          )

        if (!message) {
          return
        }

        const currentMessage =
          conversationMessageLedger.get(
            message.id,
          )

        const messageWasDeleted =
          deletedMessageIds.delete(
            message.id,
          )

        const messageChanged =
          Boolean(
            currentMessage &&
            !messageMutationTools
              .areCapturedMessagesEqual(
                currentMessage,
                message,
              ),
          )

        deletedMessageSnapshots.delete(
          message.id,
        )

        if (
          messageWasDeleted ||
          messageChanged
        ) {
          rememberPendingCaptureMutation(
            message.id,
          )

          detectedMessageMutation =
            true
        }

        const messageToStore =
          currentMessage &&
          !messageWasDeleted &&
          !messageChanged
            ? {
                ...message,
                observedAt:
                  currentMessage.observedAt,
              }
            : message

        conversationMessageLedger.set(
          message.id,
          messageToStore,
        )

        currentVisibleMessageSnapshots.set(
          message.id,
          messageToStore,
        )
      })

    const safelyDisappearedMessageIds =
      messageMutationTools
        .findSafeDisappearedMessageIds({
          previousVisibleMessages,
          currentVisibleMessages:
            Array.from(
              currentVisibleMessageSnapshots
                .values(),
            ),
          recentScroll:
            recentConversationScroll,
        })

    safelyDisappearedMessageIds
      .forEach((messageId) => {
        if (
          deletedMessageIds.has(
            messageId,
          )
        ) {
          return
        }

        const previousMessage =
          conversationMessageLedger.get(
            messageId,
          ) ||
          lastVisibleMessageSnapshots.get(
            messageId,
          )

        if (!previousMessage) {
          return
        }

        conversationMessageLedger.delete(
          messageId,
        )

        deletedMessageIds.add(
          messageId,
        )

        deletedMessageSnapshots.set(
          messageId,
          {
            ...previousMessage,
            observedAt,
          },
        )

        rememberPendingCaptureMutation(
          messageId,
        )

        detectedMessageMutation =
          true
      })

    lastVisibleMessageSnapshots =
      currentVisibleMessageSnapshots

    const sortedMessages =
      Array.from(
        conversationMessageLedger.values(),
      ).sort((a, b) => {
        if (
          a.timestampMs !==
          b.timestampMs
        ) {
          return (
            a.timestampMs -
            b.timestampMs
          )
        }

        return a.id.localeCompare(b.id)
      })

    if (
      sortedMessages.length >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      const retainedMessages =
        sortedMessages.slice(
          -MAX_MESSAGE_LEDGER_SIZE,
        )

      conversationMessageLedger =
        new Map(
          retainedMessages.map(
            (message) => [
              message.id,
              message,
            ],
          ),
        )
    }

    if (
      deletedMessageSnapshots.size >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      const retainedSnapshots =
        Array.from(
          deletedMessageSnapshots.values(),
        )
          .sort((first, second) => {
            if (
              first.timestampMs !==
              second.timestampMs
            ) {
              return (
                first.timestampMs -
                second.timestampMs
              )
            }

            return first.id.localeCompare(
              second.id,
            )
          })
          .slice(
            -MAX_MESSAGE_LEDGER_SIZE,
          )

      deletedMessageSnapshots =
        new Map(
          retainedSnapshots.map(
            (message) => [
              message.id,
              message,
            ],
          ),
        )
    }

    if (
      deletedMessageIds.size >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      deletedMessageIds =
        new Set(
          Array.from(
            deletedMessageIds,
          ).slice(
            -MAX_MESSAGE_LEDGER_SIZE,
          ),
        )
    }

    if (detectedMessageMutation) {
      markMessageLedgerForRebase()
    }

    return detectedMessageMutation
  }

  function getSortedLedgerMessages() {
    synchronizeConversationMessageLedger()

    return Array.from(
      conversationMessageLedger.values(),
    ).sort((a, b) => {
      if (
        a.timestampMs !== b.timestampMs
      ) {
        return (
          a.timestampMs -
          b.timestampMs
        )
      }

      return a.id.localeCompare(b.id)
    })
  }

  function getLatestDateMessageBlock(
    messages,
  ) {
    return messageMutationTools
      .getLatestDateMessageBlock(
        messages,
        MAX_ANALYSIS_MESSAGE_COUNT,
      )
  }

  function lockCurrentMessageWindow() {
    if (
      Number.isFinite(
        messageWindowFloorTimestamp,
      )
    ) {
      return
    }

    const messages =
      getLatestDateMessageBlock(
        getSortedLedgerMessages(),
      )

    if (messages.length === 0) {
      return
    }

    messageWindowFloorTimestamp =
      messages[0].timestampMs
  }

  function getAnalysisMessageBatch() {
    const messages =
      getSortedLedgerMessages()

    if (messages.length === 0) {
      return []
    }

    if (
      Number.isFinite(
        messageWindowFloorTimestamp,
      )
    ) {
      return messages
        .filter(
          (message) =>
            message.timestampMs >=
            messageWindowFloorTimestamp,
        )
        .slice(
          -MAX_ANALYSIS_MESSAGE_COUNT,
        )
    }

    return getLatestDateMessageBlock(
      messages,
    )
  }

  function getMessageTranscription(
    messageId,
    transcriptionMap = null,
  ) {
    const transcriptions =
      transcriptionMap ||
      state.audioTranscriptionsByKey ||
      {}

    const entry = Object.values(
      transcriptions,
    ).find((transcription) => {
      return (
        transcription?.targetKey ===
        messageId
      )
    })

    return (
      typeof entry?.text === 'string' &&
      entry.text.trim()
        ? entry.text.trim()
        : null
    )
  }

  function getStructuredMessagesForAnalysis(
    transcriptionMap = null,
  ) {
    return getAnalysisMessageBatch().map(
      (message) => {
        return {
          id: message.id,
          timestamp_ms:
            message.timestampMs,
          timestamp_label:
            message.timestampLabel,
          date_key: message.dateKey,
          direction:
            message.direction,
          sender: message.sender,
          text:
            messageMutationTools
              .prepareCapturedMessageTextForAnalysis(
                message.text,
              ),
          has_audio:
            message.hasAudio,
          audio_transcription:
            getMessageTranscription(
              message.id,
              transcriptionMap,
            ),
        }
      },
    )

  }

  function getStructuredMessagesForEnrichment(
    transcriptionMap = null,
  ) {
    return getSortedLedgerMessages()
      .slice(
        -MAX_MESSAGE_LEDGER_SIZE,
      )
      .map((message) => {
        return {
          id: message.id,
          timestamp_ms:
            message.timestampMs,
          timestamp_label:
            message.timestampLabel,
          date_key: message.dateKey,
          direction:
            message.direction,
          sender: message.sender,
          text:
            messageMutationTools
              .prepareCapturedMessageTextForAnalysis(
                message.text,
              ),
          has_audio:
            message.hasAudio,
          audio_transcription:
            getMessageTranscription(
              message.id,
              transcriptionMap,
            ),
        }
      })
  }

  function clearCaptureIngestionTimer() {
    if (captureIngestionTimerId) {
      window.clearTimeout(
        captureIngestionTimerId,
      )
    }

    captureIngestionTimerId = 0
  }

  function getCaptureConversationKey() {
    const canonicalPhone =
      state.leadResolution?.phone ||
      state.leadResolution?.lead?.phone ||
      state.conversationPhone

    return messageMutationTools
      .buildStableCaptureConversationKey({
        phone:
          canonicalPhone,
        title:
          state.conversationTitle,
      })
  }

  function canIngestCurrentCapture() {
    const resolutionIsEligible =
      captureBatchTools
        .isCaptureResolutionEligible(
          state.leadResolution,
        )

    return Boolean(
      state.connected &&
      !state.isSelfConversation &&
      getCaptureConversationKey() &&
      resolutionIsEligible &&
      window.YolenCompanionApi
        ?.ingestCapturedMessages,
    )
  }

  function getCurrentCaptureWindow() {
    const activeMessages =
      getSortedLedgerMessages()

    const deletedMessages =
      Array.from(
        deletedMessageSnapshots.values(),
      )

    return captureBatchTools
      .selectCaptureWindow({
        activeMessages,
        deletedMessages,
        pendingMutationKeys:
          pendingCaptureMutationIds,
      })
  }

  function cloneCaptureTranscriptions(
    transcriptionsByKey,
  ) {
    return Object.fromEntries(
      Object.entries(
        transcriptionsByKey || {},
      ).map(([key, value]) => {
        return [
          key,
          value &&
          typeof value === 'object'
            ? {
                ...value,
              }
            : value,
        ]
      }),
    )
  }

  function getConfirmedCaptureVersions(
    conversationKey,
  ) {
    const versions =
      confirmedCaptureVersionsByConversation
        .get(conversationKey)

    return versions
      ? Object.fromEntries(
          versions.entries(),
        )
      : {}
  }

  function rememberConfirmedCaptureVersions(
    conversationKey,
    messageResults,
  ) {
    if (
      !conversationKey ||
      !Array.isArray(messageResults)
    ) {
      return false
    }

    let versions =
      confirmedCaptureVersionsByConversation
        .get(conversationKey)

    if (!versions) {
      versions = new Map()

      confirmedCaptureVersionsByConversation
        .set(
          conversationKey,
          versions,
        )
    }

    let hasConflict = false

    messageResults.forEach((result) => {
      const messageKey =
        typeof result?.message_key === 'string'
          ? result.message_key.trim()
          : ''

      const canonicalVersion =
        typeof result
          ?.canonical_version === 'string'
          ? result.canonical_version.trim()
          : ''

      if (result?.synced !== true) {
        hasConflict = true
        return
      }

      if (
        !messageKey ||
        !/^[1-9][0-9]*$/.test(
          canonicalVersion,
        )
      ) {
        return
      }

      versions.set(
        messageKey,
        canonicalVersion,
      )
    })

    if (
      confirmedCaptureVersionsByConversation
        .size > 100
    ) {
      const oldestConversationKey =
        confirmedCaptureVersionsByConversation
          .keys()
          .next()
          .value

      if (oldestConversationKey) {
        confirmedCaptureVersionsByConversation
          .delete(oldestConversationKey)
      }
    }

    return hasConflict
  }

  function rememberCurrentPreResolutionCapture() {
    const conversationKey =
      state.conversationKey

    const captureConversationKey =
      getCaptureConversationKey()

    const resolutionIsEligible =
      captureBatchTools
        .isCaptureResolutionEligible(
          state.leadResolution,
        )

    if (
      !conversationKey ||
      !captureConversationKey ||
      resolutionIsEligible
    ) {
      return
    }

    const activeMessages =
      Array.from(
        conversationMessageLedger.values(),
      ).map((message) => {
        return {
          ...message,
        }
      })

    const deletedMessages =
      Array.from(
        deletedMessageSnapshots.values(),
      ).map((message) => {
        return {
          ...message,
        }
      })

    if (
      activeMessages.length === 0 &&
      deletedMessages.length === 0
    ) {
      return
    }

    retainedPreResolutionCaptures.delete(
      conversationKey,
    )

    retainedPreResolutionCaptures.set(
      conversationKey,
      {
        conversationKey,
        captureConversationKey,
        activeMessages,
        deletedMessages,
        pendingMutationKeys:
          Array.from(
            pendingCaptureMutationIds,
          ),
        transcriptionsByKey:
          cloneCaptureTranscriptions(
            state.audioTranscriptionsByKey,
          ),
      },
    )

    if (
      retainedPreResolutionCaptures.size >
      MAX_RETAINED_PRE_RESOLUTION_CAPTURES
    ) {
      const oldestConversationKey =
        retainedPreResolutionCaptures
          .keys()
          .next()
          .value

      if (oldestConversationKey) {
        retainedPreResolutionCaptures.delete(
          oldestConversationKey,
        )
      }
    }
  }

  function enqueueRetainedPreResolutionCapture(
    conversationKey,
    resolution,
  ) {
    const snapshot =
      retainedPreResolutionCaptures.get(
        conversationKey,
      )

    if (!snapshot) {
      return false
    }

    const resolutionIsEligible =
      captureBatchTools
        .isCaptureResolutionEligible(
          resolution,
        )

    const cycleId =
      resolution?.cycle?.id

    if (
      !resolutionIsEligible ||
      !cycleId
    ) {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    const captureWindow =
      captureBatchTools
        .selectCaptureWindow({
          activeMessages:
            snapshot.activeMessages,
          deletedMessages:
            snapshot.deletedMessages,
          pendingMutationKeys:
            snapshot.pendingMutationKeys,
        })

    let plan

    try {
      plan =
        captureBatchTools
          .buildCaptureIngestionPlan({
            cycleId,
            conversationKey:
              snapshot.captureConversationKey,
            activeMessages:
              captureWindow.activeMessages,
            deletedMessages:
              captureWindow.deletedMessages,
            transcriptionsByKey:
              snapshot.transcriptionsByKey,
            baseVersionsByMessageKey:
              getConfirmedCaptureVersions(
                snapshot.captureConversationKey,
              ),
          })
    } catch {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    if (
      !plan ||
      plan.messages.length === 0
    ) {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    const capturedMessageKeys =
      new Set(
        plan.messages.map((message) => {
          return message.message_key
        }),
      )

    const pendingMutationKeys =
      snapshot.pendingMutationKeys.filter(
        (messageId) => {
          return capturedMessageKeys.has(
            messageId,
          )
        },
      )

    const contextKey = [
      cycleId,
      snapshot.captureConversationKey,
    ].join('::')

    if (
      lastIngestedCaptureKeys.get(
        contextKey,
      ) === plan.snapshotKey
    ) {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    pendingCaptureIngestionPlans.set(
      contextKey,
      {
        ...plan,
        contextKey,
        pendingMutationKeys,
      },
    )

    retainedPreResolutionCaptures.delete(
      conversationKey,
    )

    schedulePendingCaptureIngestion(
      CAPTURE_INGESTION_DELAY_MS,
    )

    return true
  }

  function buildCurrentCapturePlan() {
    const cycleId =
      state.leadResolution?.cycle?.id

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      return null
    }

    const captureWindow =
      getCurrentCaptureWindow()

    const plan =
      captureBatchTools
      .buildCaptureIngestionPlan({
        cycleId,
        conversationKey,
        activeMessages:
          captureWindow.activeMessages,
          deletedMessages:
            captureWindow.deletedMessages,
          transcriptionsByKey:
            state.audioTranscriptionsByKey ||
            {},
          baseVersionsByMessageKey:
            getConfirmedCaptureVersions(
              conversationKey,
            ),
        })

        const capturedMessageKeys =
        new Set(
          plan.messages.map(
            (message) =>
              message.message_key,
          ),
        )

      const pendingMutationKeys =
        Array.from(
          pendingCaptureMutationIds,
        ).filter((messageId) => {
          return capturedMessageKeys.has(
            messageId,
          )
        })

      return {
        ...plan,
        contextKey: [
          cycleId,
          conversationKey,
        ].join('::'),
        pendingMutationKeys,
      }
  }

  function rememberSuccessfulCapture(
    contextKey,
    snapshotKey,
  ) {
    lastIngestedCaptureKeys.set(
      contextKey,
      snapshotKey,
    )

    if (
      lastIngestedCaptureKeys.size >
      100
    ) {
      const oldestKey =
        lastIngestedCaptureKeys
          .keys()
          .next()
          .value

      if (oldestKey) {
        lastIngestedCaptureKeys.delete(
          oldestKey,
        )
      }
    }
  }

  function forgetPendingCapturePlan(
    contextKey,
    snapshotKey,
  ) {
    const currentPlan =
      pendingCaptureIngestionPlans.get(
        contextKey,
      )

    if (
      currentPlan?.snapshotKey ===
      snapshotKey
    ) {
      pendingCaptureIngestionPlans.delete(
        contextKey,
      )
    }
  }

  function forgetCapturedMutationKeys(
    contextKey,
    plan,
  ) {
    const currentPlan =
      pendingCaptureIngestionPlans.get(
        contextKey,
      )

    if (
      currentPlan?.snapshotKey !==
        plan.snapshotKey ||
      currentPlan?.observedAt !==
        plan.observedAt
    ) {
      return
    }

    const currentCycleId =
      state.leadResolution?.cycle?.id

    const currentConversationKey =
      getCaptureConversationKey()

    const currentContextKey =
      currentCycleId &&
      currentConversationKey
        ? [
            currentCycleId,
            currentConversationKey,
          ].join('::')
        : null

    if (
      currentContextKey !== contextKey ||
      !Array.isArray(
        plan.pendingMutationKeys,
      )
    ) {
      return
    }

    plan.pendingMutationKeys.forEach(
      (messageId) => {
        pendingCaptureMutationIds.delete(
          messageId,
        )
      },
    )
  }

  async function runCaptureIngestion() {
    clearCaptureIngestionTimer()

    if (captureIngestionInFlight) {
      captureIngestionQueued = true
      return
    }

    const pendingEntries =
      Array.from(
        pendingCaptureIngestionPlans
          .entries(),
      )

    if (pendingEntries.length === 0) {
      return
    }

    captureIngestionInFlight = true

    let retryDelay = null

    try {
      for (
        const [
          contextKey,
          plan,
        ] of pendingEntries
      ) {
        if (
          lastIngestedCaptureKeys.get(
            contextKey,
          ) === plan.snapshotKey
        ) {
          forgetPendingCapturePlan(
            contextKey,
            plan.snapshotKey,
          )

          continue
        }

        try {
          let planHasConflict = false

          for (
            const payload of
            plan.batches
          ) {
            const result =
              await window
                .YolenCompanionApi
                .ingestCapturedMessages(
                  payload,
                )

            if (
              !result?.ok ||
              !result.payload?.ok
            ) {
              const statusCode =
                Number(
                  result?.statusCode || 0,
                )

              const requestError =
                new Error(
                  result?.payload?.error ||
                    'Não foi possível persistir a captura na Yolen.',
                )

              requestError.retryable =
                statusCode === 0 ||
                statusCode === 401 ||
                statusCode >= 500

              throw requestError
            }

            const responseHasConflict =
              rememberConfirmedCaptureVersions(
                payload.conversation_key,
                result.payload
                  .message_results,
              )

            if (responseHasConflict) {
              planHasConflict = true
            }
          }

          if (planHasConflict) {
            forgetPendingCapturePlan(
              contextKey,
              plan.snapshotKey,
            )

            continue
          }

          forgetCapturedMutationKeys(
            contextKey,
            plan,
          )

          rememberSuccessfulCapture(
            contextKey,
            plan.snapshotKey,
          )

          notifyCaptureIngestedForClientContext(
            contextKey,
          )

          forgetPendingCapturePlan(
            contextKey,
            plan.snapshotKey,
          )
        } catch (error) {
          if (
            error?.retryable === true
          ) {
            captureIngestionRetryAttempt +=
              1

            retryDelay = Math.min(
              CAPTURE_INGESTION_MAX_RETRY_MS,
              1000 *
                2 **
                  Math.min(
                    captureIngestionRetryAttempt,
                    5,
                  ),
            )
          } else {
            forgetPendingCapturePlan(
              contextKey,
              plan.snapshotKey,
            )
          }
        }
      }

      if (
        pendingCaptureIngestionPlans
          .size === 0
      ) {
        captureIngestionRetryAttempt =
          0
      }
    } finally {
      captureIngestionInFlight = false

      if (captureIngestionQueued) {
        captureIngestionQueued = false

        schedulePendingCaptureIngestion(
          250,
        )
      } else if (
        retryDelay !== null &&
        pendingCaptureIngestionPlans
          .size > 0
      ) {
        schedulePendingCaptureIngestion(
          retryDelay,
        )
      }
    }
  }

  function schedulePendingCaptureIngestion(
    delayMs,
  ) {
    clearCaptureIngestionTimer()

    if (
      pendingCaptureIngestionPlans
        .size === 0
    ) {
      return
    }

    if (captureIngestionInFlight) {
      captureIngestionQueued = true
      return
    }

    captureIngestionTimerId =
      window.setTimeout(() => {
        runCaptureIngestion()
      }, delayMs)
  }

  function scheduleCaptureIngestion(
    delayMs =
      CAPTURE_INGESTION_DELAY_MS,
  ) {
    if (!canIngestCurrentCapture()) {
      return
    }

    let plan

    try {
      plan =
        buildCurrentCapturePlan()
    } catch {
      return
    }

    if (
      !plan ||
      !plan.contextKey ||
      plan.messages.length === 0
    ) {
      return
    }

    if (
      lastIngestedCaptureKeys.get(
        plan.contextKey,
      ) === plan.snapshotKey
    ) {
      return
    }

    pendingCaptureIngestionPlans.set(
      plan.contextKey,
      plan,
    )

    schedulePendingCaptureIngestion(
      delayMs,
    )
  }

  function buildConversationTextFromMessages(
    messages,
  ) {
    return messages
      .map((message) => {
        const actor =
          message.direction ===
          'outgoing'
            ? 'Vendedor'
            : 'Lead'

        const parts = []

        if (message.text) {
          parts.push(message.text)
        }

        if (
          message.audio_transcription
        ) {
          parts.push(
            `[Áudio transcrito: ${message.audio_transcription}]`,
          )
        } else if (message.has_audio) {
          parts.push(
            '[Áudio ainda sem transcrição]',
          )
        }

        if (parts.length === 0) {
          return null
        }

        return `[${message.timestamp_label}] ${actor}: ${parts.join(
          ' ',
        )}`
      })
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(0, 24000)
  }

  function getAnalysisMessageIdSet() {
    return new Set(
      getAnalysisMessageBatch().map(
        (message) => message.id,
      ),
    )
  }

  function isRealAudioElement(element) {
    if (!isVisibleDomElement(element)) {
      return false
    }

    if (element.closest(`#${PANEL_ID}`)) {
      return false
    }

    const messageContainer = getMessageContainer(element)

    if (!messageContainer || !isVisibleDomElement(messageContainer)) {
      return false
    }

    const text = normalizeMessageText(
      [
        element.getAttribute?.('aria-label') || '',
        element.getAttribute?.('title') || '',
        element.textContent || '',
        messageContainer.getAttribute?.('aria-label') || '',
        messageContainer.textContent || '',
      ].join(' '),
    ).toLowerCase()

    const icon = element.getAttribute?.('data-icon') || ''

    if (
      icon === 'audio-download' ||
      icon === 'ptt' ||
      icon === 'audio-play' ||
      icon === 'audio-pip'
    ) {
      return true
    }

    if (element.tagName?.toLowerCase() === 'audio') {
      return true
    }

    return (
      text.includes('mensagem de voz') ||
      text.includes('voice message') ||
      text.includes('reproduzir áudio') ||
      text.includes('play audio')
    )
  }

  function getAudioTargetDurationSeconds(container) {
    const messageRoot =
      container.closest?.('.message-in, .message-out, [data-id], [role="row"]') ||
      container

    const text = normalizeMessageText(messageRoot?.textContent)
    const matches = Array.from(text.matchAll(/\b(\d{1,2}):(\d{2})\b/g))

    const durations = matches
      .map((match) => {
        const minutes = Number(match[1])
        const seconds = Number(match[2])

        if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) {
          return null
        }

        return minutes * 60 + seconds
      })
      .filter((value) => Number.isFinite(value) && value > 0)

    return durations.length > 0 ? Math.min(...durations) : null
  }

  function getAudioTargetKey(container, index) {
    const dataId =
      container.closest?.('[data-id]')?.getAttribute?.('data-id') || ''

    if (dataId) {
      return dataId
    }

    const prePlainText =
      container.getAttribute?.('data-pre-plain-text') ||
      container.querySelector?.('[data-pre-plain-text]')?.getAttribute?.(
        'data-pre-plain-text',
      ) ||
      ''

    const durationSeconds = getAudioTargetDurationSeconds(container)

    return [
      normalizeMessageText(prePlainText) || 'sem-horario',
      durationSeconds ?? 'sem-duracao',
      index,
    ].join('::')
  }

  function getVisibleAudioTargets() {
    const main = getMainConversationRoot()

    if (!main) {
      return []
    }

    const audioSelectors = [
      'audio',
      '[data-icon="audio-download"]',
      '[data-icon="ptt"]',
      '[data-icon="audio-play"]',
      '[data-icon="audio-pip"]',
      'button[aria-label*="mensagem de voz" i]',
      'button[aria-label*="voice message" i]',
      'button[aria-label*="reproduzir áudio" i]',
      'button[aria-label*="play audio" i]',
      '[role="button"][aria-label*="mensagem de voz" i]',
      '[role="button"][aria-label*="voice message" i]',
      '[role="button"][aria-label*="reproduzir áudio" i]',
      '[role="button"][aria-label*="play audio" i]',
    ]

    const detectedMessageContainers = new Map()

    main.querySelectorAll(audioSelectors.join(',')).forEach((element) => {
      if (!isRealAudioElement(element)) {
        return
      }

      const messageContainer = getMessageContainer(element)

      if (!messageContainer || detectedMessageContainers.has(messageContainer)) {
        return
      }

      const index = detectedMessageContainers.size

      detectedMessageContainers.set(messageContainer, {
        index,
        key: getAudioTargetKey(messageContainer, index),
        durationSeconds: getAudioTargetDurationSeconds(messageContainer),
        container: messageContainer,
        element,
      })
    })

    return Array.from(detectedMessageContainers.values())
  }

  function getRelevantVisibleAudioTargets() {
    const messageIds =
      getAnalysisMessageIdSet()

    return getVisibleAudioTargets().filter(
      (target) => {
        return messageIds.has(
          target.key,
        )
      },
    )
  }

  function getVisibleAudioCount() {
    return getAnalysisMessageBatch()
      .filter(
        (message) =>
          message.hasAudio,
      )
      .length
  }

  function normalizeMessageText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u200e/g, '')
      .trim()
  }


  function getAudioTranscriptionKey(target) {
    const targetKey =
      target && typeof target === 'object' && target.key
        ? target.key
        : `legacy-${String(target ?? 0)}`

    return `${state.conversationKey || 'sem-conversa'}::audio::${encodeURIComponent(
      targetKey,
    )}`
  }

  function getPendingAudioCountForCurrentConversation(
    transcriptionMap = null,
  ) {
    return getAnalysisMessageBatch()
      .filter((message) => {
        return (
          message.hasAudio &&
          !getMessageTranscription(
            message.id,
            transcriptionMap,
          )
        )
      })
      .length
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        const result = String(reader.result || '')
        resolve(result.includes(',') ? result.split(',').pop() : result)
      }

      reader.onerror = () => {
        reject(new Error('Não foi possível ler o arquivo de áudio.'))
      }

      reader.readAsDataURL(blob)
    })
  }

  function isValidCapturedAudioBlobEntry(entry) {
    return (
      entry &&
      entry.blob &&
      entry.blob.size > 100 &&
      entry.blob.size <= 15 * 1024 * 1024
    )
  }

  function isAudioOnlyCapturedEntry(entry) {
    if (!isValidCapturedAudioBlobEntry(entry)) {
      return false
    }

    const mimeType = String(
      entry.mimeType || entry.blob?.type || '',
    ).toLowerCase()

    return (
      mimeType.startsWith('audio/') ||
      mimeType === 'application/octet-stream' ||
      mimeType === ''
    )
  }

  function getBlobDurationSeconds(blob) {
    return new Promise((resolve) => {
      if (!blob?.size) {
        resolve(null)
        return
      }

      const objectUrl = URL.createObjectURL(blob)
      const audio = document.createElement('audio')
      let finished = false

      const finish = (value) => {
        if (finished) {
          return
        }

        finished = true
        window.clearTimeout(timeoutId)
        audio.removeAttribute('src')
        URL.revokeObjectURL(objectUrl)
        resolve(Number.isFinite(value) ? value : null)
      }

      const timeoutId = window.setTimeout(() => {
        finish(null)
      }, 3000)

      audio.preload = 'metadata'

      audio.addEventListener(
        'loadedmetadata',
        () => {
          finish(audio.duration)
        },
        {
          once: true,
        },
      )

      audio.addEventListener(
        'error',
        () => {
          finish(null)
        },
        {
          once: true,
        },
      )

      audio.src = objectUrl
    })
  }

  async function ensureCapturedEntryDuration(entry) {
    if (Number.isFinite(entry.durationSeconds)) {
      return entry.durationSeconds
    }

    const durationSeconds = await getBlobDurationSeconds(entry.blob)

    capturedAudioBlobEntries = capturedAudioBlobEntries.map((currentEntry) => {
      return currentEntry.id === entry.id
        ? {
            ...currentEntry,
            durationSeconds,
          }
        : currentEntry
    })

    return durationSeconds
  }

  async function findBestCapturedAudioEntryForTarget(
    target,
    captureRequestId = null,
  ) {
    const candidates = capturedAudioBlobEntries.filter((entry) => {
      if (!isAudioOnlyCapturedEntry(entry)) {
        return false
      }

      if (
        entry.assignedTargetKey &&
        entry.assignedTargetKey !== target.key
      ) {
        return false
      }

      if (
        captureRequestId &&
        entry.captureRequestId !== captureRequestId
      ) {
        return false
      }

      return true
    })

    if (candidates.length === 0) {
      return null
    }

    if (Number.isFinite(target.durationSeconds)) {
      const candidatesWithDistance = await Promise.all(
        candidates.map(async (entry) => {
          const durationSeconds = await ensureCapturedEntryDuration(entry)

          return {
            entry,
            distance: Number.isFinite(durationSeconds)
              ? Math.abs(durationSeconds - target.durationSeconds)
              : Number.POSITIVE_INFINITY,
          }
        }),
      )

      const matchingCandidates = candidatesWithDistance
        .filter((candidate) => candidate.distance <= 2)
        .sort((a, b) => {
          if (a.distance !== b.distance) {
            return a.distance - b.distance
          }

          return b.entry.capturedAt - a.entry.capturedAt
        })

      if (matchingCandidates.length > 0) {
        return matchingCandidates[0].entry
      }
    }

    return candidates.length === 1 ? candidates[0] : null
  }

  function assignCapturedAudioEntryToTarget(entry, target) {
    capturedAudioBlobEntries = capturedAudioBlobEntries.map((currentEntry) => {
      return currentEntry.id === entry.id
        ? {
            ...currentEntry,
            assignedTargetKey: target.key,
          }
        : currentEntry
    })

    return capturedAudioBlobEntries.find((currentEntry) => {
      return currentEntry.id === entry.id
    }) || entry
  }

  function buildBlobFromCapturedEntry(entry) {
    return new Blob([entry.blob], {
      type: entry.mimeType || entry.blob.type || 'audio/webm',
    })
  }

  function getAudioSourceFromTarget(target) {
    const audioElement =
      target.element?.tagName?.toLowerCase() === 'audio'
        ? target.element
        : target.container.querySelector('audio')

    if (audioElement?.currentSrc || audioElement?.src) {
      return {
        source: audioElement.currentSrc || audioElement.src,
        mimeType: audioElement.getAttribute('type') || '',
      }
    }

    const sourceElement = target.container.querySelector(
      'audio source[src], source[type^="audio/"][src]',
    )

    if (sourceElement?.src || sourceElement?.getAttribute?.('src')) {
      return {
        source: sourceElement.src || sourceElement.getAttribute('src') || '',
        mimeType: sourceElement.getAttribute('type') || '',
      }
    }

    return {
      source: '',
      mimeType: '',
    }
  }

  function clickAudioTarget(target) {
    const button =
      target.element?.closest?.('button,[role="button"]') ||
      target.container.querySelector('button[aria-label*="reproduzir" i]') ||
      target.container.querySelector('button[aria-label*="play" i]') ||
      target.container.querySelector(
        '[role="button"][aria-label*="reproduzir" i]',
      ) ||
      target.container.querySelector(
        '[role="button"][aria-label*="play" i]',
      ) ||
      target.container
        .querySelector('[data-icon="audio-play"]')
        ?.closest?.('button,[role="button"]') ||
      target.container
        .querySelector('[data-icon="ptt"]')
        ?.closest?.('button,[role="button"]')

    if (!button) {
      return false
    }

    button.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )

    button.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )

    button.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )

    return true
  }

  async function waitForAudioSourceFromTarget(target) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const audioSource = getAudioSourceFromTarget(target)

      if (audioSource.source) {
        return audioSource
      }

      await sleep(250)
    }

    return {
      source: '',
      mimeType: '',
    }
  }

  function isProbablyAudioBlob(blob) {
    const type = String(blob?.type || '').toLowerCase()

    return (
      type.startsWith('audio/') ||
      type === 'application/octet-stream' ||
      type === ''
    )
  }

  function requestTargetedAudioCapture(target) {
    const requestId = [
      'yolen-audio',
      Date.now(),
      Math.random().toString(16).slice(2),
    ].join('-')

    window.postMessage(
      {
        source: 'YOLEN_COMPANION_CONTENT_SCRIPT',
        action: 'CAPTURE_NEXT_AUDIO',
        requestId,
        targetKey: target.key,
      },
      window.location.origin,
    )

    return requestId
  }

  function finishTargetedAudioCapture(requestId) {
    window.postMessage(
      {
        source: 'YOLEN_COMPANION_CONTENT_SCRIPT',
        action: 'CAPTURE_FINISHED',
        requestId,
      },
      window.location.origin,
    )
  }

  async function waitForTargetedAudioEntry(target, requestId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entry = await findBestCapturedAudioEntryForTarget(
        target,
        requestId,
      )

      if (entry) {
        return entry
      }

      await sleep(250)
    }

    return null
  }

  async function getAudioBlobForTarget(target) {
    const audioSource = getAudioSourceFromTarget(target)

    if (audioSource.source) {
      const response = await fetch(audioSource.source)

      if (response.ok) {
        const blob = await response.blob()

        if (blob.size && isProbablyAudioBlob(blob)) {
          return {
            blob: new Blob([blob], {
              type: audioSource.mimeType || blob.type || 'audio/webm',
            }),
            capturedBlobId: null,
          }
        }
      }
    }

    const matchedExistingEntry =
      await findBestCapturedAudioEntryForTarget(target)

    if (matchedExistingEntry) {
      const assignedEntry = assignCapturedAudioEntryToTarget(
        matchedExistingEntry,
        target,
      )

      return {
        blob: buildBlobFromCapturedEntry(assignedEntry),
        capturedBlobId: assignedEntry.id,
      }
    }

    const requestId = requestTargetedAudioCapture(target)

    await sleep(80)
    clickAudioTarget(target)

    try {
      const targetedEntry = await waitForTargetedAudioEntry(
        target,
        requestId,
      )

      if (targetedEntry) {
        const assignedEntry = assignCapturedAudioEntryToTarget(
          targetedEntry,
          target,
        )

        return {
          blob: buildBlobFromCapturedEntry(assignedEntry),
          capturedBlobId: assignedEntry.id,
        }
      }

      const fallbackEntry =
        await findBestCapturedAudioEntryForTarget(target)

      if (fallbackEntry) {
        const assignedEntry = assignCapturedAudioEntryToTarget(
          fallbackEntry,
          target,
        )

        return {
          blob: buildBlobFromCapturedEntry(assignedEntry),
          capturedBlobId: assignedEntry.id,
        }
      }

      const loadedSource = await waitForAudioSourceFromTarget(target)

      if (loadedSource.source) {
        const response = await fetch(loadedSource.source)

        if (response.ok) {
          const blob = await response.blob()

          if (blob.size && isProbablyAudioBlob(blob)) {
            return {
              blob: new Blob([blob], {
                type: loadedSource.mimeType || blob.type || 'audio/webm',
              }),
              capturedBlobId: null,
            }
          }
        }
      }

      throw new Error(
        `Não foi possível associar o arquivo ao áudio correto. Duração visível: ${
          Number.isFinite(target.durationSeconds)
            ? `${target.durationSeconds}s`
            : 'não identificada'
        }. O Companion não enviou nenhum arquivo para transcrição.`,
      )
    } finally {
      finishTargetedAudioCapture(requestId)
    }
  }

  async function transcribeNextVisibleAudio() {
    if (state.audioTranscriptionLoading) {
      return
    }

    const cycleId = state.leadResolution?.cycle?.id

    if (!cycleId) {
      state = {
        ...state,
        audioTranscriptionStatus: 'Ciclo comercial não localizado para transcrição.',
      }

      renderPanel()
      return
    }

    const audioTargets =
      getRelevantVisibleAudioTargets()

    if (audioTargets.length === 0) {
      state = {
        ...state,
        audioTranscriptionStatus:
          'O áudio pendente da conversa atual não está visível. Volte ao ponto mais recente da conversa e tente novamente.',
      }

      renderPanel()
      return
    }

    const nextTarget = audioTargets.find((target) => {
      return !state.audioTranscriptionsByKey?.[getAudioTranscriptionKey(target)]
    })

    if (!nextTarget) {
      state = {
        ...state,
        audioTranscriptionStatus: 'Todos os áudios visíveis desta conversa já foram transcritos.',
      }

      renderPanel()
      return
    }

    state = {
      ...state,
      audioTranscriptionLoading: true,
      audioTranscriptionStatus: `Transcrevendo áudio ${nextTarget.index + 1}...`,
    }

    renderPanel()

    try {
      const audioCapture = await getAudioBlobForTarget(nextTarget)
      const blob = audioCapture.blob
      const audioBase64 = await blobToBase64(blob)

      const result = await window.YolenCompanionApi.transcribeAudio({
        cycle_id: cycleId,
        audio_base64: audioBase64,
        mime_type: blob.type || 'audio/webm',
        file_name: `whatsapp-audio-${nextTarget.index + 1}.webm`,
        audio_index: nextTarget.index,
        audio_target_key: nextTarget.key,
      })

      if (!result?.ok || !result.payload?.ok || !result.payload?.data?.text) {
        throw new Error(
          result?.payload?.error ||
            'Não foi possível transcrever o áudio pela Yolen.',
        )
      }
      const transcriptionKey = getAudioTranscriptionKey(nextTarget)


      const nextAudioTranscriptionsByKey = {
        ...(state.audioTranscriptionsByKey || {}),
        [transcriptionKey]: {
          audioIndex: nextTarget.index,
          targetKey: nextTarget.key,
          capturedBlobId: audioCapture.capturedBlobId,
          text: result.payload.data.text,
          occurredAt:
            result.payload.data.occurred_at ||
            new Date().toISOString(),
        },
      }

      const remainingAudioCount =
        getPendingAudioCountForCurrentConversation(
          nextAudioTranscriptionsByKey,
        )

      state = {
        ...state,
        audioTranscriptionLoading: false,
        audioTranscriptionStatus:
          remainingAudioCount === 0
            ? 'Todos os áudios visíveis foram transcritos. Analise a conversa novamente.'
            : result.payload.data.already_transcribed
              ? 'Áudio já estava transcrito.'
              : 'Áudio transcrito com sucesso.',
        audioTranscriptionsByKey: nextAudioTranscriptionsByKey,
      }

      renderPanel()

      scheduleCaptureIngestion()

      if (remainingAudioCount === 0) {
        scheduleAutomaticAnalysis(
          'Todos os áudios foram transcritos. A análise será atualizada automaticamente em 8 segundos.',
        )
      }
    } catch (error) {
      state = {
        ...state,
        audioTranscriptionLoading: false,
        audioTranscriptionStatus:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao transcrever áudio.',
      }

      renderPanel()
    }
  }

  function buildConversationFingerprint(value) {
    const text = String(value || '')
      .replace(/\r\n/g, '\n')
      .trim()

    let hash = 2166136261

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${text.length}:${(hash >>> 0).toString(16)}`
  }

  function getCurrentConversationFingerprint() {
    const messages =
      getStructuredMessagesForAnalysis()

    return messageMutationTools
      .buildMessageSnapshotFingerprint(
        messages,
        deletedMessageIds,
      )
  }

  function isCurrentAnalysisOutdated() {
    if (
      !state.conversationAnalysis ||
      !state.analyzedConversationFingerprint
    ) {
      return false
    }

    const currentFingerprint =
      getCurrentConversationFingerprint()

    if (!currentFingerprint) {
      return false
    }

    return (
      currentFingerprint !==
      state.analyzedConversationFingerprint
    )
  }

  function getSelectedChatActivitySnapshot() {
    const selectedElement = getSelectedChatElement()

    if (!selectedElement) {
      return ''
    }

    return normalizeMessageText(
      selectedElement.textContent,
    ).slice(0, 600)
  }

  function clearAutomaticAnalysisTimer() {
    if (automaticAnalysisTimerId) {
      window.clearTimeout(
        automaticAnalysisTimerId,
      )
    }

    automaticAnalysisTimerId = 0
    automaticAnalysisScheduledKey = null
  }

  function getAutomaticAnalysisKey() {
    const conversationFingerprint =
      getCurrentConversationFingerprint()

    if (
      !state.conversationKey ||
      !conversationFingerprint
    ) {
      return null
    }

    return [
      state.conversationKey,
      conversationFingerprint,
    ].join('::')
  }

  function canScheduleAutomaticAnalysis() {
    const currentFingerprint =
      getCurrentConversationFingerprint()

    if (
      !canAnalyzeCurrentConversation() ||
      !currentFingerprint
    ) {
      return false
    }

    if (
      state.conversationAnalysisLoading ||
      state.suggestionApplyLoading ||
      state.audioTranscriptionLoading
    ) {
      return false
    }

    if (
      getPendingAudioCountForCurrentConversation() > 0
    ) {
      return false
    }

    if (
      state.analyzedConversationFingerprint ===
      currentFingerprint
    ) {
      return false
    }

    return true
  }

  function scheduleAutomaticAnalysis(message) {
    const scheduledKey =
      getAutomaticAnalysisKey()

    if (
      automaticAnalysisTimerId &&
      scheduledKey &&
      automaticAnalysisScheduledKey ===
        scheduledKey
    ) {
      return
    }

    clearAutomaticAnalysisTimer()

    if (
      !scheduledKey ||
      !canScheduleAutomaticAnalysis()
    ) {
      if (
        state.automaticAnalysisStatus &&
        !state.conversationAnalysisLoading
      ) {
        state = {
          ...state,
          automaticAnalysisStatus: null,
        }

        renderPanel()
      }

      return
    }

    automaticAnalysisScheduledKey =
      scheduledKey

    state = {
      ...state,
      automaticAnalysisStatus:
        message ||
        'A conversa será analisada automaticamente após alguns segundos sem novas mensagens.',
    }

    renderPanel()

    automaticAnalysisTimerId =
      window.setTimeout(() => {
        automaticAnalysisTimerId = 0

        const currentKey =
          getAutomaticAnalysisKey()

        if (
          !currentKey ||
          currentKey !==
            automaticAnalysisScheduledKey
        ) {
          automaticAnalysisScheduledKey = null
          return
        }

        automaticAnalysisScheduledKey = null

        analyzeCurrentConversation({
          automatic: true,
        })
      }, AUTOMATIC_ANALYSIS_DELAY_MS)
  }

  function handleConversationActivityForAutomaticAnalysis() {
    const activitySnapshot =
      getSelectedChatActivitySnapshot()

    if (!activitySnapshot) {
      return
    }

    if (
      lastSelectedChatActivitySnapshot === null
    ) {
      lastSelectedChatActivitySnapshot =
        activitySnapshot
      return
    }

    if (
      activitySnapshot ===
      lastSelectedChatActivitySnapshot
    ) {
      return
    }

    lastSelectedChatActivitySnapshot =
      activitySnapshot

    scheduleAutomaticAnalysis(
      'Nova mensagem detectada. A Yolen aguardará 8 segundos antes de atualizar a análise.',
    )
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

  function findContactInfoHeader() {
    const headers =
      Array.from(
        document.querySelectorAll('header'),
      )

    return (
      headers.find((header) => {
        if (header.closest?.(`#${PANEL_ID}`)) {
          return false
        }

        const text =
          String(
            header.innerText ||
            header.textContent ||
            '',
          )
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('pt-BR')

        return (
          text.includes('dados do contato') ||
          text.includes('dados do perfil') ||
          text.includes('contact info') ||
          text === 'profile'
        )
      }) ||
      null
    )
  }

  function getContactInfoCloseControl() {
    const header =
      findContactInfoHeader()

    const panel =
      findContactInfoPanel()

    const roots =
      [header, panel]
        .filter(Boolean)

    for (const root of roots) {
      const labeledControl =
        root.querySelector(
          '[aria-label*="Fechar" i], [aria-label*="Close" i]',
        )

      if (labeledControl) {
        return labeledControl
      }

      const closeIcon =
        root.querySelector(
          '[data-icon="x"]',
        )

      if (closeIcon) {
        return (
          closeIcon.closest(
            'button,[role="button"],[tabindex]',
          ) ||
          closeIcon
        )
      }
    }

    return (
      header?.querySelector(
        'button,[role="button"],[tabindex]',
      ) ||
      null
    )
  }

  function activateContactInfoCloseControl(
    element,
  ) {
    if (!element) {
      return false
    }

    if (
      typeof element.click ===
      'function'
    ) {
      try {
        element.click()
        return true
      } catch {
        // Usa o fallback visual abaixo.
      }
    }

    return clickElement(element)
  }

  function dispatchContactInfoEscape() {
    const buildEscapeEvent = () =>
      new KeyboardEvent(
        'keydown',
        {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
        },
      )

    window.dispatchEvent(
      buildEscapeEvent(),
    )

    document.dispatchEvent(
      buildEscapeEvent(),
    )
  }

  function closeContactInfoPanel() {
    const header =
      findContactInfoHeader()

    const panel =
      findContactInfoPanel()

    if (!header && !panel) {
      return true
    }

    const closeControl =
      getContactInfoCloseControl()

    if (closeControl) {
      return (
        activateContactInfoCloseControl(
          closeControl,
        )
      )
    }

    dispatchContactInfoEscape()
    return true
  }

  async function waitForContactInfoPanelClosed(
    attempts,
  ) {
    for (
      let attempt = 0;
      attempt < attempts;
      attempt += 1
    ) {
      await sleep(100)

      if (
        !findContactInfoHeader() &&
        !findContactInfoPanel()
      ) {
        await sleep(100)
        return true
      }
    }

    return false
  }

  async function closeContactInfoPanelAndWait() {
    const closeTriggered =
      closeContactInfoPanel()

    if (!closeTriggered) {
      return false
    }

    const closedAfterControl =
      await waitForContactInfoPanelClosed(
        10,
      )

    if (closedAfterControl) {
      return true
    }

    dispatchContactInfoEscape()

    return waitForContactInfoPanelClosed(
      12,
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

    if (
      !state.connected ||
      state.isSelfConversation ||
      state.isGroupConversation ||
      state.conversationPhone
    ) {
      return
    }

    const lookupTitle =
      state.conversationTitle

    const lookupIdentity =
      getAutomaticContactLookupIdentity(
        lookupTitle,
      )

    if (
      !conversationKey ||
      !lookupIdentity ||
      autoLookupAttemptedKeys.has(
        lookupIdentity,
      )
    ) {
      return
    }

    autoContactLookupInFlight = true

    const hadContactPanelOpen =
      Boolean(findContactInfoPanel())

    state = {
      ...state,
      autoLookupStatus: 'Abrindo dados do contato automaticamente...',
    }

    renderPanel()

    try {
      if (!hadContactPanelOpen) {
        const clicked = clickElement(getClickableHeaderTarget())

        if (!clicked) {
          const retryCount =
            autoLookupPrepareRetryCounts.get(
              lookupIdentity,
            ) || 0

          if (
            retryCount <
            AUTO_CONTACT_LOOKUP_MAX_PREPARE_RETRIES
          ) {
            autoLookupPrepareRetryCounts.set(
              lookupIdentity,
              retryCount + 1,
            )

            state = {
              ...state,
              autoLookupStatus:
                'Preparando os dados do contato...',
            }

            renderPanel()

            window.setTimeout(() => {
              if (
                state.connected &&
                !state.conversationPhone &&
                state.contactLookupIdentity ===
                  lookupIdentity &&
                !autoLookupAttemptedKeys.has(
                  lookupIdentity,
                )
              ) {
                runAutomaticContactLookup(
                  conversationKey,
                )
              }
            }, AUTO_CONTACT_LOOKUP_PREPARE_RETRY_MS)

            return
          }

          autoLookupAttemptedKeys.add(
            lookupIdentity,
          )

          state = {
            ...state,
            autoLookupStatus:
              'Não consegui abrir os dados do contato nesta tentativa. Troque de conversa e volte para tentar novamente.',
          }

          renderPanel()
          return
        }

        autoLookupPrepareRetryCounts.delete(
          lookupIdentity,
        )

        await sleep(AUTO_CONTACT_LOOKUP_DELAY_MS)
      }

      autoLookupAttemptedKeys.add(
        lookupIdentity,
      )

      const phone =
        await waitForContactPanelPhone(
          AUTO_CONTACT_LOOKUP_TIMEOUT_MS,
        )

      if (!hadContactPanelOpen) {
        const panelClosed =
          await closeContactInfoPanelAndWait()

        if (!panelClosed) {
          state = {
            ...state,
            autoLookupStatus:
              'Não consegui fechar os dados do contato automaticamente.',
          }

          renderPanel()
          return
        }
      }

      const currentLookupIdentity =
        getAutomaticContactLookupIdentity(
          getMainHeaderPrimaryTitle() ||
          state.conversationTitle,
        )

      if (
        currentLookupIdentity !==
        lookupIdentity
      ) {
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

      cachedPhonesByConversationKey.set(
        conversationKey,
        phone,
      )

      cachedPhonesByLookupIdentity.set(
        lookupIdentity,
        phone,
      )

      state = {
        ...state,
        conversationPhone: phone,
        phoneSource: hadContactPanelOpen ? 'Dados do contato' : 'Dados do contato automático',
        autoLookupStatus: null,
      }

      renderPanel()

      if (state.connected) {
        lastResolvedConversationKey =
          conversationKey
        lastResolvedContactLookupIdentity =
          lookupIdentity

        resolveCurrentLead()
      }
    } finally {
      autoContactLookupInFlight = false
    }
  }

  function clearLeadStateForNewConversation() {
    capturedAudioBlobEntries = []
    clearAutomaticAnalysisTimer()
    clearDeepAnalysisPollTimer()
    clearCompanionClientContextRefreshTimer()
    activeSellerArea = 'now'

    lastSelectedChatActivitySnapshot =
      getSelectedChatActivitySnapshot()

    state = {
      ...state,
      leadResolutionLoading: false,
      leadResolution: null,
      leadResolutionError: null,
      companionClientContext: {
        status: 'idle',
      },
      companionClientContextCycleId: null,
      companionClientContextConversationKey: null,
      autoLookupStatus: null,
      conversationAnalysisLoading: false,
      conversationAnalysis: null,
      conversationAnalysisError: null,
      analyzedConversationFingerprint: null,
      automaticAnalysisStatus: null,
      deepAnalysisStatus: null,
      deepAnalysisResult: null,
      suggestionApplyLoading: false,
      suggestionApplyResult: null,
      suggestionApplyError: null,
      suggestedMessageCopyStatus: null,
      suggestedMessageLastRegisteredKey: null,
      pendingSuggestedMessageSend: null,
      pendingSuggestedMessageSendRegistering: false,
      lastAnalysisAudioCount: 0,
      audioTranscriptionLoading: false,
      audioTranscriptionStatus: null,
      capturedAudioBlobCount: 0,
      audioTranscriptionHistoryLoading: false,
      audioTranscriptionHistoryCycleId: null,
      preSendAssessment: null,
      preSendAssessmentConversationKey: null,
      preSendAssessmentFingerprint: null,
      preSendDraft: '',
      preSendGateOpen: false,
      preSendBypassKey: null,
    }
  }

  function refreshConversationSnapshot() {
    const conversationTitle =
      getConversationTitle()

    const conversationKey =
      getConversationKey(
        conversationTitle,
      )

    const isSelfConversation =
      isSelfConversationTitle(
        conversationTitle,
      )

    const isGroupConversation =
      isGroupConversationHeader()

    const contactLookupIdentity =
      getAutomaticContactLookupIdentity(
        conversationTitle,
      )

    const phoneResult =
      isGroupConversation
        ? {
            phone: null,
            source: null,
          }
        : getConversationPhone(
            conversationTitle,
            conversationKey,
          )

    const previousContactLookupIdentity =
      state.contactLookupIdentity

    const contactLookupChanged =
      previousContactLookupIdentity !==
      contactLookupIdentity

    const previousConversationKey =
      state.conversationKey

    const conversationChanged =
      previousConversationKey !==
      conversationKey

      if (contactLookupChanged) {
        lastResolvedContactLookupIdentity =
          null

        if (contactLookupIdentity) {
          autoLookupAttemptedKeys.delete(
            contactLookupIdentity,
          )

          autoLookupPrepareRetryCounts.delete(
            contactLookupIdentity,
          )
        }
      }

      if (conversationChanged) {
        rememberCurrentPreResolutionCapture()

        lastResolvedConversationKey = null

        resetConversationMessageLedger(
          conversationKey,
        )

        clearLeadStateForNewConversation()
      }

    state = {
      ...state,
      conversationTitle,
      conversationKey,
      conversationPhone:
        phoneResult.phone,
      phoneSource:
        phoneResult.source,
      contactLookupIdentity,
      isSelfConversation,
      isGroupConversation,
    }

    const messageMutationDetected =
      synchronizeConversationMessageLedger()

    rememberCurrentPreResolutionCapture()

    state = {
      ...state,
      messageCount:
        getVisibleMessagesCount(),
      audioCount:
        getVisibleAudioCount(),
    }

    if (isSelfConversation) {
      lastResolvedConversationKey = null
      lastResolvedContactLookupIdentity =
        null
      clearLeadStateForNewConversation()
      renderPanel()
      return messageMutationDetected
    }

    if (isGroupConversation) {
      lastResolvedConversationKey = null
      lastResolvedContactLookupIdentity =
        null
      clearLeadStateForNewConversation()
      renderPanel()
      return messageMutationDetected
    }

    renderPanel()

    if (
      state.connected &&
      phoneResult.phone &&
      contactLookupIdentity &&
      lastResolvedContactLookupIdentity !==
        contactLookupIdentity
    ) {
      lastResolvedConversationKey =
        conversationKey
      lastResolvedContactLookupIdentity =
        contactLookupIdentity

      resolveCurrentLead()
      return messageMutationDetected
    }

    if (
      state.connected &&
      !phoneResult.phone &&
      conversationKey &&
      contactLookupIdentity &&
      !autoLookupAttemptedKeys.has(
        contactLookupIdentity,
      )
    ) {
      window.setTimeout(() => {
        runAutomaticContactLookup(
          conversationKey,
        )
      }, 300)
    }

    return messageMutationDetected
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

    if (state.isGroupConversation) {
      return 'Conversa em grupo'
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

    if (state.isGroupConversation) {
      return 'Grupos não são vinculados a leads. O Companion não abrirá os participantes nem procurará telefone.'
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
      'https://cockpit-comercial-vocn.vercel.app'

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

  // ---------------------------------------------------------------------
  // Registrar conversa — registro factual e manual da conversa atual no
  // histórico do lead. Independente da análise profunda (V2): não lê nem
  // depende de state.conversationAnalysis, não sugere mensagem, não altera
  // CRM/Agenda. O estado fica indexado por (cycle_id + conversation_key)
  // para nunca vazar entre conversas quando o vendedor troca de contato
  // enquanto uma chamada está em andamento.
  // ---------------------------------------------------------------------

  function canRegisterCurrentConversation() {
    return Boolean(
      state.connected &&
        !state.isSelfConversation &&
        state.leadResolution?.cycle?.id,
    )
  }

  function getConversationRegistrationKey() {
    const cycleId = state.leadResolution?.cycle?.id
    const conversationKey =
      typeof getCaptureConversationKey === 'function'
        ? getCaptureConversationKey()
        : null

    if (!cycleId || !conversationKey) {
      return null
    }

    return globalThis.YolenCompanionConversationRegistrationTools.buildConversationRegistrationKey(
      {
        cycleId,
        conversationKey,
      },
    )
  }

  function getCurrentConversationRegistrationEntry() {
    const key = getConversationRegistrationKey()

    if (!key) {
      return null
    }

    return (state.conversationRegistrations || {})[key] || null
  }

  function applyConversationRegistrationUpdate({
    key,
    requestCycleId,
    requestConversationKey,
    patch,
  }) {
    state = {
      ...state,
      conversationRegistrations: {
        ...(state.conversationRegistrations || {}),
        [key]: {
          ...(state.conversationRegistrations?.[key] || {}),
          ...patch,
        },
      },
    }

    const stillCurrent =
      globalThis.YolenCompanionConversationRegistrationTools.shouldApplyConversationRegistrationResult(
        {
          requestCycleId,
          requestConversationKey,
          currentCycleId: state.leadResolution?.cycle?.id,
          currentConversationKey:
            typeof getCaptureConversationKey === 'function'
              ? getCaptureConversationKey()
              : null,
        },
      )

    if (stillCurrent) {
      renderPanel()
    }
  }

  async function registerCurrentConversation() {
    if (!canRegisterCurrentConversation()) {
      return
    }

    const cycleId = state.leadResolution?.cycle?.id
    const conversationKey =
      typeof getCaptureConversationKey === 'function'
        ? getCaptureConversationKey()
        : null

    if (!cycleId || !conversationKey) {
      return
    }

    const key = globalThis.YolenCompanionConversationRegistrationTools.buildConversationRegistrationKey(
      {
        cycleId,
        conversationKey,
      },
    )

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: 'previewing',
        summary_text: null,
        watermark: null,
        confirmation_token: null,
        message_count: null,
        occurred_at: null,
        error_message: null,
        already_registered: false,
      },
    })

    let previewResult

    try {
      previewResult = await window.YolenCompanionApi.previewConversationRegistration({
        cycle_id: cycleId,
        conversation_key: conversationKey,
      })
    } catch (error) {
      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: 'error',
          error_message:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível gerar o resumo da conversa.',
        },
      })
      return
    }

    if (!previewResult?.ok || !previewResult.payload?.ok || !previewResult.payload?.data) {
      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: 'error',
          error_message:
            previewResult?.payload?.error || 'Não foi possível gerar o resumo da conversa.',
        },
      })
      return
    }

    const data = previewResult.payload.data
    const alreadyRegistered = data.already_registered === true

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: alreadyRegistered ? 'success' : 'preview_ready',
        summary_text: data.summary_text || '',
        watermark: data.watermark || null,
        confirmation_token: data.confirmation_token || null,
        message_count: data.message_count ?? null,
        occurred_at: data.occurred_at || null,
        already_registered: alreadyRegistered,
        error_message: null,
      },
    })
  }

  function canConfirmConversationRegistration() {
    const entry = getCurrentConversationRegistrationEntry()
    return Boolean(entry) && entry.status === 'preview_ready' && Boolean(entry.confirmation_token)
  }

  async function confirmCurrentConversationRegistration() {
    if (!canConfirmConversationRegistration()) {
      return
    }

    const cycleId = state.leadResolution?.cycle?.id
    const conversationKey =
      typeof getCaptureConversationKey === 'function'
        ? getCaptureConversationKey()
        : null

    if (!cycleId || !conversationKey) {
      return
    }

    const key = globalThis.YolenCompanionConversationRegistrationTools.buildConversationRegistrationKey(
      {
        cycleId,
        conversationKey,
      },
    )

    const entry = getCurrentConversationRegistrationEntry()

    if (!entry || entry.status !== 'preview_ready' || !entry.confirmation_token) {
      return
    }

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: 'saving',
        error_message: null,
      },
    })

    let confirmResult

    try {
      confirmResult = await window.YolenCompanionApi.confirmConversationRegistration({
        cycle_id: cycleId,
        conversation_key: conversationKey,
        confirmation_token: entry.confirmation_token,
        summary_text: entry.summary_text,
      })
    } catch (error) {
      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: 'error',
          error_message:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível registrar a conversa no histórico.',
        },
      })
      return
    }

    if (!confirmResult?.ok || !confirmResult.payload?.ok || !confirmResult.payload?.data) {
      const code = confirmResult?.payload?.code
      const isStale = [
        'REGISTER_CONVERSATION_STALE_WATERMARK',
        'REGISTER_CONVERSATION_INVALID_CONFIRMATION_TOKEN',
        'REGISTER_CONVERSATION_CONFIRMATION_TOKEN_SCOPE_MISMATCH',
        'REGISTER_CONVERSATION_CYCLE_MISMATCH',
        'REGISTER_CONVERSATION_CONVERSATION_KEY_MISMATCH',
        'REGISTER_CONVERSATION_SUMMARY_MISMATCH',
      ].includes(code)

      applyConversationRegistrationUpdate({
        key,
        requestCycleId: cycleId,
        requestConversationKey: conversationKey,
        patch: {
          status: isStale ? 'stale' : 'error',
          error_message:
            confirmResult?.payload?.error ||
            'Não foi possível registrar a conversa no histórico.',
        },
      })
      return
    }

    const data = confirmResult.payload.data

    applyConversationRegistrationUpdate({
      key,
      requestCycleId: cycleId,
      requestConversationKey: conversationKey,
      patch: {
        status: 'success',
        summary_text: data.summary_text || entry.summary_text,
        occurred_at: data.occurred_at || null,
        already_registered: data.already_registered === true,
        error_message: null,
      },
    })
  }

  function cancelCurrentConversationRegistration() {
    const key = getConversationRegistrationKey()

    if (!key || !state.conversationRegistrations?.[key]) {
      return
    }

    const nextRegistrations = {
      ...state.conversationRegistrations,
    }

    delete nextRegistrations[key]

    state = {
      ...state,
      conversationRegistrations: nextRegistrations,
    }

    renderPanel()
  }

  function getConversationRegistrationCardHtml() {
    if (!canRegisterCurrentConversation()) {
      return ''
    }

    const entry = getCurrentConversationRegistrationEntry()
    const status = entry?.status || 'idle'

    const body = (() => {
      if (status === 'previewing') {
        return `
          <div class="yolen-card-description">Gerando resumo…</div>
          <button class="yolen-secondary-button" type="button" disabled>Gerando resumo…</button>
        `
      }

      if (status === 'preview_ready') {
        return `
          <div class="yolen-card-description yolen-conversation-registration-preview">
            ${escapeHtml(entry?.summary_text || '')}
          </div>
          <div class="yolen-inline-actions">
            <button class="yolen-primary-button" type="button" data-yolen-action="confirm-conversation-registration">
              Confirmar registro
            </button>
            <button class="yolen-tertiary-button" type="button" data-yolen-action="cancel-conversation-registration">
              Cancelar
            </button>
          </div>
        `
      }

      if (status === 'saving') {
        return `
          <div class="yolen-card-description">Registrando no histórico…</div>
          <button class="yolen-primary-button" type="button" disabled>Registrando no histórico…</button>
        `
      }

      if (status === 'success') {
        return `
          <div class="yolen-card-description yolen-conversation-registration-preview">
            ${escapeHtml(entry?.summary_text || '')}
          </div>
          <div class="yolen-decision-kicker">Conversa registrada no histórico</div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Registrar novamente
          </button>
        `
      }

      if (status === 'stale') {
        return `
          <div class="yolen-card-description">
            ${escapeHtml(
              entry?.error_message ||
                'A conversa mudou desde a geração do resumo. Gere novamente.',
            )}
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Gerar novamente
          </button>
        `
      }

      if (status === 'error') {
        return `
          <div class="yolen-card-description yolen-status-warning">
            ${escapeHtml(entry?.error_message || 'Não foi possível registrar. Tentar novamente.')}
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Tentar novamente
          </button>
        `
      }

      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
          Registrar conversa
        </button>
      `
    })()

    return `
      <div class="yolen-card yolen-conversation-registration-card">
        <div class="yolen-section-label">Histórico do lead</div>
        ${body}
      </div>
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

  function hasAudioWithoutTranscriptionForAnalysis() {
    return Boolean(state.conversationAnalysis) && Number(state.lastAnalysisAudioCount || 0) > 0
  }

  function isStatefulConversationAnalysis() {
    return (
      state
        .conversationAnalysis
        ?.engine_source ===
      'stateful'
    )
  }

  function getActiveCommercialReading() {
    const analysis =
      state
        .conversationAnalysis

    const reading =
      analysis
        ?.commercial_reading

    if (
      analysis?.engine_source !==
        'stateful' ||
      !reading ||
      typeof reading !==
        'object' ||
      Array.isArray(reading)
    ) {
      return null
    }

    return reading
  }

  // B4_PRE_SEND_EVALUATOR_START
  function evaluatePreSendAssessment(input) {
    const reading =
      input?.commercialReading

    const draft =
      String(
        input?.draft || '',
      )
        .replace(/\s+/g, ' ')
        .trim()

    if (
      input?.engineSource !==
        'stateful' ||
      !reading ||
      typeof reading !==
        'object' ||
      Array.isArray(reading) ||
      input?.analysisLoading ===
        true ||
      input?.analysisOutdated ===
        true ||
      reading.analysis_status !==
        'complete' ||
      reading.commercial_role !==
        'buyer' ||
      (
        reading.commercial_relevance &&
        reading.commercial_relevance !==
          'commercial'
      ) ||
      !reading.best_approach ||
      !reading.customer ||
      !reading.method ||
      !reading.communication ||
      !reading.operations ||
      !draft
    ) {
      return null
    }

    const normalizeText = (
      value,
    ) => {
      return String(value || '')
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          '',
        )
        .toLocaleLowerCase(
          'pt-BR',
        )
        .replace(
          /[^a-z0-9%$]+/g,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim()
    }

    const normalizedDraft =
      normalizeText(draft)

    if (
      !normalizedDraft ||
      !/[a-z0-9]/.test(
        normalizedDraft,
      )
    ) {
      return null
    }

    const lowSignalPatterns = [
      /^(oi|ola|opa|hello|hey)$/,
      /^(bom dia|boa tarde|boa noite)$/,
      /^(obrigado|obrigada|muito obrigado|muito obrigada|valeu|agradeco)$/,
      /^(ok|okay|certo|perfeito|combinado|entendi|beleza|show|sim|nao|tudo bem)$/,
    ]

    if (
      lowSignalPatterns.some(
        (pattern) =>
          pattern.test(
            normalizedDraft,
          ),
      )
    ) {
      return null
    }

    const stopWords =
      new Set([
        'para',
        'com',
        'uma',
        'que',
        'isso',
        'essa',
        'esse',
        'por',
        'dos',
        'das',
        'seu',
        'sua',
        'vou',
        'voce',
      ])

    const getMeaningfulTokens = (
      value,
    ) => {
      return Array.from(
        new Set(
          normalizeText(value)
            .split(' ')
            .filter(
              (token) =>
                token.length >= 3 &&
                !stopWords.has(
                  token,
                ),
            ),
        ),
      )
    }

    const isEquivalentToSuggestion = (
      draftValue,
      suggestionValue,
    ) => {
      const normalizedSuggestion =
        normalizeText(
          suggestionValue,
        )

      if (
        !normalizedSuggestion
      ) {
        return false
      }

      if (
        normalizedDraft ===
        normalizedSuggestion
      ) {
        return true
      }

      if (
        normalizedDraft.length >=
          24 &&
        normalizedSuggestion
          .includes(
            normalizedDraft,
          )
      ) {
        return true
      }

      if (
        normalizedSuggestion
          .length >= 24 &&
        normalizedDraft.includes(
          normalizedSuggestion,
        )
      ) {
        return true
      }

      const draftTokens =
        getMeaningfulTokens(
          draftValue,
        )

      const suggestionTokens =
        getMeaningfulTokens(
          suggestionValue,
        )

      if (
        draftTokens.length < 4 ||
        suggestionTokens.length <
          4
      ) {
        return false
      }

      const suggestionSet =
        new Set(
          suggestionTokens,
        )

      const intersection =
        draftTokens.filter(
          (token) =>
            suggestionSet.has(
              token,
            ),
        ).length

      const coverage =
        intersection /
        Math.min(
          draftTokens.length,
          suggestionTokens.length,
        )

      const lengthRatio =
        Math.max(
          normalizedDraft.length,
          normalizedSuggestion
            .length,
        ) /
        Math.max(
          1,
          Math.min(
            normalizedDraft.length,
            normalizedSuggestion
              .length,
          ),
        )

      return (
        coverage >= 0.9 &&
        lengthRatio <= 1.35
      )
    }

    if (
      isEquivalentToSuggestion(
        draft,
        input
          ?.suggestedMessage,
      )
    ) {
      return null
    }

    const matchesAny = (
      patterns,
    ) => {
      return patterns.some(
        (pattern) =>
          pattern.test(
            normalizedDraft,
          ),
      )
    }

    const closePressurePatterns = [
      /\b(vamos|podemos)\s+fechar\b/,
      /\b(fecha|fechamos|fechar)\s+(agora|hoje)\b/,
      /\bme\s+confirma\s+(agora|hoje)\b/,
      /\bconfirma\s+(agora|hoje)\b/,
      /\bfaz\s+o\s+pix\s+(agora|hoje)\b/,
      /\bpode\s+pagar\s+(agora|hoje)\b/,
      /\b(assina|assinar)\s+(agora|hoje)\b/,
      /\bgarantir\s+(sua|a)\s+vaga\s+(agora|hoje)\b/,
    ]

    const collectionPressurePatterns = [
      /\bpreciso\s+(da|de uma)\s+(sua\s+)?resposta\s+hoje\b/,
      /\bme\s+responde\s+(agora|hoje)\b/,
      /\bestou\s+aguardando\s+(sua\s+)?resposta\b/,
      /\bvai\s+fechar\s+ou\s+nao\b/,
    ]

    const explicitClosePressure =
      matchesAny(
        closePressurePatterns,
      )

    const explicitPressure =
      explicitClosePressure ||
      matchesAny(
        collectionPressurePatterns,
      )

    const shorten = (
      value,
      maximum = 180,
    ) => {
      const clean =
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim()

      if (
        clean.length <= maximum
      ) {
        return clean
      }

      return (
        clean.slice(
          0,
          maximum - 1,
        ) + '…'
      )
    }

    const decision =
      reading
        .best_approach
        ?.decision

    if (
      [
        'wait',
        'give_space',
        'no_intervention',
      ].includes(decision) &&
      explicitPressure
    ) {
      const labels = {
        wait: 'aguardar',
        give_space:
          'dar espaço ao cliente',
        no_intervention:
          'não intervir agora',
      }

      const approachReason =
        shorten(
          reading
            .best_approach
            ?.reason,
        )

      return {
        kind:
          'wait_pressure',
        reason:
          approachReason
            ? (
                'A leitura atual recomenda ' +
                labels[decision] +
                ': ' +
                approachReason +
                ' Esta mensagem parece pressionar por avanço ou resposta.'
              )
            : (
                'A leitura atual recomenda ' +
                labels[decision] +
                '. Esta mensagem parece pressionar por avanço ou resposta.'
              ),
      }
    }

    const sensitiveConditionPatterns = [
      /\b[0-9]+\s*%\s*(de\s+)?desconto\b/,
      /\b(te\s+dou|dou|consigo|libero|posso\s+fazer)\b.*\bdesconto\b/,
      /\b(faco|fecho)\s+por\s+r?\$?\s*[0-9]/,
      /\bresultado\s+garantido\b/,
      /\bgaranto\s+(o|a|que\s+essa|que\s+esta)?\s*(resultado|aprovacao|condicao|desconto|preco|valor|prazo|beneficio)\b/,
      /\bvai\s+ser\s+aprovad(a|o)\b/,
      /\bsera\s+aprovad(a|o)\b/,
      /\besta\s+aprovad(a|o)\b/,
      /\bconsigo\s+liberar\s+(essa|esta|a)?\s*(condicao|excecao|desconto)\b/,
      /\b(condicao|desconto|resultado)\s+garantid(a|o)\b/,
    ]

    if (
      matchesAny(
        sensitiveConditionPatterns,
      )
    ) {
      return {
        kind:
          'sensitive_condition',
        reason:
          'A leitura atual não contém comprovação suficiente para validar essa condição. Confirme a informação antes de enviar.',
      }
    }

    const firstSummary = (
      values,
    ) => {
      if (
        !Array.isArray(values)
      ) {
        return null
      }

      for (
        const item of values
      ) {
        const summary =
          typeof item?.summary ===
            'string'
            ? item.summary.trim()
            : ''

        if (summary) {
          return shorten(
            summary,
            150,
          )
        }
      }

      return null
    }

    const pendingIssue =
      firstSummary(
        reading.customer
          ?.open_questions,
      ) ||
      firstSummary(
        reading.customer
          ?.objections,
      ) ||
      firstSummary(
        reading.risks
          ?.customer_objections,
      )

    const pendingIssueDecision =
      [
        'respond',
        'clarify',
        'ask',
        'deepen_discovery',
        'handle_objection',
        'confirm_information',
      ].includes(decision)

    if (
      pendingIssue &&
      pendingIssueDecision &&
      explicitClosePressure
    ) {
      return {
        kind:
          'pending_issue',
        reason:
          'A leitura atual mantém uma questão ou objeção pendente: “' +
          pendingIssue +
          '”. Esta mensagem tenta avançar para fechamento antes de responder esse ponto.',
      }
    }

    const method =
      reading.method

    const incompleteMethodStage =
      method?.configured ===
        true &&
      Array.isArray(
        method.stages,
      )
        ? method.stages.find(
            (stage) =>
              stage?.status ===
                'partial' ||
              stage?.status ===
                'not_started',
          )
        : null

    const methodDecisionSupported =
      [
        'ask',
        'deepen_discovery',
        'clarify',
        'handle_objection',
        'confirm_information',
      ].includes(decision)

    if (
      incompleteMethodStage &&
      methodDecisionSupported &&
      explicitClosePressure
    ) {
      const stageName =
        typeof incompleteMethodStage
          .name === 'string'
          ? shorten(
              incompleteMethodStage
                .name,
              80,
            )
          : ''

      return {
        kind:
          'method_premature_close',
        reason:
          stageName
            ? (
                'O método configurado ainda mantém a etapa “' +
                stageName +
                '” incompleta, e a leitura atual recomenda aprofundar antes de fechar.'
              )
            : (
                'O método configurado ainda possui uma etapa incompleta, e a leitura atual recomenda aprofundar antes de fechar.'
              ),
      }
    }

    const agenda =
      reading.operations?.agenda

    const expectedDateMatch =
      typeof agenda
        ?.expected_next_action_at ===
        'string'
        ? agenda
            .expected_next_action_at
            .match(
              /^\d{4}-\d{2}-\d{2}/,
            )
        : null

    const todayDateKey =
      typeof input
        ?.todayDateKey ===
        'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        input.todayDateKey,
      )
        ? input.todayDateKey
        : null

    const addOneDay = (
      dateKey,
    ) => {
      const date =
        new Date(
          dateKey +
          'T12:00:00Z',
        )

      if (
        !Number.isFinite(
          date.getTime(),
        )
      ) {
        return null
      }

      date.setUTCDate(
        date.getUTCDate() + 1,
      )

      return date
        .toISOString()
        .slice(0, 10)
    }

    const relativeActionPatterns = [
      /\b(?:te|lhe)?\s*(?:chamo|ligo|retorno|mando|envio|procuro|respondo)\s+(hoje|amanha)\b/,
      /\b(?:falo|falamos|conversamos)\s+(hoje|amanha)\b/,
    ]

    let relativeActionDay =
      null

    for (
      const pattern of
        relativeActionPatterns
    ) {
      const match =
        normalizedDraft.match(
          pattern,
        )

      if (match?.[1]) {
        relativeActionDay =
          match[1]
        break
      }
    }

    if (
      agenda
        ?.should_change_agenda ===
        true &&
      expectedDateMatch?.[0] &&
      todayDateKey &&
      relativeActionDay
    ) {
      const intendedDateKey =
        relativeActionDay ===
        'hoje'
          ? todayDateKey
          : addOneDay(
              todayDateKey,
            )

      if (
        intendedDateKey &&
        intendedDateKey !==
          expectedDateMatch[0]
      ) {
        const [
          year,
          month,
          day,
        ] =
          expectedDateMatch[0]
            .split('-')

        return {
          kind:
            'agenda_conflict',
          reason:
            'A leitura atual indica a próxima ação para ' +
            day +
            '/' +
            month +
            '/' +
            year +
            ', mas esta mensagem combina contato em outro dia.',
        }
      }
    }

    return null
  }
  // B4_PRE_SEND_EVALUATOR_END

  function buildCurrentPreSendAssessment(
    draft,
  ) {
    if (
      !state.conversationKey
    ) {
      return null
    }

    const now =
      new Date()

    const todayDateKey = [
      now.getFullYear(),
      String(
        now.getMonth() + 1,
      ).padStart(2, '0'),
      String(
        now.getDate(),
      ).padStart(2, '0'),
    ].join('-')

    return evaluatePreSendAssessment({
      draft,
      engineSource:
        state
          .conversationAnalysis
          ?.engine_source,
      commercialReading:
        getActiveCommercialReading(),
      analysisLoading:
        state
          .conversationAnalysisLoading,
      analysisOutdated:
        isCurrentAnalysisOutdated(),
      suggestedMessage:
        getSuggestedMessage(),
      todayDateKey,
    })
  }

  function updatePreSendAssessmentFromDraft(
    draft,
    options = {},
  ) {
    const normalizedDraft =
      normalizeMessageText(
        draft,
      )

    const assessment =
      buildCurrentPreSendAssessment(
        normalizedDraft,
      )

    const conversationKey =
      state.conversationKey

    const analysisFingerprint =
      state
        .analyzedConversationFingerprint ||
      null

    const unchanged =
      state.preSendDraft ===
        normalizedDraft &&
      state
        .preSendAssessmentConversationKey ===
        conversationKey &&
      state
        .preSendAssessmentFingerprint ===
        analysisFingerprint &&
      state.preSendAssessment
        ?.kind ===
        assessment?.kind &&
      state.preSendAssessment
        ?.reason ===
        assessment?.reason

    if (unchanged) {
      return
    }

    state = {
      ...state,
      preSendAssessment:
        assessment,
      preSendAssessmentConversationKey:
        conversationKey,
      preSendAssessmentFingerprint:
        analysisFingerprint,
      preSendDraft:
        normalizedDraft,
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    if (
      options.render !== false
    ) {
      renderPanel()
    }
  }

  function getPreSendAssessmentCardHtml() {
    const assessment =
      state.preSendAssessment

    if (
      !assessment ||
      !state.conversationKey ||
      state
        .preSendAssessmentConversationKey !==
        state.conversationKey ||
      state
        .preSendAssessmentFingerprint !==
        state
          .analyzedConversationFingerprint ||
      state
        .conversationAnalysisLoading ||
      isCurrentAnalysisOutdated() ||
      getActiveCommercialReading()
        ?.analysis_status !==
        'complete'
    ) {
      return ''
    }

    const currentDraft =
      getComposerText()

    if (
      !currentDraft ||
      normalizeMessageText(
        currentDraft,
      ) !==
        state.preSendDraft
    ) {
      return ''
    }

    return [
      '<div',
        ' class="yolen-card yolen-pre-send-card yolen-status-warning"',
        ' data-yolen-pre-send-kind="' +
          escapeHtml(
            assessment.kind,
          ) +
        '"',
      '>',
        '<div class="yolen-section-label">',
          'Antes de enviar',
        '</div>',

        '<div class="yolen-card-title">',
          'Vale revisar esta mensagem',
        '</div>',

        '<div class="yolen-card-description yolen-pre-send-reason">',
          escapeHtml(
            assessment.reason,
          ),
        '</div>',

        state.preSendGateOpen
          ? getPreSendGateActionsHtml()
          : [
              '<div class="yolen-operational-note">',
                'Se você tentar enviar esta mensagem, a Yolen pedirá sua decisão antes de continuar.',
              '</div>',
            ].join(''),
      '</div>',
    ].join('')
  }

  function observeComposerDraftForPreSend() {
    const observerKey =
      '__yolenCompanionPreSendDraftObserverInstalled'

    if (globalThis[observerKey] === true) {
      return
    }

    globalThis[observerKey] = true

    document.addEventListener(
      'input',
      (event) => {
        if (
          !isComposerEnterTarget(
            event.target,
          )
        ) {
          return
        }

        updatePreSendAssessmentFromDraft(
          event.target
            ?.textContent ||
          '',
        )
      },
      true,
    )
  }

  function normalizeOperationalText(value) {
    if (
      typeof value !==
      'string'
    ) {
      return null
    }

    const clean =
      value.trim()

    return clean || null
  }

  function getOperationalDateKey(value) {
    const clean =
      normalizeOperationalText(
        value,
      )

    if (!clean) {
      return null
    }

    if (
      /^\d{4}-\d{2}-\d{2}$/
        .test(clean)
    ) {
      return clean
    }

    const timestamp =
      Date.parse(clean)

    if (
      !Number.isFinite(
        timestamp,
      )
    ) {
      return clean
    }

    return new Date(
      timestamp,
    )
      .toISOString()
      .slice(0, 10)
  }

  function getLegacySuggestionCommercialRelevance() {
    const tags =
      state
        .conversationAnalysis
        ?.suggestion
        ?.tags

    if (!Array.isArray(tags)) {
      return null
    }

    for (const tag of tags) {
      if (
        typeof tag !== 'string' ||
        !tag.startsWith(
          'commercial_relevance:',
        )
      ) {
        continue
      }

      const relevance =
        tag
          .slice(
            'commercial_relevance:'.length,
          )
          .trim()

      if (
        relevance === 'commercial' ||
        relevance === 'non_commercial' ||
        relevance === 'uncertain'
      ) {
        return relevance
      }
    }

    return null
  }

  function isLegacySuggestionCommerciallyActionable() {
    const relevance =
      getLegacySuggestionCommercialRelevance()

    return (
      relevance === null ||
      relevance === 'commercial'
    )
  }

  function hasOperationalSuggestionChange() {
    if (
      !isLegacySuggestionCommerciallyActionable()
    ) {
      return false
    }

    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const cycle =
      state
        .leadResolution
        ?.cycle

    if (
      !suggestion ||
      !cycle
    ) {
      return false
    }

    const statusChanged =
      Boolean(
        suggestion
          .recommended_status,
      ) &&
      suggestion
        .recommended_status !==
        cycle.status

    const currentNextAction =
      normalizeOperationalText(
        cycle.next_action,
      )

    const suggestedNextAction =
      normalizeOperationalText(
        suggestion.next_action,
      )

    const nextActionChanged =
      currentNextAction !==
      suggestedNextAction

    const nextActionDateChanged =
      getOperationalDateKey(
        cycle.next_action_date,
      ) !==
      getOperationalDateKey(
        suggestion
          .next_action_date,
      )

    return (
      statusChanged ||
      nextActionChanged ||
      nextActionDateChanged
    )
  }

  function hasRichCommercialReadingOperationalChange(
    commercialReading,
  ) {
    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    return (
      crm?.should_change_crm_stage ===
        true ||
      agenda?.should_change_agenda ===
        true
    )
  }

  function isRichCommercialReadingApplyCompatible(
    commercialReading,
  ) {
    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const cycle =
      state
        .leadResolution
        ?.cycle

    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    if (
      !suggestion ||
      !cycle ||
      !crm ||
      !agenda ||
      !hasRichCommercialReadingOperationalChange(
        commercialReading,
      )
    ) {
      return false
    }

    if (
      crm
        .requires_human_confirmation !==
        true ||
      agenda
        .requires_human_confirmation !==
        true
    ) {
      return false
    }

    const legacyStatusChanged =
      Boolean(
        suggestion
          .recommended_status,
      ) &&
      suggestion
        .recommended_status !==
        cycle.status

    if (
      crm
        .should_change_crm_stage ===
        true
    ) {
      if (
        !crm.recommended_status ||
        crm.recommended_status !==
          suggestion
            .recommended_status ||
        !legacyStatusChanged
      ) {
        return false
      }
    } else if (
      legacyStatusChanged
    ) {
      return false
    }

    const currentNextAction =
      normalizeOperationalText(
        cycle.next_action,
      )

    const suggestedNextAction =
      normalizeOperationalText(
        suggestion.next_action,
      )

    const currentNextActionDate =
      getOperationalDateKey(
        cycle.next_action_date,
      )

    const suggestedNextActionDate =
      getOperationalDateKey(
        suggestion
          .next_action_date,
      )

    const legacyAgendaChanged =
      currentNextAction !==
        suggestedNextAction ||
      currentNextActionDate !==
        suggestedNextActionDate

    if (
      agenda
        .should_change_agenda ===
        true
    ) {
      const expectedAgendaDate =
        getOperationalDateKey(
          agenda
            .expected_next_action_at,
        )

      if (
        !legacyAgendaChanged ||
        !expectedAgendaDate ||
        suggestedNextActionDate !==
          expectedAgendaDate
      ) {
        return false
      }
    } else if (
      legacyAgendaChanged
    ) {
      return false
    }

    return true
  }

  function hasCurrentOperationalSuggestionChange() {
    const commercialReading =
      getActiveCommercialReading()

    if (commercialReading) {
      return (
        isRichCommercialReadingApplyCompatible(
          commercialReading,
        )
      )
    }

    return (
      hasOperationalSuggestionChange()
    )
  }

  function canApplyCurrentSuggestion() {
    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const hasTrustedAnalysis =
      Boolean(
        state
          .conversationAnalysis
          ?.saved_coaching
          ?.id,
      ) ||
      isStatefulConversationAnalysis()

    return (
      canAnalyzeCurrentConversation() &&
      state
        .leadResolution
        ?.actions
        ?.can_apply_suggestion ===
        true &&
      hasTrustedAnalysis &&
      Boolean(suggestion) &&
      isOpenSuggestionStatus(
        suggestion
          .recommended_status,
      ) &&
      hasCurrentOperationalSuggestionChange() &&
      !hasAudioWithoutTranscriptionForAnalysis() &&
      !isCurrentAnalysisOutdated() &&
      !state.conversationAnalysisLoading &&
      !state.suggestionApplyLoading &&
      !state.suggestionApplyResult
    )
  }

  function getAnalysisStatusClass() {
    if (
      state.conversationAnalysisError ||
      state.suggestionApplyError ||
      isCurrentAnalysisOutdated()
    ) {
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

    if (isCurrentAnalysisOutdated()) {
      return 'A conversa mudou após a análise'
    }

    if (state.conversationAnalysis?.suggestion?.summary) {
      return state.conversationAnalysis.suggestion.summary
    }

    if (!canAnalyzeCurrentConversation()) {
      return 'Análise ainda indisponível'
    }

    if (state.automaticAnalysisStatus) {
      return 'Análise automática preparada'
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

  // A área ANÁLISE nunca expõe job id, queue, worker, watermark ou
  // candidate version ao vendedor — apenas um rótulo de progresso e,
  // quando concluída e comercialmente relevante, a leitura/mensagem
  // aprofundada em texto simples.
  function isDeepAnalysisCommerciallyActionable() {
    return (
      state.deepAnalysisResult
        ?.commercial_relevance ===
      'commercial'
    )
  }

  function getDeepAnalysisStatusDetails() {
    if (state.deepAnalysisStatus === 'pending') {
      return [
        'Análise aprofundada em andamento',
      ]
    }

    if (state.deepAnalysisStatus === 'failed') {
      return [
        'Falha na análise aprofundada — nova tentativa na próxima leitura',
      ]
    }

    if (state.deepAnalysisStatus === 'succeeded') {
      if (!isDeepAnalysisCommerciallyActionable()) {
        return [
          'Análise aprofundada concluída — nenhuma intervenção comercial necessária',
        ]
      }

      const details = [
        'Análise atualizada com leitura aprofundada',
      ]

      const deepSummary =
        state.deepAnalysisResult
          ?.interpretation
          ?.current_moment
          ?.summary

      if (deepSummary) {
        details.push(
          `Leitura aprofundada: ${deepSummary}`,
        )
      }

      const deepMessage =
        state.deepAnalysisResult
          ?.strategy
          ?.suggested_message

      if (deepMessage) {
        details.push(
          `Mensagem sugerida (aprofundada): ${deepMessage}`,
        )
      }

      return details
    }

    return []
  }

  // Detecta a transição para um resultado novo (succeeded/failed) sem
  // depender de nenhum campo de estado extra do backend: a chave combina o
  // status com o job em voo (analysisJobId), então dois resultados
  // diferentes do mesmo ciclo nunca colidem, e o mesmo resultado
  // re-renderizado (tick periódico, troca de aba) não pulsa de novo.
  function isDeepAnalysisResultFresh() {
    if (
      state.deepAnalysisStatus !==
        'succeeded' &&
      state.deepAnalysisStatus !==
        'failed'
    ) {
      return false
    }

    const key = [
      state.analysisJobId || '',
      state.deepAnalysisStatus,
    ].join(':')

    if (
      key ===
      lastRenderedDeepAnalysisResultKey
    ) {
      return false
    }

    lastRenderedDeepAnalysisResultKey =
      key

    return true
  }

  function getDeepAnalysisStatusBlockHtml() {
    const details =
      getDeepAnalysisStatusDetails()

    if (details.length === 0) {
      return ''
    }

    const fresh =
      isDeepAnalysisResultFresh()

    return `
      <div
        class="yolen-decision-block yolen-deep-analysis-status ${
          fresh
            ? 'yolen-deep-analysis-status--fresh'
            : ''
        }"
        data-yolen-layer="context"
      >
        <div class="yolen-decision-kicker">
          Análise aprofundada
          ${
            fresh
              ? '<span class="yolen-deep-analysis-fresh-badge">Nova</span>'
              : ''
          }
        </div>

        <div class="yolen-decision-copy">
          ${
            state.deepAnalysisStatus === 'pending'
              ? getInlineSpinnerHtml()
              : ''
          }${escapeHtml(details.join(' · '))}
        </div>
      </div>
    `
  }

  function getAnalysisDescription() {
    if (state.suggestionApplyLoading) {
      return 'A Yolen está atualizando o ciclo, registrando evento e preservando o histórico.'
    }

    if (state.suggestionApplyError) {
      return escapeHtml(state.suggestionApplyError)
    }

    if (isCurrentAnalysisOutdated()) {
      return (
        'Foram detectadas novas mensagens ou transcrições depois da última análise. ' +
        'A sugestão anterior foi bloqueada. Analise a conversa novamente antes de aplicar uma etapa ou usar a mensagem sugerida.'
      )
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

      if (state.automaticAnalysisStatus) {
        details.push(
          state.automaticAnalysisStatus,
        )
      }

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

      if (hasAudioWithoutTranscriptionForAnalysis()) {
        details.push(`Áudio sem transcrição: ${state.lastAnalysisAudioCount} detectado(s)`)
        details.push('Aplicação bloqueada até transcrever áudio')
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

    if (state.automaticAnalysisStatus) {
      return escapeHtml(
        state.automaticAnalysisStatus,
      )
    }

    return 'A Yolen analisará automaticamente depois que a conversa permanecer alguns segundos sem novas mensagens. O botão também permite iniciar a leitura imediatamente.'
  }

  function getSuggestedMessage() {
    const commercialReading =
      getActiveCommercialReading()

    if (commercialReading) {
      const communication =
        commercialReading
          .communication

      if (
        communication
          ?.intervention_needed !==
        true
      ) {
        return null
      }

      const message =
        communication
          ?.recommended_message

      return (
        typeof message ===
          'string' &&
        message.trim()
          ? message.trim()
          : null
      )
    }

    if (
      !isLegacySuggestionCommerciallyActionable()
    ) {
      return null
    }

    const message =
      state
        .conversationAnalysis
        ?.coaching
        ?.suggested_message

    return (
      typeof message ===
        'string' &&
      message.trim()
        ? message.trim()
        : null
    )
  }

  function getAudioTranscriptionHtml() {
    const totalAudioCount = Number(state.audioCount || 0)
    const pendingAudioCount = getPendingAudioCountForCurrentConversation()
    const transcribedAudioCount = Math.max(
      0,
      totalAudioCount - pendingAudioCount,
    )
    const details = []

    if (state.audioTranscriptionStatus) {
      details.push(escapeHtml(state.audioTranscriptionStatus))
    }

    if (totalAudioCount > 0) {
      if (pendingAudioCount === 0) {
        details.push(
          `Todos os ${totalAudioCount} áudio(s) visível(is) foram transcritos.`,
        )
      } else {
        details.push(
          `${transcribedAudioCount} de ${totalAudioCount} áudio(s) transcrito(s).`,
        )
        details.push(`${pendingAudioCount} áudio(s) pendente(s).`)
      }
    }

    if (details.length === 0) {
      return ''
    }

    return `
      <div class="yolen-card-description">
        <strong>Transcrição de áudio</strong><br>
        ${details.join('<br>')}
      </div>
    `
  }


  function getSuggestedMessageHtml() {
    const message =
      getSuggestedMessage()

    if (
      !message ||
      isCurrentAnalysisOutdated()
    ) {
      return ''
    }

    return `
      <div class="yolen-decision-block yolen-message-suggestion">
        <div class="yolen-decision-kicker">
          Mensagem sugerida
        </div>

        <div class="yolen-suggested-message">
          ${escapeHtml(message)}
        </div>
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
    return insertSuggestedMessageInWhatsAppWithOptions()
  }

  async function insertSuggestedMessageInWhatsAppWithOptions(
    options = {},
  ) {
    if (isCurrentAnalysisOutdated()) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'A conversa mudou. Analise novamente antes de inserir a mensagem.',
      }

      renderPanel()
      return
    }

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

    if (
      currentComposerText &&
      options.replaceExisting !== true
    ) {
      const confirmed = window.confirm(
        'O campo do WhatsApp já tem texto. Substituir pela mensagem sugerida?',
      )

      if (!confirmed) {
        fireCompanionActionTelemetry(
          'suggestion_ignored',
          {
            seed:
              createActionTelemetryInteractionId(),
            metadata: {
              source:
                'insert_confirmation',
            },
          },
        )

        state = {
          ...state,
          suggestedMessageCopyStatus: 'Inserção cancelada',
        }

        renderPanel()
        return
      }
    }

    const telemetryInteractionId =
      createActionTelemetryInteractionId()

    const pendingSend = {
      cycleId:
        state.leadResolution?.cycle?.id ||
        null,
      coachingNoteId:
        state.conversationAnalysis
          ?.saved_coaching?.id ||
        null,
      conversationKey:
        state.conversationKey,
      telemetryConversationKey:
        getCaptureConversationKey(),
      telemetryInteractionId,
      message,
    }

    try {
      writeTextInComposer(
        composer,
        message,
      )
    } catch {
      // O WhatsApp pode substituir o composer durante os eventos de input.
      // A confirmação real da inserção é feita abaixo pelo conteúdo atual.
    }

    let insertedComposerText = ''

    for (
      let attempt = 0;
      attempt < 8;
      attempt += 1
    ) {
      const composerAfterWrite =
        getWhatsAppComposer() ||
        composer

      insertedComposerText =
        normalizeMessageText(
          composerAfterWrite
            ?.textContent,
        )

      if (
        isProbablySameMessage(
          insertedComposerText,
          message,
        )
      ) {
        break
      }

      await sleep(50)
    }

    if (
      !isProbablySameMessage(
        insertedComposerText,
        message,
      )
    ) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Não foi possível confirmar a inserção da mensagem no WhatsApp.',
      }

      renderPanel()
      return
    }

    fireCompanionActionTelemetry(
      'suggestion_inserted',
      {
        cycleId: pendingSend.cycleId,
        coachingNoteId:
          pendingSend.coachingNoteId,
        conversationKey:
          pendingSend
            .telemetryConversationKey,
        seed: telemetryInteractionId,
        metadata: {
          source: 'insert_button',
        },
      },
    )

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
        pendingSuggestedMessageSend:
          pendingSend,
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          error instanceof Error && error.message
            ? `Mensagem inserida, mas não registrada: ${error.message}`
            : 'Mensagem inserida, mas não registrada na Yolen. Revise antes de enviar.',
        pendingSuggestedMessageSend:
          pendingSend,
      }

      renderPanel()
    }
  }


  function getApplySuggestionButtonLabel() {
    const commercialReading =
      getActiveCommercialReading()

    if (!commercialReading) {
      return 'Confirmar atualização na Yolen'
    }

    const crmChange =
      commercialReading
        ?.operations
        ?.crm
        ?.should_change_crm_stage ===
      true

    const agendaChange =
      commercialReading
        ?.operations
        ?.agenda
        ?.should_change_agenda ===
      true

    if (
      crmChange &&
      agendaChange
    ) {
      return 'Confirmar CRM e Agenda'
    }

    if (crmChange) {
      return 'Confirmar atualização do CRM'
    }

    if (agendaChange) {
      return 'Confirmar atualização da Agenda'
    }

    return 'Confirmar atualização na Yolen'
  }

  function getAnalysisActionButton() {
    if (
      !canAnalyzeCurrentConversation() ||
      state.conversationAnalysisLoading
    ) {
      return ''
    }

    const totalAudioCount =
      Number(
        state.audioCount || 0,
      )

    const pendingAudioCount =
      getPendingAudioCountForCurrentConversation()

    const transcribedAudioCount =
      Math.max(
        0,
        totalAudioCount -
          pendingAudioCount,
      )

    const nextAudioNumber =
      Math.min(
        totalAudioCount,
        transcribedAudioCount + 1,
      )

    const transcribeAudioButton =
      pendingAudioCount > 0
        ? `
          <button
            class="yolen-secondary-button"
            type="button"
            data-yolen-action="transcribe-audio"
            ${state.audioTranscriptionLoading ? 'disabled' : ''}
          >
            ${
              state.audioTranscriptionLoading
                ? `Transcrevendo áudio ${nextAudioNumber} de ${totalAudioCount}...`
                : `Transcrever áudio ${nextAudioNumber} de ${totalAudioCount}`
            }
          </button>
        `
        : ''

    if (
      isCurrentAnalysisOutdated()
    ) {
      return `
        ${transcribeAudioButton}

        <button
          class="yolen-primary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Atualizar análise
        </button>
      `
    }

    if (
      !state
        .conversationAnalysis
        ?.suggestion
    ) {
      return `
        ${transcribeAudioButton}

        <button
          class="yolen-primary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Analisar agora
        </button>
      `
    }

    const messageAvailable =
      Boolean(
        getSuggestedMessage(),
      )

    const applyButton =
      canApplyCurrentSuggestion()
        ? `
          <button
            class="yolen-primary-button"
            type="button"
            data-yolen-action="apply-suggestion"
          >
            ${escapeHtml(
              getApplySuggestionButtonLabel(),
            )}
          </button>
        `
        : ''

    const insertMessageButton =
      messageAvailable
        ? `
          <button
            class="${applyButton ? 'yolen-secondary-button' : 'yolen-primary-button'}"
            type="button"
            data-yolen-action="insert-suggested-message"
          >
            Inserir no WhatsApp
          </button>
        `
        : ''

    const copyMessageButton =
      messageAvailable
        ? `
          <button
            class="yolen-secondary-button"
            type="button"
            data-yolen-action="copy-suggested-message"
          >
            Copiar mensagem
          </button>
        `
        : ''

    return `
      ${applyButton}
      ${transcribeAudioButton}
      ${insertMessageButton}
      ${copyMessageButton}

      <button
        class="yolen-tertiary-button"
        type="button"
        data-yolen-action="analyze-conversation"
      >
        Atualizar análise
      </button>
    `
  }

  function getCompanionDecisionBadge() {
    if (
      state
        .conversationAnalysisLoading
    ) {
      return 'Analisando'
    }

    if (
      state
        .conversationAnalysisError ||
      state
        .suggestionApplyError ||
      isCurrentAnalysisOutdated()
    ) {
      return 'Atenção'
    }

    if (
      state
        .suggestionApplyResult
    ) {
      return 'Atualizado'
    }

    if (
      !state
        .conversationAnalysis
    ) {
      return 'Aguardando conversa'
    }

    if (
      hasOperationalSuggestionChange()
    ) {
      return 'Ação recomendada'
    }

    if (
      getSuggestedMessage() ||
      getCompanionNextMoveText()
    ) {
      return 'Orientação disponível'
    }

    return 'Sem intervenção necessária'
  }

  function getCompanionMomentText() {
    if (
      state
        .suggestionApplyLoading
    ) {
      return 'Atualizando a Yolen após sua confirmação...'
    }

    if (
      state
        .suggestionApplyError
    ) {
      return (
        state
          .suggestionApplyError
      )
    }

    if (
      state
        .suggestionApplyResult
    ) {
      return state
        .suggestionApplyResult
        .already_applied
        ? 'A situação já estava atualizada na Yolen.'
        : 'A atualização foi registrada na Yolen.'
    }

    if (
      state
        .conversationAnalysisLoading
    ) {
      return 'A Yolen está entendendo o momento atual da conversa.'
    }

    if (
      state
        .conversationAnalysisError
    ) {
      return (
        state
          .conversationAnalysisError
      )
    }

    if (
      isCurrentAnalysisOutdated()
    ) {
      return 'A conversa mudou desde a última leitura. Atualize a análise antes de usar a orientação anterior.'
    }

    const summary =
      state
        .conversationAnalysis
        ?.suggestion
        ?.summary

    if (
      typeof summary ===
        'string' &&
      summary.trim()
    ) {
      return summary.trim()
    }

    if (
      !canAnalyzeCurrentConversation()
    ) {
      return 'A Yolen ainda não pode analisar esta conversa.'
    }

    if (
      state
        .automaticAnalysisStatus
    ) {
      return state
        .automaticAnalysisStatus
    }

    return 'Continue a conversa normalmente. A Yolen acompanha e aparece quando houver algo útil para orientar.'
  }

  function getCompanionNextMoveText() {
    if (
      !isLegacySuggestionCommerciallyActionable()
    ) {
      return null
    }

    const nextMove =
      state
        .conversationAnalysis
        ?.coaching
        ?.recommended_next_approach

    if (
      typeof nextMove !==
        'string'
    ) {
      return null
    }

    const clean =
      nextMove.trim()

    return clean || null
  }

  function getOperationalSuggestionHtml() {
    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const cycle =
      state
        .leadResolution
        ?.cycle

    if (
      !suggestion ||
      !cycle ||
      isCurrentAnalysisOutdated() ||
      !hasOperationalSuggestionChange()
    ) {
      return ''
    }

    const items = []

    if (
      suggestion
        .recommended_status &&
      suggestion
        .recommended_status !==
        cycle.status
    ) {
      items.push(
        `Etapa: ${getStageLabel(cycle.status)} → ${getStageLabel(suggestion.recommended_status)}`,
      )
    }

    const currentNextAction =
      normalizeOperationalText(
        cycle.next_action,
      )

    const suggestedNextAction =
      normalizeOperationalText(
        suggestion.next_action,
      )

    const actionChanged =
      currentNextAction !==
        suggestedNextAction ||
      getOperationalDateKey(
        cycle.next_action_date,
      ) !==
        getOperationalDateKey(
          suggestion
            .next_action_date,
        )

    if (
      actionChanged &&
      suggestedNextAction
    ) {
      const formattedDate =
        formatSuggestionDate(
          suggestion
            .next_action_date,
        )

      items.push(
        formattedDate
          ? `Próxima ação: ${suggestedNextAction} · ${formattedDate}`
          : `Próxima ação: ${suggestedNextAction}`,
      )
    }

    if (
      items.length === 0
    ) {
      return ''
    }

    return `
      <div class="yolen-decision-block yolen-operational-suggestion">
        <div class="yolen-decision-kicker">
          Atualização na Yolen
        </div>

        <div class="yolen-decision-list">
          ${items
            .map(
              item =>
                `<div class="yolen-decision-list-item">${escapeHtml(item)}</div>`,
            )
            .join('')}
        </div>

        <div class="yolen-operational-note">
          Nada será alterado sem sua confirmação.
        </div>
      </div>
    `
  }

  function getLegacyAnalysisCardHtml() {
    const nextMove =
      getCompanionNextMoveText()

    return `
      <div class="yolen-card yolen-decision-card ${getAnalysisStatusClass()}">
        <div class="yolen-decision-header">
          <div class="yolen-section-label">
            Yolen Companion
          </div>

          <div class="yolen-decision-badge">
            ${escapeHtml(
              getCompanionDecisionBadge(),
            )}
          </div>
        </div>

        <div class="yolen-decision-block">
          <div class="yolen-decision-kicker">
            Momento atual
          </div>

          <div class="yolen-card-title yolen-decision-title">
            ${
              state.conversationAnalysisLoading
                ? getInlineSpinnerHtml()
                : ''
            }${escapeHtml(
              getCompanionMomentText(),
            )}
          </div>
        </div>

        ${getDeepAnalysisStatusBlockHtml()}

        ${
          nextMove &&
          !isCurrentAnalysisOutdated()
            ? `
              <div class="yolen-decision-block">
                <div class="yolen-decision-kicker">
                  Próximo passo
                </div>

                <div class="yolen-decision-copy">
                  ${escapeHtml(nextMove)}
                </div>
              </div>
            `
            : ''
        }

        ${getOperationalSuggestionHtml()}

        ${getAudioTranscriptionHtml()}

        ${getSuggestedMessageHtml()}

        <div class="yolen-inline-actions yolen-decision-actions">
          ${getAnalysisActionButton()}
        </div>
      </div>
    `
  }

  function getCommercialReadingDecisionLabel(
    decision,
  ) {
    const labels = {
      respond: 'Responder',
      clarify: 'Esclarecer',
      ask: 'Perguntar',
      deepen_discovery:
        'Aprofundar descoberta',
      present_solution:
        'Apresentar solução',
      compare: 'Comparar opções',
      demonstrate_value:
        'Demonstrar valor',
      handle_objection:
        'Tratar objeção',
      send_material:
        'Enviar material',
      confirm_information:
        'Confirmar informação',
      propose_call:
        'Propor ligação',
      propose_meeting:
        'Propor reunião',
      propose_visit:
        'Propor visita',
      negotiate: 'Negociar',
      ask_for_decision:
        'Pedir decisão',
      set_commitment:
        'Definir compromisso',
      wait: 'Aguardar',
      give_space: 'Dar espaço',
      follow_up: 'Fazer follow-up',
      escalate: 'Escalonar',
      close: 'Encerrar',
      no_intervention:
        'Não intervir',
      insufficient_information:
        'Informação insuficiente',
    }

    return (
      labels[decision] ||
      String(decision || '')
    )
  }

  function getCommercialReadingChannelLabel(
    channel,
  ) {
    const labels = {
      text: 'Texto',
      audio: 'Áudio',
      call: 'Ligação',
      meeting: 'Reunião',
      visit: 'Visita',
      document: 'Documento',
      wait: 'Aguardar',
      none: 'Sem canal',
    }

    return (
      labels[channel] ||
      String(channel || '')
    )
  }

  function getRichCommercialReadingBadge(
    commercialReading,
  ) {
    if (
      commercialReading
        ?.analysis_status ===
        'limited'
    ) {
      return 'Leitura limitada'
    }

    const decision =
      commercialReading
        ?.best_approach
        ?.decision

    if (decision === 'wait') {
      return 'Aguardar'
    }

    if (
      decision ===
      'give_space'
    ) {
      return 'Dar espaço'
    }

    if (
      decision ===
      'no_intervention'
    ) {
      return 'Sem intervenção'
    }

    if (
      hasRichCommercialReadingOperationalChange(
        commercialReading,
      )
    ) {
      return 'Ação recomendada'
    }

    if (
      commercialReading
        ?.communication
        ?.intervention_needed ===
        true
    ) {
      return 'Orientação disponível'
    }

    return 'Sem intervenção necessária'
  }

  function getRichCommercialReadingLimitationsHtml(
    commercialReading,
  ) {
    if (
      commercialReading
        ?.analysis_status !==
        'limited'
    ) {
      return ''
    }

    const limitations =
      Array.isArray(
        commercialReading
          ?.analysis_limitations,
      )
        ? commercialReading
            .analysis_limitations
            .filter(
              item =>
                typeof item ===
                  'string' &&
                item.trim(),
            )
            .map(
              item =>
                item.trim(),
            )
        : []

    return `
      <div class="yolen-decision-block yolen-operational-suggestion">
        <div class="yolen-decision-kicker">
          Leitura limitada
        </div>

        ${
          limitations.length > 0
            ? `
              <div class="yolen-decision-list">
                ${limitations
                  .map(
                    item =>
                      `<div class="yolen-decision-list-item">${escapeHtml(item)}</div>`,
                  )
                  .join('')}
              </div>
            `
            : ''
        }
      </div>
    `
  }

  function getRichCommercialReadingApproachHtml(
    commercialReading,
  ) {
    const approach =
      commercialReading
        ?.best_approach

    if (!approach) {
      return ''
    }

    const decision =
      typeof approach
        .decision ===
        'string'
        ? approach
            .decision
            .trim()
        : ''

    const reason =
      typeof approach
        .reason ===
        'string'
        ? approach
            .reason
            .trim()
        : ''

    const channel =
      typeof approach
        .channel ===
        'string'
        ? approach
            .channel
            .trim()
        : ''

    if (
      !decision &&
      !reason
    ) {
      return ''
    }

    return `
      <div class="yolen-decision-block">
        <div class="yolen-decision-kicker">
          Próximo movimento
        </div>

        ${
          decision
            ? `
              <div class="yolen-card-title yolen-decision-title">
                ${escapeHtml(
                  getCommercialReadingDecisionLabel(
                    decision,
                  ),
                )}
              </div>
            `
            : ''
        }

        ${
          reason
            ? `
              <div class="yolen-decision-copy">
                ${escapeHtml(reason)}
              </div>
            `
            : ''
        }

        ${
          channel
            ? `
              <div class="yolen-operational-note">
                Canal: ${escapeHtml(
                  getCommercialReadingChannelLabel(
                    channel,
                  ),
                )}
              </div>
            `
            : ''
        }
      </div>
    `
  }

  function getRichRecommendedQuestionHtml(
    commercialReading,
  ) {
    const communication =
      commercialReading
        ?.communication

    if (
      communication
        ?.intervention_needed !==
        true
    ) {
      return ''
    }

    const question =
      typeof communication
        .recommended_question ===
        'string'
        ? communication
            .recommended_question
            .trim()
        : ''

    if (!question) {
      return ''
    }

    const recommendedMessage =
      typeof communication
        .recommended_message ===
        'string'
        ? communication
            .recommended_message
            .trim()
        : ''

    const normalizeForComparison = (
      value,
    ) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const normalizedQuestion =
      normalizeForComparison(
        question,
      )

    // Se a mensagem sugerida já contém a pergunta, AGORA mostra apenas a
    // mensagem acionável. A pergunta continua disponível no contrato, sem
    // ocupar dois blocos com o mesmo conteúdo no primeiro nível.
    if (
      normalizedQuestion &&
      normalizeForComparison(
        recommendedMessage,
      ).includes(
        normalizedQuestion,
      )
    ) {
      return ''
    }

    return `
      <div class="yolen-decision-block">
        <div class="yolen-decision-kicker">
          Pergunta recomendada
        </div>

        <div class="yolen-decision-copy">
          ${escapeHtml(question)}
        </div>
      </div>
    `
  }

  function getRichOperationalSuggestionHtml(
    commercialReading,
  ) {
    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    const items = []

    if (
      crm
        ?.should_change_crm_stage ===
        true &&
      crm
        .requires_human_confirmation ===
        true &&
      crm
        .recommended_status
    ) {
      const currentStatus =
        state
          .leadResolution
          ?.cycle
          ?.status

      const currentLabel =
        currentStatus
          ? getStageLabel(
              currentStatus,
            )
          : null

      const targetLabel =
        getStageLabel(
          crm.recommended_status,
        )

      const rationale =
        getCommercialReadingDisplayText(
          crm.rationale,
        )

      if (
        targetLabel &&
        rationale
      ) {
        const stageText =
          currentLabel
            ? `${currentLabel} → ${targetLabel}`
            : targetLabel

        items.push(`
          <div class="yolen-rich-evolution-item">
            <div class="yolen-rich-evolution-header">
              <div class="yolen-rich-evolution-label">
                CRM
              </div>

              <div class="yolen-rich-status yolen-rich-status-active">
                Confirmar
              </div>
            </div>

            <div class="yolen-rich-evolution-copy">
              Etapa: ${escapeHtml(
                stageText,
              )}
            </div>

            <div class="yolen-rich-evolution-copy">
              Motivo: ${escapeHtml(
                rationale,
              )}
            </div>
          </div>
        `)
      }
    }

    if (
      agenda
        ?.should_change_agenda ===
        true &&
      agenda
        .requires_human_confirmation ===
        true
    ) {
      const agendaDate =
        agenda
          .expected_next_action_at
          ? formatSuggestionDate(
              agenda
                .expected_next_action_at,
            )
          : null

      const rationale =
        getCommercialReadingDisplayText(
          agenda.rationale,
        )

      if (
        agendaDate &&
        rationale
      ) {
        items.push(`
          <div class="yolen-rich-evolution-item">
            <div class="yolen-rich-evolution-header">
              <div class="yolen-rich-evolution-label">
                Agenda
              </div>

              <div class="yolen-rich-status yolen-rich-status-active">
                Confirmar
              </div>
            </div>

            <div class="yolen-rich-evolution-copy">
              Quando: ${escapeHtml(
                agendaDate,
              )}
            </div>

            <div class="yolen-rich-evolution-copy">
              Motivo: ${escapeHtml(
                rationale,
              )}
            </div>
          </div>
        `)
      }
    }

    if (
      items.length === 0
    ) {
      return ''
    }

    const applyAvailable =
      canApplyCurrentSuggestion()

    return `
      <div class="yolen-decision-block yolen-operational-suggestion">
        <div class="yolen-decision-kicker">
          Atualização na Yolen
        </div>

        <div class="yolen-rich-evolution">
          ${items.join('')}
        </div>

        <div class="yolen-operational-note">
          Nada será alterado sem sua confirmação.
          ${
            applyAvailable
              ? ' Revise as mudanças acima antes de confirmar.'
              : ' A aplicação desta recomendação não está disponível nesta leitura.'
          }
        </div>
      </div>
    `
  }

  function getCommercialReadingDisplayText(
    value,
  ) {
    if (
      typeof value !==
      'string'
    ) {
      return null
    }

    const clean =
      value.trim()

    return clean || null
  }

  function getRichReadingFactHtml(
    label,
    item,
  ) {
    const summary =
      getCommercialReadingDisplayText(
        item?.summary,
      )

    if (!summary) {
      return ''
    }

    return `
      <div class="yolen-rich-fact">
        <div class="yolen-rich-fact-label">
          ${escapeHtml(label)}
        </div>

        <div class="yolen-rich-fact-copy">
          ${escapeHtml(summary)}
        </div>
      </div>
    `
  }

  function getRichReadingListHtml(
    label,
    items,
  ) {
    const summaries =
      Array.isArray(items)
        ? items
            .map(
              item =>
                getCommercialReadingDisplayText(
                  item?.summary,
                ),
            )
            .filter(Boolean)
        : []

    if (
      summaries.length === 0
    ) {
      return ''
    }

    return `
      <div class="yolen-rich-group">
        <div class="yolen-rich-group-label">
          ${escapeHtml(label)}
        </div>

        <div class="yolen-rich-list">
          ${summaries
            .map(
              summary => `
                <div class="yolen-rich-list-item">
                  ${escapeHtml(summary)}
                </div>
              `,
            )
            .join('')}
        </div>
      </div>
    `
  }

  function getRichConversationSummaryHtml(
    commercialReading,
  ) {
    const summary =
      commercialReading
        ?.conversation_summary

    if (!summary) {
      return ''
    }

    const blocks = [
      getRichReadingFactHtml(
        'Contexto inicial',
        summary.initial_context,
      ),
      getRichReadingFactHtml(
        'Como a conversa evoluiu',
        summary.evolution,
      ),
      getRichReadingListHtml(
        'Eventos importantes',
        summary.important_events,
      ),
      getRichReadingFactHtml(
        'Última solicitação ou decisão',
        summary
          .last_customer_request_or_decision,
      ),
    ].filter(Boolean)

    if (
      blocks.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Resumo da conversa
        </div>

        ${blocks.join('')}
      </section>
    `
  }

  function getRichCustomerGroupHtml(
    label,
    items,
  ) {
    return getRichReadingListHtml(
      label,
      items,
    )
  }

  function getRichCustomerHtml(
    commercialReading,
  ) {
    const customer =
      commercialReading
        ?.customer

    if (!customer) {
      return ''
    }

    const groups = [
      getRichCustomerGroupHtml(
        'Necessidades',
        customer.needs,
      ),
      getRichCustomerGroupHtml(
        'Interesses',
        customer.interests,
      ),
      getRichCustomerGroupHtml(
        'Critérios de decisão',
        customer
          .decision_criteria,
      ),
      getRichCustomerGroupHtml(
        'Preferências',
        customer.preferences,
      ),
      getRichCustomerGroupHtml(
        'Perguntas em aberto',
        customer
          .open_questions,
      ),
      getRichCustomerGroupHtml(
        'Objeções identificadas',
        customer.objections,
      ),
      getRichCustomerGroupHtml(
        'Incertezas',
        customer.uncertainties,
      ),
    ].filter(Boolean)

    if (
      groups.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Cliente
        </div>

        ${groups.join('')}
      </section>
    `
  }

  function getCommercialEvolutionStatusLabel(
    status,
  ) {
    const labels = {
      completed: 'Concluído',
      active: 'Ativo',
      partial: 'Parcial',
      pending: 'Pendente',
      not_started:
        'Não iniciado',
      skipped: 'Pulado',
      not_applicable:
        'Não se aplica',
    }

    return (
      labels[status] ||
      String(status || '')
    )
  }

  function getCommercialEvolutionStatusClass(
    status,
  ) {
    const classes = {
      completed:
        'yolen-rich-status-completed',
      active:
        'yolen-rich-status-active',
      partial:
        'yolen-rich-status-partial',
      pending:
        'yolen-rich-status-pending',
      not_started:
        'yolen-rich-status-not-started',
      skipped:
        'yolen-rich-status-skipped',
      not_applicable:
        'yolen-rich-status-not-applicable',
    }

    return (
      classes[status] ||
      'yolen-rich-status-neutral'
    )
  }

  function getRichCommercialEvolutionHtml(
    commercialReading,
  ) {
    const items =
      Array.isArray(
        commercialReading
          ?.commercial_evolution,
      )
        ? commercialReading
            .commercial_evolution
            .map((item) => {
              const label =
                getCommercialReadingDisplayText(
                  item?.label,
                )

              const explanation =
                getCommercialReadingDisplayText(
                  item?.explanation,
                )

              if (
                !label ||
                !explanation
              ) {
                return null
              }

              return {
                label,
                explanation,
                status:
                  item?.status || '',
              }
            })
            .filter(Boolean)
        : []

    if (
      items.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Evolução comercial
        </div>

        <div class="yolen-rich-evolution">
          ${items
            .map(
              item => `
                <div class="yolen-rich-evolution-item">
                  <div class="yolen-rich-evolution-header">
                    <div class="yolen-rich-evolution-label">
                      ${escapeHtml(
                        item.label,
                      )}
                    </div>

                    <div class="yolen-rich-status ${getCommercialEvolutionStatusClass(
                      item.status,
                    )}">
                      ${escapeHtml(
                        getCommercialEvolutionStatusLabel(
                          item.status,
                        ),
                      )}
                    </div>
                  </div>

                  <div class="yolen-rich-evolution-copy">
                    ${escapeHtml(
                      item.explanation,
                    )}
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  function getCommercialMethodStatusLabel(
    status,
  ) {
    const labels = {
      completed: 'Concluído',
      active: 'Ativo',
      partial: 'Parcial',
      not_started:
        'Não iniciado',
      skipped: 'Pulado',
      not_applicable:
        'Não se aplica',
    }

    return (
      labels[status] ||
      null
    )
  }

  function getRichCommercialMethodHtml(
    commercialReading,
  ) {
    const method =
      commercialReading
        ?.method

    if (!method) {
      return ''
    }

    if (
      method.configured ===
      false
    ) {
      return `
        <section class="yolen-rich-section">
          <div class="yolen-rich-section-title">
            Método comercial
          </div>

          <div class="yolen-rich-fact-copy">
            Nenhum método comercial está configurado para esta operação.
          </div>
        </section>
      `
    }

    if (
      method.configured !==
      true
    ) {
      return ''
    }

    const methodName =
      getCommercialReadingDisplayText(
        method.name,
      )

    const stages =
      Array.isArray(
        method.stages,
      )
        ? method.stages
            .map((stage) => {
              const name =
                getCommercialReadingDisplayText(
                  stage?.name,
                )

              const explanation =
                getCommercialReadingDisplayText(
                  stage?.explanation,
                )

              const statusLabel =
                getCommercialMethodStatusLabel(
                  stage?.status,
                )

              const stepOrder =
                Number.isSafeInteger(
                  stage?.step_order,
                ) &&
                stage.step_order > 0
                  ? stage.step_order
                  : null

              if (
                !name ||
                !explanation ||
                !statusLabel ||
                stepOrder === null
              ) {
                return null
              }

              return {
                name,
                explanation,
                status:
                  stage.status,
                statusLabel,
                stepOrder,
              }
            })
            .filter(Boolean)
            .sort(
              (
                left,
                right,
              ) =>
                left.stepOrder -
                right.stepOrder,
            )
        : []

    if (
      !methodName ||
      stages.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Método comercial
        </div>

        <div class="yolen-rich-group">
          <div class="yolen-rich-group-label">
            Método configurado
          </div>

          <div class="yolen-rich-fact-copy">
            ${escapeHtml(
              methodName,
            )}
          </div>
        </div>

        <div class="yolen-rich-evolution">
          ${stages
            .map(
              stage => `
                <div class="yolen-rich-evolution-item">
                  <div class="yolen-rich-evolution-header">
                    <div class="yolen-rich-evolution-label">
                      ${escapeHtml(
                        stage.name,
                      )}
                    </div>

                    <div class="yolen-rich-status ${getCommercialEvolutionStatusClass(
                      stage.status,
                    )}">
                      ${escapeHtml(
                        stage.statusLabel,
                      )}
                    </div>
                  </div>

                  <div class="yolen-rich-evolution-copy">
                    ${escapeHtml(
                      stage.explanation,
                    )}
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>

        <div class="yolen-operational-note">
          Esta leitura mostra aderência ao método e não determina avanço automático.
        </div>
      </section>
    `
  }

  function getRichSellerStrengthsHtml(
    commercialReading,
  ) {
    const strengths =
      Array.isArray(
        commercialReading
          ?.seller_strengths,
      )
        ? commercialReading
            .seller_strengths
            .map(item =>
              getCommercialReadingDisplayText(
                item?.summary,
              ),
            )
            .filter(Boolean)
        : []

    if (
      strengths.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Acertos do vendedor
        </div>

        <div class="yolen-rich-list">
          ${strengths
            .map(
              summary => `
                <div class="yolen-rich-list-item">
                  ${escapeHtml(
                    summary,
                  )}
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  function getRichImprovementPointsHtml(
    commercialReading,
  ) {
    const improvements =
      Array.isArray(
        commercialReading
          ?.improvement_points,
      )
        ? commercialReading
            .improvement_points
            .map((item) => {
              const summary =
                getCommercialReadingDisplayText(
                  item?.summary,
                )

              const impact =
                getCommercialReadingDisplayText(
                  item?.impact,
                )

              if (
                !summary ||
                !impact
              ) {
                return null
              }

              return {
                summary,
                impact,
              }
            })
            .filter(Boolean)
        : []

    if (
      improvements.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Pontos de melhoria
        </div>

        <div class="yolen-rich-evolution">
          ${improvements
            .map(
              item => `
                <div class="yolen-rich-evolution-item">
                  <div class="yolen-rich-evolution-copy">
                    ${escapeHtml(
                      item.summary,
                    )}
                  </div>

                  <div class="yolen-rich-fact-label">
                    Impacto
                  </div>

                  <div class="yolen-rich-evolution-copy">
                    ${escapeHtml(
                      item.impact,
                    )}
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  function getCommercialRiskSeverityLabel(
    severity,
  ) {
    const labels = {
      low: 'Baixo',
      medium: 'Médio',
      high: 'Alto',
    }

    return (
      labels[severity] ||
      null
    )
  }

  function getRichRiskGroupHtml(
    label,
    risks,
  ) {
    const items =
      Array.isArray(risks)
        ? risks
            .map((risk) => {
              const summary =
                getCommercialReadingDisplayText(
                  risk?.summary,
                )

              const severity =
                getCommercialRiskSeverityLabel(
                  risk?.severity,
                )

              if (
                !summary ||
                !severity
              ) {
                return null
              }

              return {
                summary,
                severity,
              }
            })
            .filter(Boolean)
        : []

    if (
      items.length === 0
    ) {
      return ''
    }

    return `
      <div class="yolen-rich-group">
        <div class="yolen-rich-group-label">
          ${escapeHtml(label)}
        </div>

        <div class="yolen-rich-evolution">
          ${items
            .map(
              item => `
                <div class="yolen-rich-evolution-item">
                  <div class="yolen-rich-evolution-header">
                    <div class="yolen-rich-evolution-label">
                      Risco identificado
                    </div>

                    <div class="yolen-rich-status yolen-rich-status-neutral">
                      ${escapeHtml(
                        item.severity,
                      )}
                    </div>
                  </div>

                  <div class="yolen-rich-evolution-copy">
                    ${escapeHtml(
                      item.summary,
                    )}
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>
      </div>
    `
  }

  function getRichCommercialRisksHtml(
    commercialReading,
  ) {
    const risks =
      commercialReading
        ?.risks

    if (!risks) {
      return ''
    }

    const groups = [
      getRichRiskGroupHtml(
        'Objeções do cliente',
        risks.customer_objections,
      ),
      getRichRiskGroupHtml(
        'Riscos no atendimento',
        risks.service_risks,
      ),
    ].filter(Boolean)

    if (
      groups.length === 0
    ) {
      return ''
    }

    return `
      <section class="yolen-rich-section">
        <div class="yolen-rich-section-title">
          Riscos
        </div>

        ${groups.join('')}
      </section>
    `
  }

  function getRichCommercialReadingExpandedHtml(
    commercialReading,
  ) {
    return sellerInformationViewTools
      .renderAnalysisArea(
        commercialReading,
      )
  }

  function getRichCommercialReadingCardHtml(
    commercialReading,
  ) {
    if (
      sellerInformationViewTools
        .isNeutralCommercialSession(
          commercialReading,
        )
    ) {
      const neutralCopy =
        sellerInformationViewTools
          .getNeutralSessionCopy(
            commercialReading,
          )

      return `
        <div class="yolen-card yolen-decision-card yolen-status-neutral" data-yolen-now-neutral>
          <div class="yolen-decision-header">
            <div class="yolen-section-label">Agora</div>
            <div class="yolen-decision-badge">Neutro</div>
          </div>

          <div class="yolen-decision-block">
            <div class="yolen-card-title yolen-decision-title">
              ${escapeHtml(neutralCopy.title)}
            </div>
            <div class="yolen-decision-copy">
              ${escapeHtml(neutralCopy.description)}
            </div>
          </div>

          ${getDeepAnalysisStatusBlockHtml()}
        </div>
      `
    }

    const currentState =
      typeof commercialReading
        ?.conversation_summary
        ?.current_state
        ?.summary ===
        'string'
        ? commercialReading
            .conversation_summary
            .current_state
            .summary
            .trim()
        : ''

    return `
      <div class="yolen-card yolen-decision-card ${getAnalysisStatusClass()}">
        <div class="yolen-decision-header">
          <div class="yolen-section-label">
            Yolen Companion
          </div>

          <div class="yolen-decision-badge">
            ${escapeHtml(
              getRichCommercialReadingBadge(
                commercialReading,
              ),
            )}
          </div>
        </div>

        <div class="yolen-decision-primary" data-yolen-layer="action">
          ${
            currentState
              ? `
                <div class="yolen-decision-block yolen-decision-block--context" data-yolen-layer="context">
                  <div class="yolen-decision-kicker">
                    Momento atual
                  </div>

                  <div class="yolen-card-title yolen-decision-title">
                    ${escapeHtml(
                      currentState,
                    )}
                  </div>
                </div>
              `
              : ''
          }

          ${getRichCommercialReadingApproachHtml(
            commercialReading,
          )}

          ${getRichRecommendedQuestionHtml(
            commercialReading,
          )}

          ${getSuggestedMessageHtml()}
        </div>

        ${getDeepAnalysisStatusBlockHtml()}

        ${sellerInformationViewTools
          .renderNowAttentionSnapshot(
            commercialReading,
            state.companionClientContext,
            {
              now: Date.now(),
              cycleClosed:
                state.leadResolution
                  ?.flags
                  ?.is_closed === true,
            },
          )}

        ${getNowMoreContextDetailsHtml(
          commercialReading,
        )}

        <div class="yolen-inline-actions yolen-decision-actions">
          ${getAnalysisActionButton()}
        </div>
      </div>
    `
  }

  // Tudo que já respondeu "o que aconteceu" / "o que fazer" / "por que"
  // acima fica sempre visível. O resto (etapa do método, sugestão
  // operacional de CRM/agenda, transcrição de áudio, limitações da
  // leitura) é contexto de apoio: continua no DOM (nada é removido do
  // contrato nem escondido de verdade — <details> fechado ainda expõe seu
  // texto a leitores de tela e a asserções de teste) mas recolhido por
  // padrão, para o primeiro nível do AGORA não virar uma lista de
  // mini-relatórios com o mesmo peso visual da decisão.
  function getNowMoreContextDetailsHtml(
    commercialReading,
  ) {
    const sections = [
      sellerInformationViewTools
        .renderNowMethodSnapshot(
          commercialReading,
        ),
      getRichCommercialReadingLimitationsHtml(
        commercialReading,
      ),
      getRichOperationalSuggestionHtml(
        commercialReading,
      ),
      getAudioTranscriptionHtml(),
    ].filter(Boolean)

    if (sections.length === 0) {
      return ''
    }

    return `
      <details
        class="yolen-seller-secondary-details yolen-now-more-details"
        data-yolen-preserve-details="now-more-details"
        data-yolen-layer="context"
      >
        <summary>Ver mais contexto</summary>
        <div class="yolen-now-more-details-content">
          ${sections.join('')}
        </div>
      </details>
    `
  }

  // Inteligência operacional do cliente (histórico da relação, tempo de
  // resposta, quem está aguardando quem, risco por demora). Deliberadamente
  // independente da análise semântica acima: não depende da IA nem do
  // estado `conversationAnalysis` — é buscada e renderizada à parte, a
  // partir de fatos determinísticos do banco (ver
  // app/api/companion/client-context).
  function clearCompanionClientContextRefreshTimer() {
    if (
      companionClientContextRefreshTimerId
    ) {
      window.clearTimeout(
        companionClientContextRefreshTimerId,
      )

      companionClientContextRefreshTimerId = 0
    }
  }

  // Sinal real de "a captura foi persistida", disparado por
  // runCaptureIngestion() após rememberSuccessfulCapture() — não um sleep
  // arbitrário. Corrige tanto a primeira leitura (que pode ter ocorrido
  // sobre um ledger ainda vazio, antes da ingestão terminar) quanto
  // qualquer leitura posterior (nova mensagem chegando durante a
  // conversa): as duas situações são, no fundo, "o contexto pode estar
  // desatualizado porque uma ingestão acabou de confirmar". O pequeno
  // debounce evita uma requisição por mensagem quando várias chegam em
  // sequência.
  function notifyCaptureIngestedForClientContext(
    contextKey,
  ) {
    const cycleId =
      state.leadResolution?.cycle?.id

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      return
    }

    const currentContextKey = [
      cycleId,
      conversationKey,
    ].join('::')

    if (
      currentContextKey !==
      contextKey
    ) {
      return
    }

    clearCompanionClientContextRefreshTimer()

    companionClientContextRefreshTimerId =
      window.setTimeout(() => {
        companionClientContextRefreshTimerId = 0

        void loadCompanionClientContextForCurrentCycle(
          {
            force: true,
          },
        )
      }, COMPANION_CLIENT_CONTEXT_REFRESH_DELAY_MS)
  }

  async function loadCompanionClientContextForCurrentCycle(
    options = {},
  ) {
    const force =
      options.force === true

    const cycleId =
      state.leadResolution?.cycle?.id

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      state = {
        ...state,
        companionClientContext: {
          status: 'idle',
        },
        companionClientContextCycleId:
          null,
        companionClientContextConversationKey:
          null,
      }

      renderPanel()
      return
    }

    const isSameContext =
      state.companionClientContextCycleId ===
        cycleId &&
      state.companionClientContextConversationKey ===
        conversationKey

    const alreadyReady =
      isSameContext &&
      state.companionClientContext
        ?.status === 'ready'

    if (alreadyReady && !force) {
      return
    }

    // Uma atualização forçada sobre dados já prontos (nova ingestão
    // confirmada, tick periódico) acontece em silêncio: o cartão continua
    // mostrando os últimos dados válidos em vez de piscar para o estado de
    // carregamento a cada mensagem nova. Só a primeiríssima busca de um
    // ciclo (ou uma busca depois de erro/idle) mostra o estado de
    // carregamento.
    const showLoadingState = !alreadyReady

    if (showLoadingState) {
      state = {
        ...state,
        companionClientContext: {
          status: 'loading',
        },
        companionClientContextCycleId:
          cycleId,
        companionClientContextConversationKey:
          conversationKey,
      }

      renderPanel()
    } else {
      state = {
        ...state,
        companionClientContextCycleId:
          cycleId,
        companionClientContextConversationKey:
          conversationKey,
      }
    }

    const isStillCurrentContext =
      () =>
        state.companionClientContextCycleId ===
          cycleId &&
        state.companionClientContextConversationKey ===
          conversationKey

    try {
      const result =
        await window.YolenCompanionApi
          .loadClientContext({
            cycle_id: cycleId,
            conversation_key:
              conversationKey,
          })

      if (!isStillCurrentContext()) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        if (!alreadyReady) {
          state = {
            ...state,
            companionClientContext: {
              status: 'error',
              error:
                result?.payload
                  ?.error ||
                'Não foi possível carregar o relacionamento com o cliente.',
            },
          }

          renderPanel()
        }

        // Atualização em segundo plano que falhou: mantém os dados bons
        // já exibidos em vez de substituí-los por um erro por causa de uma
        // falha transitória — a próxima ingestão/tick tenta de novo.
        return
      }

      state = {
        ...state,
        companionClientContext: {
          status: 'ready',
          data: result.payload.data,
        },
      }

      renderPanel()
    } catch (error) {
      if (!isStillCurrentContext()) {
        return
      }

      if (!alreadyReady) {
        state = {
          ...state,
          companionClientContext: {
            status: 'error',
            error:
              error instanceof Error &&
              error.message
                ? error.message
                : 'Não foi possível carregar o relacionamento com o cliente.',
          },
        }

        renderPanel()
      }
    }
  }

  function getCompanionClientRelationshipCardHtml() {
    if (
      state.companionClientContext
        ?.status === 'idle'
    ) {
      return ''
    }

    return `
      <div class="yolen-card yolen-client-relationship-card">
        <div class="yolen-section-label">
          Relacionamento e histórico
        </div>

        ${clientContextViewTools.renderClientContextSection(
          state.companionClientContext,
          Date.now(),
        )}
      </div>
    `
  }

  function startCompanionClientContextTicker() {
    if (companionClientContextTickTimerId) {
      window.clearInterval(
        companionClientContextTickTimerId,
      )
    }

    companionClientContextTickTimerId =
      window.setInterval(() => {
        if (
          state.companionClientContext
            ?.status === 'ready'
        ) {
          renderPanel()
        }
      }, COMPANION_CLIENT_CONTEXT_TICK_INTERVAL_MS)
  }

  function getAnalysisCardHtml() {
    const commercialReading =
      getActiveCommercialReading()

    if (
      commercialReading &&
      !state
        .conversationAnalysisLoading &&
      !state
        .conversationAnalysisError &&
      !state
        .suggestionApplyLoading &&
      !state
        .suggestionApplyError &&
      !state
        .suggestionApplyResult &&
      !isCurrentAnalysisOutdated()
    ) {
      return (
        getRichCommercialReadingCardHtml(
          commercialReading,
        )
      )
    }

    return (
      getLegacyAnalysisCardHtml()
    )
  }

  function getDetailedAnalysisAreaHtml() {
    const commercialReading =
      getActiveCommercialReading()

    if (
      commercialReading &&
      !state.conversationAnalysisLoading &&
      !state.conversationAnalysisError &&
      !isCurrentAnalysisOutdated()
    ) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-analysis-area-card">
          ${getRichCommercialReadingExpandedHtml(
            commercialReading,
          )}
        </div>
      `
    }

    if (state.conversationAnalysisLoading) {
      return `
        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-loading role="status" aria-live="polite">
            ${getInlineSpinnerHtml()}
            Analisando sua condução comercial…
          </div>
        </div>
      `
    }

    if (state.conversationAnalysisError) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-status-warning">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-error role="alert">
            ${escapeHtml(state.conversationAnalysisError)}
          </div>
          ${
            canAnalyzeCurrentConversation()
              ? `
                <div class="yolen-inline-actions">
                  <button
                    class="yolen-secondary-button"
                    type="button"
                    data-yolen-action="analyze-conversation"
                  >
                    Tentar novamente
                  </button>
                </div>
              `
              : ''
          }
        </div>
      `
    }

    if (isCurrentAnalysisOutdated()) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-status-warning">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-outdated>
            A conversa mudou. Atualize a leitura para avaliar a condução atual.
          </div>
        </div>
      `
    }

    return `
      <div class="yolen-card yolen-seller-area-card">
        <div class="yolen-section-label">Análise</div>
        <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
          A leitura atual oferece somente orientação imediata. Ainda não há análise detalhada de coaching e método.
        </div>
      </div>
    `
  }

  function getClientInformationAreaHtml() {
    const commercialReading =
      getActiveCommercialReading()

    const commercialHtml =
      commercialReading &&
      !state.conversationAnalysisError &&
      !isCurrentAnalysisOutdated()
        ? sellerInformationViewTools
            .renderClientCommercialArea(
              commercialReading,
            )
        : ''

    const relationshipHtml =
      getCompanionClientRelationshipCardHtml()

    if (!commercialHtml && !relationshipHtml) {
      return `
        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Cliente</div>
          <div class="yolen-seller-empty-state" data-yolen-client-empty>
            Ainda não há informações suficientes sobre este cliente.
          </div>
        </div>
      `
    }

    return `
      ${commercialHtml}
      ${relationshipHtml}
    `
  }

  function getSellerAreaTabHtml(
    area,
    label,
  ) {
    const selected =
      activeSellerArea === area

    return `
      <button
        id="yolen-seller-tab-${escapeHtml(area)}"
        class="yolen-seller-tab ${selected ? 'yolen-seller-tab--active' : ''}"
        type="button"
        role="tab"
        data-yolen-seller-area="${escapeHtml(area)}"
        aria-selected="${selected ? 'true' : 'false'}"
        aria-controls="yolen-seller-panel-${escapeHtml(area)}"
        tabindex="${selected ? '0' : '-1'}"
      >
        ${escapeHtml(label)}
      </button>
    `
  }

  function getSellerAreaPanelHtml(
    area,
    content,
  ) {
    const selected =
      activeSellerArea === area

    return `
      <section
        id="yolen-seller-panel-${escapeHtml(area)}"
        class="yolen-seller-panel"
        role="tabpanel"
        aria-labelledby="yolen-seller-tab-${escapeHtml(area)}"
        data-yolen-seller-panel="${escapeHtml(area)}"
        ${selected ? '' : 'hidden'}
      >
        ${content}
      </section>
    `
  }

  function getSellerInformationArchitectureHtml() {
    return `
      <div class="yolen-seller-workspace">
        <div
          class="yolen-seller-tabs"
          role="tablist"
          aria-label="Áreas do Yolen Companion"
        >
          ${getSellerAreaTabHtml('now', 'Agora')}
          ${getSellerAreaTabHtml('analysis', 'Análise')}
          ${getSellerAreaTabHtml('client', 'Cliente')}
        </div>

        ${getSellerAreaPanelHtml(
          'now',
          getAnalysisCardHtml(),
        )}

        ${getSellerAreaPanelHtml(
          'analysis',
          getDetailedAnalysisAreaHtml(),
        )}

        ${getSellerAreaPanelHtml(
          'client',
          getClientInformationAreaHtml(),
        )}
      </div>
    `
  }

  function setActiveSellerArea(
    nextArea,
    options = {},
  ) {
    const areas = [
      'now',
      'analysis',
      'client',
    ]

    if (!areas.includes(nextArea)) {
      return
    }

    activeSellerArea = nextArea
    renderPanel()

    if (options.focus === true) {
      window.setTimeout(() => {
        document
          .getElementById(
            `yolen-seller-tab-${nextArea}`,
          )
          ?.focus()
      }, 0)
    }
  }

  function handleSellerAreaKeyboard(
    event,
  ) {
    const areas = [
      'now',
      'analysis',
      'client',
    ]

    const currentArea =
      event.currentTarget
        ?.getAttribute(
          'data-yolen-seller-area',
        )

    const currentIndex =
      areas.indexOf(currentArea)

    if (currentIndex < 0) {
      return
    }

    let nextIndex = null

    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowDown'
    ) {
      nextIndex =
        (currentIndex + 1) %
        areas.length
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowUp'
    ) {
      nextIndex =
        (currentIndex - 1 + areas.length) %
        areas.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = areas.length - 1
    }

    if (nextIndex === null) {
      return
    }

    event.preventDefault()
    setActiveSellerArea(
      areas[nextIndex],
      { focus: true },
    )
  }

  function getLeadEnrichmentAddressValue(
    profile,
  ) {
    const parts = [
      profile?.address_street,
      profile?.address_number,
      profile?.address_complement,
      profile?.address_neighborhood,
      profile?.address_city,
      profile?.address_state,
    ]
      .map((value) =>
        String(value || '').trim(),
      )
      .filter(Boolean)

    return parts.length > 0
      ? parts.join(', ')
      : null
  }

  function getCurrentLeadEnrichmentValue(
    field,
    resolution,
  ) {
    const lead =
      resolution?.lead || {}

    const profile =
      resolution?.lead_profile || {}

    if (field === 'email') {
      return (
        lead.email ||
        profile.email ||
        null
      )
    }

    if (field === 'cpf') {
      return (
        profile.cpf ||
        (
          onlyDigits(
            lead.cpf_cnpj,
          ).length === 11
            ? onlyDigits(
                lead.cpf_cnpj,
              )
            : null
        )
      )
    }

    if (field === 'cnpj') {
      return (
        profile.cnpj ||
        (
          onlyDigits(
            lead.cpf_cnpj,
          ).length === 14
            ? onlyDigits(
                lead.cpf_cnpj,
              )
            : null
        )
      )
    }

    if (field === 'birth_date') {
      return profile.birth_date || null
    }

    if (field === 'profession') {
      return profile.profession || null
    }

    if (field === 'cep') {
      return profile.cep || null
    }

    if (field === 'address_raw') {
      return getLeadEnrichmentAddressValue(
        profile,
      )
    }

    if (field === 'phone_mobile') {
      return profile.phone_mobile || null
    }

    return null
  }

  function normalizeLeadEnrichmentComparisonValue(
    value,
  ) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function areSameLeadEnrichmentValue(
    field,
    currentValue,
    candidateValue,
  ) {
    if (
      !currentValue ||
      !candidateValue
    ) {
      return false
    }

    if (
      field === 'cpf' ||
      field === 'cnpj' ||
      field === 'cep'
    ) {
      return (
        onlyDigits(currentValue) ===
        onlyDigits(candidateValue)
      )
    }

    if (
      field === 'phone_mobile' &&
      typeof leadEnrichmentTools
        ?.areEquivalentPhones ===
        'function'
    ) {
      return leadEnrichmentTools
        .areEquivalentPhones(
          currentValue,
          candidateValue,
        )
    }

    const currentNormalized =
      normalizeLeadEnrichmentComparisonValue(
        currentValue,
      )

    const candidateNormalized =
      normalizeLeadEnrichmentComparisonValue(
        candidateValue,
      )

    if (
      !currentNormalized ||
      !candidateNormalized
    ) {
      return false
    }

    if (field === 'address_raw') {
      return (
        currentNormalized ===
          candidateNormalized ||
        currentNormalized.includes(
          candidateNormalized,
        ) ||
        candidateNormalized.includes(
          currentNormalized,
        )
      )
    }

    return (
      currentNormalized ===
      candidateNormalized
    )
  }

  function getLeadEnrichmentCandidates() {
    const resolution =
      state.leadResolution

    const isNewLead =
      resolution?.status ===
      'NOT_FOUND'

    const isOwnedLead =
      resolution?.status ===
        'OWNED_BY_ME' &&
      resolution?.lead?.id &&
      resolution?.cycle?.id

    if (
      !leadEnrichmentTools ||
      typeof leadEnrichmentTools
        .extractLeadEnrichmentCandidates !==
        'function' ||
      typeof leadEnrichmentTools
        .isLeadEnrichmentCandidate !==
        'function' ||
      (
        !isNewLead &&
        !isOwnedLead
      )
    ) {
      return []
    }

    const messages =
      getStructuredMessagesForEnrichment()

    const candidates =
      leadEnrichmentTools
        .extractLeadEnrichmentCandidates(
          messages,
          {
            currentPhone:
              resolution?.lead?.phone ||
              state.conversationPhone ||
              null,
          },
        )
        .filter(
          (candidate) =>
            leadEnrichmentTools
              .isLeadEnrichmentCandidate(
                candidate,
              ),
        )

    if (isNewLead) {
      return candidates.map(
        (candidate) => ({
          ...candidate,
          current_value: null,
          comparison: 'new_lead',
        }),
      )
    }

    return candidates.flatMap(
      (candidate) => {
        const currentValue =
          getCurrentLeadEnrichmentValue(
            candidate.field,
            resolution,
          )

        if (
          currentValue &&
          areSameLeadEnrichmentValue(
            candidate.field,
            currentValue,
            candidate.normalized_value,
          )
        ) {
          return []
        }

        return [{
          ...candidate,
          current_value:
            currentValue || null,
          comparison:
            currentValue
              ? 'different'
              : 'missing',
        }]
      },
    )
  }

  function getLeadEnrichmentFieldLabel(
    field,
  ) {
    const labels = {
      email: 'E-mail',
      cpf: 'CPF',
      cnpj: 'CNPJ',
      birth_date: 'Data de nascimento',
      profession: 'Profissão',
      cep: 'CEP',
      address_raw: 'Endereço',
      phone_mobile:
        'Telefone adicional',
    }

    return (
      labels[field] ||
      'Dado cadastral'
    )
  }

  function getLeadEnrichmentCandidateKey(
    candidate,
  ) {
    const evidenceIds =
      Array.isArray(
        candidate?.evidence_message_ids,
      )
        ? candidate.evidence_message_ids
        : []

    return [
      state.leadResolution?.lead?.id || '',
      candidate?.field || '',
      candidate?.normalized_value || '',
      candidate?.current_value || '',
      ...evidenceIds,
    ].join('::')
  }

  function isConfirmableLeadEnrichmentCandidate(
    candidate,
  ) {
    return [
      'email',
      'cpf',
      'cnpj',
      'birth_date',
      'profession',
      'cep',
      'phone_mobile',
    ].includes(
      candidate?.field,
    )
  }

  function getVisibleLeadEnrichmentCandidates() {
    return getLeadEnrichmentCandidates()
      .filter((candidate) => {
        const candidateKey =
          getLeadEnrichmentCandidateKey(
            candidate,
          )

        return !ignoredLeadEnrichmentCandidateKeys
          .has(candidateKey)
      })
  }

  function ignoreLeadEnrichmentCandidate(
    candidateKey,
  ) {
    if (!candidateKey) {
      return
    }

    ignoredLeadEnrichmentCandidateKeys
      .add(candidateKey)

    state = {
      ...state,
      leadEnrichmentApplySuccessKey:
        null,
      leadEnrichmentApplyError:
        null,
    }

    renderPanel()
  }

  async function applyLeadEnrichmentCandidate(
    candidateKey,
  ) {
    if (
      !candidateKey ||
      state.leadEnrichmentApplyLoadingKey
    ) {
      return
    }

    const resolution =
      state.leadResolution

    if (
      resolution?.status !==
        'OWNED_BY_ME' ||
      !resolution?.lead?.id ||
      !resolution?.cycle?.id
    ) {
      return
    }

    const candidate =
      getVisibleLeadEnrichmentCandidates()
        .find((item) => {
          return (
            getLeadEnrichmentCandidateKey(
              item,
            ) === candidateKey
          )
        })

    if (!candidate) {
      return
    }

    if (
      candidate
        .requires_human_confirmation !==
        true ||
      !isConfirmableLeadEnrichmentCandidate(
        candidate,
      )
    ) {
      state = {
        ...state,
        leadEnrichmentApplyError:
          'Este dado exige revisão manual antes de alterar o cadastro.',
      }

      renderPanel()
      return
    }

    if (
      !window
        .YolenCompanionApi
        ?.applyLeadEnrichment
    ) {
      state = {
        ...state,
        leadEnrichmentApplyError:
          'Atualização cadastral indisponível nesta versão do Companion.',
      }

      renderPanel()
      return
    }

    state = {
      ...state,
      leadEnrichmentApplyLoadingKey:
        candidateKey,
      leadEnrichmentApplySuccessKey:
        null,
      leadEnrichmentApplyError:
        null,
    }

    renderPanel()

    try {
      const result =
        await window
          .YolenCompanionApi
          .applyLeadEnrichment({
            lead_id:
              resolution.lead.id,
            cycle_id:
              resolution.cycle.id,
            field:
              candidate.field,
            value:
              candidate.normalized_value,
            expected_current_value:
              candidate.current_value ||
              null,
            evidence_message_ids:
              candidate
                .evidence_message_ids,
            confirmed_by_human:
              true,
          })

      if (
        !result?.ok ||
        !result?.payload?.ok
      ) {
        throw new Error(
          result?.payload?.error ||
            'Não foi possível atualizar o cadastro.',
        )
      }

      state = {
        ...state,
        leadEnrichmentApplyLoadingKey:
          null,
        leadEnrichmentApplySuccessKey:
          candidateKey,
        leadEnrichmentApplyError:
          null,
      }

      renderPanel()

      window.setTimeout(() => {
        const panel =
          document.getElementById(
            PANEL_ID,
          )

        panel
          ?.querySelector(
            '[data-yolen-action="refresh"]',
          )
          ?.click()
      }, 350)
    } catch (error) {
      state = {
        ...state,
        leadEnrichmentApplyLoadingKey:
          null,
        leadEnrichmentApplySuccessKey:
          null,
        leadEnrichmentApplyError:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Erro ao atualizar o cadastro.',
      }

      renderPanel()
    }
  }

  function getLeadEnrichmentCandidateActionsHtml(
    candidate,
  ) {
    const candidateKey =
      getLeadEnrichmentCandidateKey(
        candidate,
      )

    const isApplying =
      state
        .leadEnrichmentApplyLoadingKey ===
      candidateKey

    const isApplied =
      state
        .leadEnrichmentApplySuccessKey ===
      candidateKey

    const actionsLocked =
      Boolean(
        state
          .leadEnrichmentApplyLoadingKey,
      ) ||
      isApplied

    const ignoreButton = [
      '<button',
        ' class="yolen-secondary-button"',
        ' type="button"',
        ' data-yolen-action="ignore-lead-enrichment"',
        ' data-yolen-enrichment-key="' +
          escapeHtml(candidateKey) +
          '"',
        actionsLocked
          ? ' disabled'
          : '',
      '>',
        'Ignorar',
      '</button>',
    ].join('')

    if (
      !isConfirmableLeadEnrichmentCandidate(
        candidate,
      ) ||
      candidate
        .requires_human_confirmation !==
        true
    ) {
      return [
        '<div class="yolen-inline-actions">',
          ignoreButton,
        '</div>',
        '<div class="yolen-operational-note">',
          'Este campo exige revisão manual.',
        '</div>',
      ].join('')
    }

    const confirmButton = [
      '<button',
        ' class="yolen-primary-button"',
        ' type="button"',
        ' data-yolen-action="confirm-lead-enrichment"',
        ' data-yolen-enrichment-key="' +
          escapeHtml(candidateKey) +
          '"',
        actionsLocked
          ? ' disabled'
          : '',
      '>',
        isApplied
          ? 'Atualizado'
          : isApplying
            ? 'Salvando...'
            : 'Confirmar',
      '</button>',
    ].join('')

    return [
      '<div class="yolen-inline-actions yolen-enrichment-actions">',
        confirmButton,
        ignoreButton,
      '</div>',
    ].join('')
  }

  function getLeadEnrichmentCandidatesHtml() {
    if (
      state.leadResolution?.status ===
      'NOT_FOUND'
    ) {
      return ''
    }

    const candidates =
      getVisibleLeadEnrichmentCandidates()

    if (candidates.length === 0) {
      return ''
    }

    const items =
      candidates
        .map((candidate) => {
          const evidenceCount =
            candidate
              .evidence_message_ids
              .length

          const evidenceLabel =
            evidenceCount === 1
              ? '1 mensagem de evidência'
              : `${evidenceCount} mensagens de evidência`

          const confidenceLabel =
            candidate.confidence ===
            'high'
              ? 'Alta confiança'
              : 'Média confiança'

          const comparisonLabel =
            candidate.current_value
              ? (
                  'Atual: ' +
                  candidate.current_value
                )
              : 'Ainda não consta no cadastro'

          return [
            '<div class="yolen-decision-list-item">',
              '<div class="yolen-decision-kicker">',
                escapeHtml(
                  getLeadEnrichmentFieldLabel(
                    candidate.field,
                  ),
                ),
              '</div>',
              '<div class="yolen-decision-copy">',
                escapeHtml(
                  candidate.value,
                ),
              '</div>',
              '<div class="yolen-card-description">',
                escapeHtml(
                  confidenceLabel +
                  ' · ' +
                  evidenceLabel +
                  ' · ' +
                  comparisonLabel,
                ),
              '</div>',
              getLeadEnrichmentCandidateActionsHtml(
                candidate,
              ),
            '</div>',
          ].join('')
        })
        .join('')

    return [
      '<div class="yolen-card yolen-lead-enrichment-card">',
        '<div class="yolen-section-label">',
          'Cadastro',
        '</div>',

        '<div class="yolen-card-title">',
          'Dados encontrados na conversa',
        '</div>',

        '<div class="yolen-card-description">',
          'A Yolen identificou informações que podem complementar o cadastro deste lead.',
        '</div>',

        '<div class="yolen-decision-list">',
          items,
        '</div>',

        state.leadEnrichmentApplyError
          ? [
              '<div class="yolen-operational-note">',
                escapeHtml(
                  state
                    .leadEnrichmentApplyError,
                ),
              '</div>',
            ].join('')
          : '',

        '<div class="yolen-operational-note">',
          'O cadastro só muda depois que você confirmar.',
        '</div>',
      '</div>',
    ].join('')
  }

  globalThis
    .YolenCompanionLeadEnrichmentContext =
      Object.freeze({
        getCandidates: () =>
          getLeadEnrichmentCandidates(),
      })

  function getCompactConnectionLabel() {
    if (state.loading) {
      return 'Conectando'
    }

    if (state.connected) {
      return 'Conectada'
    }

    return 'Desconectada'
  }

  function getCompactConnectionClass() {
    if (state.loading) {
      return 'yolen-connection-pending'
    }

    if (state.connected) {
      return 'yolen-connection-online'
    }

    return 'yolen-connection-offline'
  }

  function getCompactConversationName() {
    return (
      state
        .leadResolution
        ?.lead
        ?.name ||
      state.conversationTitle ||
      'Nenhuma conversa detectada'
    )
  }

  function getCompactLeadDescription() {
    if (state.isSelfConversation) {
      return 'Esta conversa não é vinculada a um lead comercial.'
    }

    if (state.isGroupConversation) {
      return 'Conversas em grupo não são vinculadas a leads.'
    }

    if (state.leadResolutionLoading) {
      return 'Localizando este contato na Yolen...'
    }

    if (state.leadResolutionError) {
      return state.leadResolutionError
    }

    if (!state.connected) {
      return 'Conecte a Yolen para ativar o Companion nesta conversa.'
    }

    if (!state.conversationPhone) {
      return (
        state.autoLookupStatus ||
        'Identificando o contato automaticamente...'
      )
    }

    const resolution =
      state.leadResolution

    if (!resolution) {
      return 'Localizando vínculo comercial...'
    }

    if (
      resolution.status ===
      'OWNED_BY_ME'
    ) {
      return 'Lead vinculado à sua carteira.'
    }

    if (
      resolution.status ===
      'OWNED_BY_OTHER'
    ) {
      return (
        resolution.user_message ||
        'Este lead pertence a outra carteira.'
      )
    }

    if (
      resolution.status ===
      'IN_POOL'
    ) {
      return (
        resolution.user_message ||
        'Este lead está no Pool.'
      )
    }

    if (
      resolution.status ===
      'NOT_FOUND'
    ) {
      return (
        resolution.user_message ||
        'Este contato ainda não existe na Yolen.'
      )
    }

    if (
      resolution.status ===
      'CLOSED_CYCLE'
    ) {
      return (
        resolution.user_message ||
        'Este ciclo comercial já está encerrado.'
      )
    }

    return (
      resolution.user_message ||
      'Contato localizado na Yolen.'
    )
  }

  function getCompactContextChipsHtml() {
    const cycle =
      state
        .leadResolution
        ?.cycle

    const chips = []

    if (cycle?.status) {
      chips.push(
        '<span class="yolen-context-chip">' +
          escapeHtml(
            getStageLabel(
              cycle.status,
            ),
          ) +
        '</span>',
      )
    }

    if (cycle?.owner_name) {
      chips.push(
        '<span class="yolen-context-chip yolen-context-chip-muted">' +
          escapeHtml(
            cycle.owner_name,
          ) +
        '</span>',
      )
    }

    if (chips.length === 0) {
      return ''
    }

    return (
      '<div class="yolen-context-chips">' +
        chips.join('') +
      '</div>'
    )
  }

  function getCompactFooterHtml() {
    if (!state.connected) {
      return [
        '<div class="yolen-compact-footer">',
          '<button',
            ' class="yolen-primary-button"',
            ' type="button"',
            ' data-yolen-action="connect-yolen"',
          '>',
            'Conectar Yolen',
          '</button>',
        '</div>',
      ].join('')
    }

    return [
      '<div class="yolen-compact-footer">',
        '<button',
          ' class="yolen-tertiary-button"',
          ' type="button"',
          ' data-yolen-action="open-yolen"',
        '>',
          'Abrir Yolen',
        '</button>',
      '</div>',
    ].join('')
  }

  function getYolenMarkUrl() {
    const runtime =
      getExtensionRuntime()

    if (!runtime?.getURL) {
      return null
    }

    return runtime.getURL(
      'assets/yolen-mark.png',
    )
  }

  function getYolenMarkHtml() {
    const markUrl =
      getYolenMarkUrl()

    if (!markUrl) {
      return '<span class="yolen-logo-fallback">Y</span>'
    }

    return (
      '<img' +
        ' class="yolen-brand-mark"' +
        ' src="' +
          escapeHtml(markUrl) +
        '"' +
        ' alt="Yolen"' +
      '>'
    )
  }

  function getExtensionStorageLocal() {
    return (
      globalThis
        .browser
        ?.storage
        ?.local ||
      globalThis
        .chrome
        ?.storage
        ?.local ||
      null
    )
  }

  async function loadPanelCollapsedPreference() {
    const storage =
      getExtensionStorageLocal()

    if (!storage?.get) {
      return
    }

    try {
      const stored =
        await storage.get(
          PANEL_COLLAPSED_STORAGE_KEY,
        )

      panelCollapsed =
        stored?.[
          PANEL_COLLAPSED_STORAGE_KEY
        ] === true
    } catch {
      panelCollapsed = false
    }
  }

  function persistPanelCollapsedPreference(
    collapsed,
  ) {
    const storage =
      getExtensionStorageLocal()

    if (!storage?.set) {
      return
    }

    try {
      const result =
        storage.set({
          [PANEL_COLLAPSED_STORAGE_KEY]:
            Boolean(collapsed),
        })

      if (
        result &&
        typeof result.catch ===
          'function'
      ) {
        result.catch(() => {})
      }
    } catch {
      // Preferência visual nunca pode quebrar o Companion.
    }
  }

  // B5_MINIMIZED_INTELLIGENCE_START
  function getCollapsedCompanionAttentionSnapshot() {
    if (
      !state.connected ||
      state.loading ||
      !state.conversationKey
    ) {
      return null
    }

    const commercialReading =
      getActiveCommercialReading()

    const hasCurrentReading =
      Boolean(
        commercialReading &&
        !state.conversationAnalysisLoading &&
        !isCurrentAnalysisOutdated() &&
        commercialReading.analysis_status ===
          'complete',
      )

    const neutralSession =
      hasCurrentReading &&
      sellerInformationViewTools
        .isNeutralCommercialSession(
          commercialReading,
        )

    // Uma conversa pessoal ou incerta não acende sinal comercial no rail.
    // O histórico persistido continua disponível em CLIENTE ao abrir.
    if (neutralSession) {
      return null
    }

    const candidates = []
    const addCandidate = (
      candidate,
      rank,
    ) => {
      if (!candidate) {
        return
      }

      candidates.push({
        ...candidate,
        rank,
      })
    }

    const preSendGateKey =
      getCurrentPreSendGateKey()

    if (preSendGateKey) {
      addCandidate({
        level: 'risk',
        key:
          `risk:${preSendGateKey}`,
        label:
          'Risco comercial antes do envio',
      }, 500)
    }

    const sellerAttention =
      hasCurrentReading
        ? sellerInformationViewTools
            .resolveSellerAttentionSnapshot(
              commercialReading,
              state.companionClientContext,
              {
                now: Date.now(),
                cycleClosed:
                  state.leadResolution
                    ?.flags
                    ?.is_closed === true,
              },
            )
        : null

    if (sellerAttention) {
      const levels = {
        critical: 'risk',
        high: 'attention',
        medium: 'recommendation',
      }

      const ranks = {
        critical: 400,
        high: 300,
        medium: 200,
      }

      addCandidate({
        level:
          levels[
            sellerAttention.priority
          ],
        key:
          [
            'seller-attention',
            state.conversationKey,
            state.analyzedConversationFingerprint,
            sellerAttention.source,
            sellerAttention.priority,
          ]
            .filter(Boolean)
            .join(':'),
        label:
          sellerAttention.copy,
      }, ranks[sellerAttention.priority])
    }

    if (
      state.leadResolution?.status ===
        'NOT_FOUND' &&
      !state.leadResolutionLoading
    ) {
      addCandidate({
        level: 'attention',
        key:
          `attention:new-lead:${state.conversationKey}`,
        label:
          'Contato ainda não cadastrado na Yolen',
      }, 310)
    }

    if (
      hasCurrentReading &&
      hasCurrentOperationalSuggestionChange()
    ) {
      addCandidate({
        level: 'attention',
        key:
          [
            'attention:operation',
            state.conversationKey,
            state.analyzedConversationFingerprint,
          ]
            .filter(Boolean)
            .join(':'),
        label:
          'Ação da Yolen aguardando revisão',
      }, 305)
    }

    if (
      hasCurrentReading &&
      commercialReading
        ?.communication
        ?.intervention_needed === true
    ) {
      addCandidate({
        level: 'recommendation',
        key:
          [
            'recommendation',
            state.conversationKey,
            state.analyzedConversationFingerprint,
          ]
            .filter(Boolean)
            .join(':'),
        label:
          'Recomendação disponível para esta conversa',
      }, 190)
    }

    const enrichmentCandidates =
      getVisibleLeadEnrichmentCandidates()

    if (
      enrichmentCandidates.length > 0
    ) {
      const candidateKeys =
        enrichmentCandidates
          .map((candidate) =>
            getLeadEnrichmentCandidateKey(
              candidate,
            ),
          )
          .filter(Boolean)
          .sort()

      addCandidate({
        level: 'information',
        key:
          [
            'information:enrichment',
            state.conversationKey,
            ...candidateKeys,
          ].join(':'),
        label:
          'Novos dados encontrados na conversa',
      }, 100)
    }

    candidates.sort(
      (left, right) =>
        right.rank - left.rank,
    )

    const attention =
      candidates[0]

    if (!attention) {
      return null
    }

    return {
      level: attention.level,
      key: attention.key,
      label: attention.label,
    }
  }

  function getUnacknowledgedCollapsedAttention() {
    const attention =
      getCollapsedCompanionAttentionSnapshot()

    if (
      !attention ||
      attention.key ===
        lastAcknowledgedCollapsedAttentionKey
    ) {
      return null
    }

    return attention
  }

  function acknowledgeCurrentCollapsedAttention() {
    const attention =
      getCollapsedCompanionAttentionSnapshot()

    lastAcknowledgedCollapsedAttentionKey =
      attention?.key || null
  }
  // B5_MINIMIZED_INTELLIGENCE_END

  function setPanelCollapsed(collapsed) {
    const nextCollapsed =
      Boolean(collapsed)

    acknowledgeCurrentCollapsedAttention()

    panelCollapsed =
      nextCollapsed

    if (
      panelCollapsed &&
      (
        state.preSendGateOpen ||
        state.preSendBypassKey
      )
    ) {
      state = {
        ...state,
        preSendGateOpen: false,
        preSendBypassKey: null,
      }
    }

    persistPanelCollapsedPreference(
      panelCollapsed,
    )

    document
      .documentElement
      .classList
      .toggle(
        'yolen-companion-collapsed',
        panelCollapsed,
      )

    renderPanel()
  }

  function renderPanel() {
    const panel = createPanel()

    const previousPanelScrollTop =
      panel.scrollTop

    const previouslyOpenDetailsKeys =
      getOpenDetailsPreservationKeys(
        panel,
      )

    const collapsed =
      panelCollapsed === true

    document
      .documentElement
      .classList
      .toggle(
        'yolen-companion-collapsed',
        collapsed,
      )

    panel.classList.toggle(
      'yolen-panel-collapsed',
      collapsed,
    )

    if (collapsed) {
      const attention =
        getUnacknowledgedCollapsedAttention()

      const attentionLevel =
        attention?.level || 'normal'

      const collapsedLabel =
        attention
          ? `Abrir Yolen Companion — ${attention.label}`
          : 'Abrir Yolen Companion'

      panel.innerHTML = [
        '<div class="yolen-collapsed-shell">',

          '<button',
            ' class="yolen-collapsed-logo-button ' +
              `yolen-collapsed-attention-${attentionLevel}"`,
            ' type="button"',
            ' data-yolen-action="expand-companion"',
            ' data-yolen-attention-level="' +
              escapeHtml(attentionLevel) +
            '"',
            ' title="' +
              escapeHtml(collapsedLabel) +
            '"',
            ' aria-label="' +
              escapeHtml(collapsedLabel) +
            '"',
          '>',

            getYolenMarkHtml(),

            attention
              ? [
                  '<span',
                    ' class="yolen-collapsed-attention-dot"',
                    ' aria-hidden="true"',
                  '></span>',
                ].join('')
              : '',

          '</button>',

        '</div>',
      ].join('')

      panel
        .querySelector(
          '[data-yolen-action="expand-companion"]',
        )
        ?.addEventListener(
          'click',
          () => {
            setPanelCollapsed(false)
          },
        )

      return
    }

    panel.innerHTML = [
      '<div class="yolen-panel-header yolen-panel-header-final">',

        '<div class="yolen-brand">',

          '<button',
            ' class="yolen-logo yolen-logo-button"',
            ' type="button"',
            ' data-yolen-action="collapse-companion"',
            ' title="Minimizar Yolen Companion"',
            ' aria-label="Minimizar Yolen Companion"',
          '>',

            getYolenMarkHtml(),

          '</button>',

          '<div class="yolen-brand-copy">',

            '<div class="yolen-title">',
              'Yolen Companion',
            '</div>',

            '<div class="yolen-subtitle">',
              escapeHtml(
                state.companyName ||
                'Empresa não carregada',
              ),
            '</div>',

          '</div>',

        '</div>',

        '<div class="yolen-header-actions">',

          '<span class="yolen-connection-pill ' +
            getCompactConnectionClass() +
          '">',

            state.loading
              ? getInlineSpinnerHtml('yolen-spinner-inline')
              : '',

            escapeHtml(
              getCompactConnectionLabel(),
            ),

          '</span>',

          '<button',
            ' class="yolen-icon-button"',
            ' type="button"',
            ' data-yolen-action="refresh"',
            ' title="Atualizar"',
            ' aria-label="Atualizar Yolen Companion"',
          '>',
            '↻',
          '</button>',

          '<button',
            ' class="yolen-icon-button yolen-collapse-button"',
            ' type="button"',
            ' data-yolen-action="collapse-companion"',
            ' title="Minimizar Companion"',
            ' aria-label="Minimizar Yolen Companion"',
          '>',
            '›',
          '</button>',

        '</div>',

      '</div>',

      '<div class="yolen-card yolen-contact-card ' +
        getLeadStatusClass() +
      '">',

        '<div class="yolen-section-label">',
          'Conversa',
        '</div>',

        '<div class="yolen-lead-name">',
          escapeHtml(
            getCompactConversationName(),
          ),
        '</div>',

        getCompactContextChipsHtml(),

        '<div class="yolen-card-description yolen-contact-description">',
          escapeHtml(
            getCompactLeadDescription(),
          ),
        '</div>',

        '<div class="yolen-inline-actions yolen-contact-actions">',
          getLeadActionButton(),
        '</div>',

      '</div>',

      getConversationRegistrationCardHtml(),

      getLeadEnrichmentCandidatesHtml(),

      getPreSendAssessmentCardHtml(),

      getSellerInformationArchitectureHtml(),

      getCompactFooterHtml(),

    ].join('')

    panel
      .querySelectorAll(
        '[data-yolen-seller-area]',
      )
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            setActiveSellerArea(
              button.getAttribute(
                'data-yolen-seller-area',
              ),
              { focus: true },
            )
          },
        )

        button.addEventListener(
          'keydown',
          handleSellerAreaKeyboard,
        )
      })

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

    panel
      .querySelectorAll(
        '[data-yolen-action="confirm-lead-enrichment"]',
      )
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            const candidateKey =
              button.getAttribute(
                'data-yolen-enrichment-key',
              )

            if (candidateKey) {
              void applyLeadEnrichmentCandidate(
                candidateKey,
              )
            }
          },
        )
      })

    panel
      .querySelectorAll(
        '[data-yolen-action="ignore-lead-enrichment"]',
      )
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            const candidateKey =
              button.getAttribute(
                'data-yolen-enrichment-key',
              )

            if (candidateKey) {
              ignoreLeadEnrichmentCandidate(
                candidateKey,
              )
            }
          },
        )
      })

    panel.querySelectorAll('[data-yolen-action="collapse-companion"]').forEach((button) => {
      button.addEventListener('click', () => {
        setPanelCollapsed(true)
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

    panel.querySelectorAll('[data-yolen-action="analyze-conversation"]').forEach((button) => {
      button.addEventListener('click', () => {
        analyzeCurrentConversation({
          automatic: false,
        })
      })
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

    panel.querySelector('[data-yolen-action="transcribe-audio"]')?.addEventListener('click', () => {
      transcribeNextVisibleAudio()
    })

    panel.querySelector('[data-yolen-action="register-conversation"]')?.addEventListener('click', () => {
      registerCurrentConversation()
    })

    panel.querySelector('[data-yolen-action="confirm-conversation-registration"]')?.addEventListener('click', () => {
      confirmCurrentConversationRegistration()
    })

    panel.querySelector('[data-yolen-action="cancel-conversation-registration"]')?.addEventListener('click', () => {
      cancelCurrentConversationRegistration()
    })

    restoreOpenDetails(
      panel,
      previouslyOpenDetailsKeys,
    )

    panel.scrollTop =
      previousPanelScrollTop
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  // Indicador de progresso puramente visual (nenhum texto, nenhum
  // conteúdo semântico) para acompanhar as frases de loading já
  // existentes ("Conectando...", "Analisando...", "Análise aprofundada em
  // andamento") sem alterar o texto que os testes verificam.
  function getInlineSpinnerHtml(
    extraClass = '',
  ) {
    return (
      '<span class="yolen-spinner ' +
      escapeHtml(extraClass) +
      '" aria-hidden="true"></span>'
    )
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
        if (state.conversationPhone) {
          resolveCurrentLead()
        } else if (state.conversationKey) {
          runAutomaticContactLookup(
            state.conversationKey,
          )
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

  async function waitForVisibleAudioTargetsForRestore() {
    const expectedAudioCount =
      Number(state.audioCount || 0)

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const visibleTargets =
        getVisibleAudioTargets()

      if (
        expectedAudioCount > 0 &&
        visibleTargets.length >= expectedAudioCount
      ) {
        return visibleTargets
      }

      if (
        expectedAudioCount === 0 &&
        visibleTargets.length > 0
      ) {
        return visibleTargets
      }

      await sleep(250)
    }

    return getVisibleAudioTargets()
  }

  async function loadSavedAudioTranscriptionsForCurrentCycle() {
    const cycleId =
      state.leadResolution?.cycle?.id

    if (
      !cycleId ||
      !window.YolenCompanionApi
        ?.loadAudioTranscriptions
    ) {
      return
    }

    if (
      state.audioTranscriptionHistoryLoading ||
      state.audioTranscriptionHistoryCycleId === cycleId
    ) {
      return
    }

    const conversationKeyAtRequest =
      state.conversationKey

    state = {
      ...state,
      audioTranscriptionHistoryLoading: true,
    }

    try {
      const result =
        await window.YolenCompanionApi
          .loadAudioTranscriptions({
            cycle_id: cycleId,
          })

      if (
        state.conversationKey !==
          conversationKeyAtRequest ||
        state.leadResolution?.cycle?.id !==
          cycleId
      ) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        state = {
          ...state,
          audioTranscriptionHistoryLoading: false,
          audioTranscriptionHistoryCycleId:
            cycleId,
        }

        return
      }

      const savedTranscriptions =
        Array.isArray(
          result.payload?.data?.transcriptions,
        )
          ? result.payload.data.transcriptions
          : []

          const visibleTargets =
          await waitForVisibleAudioTargetsForRestore()

      const nextAudioTranscriptionsByKey = {
        ...(state.audioTranscriptionsByKey || {}),
      }

      let restoredCount = 0

      savedTranscriptions.forEach(
        (transcription) => {
          if (
            !transcription.audio_target_key ||
            !transcription.text
          ) {
            return
          }

          const target =
            visibleTargets.find(
              (visibleTarget) =>
                visibleTarget.key ===
                transcription.audio_target_key,
            )

          if (!target) {
            return
          }

          const transcriptionKey =
            getAudioTranscriptionKey(target)

          if (
            nextAudioTranscriptionsByKey[
              transcriptionKey
            ]?.text
          ) {
            return
          }

          nextAudioTranscriptionsByKey[
            transcriptionKey
          ] = {
            audioIndex: target.index,
            targetKey: target.key,
            capturedBlobId: null,
            text: transcription.text,
            occurredAt:
              transcription.occurred_at ||
              null,
          }

          restoredCount += 1
        },
      )

      state = {
        ...state,
        audioTranscriptionHistoryLoading: false,
        audioTranscriptionHistoryCycleId:
          cycleId,
        audioTranscriptionsByKey:
          nextAudioTranscriptionsByKey,
        audioTranscriptionStatus:
          restoredCount > 0
            ? `${restoredCount} transcrição(ões) recuperada(s) da Yolen.`
            : state.audioTranscriptionStatus,
      }

      renderPanel()

      if (restoredCount > 0) {
        scheduleCaptureIngestion()
      }
    } catch {
      if (
        state.conversationKey !==
        conversationKeyAtRequest
      ) {
        return
      }

      state = {
        ...state,
        audioTranscriptionHistoryLoading: false,
        audioTranscriptionHistoryCycleId:
          cycleId,
      }
    }
  }

  async function resolveCurrentLead() {
    if (
      !state.connected ||
      state.isSelfConversation
    ) {
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

    const phoneAtRequest =
      state.conversationPhone

    const keyAtRequest =
      state.conversationKey

    const titleAtRequest =
      state.conversationTitle

    if (
      !keyAtRequest ||
      leadResolutionInFlightKeys.has(
        keyAtRequest,
      )
    ) {
      return
    }

    leadResolutionInFlightKeys.add(
      keyAtRequest,
    )

    state = {
      ...state,
      leadResolutionLoading: true,
      leadResolution: null,
      leadResolutionError: null,
    }

    renderPanel()

    const requestStillCurrent = () => {
      return (
        state.conversationPhone ===
          phoneAtRequest &&
        state.conversationKey ===
          keyAtRequest
      )
    }

    try {
      const result =
        await window.YolenCompanionApi
          .resolveLead({
            phone: phoneAtRequest,
            display_name: titleAtRequest,
          })

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        retainedPreResolutionCaptures.delete(
          keyAtRequest,
        )

        if (!requestStillCurrent()) {
          return
        }

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

      enqueueRetainedPreResolutionCapture(
        keyAtRequest,
        result.payload,
      )

      if (!requestStillCurrent()) {
        return
      }

      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: result.payload,
        leadResolutionError: null,
      }

      renderPanel()

      loadSavedAudioTranscriptionsForCurrentCycle()
        .finally(() => {
          lockCurrentMessageWindow()
          refreshConversationSnapshot()

          scheduleCaptureIngestion()

          scheduleAutomaticAnalysis(
            'Lead localizado. A conversa será analisada automaticamente em 8 segundos.',
          )

          // Independente da análise semântica: dado operacional puro, não
          // precisa esperar o debounce da análise automática.
          void loadCompanionClientContextForCurrentCycle()
        })
    } catch (error) {
      retainedPreResolutionCaptures.delete(
        keyAtRequest,
      )

      if (!requestStillCurrent()) {
        return
      }

      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: null,
        leadResolutionError:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Erro ao localizar lead na Yolen.',
      }

      renderPanel()
    } finally {
      leadResolutionInFlightKeys.delete(
        keyAtRequest,
      )
    }
  }

  function createActionTelemetryInteractionId() {
    const randomUuid =
      globalThis.crypto?.randomUUID?.()

    if (randomUuid) {
      return randomUuid
    }

    return [
      Date.now().toString(36),
      Math.random()
        .toString(36)
        .slice(2),
    ].join('-')
  }

  function buildActionTelemetryIdempotencyKey(
    actionType,
    seed,
    cycleId =
      state.leadResolution?.cycle?.id,
  ) {
    return [
      'companion-ui',
      actionType,
      cycleId || 'no-cycle',
      seed ||
        createActionTelemetryInteractionId(),
    ]
      .join(':')
      .slice(0, 200)
  }

  async function registerCompanionActionTelemetry(
    actionType,
    options = {},
  ) {
    const cycleId =
      options.cycleId ||
      state.leadResolution?.cycle?.id

    if (
      !cycleId ||
      !window.YolenCompanionApi
        ?.registerActionEvent
    ) {
      return {
        registered: false,
        alreadyRegistered: false,
      }
    }

    const coachingNoteId =
      options.coachingNoteId ??
      state.conversationAnalysis
        ?.saved_coaching?.id ??
      null

    const conversationKey =
      options.conversationKey ??
      getCaptureConversationKey() ??
      null

    const idempotencyKey =
      options.idempotencyKey ||
      buildActionTelemetryIdempotencyKey(
        actionType,
        options.seed,
        cycleId,
      )

    const metadata =
      options.metadata &&
      typeof options.metadata === 'object' &&
      !Array.isArray(options.metadata)
        ? options.metadata
        : {}

    const result =
      await window.YolenCompanionApi
        .registerActionEvent({
          cycle_id: cycleId,
          action_type: actionType,
          idempotency_key:
            idempotencyKey,
          coaching_note_id:
            coachingNoteId,
          conversation_key:
            conversationKey,
          metadata,
        })

    if (!result?.ok || !result.payload?.ok) {
      throw new Error(
        result?.payload?.error ||
          'Não foi possível registrar a telemetria da ação do Companion.',
      )
    }

    return {
      registered:
        result.payload?.data
          ?.already_registered !== true,
      alreadyRegistered:
        result.payload?.data
          ?.already_registered === true,
      eventId:
        result.payload?.data
          ?.event_id || null,
    }
  }

  function fireCompanionActionTelemetry(
    actionType,
    options = {},
  ) {
    void registerCompanionActionTelemetry(
      actionType,
      options,
    ).catch(() => {})
  }

  function getOperationalTelemetryTargets(
    suggestion,
  ) {
    const cycle =
      state.leadResolution?.cycle

    if (!suggestion || !cycle) {
      return {
        crmChanged: false,
        agendaChanged: false,
      }
    }

    const crmChanged =
      Boolean(
        suggestion.recommended_status &&
        suggestion.recommended_status !==
          cycle.status,
      )

    const agendaChanged =
      normalizeOperationalText(
        cycle.next_action,
      ) !==
        normalizeOperationalText(
          suggestion.next_action,
        ) ||
      getOperationalDateKey(
        cycle.next_action_date,
      ) !==
        getOperationalDateKey(
          suggestion.next_action_date,
        )

    return {
      crmChanged,
      agendaChanged,
    }
  }

  function registerSuggestionDecisionTelemetry({
    accepted,
    suggestion,
    cycleId,
  }) {
    const {
      crmChanged,
      agendaChanged,
    } =
      getOperationalTelemetryTargets(
        suggestion,
      )

    const interactionId =
      createActionTelemetryInteractionId()

    const commonOptions = {
      cycleId,
      seed: interactionId,
      metadata: {
        source: 'apply_confirmation',
      },
    }

    if (!accepted) {
      fireCompanionActionTelemetry(
        'suggestion_ignored',
        commonOptions,
      )
    }

    if (crmChanged) {
      fireCompanionActionTelemetry(
        accepted
          ? 'crm_accepted'
          : 'crm_rejected',
        commonOptions,
      )
    }

    if (agendaChanged) {
      fireCompanionActionTelemetry(
        accepted
          ? 'agenda_accepted'
          : 'agenda_rejected',
        commonOptions,
      )
    }
  }

  function registerSuggestionShownTelemetry({
    cycleId,
    analysis,
    conversationFingerprint,
    isAutomatic,
  }) {
    if (!analysis?.suggestion) {
      return
    }

    const coachingNoteId =
      analysis.saved_coaching?.id ||
      null

    const suggestionFingerprint =
      buildConversationFingerprint(
        JSON.stringify(
          analysis.suggestion,
        ),
      )

    const seed = [
      coachingNoteId || 'no-note',
      conversationFingerprint ||
        'no-conversation-fingerprint',
      suggestionFingerprint ||
        'no-suggestion-fingerprint',
    ].join(':')

    const idempotencyKey =
      buildActionTelemetryIdempotencyKey(
        'suggestion_shown',
        seed,
        cycleId,
      )

    if (
      registeredSuggestionShownTelemetryKeys
        .has(idempotencyKey)
    ) {
      return
    }

    registeredSuggestionShownTelemetryKeys
      .add(idempotencyKey)

    void registerCompanionActionTelemetry(
      'suggestion_shown',
      {
        cycleId,
        coachingNoteId,
        idempotencyKey,
        metadata: {
          source: 'analysis_completed',
          automatic:
            isAutomatic === true,
        },
      },
    ).catch(() => {
      registeredSuggestionShownTelemetryKeys
        .delete(idempotencyKey)
    })
  }

  function clearDeepAnalysisPollTimer() {
    if (deepAnalysisPollTimerId) {
      window.clearTimeout(deepAnalysisPollTimerId)
      deepAnalysisPollTimerId = 0
    }
  }

  // Acompanha, sem bloquear a UI, um job de análise profunda já criado pela
  // resposta rápida do analyze-conversation. Reaproveita a MESMA identidade
  // imutável de contexto (cycleId/conversationKeyAtRequest/requestSequence)
  // capturada por analyzeCurrentConversation() através de
  // isAnalysisResponseStillCurrent(): a cada tick, se a conversa/ciclo
  // mudou ou uma análise mais nova já começou, o resultado profundo é
  // descartado silenciosamente e nunca é aplicado a `state`.
  //
  // Backoff controlado (1.5s, 2s, 3s, 4s, 5s, 5s...), sem polling agressivo.
  // Timeout total limitado (DEEP_ANALYSIS_POLL_TIMEOUT_MS) — nunca há
  // polling infinito. Apenas um timer de poll vive por vez
  // (deepAnalysisPollTimerId): iniciar um novo poll sempre cancela o
  // anterior primeiro, então dois pollers "equivalentes" nunca aplicam
  // estado em duplicidade.
  function startDeepAnalysisPolling({
    analysisJobId,
    cycleId,
    conversationKeyAtRequest,
    isAnalysisResponseStillCurrent,
  }) {
    clearDeepAnalysisPollTimer()

    const startedAtMs = Date.now()
    let attempt = 0

    const scheduleNextTick = () => {
      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      if (Date.now() - startedAtMs >= DEEP_ANALYSIS_POLL_TIMEOUT_MS) {
        state = {
          ...state,
          deepAnalysisStatus: 'failed',
          deepAnalysisResult: null,
        }

        renderPanel()
        return
      }

      const delay =
        DEEP_ANALYSIS_POLL_DELAYS_MS[
          Math.min(
            attempt,
            DEEP_ANALYSIS_POLL_DELAYS_MS.length - 1,
          )
        ]

      attempt += 1

      deepAnalysisPollTimerId =
        window.setTimeout(runTick, delay)
    }

    const runTick = async () => {
      deepAnalysisPollTimerId = 0

      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      let response = null

      try {
        response =
          await window.YolenCompanionApi
            .getAnalysisJobStatus({
              cycle_id: cycleId,
              conversation_key: conversationKeyAtRequest,
              analysis_job_id: analysisJobId,
            })
      } catch {
        response = null
      }

      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      const data =
        response?.ok && response.payload?.ok
          ? response.payload.data
          : null

      if (!data || typeof data.status !== 'string') {
        // Falha isolada de rede/servidor num único tick não vira estado de
        // erro seller-facing — apenas tenta de novo no próximo backoff.
        scheduleNextTick()
        return
      }

      if (data.status === 'queued' || data.status === 'running') {
        scheduleNextTick()
        return
      }

      if (data.status === 'succeeded') {
        state = {
          ...state,
          deepAnalysisStatus: 'succeeded',
          deepAnalysisResult: data.result || null,
        }

        renderPanel()
        return
      }

      if (data.status === 'superseded') {
        // Um job mais novo para a MESMA conversa já assumiu o lugar deste.
        // Este job nunca vira estado corrente — não é falha, é apenas
        // descartado.
        state = {
          ...state,
          deepAnalysisStatus: null,
          deepAnalysisResult: null,
        }

        renderPanel()
        return
      }

      state = {
        ...state,
        deepAnalysisStatus: 'failed',
        deepAnalysisResult: null,
      }

      renderPanel()
    }

    scheduleNextTick()
  }

  async function analyzeCurrentConversation(
    options = {},
  ) {
    const isAutomatic =
      options.automatic === true

    clearDeepAnalysisPollTimer()
    clearAutomaticAnalysisTimer()

    if (!canAnalyzeCurrentConversation()) {
      if (isAutomatic) {
        state = {
          ...state,
          automaticAnalysisStatus: null,
        }

        renderPanel()
      }

      return
    }

    const cycleId =
      state.leadResolution?.cycle?.id

    const conversationKeyAtRequest =
      getCaptureConversationKey()

    const companionMessages =
      getStructuredMessagesForAnalysis()

    const conversationText =
      buildConversationTextFromMessages(
        companionMessages,
      )

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
          'Não há texto suficiente visível na conversa para análise.',
        analyzedConversationFingerprint: null,
      }

      renderPanel()
      return
    }

    const conversationFingerprint =
      getCurrentConversationFingerprint() ||
      buildConversationFingerprint(
        conversationText,
      )

    const forceReanalysis =
      messageLedgerRequiresRebase

    const mutationRevisionAtRequest =
      messageLedgerMutationRevision

    // Identidade imutável do contexto que pediu esta análise + número de
    // sequência da requisição. Quando a resposta (ou o erro) chegar,
    // isAnalysisResponseStillCurrent() responde "este resultado pertence
    // ao contexto para o qual foi iniciado, e nenhuma requisição mais nova
    // já começou?" — se não, a resposta é descartada silenciosamente e
    // NUNCA é aplicada a `state` (nunca sobrescreve a conversa/ciclo
    // atualmente visível, que já tem seu próprio estado zerado por
    // clearLeadStateForNewConversation() na troca, ou preenchido por uma
    // análise mais recente). O resultado da conversa de origem não é
    // "destruído" por isso — ele simplesmente nunca chega a ser escrito
    // num `state` que já pertence a outra conversa.
    const requestSequence =
      ++conversationAnalysisRequestSequence

    const isAnalysisResponseStillCurrent = () =>
      requestSequence ===
        conversationAnalysisRequestSequence &&
      globalThis.YolenCompanionConversationRegistrationTools
        .shouldApplyConversationRegistrationResult({
          requestCycleId: cycleId,
          requestConversationKey: conversationKeyAtRequest,
          currentCycleId: state.leadResolution?.cycle?.id,
          currentConversationKey: getCaptureConversationKey(),
        })

    state = {
      ...state,
      conversationAnalysisLoading: true,
      conversationAnalysis: null,
      conversationAnalysisError: null,
      analyzedConversationFingerprint: null,
      automaticAnalysisStatus:
        isAutomatic
          ? 'Analisando automaticamente as novas mensagens...'
          : null,
      deepAnalysisStatus: null,
      deepAnalysisResult: null,
      suggestionApplyLoading: false,
      suggestionApplyResult: null,
      suggestionApplyError: null,
      suggestedMessageCopyStatus: null,
      suggestedMessageLastRegisteredKey: null,
      pendingSuggestedMessageSend: null,
      pendingSuggestedMessageSendRegistering: false,
      lastAnalysisAudioCount: getPendingAudioCountForCurrentConversation(),
    }

    renderPanel()

    try {
      const result =
        await window.YolenCompanionApi
          .analyzeConversation({
            cycle_id: cycleId,
            conversation_key:
              conversationKeyAtRequest,
            conversation_text:
              conversationText,
            messages:
              companionMessages,
            source: 'whatsapp',
            audio_count:
              state.lastAnalysisAudioCount ||
              0,
            force_reanalysis:
              forceReanalysis,
            message_snapshot_hash:
              conversationFingerprint,
          })

      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      if (!result?.ok || !result.payload?.ok || !result.payload?.data) {
        state = {
          ...state,
          conversationAnalysisLoading: false,
          conversationAnalysis: null,
          conversationAnalysisError:
            result?.payload?.error ||
            'Não foi possível analisar a conversa com IA.',
          automaticAnalysisStatus: null,
        }

        renderPanel()
        return
      }

      if (
        forceReanalysis &&
        messageLedgerMutationRevision ===
          mutationRevisionAtRequest
      ) {
        messageLedgerRequiresRebase =
          false
      }

      state = {
        ...state,
        conversationAnalysisLoading: false,
        conversationAnalysis: result.payload.data,
        conversationAnalysisError: null,
        analyzedConversationFingerprint:
          conversationFingerprint,
        automaticAnalysisStatus:
          isAutomatic
            ? 'Análise automática concluída.'
            : null,
      }

      updatePreSendAssessmentFromDraft(
        getComposerText(),
        { render: false },
      )

      renderPanel()

      const deepAnalysisJob =
        result.payload.data.deep_analysis

      if (
        deepAnalysisJob?.analysis_job_id &&
        (
          deepAnalysisJob.status === 'queued' ||
          deepAnalysisJob.status === 'running' ||
          deepAnalysisJob.status === 'succeeded'
        )
      ) {
        state = {
          ...state,
          deepAnalysisStatus: 'pending',
          deepAnalysisResult: null,
        }

        renderPanel()

        startDeepAnalysisPolling({
          analysisJobId:
            deepAnalysisJob.analysis_job_id,
          cycleId,
          conversationKeyAtRequest,
          isAnalysisResponseStillCurrent,
        })
      } else if (
        deepAnalysisJob?.analysis_job_id
      ) {
        // status já veio 'failed' ou 'superseded' na própria resposta
        // rápida — nada a acompanhar.
        state = {
          ...state,
          deepAnalysisStatus:
            deepAnalysisJob.status === 'failed'
              ? 'failed'
              : null,
          deepAnalysisResult: null,
        }

        renderPanel()
      }

      registerSuggestionShownTelemetry({
        cycleId,
        analysis:
          result.payload.data,
        conversationFingerprint,
        isAutomatic,
      })

      if (
        messageLedgerMutationRevision !==
          mutationRevisionAtRequest ||
        getCurrentConversationFingerprint() !==
          conversationFingerprint
      ) {
        scheduleAutomaticAnalysis(
          'A conversa mudou durante a análise. A Yolen fará uma nova leitura em 8 segundos.',
        )
      }
    } catch (error) {
      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      state = {
        ...state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao analisar conversa com IA.',
            analyzedConversationFingerprint: null,
            automaticAnalysisStatus: null,
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

    const main = getMainConversationRoot()
    const footer = main?.querySelector('footer')

    if (
      !main ||
      !main.contains(button) ||
      (
        footer &&
        !footer.contains(button)
      )
    ) {
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

  function isOutgoingMessageNode(node) {
    if (
      !node ||
      typeof node.closest !==
        'function'
    ) {
      return false
    }

    const main =
      getMainConversationRoot()

    const layoutContainer =
      node.closest(
        '[data-testid="msg-container"]',
      ) ||
      node.closest('[role="row"]') ||
      getMessageContainer(node) ||
      node

    const dataIdElement =
      node.closest('[data-id]') ||
      node.querySelector?.('[data-id]')

    const messageRect =
      typeof layoutContainer
        .getBoundingClientRect ===
      'function'
        ? layoutContainer
            .getBoundingClientRect()
        : null

    const conversationRect =
      typeof main
        ?.getBoundingClientRect ===
      'function'
        ? main.getBoundingClientRect()
        : null

    const direction =
      messageMutationTools
        .inferCapturedMessageDirection({
          hasOutgoingClass:
            Boolean(
              node.closest(
                '.message-out',
              ),
            ),
          hasIncomingClass:
            Boolean(
              node.closest(
                '.message-in',
              ),
            ),
          dataId:
            dataIdElement
              ?.getAttribute?.(
                'data-id',
              ) || '',
          messageLeft:
            messageRect?.left,
          messageWidth:
            messageRect?.width,
          conversationLeft:
            conversationRect?.left,
          conversationWidth:
            conversationRect?.width,
        })

    return direction === 'outgoing'
  }

  function getLatestOutgoingVisibleMessageText() {
    const main = getMainConversationRoot()

    if (!main) {
      return ''
    }

    const nodes = Array.from(main.querySelectorAll('[data-pre-plain-text]')).reverse()

    for (const node of nodes) {
      if (!isOutgoingMessageNode(node)) {
        continue
      }

      const text =
        normalizeMessageText(
          getCapturedMessageBodyText(
            node,
          ),
        )

      if (text && text.length >= 2) {
        return text
      }
    }

    return ''
  }

  function isProbablySameMessage(actualMessage, expectedMessage) {
    const actual = normalizeMessageText(actualMessage)
    const expected = normalizeMessageText(expectedMessage)

    if (!actual || !expected) {
      return false
    }

    if (actual === expected) {
      return true
    }

    if (expected.length >= 24 && actual.includes(expected)) {
      return true
    }

    if (actual.length >= 24 && expected.includes(actual)) {
      return true
    }

    const expectedStart = expected.slice(0, 80)

    return expectedStart.length >= 24 && actual.includes(expectedStart)
  }

  function resolveManualSendMessageToRegister(actualMessage, expectedMessage) {
    const actual = normalizeMessageText(actualMessage)
    const expected = normalizeMessageText(expectedMessage)

    if (!expected) {
      return actual
    }

    if (!actual) {
      return expected
    }

    if (actual === expected) {
      return expected
    }

    if (expected.length >= 24 && actual.includes(expected)) {
      return expected
    }

    if (actual.length >= 24 && expected.includes(actual)) {
      return expected
    }

    const duplicatedExpected = `${expected} ${expected}`

    if (actual === duplicatedExpected || actual.includes(duplicatedExpected)) {
      return expected
    }

    return actual
  }

  async function registerManualSuggestedMessageSend(finalMessage) {
    const pending = state.pendingSuggestedMessageSend

    if (!pending?.cycleId || !pending.message) {
      return
    }

    if (state.pendingSuggestedMessageSendRegistering) {
      return
    }

    if (pending.conversationKey !== state.conversationKey) {
      return
    }

    const messageToRegister = resolveManualSendMessageToRegister(
      finalMessage,
      pending.message,
    )

    if (!messageToRegister || messageToRegister.length < 2) {
      return
    }

    const telemetryInteractionId =
      pending.telemetryInteractionId ||
      createActionTelemetryInteractionId()

    const normalizedFinalMessage =
      normalizeMessageText(
        finalMessage,
      )

    const normalizedSuggestedMessage =
      normalizeMessageText(
        pending.message,
      )

    const duplicatedSuggestedMessage =
      [
        normalizedSuggestedMessage,
        normalizedSuggestedMessage,
      ].join(' ')

    const wasEdited =
      Boolean(
        normalizedFinalMessage &&
        normalizedSuggestedMessage,
      ) &&
      normalizedFinalMessage !==
        normalizedSuggestedMessage &&
      normalizedFinalMessage !==
        duplicatedSuggestedMessage

    const telemetryOptions = {
      cycleId: pending.cycleId,
      coachingNoteId:
        pending.coachingNoteId,
      conversationKey:
        pending.telemetryConversationKey ||
        getCaptureConversationKey(),
      seed: telemetryInteractionId,
      metadata: {
        source: 'manual_send',
      },
    }

    if (wasEdited) {
      fireCompanionActionTelemetry(
        'suggestion_edited',
        telemetryOptions,
      )
    }

    fireCompanionActionTelemetry(
      'suggestion_sent',
      {
        ...telemetryOptions,
        metadata: {
          ...telemetryOptions.metadata,
          edited: wasEdited,
        },
      },
    )

    state = {
      ...state,
      pendingSuggestedMessageSendRegistering: true,
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
        pendingSuggestedMessageSendRegistering: false,
      }

      renderPanel()
    } catch {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Mensagem enviada manualmente, mas a Yolen não conseguiu registrar o envio.',
        pendingSuggestedMessageSend: null,
        pendingSuggestedMessageSendRegistering: false,
      }

      renderPanel()
    }
  }

  function checkPendingSuggestedMessageSentFromConversation() {
    const pending = state.pendingSuggestedMessageSend

    if (!pending?.cycleId || !pending.message) {
      return
    }

    if (state.pendingSuggestedMessageSendRegistering) {
      return
    }

    if (pending.conversationKey !== state.conversationKey) {
      return
    }

    const latestOutgoingMessage = getLatestOutgoingVisibleMessageText()

    if (!isProbablySameMessage(latestOutgoingMessage, pending.message)) {
      return
    }

    registerManualSuggestedMessageSend(
      resolveManualSendMessageToRegister(latestOutgoingMessage, pending.message),
    )
  }

  function scheduleManualSendRegistration() {
    const currentMessage = getComposerText() || state.pendingSuggestedMessageSend?.message || ''

    if (!currentMessage) {
      return
    }

    window.setTimeout(() => {
      registerManualSuggestedMessageSend(currentMessage)
    }, 250)
  }

  // B4_PRE_SEND_GATE_START
  function decidePreSendAttempt({
    gateKey,
    bypassKey,
    cancelable,
    collapsed,
  }) {
    if (
      !gateKey ||
      collapsed === true
    ) {
      return 'allow'
    }

    if (bypassKey === gateKey) {
      return 'allow_once'
    }

    if (cancelable !== true) {
      return 'allow'
    }

    return 'block'
  }

  function getCurrentPreSendGateKey() {
    const assessment =
      state.preSendAssessment

    const supportedKinds =
      new Set([
        'wait_pressure',
        'sensitive_condition',
        'pending_issue',
        'method_premature_close',
        'agenda_conflict',
      ])

    if (
      !assessment ||
      typeof assessment.kind !== 'string' ||
      !supportedKinds.has(
        assessment.kind,
      ) ||
      typeof assessment.reason !== 'string' ||
      !assessment.reason.trim() ||
      !state.conversationKey ||
      !state.analyzedConversationFingerprint ||
      state.preSendAssessmentConversationKey !==
        state.conversationKey ||
      state.preSendAssessmentFingerprint !==
        state.analyzedConversationFingerprint ||
      state.conversationAnalysisLoading ||
      isCurrentAnalysisOutdated() ||
      getActiveCommercialReading()
        ?.analysis_status !== 'complete'
    ) {
      return null
    }

    const currentDraft =
      getComposerText()

    if (
      !currentDraft ||
      normalizeMessageText(
        currentDraft,
      ) !== state.preSendDraft
    ) {
      return null
    }

    return [
      state.conversationKey,
      state.analyzedConversationFingerprint,
      buildConversationFingerprint(
        state.preSendDraft,
      ),
      assessment.kind,
    ].join('::')
  }

  function interceptPreSendAttempt(event) {
    const gateKey =
      getCurrentPreSendGateKey()

    const decision =
      decidePreSendAttempt({
        gateKey,
        bypassKey:
          state.preSendBypassKey,
        cancelable:
          event?.cancelable === true,
        collapsed:
          panelCollapsed === true,
      })

    if (decision === 'allow') {
      return false
    }

    if (decision === 'allow_once') {
      state = {
        ...state,
        preSendGateOpen: false,
        preSendBypassKey: null,
      }

      renderPanel()
      return false
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    state = {
      ...state,
      preSendGateOpen: true,
      preSendBypassKey: null,
    }

    renderPanel()

    return true
  }

  function getWhatsAppSendButton() {
    const main =
      getMainConversationRoot()

    const scope =
      main?.querySelector('footer') ||
      main

    if (!scope) {
      return null
    }

    const candidates =
      scope.querySelectorAll(
        'button,[role="button"]',
      )

    for (const candidate of candidates) {
      if (
        isWhatsAppSendButtonTarget(
          candidate,
        )
      ) {
        return candidate
      }
    }

    return null
  }

  function observeManualWhatsAppSend() {
    const observerKey =
      '__yolenCompanionManualSendObserverInstalled'

    if (globalThis[observerKey] === true) {
      return
    }

    globalThis[observerKey] = true

    window.addEventListener(
      'click',
      (event) => {
        if (
          !isWhatsAppSendButtonTarget(
            event.target,
          )
        ) {
          return
        }

        if (
          interceptPreSendAttempt(
            event,
          )
        ) {
          return
        }

        scheduleManualSendRegistration()
      },
      true,
    )

    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key !== 'Enter' ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.isComposing ||
          event.keyCode === 229 ||
          !isComposerEnterTarget(
            event.target,
          )
        ) {
          return
        }

        if (
          interceptPreSendAttempt(
            event,
          )
        ) {
          return
        }

        scheduleManualSendRegistration()
      },
      true,
    )
  }
  function reviewCurrentPreSendDraft() {
    state = {
      ...state,
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    renderPanel()

    getWhatsAppComposer()?.focus()
  }

  function sendCurrentPreSendDraftAnyway() {
    const gateKey =
      getCurrentPreSendGateKey()

    if (!gateKey) {
      state = {
        ...state,
        preSendGateOpen: false,
        preSendBypassKey: null,
      }

      renderPanel()
      return
    }

    state = {
      ...state,
      preSendGateOpen: false,
      preSendBypassKey: gateKey,
    }

    renderPanel()

    const sendButton =
      getWhatsAppSendButton()

    if (!sendButton) {
      state = {
        ...state,
        preSendBypassKey: null,
      }

      renderPanel()
      getWhatsAppComposer()?.focus()
      return
    }

    window.setTimeout(
      () => {
        if (
          state.preSendBypassKey !== gateKey
        ) {
          return
        }

        if (
          getCurrentPreSendGateKey() !== gateKey
        ) {
          state = {
            ...state,
            preSendGateOpen: false,
            preSendBypassKey: null,
          }

          renderPanel()
          return
        }

        const currentSendButton =
          getWhatsAppSendButton()

        if (!currentSendButton?.click) {
          state = {
            ...state,
            preSendGateOpen: false,
            preSendBypassKey: null,
          }

          renderPanel()
          getWhatsAppComposer()?.focus()
          return
        }

        try {
          currentSendButton.click()
        } catch {
          state = {
            ...state,
            preSendGateOpen: false,
            preSendBypassKey: null,
          }

          renderPanel()
          getWhatsAppComposer()?.focus()
          return
        }

        window.setTimeout(
          () => {
            if (
              state.preSendBypassKey !==
              gateKey
            ) {
              return
            }

            state = {
              ...state,
              preSendGateOpen: false,
              preSendBypassKey: null,
            }

            renderPanel()
          },
          250,
        )
      },
      0,
    )
  }

  async function useCurrentPreSendSuggestion() {
    if (!getSuggestedMessage()) {
      return
    }

    state = {
      ...state,
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    renderPanel()

    await insertSuggestedMessageInWhatsAppWithOptions({
      replaceExisting: true,
    })
  }

  function getPreSendGateActionsHtml() {
    const hasSuggestion =
      Boolean(getSuggestedMessage())

    return [
      '<div class="yolen-pre-send-gate-copy">',
        'Esta tentativa foi pausada. Você decide como continuar.',
      '</div>',

      '<div class="yolen-inline-actions yolen-pre-send-actions">',

        '<button',
          ' class="yolen-primary-button"',
          ' type="button"',
          ' data-yolen-action="review-pre-send-message"',
        '>',
          'Revisar mensagem',
        '</button>',

        hasSuggestion
          ? [
              '<button',
                ' class="yolen-secondary-button"',
                ' type="button"',
                ' data-yolen-action="use-pre-send-suggestion"',
              '>',
                'Usar sugestão Yolen',
              '</button>',
            ].join('')
          : '',

        '<button',
          ' class="yolen-tertiary-button yolen-pre-send-send-anyway"',
          ' type="button"',
          ' data-yolen-action="send-pre-send-anyway"',
        '>',
          'Enviar mesmo assim',
        '</button>',

      '</div>',

      '<div class="yolen-operational-note">',
        'Nada será enviado sem uma decisão sua.',
      '</div>',
    ].join('')
  }

  function observePreSendGateActions() {
    const observerKey =
      '__yolenCompanionPreSendGateActionsObserverInstalled'

    if (globalThis[observerKey] === true) {
      return
    }

    globalThis[observerKey] = true

    document.addEventListener(
      'click',
      (event) => {
        const actionElement =
          event.target?.closest?.(
            '[data-yolen-action]',
          )

        if (
          !actionElement ||
          !actionElement.closest(
            `#${PANEL_ID}`,
          )
        ) {
          return
        }

        const action =
          actionElement.getAttribute(
            'data-yolen-action',
          )

        if (
          action ===
          'review-pre-send-message'
        ) {
          reviewCurrentPreSendDraft()
          return
        }

        if (
          action ===
          'send-pre-send-anyway'
        ) {
          sendCurrentPreSendDraftAnyway()
          return
        }

        if (
          action ===
          'use-pre-send-suggestion'
        ) {
          void useCurrentPreSendSuggestion()
        }
      },
      true,
    )
  }

  // B4_PRE_SEND_GATE_END



  async function copySuggestedMessage() {
    if (isCurrentAnalysisOutdated()) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'A conversa mudou. Analise novamente antes de copiar a mensagem.',
      }

      renderPanel()
      return
    }

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

    fireCompanionActionTelemetry(
      'suggestion_copied',
      {
        seed:
          createActionTelemetryInteractionId(),
        metadata: {
          source: 'copy_button',
        },
      },
    )

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

  function buildRichApplyConfirmationText(
    commercialReading,
  ) {
    if (
      !commercialReading ||
      !isRichCommercialReadingApplyCompatible(
        commercialReading,
      )
    ) {
      return null
    }

    const cycle =
      state
        .leadResolution
        ?.cycle

    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    const lines = [
      'Confirmar atualização na Yolen?',
      '',
    ]

    if (
      crm
        ?.should_change_crm_stage ===
        true &&
      crm
        .recommended_status
    ) {
      const currentLabel =
        cycle?.status
          ? getStageLabel(
              cycle.status,
            )
          : null

      const targetLabel =
        getStageLabel(
          crm.recommended_status,
        )

      lines.push(
        currentLabel
          ? `CRM: ${currentLabel} → ${targetLabel}`
          : `CRM: ${targetLabel}`,
      )

      const rationale =
        getCommercialReadingDisplayText(
          crm.rationale,
        )

      if (rationale) {
        lines.push(
          `Motivo do CRM: ${rationale}`,
        )
      }
    }

    if (
      agenda
        ?.should_change_agenda ===
        true
    ) {
      const agendaDate =
        agenda
          .expected_next_action_at
          ? formatSuggestionDate(
              agenda
                .expected_next_action_at,
            )
          : null

      if (agendaDate) {
        lines.push(
          `Agenda: ${agendaDate}`,
        )
      }

      const rationale =
        getCommercialReadingDisplayText(
          agenda.rationale,
        )

      if (rationale) {
        lines.push(
          `Motivo da Agenda: ${rationale}`,
        )
      }
    }

    lines.push('')
    lines.push(
      'Nada será alterado sem sua confirmação.',
    )
    lines.push(
      'A atualização será registrada no histórico.',
    )

    return lines.join('\n')
  }

  function buildApplyConfirmationText() {
    const commercialReading =
      getActiveCommercialReading()

    if (commercialReading) {
      return (
        buildRichApplyConfirmationText(
          commercialReading,
        ) ||
        'Esta atualização não está disponível nesta leitura. Atualize a análise antes de tentar novamente.'
      )
    }

    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const currentStatus =
      state
        .leadResolution
        ?.cycle
        ?.status ||
      '-'

    if (!suggestion) {
      return 'Confirmar aplicação da sugestão na Yolen?'
    }

    const lines = [
      'Confirmar aplicação da sugestão na Yolen?',
      '',
      `De: ${getStageLabel(currentStatus)}`,
      `Para: ${getStageLabel(
        suggestion.recommended_status,
      )}`,
    ]

    if (
      suggestion.next_action
    ) {
      lines.push(
        `Próxima ação: ${suggestion.next_action}`,
      )
    }

    if (
      suggestion.next_action_date
    ) {
      lines.push(
        `Data: ${formatSuggestionDate(
          suggestion.next_action_date,
        )}`,
      )
    }

    lines.push('')
    lines.push(
      'Essa ação vai atualizar o ciclo e registrar evento no histórico.',
    )

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

    registerSuggestionDecisionTelemetry({
      accepted: confirmed,
      suggestion,
      cycleId,
    })

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
        audio_count: state.lastAnalysisAudioCount || 0,
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

  function observeConversationScrollActivity() {
    document.addEventListener(
      'scroll',
      (event) => {
        const main =
          getMainConversationRoot()

        const target =
          event.target

        if (
          !main ||
          !(target instanceof Element)
        ) {
          return
        }

        if (
          target === main ||
          main.contains(target)
        ) {
          lastConversationScrollAt =
            Date.now()
        }
      },
      true,
    )
  }

  function observeWhatsAppChanges() {
    const observedRoot =
      document.body ||
      document.documentElement

    const observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        const target = mutation.target

        const targetElement =
          target instanceof Element
            ? target
            : target.parentElement

        if (!targetElement) {
          return false
        }

        return !targetElement.closest(`#${PANEL_ID}`)
      })

      if (!hasRelevantMutation) {
        return
      }

      window.clearTimeout(
        observeWhatsAppChanges.timeoutId,
      )

      observeWhatsAppChanges.timeoutId =
      window.setTimeout(() => {
        if (autoContactLookupInFlight) {
          return
        }

        const messageMutationDetected =
          refreshConversationSnapshot()

        checkPendingSuggestedMessageSentFromConversation()

        if (messageMutationDetected) {
          scheduleCaptureIngestion(0)

          scheduleAutomaticAnalysis(
            'Mensagem editada ou apagada detectada. A Yolen atualizará a análise em 8 segundos.',
          )
        } else {
          scheduleCaptureIngestion()

          scheduleAutomaticAnalysis(
            'Nova mensagem detectada. A Yolen aguardará 8 segundos antes de atualizar a análise.',
          )
        }
      }, 600)
    })

    observer.observe(observedRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  observeWhatsAppChanges.timeoutId = 0

  // B7_RUNTIME_HARDENING_START
  async function recoverCompanionRuntime(
    reason,
  ) {
    if (runtimeRecoveryInFlight) {
      return
    }

    runtimeRecoveryInFlight = true

    try {
      refreshConversationSnapshot()

      checkPendingSuggestedMessageSentFromConversation()

      await loadYolenSession({
        showLoading: false,
        resolveLeadAfterLoad: true,
      })

      if (!state.connected) {
        return
      }

      scheduleCaptureIngestion(0)

      const currentFingerprint =
        getCurrentConversationFingerprint()

      if (
        currentFingerprint &&
        currentFingerprint !==
          state.analyzedConversationFingerprint
      ) {
        scheduleAutomaticAnalysis(
          reason ||
            'A Yolen retomou a conversa e atualizará a análise em 8 segundos.',
        )
      }
    } finally {
      runtimeRecoveryInFlight = false
    }
  }

  function scheduleRuntimeRecovery(
    reason,
  ) {
    window.clearTimeout(
      runtimeRecoveryTimerId,
    )

    runtimeRecoveryTimerId =
      window.setTimeout(
        () => {
          runtimeRecoveryTimerId = 0

          void recoverCompanionRuntime(
            reason,
          )
        },
        RUNTIME_RECOVERY_DELAY_MS,
      )
  }

  function observeRuntimeRecovery() {
    window.addEventListener(
      'online',
      () => {
        scheduleRuntimeRecovery(
          'Conexão restabelecida. A Yolen atualizará a análise em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )

    window.addEventListener(
      'focus',
      () => {
        scheduleRuntimeRecovery(
          'Yolen retomada. A análise será atualizada em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )

    window.addEventListener(
      'pageshow',
      () => {
        scheduleRuntimeRecovery(
          'WhatsApp retomado. A análise será atualizada em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )

    document.addEventListener(
      'visibilitychange',
      () => {
        if (
          document.visibilityState !==
          'visible'
        ) {
          return
        }

        scheduleRuntimeRecovery(
          'Yolen retomada após pausa. A análise será atualizada em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )
  }
  // B7_RUNTIME_HARDENING_END

  async function start() {
    await waitForWhatsAppApp()

    if (
      globalThis[RUNTIME_STARTED_KEY] ===
      true
    ) {
      return
    }

    globalThis[RUNTIME_STARTED_KEY] = true

    await loadPanelCollapsedPreference()

    listenToWhatsAppAudioBridge()
    injectWhatsAppAudioBridge()
    createPanel()
    renderPanel()
    await captureSessionFromHash()
    refreshConversationSnapshot()
    observeConversationScrollActivity()
    observeWhatsAppChanges()
    observeRuntimeRecovery()
    observeComposerDraftForPreSend()
    observePreSendGateActions()
    observeManualWhatsAppSend()
    startSessionAutoRefresh()
    startCompanionClientContextTicker()
    loadYolenSession({
      showLoading: true,
      resolveLeadAfterLoad: true,
    })
  }

  start()
})()
