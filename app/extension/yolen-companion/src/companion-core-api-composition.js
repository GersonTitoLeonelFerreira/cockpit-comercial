;(function initYolenCompanionCoreApiComposition(root) {
// FASE 5 — composição explícita das políticas de transporte usadas pelo
// Core. Até a FASE 4, estas políticas eram instaladas por monkey-patch em
// `YolenCompanionApi` (lead-resolution-runtime-cache.js,
// capture-resilience.js, capture-resilience-null-base.js e o "resume
// cache" de panel-stability-runtime.js), dependendo da ordem de carga e de
// `window === globalThis`. Aqui o Core recebe as ferramentas como
// dependências e compõe as chamadas de forma explícita:
//
//   resolveLead            = retry transitório ∘ cache de resolução ∘ API
//   ingestCapturedMessages = rebase de base nula ∘ coordenação de versões ∘ API
//
// Nada aqui conhece a plataforma (WhatsApp/ManyChat).

// NOT_FOUND, NO_PHONE_DETECTED e CONTACT_NOT_LINKED são estados
// transitórios (o lead pode ter acabado de ser criado ou vinculado —
// eventual consistency) e nunca entram no cache.
function isCacheableResolution(result) {
  return Boolean(
    result?.ok === true &&
    result?.payload &&
    typeof result.payload === 'object' &&
    result.payload.status &&
    result.payload.status !== 'NO_PHONE_DETECTED' &&
    result.payload.status !== 'NOT_FOUND' &&
    result.payload.status !== 'CONTACT_NOT_LINKED',
  )
}

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '')
}

function normalizeDisplayName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

function buildResolutionIdentity(payload) {
  // FASE 7 — identidade externa segura (§10.4 caso A): chave própria, nunca
  // confundida com telefone nem com nome exibido.
  const platform = String(payload?.platform || '').trim().toLowerCase()
  const platformContactKey = String(payload?.platform_contact_key || '').trim()

  if (platform && platformContactKey) {
    return `ext:${platform}:${platformContactKey}`
  }

  const phone = normalizePhone(payload?.phone)

  if (phone) {
    return `phone:${phone}`
  }

  const displayName = normalizeDisplayName(payload?.display_name)

  return displayName ? `name:${displayName}` : null
}

// Cache de resolução por empresa + identidade (identidade externa segura,
// telefone ou nome exibido).
// - resultados estáveis ficam em cache até clear() (botão "Atualizar");
// - a requisição em voo só é compartilhada dentro da MESMA geração de
//   fronteira de conversa (boundaryToken): no A → B → A, A₂ sempre dispara
//   o próprio RESOLVE_LEAD e nunca herda a promise presa de A₁;
// - a empresa ativa faz parte da chave: troca de empresa nunca reaproveita
//   a resolução da empresa anterior.
function createLeadResolutionCache() {
  const resolvedByKey = new Map()
  const inFlightByKey = new Map()

  function buildKey(payload, companyId) {
    const identity = buildResolutionIdentity(payload)

    return identity
      ? `${String(companyId || '')}::${identity}`
      : null
  }

  function resolve(payload, {
    companyId = null,
    boundaryToken = null,
    load,
  }) {
    const key = buildKey(payload, companyId)

    if (!key) {
      return Promise.resolve(load(payload))
    }

    if (resolvedByKey.has(key)) {
      return Promise.resolve(resolvedByKey.get(key))
    }

    const inFlight = inFlightByKey.get(key)

    if (inFlight && inFlight.boundaryToken === boundaryToken) {
      return inFlight.request
    }

    const request = Promise.resolve(load(payload))
      .then((result) => {
        if (isCacheableResolution(result)) {
          resolvedByKey.set(key, result)
        }

        return result
      })
      .finally(() => {
        if (inFlightByKey.get(key)?.request === request) {
          inFlightByKey.delete(key)
        }
      })

    inFlightByKey.set(key, {
      boundaryToken,
      request,
    })

    return request
  }

  function clear() {
    resolvedByKey.clear()
    inFlightByKey.clear()
  }

  return Object.freeze({
    resolve,
    clear,
    size() {
      return resolvedByKey.size
    },
  })
}

function isSuccessfulResult(result) {
  return Boolean(
    result?.ok === true &&
    result?.payload?.ok === true,
  )
}

function createCoreApiComposition({
  getApi,
  captureResilienceTools,
  nullBaseRebaseTools,
} = {}) {
  const leadResolutionCache = createLeadResolutionCache()

  const captureCoordinator =
    captureResilienceTools?.createCaptureCoordinator?.() || null

  const nullBaseTracker =
    nullBaseRebaseTools?.createNullBaseRebaseTracker?.() || null

  function api() {
    return getApi()
  }

  // Retry transitório (rede/401/5xx) com backoff, fora do cache — mesma
  // política que capture-resilience.js instalava por monkey-patch.
  function resolveLead(payload, {
    companyId = null,
    boundaryToken = null,
  } = {}) {
    const loadThroughCache = (requestPayload) =>
      leadResolutionCache.resolve(requestPayload, {
        companyId,
        boundaryToken,
        load: (cachePayload) => api().resolveLead(cachePayload),
      })

    if (
      typeof captureResilienceTools?.resolveLeadWithRetry !==
      'function'
    ) {
      return loadThroughCache(payload)
    }

    return captureResilienceTools.resolveLeadWithRetry(
      loadThroughCache,
      payload,
      {
        maxAttempts: Infinity,
      },
    )
  }

  async function ingestCapturedMessages(payload) {
    const nullBasePrepared =
      nullBaseTracker
        ? nullBaseTracker.preparePayload(payload)
        : {
            payload,
            nullBaseMessageKeys: [],
          }

    const coordinatedPayload =
      captureCoordinator
        ? captureCoordinator.preparePayload(
            nullBasePrepared.payload,
          )
        : nullBasePrepared.payload

    const result =
      await api().ingestCapturedMessages(
        coordinatedPayload,
      )

    if (isSuccessfulResult(result)) {
      captureCoordinator?.recordResponse(
        coordinatedPayload?.conversation_key,
        result.payload?.message_results,
      )

      nullBaseTracker?.recordResponse(
        nullBasePrepared.payload?.conversation_key,
        nullBasePrepared.nullBaseMessageKeys,
        result.payload?.message_results,
      )
    }

    return result
  }

  return Object.freeze({
    resolveLead,
    ingestCapturedMessages,
    clearLeadResolutionCache() {
      leadResolutionCache.clear()
    },
  })
}

const api = Object.freeze({
  create: createCoreApiComposition,
  createLeadResolutionCache,
  buildResolutionIdentity,
  isCacheableResolution,
})

root.YolenCompanionCoreApiComposition = api

if (
  typeof module !== 'undefined' &&
  module.exports
) {
  module.exports = api
}
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : window,
)
