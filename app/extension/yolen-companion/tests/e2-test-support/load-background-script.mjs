// Carrega src/background.js (e sua dependência src/capture-transport.js)
// de verdade, em uma sandbox `node:vm` (módulo nativo do Node, nenhuma
// dependência nova), com um `browser`/`fetch`/`storage.local` falsos.
//
// background.js não é um módulo (não tem `export`/`module.exports`) — é um
// script de background de extensão que, ao carregar, registra
// `extensionApi.runtime.onMessage.addListener(...)`. Para testar seu
// comportamento real sem alterar o arquivo, avaliamos o CÓDIGO-FONTE REAL
// dentro de uma sandbox e capturamos o listener registrado, exatamente
// como o navegador faria.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))

function readSource(fileName) {
  return readFileSync(`${SRC_DIR}${fileName}`, 'utf8')
}

export function createFakeBrowserRuntime(initialStorage = {}) {
  const storage = { ...initialStorage }
  let listener = null

  const browserApi = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') {
            return { [key]: storage[key] }
          }
          return { ...storage }
        },
        async set(values) {
          Object.assign(storage, values)
        },
        async remove(key) {
          delete storage[key]
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(fn) {
          listener = fn
        },
      },
    },
  }

  return {
    browser: browserApi,
    storage,
    getListener: () => listener,
  }
}

export function createFakeFetchQueue(responders) {
  const calls = []
  const remaining = [...responders]

  const fetchFn = async (url, init) => {
    calls.push({ url, init })
    const responder = remaining.shift()

    if (!responder) {
      throw new Error(`[fake-fetch] fila vazia — chamada inesperada para ${url}`)
    }

    return responder({ url, init })
  }

  return { fetchFn, calls, remaining }
}

export function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

export function rejectingFetch(error) {
  return async () => {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export function loadBackgroundScript({ fetchFn, initialStorage } = {}) {
  const runtime = createFakeBrowserRuntime(initialStorage)
  const fetchImpl = fetchFn ?? (async () => jsonResponse(200, { ok: true }))

  const sandbox = {
    console,
    browser: runtime.browser,
    fetch: fetchImpl,
    crypto: globalThis.crypto,
    Promise,
  }

  vm.createContext(sandbox)

  vm.runInContext(readSource('capture-transport.js'), sandbox, { filename: 'capture-transport.js' })
  vm.runInContext(readSource('background.js'), sandbox, { filename: 'background.js' })

  return {
    sandbox,
    storage: runtime.storage,
    sendMessage: (message) => {
      const capturedListener = runtime.getListener()

      if (!capturedListener) {
        throw new Error('background.js não registrou nenhum listener de mensagens.')
      }

      return Promise.resolve(capturedListener(message))
    },
  }
}
