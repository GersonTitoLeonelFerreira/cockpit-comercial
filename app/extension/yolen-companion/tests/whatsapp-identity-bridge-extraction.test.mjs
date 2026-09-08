// P0 — Real WhatsApp Active Chat Identity: prova de UNIDADE da extração de
// identidade dentro de src/whatsapp-identity-bridge.js (o arquivo REAL,
// carregado de verdade, não reimplementado aqui).
//
// jsdom/vm NÃO reproduz o page world real de uma WebExtension nem o React
// Fiber de verdade do WhatsApp — por isso os "fibers" aqui são objetos
// sintéticos que imitam exatamente a FORMA que o diagnóstico real (Firefox,
// conversa "Isabella Gelli Consultora") comprovou:
//   chat.__x_id = { server, user, _serialized }
//   chat.__x_contact.__x_id = { server, user, _serialized }
//   chat.__x_contact.__x_phoneNumber = { server, user, _serialized }
// Isto prova o ALGORITMO de extração (subida de fiber, leitura dos campos),
// não a presença real do Fiber no WhatsApp Web — essa prova é o smoke real
// no Firefox, que continua obrigatório antes de confiar neste caminho em
// produção.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const bridgeSource = readFileSync(
  new URL('../src/whatsapp-identity-bridge.js', import.meta.url),
  'utf8',
)

// propsAtEachDepth[0] é o fiber preso DIRETAMENTE ao node (depth 0);
// propsAtEachDepth[n] é alcançado subindo `n` vezes por `fiber.return`.
function buildFiberChain(propsAtEachDepth) {
  let root = null

  for (let i = propsAtEachDepth.length - 1; i >= 0; i -= 1) {
    root = { memoizedProps: propsAtEachDepth[i], return: root }
  }

  return root
}

function makeHeaderNode(propsAtEachDepth) {
  const node = {}

  if (propsAtEachDepth) {
    node['__reactFiber$abc123'] = buildFiberChain(propsAtEachDepth)
  }

  return node
}

function loadBridge({ headerNode } = {}) {
  const postedMessages = []
  const listeners = []

  const fakeWindow = {
    location: { origin: 'https://web.whatsapp.com' },
    addEventListener(type, handler) {
      if (type === 'message') {
        listeners.push(handler)
      }
    },
    postMessage(data, origin) {
      postedMessages.push({ data, origin })
    },
  }

  const fakeDocument = {
    querySelector(selector) {
      return selector === '#main header' ? headerNode || null : null
    },
  }

  const sandbox = {
    window: fakeWindow,
    document: fakeDocument,
    Date,
    Math,
    console,
  }

  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(bridgeSource, sandbox, {
    filename: 'whatsapp-identity-bridge.js',
  })

  function dispatchRequest(data) {
    const event = {
      source: fakeWindow,
      origin: fakeWindow.location.origin,
      data,
    }

    listeners.forEach((handler) => handler(event))
  }

  function requestIdentity(requestId = 'req-1') {
    postedMessages.length = 0

    dispatchRequest({
      source: 'YOLEN_COMPANION_CONTENT_SCRIPT',
      action: 'GET_ACTIVE_CHAT_IDENTITY',
      requestId,
      sequence: 1,
    })

    const response = postedMessages.find(
      (message) => message.data?.action === 'ACTIVE_CHAT_IDENTITY',
    )

    return response?.data
  }

  return { postedMessages, requestIdentity, dispatchRequest }
}

test('BRIDGE_READY é publicado na instalação, uma única vez', () => {
  const postedMessages = []

  const fakeWindow = {
    location: { origin: 'https://web.whatsapp.com' },
    addEventListener() {},
    postMessage(data, origin) {
      postedMessages.push({ data, origin })
    },
  }

  const sandbox = {
    window: fakeWindow,
    document: { querySelector: () => null },
    Date,
    Math,
    console,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(bridgeSource, sandbox, {
    filename: 'whatsapp-identity-bridge.js',
  })

  const readyMessages = postedMessages.filter(
    (message) => message.data?.action === 'BRIDGE_READY',
  )

  assert.equal(readyMessages.length, 1)
  assert.equal(
    readyMessages[0].data.source,
    'YOLEN_COMPANION_WHATSAPP_IDENTITY_BRIDGE',
  )
  assert.equal(readyMessages[0].origin, 'https://web.whatsapp.com')
})

test('A) chat no depth 1 do fiber é encontrado e reportado', () => {
  const header = makeHeaderNode([
    {},
    {
      chat: {
        __x_id: { server: 'c.us', user: '5511999998888', _serialized: '5511999998888@c.us' },
      },
    },
  ])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity.phone, '5511999998888')
  assert.equal(response.identity.phoneServer, 'c.us')
})

