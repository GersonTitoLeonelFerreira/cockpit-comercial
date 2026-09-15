;(function initYolenManyChatCaptureBootstrap(root) {
  'use strict'

  // Ponto de entrada real do runtime de captura ManyChat: só faz alguma
  // coisa se o kill switch (manychat-feature-flags.js) estiver ligado.
  // Enquanto MANYCHAT_CAPTURE_ENABLED for false, este arquivo carrega e
  // não faz nada — nenhuma leitura de DOM além da checagem da flag,
  // nenhuma mensagem para o background, nenhum tráfego de rede.
  const flags = root.YolenManyChatFeatureFlags
  if (!flags || flags.MANYCHAT_CAPTURE_ENABLED !== true) {
    return
  }

  const runtimeApi = root.YolenManyChatCaptureRuntime
  if (!runtimeApi || typeof runtimeApi.createManyChatCaptureRuntime !== 'function') {
    return
  }

  const panelMountApi = root.YolenManyChatPanelMount
  const sellerPanelRuntimeApi = root.YolenManyChatSellerPanelRuntime
  const composerApi = root.YolenManyChatComposer

  // Textos honestos: nunca reivindicam mais do que o Companion sabe de
  // verdade nesta versão. O painel completo (AGORA/ANÁLISE/CLIENTE) ainda
  // não está ligado — isto é só o status de identificação do contato, que
  // já reflete a MESMA resolução usada para decidir se a captura acontece.
  const STATUS_LABELS = Object.freeze({
    identity_not_ready: 'Yolen · aguardando identidade do ManyChat…',
    CONTACT_NOT_LINKED: 'Yolen · contato ainda não vinculado a um lead',
    NOT_FOUND: 'Yolen · lead não encontrado nesta empresa',
    OWNED_BY_OTHER: 'Yolen · lead pertence a outro vendedor',
    IN_POOL: 'Yolen · lead está no Pool',
    CLOSED_CYCLE: 'Yolen · lead com apenas ciclo fechado',
    LEAD_WITHOUT_CYCLE: 'Yolen · lead sem ciclo comercial ativo',
    SOFT_DELETED: 'Yolen · lead arquivado ou excluído',
    MULTIPLE_MATCHES: 'Yolen · mais de um lead encontrado',
  })

  function renderStatus(resolution) {
    if (!panelMountApi) return

    if (!resolution) {
      panelMountApi.setPanelContent('<div class="yolen-status">Yolen · carregando…</div>')
      return
    }

    // Lead identificado: a partir daqui quem é dono do conteúdo do painel
    // é o sellerPanelRuntime (AGORA/ANÁLISE/CLIENTE + sugestão), nunca este
    // texto de status — se o runtime não estiver disponível, ainda assim
    // não fingimos ter mais informação do que a resolução de lead.
    if (resolution.ready === true) {
      if (!sellerPanelRuntimeApi) {
        panelMountApi.setPanelContent('<div class="yolen-status">Yolen · lead identificado</div>')
      }
      return
    }

    const label = STATUS_LABELS[resolution.reason] ?? `Yolen · ${resolution.reason ?? 'status desconhecido'}`
    panelMountApi.setPanelContent(`<div class="yolen-status">${label}</div>`)
  }

  let currentConversationKey = null

  function syncPanel(conversationKey) {
    if (!panelMountApi) return

    panelMountApi.syncPanelVisibility()

    if (!panelMountApi.isConversationOpen(root.document)) return

    currentConversationKey = conversationKey ?? currentConversationKey

    const state = conversationKey ? runtime.getConversationState(conversationKey) : null
    renderStatus(state?.resolution ?? null)

    if (state?.resolution?.ready === true && sellerPanelRuntime) {
      sellerPanelRuntime.renderPanel(conversationKey)
    }
  }

  // Únicos seletores validados ao vivo (A → B → A, com evidência de
  // autoria/identidade/conteúdo/áudio real) até esta versão. channel e
  // assignment ficam de fora deliberadamente: nenhuma evidência de DOM ou
  // de estado interno foi encontrada para nenhum dos dois, e
  // manychat-adapter.js não os exige mais (são metadados informativos,
  // nunca usados por autorização ou pela ingestão de captura).
  const SELECTORS = Object.freeze({
    conversationRoot: 'div[data-test-id="chat-messages-list"]',
    messages: ':scope > div > div[data-title-at][data-title-offset-bottom][data-title]',
  })

  function extensionApi() {
    return root.browser ?? root.chrome
  }

  function sendMessage(message) {
    const api = extensionApi()
    if (!api?.runtime || typeof api.runtime.sendMessage !== 'function') {
      return Promise.reject(new Error('runtime.sendMessage indisponível.'))
    }

    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime.sendMessage(message)
    }

    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage(message, (response) => {
          const runtimeError = api.runtime.lastError
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Falha no runtime da extensão.'))
            return
          }
          resolve(response)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  const runtime = runtimeApi.createManyChatCaptureRuntime({
    selectors: SELECTORS,
    sendMessage,
    onEvent(event) {
      if (event?.type === 'reader_event') {
        syncPanel(event.event?.conversation_key ?? null)
      } else if (event?.type === 'capture_result') {
        const conversationKey = event.result?.conversation_key ?? null
        syncPanel(conversationKey)
        if (sellerPanelRuntime) {
          sellerPanelRuntime.handleCaptureResult(event.result)
        }
      }
    },
  })

  // Reaproveita, sem reescrever, os mesmos view models/actions já
  // validados no WhatsApp (LOAD_CLIENT_CONTEXT/LOAD_DECISION_STATE/
  // LOAD_ANALYSIS_VIEW_MODEL/LOAD_CUSTOMER_VIEW_MODEL/LOAD_METHOD_GUIDANCE
  // + ANALYZE_CONVERSATION). getCycleId nunca inventa um cycle: só devolve
  // o que a resolução real da captura (backend, via resolve-lead) já
  // aprovou para esta conversa.
  const sellerPanelRuntime = sellerPanelRuntimeApi
    ? sellerPanelRuntimeApi.createManyChatSellerPanelRuntime({
        sendMessage,
        panelMountApi,
        composerApi,
        getCycleId(conversationKey) {
          return runtime.getConversationState(conversationKey)?.resolution?.cycle_id ?? null
        },
      })
    : null

  // Delegação de clique única no documento: aplicar a sugestão no composer
  // é sempre uma ação explícita do vendedor (nunca automática, nunca em
  // resposta a um evento de captura ou de análise).
  if (sellerPanelRuntime && typeof root.document?.addEventListener === 'function') {
    root.document.addEventListener('click', (domEvent) => {
      const target = domEvent.target
      const trigger =
        typeof target?.closest === 'function' ? target.closest('[data-yolen-apply-suggestion]') : null
      if (!trigger || !currentConversationKey) return

      sellerPanelRuntime.applySuggestedMessage(currentConversationKey)
    })
  }

  runtime.start()
  syncPanel(null)

  root.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__ = runtime
})(typeof globalThis !== 'undefined' ? globalThis : this)
