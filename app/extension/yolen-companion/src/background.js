/* global browser, chrome */

const SESSION_STORAGE_KEY = 'yolen_companion_session'

const extensionApi = typeof browser !== 'undefined' ? browser : chrome

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

async function handleSetSession(message) {
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

async function handleCompanionMessage(message) {
  if (message.action === 'GET_ME') {
    const cachedSession = await getValidCachedSession()

    if (cachedSession) {
      return cachedSession
    }

    return {
      ok: false,
      statusCode: 401,
      payload: {
        ok: false,
        status: 'NO_COMPANION_SESSION',
        error:
          'Sessão do Companion não capturada. Clique em Conectar Yolen.',
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

  return {
    ok: false,
    statusCode: 400,
    payload: {
      ok: false,
      error: 'Ação não reconhecida pelo Yolen Companion.',
    },
  }
}

async function handleBridgeMessage(message) {
  if (message.action === 'SESSION_UPDATE') {
    return handleSetSession(message)
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

async function handleMessage(message) {
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
    return handleCompanionMessage(message)
  }

  if (message.source === 'YOLEN_COMPANION_BRIDGE') {
    return handleBridgeMessage(message)
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

extensionApi.runtime.onMessage.addListener((message) => {
  return Promise.resolve(handleMessage(message))
})