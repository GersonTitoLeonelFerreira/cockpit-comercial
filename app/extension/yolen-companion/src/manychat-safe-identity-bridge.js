;(function initYolenManyChatSafeIdentityBridge(root) {
  'use strict'

  const ACTION = 'GET_MANYCHAT_SAFE_IDENTITY'
  const SOURCE = 'YOLEN_COMPANION'
  const PROBE_HASH = '#yolen-safe-identity-bridge-probe'
  const PROBE_BUTTON_ID = 'yolen-manychat-safe-identity-bridge-probe'
  const CONTACT_KEY_PATTERN = /^manychat:contact:v1:sha256:[a-f0-9]{64}$/
  const WHATSAPP_KEY_PATTERN = /^manychat:channel:whatsapp:v1:sha256:[a-f0-9]{64}$/
  const MAX_BOOTSTRAP_ATTEMPTS = 80
  const BOOTSTRAP_RETRY_MS = 100

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function extensionApi() {
    const api = root.browser ?? root.chrome
    if (!api?.runtime || typeof api.runtime.sendMessage !== 'function') {
      const error = new Error('runtime.sendMessage indisponível.')
      error.code = 'EXTENSION_RUNTIME_UNAVAILABLE'
      throw error
    }
    return api
  }

  function sendRuntimeMessage(message, api = extensionApi()) {
    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime.sendMessage(message)
    }

    return new Promise((resolve, reject) => {
      try {
        api.runtime.sendMessage(message, (response) => {
          const runtimeError = api.runtime.lastError
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Falha no runtime da extensão.'))
            return
          }
          resolve(response)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  function sanitizeBackgroundResponse(result) {
    const safe = result?.payload?.safe
    const platformKey = requiredText(safe?.platform_identity?.key)
    const channel = safe?.channel_identity

    if (
      result?.ok !== true ||
      result?.payload?.ready !== true ||
      safe?.platform !== 'manychat' ||
      safe?.platform_identity?.source !== 'subscriber_id' ||
      !CONTACT_KEY_PATTERN.test(platformKey || '')
    ) {
      return Object.freeze({
        ready: false,
        reason: result?.payload?.reason ?? 'background_identity_invalid',
        safe: null,
      })
    }

    let safeChannel = null
    if (channel !== null && channel !== undefined) {
      const channelKey = requiredText(channel?.key)
      if (
        channel?.channel !== 'whatsapp' ||
        channel?.source !== 'whatsapp_user_id' ||
        !WHATSAPP_KEY_PATTERN.test(channelKey || '')
      ) {
        return Object.freeze({
          ready: false,
          reason: 'background_channel_identity_invalid',
          safe: null,
        })
      }

      safeChannel = Object.freeze({
        channel: 'whatsapp',
        source: 'whatsapp_user_id',
        key: channelKey,
      })
    }

    return Object.freeze({
      ready: true,
      reason: null,
      safe: Object.freeze({
        schema_version: 'yolen-manychat-safe-identity-bridge-v1',
        platform: 'manychat',
        platform_identity: Object.freeze({
          source: 'subscriber_id',
          key: platformKey,
        }),
        channel_identity: safeChannel,
        privacy: Object.freeze({
          raw_workspace_key_exposed: false,
          raw_subscriber_id_exposed: false,
          raw_whatsapp_user_id_exposed: false,
          raw_message_text_exposed: false,
          persisted: false,
          backend_sent: false,
        }),
      }),
    })
  }

  async function getCurrentSafeIdentity(api = extensionApi()) {
    try {
      const result = await sendRuntimeMessage(
        {
          source: SOURCE,
          action: ACTION,
        },
        api,
      )
      return sanitizeBackgroundResponse(result)
    } catch {
      return Object.freeze({
        ready: false,
        reason: 'background_identity_request_failed',
        safe: null,
      })
    }
  }

  function evaluateABAReturn(baseline, distinct, current) {
    const a = requiredText(baseline?.safe?.platform_identity?.key)
    const b = requiredText(distinct?.safe?.platform_identity?.key)
    const a2 = requiredText(current?.safe?.platform_identity?.key)

    const pass = Boolean(
      baseline?.ready === true &&
      distinct?.ready === true &&
      current?.ready === true &&
      a && b && a2 &&
      a !== b &&
      a === a2,
    )

    return Object.freeze({
      pass,
      reason: pass ? null : 'safe_identity_aba_not_proven',
      safe: Object.freeze({
        schema_version: 'yolen-manychat-safe-identity-bridge-result-v1',
        platform: 'manychat',
        baseline_ready: baseline?.ready === true,
        distinct_ready: distinct?.ready === true,
        returned_ready: current?.ready === true,
        identity_changed_on_b: Boolean(a && b && a !== b),
        identity_returned_on_a: Boolean(a && a2 && a === a2),
        channel_identity_present: Boolean(
          current?.safe?.channel_identity?.key,
        ),
        privacy: Object.freeze({
          raw_workspace_key_exposed: false,
          raw_subscriber_id_exposed: false,
          raw_whatsapp_user_id_exposed: false,
          raw_message_text_exposed: false,
          persisted: false,
          backend_sent: false,
        }),
      }),
    })
  }

  function installDiagnosticProbe({
    window: windowRef = root.window,
    document: documentRef = root.document,
  } = {}) {
    if (
      !windowRef ||
      !documentRef?.body ||
      windowRef.location?.hash !== PROBE_HASH
    ) {
      return null
    }

    const existing = documentRef.getElementById?.(PROBE_BUTTON_ID)
    if (existing) return existing

    let baseline = null
    let distinct = null

    const button = documentRef.createElement('button')
    button.id = PROBE_BUTTON_ID
    button.type = 'button'
    button.textContent = 'Yolen · capturar bridge A'
    button.setAttribute(
      'aria-label',
      'Validar bridge segura de identidade ManyChat',
    )

    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483647',
      padding: '10px 14px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,.2)',
      background: '#111318',
      color: '#edf2f7',
      font: '600 12px/1.2 system-ui, sans-serif',
      cursor: 'pointer',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    })

    button.addEventListener('click', async (event) => {
      if (event.isTrusted !== true || button.disabled) return
      button.disabled = true

      try {
        const current = await getCurrentSafeIdentity()

        if (!current.ready) {
          button.dataset.yolenSafeIdentityBridgeResult = JSON.stringify({
            schema_version: 'yolen-manychat-safe-identity-bridge-result-v1',
            platform: 'manychat',
            pass: false,
            reason: current.reason,
          })
          button.dataset.yolenSafeIdentityBridgePassed = 'false'
          button.textContent = `Yolen · bridge indisponível (${current.reason})`
          return
        }

        if (!baseline) {
          baseline = current
          button.dataset.yolenSafeIdentityBridgePassed = 'false'
          button.textContent = 'Yolen · A capturada — abra B'
          return
        }

        if (!distinct) {
          const a = baseline.safe.platform_identity.key
          const b = current.safe.platform_identity.key

          if (a === b) {
            button.dataset.yolenSafeIdentityBridgePassed = 'false'
            button.textContent = 'Yolen · ainda na identidade A'
            return
          }

          distinct = current
          button.dataset.yolenSafeIdentityBridgePassed = 'false'
          button.textContent = 'Yolen · B capturada — volte para A'
          return
        }

        const evaluated = evaluateABAReturn(baseline, distinct, current)
        const safe = {
          ...evaluated.safe,
          pass: evaluated.pass,
          reason: evaluated.reason,
          stage: 'safe_identity_bridge_aba_evaluated',
        }

        button.dataset.yolenSafeIdentityBridgeResult = JSON.stringify(safe)
        button.dataset.yolenSafeIdentityBridgePassed = evaluated.pass
          ? 'true'
          : 'false'
        button.textContent = evaluated.pass
          ? 'Yolen · bridge de identidade PASS'
          : 'Yolen · bridge de identidade não provada'
      } finally {
        button.disabled = false
      }
    })

    documentRef.body.appendChild(button)
    return button
  }

  const api = Object.freeze({
    ACTION,
    SOURCE,
    PROBE_HASH,
    PROBE_BUTTON_ID,
    CONTACT_KEY_PATTERN,
    WHATSAPP_KEY_PATTERN,
    sanitizeBackgroundResponse,
    getCurrentSafeIdentity,
    evaluateABAReturn,
    installDiagnosticProbe,
  })

  root.YolenManyChatSafeIdentityBridge = api

  const runtimeWindow = root.window ?? root
  const runtimeDocument = root.document ?? runtimeWindow?.document ?? null
  const armedAtDocumentStart = runtimeWindow?.location?.hash === PROBE_HASH
  let bootstrapAttempts = 0

  const autoInstall = () => {
    if (!runtimeDocument) return true
    if (root.__YOLEN_MANYCHAT_SAFE_IDENTITY_BRIDGE_PROBE_INSTALLED__) {
      return true
    }

    const shouldInstall =
      armedAtDocumentStart ||
      runtimeWindow?.location?.hash === PROBE_HASH

    if (!shouldInstall) return true

    const installed = installDiagnosticProbe({
      window: {
        location: {
          hash: PROBE_HASH,
        },
      },
      document: runtimeDocument,
    })

    if (installed) {
      root.__YOLEN_MANYCHAT_SAFE_IDENTITY_BRIDGE_PROBE_INSTALLED__ = true
      return true
    }

    return false
  }

  const retryInstall = () => {
    if (autoInstall()) return

    bootstrapAttempts += 1
    if (bootstrapAttempts >= MAX_BOOTSTRAP_ATTEMPTS) return
    runtimeWindow?.setTimeout?.(retryInstall, BOOTSTRAP_RETRY_MS)
  }

  if (runtimeDocument?.readyState === 'loading') {
    runtimeDocument.addEventListener?.('DOMContentLoaded', retryInstall, {
      once: true,
    })
  }

  retryInstall()

  if (typeof runtimeWindow?.addEventListener === 'function') {
    runtimeWindow.addEventListener('hashchange', retryInstall)
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
