;(function initYolenLeadResolutionRuntimeCache(root) {
  const api = root.YolenCompanionApi

  if (!api || typeof api.resolveLead !== 'function') {
    return
  }

  const originalResolveLead = api.resolveLead.bind(api)
  const originalClearSession =
    typeof api.clearSession === 'function'
      ? api.clearSession.bind(api)
      : null

  const resolvedByIdentity = new Map()
  const inFlightByIdentity = new Map()

  function normalizePhone(value) {
    return String(value || '').replace(/\D+/g, '')
  }

  function normalizeDisplayName(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('pt-BR')
  }

  function buildIdentity(payload) {
    const phone = normalizePhone(payload?.phone)

    if (phone) {
      return `phone:${phone}`
    }

    const displayName = normalizeDisplayName(payload?.display_name)

    return displayName ? `name:${displayName}` : null
  }

  function isCacheableResolution(result) {
    return Boolean(
      result?.ok === true &&
      result?.payload &&
      typeof result.payload === 'object' &&
      result.payload.status &&
      result.payload.status !== 'NOT_FOUND' &&
      result.payload.status !== 'NO_PHONE_DETECTED',
    )
  }

  async function resolveLead(payload) {
    const identity = buildIdentity(payload)

    if (!identity) {
      return originalResolveLead(payload)
    }

    if (resolvedByIdentity.has(identity)) {
      return resolvedByIdentity.get(identity)
    }

    if (inFlightByIdentity.has(identity)) {
      return inFlightByIdentity.get(identity)
    }

    const request = Promise.resolve(originalResolveLead(payload))
      .then((result) => {
        if (isCacheableResolution(result)) {
          resolvedByIdentity.set(identity, result)
        }

        return result
      })
      .finally(() => {
        if (inFlightByIdentity.get(identity) === request) {
          inFlightByIdentity.delete(identity)
        }
      })

    inFlightByIdentity.set(identity, request)
    return request
  }

  function clearLeadResolutionCache() {
    resolvedByIdentity.clear()
    inFlightByIdentity.clear()
  }

  api.resolveLead = resolveLead
  api.clearLeadResolutionCache = clearLeadResolutionCache

  if (originalClearSession) {
    api.clearSession = async function clearSessionWithLeadResolutionCache() {
      clearLeadResolutionCache()
      return originalClearSession()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener(
      'click',
      (event) => {
        const refreshButton = event.target?.closest?.(
          '[data-yolen-action="refresh"]',
        )

        if (refreshButton) {
          clearLeadResolutionCache()
        }
      },
      true,
    )
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildIdentity,
      isCacheableResolution,
      clearLeadResolutionCache,
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
