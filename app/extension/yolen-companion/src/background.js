/* global browser, chrome, YolenCompanionCaptureTransport, YolenManyChatAudioBackgroundTransport, YolenManyChatSafeIdentityBackground, YolenCompanionBackgroundPrivacy */

const SESSION_STORAGE_KEY = 'yolen_companion_session'
const DEVICE_STORAGE_KEY = 'yolen_companion_device_key'
const LOCAL_BASE_URL = 'http://localhost:3000'

// Configuração canônica do canal (src/companion-environment.js, carregada
// antes deste arquivo; nos pacotes prod/homolog ela é GERADA pelo build).
// Só ela decide o backend padrão e as origens da Yolen autorizadas: PROD
// aceita só produção, HOMOLOG só o preview configurado naquele build.
// Fora do manifest (testes que avaliam só este arquivo) vale o canal dev.
const companionEnvironment =
  globalThis.YolenCompanionEnvironment || {
    channel: 'dev',
    api_base_url: 'https://cockpit-comercial-vocn.vercel.app',
    allowed_base_urls: ['https://cockpit-comercial-vocn.vercel.app', LOCAL_BASE_URL],
    backend_match_required: false,
  }

const DEFAULT_BASE_URL = companionEnvironment.api_base_url
const ALLOWED_BASE_URLS = companionEnvironment.allowed_base_urls

if (
  !Array.isArray(ALLOWED_BASE_URLS) ||
  !ALLOWED_BASE_URLS.includes(DEFAULT_BASE_URL)
) {
  throw new Error(
    'Configuração de ambiente do Companion inválida.',
  )
}

const extensionApi = typeof browser !== 'undefined' ? browser : chrome

const captureTransportTools =
  globalThis.YolenCompanionCaptureTransport ||
  YolenCompanionCaptureTransport

const manyChatAudioTransportTools =
  globalThis.YolenManyChatAudioBackgroundTransport ||
  YolenManyChatAudioBackgroundTransport

const manyChatSafeIdentityTools =
  globalThis.YolenManyChatSafeIdentityBackground ||
  YolenManyChatSafeIdentityBackground

const backgroundPrivacyTools =
  globalThis.YolenCompanionBackgroundPrivacy ||
  YolenCompanionBackgroundPrivacy

if (!backgroundPrivacyTools) {
  throw new Error(
    'Módulo de privacidade de resolução do Companion não carregado.',
  )
}

// FASE 7 — INV-6/Q3: respostas de resolução/criação para o content script
// ManyChat saem daqui já reduzidas à allowlist (ver
// companion-background-privacy.js).
const backgroundPrivacy =
  backgroundPrivacyTools.createBackgroundPrivacy()

if (!captureTransportTools) {
  throw new Error(
    'Módulo de transporte da captura do Companion não carregado.',
  )
}

if (!manyChatAudioTransportTools) {
  throw new Error(
    'Módulo de transporte de áudio do ManyChat não carregado.',
  )
}

if (!manyChatSafeIdentityTools) {
  throw new Error(
    'Módulo da bridge segura de identidade do ManyChat não carregado.',
  )
}

let deviceKeyPromise = null

// Canal HOMOLOG: o backend configurado precisa se declarar PREVIEW
// (/api/companion/build-identity) antes de receber qualquer token — uma
// origem de produção que escape da validação do build (alias desconhecido)
// nunca recebe tráfego autenticado de um pacote HML. A confirmação vale
// alguns minutos; falhas nunca são memorizadas.
const HOMOLOG_BACKEND_CONFIRMATION_TTL_MS = 5 * 60 * 1000
let homologBackendConfirmedAt = 0

// Qualquer origem fora do canal cai no backend do canal — nunca em outro.
function getAllowedBaseUrl(baseUrl) {
  if (ALLOWED_BASE_URLS.includes(baseUrl)) {
    return baseUrl
  }

  return DEFAULT_BASE_URL
}

function storageGet(key) {
  if (typeof browser !== 'undefined') {
    return browser.storage.local.get(key)
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(key, resolve)
  })
}

