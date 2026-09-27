// Bootstrap compartilhado do Companion (FASE 5/6): compõe o Companion Core
// único com um ChannelAdapter recebido por parâmetro e com as ferramentas
// compartilhadas (views, fronteira, resolução, resiliência). O content
// script de cada canal só cria o próprio adapter e chama
// YolenCompanionBootstrap.create({ channelAdapter }).start().
//
// Ciclo de vida opcional do adapter usado aqui (nomes conceituais do
// contrato §6 "detectar se a plataforma está pronta" e "executar operações
// inevitavelmente específicas da plataforma"):
// - whenReady(): Promise resolvida quando a plataforma está pronta;
// - startPlatform(): instala a mecânica física própria do canal (ex.:
//   bridges do page world). Nenhuma decisão de produto acontece nele.
;(function initYolenCompanionBootstrap(root) {
  'use strict'

  const RUNTIME_STARTED_KEY =
    '__yolenCompanionRuntimeStarted'

  function requireModule(value, message) {
    if (!value) {
      throw new Error(message)
    }

    return value
  }

  function resolveSharedTools(scope = root) {
    const messageMutationTools = requireModule(
      scope.YolenCompanionMessageMutations,
      'Módulo de integridade das mensagens do Companion não carregado.',
    )

    const captureBatchTools = requireModule(
      scope.YolenCompanionCaptureBatch,
      'Módulo de construção dos lotes de captura não carregado.',
    )

    const captureResilienceTools = scope.YolenCompanionCaptureResilience
    const nullBaseRebaseTools = scope.YolenCompanionNullBaseRebase

    if (!captureResilienceTools || !nullBaseRebaseTools) {
      throw new Error(
        'Módulos de resiliência da captura do Companion não carregados.',
      )
    }

    const clientContextViewTools = requireModule(
      scope.YolenCompanionClientContextView,
      'Módulo de inteligência operacional do cliente não carregado.',
    )

    // View seller-facing composta explicitamente com o raciocínio
    // comercial (companion-reasoning-view.js).
    const sellerInformationViewTools = requireModule(
      scope.YolenCompanionReasoningView
        ?.enhanceSellerInformationView(
          scope.YolenCompanionSellerInformationView,
        ),
      'Módulo de arquitetura seller-facing do Companion não carregado.',
    )

    const leadSummaryViewTools = requireModule(
      scope.YolenCompanionLeadSummaryView,
      'Módulo do resumo persistente do lead não carregado.',
    )

    const conversationBoundaryRuntime = requireModule(
      scope.YolenCompanionConversationBoundary,
      'Módulo da fronteira canônica de conversa do Companion não carregado.',
    )

    const leadResolutionController = requireModule(
      scope.YolenCompanionLeadResolutionController,
      'Controller canônico de resolução de lead do Companion não carregado.',
    )

    // Autoridade canônica ÚNICA das áreas seller-facing.
    const workspaceRuntime = requireModule(
      scope.YolenCompanionWorkspaceRuntime,
      'Módulo do workspace canônico do Companion não carregado.',
    )

    return {
      captureBatchTools,
      captureResilienceTools,
      clientContextViewTools,
      conversationBoundaryRuntime,
      leadEnrichmentTools: scope.YolenCompanionLeadEnrichment,
      leadResolutionController,
      leadSummaryViewTools,
      messageMutationTools,
      nullBaseRebaseTools,
      sellerInformationViewTools,
      workspaceRuntime,
    }
  }

  function createCompanionBootstrap({
    channelAdapter,
    scope = root,
  } = {}) {
    if (!channelAdapter) {
      throw new Error('ChannelAdapter ausente no bootstrap do Companion.')
    }

    const companionCore = requireModule(
      scope.YolenCompanionCore,
      'Companion Core não carregado.',
    ).create({
      channelAdapter,
      ...resolveSharedTools(scope),
    })

    async function start() {
      if (typeof channelAdapter.whenReady === 'function') {
        await channelAdapter.whenReady()
      }

      if (scope[RUNTIME_STARTED_KEY] === true) {
        return false
      }

      scope[RUNTIME_STARTED_KEY] = true

      await companionCore.loadPanelCollapsedPreference()

      companionCore.listenToChannelAudio()

      if (typeof channelAdapter.startPlatform === 'function') {
        channelAdapter.startPlatform()
      }

      companionCore.createPanel()
      companionCore.renderPanel()
      await companionCore.captureSessionFromHash()
      companionCore.observeCompanionSessionHash()
      companionCore.refreshConversationSnapshot()
      companionCore.observeChannelChanges()
      companionCore.observeRuntimeRecovery()
      companionCore.observeComposerDraftForPreSend()
      companionCore.observePreSendGateActions()
      companionCore.observeManualChannelSend()
      companionCore.startSessionAutoRefresh()
      companionCore.startCompanionClientContextTicker()
      companionCore.loadYolenSession({
        showLoading: true,
        resolveLeadAfterLoad: true,
      })

      return true
    }

    return Object.freeze({
      core: companionCore,
      start,
    })
  }

  const api = Object.freeze({
    create: createCompanionBootstrap,
  })

  root.YolenCompanionBootstrap = api

  if (
    typeof module !== 'undefined' &&
    module.exports
  ) {
    module.exports = api
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,
)
