;(function initYolenCompanionAnalysisController(root) {
function createCompanionAnalysisController(ctx) {
  // Dependências explícitas do Core (funções estáveis). Estado mutável do
  // Core (state, revisões do ledger, sequências) é lido via ctx.<nome> no
  // momento do uso.
  const {
    buildConversationFingerprint,
    buildConversationTextFromMessages,
    getCanonicalResolutionCycleId,
    getCaptureConversationKey,
    getComposerText,
    getCurrentConversationFingerprint,
    getPendingAudioCountForCurrentConversation,
    getSelectedChatActivitySnapshot,
    getStructuredMessagesForAnalysis,
    registerSuggestionShownTelemetry,
    renderPanel,
    updatePreSendAssessmentFromDraft,
  } = ctx
  // Dependências de outros controllers do Core: lidas via ctx no momento
  // da chamada (os controllers são criados em sequência).

  const AUTOMATIC_ANALYSIS_DELAY_MS = 8000
  // Override só para teste: permite exercitar o debounce real da análise
  // automática (mesmo setTimeout, mesma lógica de reagendamento contra uma
  // análise manual em voo) sem esperar 8s reais por teste. Em produção,
  // window.__yolenCompanionAutomaticAnalysisMsForTests nunca é definido,
  // então o valor efetivo é sempre AUTOMATIC_ANALYSIS_DELAY_MS.
  function getAutomaticAnalysisDelayMs() {
    const override =
      window.__yolenCompanionAutomaticAnalysisMsForTests

    return (
      typeof override === 'number' &&
      Number.isFinite(override) &&
      override >= 0
    )
      ? override
      : AUTOMATIC_ANALYSIS_DELAY_MS
  }
  // Teto de recuperação para o ciclo curto/síncrono de analyze-conversation.
  // Não existia nenhum timeout client-side para essa chamada. Reaproveita o
  // mesmo valor já estabelecido no motor V2 stateful para uma única chamada
  // de modelo (DEFAULT_STATEFUL_COPILOT_OPENAI_TIMEOUT_MS = 60_000, em
  // app/lib/companion/stateful-copilot-openai-provider.ts) — o caminho V1
  // síncrono pode encadear até duas chamadas de IA, mas se a resposta
  // rápida não chegar nem no teto de uma única chamada, é sinal de
  // travamento (promise perdida/nunca resolvida), não de lentidão normal, e
  // a UI precisa de uma via de recuperação em vez de ficar presa para
  // sempre em "Analisando".
  const ANALYSIS_REQUEST_WATCHDOG_MS = 60000

  // Override só para teste: permite exercitar o watchdog real (mesmo
  // setTimeout, mesma lógica de ownership) sem esperar 60s reais por
  // teste. Em produção, window.__yolenCompanionAnalysisWatchdogMsForTests
  // nunca é definido, então o valor efetivo é sempre
  // ANALYSIS_REQUEST_WATCHDOG_MS.
  function getAnalysisWatchdogDelayMs() {
    const override =
      window.__yolenCompanionAnalysisWatchdogMsForTests

    return (
      typeof override === 'number' &&
      Number.isFinite(override) &&
      override >= 0
    )
      ? override
      : ANALYSIS_REQUEST_WATCHDOG_MS
  }
  let automaticAnalysisTimerId = 0
  let automaticAnalysisScheduledKey = null
  // Incrementado a cada análise (automática ou manual) iniciada, qualquer
  // que seja a conversa. Usado por analyzeCurrentConversation() para saber,
  // quando uma resposta assíncrona chega, se ela ainda é a mais recente —
  // sem isso, uma resposta antiga da MESMA conversa poderia vencer uma
  // resposta mais nova (ex.: duplo clique em "Analisar agora").
  let conversationAnalysisRequestSequence = 0
  // Identidade explícita da tentativa que hoje é dona do loading —
  // { requestSequence, cycleId, conversationKey, source: 'manual'|'automatic' }
  // ou null quando não há nenhuma em voo. Preenchida no início de
  // analyzeCurrentConversation() e zerada quando ESSA MESMA tentativa
  // chega a um estado terminal (sucesso, erro ou watchdog) — nunca por
  // uma tentativa mais antiga, porque o próprio início de uma tentativa
  // nova já sobrescreve o valor. Existe para que
  // scheduleAutomaticAnalysis() saiba, sem depender do closure privado de
  // isAnalysisResponseStillCurrent(), se já existe uma análise MANUAL em
  // voo para a mesma conversa/ciclo e não deva competir com ela.
  let activeAnalysisAttempt = null
  // Timer do poller de análise profunda em curso (setTimeout id). Cada novo
  // ciclo de análise (analyzeCurrentConversation) cancela o timer anterior
  // antes de, no máximo, agendar um novo — nunca existem dois timers vivos
  // ao mesmo tempo.
  let deepAnalysisPollTimerId = 0
  const DEEP_ANALYSIS_POLL_DELAYS_MS = [1500, 2000, 3000, 4000, 5000]
  const DEEP_ANALYSIS_POLL_TIMEOUT_MS = 240000
  // Timer do watchdog da resposta rápida de analyze-conversation. Igual ao
  // padrão de deepAnalysisPollTimerId: cada novo ciclo de análise cancela o
  // timer anterior antes de agendar um novo — nunca existem dois vivos ao
  // mesmo tempo, e por isso o próprio início de um ciclo mais novo já
  // invalida o watchdog do ciclo anterior sem precisar de nenhuma
  // checagem extra.
  let analysisWatchdogTimerId = 0

  function isCurrentAnalysisOutdated() {
    if (
      !ctx.state.conversationAnalysis ||
      !ctx.state.analyzedConversationFingerprint
    ) {
      return false
    }

    const currentFingerprint =
      getCurrentConversationFingerprint()

    if (!currentFingerprint) {
      return false
    }

    return (
      currentFingerprint !==
      ctx.state.analyzedConversationFingerprint
    )
  }

  function clearAutomaticAnalysisTimer() {
    if (automaticAnalysisTimerId) {
      window.clearTimeout(
        automaticAnalysisTimerId,
      )
    }

    automaticAnalysisTimerId = 0
    automaticAnalysisScheduledKey = null
  }

  function getAutomaticAnalysisKey() {
    const conversationFingerprint =
      getCurrentConversationFingerprint()

    if (
      !ctx.state.conversationKey ||
      !conversationFingerprint
    ) {
      return null
    }

    return [
      ctx.state.conversationKey,
      conversationFingerprint,
    ].join('::')
  }

  function canScheduleAutomaticAnalysis() {
    const currentFingerprint =
      getCurrentConversationFingerprint()

    if (
      !canAnalyzeCurrentConversation() ||
      !currentFingerprint
    ) {
      return false
    }

    if (
      ctx.state.conversationAnalysisLoading ||
      ctx.state.suggestionApplyLoading ||
      ctx.state.audioTranscriptionLoading
    ) {
      return false
    }

    if (
      getPendingAudioCountForCurrentConversation() > 0
    ) {
      return false
    }

    if (
      ctx.state.analyzedConversationFingerprint ===
      currentFingerprint
    ) {
      return false
    }

    return true
  }

  function isManualAnalysisInFlightForCurrentIdentity() {
    return Boolean(
      activeAnalysisAttempt &&
      activeAnalysisAttempt.source ===
        'manual' &&
      activeAnalysisAttempt.cycleId ===
        getCanonicalResolutionCycleId() &&
      activeAnalysisAttempt
        .conversationKey ===
        getCaptureConversationKey(),
    )
  }

  function scheduleAutomaticAnalysis(message) {
    const scheduledKey =
      getAutomaticAnalysisKey()

    if (
      automaticAnalysisTimerId &&
      scheduledKey &&
      automaticAnalysisScheduledKey ===
        scheduledKey
    ) {
      return
    }

    clearAutomaticAnalysisTimer()

    if (
      !scheduledKey ||
      !canScheduleAutomaticAnalysis()
    ) {
      if (
        ctx.state.automaticAnalysisStatus &&
        !ctx.state.conversationAnalysisLoading
      ) {
        ctx.state = {
          ...ctx.state,
          automaticAnalysisStatus: null,
        }

        renderPanel()
      }

      return
    }

    automaticAnalysisScheduledKey =
      scheduledKey

    ctx.state = {
      ...ctx.state,
      automaticAnalysisStatus:
        message ||
        'A conversa será analisada automaticamente após alguns segundos sem novas mensagens.',
    }

    renderPanel()

    automaticAnalysisTimerId =
      window.setTimeout(() => {
        automaticAnalysisTimerId = 0

        const currentKey =
          getAutomaticAnalysisKey()

        if (
          !currentKey ||
          currentKey !==
            automaticAnalysisScheduledKey
        ) {
          automaticAnalysisScheduledKey = null
          return
        }

        // Nunca compete com uma análise MANUAL em voo para a mesma
        // conversa/ciclo — em vez de descartar o gatilho, adia pelo mesmo
        // debounce e tenta de novo depois que a manual terminar.
        if (
          isManualAnalysisInFlightForCurrentIdentity()
        ) {
          automaticAnalysisScheduledKey = null

          scheduleAutomaticAnalysis(
            message,
          )

          return
        }

        automaticAnalysisScheduledKey = null

        analyzeCurrentConversation({
          automatic: true,
        })
      }, getAutomaticAnalysisDelayMs())
  }

  function handleConversationActivityForAutomaticAnalysis() {
    const activitySnapshot =
      getSelectedChatActivitySnapshot()

    if (!activitySnapshot) {
      return
    }

    if (
      ctx.lastSelectedChatActivitySnapshot === null
    ) {
      ctx.lastSelectedChatActivitySnapshot =
        activitySnapshot
      return
    }

    if (
      activitySnapshot ===
      ctx.lastSelectedChatActivitySnapshot
    ) {
      return
    }

    ctx.lastSelectedChatActivitySnapshot =
      activitySnapshot

    scheduleAutomaticAnalysis(
      'Nova mensagem detectada. A Yolen aguardará 8 segundos antes de atualizar a análise.',
    )
  }

  function canAnalyzeCurrentConversation() {
    return Boolean(
      ctx.state.connected &&
      !ctx.state.isSelfConversation &&
      ctx.state
        .leadResolutionOutcome
        ?.workspace_ready === true
    )
  }

  // FASE 16.6 — ANÁLISE seller-facing view model (Integrated Commercial
  // Context canônico, FASE 16.4, traduzido por
  // app/lib/server/analysis-view-model.ts). Mesmo desenho de
  // loadAgoraDecisionStateForCurrentCycle acima (FASE 16.5) — três
  // estados, requestSequence monotônico contra respostas stale, e guard
  // de escopo por cycleId/conversationKey/companyId aplicado desde o
  // início (não descoberto em rodadas de revisão posteriores como
  // aconteceu com AGORA): cross-conversation/cross-company stale render
  // é o mesmo risco de segurança em qualquer aba seller-facing (mandato
  // FASE 16.6 §31/§32/§33).
  async function loadAnalysisViewModelForCurrentCycle(
    options = {},
  ) {
    const force =
      options.force === true

    const requestSequence =
      ++ctx.analysisViewModelRequestSequence

    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    const companyIdAtRequest =
      ctx.state.companyId ||
      null

    if (!cycleId || !conversationKey) {
      ctx.state = {
        ...ctx.state,
        analysisViewModel: {
          status: 'idle',
        },
        analysisViewModelCycleId:
          null,
        analysisViewModelConversationKey:
          null,
        analysisViewModelCompanyId:
          null,
      }

      renderPanel()
      return
    }

    const isSameContext =
      ctx.state.analysisViewModelCycleId ===
        cycleId &&
      ctx.state.analysisViewModelConversationKey ===
        conversationKey &&
      ctx.state.analysisViewModelCompanyId ===
        companyIdAtRequest

    const alreadyReady =
      isSameContext &&
      ctx.state.analysisViewModel
        ?.status === 'ready'

    if (alreadyReady && !force) {
      return
    }

    ctx.state = {
      ...ctx.state,
      analysisViewModelCycleId:
        cycleId,
      analysisViewModelConversationKey:
        conversationKey,
      analysisViewModelCompanyId:
        companyIdAtRequest,
    }

    const isStillCurrentContext =
      () =>
        requestSequence ===
          ctx.analysisViewModelRequestSequence &&
        ctx.state.analysisViewModelCycleId ===
          cycleId &&
        ctx.state.analysisViewModelConversationKey ===
          conversationKey &&
        ctx.state.analysisViewModelCompanyId ===
          companyIdAtRequest &&
        companyIdAtRequest ===
          (
            ctx.state.companyId ||
            null
          )

    try {
      const result =
        await window.YolenCompanionApi
          .loadAnalysisViewModel({
            cycle_id: cycleId,
            conversation_key:
              conversationKey,
          })

      if (!isStillCurrentContext()) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        if (!alreadyReady) {
          ctx.state = {
            ...ctx.state,
            analysisViewModel: {
              status: 'idle',
            },
          }

          renderPanel()
        }

        return
      }

      ctx.state = {
        ...ctx.state,
        analysisViewModel: {
          status: 'ready',
          data: result.payload.data,
        },
      }

      renderPanel()
    } catch {
      if (!isStillCurrentContext()) {
        return
      }

      if (!alreadyReady) {
        ctx.state = {
          ...ctx.state,
          analysisViewModel: {
            status: 'idle',
          },
        }

        renderPanel()
      }
    }
  }

  function clearDeepAnalysisPollTimer() {
    if (deepAnalysisPollTimerId) {
      window.clearTimeout(deepAnalysisPollTimerId)
      deepAnalysisPollTimerId = 0
    }
  }

  function clearAnalysisWatchdogTimer() {
    if (analysisWatchdogTimerId) {
      window.clearTimeout(analysisWatchdogTimerId)
      analysisWatchdogTimerId = 0
    }
  }

  // Acompanha, sem bloquear a UI, um job de análise profunda já criado pela
  // resposta rápida do analyze-conversation. Reaproveita a MESMA identidade
  // imutável de contexto (cycleId/conversationKeyAtRequest/requestSequence)
  // capturada por analyzeCurrentConversation() através de
  // isAnalysisResponseStillCurrent(): a cada tick, se a conversa/ciclo
  // mudou ou uma análise mais nova já começou, o resultado profundo é
  // descartado silenciosamente e nunca é aplicado a `state`.
  //
  // Backoff controlado (1.5s, 2s, 3s, 4s, 5s, 5s...), sem polling agressivo.
  // Timeout total limitado (DEEP_ANALYSIS_POLL_TIMEOUT_MS) — nunca há
  // polling infinito. Apenas um timer de poll vive por vez
  // (deepAnalysisPollTimerId): iniciar um novo poll sempre cancela o
  // anterior primeiro, então dois pollers "equivalentes" nunca aplicam
  // estado em duplicidade.
  // Fase 12A — V2 como único motor: este polling só existe para o job em
  // segundo plano do V2 (empresas em modo 'active'), que agora é o ÚNICO
  // resultado seller-facing — não há mais V1 já aplicado por baixo. Por
  // isso, ao chegar num estado terminal (succeeded/failed/superseded/
  // timeout), esta função também é responsável por tirar
  // conversationAnalysisLoading de true e, se necessário, mostrar
  // conversationAnalysisError com retry — antes, esses campos já tinham
  // sido resolvidos pela resposta rápida do V1 e este polling só atualizava
  // um indicador secundário.
  function startDeepAnalysisPolling({
    analysisJobId,
    cycleId,
    conversationKeyAtRequest,
    companyIdAtRequest,
    isAnalysisResponseStillCurrent,
    conversationFingerprint,
    isAutomatic,
  }) {
    clearDeepAnalysisPollTimer()

    const startedAtMs = Date.now()
    let attempt = 0

    const scheduleNextTick = () => {
      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      if (Date.now() - startedAtMs >= DEEP_ANALYSIS_POLL_TIMEOUT_MS) {
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysisError:
            'A análise demorou mais que o esperado. Tente novamente.',
          automaticAnalysisStatus: null,
          deepAnalysisStatus: 'failed',
          deepAnalysisResult: null,
        }

        renderPanel()
        return
      }

      const delay =
        DEEP_ANALYSIS_POLL_DELAYS_MS[
          Math.min(
            attempt,
            DEEP_ANALYSIS_POLL_DELAYS_MS.length - 1,
          )
        ]

      attempt += 1

      deepAnalysisPollTimerId =
        window.setTimeout(runTick, delay)
    }

    const runTick = async () => {
      deepAnalysisPollTimerId = 0

      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      let response = null

      try {
        response =
          await window.YolenCompanionApi
            .getAnalysisJobStatus({
              cycle_id: cycleId,
              conversation_key: conversationKeyAtRequest,
              analysis_job_id: analysisJobId,
            })
      } catch {
        response = null
      }

      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      const data =
        response?.ok && response.payload?.ok
          ? response.payload.data
          : null

      if (!data || typeof data.status !== 'string') {
        // Falha isolada de rede/servidor num único tick não vira estado de
        // erro seller-facing — apenas tenta de novo no próximo backoff.
        scheduleNextTick()
        return
      }

      if (data.status === 'queued' || data.status === 'running') {
        scheduleNextTick()
        return
      }

      if (data.status === 'succeeded') {
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysisError: null,
          analyzedConversationFingerprint:
            conversationFingerprint,
          automaticAnalysisStatus:
            isAutomatic
              ? 'Análise automática concluída.'
              : null,
          deepAnalysisStatus: 'succeeded',
          deepAnalysisResult: data.result || null,
          ...ctx.rememberLastKnownClientCommercialReadingIfPresent({
            fingerprint:
              conversationFingerprint,
            cycleId,
            conversationKey:
              conversationKeyAtRequest,
            companyId:
              companyIdAtRequest,
          }),
        }

        renderPanel()

        // Nova leitura comercial persistida — Decision State (e, por
        // consequência, o AGORA seller-facing view model) pode ter
        // mudado. `force: true` porque um estado "ready" antigo do
        // mesmo ciclo/conversa não deve ser tratado como já atualizado.
        void loadAgoraDecisionStateForCurrentCycle({
          force: true,
        })

        // FASE 16.6 — mesmo raciocínio para o Integrated Commercial
        // Context/ANÁLISE: uma nova leitura persistida muda estado da
        // venda, riscos, condução, coaching.
        void loadAnalysisViewModelForCurrentCycle({
          force: true,
        })

        // FASE 16.7 — mesmo raciocínio para CLIENTE: uma nova leitura
        // persistida pode mudar preferências, padrões de comunicação e
        // lacunas de descoberta.
        void ctx.loadCustomerViewModelForCurrentCycle({
          force: true,
        })

        return
      }

      if (data.status === 'superseded') {
        // Um job mais novo para a MESMA conversa já assumiu o lugar deste
        // job específico — mas, como o V2 é o único motor, não existe mais
        // nenhum resultado já aplicado por baixo para sustentar a UI: sem
        // erro explícito aqui, o loading ficaria preso sem via de escape.
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysisError:
            'A conversa mudou durante a análise. Tente novamente.',
          automaticAnalysisStatus: null,
          deepAnalysisStatus: null,
          deepAnalysisResult: null,
        }

        renderPanel()
        return
      }

      activeAnalysisAttempt = null

      ctx.state = {
        ...ctx.state,
        conversationAnalysisLoading: false,
        conversationAnalysisError:
          'Não foi possível concluir a leitura comercial da Yolen. Tente novamente.',
        automaticAnalysisStatus: null,
        deepAnalysisStatus: 'failed',
        deepAnalysisResult: null,
      }

      renderPanel()
    }

    scheduleNextTick()
  }

  async function analyzeCurrentConversation(
    options = {},
  ) {
    const isAutomatic =
      options.automatic === true

    const retryFailedJob =
      options.retryFailedJob === true

    clearDeepAnalysisPollTimer()
    clearAutomaticAnalysisTimer()
    clearAnalysisWatchdogTimer()

    if (!canAnalyzeCurrentConversation()) {
      if (isAutomatic) {
        ctx.state = {
          ...ctx.state,
          automaticAnalysisStatus: null,
        }

        renderPanel()
      }

      return
    }

    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKeyAtRequest =
      getCaptureConversationKey()

    // Identidade da EMPRESA no momento da requisição — nunca relida de
    // state depois disso. Sem isto, um job em voo iniciado na empresa A
    // que retorna succeeded depois de a sessão ativa já ter mudado para a
    // empresa B seria promovido lendo state.companyId (já B), gravando o
    // conhecimento de A com a identidade de B. Ver
    // isAnalysisResponseStillCurrent abaixo e
    // ctx.rememberLastKnownClientCommercialReadingIfPresent.
    const companyIdAtRequest =
      ctx.state.companyId ||
      null

    const companionMessages =
      getStructuredMessagesForAnalysis()

    const conversationText =
      buildConversationTextFromMessages(
        companionMessages,
      )

    if (!cycleId) {
      ctx.state = {
        ...ctx.state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError: 'Ciclo comercial não localizado para análise.',
      }

      renderPanel()
      return
    }

    if (!conversationText || conversationText.length < 15) {
      ctx.state = {
        ...ctx.state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError:
          'Não há texto suficiente visível na conversa para análise.',
        analyzedConversationFingerprint: null,
      }

      renderPanel()
      return
    }

    const conversationFingerprint =
      getCurrentConversationFingerprint() ||
      buildConversationFingerprint(
        conversationText,
      )

    const forceReanalysis =
      !isAutomatic ||
      ctx.messageLedgerRequiresRebase

    const mutationRevisionAtRequest =
      ctx.messageLedgerMutationRevision

    // Identidade imutável do contexto que pediu esta análise + número de
    // sequência da requisição. Quando a resposta (ou o erro) chegar,
    // isAnalysisResponseStillCurrent() responde "este resultado pertence
    // ao contexto para o qual foi iniciado, e nenhuma requisição mais nova
    // já começou?" — se não, a resposta é descartada silenciosamente e
    // NUNCA é aplicada a `state` (nunca sobrescreve a conversa/ciclo
    // atualmente visível, que já tem seu próprio estado zerado por
    // hardResetConversationWorkspace() na troca, ou preenchido por uma
    // análise mais recente). O resultado da conversa de origem não é
    // "destruído" por isso — ele simplesmente nunca chega a ser escrito
    // num `state` que já pertence a outra conversa.
    const requestSequence =
      ++conversationAnalysisRequestSequence

    // Ownership explícito desta tentativa — usado por
    // scheduleAutomaticAnalysis() para nunca competir com uma análise
    // manual em voo para a mesma identidade (ver
    // isManualAnalysisInFlightForCurrentIdentity). Sobrescreve qualquer
    // tentativa anterior; só é zerado por ESTA tentativa quando ela chega
    // a um estado terminal (sucesso, erro ou watchdog), ou pela troca de
    // conversa.
    activeAnalysisAttempt = {
      requestSequence,
      cycleId,
      conversationKey:
        conversationKeyAtRequest,
      source:
        isAutomatic
          ? 'automatic'
          : 'manual',
    }

    const isAnalysisResponseStillCurrent = () =>
      requestSequence ===
        conversationAnalysisRequestSequence &&
      companyIdAtRequest ===
        (
          ctx.state.companyId ||
          null
        ) &&
      globalThis.YolenCompanionConversationRegistrationTools
        .shouldApplyConversationRegistrationResult({
          requestCycleId: cycleId,
          requestConversationKey: conversationKeyAtRequest,
          currentCycleId: getCanonicalResolutionCycleId(),
          currentConversationKey: getCaptureConversationKey(),
        })

    ctx.state = {
      ...ctx.state,
      conversationAnalysisLoading: true,
      conversationAnalysis: null,
      conversationAnalysisError: null,
      analyzedConversationFingerprint: null,
      automaticAnalysisStatus:
        isAutomatic
          ? 'Analisando automaticamente as novas mensagens...'
          : null,
      deepAnalysisStatus: null,
      deepAnalysisResult: null,
      suggestionApplyLoading: false,
      suggestionApplyResult: null,
      suggestionApplyError: null,
      suggestedMessageCopyStatus: null,
      suggestedMessageLastRegisteredKey: null,
      pendingSuggestedMessageSend: null,
      pendingSuggestedMessageSendRegistering: false,
      lastAnalysisAudioCount: getPendingAudioCountForCurrentConversation(),

      // FASE 16.5 (recalibração seller-facing do AGORA): uma nova
      // tentativa de análise começando precisa "zerar" AGORA junto com
      // conversationAnalysis — senão AGORA continuaria mostrando a
      // decisão da tentativa ANTERIOR como se fosse atual enquanto a
      // nova tentativa ainda está em voo (mandato §24: loading não pode
      // parecer decisão). O guard de escopo em getNowAttentionSnapshotHtml
      // já usa estes dois campos para saber se o dado é do ciclo/
      // conversa certos; aqui eles são zerados para também refletir
      // "esta tentativa específica ainda não tem resposta", não só
      // "conversa errada".
      agoraDecisionState: {
        status: 'idle',
      },
      agoraDecisionStateCycleId: null,
      agoraDecisionStateConversationKey: null,
    }

    renderPanel()

    // Watchdog de recuperação: se esta mesma tentativa (dona do loading,
    // verificado via isAnalysisResponseStillCurrent) não chegar a um
    // estado terminal dentro do teto, a UI sai de "Analisando" sozinha em
    // vez de ficar presa para sempre. Uma tentativa mais nova já cancela
    // este timer no início da própria função (clearAnalysisWatchdogTimer),
    // então não há necessidade de checar ownership além do que
    // isAnalysisResponseStillCurrent() já garante.
    analysisWatchdogTimerId =
      window.setTimeout(() => {
        analysisWatchdogTimerId = 0

        if (!isAnalysisResponseStillCurrent()) {
          return
        }

        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysis: null,
          conversationAnalysisError:
            'A análise demorou mais que o esperado. Tente novamente.',
          analyzedConversationFingerprint: null,
          automaticAnalysisStatus: null,
        }

        renderPanel()
      }, getAnalysisWatchdogDelayMs())

    try {
      const result =
        await window.YolenCompanionApi
          .analyzeConversation({
            cycle_id: cycleId,
            conversation_key:
              conversationKeyAtRequest,
            conversation_text:
              conversationText,
            messages:
              companionMessages,
            source: 'whatsapp',
            audio_count:
              ctx.state.lastAnalysisAudioCount ||
              0,
            force_reanalysis:
              forceReanalysis,
            ...(retryFailedJob
              ? {
                  retry_failed_job:
                    true,
                }
              : {}),
            message_snapshot_hash:
              conversationFingerprint,
          })

      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      clearAnalysisWatchdogTimer()

      if (!result?.ok || !result.payload?.ok || !result.payload?.data) {
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysis: null,
          conversationAnalysisError:
            result?.payload?.error ||
            'Não foi possível analisar a conversa com IA.',
          automaticAnalysisStatus: null,
        }

        renderPanel()
        return
      }

      if (
        forceReanalysis &&
        ctx.messageLedgerMutationRevision ===
          mutationRevisionAtRequest
      ) {
        ctx.messageLedgerRequiresRebase =
          false
      }

      // Fase 12A — V2 como único motor: quando a resposta traz um job em
      // segundo plano (deep_analysis), esta é uma empresa no modo 'active'
      // e o V1 nunca foi chamado — não existe suggestion pronta aqui.
      // conversationAnalysis já aponta para este mesmo objeto (é o que o
      // polling abaixo vai mutar via promoteDeepSellerResult quando o job
      // terminar), mas loading/ownership só se resolvem no estado terminal
      // do polling. Quando NÃO há job (v1/shadow, não exposto ao V2), o
      // comportamento é o de sempre: a resposta já é o resultado final.
      if (result.payload.data.deep_analysis?.analysis_job_id) {
        ctx.state = {
          ...ctx.state,
          conversationAnalysis: result.payload.data,
        }
      } else if (result.payload.data.suggestion) {
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysis: result.payload.data,
          conversationAnalysisError: null,
          analyzedConversationFingerprint:
            conversationFingerprint,
          automaticAnalysisStatus:
            isAutomatic
              ? 'Análise automática concluída.'
              : null,
          ...ctx.rememberLastKnownClientCommercialReadingIfPresent({
            fingerprint:
              conversationFingerprint,
            cycleId,
            conversationKey:
              conversationKeyAtRequest,
            companyId:
              companyIdAtRequest,
            analysis:
              result.payload.data,
          }),
        }
      } else {
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysis: null,
          conversationAnalysisError:
            'Não foi possível iniciar a leitura comercial da Yolen. Tente novamente.',
          automaticAnalysisStatus: null,
        }

        renderPanel()
        return
      }

      updatePreSendAssessmentFromDraft(
        getComposerText(),
        { render: false },
      )

      renderPanel()

      const deepAnalysisJob =
        result.payload.data.deep_analysis

      if (
        deepAnalysisJob?.analysis_job_id &&
        (
          deepAnalysisJob.status === 'queued' ||
          deepAnalysisJob.status === 'running' ||
          deepAnalysisJob.status === 'succeeded'
        )
      ) {
        ctx.state = {
          ...ctx.state,
          deepAnalysisStatus: 'pending',
          deepAnalysisResult: null,
        }

        renderPanel()

        startDeepAnalysisPolling({
          analysisJobId:
            deepAnalysisJob.analysis_job_id,
          cycleId,
          conversationKeyAtRequest,
          companyIdAtRequest,
          isAnalysisResponseStillCurrent,
          conversationFingerprint,
          isAutomatic,
        })
      } else if (
        deepAnalysisJob?.analysis_job_id
      ) {
        // Status já veio 'failed' ou 'superseded' na própria resposta
        // rápida. Como o V2 é o único motor (sem V1 por baixo), isso é
        // terminal — sem via de escape, o loading ficaria preso.
        activeAnalysisAttempt = null

        ctx.state = {
          ...ctx.state,
          conversationAnalysisLoading: false,
          conversationAnalysisError:
            'Não foi possível concluir a leitura comercial da Yolen. Tente novamente.',
          automaticAnalysisStatus: null,
          deepAnalysisStatus:
            deepAnalysisJob.status === 'failed'
              ? 'failed'
              : null,
          deepAnalysisResult: null,
        }

        renderPanel()
      }

      if (result.payload.data.suggestion) {
        registerSuggestionShownTelemetry({
          cycleId,
          analysis:
            result.payload.data,
          conversationFingerprint,
          isAutomatic,
        })
      }

      if (
        ctx.messageLedgerMutationRevision !==
          mutationRevisionAtRequest ||
        getCurrentConversationFingerprint() !==
          conversationFingerprint
      ) {
        scheduleAutomaticAnalysis(
          'A conversa mudou durante a análise. A Yolen fará uma nova leitura em 8 segundos.',
        )
      }
    } catch (error) {
      if (!isAnalysisResponseStillCurrent()) {
        return
      }

      clearAnalysisWatchdogTimer()
      activeAnalysisAttempt = null

      ctx.state = {
        ...ctx.state,
        conversationAnalysisLoading: false,
        conversationAnalysis: null,
        conversationAnalysisError:
          error instanceof Error && error.message
            ? error.message
            : 'Erro ao analisar conversa com IA.',
            analyzedConversationFingerprint: null,
            automaticAnalysisStatus: null,
          }

      renderPanel()
    }
  }

  // FASE 16.5 — mesmo padrão acima, mas para o AGORA seller-facing view
  // model: identidade de escopo (cycleId/conversationKey) sozinha não
  // basta para saber se uma resposta em voo ainda é a mais recente — uma
  // requisição disparada ANTES de uma reanálise começar (mesmo ciclo/
  // conversa) pode resolver DEPOIS da requisição disparada pela própria
  // reanálise ao terminar, e sobrescrever um resultado fresco com um
  // stale (achado do Codex, PR #283). Incrementado a cada chamada de
  // loadAgoraDecisionStateForCurrentCycle(), qualquer que seja a
  // conversa; só a chamada cujo requestSequence capturado ainda é o mais
  // recente pode aplicar seu resultado.
  let agoraDecisionStateRequestSequence = 0

  // FASE 16.5 — AGORA seller-facing view model (Decision State canônico,
  // FASE 16.3E, traduzido por app/lib/server/agora-view-model.ts).
  // Mesmo padrão de três estados e mesmo guard de escopo
  // (isStillCurrentContext) de loadCompanionClientContextForCurrentCycle
  // acima — deliberadamente o mesmo desenho, não um novo: cross-
  // conversation stale render é o mesmo risco de segurança nos dois
  // casos (mandato §24/§25).
  async function loadAgoraDecisionStateForCurrentCycle(
    options = {},
  ) {
    const force =
      options.force === true

    // Toda chamada — mesmo a que sai cedo por falta de ciclo/conversa —
    // invalida qualquer requisição anterior ainda em voo: identidade de
    // escopo (cycleId/conversationKey) sozinha não prova que uma
    // resposta é a mais recente, porque uma reanálise pode disparar uma
    // nova chamada para o MESMO ciclo/conversa antes da anterior
    // resolver (achado do Codex, PR #283).
    const requestSequence =
      ++agoraDecisionStateRequestSequence

    const cycleId =
      getCanonicalResolutionCycleId()

    const conversationKey =
      getCaptureConversationKey()

    // Identidade da EMPRESA no momento da requisição (mesmo padrão de
    // companyIdAtRequest usado por scheduleConversationAnalysis/
    // startDeepAnalysisPolling): cycleId/conversationKey sozinhos não
    // provam que o dado pertence à empresa ativa — uma troca de empresa
    // ativa (loadYolenSession) enquanto o mesmo chat do WhatsApp
    // permanece selecionado não muda, por si só, cycleId/conversationKey
    // (achado do Codex, PR #283, rodada 3). Guardado tanto no closure
    // (isStillCurrentContext) quanto em `state`, para que uma resposta
    // "já pronta" (alreadyReady) de uma empresa anterior nunca seja
    // reaproveitada silenciosamente para a empresa nova.
    const companyIdAtRequest =
      ctx.state.companyId ||
      null

    if (!cycleId || !conversationKey) {
      ctx.state = {
        ...ctx.state,
        agoraDecisionState: {
          status: 'idle',
        },
        agoraDecisionStateCycleId:
          null,
        agoraDecisionStateConversationKey:
          null,
        agoraDecisionStateCompanyId:
          null,
      }

      renderPanel()
      return
    }

    const isSameContext =
      ctx.state.agoraDecisionStateCycleId ===
        cycleId &&
      ctx.state.agoraDecisionStateConversationKey ===
        conversationKey &&
      ctx.state.agoraDecisionStateCompanyId ===
        companyIdAtRequest

    const alreadyReady =
      isSameContext &&
      ctx.state.agoraDecisionState
        ?.status === 'ready'

    if (alreadyReady && !force) {
      return
    }

    ctx.state = {
      ...ctx.state,
      agoraDecisionStateCycleId:
        cycleId,
      agoraDecisionStateConversationKey:
        conversationKey,
      agoraDecisionStateCompanyId:
        companyIdAtRequest,
    }

    const isStillCurrentContext =
      () =>
        requestSequence ===
          agoraDecisionStateRequestSequence &&
        ctx.state.agoraDecisionStateCycleId ===
          cycleId &&
        ctx.state.agoraDecisionStateConversationKey ===
          conversationKey &&
        ctx.state.agoraDecisionStateCompanyId ===
          companyIdAtRequest &&
        companyIdAtRequest ===
          (
            ctx.state.companyId ||
            null
          )

    try {
      const result =
        await window.YolenCompanionApi
          .loadDecisionState({
            cycle_id: cycleId,
            conversation_key:
              conversationKey,
          })

      if (!isStillCurrentContext()) {
        return
      }

      if (
        !result?.ok ||
        !result.payload?.ok
      ) {
        // Igual ao client-context: uma falha transitória de busca em
        // segundo plano nunca substitui um AGORA já pronto por um erro —
        // fica quieto (idle) na primeira tentativa, ou mantém os dados
        // bons já exibidos numa atualização silenciosa.
        if (!alreadyReady) {
          ctx.state = {
            ...ctx.state,
            agoraDecisionState: {
              status: 'idle',
            },
          }

          renderPanel()
        }

        return
      }

      ctx.state = {
        ...ctx.state,
        agoraDecisionState: {
          status: 'ready',
          data: result.payload.data,
        },
      }

      renderPanel()
    } catch {
      if (!isStillCurrentContext()) {
        return
      }

      if (!alreadyReady) {
        ctx.state = {
          ...ctx.state,
          agoraDecisionState: {
            status: 'idle',
          },
        }

        renderPanel()
      }
    }
  }

  return {
    loadAgoraDecisionStateForCurrentCycle,
    get activeAnalysisAttempt() {
      return activeAnalysisAttempt
    },
    set activeAnalysisAttempt(value) {
      activeAnalysisAttempt = value
    },
    isCurrentAnalysisOutdated,
    clearAutomaticAnalysisTimer,
    scheduleAutomaticAnalysis,
    canAnalyzeCurrentConversation,
    loadAnalysisViewModelForCurrentCycle,
    clearDeepAnalysisPollTimer,
    clearAnalysisWatchdogTimer,
    analyzeCurrentConversation,
  }
}

const api = Object.freeze({
  create: createCompanionAnalysisController,
})

root.YolenCompanionAnalysisController = api

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
