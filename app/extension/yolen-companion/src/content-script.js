;(function initYolenCompanion() {
  const RUNTIME_STARTED_KEY =
    '__yolenCompanionRuntimeStarted'

  const messageMutationTools =
    globalThis
      .YolenCompanionMessageMutations

  const captureBatchTools =
    globalThis
      .YolenCompanionCaptureBatch

  const captureResilienceTools =
    globalThis
      .YolenCompanionCaptureResilience

  const nullBaseRebaseTools =
    globalThis
      .YolenCompanionNullBaseRebase

  const leadEnrichmentTools =
    globalThis
      .YolenCompanionLeadEnrichment

  const clientContextViewTools =
    globalThis
      .YolenCompanionClientContextView

  // View seller-facing composta explicitamente com o raciocínio comercial
  // (companion-reasoning-view.js) — antes, a view de raciocínio sobrescrevia
  // o global da view base.
  const sellerInformationViewTools =
    globalThis
      .YolenCompanionReasoningView
      ?.enhanceSellerInformationView(
        globalThis
          .YolenCompanionSellerInformationView,
      )

  const leadSummaryViewTools =
    globalThis
      .YolenCompanionLeadSummaryView

  const conversationBoundaryRuntime =
    globalThis
      .YolenCompanionConversationBoundary

  const leadResolutionController =
    globalThis
      .YolenCompanionLeadResolutionController

  // FASE 4A.1 — autoridade canônica ÚNICA das áreas seller-facing (lista,
  // ordem, rótulos, validação, navegação por teclado e HTML de abas/
  // painéis): companion-workspace-runtime.js. Este arquivo só recebe o
  // evento real, aplica foco/scroll e re-renderiza.
  const workspaceRuntime =
    globalThis
      .YolenCompanionWorkspaceRuntime

  if (!messageMutationTools) {
    throw new Error(
      'Módulo de integridade das mensagens do Companion não carregado.',
    )
  }

  if (!captureBatchTools) {
    throw new Error(
      'Módulo de construção dos lotes de captura não carregado.',
    )
  }

  if (!captureResilienceTools || !nullBaseRebaseTools) {
    throw new Error(
      'Módulos de resiliência da captura do Companion não carregados.',
    )
  }

  if (!clientContextViewTools) {
    throw new Error(
      'Módulo de inteligência operacional do cliente não carregado.',
    )
  }

  if (!sellerInformationViewTools) {
    throw new Error(
      'Módulo de arquitetura seller-facing do Companion não carregado.',
    )
  }

  if (!leadSummaryViewTools) {
    throw new Error(
      'Módulo do resumo persistente do lead não carregado.',
    )
  }

  if (!conversationBoundaryRuntime) {
    throw new Error(
      'Módulo da fronteira canônica de conversa do Companion não carregado.',
    )
  }

  if (!leadResolutionController) {
    throw new Error(
      'Controller canônico de resolução de lead do Companion não carregado.',
    )
  }

  if (!workspaceRuntime) {
    throw new Error(
      'Módulo do workspace canônico do Companion não carregado.',
    )
  }

  // ChannelAdapter do WhatsApp: toda leitura/escrita física da plataforma.
  const whatsAppAdapter =
    globalThis
      .YolenCompanionWhatsAppAdapter
      .create({
        normalizePrePlainText:
          captureResilienceTools
            .normalizeWhatsAppPrePlainText,
      })

  const {
    waitForWhatsAppApp,
    injectWhatsAppAudioBridge,
    listenToWhatsAppIdentityBridge,
  } = whatsAppAdapter

  // Companion Core único: estado, decisões, controllers e interface
  // seller-facing. Recebe o ChannelAdapter e as ferramentas por
  // dependência explícita.
  const companionCore =
    globalThis
      .YolenCompanionCore
      .create({
        channelAdapter: whatsAppAdapter,
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
      })

  const {
    captureSessionFromHash,
    createPanel,
    listenToWhatsAppAudioBridge,
    loadPanelCollapsedPreference,
    loadYolenSession,
    observeCompanionSessionHash,
    observeComposerDraftForPreSend,
    observeManualWhatsAppSend,
    observePreSendGateActions,
    observeRuntimeRecovery,
    observeWhatsAppChanges,
    refreshConversationSnapshot,
    renderPanel,
    startCompanionClientContextTicker,
    startSessionAutoRefresh,
  } = companionCore

  async function start() {
    await waitForWhatsAppApp()

    if (
      globalThis[RUNTIME_STARTED_KEY] ===
      true
    ) {
      return
    }

    globalThis[RUNTIME_STARTED_KEY] = true

    await loadPanelCollapsedPreference()

    listenToWhatsAppAudioBridge()
    injectWhatsAppAudioBridge()
    listenToWhatsAppIdentityBridge()
    createPanel()
    renderPanel()
    await captureSessionFromHash()
    observeCompanionSessionHash()
    refreshConversationSnapshot()
    observeWhatsAppChanges()
    observeRuntimeRecovery()
    observeComposerDraftForPreSend()
    observePreSendGateActions()
    observeManualWhatsAppSend()
    startSessionAutoRefresh()
    startCompanionClientContextTicker()
    loadYolenSession({
      showLoading: true,
      resolveLeadAfterLoad: true,
    })
  }

  start()
})()
