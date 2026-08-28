/* global browser, chrome */

;(function initYolenCompanionApi() {
  const DEFAULT_BASE_URL =
    'https://cockpit-comercial-vocn.vercel.app'

  const LOCAL_BASE_URL =
    'http://localhost:3000'

  // TEMP-TEST-ENV-FASE12A — ver app/companion/connect/page.tsx. Remover
  // junto com os outros pontos marcados TEMP-TEST-ENV-FASE12A.
  const TEMP_TEST_BASE_URL =
    'https://cockpit-comercial-vocn-git-claude-yolen-lead-persi-f5596b-yolen.vercel.app'

  let sessionBaseUrl = null
  let lastLeadLookupContext = null
  let messageDomRevision = 0

  /*
   * Freshness local do deep-result. Mantemos duas barreiras independentes:
   * 1) revisão semântica do payload efetivamente capturado;
   * 2) revisão imediata do DOM de mensagens, para fechar a janela entre uma
   *    mutação visual e o próximo debounce/ingest.
   */
  const captureMessagesByConversation =
    new Map()
  const captureRevisionByConversation =
    new Map()
  const analysisJobFreshnessById =
    new Map()
  const failedJobBySnapshotKey =
    new Map()

  function isRecord(value) {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    )
  }

  function getAllowedSessionBaseUrl(value) {
    if (
      value === DEFAULT_BASE_URL ||
      value === LOCAL_BASE_URL ||
      value === TEMP_TEST_BASE_URL
    ) {
      return value
    }

    return null
  }

  function rememberSessionBaseUrl(value) {
    const allowedBaseUrl =
      getAllowedSessionBaseUrl(value)

    if (allowedBaseUrl) {
      sessionBaseUrl = allowedBaseUrl
    }
  }

  function getRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      return browser.runtime
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return chrome.runtime
    }

    return null
  }

  // TEMP-TEST-ENV-FASE12A — ver app/companion/connect/page.tsx e
  // background.js. Mesma prioridade: o preview desta branch vence a
  // origem em que a sessão foi capturada, para não depender de reconectar
  // manualmente numa sessão já capturada em produção.
  function getBaseUrl() {
    return (
      TEMP_TEST_BASE_URL ||
      sessionBaseUrl ||
      DEFAULT_BASE_URL
    )
  }

  async function sendToBackground(action, payload) {
    const runtime = getRuntime()

    if (!runtime) {
      return {
        ok: false,
        statusCode: 500,
        payload: {
          ok: false,
          error: 'Runtime da extensão não disponível.',
        },
      }
    }

    try {
      return runtime.sendMessage({
        source: 'YOLEN_COMPANION',
        action,
        baseUrl: getBaseUrl(),
        payload: payload || null,
      })
    } catch (error) {
      return {
        ok: false,
        statusCode: 500,
        payload: {
          ok: false,
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Erro ao comunicar com o background da extensão.',
        },
      }
    }
  }

  function normalizeConversationKey(value) {
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : null
  }

  function buildSnapshotKey(
    conversationKey,
    messageWatermark,
  ) {
    if (
      !conversationKey ||
      typeof messageWatermark !== 'string' ||
      !messageWatermark.trim()
    ) {
      return null
    }

    return `${conversationKey}\u0000${messageWatermark.trim()}`
  }

  function getElementForNode(node) {
    if (!node) {
      return null
    }

    if (node.nodeType === 1) {
      return node
    }

    return node.parentElement || null
  }

  function nodeContainsWhatsAppMessage(node) {
    const element =
      getElementForNode(node)

    if (!element) {
      return false
    }

    if (
      typeof element.closest === 'function' &&
      element.closest('[data-pre-plain-text]')
    ) {
      return true
    }

    return (
      typeof element.matches === 'function' &&
      element.matches('[data-pre-plain-text]')
    ) || (
      typeof element.querySelector === 'function' &&
      Boolean(
        element.querySelector('[data-pre-plain-text]'),
      )
    )
  }

  function mutationTouchesWhatsAppMessage(mutation) {
    if (
      nodeContainsWhatsAppMessage(
        mutation?.target,
      )
    ) {
      return true
    }

    for (const collection of [
      mutation?.addedNodes,
      mutation?.removedNodes,
    ]) {
      if (!collection) {
        continue
      }

      for (const node of collection) {
        if (nodeContainsWhatsAppMessage(node)) {
          return true
        }
      }
    }

    return false
  }

  function installImmediateMessageMutationGuard() {
    if (
      typeof MutationObserver === 'undefined' ||
      typeof document === 'undefined' ||
      !document.documentElement
    ) {
      return
    }

    const observer =
      new MutationObserver(
        mutations => {
          if (
            mutations.some(
              mutationTouchesWhatsAppMessage,
            )
          ) {
            messageDomRevision += 1
          }
        },
      )

    observer.observe(
      document.documentElement,
      {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'data-pre-plain-text',
        ],
      },
    )
  }

  installImmediateMessageMutationGuard()

  function buildCaptureMessageSignature(message) {
    if (!isRecord(message)) {
      return null
    }

    const messageKey =
      typeof message.message_key === 'string'
        ? message.message_key.trim()
        : ''

    if (!messageKey) {
      return null
    }

    return {
      messageKey,
      signature: JSON.stringify({
        direction: message.direction ?? null,
        occurred_at: message.occurred_at ?? null,
        content_type: message.content_type ?? null,
        text_content: message.text_content ?? null,
        audio_transcription: message.audio_transcription ?? null,
        is_deleted: message.is_deleted === true,
      }),
    }
  }

  function registerCaptureFreshness(payload) {
    const conversationKey =
      normalizeConversationKey(
        payload?.conversation_key,
      )

    if (
      !conversationKey ||
      !Array.isArray(payload?.messages)
    ) {
      return
    }

    let messageMap =
      captureMessagesByConversation.get(
        conversationKey,
      )

    if (!messageMap) {
      messageMap = new Map()
      captureMessagesByConversation.set(
        conversationKey,
        messageMap,
      )
    }

    let changed = false

    for (const rawMessage of payload.messages) {
      const normalized =
        buildCaptureMessageSignature(
          rawMessage,
        )

      if (!normalized) {
        continue
      }

      if (
        messageMap.get(
          normalized.messageKey,
        ) !== normalized.signature
      ) {
        messageMap.set(
          normalized.messageKey,
          normalized.signature,
        )
        changed = true
      }
    }

    if (changed) {
      captureRevisionByConversation.set(
        conversationKey,
        (
          captureRevisionByConversation.get(
            conversationKey,
          ) || 0
        ) + 1,
      )
    }
  }

  function getCaptureRevision(conversationKey) {
    return (
      captureRevisionByConversation.get(
        conversationKey,
      ) || 0
    )
  }

  function isFreshnessStillCurrent(freshness) {
    return Boolean(
      freshness &&
      getCaptureRevision(
        freshness.conversationKey,
      ) === freshness.revisionAtRequest &&
      messageDomRevision ===
        freshness.domRevisionAtRequest
    )
  }

  function buildSyntheticSupersededResponse(
    analysisJobId,
    freshness,
  ) {
    return {
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        data: {
          analysis_job_id:
            analysisJobId,
          status:
            'superseded',
          message_watermark:
            freshness?.messageWatermark ||
            null,
          candidate_state_version:
            null,
          failure_code:
            null,
          result:
            null,
          result_generated_at:
            null,
        },
      },
    }
  }

  function rememberFailedSnapshot(freshness) {
    if (
      freshness?.snapshotKey &&
      freshness?.analysisJobId
    ) {
      failedJobBySnapshotKey.set(
        freshness.snapshotKey,
        freshness.analysisJobId,
      )
    }
  }

  function clearFailedSnapshot(freshness) {
    if (!freshness?.snapshotKey) {
      return
    }

    if (
      failedJobBySnapshotKey.get(
        freshness.snapshotKey,
      ) === freshness.analysisJobId
    ) {
      failedJobBySnapshotKey.delete(
        freshness.snapshotKey,
      )
    }
  }

  function promoteDeepSellerResult(
    deepResult,
    freshness,
  ) {
    if (
      !isRecord(deepResult) ||
      deepResult.contract_version !==
        'phase12a-deep-seller-v1' ||
      !isRecord(
        deepResult.commercial_reading,
      )
    ) {
      return null
    }

    const isCommercial =
      deepResult.commercial_relevance ===
        'commercial'

    const analysisData =
      freshness?.analysisDataRef

    /*
     * `result.payload.data` é o mesmo objeto que content-script guarda em
     * state.conversationAnalysis. Mutá-lo aqui, antes de devolver `succeeded`,
     * promove o deep result para a arquitetura seller-facing já existente sem
     * criar um segundo estado paralelo.
     */
    if (isRecord(analysisData)) {
      const previousSuggestion =
        isRecord(analysisData.suggestion)
          ? analysisData.suggestion
          : {}

      const previousCoaching =
        isRecord(analysisData.coaching)
          ? analysisData.coaching
          : {}

      analysisData.engine_source =
        'stateful'

      analysisData.commercial_reading =
        deepResult.commercial_reading

      analysisData.commercial_relevance =
        deepResult.commercial_relevance

      analysisData.suggestion = {
        ...previousSuggestion,
        summary:
          typeof deepResult.summary === 'string'
            ? deepResult.summary
            : previousSuggestion.summary ?? '',
        next_action:
          isCommercial &&
          typeof deepResult.recommended_next_approach === 'string'
            ? deepResult.recommended_next_approach
            : null,
        next_action_date:
          isCommercial
            ? previousSuggestion.next_action_date ?? null
            : null,
        recommended_status:
          isCommercial
            ? previousSuggestion.recommended_status ?? null
            : null,
      }

      analysisData.coaching =
        isCommercial
          ? {
              ...previousCoaching,
              recommended_next_approach:
                deepResult.recommended_next_approach ?? null,
              recommended_question:
                deepResult.recommended_question ?? null,
              suggested_message:
                deepResult.suggested_message ?? null,
            }
          : {
              recommended_next_approach:
                null,
              recommended_question:
                null,
              suggested_message:
                null,
            }
    }

    /*
     * Compatibilidade temporária com o bloco mínimo de progresso do #209.
     * O payload público do servidor continua sendo DTO mínimo; estes campos
     * são montados apenas dentro da extensão para o renderer legado.
     */
    return {
      ...deepResult,
      interpretation: {
        current_moment: {
          summary:
            deepResult.summary ?? '',
        },
      },
      strategy: {
        suggested_message:
          isCommercial
            ? deepResult.suggested_message ?? null
            : null,
      },
    }
  }

  async function getMe() {
    const result =
      await sendToBackground(
        'GET_ME',
      )

    if (result?.ok) {
      rememberSessionBaseUrl(
        result.origin,
      )
    }

    return result
  }

  async function setSession(session) {
    const result =
      await sendToBackground(
        'SET_SESSION',
        {
          session,
        },
      )

    if (result?.ok) {
      rememberSessionBaseUrl(
        session?.origin,
      )
    }

    return result
  }

  async function clearSession() {
    const result =
      await sendToBackground(
        'CLEAR_SESSION',
      )

    if (result?.ok) {
      sessionBaseUrl = null
      lastLeadLookupContext = null
      captureMessagesByConversation.clear()
      captureRevisionByConversation.clear()
      analysisJobFreshnessById.clear()
      failedJobBySnapshotKey.clear()
    }

    return result
  }

  async function resolveLead(payload) {
    // conversation_key é somente para o Companion nunca reaproveitar este
    // contexto numa conversa diferente (ver getLastLeadLookupContext) — o
    // backend de resolve-lead não espera esse campo, então ele nunca é
    // encaminhado em sendToBackground.
    const {
      conversation_key: conversationKey,
      ...backendPayload
    } = payload || {}

    lastLeadLookupContext = {
      conversation_key: conversationKey
        ? String(conversationKey)
        : null,
      phone: payload?.phone
        ? String(payload.phone)
        : null,
      display_name: payload?.display_name
        ? String(payload.display_name)
        : null,
    }

    return sendToBackground('RESOLVE_LEAD', backendPayload)
  }

  // Sem conversationKey: comportamento antigo, devolve o último contexto
  // resolvido (compatibilidade). Com conversationKey: só devolve o
  // contexto se ele realmente pertencer a essa conversa — nunca vaza o
  // telefone/nome de uma conversa anterior para o formulário de outra.
  function getLastLeadLookupContext(conversationKey) {
    if (!lastLeadLookupContext) {
      return null
    }

    if (
      conversationKey &&
      lastLeadLookupContext.conversation_key &&
      lastLeadLookupContext.conversation_key !== conversationKey
    ) {
      return null
    }

    return { ...lastLeadLookupContext }
  }

  async function createLead(payload) {
    return sendToBackground('CREATE_LEAD', payload)
  }

  async function applyLeadEnrichment(payload) {
    return sendToBackground(
      'APPLY_LEAD_ENRICHMENT',
      payload,
    )
  }

  async function analyzeConversation(payload) {
    const conversationKey =
      normalizeConversationKey(
        payload?.conversation_key,
      )

    const messageWatermark =
      typeof payload?.message_snapshot_hash === 'string'
        ? payload.message_snapshot_hash
        : null

    const snapshotKey =
      buildSnapshotKey(
        conversationKey,
        messageWatermark,
      )

    /*
     * Só existe candidato a retry quando esta própria sessão já observou o
     * mesmo snapshot terminar em `failed`. O auto-analysis não repete um
     * fingerprint inalterado; portanto a próxima chamada desse snapshot é o
     * fluxo manual "Analisar agora/Atualizar análise".
     */
    const failedJobAtStart =
      snapshotKey
        ? failedJobBySnapshotKey.get(
            snapshotKey,
          ) || null
        : null

    const revisionAtRequest =
      conversationKey
        ? getCaptureRevision(
            conversationKey,
          )
        : 0

    const domRevisionAtRequest =
      messageDomRevision

    const result =
      await sendToBackground(
        'ANALYZE_CONVERSATION',
        payload,
      )

    let deepAnalysis =
      result?.payload?.data?.deep_analysis

    if (
      conversationKey &&
      deepAnalysis?.analysis_job_id
    ) {
      const freshness = {
        analysisJobId:
          deepAnalysis.analysis_job_id,
        conversationKey,
        revisionAtRequest,
        domRevisionAtRequest,
        messageWatermark:
          typeof deepAnalysis.message_watermark === 'string'
            ? deepAnalysis.message_watermark
            : messageWatermark,
        snapshotKey:
          buildSnapshotKey(
            conversationKey,
            typeof deepAnalysis.message_watermark === 'string'
              ? deepAnalysis.message_watermark
              : messageWatermark,
          ),
        analysisDataRef:
          result?.payload?.data ||
          null,
      }

      analysisJobFreshnessById.set(
        deepAnalysis.analysis_job_id,
        freshness,
      )

      if (
        deepAnalysis.status === 'failed' &&
        failedJobAtStart ===
          deepAnalysis.analysis_job_id &&
        isFreshnessStillCurrent(
          freshness,
        )
      ) {
        const retryResult =
          await sendToBackground(
            'RETRY_ANALYSIS_JOB',
            {
              analysis_job_id:
                deepAnalysis.analysis_job_id,
            },
          )

        const retried =
          retryResult?.payload?.data

        if (
          retryResult?.ok &&
          retryResult?.payload?.ok &&
          retried?.analysis_job_id ===
            deepAnalysis.analysis_job_id &&
          (
            retried.status === 'queued' ||
            retried.status === 'running'
          )
        ) {
          deepAnalysis = {
            ...deepAnalysis,
            status:
              retried.status,
            message_watermark:
              retried.message_watermark ||
              deepAnalysis.message_watermark,
          }

          result.payload.data.deep_analysis =
            deepAnalysis

          clearFailedSnapshot(
            freshness,
          )
        } else {
          rememberFailedSnapshot(
            freshness,
          )
        }
      } else if (
        deepAnalysis.status === 'failed'
      ) {
        rememberFailedSnapshot(
          freshness,
        )
      } else {
        clearFailedSnapshot(
          freshness,
        )
      }
    }

    return result
  }

  async function applySuggestion(payload) {
    return sendToBackground('APPLY_SUGGESTION', payload)
  }

  async function getAnalysisJobStatus(payload) {
    const analysisJobId =
      typeof payload?.analysis_job_id === 'string'
        ? payload.analysis_job_id
        : null

    const freshness =
      analysisJobId
        ? analysisJobFreshnessById.get(
            analysisJobId,
          )
        : null

    if (
      analysisJobId &&
      freshness &&
      !isFreshnessStillCurrent(
        freshness,
      )
    ) {
      return buildSyntheticSupersededResponse(
        analysisJobId,
        freshness,
      )
    }

    const result =
      await sendToBackground(
        'GET_ANALYSIS_JOB_STATUS',
        analysisJobId
          ? {
              analysis_job_id:
                analysisJobId,
            }
          : payload,
      )

    const data =
      result?.payload?.data

    if (
      result?.ok &&
      result?.payload?.ok &&
      data?.status === 'succeeded' &&
      freshness &&
      (
        !isFreshnessStillCurrent(
          freshness,
        ) ||
        (
          freshness.messageWatermark &&
          data.message_watermark !==
            freshness.messageWatermark
        )
      )
    ) {
      return buildSyntheticSupersededResponse(
        analysisJobId,
        freshness,
      )
    }

    if (
      result?.ok &&
      result?.payload?.ok &&
      data?.status === 'failed' &&
      freshness
    ) {
      rememberFailedSnapshot(
        freshness,
      )
    }

    if (
      result?.ok &&
      result?.payload?.ok &&
      data?.status === 'succeeded' &&
      freshness
    ) {
      const promoted =
        promoteDeepSellerResult(
          data.result,
          freshness,
        )

      // TEMP-DIAG-FASE12A — instrumentação temporária, somente console,
      // somente booleanos/enums/contagens. Remover após o diagnóstico.
      const __diagCustomer =
        promoted?.commercial_reading?.customer

      console.log(
        '[FASE12A-DIAG]',
        'promote-attempt',
        {
          promote_succeeded: Boolean(promoted),
          engine_source_after_promotion:
            freshness.analysisDataRef?.engine_source ?? null,
          commercial_relevance: promoted?.commercial_relevance ?? null,
          commercial_role: promoted?.commercial_role ?? null,
          has_commercial_reading: Boolean(promoted?.commercial_reading),
          customer_counts: __diagCustomer
            ? {
                objectives: __diagCustomer.objectives?.length ?? 0,
                problems: __diagCustomer.problems?.length ?? 0,
                needs: __diagCustomer.needs?.length ?? 0,
                interests: __diagCustomer.interests?.length ?? 0,
                objections: __diagCustomer.objections?.length ?? 0,
                discussed_products:
                  __diagCustomer.discussed_products?.length ?? 0,
              }
            : null,
        },
      )
      // TEMP-DIAG-FASE12A — fim

      if (!promoted) {
        return {
          ok: false,
          statusCode: 502,
          payload: {
            ok: false,
            code:
              'INVALID_DEEP_SELLER_RESULT',
            error:
              'A análise aprofundada retornou um contrato incompatível.',
          },
        }
      }

      data.result =
        promoted

      clearFailedSnapshot(
        freshness,
      )
    }

    return result
  }

  async function loadClientContext(payload) {
    return sendToBackground(
      'LOAD_CLIENT_CONTEXT',
      payload,
    )
  }

  async function registerMessageAction(payload) {
    return sendToBackground('REGISTER_MESSAGE_ACTION', payload)
  }

  async function registerActionEvent(payload) {
    return sendToBackground('REGISTER_ACTION_EVENT', payload)
  }

  async function transcribeAudio(payload) {
    return sendToBackground('TRANSCRIBE_AUDIO', payload)
  }

  async function loadAudioTranscriptions(payload) {
    return sendToBackground(
      'LOAD_AUDIO_TRANSCRIPTIONS',
      payload,
    )
  }

  async function ingestCapturedMessages(payload) {
    registerCaptureFreshness(
      payload,
    )

    return sendToBackground(
      'INGEST_CAPTURE_MESSAGES',
      payload,
    )
  }

  async function previewConversationRegistration(payload) {
    return sendToBackground(
      'PREVIEW_CONVERSATION_REGISTRATION',
      payload,
    )
  }

  async function confirmConversationRegistration(payload) {
    return sendToBackground(
      'CONFIRM_CONVERSATION_REGISTRATION',
      payload,
    )
  }

  async function loadLeadSummary(payload) {
    return sendToBackground('LOAD_LEAD_SUMMARY', payload)
  }

  async function saveLeadSummary(payload) {
    return sendToBackground('SAVE_LEAD_SUMMARY', payload)
  }

  window.YolenCompanionApi = {
    getBaseUrl,
    getMe,
    setSession,
    clearSession,
    resolveLead,
    getLastLeadLookupContext,
    createLead,
    applyLeadEnrichment,
    analyzeConversation,
    applySuggestion,
    getAnalysisJobStatus,
    loadClientContext,
    registerMessageAction,
    registerActionEvent,
    transcribeAudio,
    loadAudioTranscriptions,
    ingestCapturedMessages,
    previewConversationRegistration,
    confirmConversationRegistration,
    loadLeadSummary,
    saveLeadSummary,
  }
})()
