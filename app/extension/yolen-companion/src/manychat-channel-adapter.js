// FASE 6 — ManyChatAdapter (contrato §6/§7/§8 do
// COMPANION_CORE_ARCHITECTURE_CONTRACT.md).
//
// ChannelAdapter do ManyChat com SOMENTE mecânica de plataforma, na mesma
// interface normalizada que o Companion Core consome do WhatsAppAdapter:
// conversa atual e chave, identidade externa segura e opaca, telefone
// confiável quando disponível, mensagens normalizadas, eventos com
// cancelamento, composer, container de montagem, capabilities e áudio.
// Nenhuma copy comercial, HTML de produto, estado seller-facing nem decisão
// de resolução/criação/workspace/análise/registro/enriquecimento vive aqui
// (§29). A conexão ao Core (bootstrap compartilhado) e a substituição do
// runtime legado ficam para a FASE 7: este módulo não entra em nenhum
// content script do manifest nesta fase.
//
// Infraestrutura reutilizada (comprovada ao vivo): manychat-surface.js
// (chave da rota autenticada), manychat-dom-reader.js + perfil de
// mensagens validado (manychat-message-profile/-identity/-content/
// -semantics), manychat-safe-identity-bridge.js (identidade opaca
// manychat:contact:v1:sha256:<64 hex>, nunca subscriber_id bruto),
// manychat-phone-evidence.js (telefone só com exatamente um candidato
// 55+10/11 dígitos em contexto WhatsApp, excluindo details-subscriber-id),
// manychat-composer.js (exatamente um <textarea> elegível, nunca envia) e
// manychat-audio-source.js (fonte https única por mensagem).
//
// Segurança: subscriber_id / wa_id nunca viram telefone; o telefone
// confiável só existe em memória, por instância de conversa, e é descartado
// na troca de conversa; nada é registrado em log nem persistido.
;(function initYolenManyChatChannelAdapter(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const DISPLAY_NAME = 'ManyChat'

  // Seletores validados ao vivo (A → B → A com autoria/identidade/conteúdo/
  // áudio reais) — os mesmos de manychat-capture-bootstrap.js. Canal e
  // atribuição continuam fora (sem evidência de DOM).
  const VALIDATED_SELECTORS = Object.freeze({
    conversationRoot: 'div[data-test-id="chat-messages-list"]',
    messages: ':scope > div > div[data-title-at][data-title-offset-bottom][data-title]',
  })

  const AUDIO_SOURCE_ACTION = 'FETCH_MANYCHAT_AUDIO_SOURCE'
  const EXTENSION_SOURCE = 'YOLEN_COMPANION'

  // Q4 decidida na FASE 6 por evidência técnica (ver FASE_6_EXECUTION.md):
  // true = SUPPORTED, 'conditional' = CONDITIONAL, false = indisponível.
  const MANYCHAT_CAPABILITIES = Object.freeze({
    canProvideTrustedPhone: 'conditional',
    canProvideDisplayName: false,
    canReadMessages: true,
    canObserveConversationChanges: true,
    canApplyMessage: true,
    canInterceptSend: false,
    canReadAudio: 'conditional',
    canRequestContactDetails: false,
    canClassifyGroupOrSelf: false,
    canDetectDeletedOrEdited: false,
    canProvideMountPoint: true,
  })

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function requireApi(value, name) {
    if (!value) {
      const error = new Error(`${name} ausente.`)
      error.name = 'YolenManyChatChannelAdapterError'
      error.code = 'DEPENDENCY_MISSING'
      throw error
    }

    return value
  }

  function pad(value) {
    return String(value).padStart(2, '0')
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function extensionApi() {
    return root.browser ?? root.chrome ?? null
  }

  async function sendRuntimeMessage(message) {
    const api = extensionApi()

    if (!api?.runtime || typeof api.runtime.sendMessage !== 'function') {
      return null
    }

    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime.sendMessage(message)
    }

    return new Promise((resolve) => {
      try {
        api.runtime.sendMessage(message, (response) => {
          resolve(api.runtime.lastError ? null : response)
        })
      } catch {
        resolve(null)
      }
    })
  }

  function createManyChatChannelAdapter(options = {}) {
    const documentRef = options.document ?? root.document ?? null
    const windowRef = options.window ?? documentRef?.defaultView ?? root.window ?? root

    const surfaceApi = requireApi(
      options.surfaceApi ?? root.YolenManyChatSurface,
      'YolenManyChatSurface',
    )
    const readerApi = requireApi(
      options.readerApi ?? root.YolenManyChatDomReader,
      'YolenManyChatDomReader',
    )
    const messageProfileApi = requireApi(
      options.messageProfileApi ?? root.YolenManyChatMessageProfile,
      'YolenManyChatMessageProfile',
    )
    const composerApi = requireApi(
      options.composerApi ?? root.YolenManyChatComposer,
      'YolenManyChatComposer',
    )
    const phoneEvidenceApi = options.phoneEvidenceApi ?? root.YolenManyChatPhoneEvidence ?? null
    const audioSourceApi = options.audioSourceApi ?? root.YolenManyChatAudioSource ?? null

    // Identidade opaca: por padrão, a bridge segura já validada
    // (GET_MANYCHAT_SAFE_IDENTITY → {ready, safe:{platform_identity:{key}}}).
    const readSafeIdentity =
      typeof options.readSafeIdentity === 'function'
        ? options.readSafeIdentity
        : () =>
            requireApi(
              root.YolenManyChatSafeIdentityBridge,
              'YolenManyChatSafeIdentityBridge',
            ).getCurrentSafeIdentity()

    const fetchAudioSource =
      typeof options.fetchAudioSource === 'function'
        ? options.fetchAudioSource
        : (url) =>
            sendRuntimeMessage({
              source: EXTENSION_SOURCE,
              action: AUDIO_SOURCE_ACTION,
              payload: { audio_url: url },
            })

    const surfaceProvider =
      typeof options.surfaceProvider === 'function'
        ? options.surfaceProvider
        : () => surfaceApi.getCurrentConversationSurface()

    const reader = readerApi.createManyChatDomReader({
      document: documentRef,
      MutationObserver: options.MutationObserver,
      schedule: options.schedule,
      cancelSchedule: options.cancelSchedule,
      scheduleInterval: options.scheduleInterval,
      cancelInterval: options.cancelInterval,
      mutationDebounceMs: options.mutationDebounceMs,
      lifecyclePollMs: options.lifecyclePollMs,
      surfaceProvider,
      profile: Object.freeze({
        selectors: VALIDATED_SELECTORS,
        readMessage: (node, index, surface) =>
          messageProfileApi.readManyChatMessage(node, index, surface),
      }),
    })

    // Estado físico por INSTÂNCIA de conversa (rota + geração). Nada disto
    // sobrevive a uma troca de conversa: evidência de contato, telefone,
    // identidade vista e handles de áudio são descartados.
    let generation = 0
    let instanceKey = null
    let contactEvidence = null
    let lastIdentityKey = null
    let contactEvidenceStale = false
    let pendingIdentityRevalidation = false
    const audioTargetsByHandle = new WeakMap()
    const hostListeners = new Set()

    function notifyHostListeners(conversationInstanceChanged) {
      for (const listener of Array.from(hostListeners)) {
        listener({ conversationInstanceChanged })
      }
    }

    // O contato aberto mudou dentro da MESMA rota: é outra instância de
    // conversa (nada do contato anterior sobrevive).
    function startNewContactInstance(identityKey) {
      generation += 1
      lastIdentityKey = identityKey
      contactEvidence = null
      contactEvidenceStale = true
    }

    function getSurface() {
      const surface = surfaceProvider()
      return isObject(surface) && surface.supported === true ? surface : null
    }

    function getConversationRoot() {
      try {
        return documentRef?.querySelector?.(VALIDATED_SELECTORS.conversationRoot) ?? null
      } catch {
        return null
      }
    }

    function getCurrentConversationKey() {
      const surface = getSurface()
      return surface && getConversationRoot() ? surface.conversation_key : null
    }

    function syncInstance() {
      const key = getCurrentConversationKey()

      if (key !== instanceKey) {
        instanceKey = key
        generation += 1
        contactEvidence = null
        lastIdentityKey = null
        contactEvidenceStale = false
        pendingIdentityRevalidation = Boolean(key)
      }

      return key
    }

    function isExpectedConversationOpen(expectedConversationKey) {
      return (
        !expectedConversationKey ||
        getCurrentConversationKey() === expectedConversationKey
      )
    }

    // ------------------------------------------------------------------
    // Conversa e evidência de contato (§7 getCurrentConversation /
    // getConversationKey / getContactEvidence).

    function readConversationSnapshot() {
      const conversationKey = syncInstance()
      const stale = contactEvidenceStale
      contactEvidenceStale = false
      const needsIdentityRevalidation = pendingIdentityRevalidation
      pendingIdentityRevalidation = false

      const trustedPhone =
        conversationKey && contactEvidence?.conversationKey === conversationKey
          ? contactEvidence.trustedPhone
          : null

      return {
        // Sem nome confiável comprovado (Q4): nenhum nome visível é
        // promovido a título/identidade da conversa.
        conversationTitle: '',
        conversationKey,
        conversationType: 'unknown',
        isSelfConversation: false,
        isGroupConversation: false,
        needsIdentityRevalidation,
        contactEvidenceStale: stale,
        groupEvidenceDropped: false,
        contactLookupIdentity: conversationKey || '',
        phone: trustedPhone?.phone ?? null,
        phoneSource: trustedPhone?.source ?? null,
      }
    }

    function sanitizeIdentity(result) {
      const key = result?.ready === true ? result?.safe?.platform_identity?.key : null

      if (typeof key !== 'string' || !/^manychat:contact:v1:sha256:[a-f0-9]{64}$/.test(key)) {
        return null
      }

      const channelKey = result?.safe?.channel_identity?.key

      return Object.freeze({
        platform: PLATFORM,
        key,
        channel:
          typeof channelKey === 'string' &&
          /^manychat:channel:whatsapp:v1:sha256:[a-f0-9]{64}$/.test(channelKey)
            ? 'whatsapp'
            : null,
      })
    }

    async function readIdentitySafely() {
      try {
        return sanitizeIdentity(await readSafeIdentity())
      } catch {
        return null
      }
    }

    // Evidência de contato da conversa ATUAL. Identidade lida duas vezes
    // (antes e depois do telefone) e conversa conferida depois de cada
    // espera: troca de conversa ou de contato na mesma rota → 'stale'.
    async function getContactEvidence() {
      const conversationKey = syncInstance()
      const generationAtRequest = generation

      if (!conversationKey) {
        return Object.freeze({ status: 'no_conversation', conversationKey: null })
      }

      const firstIdentity = await readIdentitySafely()

      if (generation !== generationAtRequest || syncInstance() !== conversationKey) {
        return Object.freeze({ status: 'stale', conversationKey })
      }

      const phone = phoneEvidenceApi?.resolveTrustedPhone?.(documentRef) ?? {
        ready: false,
        reason: 'phone_unavailable',
      }

      const secondIdentity = await readIdentitySafely()

      if (
        generation !== generationAtRequest ||
        syncInstance() !== conversationKey ||
        (firstIdentity?.key ?? null) !== (secondIdentity?.key ?? null)
      ) {
        return Object.freeze({ status: 'stale', conversationKey })
      }

      // Mesmo contato na mesma rota até aqui; um contato diferente do já
      // visto nesta instância é outra instância de conversa.
      if (
        lastIdentityKey &&
        secondIdentity?.key &&
        lastIdentityKey !== secondIdentity.key
      ) {
        startNewContactInstance(secondIdentity.key)
        notifyHostListeners(true)
        return Object.freeze({ status: 'stale', conversationKey })
      }

      if (secondIdentity?.key) {
        lastIdentityKey = secondIdentity.key
      }

      const evidence = Object.freeze({
        status: 'ready',
        conversationKey,
        externalIdentity: secondIdentity,
        trustedPhone:
          phone.ready === true && typeof phone.phone === 'string'
            ? Object.freeze({
                phone: phone.phone,
                source: phone.evidence?.source ?? 'manychat_dom_whatsapp_context_v1',
              })
            : null,
        phoneStatus: phone.ready === true ? 'trusted' : (phone.reason || 'phone_unavailable'),
        displayName: null,
        displayNameConfidence: 'unavailable',
      })

      contactEvidence = evidence
      return evidence
    }

    // Forma consumida pelo Core (mesmos resultados técnicos do
    // WhatsAppAdapter). A identidade externa segura segue junto mesmo sem
    // telefone: é evidência de vínculo existente, nunca telefone.
    async function acquireContactEvidence({
      conversationKey,
      isCurrentConversation,
      onLookupAttemptConsumed,
    } = {}) {
      const evidence = await getContactEvidence()

      if (
        evidence.status !== 'ready' ||
        evidence.conversationKey !== conversationKey ||
        (typeof isCurrentConversation === 'function' && !isCurrentConversation(conversationKey))
      ) {
        return { outcome: 'stale' }
      }

      if (evidence.trustedPhone) {
        return {
          outcome: 'phone',
          phone: evidence.trustedPhone.phone,
          source: evidence.trustedPhone.source,
          lookupIdentity: evidence.externalIdentity?.key ?? conversationKey,
          externalIdentity: evidence.externalIdentity,
        }
      }

      onLookupAttemptConsumed?.()

      return {
        outcome: 'phone_unavailable',
        reason: evidence.phoneStatus,
        externalIdentity: evidence.externalIdentity,
      }
    }

    // Revalida a identidade opaca da conversa aberta (dupla leitura). Um
    // contato diferente sob a mesma rota volta como identityChanged.
    async function revalidateConversationIdentity({
      conversationKey,
      isCurrentConversation,
    } = {}) {
      if (syncInstance() !== conversationKey) {
        return { outcome: 'stale' }
      }

      const generationAtRequest = generation
      const firstIdentity = await readIdentitySafely()
      const secondIdentity = await readIdentitySafely()

      if (
        generation !== generationAtRequest ||
        syncInstance() !== conversationKey ||
        (typeof isCurrentConversation === 'function' && !isCurrentConversation(conversationKey))
      ) {
        return { outcome: 'stale' }
      }

      if (!secondIdentity?.key || firstIdentity?.key !== secondIdentity.key) {
        return { outcome: 'unavailable' }
      }

      if (lastIdentityKey && lastIdentityKey !== secondIdentity.key) {
        startNewContactInstance(secondIdentity.key)
        return { outcome: 'resolved', identityChanged: true }
      }

      lastIdentityKey = secondIdentity.key
      return { outcome: 'resolved', identityChanged: false }
    }

    function hasOpenContactDetails() {
      return false
    }

    function hasAuthorizedContactDetails() {
      return false
    }

    function forgetContactEvidence(conversationKey) {
      if (!conversationKey || contactEvidence?.conversationKey === conversationKey) {
        contactEvidence = null
      }
    }

    // ------------------------------------------------------------------
    // Mensagens (§7 getMessages).

    function toCoreMessage(conversationKey, message, observedAt) {
      const date = new Date(message.occurred_at)

      return {
        id: `${conversationKey}::${message.message_key}`,
        timestampMs: date.getTime(),
        timestampLabel: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
        dateKey: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        direction: message.direction,
        authorKind: message.author_kind,
        sender: null,
        text: message.content_type === 'text' ? message.text_content || '' : '',
        hasAudio: message.content_type === 'audio',
        observedAt,
      }
    }

    function readNormalizedMessages() {
      const surface = getSurface()

      if (!surface || !getConversationRoot()) {
        return null
      }

      try {
        return { conversationKey: surface.conversation_key, messages: reader.collectVisibleMessages(surface) }
      } catch {
        // Perfil fail-closed (ex.: message_key duplicada): nenhuma mensagem
        // parcial chega ao Core.
        return null
      }
    }

    function readVisibleMessageEntries({ observedAt } = {}) {
      syncInstance()
      const read = readNormalizedMessages()

      if (!read) {
        return null
      }

      return read.messages.map((message) => {
        const coreMessage = toCoreMessage(read.conversationKey, message, observedAt)

        return {
          messageId: coreMessage.id,
          deleted: false,
          message: coreMessage,
        }
      })
    }

    function getSelectedChatActivitySnapshot() {
      const read = readNormalizedMessages()

      if (!read) {
        return ''
      }

      const last = read.messages.at(-1)
      return `${read.conversationKey}|${read.messages.length}|${last?.message_key ?? ''}`
    }

    function getLatestOutgoingVisibleMessageText() {
      const read = readNormalizedMessages()

      if (!read) {
        return ''
      }

      const outgoing = read.messages.filter(
        (message) =>
          message.direction === 'outgoing' &&
          message.author_kind === 'human_agent' &&
          message.content_type === 'text',
      )

      return normalizeText(outgoing.at(-1)?.text_content)
    }

    // ------------------------------------------------------------------
    // Eventos (§7 subscribeToConversationChanges), com cancelamento.

    function observeHostChanges(onChange) {
      if (typeof onChange !== 'function') {
        return () => {}
      }

      let active = true
      const listener = (payload) => {
        if (active) {
          onChange(payload)
        }
      }

      hostListeners.add(listener)

      const stop = reader.observeChanges((event) => {
        if (!active) {
          return
        }

        const conversationInstanceChanged = event?.type === 'conversation_changed'

        if (conversationInstanceChanged) {
          syncInstance()
        } else {
          // Mensagens mudaram: o contato aberto pode ter mudado na mesma
          // rota — o Core revalida a identidade opaca.
          pendingIdentityRevalidation = true
        }

        onChange({ conversationInstanceChanged })
      })

      return function unsubscribeHostChanges() {
        active = false
        hostListeners.delete(listener)
        stop?.()
      }
    }

    // ------------------------------------------------------------------
    // Composer (§7 getComposerState / applyMessage). Nunca envia.

    function resolveComposer() {
      return composerApi.resolveManyChatComposer({ document: documentRef })
    }

    function getComposerText() {
      const resolved = resolveComposer()
      return resolved.ready ? normalizeText(resolved.node.value) : ''
    }

    function getComposerState() {
      const resolved = resolveComposer()

      if (!resolved.ready) {
        return {
          available: false,
          busy: false,
          reason: resolved.reason === 'composer_ambiguous' ? 'composer_ambiguous' : 'composer_not_found',
        }
      }

      return {
        available: true,
        busy: Boolean(normalizeText(resolved.node.value)),
        reason: null,
      }
    }

    async function applyMessage(message, expected = {}) {
      const expectedConversationKey = expected?.conversationKey || null

      if (!isExpectedConversationOpen(expectedConversationKey)) {
        return { applied: false, reason: 'conversation_changed' }
      }

      const result = composerApi.applyManyChatComposerSuggestion({
        document: documentRef,
        window: windowRef,
        text: message,
        replaceExisting: expected?.replaceExisting === true,
      })

      // A verificação só vale na conversa em que a escrita começou.
      if (!isExpectedConversationOpen(expectedConversationKey)) {
        return { applied: false, reason: 'conversation_changed' }
      }

      if (result.applied === true) {
        return { applied: true, reason: null }
      }

      return {
        applied: false,
        reason:
          result.reason === 'composer_not_empty'
            ? 'composer_not_empty'
            : result.reason === 'composer_not_found' ||
                result.reason === 'composer_ambiguous' ||
                result.reason === 'conversation_anchor_missing'
              ? 'composer_not_found'
              : 'apply_verification_failed',
      }
    }

    function insertTextIntoEmptyComposer(text, expected = {}) {
      const expectedConversationKey = expected?.conversationKey || null

      if (!isExpectedConversationOpen(expectedConversationKey)) {
        return 'conversation_changed'
      }

      const result = composerApi.applyManyChatComposerSuggestion({
        document: documentRef,
        window: windowRef,
        text,
      })

      if (result.applied === true) {
        return isExpectedConversationOpen(expectedConversationKey)
          ? 'inserted'
          : 'conversation_changed'
      }

      if (result.reason === 'composer_not_empty') {
        return 'composer_not_empty'
      }

      if (
        result.reason === 'composer_not_found' ||
        result.reason === 'composer_ambiguous' ||
        result.reason === 'conversation_anchor_missing'
      ) {
        return 'composer_unavailable'
      }

      return result.reason === 'apply_verification_failed'
        ? 'insert_unconfirmed'
        : 'insert_failed'
    }

    function focusComposer() {
      const resolved = resolveComposer()

      if (resolved.ready) {
        resolved.node.focus?.()
      }
    }

    function onComposerDraftInput(onDraft) {
      if (typeof onDraft !== 'function' || !documentRef?.addEventListener) {
        return () => {}
      }

      const handleInput = (event) => {
        const resolved = resolveComposer()

        if (resolved.ready && event.target === resolved.node) {
          onDraft(resolved.node.value || '')
        }
      }

      documentRef.addEventListener('input', handleInput, true)

      return function unsubscribeComposerDraftInput() {
        documentRef.removeEventListener('input', handleInput, true)
      }
    }

    // Interceptação de envio sem evidência no ManyChat (Q4): indisponível.
    // O Core não se inscreve quando canInterceptSend é false.
    function onSendAttempt() {
      return () => {}
    }

    function hasSendControl() {
      return false
    }

    function triggerSend() {
      return { sent: false, reason: 'capability_unavailable' }
    }

    // ------------------------------------------------------------------
    // Montagem e capabilities (§7 getMountPoint / getCapabilities).

    // Evidência live: nenhum ancestral estável do ManyChat para acoplar a
    // UI; o container é o body (o painel é position: fixed). O Core cria e
    // renderiza o painel; o adapter só fornece o container.
    function getMountPoint() {
      return documentRef?.body ?? null
    }

    function getCapabilities() {
      return MANYCHAT_CAPABILITIES
    }

    // ------------------------------------------------------------------
    // Áudio (§7.2 getAudioSource) — handles opacos, fonte https validada.

    function getVisibleAudioTargets() {
      const conversationKey = syncInstance()
      const conversationRoot = getConversationRoot()

      if (!conversationKey || !conversationRoot || !audioSourceApi) {
        return []
      }

      let nodes = []

      try {
        nodes = Array.from(conversationRoot.querySelectorAll(VALIDATED_SELECTORS.messages))
      } catch {
        return []
      }

      const targets = []

      for (const node of nodes) {
        const source = audioSourceApi.extractManyChatAudioSource(node)

        if (source?.source_ready !== true || !source.source_url) {
          continue
        }

        const message = messageProfileApi.readManyChatMessage(node)

        if (!message?.message_key) {
          continue
        }

        const handle = Object.freeze({
          index: targets.length,
          key: `${conversationKey}::${message.message_key}`,
          durationSeconds: source.duration_seconds ?? null,
        })

        audioTargetsByHandle.set(handle, Object.freeze({
          url: source.source_url,
          conversationKey,
          generation,
          identityKey: lastIdentityKey,
        }))
        targets.push(handle)
      }

      return targets
    }

    function base64ToBlob(base64, mimeType) {
      const BlobCtor = windowRef?.Blob ?? root.Blob
      const binary = (windowRef?.atob ?? root.atob)(base64)
      const bytes = new Uint8Array(binary.length)

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }

      return new BlobCtor([bytes], { type: mimeType || 'audio/ogg' })
    }

    function refusedAudio(reason) {
      return { ok: false, blob: null, capturedBlobId: null, reason }
    }

    // A instância do handle continua viva? Confere a conversa ABERTA AGORA
    // (rota + raiz), sem depender de snapshot/observador, e a geração.
    function isAudioTargetConversationLive(target) {
      return (
        syncInstance() === target.conversationKey &&
        target.generation === generation
      )
    }

    // O contato aberto é o mesmo do handle? Sem identidade confirmável a
    // instância não é confirmada (recusa segura).
    async function confirmAudioTargetContact(target) {
      const current = await readIdentitySafely()

      if (!current?.key) {
        return null
      }

      if (target.identityKey && current.key !== target.identityKey) {
        return null
      }

      return current.key
    }

    async function getAudioSource(handle) {
      const target = handle && typeof handle === 'object' ? audioTargetsByHandle.get(handle) : null

      if (!target || !isAudioTargetConversationLive(target)) {
        return refusedAudio('audio_target_not_found')
      }

      const contactKey = await confirmAudioTargetContact(target)

      if (!contactKey || !isAudioTargetConversationLive(target)) {
        return refusedAudio('conversation_instance_unconfirmed')
      }

      if (lastIdentityKey && lastIdentityKey !== contactKey) {
        return refusedAudio('conversation_instance_unconfirmed')
      }

      let response = null

      try {
        response = await fetchAudioSource(target.url)
      } catch {
        response = null
      }

      // Depois da espera: mesma conversa viva, mesma geração e mesmo
      // contato — senão o resultado é descartado.
      if (
        !isAudioTargetConversationLive(target) ||
        (await confirmAudioTargetContact(target)) !== contactKey ||
        !isAudioTargetConversationLive(target)
      ) {
        return refusedAudio('conversation_changed')
      }

      const payload = response?.payload

      if (response?.ok !== true || payload?.ready !== true || typeof payload.audio_base64 !== 'string') {
        return refusedAudio(payload?.reason || 'audio_source_unavailable')
      }

      return {
        ok: true,
        blob: base64ToBlob(payload.audio_base64, payload.mime_type),
        capturedBlobId: null,
        reason: null,
        durationSeconds: handle.durationSeconds ?? null,
      }
    }

    // Sem bridge de captura de áudio no page world do ManyChat: a fonte é
    // a URL validada do próprio <audio>.
    function listenToAudioBridge() {
      return () => {}
    }

    function resetCapturedAudio() {}

    // ------------------------------------------------------------------
    // Ciclo de vida do canal (bootstrap compartilhado).

    function whenReady() {
      if (!documentRef || documentRef.readyState !== 'loading') {
        return Promise.resolve()
      }

      return new Promise((resolve) => {
        documentRef.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
      })
    }

    // A identidade segura (MAIN world + bridge) já é carregada pelo manifest.
    function startPlatform() {}

    return Object.freeze({
      platform: Object.freeze({ id: PLATFORM, displayName: DISPLAY_NAME }),
      whenReady,
      startPlatform,
      getMountPoint,
      getCapabilities,
      getCurrentConversationKey,
      readConversationSnapshot,
      getContactEvidence,
      acquireContactEvidence,
      revalidateConversationIdentity,
      hasOpenContactDetails,
      hasAuthorizedContactDetails,
      forgetContactEvidence,
      readVisibleMessageEntries,
      getSelectedChatActivitySnapshot,
      getLatestOutgoingVisibleMessageText,
      observeHostChanges,
      onComposerDraftInput,
      getComposerState,
      applyMessage,
      insertTextIntoEmptyComposer,
      getComposerText,
      focusComposer,
      onSendAttempt,
      hasSendControl,
      triggerSend,
      getVisibleAudioTargets,
      getAudioSource,
      listenToAudioBridge,
      resetCapturedAudio,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    DISPLAY_NAME,
    VALIDATED_SELECTORS,
    MANYCHAT_CAPABILITIES,
    AUDIO_SOURCE_ACTION,
    create: createManyChatChannelAdapter,
  })

  root.YolenManyChatChannelAdapter = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