function storageSet(value) {
  if (typeof browser !== 'undefined') {
    return browser.storage.local.set(value)
  }

  return new Promise((resolve) => {
    chrome.storage.local.set(value, resolve)
  })
}

function storageRemove(key) {
  if (typeof browser !== 'undefined') {
    return browser.storage.local.remove(key)
  }

  return new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve)
  })
}

async function getOrCreateDeviceKey() {
  if (deviceKeyPromise) {
    return deviceKeyPromise
  }

  deviceKeyPromise = (async () => {
    const stored =
      await storageGet(DEVICE_STORAGE_KEY)

    const existing =
      stored?.[DEVICE_STORAGE_KEY]

    if (
      captureTransportTools.isUuid(
        existing,
      )
    ) {
      return existing
        .trim()
        .toLowerCase()
    }

    const generated =
      captureTransportTools
        .createDeviceKey(
          globalThis.crypto,
        )

    await storageSet({
      [DEVICE_STORAGE_KEY]:
        generated,
    })

    return generated
  })()

  try {
    return await deviceKeyPromise
  } finally {
    deviceKeyPromise = null
  }
}

async function getCachedSession() {
  const stored = await storageGet(SESSION_STORAGE_KEY)
  return stored?.[SESSION_STORAGE_KEY] ?? null
}

async function setCachedSession(session) {
  await storageSet({
    [SESSION_STORAGE_KEY]: session,
  })
}

function isExpired(session) {
  const expiresAt = session?.payload?.expires_at

  if (!expiresAt) {
    return true
  }

  return new Date(expiresAt).getTime() <= Date.now()
}

function isValidSession(session) {
  return (
    session?.ok === true &&
    session?.payload?.ok === true &&
    Boolean(session.payload.companion_token) &&
    !isExpired(session)
  )
}

function normalizeSessionResponse(session) {
  if (!session) {
    return null
  }

  return {
    ok: session.ok === true,
    statusCode: session.statusCode || 0,
    payload: session.payload || null,
    origin: session.origin || null,
    capturedAt: session.capturedAt || null,
    fromCache: true,
  }
}

async function getValidCachedSession() {
  const cachedSession = normalizeSessionResponse(await getCachedSession())

  if (isValidSession(cachedSession)) {
    return cachedSession
  }

  await storageRemove(SESSION_STORAGE_KEY)
  return null
}

function needsIdentityRefresh(session) {
  const companyName =
    String(
      session?.payload?.active_company?.name ||
      '',
    )
      .trim()
      .toLowerCase()

  const userName =
    String(
      session?.payload?.user?.full_name ||
      session?.payload?.user?.email ||
      '',
    ).trim()

  return (
    !userName ||
    !companyName ||
    companyName ===
      'empresa sem nome' ||
    companyName ===
      'empresa não carregada'
  )
}

async function refreshCachedSessionIdentity(
  message,
  cachedSession,
) {
  if (!needsIdentityRefresh(cachedSession)) {
    return cachedSession
  }

  // HML com backend não confirmado como preview: o token não sai.
  if (await getHomologBackendRefusal()) {
    return cachedSession
  }

  const sessionBaseUrl =
    ALLOWED_BASE_URLS.includes(
      cachedSession.origin,
    )
      ? cachedSession.origin
      : null

  const baseUrl =
    getAllowedBaseUrl(
      sessionBaseUrl ||
      message.baseUrl ||
      DEFAULT_BASE_URL,
    )

  const token =
    cachedSession
      .payload
      .companion_token

  try {
    const response =
      await fetch(
        `${baseUrl}/api/companion/me`,
        {
          method: 'GET',
          credentials: 'omit',
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        },
      )

    const payload =
      await response
        .json()
        .catch(
          () => null,
        )

    if (!response.ok) {
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        await storageRemove(
          SESSION_STORAGE_KEY,
        )

        return {
          ok: false,
          statusCode:
            response.status,
          payload,
          origin:
            cachedSession.origin,
          capturedAt:
            cachedSession.capturedAt,
          fromCache:
            false,
        }
      }

      return cachedSession
    }

    if (
      !payload ||
      payload.ok !== true
    ) {
      return cachedSession
    }

    const refreshedSession = {
      ok: true,
      statusCode:
        response.status,
      payload: {
        ...cachedSession.payload,
        ...payload,
        companion_token:
          token,
        expires_at:
          cachedSession
            .payload
            .expires_at,
      },
      origin:
        cachedSession.origin,
      capturedAt:
        new Date().toISOString(),
    }

    await setCachedSession(
      refreshedSession,
    )

    return {
      ...refreshedSession,
      fromCache:
        false,
    }
  } catch {
    return cachedSession
  }
}

