;(function initYolenManyChatIdentityNamespace(root) {
  'use strict'

  const SCHEMA_VERSION = 'yolen-manychat-identity-namespace-v1'
  const CONTACT_PREFIX = 'manychat:contact:v1:sha256:'
  const WHATSAPP_PREFIX = 'manychat:channel:whatsapp:v1:sha256:'

  function normalizeOpaqueIdentifier(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed || null
    }

    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value >= 0
        ? String(value)
        : null
    }

    if (typeof value === 'bigint') {
      return value >= 0n ? value.toString() : null
    }

    return null
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  }

  async function sha256Hex(value, cryptoRef = root.crypto) {
    if (!cryptoRef?.subtle || typeof cryptoRef.subtle.digest !== 'function') {
      throw new Error('sha256_unavailable')
    }

    const Encoder = root.TextEncoder ?? globalThis.TextEncoder
    if (typeof Encoder !== 'function') {
      throw new Error('text_encoder_unavailable')
    }

    const encoded = new Encoder().encode(value)
    const digest = await cryptoRef.subtle.digest('SHA-256', encoded)
    return bytesToHex(new Uint8Array(digest))
  }

  function contactMaterial(accountKey, subscriberId) {
    return JSON.stringify([
      'yolen-manychat-contact-v1',
      accountKey,
      subscriberId,
    ])
  }

  function whatsappMaterial(accountKey, whatsappUserId) {
    return JSON.stringify([
      'yolen-manychat-channel-v1',
      accountKey,
      'whatsapp',
      whatsappUserId,
    ])
  }

  async function buildIdentityNamespace(
    {
      account_key: rawAccountKey,
      subscriber_id: rawSubscriberId,
      whatsapp_user_id: rawWhatsappUserId = null,
    } = {},
    cryptoRef = root.crypto,
  ) {
    const accountKey = normalizeOpaqueIdentifier(rawAccountKey)
    const subscriberId = normalizeOpaqueIdentifier(rawSubscriberId)
    const whatsappUserId = normalizeOpaqueIdentifier(rawWhatsappUserId)

    if (!accountKey) {
      return Object.freeze({
        ready: false,
        reason: 'account_key_missing',
        safe: null,
      })
    }

    if (!subscriberId) {
      return Object.freeze({
        ready: false,
        reason: 'subscriber_id_missing',
        safe: null,
      })
    }

    let contactDigest
    try {
      contactDigest = await sha256Hex(
        contactMaterial(accountKey, subscriberId),
        cryptoRef,
      )
    } catch (error) {
      return Object.freeze({
        ready: false,
        reason: error?.message ?? 'sha256_failed',
        safe: null,
      })
    }

    let channelIdentity = null

    if (whatsappUserId) {
      let whatsappDigest
      try {
        whatsappDigest = await sha256Hex(
          whatsappMaterial(accountKey, whatsappUserId),
          cryptoRef,
        )
      } catch (error) {
        return Object.freeze({
          ready: false,
          reason: error?.message ?? 'sha256_failed',
          safe: null,
        })
      }

      channelIdentity = Object.freeze({
        channel: 'whatsapp',
        source: 'whatsapp_user_id',
        key: `${WHATSAPP_PREFIX}${whatsappDigest}`,
      })
    }

    const safe = Object.freeze({
      schema_version: SCHEMA_VERSION,
      platform: 'manychat',
      scope: 'manychat_account',
      platform_identity: Object.freeze({
        source: 'subscriber_id',
        key: `${CONTACT_PREFIX}${contactDigest}`,
      }),
      channel_identity: channelIdentity,
      design: Object.freeze({
        account_key_included_in_digest: true,
        cross_account_collision_resistant: true,
        platform_and_channel_namespaces_separated: true,
        digest_algorithm: 'sha256',
      }),
      privacy: Object.freeze({
        raw_account_key_exposed: false,
        raw_subscriber_id_exposed: false,
        raw_whatsapp_user_id_exposed: false,
        raw_message_text_exposed: false,
      }),
    })

    return Object.freeze({
      ready: true,
      reason: null,
      safe,
    })
  }

  const api = Object.freeze({
    SCHEMA_VERSION,
    CONTACT_PREFIX,
    WHATSAPP_PREFIX,
    normalizeOpaqueIdentifier,
    sha256Hex,
    contactMaterial,
    whatsappMaterial,
    buildIdentityNamespace,
  })

  root.YolenManyChatIdentityNamespace = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
