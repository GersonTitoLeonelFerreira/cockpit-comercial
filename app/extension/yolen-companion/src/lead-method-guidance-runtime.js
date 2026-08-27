;(function initLeadMethodGuidanceRuntime(root) {
  const api = root.YolenCompanionApi

  if (
    !api ||
    typeof api.loadLeadSummary !== 'function' ||
    api.__leadMethodGuidanceWrapped === true
  ) {
    return
  }

  const originalLoadLeadSummary =
    api.loadLeadSummary.bind(api)

  // Somente resultados semânticos terminais entram em cache: orientação
  // pronta ou decisão explícita de que não há ação comercial agora. Erros,
  // método ausente/inválido e estados transitórios precisam poder ser
  // consultados novamente.
  const readyGuidanceCache = new Map()
  const inFlight = new Map()
  let lastScheduledRequest = null

  function getRuntime() {
    if (root.browser?.runtime?.sendMessage) {
      return root.browser.runtime
    }

    if (root.chrome?.runtime?.sendMessage) {
      return root.chrome.runtime
    }

    return null
  }

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

  function buildGuidanceBase(status) {
    return {
      status,
      method_name: null,
      method_config_version_id: null,
      stage_key: null,
      stage_name: null,
      stage_reason: null,
      next_step: null,
      seller_intents: [],
      error: null,
      error_code: null,
      status_code: null,
      retryable: null,
    }
  }

  function buildErrorGuidance(message, details = {}) {
    return {
      ...buildGuidanceBase('error'),
      error:
        message ||
        'Não foi possível definir o próximo passo agora.',
      error_code:
        typeof details.code === 'string'
          ? details.code
          : null,
      status_code:
        Number.isFinite(details.statusCode)
          ? details.statusCode
          : null,
      retryable:
        typeof details.retryable === 'boolean'
          ? details.retryable
          : null,
    }
  }

  function rememberIfReady(key, guidance) {
    if (
      key &&
      (
        guidance?.status === 'ready' ||
        guidance?.status === 'not_applicable'
      )
    ) {
      readyGuidanceCache.set(key, guidance)
      return
    }

    if (key) {
      readyGuidanceCache.delete(key)
    }
  }

  async function fetchGuidance(payload, workingSummary) {
    const runtime = getRuntime()

    if (!runtime) {
      return buildErrorGuidance(
        'Runtime da extensão indisponível para definir o próximo passo.',
        {
          code: 'METHOD_GUIDANCE_RUNTIME_UNAVAILABLE',
          statusCode: 0,
          retryable: true,
        },
      )
    }

    let result

    try {
      result = await runtime.sendMessage({
        source: 'YOLEN_COMPANION',
        action: 'LOAD_METHOD_GUIDANCE',
        baseUrl:
          typeof api.getBaseUrl === 'function'
            ? api.getBaseUrl()
            : null,
        payload: {
          cycle_id: payload?.cycle_id ?? null,
          conversation_key:
            payload?.conversation_key ?? null,
          working_summary: workingSummary,
        },
      })
    } catch (error) {
      return buildErrorGuidance(
        error instanceof Error && error.message
          ? error.message
          : 'Falha de comunicação ao definir o próximo passo.',
        {
          code: 'METHOD_GUIDANCE_RUNTIME_ERROR',
          statusCode: 0,
          retryable: true,
        },
      )
    }

    if (
      !result?.ok ||
      !result?.payload?.ok ||
      !result?.payload?.data
    ) {
      return buildErrorGuidance(
        result?.payload?.error ||
          'Não foi possível definir o próximo passo agora.',
        {
          code:
            result?.payload?.code ??
            'METHOD_GUIDANCE_REQUEST_FAILED',
          statusCode:
            result?.statusCode ?? 0,
          retryable:
            result?.payload?.retryable ??
            (result?.statusCode ?? 0) >= 500,
        },
      )
    }

    return result.payload.data
  }

  async function loadGuidance(payload, workingSummary) {
    const key = buildKey(payload, workingSummary)

    if (!key) {
      return buildGuidanceBase('no_summary')
    }

    if (readyGuidanceCache.has(key)) {
      return readyGuidanceCache.get(key)
    }

    if (inFlight.has(key)) {
      return inFlight.get(key)
    }

    const request = fetchGuidance(
      payload,
      workingSummary,
    )
      .then((guidance) => {
        rememberIfReady(key, guidance)

        if (guidance?.status === 'error') {
          console.warn(
            '[METHOD-GUIDANCE-DIAG]',
            {
              code: guidance.error_code ?? null,
              status_code: guidance.status_code ?? null,
              retryable: guidance.retryable ?? null,
              error: guidance.error ?? null,
            },
          )
        }

        return guidance
      })
      .catch((error) => {
        readyGuidanceCache.delete(key)

        const guidance = buildErrorGuidance(
          error instanceof Error && error.message
            ? error.message
            : null,
          {
            code: 'METHOD_GUIDANCE_RUNTIME_ERROR',
            statusCode: 0,
            retryable: true,
          },
        )

        console.warn(
          '[METHOD-GUIDANCE-DIAG]',
          {
            code: guidance.error_code,
            status_code: guidance.status_code,
            retryable: guidance.retryable,
            error: guidance.error,
          },
        )

        return guidance
      })
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, request)
    return request
  }

  function applyGuidanceToVisibleSummary(
    workingSummary,
    guidance,
  ) {
    const summaryInput = document.querySelector?.(
      '[data-yolen-textarea="lead-summary"]',
    )

    if (
      !summaryInput ||
      String(summaryInput.value || '').trim() !==
        workingSummary
    ) {
      return
    }

    const slot = document.querySelector?.(
      '[data-yolen-method-guidance-slot]',
    )

    const renderGuidance =
      root.YolenCompanionLeadSummaryView
        ?.renderMethodGuidance

    if (
      !slot ||
      typeof renderGuidance !== 'function'
    ) {
      return
    }

    const renderableGuidance =
      guidance?.status === 'not_applicable' &&
      typeof guidance?.next_step === 'string' &&
      guidance.next_step.trim()
        ? {
            ...guidance,
            status: 'ready',
            method_name: null,
            stage_name: null,
          }
        : guidance

    slot.innerHTML = renderGuidance(
      renderableGuidance,
    )
  }

  function scheduleGuidance({
    payload,
    data,
    workingSummary,
    key,
  }) {
    const loadingGuidance =
      buildGuidanceBase('loading')

    data.method_guidance =
      loadingGuidance

    lastScheduledRequest = {
      payload,
      data,
      workingSummary,
      key,
    }

    applyGuidanceToVisibleSummary(
      workingSummary,
      loadingGuidance,
    )

    void loadGuidance(
      payload,
      workingSummary,
    ).then((guidance) => {
      // `data` é a mesma referência guardada pelo content-script em
      // companionLeadSummary. Assim, qualquer rerender posterior já usa a
      // orientação concluída, sem recompor o resumo.
      data.method_guidance = guidance

      applyGuidanceToVisibleSummary(
        workingSummary,
        guidance,
      )

      root.YolenCompanionSellerMessageRuntime
        ?.render?.()
    })

    return key
  }

  function retryLastVisibleGuidance() {
    const request = lastScheduledRequest

    if (!request?.key) {
      return false
    }

    readyGuidanceCache.delete(request.key)
    inFlight.delete(request.key)

    scheduleGuidance(request)
    return true
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

    const key = buildKey(payload, workingSummary)

    if (!key) {
      data.method_guidance =
        buildGuidanceBase('no_summary')
      return result
    }

    if (readyGuidanceCache.has(key)) {
      data.method_guidance =
        readyGuidanceCache.get(key)
      return result
    }

    // O resumo aprovado é devolvido imediatamente. O próximo passo roda em
    // paralelo pelo background autenticado e nunca segura a exibição do
    // resumo nem faz fetch direto do content-script para a aplicação.
    scheduleGuidance({
      payload,
      data,
      workingSummary,
      key,
    })

    return result
  }

  api.__leadMethodGuidanceWrapped = true

  document.addEventListener(
    'click',
    (event) => {
      if (
        event.target?.closest?.(
          '[data-yolen-action="retry-method-guidance"]',
        )
      ) {
        event.preventDefault?.()
        retryLastVisibleGuidance()
        return
      }

      if (
        event.target?.closest?.(
          '[data-yolen-action="refresh"]',
        )
      ) {
        readyGuidanceCache.clear()
        inFlight.clear()
        lastScheduledRequest = null
      }
    },
    true,
  )

  root.YolenCompanionLeadMethodGuidanceRuntime = Object.freeze({
    retryLastVisibleGuidance,
    clear() {
      readyGuidanceCache.clear()
      inFlight.clear()
      lastScheduledRequest = null
    },
  })
})(typeof globalThis !== 'undefined' ? globalThis : window)
