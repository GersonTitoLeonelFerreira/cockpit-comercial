;(function initYolenManyChatSellerPanelRuntime(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SOURCE = 'YOLEN_COMPANION'
  const ANALYSIS_POLL_DELAYS_MS = Object.freeze([1500, 2000, 3000, 4000, 5000])
  const ANALYSIS_POLL_TIMEOUT_MS = 240000

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Orquestra o painel do vendedor no ManyChat reaproveitando, sem
  // reescrever, os mesmos actions de background e os mesmos módulos de
  // view (puros, sem DOM) já usados pelo WhatsApp:
  // LOAD_CLIENT_CONTEXT/LOAD_DECISION_STATE/LOAD_ANALYSIS_VIEW_MODEL/
  // LOAD_CUSTOMER_VIEW_MODEL/LOAD_METHOD_GUIDANCE (todos {cycle_id,
  // conversation_key}) e ANALYZE_CONVERSATION/GET_ANALYSIS_JOB_STATUS.
  // Nunca cria um segundo motor de reasoning nem uma segunda lógica de
  // permissão — tudo já vem resolvido/autorizado pelo backend.
  function createManyChatSellerPanelRuntime(options = {}) {
    const sendMessage = options.sendMessage
    if (typeof sendMessage !== 'function') {
      throw new Error('options.sendMessage é obrigatório.')
    }

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
          methodGuidance: null,
          analyzing: false,
          pollTimerId: null,
        })
      }
      return stateByConversationKey.get(conversationKey)
    }

    function clientContextApi() {
      const api = root.YolenCompanionClientContextView
      return api && typeof api.renderClientContextSection === 'function' ? api : null
    }

    // Consultado em cada render (nunca capturado no load do módulo):
    // companion-reasoning-view.js decora/sobrescreve
    // window.YolenCompanionSellerInformationView depois que
    // companion-seller-information-view.js carrega, então a referência
    // "certa" só existe depois que ambos os arquivos já rodaram.
    function sellerInformationApi() {
      const api = root.YolenCompanionSellerInformationView
      return api && typeof api.renderAnalysisViewModel === 'function' ? api : null
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

      const clientApi = clientContextApi()
      const sellerApi = sellerInformationApi()

      const clientHtml = clientApi
        ? clientApi.renderClientContextSection(state.clientContext, now())
        : ''
      const agoraHtml = sellerApi
        ? sellerApi.renderAgoraViewModelSnapshot(state.decisionState?.data ?? null)
        : ''
      const analysisHtml = sellerApi
        ? sellerApi.renderAnalysisViewModel(state.analysisViewModel?.data ?? null)
        : ''
      const customerHtml = sellerApi
        ? sellerApi.renderCustomerViewModel(state.customerViewModel?.data ?? null)
        : ''

      const suggestion = state.methodGuidance?.data?.suggested_message ?? null
      const suggestionHtml = suggestion
        ? `
          <section class="yolen-suggested-message" data-yolen-section="suggested-message">
            <p data-yolen-suggested-message-text>${escapeHtml(suggestion)}</p>
            <button type="button" data-yolen-apply-suggestion>Aplicar no composer</button>
          </section>
        `
        : ''

      panelMountApi.setPanelContent(`
        <section data-yolen-section="agora"><h3>AGORA</h3>${agoraHtml}</section>
        <section data-yolen-section="analise"><h3>ANÁLISE</h3>${analysisHtml}</section>
        <section data-yolen-section="cliente"><h3>CLIENTE</h3>${clientHtml}${customerHtml}</section>
        ${suggestionHtml}
      `)
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

    // Recarrega os view models (AGORA/ANÁLISE/CLIENTE + orientação de
    // método) para a conversa. Chamado depois da captura inicial e depois
    // que uma análise nova termina — nunca bloqueia a captura de texto se
    // falhar (cada carregamento é independente e silencioso no erro).
    async function refreshViewModels({ cycleId, conversationKey }) {
      if (!cycleId || !conversationKey) return

      const state = getState(conversationKey)

      const [, decisionState, analysisViewModel, customerViewModel, methodGuidance] =
        await Promise.all([
          loadClientContext(cycleId, conversationKey),
          loadSimpleViewModel('LOAD_DECISION_STATE', cycleId, conversationKey),
          loadSimpleViewModel('LOAD_ANALYSIS_VIEW_MODEL', cycleId, conversationKey),
          loadSimpleViewModel('LOAD_CUSTOMER_VIEW_MODEL', cycleId, conversationKey),
          loadSimpleViewModel('LOAD_METHOD_GUIDANCE', cycleId, conversationKey),
        ])

      state.decisionState = decisionState
      state.analysisViewModel = analysisViewModel
      state.customerViewModel = customerViewModel
      state.methodGuidance = methodGuidance

      renderPanel(conversationKey)
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
    async function requestAnalysis({ cycleId, conversationKey }) {
      if (!cycleId || !conversationKey) return

      const state = getState(conversationKey)
      if (state.analyzing) return

      state.analyzing = true
      stopPolling(state)

      try {
        const response = await sendMessage({
          source: SOURCE,
          action: 'ANALYZE_CONVERSATION',
          payload: { cycle_id: cycleId, conversation_key: conversationKey },
        })

        const analysisJobId = response?.payload?.data?.analysis_job_id
        if (response?.ok !== true || !analysisJobId) {
          state.analyzing = false
          return
        }

        pollJobStatus({ cycleId, conversationKey, analysisJobId, attempt: 0, startedAt: now() })
      } catch {
        state.analyzing = false
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

        if (status === 'succeeded' || status === 'failed' || status === 'superseded') {
          state.analyzing = false
          if (status === 'succeeded') {
            await refreshViewModels({ cycleId, conversationKey })
          }
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

    // Ação explícita do vendedor: nunca chamado automaticamente. Aplica o
    // texto já carregado em methodGuidance.suggested_message no composer
    // (nunca envia, nunca sobrescreve texto existente — ver
    // manychat-composer.js).
    function applySuggestedMessage(conversationKey) {
      if (!composerApi) {
        return { applied: false, reason: 'composer_unavailable' }
      }

      const state = getState(conversationKey)
      const suggestion = state.methodGuidance?.data?.suggested_message

      if (typeof suggestion !== 'string' || !suggestion.trim()) {
        return { applied: false, reason: 'no_suggestion_available' }
      }

      return composerApi.applyManyChatComposerSuggestion({ text: suggestion })
    }

    function getConversationPanelState(conversationKey) {
      return getState(conversationKey)
    }

    return Object.freeze({
      PLATFORM,
      refreshViewModels,
      requestAnalysis,
      handleCaptureResult,
      applySuggestedMessage,
      renderPanel,
      getConversationPanelState,
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
