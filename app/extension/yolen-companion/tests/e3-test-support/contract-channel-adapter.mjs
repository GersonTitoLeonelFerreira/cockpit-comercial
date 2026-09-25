// ChannelAdapter de contrato (FASE 5) — independente do WhatsApp.
//
// Implementa só o contrato normalizado que o Companion Core consome, sobre
// um modelo em memória de conversas. Não imita identity bridge, caches,
// JID, painel "Dados do contato", seletores nem nós físicos do WhatsApp:
// o DOM disponível para o Core é só o container de montagem do painel.
//
// Toda propriedade lida pelo Core que não pertença ao contrato é
// registrada em `violations` e lança erro (acesso não contratado).
//
// Equivalência com os nomes conceituais do contrato (§7; nomes do código
// não são renomeados por cosmética):
//   platform                          → platform
//   getCurrentConversation /
//   getConversationKey                → readConversationSnapshot,
//                                       getCurrentConversationKey
//   getContactEvidence /
//   requestVisibleContactDetails      → acquireContactEvidence,
//                                       revalidateConversationIdentity,
//                                       hasOpenContactDetails,
//                                       hasAuthorizedContactDetails,
//                                       forgetContactEvidence
//   getMessages                       → readVisibleMessageEntries,
//                                       getSelectedChatActivitySnapshot
//   getLastOutgoingMessage            → getLatestOutgoingVisibleMessageText
//   subscribeToConversationChanges    → observeHostChanges
//   getComposerState / applyMessage   → getComposerState, applyMessage,
//                                       insertTextIntoEmptyComposer,
//                                       getComposerText, focusComposer,
//                                       onComposerDraftInput
//   interceptSendAttempt              → onSendAttempt, hasSendControl,
//                                       triggerSend
//   getAudioSource                    → getVisibleAudioTargets,
//                                       getAudioSource, listenToAudioBridge,
//                                       resetCapturedAudio
//   getMountPoint / getCapabilities   → getMountPoint, getCapabilities
//   (ciclo de vida do bootstrap)      → whenReady, startPlatform

export const CONTRACT_MEMBERS = Object.freeze([
  'platform',
  'whenReady',
  'startPlatform',
  'getMountPoint',
  'getCapabilities',
  'getCurrentConversationKey',
  'readConversationSnapshot',
  'acquireContactEvidence',
  'revalidateConversationIdentity',
  'hasOpenContactDetails',
  'hasAuthorizedContactDetails',
  'forgetContactEvidence',
  'readVisibleMessageEntries',
  'getSelectedChatActivitySnapshot',
  'getLatestOutgoingVisibleMessageText',
  'observeHostChanges',
  'onComposerDraftInput',
  'getComposerState',
  'applyMessage',
  'insertTextIntoEmptyComposer',
  'getComposerText',
  'focusComposer',
  'onSendAttempt',
  'hasSendControl',
  'triggerSend',
  'getVisibleAudioTargets',
  'getAudioSource',
  'listenToAudioBridge',
  'resetCapturedAudio',
])

export const ALL_CAPABILITIES = Object.freeze({
  canProvideTrustedPhone: 'conditional',
  canProvideDisplayName: 'conditional',
  canReadMessages: true,
  canObserveConversationChanges: true,
  canApplyMessage: true,
  canInterceptSend: true,
  canReadAudio: true,
  canRequestContactDetails: false,
  canClassifyGroupOrSelf: true,
  canDetectDeletedOrEdited: true,
  canProvideMountPoint: true,
})

function pad(value) {
  return String(value).padStart(2, '0')
}

function buildMessage(conversation, entry, index, observedAt) {
  const date = new Date(2026, 7, 21, 10, index, 0)

  return {
    id: `${conversation.key}::${entry.id}`,
    timestampMs: date.getTime(),
    timestampLabel: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    dateKey: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    direction: entry.direction || 'incoming',
    sender: entry.direction === 'outgoing' ? 'Vendedor' : conversation.title,
    text: entry.text,
    hasAudio: false,
    observedAt,
  }
}

