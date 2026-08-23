/* global browser, chrome */

;(function initYolenCompanionApi() {
  const DEFAULT_BASE_URL =
    'https://cockpit-comercial-vocn.vercel.app'

  const LOCAL_BASE_URL =
    'http://localhost:3000'

  let sessionBaseUrl = null
  let lastLeadLookupContext = null

  /*
   * Freshness local do deep-result. O capture pipeline já observa
   * add/edit/delete/restore/transcrição imediatamente, antes do debounce
   * da próxima análise. Mantemos uma revisão semântica por conversa para
   * retirar autoridade de um job antigo assim que a captura muda.
   */
  const captureMessagesByConversation =
    new Map()
  const captureRevisionByConversation =
    new Map()
  const analysisJobFreshnessById =
    new Map()

  function getAllowedSessionBaseUrl(value) {
    if (
      value === DEFAULT_BASE_URL ||
      value === LOCAL_BASE_URL
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

  function getBaseUrl() {
    return (
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

  function buildCaptureMessageSignature(message) {
    if (!message || typeof message !== 'object') {
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
    }

    return result
  }

  async function resolveLead(payload) {
    lastLeadLookupContext = {
      phone: payload?.phone
        ? String(payload.phone)
        : null,
      display_name: payload?.display_name
        ? String(payload.display_name)
        : null,
    }

    return sendToBackground('RESOLVE_LEAD', payload)
  }

  function getLastLeadLookupContext() {
    return lastLeadLookupContext
      ? { ...lastLeadLookupContext }
      : null
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

    const revisionAtRequest =
      conversationKey
        ? getCaptureRevision(
            conversationKey,
          )
        : 0

    const result =
      await sendToBackground(
        'ANALYZE_CONVERSATION',
        payload,
      )

    const deepAnalysis =
      result?.payload?.data?.deep_analysis

    if (
      conversationKey &&
      deepAnalysis?.analysis_job_id
    ) {
      analysisJobFreshnessById.set(
        deepAnalysis.analysis_job_id,
        {
          conversationKey,
          revisionAtRequest,
          messageWatermark:
            typeof deepAnalysis.message_watermark === 'string'
              ? deepAnalysis.message_watermark
              : typeof payload?.message_snapshot_hash === 'string'
                ? payload.message_snapshot_hash
                : null,
        },
      )
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
      getCaptureRevision(
        freshness.conversationKey,
      ) !== freshness.revisionAtRequest
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
        getCaptureRevision(
          freshness.conversationKey,
        ) !== freshness.revisionAtRequest ||
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
  }
})()