async function handleSetSession(message) {
  if (isValidSession(message.payload?.session)) {
    await setCachedSession(message.payload.session)

    return {
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        status: 'SESSION_STORED',
      },
    }
  }

  return {
    ok: false,
    statusCode: 401,
    payload: {
      ok: false,
      status: 'SESSION_IGNORED_INVALID',
      error: 'Sessão inválida ignorada pela extensão.',
    },
  }
}

async function requestYolenWithToken(message, path, body) {
  const cachedSession = await getValidCachedSession()

  if (!cachedSession) {
    return {
      ok: false,
      statusCode: 401,
      payload: {
        ok: false,
        status: 'NO_COMPANION_SESSION',
        error: 'Sessão do Companion não capturada. Clique em Conectar Yolen.',
      },
    }
  }

  const homologRefusal =
    await getHomologBackendRefusal()

  if (homologRefusal) {
    return homologRefusal
  }

  const sessionBaseUrl =
    ALLOWED_BASE_URLS.includes(
      cachedSession.origin,
    )
      ? cachedSession.origin
      : null

  const baseUrl =
    getAllowedBaseUrl(
      sessionBaseUrl ||
        message.baseUrl ||
        DEFAULT_BASE_URL,
    )

  const token =
    cachedSession
      .payload
      .companion_token

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    })

    const payload = await response.json().catch(() => null)

    return {
      ok: response.ok,
      statusCode: response.status,
      payload,
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      payload: {
        ok: false,
        status: 'NETWORK_ERROR',
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro de rede ao chamar a Yolen.',
      },
    }
  }
}

async function handleCaptureIngestion(message) {
  try {
    const deviceKey =
      await getOrCreateDeviceKey()

    const requestBody =
      captureTransportTools
        .buildIngestionRequestBody(
          message.payload,
          deviceKey,
        )

    return requestYolenWithToken(
      message,
      '/api/companion/capture/messages',
      requestBody,
    )
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        ok: false,
        status:
          'INVALID_CAPTURE_TRANSPORT',
        error:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Não foi possível preparar a ingestão das mensagens.',
      },
    }
  }
}

async function handleConversationAnalysis(message) {
  try {
    const deviceKey =
      await getOrCreateDeviceKey()

    const payload =
      message.payload &&
      typeof message.payload === 'object' &&
      !Array.isArray(message.payload)
        ? message.payload
        : {}

    return requestYolenWithToken(
      message,
      '/api/companion/analyze-conversation',
      {
        ...payload,
        device_key:
          deviceKey,
      },
    )
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        ok: false,
        status:
          'INVALID_ANALYSIS_TRANSPORT',
        error:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Não foi possível preparar a análise do Companion.',
      },
    }
  }
}

async function handleAnalysisJobRetry(message) {
  try {
    const deviceKey =
      await getOrCreateDeviceKey()

    const analysisJobId =
      typeof message.payload?.analysis_job_id === 'string'
        ? message.payload.analysis_job_id
        : null

    const allowSucceeded =
      message.payload?.allow_succeeded === true

    return requestYolenWithToken(
      message,
      '/api/companion/analysis-job-retry',
      {
        analysis_job_id:
          analysisJobId,
        device_key:
          deviceKey,
        allow_succeeded:
          allowSucceeded,
      },
    )
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        ok: false,
        status:
          'INVALID_ANALYSIS_RETRY_TRANSPORT',
        error:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Não foi possível preparar a nova tentativa da análise profunda.',
      },
    }
  }
}

