/* global browser, chrome */

;(function initYolenCompanionApi() {
  const DEFAULT_BASE_URL = 'https://cockpit-commercial-vocn.vercel.app'

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
    try {
      const savedUrl = window.localStorage.getItem('yolen_companion_base_url')
      return savedUrl || DEFAULT_BASE_URL
    } catch {
      return DEFAULT_BASE_URL
    }
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
    return sendToBackground('GET_ME')
  }

  async function setSession(session) {
    return sendToBackground('SET_SESSION', {
      session,
    })
  }

  async function clearSession() {
    return sendToBackground('CLEAR_SESSION')
  }

  async function resolveLead(payload) {
    return sendToBackground('RESOLVE_LEAD', payload)
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

  async function transcribeAudio(payload) {
    return sendToBackground('TRANSCRIBE_AUDIO', payload)
  }

  window.YolenCompanionApi = {
    getBaseUrl,
    getMe,
    setSession,
    clearSession,
    resolveLead,
    analyzeConversation,
    applySuggestion,
    registerMessageAction,
    transcribeAudio,
  }
})()