test('B) chat em depth diferente de 1 também é encontrado (não hardcoded)', () => {
  const header = makeHeaderNode([
    {},
    {},
    {},
    {},
    {
      chat: {
        __x_id: { server: 's.whatsapp.net', user: '5511977776666', _serialized: '5511977776666@s.whatsapp.net' },
      },
    },
  ])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity.phone, '5511977776666')
  assert.equal(response.identity.phoneServer, 's.whatsapp.net')
})

test('C) sem __reactFiber$ no node: identity null, sem lançar exceção', () => {
  const header = makeHeaderNode(null)

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity, null)
})

test('D) fiber presente mas nenhum nível carrega props.chat: identity null', () => {
  const header = makeHeaderNode([{}, {}, { somethingElse: true }, {}])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity, null)
})

test('E) chat @lid + contact.__x_phoneNumber @c.us válido: PN é reportado (caso real comprovado)', () => {
  // Forma exata do diagnóstico real: Isabella Gelli Consultora.
  const header = makeHeaderNode([
    {
      chat: {
        __x_id: { server: 'lid', user: '218235995730114', _serialized: '218235995730114@lid' },
        __x_contact: {
          __x_id: { server: 'lid', user: '218235995730114', _serialized: '218235995730114@lid' },
          __x_phoneNumber: { server: 'c.us', user: '554499712555', _serialized: '554499712555@c.us' },
        },
      },
    },
  ])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity.chatIdType, 'lid')
  assert.equal(response.identity.phone, '554499712555')
  assert.equal(response.identity.phoneServer, 'c.us')
  assert.equal(response.identity.phoneJid, '554499712555@c.us')
})

test('F) chat @lid sem contact.__x_phoneNumber: phone null, chatId ainda reportado como lid', () => {
  const header = makeHeaderNode([
    {
      chat: {
        __x_id: { server: 'lid', user: '218235995730114', _serialized: '218235995730114@lid' },
        __x_contact: {
          __x_id: { server: 'lid', user: '218235995730114', _serialized: '218235995730114@lid' },
        },
      },
    },
  ])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity.chatIdType, 'lid')
  assert.equal(response.identity.phone, null)
})

test('grupo (@g.us) é reportado como isGroup=true', () => {
  const header = makeHeaderNode([
    {
      chat: {
        __x_id: { server: 'g.us', user: '120363012345678901', _serialized: '120363012345678901@g.us' },
      },
    },
  ])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  assert.equal(response.identity.isGroup, true)
  assert.equal(response.identity.phone, null)
})

test('R) o payload nunca carrega conteúdo de mensagem, histórico ou lista de contatos — só as chaves de identidade mínimas', () => {
  const header = makeHeaderNode([
    {
      chat: {
        __x_id: { server: 'c.us', user: '5511999998888', _serialized: '5511999998888@c.us' },
        // Campos que existiriam de verdade num objeto Chat real do
        // WhatsApp (mensagens, contadores) não podem vazar no payload —
        // a extração só lê os campos de identidade explicitamente.
        msgs: { _models: ['mensagem 1', 'mensagem 2'] },
        unreadCount: 42,
      },
    },
  ])

  const { requestIdentity } = loadBridge({ headerNode: header })
  const response = requestIdentity()

  const identityKeys = Object.keys(response.identity).sort()

  assert.deepEqual(identityKeys, [
    'chatId',
    'chatIdType',
    'isGroup',
    'phone',
    'phoneJid',
    'phoneServer',
  ])

  assert.doesNotMatch(JSON.stringify(response), /mensagem 1/)
  assert.doesNotMatch(JSON.stringify(response), /unreadCount/)
})

test('requisição com source forjada (não CONTENT_SCRIPT_SOURCE) é ignorada — nenhuma resposta publicada', () => {
  const header = makeHeaderNode([
    { chat: { __x_id: { server: 'c.us', user: '5511999998888', _serialized: '5511999998888@c.us' } } },
  ])

  const { postedMessages, dispatchRequest } = loadBridge({ headerNode: header })

  postedMessages.length = 0

  dispatchRequest({
    source: 'ALGUEM_MAIS',
    action: 'GET_ACTIVE_CHAT_IDENTITY',
    requestId: 'req-forjado',
  })

  const responses = postedMessages.filter(
    (message) => message.data?.action === 'ACTIVE_CHAT_IDENTITY',
  )

  assert.equal(responses.length, 0)
})
