;(function initYolenManyChatCaptureRuntime(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SOURCE = 'YOLEN_COMPANION'
  const DEFAULT_DEBOUNCE_MS = 1200

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function dependency(options, optionName, globalName, methodName) {
    const value = options[optionName] ?? root[globalName]
    if (!value || typeof value[methodName] !== 'function') {
      const error = new Error(`${globalName}.${methodName} precisa estar disponível.`)
      error.name = 'YolenManyChatCaptureRuntimeError'
      error.code = 'DEPENDENCY_UNAVAILABLE'
      throw error
    }
    return value
  }

  // Runtime produtivo de captura ManyChat: compõe o dom reader + adapter já
  // validados (manychat-dom-reader.js / manychat-adapter.js) com
  // manychat-message-profile.js para ler mensagens elegíveis, resolve
  // lead/cycle pela identidade externa segura (bridge + RESOLVE_LEAD) e
  // despacha lotes de captura via background (INGEST_CAPTURE_MESSAGES),
  // reaproveitando buildCaptureIngestionPlanFromMessages para
  // batching/idempotência — nunca cria um segundo ledger nem uma segunda
  // lógica de permissão.
  //
  // Estado (resolução de ciclo, base_version por mensagem, última captura
  // enviada) é mantido POR conversation_key: nunca vaza de uma conversa
  // para outra ao trocar de A para B e voltar.
  function createManyChatCaptureRuntime(options = {}) {
    const readerApi = dependency(
      options,
      'readerApi',
      'YolenManyChatDomReader',
      'createManyChatDomReader',
    )
    const adapterApi = dependency(
      options,
      'adapterApi',
      'YolenManyChatAdapter',
      'createManyChatAdapter',
    )
    const captureBatchApi = dependency(
      options,
      'captureBatchApi',
      'YolenCompanionCaptureBatch',
      'buildCaptureIngestionPlanFromMessages',
    )
    const messageProfileApi = dependency(
      options,
      'messageProfileApi',
      'YolenManyChatMessageProfile',
      'readManyChatMessage',
    )

    // Áudio é opcional: sem essas duas dependências, a captura de texto
    // continua funcionando normalmente e só a transcrição de áudio fica
    // desligada (fail-safe, nunca fail-closed no texto por causa do áudio).
    const audioSourceApi = options.audioSourceApi ?? root.YolenManyChatAudioSource ?? null
    const audioIdentityApi = options.audioIdentityApi ?? root.YolenManyChatMessageIdentity ?? null

    const sendMessage = options.sendMessage
    if (typeof sendMessage !== 'function') {
      throw new Error('options.sendMessage é obrigatório.')
    }

    const selectors = options.selectors
    if (!isObject(selectors) || !selectors.conversationRoot || !selectors.messages) {
      throw new Error(
        'options.selectors.conversationRoot e options.selectors.messages são obrigatórios.',
      )
    }

    const schedule =
      typeof options.schedule === 'function'
        ? options.schedule
        : (fn, ms) => root.setTimeout(fn, ms)
    const cancelSchedule =
      typeof options.cancelSchedule === 'function'
        ? options.cancelSchedule
        : (handle) => root.clearTimeout(handle)
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
    const debounceMs = Number.isFinite(options.debounceMs)
      ? options.debounceMs
      : DEFAULT_DEBOUNCE_MS
    const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {}
    const getConversationUrl =
      typeof options.getConversationUrl === 'function'
        ? options.getConversationUrl
        : () => root.location?.href

    // manychat-adapter.js exige evidência de canal e de atribuição (known:
    // true) para considerar uma conversa elegível — por desenho, uma
    // conversa sem essa evidência nunca produz UniversalConversation (ver
    // "assignment desconhecido não é tratado como conversa não atribuída"
    // em manychat-adapter.test.mjs). Até hoje NÃO existe seletor de canal
    // nem de atribuição validado contra o DOM real do ManyChat (as seções
    // já validadas cobrem apenas estrutura de mensagens, autoria, conteúdo
    // e áudio) — por isso options.readChannel/options.readAssignment
    // continuam null por padrão aqui: sem evidência real, o runtime falha
    // fechado (evidence_ready=false) em vez de inventar canal/atribuição.
    // Quando essa evidência for validada ao vivo, passe
    // selectors.channel/selectors.assignment e options.readChannel/
    // options.readAssignment para destravar a captura de verdade.
    const readerProfile = Object.freeze({
      selectors: Object.freeze({
        conversationRoot: selectors.conversationRoot,
        channel: selectors.channel ?? null,
        contact: selectors.contact ?? null,
        assignment: selectors.assignment ?? null,
        messages: selectors.messages,
        composer: selectors.composer ?? null,
      }),
      readChannel: typeof options.readChannel === 'function' ? options.readChannel : undefined,
      readContact: typeof options.readContact === 'function' ? options.readContact : undefined,
      readAssignment:
        typeof options.readAssignment === 'function' ? options.readAssignment : undefined,
      readMessage: (node, index, surface) =>
        messageProfileApi.readManyChatMessage(node, index, surface),
    })

    const documentRef = options.document ?? root.document ?? null

    const reader = readerApi.createManyChatDomReader({
      document: documentRef,
      MutationObserver: options.MutationObserver,
      profile: readerProfile,
      surfaceProvider: options.surfaceProvider,
    })

    const adapter = adapterApi.createManyChatAdapter({ reader, now })

    const stateByConversationKey = new Map()
    let timerHandle = null
    let started = false
    let stopObserver = null

    function getConversationState(conversationKey) {
      if (!stateByConversationKey.has(conversationKey)) {
        stateByConversationKey.set(conversationKey, {
          resolution: null,
          resolutionIdentity: null,
          baseVersionsByMessageKey: {},
          lastContentFingerprint: null,
          transcribedMessageKeys: new Set(),
        })
      }
      return stateByConversationKey.get(conversationKey)
    }

    async function getSafeIdentity() {
      const response = await sendMessage({
        source: SOURCE,
        action: 'GET_MANYCHAT_SAFE_IDENTITY',
      })

      if (response?.ok !== true || response?.payload?.ready !== true) {
        return null
      }

      return response.payload.safe ?? null
    }

    async function resolveLeadForIdentity(safeIdentity) {
      const response = await sendMessage({
        source: SOURCE,
        action: 'RESOLVE_LEAD',
        payload: {
          platform: safeIdentity.platform,
          platform_contact_key: safeIdentity.platform_identity?.key,
        },
      })

      return response?.payload ?? null
    }

    // Resolve de verdade (sempre chama a identidade + RESOLVE_LEAD, nunca
    // olha o cache) e GRAVA o resultado em state.resolution — usado tanto
    // pela primeira resolução (ensureCycleResolved) quanto pelo refresh
    // explícito depois de um first-link (refreshLeadResolution). Nunca
    // mexe em nenhum outro campo do estado da conversa (base_version por
    // mensagem, fingerprint, transcrições) — só resolution.
    // Hardening (auditoria STEP 2A.3, "INITIAL SAME-CONVERSATION IDENTITY
    // SWAP"): a resolução inicial usava só uma leitura de identidade antes
    // do RESOLVE_LEAD — se o ManyChat trocar de contato NA MESMA
    // conversation_key enquanto RESOLVE_LEAD ainda está em voo, o cycle
    // devolvido pertence ao contato ANTIGO e nunca pode ser persistido (nem
    // usado por captureNow para ingerir o conteúdo do contato NOVO). Usa a
    // mesma dupla checagem de identidade (antes e depois do await) já
    // aplicada em refreshLeadResolution — nunca um segundo algoritmo.
    async function resolveAndStoreResolution(
      conversationKey,
      initialSafeIdentity = null,
    ) {
      const state = getConversationState(conversationKey)

      function abortStale() {
        state.resolution = null
        state.resolutionIdentity = null
        return Object.freeze({
          ready: false,
          reason: 'CONTACT_CHANGED',
          cycle_id: null,
        })
      }

      if (!isCurrentConversation(conversationKey)) {
        return abortStale()
      }

      const safeIdentity =
        initialSafeIdentity ?? await getSafeIdentity()

      if (!isCurrentConversation(conversationKey)) {
        return abortStale()
      }

      if (!safeIdentity?.platform || !safeIdentity?.platform_identity?.key) {
        state.resolution = Object.freeze({
          ready: false,
          reason: 'identity_not_ready',
          cycle_id: null,
        })
        state.resolutionIdentity = null
        return state.resolution
      }

      const expectedPlatform = safeIdentity.platform
      const expectedIdentityKey = safeIdentity.platform_identity.key

      const resolution = await resolveLeadForIdentity(safeIdentity)

      const safeIdentityAfterResolve = await getSafeIdentity()

      if (
        !isCurrentConversation(conversationKey) ||
        !matchesExpectedIdentity(
          safeIdentityAfterResolve,
          expectedPlatform,
          expectedIdentityKey,
        )
      ) {
        return abortStale()
      }

      const eligible =
        captureBatchApi.isCaptureResolutionEligible(resolution)

      state.resolution = Object.freeze({
        ready: eligible,
        reason: eligible
          ? null
          : (resolution?.status ?? 'resolution_unavailable'),
        cycle_id: eligible ? resolution.cycle.id : null,
      })

      state.resolutionIdentity = Object.freeze({
        platform: expectedPlatform,
        key: expectedIdentityKey,
      })

      return state.resolution
    }

    // Hardening (auditoria STEP 2A.4, "CACHED RESOLUTION IDENTITY SAFETY"):
    // o cache quente (state.resolution já preenchido) nunca pode ser
    // reutilizado sem confirmar que a safe identity ATUAL ainda é a mesma
    // que originou aquele cache — conversation_key sozinho não garante
    // isso, já que o ManyChat pode reaproveitar a mesma thread para outro
    // assinante sem nenhum conversation_changed. Toda leitura de
    // state.resolution passa a exigir uma leitura de identidade fresca e a
    // comparação contra state.resolutionIdentity (o binding gravado por
    // resolveAndStoreResolution/refreshLeadResolution). Identidade
    // divergente descarta o cache e força um resolve novo — nunca reusa o
    // cycle antigo. A identidade recém-lida é repassada para
    // resolveAndStoreResolution como initialSafeIdentity para nunca pedir
    // a mesma identidade duas vezes.
    async function ensureCycleResolved(conversationKey) {
      const state = getConversationState(conversationKey)

      if (!isCurrentConversation(conversationKey)) {
        state.resolution = null
        state.resolutionIdentity = null
        return Object.freeze({
          ready: false,
          reason: 'CONTACT_CHANGED',
          cycle_id: null,
        })
      }

      const safeIdentity = await getSafeIdentity()

      if (!isCurrentConversation(conversationKey)) {
        state.resolution = null
        state.resolutionIdentity = null
        return Object.freeze({
          ready: false,
          reason: 'CONTACT_CHANGED',
          cycle_id: null,
        })
      }

      if (!safeIdentity?.platform || !safeIdentity?.platform_identity?.key) {
        state.resolution = Object.freeze({
          ready: false,
          reason: 'identity_not_ready',
          cycle_id: null,
        })
        state.resolutionIdentity = null
        return state.resolution
      }

      if (
        state.resolution &&
        state.resolutionIdentity &&
        matchesExpectedIdentity(
          safeIdentity,
          state.resolutionIdentity.platform,
          state.resolutionIdentity.key,
        )
      ) {
        return state.resolution
      }

      state.resolution = null
      state.resolutionIdentity = null

      return resolveAndStoreResolution(
        conversationKey,
        safeIdentity,
      )
    }

    // Hardening (auditoria STEP 2A.3, "CONTACT_NOT_LINKED INVALIDATED ON
    // LEAVE"): um first-link cuja resposta HTTP se perde nunca dispara
    // onLinked/refreshLeadResolution — sem isto, state.resolution
    // continuaria CONTACT_NOT_LINKED para sempre mesmo depois do servidor
    // já ter gravado o vínculo. Chamado pelo bootstrap só ao abandonar uma
    // conversa cuja última resolução conhecida era CONTACT_NOT_LINKED,
    // nunca em toda troca de conversa. Limpa SÓ resolution — nunca
    // baseVersionsByMessageKey, lastContentFingerprint ou
    // transcribedMessageKeys.
    function invalidateLeadResolution(conversationKey) {
      const state = stateByConversationKey.get(conversationKey)

      if (!state) {
        return false
      }

      state.resolution = null
      state.resolutionIdentity = null
      return true
    }

    // Chamado depois de um first-link bem-sucedido (LINKED/IDEMPOTENT/
    // ALREADY_LINKED_CONFLICT — sempre, para refletir o estado real):
    // invalida SÓ a resolução desta conversa e busca de novo via
    // RESOLVE_LEAD, nunca inventa cycle a partir do lead selecionado na UI
    // (STEP 2A.3, seção 18/19). baseVersionsByMessageKey,
    // lastContentFingerprint e transcribedMessageKeys permanecem
    // intocados.
    //
    // Hardening (STEP 2A.3, correção final): entre o first-link terminar
    // no servidor e este refresh rodar, o vendedor pode ter trocado de
    // conversa/contato — expectedPlatform/expectedIdentityKey são a
    // identidade que foi REALMENTE vinculada, e conversationKey é a
    // conversa daquele vínculo. Revalida os dois ANTES e DEPOIS de cada
    // await: só grava state[conversationKey].resolution se a conversa
    // atual ainda for exatamente essa E a safe identity atual ainda for
    // exatamente essa. Se qualquer uma mudou, nunca persiste o resultado
    // (que poderia pertencer a outro contato/conversa — ex.: B) e limpa o
    // cache antigo (nunca deixa uma conversa presa eternamente num
    // CONTACT_NOT_LINKED que já foi resolvido no servidor).
    function isCurrentConversation(conversationKey) {
      return adapter.getCurrentConversation(getConversationUrl())?.conversation_key === conversationKey
    }

    function matchesExpectedIdentity(identity, expectedPlatform, expectedIdentityKey) {
      return (
        identity?.platform === expectedPlatform && identity?.platform_identity?.key === expectedIdentityKey
      )
    }

    async function refreshLeadResolution({ conversationKey, expectedPlatform, expectedIdentityKey }) {
      const state = getConversationState(conversationKey)

      function abortStale() {
        // Nunca deixa a conversa presa num cache antigo: o próximo ciclo
        // normal (captureNow/ensureCycleResolved) fará RESOLVE_LEAD de
        // novo quando o vendedor realmente voltar para ela.
        state.resolution = null
        state.resolutionIdentity = null
        return Object.freeze({ ready: false, reason: 'CONTACT_CHANGED', cycle_id: null })
      }

      if (!isCurrentConversation(conversationKey)) {
        return abortStale()
      }

      const safeIdentity = await getSafeIdentity()

      if (!matchesExpectedIdentity(safeIdentity, expectedPlatform, expectedIdentityKey) || !isCurrentConversation(conversationKey)) {
        return abortStale()
      }

      const resolution = await resolveLeadForIdentity(safeIdentity)

      // Hardening (auditoria STEP 2A.3, "POST-RESOLVE IDENTITY
      // REVALIDATION"): resolveLeadForIdentity é outro await — o contato
      // pode ter mudado DENTRO da mesma conversation_key (ex.: o ManyChat
      // reaproveita a mesma thread para outro assinante) sem que
      // isCurrentConversation detecte nada, já que ela só compara
      // conversation_key. Sem reler a safe identity aqui, um resultado de
      // RESOLVE_LEAD para o contato ANTIGO seria gravado como se fosse do
      // contato atual. Rechecar a identidade segura pela segunda vez (não
      // só a conversa) antes de persistir fecha essa janela.
      const identityStillMatches = matchesExpectedIdentity(
        await getSafeIdentity(),
        expectedPlatform,
        expectedIdentityKey,
      )

      if (!identityStillMatches || !isCurrentConversation(conversationKey)) {
        return abortStale()
      }

      const eligible = captureBatchApi.isCaptureResolutionEligible(resolution)

      state.resolution = Object.freeze({
        ready: eligible,
        reason: eligible ? null : (resolution?.status ?? 'resolution_unavailable'),
        cycle_id: eligible ? resolution.cycle.id : null,
      })

      state.resolutionIdentity = Object.freeze({
        platform: expectedPlatform,
        key: expectedIdentityKey,
      })

      return state.resolution
    }

    function queryMessageNodes() {
      if (!documentRef || typeof documentRef.querySelector !== 'function') {
        return []
      }

      const conversationRoot = documentRef.querySelector(selectors.conversationRoot)
      if (!conversationRoot || typeof conversationRoot.querySelectorAll !== 'function') {
        return []
      }

      try {
        return Array.from(conversationRoot.querySelectorAll(selectors.messages))
      } catch {
        return []
      }
    }

    function findNodeForMessageKey(messageKey) {
      if (!audioIdentityApi) return null

      for (const node of queryMessageNodes()) {
        const identity = audioIdentityApi.extractManyChatMessageIdentity(node)
        if (
          identity?.ready === true &&
          messageProfileApi.buildMessageKey(identity.native_message_id) === messageKey
        ) {
          return node
        }
      }

      return null
    }

    // Complementa a captura de texto: para cada mensagem de áudio ainda
    // sem transcrição, busca a URL real na página, despacha para o
    // backend (com o cycle_id JÁ resolvido — nunca um cycle de teste) e
    // reenvia a MESMA mensagem (mesma message_key) pelo caminho normal de
    // captura assim que a transcrição chega, virando uma nova versão do
    // ledger em vez de um registro paralelo. Nunca bloqueia nem atrasa a
    // captura de texto: falhas aqui são sempre silenciosas por mensagem.
    async function dispatchPendingAudioTranscriptions({ conversationKey, cycleId, channel, messages }) {
      if (!audioSourceApi || !audioIdentityApi) return

      const state = getConversationState(conversationKey)

      const pending = messages.filter(
        (message) =>
          message.content_type === 'audio' &&
          !message.audio_transcription &&
          !state.transcribedMessageKeys.has(message.message_key),
      )

      for (const message of pending) {
        const node = findNodeForMessageKey(message.message_key)
        if (!node) continue

        const source = audioSourceApi.extractManyChatAudioSource(node)
        if (source?.source_ready !== true || source.source_kind !== 'https') continue

        let transcriptionResponse
        try {
          transcriptionResponse = await sendMessage({
            source: SOURCE,
            action: 'TRANSCRIBE_MANYCHAT_AUDIO',
            payload: {
              audio_url: source.source_url,
              cycle_id: cycleId,
              audio_target_key: message.message_key,
              channel,
              audio_index: 0,
            },
          })
        } catch {
          continue
        }

        if (transcriptionResponse?.ok !== true) continue

        const text = transcriptionResponse.payload?.data?.text
        const normalizedText = typeof text === 'string' ? text.trim() : ''
        if (!normalizedText) continue

        // Revalida a conversa antes de aplicar qualquer efeito: a
        // transcrição é assíncrona e o usuário pode ter trocado de
        // conversa enquanto ela estava em andamento.
        if (adapter.getCurrentConversation(getConversationUrl())?.conversation_key !== conversationKey) {
          return
        }

        const transcribedMessage = {
          ...message,
          audio_transcription: normalizedText,
          observed_at: now(),
          base_version: state.baseVersionsByMessageKey[message.message_key] ?? null,
        }

        const plan = captureBatchApi.buildCaptureIngestionPlanFromMessages({
          cycleId,
          conversationKey,
          messages: [transcribedMessage],
        })

        for (const batch of plan.batches) {
          let response
          try {
            response = await sendMessage({
              source: SOURCE,
              action: 'INGEST_CAPTURE_MESSAGES',
              payload: batch,
            })
          } catch {
            continue
          }

          if (response?.ok !== true) continue

          for (const result of response.payload?.message_results ?? []) {
            if (result?.synced === true && typeof result.message_key === 'string') {
              state.baseVersionsByMessageKey[result.message_key] = result.canonical_version
              state.transcribedMessageKeys.add(result.message_key)
            }
          }
        }
      }
    }

    async function captureNow() {
      const current = adapter.getCurrentConversation(getConversationUrl())
      if (!current?.supported) {
        return {
          ok: false,
          reason: 'conversation_not_supported',
          conversation_key: current?.conversation_key ?? null,
        }
      }

      const conversationKey = current.conversation_key

      const resolution = await ensureCycleResolved(conversationKey)
      if (!resolution.ready) {
        return { ok: false, reason: resolution.reason, conversation_key: conversationKey }
      }

      const state = getConversationState(conversationKey)
      const resolutionIdentity = state.resolutionIdentity

      function abortSnapshotCorrelation() {
        // Só limpa se esta captura ainda estiver olhando para a mesma
        // resolution. Uma captura concorrente pode já ter resolvido outra
        // identidade corretamente; nunca apague o estado novo dela.
        if (state.resolution === resolution) {
          state.resolution = null
          state.resolutionIdentity = null
        }

        return {
          ok: false,
          reason: 'contact_changed_during_snapshot',
          conversation_key: conversationKey,
        }
      }

      if (
        !isCurrentConversation(conversationKey) ||
        state.resolution !== resolution ||
        !resolutionIdentity
      ) {
        return abortSnapshotCorrelation()
      }

      const built = adapter.buildUniversalConversation(getConversationUrl())
      if (!built.ready) {
        return { ok: false, reason: built.reason, conversation_key: conversationKey }
      }

      // ensureCycleResolved já forneceu a amostra de identidade ANTES do
      // snapshot. Agora relê a identidade DEPOIS que o DOM foi materializado.
      // O snapshot só pode ser usado se continuar pertencendo ao mesmo
      // binding que produziu `resolution`.
      const safeIdentityAfterSnapshot = await getSafeIdentity()

      if (
        !isCurrentConversation(conversationKey) ||
        state.resolution !== resolution ||
        state.resolutionIdentity?.platform !== resolutionIdentity.platform ||
        state.resolutionIdentity?.key !== resolutionIdentity.key ||
        !matchesExpectedIdentity(
          safeIdentityAfterSnapshot,
          resolutionIdentity.platform,
          resolutionIdentity.key,
        )
      ) {
        return abortSnapshotCorrelation()
      }

      const observedAt = now()

      const messagesWithVersion = built.conversation.messages.map((message) => ({
        ...message,
        observed_at: observedAt,
        base_version: state.baseVersionsByMessageKey[message.message_key] ?? null,
      }))

      const plan = captureBatchApi.buildCaptureIngestionPlanFromMessages({
        cycleId: resolution.cycle_id,
        conversationKey,
        messages: messagesWithVersion,
      })

      if (plan.messages.length === 0) {
        return {
          ok: true,
          skipped: true,
          reason: 'no_eligible_messages',
          conversation_key: conversationKey,
        }
      }

      // A comparação de "mudou desde a última vez" usa um fingerprint SEM
      // base_version: base_version é bookkeeping (o canonical_version
      // confirmado na última resposta), não conteúdo — se ele entrasse na
      // comparação, toda captura bem-sucedida geraria um fingerprint novo
      // na chamada seguinte mesmo sem nenhuma mudança real, e o runtime
      // nunca convergiria para "nada mudou" (reenviaria para sempre).
      const contentFingerprint = captureBatchApi.buildCaptureSnapshotKey({
        cycleId: resolution.cycle_id,
        conversationKey,
        messages: messagesWithVersion.map((message) => ({ ...message, base_version: null })),
      })

      const unchanged = state.lastContentFingerprint === contentFingerprint

      if (!unchanged) {
        for (const batch of plan.batches) {
          const response = await sendMessage({
            source: SOURCE,
            action: 'INGEST_CAPTURE_MESSAGES',
            payload: batch,
          })

          if (response?.ok !== true) {
            return {
              ok: false,
              reason: 'ingestion_rejected',
              detail: response ?? null,
              conversation_key: conversationKey,
            }
          }

          for (const result of response.payload?.message_results ?? []) {
            if (result?.synced === true && typeof result.message_key === 'string') {
              state.baseVersionsByMessageKey[result.message_key] = result.canonical_version
            }
          }
        }

        // A troca de conversa pode ter acontecido durante o despacho
        // (assíncrono). O estado gravado é sempre o de `conversationKey`
        // (nunca o da conversa atual no momento em que a resposta chega),
        // então nunca contamina a conversa para a qual o usuário já
        // navegou.
        state.lastContentFingerprint = contentFingerprint
      }

      // Independente de o texto ter mudado: sempre que houver mensagem de
      // áudio ainda sem transcrição (e ainda não tentada nesta conversa),
      // tenta transcrever. Isso roda em toda chamada de captureNow — o
      // dedupe por transcribedMessageKeys evita reprocessar a mesma
      // mensagem repetidamente.
      await dispatchPendingAudioTranscriptions({
        conversationKey,
        cycleId: resolution.cycle_id,
        channel: built.conversation.channel,
        messages: messagesWithVersion,
      })

      return unchanged
        ? { ok: true, skipped: true, reason: 'unchanged_snapshot', conversation_key: conversationKey }
        : { ok: true, skipped: false, batches: plan.batches.length, conversation_key: conversationKey }
    }

    function scheduleCapture() {
      if (timerHandle !== null) {
        cancelSchedule(timerHandle)
      }

      timerHandle = schedule(() => {
        timerHandle = null
        captureNow()
          .then((result) => onEvent({ type: 'capture_result', result }))
          .catch((error) => onEvent({ type: 'capture_error', error }))
      }, debounceMs)
    }

    function handleReaderEvent(event) {
      if (!isObject(event)) return

      if (event.type === 'conversation_changed' || event.type === 'conversation_mutated') {
        scheduleCapture()
      }

      onEvent({ type: 'reader_event', event })
    }

    function start() {
      if (started) return
      started = true
      stopObserver = reader.observeChanges(handleReaderEvent)
      scheduleCapture()
    }

    function stop() {
      if (!started) return
      started = false

      if (typeof stopObserver === 'function') {
        stopObserver()
      }
      stopObserver = null

      if (timerHandle !== null) {
        cancelSchedule(timerHandle)
      }
      timerHandle = null
    }

    return Object.freeze({
      start,
      stop,
      captureNow,
      getConversationState,
      getSafeIdentity,
      refreshLeadResolution,
      invalidateLeadResolution,
      // Fonte autoritativa única de "qual conversa está aberta agora",
      // sempre derivada ao vivo do adapter/URL — nunca uma variável que um
      // callback assíncrono desatualizado poderia sobrescrever (STEP
      // 2A.3, hardening final, item 7/8).
      getCurrentConversationKey: () =>
        adapter.getCurrentConversation(getConversationUrl())?.conversation_key ?? null,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    DEFAULT_DEBOUNCE_MS,
    createManyChatCaptureRuntime,
  })

  root.YolenManyChatCaptureRuntime = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
