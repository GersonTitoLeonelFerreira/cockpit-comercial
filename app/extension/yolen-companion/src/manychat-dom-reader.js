;(function initYolenManyChatDomReader(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const UNKNOWN = 'unknown'
  const AUTHOR_KINDS = Object.freeze([
    'customer',
    'human_agent',
    'automation',
    'unknown',
  ])

  // Marcador da NOSSA própria UI (painel Yolen, montado à parte em
  // document.body pelo Companion Core). Nunca uma classe/atributo
  // do ManyChat: é um contrato que nós mesmos controlamos. Mutações restritas
  // a esse marcador nunca contam como evidência de mudança na conversa —
  // caso contrário, o próprio re-render do painel (innerHTML) reacionaria o
  // observer indefinidamente (o painel escreve → o observer dispara → o
  // painel escreve de novo, em loop autoinduzido e sem fim natural).
  const OWN_UI_MARKER_SELECTOR = '[data-yolen-platform]'

  // Debounce padrão para coalescer rajadas de mutações reais do ManyChat
  // (ex.: a renderização inicial de uma conversa insere dezenas de nós de
  // uma vez) em um único evento — evita recalcular a surface e notificar o
  // painel/captura a cada mutação individual.
  const DEFAULT_MUTATION_DEBOUNCE_MS = 250

  // Intervalo do polling de lifecycle (troca de conversa / remount do
  // conversationRoot). É deliberadamente um mecanismo SEPARADO e barato
  // (só parsing de URL via surfaceProvider + uma querySelector rasa) do
  // observer de conteúdo — nunca um MutationObserver no documento inteiro.
  // Uma tempestade de mutações em qualquer outra parte da SPA (lista
  // lateral, badges, timers, loaders) nunca aciona nada aqui, porque este
  // mecanismo nem está olhando para essas mutações.
  const DEFAULT_LIFECYCLE_POLL_MS = 500

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message) {
    const error = new Error(message)
    error.name = 'YolenManyChatDomReaderError'
    error.code = code
    throw error
  }

  function normalizeSelector(value, path, required = false) {
    if (value === null || value === undefined || value === '') {
      if (required) fail('SELECTOR_REQUIRED', `${path} é obrigatório.`)
      return null
    }

    if (typeof value !== 'string' || !value.trim()) {
      fail('INVALID_SELECTOR', `${path} deve ser um seletor CSS não vazio.`)
    }

    return value.trim()
  }

  function normalizeProfile(value) {
    if (!isObject(value)) {
      fail('PROFILE_REQUIRED', 'profile é obrigatório para criar o ManyChat DOM reader.')
    }

    const selectors = isObject(value.selectors) ? value.selectors : {}

    const profile = {
      selectors: Object.freeze({
        conversationRoot: normalizeSelector(
          selectors.conversationRoot,
          'profile.selectors.conversationRoot',
          true,
        ),
        channel: normalizeSelector(selectors.channel, 'profile.selectors.channel'),
        contact: normalizeSelector(selectors.contact, 'profile.selectors.contact'),
        assignment: normalizeSelector(
          selectors.assignment,
          'profile.selectors.assignment',
        ),
        messages: normalizeSelector(
          selectors.messages,
          'profile.selectors.messages',
          true,
        ),
        composer: normalizeSelector(selectors.composer, 'profile.selectors.composer'),
      }),
      readChannel:
        typeof value.readChannel === 'function' ? value.readChannel : null,
      readContact:
        typeof value.readContact === 'function' ? value.readContact : null,
      readAssignment:
        typeof value.readAssignment === 'function' ? value.readAssignment : null,
      readMessage:
        typeof value.readMessage === 'function' ? value.readMessage : null,
      readComposer:
        typeof value.readComposer === 'function' ? value.readComposer : null,
    }

    if (!profile.readMessage) {
      fail('MESSAGE_READER_REQUIRED', 'profile.readMessage é obrigatório.')
    }

    return Object.freeze(profile)
  }

  function queryOne(scope, selector) {
    if (!scope || !selector || typeof scope.querySelector !== 'function') return null
    try {
      return scope.querySelector(selector)
    } catch {
      return null
    }
  }

  function queryAll(scope, selector) {
    if (!scope || !selector || typeof scope.querySelectorAll !== 'function') return []
    try {
      return Array.from(scope.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  function isWithinOwnUi(node) {
    if (!node) return false
    // Nós de texto não têm .closest — sobe até o elemento pai mais próximo
    // antes de checar o marcador.
    const element = typeof node.closest === 'function' ? node : node.parentElement ?? null
    return Boolean(element?.closest?.(OWN_UI_MARKER_SELECTOR))
  }

  function hasMutationOutsideOwnUi(mutations) {
    if (!Array.isArray(mutations)) return true
    return mutations.some((mutation) => !isWithinOwnUi(mutation?.target))
  }

  function normalizeChannel(value) {
    return typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : UNKNOWN
  }

  function normalizeContact(value, surface) {
    const base = {
      name: null,
      phone: null,
      external_contact_id: surface?.external_contact_id ?? null,
    }

    if (!isObject(value)) return Object.freeze(base)

    return Object.freeze({
      name: value.name ?? null,
      phone: value.phone ?? null,
      external_contact_id:
        value.external_contact_id ?? surface?.external_contact_id ?? null,
    })
  }

  function unknownAssignment() {
    return Object.freeze({
      known: false,
      assigned: null,
      agent_id: null,
      agent_name: null,
    })
  }

  function normalizeAssignment(value) {
    if (!isObject(value) || value.known !== true || typeof value.assigned !== 'boolean') {
      return unknownAssignment()
    }

    return Object.freeze({
      known: true,
      assigned: value.assigned,
      agent_id: value.assigned ? value.agent_id ?? null : null,
      agent_name: value.assigned ? value.agent_name ?? null : null,
    })
  }

  function normalizeMessage(value, index) {
    if (!isObject(value)) {
      fail('INVALID_MESSAGE', `profile.readMessage retornou valor inválido em messages[${index}].`)
    }

    if (typeof value.message_key !== 'string' || !value.message_key.trim()) {
      fail('MESSAGE_KEY_REQUIRED', `messages[${index}].message_key é obrigatório.`)
    }

    if (value.direction !== 'incoming' && value.direction !== 'outgoing') {
      fail(
        'INVALID_DIRECTION',
        `messages[${index}].direction deve ser incoming ou outgoing.`,
      )
    }

    if (!AUTHOR_KINDS.includes(value.author_kind)) {
      fail(
        'INVALID_AUTHOR_KIND',
        `messages[${index}].author_kind deve ser customer, human_agent, automation ou unknown.`,
      )
    }

    if (value.content_type !== 'text' && value.content_type !== 'audio') {
      fail(
        'INVALID_CONTENT_TYPE',
        `messages[${index}].content_type deve ser text ou audio.`,
      )
    }

    if (typeof value.occurred_at !== 'string' || !Number.isFinite(Date.parse(value.occurred_at))) {
      fail('INVALID_OCCURRED_AT', `messages[${index}].occurred_at é inválido.`)
    }

    const isDeleted = value.is_deleted === true

    if (isDeleted && value.deletion_reason !== 'explicit_deletion') {
      fail(
        'UNPROVEN_DELETION',
        'O reader só pode marcar exclusão quando houver evidência explícita de exclusão.',
      )
    }

    return Object.freeze({
      message_key: value.message_key.trim(),
      direction: value.direction,
      author_kind: value.author_kind,
      occurred_at: new Date(value.occurred_at).toISOString(),
      content_type: value.content_type,
      text_content: isDeleted ? null : value.text_content ?? null,
      audio_transcription: isDeleted ? null : value.audio_transcription ?? null,
      is_deleted: isDeleted,
      deletion_reason: isDeleted ? 'explicit_deletion' : null,
    })
  }

  function createManyChatDomReader(options = {}) {
    const documentRef = options.document ?? root.document ?? null
    const MutationObserverClass =
      options.MutationObserver ?? root.MutationObserver ?? null
    const profile = normalizeProfile(options.profile)
    const surfaceProvider =
      typeof options.surfaceProvider === 'function'
        ? options.surfaceProvider
        : () => root.YolenManyChatSurface?.getCurrentConversationSurface?.() ?? null
    const schedule =
      typeof options.schedule === 'function'
        ? options.schedule
        : (fn, ms) => root.setTimeout(fn, ms)
    const cancelSchedule =
      typeof options.cancelSchedule === 'function'
        ? options.cancelSchedule
        : (handle) => root.clearTimeout(handle)
    const mutationDebounceMs = Number.isFinite(options.mutationDebounceMs)
      ? options.mutationDebounceMs
      : DEFAULT_MUTATION_DEBOUNCE_MS
    const scheduleInterval =
      typeof options.scheduleInterval === 'function'
        ? options.scheduleInterval
        : (fn, ms) => root.setInterval(fn, ms)
    const cancelInterval =
      typeof options.cancelInterval === 'function'
        ? options.cancelInterval
        : (handle) => root.clearInterval(handle)
    const lifecyclePollMs = Number.isFinite(options.lifecyclePollMs)
      ? options.lifecyclePollMs
      : DEFAULT_LIFECYCLE_POLL_MS

    function getSurface() {
      const value = surfaceProvider()
      return isObject(value) ? value : null
    }

    function getConversationRoot() {
      return queryOne(documentRef, profile.selectors.conversationRoot)
    }

    function getChannel(surface) {
      if (!surface?.supported || !profile.selectors.channel || !profile.readChannel) {
        return UNKNOWN
      }

      const node = queryOne(getConversationRoot(), profile.selectors.channel)
      if (!node) return UNKNOWN
      return normalizeChannel(profile.readChannel(node, surface))
    }

    function getContact(surface) {
      if (!surface?.supported) return null
      if (!profile.selectors.contact || !profile.readContact) {
        return normalizeContact(null, surface)
      }

      const node = queryOne(getConversationRoot(), profile.selectors.contact)
      if (!node) return normalizeContact(null, surface)
      return normalizeContact(profile.readContact(node, surface), surface)
    }

    function getAssignment(surface) {
      if (!surface?.supported) return null
      if (!profile.selectors.assignment || !profile.readAssignment) {
        return unknownAssignment()
      }

      const node = queryOne(getConversationRoot(), profile.selectors.assignment)
      if (!node) return unknownAssignment()
      return normalizeAssignment(profile.readAssignment(node, surface))
    }

    function collectVisibleMessages(surface) {
      if (!surface?.supported) return []
      const conversationRoot = getConversationRoot()
      if (!conversationRoot) return []

      const nodes = queryAll(conversationRoot, profile.selectors.messages)

      // profile.readMessage pode devolver null/undefined para um nó que a
      // plataforma não considera uma mensagem elegível para captura (ex.:
      // divisor de data, ou autoria ainda sem evidência suficiente). Isso é
      // diferente de devolver um objeto malformado, que continua fail-closed
      // via normalizeMessage abaixo.
      const messages = nodes
        .map((node, index) => {
          const raw = profile.readMessage(node, index, surface)
          return raw === null || raw === undefined ? null : normalizeMessage(raw, index)
        })
        .filter((message) => message !== null)

      const seen = new Set()
      for (const message of messages) {
        if (seen.has(message.message_key)) {
          fail(
            'DUPLICATE_MESSAGE_KEY',
            `message_key duplicada no DOM visível: ${message.message_key}.`,
          )
        }
        seen.add(message.message_key)
      }

      return messages
    }

    function getComposer(surface) {
      if (!surface?.supported || !profile.selectors.composer) return null
      const node = queryOne(getConversationRoot(), profile.selectors.composer)
      if (!node) return null
      return profile.readComposer ? profile.readComposer(node, surface) ?? null : node
    }

    function getCapabilities(surface) {
      const conversationRoot = getConversationRoot()
      return Object.freeze({
        platform: PLATFORM,
        conversation_supported: surface?.supported === true,
        conversation_root_found: Boolean(conversationRoot),
        channel_reader_configured: Boolean(profile.selectors.channel && profile.readChannel),
        contact_reader_configured: Boolean(profile.selectors.contact && profile.readContact),
        assignment_reader_configured: Boolean(
          profile.selectors.assignment && profile.readAssignment,
        ),
        message_reader_configured: Boolean(
          profile.selectors.messages && profile.readMessage,
        ),
        composer_reader_configured: Boolean(profile.selectors.composer),
      })
    }

    // Duas responsabilidades deliberadamente separadas (nunca a mesma
    // observação faz as duas coisas):
    //
    // 1) LIFECYCLE (troca de conversa / remount do conversationRoot): um
    //    polling barato (só URL parsing + uma querySelector rasa), nunca um
    //    MutationObserver no documento inteiro.
    // 2) CONTEÚDO (novas mensagens na conversa aberta): um MutationObserver
    //    escopado SOMENTE ao nó conversationRoot atual — nunca ao documento
    //    inteiro. Mutações em qualquer outro lugar da SPA (sidebar, lista de
    //    contatos, badges, timers, loaders, e o próprio painel Yolen) nunca
    //    chegam a este observer, porque ele fisicamente não as vê.
    function observeChanges(callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('callback obrigatório.')
      }

      if (!documentRef?.documentElement) {
        return () => {}
      }

      let lastSurface = getSurface()
      let lastConversationKey =
        lastSurface?.supported === true ? lastSurface.conversation_key : null
      let stopped = false
      let mutationTimerHandle = null
      let contentObserver = null
      let observedRootNode = null

      function cancelPendingMutationNotification() {
        if (mutationTimerHandle !== null) {
          cancelSchedule(mutationTimerHandle)
          mutationTimerHandle = null
        }
      }

      function disconnectContentObserver() {
        if (contentObserver) {
          contentObserver.disconnect()
          contentObserver = null
        }
        observedRootNode = null
      }

      function notifyMutated(conversationKey, mutationCount) {
        // Coalesce rajadas de mutações reais (ex.: a renderização inicial de
        // uma conversa insere dezenas de nós de uma vez) em um único evento
        // — nunca notifica o painel/captura uma vez por mutação individual.
        cancelPendingMutationNotification()
        mutationTimerHandle = schedule(() => {
          mutationTimerHandle = null
          if (stopped) return

          callback(
            Object.freeze({
              type: 'conversation_mutated',
              platform: PLATFORM,
              conversation_key: conversationKey,
              mutation_count: mutationCount,
              surface: lastSurface,
            }),
          )
        }, mutationDebounceMs)
      }

      // (Re)anexa o observer de conteúdo ao nó conversationRoot ATUAL, só
      // se ele mudou de referência (nova conversa, ou o React desmontou e
      // remontou um novo nó para a mesma conversa) — nunca cria um segundo
      // observer nem reobserva o mesmo nó à toa.
      function attachContentObserverIfNeeded() {
        if (!MutationObserverClass) return

        const rootNode = getConversationRoot()
        if (!rootNode) {
          disconnectContentObserver()
          return
        }
        if (rootNode === observedRootNode) return

        disconnectContentObserver()
        observedRootNode = rootNode
        contentObserver = new MutationObserverClass((mutations) => {
          if (stopped || !lastConversationKey) return

          // Mutações inteiramente restritas à NOSSA própria UI nunca contam
          // como evidência de mudança na conversa (ver OWN_UI_MARKER_SELECTOR
          // acima) — defesa adicional; o painel nem deveria estar dentro
          // deste nó, mas a checagem custa pouco e nunca faz mal.
          if (!hasMutationOutsideOwnUi(mutations)) return

          notifyMutated(lastConversationKey, Array.isArray(mutations) ? mutations.length : 0)
        })
        contentObserver.observe(rootNode, {
          subtree: true,
          childList: true,
          characterData: true,
        })
      }

      function checkLifecycle() {
        if (stopped) return

        const currentSurface = getSurface()
        const currentConversationKey =
          currentSurface?.supported === true ? currentSurface.conversation_key : null

        if (currentConversationKey !== lastConversationKey) {
          // Troca de conversa é um evento discreto e importante: nunca é
          // coalescido/atrasado, e cancela qualquer notificação de mutação
          // pendente da conversa anterior (nunca vaza para a nova).
          cancelPendingMutationNotification()

          const previousConversationKey = lastConversationKey
          lastSurface = currentSurface
          lastConversationKey = currentConversationKey

          attachContentObserverIfNeeded()

          callback(
            Object.freeze({
              type: 'conversation_changed',
              platform: PLATFORM,
              previous_conversation_key: previousConversationKey,
              conversation_key: currentConversationKey,
              surface: currentSurface,
            }),
          )
          return
        }

        lastSurface = currentSurface

        // Mesma conversa: ainda assim reanexa se o React tiver remontado um
        // novo nó conversationRoot (ex.: navegação para outro menu e volta).
        attachContentObserverIfNeeded()
      }

      // Primeira verificação é imediata (não espera o primeiro tick do
      // polling) para já anexar o observer de conteúdo na conversa aberta
      // no momento em que observeChanges() é chamado.
      attachContentObserverIfNeeded()
      const lifecycleHandle = scheduleInterval(checkLifecycle, lifecyclePollMs)

      return () => {
        stopped = true
        cancelPendingMutationNotification()
        disconnectContentObserver()
        cancelInterval(lifecycleHandle)
      }
    }

    return Object.freeze({
      getChannel,
      getContact,
      getAssignment,
      collectVisibleMessages,
      getComposer,
      observeChanges,
      getCapabilities,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    UNKNOWN,
    DEFAULT_MUTATION_DEBOUNCE_MS,
    DEFAULT_LIFECYCLE_POLL_MS,
    createManyChatDomReader,
  })

  root.YolenManyChatDomReader = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
