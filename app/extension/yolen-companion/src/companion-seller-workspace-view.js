;(function initYolenCompanionSellerWorkspaceView(root) {
  'use strict'

  // STEP 2B.5-D — "UNIFICAÇÃO REAL DO SELLER WORKSPACE": composição
  // seller-facing PURA (sem DOM, sem conhecer WhatsApp/ManyChat) das
  // quatro áreas do Companion (AGORA/MENSAGEM/ANÁLISE/CLIENTE).
  //
  // Extraído de content-script.js (getNowAttentionSnapshotHtml/
  // getCompanionLeadSummaryCardHtml/getDetailedAnalysisAreaHtml/
  // getClientInformationAreaHtml/getCompanionClientRelationshipCardHtml) —
  // o WhatsApp passou a chamar estas mesmas funções através de wrappers
  // finos que só traduzem o `state` interno dele para os parâmetros
  // abaixo; a composição semântica para o mesmo estado é EXATAMENTE a
  // mesma de antes desta extração (mesmas classes, mesmos rótulos, mesmos
  // textos de fallback, mesma ordem). ManyChat (manychat-seller-panel-
  // runtime.js) chama as MESMAS funções com seu próprio state
  // normalizado — nunca uma segunda implementação paralela por
  // plataforma para a mesma área.
  //
  // Contrato: cada função aqui só recebe DADOS e HTML JÁ RESOLVIDO pela
  // plataforma (nunca DOM, nunca o `state` bruto de nenhuma plataforma) e
  // devolve uma string HTML. Os módulos puros já existentes
  // (companion-seller-information-view.js, companion-client-context-view.js,
  // companion-lead-summary-view.js) continuam sendo os únicos donos de
  // COMO renderizar um view model já pronto; este módulo só decide QUAL
  // deles usar e o que mostrar quando ainda não há dado (loading/empty/
  // error) — a mesma decisão que já existia espalhada em
  // content-script.js antes desta extração, agora compartilhável.

  function sellerInformationApi() {
    const api = root.YolenCompanionSellerInformationView
    return api && typeof api.renderAnalysisViewModel === 'function' ? api : null
  }

  function leadSummaryApi() {
    const api = root.YolenCompanionLeadSummaryView
    return api && typeof api.renderLeadSummarySection === 'function' ? api : null
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // -----------------------------------------------------------------------
  // AGORA
  // -----------------------------------------------------------------------

  const AGORA_PREPARING_FALLBACK_HTML = `
        <div class="yolen-card yolen-seller-area-card yolen-status-neutral">
          <div class="yolen-section-label">Agora</div>
          <div class="yolen-seller-empty-state">
            A Yolen está preparando o resumo e a orientação desta conversa.
          </div>
        </div>
      `

  // leadSummary: o mesmo shape aceito por
  // companion-lead-summary-view.js#renderLeadSummarySection (status
  // idle/loading/ready/error + saveStatus/saveError/draftValue). status
  // 'idle' (ou ausência de leadSummary — plataforma sem hidratação de
  // resumo ainda, ex.: ManyChat) nunca renderiza o card: cai no fallback
  // de preparação de quem chama.
  function renderLeadSummaryCardHtml(leadSummary) {
    const api = leadSummaryApi()
    const status = leadSummary?.status

    if (!api || !leadSummary || !status || status === 'idle') {
      return ''
    }

    return `
      <div class="yolen-card yolen-lead-summary-card">
        <div class="yolen-section-label">
          Resumo salvo na Yolen
        </div>

        ${api.renderLeadSummarySection(leadSummary)}
      </div>
    `
  }

  // AGORA nunca pode ser um retângulo vazio: sempre existe, no mínimo, o
  // texto de preparação — o sinal de decisão (snapshotHtml, quando
  // pronto) e o resumo do lead (quando a plataforma tiver essa camada)
  // só se SOMAM a ele, nunca o substituem sozinhos sem cobertura (mandato
  // STEP 2B.5-D §13/§17: sem hidratação de lead summary na plataforma, o
  // fallback de preparação continua sendo mostrado — nunca inventa um
  // resumo local).
  //
  // snapshotHtml: HTML JÁ RESOLVIDO do sinal de decisão (ex.:
  // sellerInformationApi.renderAgoraViewModelSnapshot(data) quando pronto
  // e atual, '' caso contrário) — decidir QUANDO o sinal existe/está
  // atual continua sendo responsabilidade de quem monta esse HTML (cada
  // plataforma já sabe isolar isso por conversation_key/cycle).
  function renderAgoraAreaHtml({ snapshotHtml = '', leadSummary = null } = {}) {
    const summaryHtml = renderLeadSummaryCardHtml(leadSummary)
    return (snapshotHtml || '') + (summaryHtml || AGORA_PREPARING_FALLBACK_HTML)
  }

  // -----------------------------------------------------------------------
  // ANÁLISE
  // -----------------------------------------------------------------------

  function analysisProgressiveEmptyHtml(actionHtml) {
    return `
      <div class="yolen-card yolen-seller-area-card">
        <div class="yolen-section-label">Análise</div>
        <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
          A leitura atual oferece somente orientação imediata. Ainda não há análise detalhada de coaching e método.
        </div>

        <div class="yolen-inline-actions yolen-decision-actions">
          ${actionHtml}
        </div>
      </div>
    `
  }

  // Prioridade EXATAMENTE igual à composição anterior em content-script.js
  // (getDetailedAnalysisAreaHtml): loading > error > outdated > pronto >
  // fallback de leitura ainda não convertida > tentativa legada sem
  // fallback utilizável > vazio progressivo. Um estado que uma
  // plataforma não possui (ex.: ManyChat não tem error/outdated/
  // tentativa legada) simplesmente nunca ativa aquele branch — nunca
  // finge tê-lo.
  //
  // actionHtml/errorRetryButtonHtml/loadingSpinnerHtml/legacyCardHtml são
  // sempre HTML JÁ RESOLVIDO pela plataforma (podem ser '' quando a
  // plataforma não tiver aquela ação/estado) — nunca uma função de
  // callback: este módulo não decide elegibilidade de ação nenhuma, só
  // onde colocá-la.
  function renderAnalysisAreaHtml({
    loading = false,
    error = null,
    outdated = false,
    ready = false,
    data = null,
    fallbackViewModel = null,
    hasLegacyAttempt = false,
    legacyCardHtml = '',
    actionHtml = '',
    errorRetryButtonHtml = '',
    loadingSpinnerHtml = '',
  } = {}) {
    const api = sellerInformationApi()

    if (loading) {
      return `
        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-loading role="status" aria-live="polite">
            ${loadingSpinnerHtml}
            Analisando sua condução comercial…
          </div>

          <div class="yolen-inline-actions yolen-decision-actions">
            ${actionHtml}
          </div>
        </div>
      `
    }

    if (error) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-status-warning">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-error role="alert">
            ${escapeHtml(error)}
          </div>
          ${
            errorRetryButtonHtml
              ? `
                <div class="yolen-inline-actions">
                  ${errorRetryButtonHtml}
                </div>
              `
              : ''
          }
        </div>
      `
    }

    if (outdated) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-status-warning">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-outdated>
            A conversa mudou. Atualize a leitura para avaliar a condução atual.
          </div>

          <div class="yolen-inline-actions yolen-decision-actions">
            ${actionHtml}
          </div>
        </div>
      `
    }

    if (ready && api) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-analysis-area-card">
          ${api.renderAnalysisViewModel(data)}

          <div class="yolen-inline-actions yolen-decision-actions">
            ${actionHtml}
          </div>
        </div>
      `
    }

    if (fallbackViewModel && api) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-analysis-area-card">
          ${api.renderAnalysisViewModel(fallbackViewModel)}

          <div class="yolen-inline-actions yolen-decision-actions">
            ${actionHtml}
          </div>
        </div>
      `
    }

    if (hasLegacyAttempt) {
      return `
        ${legacyCardHtml}

        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
            A leitura atual oferece somente orientação imediata. Ainda não há análise detalhada de coaching e método.
          </div>
        </div>
      `
    }

    return analysisProgressiveEmptyHtml(actionHtml)
  }

  // -----------------------------------------------------------------------
  // CLIENTE
  // -----------------------------------------------------------------------

  // clientContext: o mesmo shape aceito por
  // companion-client-context-view.js#renderClientContextSection (status
  // idle/loading/ready/error). status 'idle' (ou ausência) nunca
  // renderiza o card de relacionamento — mesma regra de antes da
  // extração (getCompanionClientRelationshipCardHtml).
  function renderClientRelationshipCardHtml({ clientContext = null, now = Date.now() } = {}) {
    const api = root.YolenCompanionClientContextView
    const status = clientContext?.status

    if (!api || typeof api.renderClientContextSection !== 'function' || !status || status === 'idle') {
      return ''
    }

    return `
      <div class="yolen-card yolen-client-relationship-card">
        <div class="yolen-section-label">
          Relacionamento e histórico
        </div>

        ${api.renderClientContextSection(clientContext, now)}
      </div>
    `
  }

  const CLIENT_EMPTY_STATE_HTML = `
      <div class="yolen-card yolen-seller-area-card">
        <div class="yolen-section-label">Cliente</div>
        <div class="yolen-seller-empty-state" data-yolen-client-empty>
          Ainda não há informações suficientes sobre este cliente.
        </div>
      </div>
    `

  // commercialHtml/relationshipHtml: HTML JÁ RESOLVIDO pela plataforma
  // (customerViewModel pronto ou fallback de leitura local — quando a
  // plataforma tiver essa camada — e renderClientRelationshipCardHtml
  // acima). Conteúdo extra específico de uma plataforma (ex.: cartão de
  // registro de conversa e candidatos de enriquecimento do WhatsApp)
  // continua sendo concatenado por FORA desta função, exatamente como
  // antes da extração — nunca soma aqui, para nunca aparecer numa
  // plataforma que não tiver nada assim (ex.: ManyChat).
  function renderClientAreaHtml({ commercialHtml = '', relationshipHtml = '' } = {}) {
    if (!commercialHtml && !relationshipHtml) {
      return CLIENT_EMPTY_STATE_HTML
    }

    return `
      ${commercialHtml}
      ${relationshipHtml}
    `
  }

  // -----------------------------------------------------------------------
  // MENSAGEM
  // -----------------------------------------------------------------------

  // Reaproveita o MESMO renderer puro que a Yolen já usa para o "próximo
  // passo" dentro do resumo do lead no WhatsApp
  // (companion-lead-summary-view.js#renderMethodGuidance — cobre
  // loading/ready/not_applicable/missing_method/invalid_method/error,
  // já com o botão de retry embutido no estado de erro). Nunca uma
  // segunda leitura/composição de "próxima mensagem" por plataforma: o
  // método comercial e a orientação pertencem ao Companion compartilhado
  // (LOAD_METHOD_GUIDANCE), nunca a uma regra local desta view. Quando
  // não há orientação nenhuma ainda (methodGuidance ausente ou
  // renderMethodGuidance devolve '' — ex.: status 'no_summary'), mostra
  // o mesmo estado vazio honesto das outras áreas — nunca um retângulo
  // preto.
  const MESSAGE_EMPTY_STATE_HTML = `
      <div class="yolen-card yolen-seller-area-card yolen-status-neutral">
        <div class="yolen-section-label">Mensagem</div>
        <div class="yolen-seller-empty-state" data-yolen-message-empty>
          A Yolen ainda não tem uma orientação de próximo passo para esta conversa.
        </div>
      </div>
    `

  function renderMessageAreaHtml({ methodGuidance = null } = {}) {
    const api = leadSummaryApi()
    const guidanceHtml =
      api && typeof api.renderMethodGuidance === 'function'
        ? api.renderMethodGuidance(methodGuidance)
        : ''

    if (!guidanceHtml) {
      return MESSAGE_EMPTY_STATE_HTML
    }

    return `
      <div class="yolen-card yolen-seller-area-card">
        <div class="yolen-section-label">Mensagem</div>
        ${guidanceHtml}
      </div>
    `
  }

  const api = Object.freeze({
    renderAgoraAreaHtml,
    renderAnalysisAreaHtml,
    renderClientRelationshipCardHtml,
    renderClientAreaHtml,
    renderMessageAreaHtml,
  })

  root.YolenCompanionSellerWorkspaceView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
