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

  // STEP 2B.5-D1 (Blocker D): registro de conversa (histórico do lead) —
  // capability Companion-core (PREVIEW_CONVERSATION_REGISTRATION/
  // CONFIRM_CONVERSATION_REGISTRATION, via companion-conversation-
  // registration-controller.js) que qualquer plataforma com um
  // cycle_id/conversation_key resolvidos pode oferecer — nunca DOM do
  // WhatsApp. `entry` é o MESMO shape que content-script.js já mantinha
  // internamente por conversationRegistrations[key] (status idle/
  // previewing/preview_ready/saving/success/stale/error +
  // summary_text/error_message/confirmation_token/occurred_at) — quem
  // decide SE mostra o card (elegibilidade: cycle/conversation resolvidos,
  // não é grupo/self) continua sendo a plataforma; quem decide O QUE
  // mostrar para cada status é este renderer único, nunca duplicado.
  // `entry` null/undefined (plataforma decidiu inelegível) nunca renderiza
  // nada — nunca um card morto oferecendo uma ação que falharia.
  function renderConversationRegistrationCardHtml(entry) {
    const status = entry?.status || 'idle'

    const body = (() => {
      if (status === 'previewing') {
        return `
          <div class="yolen-card-description">Gerando resumo…</div>
          <button class="yolen-secondary-button" type="button" disabled>Gerando resumo…</button>
        `
      }

      if (status === 'preview_ready') {
        return `
          <div class="yolen-card-description yolen-conversation-registration-preview">
            ${escapeHtml(entry?.summary_text || '')}
          </div>
          <div class="yolen-inline-actions">
            <button class="yolen-primary-button" type="button" data-yolen-action="confirm-conversation-registration">
              Confirmar registro
            </button>
            <button class="yolen-tertiary-button" type="button" data-yolen-action="cancel-conversation-registration">
              Cancelar
            </button>
          </div>
        `
      }

      if (status === 'saving') {
        return `
          <div class="yolen-card-description">Registrando no histórico…</div>
          <button class="yolen-primary-button" type="button" disabled>Registrando no histórico…</button>
        `
      }

      if (status === 'success') {
        return `
          <div class="yolen-card-description yolen-conversation-registration-preview">
            ${escapeHtml(entry?.summary_text || '')}
          </div>
          <div class="yolen-decision-kicker">Conversa registrada no histórico</div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Registrar novamente
          </button>
        `
      }

      if (status === 'stale') {
        return `
          <div class="yolen-card-description">
            ${escapeHtml(
              entry?.error_message ||
                'A conversa mudou desde a geração do resumo. Gere novamente.',
            )}
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Gerar novamente
          </button>
        `
      }

      if (status === 'error') {
        return `
          <div class="yolen-card-description yolen-status-warning">
            ${escapeHtml(entry?.error_message || 'Não foi possível registrar. Tentar novamente.')}
          </div>
          <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
            Tentar novamente
          </button>
        `
      }

      return `
        <button class="yolen-secondary-button" type="button" data-yolen-action="register-conversation">
          Registrar conversa
        </button>
      `
    })()

    return `
      <div class="yolen-card yolen-conversation-registration-card">
        <div class="yolen-section-label">Histórico do lead</div>
        ${body}
      </div>
    `
  }

  const LEAD_ENRICHMENT_FIELD_LABELS = Object.freeze({
    email: 'E-mail',
    cpf: 'CPF',
    cnpj: 'CNPJ',
    birth_date: 'Data de nascimento',
    profession: 'Profissão',
    cep: 'CEP',
    address_raw: 'Endereço',
    phone_mobile: 'Telefone adicional',
  })

  function getLeadEnrichmentFieldLabel(field) {
    return LEAD_ENRICHMENT_FIELD_LABELS[field] || 'Dado cadastral'
  }

  const LEAD_ENRICHMENT_CONFIRMABLE_FIELDS = Object.freeze([
    'email',
    'cpf',
    'cnpj',
    'birth_date',
    'profession',
    'cep',
    'phone_mobile',
  ])

  // Um candidato só é confirmável por ação explícita do vendedor quando:
  // campo confirmável + exige confirmação humana (o próprio candidato já
  // carrega isso). STEP 2B.5-D1.1 (hardening): 'different_private'
  // (telefone diferente de um já cadastrado) TAMBÉM é confirmável — a
  // aplicação nunca depende do content conhecer o valor atual (ver
  // companion-lead-enrichment-controller.js#isCandidateConfirmableNow,
  // MESMA regra duplicada aqui só porque a view nunca importa o
  // controller — WhatsApp nunca produz 'different_private').
  function isLeadEnrichmentCandidateConfirmableNow(candidate) {
    return (
      LEAD_ENRICHMENT_CONFIRMABLE_FIELDS.includes(candidate?.field) &&
      candidate?.requires_human_confirmation === true
    )
  }

  function renderLeadEnrichmentCandidateActionsHtml(candidate, entry) {
    const isApplying = entry?.applyLoadingKey === candidate.key
    const isApplied = entry?.applySuccessKey === candidate.key
    const actionsLocked = Boolean(entry?.applyLoadingKey) || isApplied

    const ignoreButton = `
      <button
        class="yolen-secondary-button"
        type="button"
        data-yolen-action="ignore-lead-enrichment"
        data-yolen-enrichment-key="${escapeHtml(candidate.key)}"
        ${actionsLocked ? 'disabled' : ''}
      >Ignorar</button>
    `

    if (!isLeadEnrichmentCandidateConfirmableNow(candidate)) {
      return `
        <div class="yolen-inline-actions">${ignoreButton}</div>
        <div class="yolen-operational-note">Este campo exige revisão manual.</div>
      `
    }

    // Telefone diferente de um já cadastrado: o número atual NUNCA é
    // mostrado (hardening de telefone), mas a substituição continua
    // possível por ação humana explícita — nunca aplicada
    // automaticamente (o clique em "Confirmar substituição" é a MESMA
    // action confirm-lead-enrichment; o servidor lê o telefone atual
    // sozinho no momento do apply).
    const isDifferentPrivatePhone = candidate.comparison === 'different_private'

    const confirmButton = `
      <button
        class="yolen-primary-button"
        type="button"
        data-yolen-action="confirm-lead-enrichment"
        data-yolen-enrichment-key="${escapeHtml(candidate.key)}"
        ${actionsLocked ? 'disabled' : ''}
      >${
        isApplied
          ? 'Atualizado'
          : isApplying
            ? 'Salvando...'
            : isDifferentPrivatePhone
              ? 'Confirmar substituição'
              : 'Confirmar'
      }</button>
    `

    return `
      ${
        isDifferentPrivatePhone
          ? '<div class="yolen-card-description yolen-status-warning">Já existe outro telefone cadastrado para este lead.</div>'
          : ''
      }
      <div class="yolen-inline-actions yolen-enrichment-actions">
        ${confirmButton}
        ${ignoreButton}
      </div>
    `
  }

  // STEP 2B.5-D1 (Blocker D): candidatos de cadastro (Cadastro) —
  // capability Companion-core (lead-enrichment.js para extração +
  // companion-lead-enrichment-controller.js para contexto/aplicação) que
  // qualquer plataforma com um ledger de mensagens observadas e um
  // cycle/lead resolvidos pode oferecer. `entry.candidates` já vem
  // FILTRADO/ANOTADO pelo controller compartilhado (current_value/
  // comparison/key) — esta view nunca decide QUAIS candidatos existem,
  // só COMO apresentá-los. `entry` null/vazio nunca renderiza nada
  // (nenhum card morto).
  function renderLeadEnrichmentCandidatesHtml(entry) {
    // loadError: só existe em plataformas cuja extração de candidatos
    // depende de uma consulta de rede própria (ManyChat, via
    // LOAD_LEAD_ENRICHMENT_CONTEXT) — o WhatsApp deriva os candidatos
    // 100% em memória a partir do resumo já carregado e nunca preenche
    // este campo, então nunca produz este card (zero mudança de
    // comportamento para o WhatsApp). Nunca apaga o resto da aba
    // CLIENTE: é só mais um card, igual ao de candidatos.
    if (entry?.loadError) {
      return `
        <div class="yolen-card yolen-lead-enrichment-card yolen-status-warning">
          <div class="yolen-section-label">Cadastro</div>
          <div class="yolen-card-description">${escapeHtml(entry.loadError)}</div>
        </div>
      `
    }

    const candidates = Array.isArray(entry?.candidates) ? entry.candidates : []

    if (candidates.length === 0) {
      return ''
    }

    const items = candidates
      .map((candidate) => {
        const evidenceCount = Array.isArray(candidate.evidence_message_ids)
          ? candidate.evidence_message_ids.length
          : 0

        const evidenceLabel =
          evidenceCount === 1 ? '1 mensagem de evidência' : `${evidenceCount} mensagens de evidência`

        const confidenceLabel = candidate.confidence === 'high' ? 'Alta confiança' : 'Média confiança'

        const comparisonLabel = candidate.current_value
          ? `Atual: ${candidate.current_value}`
          : 'Ainda não consta no cadastro'

        return `
          <div class="yolen-decision-list-item">
            <div class="yolen-decision-kicker">${escapeHtml(getLeadEnrichmentFieldLabel(candidate.field))}</div>
            <div class="yolen-decision-copy">${escapeHtml(candidate.value)}</div>
            <div class="yolen-card-description">
              ${escapeHtml(`${confidenceLabel} · ${evidenceLabel} · ${comparisonLabel}`)}
            </div>
            ${renderLeadEnrichmentCandidateActionsHtml(candidate, entry)}
          </div>
        `
      })
      .join('')

    return `
      <div class="yolen-card yolen-lead-enrichment-card">
        <div class="yolen-section-label">Cadastro</div>
        <div class="yolen-card-title">Dados encontrados na conversa</div>
        <div class="yolen-card-description">
          A Yolen identificou informações que podem complementar o cadastro deste lead.
        </div>
        <div class="yolen-decision-list">${items}</div>
        ${
          entry?.applyError
            ? `<div class="yolen-operational-note">${escapeHtml(entry.applyError)}</div>`
            : ''
        }
        <div class="yolen-operational-note">O cadastro só muda depois que você confirmar.</div>
      </div>
    `
  }

  // commercialHtml/relationshipHtml: HTML JÁ RESOLVIDO pela plataforma
  // (customerViewModel pronto ou fallback de leitura local — quando a
  // plataforma tiver essa camada — e renderClientRelationshipCardHtml
  // acima). registrationHtml/enrichmentHtml: HTML JÁ RESOLVIDO por esta
  // MESMA view (renderConversationRegistrationCardHtml/
  // renderLeadEnrichmentCandidatesHtml acima) ou '' — decidido pela
  // plataforma apenas quanto à elegibilidade (dados resolvidos/não é
  // grupo), nunca quanto ao CONTEÚDO/ordem, que sempre vive aqui. Uma
  // plataforma sem nenhuma dessas duas capabilities simplesmente passa ''
  // e elas somem, sem afetar o estado vazio do restante da área
  // (registro/enrichment não contam para decidir "cliente vazio": mesmo
  // sem view model comercial/relacionamento, um lead com cycle resolvido
  // já pode ter o card de registro).
  function renderClientAreaHtml({
    commercialHtml = '',
    relationshipHtml = '',
    registrationHtml = '',
    enrichmentHtml = '',
  } = {}) {
    const primaryHtml =
      !commercialHtml && !relationshipHtml
        ? CLIENT_EMPTY_STATE_HTML
        : `${commercialHtml}${relationshipHtml}`

    return `${primaryHtml}${registrationHtml}${enrichmentHtml}`
  }

  // -----------------------------------------------------------------------
  // MENSAGEM
  // -----------------------------------------------------------------------

  // STEP 2B.5-D1 — correção do Blocker B: MENSAGEM não é o "próximo
  // passo"/methodGuidance (esse conteúdo já pertence ao card de resumo do
  // lead, em AGORA, via renderMethodGuidance — companion-lead-summary-
  // view.js). A aba MENSAGEM real é o COMPOSER de mensagem do vendedor
  // (seller message engine, companion-seller-message-engine.js): esta
  // função só decide o MOUNT — o mesmo contrato eligible/ineligible que
  // getSellerMessageAreaHtml() já usava no WhatsApp antes desta extração
  // — nunca o conteúdo do composer em si (isso é o engine quem renderiza,
  // dentro do mount, depois que esta função devolve o HTML). eligible:
  // true quando a conversa tem contexto comercial válido para gerar
  // mensagem (mesma regra usada por cada plataforma para decidir isso —
  // ex.: isSellerMessageMountEligible() no WhatsApp); false mostra o
  // mesmo estado vazio honesto de antes, nunca um mount morto.
  function renderMessageAreaHtml({ eligible = false } = {}) {
    if (!eligible) {
      return `
        <div
          class="yolen-seller-message-workspace"
          data-yolen-seller-message-workspace
        >
          <div
            class="yolen-card yolen-seller-area-card yolen-status-neutral"
          >
            <div class="yolen-section-label">
              Mensagem
            </div>

            <div class="yolen-seller-empty-state">
              A geração de mensagem fica disponível quando esta conversa possui um contexto comercial válido na Yolen.
            </div>
          </div>
        </div>
      `
    }

    return `
      <div
        class="yolen-seller-message-workspace"
        data-yolen-seller-message-workspace
      >
        <div data-yolen-seller-message-mount></div>
      </div>
    `
  }

  const api = Object.freeze({
    renderAgoraAreaHtml,
    renderAnalysisAreaHtml,
    renderClientRelationshipCardHtml,
    renderConversationRegistrationCardHtml,
    renderLeadEnrichmentCandidatesHtml,
    renderClientAreaHtml,
    renderMessageAreaHtml,
  })

  root.YolenCompanionSellerWorkspaceView = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
