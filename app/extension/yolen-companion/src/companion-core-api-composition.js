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
//   ingestCapturedMessages = recuperação de lote ∘ rebase de base nula ∘
//                            coordenação de versões ∘ API
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

// Recuperação do lote de captura (rodada 5). Uma mensagem recusada pelo
// servidor nunca segura a conversa inteira:
// - recusa 400 que aponta uma mensagem (validation.message_index ou
//   validation.message_key): a mensagem sai do lote, entra em quarentena
//   curta e as outras seguem na hora;
// - BASE_VERSION_WITHOUT_CANONICAL_STATE: as mensagens apontadas (ou
//   todas com base_version, se o servidor não disser quais) são
//   reenviadas sem base_version UMA vez; uma segunda recusa encerra.
// O resultado leva `capture_recovery` (mensagens isoladas, chaves
// reenviadas sem base, código da falha) para o Core registrar o alerta de
// captura. As validações do banco não mudam.
const BASE_VERSION_WITHOUT_CANONICAL_STATE =
  'BASE_VERSION_WITHOUT_CANONICAL_STATE'

const CAPTURE_QUARANTINE_MS =
  10 * 60 * 1000

const MAX_QUARANTINED_CONVERSATIONS =
  100

function readCaptureValidation(result) {
  const validation =
    result?.payload?.validation

  return validation &&
    typeof validation === 'object'
    ? validation
    : null
}

function readCaptureFailureCode(result) {
  const validation =
    readCaptureValidation(result)

  const code =
    typeof validation?.code === 'string' &&
    validation.code.trim()
      ? validation.code.trim()
      : typeof result?.payload?.status === 'string' &&
          result.payload.status.trim()
        ? result.payload.status.trim()
        : `HTTP_${Number(result?.statusCode || 0)}`

  return code
    .replace(/[^A-Z0-9_]/gi, '_')
    .slice(0, 64)
}

function findRejectedMessageKey(result, payload) {
  if (Number(result?.statusCode || 0) !== 400) {
    return null
  }

  const validation =
    readCaptureValidation(result)

  const messages =
    Array.isArray(payload?.messages)
      ? payload.messages
      : []

  const byKey =
    typeof validation?.message_key === 'string'
      ? messages.find(
          (message) =>
            message?.message_key === validation.message_key,
        )
      : null

  if (byKey) {
    return byKey.message_key
  }

  const index =
    Number.isInteger(validation?.message_index)
      ? validation.message_index
      : null

  return index !== null &&
    index >= 0 &&
    index < messages.length &&
    typeof messages[index]?.message_key === 'string'
    ? messages[index].message_key
    : null
}

function captureMessageFingerprint(message) {
  return JSON.stringify([
    message?.occurred_at ?? null,
    message?.observed_at ?? null,
    message?.content_type ?? null,
    message?.text_content ?? null,
    message?.audio_transcription ?? null,
    message?.is_deleted ?? null,
  ])
}

function createCaptureQuarantine({ now = () => Date.now() } = {}) {
  const byConversation = new Map()

  function entriesFor(conversationKey, createIfMissing) {
    let entries = byConversation.get(conversationKey)

    if (!entries && createIfMissing) {
      entries = new Map()
      byConversation.set(conversationKey, entries)

      if (byConversation.size > MAX_QUARANTINED_CONVERSATIONS) {
        const oldest = byConversation.keys().next().value

        if (oldest) {
          byConversation.delete(oldest)
        }
      }
    }

    return entries || null
  }

  function add(conversationKey, message, code) {
    const entries = entriesFor(conversationKey, true)

    entries.set(message.message_key, {
      fingerprint: captureMessageFingerprint(message),
      until: now() + CAPTURE_QUARANTINE_MS,
      code,
    })
  }

  // Mensagens em quarentena (mesmo conteúdo, dentro do prazo) saem do
  // lote antes do envio; conteúdo novo ou prazo vencido volta a tentar.
  function filter(conversationKey, messages) {
    const entries = entriesFor(conversationKey, false)

    if (!entries || !Array.isArray(messages)) {
      return { messages, skipped: [] }
    }

    const skipped = []
    const kept = messages.filter((message) => {
      const entry = entries.get(message?.message_key)

      if (!entry) {
        return true
      }

      if (
        entry.until <= now() ||
        entry.fingerprint !== captureMessageFingerprint(message)
      ) {
        entries.delete(message.message_key)
        return true
      }

      skipped.push({
        message_key: message.message_key,
        code: entry.code,
      })

      return false
    })

    return { messages: kept, skipped }
  }

  return Object.freeze({ add, filter })
}