async function handleManyChatAudioTranscription(message) {
  const payload =
    message.payload &&
    typeof message.payload === 'object' &&
    !Array.isArray(message.payload)
      ? message.payload
      : {}

  try {
    const media =
      await manyChatAudioTransportTools
        .fetchManyChatAudio({
          url: payload.audio_url,
        })

    const safeTransport =
      manyChatAudioTransportTools
        .safeTransportView(media)

    if (!media?.ready) {
      return {
        ok: false,
        statusCode:
          Number(media?.status) >= 400
            ? Number(media.status)
            : 400,
        payload: {
          ok: false,
          status:
            'MANYCHAT_AUDIO_FETCH_FAILED',
          error:
            media?.reason ||
            'Não foi possível obter o áudio do ManyChat.',
          transport: safeTransport,
        },
      }
    }

    const built =
      manyChatAudioTransportTools
        .buildTranscriptionPayload({
          cycle_id: payload.cycle_id,
          audio_target_key:
            payload.audio_target_key,
          channel: payload.channel,
          audio_index: payload.audio_index,
          media,
        })

    if (!built?.ready || !built.payload) {
      return {
        ok: false,
        statusCode: 400,
        payload: {
          ok: false,
          status:
            'INVALID_MANYCHAT_AUDIO_TRANSCRIPTION_REQUEST',
          error:
            built?.reason ||
            'Não foi possível preparar a transcrição do áudio do ManyChat.',
          transport: safeTransport,
        },
      }
    }

    const result =
      await requestYolenWithToken(
        message,
        '/api/companion/transcribe-audio',
        built.payload,
      )

    return {
      ...result,
      transport: safeTransport,
    }
  } catch (error) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        status:
          'MANYCHAT_AUDIO_TRANSPORT_ERROR',
        error:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Falha inesperada no transporte de áudio do ManyChat.',
      },
    }
  }
}

// Identidade do backend que ESTE pacote usa (canal homolog: o preview
// configurado — nunca a origem de uma sessão nem produção). Sem token: o
// endpoint só expõe ambiente e commit do deploy.
async function fetchBackendBuildIdentity() {
  const baseUrl = DEFAULT_BASE_URL

  try {
    const response = await fetch(
      `${baseUrl}/api/companion/build-identity`,
      {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
      },
    )

    const payload = await response.json().catch(() => null)

    const commit =
      typeof payload?.commit === 'string' &&
      /^[0-9a-f]{40}$/.test(payload.commit)
        ? payload.commit
        : null

    const ok = response.ok && Boolean(commit)

    if (ok && payload?.environment === 'preview') {
      homologBackendConfirmedAt = Date.now()
    }

    return {
      ok,
      statusCode: response.status,
      payload: {
        ok,
        base_url: baseUrl,
        environment:
          typeof payload?.environment === 'string'
            ? payload.environment
            : null,
        commit,
        commit_short: commit ? commit.slice(0, 8) : null,
      },
    }
  } catch {
    return {
      ok: false,
      statusCode: 0,
      payload: {
        ok: false,
        base_url: baseUrl,
        environment: null,
        commit: null,
        commit_short: null,
        error: 'Backend indisponível para conferir o commit.',
      },
    }
  }
}

async function getHomologBackendRefusal() {
  if (companionEnvironment.backend_match_required !== true) {
    return null
  }

  if (
    homologBackendConfirmedAt &&
    Date.now() - homologBackendConfirmedAt <
      HOMOLOG_BACKEND_CONFIRMATION_TTL_MS
  ) {
    return null
  }

  const identity = await fetchBackendBuildIdentity()

  if (
    identity.ok === true &&
    identity.payload?.environment === 'preview'
  ) {
    return null
  }

  return {
    ok: false,
    statusCode: 409,
    payload: {
      ok: false,
      status: 'HOMOLOG_BACKEND_NOT_PREVIEW',
      error:
        identity.payload?.environment === 'production'
          ? 'O backend deste pacote HML é PRODUÇÃO: nenhum tráfego autenticado é enviado.'
          : 'Backend deste pacote HML não confirmado como preview: nenhum tráfego autenticado é enviado.',
    },
  }
}