// conversations: { [key]: { key, title, phone, phoneEvidence:
//   'trusted' | 'pending' | 'absent', messages: [{ id, text, direction }],
//   draft } }
export function createContractChannelAdapter({
  document,
  conversations,
  initialKey,
  capabilities = ALL_CAPABILITIES,
  mountPoint = document.body,
}) {
  const violations = []
  const calls = []
  const hostListeners = new Set()
  const draftListeners = new Set()
  const sendDeciders = new Set()
  let current = conversations[initialKey] || null

  const sent = []

  function record(name, detail) {
    calls.push(detail === undefined ? { name } : { name, detail })
  }

  function isExpected(expected) {
    return (
      !expected?.conversationKey ||
      expected.conversationKey === current?.key
    )
  }

  function dispatchSendAttempt(kind) {
    const attempt = Object.freeze({
      kind,
      cancelable: true,
      conversationKey: current?.key ?? null,
      draftText: current?.draft || '',
    })

    let block = false

    for (const decide of Array.from(sendDeciders)) {
      if (decide(attempt)?.block === true) {
        block = true
      }
    }

    if (!block && current) {
      sent.push({ conversationKey: current.key, text: current.draft || '', kind })
      current.messages.push({ id: `sent-${sent.length}`, text: current.draft || '', direction: 'outgoing' })
      current.draft = ''
    }

    return { block }
  }

  const adapter = {
    platform: Object.freeze({ id: 'contract', displayName: 'Canal Contrato' }),

    async whenReady() {
      record('whenReady')
    },

    startPlatform() {
      record('startPlatform')
    },

    getMountPoint() {
      record('getMountPoint')
      return mountPoint
    },

    getCapabilities() {
      return capabilities
    },

    getCurrentConversationKey() {
      return current?.key ?? null
    },

    readConversationSnapshot() {
      const trusted = current?.phoneEvidence === 'trusted'

      return {
        conversationTitle: current?.title ?? '',
        conversationKey: current?.key ?? null,
        isSelfConversation: false,
        isGroupConversation: false,
        needsIdentityRevalidation: false,
        contactEvidenceStale: false,
        groupEvidenceDropped: false,
        contactLookupIdentity: current?.title ?? '',
        phone: trusted ? current.phone : null,
        phoneSource: trusted ? 'Evidência do canal' : null,
      }
    },

    async acquireContactEvidence({ conversationKey, isCurrentConversation, onLookupAttemptConsumed }) {
      record('acquireContactEvidence', conversationKey)

      if (
        !current ||
        current.key !== conversationKey ||
        !isCurrentConversation(conversationKey)
      ) {
        return { outcome: 'stale' }
      }

      if (current.phoneEvidence === 'trusted') {
        return {
          outcome: 'phone',
          phone: current.phone,
          source: 'Evidência do canal',
          lookupIdentity: current.title,
        }
      }

      onLookupAttemptConsumed?.()
      return { outcome: 'phone_unavailable' }
    },

    async revalidateConversationIdentity() {
      return { outcome: 'unavailable' }
    },

    hasOpenContactDetails() {
      return false
    },

    hasAuthorizedContactDetails() {
      return false
    },

    forgetContactEvidence(conversationKey) {
      record('forgetContactEvidence', conversationKey)
    },

    readVisibleMessageEntries({ observedAt }) {
      if (!current) {
        return null
      }

      return current.messages.map((entry, index) => ({
        messageId: `${current.key}::${entry.id}`,
        deleted: false,
        message: buildMessage(current, entry, index, observedAt),
      }))
    },

    getSelectedChatActivitySnapshot() {
      return current ? `${current.title}|${current.messages.length}` : ''
    },

    getLatestOutgoingVisibleMessageText() {
      const outgoing = (current?.messages || []).filter((entry) => entry.direction === 'outgoing')
      return outgoing.at(-1)?.text || ''
    },

    observeHostChanges(onChange) {
      hostListeners.add(onChange)
      return () => hostListeners.delete(onChange)
    },

    onComposerDraftInput(onDraft) {
      draftListeners.add(onDraft)
      return () => draftListeners.delete(onDraft)
    },

    getComposerState() {
      if (!current) {
        return { available: false, busy: false, reason: 'composer_not_found' }
      }

      return { available: true, busy: Boolean(current.draft), reason: null }
    },

    async applyMessage(text, expected = {}) {
      record('applyMessage', { text, expected })

      if (!isExpected(expected)) {
        return { applied: false, reason: 'conversation_changed' }
      }

      if (current.draft && expected.replaceExisting !== true) {
        return { applied: false, reason: 'composer_not_empty' }
      }

      current.draft = text
      return { applied: true, reason: null }
    },

    insertTextIntoEmptyComposer(text, expected = {}) {
      record('insertTextIntoEmptyComposer', { text, expected })

      if (!isExpected(expected)) {
        return 'conversation_changed'
      }

      if (!current) {
        return 'composer_unavailable'
      }

      if (current.draft) {
        return 'composer_not_empty'
      }

      current.draft = text
      return 'inserted'
    },

    getComposerText() {
      return current?.draft || ''
    },

    focusComposer() {
      record('focusComposer')
    },

    onSendAttempt(decide) {
      sendDeciders.add(decide)
      return () => sendDeciders.delete(decide)
    },

    hasSendControl() {
      return Boolean(current)
    },

    triggerSend(expected = {}) {
      record('triggerSend', expected)

      if (!isExpected(expected)) {
        return { sent: false, reason: 'conversation_changed' }
      }

      if (
        typeof expected.draftText === 'string' &&
        (current.draft || '') !== expected.draftText
      ) {
        return { sent: false, reason: 'draft_changed' }
      }

      const { block } = dispatchSendAttempt('click')

      return block
        ? { sent: false, reason: 'send_failed' }
        : { sent: true, reason: null }
    },

    getVisibleAudioTargets() {
      return []
    },

    async getAudioSource() {
      return { ok: false, blob: null, reason: 'audio_target_not_found' }
    },

    listenToAudioBridge() {
      record('listenToAudioBridge')
      return () => {}
    },

    resetCapturedAudio() {},
  }

  const contractMembers = new Set(CONTRACT_MEMBERS)

  const strictAdapter = new Proxy(adapter, {
    get(target, property, receiver) {
      if (typeof property === 'string' && !contractMembers.has(property)) {
        violations.push(property)
        throw new Error(`Acesso não contratado ao ChannelAdapter: ${property}`)
      }

      return Reflect.get(target, property, receiver)
    },
    has(target, property) {
      return contractMembers.has(property)
    },
  })

  const controls = {
    get current() {
      return current
    },
    switchTo(key) {
      current = conversations[key] || null
      for (const listener of Array.from(hostListeners)) {
        listener({ conversationInstanceChanged: true })
      }
    },
    emitChange() {
      for (const listener of Array.from(hostListeners)) {
        listener({ conversationInstanceChanged: false })
      }
    },
    typeDraft(text) {
      current.draft = text
      for (const listener of Array.from(draftListeners)) {
        listener(text)
      }
    },
    userSend() {
      return dispatchSendAttempt('enter')
    },
    get sent() {
      return sent
    },
    get calls() {
      return calls
    },
    get violations() {
      return violations
    },
    get subscriptionCounts() {
      return {
        host: hostListeners.size,
        draft: draftListeners.size,
        send: sendDeciders.size,
      }
    },
  }

  return { adapter: strictAdapter, controls }
}
