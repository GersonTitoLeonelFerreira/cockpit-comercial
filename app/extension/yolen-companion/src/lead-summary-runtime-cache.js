;(function initLeadSummaryRuntimeCache(root) {
  const api = root.YolenCompanionApi

  if (!api || typeof api.loadLeadSummary !== 'function') {
    return
  }

  const originalLoadLeadSummary = api.loadLeadSummary.bind(api)
  const originalSaveLeadSummary =
    typeof api.saveLeadSummary === 'function'
      ? api.saveLeadSummary.bind(api)
      : null

  const readyCache = new Map()
  const inFlightCache = new Map()

  function normalize(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function fnv1a(value) {
    let hash = 2166136261

    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return (hash >>> 0).toString(16)
  }

  function getVisibleConversationSignature(conversationKey) {
    if (typeof document === 'undefined') {
      return 'no-dom'
    }

    const main = document.querySelector('#main')

    if (!main) {
      return 'no-main'
    }

    const lines = Array.from(
      main.querySelectorAll('[data-pre-plain-text]'),
    ).map((node) => {
      const container =
        node.closest?.('[data-id]') ||
        node

      return [
        container.getAttribute?.('data-id') || '',
        node.getAttribute?.('data-pre-plain-text') || '',
        node.textContent || '',
      ].join('\u001f')
    })

    const material = [
      normalize(conversationKey),
      String(lines.length),
      ...lines,
    ].join('\u001e')

    return `${lines.length}:${fnv1a(material)}`
  }

  function buildCacheKey(payload) {
    const cycleId = normalize(payload?.cycle_id)
    const conversationKey = normalize(payload?.conversation_key)

    if (!cycleId || !conversationKey) {
      return null
    }

    return [
      cycleId,
      conversationKey,
      getVisibleConversationSignature(conversationKey),
    ].join('::')
  }

  function clearConversationEntries(payload) {
    const cycleId = normalize(payload?.cycle_id)
    const conversationKey = normalize(payload?.conversation_key)

    if (!cycleId || !conversationKey) {
      return
    }

    const prefix = `${cycleId}::${conversationKey}::`

    for (const key of readyCache.keys()) {
      if (key.startsWith(prefix)) {
        readyCache.delete(key)
      }
    }

    for (const key of inFlightCache.keys()) {
      if (key.startsWith(prefix)) {
        inFlightCache.delete(key)
      }
    }
  }

  api.loadLeadSummary = function loadLeadSummaryWithRuntimeCache(payload) {
    const cacheKey = buildCacheKey(payload)

    if (!cacheKey) {
      return originalLoadLeadSummary(payload)
    }

    if (readyCache.has(cacheKey)) {
      return Promise.resolve(readyCache.get(cacheKey))
    }

    if (inFlightCache.has(cacheKey)) {
      return inFlightCache.get(cacheKey)
    }

    const request = Promise.resolve(
      originalLoadLeadSummary(payload),
    )
      .then((result) => {
        if (result?.ok && result?.payload?.ok) {
          readyCache.set(cacheKey, result)
        }

        return result
      })
      .finally(() => {
        if (inFlightCache.get(cacheKey) === request) {
          inFlightCache.delete(cacheKey)
        }
      })

    inFlightCache.set(cacheKey, request)

    return request
  }

  if (originalSaveLeadSummary) {
    api.saveLeadSummary = async function saveLeadSummaryAndRefreshCache(payload) {
      const result = await originalSaveLeadSummary(payload)

      if (result?.ok && result?.payload?.ok) {
        clearConversationEntries(payload)

        const cacheKey = buildCacheKey(payload)

        if (cacheKey) {
          readyCache.set(cacheKey, result)
        }
      }

      return result
    }
  }

  root.YolenCompanionLeadSummaryRuntimeCache = {
    clear(payload) {
      clearConversationEntries(payload)
    },
    size() {
      return readyCache.size
    },
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
