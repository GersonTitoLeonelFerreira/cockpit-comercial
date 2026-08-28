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
  const originalConfirmConversationRegistration =
    typeof api.confirmConversationRegistration === 'function'
      ? api.confirmConversationRegistration.bind(api)
      : null
  const originalPreviewConversationRegistration =
    typeof api.previewConversationRegistration === 'function'
      ? api.previewConversationRegistration.bind(api)
      : null
  const originalIngestCapturedMessages =
    typeof api.ingestCapturedMessages === 'function'
      ? api.ingestCapturedMessages.bind(api)
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

  function clearDerivedCaches(
    payload,
    { clearSellerMessage = true } = {},
  ) {
    root.YolenCompanionLeadMethodGuidanceRuntime
      ?.clear?.()

    if (clearSellerMessage) {
      root.YolenCompanionSellerMessageRuntime
        ?.clear?.(payload)
    }
  }

  function hasUsableSummary(result) {
    if (!result?.ok || !result?.payload?.ok) {
      return false
    }

    const data = result.payload.data

    if (!data || typeof data !== 'object') {
      return false
    }

    const workingSummary = normalize(data.working_summary)
    const savedSummary = normalize(data.summary?.summary)

    return Boolean(workingSummary || savedSummary)
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
        // Um retorno vazio não é um estado definitivo. Ele pode acontecer
        // nos poucos instantes entre criar o lead, vincular a conversa e a
        // captura canônica chegar ao ciclo. Se for cacheado como "ready",
        // o Companion continua dizendo que não existe histórico mesmo
        // depois de as mensagens já estarem no banco.
        if (hasUsableSummary(result)) {
          readyCache.set(cacheKey, result)
        } else {
          readyCache.delete(cacheKey)
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
        clearDerivedCaches(payload, {
          clearSellerMessage: false,
        })

        const cacheKey = buildCacheKey(payload)

        if (cacheKey && hasUsableSummary(result)) {
          readyCache.set(cacheKey, result)
        }
      }

      return result
    }
  }

  if (originalConfirmConversationRegistration) {
    api.confirmConversationRegistration =
      async function confirmConversationRegistrationAndInvalidateSummary(payload) {
        const result =
          await originalConfirmConversationRegistration(payload)

        if (result?.ok && result?.payload?.ok) {
          clearConversationEntries(payload)
          clearDerivedCaches(payload)
        }

        return result
      }
  }

  if (originalPreviewConversationRegistration) {
    api.previewConversationRegistration =
      async function previewConversationRegistrationAndRecoverExistingHistory(payload) {
        const result =
          await originalPreviewConversationRegistration(payload)

        if (
          result?.ok &&
          result?.payload?.ok &&
          result.payload.data?.already_registered ===
            true
        ) {
          clearConversationEntries(payload)
          clearDerivedCaches(payload)
        }

        return result
      }
  }

  if (originalIngestCapturedMessages) {
    api.ingestCapturedMessages =
      async function ingestCapturedMessagesAndInvalidateSummary(payload) {
        const result =
          await originalIngestCapturedMessages(payload)

        if (result?.ok && result?.payload?.ok) {
          clearConversationEntries(payload)
          clearDerivedCaches(payload)
        }

        return result
      }
  }

  root.YolenCompanionLeadSummaryRuntimeCache = {
    clear(payload) {
      clearConversationEntries(payload)
      clearDerivedCaches(payload)
    },
    size() {
      return readyCache.size
    },
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
