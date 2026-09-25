;(function initYolenCompanionCore(root) {
function createCompanionCore(ctx) {
  // Dependências explícitas do Core (composição pelo bootstrap do canal).
  const {
    channelAdapter,
    captureBatchTools,
    captureResilienceTools,
    clientContextViewTools,
    conversationBoundaryRuntime,
    leadEnrichmentTools,
    leadResolutionController,
    leadSummaryViewTools,
    messageMutationTools,
    nullBaseRebaseTools,
    sellerInformationViewTools,
    workspaceRuntime,
  } = ctx

  // Operações físicas do canal (ChannelAdapter): o Core nunca consulta a
  // plataforma diretamente.
  const {
    getAudioSource,
    getComposerText,
    getLatestOutgoingVisibleMessageText,
    getSelectedChatActivitySnapshot,
    getVisibleAudioTargets,
    insertTextIntoEmptyComposer,
    readVisibleMessageEntries,
  } = channelAdapter

  // Nome de exibição do canal (contrato §5): só interpolado em copy
  // canônica do Core.
  const platformDisplayName =
    channelAdapter.platform?.displayName || ''

  // Capabilities do canal (contrato §7 getCapabilities/§8): `true`
  // (SUPPORTED) e 'conditional' (CONDITIONAL) habilitam a ação; ausência
  // ou `false` leva ao mesmo estado canônico de indisponibilidade em
  // qualquer canal.
  function hasChannelCapability(capability) {
    const value =
      channelAdapter.getCapabilities?.()?.[capability]

    return (
      value === true ||
      value === 'conditional'
    )
  }

  let lastSessionUserId = null

  // Contexto imutável de uma operação seller-facing (FASE 5): fronteira da
  // conversa (geração + conversa + empresa) e sessão no instante em que a
  // operação começou. Todo efeito posterior a uma espera (escrita no
  // canal, telemetria, registro, atualização de estado) só acontece se o
  // contexto continuar vivo; A→B→A é uma geração nova e nunca reaproveita
  // a operação da geração antiga.
  function captureOperationContext() {
    return Object.freeze({
      boundaryToken:
        conversationBoundary.captureToken(),
      conversationKey:
        state.conversationKey || null,
      companyId:
        state.companyId || null,
      sessionUserId:
        lastSessionUserId,
    })
  }

  function isOperationContextCurrent(operationContext) {
    return Boolean(
      operationContext &&
      state.connected &&
      conversationBoundary.isTokenCurrent(
        operationContext.boundaryToken,
      ) &&
      (state.conversationKey || null) ===
        operationContext.conversationKey &&
      (state.companyId || null) ===
        operationContext.companyId &&
      lastSessionUserId ===
        operationContext.sessionUserId,
    )
  }

  // Políticas de transporte compostas explicitamente (retry + cache de
  // resolução; coordenação de versões + rebase de base nula na captura).
  const coreApiComposition =
    globalThis
      .YolenCompanionCoreApiComposition
      .create({
        getApi: () => window.YolenCompanionApi,
        captureResilienceTools,
        nullBaseRebaseTools,
      })

  // Controller de MENSAGEM (Core): a escrita no campo do canal é a única
  // dependência de plataforma e vem do ChannelAdapter.
  const messageController =
    globalThis
      .YolenCompanionMessageController
      .create({
        // Capability do canal (§8): sem canApplyMessage, a MENSAGEM mostra
        // o mesmo estado canônico de campo indisponível ("Use Copiar").
        insertIntoComposer: (text, expected) =>
          hasChannelCapability('canApplyMessage')
            ? insertTextIntoEmptyComposer(text, expected)
            : 'composer_unavailable',
        platformDisplayName,
        captureOperationContext: () =>
          captureOperationContext(),
        isOperationContextCurrent: (operationContext) =>
          isOperationContextCurrent(operationContext),
        getBaseUrl: () =>
          window.YolenCompanionApi
            ?.getBaseUrl
            ?.(),
      })
  const PANEL_ID = 'yolen-companion-panel'
  const ROOT_CLASS = 'yolen-companion-root'
  const SESSION_REFRESH_INTERVAL_MS = 60000
  const RUNTIME_RECOVERY_DELAY_MS = 350
  const HASH_SESSION_KEY = 'yolen_companion_session'
  const PANEL_COLLAPSED_STORAGE_KEY =
    'yolen_companion_panel_collapsed'
  const AUTO_CONTACT_LOOKUP_TIMEOUT_MS = 6000

  const CAPTURE_INGESTION_DELAY_MS = 1200
  const CAPTURE_INGESTION_MAX_RETRY_MS = 30000
  const MAX_MESSAGE_LEDGER_SIZE = 300
  const MAX_ANALYSIS_MESSAGE_COUNT = 80
  const MAX_RETAINED_PRE_RESOLUTION_CAPTURES = 20

  let panelCollapsed = false

  const conversationBoundary =
    conversationBoundaryRuntime
      .createConversationBoundary()

  const workspaceState =
    workspaceRuntime.createSellerWorkspaceState()

  // Rendering por região: renderPanel() costumava fazer panel.innerHTML =
  // <painel inteiro> a cada mudança de estado (ver histórico em
  // renderPanelRegion() abaixo). panelRegionHtmlCache guarda o último HTML
  // efetivamente aplicado em cada região (chave = nome da região); só
  // regravamos o DOM de uma região quando o HTML calculado agora é
  // diferente do que já está lá. panelRegionPendingHtml guarda, por
  // região, um HTML que já mudou mas ainda não pôde ser aplicado porque o
  // vendedor está interagindo com aquela região especificamente.
  const panelRegionHtmlCache = new Map()
  const panelRegionPendingHtml = new Map()

  // Fronteira de segurança de contexto (hardResetConversationWorkspace()):
  // nenhum mecanismo de estabilidade visual (region-action-lock, foco em
  // campo editável, HTML retido em panelRegionPendingHtml) pode impedir a
  // troca de DOM quando a conversa mudou de verdade. Ligada só durante o
  // único renderPanel() forçado disparado pela fronteira; qualquer outro
  // render (mesma conversa) continua respeitando as proteções normais.
  let forcingConversationBoundaryRender = false

  // Estado controlado dos accordions da Inteligência Comercial.
  // Não dependemos da ação nativa de <details> do navegador: quando o
  // vendedor abre um grupo, a chave fica registrada aqui e é reaplicada
  // em qualquer re-render da mesma conversa.
  const controlledOpenClientIntelligenceGroups =
    new Set()
  let lastAcknowledgedCollapsedAttentionKey = null
  let lastRenderedDeepAnalysisResultKey = null
  let sessionRefreshTimerId = 0
  let runtimeRecoveryTimerId = 0
  let runtimeRecoveryInFlight = false
  let lastResolvedConversationKey = null
  let lastResolvedContactLookupIdentity = null

  const leadResolutionInFlightKeys =
    new Set()
  let autoContactLookupInFlight = false
  let autoContactLookupConversationRefreshPending =
    false
  let lastSelectedChatActivitySnapshot = null
  let messageLedgerConversationKey = null
  let messageWindowFloorTimestamp = null
  let conversationMessageLedger = new Map()
  let deletedMessageIds = new Set()
  let deletedMessageSnapshots = new Map()
  let pendingCaptureMutationIds =
    new Set()
  let messageLedgerRequiresRebase = false
  let messageLedgerMutationRevision = 0
  // FASE 16.6 — mesmo padrão de agoraDecisionStateRequestSequence acima,
  // para o ANÁLISE seller-facing view model.
  let analysisViewModelRequestSequence = 0
  let captureIngestionTimerId = 0
  let captureIngestionInFlight = false
  let captureIngestionQueued = false
  let captureIngestionRetryAttempt = 0

  const analysisControllerContext = {
    get analysisViewModelRequestSequence() {
      return analysisViewModelRequestSequence
    },
    set analysisViewModelRequestSequence(value) {
      analysisViewModelRequestSequence = value
    },
    get buildConversationFingerprint() {
      return buildConversationFingerprint
    },
    get buildConversationTextFromMessages() {
      return buildConversationTextFromMessages
    },
    get getCanonicalResolutionCycleId() {
      return getCanonicalResolutionCycleId
    },
    get getCaptureConversationKey() {
      return getCaptureConversationKey
    },
    get getComposerText() {
      return getComposerText
    },
    get getCurrentConversationFingerprint() {
      return getCurrentConversationFingerprint
    },
    get getPendingAudioCountForCurrentConversation() {
      return getPendingAudioCountForCurrentConversation
    },
    get getSelectedChatActivitySnapshot() {
      return getSelectedChatActivitySnapshot
    },
    get getStructuredMessagesForAnalysis() {
      return getStructuredMessagesForAnalysis
    },
    get lastSelectedChatActivitySnapshot() {
      return lastSelectedChatActivitySnapshot
    },
    set lastSelectedChatActivitySnapshot(value) {
      lastSelectedChatActivitySnapshot = value
    },
    get loadCustomerViewModelForCurrentCycle() {
      return loadCustomerViewModelForCurrentCycle
    },
    get messageLedgerMutationRevision() {
      return messageLedgerMutationRevision
    },
    get messageLedgerRequiresRebase() {
      return messageLedgerRequiresRebase
    },
    set messageLedgerRequiresRebase(value) {
      messageLedgerRequiresRebase = value
    },
    get registerSuggestionShownTelemetry() {
      return registerSuggestionShownTelemetry
    },
    get rememberLastKnownClientCommercialReadingIfPresent() {
      return rememberLastKnownClientCommercialReadingIfPresent
    },
    get renderPanel() {
      return renderPanel
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
    get updatePreSendAssessmentFromDraft() {
      return updatePreSendAssessmentFromDraft
    },
  }

  const analysisController =
    globalThis
      .YolenCompanionAnalysisController
      .create(
        analysisControllerContext,
      )

  const {
    analyzeCurrentConversation,
    canAnalyzeCurrentConversation,
    clearAnalysisWatchdogTimer,
    clearAutomaticAnalysisTimer,
    clearDeepAnalysisPollTimer,
    isCurrentAnalysisOutdated,
    loadAgoraDecisionStateForCurrentCycle,
    loadAnalysisViewModelForCurrentCycle,
    scheduleAutomaticAnalysis,
  } = analysisController

  const clientControllerContext = {
    get clientContextViewTools() {
      return clientContextViewTools
    },
    get extractStatefulCommercialReading() {
      return extractStatefulCommercialReading
    },
    get getCanonicalResolutionCycleId() {
      return getCanonicalResolutionCycleId
    },
    get getCaptureConversationKey() {
      return getCaptureConversationKey
    },
    get getCurrentConversationFingerprint() {
      return getCurrentConversationFingerprint
    },
    get loadAgoraDecisionStateForCurrentCycle() {
      return loadAgoraDecisionStateForCurrentCycle
    },
    get loadAnalysisViewModelForCurrentCycle() {
      return loadAnalysisViewModelForCurrentCycle
    },
    get loadCompanionLeadSummaryForCurrentCycle() {
      return loadCompanionLeadSummaryForCurrentCycle
    },
    get renderPanel() {
      return renderPanel
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  }

  const clientController =
    globalThis
      .YolenCompanionClientController
      .create(
        clientControllerContext,
      )

  const {
    clearCompanionClientContextRefreshTimer,
    getCompanionClientRelationshipCardHtml,
    getLastKnownClientCommercialReading,
    loadCompanionClientContextForCurrentCycle,
    loadCustomerViewModelForCurrentCycle,
    notifyCaptureIngestedForClientContext,
    rememberLastKnownClientCommercialReadingIfPresent,
    startCompanionClientContextTicker,
  } = clientController

  const leadSummaryControllerContext = {
    get captureOperationContext() {
      return captureOperationContext
    },
    get isOperationContextCurrent() {
      return isOperationContextCurrent
    },
    get messageController() {
      return messageController
    },
    get getLeadSummarySnapshotSignature() {
      return getLeadSummarySnapshotSignature
    },
    get getCanonicalResolutionCycleId() {
      return getCanonicalResolutionCycleId
    },
    get getCaptureConversationKey() {
      return getCaptureConversationKey
    },
    get leadSummaryViewTools() {
      return leadSummaryViewTools
    },
    get renderPanel() {
      return renderPanel
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  }

  const leadSummaryController =
    globalThis
      .YolenCompanionLeadSummaryController
      .create(
        leadSummaryControllerContext,
      )

  const {
    getCompanionLeadSummaryCardHtml,
    handleSaveLeadSummaryClick,
    invalidateLeadSummaryForConversation,
    loadCompanionLeadSummaryForCurrentCycle,
  } = leadSummaryController

  const leadEnrichmentControllerContext = {
    get MAX_MESSAGE_LEDGER_SIZE() {
      return MAX_MESSAGE_LEDGER_SIZE
    },
    get PANEL_ID() {
      return PANEL_ID
    },
    get escapeHtml() {
      return escapeHtml
    },
    get getCanonicalResolutionCycleId() {
      return getCanonicalResolutionCycleId
    },
    get getCanonicalResolutionStatus() {
      return getCanonicalResolutionStatus
    },
    get getMessageTranscription() {
      return getMessageTranscription
    },
    get getSortedLedgerMessages() {
      return getSortedLedgerMessages
    },
    get leadEnrichmentTools() {
      return leadEnrichmentTools
    },
    get messageMutationTools() {
      return messageMutationTools
    },
    get onlyDigits() {
      return onlyDigits
    },
    get renderPanel() {
      return renderPanel
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  }

  const leadEnrichmentController =
    globalThis
      .YolenCompanionLeadEnrichmentController
      .create(
        leadEnrichmentControllerContext,
      )

  const {
    applyLeadEnrichmentCandidate,
    getLeadEnrichmentCandidateKey,
    getLeadEnrichmentCandidates,
    getLeadEnrichmentCandidatesHtml,
    getVisibleLeadEnrichmentCandidates,
    ignoreLeadEnrichmentCandidate,
  } = leadEnrichmentController

  const conversationRegistrationControllerContext = {
    get invalidateLeadSummaryForConversation() {
      return invalidateLeadSummaryForConversation
    },
    get escapeHtml() {
      return escapeHtml
    },
    get getCanonicalResolutionCycleId() {
      return getCanonicalResolutionCycleId
    },
    get getCaptureConversationKey() {
      return getCaptureConversationKey
    },
    get loadCompanionLeadSummaryForCurrentCycle() {
      return loadCompanionLeadSummaryForCurrentCycle
    },
    get renderPanel() {
      return renderPanel
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  }

  const conversationRegistrationController =
    globalThis
      .YolenCompanionConversationRegistrationController
      .create(
        conversationRegistrationControllerContext,
      )

  const {
    cancelCurrentConversationRegistration,
    confirmCurrentConversationRegistration,
    getConversationRegistrationCardHtml,
    registerCurrentConversation,
  } = conversationRegistrationController

  const leadCreationControllerContext = {
    get escapeHtml() {
      return escapeHtml
    },
    get renderPanel() {
      return renderPanel
    },
    get resolveCurrentLead() {
      return resolveCurrentLead
    },
    get sleep() {
      return sleep
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  }

  const leadCreationController =
    globalThis
      .YolenCompanionLeadCreationController
      .create(
        leadCreationControllerContext,
      )

  const {
    getLeadActionButton,
    isLeadCreationPendingForConversation,
    retryLeadLinkAfterCreation,
  } = leadCreationController

  const autoLookupAttemptedKeys = new Set()
  const lastIngestedCaptureKeys = new Map()

  const confirmedCaptureVersionsByConversation =
    new Map()

  const pendingCaptureIngestionPlans =
    new Map()

  const retainedPreResolutionCaptures =
    new Map()

  const registeredSuggestionShownTelemetryKeys =
    new Set()

  let state = {
    connected: false,
    loading: true,
    userName: null,
    companyId: null,
    companyName: null,
    companyRole: null,
    conversationTitle: null,
    conversationKey: null,
    conversationPhone: null,
    phoneSource: null,
    contactLookupIdentity: null,
    isSelfConversation: false,
    isGroupConversation: false,
    messageCount: 0,
    audioCount: 0,
    lastError: null,
    lastSessionSyncAt: null,
    leadResolutionLoading: false,
    leadResolution: null,
    leadResolutionViewModel: null,
    leadResolutionOutcome: null,
    leadResolutionBoundaryToken: null,
    leadResolutionError: null,
    leadCreationStatus: null,
    leadCreationConversationKey: null,
    leadCreationError: null,
    companionClientContext: {
      status: 'idle',
    },
    companionClientContextCycleId: null,
    companionClientContextConversationKey: null,
    // FASE 16.5 — AGORA seller-facing view model (Decision State
    // canônico). Mesmo padrão de três campos de companionClientContext
    // acima: status/dado + par cycleId/conversationKey para o mesmo
    // guard de escopo (isCurrentAgoraContext) usado antes de renderizar.
    agoraDecisionState: {
      status: 'idle',
    },
    agoraDecisionStateCycleId: null,
    agoraDecisionStateConversationKey: null,
    // FASE 16.5 (rodada 3 do Codex): identidade da EMPRESA sob a qual o
    // AGORA atual foi carregado — mesmo par cycleId/conversationKey não
    // basta para provar que o dado pertence à empresa ativa (achado do
    // Codex, PR #283): ver loadAgoraDecisionStateForCurrentCycle e o
    // bloco companyChanged de loadYolenSession.
    agoraDecisionStateCompanyId: null,
    // FASE 16.6 — ANÁLISE seller-facing view model (Integrated Commercial
    // Context canônico). Mesmo padrão de quatro campos de
    // agoraDecisionState acima (FASE 16.5): status/dado + trio
    // cycleId/conversationKey/companyId para o mesmo guard de escopo
    // (isCurrentAnalysisViewModelContext) usado antes de renderizar —
    // company/cycle/conversation isolation aplicados desde o início
    // (lição da FASE 16.5, rodada 3 do Codex), não descobertos depois.
    analysisViewModel: {
      status: 'idle',
    },
    analysisViewModelCycleId: null,
    analysisViewModelConversationKey: null,
    analysisViewModelCompanyId: null,
    // FASE 16.7 — CLIENTE seller-facing view model (Commercial Reading
    // canônica atual). Mesmo padrão de quatro campos de
    // analysisViewModel acima — company/cycle/conversation isolation
    // aplicados desde o início (mesma lição da FASE 16.5/16.6).
    customerViewModel: {
      status: 'idle',
    },
    customerViewModelCycleId: null,
    customerViewModelConversationKey: null,
    customerViewModelCompanyId: null,
    companionLeadSummary: {
      status: 'idle',
    },
    companionLeadSummaryCycleId: null,
    companionLeadSummaryConversationKey: null,
    companionLeadSummarySaveStatus: null,
    companionLeadSummarySaveError: null,
    companionLeadSummaryDraftValue: null,
    autoLookupStatus: null,
    conversationAnalysisLoading: false,
    conversationAnalysis: null,
    conversationAnalysisError: null,
    analyzedConversationFingerprint: null,
    automaticAnalysisStatus: null,
    deepAnalysisStatus: null,
    deepAnalysisResult: null,
    // CLIENTE precisa continuar mostrando a última inteligência comercial
    // válida enquanto uma nova tentativa de análise (automática ou manual)
    // está em voo ou termina em erro — ver getLastKnownClientCommercialReading.
    // lastKnownCommercialReadingContext carrega companyId/cycleId/
    // conversationKey/fingerprint da requisição que originou o snapshot —
    // qualquer divergência (inclusive a mesma conversation_key resolvendo
    // para um cycle_id novo) já invalida o snapshot no próximo render, sem
    // esperar uma análise nova terminar. ANÁLISE/AGORA continuam lendo só
    // conversationAnalysis/getActiveCommercialReading, sem nenhuma mudança
    // de comportamento.
    lastKnownCommercialReading: null,
    lastKnownCommercialReadingContext: null,
    suggestionApplyLoading: false,
    suggestionApplyResult: null,
    suggestionApplyError: null,
    suggestedMessageCopyStatus: null,
    suggestedMessageLastRegisteredKey: null,
    pendingSuggestedMessageSend: null,
    pendingSuggestedMessageSendRegistering: false,
    lastAnalysisAudioCount: 0,
    audioTranscriptionLoading: false,
    audioTranscriptionStatus: null,
    audioTranscriptionsByKey: {},
    audioBridgeStatus: 'Aguardando bridge de áudio',
    capturedAudioBlobCount: 0,
    audioTranscriptionHistoryLoading: false,
    audioTranscriptionHistoryCycleId: null,
    // A chave de aplicação em voo do enriquecimento de lead é escrita
    // somente pelo controller de enriquecimento (ausente = nenhuma).
    leadEnrichmentApplySuccessKey: null,
    leadEnrichmentApplyError: null,
    preSendAssessment: null,
    preSendAssessmentConversationKey: null,
    preSendAssessmentFingerprint: null,
    preSendDraft: '',
    preSendGateOpen: false,
    preSendBypassKey: null,
  }

  const ANALYZE_ACTION_SELECTOR =
    '[data-yolen-action="analyze-conversation"]'

  function handleAnalyzeActionClick() {
    analyzeCurrentConversation({
      automatic: false,
      retryFailedJob:
        Boolean(
          state.conversationAnalysisError,
        ) ||
        state.deepAnalysisStatus ===
          'failed',
    })
  }

  // Runtimes de estabilidade do painel podem reaplicar o HTML inteiro de
  // uma região e recriar o botão "Analisar"/"Tentar novamente" sem o
  // listener direto do wireOnce(). A ação continua do Core: uma única
  // delegação explícita no painel executa o MESMO handler apenas para
  // botões ainda não religados (FASE 5 — antes, o runtime UX8 capturava a
  // closure interceptando EventTarget.prototype.addEventListener).
  function handleUnwiredAnalyzeActionClick(event) {
    const action =
      event.target?.closest?.(
        ANALYZE_ACTION_SELECTOR,
      )

    if (
      !action ||
      action.__yolenWiredEvents
        ?.has?.('click')
    ) {
      return
    }

    handleAnalyzeActionClick()
  }

  function createPanel() {
    const existingPanel = document.getElementById(PANEL_ID)

    if (existingPanel) {
      return existingPanel
    }

    // Ponto de montagem fornecido pelo canal (contrato §7/§22); sem mount
    // o Core não renderiza (fail-closed).
    const mountPoint =
      hasChannelCapability('canProvideMountPoint')
        ? channelAdapter.getMountPoint()
        : null

    if (!mountPoint) {
      return null
    }

    const panel = document.createElement('aside')
    panel.id = PANEL_ID
    panel.className = ROOT_CLASS
    // Shell estrutural UX8 (workspace fixo: header/contato/abas/rodapé
    // fora do scroll, corpo único rolável). O conteúdo interno das abas
    // ainda é o UX7 (data-yolen-ux-build="UX7" em getSellerInformationArchitectureHtml)
    // até a migração das FASES C/D — as duas convivem por camada, não por
    // sobreposição de CSS.
    panel.setAttribute('data-yolen-ux-build', 'UX8')

    panel.addEventListener(
      'click',
      handleUnwiredAnalyzeActionClick,
    )

    mountPoint.appendChild(panel)

    return panel
  }

  // renderPanel() troca o innerHTML de uma região específica (ver
  // renderPanelRegion() logo abaixo) sempre que precisa recalcular seu
  // conteúdo. getOpenDetailsPreservationKeys()/restoreOpenDetails() rodam
  // ao redor dessa troca pontual para que um <details> aberto pelo
  // vendedor (grupos do CLIENTE, "ver mais contexto") dentro da região
  // trocada não feche sozinho.
  function getDetailsPreservationKey(details) {
    return (
      details.getAttribute(
        'data-yolen-client-intelligence-group',
      ) ||
      details.getAttribute(
        'data-yolen-preserve-details',
      ) ||
      null
    )
  }

  function getOpenDetailsPreservationKeys(
    panel,
  ) {
    return new Set(
      Array.from(
        panel.querySelectorAll(
          'details[open]',
        ),
      )
        .map(getDetailsPreservationKey)
        .filter(Boolean),
    )
  }

  function restoreOpenDetails(
    panel,
    keys,
  ) {
    const preservedKeys =
      new Set([
        ...(keys || []),
        ...controlledOpenClientIntelligenceGroups,
      ])

    if (preservedKeys.size === 0) {
      return
    }

    panel
      .querySelectorAll('details')
      .forEach((details) => {
        const key =
          getDetailsPreservationKey(
            details,
          )

        if (
          key &&
          preservedKeys.has(key)
        ) {
          details.open = true
        }
      })
  }

  const EDITABLE_FIELD_SELECTOR = [
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([readonly]):not([disabled])',
    'textarea:not([readonly]):not([disabled])',
    'select:not([disabled])',
    '[contenteditable="true"]',
  ].join(',')

  const REGION_ACTION_SELECTOR = [
    'button',
    '[role="button"]',
    'a[href]',
    'summary',
    'input[type="button"]',
    'input[type="submit"]',
  ].join(',')

  function isRegionInteractionActive(container) {
    if (!container) {
      return false
    }

    if (
      container.dataset
        .yolenRegionActionLock === 'true'
    ) {
      return true
    }

    const active = document.activeElement

    return Boolean(
      active &&
      container.contains(active) &&
      active.closest?.(
        EDITABLE_FIELD_SELECTOR,
      ),
    )
  }

  // UX8 (shell estável): único ponto de scroll seller-facing. Header,
  // contato, barra de abas, pre-send-assessment e rodapé continuam
  // filhos diretos do painel (flex: 0 0 auto, fora do scroll — ver
  // styles.css). Somente a região 'seller-information-architecture'
  // (o conteúdo das abas Agora/Análise/Cliente) mora dentro dele.
  //
  // getWorkspaceScrollContainer() é o helper canônico para achar o dono
  // real do scroll seller-facing (FASE B.1). Antes da UX8,
  // #yolen-companion-panel era, ele mesmo, o elemento rolável; agora quem
  // rola é .yolen-workspace-body. Nunca ler/escrever
  // panel.scrollTop/scrollHeight/clientHeight operacionalmente — sempre
  // passar por aqui. Devolve null (nunca lança, nunca inventa scroll no
  // painel) quando o workspace-body ainda não existe — modo colapsado, ou
  // um instante antes do primeiro render expandido — e quem chama trata
  // isso como fail-safe.
  function getWorkspaceScrollContainer(
    panel,
  ) {
    return (
      panel?.querySelector(
        '[data-yolen-workspace-body]',
      ) || null
    )
  }

  function getWorkspaceBodyContainer(
    panel,
  ) {
    let container =
      getWorkspaceScrollContainer(panel)

    if (!container) {
      container =
        document.createElement('div')
      container.className =
        'yolen-workspace-body'
      container.setAttribute(
        'data-yolen-workspace-body',
        'true',
      )
      panel.appendChild(container)
    }

    return container
  }

  const WORKSPACE_BODY_REGION_KEYS =
    new Set([
      'seller-information-architecture',
    ])

  function getPanelRegionContainer(
    panel,
    regionKey,
  ) {
    let container = panel.querySelector(
      `[data-yolen-region="${regionKey}"]`,
    )

    if (!container) {
      container =
        document.createElement('div')
      container.className =
        `yolen-region yolen-region-${regionKey}`
      container.setAttribute(
        'data-yolen-region',
        regionKey,
      )

      const regionParent =
        WORKSPACE_BODY_REGION_KEYS.has(
          regionKey,
        )
          ? getWorkspaceBodyContainer(
              panel,
            )
          : panel

      regionParent.appendChild(container)
    }

    return container
  }

  function applyPanelRegionHtml(
    container,
    regionKey,
    html,
  ) {
    panelRegionHtmlCache.set(
      regionKey,
      html,
    )
    panelRegionPendingHtml.delete(
      regionKey,
    )

    const openDetailsKeys =
      getOpenDetailsPreservationKeys(
        container,
      )

    container.innerHTML = html

    restoreOpenDetails(
      container,
      openDetailsKeys,
    )
  }

  // Núcleo da estabilidade visual do painel (Onda 7): cada card/região do
  // Companion (Conversa/Cliente, cadastro de lead, resumo, abas
  // Agora/Análise/Cliente, rodapé...) é um container que existe uma única
  // vez; renderPanel() só troca o innerHTML de UMA região quando o HTML
  // calculado para ela realmente mudou — nunca o painel inteiro. Uma
  // atualização em segundo plano que só afeta uma região (ex.: chegou um
  // resumo novo) não toca em nenhum outro card, então nenhuma trava
  // protege as regiões que não mudaram — elas simplesmente não são
  // tocadas. Quando a própria região que mudou está sendo usada pelo
  // vendedor agora (campo com foco, botão entre pointerdown e click), a
  // troca fica retida em panelRegionPendingHtml e só é aplicada quando a
  // interação termina (flushPendingPanelRegions()).
  function renderPanelRegion(
    panel,
    regionKey,
    html,
  ) {
    const container =
      getPanelRegionContainer(
        panel,
        regionKey,
      )

    if (
      panelRegionHtmlCache.get(
        regionKey,
      ) === html
    ) {
      panelRegionPendingHtml.delete(
        regionKey,
      )
      return container
    }

    if (
      !forcingConversationBoundaryRender &&
      isRegionInteractionActive(
        container,
      )
    ) {
      panelRegionPendingHtml.set(
        regionKey,
        html,
      )
      return container
    }

    applyPanelRegionHtml(
      container,
      regionKey,
      html,
    )

    return container
  }

  function flushPendingPanelRegions() {
    if (
      panelRegionPendingHtml.size === 0
    ) {
      return
    }

    const panel =
      document.getElementById(PANEL_ID)

    if (!panel) {
      return
    }

    for (const [
      regionKey,
      html,
    ] of panelRegionPendingHtml) {
      const container =
        panel.querySelector(
          `[data-yolen-region="${regionKey}"]`,
        )

      if (
        !container ||
        isRegionInteractionActive(
          container,
        )
      ) {
        continue
      }

      applyPanelRegionHtml(
        container,
        regionKey,
        html,
      )
    }

    wirePanelInteractions(panel)
  }

  // Libera qualquer lock de ação de região preso — usado tanto no
  // fallback de pointerup/pointercancel/dragstart (a interação normal
  // nunca deveria deixar um lock órfão, mas se o click esperado não
  // chegar a disparar, o lock ficaria preso para sempre) quanto na troca
  // real de conversa (hardResetConversationWorkspace()): nenhum lock
  // visual pode sobreviver a uma invalidação de contexto e continuar
  // impedindo renderPanelRegion() de substituir o HTML da conversa nova.
  function clearPanelRegionActionLocks() {
    document
      .querySelectorAll(
        '[data-yolen-region-action-lock="true"]',
      )
      .forEach((region) => {
        delete region.dataset
          .yolenRegionActionLock
      })
  }

  // Trava mínima contra o botão "desclicar" — a versão por região do
  // mecanismo já usado em panel-stability-runtime.js/
  // editable-field-stability-runtime.js para o painel inteiro. Aqui só
  // precisa proteger a própria região entre pointerdown e click: se uma
  // atualização em segundo plano tentar substituir o conteúdo dessa
  // região nesse intervalo, renderPanelRegion() vê o lock e adia.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const region =
        event.target?.closest?.(
          '[data-yolen-region]',
        )
      const action =
        event.target?.closest?.(
          REGION_ACTION_SELECTOR,
        )

      if (
        region &&
        action &&
        region.contains(action)
      ) {
        region.dataset.yolenRegionActionLock =
          'true'
      }
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      const region =
        event.target?.closest?.(
          '[data-yolen-region]',
        )

      if (
        !region ||
        region.dataset
          .yolenRegionActionLock !==
          'true'
      ) {
        return
      }

      const action =
        event.target?.closest?.(
          REGION_ACTION_SELECTOR,
        )

      const releaseRegionActionLock = () => {
        delete region.dataset
          .yolenRegionActionLock
        flushPendingPanelRegions()
      }

      if (
        action?.tagName ===
        'SUMMARY'
      ) {
        const clientDetails =
          action.closest?.(
            'details[data-yolen-client-intelligence-group]',
          )

        if (clientDetails) {
          // CLIENTE usa accordion controlado pelo Companion. Cancelamos a
          // ação nativa do Firefox e alternamos explicitamente o estado,
          // gravando a chave para que qualquer re-render preserve a escolha
          // do vendedor.
          event.preventDefault()

          const key =
            getDetailsPreservationKey(
              clientDetails,
            )

          const nextOpen =
            !clientDetails.open

          clientDetails.open =
            nextOpen

          if (key) {
            if (nextOpen) {
              controlledOpenClientIntelligenceGroups.add(
                key,
              )
            } else {
              controlledOpenClientIntelligenceGroups.delete(
                key,
              )
            }
          }

          queueMicrotask(
            releaseRegionActionLock,
          )
          return
        }

        // Outros <details> continuam usando o toggle nativo.
        window.setTimeout(
          releaseRegionActionLock,
          0,
        )
        return
      }

      queueMicrotask(
        releaseRegionActionLock,
      )
    },
    true,
  )

  for (const eventName of [
    'pointercancel',
    'dragstart',
  ]) {
    document.addEventListener(
      eventName,
      () => {
        clearPanelRegionActionLocks()
        flushPendingPanelRegions()
      },
      true,
    )
  }

  // Fallback de liberação: o fluxo normal trava no pointerdown e libera
  // no click da MESMA região (acima). Mas nem todo pointerdown é seguido
  // de um click nessa região — o ponteiro pode soltar fora do elemento,
  // ou a própria região pode ser substituída/desaparecer entre o
  // pointerdown e o click esperado. Sem este fallback, o lock ficaria
  // preso para sempre, e renderPanelRegion() nunca mais substituiria o
  // HTML dessa região (o bug real de smoke: seller-information-architecture
  // travada com conteúdo de uma conversa antiga).
  //
  // Agendado com setTimeout(..., 0) — nunca liberado sincronamente aqui —
  // para rodar DEPOIS do click normal da mesma sequência de gesto
  // (pointerdown -> pointerup -> click, nessa ordem, na mesma task; o
  // release do click acima roda em microtask/setTimeout(0) já agendados
  // antes deste). Se o click já liberou o lock, esta varredura não
  // encontra nada e não faz nada; só age quando o click esperado nunca
  // chega.
  document.addEventListener(
    'pointerup',
    () => {
      window.setTimeout(() => {
        const hadLockedRegion = Boolean(
          document.querySelector(
            '[data-yolen-region-action-lock="true"]',
          ),
        )

        if (!hadLockedRegion) {
          return
        }

        clearPanelRegionActionLocks()
        flushPendingPanelRegions()
      }, 0)
    },
    true,
  )

  document.addEventListener(
    'focusout',
    () => {
      window.setTimeout(
        flushPendingPanelRegions,
        0,
      )
    },
    true,
  )

  function decodeBase64Url(value) {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const binary = window.atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

    return new TextDecoder().decode(bytes)
  }

  async function captureSessionFromHash() {
    const hash = window.location.hash || ''

    if (!hash.includes(HASH_SESSION_KEY)) {
      return false
    }

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const encodedSession = params.get(HASH_SESSION_KEY)

    if (!encodedSession) {
      return false
    }

    try {
      const session = JSON.parse(decodeBase64Url(encodedSession))
      const result = await window.YolenCompanionApi.setSession(session)

      if (result?.ok) {
        window.history.replaceState(
          null,
          document.title,
          window.location.pathname + window.location.search,
        )
        return true
      }

      state = {
        ...state,
        connected: false,
        loading: false,
        lastError:
          result?.payload?.error ||
          'Não foi possível salvar a sessão do Companion.',
      }

      renderPanel()
      return false
    } catch (error) {
      state = {
        ...state,
        connected: false,
        loading: false,
        lastError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao capturar sessão do Companion.',
      }

      renderPanel()
      return false
    }
  }

  function observeCompanionSessionHash() {
    window.addEventListener(
      'hashchange',
      async () => {
        const captured =
          await captureSessionFromHash()

        if (!captured) {
          return
        }

        await loadYolenSession({
          showLoading: true,
        })

        refreshConversationSnapshot()
      },
    )
  }


  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }

  function getExtensionRuntime() {
    return globalThis.browser?.runtime || globalThis.chrome?.runtime || null
  }

  // Bridge de áudio do WhatsApp: a escuta das mensagens do page world e a
  // guarda dos blobs capturados são do ChannelAdapter (FASE 5). O Core só
  // reflete o status no painel.
  function listenToChannelAudio() {
    if (!hasChannelCapability('canReadAudio')) {
      return
    }

    channelAdapter.listenToAudioBridge({
      onBridgeReady() {
        state = {
          ...state,
          audioBridgeStatus: 'Bridge de áudio ativo',
        }

        renderPanel()
      },
      onAudioCaptured({ capturedCount }) {
        state = {
          ...state,
          audioBridgeStatus: `Bridge ativo · ${capturedCount} áudio(s) capturado(s)`,
          capturedAudioBlobCount: capturedCount,
        }

        renderPanel()
      },
    })
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function getVisibleMessagesCount() {
    return getAnalysisMessageBatch().length
  }

  function markMessageLedgerForRebase() {
    messageLedgerRequiresRebase =
      true

    messageLedgerMutationRevision +=
      1
  }

  function resetConversationMessageLedger(
    conversationKey,
  ) {
    messageLedgerConversationKey =
      conversationKey || null

    messageWindowFloorTimestamp = null
    conversationMessageLedger =
      new Map()
    deletedMessageIds =
      new Set()
    deletedMessageSnapshots =
      new Map()
    pendingCaptureMutationIds =
      new Set()
    messageLedgerRequiresRebase =
      false
    messageLedgerMutationRevision =
      0
  }

  function rememberPendingCaptureMutation(
    messageId,
  ) {
    const normalizedMessageId =
      String(messageId || '').trim()

    if (!normalizedMessageId) {
      return
    }

    pendingCaptureMutationIds.delete(
      normalizedMessageId,
    )

    pendingCaptureMutationIds.add(
      normalizedMessageId,
    )

    if (
      pendingCaptureMutationIds.size >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      const oldestMessageId =
        pendingCaptureMutationIds
          .values()
          .next()
          .value

      if (oldestMessageId) {
        pendingCaptureMutationIds.delete(
          oldestMessageId,
        )
      }
    }
  }

  function synchronizeConversationMessageLedger() {
    const conversationKey =
      state.conversationKey

    if (!conversationKey) {
      return false
    }

    if (
      messageLedgerConversationKey !==
      conversationKey
    ) {
      resetConversationMessageLedger(
        conversationKey,
      )
    }

    const observedAt =
      new Date().toISOString()

    // Leitura física das mensagens visíveis: ChannelAdapter. O ledger,
    // a detecção de mutação e o rebase de captura continuam no Core.
    const visibleEntries =
      readVisibleMessageEntries({
        observedAt,
        getPreviousMessage: (messageId) =>
          conversationMessageLedger.get(
            messageId,
          ),
      })

    if (!visibleEntries) {
      return false
    }

    let detectedMessageMutation =
      false

    visibleEntries
      .forEach((entry) => {
        const messageId =
          entry.messageId

        if (entry.deleted) {
          const messageWasAlreadyDeleted =
            deletedMessageIds.has(
              messageId,
            )

          const previousDeletedSnapshot =
            deletedMessageSnapshots.get(
              messageId,
            )

          const deletedSnapshot =
            messageWasAlreadyDeleted &&
            previousDeletedSnapshot
              ? {
                  // Upgrade: mesmo reaproveitando o snapshot já
                  // conhecido, o nó atual mostra um marcador explícito
                  // de exclusão do WhatsApp — a razão nunca pode
                  // regredir de 'explicit_deletion' para
                  // 'dom_disappearance'.
                  ...previousDeletedSnapshot,
                  deletionReason: 'explicit_deletion',
                }
              : entry.buildDeletedSnapshot()

          conversationMessageLedger.delete(
            messageId,
          )

          if (deletedSnapshot) {
            deletedMessageSnapshots.set(
              messageId,
              deletedSnapshot,
            )
          }

          if (!messageWasAlreadyDeleted) {
            deletedMessageIds.add(
              messageId,
            )

            rememberPendingCaptureMutation(
              messageId,
            )

            detectedMessageMutation =
              true
          }

          return
        }

        const message =
          entry.message

        if (!message) {
          return
        }

        const currentMessage =
          conversationMessageLedger.get(
            message.id,
          )

        const messageWasDeleted =
          deletedMessageIds.delete(
            message.id,
          )

        const messageChanged =
          Boolean(
            currentMessage &&
            !messageMutationTools
              .areCapturedMessagesEqual(
                currentMessage,
                message,
              ),
          )

        deletedMessageSnapshots.delete(
          message.id,
        )

        if (
          messageWasDeleted ||
          messageChanged
        ) {
          rememberPendingCaptureMutation(
            message.id,
          )

          detectedMessageMutation =
            true
        }

        const messageToStore =
          currentMessage &&
          !messageWasDeleted &&
          !messageChanged
            ? {
                ...message,
                observedAt:
                  currentMessage.observedAt,
              }
            : message

        conversationMessageLedger.set(
          message.id,
          messageToStore,
        )
      })

    // Blocker 2 (Fase 12A, Frente 2B, re-auditoria do Controle Mestre):
    // uma mensagem que simplesmente deixa de aparecer na consulta do DOM
    // acima (rolagem, virtualização do WhatsApp Web, troca de conversa)
    // NUNCA é tratada como exclusão. O código antigo tentava detectar
    // "desaparecimento seguro" e gerava uma mutação de exclusão para
    // essas mensagens — isso violava o contrato (removia conteúdo,
    // tirava a mensagem de activeMessages e podia contaminar
    // memória/summary/AGORA/ANÁLISE/CLIENTE só por causa de rolagem).
    // Deliberadamente não fazemos nada aqui: a mensagem permanece em
    // conversationMessageLedger com seu último conteúdo conhecido,
    // intocada, até reaparecer no DOM ou até o WhatsApp mostrar um
    // marcador explícito de exclusão (tratado acima, antes deste ponto).

    const sortedMessages =
      Array.from(
        conversationMessageLedger.values(),
      ).sort((a, b) => {
        if (
          a.timestampMs !==
          b.timestampMs
        ) {
          return (
            a.timestampMs -
            b.timestampMs
          )
        }

        return a.id.localeCompare(b.id)
      })

    if (
      sortedMessages.length >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      const retainedMessages =
        sortedMessages.slice(
          -MAX_MESSAGE_LEDGER_SIZE,
        )

      conversationMessageLedger =
        new Map(
          retainedMessages.map(
            (message) => [
              message.id,
              message,
            ],
          ),
        )
    }

    if (
      deletedMessageSnapshots.size >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      const retainedSnapshots =
        Array.from(
          deletedMessageSnapshots.values(),
        )
          .sort((first, second) => {
            if (
              first.timestampMs !==
              second.timestampMs
            ) {
              return (
                first.timestampMs -
                second.timestampMs
              )
            }

            return first.id.localeCompare(
              second.id,
            )
          })
          .slice(
            -MAX_MESSAGE_LEDGER_SIZE,
          )

      deletedMessageSnapshots =
        new Map(
          retainedSnapshots.map(
            (message) => [
              message.id,
              message,
            ],
          ),
        )
    }

    if (
      deletedMessageIds.size >
      MAX_MESSAGE_LEDGER_SIZE
    ) {
      deletedMessageIds =
        new Set(
          Array.from(
            deletedMessageIds,
          ).slice(
            -MAX_MESSAGE_LEDGER_SIZE,
          ),
        )
    }

    if (detectedMessageMutation) {
      markMessageLedgerForRebase()
    }

    return detectedMessageMutation
  }

  function getSortedLedgerMessages() {
    synchronizeConversationMessageLedger()

    return Array.from(
      conversationMessageLedger.values(),
    ).sort((a, b) => {
      if (
        a.timestampMs !== b.timestampMs
      ) {
        return (
          a.timestampMs -
          b.timestampMs
        )
      }

      return a.id.localeCompare(b.id)
    })
  }

  // Assinatura do snapshot de mensagens do ledger canônico (FASE 5):
  // muda quando uma mensagem entra, muda, é transcrita ou é excluída. É a
  // chave de frescor do cache do resumo do lead — antes derivada do DOM
  // '#main' do WhatsApp por lead-summary-runtime-cache.js.
  function getLeadSummarySnapshotSignature() {
    const lines =
      getSortedLedgerMessages()
        .map((message) =>
          [
            message.id || '',
            String(message.timestampMs ?? ''),
            message.direction || '',
            message.text || '',
            message.hasAudio ? 'audio' : '',
          ].join('\u001f'),
        )

    const deletedIds =
      Array.from(deletedMessageIds).sort()

    const material = [
      String(lines.length),
      ...lines,
      'deleted',
      ...deletedIds,
    ].join('\u001e')

    let hash = 2166136261

    for (let index = 0; index < material.length; index += 1) {
      hash ^= material.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${lines.length}:${deletedIds.length}:${(hash >>> 0).toString(16)}`
  }

  function getLatestDateMessageBlock(
    messages,
  ) {
    return messageMutationTools
      .getLatestDateMessageBlock(
        messages,
        MAX_ANALYSIS_MESSAGE_COUNT,
      )
  }

  function lockCurrentMessageWindow() {
    if (
      Number.isFinite(
        messageWindowFloorTimestamp,
      )
    ) {
      return
    }

    const messages =
      getLatestDateMessageBlock(
        getSortedLedgerMessages(),
      )

    if (messages.length === 0) {
      return
    }

    messageWindowFloorTimestamp =
      messages[0].timestampMs
  }

  function getAnalysisMessageBatch() {
    const messages =
      getSortedLedgerMessages()

    if (messages.length === 0) {
      return []
    }

    if (
      Number.isFinite(
        messageWindowFloorTimestamp,
      )
    ) {
      return messages
        .filter(
          (message) =>
            message.timestampMs >=
            messageWindowFloorTimestamp,
        )
        .slice(
          -MAX_ANALYSIS_MESSAGE_COUNT,
        )
    }

    return getLatestDateMessageBlock(
      messages,
    )
  }

  function getMessageTranscription(
    messageId,
    transcriptionMap = null,
  ) {
    const transcriptions =
      transcriptionMap ||
      state.audioTranscriptionsByKey ||
      {}

    const entry = Object.values(
      transcriptions,
    ).find((transcription) => {
      return (
        transcription?.targetKey ===
        messageId
      )
    })

    return (
      typeof entry?.text === 'string' &&
      entry.text.trim()
        ? entry.text.trim()
        : null
    )
  }

  function getStructuredMessagesForAnalysis(
    transcriptionMap = null,
  ) {
    return getAnalysisMessageBatch().map(
      (message) => {
        return {
          id: message.id,
          timestamp_ms:
            message.timestampMs,
          timestamp_label:
            message.timestampLabel,
          date_key: message.dateKey,
          direction:
            message.direction,
          sender: message.sender,
          text:
            messageMutationTools
              .prepareCapturedMessageTextForAnalysis(
                message.text,
              ),
          has_audio:
            message.hasAudio,
          audio_transcription:
            getMessageTranscription(
              message.id,
              transcriptionMap,
            ),
        }
      },
    )

  }

  function clearCaptureIngestionTimer() {
    if (captureIngestionTimerId) {
      window.clearTimeout(
        captureIngestionTimerId,
      )
    }

    captureIngestionTimerId = 0
  }

  function getCaptureConversationKey() {
    const canonicalPhone =
      state.leadResolution?.phone ||
      state.leadResolution?.lead?.phone ||
      state.conversationPhone

    return messageMutationTools
      .buildStableCaptureConversationKey({
        phone:
          canonicalPhone,
        title:
          state.conversationTitle,
      })
  }

  function canIngestCurrentCapture() {
    const resolutionIsEligible =
      captureBatchTools
        .isCaptureResolutionEligible(
          state.leadResolution,
        )

    return Boolean(
      state.connected &&
      !state.isSelfConversation &&
      getCaptureConversationKey() &&
      resolutionIsEligible &&
      window.YolenCompanionApi
        ?.ingestCapturedMessages,
    )
  }

  function getCurrentCaptureWindow() {
    const activeMessages =
      getSortedLedgerMessages()

    const deletedMessages =
      Array.from(
        deletedMessageSnapshots.values(),
      )

    return captureBatchTools
      .selectCaptureWindow({
        activeMessages,
        deletedMessages,
        pendingMutationKeys:
          pendingCaptureMutationIds,
      })
  }

  function cloneCaptureTranscriptions(
    transcriptionsByKey,
  ) {
    return Object.fromEntries(
      Object.entries(
        transcriptionsByKey || {},
      ).map(([key, value]) => {
        return [
          key,
          value &&
          typeof value === 'object'
            ? {
                ...value,
              }
            : value,
        ]
      }),
    )
  }

  function getConfirmedCaptureVersions(
    conversationKey,
  ) {
    const versions =
      confirmedCaptureVersionsByConversation
        .get(conversationKey)

    return versions
      ? Object.fromEntries(
          versions.entries(),
        )
      : {}
  }

  function rememberConfirmedCaptureVersions(
    conversationKey,
    messageResults,
  ) {
    if (
      !conversationKey ||
      !Array.isArray(messageResults)
    ) {
      return false
    }

    let versions =
      confirmedCaptureVersionsByConversation
        .get(conversationKey)

    if (!versions) {
      versions = new Map()

      confirmedCaptureVersionsByConversation
        .set(
          conversationKey,
          versions,
        )
    }

    let hasConflict = false

    messageResults.forEach((result) => {
      const messageKey =
        typeof result?.message_key === 'string'
          ? result.message_key.trim()
          : ''

      const canonicalVersion =
        typeof result
          ?.canonical_version === 'string'
          ? result.canonical_version.trim()
          : ''

      if (result?.synced !== true) {
        hasConflict = true
        return
      }

      if (
        !messageKey ||
        !/^[1-9][0-9]*$/.test(
          canonicalVersion,
        )
      ) {
        return
      }

      versions.set(
        messageKey,
        canonicalVersion,
      )
    })

    if (
      confirmedCaptureVersionsByConversation
        .size > 100
    ) {
      const oldestConversationKey =
        confirmedCaptureVersionsByConversation
          .keys()
          .next()
          .value

      if (oldestConversationKey) {
        confirmedCaptureVersionsByConversation
          .delete(oldestConversationKey)
      }
    }

    return hasConflict
  }

  function rememberCurrentPreResolutionCapture() {
    const conversationKey =
      state.conversationKey

    const captureConversationKey =
      getCaptureConversationKey()

    const resolutionIsEligible =
      captureBatchTools
        .isCaptureResolutionEligible(
          state.leadResolution,
        )

    if (
      !conversationKey ||
      !captureConversationKey ||
      resolutionIsEligible
    ) {
      return
    }

    const activeMessages =
      Array.from(
        conversationMessageLedger.values(),
      ).map((message) => {
        return {
          ...message,
        }
      })

    const deletedMessages =
      Array.from(
        deletedMessageSnapshots.values(),
      ).map((message) => {
        return {
          ...message,
        }
      })

    if (
      activeMessages.length === 0 &&
      deletedMessages.length === 0
    ) {
      return
    }

    retainedPreResolutionCaptures.delete(
      conversationKey,
    )

    retainedPreResolutionCaptures.set(
      conversationKey,
      {
        conversationKey,
        captureConversationKey,
        activeMessages,
        deletedMessages,
        pendingMutationKeys:
          Array.from(
            pendingCaptureMutationIds,
          ),
        transcriptionsByKey:
          cloneCaptureTranscriptions(
            state.audioTranscriptionsByKey,
          ),
      },
    )

    if (
      retainedPreResolutionCaptures.size >
      MAX_RETAINED_PRE_RESOLUTION_CAPTURES
    ) {
      const oldestConversationKey =
        retainedPreResolutionCaptures
          .keys()
          .next()
          .value

      if (oldestConversationKey) {
        retainedPreResolutionCaptures.delete(
          oldestConversationKey,
        )
      }
    }
  }

  function enqueueRetainedPreResolutionCapture(
    conversationKey,
    resolution,
  ) {
    const snapshot =
      retainedPreResolutionCaptures.get(
        conversationKey,
      )

    if (!snapshot) {
      return false
    }

    const resolutionIsEligible =
      captureBatchTools
        .isCaptureResolutionEligible(
          resolution,
        )

    const cycleId =
      resolution?.cycle?.id

    if (
      !resolutionIsEligible ||
      !cycleId
    ) {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    const captureWindow =
      captureBatchTools
        .selectCaptureWindow({
          activeMessages:
            snapshot.activeMessages,
          deletedMessages:
            snapshot.deletedMessages,
          pendingMutationKeys:
            snapshot.pendingMutationKeys,
        })

    let plan

    try {
      plan =
        captureBatchTools
          .buildCaptureIngestionPlan({
            cycleId,
            conversationKey:
              snapshot.captureConversationKey,
            activeMessages:
              captureWindow.activeMessages,
            deletedMessages:
              captureWindow.deletedMessages,
            transcriptionsByKey:
              snapshot.transcriptionsByKey,
            baseVersionsByMessageKey:
              getConfirmedCaptureVersions(
                snapshot.captureConversationKey,
              ),
          })
    } catch {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    if (
      !plan ||
      plan.messages.length === 0
    ) {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    const capturedMessageKeys =
      new Set(
        plan.messages.map((message) => {
          return message.message_key
        }),
      )

    const pendingMutationKeys =
      snapshot.pendingMutationKeys.filter(
        (messageId) => {
          return capturedMessageKeys.has(
            messageId,
          )
        },
      )

    const contextKey = [
      cycleId,
      snapshot.captureConversationKey,
    ].join('::')

    if (
      lastIngestedCaptureKeys.get(
        contextKey,
      ) === plan.snapshotKey
    ) {
      retainedPreResolutionCaptures.delete(
        conversationKey,
      )

      return false
    }

    pendingCaptureIngestionPlans.set(
      contextKey,
      {
        ...plan,
        contextKey,
        pendingMutationKeys,
      },
    )

    retainedPreResolutionCaptures.delete(
      conversationKey,
    )

    schedulePendingCaptureIngestion(
      CAPTURE_INGESTION_DELAY_MS,
    )

    return true
  }

  function buildCurrentCapturePlan() {
    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    if (!cycleId || !conversationKey) {
      return null
    }

    const captureWindow =
      getCurrentCaptureWindow()

    const plan =
      captureBatchTools
      .buildCaptureIngestionPlan({
        cycleId,
        conversationKey,
        activeMessages:
          captureWindow.activeMessages,
          deletedMessages:
            captureWindow.deletedMessages,
          transcriptionsByKey:
            state.audioTranscriptionsByKey ||
            {},
          baseVersionsByMessageKey:
            getConfirmedCaptureVersions(
              conversationKey,
            ),
        })

        const capturedMessageKeys =
        new Set(
          plan.messages.map(
            (message) =>
              message.message_key,
          ),
        )

      const pendingMutationKeys =
        Array.from(
          pendingCaptureMutationIds,
        ).filter((messageId) => {
          return capturedMessageKeys.has(
            messageId,
          )
        })

      return {
        ...plan,
        contextKey: [
          cycleId,
          conversationKey,
        ].join('::'),
        pendingMutationKeys,
      }
  }

  function rememberSuccessfulCapture(
    contextKey,
    snapshotKey,
  ) {
    lastIngestedCaptureKeys.set(
      contextKey,
      snapshotKey,
    )

    if (
      lastIngestedCaptureKeys.size >
      100
    ) {
      const oldestKey =
        lastIngestedCaptureKeys
          .keys()
          .next()
          .value

      if (oldestKey) {
        lastIngestedCaptureKeys.delete(
          oldestKey,
        )
      }
    }
  }

  function forgetPendingCapturePlan(
    contextKey,
    snapshotKey,
  ) {
    const currentPlan =
      pendingCaptureIngestionPlans.get(
        contextKey,
      )

    if (
      currentPlan?.snapshotKey ===
      snapshotKey
    ) {
      pendingCaptureIngestionPlans.delete(
        contextKey,
      )
    }
  }

  function forgetCapturedMutationKeys(
    contextKey,
    plan,
  ) {
    const currentPlan =
      pendingCaptureIngestionPlans.get(
        contextKey,
      )

    if (
      currentPlan?.snapshotKey !==
        plan.snapshotKey ||
      currentPlan?.observedAt !==
        plan.observedAt
    ) {
      return
    }

    const currentCycleId =
      getCanonicalResolutionCycleId()

    const currentConversationKey =
      getCaptureConversationKey()

    const currentContextKey =
      currentCycleId &&
      currentConversationKey
        ? [
            currentCycleId,
            currentConversationKey,
          ].join('::')
        : null

    if (
      currentContextKey !== contextKey ||
      !Array.isArray(
        plan.pendingMutationKeys,
      )
    ) {
      return
    }

    plan.pendingMutationKeys.forEach(
      (messageId) => {
        pendingCaptureMutationIds.delete(
          messageId,
        )
      },
    )
  }

  async function runCaptureIngestion() {
    clearCaptureIngestionTimer()

    if (captureIngestionInFlight) {
      captureIngestionQueued = true
      return
    }

    const pendingEntries =
      Array.from(
        pendingCaptureIngestionPlans
          .entries(),
      )

    if (pendingEntries.length === 0) {
      return
    }

    captureIngestionInFlight = true

    let retryDelay = null

    try {
      for (
        const [
          contextKey,
          plan,
        ] of pendingEntries
      ) {
        if (
          lastIngestedCaptureKeys.get(
            contextKey,
          ) === plan.snapshotKey
        ) {
          forgetPendingCapturePlan(
            contextKey,
            plan.snapshotKey,
          )

          continue
        }

        try {
          let planHasConflict = false

          for (
            const payload of
            plan.batches
          ) {
            const result =
              await coreApiComposition
                .ingestCapturedMessages(
                  payload,
                )

            if (
              !result?.ok ||
              !result.payload?.ok
            ) {
              const statusCode =
                Number(
                  result?.statusCode || 0,
                )

              const requestError =
                new Error(
                  result?.payload?.error ||
                    'Não foi possível persistir a captura na Yolen.',
                )

              requestError.retryable =
                statusCode === 0 ||
                statusCode === 401 ||
                statusCode >= 500

              throw requestError
            }

            // Captura confirmada: o resumo do lead em cache deixa de valer
            // para esta conversa, mesmo sem mudança visível.
            invalidateLeadSummaryForConversation(
              payload,
              {
                clearMessage: false,
              },
            )

            const responseHasConflict =
              rememberConfirmedCaptureVersions(
                payload.conversation_key,
                result.payload
                  .message_results,
              )

            if (responseHasConflict) {
              planHasConflict = true
            }
          }

          if (planHasConflict) {
            forgetPendingCapturePlan(
              contextKey,
              plan.snapshotKey,
            )

            continue
          }

          forgetCapturedMutationKeys(
            contextKey,
            plan,
          )

          rememberSuccessfulCapture(
            contextKey,
            plan.snapshotKey,
          )

          notifyCaptureIngestedForClientContext(
            contextKey,
          )

          forgetPendingCapturePlan(
            contextKey,
            plan.snapshotKey,
          )
        } catch (error) {
          if (
            error?.retryable === true
          ) {
            captureIngestionRetryAttempt +=
              1

            retryDelay = Math.min(
              CAPTURE_INGESTION_MAX_RETRY_MS,
              1000 *
                2 **
                  Math.min(
                    captureIngestionRetryAttempt,
                    5,
                  ),
            )
          } else {
            forgetPendingCapturePlan(
              contextKey,
              plan.snapshotKey,
            )
          }
        }
      }

      if (
        pendingCaptureIngestionPlans
          .size === 0
      ) {
        captureIngestionRetryAttempt =
          0
      }
    } finally {
      captureIngestionInFlight = false

      if (captureIngestionQueued) {
        captureIngestionQueued = false

        schedulePendingCaptureIngestion(
          250,
        )
      } else if (
        retryDelay !== null &&
        pendingCaptureIngestionPlans
          .size > 0
      ) {
        schedulePendingCaptureIngestion(
          retryDelay,
        )
      }
    }
  }

  function schedulePendingCaptureIngestion(
    delayMs,
  ) {
    clearCaptureIngestionTimer()

    if (
      pendingCaptureIngestionPlans
        .size === 0
    ) {
      return
    }

    if (captureIngestionInFlight) {
      captureIngestionQueued = true
      return
    }

    captureIngestionTimerId =
      window.setTimeout(() => {
        runCaptureIngestion()
      }, delayMs)
  }

  function scheduleCaptureIngestion(
    delayMs =
      CAPTURE_INGESTION_DELAY_MS,
  ) {
    if (!canIngestCurrentCapture()) {
      return
    }

    let plan

    try {
      plan =
        buildCurrentCapturePlan()
    } catch {
      return
    }

    if (
      !plan ||
      !plan.contextKey ||
      plan.messages.length === 0
    ) {
      return
    }

    if (
      lastIngestedCaptureKeys.get(
        plan.contextKey,
      ) === plan.snapshotKey
    ) {
      return
    }

    pendingCaptureIngestionPlans.set(
      plan.contextKey,
      plan,
    )

    schedulePendingCaptureIngestion(
      delayMs,
    )
  }

  function buildConversationTextFromMessages(
    messages,
  ) {
    return messages
      .map((message) => {
        const actor =
          message.direction ===
          'outgoing'
            ? 'Vendedor'
            : 'Lead'

        const parts = []

        if (message.text) {
          parts.push(message.text)
        }

        if (
          message.audio_transcription
        ) {
          parts.push(
            `[Áudio transcrito: ${message.audio_transcription}]`,
          )
        } else if (message.has_audio) {
          parts.push(
            '[Áudio ainda sem transcrição]',
          )
        }

        if (parts.length === 0) {
          return null
        }

        return `[${message.timestamp_label}] ${actor}: ${parts.join(
          ' ',
        )}`
      })
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(0, 24000)
  }

  function getAnalysisMessageIdSet() {
    return new Set(
      getAnalysisMessageBatch().map(
        (message) => message.id,
      ),
    )
  }

  function getRelevantVisibleAudioTargets() {
    const messageIds =
      getAnalysisMessageIdSet()

    return getVisibleAudioTargets().filter(
      (target) => {
        return messageIds.has(
          target.key,
        )
      },
    )
  }

  function getVisibleAudioCount() {
    return getAnalysisMessageBatch()
      .filter(
        (message) =>
          message.hasAudio,
      )
      .length
  }

  function normalizeMessageText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u200e/g, '')
      .trim()
  }


  function getAudioTranscriptionKey(target) {
    const targetKey =
      target && typeof target === 'object' && target.key
        ? target.key
        : `legacy-${String(target ?? 0)}`

    return `${state.conversationKey || 'sem-conversa'}::audio::${encodeURIComponent(
      targetKey,
    )}`
  }

  function getPendingAudioCountForCurrentConversation(
    transcriptionMap = null,
  ) {
    return getAnalysisMessageBatch()
      .filter((message) => {
        return (
          message.hasAudio &&
          !getMessageTranscription(
            message.id,
            transcriptionMap,
          )
        )
      })
      .length
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        const result = String(reader.result || '')
        resolve(result.includes(',') ? result.split(',').pop() : result)
      }

      reader.onerror = () => {
        reject(new Error('Não foi possível ler o arquivo de áudio.'))
      }

      reader.readAsDataURL(blob)
    })
  }

  async function transcribeNextVisibleAudio() {
    if (state.audioTranscriptionLoading) {
      return
    }

    const cycleId = getCanonicalResolutionCycleId()

    if (!cycleId) {
      state = {
        ...state,
        audioTranscriptionStatus: 'Ciclo comercial não localizado para transcrição.',
      }

      renderPanel()
      return
    }

    const audioTargets =
      getRelevantVisibleAudioTargets()

    if (audioTargets.length === 0) {
      state = {
        ...state,
        audioTranscriptionStatus:
          'O áudio pendente da conversa atual não está visível. Volte ao ponto mais recente da conversa e tente novamente.',
      }

      renderPanel()
      return
    }

    const nextTarget = audioTargets.find((target) => {
      return !state.audioTranscriptionsByKey?.[getAudioTranscriptionKey(target)]
    })

    if (!nextTarget) {
      state = {
        ...state,
        audioTranscriptionStatus: 'Todos os áudios visíveis desta conversa já foram transcritos.',
      }

      renderPanel()
      return
    }

    state = {
      ...state,
      audioTranscriptionLoading: true,
      audioTranscriptionStatus: `Transcrevendo áudio ${nextTarget.index + 1}...`,
    }

    renderPanel()

    try {
      const audioCapture = await getAudioSource(nextTarget)

      if (!audioCapture?.ok) {
        throw new Error(
          `Não foi possível associar o arquivo ao áudio correto. Duração visível: ${
            Number.isFinite(nextTarget.durationSeconds)
              ? `${nextTarget.durationSeconds}s`
              : 'não identificada'
          }. O Companion não enviou nenhum arquivo para transcrição.`,
        )
      }

      const blob = audioCapture.blob
      const audioBase64 = await blobToBase64(blob)

      const result = await window.YolenCompanionApi.transcribeAudio({
        cycle_id: cycleId,
        audio_base64: audioBase64,
        mime_type: blob.type || 'audio/webm',
        file_name: `${channelAdapter.platform?.id || 'channel'}-audio-${nextTarget.index + 1}.webm`,
        audio_index: nextTarget.index,
        audio_target_key: nextTarget.key,
      })

      if (!result?.ok || !result.payload?.ok || !result.payload?.data?.text) {
        throw new Error(
          result?.payload?.error ||
            'Não foi possível transcrever o áudio pela Yolen.',
        )
      }
      const transcriptionKey = getAudioTranscriptionKey(nextTarget)


      const nextAudioTranscriptionsByKey = {
        ...(state.audioTranscriptionsByKey || {}),
        [transcriptionKey]: {
          audioIndex: nextTarget.index,
          targetKey: nextTarget.key,
          capturedBlobId: audioCapture.capturedBlobId,
          text: result.payload.data.text,
          occurredAt:
            result.payload.data.occurred_at ||
            new Date().toISOString(),
        },
      }

      const remainingAudioCount =
        getPendingAudioCountForCurrentConversation(
          nextAudioTranscriptionsByKey,
        )

      state = {
        ...state,
        audioTranscriptionLoading: false,
        audioTranscriptionStatus:
          remainingAudioCount === 0
            ? 'Todos os áudios visíveis foram transcritos. Analise a conversa novamente.'
            : result.payload.data.already_transcribed
              ? 'Áudio já estava transcrito.'
              : 'Áudio transcrito com sucesso.',
        audioTranscriptionsByKey: nextAudioTranscriptionsByKey,
      }

      renderPanel()

      scheduleCaptureIngestion()

      if (remainingAudioCount === 0) {
        scheduleAutomaticAnalysis(
          'Todos os áudios foram transcritos. A análise será atualizada automaticamente em 8 segundos.',
        )
      }
    } catch (error) {
      state = {
        ...state,
        audioTranscriptionLoading: false,
        audioTranscriptionStatus:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao transcrever áudio.',
      }

      renderPanel()
    }
  }

  function buildConversationFingerprint(value) {
    const text = String(value || '')
      .replace(/\r\n/g, '\n')
      .trim()

    let hash = 2166136261

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${text.length}:${(hash >>> 0).toString(16)}`
  }

  function getCurrentConversationFingerprint() {
    const messages =
      getStructuredMessagesForAnalysis()

    return messageMutationTools
      .buildMessageSnapshotFingerprint(
        messages,
        deletedMessageIds,
      )
  }

  async function runAutomaticContactLookup(conversationKey) {
    if (autoContactLookupInFlight) {
      return
    }

    if (
      !state.connected ||
      !hasChannelCapability('canProvideTrustedPhone') ||
      state.isSelfConversation ||
      state.isGroupConversation ||
      state.conversationPhone
    ) {
      return
    }

    const lookupTitle =
      state.conversationTitle

    // A tentativa só é válida para a conversa ATUAL: sem esta checagem, um
    // lookup agendado 300ms atrás para a conversa A (setTimeout em
    // refreshConversationSnapshot) continuaria executando mesmo depois do
    // vendedor já ter trocado para B — aplicando dado de B sob a chave de
    // A. state.conversationKey é sempre a conversa mais recente conhecida
    // por refreshConversationSnapshot (síncrono, atualizado antes de
    // qualquer agendamento).
    if (
      !conversationKey ||
      state.conversationKey !==
        conversationKey
    ) {
      return
    }

    // Se essa conversationKey já foi tentada sem sucesso, só vale reentrar
    // quando o vendedor abriu os dados do contato manualmente depois —
    // nesse caso ainda há uma fonte nova e legítima de telefone a ler.
    // Sem essa exceção, "attempted" travaria essa conversa para sempre.
    if (
      autoLookupAttemptedKeys.has(
        conversationKey,
      ) &&
      !channelAdapter.hasAuthorizedContactDetails()
    ) {
      return
    }

    autoContactLookupInFlight = true

    state = {
      ...state,
      autoLookupStatus: 'Identificando contato...',
    }

    renderPanel()

    try {
      // Evidência de contato pelo ChannelAdapter (identity bridge, JID
      // passivo, título, dados do contato já abertos). A política de
      // tentativa é do Core: o adapter só avisa quando a tentativa é
      // consumida/liberada.
      const evidence =
        await channelAdapter.acquireContactEvidence({
          conversationKey,
          lookupTitle,
          contactDetailsTimeoutMs:
            AUTO_CONTACT_LOOKUP_TIMEOUT_MS,
          isCurrentConversation: (key) =>
            state.conversationKey === key,
          getKnownConversationTitle: () =>
            state.conversationTitle,
          onLookupAttemptConsumed: () => {
            autoLookupAttemptedKeys.add(
              conversationKey,
            )
          },
          onLookupAttemptReleased: () => {
            autoLookupAttemptedKeys.delete(
              conversationKey,
            )
          },
        })

      if (evidence.outcome === 'stale') {
        // A resposta descreve outra instância da conversa (troca real ou
        // homônimo): nada é aplicado; a conversa REALMENTE atual segue
        // livre para a própria tentativa.
        return
      }

      if (evidence.outcome === 'group') {
        state = {
          ...state,
          conversationPhone: null,
          phoneSource: null,
          autoLookupStatus: null,
          isGroupConversation: true,
        }

        // Uma classificação forte de grupo é também uma fronteira
        // comercial: nenhum contexto seller-facing que tenha sido
        // construído enquanto a conversa parecia 1:1 pode permanecer.
        hardResetConversationWorkspace()
        return
      }

      if (evidence.outcome === 'phone') {
        state = {
          ...state,
          conversationPhone: evidence.phone,
          phoneSource: evidence.source,
          autoLookupStatus: null,
        }

        renderPanel()

        if (state.connected) {
          lastResolvedConversationKey =
            conversationKey
          lastResolvedContactLookupIdentity =
            evidence.lookupIdentity

          resolveCurrentLead()
        }

        return
      }

      const lookupStatusByOutcome = {
        phone_unavailable:
          `Telefone ainda não disponível para identificação automática. A Yolen não altera a navegação do ${platformDisplayName} para buscar esse dado.`,
        contact_details_close_failed:
          'Não consegui fechar os dados do contato automaticamente.',
        contact_details_phone_missing:
          'Telefone não apareceu nos dados do contato. A consulta não foi feita.',
      }

      state = {
        ...state,
        autoLookupStatus:
          lookupStatusByOutcome[evidence.outcome] ||
          lookupStatusByOutcome.phone_unavailable,
      }

      renderPanel()
    } finally {
      autoContactLookupInFlight = false

      if (
        autoContactLookupConversationRefreshPending
      ) {
        autoContactLookupConversationRefreshPending =
          false
        processObservedChannelChange()
      }
    }
  }

  // Fronteira única entre conversas (regra de produto: troca de conversa
  // no WhatsApp invalida IMEDIATAMENTE todo o contexto comercial visível
  // da conversa anterior — nenhum dado de A pode sobreviver, nem durante
  // o loading de B). Chamado pelo chamador DEPOIS de `state` já refletir
  // a identidade da conversa NOVA (conversationKey/título/telefone/
  // isGroupConversation/isSelfConversation) — é essa ordem que garante
  // que o renderPanel() forçado abaixo já calcule o HTML da conversa
  // nova, nunca da antiga.
  //
  // Preservação de foco/scroll/regionActionLock/pendingRegionHtml/drafts
  // só vale DENTRO da mesma conversationKey. Numa troca real, nenhum
  // desses mecanismos de estabilidade pode impedir o reset: por isso o
  // renderPanel() aqui roda com forcingConversationBoundaryRender=true,
  // que faz renderPanelRegion() ignorar isRegionInteractionActive() (lock
  // OU foco em campo editável) e substituir o DOM de toda região na
  // hora — nunca adiar para panelRegionPendingHtml esperando uma
  // interação da conversa que já não existe mais.
  function hardResetConversationWorkspace() {
    channelAdapter.resetCapturedAudio()
    messageController.clear()
    clearAutomaticAnalysisTimer()
    clearDeepAnalysisPollTimer()
    clearAnalysisWatchdogTimer()
    analysisController.activeAnalysisAttempt = null
    clearCompanionClientContextRefreshTimer()

    conversationBoundary.advanceBoundary({
      conversationKey:
        state.conversationKey,
      companyId:
        state.companyId,
    })

    workspaceState.resetActiveArea()

    // Limpa o lock de ação de região (não pode proteger DOM de uma
    // conversa que já não existe mais), o cache de HTML por região
    // (força todas a recalcular no próximo renderPanel()), qualquer
    // render que tivesse ficado retido esperando uma interação do lead
    // anterior, e o estado dos accordions da Inteligência Comercial.
    clearPanelRegionActionLocks()
    panelRegionHtmlCache.clear()
    panelRegionPendingHtml.clear()
    controlledOpenClientIntelligenceGroups.clear()

    const panel =
      document.getElementById(PANEL_ID)

    const scrollContainer =
      getWorkspaceScrollContainer(panel)

    if (scrollContainer) {
      scrollContainer.scrollTop = 0
    }

    lastSelectedChatActivitySnapshot =
      getSelectedChatActivitySnapshot()

    state = {
      ...state,
      leadResolutionLoading: false,
      leadResolution: null,
      leadResolutionViewModel: null,
      leadResolutionOutcome: null,
      leadResolutionBoundaryToken: null,
      leadResolutionError: null,
      leadCreationStatus: null,
      leadCreationConversationKey: null,
      leadCreationError: null,
      companionClientContext: {
        status: 'idle',
      },
      companionClientContextCycleId: null,
      companionClientContextConversationKey: null,
      agoraDecisionState: {
        status: 'idle',
      },
      agoraDecisionStateCycleId: null,
      agoraDecisionStateConversationKey: null,
      agoraDecisionStateCompanyId: null,
      analysisViewModel: {
        status: 'idle',
      },
      analysisViewModelCycleId: null,
      analysisViewModelConversationKey: null,
      analysisViewModelCompanyId: null,
      customerViewModel: {
        status: 'idle',
      },
      customerViewModelCycleId: null,
      customerViewModelConversationKey: null,
      customerViewModelCompanyId: null,
      companionLeadSummary: {
        status: 'idle',
      },
      companionLeadSummaryCycleId: null,
      companionLeadSummaryConversationKey: null,
      companionLeadSummarySaveStatus: null,
      companionLeadSummarySaveError: null,
      companionLeadSummaryDraftValue: null,
      autoLookupStatus: null,
      conversationAnalysisLoading: false,
      conversationAnalysis: null,
      conversationAnalysisError: null,
      analyzedConversationFingerprint: null,
      automaticAnalysisStatus: null,
      deepAnalysisStatus: null,
      deepAnalysisResult: null,
      lastKnownCommercialReading: null,
      lastKnownCommercialReadingContext: null,
      suggestionApplyLoading: false,
      suggestionApplyResult: null,
      suggestionApplyError: null,
      suggestedMessageCopyStatus: null,
      suggestedMessageLastRegisteredKey: null,
      pendingSuggestedMessageSend: null,
      pendingSuggestedMessageSendRegistering: false,
      lastAnalysisAudioCount: 0,
      audioTranscriptionLoading: false,
      audioTranscriptionStatus: null,
      capturedAudioBlobCount: 0,
      audioTranscriptionHistoryLoading: false,
      audioTranscriptionHistoryCycleId: null,
      preSendAssessment: null,
      preSendAssessmentConversationKey: null,
      preSendAssessmentFingerprint: null,
      preSendDraft: '',
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    // Não basta zerar `state` e confiar que um renderPanel() futuro vai
    // aplicar o resultado — o próprio renderer pode decidir preservar o
    // DOM antigo (lock, foco, pending html). A fronteira precisa GARANTIR
    // que nenhum DOM seller-facing da conversa anterior sobreviva: força
    // um render imediato, ignorando toda proteção de estabilidade.
    forcingConversationBoundaryRender = true

    try {
      renderPanel()
    } finally {
      forcingConversationBoundaryRender = false
    }
  }

  // Revalidação via bridge para o caso ambíguo (identidade forte ausente
  // no DOM, mas ainda sem prova de troca real): dispara UM pedido ao
  // identity bridge para decidir a favor de "ainda é a mesma classificação
  // guardada" ou "não é mais" — nunca decide isso só pela ausência de
  // data-id/avatar no DOM (ver isBridgeConfirmedGroupContextAmbiguous() e
  // isBridgeResolvedContactContextAmbiguous()). Atende os dois contextos
  // guardados (grupo confirmado E contato resolvido) porque só existe UMA
  // conversa visível por vez neste content script — nunca há ambiguidade
  // de grupo e de contato para chaves diferentes disputando o mesmo
  // pedido. Debounce (300ms) + cooldown (1s) evitam storm de pedidos
  // enquanto a conversa permanece ambígua através de várias mutations
  // seguidas.
  let bridgeIdentityRevalidationPending = false
  let lastBridgeIdentityRevalidationAt = 0
  const BRIDGE_IDENTITY_REVALIDATION_COOLDOWN_MS = 1000

  function scheduleBridgeIdentityRevalidation(
    conversationKey,
    title,
  ) {
    if (
      !state.connected ||
      !conversationKey ||
      bridgeIdentityRevalidationPending ||
      Date.now() -
        lastBridgeIdentityRevalidationAt <
        BRIDGE_IDENTITY_REVALIDATION_COOLDOWN_MS
    ) {
      return
    }

    bridgeIdentityRevalidationPending = true

    window.setTimeout(() => {
      void runBridgeIdentityRevalidation(
        conversationKey,
        title,
      )
    }, 300)
  }

  async function runBridgeIdentityRevalidation(
    conversationKey,
    title,
  ) {
    lastBridgeIdentityRevalidationAt = Date.now()

    try {
      const revalidation =
        await channelAdapter.revalidateConversationIdentity({
          conversationKey,
          title,
          isCurrentConversation: (key) =>
            state.conversationKey === key,
        })

      if (
        revalidation.outcome === 'group' &&
        revalidation.contactReplacedByGroup
      ) {
        // Havia um contato resolvido para esta MESMA chave e o canal
        // provou que, na verdade, é um grupo — fronteira comercial real:
        // nada do contato anterior pode sobreviver.
        lastResolvedConversationKey = null
        autoLookupAttemptedKeys.delete(
          conversationKey,
        )
        hardResetConversationWorkspace()
        refreshConversationSnapshot()
        return
      }

      if (revalidation.outcome === 'resolved') {
        autoLookupAttemptedKeys.delete(
          conversationKey,
        )

        if (revalidation.identityChanged) {
          // Nenhum dado comercial (leadResolution, resumo, etc.) do
          // grupo/contato anterior sob esta chave pode sobreviver a uma
          // fronteira provada — mesmo com a conversationKey inalterada.
          lastResolvedConversationKey = null
          hardResetConversationWorkspace()
        }

        refreshConversationSnapshot()
      }

      // stale/unavailable: inconclusivo — permanece fail-closed; uma
      // mudança futura (depois do cooldown) tenta revalidar de novo.
    } finally {
      bridgeIdentityRevalidationPending = false
    }
  }

  function refreshConversationSnapshot() {
    // Conversa aberta + evidência de telefone atual (ChannelAdapter). O
    // adapter já descartou evidência de outra instância estrutural da
    // conversa (homônimo/troca) e informa o que mudou; fronteira, reset e
    // resolução são decididos aqui.
    const snapshot =
      channelAdapter.readConversationSnapshot()

    const {
      conversationTitle,
      conversationKey,
      isSelfConversation,
      isGroupConversation,
      contactLookupIdentity,
    } = snapshot

    const phoneResult = {
      phone: snapshot.phone,
      source: snapshot.phoneSource,
    }

    const contactEvidenceStale =
      snapshot.contactEvidenceStale

    // Só o canal pode desambiguar uma classificação de grupo que ficou
    // ambígua: agenda a revalidação (com cooldown).
    if (snapshot.needsIdentityRevalidation) {
      scheduleBridgeIdentityRevalidation(
        conversationKey,
        conversationTitle,
      )
    }

    // Evidência de contato/grupo que deixou de valer para a conversa
    // atual devolve a ela um novo ciclo de tentativa automática.
    if (
      (contactEvidenceStale ||
        snapshot.groupEvidenceDropped) &&
      conversationKey
    ) {
      autoLookupAttemptedKeys.delete(
        conversationKey,
      )
    }

    const previousContactLookupIdentity =
      state.contactLookupIdentity

    const contactLookupChanged =
      previousContactLookupIdentity !==
      contactLookupIdentity

    const previousConversationKey =
      state.conversationKey

    const conversationChanged =
      previousConversationKey !==
      conversationKey

      if (contactLookupChanged) {
        lastResolvedContactLookupIdentity =
          null
      }

      // Evidência de contato stale entra na mesma fronteira que uma troca
      // real de conversationKey: a instância da conversa mudou desde que
      // aquele telefone foi obtido, mesmo com a chave textual igual
      // (homônimo) — nenhum estado de tentativa/ledger da associação
      // antiga pode sobreviver.
      if (
        conversationChanged ||
        contactEvidenceStale
      ) {
        rememberCurrentPreResolutionCapture()

        lastResolvedConversationKey = null

        // conversationKey (não contactLookupIdentity, que é só o nome
        // normalizado e colide entre contatos homônimos) é a identidade
        // única de tentativa: entrar numa conversa dá a ela um novo ciclo
        // de resolução automática, mesmo que outra conversa com o mesmo
        // nome já tenha sido tentada antes.
        if (conversationKey) {
          autoLookupAttemptedKeys.delete(
            conversationKey,
          )
        }

        resetConversationMessageLedger(
          conversationKey,
        )
      }

    // A identidade da conversa NOVA precisa estar em `state` ANTES de
    // qualquer hardResetConversationWorkspace() abaixo — é o renderPanel()
    // forçado dentro dela que decide o HTML de cada região, e ele lê
    // state.conversationKey/isGroupConversation/isSelfConversation
    // diretamente. Chamar a fronteira antes desta atribuição faria o
    // render forçado ainda enxergar a conversa ANTERIOR.
    state = {
      ...state,
      conversationTitle,
      conversationKey,
      conversationPhone:
        phoneResult.phone,
      phoneSource:
        phoneResult.source,
      contactLookupIdentity,
      isSelfConversation,
      isGroupConversation,
    }

    if (
      conversationChanged ||
      contactEvidenceStale
    ) {
      hardResetConversationWorkspace()
    }

    const messageMutationDetected =
      synchronizeConversationMessageLedger()

    rememberCurrentPreResolutionCapture()

    state = {
      ...state,
      messageCount:
        getVisibleMessagesCount(),
      audioCount:
        getVisibleAudioCount(),
    }

    if (isSelfConversation) {
      lastResolvedConversationKey = null
      lastResolvedContactLookupIdentity =
        null
      hardResetConversationWorkspace()
      return messageMutationDetected
    }

    if (isGroupConversation) {
      lastResolvedConversationKey = null
      lastResolvedContactLookupIdentity =
        null
      hardResetConversationWorkspace()
      return messageMutationDetected
    }

    renderPanel()

    if (
      state.connected &&
      phoneResult.phone &&
      conversationKey &&
      lastResolvedConversationKey !==
        conversationKey
    ) {
      lastResolvedConversationKey =
        conversationKey
      lastResolvedContactLookupIdentity =
        contactLookupIdentity

      resolveCurrentLead()
      return messageMutationDetected
    }

    if (
      state.connected &&
      !phoneResult.phone &&
      conversationKey &&
      // Uma conversationKey já tentada não reagenda a cada mutation (o
      // WhatsApp gera muitas) — mas isso não pode travar para sempre: se
      // o vendedor abriu o painel de contato manualmente depois do
      // fail-closed, há uma fonte nova e legítima de telefone a ler.
      (!autoLookupAttemptedKeys.has(
        conversationKey,
      ) ||
        channelAdapter.hasOpenContactDetails())
    ) {
      window.setTimeout(() => {
        runAutomaticContactLookup(
          conversationKey,
        )
      }, 300)
    }

    return messageMutationDetected
  }

  function processObservedChannelChange() {
    const messageMutationDetected =
      refreshConversationSnapshot()

    checkPendingSuggestedMessageSentFromConversation()

    if (messageMutationDetected) {
      scheduleCaptureIngestion(0)

      scheduleAutomaticAnalysis(
        'Mensagem editada ou apagada detectada. A Yolen atualizará a análise em 8 segundos.',
      )

      return
    }

    scheduleCaptureIngestion()

    scheduleAutomaticAnalysis(
      'Nova mensagem detectada. A Yolen aguardará 8 segundos antes de atualizar a análise.',
    )
  }

  function getConnectionLabel() {
    if (state.loading) {
      return 'Conectando com a Yolen...'
    }

    if (state.connected) {
      return 'Yolen conectada'
    }

    return 'Yolen não conectada'
  }

  function getConnectionClass() {
    if (state.loading) {
      return 'yolen-status-neutral'
    }

    if (state.connected) {
      return 'yolen-status-success'
    }

    return 'yolen-status-warning'
  }

  function getConnectionDescription() {
    if (state.connected) {
      const syncedAt = state.lastSessionSyncAt
        ? ` · Sincronizado: ${state.lastSessionSyncAt}`
        : ''

      return `Usuário: ${escapeHtml(state.userName || 'Sem nome')} · Perfil: ${escapeHtml(
        state.companyRole || '-',
      )}${syncedAt}`
    }

    return escapeHtml(
      state.lastError || 'Clique em Conectar Yolen para iniciar o Companion.',
    )
  }

  // Fonte única dos escalares de resolução (cycle id / status) para
  // consumidores que só precisam deles: o DomainResolutionViewModel da
  // boundary atual, nunca o payload raw. `undefined` quando ausente, como
  // a leitura raw equivalente.
  function getCanonicalResolutionCycleId() {
    return (
      state
        .leadResolutionViewModel
        ?.cycle
        ?.id ?? undefined
    )
  }

  function getCanonicalResolutionStatus() {
    return (
      state
        .leadResolutionViewModel
        ?.status ?? undefined
    )
  }

  function getLeadStatusClass() {
    const status =
      state
        .leadResolutionViewModel
        ?.status

    if (status === 'OWNED_BY_ME') {
      return 'yolen-status-success'
    }

    if (
      status === 'NOT_FOUND' ||
      status === 'NO_PHONE_DETECTED'
    ) {
      return 'yolen-status-warning'
    }

    return 'yolen-status-neutral'
  }

  function getLeadStatusTitle() {
    if (state.isSelfConversation) {
      return 'Conversa do próprio usuário'
    }

    if (state.isGroupConversation) {
      return 'Conversa em grupo'
    }

    if (state.leadResolutionLoading) {
      return 'Localizando lead...'
    }

    if (state.leadResolutionError) {
      return 'Erro ao localizar lead'
    }

    if (!state.connected) {
      return 'Lead não consultado'
    }

    if (!state.conversationPhone) {
      return 'Telefone não detectado'
    }

    return (
      state
        .leadResolutionViewModel
        ?.user_message ||
      'Lead ainda não consultado'
    )
  }

  function getLeadStatusDescription() {
    if (state.isSelfConversation) {
      return 'O Companion não vincula conversa com você mesmo a um lead comercial.'
    }

    if (state.isGroupConversation) {
      return 'Grupos não são vinculados a leads. O Companion não abrirá os participantes nem procurará telefone.'
    }

    if (state.leadResolutionLoading) {
      return 'A Yolen está verificando esse telefone apenas na empresa ativa.'
    }

    if (state.leadResolutionError) {
      return escapeHtml(state.leadResolutionError)
    }

    if (!state.connected) {
      return 'Conecte a Yolen para consultar o vínculo comercial.'
    }

    if (!state.conversationPhone) {
      return escapeHtml(
        state.autoLookupStatus ||
          'O Companion tentará abrir os dados do contato automaticamente para localizar o telefone.',
      )
    }

    const resolution =
      state.leadResolutionViewModel

    if (!resolution) {
      return 'Clique em Atualizar leitura para consultar esse telefone.'
    }

    const details = []

    if (resolution.lead_display?.name) {
      details.push(
        `Lead: ${resolution.lead_display.name}`,
      )
    }

    if (resolution.cycle?.status) {
      details.push(
        `Etapa atual: ${getStageLabel(
          resolution.cycle.status,
        )}`,
      )
    }

    if (
      resolution
        .ownership_display
        ?.owner_name
    ) {
      details.push(
        `Responsável: ${
          resolution
            .ownership_display
            .owner_name
        }`,
      )
    }

    return escapeHtml(
      details.join(' · ') ||
        resolution.user_message,
    )
  }

  function openYolen(path) {
    const baseUrl =
      window.YolenCompanionApi?.getBaseUrl?.() ||
      'https://cockpit-comercial-vocn.vercel.app'

    window.open(`${baseUrl}${path}`, '_blank', 'noopener,noreferrer')
  }

  function getPrimaryButtonLabel() {
    return state.connected ? 'Abrir Yolen' : 'Conectar Yolen'
  }

  function getPrimaryButtonAction() {
    return state.connected ? 'open-yolen' : 'connect-yolen'
  }

  function getStageLabel(status) {
    const labels = {
      novo: 'Novo',
      contato: 'Contato',
      respondeu: 'Agenda',
      negociacao: 'Negociação',
      pausado: 'Pausado',
      ganho: 'Ganho',
      perdido: 'Perdido',
      cancelado: 'Cancelado',
    }

    return labels[status] || status || '-'
  }

  function isOpenSuggestionStatus(status) {
    return ['novo', 'contato', 'respondeu', 'negociacao', 'pausado'].includes(status)
  }

  function hasAudioWithoutTranscriptionForAnalysis() {
    return Boolean(state.conversationAnalysis) && Number(state.lastAnalysisAudioCount || 0) > 0
  }

  function isStatefulConversationAnalysis() {
    return (
      state
        .conversationAnalysis
        ?.engine_source ===
      'stateful'
    )
  }

  function extractStatefulCommercialReading(
    analysis,
  ) {
    const reading =
      analysis
        ?.commercial_reading

    if (
      analysis?.engine_source !==
        'stateful' ||
      !reading ||
      typeof reading !==
        'object' ||
      Array.isArray(reading)
    ) {
      return null
    }

    return reading
  }

  function getActiveCommercialReading() {
    return extractStatefulCommercialReading(
      state
        .conversationAnalysis,
    )
  }

  // B4_PRE_SEND_EVALUATOR_START
  function evaluatePreSendAssessment(input) {
    const reading =
      input?.commercialReading

    const draft =
      String(
        input?.draft || '',
      )
        .replace(/\s+/g, ' ')
        .trim()

    if (
      input?.engineSource !==
        'stateful' ||
      !reading ||
      typeof reading !==
        'object' ||
      Array.isArray(reading) ||
      input?.analysisLoading ===
        true ||
      input?.analysisOutdated ===
        true ||
      reading.analysis_status !==
        'complete' ||
      reading.commercial_role !==
        'buyer' ||
      (
        reading.commercial_relevance &&
        reading.commercial_relevance !==
          'commercial'
      ) ||
      !reading.best_approach ||
      !reading.customer ||
      !reading.method ||
      !reading.communication ||
      !reading.operations ||
      !draft
    ) {
      return null
    }

    const normalizeText = (
      value,
    ) => {
      return String(value || '')
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          '',
        )
        .toLocaleLowerCase(
          'pt-BR',
        )
        .replace(
          /[^a-z0-9%$]+/g,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim()
    }

    const normalizedDraft =
      normalizeText(draft)

    if (
      !normalizedDraft ||
      !/[a-z0-9]/.test(
        normalizedDraft,
      )
    ) {
      return null
    }

    const lowSignalPatterns = [
      /^(oi|ola|opa|hello|hey)$/,
      /^(bom dia|boa tarde|boa noite)$/,
      /^(obrigado|obrigada|muito obrigado|muito obrigada|valeu|agradeco)$/,
      /^(ok|okay|certo|perfeito|combinado|entendi|beleza|show|sim|nao|tudo bem)$/,
    ]

    if (
      lowSignalPatterns.some(
        (pattern) =>
          pattern.test(
            normalizedDraft,
          ),
      )
    ) {
      return null
    }

    const stopWords =
      new Set([
        'para',
        'com',
        'uma',
        'que',
        'isso',
        'essa',
        'esse',
        'por',
        'dos',
        'das',
        'seu',
        'sua',
        'vou',
        'voce',
      ])

    const getMeaningfulTokens = (
      value,
    ) => {
      return Array.from(
        new Set(
          normalizeText(value)
            .split(' ')
            .filter(
              (token) =>
                token.length >= 3 &&
                !stopWords.has(
                  token,
                ),
            ),
        ),
      )
    }

    const isEquivalentToSuggestion = (
      draftValue,
      suggestionValue,
    ) => {
      const normalizedSuggestion =
        normalizeText(
          suggestionValue,
        )

      if (
        !normalizedSuggestion
      ) {
        return false
      }

      if (
        normalizedDraft ===
        normalizedSuggestion
      ) {
        return true
      }

      if (
        normalizedDraft.length >=
          24 &&
        normalizedSuggestion
          .includes(
            normalizedDraft,
          )
      ) {
        return true
      }

      if (
        normalizedSuggestion
          .length >= 24 &&
        normalizedDraft.includes(
          normalizedSuggestion,
        )
      ) {
        return true
      }

      const draftTokens =
        getMeaningfulTokens(
          draftValue,
        )

      const suggestionTokens =
        getMeaningfulTokens(
          suggestionValue,
        )

      if (
        draftTokens.length < 4 ||
        suggestionTokens.length <
          4
      ) {
        return false
      }

      const suggestionSet =
        new Set(
          suggestionTokens,
        )

      const intersection =
        draftTokens.filter(
          (token) =>
            suggestionSet.has(
              token,
            ),
        ).length

      const coverage =
        intersection /
        Math.min(
          draftTokens.length,
          suggestionTokens.length,
        )

      const lengthRatio =
        Math.max(
          normalizedDraft.length,
          normalizedSuggestion
            .length,
        ) /
        Math.max(
          1,
          Math.min(
            normalizedDraft.length,
            normalizedSuggestion
              .length,
          ),
        )

      return (
        coverage >= 0.9 &&
        lengthRatio <= 1.35
      )
    }

    if (
      isEquivalentToSuggestion(
        draft,
        input
          ?.suggestedMessage,
      )
    ) {
      return null
    }

    const matchesAny = (
      patterns,
    ) => {
      return patterns.some(
        (pattern) =>
          pattern.test(
            normalizedDraft,
          ),
      )
    }

    const closePressurePatterns = [
      /\b(vamos|podemos)\s+fechar\b/,
      /\b(fecha|fechamos|fechar)\s+(agora|hoje)\b/,
      /\bme\s+confirma\s+(agora|hoje)\b/,
      /\bconfirma\s+(agora|hoje)\b/,
      /\bfaz\s+o\s+pix\s+(agora|hoje)\b/,
      /\bpode\s+pagar\s+(agora|hoje)\b/,
      /\b(assina|assinar)\s+(agora|hoje)\b/,
      /\bgarantir\s+(sua|a)\s+vaga\s+(agora|hoje)\b/,
    ]

    const collectionPressurePatterns = [
      /\bpreciso\s+(da|de uma)\s+(sua\s+)?resposta\s+hoje\b/,
      /\bme\s+responde\s+(agora|hoje)\b/,
      /\bestou\s+aguardando\s+(sua\s+)?resposta\b/,
      /\bvai\s+fechar\s+ou\s+nao\b/,
    ]

    const explicitClosePressure =
      matchesAny(
        closePressurePatterns,
      )

    const explicitPressure =
      explicitClosePressure ||
      matchesAny(
        collectionPressurePatterns,
      )

    const shorten = (
      value,
      maximum = 180,
    ) => {
      const clean =
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim()

      if (
        clean.length <= maximum
      ) {
        return clean
      }

      return (
        clean.slice(
          0,
          maximum - 1,
        ) + '…'
      )
    }

    const decision =
      reading
        .best_approach
        ?.decision

    if (
      [
        'wait',
        'give_space',
        'no_intervention',
      ].includes(decision) &&
      explicitPressure
    ) {
      const labels = {
        wait: 'aguardar',
        give_space:
          'dar espaço ao cliente',
        no_intervention:
          'não intervir agora',
      }

      const approachReason =
        shorten(
          reading
            .best_approach
            ?.reason,
        )

      return {
        kind:
          'wait_pressure',
        reason:
          approachReason
            ? (
                'A leitura atual recomenda ' +
                labels[decision] +
                ': ' +
                approachReason +
                ' Esta mensagem parece pressionar por avanço ou resposta.'
              )
            : (
                'A leitura atual recomenda ' +
                labels[decision] +
                '. Esta mensagem parece pressionar por avanço ou resposta.'
              ),
      }
    }

    const sensitiveConditionPatterns = [
      /\b[0-9]+\s*%\s*(de\s+)?desconto\b/,
      /\b(te\s+dou|dou|consigo|libero|posso\s+fazer)\b.*\bdesconto\b/,
      /\b(faco|fecho)\s+por\s+r?\$?\s*[0-9]/,
      /\bresultado\s+garantido\b/,
      /\bgaranto\s+(o|a|que\s+essa|que\s+esta)?\s*(resultado|aprovacao|condicao|desconto|preco|valor|prazo|beneficio)\b/,
      /\bvai\s+ser\s+aprovad(a|o)\b/,
      /\bsera\s+aprovad(a|o)\b/,
      /\besta\s+aprovad(a|o)\b/,
      /\bconsigo\s+liberar\s+(essa|esta|a)?\s*(condicao|excecao|desconto)\b/,
      /\b(condicao|desconto|resultado)\s+garantid(a|o)\b/,
    ]

    if (
      matchesAny(
        sensitiveConditionPatterns,
      )
    ) {
      return {
        kind:
          'sensitive_condition',
        reason:
          'A leitura atual não contém comprovação suficiente para validar essa condição. Confirme a informação antes de enviar.',
      }
    }

    const firstSummary = (
      values,
    ) => {
      if (
        !Array.isArray(values)
      ) {
        return null
      }

      for (
        const item of values
      ) {
        const summary =
          typeof item?.summary ===
            'string'
            ? item.summary.trim()
            : ''

        if (summary) {
          return shorten(
            summary,
            150,
          )
        }
      }

      return null
    }

    const pendingIssue =
      firstSummary(
        reading.customer
          ?.open_questions,
      ) ||
      firstSummary(
        reading.customer
          ?.objections,
      ) ||
      firstSummary(
        reading.risks
          ?.customer_objections,
      )

    const pendingIssueDecision =
      [
        'respond',
        'clarify',
        'ask',
        'deepen_discovery',
        'handle_objection',
        'confirm_information',
      ].includes(decision)

    if (
      pendingIssue &&
      pendingIssueDecision &&
      explicitClosePressure
    ) {
      return {
        kind:
          'pending_issue',
        reason:
          'A leitura atual mantém uma questão ou objeção pendente: “' +
          pendingIssue +
          '”. Esta mensagem tenta avançar para fechamento antes de responder esse ponto.',
      }
    }

    const method =
      reading.method

    const incompleteMethodStage =
      method?.configured ===
        true &&
      Array.isArray(
        method.stages,
      )
        ? method.stages.find(
            (stage) =>
              stage?.status ===
                'partial' ||
              stage?.status ===
                'not_started',
          )
        : null

    const methodDecisionSupported =
      [
        'ask',
        'deepen_discovery',
        'clarify',
        'handle_objection',
        'confirm_information',
      ].includes(decision)

    if (
      incompleteMethodStage &&
      methodDecisionSupported &&
      explicitClosePressure
    ) {
      const stageName =
        typeof incompleteMethodStage
          .name === 'string'
          ? shorten(
              incompleteMethodStage
                .name,
              80,
            )
          : ''

      return {
        kind:
          'method_premature_close',
        reason:
          stageName
            ? (
                'O método configurado ainda mantém a etapa “' +
                stageName +
                '” incompleta, e a leitura atual recomenda aprofundar antes de fechar.'
              )
            : (
                'O método configurado ainda possui uma etapa incompleta, e a leitura atual recomenda aprofundar antes de fechar.'
              ),
      }
    }

    const agenda =
      reading.operations?.agenda

    const expectedDateMatch =
      typeof agenda
        ?.expected_next_action_at ===
        'string'
        ? agenda
            .expected_next_action_at
            .match(
              /^\d{4}-\d{2}-\d{2}/,
            )
        : null

    const todayDateKey =
      typeof input
        ?.todayDateKey ===
        'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        input.todayDateKey,
      )
        ? input.todayDateKey
        : null

    const addOneDay = (
      dateKey,
    ) => {
      const date =
        new Date(
          dateKey +
          'T12:00:00Z',
        )

      if (
        !Number.isFinite(
          date.getTime(),
        )
      ) {
        return null
      }

      date.setUTCDate(
        date.getUTCDate() + 1,
      )

      return date
        .toISOString()
        .slice(0, 10)
    }

    const relativeActionPatterns = [
      /\b(?:te|lhe)?\s*(?:chamo|ligo|retorno|mando|envio|procuro|respondo)\s+(hoje|amanha)\b/,
      /\b(?:falo|falamos|conversamos)\s+(hoje|amanha)\b/,
    ]

    let relativeActionDay =
      null

    for (
      const pattern of
        relativeActionPatterns
    ) {
      const match =
        normalizedDraft.match(
          pattern,
        )

      if (match?.[1]) {
        relativeActionDay =
          match[1]
        break
      }
    }

    if (
      agenda
        ?.should_change_agenda ===
        true &&
      expectedDateMatch?.[0] &&
      todayDateKey &&
      relativeActionDay
    ) {
      const intendedDateKey =
        relativeActionDay ===
        'hoje'
          ? todayDateKey
          : addOneDay(
              todayDateKey,
            )

      if (
        intendedDateKey &&
        intendedDateKey !==
          expectedDateMatch[0]
      ) {
        const [
          year,
          month,
          day,
        ] =
          expectedDateMatch[0]
            .split('-')

        return {
          kind:
            'agenda_conflict',
          reason:
            'A leitura atual indica a próxima ação para ' +
            day +
            '/' +
            month +
            '/' +
            year +
            ', mas esta mensagem combina contato em outro dia.',
        }
      }
    }

    return null
  }
  // B4_PRE_SEND_EVALUATOR_END

  function buildCurrentPreSendAssessment(
    draft,
  ) {
    if (
      !state.conversationKey
    ) {
      return null
    }

    const now =
      new Date()

    const todayDateKey = [
      now.getFullYear(),
      String(
        now.getMonth() + 1,
      ).padStart(2, '0'),
      String(
        now.getDate(),
      ).padStart(2, '0'),
    ].join('-')

    return evaluatePreSendAssessment({
      draft,
      engineSource:
        state
          .conversationAnalysis
          ?.engine_source,
      commercialReading:
        getActiveCommercialReading(),
      analysisLoading:
        state
          .conversationAnalysisLoading,
      analysisOutdated:
        isCurrentAnalysisOutdated(),
      suggestedMessage:
        getSuggestedMessage(),
      todayDateKey,
    })
  }

  function updatePreSendAssessmentFromDraft(
    draft,
    options = {},
  ) {
    const normalizedDraft =
      normalizeMessageText(
        draft,
      )

    const assessment =
      buildCurrentPreSendAssessment(
        normalizedDraft,
      )

    const conversationKey =
      state.conversationKey

    const analysisFingerprint =
      state
        .analyzedConversationFingerprint ||
      null

    const unchanged =
      state.preSendDraft ===
        normalizedDraft &&
      state
        .preSendAssessmentConversationKey ===
        conversationKey &&
      state
        .preSendAssessmentFingerprint ===
        analysisFingerprint &&
      state.preSendAssessment
        ?.kind ===
        assessment?.kind &&
      state.preSendAssessment
        ?.reason ===
        assessment?.reason

    if (unchanged) {
      return
    }

    state = {
      ...state,
      preSendAssessment:
        assessment,
      preSendAssessmentConversationKey:
        conversationKey,
      preSendAssessmentFingerprint:
        analysisFingerprint,
      preSendDraft:
        normalizedDraft,
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    if (
      options.render !== false
    ) {
      renderPanel()
    }
  }

  function getPreSendAssessmentCardHtml() {
    const assessment =
      state.preSendAssessment

    if (
      !assessment ||
      !state.conversationKey ||
      state
        .preSendAssessmentConversationKey !==
        state.conversationKey ||
      state
        .preSendAssessmentFingerprint !==
        state
          .analyzedConversationFingerprint ||
      state
        .conversationAnalysisLoading ||
      isCurrentAnalysisOutdated() ||
      getActiveCommercialReading()
        ?.analysis_status !==
        'complete'
    ) {
      return ''
    }

    const currentDraft =
      getComposerText()

    if (
      !currentDraft ||
      normalizeMessageText(
        currentDraft,
      ) !==
        state.preSendDraft
    ) {
      return ''
    }

    return [
      '<div',
        ' class="yolen-card yolen-pre-send-card yolen-status-warning"',
        ' data-yolen-pre-send-kind="' +
          escapeHtml(
            assessment.kind,
          ) +
        '"',
      '>',
        '<div class="yolen-section-label">',
          'Antes de enviar',
        '</div>',

        '<div class="yolen-card-title">',
          'Vale revisar esta mensagem',
        '</div>',

        '<div class="yolen-card-description yolen-pre-send-reason">',
          escapeHtml(
            assessment.reason,
          ),
        '</div>',

        state.preSendGateOpen
          ? getPreSendGateActionsHtml()
          : [
              '<div class="yolen-operational-note">',
                'Se você tentar enviar esta mensagem, a Yolen pedirá sua decisão antes de continuar.',
              '</div>',
            ].join(''),
      '</div>',
    ].join('')
  }

  function observeComposerDraftForPreSend() {
    const observerKey =
      '__yolenCompanionPreSendDraftObserverInstalled'

    if (
      globalThis[observerKey] === true ||
      !hasChannelCapability('canInterceptSend')
    ) {
      return
    }

    globalThis[observerKey] = true

    // Evento de canal (ChannelAdapter): rascunho digitado no campo de
    // mensagem da plataforma.
    channelAdapter.onComposerDraftInput(
      (draftText) => {
        updatePreSendAssessmentFromDraft(
          draftText,
        )
      },
    )
  }

  function normalizeOperationalText(value) {
    if (
      typeof value !==
      'string'
    ) {
      return null
    }

    const clean =
      value.trim()

    return clean || null
  }

  function getOperationalDateKey(value) {
    const clean =
      normalizeOperationalText(
        value,
      )

    if (!clean) {
      return null
    }

    if (
      /^\d{4}-\d{2}-\d{2}$/
        .test(clean)
    ) {
      return clean
    }

    const timestamp =
      Date.parse(clean)

    if (
      !Number.isFinite(
        timestamp,
      )
    ) {
      return clean
    }

    return new Date(
      timestamp,
    )
      .toISOString()
      .slice(0, 10)
  }

  function getLegacySuggestionCommercialRelevance() {
    const tags =
      state
        .conversationAnalysis
        ?.suggestion
        ?.tags

    if (!Array.isArray(tags)) {
      return null
    }

    for (const tag of tags) {
      if (
        typeof tag !== 'string' ||
        !tag.startsWith(
          'commercial_relevance:',
        )
      ) {
        continue
      }

      const relevance =
        tag
          .slice(
            'commercial_relevance:'.length,
          )
          .trim()

      if (
        relevance === 'commercial' ||
        relevance === 'non_commercial' ||
        relevance === 'uncertain'
      ) {
        return relevance
      }
    }

    return null
  }

  function isLegacySuggestionCommerciallyActionable() {
    const relevance =
      getLegacySuggestionCommercialRelevance()

    return (
      relevance === null ||
      relevance === 'commercial'
    )
  }

  function hasOperationalSuggestionChange() {
    if (
      !isLegacySuggestionCommerciallyActionable()
    ) {
      return false
    }

    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const cycle =
      state
        .leadResolution
        ?.cycle

    if (
      !suggestion ||
      !cycle
    ) {
      return false
    }

    const statusChanged =
      Boolean(
        suggestion
          .recommended_status,
      ) &&
      suggestion
        .recommended_status !==
        cycle.status

    const currentNextAction =
      normalizeOperationalText(
        cycle.next_action,
      )

    const suggestedNextAction =
      normalizeOperationalText(
        suggestion.next_action,
      )

    const nextActionChanged =
      currentNextAction !==
      suggestedNextAction

    const nextActionDateChanged =
      getOperationalDateKey(
        cycle.next_action_date,
      ) !==
      getOperationalDateKey(
        suggestion
          .next_action_date,
      )

    return (
      statusChanged ||
      nextActionChanged ||
      nextActionDateChanged
    )
  }

  function hasRichCommercialReadingOperationalChange(
    commercialReading,
  ) {
    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    return (
      crm?.should_change_crm_stage ===
        true ||
      agenda?.should_change_agenda ===
        true
    )
  }

  function isRichCommercialReadingApplyCompatible(
    commercialReading,
  ) {
    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const cycle =
      state
        .leadResolutionViewModel
        ?.cycle

    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    if (
      !suggestion ||
      !cycle ||
      !crm ||
      !agenda ||
      !hasRichCommercialReadingOperationalChange(
        commercialReading,
      )
    ) {
      return false
    }

    if (
      crm
        .requires_human_confirmation !==
        true ||
      agenda
        .requires_human_confirmation !==
        true
    ) {
      return false
    }

    const legacyStatusChanged =
      Boolean(
        suggestion
          .recommended_status,
      ) &&
      suggestion
        .recommended_status !==
        cycle.status

    if (
      crm
        .should_change_crm_stage ===
        true
    ) {
      if (
        !crm.recommended_status ||
        crm.recommended_status !==
          suggestion
            .recommended_status ||
        !legacyStatusChanged
      ) {
        return false
      }
    } else if (
      legacyStatusChanged
    ) {
      return false
    }

    const currentNextAction =
      normalizeOperationalText(
        cycle.next_action,
      )

    const suggestedNextAction =
      normalizeOperationalText(
        suggestion.next_action,
      )

    const currentNextActionDate =
      getOperationalDateKey(
        cycle.next_action_date,
      )

    const suggestedNextActionDate =
      getOperationalDateKey(
        suggestion
          .next_action_date,
      )

    const legacyAgendaChanged =
      currentNextAction !==
        suggestedNextAction ||
      currentNextActionDate !==
        suggestedNextActionDate

    if (
      agenda
        .should_change_agenda ===
        true
    ) {
      const expectedAgendaDate =
        getOperationalDateKey(
          agenda
            .expected_next_action_at,
        )

      if (
        !legacyAgendaChanged ||
        !expectedAgendaDate ||
        suggestedNextActionDate !==
          expectedAgendaDate
      ) {
        return false
      }
    } else if (
      legacyAgendaChanged
    ) {
      return false
    }

    return true
  }

  function hasCurrentOperationalSuggestionChange() {
    const commercialReading =
      getActiveCommercialReading()

    if (commercialReading) {
      return (
        isRichCommercialReadingApplyCompatible(
          commercialReading,
        )
      )
    }

    return (
      hasOperationalSuggestionChange()
    )
  }

  function canApplyCurrentSuggestion() {
    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const hasTrustedAnalysis =
      Boolean(
        state
          .conversationAnalysis
          ?.saved_coaching
          ?.id,
      ) ||
      isStatefulConversationAnalysis()

    return (
      canAnalyzeCurrentConversation() &&
      state
        .leadResolutionViewModel
        ?.capabilities
        ?.can_apply_suggestion ===
        true &&
      hasTrustedAnalysis &&
      Boolean(suggestion) &&
      isOpenSuggestionStatus(
        suggestion
          .recommended_status,
      ) &&
      hasCurrentOperationalSuggestionChange() &&
      !hasAudioWithoutTranscriptionForAnalysis() &&
      !isCurrentAnalysisOutdated() &&
      !state.conversationAnalysisLoading &&
      !state.suggestionApplyLoading &&
      !state.suggestionApplyResult
    )
  }

  function getAnalysisStatusClass() {
    if (
      state.conversationAnalysisError ||
      state.suggestionApplyError ||
      isCurrentAnalysisOutdated()
    ) {
      return 'yolen-status-warning'
    }

    if (state.suggestionApplyResult || state.conversationAnalysis) {
      return 'yolen-status-success'
    }

    return 'yolen-status-neutral'
  }

  function getAnalysisTitle() {
    if (state.suggestionApplyLoading) {
      return 'Aplicando sugestão na Yolen...'
    }

    if (state.suggestionApplyError) {
      return 'Erro ao aplicar sugestão'
    }

    if (state.suggestionApplyResult) {
      return state.suggestionApplyResult.already_applied
        ? 'Sugestão já estava aplicada na Yolen'
        : 'Sugestão aplicada na Yolen'
    }

    if (state.conversationAnalysisLoading) {
      return 'Analisando conversa...'
    }

    if (state.conversationAnalysisError) {
      return 'Erro na análise da IA'
    }

    if (isCurrentAnalysisOutdated()) {
      return 'A conversa mudou após a análise'
    }

    if (state.conversationAnalysis?.suggestion?.summary) {
      return state.conversationAnalysis.suggestion.summary
    }

    if (!canAnalyzeCurrentConversation()) {
      return 'Análise ainda indisponível'
    }

    if (state.automaticAnalysisStatus) {
      return 'Análise automática preparada'
    }

    return 'Conversa pronta para análise'
  }

  function formatSuggestionDate(value) {
    if (!value) {
      return null
    }

    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return value
    }
  }

  // A área ANÁLISE nunca expõe job id, queue, worker, watermark ou
  // candidate version ao vendedor — apenas um rótulo de progresso e,
  // quando concluída e comercialmente relevante, a leitura/mensagem
  // aprofundada em texto simples.
  function isDeepAnalysisCommerciallyActionable() {
    return (
      state.deepAnalysisResult
        ?.commercial_relevance ===
      'commercial'
    )
  }

  function getDeepAnalysisStatusDetails() {
    if (state.deepAnalysisStatus === 'pending') {
      return [
        'Análise aprofundada em andamento',
      ]
    }

    if (state.deepAnalysisStatus === 'failed') {
      return [
        'Falha na análise aprofundada — nova tentativa na próxima leitura',
      ]
    }

    if (state.deepAnalysisStatus === 'succeeded') {
      if (!isDeepAnalysisCommerciallyActionable()) {
        return [
          'Análise aprofundada concluída — nenhuma intervenção comercial necessária',
        ]
      }

      const details = [
        'Análise atualizada com leitura aprofundada',
      ]

      const deepSummary =
        state.deepAnalysisResult
          ?.interpretation
          ?.current_moment
          ?.summary

      if (deepSummary) {
        details.push(
          `Leitura aprofundada: ${deepSummary}`,
        )
      }

      const deepMessage =
        state.deepAnalysisResult
          ?.strategy
          ?.suggested_message

      if (deepMessage) {
        details.push(
          `Mensagem sugerida (aprofundada): ${deepMessage}`,
        )
      }

      return details
    }

    return []
  }

  // Detecta a transição para um resultado novo (succeeded/failed) sem
  // depender de nenhum campo de estado extra do backend: a chave combina o
  // status com o job em voo (analysisJobId), então dois resultados
  // diferentes do mesmo ciclo nunca colidem, e o mesmo resultado
  // re-renderizado (tick periódico, troca de aba) não pulsa de novo.
  function isDeepAnalysisResultFresh() {
    if (
      state.deepAnalysisStatus !==
        'succeeded' &&
      state.deepAnalysisStatus !==
        'failed'
    ) {
      return false
    }

    const key = [
      state.analysisJobId || '',
      state.deepAnalysisStatus,
    ].join(':')

    if (
      key ===
      lastRenderedDeepAnalysisResultKey
    ) {
      return false
    }

    lastRenderedDeepAnalysisResultKey =
      key

    return true
  }

  function getDeepAnalysisStatusBlockHtml() {
    const details =
      getDeepAnalysisStatusDetails()

    if (details.length === 0) {
      return ''
    }

    const fresh =
      isDeepAnalysisResultFresh()

    return `
      <div
        class="yolen-decision-block yolen-deep-analysis-status ${
          fresh
            ? 'yolen-deep-analysis-status--fresh'
            : ''
        }"
        data-yolen-layer="context"
      >
        <div class="yolen-decision-kicker">
          Análise aprofundada
          ${
            fresh
              ? '<span class="yolen-deep-analysis-fresh-badge">Nova</span>'
              : ''
          }
        </div>

        <div class="yolen-decision-copy">
          ${
            state.deepAnalysisStatus === 'pending'
              ? getInlineSpinnerHtml()
              : ''
          }${escapeHtml(details.join(' · '))}
        </div>
      </div>
    `
  }

  function getAnalysisDescription() {
    if (state.suggestionApplyLoading) {
      return 'A Yolen está atualizando o ciclo, registrando evento e preservando o histórico.'
    }

    if (state.suggestionApplyError) {
      return escapeHtml(state.suggestionApplyError)
    }

    if (isCurrentAnalysisOutdated()) {
      return (
        'Foram detectadas novas mensagens ou transcrições depois da última análise. ' +
        'A sugestão anterior foi bloqueada. Analise a conversa novamente antes de aplicar uma etapa ou usar a mensagem sugerida.'
      )
    }

    if (state.suggestionApplyResult) {
      const result = state.suggestionApplyResult
      const details = []

      details.push(
        result.already_applied
          ? `Etapa já aplicada: ${getStageLabel(result.status)}`
          : `Etapa aplicada: ${getStageLabel(result.status)}`,
      )

      if (result.previous_status) {
        details.push(`Etapa anterior: ${getStageLabel(result.previous_status)}`)
      }

      if (result.next_action) {
        details.push(`Próxima ação: ${result.next_action}`)
      }

      if (result.next_action_date) {
        details.push(`Data: ${formatSuggestionDate(result.next_action_date)}`)
      }

      details.push(
        result.already_applied
          ? 'Nenhum evento duplicado foi criado'
          : 'Evento registrado no histórico',
      )

      return escapeHtml(details.join(' · '))
    }

    if (state.conversationAnalysisLoading) {
      return 'A Yolen está lendo as mensagens visíveis e calculando a melhor atualização comercial.'
    }

    if (state.conversationAnalysisError) {
      return escapeHtml(state.conversationAnalysisError)
    }

    const suggestion = state.conversationAnalysis?.suggestion

    if (suggestion) {
      const details = []
      const savedCoaching = state.conversationAnalysis?.saved_coaching

      if (state.automaticAnalysisStatus) {
        details.push(
          state.automaticAnalysisStatus,
        )
      }

      details.push(`Etapa sugerida: ${getStageLabel(suggestion.recommended_status)}`)

      if (typeof suggestion.confidence === 'number') {
        details.push(`Confiança: ${Math.round(suggestion.confidence * 100)}%`)
      }

      if (suggestion.next_action) {
        details.push(`Próxima ação: ${suggestion.next_action}`)
      }

      if (suggestion.next_action_date) {
        details.push(`Data: ${formatSuggestionDate(suggestion.next_action_date)}`)
      }

      if (suggestion.result_detail) {
        details.push(`Detalhe: ${suggestion.result_detail}`)
      }

      if (savedCoaching?.id) {
        details.push(
          savedCoaching.reused
            ? 'Histórico: já salvo na Yolen'
            : 'Histórico: salvo na Yolen',
        )

        if (savedCoaching.incremental) {
          details.push('Escopo: apenas mensagens novas')
        } else {
          details.push('Escopo: conversa visível')
        }
      }

      if (hasAudioWithoutTranscriptionForAnalysis()) {
        details.push(`Áudio sem transcrição: ${state.lastAnalysisAudioCount} detectado(s)`)
        details.push('Aplicação bloqueada até transcrever áudio')
      }

      if (!isOpenSuggestionStatus(suggestion.recommended_status)) {
        details.push('Aplicação automática bloqueada nesta fase')
      }

      if (state.suggestedMessageCopyStatus) {
        details.push(state.suggestedMessageCopyStatus)
      }

      return escapeHtml(details.join(' · '))
    }

    if (!canAnalyzeCurrentConversation()) {
      return 'A análise só é liberada quando o lead está localizado e a regra de carteira permite leitura.'
    }

    if (state.automaticAnalysisStatus) {
      return escapeHtml(
        state.automaticAnalysisStatus,
      )
    }

    return 'A Yolen analisará automaticamente depois que a conversa permanecer alguns segundos sem novas mensagens. O botão também permite iniciar a leitura imediatamente.'
  }

  function getSuggestedMessage() {
    const commercialReading =
      getActiveCommercialReading()

    if (commercialReading) {
      const communication =
        commercialReading
          .communication

      if (
        communication
          ?.intervention_needed !==
        true
      ) {
        return null
      }

      const message =
        communication
          ?.recommended_message

      return (
        typeof message ===
          'string' &&
        message.trim()
          ? message.trim()
          : null
      )
    }

    if (
      !isLegacySuggestionCommerciallyActionable()
    ) {
      return null
    }

    const message =
      state
        .conversationAnalysis
        ?.coaching
        ?.suggested_message

    return (
      typeof message ===
        'string' &&
      message.trim()
        ? message.trim()
        : null
    )
  }

  function getAudioTranscriptionHtml() {
    const totalAudioCount = Number(state.audioCount || 0)
    const pendingAudioCount = getPendingAudioCountForCurrentConversation()
    const transcribedAudioCount = Math.max(
      0,
      totalAudioCount - pendingAudioCount,
    )
    const details = []

    if (state.audioTranscriptionStatus) {
      details.push(escapeHtml(state.audioTranscriptionStatus))
    }

    if (totalAudioCount > 0) {
      if (pendingAudioCount === 0) {
        details.push(
          `Todos os ${totalAudioCount} áudio(s) visível(is) foram transcritos.`,
        )
      } else {
        details.push(
          `${transcribedAudioCount} de ${totalAudioCount} áudio(s) transcrito(s).`,
        )
        details.push(`${pendingAudioCount} áudio(s) pendente(s).`)
      }
    }

    if (details.length === 0) {
      return ''
    }

    return `
      <div class="yolen-card-description">
        <strong>Transcrição de áudio</strong><br>
        ${details.join('<br>')}
      </div>
    `
  }


  function getSuggestedMessageHtml() {
    const message =
      getSuggestedMessage()

    if (
      !message ||
      isCurrentAnalysisOutdated()
    ) {
      return ''
    }

    return `
      <div class="yolen-decision-block yolen-message-suggestion">
        <div class="yolen-decision-kicker">
          Mensagem sugerida
        </div>

        <div class="yolen-suggested-message">
          ${escapeHtml(message)}
        </div>
      </div>
    `
  }

  async function insertSuggestedMessageInChannel() {
    return insertSuggestedMessageInChannelWithOptions()
  }

  async function insertSuggestedMessageInChannelWithOptions(
    options = {},
  ) {
    if (isCurrentAnalysisOutdated()) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'A conversa mudou. Analise novamente antes de inserir a mensagem.',
      }

      renderPanel()
      return
    }

    const message = getSuggestedMessage()

    if (!message) {
      return
    }

    const operationContext =
      captureOperationContext()

    const composerNotFoundCopy =
      `Não encontrei o campo de mensagem do ${platformDisplayName}. Copie e cole manualmente.`

    const composerState =
      hasChannelCapability('canApplyMessage')
        ? channelAdapter.getComposerState()
        : { available: false }

    if (!composerState.available) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          composerNotFoundCopy,
      }

      renderPanel()
      return
    }

    let replaceExisting =
      options.replaceExisting === true

    if (
      composerState.busy &&
      !replaceExisting
    ) {
      const confirmed = window.confirm(
        `O campo do ${platformDisplayName} já tem texto. Substituir pela mensagem sugerida?`,
      )

      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      if (!confirmed) {
        fireCompanionActionTelemetry(
          'suggestion_ignored',
          {
            seed:
              createActionTelemetryInteractionId(),
            metadata: {
              source:
                'insert_confirmation',
            },
          },
        )

        state = {
          ...state,
          suggestedMessageCopyStatus: 'Inserção cancelada',
        }

        renderPanel()
        return
      }

      replaceExisting = true
    }

    const telemetryInteractionId =
      createActionTelemetryInteractionId()

    const pendingSend = {
      cycleId:
        getCanonicalResolutionCycleId() ||
        null,
      coachingNoteId:
        state.conversationAnalysis
          ?.saved_coaching?.id ||
        null,
      conversationKey:
        state.conversationKey,
      telemetryConversationKey:
        getCaptureConversationKey(),
      telemetryInteractionId,
      message,
      operationContext,
    }

    // Escrita + verificação são capacidade técnica do adapter (§7), sempre
    // na conversa em que a operação começou; o Core só traduz o motivo
    // técnico em copy.
    const applyResult =
      await channelAdapter.applyMessage(
        message,
        {
          conversationKey:
            operationContext.conversationKey,
          replaceExisting,
        },
      )

    // Resultado de uma operação cuja conversa/geração/empresa/sessão já
    // não é a atual: nada é registrado nem aplicado ao contexto atual.
    if (!isOperationContextCurrent(operationContext)) {
      return
    }

    if (!applyResult.applied) {
      if (applyResult.reason === 'conversation_changed') {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus:
          applyResult.reason ===
          'composer_not_found'
            ? composerNotFoundCopy
            : applyResult.reason ===
                'composer_not_empty'
              ? `O campo do ${platformDisplayName} já tem texto. Nada foi substituído.`
              : `Não foi possível confirmar a inserção da mensagem no ${platformDisplayName}.`,
      }

      renderPanel()
      return
    }

    fireCompanionActionTelemetry(
      'suggestion_inserted',
      {
        cycleId: pendingSend.cycleId,
        coachingNoteId:
          pendingSend.coachingNoteId,
        conversationKey:
          pendingSend
            .telemetryConversationKey,
        seed: telemetryInteractionId,
        metadata: {
          source: 'insert_button',
        },
      },
    )

    try {
      const registration =
        await registerSuggestedMessageAction(
          'inserted',
          {
            cycleId: pendingSend.cycleId,
            coachingNoteId:
              pendingSend.coachingNoteId,
            message,
          },
        )

      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus: registration.alreadyRegistered
          ? `Mensagem inserida no ${platformDisplayName}. Uso já estava registrado na Yolen. Revise antes de enviar.`
          : registration.registered
            ? `Mensagem inserida no ${platformDisplayName} e registrada na Yolen. Revise antes de enviar.`
            : `Mensagem inserida no campo do ${platformDisplayName}. Revise antes de enviar.`,
        suggestedMessageLastRegisteredKey:
          registration.registrationKey || state.suggestedMessageLastRegisteredKey,
        pendingSuggestedMessageSend:
          pendingSend,
      }

      renderPanel()
    } catch (error) {
      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus:
          error instanceof Error && error.message
            ? `Mensagem inserida, mas não registrada: ${error.message}`
            : 'Mensagem inserida, mas não registrada na Yolen. Revise antes de enviar.',
        pendingSuggestedMessageSend:
          pendingSend,
      }

      renderPanel()
    }
  }


  function getApplySuggestionButtonLabel() {
    const commercialReading =
      getActiveCommercialReading()

    if (!commercialReading) {
      return 'Confirmar atualização na Yolen'
    }

    const crmChange =
      commercialReading
        ?.operations
        ?.crm
        ?.should_change_crm_stage ===
      true

    const agendaChange =
      commercialReading
        ?.operations
        ?.agenda
        ?.should_change_agenda ===
      true

    if (
      crmChange &&
      agendaChange
    ) {
      return 'Confirmar CRM e Agenda'
    }

    if (crmChange) {
      return 'Confirmar atualização do CRM'
    }

    if (agendaChange) {
      return 'Confirmar atualização da Agenda'
    }

    return 'Confirmar atualização na Yolen'
  }

  function getAnalysisActionButton() {
    if (!canAnalyzeCurrentConversation()) {
      return ''
    }

    // O painel nunca pode ficar sem nenhum controle acionável durante o
    // loading — mesmo que o watchdog exista, o vendedor precisa de uma
    // via de recuperação imediata. Clicar aqui chama
    // analyzeCurrentConversation() de novo, que já invalida a tentativa
    // presa sozinho (incrementa conversationAnalysisRequestSequence, o
    // mesmo mecanismo que isAnalysisResponseStillCurrent() usa) — não é
    // necessário nenhum cancelamento explícito à parte.
    if (state.conversationAnalysisLoading) {
      return `
        <div class="yolen-inline-loading-status" role="status" aria-live="polite">
          ${getInlineSpinnerHtml()}
          Analisando…
        </div>

        <button
          class="yolen-secondary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Tentar novamente
        </button>
      `
    }

    const totalAudioCount =
      Number(
        state.audioCount || 0,
      )

    const pendingAudioCount =
      getPendingAudioCountForCurrentConversation()

    const transcribedAudioCount =
      Math.max(
        0,
        totalAudioCount -
          pendingAudioCount,
      )

    const nextAudioNumber =
      Math.min(
        totalAudioCount,
        transcribedAudioCount + 1,
      )

    const transcribeAudioButton =
      pendingAudioCount > 0
        ? `
          <button
            class="yolen-secondary-button"
            type="button"
            data-yolen-action="transcribe-audio"
            ${state.audioTranscriptionLoading ? 'disabled' : ''}
          >
            ${
              state.audioTranscriptionLoading
                ? `Transcrevendo áudio ${nextAudioNumber} de ${totalAudioCount}...`
                : `Transcrever áudio ${nextAudioNumber} de ${totalAudioCount}`
            }
          </button>
        `
        : ''

    if (
      isCurrentAnalysisOutdated()
    ) {
      return `
        ${transcribeAudioButton}

        <button
          class="yolen-primary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Atualizar análise
        </button>
      `
    }

    if (
      !state
        .conversationAnalysis
        ?.suggestion
    ) {
      return `
        ${transcribeAudioButton}

        <button
          class="yolen-primary-button"
          type="button"
          data-yolen-action="analyze-conversation"
        >
          Analisar agora
        </button>
      `
    }

    const messageAvailable =
      Boolean(
        getSuggestedMessage(),
      )

    const applyButton =
      canApplyCurrentSuggestion()
        ? `
          <button
            class="yolen-primary-button"
            type="button"
            data-yolen-action="apply-suggestion"
          >
            ${escapeHtml(
              getApplySuggestionButtonLabel(),
            )}
          </button>
        `
        : ''

    const insertMessageButton =
      messageAvailable
        ? `
          <button
            class="${applyButton ? 'yolen-secondary-button' : 'yolen-primary-button'}"
            type="button"
            data-yolen-action="insert-suggested-message"
          >
            Inserir no ${escapeHtml(platformDisplayName)}
          </button>
        `
        : ''

    const copyMessageButton =
      messageAvailable
        ? `
          <button
            class="yolen-secondary-button"
            type="button"
            data-yolen-action="copy-suggested-message"
          >
            Copiar mensagem
          </button>
        `
        : ''

    return `
      ${applyButton}
      ${transcribeAudioButton}
      ${insertMessageButton}
      ${copyMessageButton}

      <button
        class="yolen-tertiary-button"
        type="button"
        data-yolen-action="analyze-conversation"
      >
        Atualizar análise
      </button>
    `
  }

  function getCompanionDecisionBadge() {
    if (
      state
        .conversationAnalysisLoading
    ) {
      return 'Analisando'
    }

    if (
      state
        .conversationAnalysisError ||
      state
        .suggestionApplyError ||
      isCurrentAnalysisOutdated()
    ) {
      return 'Atenção'
    }

    if (
      state
        .suggestionApplyResult
    ) {
      return 'Atualizado'
    }

    if (
      !state
        .conversationAnalysis
    ) {
      return 'Aguardando conversa'
    }

    if (
      hasOperationalSuggestionChange()
    ) {
      return 'Ação recomendada'
    }

    if (
      getSuggestedMessage() ||
      getCompanionNextMoveText()
    ) {
      return 'Orientação disponível'
    }

    return 'Sem intervenção necessária'
  }

  function getCompanionMomentText() {
    if (
      state
        .suggestionApplyLoading
    ) {
      return 'Atualizando a Yolen após sua confirmação...'
    }

    if (
      state
        .suggestionApplyError
    ) {
      return (
        state
          .suggestionApplyError
      )
    }

    if (
      state
        .suggestionApplyResult
    ) {
      return state
        .suggestionApplyResult
        .already_applied
        ? 'A situação já estava atualizada na Yolen.'
        : 'A atualização foi registrada na Yolen.'
    }

    if (
      state
        .conversationAnalysisLoading
    ) {
      return 'A Yolen está entendendo o momento atual da conversa.'
    }

    if (
      state
        .conversationAnalysisError
    ) {
      return (
        state
          .conversationAnalysisError
      )
    }

    if (
      isCurrentAnalysisOutdated()
    ) {
      return 'A conversa mudou desde a última leitura. Atualize a análise antes de usar a orientação anterior.'
    }

    const summary =
      state
        .conversationAnalysis
        ?.suggestion
        ?.summary

    if (
      typeof summary ===
        'string' &&
      summary.trim()
    ) {
      return summary.trim()
    }

    if (
      !canAnalyzeCurrentConversation()
    ) {
      return 'A Yolen ainda não pode analisar esta conversa.'
    }

    if (
      state
        .automaticAnalysisStatus
    ) {
      return state
        .automaticAnalysisStatus
    }

    return 'Continue a conversa normalmente. A Yolen acompanha e aparece quando houver algo útil para orientar.'
  }

  function getCompanionNextMoveText() {
    if (
      !isLegacySuggestionCommerciallyActionable()
    ) {
      return null
    }

    const nextMove =
      state
        .conversationAnalysis
        ?.coaching
        ?.recommended_next_approach

    if (
      typeof nextMove !==
        'string'
    ) {
      return null
    }

    const clean =
      nextMove.trim()

    return clean || null
  }

  function getOperationalSuggestionHtml() {
    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const cycle =
      state
        .leadResolution
        ?.cycle

    if (
      !suggestion ||
      !cycle ||
      isCurrentAnalysisOutdated() ||
      !hasOperationalSuggestionChange()
    ) {
      return ''
    }

    const items = []

    if (
      suggestion
        .recommended_status &&
      suggestion
        .recommended_status !==
        cycle.status
    ) {
      items.push(
        `Etapa: ${getStageLabel(cycle.status)} → ${getStageLabel(suggestion.recommended_status)}`,
      )
    }

    const currentNextAction =
      normalizeOperationalText(
        cycle.next_action,
      )

    const suggestedNextAction =
      normalizeOperationalText(
        suggestion.next_action,
      )

    const actionChanged =
      currentNextAction !==
        suggestedNextAction ||
      getOperationalDateKey(
        cycle.next_action_date,
      ) !==
        getOperationalDateKey(
          suggestion
            .next_action_date,
        )

    if (
      actionChanged &&
      suggestedNextAction
    ) {
      const formattedDate =
        formatSuggestionDate(
          suggestion
            .next_action_date,
        )

      items.push(
        formattedDate
          ? `Próxima ação: ${suggestedNextAction} · ${formattedDate}`
          : `Próxima ação: ${suggestedNextAction}`,
      )
    }

    if (
      items.length === 0
    ) {
      return ''
    }

    return `
      <div class="yolen-decision-block yolen-operational-suggestion">
        <div class="yolen-decision-kicker">
          Atualização na Yolen
        </div>

        <div class="yolen-decision-list">
          ${items
            .map(
              item =>
                `<div class="yolen-decision-list-item">${escapeHtml(item)}</div>`,
            )
            .join('')}
        </div>

        <div class="yolen-operational-note">
          Nada será alterado sem sua confirmação.
        </div>
      </div>
    `
  }

  function getLegacyAnalysisCardHtml() {
    const nextMove =
      getCompanionNextMoveText()

    return `
      <div class="yolen-card yolen-decision-card ${getAnalysisStatusClass()}">
        <div class="yolen-decision-header">
          <div class="yolen-section-label">
            Yolen Companion
          </div>

          <div class="yolen-decision-badge">
            ${escapeHtml(
              getCompanionDecisionBadge(),
            )}
          </div>
        </div>

        <div class="yolen-decision-block">
          <div class="yolen-decision-kicker">
            Resumo
          </div>

          <div class="yolen-card-title yolen-decision-title">
            ${
              state.conversationAnalysisLoading
                ? getInlineSpinnerHtml()
                : ''
            }${escapeHtml(
              getCompanionMomentText(),
            )}
          </div>
        </div>

        ${getDeepAnalysisStatusBlockHtml()}

        ${
          nextMove &&
          !isCurrentAnalysisOutdated()
            ? `
              <div class="yolen-decision-block">
                <div class="yolen-decision-kicker">
                  Próximo passo
                </div>

                <div class="yolen-decision-copy">
                  ${escapeHtml(nextMove)}
                </div>
              </div>
            `
            : ''
        }

        ${getOperationalSuggestionHtml()}

        ${getAudioTranscriptionHtml()}

        ${getSuggestedMessageHtml()}

        <div class="yolen-inline-actions yolen-decision-actions">
          ${getAnalysisActionButton()}
        </div>
      </div>
    `
  }

  function getCommercialReadingDisplayText(
    value,
  ) {
    if (
      typeof value !==
      'string'
    ) {
      return null
    }

    const clean =
      value.trim()

    return clean || null
  }

  function getDetailedAnalysisAreaHtml() {
    // FASE 16.6 (recalibração seller-facing de ANÁLISE): a leitura
    // detalhada não vem mais de getActiveCommercialReading() (o
    // state.conversationAnalysis da tentativa atual) — vem pronta do
    // ANÁLISE seller-facing view model (Integrated Commercial Context,
    // FASE 16.4, traduzido por app/lib/server/analysis-view-model.ts e
    // buscado por loadAnalysisViewModelForCurrentCycle). Os estados de
    // loading/erro/desatualização continuam ligados ao JOB de análise
    // semântica em si (conversationAnalysisLoading/Error,
    // isCurrentAnalysisOutdated()) — são sinais distintos do fetch do
    // view model: um job de reanálise em voo/errado/desatualizado
    // precede a leitura persistida, mesmo padrão de prioridade já usado
    // antes da FASE 16.6.
    if (state.conversationAnalysisLoading) {
      return `
        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-loading role="status" aria-live="polite">
            ${getInlineSpinnerHtml()}
            Analisando sua condução comercial…
          </div>

          <div class="yolen-inline-actions yolen-decision-actions">
            ${getAnalysisActionButton()}
          </div>
        </div>
      `
    }

    if (state.conversationAnalysisError) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-status-warning">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-error role="alert">
            ${escapeHtml(state.conversationAnalysisError)}
          </div>
          ${
            canAnalyzeCurrentConversation()
              ? `
                <div class="yolen-inline-actions">
                  <button
                    class="yolen-secondary-button"
                    type="button"
                    data-yolen-action="analyze-conversation"
                  >
                    Tentar novamente
                  </button>
                </div>
              `
              : ''
          }
        </div>
      `
    }

    if (isCurrentAnalysisOutdated()) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-status-warning">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-outdated>
            A conversa mudou. Atualize a leitura para avaliar a condução atual.
          </div>

          <div class="yolen-inline-actions yolen-decision-actions">
            ${getAnalysisActionButton()}
          </div>
        </div>
      `
    }

    // Mesmo guard de escopo de getNowAttentionSnapshotHtml (AGORA,
    // FASE 16.5) — cycleId/conversationKey/companyId batendo garante
    // que uma troca de conversa/empresa nunca deixa a análise da
    // conversa/empresa anterior visível (mandato FASE 16.6 §31/§32).
    const isCurrentAnalysisViewModelContext =
      state.analysisViewModelCycleId ===
        getCanonicalResolutionCycleId() &&
      state.analysisViewModelConversationKey ===
        getCaptureConversationKey() &&
      state.analysisViewModelCompanyId ===
        (state.companyId || null)

    if (
      state.analysisViewModel?.status === 'ready' &&
      isCurrentAnalysisViewModelContext
    ) {
      return `
        <div class="yolen-card yolen-seller-area-card yolen-analysis-area-card">
          ${sellerInformationViewTools.renderAnalysisViewModel(
            state.analysisViewModel.data,
          )}

          <div class="yolen-inline-actions yolen-decision-actions">
            ${getAnalysisActionButton()}
          </div>
        </div>
      `
    }

    if (state.conversationAnalysis) {
      // Fallback: a tentativa de análise atual já resolveu localmente
      // (state.conversationAnalysis), mas o ANÁLISE view model canônico
      // (fetch separado, assíncrono) ainda não chegou — nunca esperar o
      // segundo fetch para mostrar uma leitura que já existe (regressão
      // de UX). Quando o view model canônico ficar pronto, o branch
      // acima passa a ter prioridade e substitui este fallback por
      // completo — nunca os dois se misturam na mesma renderização.
      const fallbackReading =
        getActiveCommercialReading()

      const fallbackViewModel =
        fallbackReading
          ? sellerInformationViewTools
              .buildAnalysisViewModelFromReading(
                fallbackReading,
              )
          : null

      if (fallbackViewModel) {
        return `
          <div class="yolen-card yolen-seller-area-card yolen-analysis-area-card">
            ${sellerInformationViewTools.renderAnalysisViewModel(
              fallbackViewModel,
            )}

            <div class="yolen-inline-actions yolen-decision-actions">
              ${getAnalysisActionButton()}
            </div>
          </div>
        `
      }

      return `
        ${getLegacyAnalysisCardHtml()}

        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Análise</div>
          <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
            A leitura atual oferece somente orientação imediata. Ainda não há análise detalhada de coaching e método.
          </div>
        </div>
      `
    }

    return `
      <div class="yolen-card yolen-seller-area-card">
        <div class="yolen-section-label">Análise</div>
        <div class="yolen-seller-empty-state" data-yolen-analysis-progressive>
          A leitura atual oferece somente orientação imediata. Ainda não há análise detalhada de coaching e método.
        </div>

        <div class="yolen-inline-actions yolen-decision-actions">
          ${getAnalysisActionButton()}
        </div>
      </div>
    `
  }

  function getClientInformationAreaHtml() {
    // FASE 16.7 (recalibração seller-facing de CLIENTE): o conteúdo de
    // "o que sabemos" não vem mais de renderClientCommercialArea (o
    // dump completo de commercial_reading.customer.*, sem distinção
    // person/cycle) — vem pronto do CLIENTE seller-facing view model
    // (Commercial Reading canônica atual, traduzida por
    // app/lib/server/customer-view-model.ts e buscada por
    // loadCustomerViewModelForCurrentCycle). RELACIONAMENTO continua
    // vindo do client-context já existente e testado (mandato §29/§31 —
    // nunca duplicar um presenter equivalente já correto).
    const isCurrentCustomerViewModelContext =
      state.customerViewModelCycleId ===
        getCanonicalResolutionCycleId() &&
      state.customerViewModelConversationKey ===
        getCaptureConversationKey() &&
      state.customerViewModelCompanyId ===
        (state.companyId || null)

    let commercialHtml = ''

    if (
      state.customerViewModel?.status === 'ready' &&
      isCurrentCustomerViewModelContext
    ) {
      commercialHtml =
        sellerInformationViewTools
          .renderCustomerViewModel(
            state.customerViewModel.data,
          )
    } else {
      // Fallback: a mesma leitura comercial já resolvida localmente com
      // identidade (getLastKnownClientCommercialReading — CLIENTE usa
      // exclusivamente este snapshot, nunca getActiveCommercialReading()
      // direto, porque só o snapshot recusa corretamente um resultado
      // cuja identidade não bate mais com o contexto atual) nunca deve
      // desaparecer da tela só porque o fetch do view model canônico
      // ainda está em voo — mesma lição da FASE 16.6 (ANÁLISE).
      const commercialReading =
        getLastKnownClientCommercialReading()

      const fallbackViewModel =
        commercialReading
          ? sellerInformationViewTools
              .buildCustomerViewModelFromReading(
                commercialReading,
              )
          : null

      commercialHtml =
        fallbackViewModel
          ? sellerInformationViewTools
              .renderCustomerViewModel(
                fallbackViewModel,
              )
          : ''
    }

    const relationshipHtml =
      getCompanionClientRelationshipCardHtml()

    if (!commercialHtml && !relationshipHtml) {
      return `
        <div class="yolen-card yolen-seller-area-card">
          <div class="yolen-section-label">Cliente</div>
          <div class="yolen-seller-empty-state" data-yolen-client-empty>
            Ainda não há informações suficientes sobre este cliente.
          </div>
        </div>
      `
    }

    return `
      ${commercialHtml}
      ${relationshipHtml}
    `
  }

  // AGORA é a única superfície de decisão: quando há um alerta relevante
  // (SLA, risco de atendimento, desvio de método, pergunta/objeção em
  // aberto), ele é o item de maior prioridade visual — o mesmo sinal que já
  // acende no rail minimizado (getCollapsedCompanionAttentionSnapshot) não
  // pode desaparecer quando o painel é expandido. Fica quieto (string
  // vazia) sem sinal útil; nunca duplica o diagnóstico completo, que
  // continua exclusivo de ANÁLISE.
  // FASE 16.5 (recalibração seller-facing do AGORA): a decisão não é mais
  // reconstruída aqui a partir da leitura crua — vem pronta do AGORA
  // seller-facing view model (Decision State, FASE 16.3E, traduzido por
  // app/lib/server/agora-view-model.ts e buscado por
  // loadAgoraDecisionStateForCurrentCycle). Igual ao guard de
  // isCurrentAnalysisOutdated(), a checagem de escopo abaixo garante que
  // uma troca de conversa nunca deixa a decisão da conversa anterior
  // visível (mandato §24/§25 — isolamento cross-conversation/cross-lead).
  function getNowAttentionSnapshotHtml() {
    if (state.agoraDecisionState?.status !== 'ready') {
      return ''
    }

    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    const isCurrentContext =
      state.agoraDecisionStateCycleId ===
        cycleId &&
      state.agoraDecisionStateConversationKey ===
        conversationKey &&
      state.agoraDecisionStateCompanyId ===
        (state.companyId || null)

    if (!isCurrentContext) {
      return ''
    }

    return sellerInformationViewTools.renderAgoraViewModelSnapshot(
      state.agoraDecisionState.data,
    )
  }

  function isSellerWorkspaceReady() {
    return Boolean(
      state.connected &&
      !state.isGroupConversation &&
      !state.isSelfConversation &&
      state
        .leadResolutionOutcome
        ?.workspace_ready === true
    )
  }

  // Elegibilidade "dura": esta conversa TEM, em tese, um contexto
  // comercial (não é grupo/self, está conectada, e já existe um ciclo e
  // uma conversationKey de captura resolvidos) — independente de o
  // resumo já ter chegado ou não. Não confundir com isSellerMessageMountEligible():
  // esta função sozinha não decide se o mount aparece, só se FAZ SENTIDO
  // a conversa ter um composer seller em algum momento.
  function hasSellerMessageCommercialContext() {
    const cycleId =
      state
        .leadResolutionViewModel
        ?.cycle
        ?.id

    const conversationKey =
      getCaptureConversationKey()

    return Boolean(
      isSellerWorkspaceReady() &&
      state.conversationKey &&
      cycleId &&
      conversationKey,
    )
  }

  // Elegibilidade do MOUNT: além do contexto comercial existir, o resumo
  // do lead precisa estar pronto E pertencer EXATAMENTE a este cycle e a
  // esta conversationKey de captura — nunca a um cycle/conversationKey
  // anterior ainda não invalidado. Não exige working_summary aqui: essa é
  // uma decisão do próprio controller de MENSAGEM (companion-message-controller.js, via syncContext),
  // não desta camada — esta é só isolamento/ownership de contexto, não
  // regra de disponibilidade de conteúdo.
  function isSellerMessageMountEligible() {
    if (!hasSellerMessageCommercialContext()) {
      return false
    }

    const cycleId =
      state
        .leadResolutionViewModel
        ?.cycle
        ?.id

    const conversationKey =
      getCaptureConversationKey()

    return Boolean(
      state.companionLeadSummary?.status === 'ready' &&
      state.companionLeadSummaryCycleId === cycleId &&
      state.companionLeadSummaryConversationKey ===
        conversationKey,
    )
  }

  // UX8 FASE C: superfície própria do composer seller-facing. Nesta fase
  // é só o mount estrutural — companion-message-controller.js já procura o
  // mount do composer em qualquer lugar do documento (e não se importa
  // se o painel-pai está com [hidden]), então bastou mover este div para
  // cá; o runtime não precisou mudar. O design fiel
  // à imagem de referência (objetivo, presets, textarea, resultado) é
  // FASE D — aqui o composer real já aparece dentro deste mount assim
  // que o contexto da conversa atual for válido.
  //
  // Defesa em profundidade (P0 — stale seller message em contexto não
  // elegível): o mount só existe no HTML quando isSellerMessageMountEligible()
  // é verdadeiro. Isso é puramente de leitura de state — nenhum side
  // effect aqui; a limpeza explícita do runtime continua acontecendo nos
  // pontos reais de transição (hardResetConversationWorkspace(), branch
  // de grupo, e o branch sem cycle/conversationKey de
  // loadCompanionLeadSummaryForCurrentCycle()). Isso garante que, mesmo
  // que algum chamador futuro esqueça de limpar o runtime explicitamente,
  // o mount simplesmente não existe no DOM para um contexto inelegível —
  // não há superfície para um composer antigo reaparecer.
  function getSellerMessageAreaHtml() {
    if (!isSellerMessageMountEligible()) {
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

  function getSellerInformationArchitectureHtml() {
    if (!isSellerWorkspaceReady()) {
      return ''
    }

    const nowHtml =
      getNowAttentionSnapshotHtml() +
      (getCompanionLeadSummaryCardHtml() ||
      `
        <div class="yolen-card yolen-seller-area-card yolen-status-neutral">
          <div class="yolen-section-label">Agora</div>
          <div class="yolen-seller-empty-state">
            A Yolen está preparando o resumo e a orientação desta conversa.
          </div>
        </div>
      `)

    const messageHtml =
      getSellerMessageAreaHtml()

    const analysisHtml =
      getDetailedAnalysisAreaHtml()

    const clientHtml = [
      getClientInformationAreaHtml(),
      getConversationRegistrationCardHtml(),
      getLeadEnrichmentCandidatesHtml(),
    ].filter(Boolean).join('')

    return workspaceRuntime.getSellerWorkspaceHtml({
      activeArea:
        workspaceState.getActiveArea(),
      nowHtml,
      messageHtml,
      analysisHtml,
      clientHtml,
    })
  }

  function setActiveSellerArea(
    nextArea,
    options = {},
  ) {
    if (!workspaceState.setActiveArea(nextArea)) {
      return
    }

    renderPanel()

    if (options.focus === true) {
      window.setTimeout(() => {
        const tab =
          document.getElementById(
            `yolen-seller-tab-${nextArea}`,
          )

        if (!tab) {
          return
        }

        const panel =
          document.getElementById(
            PANEL_ID,
          )

        const scrollContainer =
          getWorkspaceScrollContainer(
            panel,
          )

        const scrollTop =
          scrollContainer?.scrollTop ??
          null

        try {
          tab.focus({
            preventScroll: true,
          })
        } catch {
          tab.focus()

          if (
            scrollContainer &&
            scrollTop !== null
          ) {
            scrollContainer.scrollTop =
              scrollTop
          }
        }
      }, 0)
    }
  }

  function handleSellerAreaKeyboard(
    event,
  ) {
    const currentArea =
      event.currentTarget
        ?.getAttribute(
          'data-yolen-seller-area',
        )

    const nextArea =
      workspaceRuntime.getNextSellerAreaForKeydown(
        currentArea,
        event.key,
      )

    if (nextArea === null) {
      return
    }

    event.preventDefault()
    setActiveSellerArea(
      nextArea,
      { focus: true },
    )
  }

  globalThis
    .YolenCompanionLeadEnrichmentContext =
      Object.freeze({
        getCandidates: () =>
          getLeadEnrichmentCandidates(),
      })

  function getCompactConnectionLabel() {
    if (state.loading) {
      return 'Conectando'
    }

    if (state.connected) {
      return 'Conectada'
    }

    return 'Desconectada'
  }

  function getCompactConnectionClass() {
    if (state.loading) {
      return 'yolen-connection-pending'
    }

    if (state.connected) {
      return 'yolen-connection-online'
    }

    return 'yolen-connection-offline'
  }

  function getCompactConversationName() {
    return (
      state
        .leadResolutionViewModel
        ?.lead_display
        ?.name ||
      state.conversationTitle ||
      'Nenhuma conversa detectada'
    )
  }

  function getCompactLeadDescription() {
    if (state.isSelfConversation) {
      return 'Esta conversa não é vinculada a um lead comercial.'
    }

    if (state.isGroupConversation) {
      return 'Conversas em grupo não são vinculadas a leads.'
    }

    if (state.leadResolutionLoading) {
      return 'Localizando este contato na Yolen...'
    }

    if (state.leadResolutionError) {
      return state.leadResolutionError
    }

    if (!state.connected) {
      return 'Conecte a Yolen para ativar o Companion nesta conversa.'
    }

    if (!state.conversationPhone) {
      return (
        state.autoLookupStatus ||
        'Identificando o contato automaticamente...'
      )
    }

    const resolution =
      state.leadResolutionViewModel

    if (!resolution) {
      return 'Localizando vínculo comercial...'
    }

    if (
      resolution.status ===
      'OWNED_BY_ME'
    ) {
      return 'Lead vinculado à sua carteira.'
    }

    if (
      resolution.status ===
      'OWNED_BY_OTHER'
    ) {
      return (
        resolution.user_message ||
        'Este lead pertence a outra carteira.'
      )
    }

    if (
      resolution.status ===
      'IN_POOL'
    ) {
      return (
        resolution.user_message ||
        'Este lead está no Pool.'
      )
    }

    if (
      resolution.status ===
      'NOT_FOUND'
    ) {
      return (
        resolution.user_message ||
        'Este contato ainda não existe na Yolen.'
      )
    }

    if (
      resolution.status ===
      'CLOSED_CYCLE'
    ) {
      return (
        resolution.user_message ||
        'Este ciclo comercial já está encerrado.'
      )
    }

    return (
      resolution.user_message ||
      'Contato localizado na Yolen.'
    )
  }

  function getCompactContextChipsHtml() {
    const resolution =
      state.leadResolutionViewModel

    const cycle =
      resolution?.cycle

    const ownerName =
      resolution
        ?.ownership_display
        ?.owner_name

    const chips = []

    if (cycle?.status) {
      chips.push(
        '<span class="yolen-context-chip">' +
          escapeHtml(
            getStageLabel(
              cycle.status,
            ),
          ) +
        '</span>',
      )
    }

    if (ownerName) {
      chips.push(
        '<span class="yolen-context-chip yolen-context-chip-muted">' +
          escapeHtml(
            ownerName,
          ) +
        '</span>',
      )
    }

    if (chips.length === 0) {
      return ''
    }

    return (
      '<div class="yolen-context-chips">' +
        chips.join('') +
      '</div>'
    )
  }

  function getCompactFooterHtml() {
    if (!state.connected) {
      return [
        '<div class="yolen-compact-footer">',
          '<button',
            ' class="yolen-primary-button"',
            ' type="button"',
            ' data-yolen-action="connect-yolen"',
          '>',
            'Conectar Yolen',
          '</button>',
        '</div>',
      ].join('')
    }

    return [
      '<div class="yolen-compact-footer">',
        '<button',
          ' class="yolen-tertiary-button"',
          ' type="button"',
          ' data-yolen-action="open-yolen"',
        '>',
          'Abrir Yolen',
        '</button>',
      '</div>',
    ].join('')
  }

  function getYolenMarkUrl() {
    const runtime =
      getExtensionRuntime()

    if (!runtime?.getURL) {
      return null
    }

    return runtime.getURL(
      'assets/yolen-mark.png',
    )
  }

  function getYolenMarkHtml() {
    const markUrl =
      getYolenMarkUrl()

    if (!markUrl) {
      return '<span class="yolen-logo-fallback">Y</span>'
    }

    return (
      '<img' +
        ' class="yolen-brand-mark"' +
        ' src="' +
          escapeHtml(markUrl) +
        '"' +
        ' alt="Yolen"' +
      '>'
    )
  }

  function getExtensionStorageLocal() {
    return (
      globalThis
        .browser
        ?.storage
        ?.local ||
      globalThis
        .chrome
        ?.storage
        ?.local ||
      null
    )
  }

  async function loadPanelCollapsedPreference() {
    const storage =
      getExtensionStorageLocal()

    if (!storage?.get) {
      return
    }

    try {
      const stored =
        await storage.get(
          PANEL_COLLAPSED_STORAGE_KEY,
        )

      panelCollapsed =
        stored?.[
          PANEL_COLLAPSED_STORAGE_KEY
        ] === true
    } catch {
      panelCollapsed = false
    }
  }

  function persistPanelCollapsedPreference(
    collapsed,
  ) {
    const storage =
      getExtensionStorageLocal()

    if (!storage?.set) {
      return
    }

    try {
      const result =
        storage.set({
          [PANEL_COLLAPSED_STORAGE_KEY]:
            Boolean(collapsed),
        })

      if (
        result &&
        typeof result.catch ===
          'function'
      ) {
        result.catch(() => {})
      }
    } catch {
      // Preferência visual nunca pode quebrar o Companion.
    }
  }

  // FASE 16.5 (achado do Codex, PR #283, rodada 3) — o rail minimizado
  // (getCollapsedCompanionAttentionSnapshot) e a aba AGORA expandida
  // (getNowAttentionSnapshotHtml/renderAgoraViewModelSnapshot) precisam
  // concordar sobre qual é "o" sinal acionável do momento: nem sempre é
  // `primary` — ver AgoraViewModel.primary/secondary em
  // app/lib/server/agora-view-model.ts. `status: 'no_intervention'` (seja
  // por `wait` mapeado para essa categoria de tom, seja em teoria por
  // qualquer outro kind que caia nela) nunca é "ação recomendada agora",
  // então nunca deve ser promovido a ponto de atenção no rail.
  function pickActionableAgoraSignal(agoraData) {
    const primary =
      agoraData?.primary

    if (
      primary &&
      primary.status !== 'no_intervention'
    ) {
      return primary
    }

    const secondary =
      Array.isArray(agoraData?.secondary)
        ? agoraData.secondary
        : []

    return (
      secondary.find(
        (signal) =>
          signal &&
          signal.status !== 'no_intervention',
      ) || null
    )
  }

  // B5_MINIMIZED_INTELLIGENCE_START
  function getCollapsedCompanionAttentionSnapshot() {
    if (
      !state.connected ||
      state.loading ||
      !state.conversationKey
    ) {
      return null
    }

    const commercialReading =
      getActiveCommercialReading()

    const hasCurrentReading =
      Boolean(
        commercialReading &&
        !state.conversationAnalysisLoading &&
        !isCurrentAnalysisOutdated() &&
        commercialReading.analysis_status ===
          'complete',
      )

    const neutralSession =
      hasCurrentReading &&
      sellerInformationViewTools
        .isNeutralCommercialSession(
          commercialReading,
        )

    // Uma conversa pessoal ou incerta não acende sinal comercial no rail.
    // O histórico persistido continua disponível em CLIENTE ao abrir.
    if (neutralSession) {
      return null
    }

    const candidates = []
    const addCandidate = (
      candidate,
      rank,
    ) => {
      if (!candidate) {
        return
      }

      candidates.push({
        ...candidate,
        rank,
      })
    }

    const preSendGateKey =
      getCurrentPreSendGateKey()

    if (preSendGateKey) {
      addCandidate({
        level: 'risk',
        key:
          `risk:${preSendGateKey}`,
        label:
          'Risco comercial antes do envio',
      }, 500)
    }

    // FASE 16.5 (recalibração seller-facing do AGORA): a mesma decisão
    // primária que o painel expandido mostra (AgoraViewModel.primary,
    // Decision State traduzido por agora-view-model.ts) — nunca uma
    // segunda reconstrução independente a partir da leitura crua. Mesmo
    // guard de escopo de getNowAttentionSnapshotHtml, para não acender o
    // rail com a decisão de uma conversa que já foi trocada.
    const isCurrentAgoraContext =
      state.agoraDecisionState?.status === 'ready' &&
      state.agoraDecisionStateCycleId ===
        getCanonicalResolutionCycleId() &&
      state.agoraDecisionStateConversationKey ===
        getCaptureConversationKey() &&
      state.agoraDecisionStateCompanyId ===
        (state.companyId || null)

    // FASE 16.5 (achado do Codex, PR #283, rodada 3): ler só `primary`
    // desalinha o rail da aba AGORA expandida em dois casos reais —
    // (a) a decisão principal foi suprimida (`primary === null`,
    // `primaryIsSuppressed` em agora-view-model.ts) mas um sinal
    // secundário real sobrevive (ex.: `customer_waiting`), e o rail
    // ficava mudo mesmo com AGORA mostrando um sinal visível; (b) um
    // `primary` não-suprimido pode ainda assim carregar `kind: 'wait'`
    // (passthrough de `best_approach`, sem candidato operacional/risco
    // priorizado por cima) — mapeado para o status `no_intervention`
    // (não é uma recomendação de ação) com `priority: null`, que o
    // fallback de `ranks` abaixo promovia para um ponto de
    // "recomendação" indevido. `pickActionableAgoraSignal` escolhe o
    // primeiro sinal realmente acionável — primary quando não é
    // `no_intervention`, senão o primeiro item de secondary — igual ao
    // que a aba expandida já mostra.
    const agoraSignal =
      isCurrentAgoraContext
        ? pickActionableAgoraSignal(
            state.agoraDecisionState.data,
          )
        : null

    if (agoraSignal) {
      const levels = {
        critical: 'risk',
        high: 'attention',
        medium: 'recommendation',
        low: 'information',
      }

      const ranks = {
        critical: 400,
        high: 300,
        medium: 200,
        low: 150,
      }

      addCandidate({
        level:
          levels[agoraSignal.priority] ||
          'recommendation',
        // FASE 16.5 (achado do Codex, PR #283, rodada 3): a chave NÃO
        // pode incluir o timestamp de recálculo do Decision State — o
        // refresh periódico (startCompanionClientContextTicker, a cada
        // 60s) gera um timestamp novo mesmo quando o sinal em si não
        // mudou nada, o que fazia a chave divergir de
        // `lastAcknowledgedCollapsedAttentionKey` a cada tick e reacender
        // o ponto de notificação para um vendedor que já tinha aberto/
        // fechado o painel. A identidade do sinal (decision_kind/source/
        // status/priority/headline, via provenance) só muda quando a
        // decisão em si muda.
        key:
          [
            'seller-attention',
            state.conversationKey,
            agoraSignal.status,
            agoraSignal.priority,
            agoraSignal.provenance?.decision_kind,
            agoraSignal.provenance?.source,
            agoraSignal.headline,
          ]
            .filter(Boolean)
            .join(':'),
        label:
          agoraSignal.headline,
      }, ranks[agoraSignal.priority] || 200)
    }

    if (
      getCanonicalResolutionStatus() ===
        'NOT_FOUND' &&
      !state.leadResolutionLoading
    ) {
      addCandidate({
        level: 'attention',
        key:
          `attention:new-lead:${state.conversationKey}`,
        label:
          'Contato ainda não cadastrado na Yolen',
      }, 310)
    }

    if (
      hasCurrentReading &&
      hasCurrentOperationalSuggestionChange()
    ) {
      addCandidate({
        level: 'attention',
        key:
          [
            'attention:operation',
            state.conversationKey,
            state.analyzedConversationFingerprint,
          ]
            .filter(Boolean)
            .join(':'),
        label:
          'Ação da Yolen aguardando revisão',
      }, 305)
    }

    if (
      hasCurrentReading &&
      commercialReading
        ?.communication
        ?.intervention_needed === true
    ) {
      addCandidate({
        level: 'recommendation',
        key:
          [
            'recommendation',
            state.conversationKey,
            state.analyzedConversationFingerprint,
          ]
            .filter(Boolean)
            .join(':'),
        label:
          'Recomendação disponível para esta conversa',
      }, 190)
    }

    const enrichmentCandidates =
      getVisibleLeadEnrichmentCandidates()

    if (
      enrichmentCandidates.length > 0
    ) {
      const candidateKeys =
        enrichmentCandidates
          .map((candidate) =>
            getLeadEnrichmentCandidateKey(
              candidate,
            ),
          )
          .filter(Boolean)
          .sort()

      addCandidate({
        level: 'information',
        key:
          [
            'information:enrichment',
            state.conversationKey,
            ...candidateKeys,
          ].join(':'),
        label:
          'Novos dados encontrados na conversa',
      }, 100)
    }

    candidates.sort(
      (left, right) =>
        right.rank - left.rank,
    )

    const attention =
      candidates[0]

    if (!attention) {
      return null
    }

    return {
      level: attention.level,
      key: attention.key,
      label: attention.label,
    }
  }

  function getUnacknowledgedCollapsedAttention() {
    const attention =
      getCollapsedCompanionAttentionSnapshot()

    if (
      !attention ||
      attention.key ===
        lastAcknowledgedCollapsedAttentionKey
    ) {
      return null
    }

    return attention
  }

  function acknowledgeCurrentCollapsedAttention() {
    const attention =
      getCollapsedCompanionAttentionSnapshot()

    lastAcknowledgedCollapsedAttentionKey =
      attention?.key || null
  }
  // B5_MINIMIZED_INTELLIGENCE_END

  function setPanelCollapsed(collapsed) {
    const nextCollapsed =
      Boolean(collapsed)

    acknowledgeCurrentCollapsedAttention()

    panelCollapsed =
      nextCollapsed

    if (
      panelCollapsed &&
      (
        state.preSendGateOpen ||
        state.preSendBypassKey
      )
    ) {
      state = {
        ...state,
        preSendGateOpen: false,
        preSendBypassKey: null,
      }
    }

    persistPanelCollapsedPreference(
      panelCollapsed,
    )

    document
      .documentElement
      .classList
      .toggle(
        'yolen-companion-collapsed',
        panelCollapsed,
      )

    renderPanel()
  }

  function getPanelHeaderHtml() {
    return [
      '<div class="yolen-panel-header yolen-panel-header-final">',

        '<div class="yolen-brand">',

          '<button',
            ' class="yolen-logo yolen-logo-button"',
            ' type="button"',
            ' data-yolen-action="collapse-companion"',
            ' title="Minimizar Yolen Companion"',
            ' aria-label="Minimizar Yolen Companion"',
          '>',

            getYolenMarkHtml(),

          '</button>',

          '<div class="yolen-brand-copy">',

            '<div class="yolen-title">',
              'Yolen Companion',
            '</div>',

            '<div class="yolen-subtitle">',
              escapeHtml(
                state.companyName ||
                'Empresa não carregada',
              ),
            '</div>',

          '</div>',

        '</div>',

        '<div class="yolen-header-actions">',

          '<span class="yolen-connection-pill ' +
            getCompactConnectionClass() +
          '">',

            state.loading
              ? getInlineSpinnerHtml('yolen-spinner-inline')
              : '',

            escapeHtml(
              getCompactConnectionLabel(),
            ),

          '</span>',

          '<button',
            ' class="yolen-icon-button"',
            ' type="button"',
            ' data-yolen-action="refresh"',
            ' title="Atualizar"',
            ' aria-label="Atualizar Yolen Companion"',
          '>',
            '↻',
          '</button>',

          '<button',
            ' class="yolen-icon-button yolen-collapse-button"',
            ' type="button"',
            ' data-yolen-action="collapse-companion"',
            ' title="Minimizar Companion"',
            ' aria-label="Minimizar Yolen Companion"',
          '>',
            '›',
          '</button>',

        '</div>',

      '</div>',
    ].join('')
  }

  function getContactCardHtml() {
    return [
      '<div class="yolen-card yolen-contact-card yolen-contact-card--compact ' +
        getLeadStatusClass() +
      '">',

        '<div class="yolen-contact-compact-head">',
          '<div class="yolen-lead-name">',
            escapeHtml(
              getCompactConversationName(),
            ),
          '</div>',
          getCompactContextChipsHtml(),
        '</div>',

        '<div class="yolen-card-description yolen-contact-description">',
          escapeHtml(
            getCompactLeadDescription(),
          ),
        '</div>',

        '<div class="yolen-inline-actions yolen-contact-actions">',
          getLeadActionButton(),
        '</div>',

      '</div>',
    ].join('')
  }

  // wireOnce() é o que torna seguro rodar wirePanelInteractions() depois
  // de toda renderPanel(), mesmo quando a maioria das regiões não mudou
  // (e portanto os mesmos nodes de botão sobrevivem de uma chamada para a
  // outra): sem a marca de "já ligado", reanexar um listener idêntico a
  // um node que persiste faria o handler disparar mais de uma vez por
  // clique.
  function wireOnce(
    element,
    eventType,
    handler,
  ) {
    if (!element) {
      return
    }

    element.__yolenWiredEvents =
      element.__yolenWiredEvents ||
      new Set()

    if (
      element.__yolenWiredEvents.has(
        eventType,
      )
    ) {
      return
    }

    element.__yolenWiredEvents.add(
      eventType,
    )

    element.addEventListener(
      eventType,
      handler,
    )
  }

  function wirePanelInteractions(panel) {
    panel
      .querySelectorAll(
        '[data-yolen-seller-area]',
      )
      .forEach((button) => {
        wireOnce(button, 'click', () => {
          setActiveSellerArea(
            button.getAttribute(
              'data-yolen-seller-area',
            ),
          )
        })

        wireOnce(
          button,
          'keydown',
          handleSellerAreaKeyboard,
        )
      })

    panel
      .querySelectorAll(
        '[data-yolen-action="refresh"]',
      )
      .forEach((button) => {
        wireOnce(button, 'click', () => {
          const currentKey = state.conversationKey

          if (currentKey) {
            autoLookupAttemptedKeys.delete(currentKey)
            channelAdapter.forgetContactEvidence(currentKey)
          }

          // "Atualizar" é a invalidação explícita do cache de resolução.
          coreApiComposition.clearLeadResolutionCache()

          lastResolvedConversationKey = null
          refreshConversationSnapshot()
          loadYolenSession({ showLoading: true })

          if (!state.isSelfConversation) {
            resolveCurrentLead()
          }
        })
      })

    panel
      .querySelectorAll(
        '[data-yolen-action="retry-lead-link"]',
      )
      .forEach((button) => {
        wireOnce(button, 'click', () => {
          void retryLeadLinkAfterCreation()
        })
      })

    panel
      .querySelectorAll(
        '[data-yolen-action="confirm-lead-enrichment"]',
      )
      .forEach((button) => {
        wireOnce(button, 'click', () => {
          const candidateKey =
            button.getAttribute(
              'data-yolen-enrichment-key',
            )

          if (candidateKey) {
            void applyLeadEnrichmentCandidate(
              candidateKey,
            )
          }
        })
      })

    panel
      .querySelectorAll(
        '[data-yolen-action="ignore-lead-enrichment"]',
      )
      .forEach((button) => {
        wireOnce(button, 'click', () => {
          const candidateKey =
            button.getAttribute(
              'data-yolen-enrichment-key',
            )

          if (candidateKey) {
            ignoreLeadEnrichmentCandidate(
              candidateKey,
            )
          }
        })
      })

    panel
      .querySelectorAll(
        '[data-yolen-action="collapse-companion"]',
      )
      .forEach((button) => {
        wireOnce(button, 'click', () => {
          setPanelCollapsed(true)
        })
      })

    wireOnce(
      panel.querySelector('[data-yolen-action="open-yolen"]'),
      'click',
      () => {
        openYolen('/leads')
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="connect-yolen"]'),
      'click',
      () => {
        openYolen('/companion/connect')
      },
    )

    // LEGACY NAVIGATION EXCEPTION (4B.5N): create_lead_url carrega
    // telefone/nome da conversa e não pertence ao ViewModel sanitizado;
    // continua lida do payload legacy até a migração do fluxo de criação.
    wireOnce(
      panel.querySelector('[data-yolen-action="create-lead-yolen"]'),
      'click',
      () => {
        const url = state.leadResolution?.actions?.create_lead_url || '/leads'
        openYolen(url)
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="open-pool"]'),
      'click',
      () => {
        // pool_url do backend é sempre a constante '/pool'.
        openYolen('/pool')
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="open-cycle-yolen"]'),
      'click',
      () => {
        // Mesmo destino de open_yolen_url (lead && cycle →
        // /sales-cycles/{id}, senão /leads), reconstruído a partir do
        // ViewModel canônico da boundary atual — nunca de um cycle id raw.
        const resolution =
          state.leadResolutionViewModel

        const cycleId =
          resolution
            ?.capabilities
            ?.can_open_cycle === true
            ? resolution.cycle?.id ?? null
            : null

        openYolen(
          cycleId !== null
            ? `/sales-cycles/${encodeURIComponent(String(cycleId))}`
            : '/leads',
        )
      },
    )

    panel
      .querySelectorAll(
        ANALYZE_ACTION_SELECTOR,
      )
      .forEach((button) => {
        wireOnce(
          button,
          'click',
          handleAnalyzeActionClick,
        )
      })

    wireOnce(
      panel.querySelector('[data-yolen-action="apply-suggestion"]'),
      'click',
      () => {
        applyCurrentSuggestion()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="copy-suggested-message"]'),
      'click',
      () => {
        copySuggestedMessage()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="insert-suggested-message"]'),
      'click',
      () => {
        insertSuggestedMessageInChannel()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="transcribe-audio"]'),
      'click',
      () => {
        transcribeNextVisibleAudio()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="register-conversation"]'),
      'click',
      () => {
        registerCurrentConversation()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="confirm-conversation-registration"]'),
      'click',
      () => {
        confirmCurrentConversationRegistration()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="cancel-conversation-registration"]'),
      'click',
      () => {
        cancelCurrentConversationRegistration()
      },
    )

    wireOnce(
      panel.querySelector('[data-yolen-action="save-lead-summary"]'),
      'click',
      () => {
        const textarea = panel.querySelector('[data-yolen-textarea="lead-summary"]')
        const summaryText = textarea ? textarea.value : ''

        void handleSaveLeadSummaryClick(summaryText)
      },
    )

    if (
      window.YolenCompanionLeadAutomation
        ?.bindCreateLeadForm
    ) {
      window.YolenCompanionLeadAutomation.bindCreateLeadForm(
        panel,
        {
          conversationKey: state.conversationKey,
          phone: state.conversationPhone,
          displayName: state.conversationTitle,
        },
      )
    }
  }

  function renderPanel() {
    const panel = createPanel()

    if (!panel) {
      return
    }

    // Identidade canônica da conversa exibida (FASE 5): runtimes de
    // estabilidade do painel distinguem troca real de conversa de um
    // refresh da MESMA conversa por este atributo, nunca pelo texto
    // exibido (o nome do lead muda durante uma reconsulta).
    panel.setAttribute(
      'data-yolen-conversation-key',
      state.conversationKey || '',
    )

    const collapsed =
      panelCollapsed === true

    document
      .documentElement
      .classList
      .toggle(
        'yolen-companion-collapsed',
        collapsed,
      )

    panel.classList.toggle(
      'yolen-panel-collapsed',
      collapsed,
    )

    if (collapsed) {
      const attention =
        getUnacknowledgedCollapsedAttention()

      const attentionLevel =
        attention?.level || 'normal'

      const collapsedLabel =
        attention
          ? `Abrir Yolen Companion — ${attention.label}`
          : 'Abrir Yolen Companion'

      // O modo colapsado é uma casca minúscula e completamente diferente
      // do layout expandido por região — continua trocando
      // panel.innerHTML inteiro (é uma transição rara e deliberada do
      // vendedor, não uma atualização de fundo). Zera o layout de regiões
      // para que, ao expandir de novo, todas as regiões sejam recriadas
      // do zero em vez de reaproveitar containers que não existem mais.
      panel.dataset.yolenPanelLayout = 'collapsed'
      panelRegionHtmlCache.clear()
      panelRegionPendingHtml.clear()

      panel.innerHTML = [
        '<div class="yolen-collapsed-shell">',

          '<button',
            ' class="yolen-collapsed-logo-button ' +
              `yolen-collapsed-attention-${attentionLevel}"`,
            ' type="button"',
            ' data-yolen-action="expand-companion"',
            ' data-yolen-attention-level="' +
              escapeHtml(attentionLevel) +
            '"',
            ' title="' +
              escapeHtml(collapsedLabel) +
            '"',
            ' aria-label="' +
              escapeHtml(collapsedLabel) +
            '"',
          '>',

            getYolenMarkHtml(),

            attention
              ? [
                  '<span',
                    ' class="yolen-collapsed-attention-dot"',
                    ' aria-hidden="true"',
                  '></span>',
                ].join('')
              : '',

          '</button>',

        '</div>',
      ].join('')

      panel
        .querySelector(
          '[data-yolen-action="expand-companion"]',
        )
        ?.addEventListener(
          'click',
          () => {
            setPanelCollapsed(false)
          },
        )

      return
    }

    // Ver renderPanelRegion(): cada card abaixo só troca de DOM quando seu
    // próprio HTML muda. Se o painel estava colapsado (ou é a primeira
    // vez), ele não tem nenhum container de região ainda — limpa o que
    // sobrou da casca colapsada antes de criá-los pela primeira vez.
    if (
      panel.dataset.yolenPanelLayout !==
      'regions'
    ) {
      panel.innerHTML = ''
      panel.dataset.yolenPanelLayout =
        'regions'
      panelRegionHtmlCache.clear()
      panelRegionPendingHtml.clear()
    }

    renderPanelRegion(
      panel,
      'header',
      getPanelHeaderHtml(),
    )

    renderPanelRegion(
      panel,
      'contact-card',
      getContactCardHtml(),
    )

    renderPanelRegion(
      panel,
      'pre-send-assessment',
      getPreSendAssessmentCardHtml(),
    )

    renderPanelRegion(
      panel,
      'seller-area-tabs',
      isSellerWorkspaceReady()
        ? workspaceRuntime
            .getSellerAreaTabsBarHtml(
              workspaceState
                .getActiveArea(),
            )
        : '',
    )

    renderPanelRegion(
      panel,
      'seller-information-architecture',
      getSellerInformationArchitectureHtml(),
    )

    renderPanelRegion(
      panel,
      'footer',
      getCompactFooterHtml(),
    )

    wirePanelInteractions(panel)

    messageController.render()
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  // Indicador de progresso puramente visual (nenhum texto, nenhum
  // conteúdo semântico) para acompanhar as frases de loading já
  // existentes ("Conectando...", "Analisando...", "Análise aprofundada em
  // andamento") sem alterar o texto que os testes verificam.
  function getInlineSpinnerHtml(
    extraClass = '',
  ) {
    return (
      '<span class="yolen-spinner ' +
      escapeHtml(extraClass) +
      '" aria-hidden="true"></span>'
    )
  }

  function getCurrentTimeLabel() {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date())
  }

  async function loadYolenSession(options = {}) {
    const showLoading = options.showLoading === true

    if (showLoading) {
      state = {
        ...state,
        loading: true,
        lastError: null,
      }

      renderPanel()
    }

    try {
      const result = await window.YolenCompanionApi.getMe()

      if (!result?.ok || !result.payload?.ok) {
        // Sessão perdida: nenhuma resolução anterior pode ser reaproveitada
        // (antes: clearSession() envolvido por lead-resolution-runtime-cache).
        coreApiComposition.clearLeadResolutionCache()
        lastSessionUserId = null

        state = {
          ...state,
          connected: false,
          loading: false,
          userName: null,
          companyId: null,
          companyName: null,
          companyRole: null,
          lastError:
            result?.payload?.error ||
            'Não foi possível confirmar a sessão da Yolen.',
        }

        renderPanel()
        return
      }

      const previousCompanyId =
        state.companyId

      // Resoluções são relativas ao vendedor (OWNED_BY_ME etc.): troca de
      // usuário da sessão invalida o cache de resolução.
      const nextUserId =
        result.payload.user?.id || null

      if (
        lastSessionUserId !== null &&
        nextUserId !== lastSessionUserId
      ) {
        coreApiComposition.clearLeadResolutionCache()
      }

      lastSessionUserId = nextUserId

      const nextCompanyId =
        result.payload.active_company?.id ||
        null

      // A troca de empresa ativa da sessão invalida qualquer ownership de
      // análise em voo pertencente à empresa anterior —
      // isAnalysisResponseStillCurrent() já impede o resultado antigo de
      // ser aplicado (ver companyIdAtRequest), mas sozinho isso deixaria
      // conversationAnalysisLoading/activeAnalysisAttempt presos donos de
      // uma tentativa que nunca mais vai chegar a um estado terminal,
      // bloqueando canScheduleAutomaticAnalysis() para a empresa nova.
      // Só dispara quando as duas empresas são conhecidas e diferentes —
      // nunca no primeiro GET_ME da sessão (previousCompanyId null) nem
      // quando nada mudou.
      const companyChanged =
        previousCompanyId !== null &&
        nextCompanyId !== null &&
        previousCompanyId !==
          nextCompanyId

      if (companyChanged) {
        clearDeepAnalysisPollTimer()
        clearAnalysisWatchdogTimer()
        clearAutomaticAnalysisTimer()
        analysisController.activeAnalysisAttempt = null

        conversationBoundary.advanceBoundary({
          conversationKey:
            state.conversationKey,
          companyId:
            nextCompanyId,
        })
      }

      state = {
        ...state,
        connected: true,
        loading: false,
        userName: result.payload.user?.full_name || result.payload.user?.email || null,
        companyId: nextCompanyId,
        companyName: result.payload.active_company?.name || null,
        companyRole: result.payload.active_company?.role || null,
        lastError: null,
        lastSessionSyncAt: getCurrentTimeLabel(),
        ...(companyChanged
          ? {
              leadResolution: null,
              leadResolutionViewModel: null,
              leadResolutionOutcome: null,
              leadResolutionBoundaryToken: null,
              leadResolutionLoading: false,
              leadResolutionError: null,
              conversationAnalysisLoading: false,
              conversationAnalysis: null,
              conversationAnalysisError: null,
              analyzedConversationFingerprint: null,
              automaticAnalysisStatus: null,
              deepAnalysisStatus: null,
              deepAnalysisResult: null,
              lastKnownCommercialReading: null,
              lastKnownCommercialReadingContext: null,
              // FASE 16.5 (achado do Codex, PR #283, rodada 3): sem isto,
              // um AGORA "ready" carregado sob a empresa anterior fica
              // renderável até a próxima resolução de lead da empresa
              // nova terminar — cycleId/conversationKey sozinhos não
              // mudam só porque a empresa ativa mudou, e o mesmo chat do
              // WhatsApp pode continuar selecionado. Zerar aqui força
              // getNowAttentionSnapshotHtml/getCollapsedCompanionAttentionSnapshot
              // a ficarem quietos até loadAgoraDecisionStateForCurrentCycle
              // buscar dado novo, já sob companyIdAtRequest da empresa
              // nova.
              agoraDecisionState: {
                status: 'idle',
              },
              agoraDecisionStateCycleId: null,
              agoraDecisionStateConversationKey: null,
              agoraDecisionStateCompanyId: null,
              // FASE 16.6 — mesmo raciocínio para ANÁLISE: um view
              // model "ready" da empresa anterior não pode continuar
              // renderável só porque cycleId/conversationKey não
              // mudaram sozinhos.
              analysisViewModel: {
                status: 'idle',
              },
              analysisViewModelCycleId: null,
              analysisViewModelConversationKey: null,
              analysisViewModelCompanyId: null,
              // FASE 16.7 — mesmo raciocínio para CLIENTE: um view model
              // "ready" da empresa anterior não pode continuar
              // renderável só porque cycleId/conversationKey não
              // mudaram sozinhos (mandato §34, safety-critical).
              customerViewModel: {
                status: 'idle',
              },
              customerViewModelCycleId: null,
              customerViewModelConversationKey: null,
              customerViewModelCompanyId: null,
            }
          : {}),
      }

      renderPanel()

      if (options.resolveLeadAfterLoad === true && !state.isSelfConversation) {
        if (state.conversationPhone) {
          resolveCurrentLead()
        } else if (state.conversationKey) {
          runAutomaticContactLookup(
            state.conversationKey,
          )
        }
      } else if (
        companyChanged &&
        !state.isSelfConversation &&
        state.conversationPhone
      ) {
        // A resolução da empresa anterior foi invalidada acima e qualquer
        // resolve em voo pertence à boundary antiga: resolve de novo sob
        // a boundary da empresa nova.
        resolveCurrentLead()
      }
    } catch (error) {
      state = {
        ...state,
        connected: false,
        loading: false,
        lastError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao conectar com a Yolen.',
      }

      renderPanel()
    }
  }

  async function waitForVisibleAudioTargetsForRestore() {
    const expectedAudioCount =
      Number(state.audioCount || 0)

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const visibleTargets =
        getVisibleAudioTargets()

      if (
        expectedAudioCount > 0 &&
        visibleTargets.length >= expectedAudioCount
      ) {
        return visibleTargets
      }

      if (
        expectedAudioCount === 0 &&
        visibleTargets.length > 0
      ) {
        return visibleTargets
      }

      await sleep(250)
    }

    return getVisibleAudioTargets()
  }

  async function loadSavedAudioTranscriptionsForCurrentCycle() {
    const cycleId =
      getCanonicalResolutionCycleId()

    if (
      !cycleId ||
      !window.YolenCompanionApi
        ?.loadAudioTranscriptions
    ) {
      return
    }

    if (
      state.audioTranscriptionHistoryLoading ||
      state.audioTranscriptionHistoryCycleId === cycleId
    ) {
      return
    }

    const conversationKeyAtRequest =
      state.conversationKey

    state = {
      ...state,
      audioTranscriptionHistoryLoading: true,
    }

    try {
      const result =
        await window.YolenCompanionApi
          .loadAudioTranscriptions({
            cycle_id: cycleId,
          })

      if (
        state.conversationKey !==
          conversationKeyAtRequest ||
        getCanonicalResolutionCycleId() !==
          cycleId
      ) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        state = {
          ...state,
          audioTranscriptionHistoryLoading: false,
          audioTranscriptionHistoryCycleId:
            cycleId,
        }

        return
      }

      const savedTranscriptions =
        Array.isArray(
          result.payload?.data?.transcriptions,
        )
          ? result.payload.data.transcriptions
          : []

          const visibleTargets =
          await waitForVisibleAudioTargetsForRestore()

      const nextAudioTranscriptionsByKey = {
        ...(state.audioTranscriptionsByKey || {}),
      }

      let restoredCount = 0

      savedTranscriptions.forEach(
        (transcription) => {
          if (
            !transcription.audio_target_key ||
            !transcription.text
          ) {
            return
          }

          const target =
            visibleTargets.find(
              (visibleTarget) =>
                visibleTarget.key ===
                transcription.audio_target_key,
            )

          if (!target) {
            return
          }

          const transcriptionKey =
            getAudioTranscriptionKey(target)

          if (
            nextAudioTranscriptionsByKey[
              transcriptionKey
            ]?.text
          ) {
            return
          }

          nextAudioTranscriptionsByKey[
            transcriptionKey
          ] = {
            audioIndex: target.index,
            targetKey: target.key,
            capturedBlobId: null,
            text: transcription.text,
            occurredAt:
              transcription.occurred_at ||
              null,
          }

          restoredCount += 1
        },
      )

      state = {
        ...state,
        audioTranscriptionHistoryLoading: false,
        audioTranscriptionHistoryCycleId:
          cycleId,
        audioTranscriptionsByKey:
          nextAudioTranscriptionsByKey,
        audioTranscriptionStatus:
          restoredCount > 0
            ? `${restoredCount} transcrição(ões) recuperada(s) da Yolen.`
            : state.audioTranscriptionStatus,
      }

      renderPanel()

      if (restoredCount > 0) {
        scheduleCaptureIngestion()
      }
    } catch {
      if (
        state.conversationKey !==
        conversationKeyAtRequest
      ) {
        return
      }

      state = {
        ...state,
        audioTranscriptionHistoryLoading: false,
        audioTranscriptionHistoryCycleId:
          cycleId,
      }
    }
  }

  async function resolveCurrentLead() {
    if (
      !state.connected ||
      state.isSelfConversation
    ) {
      return
    }

    if (!state.conversationPhone) {
      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: null,
        leadResolutionViewModel: null,
        leadResolutionOutcome: null,
        leadResolutionBoundaryToken: null,
        leadResolutionError: null,
      }

      renderPanel()
      return
    }

    const phoneAtRequest =
      state.conversationPhone

    const keyAtRequest =
      state.conversationKey

    const titleAtRequest =
      state.conversationTitle

    if (!keyAtRequest) {
      return
    }

    const boundaryTokenAtRequest =
      conversationBoundary.captureToken()

    const resolutionInFlightKey = [
      boundaryTokenAtRequest.generation,
      keyAtRequest,
    ].join('::')

    if (
      leadResolutionInFlightKeys.has(
        resolutionInFlightKey,
      )
    ) {
      return
    }

    leadResolutionInFlightKeys.add(
      resolutionInFlightKey,
    )

    const canPreserveResolvedContext =
      Boolean(
        state.leadResolution &&
        state.leadResolutionViewModel &&
        state.leadResolutionOutcome &&
        state.leadResolutionBoundaryToken &&
        conversationBoundary.isTokenCurrent(
          state.leadResolutionBoundaryToken,
        ),
      )

    state = {
      ...state,
      leadResolutionLoading: true,
      leadResolution:
        canPreserveResolvedContext
          ? state.leadResolution
          : null,
      leadResolutionViewModel:
        canPreserveResolvedContext
          ? state.leadResolutionViewModel
          : null,
      leadResolutionOutcome:
        canPreserveResolvedContext
          ? state.leadResolutionOutcome
          : null,
      leadResolutionBoundaryToken:
        canPreserveResolvedContext
          ? state.leadResolutionBoundaryToken
          : null,
      leadResolutionError: null,
    }

    renderPanel()

    const requestStillCurrent = () => {
      return (
        conversationBoundary
          .isTokenCurrent(
            boundaryTokenAtRequest,
          ) &&
        state.conversationPhone ===
          phoneAtRequest &&
        state.conversationKey ===
          keyAtRequest
      )
    }

    try {
      const result =
        await coreApiComposition
          .resolveLead(
            {
              phone: phoneAtRequest,
              display_name: titleAtRequest,
              conversation_key: keyAtRequest,
            },
            {
              companyId:
                state.companyId || null,
              boundaryToken:
                boundaryTokenAtRequest.generation,
            },
          )

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        retainedPreResolutionCaptures.delete(
          keyAtRequest,
        )

        if (!requestStillCurrent()) {
          return
        }

        state = {
          ...state,
          leadResolutionLoading: false,
          leadResolution: null,
          leadResolutionViewModel: null,
          leadResolutionOutcome: null,
          leadResolutionBoundaryToken: null,
          leadResolutionError:
            result?.payload?.error ||
            'Não foi possível consultar o vínculo na Yolen.',
        }

        renderPanel()
        return
      }

      enqueueRetainedPreResolutionCapture(
        keyAtRequest,
        result.payload,
      )

      if (!requestStillCurrent()) {
        return
      }

      const resolutionViewModel =
        leadResolutionController
          .createDomainResolutionViewModel(
            result.payload,
          )

      const resolutionOutcome =
        leadResolutionController
          .deriveCanonicalResolutionOutcome(
            resolutionViewModel,
            {
              hasTrustedPhone:
                Boolean(phoneAtRequest),
            },
          )

      // Fonte única de verdade para sair de um estado de criação de lead
      // pendente (ver createLeadForCurrentConversation()/
      // resolveAfterLeadCreation()): QUALQUER resolveCurrentLead() bem
      // sucedido que encontre o lead fecha a pendência — não importa se
      // foi retryLeadLinkAfterCreation(), o botão global "Atualizar" ou
      // qualquer outro chamador legítimo desta mesma conversa. Antes,
      // só o caminho de retryLeadLinkAfterCreation() fazia essa limpeza,
      // então um resolve disparado pelo botão global podia deixar
      // "Lead criado, mas o vínculo ainda não foi atualizado." preso na
      // tela mesmo depois do vínculo já ter sido confirmado.
      const shouldClearPendingLeadCreation =
        result.payload.status !== 'NOT_FOUND' &&
        isLeadCreationPendingForConversation(
          keyAtRequest,
        )

      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: result.payload,
        leadResolutionViewModel:
          resolutionViewModel,
        leadResolutionOutcome:
          resolutionOutcome,
        leadResolutionBoundaryToken:
          boundaryTokenAtRequest,
        leadResolutionError: null,
        ...(shouldClearPendingLeadCreation
          ? {
              leadCreationStatus: null,
              leadCreationConversationKey: null,
              leadCreationError: null,
            }
          : {}),
      }

      renderPanel()

      loadSavedAudioTranscriptionsForCurrentCycle()
        .finally(() => {
          lockCurrentMessageWindow()
          refreshConversationSnapshot()

          scheduleCaptureIngestion()

          scheduleAutomaticAnalysis(
            'Lead localizado. A conversa será analisada automaticamente em 8 segundos.',
          )

          // Independente da análise semântica: dado operacional puro, não
          // precisa esperar o debounce da análise automática.
          void loadCompanionClientContextForCurrentCycle()
          void loadCompanionLeadSummaryForCurrentCycle()

          // AGORA (Decision State) já reflete qualquer leitura comercial
          // persistida anteriormente para este ciclo/conversa, mesmo
          // antes da nova análise automática concluir — atualizado de
          // novo quando essa análise terminar (ver runTick, status
          // 'succeeded').
          void loadAgoraDecisionStateForCurrentCycle()

          // FASE 16.6 — mesmo raciocínio para ANÁLISE (Integrated
          // Commercial Context): qualquer leitura/memória de ciclo já
          // persistida aparece de imediato, sem esperar uma nova
          // análise semântica.
          void loadAnalysisViewModelForCurrentCycle()

          // FASE 16.7 — mesmo raciocínio para CLIENTE.
          void loadCustomerViewModelForCurrentCycle()
        })
    } catch (error) {
      retainedPreResolutionCaptures.delete(
        keyAtRequest,
      )

      if (!requestStillCurrent()) {
        return
      }

      state = {
        ...state,
        leadResolutionLoading: false,
        leadResolution: null,
        leadResolutionViewModel: null,
        leadResolutionOutcome: null,
        leadResolutionBoundaryToken: null,
        leadResolutionError:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Erro ao localizar lead na Yolen.',
      }

      renderPanel()
    } finally {
      leadResolutionInFlightKeys.delete(
        resolutionInFlightKey,
      )
    }
  }

  function createActionTelemetryInteractionId() {
    const randomUuid =
      globalThis.crypto?.randomUUID?.()

    if (randomUuid) {
      return randomUuid
    }

    return [
      Date.now().toString(36),
      Math.random()
        .toString(36)
        .slice(2),
    ].join('-')
  }

  function buildActionTelemetryIdempotencyKey(
    actionType,
    seed,
    cycleId =
      getCanonicalResolutionCycleId(),
  ) {
    return [
      'companion-ui',
      actionType,
      cycleId || 'no-cycle',
      seed ||
        createActionTelemetryInteractionId(),
    ]
      .join(':')
      .slice(0, 200)
  }

  async function registerCompanionActionTelemetry(
    actionType,
    options = {},
  ) {
    const cycleId =
      options.cycleId ||
      getCanonicalResolutionCycleId()

    if (
      !cycleId ||
      !window.YolenCompanionApi
        ?.registerActionEvent
    ) {
      return {
        registered: false,
        alreadyRegistered: false,
      }
    }

    const coachingNoteId =
      options.coachingNoteId ??
      state.conversationAnalysis
        ?.saved_coaching?.id ??
      null

    const conversationKey =
      options.conversationKey ??
      getCaptureConversationKey() ??
      null

    const idempotencyKey =
      options.idempotencyKey ||
      buildActionTelemetryIdempotencyKey(
        actionType,
        options.seed,
        cycleId,
      )

    const metadata =
      options.metadata &&
      typeof options.metadata === 'object' &&
      !Array.isArray(options.metadata)
        ? options.metadata
        : {}

    const result =
      await window.YolenCompanionApi
        .registerActionEvent({
          cycle_id: cycleId,
          action_type: actionType,
          idempotency_key:
            idempotencyKey,
          coaching_note_id:
            coachingNoteId,
          conversation_key:
            conversationKey,
          metadata,
        })

    if (!result?.ok || !result.payload?.ok) {
      throw new Error(
        result?.payload?.error ||
          'Não foi possível registrar a telemetria da ação do Companion.',
      )
    }

    return {
      registered:
        result.payload?.data
          ?.already_registered !== true,
      alreadyRegistered:
        result.payload?.data
          ?.already_registered === true,
      eventId:
        result.payload?.data
          ?.event_id || null,
    }
  }

  function fireCompanionActionTelemetry(
    actionType,
    options = {},
  ) {
    void registerCompanionActionTelemetry(
      actionType,
      options,
    ).catch(() => {})
  }

  function getOperationalTelemetryTargets(
    suggestion,
  ) {
    const cycle =
      state.leadResolution?.cycle

    if (!suggestion || !cycle) {
      return {
        crmChanged: false,
        agendaChanged: false,
      }
    }

    const crmChanged =
      Boolean(
        suggestion.recommended_status &&
        suggestion.recommended_status !==
          cycle.status,
      )

    const agendaChanged =
      normalizeOperationalText(
        cycle.next_action,
      ) !==
        normalizeOperationalText(
          suggestion.next_action,
        ) ||
      getOperationalDateKey(
        cycle.next_action_date,
      ) !==
        getOperationalDateKey(
          suggestion.next_action_date,
        )

    return {
      crmChanged,
      agendaChanged,
    }
  }

  function registerSuggestionDecisionTelemetry({
    accepted,
    suggestion,
    cycleId,
  }) {
    const {
      crmChanged,
      agendaChanged,
    } =
      getOperationalTelemetryTargets(
        suggestion,
      )

    const interactionId =
      createActionTelemetryInteractionId()

    const commonOptions = {
      cycleId,
      seed: interactionId,
      metadata: {
        source: 'apply_confirmation',
      },
    }

    if (!accepted) {
      fireCompanionActionTelemetry(
        'suggestion_ignored',
        commonOptions,
      )
    }

    if (crmChanged) {
      fireCompanionActionTelemetry(
        accepted
          ? 'crm_accepted'
          : 'crm_rejected',
        commonOptions,
      )
    }

    if (agendaChanged) {
      fireCompanionActionTelemetry(
        accepted
          ? 'agenda_accepted'
          : 'agenda_rejected',
        commonOptions,
      )
    }
  }

  function registerSuggestionShownTelemetry({
    cycleId,
    analysis,
    conversationFingerprint,
    isAutomatic,
  }) {
    if (!analysis?.suggestion) {
      return
    }

    const coachingNoteId =
      analysis.saved_coaching?.id ||
      null

    const suggestionFingerprint =
      buildConversationFingerprint(
        JSON.stringify(
          analysis.suggestion,
        ),
      )

    const seed = [
      coachingNoteId || 'no-note',
      conversationFingerprint ||
        'no-conversation-fingerprint',
      suggestionFingerprint ||
        'no-suggestion-fingerprint',
    ].join(':')

    const idempotencyKey =
      buildActionTelemetryIdempotencyKey(
        'suggestion_shown',
        seed,
        cycleId,
      )

    if (
      registeredSuggestionShownTelemetryKeys
        .has(idempotencyKey)
    ) {
      return
    }

    registeredSuggestionShownTelemetryKeys
      .add(idempotencyKey)

    void registerCompanionActionTelemetry(
      'suggestion_shown',
      {
        cycleId,
        coachingNoteId,
        idempotencyKey,
        metadata: {
          source: 'analysis_completed',
          automatic:
            isAutomatic === true,
        },
      },
    ).catch(() => {
      registeredSuggestionShownTelemetryKeys
        .delete(idempotencyKey)
    })
  }

  // Valores explícitos da operação (cycleId/message/coachingNoteId) nunca
  // são completados com o estado atual: uma operação iniciada em A não
  // deriva ciclo, mensagem ou coaching de B.
  async function registerSuggestedMessageAction(action, options = {}) {
    const hasOption = (name) =>
      Object.prototype.hasOwnProperty.call(options, name)
    const cycleId = hasOption('cycleId')
      ? options.cycleId
      : getCanonicalResolutionCycleId()
    const message = hasOption('message')
      ? options.message
      : getSuggestedMessage()
    const coachingNoteId = hasOption('coachingNoteId')
      ? options.coachingNoteId || null
      : state.conversationAnalysis?.saved_coaching?.id || null

    if (!cycleId || !message || !window.YolenCompanionApi?.registerMessageAction) {
      return {
        registered: false,
        alreadyRegistered: false,
        registrationKey: null,
      }
    }

    const registrationKey = [
      cycleId,
      coachingNoteId || '-',
      action,
      message,
    ].join('::')

    if (state.suggestedMessageLastRegisteredKey === registrationKey) {
      return {
        registered: false,
        alreadyRegistered: false,
        registrationKey,
      }
    }

    const result = await window.YolenCompanionApi.registerMessageAction({
      cycle_id: cycleId,
      action,
      message,
      coaching_note_id: coachingNoteId,
    })

    if (!result?.ok || !result.payload?.ok) {
      throw new Error(
        result?.payload?.error ||
          'Não foi possível registrar o uso da mensagem sugerida na Yolen.',
      )
    }

    return {
      registered: result.payload?.data?.already_registered !== true,
      alreadyRegistered: result.payload?.data?.already_registered === true,
      registrationKey,
    }
  }

  function isProbablySameMessage(actualMessage, expectedMessage) {
    const actual = normalizeMessageText(actualMessage)
    const expected = normalizeMessageText(expectedMessage)

    if (!actual || !expected) {
      return false
    }

    if (actual === expected) {
      return true
    }

    if (expected.length >= 24 && actual.includes(expected)) {
      return true
    }

    if (actual.length >= 24 && expected.includes(actual)) {
      return true
    }

    const expectedStart = expected.slice(0, 80)

    return expectedStart.length >= 24 && actual.includes(expectedStart)
  }

  function resolveManualSendMessageToRegister(actualMessage, expectedMessage) {
    const actual = normalizeMessageText(actualMessage)
    const expected = normalizeMessageText(expectedMessage)

    if (!expected) {
      return actual
    }

    if (!actual) {
      return expected
    }

    if (actual === expected) {
      return expected
    }

    if (expected.length >= 24 && actual.includes(expected)) {
      return expected
    }

    if (actual.length >= 24 && expected.includes(actual)) {
      return expected
    }

    const duplicatedExpected = `${expected} ${expected}`

    if (actual === duplicatedExpected || actual.includes(duplicatedExpected)) {
      return expected
    }

    return actual
  }

  async function registerManualSuggestedMessageSend(finalMessage) {
    const pending = state.pendingSuggestedMessageSend

    if (!pending?.cycleId || !pending.message) {
      return
    }

    if (state.pendingSuggestedMessageSendRegistering) {
      return
    }

    if (!isOperationContextCurrent(pending.operationContext)) {
      return
    }

    const messageToRegister = resolveManualSendMessageToRegister(
      finalMessage,
      pending.message,
    )

    if (!messageToRegister || messageToRegister.length < 2) {
      return
    }

    const telemetryInteractionId =
      pending.telemetryInteractionId ||
      createActionTelemetryInteractionId()

    const normalizedFinalMessage =
      normalizeMessageText(
        finalMessage,
      )

    const normalizedSuggestedMessage =
      normalizeMessageText(
        pending.message,
      )

    const duplicatedSuggestedMessage =
      [
        normalizedSuggestedMessage,
        normalizedSuggestedMessage,
      ].join(' ')

    const wasEdited =
      Boolean(
        normalizedFinalMessage &&
        normalizedSuggestedMessage,
      ) &&
      normalizedFinalMessage !==
        normalizedSuggestedMessage &&
      normalizedFinalMessage !==
        duplicatedSuggestedMessage

    const telemetryOptions = {
      cycleId: pending.cycleId,
      coachingNoteId:
        pending.coachingNoteId,
      conversationKey:
        pending.telemetryConversationKey ||
        getCaptureConversationKey(),
      seed: telemetryInteractionId,
      metadata: {
        source: 'manual_send',
      },
    }

    if (wasEdited) {
      fireCompanionActionTelemetry(
        'suggestion_edited',
        telemetryOptions,
      )
    }

    fireCompanionActionTelemetry(
      'suggestion_sent',
      {
        ...telemetryOptions,
        metadata: {
          ...telemetryOptions.metadata,
          edited: wasEdited,
        },
      },
    )

    state = {
      ...state,
      pendingSuggestedMessageSendRegistering: true,
    }

    try {
      const registration = await registerSuggestedMessageAction('sent', {
        cycleId: pending.cycleId,
        coachingNoteId: pending.coachingNoteId,
        message: messageToRegister,
      })

      if (!isOperationContextCurrent(pending.operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus: registration.alreadyRegistered
          ? 'Envio manual já estava registrado na Yolen'
          : registration.registered
            ? 'Envio manual registrado na Yolen'
            : state.suggestedMessageCopyStatus,
        suggestedMessageLastRegisteredKey:
          registration.registrationKey || state.suggestedMessageLastRegisteredKey,
        pendingSuggestedMessageSend: null,
        pendingSuggestedMessageSendRegistering: false,
      }

      renderPanel()
    } catch {
      if (!isOperationContextCurrent(pending.operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Mensagem enviada manualmente, mas a Yolen não conseguiu registrar o envio.',
        pendingSuggestedMessageSend: null,
        pendingSuggestedMessageSendRegistering: false,
      }

      renderPanel()
    }
  }

  function checkPendingSuggestedMessageSentFromConversation() {
    const pending = state.pendingSuggestedMessageSend

    if (!pending?.cycleId || !pending.message) {
      return
    }

    if (state.pendingSuggestedMessageSendRegistering) {
      return
    }

    if (!isOperationContextCurrent(pending.operationContext)) {
      return
    }

    const latestOutgoingMessage = getLatestOutgoingVisibleMessageText()

    if (!isProbablySameMessage(latestOutgoingMessage, pending.message)) {
      return
    }

    registerManualSuggestedMessageSend(
      resolveManualSendMessageToRegister(latestOutgoingMessage, pending.message),
    )
  }

  function scheduleManualSendRegistration(attempt = null) {
    const currentMessage =
      attempt?.draftText ||
      getComposerText() ||
      state.pendingSuggestedMessageSend?.message ||
      ''

    if (!currentMessage) {
      return
    }

    const operationContext =
      captureOperationContext()

    window.setTimeout(() => {
      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      registerManualSuggestedMessageSend(currentMessage)
    }, 250)
  }

  // B4_PRE_SEND_GATE_START
  function decidePreSendAttempt({
    gateKey,
    bypassKey,
    cancelable,
    collapsed,
  }) {
    if (
      !gateKey ||
      collapsed === true
    ) {
      return 'allow'
    }

    if (bypassKey === gateKey) {
      return 'allow_once'
    }

    if (cancelable !== true) {
      return 'allow'
    }

    return 'block'
  }

  function getCurrentPreSendGateKey() {
    const assessment =
      state.preSendAssessment

    const supportedKinds =
      new Set([
        'wait_pressure',
        'sensitive_condition',
        'pending_issue',
        'method_premature_close',
        'agenda_conflict',
      ])

    if (
      !assessment ||
      typeof assessment.kind !== 'string' ||
      !supportedKinds.has(
        assessment.kind,
      ) ||
      typeof assessment.reason !== 'string' ||
      !assessment.reason.trim() ||
      !state.conversationKey ||
      !state.analyzedConversationFingerprint ||
      state.preSendAssessmentConversationKey !==
        state.conversationKey ||
      state.preSendAssessmentFingerprint !==
        state.analyzedConversationFingerprint ||
      state.conversationAnalysisLoading ||
      isCurrentAnalysisOutdated() ||
      getActiveCommercialReading()
        ?.analysis_status !== 'complete'
    ) {
      return null
    }

    const currentDraft =
      getComposerText()

    if (
      !currentDraft ||
      normalizeMessageText(
        currentDraft,
      ) !== state.preSendDraft
    ) {
      return null
    }

    return [
      state.conversationKey,
      state.analyzedConversationFingerprint,
      buildConversationFingerprint(
        state.preSendDraft,
      ),
      assessment.kind,
    ].join('::')
  }

  // Decide a tentativa física normalizada pelo adapter (§7.2
  // interceptSendAttempt). O cancelamento do evento é do adapter; o Core só
  // devolve se bloqueia.
  function interceptPreSendAttempt(attempt) {
    const gateKey =
      getCurrentPreSendGateKey()

    const decision =
      decidePreSendAttempt({
        gateKey,
        bypassKey:
          state.preSendBypassKey,
        cancelable:
          attempt?.cancelable === true,
        collapsed:
          panelCollapsed === true,
      })

    if (decision === 'allow') {
      return false
    }

    if (decision === 'allow_once') {
      state = {
        ...state,
        preSendGateOpen: false,
        preSendBypassKey: null,
      }

      renderPanel()
      return false
    }

    state = {
      ...state,
      preSendGateOpen: true,
      preSendBypassKey: null,
    }

    renderPanel()

    return true
  }

  let unsubscribeManualChannelSend = null

  function stopObservingManualChannelSend() {
    if (typeof unsubscribeManualChannelSend === 'function') {
      unsubscribeManualChannelSend()
    }

    unsubscribeManualChannelSend = null
    globalThis.__yolenCompanionManualSendObserverInstalled = false
  }

  function observeManualChannelSend() {
    const observerKey =
      '__yolenCompanionManualSendObserverInstalled'

    if (
      globalThis[observerKey] === true ||
      !hasChannelCapability('canInterceptSend')
    ) {
      return
    }

    globalThis[observerKey] = true

    // Evento de canal (ChannelAdapter): tentativa de envio manual pela
    // plataforma (botão enviar ou Enter no campo de mensagem), já
    // normalizada ({ kind, cancelable, conversationKey, draftText }). A
    // decisão de interceptar (gate pré-envio) e o registro são do Core; o
    // cancelamento físico é do adapter.
    unsubscribeManualChannelSend =
      channelAdapter.onSendAttempt(
        (attempt) => {
          // Tentativa numa conversa que o Core ainda não assumiu (janela do
          // observer): nenhum gate nem pendência desta conversa se aplica.
          if (
            (attempt?.conversationKey || null) !==
            (state.conversationKey || null)
          ) {
            return { block: false }
          }

          if (
            interceptPreSendAttempt(
              attempt,
            )
          ) {
            return { block: true }
          }

          scheduleManualSendRegistration(
            attempt,
          )

          return { block: false }
        },
      )
  }
  function reviewCurrentPreSendDraft() {
    state = {
      ...state,
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    renderPanel()

    channelAdapter.focusComposer()
  }

  function sendCurrentPreSendDraftAnyway() {
    const gateKey =
      getCurrentPreSendGateKey()

    if (!gateKey) {
      state = {
        ...state,
        preSendGateOpen: false,
        preSendBypassKey: null,
      }

      renderPanel()
      return
    }

    // Retomada presa à confirmação humana: mesma conversa/geração/empresa/
    // sessão e mesmo rascunho que o vendedor viu no gate.
    const operationContext =
      captureOperationContext()
    const confirmedDraft =
      state.preSendDraft

    state = {
      ...state,
      preSendGateOpen: false,
      preSendBypassKey: gateKey,
    }

    renderPanel()

    if (!channelAdapter.hasSendControl()) {
      state = {
        ...state,
        preSendBypassKey: null,
      }

      renderPanel()
      channelAdapter.focusComposer()
      return
    }

    window.setTimeout(
      () => {
        if (
          state.preSendBypassKey !== gateKey
        ) {
          return
        }

        if (
          !isOperationContextCurrent(operationContext) ||
          getCurrentPreSendGateKey() !== gateKey
        ) {
          state = {
            ...state,
            preSendGateOpen: false,
            preSendBypassKey: null,
          }

          renderPanel()
          return
        }

        const sendResult =
          channelAdapter.triggerSend({
            conversationKey:
              operationContext.conversationKey,
            draftText: confirmedDraft,
          })

        if (!sendResult.sent) {
          state = {
            ...state,
            preSendGateOpen: false,
            preSendBypassKey: null,
          }

          renderPanel()
          channelAdapter.focusComposer()
          return
        }

        window.setTimeout(
          () => {
            if (
              state.preSendBypassKey !==
              gateKey
            ) {
              return
            }

            state = {
              ...state,
              preSendGateOpen: false,
              preSendBypassKey: null,
            }

            renderPanel()
          },
          250,
        )
      },
      0,
    )
  }

  async function useCurrentPreSendSuggestion() {
    if (!getSuggestedMessage()) {
      return
    }

    state = {
      ...state,
      preSendGateOpen: false,
      preSendBypassKey: null,
    }

    renderPanel()

    await insertSuggestedMessageInChannelWithOptions({
      replaceExisting: true,
    })
  }

  function getPreSendGateActionsHtml() {
    const hasSuggestion =
      Boolean(getSuggestedMessage())

    return [
      '<div class="yolen-pre-send-gate-copy">',
        'Esta tentativa foi pausada. Você decide como continuar.',
      '</div>',

      '<div class="yolen-inline-actions yolen-pre-send-actions">',

        '<button',
          ' class="yolen-primary-button"',
          ' type="button"',
          ' data-yolen-action="review-pre-send-message"',
        '>',
          'Revisar mensagem',
        '</button>',

        hasSuggestion
          ? [
              '<button',
                ' class="yolen-secondary-button"',
                ' type="button"',
                ' data-yolen-action="use-pre-send-suggestion"',
              '>',
                'Usar sugestão Yolen',
              '</button>',
            ].join('')
          : '',

        '<button',
          ' class="yolen-tertiary-button yolen-pre-send-send-anyway"',
          ' type="button"',
          ' data-yolen-action="send-pre-send-anyway"',
        '>',
          'Enviar mesmo assim',
        '</button>',

      '</div>',

      '<div class="yolen-operational-note">',
        'Nada será enviado sem uma decisão sua.',
      '</div>',
    ].join('')
  }

  function observePreSendGateActions() {
    const observerKey =
      '__yolenCompanionPreSendGateActionsObserverInstalled'

    if (globalThis[observerKey] === true) {
      return
    }

    globalThis[observerKey] = true

    document.addEventListener(
      'click',
      (event) => {
        const actionElement =
          event.target?.closest?.(
            '[data-yolen-action]',
          )

        if (
          !actionElement ||
          !actionElement.closest(
            `#${PANEL_ID}`,
          )
        ) {
          return
        }

        const action =
          actionElement.getAttribute(
            'data-yolen-action',
          )

        if (
          action ===
          'review-pre-send-message'
        ) {
          reviewCurrentPreSendDraft()
          return
        }

        if (
          action ===
          'send-pre-send-anyway'
        ) {
          sendCurrentPreSendDraftAnyway()
          return
        }

        if (
          action ===
          'use-pre-send-suggestion'
        ) {
          void useCurrentPreSendSuggestion()
        }
      },
      true,
    )
  }

  // B4_PRE_SEND_GATE_END



  async function copySuggestedMessage() {
    if (isCurrentAnalysisOutdated()) {
      state = {
        ...state,
        suggestedMessageCopyStatus:
          'A conversa mudou. Analise novamente antes de copiar a mensagem.',
      }

      renderPanel()
      return
    }

    const message = getSuggestedMessage()

    if (!message) {
      return
    }

    const operationContext =
      captureOperationContext()
    const registrationValues = {
      cycleId:
        getCanonicalResolutionCycleId() ||
        null,
      coachingNoteId:
        state.conversationAnalysis
          ?.saved_coaching?.id ||
        null,
      message,
    }

    try {
      await navigator.clipboard.writeText(message)
    } catch {
      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus:
          'Não foi possível copiar automaticamente. Selecione e copie a mensagem manualmente.',
      }

      renderPanel()
      return
    }

    if (!isOperationContextCurrent(operationContext)) {
      return
    }

    fireCompanionActionTelemetry(
      'suggestion_copied',
      {
        seed:
          createActionTelemetryInteractionId(),
        metadata: {
          source: 'copy_button',
        },
      },
    )

    try {
      const registration =
        await registerSuggestedMessageAction(
          'copied',
          registrationValues,
        )

      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus: registration.alreadyRegistered
          ? 'Mensagem copiada. Uso já estava registrado na Yolen'
          : registration.registered
            ? 'Mensagem copiada e registrada na Yolen'
            : 'Mensagem copiada',
        suggestedMessageLastRegisteredKey:
          registration.registrationKey || state.suggestedMessageLastRegisteredKey,
      }

      renderPanel()
    } catch (error) {
      if (!isOperationContextCurrent(operationContext)) {
        return
      }

      state = {
        ...state,
        suggestedMessageCopyStatus:
          error instanceof Error && error.message
            ? `Mensagem copiada, mas não registrada: ${error.message}`
            : 'Mensagem copiada, mas não registrada na Yolen.',
      }

      renderPanel()
    }
  }

  function buildRichApplyConfirmationText(
    commercialReading,
  ) {
    if (
      !commercialReading ||
      !isRichCommercialReadingApplyCompatible(
        commercialReading,
      )
    ) {
      return null
    }

    const cycle =
      state
        .leadResolutionViewModel
        ?.cycle

    const crm =
      commercialReading
        ?.operations
        ?.crm

    const agenda =
      commercialReading
        ?.operations
        ?.agenda

    const lines = [
      'Confirmar atualização na Yolen?',
      '',
    ]

    if (
      crm
        ?.should_change_crm_stage ===
        true &&
      crm
        .recommended_status
    ) {
      const currentLabel =
        cycle?.status
          ? getStageLabel(
              cycle.status,
            )
          : null

      const targetLabel =
        getStageLabel(
          crm.recommended_status,
        )

      lines.push(
        currentLabel
          ? `CRM: ${currentLabel} → ${targetLabel}`
          : `CRM: ${targetLabel}`,
      )

      const rationale =
        getCommercialReadingDisplayText(
          crm.rationale,
        )

      if (rationale) {
        lines.push(
          `Motivo do CRM: ${rationale}`,
        )
      }
    }

    if (
      agenda
        ?.should_change_agenda ===
        true
    ) {
      const agendaDate =
        agenda
          .expected_next_action_at
          ? formatSuggestionDate(
              agenda
                .expected_next_action_at,
            )
          : null

      if (agendaDate) {
        lines.push(
          `Agenda: ${agendaDate}`,
        )
      }

      const rationale =
        getCommercialReadingDisplayText(
          agenda.rationale,
        )

      if (rationale) {
        lines.push(
          `Motivo da Agenda: ${rationale}`,
        )
      }
    }

    lines.push('')
    lines.push(
      'Nada será alterado sem sua confirmação.',
    )
    lines.push(
      'A atualização será registrada no histórico.',
    )

    return lines.join('\n')
  }

  function buildApplyConfirmationText() {
    const commercialReading =
      getActiveCommercialReading()

    if (commercialReading) {
      return (
        buildRichApplyConfirmationText(
          commercialReading,
        ) ||
        'Esta atualização não está disponível nesta leitura. Atualize a análise antes de tentar novamente.'
      )
    }

    const suggestion =
      state
        .conversationAnalysis
        ?.suggestion

    const currentStatus =
      state
        .leadResolutionViewModel
        ?.cycle
        ?.status ||
      '-'

    if (!suggestion) {
      return 'Confirmar aplicação da sugestão na Yolen?'
    }

    const lines = [
      'Confirmar aplicação da sugestão na Yolen?',
      '',
      `De: ${getStageLabel(currentStatus)}`,
      `Para: ${getStageLabel(
        suggestion.recommended_status,
      )}`,
    ]

    if (
      suggestion.next_action
    ) {
      lines.push(
        `Próxima ação: ${suggestion.next_action}`,
      )
    }

    if (
      suggestion.next_action_date
    ) {
      lines.push(
        `Data: ${formatSuggestionDate(
          suggestion.next_action_date,
        )}`,
      )
    }

    lines.push('')
    lines.push(
      'Essa ação vai atualizar o ciclo e registrar evento no histórico.',
    )

    return lines.join('\n')
  }

  async function applyCurrentSuggestion() {
    if (!canApplyCurrentSuggestion()) {
      return
    }

    const suggestion = state.conversationAnalysis?.suggestion
    const cycleId = getCanonicalResolutionCycleId()

    if (!suggestion || !cycleId) {
      state = {
        ...state,
        suggestionApplyLoading: false,
        suggestionApplyResult: null,
        suggestionApplyError: 'Sugestão ou ciclo não localizado para aplicação.',
      }

      renderPanel()
      return
    }

    const confirmed = window.confirm(buildApplyConfirmationText())

    registerSuggestionDecisionTelemetry({
      accepted: confirmed,
      suggestion,
      cycleId,
    })

    if (!confirmed) {
      return
    }

    state = {
      ...state,
      suggestionApplyLoading: true,
      suggestionApplyResult: null,
      suggestionApplyError: null,
    }

    renderPanel()

    try {
      const result = await window.YolenCompanionApi.applySuggestion({
        cycle_id: cycleId,
        applied_status: suggestion.recommended_status,
        next_action: suggestion.next_action,
        next_action_date: suggestion.next_action_date,
        edited_summary: suggestion.summary,
        suggestion,
        source: 'whatsapp_companion',
        audio_count: state.lastAnalysisAudioCount || 0,
        // O backend agora é fail-closed: só executa a escrita no CRM
        // quando confirmed_by_human === true. Este ponto do código só é
        // alcançado depois do `if (!confirmed) return` acima, ou seja,
        // o vendedor já confirmou explicitamente via window.confirm().
        confirmed_by_human: true,
      })

      if (!result?.ok || !result.payload?.ok || !result.payload?.data) {
        state = {
          ...state,
          suggestionApplyLoading: false,
          suggestionApplyResult: null,
          suggestionApplyError:
            result?.payload?.error ||
            'Não foi possível aplicar a sugestão na Yolen.',
        }

        renderPanel()
        return
      }

      const applied = result.payload.data

      const updatedLeadResolution =
        state.leadResolution
          ? {
              ...state.leadResolution,
              cycle: {
                ...state.leadResolution.cycle,
                status: applied.status,
                previous_status:
                  applied.previous_status,
                next_action:
                  applied.next_action,
                next_action_date:
                  applied.next_action_date,
              },
            }
          : state.leadResolution

      const updatedResolutionViewModel =
        updatedLeadResolution
          ? leadResolutionController
              .createDomainResolutionViewModel(
                updatedLeadResolution,
              )
          : state.leadResolutionViewModel

      state = {
        ...state,
        suggestionApplyLoading: false,
        suggestionApplyResult: applied,
        suggestionApplyError: null,
        leadResolution:
          updatedLeadResolution,
        leadResolutionViewModel:
          updatedResolutionViewModel,
      }

      renderPanel()
    } catch (error) {
      state = {
        ...state,
        suggestionApplyLoading: false,
        suggestionApplyResult: null,
        suggestionApplyError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao aplicar sugestão na Yolen.',
      }

      renderPanel()
    }
  }

  function startSessionAutoRefresh() {
    if (sessionRefreshTimerId) {
      window.clearInterval(sessionRefreshTimerId)
    }

    sessionRefreshTimerId = window.setInterval(() => {
      loadYolenSession({ showLoading: false })
    }, SESSION_REFRESH_INTERVAL_MS)
  }

  function observeChannelChanges() {
    // Evento de canal (ChannelAdapter): a página da plataforma mudou fora
    // do painel da Yolen. O Core decide o que reler e quando.
    channelAdapter.observeHostChanges(({
      conversationInstanceChanged,
    }) => {
      // O canal detectou, antes de qualquer gate (debounce, lookup em
      // voo), uma troca estrutural real da conversa (ACTIVE CHAT EPOCH) —
      // mesmo quando a conversationKey textual colide com um homônimo.
      if (conversationInstanceChanged) {
        // Se A ainda estiver em voo, garanta que B seja reconsultado
        // assim que o single-flight de A terminar.
        if (autoContactLookupInFlight) {
          autoContactLookupConversationRefreshPending =
            true
        }

        // Invalida telefone/workspace stale no evento bruto da fronteira,
        // antes do debounce e antes de uma resposta atrasada do canal
        // poder ser aplicada.
        refreshConversationSnapshot()
      }

      const visibleConversationKey =
        channelAdapter.getCurrentConversationKey()

      if (
        visibleConversationKey &&
        state.conversationKey &&
        visibleConversationKey !==
          state.conversationKey
      ) {
        // A identidade visível do WhatsApp já mudou. A mensagem/intenção
        // do cliente anterior não pode permanecer clicável nem durante o
        // debounce de 600 ms que estabiliza o DOM da nova conversa.
        messageController.clear()
      }

      window.clearTimeout(
        observeChannelChanges.timeoutId,
      )

      observeChannelChanges.timeoutId =
      window.setTimeout(() => {
        if (autoContactLookupInFlight) {
          const latestVisibleConversationKey =
            channelAdapter.getCurrentConversationKey()

          if (
            latestVisibleConversationKey &&
            latestVisibleConversationKey !==
              state.conversationKey
          ) {
            // Não descarta a troca A→B só porque a abertura automática
            // dos dados de A ainda está terminando. O finally do lookup
            // reaplica exatamente uma leitura do DOM já estabilizado.
            autoContactLookupConversationRefreshPending =
              true

            messageController.clear()
          }

          return
        }

        processObservedChannelChange()
      }, 600)
    })
  }

  observeChannelChanges.timeoutId = 0

  // B7_RUNTIME_HARDENING_START
  async function recoverCompanionRuntime(
    reason,
  ) {
    if (runtimeRecoveryInFlight) {
      return
    }

    runtimeRecoveryInFlight = true

    try {
      refreshConversationSnapshot()

      checkPendingSuggestedMessageSentFromConversation()

      await loadYolenSession({
        showLoading: false,
        resolveLeadAfterLoad: true,
      })

      if (!state.connected) {
        return
      }

      scheduleCaptureIngestion(0)

      const currentFingerprint =
        getCurrentConversationFingerprint()

      if (
        currentFingerprint &&
        currentFingerprint !==
          state.analyzedConversationFingerprint
      ) {
        scheduleAutomaticAnalysis(
          reason ||
            'A Yolen retomou a conversa e atualizará a análise em 8 segundos.',
        )
      }
    } finally {
      runtimeRecoveryInFlight = false
    }
  }

  function scheduleRuntimeRecovery(
    reason,
  ) {
    window.clearTimeout(
      runtimeRecoveryTimerId,
    )

    runtimeRecoveryTimerId =
      window.setTimeout(
        () => {
          runtimeRecoveryTimerId = 0

          void recoverCompanionRuntime(
            reason,
          )
        },
        RUNTIME_RECOVERY_DELAY_MS,
      )
  }

  function observeRuntimeRecovery() {
    window.addEventListener(
      'online',
      () => {
        scheduleRuntimeRecovery(
          'Conexão restabelecida. A Yolen atualizará a análise em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )

    window.addEventListener(
      'focus',
      () => {
        scheduleRuntimeRecovery(
          'Yolen retomada. A análise será atualizada em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )

    window.addEventListener(
      'pageshow',
      () => {
        scheduleRuntimeRecovery(
          `${platformDisplayName} retomado. A análise será atualizada em 8 segundos se a conversa mudou.`,
        )
      },
      true,
    )

    document.addEventListener(
      'visibilitychange',
      () => {
        if (
          document.visibilityState !==
          'visible'
        ) {
          return
        }

        scheduleRuntimeRecovery(
          'Yolen retomada após pausa. A análise será atualizada em 8 segundos se a conversa mudou.',
        )
      },
      true,
    )
  }
  // B7_RUNTIME_HARDENING_END

  return {
    createPanel,
    captureSessionFromHash,
    observeCompanionSessionHash,
    listenToChannelAudio,
    refreshConversationSnapshot,
    observeComposerDraftForPreSend,
    startCompanionClientContextTicker,
    loadPanelCollapsedPreference,
    renderPanel,
    loadYolenSession,
    observeManualChannelSend,
    stopObservingManualChannelSend,
    observePreSendGateActions,
    startSessionAutoRefresh,
    observeChannelChanges,
    observeRuntimeRecovery,
  }
}

const api = Object.freeze({
  create: createCompanionCore,
})

root.YolenCompanionCore = api

if (
  typeof module !== 'undefined' &&
  module.exports
) {
  module.exports = api
}
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
