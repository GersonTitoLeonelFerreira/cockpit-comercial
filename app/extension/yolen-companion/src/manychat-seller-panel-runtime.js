;(function initYolenManyChatSellerPanelRuntime(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SOURCE = 'YOLEN_COMPANION'
  const ANALYSIS_POLL_DELAYS_MS = Object.freeze([1500, 2000, 3000, 4000, 5000])
  const ANALYSIS_POLL_TIMEOUT_MS = 240000

  // Orquestra o painel do vendedor no ManyChat reaproveitando, sem
  // reescrever, os mesmos actions de background e os mesmos módulos de
  // view (puros, sem DOM) já usados pelo WhatsApp:
  // LOAD_CLIENT_CONTEXT/LOAD_DECISION_STATE/LOAD_ANALYSIS_VIEW_MODEL/
  // LOAD_CUSTOMER_VIEW_MODEL/LOAD_METHOD_GUIDANCE (todos {cycle_id,
  // conversation_key}) e ANALYZE_CONVERSATION/GET_ANALYSIS_JOB_STATUS.
  // Nunca cria um segundo motor de reasoning nem uma segunda lógica de
  // permissão — tudo já vem resolvido/autorizado pelo backend.
  //
  // STEP 2B.5-B: o shell seller-facing (abas AGORA/MENSAGEM/ANÁLISE/
  // CLIENTE, sua ordem, labels, ARIA e navegação por teclado) não é mais
  // desenhado aqui — vem do MESMO módulo compartilhado que o WhatsApp já
  // consome (companion-workspace-runtime.js). Este arquivo continua dono
  // apenas dos dados/ações: carregar view models, poll de análise, estado
  // por conversation_key e aplicação da sugestão no composer.
  function createManyChatSellerPanelRuntime(options = {}) {
    const sendMessage = options.sendMessage
    if (typeof sendMessage !== 'function') {
      throw new Error('options.sendMessage é obrigatório.')
    }

    const workspaceRuntimeApi = options.workspaceRuntime ?? root.YolenCompanionWorkspaceRuntime ?? null
    if (!workspaceRuntimeApi) {
      throw new Error('Módulo do workspace compartilhado do Companion não carregado.')
    }

    // STEP 2B.5-D — "UNIFICAÇÃO REAL DO SELLER WORKSPACE": a composição
    // de cada área (AGORA/MENSAGEM/ANÁLISE/CLIENTE — qual estado mostrar,
    // qual fallback quando ainda não há dado) é a MESMA que o WhatsApp
    // usa, nunca uma segunda regra local por plataforma — ver
    // companion-seller-workspace-view.js. Dependência obrigatória (igual
    // a workspaceRuntimeApi acima): sem ela, este runtime falha fechado
    // em vez de inventar uma composição própria.
    const sellerWorkspaceViewApi = options.sellerWorkspaceView ?? root.YolenCompanionSellerWorkspaceView ?? null
    if (!sellerWorkspaceViewApi) {
      throw new Error('Módulo compartilhado do seller workspace do Companion não carregado.')
    }

    // STEP 2B.5-D1 — "FECHAR PARIDADE REAL DO COMPANION" (Blocker A):
    // controlador compartilhado de LOAD_LEAD_SUMMARY/SAVE_LEAD_SUMMARY —
    // mesma normalização de status que o WhatsApp já usa (via
    // window.YolenCompanionApi), sem backend novo. Falha fechado (nunca
    // inventa um resumo local) se não estiver carregado.
    const leadSummaryControllerApi =
      options.leadSummaryController ?? root.YolenCompanionLeadSummaryController ?? null
    if (!leadSummaryControllerApi) {
      throw new Error('Módulo compartilhado do controlador de resumo de lead não carregado.')
    }

    // STEP 2B.5-D1 (Blocker B): engine compartilhado da aba MENSAGEM
    // (estado/geração/render do composer seller-facing) — o MESMO que o
    // WhatsApp usa (seller-message-runtime.js), nunca uma segunda
    // implementação local. Só o composer adapter (abaixo) é
    // ManyChat-specific.
    const sellerMessageEngineApi = options.sellerMessageEngine ?? root.YolenCompanionSellerMessageEngine ?? null
    if (!sellerMessageEngineApi) {
      throw new Error('Módulo compartilhado do seller message engine não carregado.')
    }

    // STEP 2B.5-D1 (Blocker D): controlador compartilhado de
    // PREVIEW_CONVERSATION_REGISTRATION/CONFIRM_CONVERSATION_REGISTRATION —
    // mesma normalização de status/stale-code que o WhatsApp já usa (via
    // window.YolenCompanionApi), sem backend novo.
    const conversationRegistrationControllerApi =
      options.conversationRegistrationController ?? root.YolenCompanionConversationRegistrationController ?? null
    if (!conversationRegistrationControllerApi) {
      throw new Error('Módulo compartilhado do controlador de registro de conversa não carregado.')
    }

    // STEP 2B.5-D1 (Blocker D): controlador compartilhado de candidatos
    // de cadastro (extração via lead-enrichment.js + contexto/aplicação
    // via LOAD_LEAD_ENRICHMENT_CONTEXT/APPLY_LEAD_ENRICHMENT) — MESMA
    // regra de comparação/confirmabilidade que o WhatsApp já usa, sem
    // backend duplicado.
    const leadEnrichmentControllerApi =
      options.leadEnrichmentController ?? root.YolenCompanionLeadEnrichmentController ?? null
    if (!leadEnrichmentControllerApi) {
      throw new Error('Módulo compartilhado do controlador de cadastro do lead não carregado.')
    }

    // Ledger de mensagens já observadas desta conversa (ver
    // manychat-capture-runtime.js#getEnrichmentLedgerMessages) — a ÚNICA
    // fonte de texto para extração de candidatos de cadastro. Ausência
    // (dependência não passada) fail-closed: nenhum candidato é extraído,
    // nunca uma leitura de DOM alternativa aqui.
    const getEnrichmentLedgerMessages =
      typeof options.getEnrichmentLedgerMessages === 'function' ? options.getEnrichmentLedgerMessages : () => []

    const panelMountApi = options.panelMountApi ?? root.YolenManyChatPanelMount ?? null
    const composerApi = options.composerApi ?? root.YolenManyChatComposer ?? null
    const schedule =
      typeof options.schedule === 'function' ? options.schedule : (fn, ms) => root.setTimeout(fn, ms)
    const cancelSchedule =
      typeof options.cancelSchedule === 'function'
        ? options.cancelSchedule
        : (handle) => root.clearTimeout(handle)
    const now = typeof options.now === 'function' ? options.now : () => Date.now()

    // Fonte autoritativa de qual conversa está realmente aberta AGORA.
    // Em produção vem diretamente do bootstrap/capture-runtime. Se não
    // estiver disponível, render seller-facing falha fechado: estado
    // interno pode continuar sendo atualizado, mas nenhum DOM é pintado.
    const getCurrentConversationKey =
      typeof options.getCurrentConversationKey === 'function'
        ? options.getCurrentConversationKey
        : () => null

    const stateByConversationKey = new Map()

    function getState(conversationKey) {
      if (!stateByConversationKey.has(conversationKey)) {
        stateByConversationKey.set(conversationKey, {
          clientContext: { status: 'idle', data: null, error: null },
          decisionState: null,
          analysisViewModel: null,
          customerViewModel: null,
          // STEP 2B.5-D1 (Blocker A): resumo do lead isolado por
          // conversation_key — mesmo shape que companion-lead-summary-
          // view.js#renderLeadSummarySection espera
          // (status/data/saveStatus/saveError/draftValue). data.method_guidance
          // é preenchido por loadLeadSummary() (ver abaixo) com o MESMO
          // formato que o WhatsApp já injeta via lead-method-guidance-
          // runtime.js — nunca uma segunda leitura separada de "próximo
          // passo".
          leadSummary: { status: 'idle' },
          leadSummarySaveStatus: null,
          leadSummarySaveError: null,
          leadSummaryDraftValue: null,
          leadSummaryLoadPromise: null,
          viewModelsLoadPromise: null,
          analyzing: false,
          // STEP 2B.5-D1 (Blocker C): estado terminal de erro de uma
          // tentativa de análise real (failed/superseded/timeout/falha ao
          // disparar) — nunca colapsa silenciosamente em "vazio
          // progressivo". Limpo a cada nova tentativa (requestAnalysis) e
          // a cada sucesso.
          analysisError: null,
          pollTimerId: null,
          // STEP 2B.5-D1 (Blocker D): registro de conversa (histórico do
          // lead) isolado por conversation_key — MESMO shape que
          // companion-seller-workspace-view.js#renderConversationRegistrationCardHtml
          // espera (status idle/previewing/preview_ready/saving/success/
          // stale/error + summary_text/error_message/confirmation_token/
          // occurred_at/already_registered).
          conversationRegistration: { status: 'idle' },
          // STEP 2B.5-D1 (Blocker D): candidatos de cadastro (Cadastro)
          // isolados por conversation_key — MESMO shape que
          // companion-seller-workspace-view.js#renderLeadEnrichmentCandidatesHtml
          // espera (status idle/ready/error + candidates/applyLoadingKey/
          // applySuccessKey/applyError/loadError). ignoredKeys nunca
          // precisa de reset explícito na troca de conversa: cada chave
          // já embute o lead_id (buildCandidateKey), então não pode
          // colidir entre conversas diferentes mesmo compartilhando o
          // mesmo Set por engano — aqui nem compartilha, já é por chave
          // do Map.
          leadEnrichment: {
            status: 'idle',
            leadId: null,
            candidates: [],
            applyLoadingKey: null,
            applySuccessKey: null,
            applyError: null,
            loadError: null,
            ignoredKeys: new Set(),
          },
          // Área seller-facing ativa desta conversa — sempre começa na
          // primeira área canônica ('now'/AGORA), a mesma semântica do
          // WhatsApp (hardResetConversationWorkspace() também força
          // activeSellerArea = 'now' a cada troca real de conversa).
          activeArea: workspaceRuntimeApi.SELLER_AREAS[0],
        })
      }
      return stateByConversationKey.get(conversationKey)
    }

    function getActiveArea(conversationKey) {
      return getState(conversationKey).activeArea
    }

    // Ação explícita do vendedor (clique numa aba ou navegação por
    // teclado, decidida por quem chama via
    // workspaceRuntimeApi.getNextSellerAreaForKeydown): nunca uma segunda
    // lista/validação própria — sempre a mesma allowlist do módulo
    // compartilhado.
    function setActiveArea(conversationKey, nextArea) {
      if (!workspaceRuntimeApi.isValidSellerArea(nextArea)) return

      const state = getState(conversationKey)
      state.activeArea = nextArea
      renderPanel(conversationKey)
    }

    // Chamado pelo bootstrap numa troca real de conversa (evento
    // conversation_changed autoritativo) — nunca deixa a área ativa de A
    // vazar como "última área vista" para B: toda troca real volta para a
    // primeira área canônica, mesmo que B já tivesse sido visitada antes.
    function resetActiveArea(conversationKey) {
      getState(conversationKey).activeArea = workspaceRuntimeApi.SELLER_AREAS[0]

      // STEP 2B.5-D1 (Blocker B): mesma semântica do WhatsApp
      // (hardResetConversationWorkspace() chama
      // YolenCompanionSellerMessageRuntime.clear() a cada troca real de
      // conversa) — o composer da conversa anterior nunca pode vazar para
      // a nova. Sem payload: limpa TUDO (única superfície visível por vez,
      // igual ao WhatsApp), nunca uma composição parcial por
      // conversation_key.
      messageEngine.clear()
    }

    // STEP 2B.5-D1 (Blocker B): composer adapter do ManyChat — MESMO
    // contrato {applied, reason} que o adapter do WhatsApp
    // (seller-message-runtime.js#insertIntoWhatsAppComposer) já usa,
    // reaproveitando manychat-composer.js sem reescrevê-lo. document/window
    // ficam a cargo dos defaults do próprio manychat-composer.js (document
    // atual) — nunca uma segunda resolução de composer aqui.
    function applyMessageViaManyChatComposer(text) {
      if (!composerApi) {
        return Object.freeze({ applied: false, reason: 'composer_unavailable' })
      }

      return composerApi.applyManyChatComposerSuggestion({ text })
    }

    // Textos seller-facing exclusivos do ManyChat (nunca "WhatsApp") —
    // mesmos reasons que manychat-composer.js já usa.
    function mapManyChatApplyResult(result) {
      if (result?.applied) {
        return 'Mensagem inserida no ManyChat. Revise antes de enviar.'
      }

      if (result?.reason === 'composer_unavailable' || result?.reason === 'conversation_anchor_missing' || result?.reason === 'composer_not_found') {
        return 'Não encontrei o campo de mensagem do ManyChat. Use Copiar.'
      }

      if (result?.reason === 'composer_ambiguous') {
        return 'Encontrei mais de um campo de mensagem no ManyChat e não posso escolher automaticamente. Use Copiar.'
      }

      if (result?.reason === 'composer_not_empty') {
        return 'O campo do ManyChat já contém texto. Envie ou limpe o rascunho antes de inserir a sugestão.'
      }

      if (result?.reason === 'apply_verification_failed') {
        return 'Não foi possível confirmar a inserção. Use Copiar.'
      }

      return 'Não foi possível inserir automaticamente. Use Copiar.'
    }

    // ÚNICA instância do engine para todo este runtime (mesma
    // arquitetura que seller-message-runtime.js usa no WhatsApp: o engine
    // já isola contexto internamente por cycle/conversation_key/
    // working_summary — nunca uma instância por conversation_key aqui).
    const messageEngine = sellerMessageEngineApi.createSellerMessageEngine({
      sendMessage,
      applyMessage: applyMessageViaManyChatComposer,
      mapApplyResultToFeedback: mapManyChatApplyResult,
      applyButtonLabel: 'Inserir no ManyChat',
    })

    // Consultado em cada render (nunca capturado no load do módulo):
    // companion-reasoning-view.js decora/sobrescreve
    // window.YolenCompanionSellerInformationView depois que
    // companion-seller-information-view.js carrega, então a referência
    // "certa" só existe depois que ambos os arquivos já rodaram.
    function sellerInformationApi() {
      const api = root.YolenCompanionSellerInformationView
      return api && typeof api.renderAnalysisViewModel === 'function' ? api : null
    }

    // Botão de ação da área ANÁLISE — reaproveita a MESMA action já usada
    // pela análise automática (ANALYZE_CONVERSATION via requestAnalysis),
    // nunca uma segunda lógica de disparo. Ausente enquanto uma análise já
    // está em voo (o backend dedup por watermark faria dela um no-op, e
    // requestAnalysis já se recusa a rodar duas ao mesmo tempo — mostrar um
    // botão que não faz nada seria enganoso); o texto de "Analisando…" do
    // módulo compartilhado já cobre esse estado.
    function getAnalysisActionButtonHtml(state) {
      if (state.analyzing) return ''

      return `
        <button
          class="yolen-secondary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Analisar novamente
        </button>
      `
    }

    function renderPanel(conversationKey) {
      if (!panelMountApi) return

      if (
        !conversationKey ||
        getCurrentConversationKey() !== conversationKey
      ) {
        return
      }

      const state = getState(conversationKey)
      const sellerApi = sellerInformationApi()
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null

      // STEP 2B.5-D1 (Blocker B): mantém o composer da MENSAGEM
      // sincronizado com o resumo do lead JÁ CARREGADO desta conversa —
      // idempotente e síncrono (nunca um gap assíncrono aqui: a
      // requisição de rede em si já usa o par begin/applyLeadSummaryResponse
      // abaixo em loadLeadSummary, com o MESMO stale-guard que o WhatsApp
      // usa). Sem resumo pronto, o engine simplesmente não tem contexto
      // (o mount, se existir, fica vazio) — nunca inventa um contexto
      // local.
      if (state.leadSummary?.status === 'ready' && state.leadSummary.data && cycleId) {
        messageEngine.syncContext(
          { cycle_id: cycleId, conversation_key: conversationKey },
          state.leadSummary.data,
        )
      }

      // STEP 2B.5-D: cada área usa a MESMA composição compartilhada com
      // o WhatsApp (companion-seller-workspace-view.js) — este runtime só
      // traduz o state do ManyChat (ready/data, nunca status) para os
      // parâmetros dela.
      const agoraHtml = sellerWorkspaceViewApi.renderAgoraAreaHtml({
        snapshotHtml:
          sellerApi && state.decisionState?.ready === true
            ? sellerApi.renderAgoraViewModelSnapshot(state.decisionState.data)
            : '',
        leadSummary: {
          ...state.leadSummary,
          saveStatus: state.leadSummarySaveStatus,
          saveError: state.leadSummarySaveError,
          draftValue: state.leadSummaryDraftValue,
        },
      })

      const analysisHtml = sellerWorkspaceViewApi.renderAnalysisAreaHtml({
        loading: state.analyzing,
        error: state.analysisError,
        ready: state.analysisViewModel?.ready === true,
        data: state.analysisViewModel?.ready === true ? state.analysisViewModel.data : null,
        actionHtml: getAnalysisActionButtonHtml(state),
        errorRetryButtonHtml: state.analysisError ? getAnalysisErrorRetryButtonHtml() : '',
      })

      const commercialHtml =
        sellerApi && state.customerViewModel?.ready === true
          ? sellerApi.renderCustomerViewModel(state.customerViewModel.data)
          : ''

      // STEP 2B.5-D1 (Blocker D): registro de conversa — elegibilidade é
      // só ter cycle/conversation resolvidos (mesma regra mínima do
      // WhatsApp, sem o conceito de grupo/self que não existe nesta
      // camada — a resolução de lead já filtrou isso antes de chegar
      // aqui); o CONTEÚDO por status vem do MESMO renderer compartilhado
      // que o WhatsApp usa.
      const registrationHtml = cycleId
        ? sellerWorkspaceViewApi.renderConversationRegistrationCardHtml(state.conversationRegistration)
        : ''

      // STEP 2B.5-D1 (Blocker D): candidatos de cadastro — elegibilidade
      // é a MESMA de registro (cycle resolvido); o CONTEÚDO (candidatos/
      // loading/erro/ações) vem do MESMO renderer compartilhado que o
      // WhatsApp usa, a partir do estado JÁ anotado por
      // loadLeadEnrichment() (nunca decidido aqui).
      const enrichmentHtml = cycleId
        ? sellerWorkspaceViewApi.renderLeadEnrichmentCandidatesHtml(state.leadEnrichment)
        : ''

      const clientHtml = sellerWorkspaceViewApi.renderClientAreaHtml({
        commercialHtml,
        relationshipHtml: sellerWorkspaceViewApi.renderClientRelationshipCardHtml({
          clientContext: state.clientContext,
          now: now(),
        }),
        registrationHtml,
        enrichmentHtml,
      })

      // MENSAGEM: mesmo MOUNT/contrato compartilhado que o WhatsApp usa
      // (companion-seller-workspace-view.js#renderMessageAreaHtml) — o
      // composer de verdade (objetivo/presets/textarea/Gerar mensagem/
      // resultado) é pintado DENTRO do mount pelo messageEngine
      // compartilhado, logo depois de panelMountApi.setPanelContent()
      // abaixo, nunca aqui como HTML estático. Elegível assim que o
      // resumo do lead está pronto (mesma regra do WhatsApp:
      // isSellerMessageMountEligible() também não exige working_summary
      // não vazio — isso é decisão do próprio engine via syncContext).
      const messageEligible = state.leadSummary?.status === 'ready'
      const messageHtml = sellerWorkspaceViewApi.renderMessageAreaHtml({
        eligible: messageEligible,
      })

      const activeArea = getActiveArea(conversationKey)

      panelMountApi.setPanelContent(`
        ${workspaceRuntimeApi.getSellerAreaTabsBarHtml(activeArea)}
        ${workspaceRuntimeApi.getSellerAreaPanelHtml('now', agoraHtml, activeArea)}
        ${workspaceRuntimeApi.getSellerAreaPanelHtml('message', messageHtml, activeArea)}
        ${workspaceRuntimeApi.getSellerAreaPanelHtml('analysis', analysisHtml, activeArea)}
        ${workspaceRuntimeApi.getSellerAreaPanelHtml('client', clientHtml, activeArea)}
      `)

      // O painel inteiro é substituído por innerHTML acima (setPanelContent),
      // então o mount da MENSAGEM (se elegível) acabou de ser recriado do
      // zero — o composer precisa ser repintado nele agora, com o MESMO
      // estado em memória de antes (intent digitado, mensagem gerada,
      // etc. vivem em messageEngine, nunca no DOM).
      if (messageEligible) {
        messageEngine.render()
      }
    }

    async function loadClientContext(cycleId, conversationKey) {
      const state = getState(conversationKey)
      state.clientContext = { status: 'loading', data: null, error: null }

      try {
        const response = await sendMessage({
          source: SOURCE,
          action: 'LOAD_CLIENT_CONTEXT',
          payload: { cycle_id: cycleId, conversation_key: conversationKey },
        })

        state.clientContext =
          response?.ok === true
            ? { status: 'ready', data: response.payload?.data ?? null, error: null }
            : { status: 'error', data: null, error: response?.payload?.error ?? 'load_failed' }
      } catch (error) {
        state.clientContext = {
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'load_exception',
        }
      }
    }

    async function loadSimpleViewModel(action, cycleId, conversationKey) {
      try {
        const response = await sendMessage({
          source: SOURCE,
          action,
          payload: { cycle_id: cycleId, conversation_key: conversationKey },
        })

        return response?.ok === true
          ? { ready: true, data: response.payload?.data ?? null }
          : { ready: false, data: null }
      } catch {
        return { ready: false, data: null }
      }
    }

    // STEP 2B.5-D1 (Blocker A): orientação de método (próximo passo) para
    // um working_summary JÁ resolvido — MESMO shape que
    // companion-lead-summary-view.js#renderMethodGuidance espera
    // (status/method_name/stage_name/next_step/error), MESMA action que o
    // WhatsApp usa (lead-method-guidance-runtime.js), só que sem a camada
    // de cache/DOM-patch dele (aqui um re-render de painel inteiro já
    // resolve isso). Nunca chamado com working_summary vazio — o backend
    // trataria como 'no_summary' de qualquer forma, mas falhar fechado
    // aqui evita uma chamada de rede sem sentido.
    async function loadMethodGuidance(cycleId, conversationKey, workingSummary) {
      try {
        const response = await sendMessage({
          source: SOURCE,
          action: 'LOAD_METHOD_GUIDANCE',
          payload: {
            cycle_id: cycleId,
            conversation_key: conversationKey,
            working_summary: workingSummary,
          },
        })

        if (response?.ok === true && response.payload?.ok === true && response.payload?.data) {
          return response.payload.data
        }

        return {
          status: 'error',
          error: response?.payload?.error ?? 'Não foi possível definir o próximo passo agora.',
        }
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error && error.message ? error.message : 'Falha de comunicação ao definir o próximo passo.',
        }
      }
    }

    // STEP 2B.5-D1 (Blocker A): carrega o resumo do lead pelo MESMO
    // controlador compartilhado que o WhatsApp usa (via
    // window.YolenCompanionApi) — companion-lead-summary-controller.js —
    // e injeta data.method_guidance com o "próximo passo", reproduzindo
    // EXATAMENTE o shape final que o WhatsApp entrega depois de passar
    // por lead-method-guidance-runtime.js. Isolado por conversation_key
    // (stateByConversationKey), single-flight (leadSummaryLoadPromise) e
    // protegido contra resposta tardia via o MESMO par
    // begin/applyLeadSummaryResponse que o composer da MENSAGEM usa —
    // nunca uma segunda convenção de staleness aqui.
    async function loadLeadSummary(cycleId, conversationKey) {
      if (!cycleId || !conversationKey) return

      const state = getState(conversationKey)

      if (state.leadSummaryLoadPromise) {
        return state.leadSummaryLoadPromise
      }

      const requestPayload = { cycle_id: cycleId, conversation_key: conversationKey }
      const token = messageEngine.beginLeadSummaryRequest(requestPayload)

      state.leadSummary = { status: 'loading' }
      renderPanel(conversationKey)

      const loadPromise = (async () => {
        const result = await leadSummaryControllerApi.loadLeadSummary({
          sendMessage,
          cycleId,
          conversationKey,
        })

        if (result.status !== 'ready') {
          state.leadSummary = { status: 'error', error: result.error }
          messageEngine.applyLeadSummaryResponse(token, requestPayload, { ok: false, data: null })
          renderPanel(conversationKey)
          return
        }

        const data = result.data
        const workingSummary =
          typeof data?.working_summary === 'string' && data.working_summary.trim()
            ? data.working_summary.trim()
            : typeof data?.summary?.summary === 'string'
              ? data.summary.summary.trim()
              : ''

        data.method_guidance = workingSummary
          ? await loadMethodGuidance(cycleId, conversationKey, workingSummary)
          : { status: 'no_summary' }

        state.leadSummary = { status: 'ready', data }

        messageEngine.applyLeadSummaryResponse(token, requestPayload, { ok: true, data })

        renderPanel(conversationKey)
      })()

      state.leadSummaryLoadPromise = loadPromise

      try {
        return await loadPromise
      } finally {
        if (state.leadSummaryLoadPromise === loadPromise) {
          state.leadSummaryLoadPromise = null
        }
      }
    }

    // Ação explícita do vendedor (clique em "Tentar novamente" no estado
    // de erro do resumo — companion-lead-summary-view.js#renderErrorState,
    // data-yolen-action="refresh"): reaproveita a MESMA loadLeadSummary,
    // nunca uma segunda leitura.
    async function retryLeadSummary(conversationKey) {
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null
      if (!cycleId) return

      await loadLeadSummary(cycleId, conversationKey)
    }

    // Ação explícita do vendedor (botão "Tentar novamente" embutido no
    // estado de erro de renderMethodGuidance —
    // data-yolen-action="retry-method-guidance"): recarrega SOMENTE a
    // orientação de método, reaproveitando o working_summary já
    // carregado — nunca os outros quatro view models nem uma nova
    // chamada de LOAD_LEAD_SUMMARY.
    async function retryMethodGuidance(conversationKey) {
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null
      if (!cycleId) return

      const state = getState(conversationKey)
      const data = state.leadSummary?.data

      const workingSummary =
        typeof data?.working_summary === 'string' && data.working_summary.trim()
          ? data.working_summary.trim()
          : typeof data?.summary?.summary === 'string'
            ? data.summary.summary.trim()
            : ''

      if (!data || !workingSummary) return

      data.method_guidance = { status: 'loading' }
      renderPanel(conversationKey)

      data.method_guidance = await loadMethodGuidance(cycleId, conversationKey, workingSummary)
      renderPanel(conversationKey)
    }

    // Ação explícita do vendedor (clique em "Salvar resumo na Yolen" —
    // companion-lead-summary-view.js#renderReadyState,
    // data-yolen-action="save-lead-summary"): compare-and-set via
    // expected_version, MESMA semântica que handleSaveLeadSummaryClick()
    // já usa no WhatsApp (content-script.js) — nunca sobrescreve uma
    // versão mais nova salva por outra ação nesse meio-tempo (409 vira
    // saveStatus 'conflict', nunca um overwrite silencioso).
    async function saveLeadSummary(conversationKey, summaryText) {
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null
      if (!cycleId) return

      const state = getState(conversationKey)
      const expectedVersion = leadSummaryControllerApi.extractExpectedVersion(state.leadSummary?.data ?? null)

      state.leadSummarySaveStatus = 'saving'
      state.leadSummarySaveError = null
      state.leadSummaryDraftValue = summaryText
      renderPanel(conversationKey)

      const result = await leadSummaryControllerApi.saveLeadSummary({
        sendMessage,
        cycleId,
        conversationKey,
        summary: summaryText,
        expectedVersion,
      })

      if (result.status === 'conflict') {
        state.leadSummarySaveStatus = 'conflict'
        state.leadSummarySaveError = null
        renderPanel(conversationKey)
        return
      }

      if (result.status !== 'ready') {
        state.leadSummarySaveStatus = 'error'
        state.leadSummarySaveError = result.error
        renderPanel(conversationKey)
        return
      }

      const previousSummaryData = state.leadSummary?.data || {}
      const persistedSummary = result.data?.summary || null

      const mergedData = {
        ...previousSummaryData,
        ...result.data,
        working_summary:
          persistedSummary?.summary ||
          previousSummaryData.working_summary ||
          null,
        working_summary_source: 'canonical',
        has_unsaved_changes: false,
        current_message_watermark:
          persistedSummary?.last_message_watermark ??
          previousSummaryData.current_message_watermark ??
          null,
      }

      state.leadSummary = { status: 'ready', data: mergedData }
      state.leadSummarySaveStatus = null
      state.leadSummarySaveError = null
      state.leadSummaryDraftValue = null

      messageEngine.syncContext({ cycle_id: cycleId, conversation_key: conversationKey }, mergedData)

      renderPanel(conversationKey)
    }

    // STEP 2B.5-D1 (Blocker D): gera o resumo da conversa para prévia por
    // AÇÃO EXPLÍCITA do vendedor (data-yolen-action="register-conversation")
    // — reaproveita o MESMO controlador compartilhado que a view espera
    // (companion-conversation-registration-controller.js), nunca uma
    // segunda leitura/regra de status. Reaproveitado também para "Gerar
    // novamente"/"Tentar novamente" (mesma action, o controlador decide o
    // status resultante a partir da resposta).
    async function registerConversation(conversationKey) {
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null
      if (!cycleId) return

      const state = getState(conversationKey)
      state.conversationRegistration = { status: 'previewing' }
      renderPanel(conversationKey)

      const result = await conversationRegistrationControllerApi.previewConversationRegistration({
        sendMessage,
        cycleId,
        conversationKey,
      })

      if (result.status === 'error') {
        state.conversationRegistration = { status: 'error', error_message: result.error }
        renderPanel(conversationKey)
        return
      }

      if (result.status === 'success') {
        state.conversationRegistration = {
          status: 'success',
          summary_text: result.summaryText,
          occurred_at: result.occurredAt,
          already_registered: true,
        }
        renderPanel(conversationKey)
        await loadLeadSummary(cycleId, conversationKey)
        return
      }

      state.conversationRegistration = {
        status: 'preview_ready',
        summary_text: result.summaryText,
        watermark: result.watermark,
        confirmation_token: result.confirmationToken,
        message_count: result.messageCount,
        occurred_at: result.occurredAt,
      }
      renderPanel(conversationKey)
    }

    // Ação explícita do vendedor (data-yolen-action="confirm-conversation-registration")
    // — exige um confirmation_token já emitido por uma prévia (nunca
    // registra sem prévia recente). 409/token inválido vira 'stale'
    // (nunca sobrescreve silenciosamente), reaproveitando a MESMA
    // allowlist de códigos que o WhatsApp já usa.
    async function confirmConversationRegistration(conversationKey) {
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null
      if (!cycleId) return

      const state = getState(conversationKey)
      const entry = state.conversationRegistration

      if (!entry || entry.status !== 'preview_ready' || !entry.confirmation_token) {
        return
      }

      state.conversationRegistration = { ...entry, status: 'saving', error_message: null }
      renderPanel(conversationKey)

      const result = await conversationRegistrationControllerApi.confirmConversationRegistration({
        sendMessage,
        cycleId,
        conversationKey,
        confirmationToken: entry.confirmation_token,
        summaryText: entry.summary_text,
      })

      if (result.status !== 'success') {
        state.conversationRegistration = { status: result.status, error_message: result.error }
        renderPanel(conversationKey)
        return
      }

      state.conversationRegistration = {
        status: 'success',
        summary_text: result.summaryText || entry.summary_text,
        occurred_at: result.occurredAt,
        already_registered: result.alreadyRegistered,
      }
      renderPanel(conversationKey)

      // O registro confirmado passa a ser uma fonte histórica do working
      // summary — mesma consequência que o WhatsApp já aplica
      // (loadCompanionLeadSummaryForCurrentCycle) depois de confirmar.
      await loadLeadSummary(cycleId, conversationKey)
    }

    // Ação explícita do vendedor (data-yolen-action="cancel-conversation-registration")
    // — descarta a prévia sem registrar nada, mesma semântica do WhatsApp
    // (cancelCurrentConversationRegistration).
    function cancelConversationRegistration(conversationKey) {
      const state = getState(conversationKey)
      if (state.conversationRegistration.status === 'idle') return

      state.conversationRegistration = { status: 'idle' }
      renderPanel(conversationKey)
    }

    // STEP 2B.5-D1 (Blocker D, Lead Enrichment): extrai candidatos do
    // ledger de mensagens já observadas (nunca uma segunda leitura de
    // DOM — ver manychat-capture-runtime.js#getEnrichmentLedgerMessages),
    // consulta LOAD_LEAD_ENRICHMENT_CONTEXT SOMENTE quando há candidato
    // de telefone/não-telefone para comparar (nunca uma chamada de rede
    // sem propósito), e anota o resultado com o MESMO controlador
    // compartilhado que a ação de confirmar usa. ignoredKeys sobrevive
    // entre chamadas (candidato ignorado pelo vendedor nunca reaparece
    // só porque a conversa recebeu uma mensagem nova).
    async function loadLeadEnrichment(cycleId, conversationKey) {
      if (!cycleId || !conversationKey) return

      const state = getState(conversationKey)
      const ignoredKeys = state.leadEnrichment.ignoredKeys
      const leadId = state.leadEnrichment.leadId

      const ledgerMessages = getEnrichmentLedgerMessages(conversationKey)
      const rawCandidates = leadEnrichmentControllerApi.extractCandidatesFromMessages(ledgerMessages, {})

      if (rawCandidates.length === 0) {
        state.leadEnrichment = {
          status: 'ready',
          leadId,
          candidates: [],
          applyLoadingKey: null,
          applySuccessKey: null,
          applyError: null,
          loadError: null,
          ignoredKeys,
        }
        return
      }

      const phoneCandidateValues = Array.from(
        new Set(
          rawCandidates
            .filter((candidate) => candidate.field === 'phone_mobile')
            .map((candidate) => candidate.normalized_value),
        ),
      )

      const context = await leadEnrichmentControllerApi.loadEnrichmentContext({
        sendMessage,
        cycleId,
        phoneCandidateValues,
      })

      if (context.status !== 'ready') {
        state.leadEnrichment = {
          status: 'error',
          leadId,
          candidates: [],
          applyLoadingKey: null,
          applySuccessKey: null,
          applyError: null,
          loadError: context.error,
          ignoredKeys,
        }
        return
      }

      const annotated = leadEnrichmentControllerApi
        .annotateCandidates({
          candidates: rawCandidates,
          leadId: context.leadId,
          currentValues: context.currentValues,
          phoneRegistered: context.phoneRegistered,
          phoneMatches: context.phoneMatches,
        })
        .filter((candidate) => !ignoredKeys.has(candidate.key))

      state.leadEnrichment = {
        status: 'ready',
        leadId: context.leadId,
        candidates: annotated,
        applyLoadingKey: null,
        applySuccessKey: null,
        applyError: null,
        loadError: null,
        ignoredKeys,
      }
    }

    // Ação explícita do vendedor (data-yolen-action="confirm-lead-enrichment")
    // — MESMO contrato de aplicação (APPLY_LEAD_ENRICHMENT) que o
    // WhatsApp já usa, via companion-lead-enrichment-controller.js.
    // Depois de aplicar com sucesso, recarrega o contexto (mesma
    // consequência do "auto-refresh" que o WhatsApp aplica): o candidato
    // aplicado deixa de existir na próxima leitura, porque o valor atual
    // já bate com ele.
    async function confirmLeadEnrichment(conversationKey, candidateKey) {
      const cycleId = options.getCycleId ? options.getCycleId(conversationKey) : null
      if (!cycleId || !candidateKey) return

      const state = getState(conversationKey)
      if (state.leadEnrichment.applyLoadingKey) return

      const candidate = state.leadEnrichment.candidates.find((item) => item.key === candidateKey)
      if (!candidate) return

      state.leadEnrichment = {
        ...state.leadEnrichment,
        applyLoadingKey: candidateKey,
        applySuccessKey: null,
        applyError: null,
      }
      renderPanel(conversationKey)

      const result = await leadEnrichmentControllerApi.applyCandidate({
        sendMessage,
        leadId: state.leadEnrichment.leadId,
        cycleId,
        candidate,
      })

      if (result.status !== 'success') {
        state.leadEnrichment = {
          ...state.leadEnrichment,
          applyLoadingKey: null,
          applySuccessKey: null,
          applyError: result.error,
        }
        renderPanel(conversationKey)
        return
      }

      state.leadEnrichment = {
        ...state.leadEnrichment,
        applyLoadingKey: null,
        applySuccessKey: candidateKey,
        applyError: null,
      }
      renderPanel(conversationKey)

      // Mesma folga de 350ms que o WhatsApp usa depois de aplicar
      // (content-script.js#applyLeadEnrichmentCandidate) antes de
      // recarregar — o vendedor precisa ver "Atualizado" primeiro; um
      // reload síncrono aqui apagaria esse feedback antes que ele
      // aparecesse na tela.
      schedule(async () => {
        await loadLeadEnrichment(cycleId, conversationKey)
        renderPanel(conversationKey)
      }, 350)
    }

    // Ação explícita do vendedor (data-yolen-action="ignore-lead-enrichment")
    // — descarta o candidato sem alterar o cadastro, mesma semântica do
    // WhatsApp (ignoreLeadEnrichmentCandidate). ignoredKeys persiste
    // entre recargas (loadLeadEnrichment filtra por ele).
    function ignoreLeadEnrichment(conversationKey, candidateKey) {
      if (!candidateKey) return

      const state = getState(conversationKey)
      const ignoredKeys = new Set(state.leadEnrichment.ignoredKeys)
      ignoredKeys.add(candidateKey)

      state.leadEnrichment = {
        ...state.leadEnrichment,
        ignoredKeys,
        candidates: state.leadEnrichment.candidates.filter((item) => item.key !== candidateKey),
        applySuccessKey: null,
        applyError: null,
      }
      renderPanel(conversationKey)
    }

    // Recarrega os view models (AGORA/ANÁLISE/CLIENTE + resumo do lead)
    // para a conversa. Chamado depois da captura inicial e depois que uma
    // análise nova termina — nunca bloqueia a captura de texto se falhar
    // (cada carregamento é independente e silencioso no erro).
    async function refreshViewModels({ cycleId, conversationKey }) {
      if (!cycleId || !conversationKey) return

      const state = getState(conversationKey)

      if (state.viewModelsLoadPromise) {
        return state.viewModelsLoadPromise
      }

      const loadPromise = (async () => {
        const [, decisionState, analysisViewModel, customerViewModel] =
          await Promise.all([
            loadClientContext(cycleId, conversationKey),
            loadSimpleViewModel('LOAD_DECISION_STATE', cycleId, conversationKey),
            loadSimpleViewModel('LOAD_ANALYSIS_VIEW_MODEL', cycleId, conversationKey),
            loadSimpleViewModel('LOAD_CUSTOMER_VIEW_MODEL', cycleId, conversationKey),
            loadLeadSummary(cycleId, conversationKey),
            loadLeadEnrichment(cycleId, conversationKey),
          ])

        state.decisionState = decisionState
        state.analysisViewModel = analysisViewModel
        state.customerViewModel = customerViewModel

        renderPanel(conversationKey)
      })()

      state.viewModelsLoadPromise = loadPromise

      try {
        return await loadPromise
      } finally {
        if (state.viewModelsLoadPromise === loadPromise) {
          state.viewModelsLoadPromise = null
        }
      }
    }

    function stopPolling(state) {
      if (state.pollTimerId !== null) {
        cancelSchedule(state.pollTimerId)
        state.pollTimerId = null
      }
    }

    // O backend deduplica ANALYZE_CONVERSATION por message_watermark
    // (o mesmo conteúdo já capturado nunca gera um job novo nem
    // reprocessa) — por isso é seguro chamar isto a cada captura
    // bem-sucedida, sem replicar aqui o sistema de fingerprint/sequence
    // counter do WhatsApp. Nunca dispara uma segunda análise concorrente
    // para a mesma conversa.
    // STEP 2B.5-D1 (Blocker C): "ANÁLISE — PARIDADE OBRIGATÓRIA". WhatsApp
    // distingue failed/timeout/superseded/erro de rede COM textos e
    // estado visível próprios (content-script.js#startDeepAnalysisPolling)
    // — nunca deixa o vendedor preso num "vazio progressivo" silencioso
    // depois de uma tentativa real. ManyChat reproduz as MESMAS três
    // mensagens terminais (superseded/timeout/falha genérica), sempre
    // limpando o loading E disparando renderPanel() (o código anterior a
    // esta correção deixava failed/superseded sem nenhum render — o
    // spinner ficava preso até outro evento não relacionado repintar o
    // painel).
    //
    // 'outdated' É PROVADAMENTE INAPLICÁVEL ao ManyChat nesta arquitetura:
    // outdated existe no WhatsApp porque a leitura pronta pode ficar
    // "para trás" da conversa real sem que nada dispare uma nova análise
    // automaticamente (o vendedor precisa notar e pedir "atualizar"). No
    // ManyChat, handleCaptureResult() já dispara requestAnalysis() a cada
    // captura de texto NÃO pulada (ver abaixo) — ou seja, toda vez que a
    // conversa muda de verdade (novo conteúdo capturado), uma análise nova
    // já é disparada automaticamente, e o analysisViewModel só é
    // considerado pronto depois que essa análise termina. Não existe uma
    // janela em que "a conversa mudou" e o view model pronto continua
    // visível sem uma análise em voo/erro cobrindo esse gap — portanto
    // nunca há um estado "pronto, mas relativo a uma conversa que já
    // mudou" para marcar como outdated.
    const ANALYSIS_ERROR_TIMEOUT = 'A análise demorou mais que o esperado. Tente novamente.'
    const ANALYSIS_ERROR_SUPERSEDED = 'A conversa mudou durante a análise. Tente novamente.'
    const ANALYSIS_ERROR_FAILED = 'Não foi possível concluir a leitura comercial da Yolen. Tente novamente.'
    const ANALYSIS_ERROR_DISPATCH_FAILED = 'Não foi possível iniciar a análise agora. Tente novamente.'

    // Mesma action/botão que a análise automática (ANALYZE_CONVERSATION
    // via requestAnalysis) — nunca uma segunda lógica de disparo. Rótulo
    // "Tentar novamente" (em vez de "Analisar novamente") só para o
    // estado de erro, mesma convenção do WhatsApp
    // (getDetailedAnalysisAreaHtml's errorRetryButtonHtml).
    function getAnalysisErrorRetryButtonHtml() {
      return `
        <button
          class="yolen-secondary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Tentar novamente
        </button>
      `
    }

    async function requestAnalysis({ cycleId, conversationKey }) {
      if (!cycleId || !conversationKey) return

      const state = getState(conversationKey)
      if (state.analyzing) return

      state.analyzing = true
      state.analysisError = null
      stopPolling(state)
      renderPanel(conversationKey)

      try {
        const response = await sendMessage({
          source: SOURCE,
          action: 'ANALYZE_CONVERSATION',
          payload: { cycle_id: cycleId, conversation_key: conversationKey },
        })

        const analysisJobId = response?.payload?.data?.analysis_job_id
        if (response?.ok !== true || !analysisJobId) {
          state.analyzing = false
          state.analysisError = ANALYSIS_ERROR_DISPATCH_FAILED
          renderPanel(conversationKey)
          return
        }

        pollJobStatus({ cycleId, conversationKey, analysisJobId, attempt: 0, startedAt: now() })
      } catch {
        state.analyzing = false
        state.analysisError = ANALYSIS_ERROR_DISPATCH_FAILED
        renderPanel(conversationKey)
      }
    }

    function pollJobStatus({ cycleId, conversationKey, analysisJobId, attempt, startedAt }) {
      const state = getState(conversationKey)

      const delay =
        ANALYSIS_POLL_DELAYS_MS[Math.min(attempt, ANALYSIS_POLL_DELAYS_MS.length - 1)]

      state.pollTimerId = schedule(async () => {
        state.pollTimerId = null

        if (now() - startedAt > ANALYSIS_POLL_TIMEOUT_MS) {
          state.analyzing = false
          state.analysisError = ANALYSIS_ERROR_TIMEOUT
          renderPanel(conversationKey)
          return
        }

        let response
        try {
          response = await sendMessage({
            source: SOURCE,
            action: 'GET_ANALYSIS_JOB_STATUS',
            payload: {
              cycle_id: cycleId,
              conversation_key: conversationKey,
              analysis_job_id: analysisJobId,
            },
          })
        } catch {
          pollJobStatus({ cycleId, conversationKey, analysisJobId, attempt: attempt + 1, startedAt })
          return
        }

        const status = response?.payload?.data?.status

        if (status === 'succeeded') {
          state.analyzing = false
          state.analysisError = null
          await refreshViewModels({ cycleId, conversationKey })
          return
        }

        if (status === 'failed' || status === 'superseded') {
          state.analyzing = false
          state.analysisError = status === 'superseded' ? ANALYSIS_ERROR_SUPERSEDED : ANALYSIS_ERROR_FAILED
          renderPanel(conversationKey)
          return
        }

        // queued/running/erro de rede pontual: continua tentando até o
        // timeout total.
        pollJobStatus({ cycleId, conversationKey, analysisJobId, attempt: attempt + 1, startedAt })
      }, delay)
    }

    // Chamado pelo bootstrap a cada resultado de captura: carrega os view
    // models na primeira vez que o cycle é conhecido, e dispara uma nova
    // análise sempre que uma captura de texto realmente aconteceu (nunca
    // em capturas puladas por conteúdo idêntico).
    async function handleCaptureResult(result) {
      if (!result?.ok || !result.conversation_key) return

      const cycleId = options.getCycleId ? options.getCycleId(result.conversation_key) : null
      if (!cycleId) return

      const state = getState(result.conversation_key)
      const isFirstLoad = state.decisionState === null

      if (isFirstLoad) {
        await refreshViewModels({ cycleId, conversationKey: result.conversation_key })
      }

      if (!result.skipped) {
        await requestAnalysis({ cycleId, conversationKey: result.conversation_key })
      }
    }

    function getConversationPanelState(conversationKey) {
      return getState(conversationKey)
    }

    return Object.freeze({
      PLATFORM,
      refreshViewModels,
      requestAnalysis,
      handleCaptureResult,
      retryLeadSummary,
      retryMethodGuidance,
      saveLeadSummary,
      registerConversation,
      confirmConversationRegistration,
      cancelConversationRegistration,
      confirmLeadEnrichment,
      ignoreLeadEnrichment,
      renderPanel,
      getConversationPanelState,
      getActiveArea,
      setActiveArea,
      resetActiveArea,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    ANALYSIS_POLL_DELAYS_MS,
    ANALYSIS_POLL_TIMEOUT_MS,
    createManyChatSellerPanelRuntime,
  })

  root.YolenManyChatSellerPanelRuntime = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