async function handleCompanionMessage(message, sender) {
  if (message.action === 'GET_BACKEND_BUILD_IDENTITY') {
    return fetchBackendBuildIdentity()
  }

  // FASE 6 — fonte de áudio do ManyChatAdapter (só a mídia validada).
  if (message.action === 'FETCH_MANYCHAT_AUDIO_SOURCE') {
    return manyChatAudioTransportTools.handleAudioSourceRequest(
      message,
      sender,
    )
  }

  if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
    return manyChatSafeIdentityTools.handleIdentityRequest(
      message,
      sender,
      extensionApi,
    )
  }

  if (message.action === 'GET_ME') {
    const cachedSession =
      await getValidCachedSession()

    if (cachedSession) {
      return refreshCachedSessionIdentity(
        message,
        cachedSession,
      )
    }

    return {
      ok: false,
      statusCode: 401,
      payload: {
        ok: false,
        status: 'NO_COMPANION_SESSION',
        error: 'Sessão do Companion não capturada. Clique em Conectar Yolen.',
      },
    }
  }

  if (message.action === 'SET_SESSION') {
    return handleSetSession(message)
  }

  if (message.action === 'CLEAR_SESSION') {
    await storageRemove(SESSION_STORAGE_KEY)

    return {
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        status: 'SESSION_CLEARED',
      },
    }
  }

  if (
    message.action ===
    'INGEST_CAPTURE_MESSAGES'
  ) {
    return handleCaptureIngestion(
      message,
    )
  }

  if (message.action === 'RESOLVE_LEAD') {
    return requestYolenWithToken(message, '/api/companion/resolve-lead', message.payload)
  }

  // STEP 2A.3 — busca e first-link de identidade externa (ManyChat). Só
  // chama rpc_link_companion_external_identity_first (via
  // /api/companion/link-lead); nunca a RPC de relink. company_id,
  // actor_user_id e identity_source nunca vêm do content script — o
  // servidor deriva tudo do token Companion, exatamente como as demais
  // actions acima.
  if (message.action === 'SEARCH_LINKABLE_LEADS') {
    return requestYolenWithToken(message, '/api/companion/link-lead/search', message.payload)
  }

  if (message.action === 'FIRST_LINK_EXTERNAL_IDENTITY') {
    return requestYolenWithToken(message, '/api/companion/link-lead', message.payload)
  }

  if (message.action === 'CREATE_LEAD') {
    return requestYolenWithToken(
      message,
      '/api/companion/create-lead',
      message.payload,
    )
  }

  if (
    message.action ===
    'APPLY_LEAD_ENRICHMENT'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/enrich-lead',
      message.payload,
    )
  }

  if (message.action === 'ANALYZE_CONVERSATION') {
    return handleConversationAnalysis(
      message,
    )
  }

  if (message.action === 'APPLY_SUGGESTION') {
    return requestYolenWithToken(
      message,
      '/api/companion/apply-suggestion',
      message.payload,
    )
  }

  if (
    message.action ===
    'GET_ANALYSIS_JOB_STATUS'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/analysis-job-status',
      message.payload,
    )
  }

  if (
    message.action ===
    'RETRY_ANALYSIS_JOB'
  ) {
    return handleAnalysisJobRetry(
      message,
    )
  }

  if (
    message.action ===
    'LOAD_CLIENT_CONTEXT'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/client-context',
      message.payload,
    )
  }

  if (
    message.action ===
    'LOAD_DECISION_STATE'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/decision-state',
      message.payload,
    )
  }

  if (
    message.action ===
    'LOAD_ANALYSIS_VIEW_MODEL'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/analysis-view-model',
      message.payload,
    )
  }

  if (
    message.action ===
    'LOAD_CUSTOMER_VIEW_MODEL'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/customer-view-model',
      message.payload,
    )
  }

  if (
    message.action ===
    'LOAD_METHOD_GUIDANCE'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/method-guidance',
      message.payload,
    )
  }

  if (message.action === 'REGISTER_MESSAGE_ACTION') {
    return requestYolenWithToken(
      message,
      '/api/companion/message-action',
      message.payload,
    )
  }

  if (message.action === 'REGISTER_ACTION_EVENT') {
    return requestYolenWithToken(
      message,
      '/api/companion/actions/events',
      message.payload,
    )
  }

  if (message.action === 'TRANSCRIBE_MANYCHAT_AUDIO') {
    return handleManyChatAudioTranscription(
      message,
    )
  }

  if (message.action === 'TRANSCRIBE_AUDIO') {
    return requestYolenWithToken(
      message,
      '/api/companion/transcribe-audio',
      message.payload,
    )
  }

  if (message.action === 'LOAD_AUDIO_TRANSCRIPTIONS') {
    return requestYolenWithToken(
      message,
      '/api/companion/audio-transcriptions',
      message.payload,
    )
  }

  if (
    message.action ===
    'PREVIEW_CONVERSATION_REGISTRATION'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/register-conversation/preview',
      message.payload,
    )
  }

  if (
    message.action ===
    'CONFIRM_CONVERSATION_REGISTRATION'
  ) {
    return requestYolenWithToken(
      message,
      '/api/companion/register-conversation/confirm',
      message.payload,
    )
  }

  if (message.action === 'LOAD_LEAD_SUMMARY') {
    return requestYolenWithToken(
      message,
      '/api/companion/lead-summary',
      message.payload,
    )
  }

  if (message.action === 'SAVE_LEAD_SUMMARY') {
    return requestYolenWithToken(
      message,
      '/api/companion/lead-summary/save',
      message.payload,
    )
  }

  return {
    ok: false,
    statusCode: 400,
    payload: {
      ok: false,
      error: 'Ação não reconhecida pelo Yolen Companion.',
    },
  }
}

