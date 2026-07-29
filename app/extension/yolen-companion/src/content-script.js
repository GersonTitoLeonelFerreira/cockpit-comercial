;(function initYolenCompanion() {
  const PANEL_ID = 'yolen-companion-panel'
  const ROOT_CLASS = 'yolen-companion-root'
  const WHATSAPP_APP_SELECTOR = '#app'
  const SESSION_REFRESH_INTERVAL_MS = 60000
  const HASH_SESSION_KEY = 'yolen_companion_session'
  const AUTO_CONTACT_LOOKUP_DELAY_MS = 900
  const AUTO_CONTACT_LOOKUP_TIMEOUT_MS = 3500
  const AUTOMATIC_ANALYSIS_DELAY_MS = 8000
  const MAX_MESSAGE_LEDGER_SIZE = 300
  const MAX_ANALYSIS_MESSAGE_COUNT = 80

  let sessionRefreshTimerId = 0
  let lastResolvedConversationKey = null
  let leadResolutionInFlight = false
  let autoContactLookupInFlight = false
  let capturedAudioBlobEntries = []
  let automaticAnalysisTimerId = 0
  let automaticAnalysisScheduledKey = null
  let lastSelectedChatActivitySnapshot = null
  let messageLedgerConversationKey = null
  let messageWindowFloorTimestamp = null
  let conversationMessageLedger = new Map()

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
    analyzedConversationFingerprint: null,
    automaticAnalysisStatus: null,
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

  function cleanCapturedMessageText(value) {
    const text =
      normalizeMessageText(value)

    if (
      !text ||
      /^(\d{1,2}:\d{2}\s*)+$/.test(text)
    ) {
      return ''
    }

    return text.slice(0, 4000)
  }

  function buildReliableMessageFromNode(
    node,
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
      cleanCapturedMessageText(
        node.textContent,
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
        isOutgoingMessageNode(node)
          ? 'outgoing'
          : 'incoming',
      sender:
        getMessageSenderFromPrePlainText(
          prePlainText,
        ),
      text,
      hasAudio,
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
  }

  function synchronizeConversationMessageLedger() {
    const conversationKey =
      state.conversationKey

    if (!conversationKey) {
      return
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
      return
    }

    main
      .querySelectorAll(
        '[data-pre-plain-text]',
      )
      .forEach((node) => {
        const message =
          buildReliableMessageFromNode(
            node,
          )

        if (!message) {
          return
        }

        conversationMessageLedger.set(
          message.id,
          message,
        )
      })

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
    if (messages.length === 0) {
      return []
    }

    const latestDateKey =
      messages[
        messages.length - 1
      ].dateKey

    return messages
      .filter(
        (message) =>
          message.dateKey ===
          latestDateKey,
      )
      .slice(
        -MAX_ANALYSIS_MESSAGE_COUNT,
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
          text: message.text,
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
          occurredAt: result.payload.data.occurred_at || null,
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

    if (messages.length === 0) {
      return null
    }

    const fingerprintSource =
      messages
        .map((message) => {
          return [
            message.id,
            message.timestamp_ms,
            message.text,
            message.audio_transcription ||
              '',
          ].join('|')
        })
        .join('\n')

    if (
      fingerprintSource.length < 15
    ) {
      return null
    }

    return buildConversationFingerprint(
      fingerprintSource,
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
    clearAutomaticAnalysisTimer()

    if (!canScheduleAutomaticAnalysis()) {
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

    const scheduledKey =
      getAutomaticAnalysisKey()

    if (!scheduledKey) {
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
    capturedAudioBlobEntries = []
    clearAutomaticAnalysisTimer()

    lastSelectedChatActivitySnapshot =
      getSelectedChatActivitySnapshot()

    state = {
      ...state,
      leadResolutionLoading: false,
      leadResolution: null,
      leadResolutionError: null,
      autoLookupStatus: null,
      conversationAnalysisLoading: false,
      conversationAnalysis: null,
      conversationAnalysisError: null,
      analyzedConversationFingerprint: null,
      automaticAnalysisStatus: null,
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

    const phoneResult =
      getConversationPhone(
        conversationTitle,
        conversationKey,
      )

    const previousConversationKey =
      state.conversationKey

    const conversationChanged =
      previousConversationKey !==
      conversationKey

    if (conversationChanged) {
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
      isSelfConversation,
    }

    synchronizeConversationMessageLedger()

    state = {
      ...state,
      messageCount:
        getVisibleMessagesCount(),
      audioCount:
        getVisibleAudioCount(),
    }

    if (isSelfConversation) {
      lastResolvedConversationKey = null
      clearLeadStateForNewConversation()
      renderPanel()
      return
    }

    renderPanel()

    if (
      state.connected &&
      phoneResult.phone &&
      lastResolvedConversationKey !==
        conversationKey
    ) {
      lastResolvedConversationKey =
        conversationKey

      resolveCurrentLead()
      return
    }

    if (
      state.connected &&
      !phoneResult.phone &&
      conversationKey
    ) {
      window.setTimeout(() => {
        runAutomaticContactLookup(
          conversationKey,
        )
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

  function hasAudioWithoutTranscriptionForAnalysis() {
    return Boolean(state.conversationAnalysis) && Number(state.lastAnalysisAudioCount || 0) > 0
  }

  function canApplyCurrentSuggestion() {
    const suggestion = state.conversationAnalysis?.suggestion

    return (
      canAnalyzeCurrentConversation() &&
      Boolean(state.conversationAnalysis?.saved_coaching?.id) &&
      Boolean(suggestion) &&
      isOpenSuggestionStatus(suggestion.recommended_status) &&
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
    const message = state.conversationAnalysis?.coaching?.suggested_message

    return typeof message === 'string' && message.trim() ? message.trim() : null
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
    const message = getSuggestedMessage()

    if (
      !message ||
      isCurrentAnalysisOutdated()
    ) {
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

      const totalAudioCount = Number(state.audioCount || 0)
      const pendingAudioCount = getPendingAudioCountForCurrentConversation()
      const transcribedAudioCount = Math.max(
        0,
        totalAudioCount - pendingAudioCount,
      )
      const nextAudioNumber = Math.min(
        totalAudioCount,
        transcribedAudioCount + 1,
      )
  
      const transcribeAudioButton = pendingAudioCount > 0
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

        if (isCurrentAnalysisOutdated()) {
          return `
            ${transcribeAudioButton}
  
            <button
              class="yolen-primary-button"
              type="button"
              data-yolen-action="analyze-conversation"
            >
              Analisar conversa novamente
            </button>
          `
        }

      if (!state.conversationAnalysis?.suggestion) {
        return `
          ${transcribeAudioButton}
          <button class="yolen-primary-button" type="button" data-yolen-action="analyze-conversation">
            Analisar conversa com IA
          </button>
        `
      }

      if (!canApplyCurrentSuggestion()) {
        return `
          ${transcribeAudioButton}
          ${insertMessageButton}
          ${copyMessageButton}
          ${analyzeButton}
        `
      }

    return `
      <button class="yolen-primary-button" type="button" data-yolen-action="apply-suggestion">
        Aplicar sugestão na Yolen
      </button>

      ${transcribeAudioButton}
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
        ${getAudioTranscriptionHtml()}
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
            <span class="yolen-metric-label">mensagens da conversa atual</span>
          </div>

          <div class="yolen-metric">
            <span class="yolen-metric-number">${state.audioCount}</span>
            <span class="yolen-metric-label">áudios da conversa atual</span>
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

        </div>          <div class="yolen-rule">Não aplica ação sem aprovação</div>
        <div class="yolen-rule">Não aplica sugestão com áudio sem transcrição</div>
        <div class="yolen-rule">Não envia mensagem automaticamente</div>
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
      analyzeCurrentConversation({
        automatic: false,
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

      loadSavedAudioTranscriptionsForCurrentCycle()
        .finally(() => {
          lockCurrentMessageWindow()
          refreshConversationSnapshot()

          scheduleAutomaticAnalysis(
            'Lead localizado. A conversa será analisada automaticamente em 8 segundos.',
          )
        })
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

  async function analyzeCurrentConversation(
    options = {},
  ) {
    const isAutomatic =
      options.automatic === true

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
            conversation_text:
              conversationText,
            messages:
              companionMessages,
            source: 'whatsapp',
            audio_count:
              state.lastAnalysisAudioCount ||
              0,
          })

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
    if (!node || typeof node.closest !== 'function') {
      return false
    }

    if (node.closest('.message-out')) {
      return true
    }

    const dataIdElement = node.closest('[data-id]')
    const dataId = dataIdElement?.getAttribute('data-id') || ''

    return dataId.startsWith('true_') || dataId.includes('_true_')
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

      const text = normalizeMessageText(node.textContent)

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

  function observeWhatsAppChanges() {
    const observedRoot =
      document.querySelector(WHATSAPP_APP_SELECTOR) ||
      document.body

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
        refreshConversationSnapshot()
        checkPendingSuggestedMessageSentFromConversation()
        handleConversationActivityForAutomaticAnalysis()
      }, 600)
    })

    observer.observe(observedRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  observeWhatsAppChanges.timeoutId = 0

  async function start() {
    await waitForWhatsAppApp()

    listenToWhatsAppAudioBridge()
    injectWhatsAppAudioBridge()
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