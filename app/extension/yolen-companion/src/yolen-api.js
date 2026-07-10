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
        ...payload,
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

  window.YolenCompanionApi = {
    getBaseUrl,
    getMe,
    setSession,
    clearSession,
  }
})()