// undefined: remetente sem URL; null: URL que não se consegue ler (nunca
// passa como a origem declarada).
function getSenderOrigin(sender) {
  if (!sender?.url) {
    return undefined
  }

  try {
    return new URL(sender.url).origin
  } catch {
    return null
  }
}

async function handleBridgeMessage(message, sender) {
  if (message.action === 'SESSION_UPDATE') {
    const senderOrigin = getSenderOrigin(sender)

    // A ponte só entrega sessão de uma origem que o canal deste pacote
    // autoriza (HOMOLOG: só o preview; PROD: só produção), e a origem
    // declarada precisa ser a da página que enviou.
    if (
      isValidSession(message.session) &&
      (
        !ALLOWED_BASE_URLS.includes(message.session.origin) ||
        (
          senderOrigin !== undefined &&
          senderOrigin !== message.session.origin
        )
      )
    ) {
      return {
        ok: false,
        statusCode: 403,
        payload: {
          ok: false,
          status: 'SESSION_IGNORED_ORIGIN',
          error: 'Sessão de uma origem que este pacote não autoriza.',
        },
      }
    }

    if (isValidSession(message.session)) {
      await setCachedSession(message.session)

      return {
        ok: true,
        statusCode: 200,
        payload: {
          ok: true,
          status: 'SESSION_STORED',
        },
      }
    }

    return {
      ok: false,
      statusCode: 401,
      payload: {
        ok: false,
        status: 'SESSION_IGNORED_INVALID',
        error: 'Sessão inválida ignorada pela extensão.',
      },
    }
  }

  return {
    ok: false,
    statusCode: 400,
    payload: {
      ok: false,
      error: 'Ação não reconhecida pela ponte da Yolen.',
    },
  }
}

async function handleMessage(message, sender) {
  if (!message) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        ok: false,
        error: 'Mensagem vazia para o Yolen Companion.',
      },
    }
  }

  if (message.source === 'YOLEN_COMPANION') {
    const prepared =
      backgroundPrivacy.prepareRequest(message, sender)

    if (prepared.response) {
      return prepared.response
    }

    const response =
      await handleCompanionMessage(prepared.message, sender)

    return backgroundPrivacy.sanitizeResponse(
      prepared.message,
      sender,
      response,
    )
  }

  if (message.source === 'YOLEN_COMPANION_BRIDGE') {
    return handleBridgeMessage(message, sender)
  }

  return {
    ok: false,
    statusCode: 400,
    payload: {
      ok: false,
      error: 'Origem não reconhecida pelo Yolen Companion.',
    },
  }
}

extensionApi.runtime.onMessage.addListener((message, sender) => {
  return Promise.resolve(handleMessage(message, sender))
})