function createCoreApiComposition({
  getApi,
  captureResilienceTools,
  nullBaseRebaseTools,
  now = () => Date.now(),
} = {}) {
  const leadResolutionCache = createLeadResolutionCache()

  const captureCoordinator =
    captureResilienceTools?.createCaptureCoordinator?.() || null

  const nullBaseTracker =
    nullBaseRebaseTools?.createNullBaseRebaseTracker?.() || null

  const captureQuarantine =
    createCaptureQuarantine({ now })

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

  async function sendCapturePayload(payload) {
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

    return {
      result,
      sentPayload: coordinatedPayload,
    }
  }

  function forgetCaptureVersions(conversationKey, messageKeys) {
    captureCoordinator?.forgetMessages?.(conversationKey, messageKeys)
    nullBaseTracker?.forgetMessages?.(conversationKey, messageKeys)
  }

  async function ingestCapturedMessages(payload) {
    const conversationKey =
      typeof payload?.conversation_key === 'string'
        ? payload.conversation_key
        : ''

    const recovery = {
      isolated: [],
      rebased_message_keys: [],
      failure_code: null,
    }

    const quarantined =
      captureQuarantine.filter(
        conversationKey,
        payload?.messages,
      )

    recovery.isolated.push(...quarantined.skipped)

    let current =
      quarantined.skipped.length > 0
        ? { ...payload, messages: quarantined.messages }
        : payload

    let baseVersionResent = false

    const sentMessageCount =
      Array.isArray(payload?.messages) ? payload.messages.length : 0

    const maxAttempts =
      sentMessageCount + 2

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (
        sentMessageCount > 0 &&
        Array.isArray(current?.messages) &&
        current.messages.length === 0
      ) {
        // Tudo isolado: nada a enviar, e nada a repetir para este lote.
        return {
          ok: true,
          statusCode: 200,
          payload: {
            ok: true,
            status: 'CAPTURE_NOTHING_TO_SEND',
            message_results: [],
          },
          capture_recovery: recovery,
        }
      }

      const { result, sentPayload } =
        await sendCapturePayload(current)

      if (isSuccessfulResult(result)) {
        return {
          ...result,
          capture_recovery: recovery,
        }
      }

      const failureCode =
        readCaptureFailureCode(result)

      if (
        failureCode === BASE_VERSION_WITHOUT_CANONICAL_STATE &&
        !baseVersionResent
      ) {
        baseVersionResent = true

        const validation =
          readCaptureValidation(result)

        const pointedKeys =
          Array.isArray(validation?.message_keys)
            ? validation.message_keys.filter(
                (key) => typeof key === 'string',
              )
            : []

        const keysToResend =
          new Set(
            pointedKeys.length > 0
              ? pointedKeys
              : (sentPayload?.messages || [])
                  .filter((message) => message?.base_version != null)
                  .map((message) => message.message_key),
          )

        forgetCaptureVersions(conversationKey, [...keysToResend])
        recovery.rebased_message_keys.push(...keysToResend)

        current = {
          ...current,
          messages: current.messages.map((message) =>
            keysToResend.has(message?.message_key)
              ? { ...message, base_version: null }
              : message,
          ),
        }

        continue
      }

      const rejectedKey =
        failureCode === BASE_VERSION_WITHOUT_CANONICAL_STATE
          ? null
          : findRejectedMessageKey(result, sentPayload)

      if (rejectedKey) {
        const rejectedMessage =
          current.messages.find(
            (message) => message?.message_key === rejectedKey,
          )

        if (rejectedMessage) {
          captureQuarantine.add(
            conversationKey,
            rejectedMessage,
            failureCode,
          )
        }

        recovery.isolated.push({
          message_key: rejectedKey,
          code: failureCode,
        })

        current = {
          ...current,
          messages: current.messages.filter(
            (message) => message?.message_key !== rejectedKey,
          ),
        }

        continue
      }

      recovery.failure_code = failureCode

      return {
        ...result,
        capture_recovery: recovery,
      }
    }

    recovery.failure_code =
      recovery.failure_code || 'CAPTURE_RECOVERY_EXHAUSTED'

    return {
      ok: false,
      statusCode: 400,
      payload: {
        ok: false,
        status: 'CAPTURE_RECOVERY_EXHAUSTED',
        error: 'Não foi possível persistir a captura na Yolen.',
      },
      capture_recovery: recovery,
    }
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
  createCaptureQuarantine,
  readCaptureFailureCode,
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
