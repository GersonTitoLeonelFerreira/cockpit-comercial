;(function initYolenManyChatSafeIdentityBackground(root) {
  'use strict'

  const ACTION = 'GET_MANYCHAT_SAFE_IDENTITY'
  const SOURCE = 'YOLEN_COMPANION'
  const ALLOWED_HOST = 'app.manychat.com'
  const CONTACT_KEY_PATTERN = /^manychat:contact:v1:sha256:[a-f0-9]{64}$/
  const WHATSAPP_KEY_PATTERN = /^manychat:channel:whatsapp:v1:sha256:[a-f0-9]{64}$/

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function normalizeSender(sender) {
    const tabId = Number(sender?.tab?.id)
    const frameId = Number(sender?.frameId ?? 0)
    const rawUrl = requiredText(sender?.url ?? sender?.tab?.url)

    if (!Number.isInteger(tabId) || tabId < 0) {
      return Object.freeze({ ready: false, reason: 'sender_tab_missing' })
    }

    if (!Number.isInteger(frameId) || frameId !== 0) {
      return Object.freeze({ ready: false, reason: 'sender_frame_not_top' })
    }

    let parsed
    try {
      parsed = new URL(rawUrl)
    } catch {
      return Object.freeze({ ready: false, reason: 'sender_url_invalid' })
    }

    if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_HOST) {
      return Object.freeze({ ready: false, reason: 'sender_host_not_allowed' })
    }

    return Object.freeze({
      ready: true,
      reason: null,
      tab_id: tabId,
      frame_id: frameId,
    })
  }

  function sanitizeMainResult(result) {
    const safe = result?.safe
    const platformKey = requiredText(safe?.platform_identity?.key)
    const platformSource = requiredText(safe?.platform_identity?.source)
    const channel = safe?.channel_identity
    const channelKey = requiredText(channel?.key)
    const channelName = requiredText(channel?.channel)
    const channelSource = requiredText(channel?.source)

    if (
      result?.ready !== true ||
      safe?.platform !== 'manychat' ||
      platformSource !== 'subscriber_id' ||
      !CONTACT_KEY_PATTERN.test(platformKey || '')
    ) {
      return Object.freeze({
        ready: false,
        reason: result?.reason ?? 'main_identity_result_invalid',
        safe: null,
      })
    }

    let safeChannel = null
    if (channel !== null && channel !== undefined) {
      if (
        channelName !== 'whatsapp' ||
        channelSource !== 'whatsapp_user_id' ||
        !WHATSAPP_KEY_PATTERN.test(channelKey || '')
      ) {
        return Object.freeze({
          ready: false,
          reason: 'main_channel_identity_invalid',
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
        schema_version: 'yolen-manychat-safe-identity-background-v1',
        platform: 'manychat',
        identity_source: 'main_world_scripting_bridge',
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

  async function executeMainIdentity(api, sender) {
    const normalizedSender = normalizeSender(sender)
    if (!normalizedSender.ready) {
      return Object.freeze({
        ready: false,
        reason: normalizedSender.reason,
        safe: null,
      })
    }

    if (!api?.scripting || typeof api.scripting.executeScript !== 'function') {
      return Object.freeze({
        ready: false,
        reason: 'scripting_api_unavailable',
        safe: null,
      })
    }

    try {
      const executions = await api.scripting.executeScript({
        target: {
          tabId: normalizedSender.tab_id,
          frameIds: [normalizedSender.frame_id],
        },
        world: 'MAIN',
        func: async () => {
          const identityApi = globalThis.YolenManyChatSafeIdentityMain
          if (!identityApi || typeof identityApi.resolveSafeIdentity !== 'function') {
            return {
              ready: false,
              reason: 'main_identity_api_unavailable',
              safe: null,
            }
          }
          return identityApi.resolveSafeIdentity()
        },
      })

      const result = Array.isArray(executions) && executions.length === 1
        ? executions[0]?.result
        : null

      return sanitizeMainResult(result)
    } catch {
      return Object.freeze({
        ready: false,
        reason: 'main_world_execution_failed',
        safe: null,
      })
    }
  }

  async function handleIdentityRequest(message, sender, api) {
    if (message?.source !== SOURCE || message?.action !== ACTION) {
      return undefined
    }

    const resolved = await executeMainIdentity(api, sender)

    return Object.freeze({
      ok: resolved.ready === true,
      statusCode: resolved.ready === true ? 200 : 409,
      payload: Object.freeze({
        ready: resolved.ready === true,
        reason: resolved.reason ?? null,
        safe: resolved.safe,
      }),
    })
  }

  const api = Object.freeze({
    ACTION,
    SOURCE,
    ALLOWED_HOST,
    CONTACT_KEY_PATTERN,
    WHATSAPP_KEY_PATTERN,
    normalizeSender,
    sanitizeMainResult,
    executeMainIdentity,
    handleIdentityRequest,
  })

  root.YolenManyChatSafeIdentityBackground = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
