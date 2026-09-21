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

  // STEP 2B.5-B: o glue de teclado das abas seller-facing (ver o listener
  // de 'keydown' mais abaixo) precisa da MESMA função pura de navegação
  // que o WhatsApp usa — nunca uma segunda lista/indexação local.
  const workspaceRuntimeApi = root.YolenCompanionWorkspaceRuntime ?? null

  // Hardening (STEP 2B.5, "MANUAL LEAD PICKER REMOVAL"): o vendedor nunca é
  // reconciliador de identidade — o fluxo CONTACT_NOT_LINKED -> buscar ->
  // selecionar -> confirmar (antigo manychat-contact-link-runtime.js) foi
  // removido do caminho ativo. A resolução de lead continua inteiramente
  // automática (via platform_contact_key/RESOLVE_LEAD, sem qualquer busca
  // manual): quando o backend não consegue resolver com segurança, o
  // Companion só informa o estado real (abaixo), nunca pede ao vendedor
  // para escolher entre candidatos.

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
    NO_COMPANION_SESSION: 'Yolen · sessão não capturada. Clique em Conectar Yolen.',
    INVALID_COMPANION_TOKEN: 'Yolen · sessão expirada. Reconecte a extensão.',
    NETWORK_ERROR: 'Yolen · falha de rede ao consultar a Yolen. Tentando de novo…',
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
      if (
        sellerPanelRuntime &&
        typeof sellerPanelRuntime.renderPanel === 'function' &&
        conversationKey
      ) {
        sellerPanelRuntime.renderPanel(conversationKey)
      } else {
        panelMountApi.setPanelContent(
          '<div class="yolen-status">Yolen · lead identificado</div>',
        )
      }
      return
    }

    const label = STATUS_LABELS[resolution.reason] ?? `Yolen · ${resolution.reason ?? 'status desconhecido'}`
    panelMountApi.setPanelContent(`<div class="yolen-status">${label}</div>`)
  }

  // Fonte AUTORITATIVA única de "qual conversa está aberta agora": sempre
  // derivada ao vivo de runtime.getCurrentConversationKey() (adapter/URL
  // atual), nunca uma variável cacheada que uma resposta assíncrona
  // desatualizada (capture_result, onLinked, search, first-link) poderia
  // reescrever (STEP 2A.3, hardening final, item 7/8). `runtime` só é
  // atribuído mais abaixo, mas esta função só é CHAMADA depois disso.
  function getCurrentConversationKey() {
    return typeof runtime.getCurrentConversationKey === 'function' ? runtime.getCurrentConversationKey() : null
  }

  // Bookkeeping SEPARADO: guarda qual era a conversa aberta na última vez
  // que um evento AUTORITATIVO de navegação real (conversation_changed do
  // reader) foi observado — usado exclusivamente para saber QUAL conversa
  // invalidar (runtime.invalidateLeadResolution) quando a conversa muda de
  // verdade. Nunca lido como "a conversa atual" para autorizar nada; isso é
  // sempre getCurrentConversationKey().
  let lastKnownConversationKey = null

  // Assinatura do último status de RESOLUÇÃO já renderizado por conversa
  // (nunca do conteúdo seller-facing — isso é responsabilidade exclusiva do
  // sellerPanelRuntime, que só re-renderiza quando tem dado novo de
  // verdade). Evita reescrever o mesmo texto de status repetidamente só
  // porque um evento chegou, sem que a resolução em si tenha mudado — mas
  // NUNCA sozinha decide se pinta: ver lastPaintedConversationKey abaixo.
  const lastRenderedResolutionByConversationKey = new Map()

  function resolutionSignature(resolution) {
    if (!resolution) return 'unknown'
    return `${resolution.ready}:${resolution.reason}:${resolution.cycle_id}`
  }

  // Hardening (auditoria STEP 2A.3, "VISIBLE PANEL CROSS-CONVERSATION
  // ISOLATION"): o DOM do painel é compartilhado entre conversas. Se A
  // pinta uma assinatura, o vendedor troca para B (que pinta outra coisa
  // por cima do MESMO elemento) e depois volta para A cuja assinatura
  // permanece igual à última registrada, o dedup por assinatura sozinho
  // pulava o render e deixava o conteúdo de B visível sobre A. Sempre que a
  // conversa autoritativa mudou desde a última pintura, força o repaint
  // independente da assinatura — o dedup por assinatura só se aplica
  // DENTRO da mesma conversa que já está pintada agora.
  let lastPaintedConversationKey = null

  // Sincroniza SOMENTE a visibilidade do painel e o texto de status de
  // resolução — nunca o conteúdo seller-facing (AGORA/ANÁLISE/CLIENTE),
  // que é responsabilidade exclusiva do sellerPanelRuntime e só é
  // re-renderizado quando ele mesmo busca dado novo (refreshViewModels).
  // Chamado apenas em eventos discretos e pouco frequentes (troca de
  // conversa, resultado de uma captura já debatida/filtrada) — nunca a
  // cada mutação bruta do DOM. NUNCA recebe conversation_key por
  // parâmetro: sempre relê a conversa realmente aberta agora, então uma
  // chamada originada por um evento desatualizado nunca redesenha a
  // conversa errada.
  function syncPanel() {
    if (!panelMountApi) return

    panelMountApi.syncPanelVisibility()

    if (!panelMountApi.isConversationOpen(root.document)) return

    const authoritativeKey = getCurrentConversationKey()
    if (!authoritativeKey) {
      lastPaintedConversationKey = null
      renderStatus(null, null)
      return
    }

    const state = runtime.getConversationState(authoritativeKey)
    const resolution = state?.resolution ?? null
    const signature = resolutionSignature(resolution)

    const conversationChanged = lastPaintedConversationKey !== authoritativeKey

    if (!conversationChanged && lastRenderedResolutionByConversationKey.get(authoritativeKey) === signature) {
      return
    }
    lastRenderedResolutionByConversationKey.set(authoritativeKey, signature)
    lastPaintedConversationKey = authoritativeKey

    renderStatus(resolution, authoritativeKey)
  }

  // Único ponto que pode mudar o que consideramos "a última conversa
  // conhecida": o evento conversation_changed do reader é autoritativo (é
  // ele quem detecta navegação real). Invalida a resolução em cache da
  // conversa que está sendo deixada para trás ANTES de deixar a nova
  // assumir o painel (STEP 2A.3, hardening final, item 1/2).
  function handleAuthoritativeConversationChange(
    newConversationKey,
    previousConversationKeyFromEvent = null,
  ) {
    const previousConversationKey =
      previousConversationKeyFromEvent ?? lastKnownConversationKey

    if (
      previousConversationKey &&
      previousConversationKey !== newConversationKey
    ) {
      const previousResolution =
        runtime.getConversationState(previousConversationKey)?.resolution ?? null

      // Hardening (auditoria STEP 2A.3, "AMBIGUOUS FIRST-LINK RETURN TO A"):
      // um first-link cuja resposta HTTP se perdeu (sem LINKED/IDEMPOTENT
      // para disparar onLinked) nunca pode deixar CONTACT_NOT_LINKED
      // congelado em cache — ao abandonar essa conversa, força um
      // RESOLVE_LEAD novo da próxima vez que o vendedor voltar, em vez de
      // reutilizar um "ainda não vinculado" que já pode estar errado.
      // Deliberadamente restrito a CONTACT_NOT_LINKED: nunca invalida uma
      // resolução ready=true só por causa de uma troca de conversa comum.
      if (
        previousResolution?.reason === 'CONTACT_NOT_LINKED' &&
        typeof runtime.invalidateLeadResolution === 'function'
      ) {
        runtime.invalidateLeadResolution(previousConversationKey)
      }
    }

    // STEP 2B.5-B: toda troca real de conversa volta a área seller-facing
    // ativa para a primeira área canônica ('now'/AGORA) — mesma semântica
    // do WhatsApp (hardResetConversationWorkspace() força
    // activeSellerArea = 'now' a cada boundary real). Nunca deixa a área
    // que o vendedor tinha aberto em A (ex.: CLIENTE) vazar como estado
    // inicial de B.
    if (
      newConversationKey &&
      newConversationKey !== previousConversationKey &&
      sellerPanelRuntime &&
      typeof sellerPanelRuntime.resetActiveArea === 'function'
    ) {
      sellerPanelRuntime.resetActiveArea(newConversationKey)
    }

    lastKnownConversationKey = newConversationKey
    syncPanel()
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
        handleAuthoritativeConversationChange(
          event.event.conversation_key ?? null,
          event.event.previous_conversation_key ?? null,
        )
      } else if (event?.type === 'capture_result') {
        // Um capture_result pode chegar depois que o vendedor já trocou de
        // conversa (captureNow é assíncrono). syncPanel() nunca recebe a
        // conversation_key do resultado — sempre relê a autoritativa. O
        // render seller-facing (AGORA/ANÁLISE/CLIENTE) só é disparado se
        // este resultado ainda pertencer à conversa realmente aberta agora
        // (STEP 2A.3, hardening final, item 9/10) — nunca repinta A sobre
        // B; o estado interno de A já foi atualizado isoladamente pelo
        // próprio capture-runtime, independente disso.
        syncPanel()
        const resultConversationKey = event.result?.conversation_key ?? null
        if (sellerPanelRuntime && resultConversationKey && resultConversationKey === getCurrentConversationKey()) {
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
        getCurrentConversationKey,
        getCycleId(conversationKey) {
          return runtime.getConversationState(conversationKey)?.resolution?.cycle_id ?? null
        },
      })
    : null

  // Delegação de clique única no documento: aplicar a sugestão no composer
  // e trocar de aba seller-facing são sempre ações explícitas do vendedor
  // (nunca automáticas, nunca em resposta a um evento de captura ou de
  // análise). Não existe mais nenhum fluxo de vínculo manual de lead nesta
  // camada (ver hardening acima). A troca de aba em si (validação/estado)
  // é sempre delegada a sellerPanelRuntime.setActiveArea — nunca decidida
  // aqui.
  if (sellerPanelRuntime && typeof root.document?.addEventListener === 'function') {
    root.document.addEventListener('click', (domEvent) => {
      const target = domEvent.target
      if (typeof target?.closest !== 'function') return

      // Sempre a conversa realmente aberta NO MOMENTO DO CLIQUE — nunca uma
      // variável que um callback assíncrono anterior poderia ter deixado
      // desatualizada.
      const conversationKey = getCurrentConversationKey()
      if (!conversationKey) return

      if (target.closest('[data-yolen-apply-suggestion]')) {
        sellerPanelRuntime.applySuggestedMessage(conversationKey)
        return
      }

      const tabButton = target.closest('[data-yolen-seller-area]')
      if (tabButton) {
        sellerPanelRuntime.setActiveArea(
          conversationKey,
          tabButton.getAttribute('data-yolen-seller-area'),
        )
      }
    })

    // STEP 2B.5-B: navegação por teclado das abas — a computação de "qual
    // é a próxima área para esta tecla" é SEMPRE a mesma função pura do
    // módulo compartilhado (workspaceRuntimeApi.getNextSellerAreaForKeydown),
    // nunca uma segunda lista/indexação local. Delegação no documento pelo
    // mesmo motivo do clique: o conteúdo do painel é substituído por
    // inteiro a cada render, então um listener por botão se perderia.
    if (workspaceRuntimeApi && typeof root.document?.addEventListener === 'function') {
      root.document.addEventListener('keydown', (domEvent) => {
        const target = domEvent.target
        if (typeof target?.closest !== 'function') return

        const tabButton = target.closest('[data-yolen-seller-area]')
        if (!tabButton) return

        const conversationKey = getCurrentConversationKey()
        if (!conversationKey) return

        const currentArea = tabButton.getAttribute('data-yolen-seller-area')
        const nextArea = workspaceRuntimeApi.getNextSellerAreaForKeydown(
          currentArea,
          domEvent.key,
        )

        if (nextArea === null) return

        domEvent.preventDefault()
        sellerPanelRuntime.setActiveArea(conversationKey, nextArea)

        // Paridade com o WhatsApp (setActiveSellerArea(nextArea, {focus:
        // true})): o painel inteiro é re-renderizado por setActiveArea
        // acima, então o botão antigo já foi destruído — o foco só pode
        // ser aplicado ao NOVO botão depois que o DOM novo existir.
        root.setTimeout(() => {
          const nextTab =
            root.document?.getElementById?.(
              `yolen-seller-tab-${nextArea}`,
            )

          if (!nextTab) {
            return
          }

          try {
            nextTab.focus({
              preventScroll: true,
            })
          } catch {
            nextTab.focus()
          }
        }, 0)
      })
    }
  }

  runtime.start()
  lastKnownConversationKey = getCurrentConversationKey()
  syncPanel()

  root.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__ = runtime
})(typeof globalThis !== 'undefined' ? globalThis : this)
