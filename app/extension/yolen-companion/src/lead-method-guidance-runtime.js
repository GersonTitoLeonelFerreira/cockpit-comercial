;(function initLeadMethodGuidanceRuntime(root) {
  const api = root.YolenCompanionApi

  if (
    !api ||
    typeof api.loadLeadSummary !== 'function' ||
    typeof api.getBaseUrl !== 'function' ||
    typeof api.getMe !== 'function' ||
    api.__leadMethodGuidanceWrapped === true
  ) {
    return
  }

  const originalLoadLeadSummary =
    api.loadLeadSummary.bind(api)

  const guidanceCache = new Map()
  const inFlight = new Map()

  function hashText(value) {
    const text = String(value || '')
    let hash = 2166136261

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return `${text.length}:${(hash >>> 0).toString(16)}`
  }

  function buildKey(payload, workingSummary) {
    const cycleId = String(payload?.cycle_id || '').trim()
    const conversationKey = String(payload?.conversation_key || '').trim()

    if (!cycleId || !conversationKey || !workingSummary) {
      return null
    }

    return [
      cycleId,
      conversationKey,
      hashText(workingSummary),
    ].join('::')
  }

  function buildErrorGuidance(message) {
    return {
      status: 'error',
      method_name: null,
      method_config_version_id: null,
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: null,
      error:
        message ||
        'Não foi possível definir o próximo passo agora.',
    }
  }

  async function fetchGuidance(payload, workingSummary) {
    const session = await api.getMe()
    const token = session?.payload?.companion_token

    if (!session?.ok || !token) {
      return buildErrorGuidance(
        'Sessão da Yolen indisponível para definir o próximo passo.',
      )
    }

    const response = await fetch(
      `${api.getBaseUrl()}/api/companion/method-guidance`,
      {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cycle_id: payload?.cycle_id ?? null,
          conversation_key:
            payload?.conversation_key ?? null,
          working_summary: workingSummary,
        }),
      },
    )

    const body = await response.json().catch(() => null)

    if (!response.ok || !body?.ok || !body?.data) {
      return buildErrorGuidance(
        body?.error ||
          'Não foi possível definir o próximo passo agora.',
      )
    }

    return body.data
  }

  async function loadGuidance(payload, workingSummary) {
    const key = buildKey(payload, workingSummary)

    if (!key) {
      return {
        status: 'no_summary',
        method_name: null,
        method_config_version_id: null,
        stage_key: null,
        stage_name: null,
        stage_reason: null,
        next_step: null,
        error: null,
      }
    }

    if (guidanceCache.has(key)) {
      return guidanceCache.get(key)
    }

    if (inFlight.has(key)) {
      return inFlight.get(key)
    }

    const request = fetchGuidance(
      payload,
      workingSummary,
    )
      .then((guidance) => {
        guidanceCache.set(key, guidance)
        return guidance
      })
      .catch((error) => {
        const guidance = buildErrorGuidance(
          error instanceof Error && error.message
            ? error.message
            : null,
        )

        guidanceCache.set(key, guidance)
        return guidance
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, request)
    return request
  }

  api.loadLeadSummary = async function loadLeadSummaryWithMethod(payload) {
    const result = await originalLoadLeadSummary(payload)
    const data = result?.payload?.data

    if (!result?.ok || !result?.payload?.ok || !data) {
      return result
    }

    const workingSummary =
      typeof data.working_summary === 'string' &&
      data.working_summary.trim()
        ? data.working_summary.trim()
        : typeof data.summary?.summary === 'string'
          ? data.summary.summary.trim()
          : ''

    if (data.method_guidance && workingSummary) {
      return result
    }

    data.method_guidance = await loadGuidance(
      payload,
      workingSummary,
    )

    return result
  }

  api.__leadMethodGuidanceWrapped = true

  document.addEventListener(
    'click',
    (event) => {
      if (
        event.target?.closest?.(
          '[data-yolen-action="refresh"]',
        )
      ) {
        guidanceCache.clear()
        inFlight.clear()
      }
    },
    true,
  )
})(typeof globalThis !== 'undefined' ? globalThis : window)
