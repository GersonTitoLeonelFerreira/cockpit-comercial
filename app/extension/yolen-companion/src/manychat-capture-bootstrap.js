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
  const contactLinkRuntimeApi = root.YolenManyChatContactLinkRuntime

  // Atribuído mais abaixo, depois de `runtime`/`sellerPanelRuntime`
  // existirem (o runtime de vínculo precisa de runtime.getSafeIdentity e
  // de um callback que usa runtime.refreshLeadResolution/captureNow e
  // sellerPanelRuntime.handleCaptureResult). `renderStatus` só é
  // efetivamente CHAMADO depois que tudo isso já foi montado (ver
  // runtime.start()/syncPanel(null) no fim do arquivo), então a
  // referência abaixo sempre encontra o valor certo por closure.
  let contactLinkRuntime = null

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

  function renderStatus(resolution, conversationKey) {
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

    // CONTACT_NOT_LINKED tem um fluxo próprio (buscar -> selecionar ->
    // confirmar -> vincular): a partir daqui quem é dono do conteúdo do
    // painel é o contactLinkRuntime, nunca o texto de status genérico.
    // Nunca mostra AGORA/ANÁLISE/sugestão enquanto não houver lead/ciclo
    // real (STEP 2A.3, seção 6).
    if (resolution.reason === 'CONTACT_NOT_LINKED' && contactLinkRuntime && conversationKey) {
      contactLinkRuntime.renderContactLinkPanel(conversationKey)
      return
    }

    const label = STATUS_LABELS[resolution.reason] ?? `Yolen · ${resolution.reason ?? 'status desconhecido'}`
    panelMountApi.setPanelContent(`<div class="yolen-status">${label}</div>`)
  }

  let currentConversationKey = null

  // Assinatura do último status de RESOLUÇÃO já renderizado por conversa
  // (nunca do conteúdo seller-facing — isso é responsabilidade exclusiva do
  // sellerPanelRuntime, que só re-renderiza quando tem dado novo de
  // verdade). Evita reescrever o mesmo texto de status repetidamente só
  // porque um evento chegou, sem que a resolução em si tenha mudado.
  const lastRenderedResolutionByConversationKey = new Map()

  function resolutionSignature(resolution) {
    if (!resolution) return 'unknown'
    return `${resolution.ready}:${resolution.reason}:${resolution.cycle_id}`
  }

  // Sincroniza SOMENTE a visibilidade do painel e o texto de status de
  // resolução — nunca o conteúdo seller-facing (AGORA/ANÁLISE/CLIENTE),
  // que é responsabilidade exclusiva do sellerPanelRuntime e só é
  // re-renderizado quando ele mesmo busca dado novo (refreshViewModels).
  // Chamado apenas em eventos discretos e pouco frequentes (troca de
  // conversa, resultado de uma captura já debatida/filtrada) — nunca a
  // cada mutação bruta do DOM.
  function syncPanel(conversationKey) {
    if (!panelMountApi) return

    panelMountApi.syncPanelVisibility()

    if (!panelMountApi.isConversationOpen(root.document)) return

    currentConversationKey = conversationKey ?? currentConversationKey
    if (!currentConversationKey) {
      renderStatus(null, null)
      return
    }

    const state = runtime.getConversationState(currentConversationKey)
    const resolution = state?.resolution ?? null
    const signature = resolutionSignature(resolution)

    if (lastRenderedResolutionByConversationKey.get(currentConversationKey) === signature) {
      return
    }
    lastRenderedResolutionByConversationKey.set(currentConversationKey, signature)

    renderStatus(resolution, currentConversationKey)
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
      // 'conversation_mutated' NUNCA re-renderiza o painel por si só — é só
      // o sinal que faz o capture-runtime agendar captureNow() (já com seu
      // próprio debounce/fingerprint). O painel só reage ao RESULTADO de
      // uma captura de verdade (capture_result), nunca à mutação bruta.
      if (event?.type === 'reader_event' && event.event?.type === 'conversation_changed') {
        syncPanel(event.event.conversation_key ?? null)
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

  // Chamado pelo contactLinkRuntime depois de um first-link que respondeu
  // LINKED/IDEMPOTENT/ALREADY_LINKED_CONFLICT: nunca inventa cycle a
  // partir do lead selecionado na UI — só RESOLVE_LEAD (via
  // runtime.refreshLeadResolution) pode dizer o estado real. Se a
  // resolução ficou capture-eligible, roda UMA captura pelo pipeline já
  // existente (nunca uma segunda rotina de ingestão) e deixa o evento
  // capture_result normal decidir sobre análise — nunca chama
  // ANALYZE_CONVERSATION diretamente daqui (STEP 2A.3, seções 19-21).
  async function handleLinked(conversationKey) {
    const resolution = await runtime.refreshLeadResolution(conversationKey)
    syncPanel(conversationKey)

    if (!resolution.ready) return

    try {
      const result = await runtime.captureNow()
      syncPanel(result?.conversation_key ?? conversationKey)
      if (sellerPanelRuntime) {
        sellerPanelRuntime.handleCaptureResult(result)
      }
    } catch {
      // Melhor esforço: uma falha na captura pós-vínculo nunca deve travar
      // a UI — o próximo ciclo normal de captura (debounce do observer)
      // tenta de novo sozinho.
    }
  }

  contactLinkRuntime = contactLinkRuntimeApi
    ? contactLinkRuntimeApi.createManyChatContactLinkRuntime({
        sendMessage,
        panelMountApi,
        getSafeIdentity: runtime.getSafeIdentity,
        getCurrentConversationKey: () => currentConversationKey,
        onLinked: handleLinked,
      })
    : null

  // Delegação de clique única no documento: aplicar a sugestão no composer
  // e cada passo do fluxo de vínculo (buscar/selecionar/confirmar/
  // cancelar/tentar de novo) são sempre ações explícitas do vendedor
  // (nunca automáticas, nunca em resposta a um evento de captura ou de
  // análise).
  if ((sellerPanelRuntime || contactLinkRuntime) && typeof root.document?.addEventListener === 'function') {
    root.document.addEventListener('click', (domEvent) => {
      const target = domEvent.target
      if (typeof target?.closest !== 'function' || !currentConversationKey) return

      if (sellerPanelRuntime && target.closest('[data-yolen-apply-suggestion]')) {
        sellerPanelRuntime.applySuggestedMessage(currentConversationKey)
        return
      }

      if (!contactLinkRuntime) return

      if (target.closest('[data-yolen-link-lead-start]') || target.closest('[data-yolen-link-lead-retry]')) {
        contactLinkRuntime.startLinkFlow(currentConversationKey)
        return
      }

      if (target.closest('[data-yolen-link-lead-search]')) {
        const panelElement = panelMountApi?.ensurePanelMounted?.({ document: root.document })?.element
        const input = panelElement?.querySelector?.('[data-yolen-link-lead-query]')
        contactLinkRuntime.runSearch(currentConversationKey, input?.value ?? '')
        return
      }

      const selectTrigger = target.closest('[data-yolen-link-lead-select]')
      if (selectTrigger) {
        contactLinkRuntime.selectLead(currentConversationKey, selectTrigger.dataset.yolenLinkLeadSelect ?? null)
        return
      }

      if (target.closest('[data-yolen-link-lead-confirm]')) {
        contactLinkRuntime.confirmLink(currentConversationKey)
        return
      }

      if (target.closest('[data-yolen-link-lead-cancel]')) {
        contactLinkRuntime.cancelSelection(currentConversationKey)
      }
    })
  }

  runtime.start()
  syncPanel(null)

  root.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__ = runtime
})(typeof globalThis !== 'undefined' ? globalThis : this)
