/* global browser, chrome */

;(function initYolenCompanionApi() {
  const DEFAULT_BASE_URL =
    'https://cockpit-comercial-vocn.vercel.app'

  const LOCAL_BASE_URL =
    'http://localhost:3000'

  let sessionBaseUrl = null
  let lastLeadLookupContext = null

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

  async function analyzeConversation(payload) {
    return sendToBackground('ANALYZE_CONVERSATION', payload)
  }

  async function applySuggestion(payload) {
    return sendToBackground('APPLY_SUGGESTION', payload)
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
    return sendToBackground(
      'INGEST_CAPTURE_MESSAGES',
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
    analyzeConversation,
    applySuggestion,
    registerMessageAction,
    registerActionEvent,
    transcribeAudio,
    loadAudioTranscriptions,
    ingestCapturedMessages,
  }
})()
