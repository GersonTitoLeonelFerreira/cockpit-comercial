;(function initYolenManyChatSafeIdentityMain(root) {
  'use strict'

  const SCHEMA_VERSION = 'yolen-manychat-safe-identity-main-v1'
  const PLATFORM = 'manychat'
  const ACCOUNT_ROUTE = /^\/(fb[^/]+)\/chat\/[^/?#]+\/?$/i

  const FAMILY_MATCHERS = Object.freeze({
    subscriber_id: (locator) => /(?:^|\.)subscriberId$/i.test(locator),
    thread_user_id: (locator) => /\.thread\.user_id$/i.test(locator),
    user_object_user_id: (locator) =>
      /\.thread\.user\.user_id$/i.test(locator) ||
      /(?:^|\.)user\.user_id$/i.test(locator),
    data_user_id: (locator) => /(?:^|\.)data\.user_id$/i.test(locator),
    whatsapp_user_id: (locator) =>
      /\.thread\.user\.wa_id$/i.test(locator) ||
      /(?:^|\.)user\.wa_id$/i.test(locator),
  })

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function accountKeyFromLocation(locationRef) {
    const pathname = requiredText(locationRef?.pathname)
    if (!pathname) return null

    const match = pathname.match(ACCOUNT_ROUTE)
    return requiredText(match?.[1])
  }

  function singletonFamily(snapshot, matcher) {
    const values = new Set()
    let singletonLocatorCount = 0

    for (const entry of snapshot?.secret?.entries ?? []) {
      const locator = requiredText(entry?.locator)
      if (!locator || !matcher(locator)) continue
      if (!Array.isArray(entry?.values) || entry.values.length !== 1) continue

      const value = requiredText(entry.values[0])
      if (!value) continue

      singletonLocatorCount += 1
      values.add(value)
    }

    if (singletonLocatorCount === 0) {
      return Object.freeze({ ready: false, reason: 'family_missing', value: null })
    }

    if (values.size !== 1) {
      return Object.freeze({ ready: false, reason: 'family_ambiguous', value: null })
    }

    return Object.freeze({
      ready: true,
      reason: null,
      value: [...values][0],
    })
  }

  function resolveCurrentOpaqueIdentity({
    document: documentRef = root.document,
    location: locationRef = root.location,
    identityApi = root.YolenManyChatMainWorldIdentityProbe,
  } = {}) {
    if (!identityApi || typeof identityApi.snapshotCandidateMap !== 'function') {
      return Object.freeze({
        ready: false,
        reason: 'identity_probe_unavailable',
        secret: null,
      })
    }

    const accountKey = accountKeyFromLocation(locationRef)
    if (!accountKey) {
      return Object.freeze({
        ready: false,
        reason: 'account_key_unavailable',
        secret: null,
      })
    }

    const snapshot = identityApi.snapshotCandidateMap(documentRef)
    if (!snapshot?.ready || !snapshot?.secret) {
      return Object.freeze({
        ready: false,
        reason: snapshot?.reason ?? 'identity_snapshot_unavailable',
        secret: null,
      })
    }

    const subscriber = singletonFamily(
      snapshot,
      FAMILY_MATCHERS.subscriber_id,
    )

    if (!subscriber.ready) {
      return Object.freeze({
        ready: false,
        reason: `subscriber_id_${subscriber.reason}`,
        secret: null,
      })
    }

    const corroboratedBy = []

    for (const family of [
      'thread_user_id',
      'user_object_user_id',
      'data_user_id',
    ]) {
      const candidate = singletonFamily(snapshot, FAMILY_MATCHERS[family])
      if (candidate.ready && candidate.value === subscriber.value) {
        corroboratedBy.push(family)
      }
    }

    if (corroboratedBy.length === 0) {
      return Object.freeze({
        ready: false,
        reason: 'subscriber_id_not_corroborated',
        secret: null,
      })
    }

    const whatsapp = singletonFamily(
      snapshot,
      FAMILY_MATCHERS.whatsapp_user_id,
    )

    return Object.freeze({
      ready: true,
      reason: null,
      secret: Object.freeze({
        account_key: accountKey,
        subscriber_id: subscriber.value,
        whatsapp_user_id: whatsapp.ready ? whatsapp.value : null,
        corroborated_by: Object.freeze(corroboratedBy),
      }),
    })
  }

  async function resolveSafeIdentity({
    document: documentRef = root.document,
    location: locationRef = root.location,
    identityApi = root.YolenManyChatMainWorldIdentityProbe,
    namespaceApi = root.YolenManyChatIdentityNamespace,
  } = {}) {
    if (!namespaceApi || typeof namespaceApi.buildIdentityNamespace !== 'function') {
      return Object.freeze({
        ready: false,
        reason: 'identity_namespace_unavailable',
        safe: null,
      })
    }

    const current = resolveCurrentOpaqueIdentity({
      document: documentRef,
      location: locationRef,
      identityApi,
    })

    if (!current.ready || !current.secret) {
      return Object.freeze({
        ready: false,
        reason: current.reason,
        safe: null,
      })
    }

    const namespaced = await namespaceApi.buildIdentityNamespace({
      account_key: current.secret.account_key,
      subscriber_id: current.secret.subscriber_id,
      whatsapp_user_id: current.secret.whatsapp_user_id,
    })

    if (!namespaced?.ready || !namespaced?.safe) {
      return Object.freeze({
        ready: false,
        reason: namespaced?.reason ?? 'identity_namespace_failed',
        safe: null,
      })
    }

    return Object.freeze({
      ready: true,
      reason: null,
      safe: Object.freeze({
        schema_version: SCHEMA_VERSION,
        platform: PLATFORM,
        identity_source: 'react_internal_semantic_v1',
        platform_identity: namespaced.safe.platform_identity,
        channel_identity: namespaced.safe.channel_identity,
        corroborated_by: current.secret.corroborated_by,
        design: namespaced.safe.design,
        privacy: Object.freeze({
          raw_account_key_exposed: false,
          raw_subscriber_id_exposed: false,
          raw_whatsapp_user_id_exposed: false,
          raw_message_text_exposed: false,
          persisted: false,
          network_sent: false,
        }),
      }),
    })
  }

  const publicApi = Object.freeze({
    SCHEMA_VERSION,
    PLATFORM,
    resolveSafeIdentity,
  })

  try {
    Object.defineProperty(root, 'YolenManyChatSafeIdentityMain', {
      value: publicApi,
      enumerable: false,
      configurable: false,
      writable: false,
    })
  } catch {
    root.YolenManyChatSafeIdentityMain = publicApi
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.freeze({
      ...publicApi,
      FAMILY_MATCHERS,
      accountKeyFromLocation,
      singletonFamily,
      resolveCurrentOpaqueIdentity,
    })
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
