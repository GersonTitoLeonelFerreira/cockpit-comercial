import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const runtime = require('../src/manychat-audio-dispatch-runtime.js')

function fakeButton() {
  let clickHandler = null

  return {
    id: '',
    type: '',
    textContent: '',
    dataset: {},
    style: {},
    setAttribute() {},
    addEventListener(type, handler) {
      assert.equal(type, 'click')
      clickHandler = handler
    },
    clickTrusted() {
      assert.equal(typeof clickHandler, 'function')
      clickHandler({ isTrusted: true })
    },
    clickUntrusted() {
      assert.equal(typeof clickHandler, 'function')
      clickHandler({ isTrusted: false })
    },
  }
}

function fakeDocument(button) {
  let appended = null

  return {
    body: {
      appendChild(node) {
        appended = node
      },
    },
    getElementById() {
      return null
    },
    createElement(tag) {
      assert.equal(tag, 'button')
      return button
    },
    get appended() {
      return appended
    },
  }
}

test('reconhece somente a rota /workspace/chat/conversation', () => {
  const ready = runtime.readConversationRoute({
    pathname: '/fb3678277/chat/438324835',
  })

  assert.equal(ready.ready, true)
  assert.equal(ready.workspace_token, 'fb3678277')
  assert.equal(ready.conversation_token, '438324835')

  const invalid = runtime.readConversationRoute({
    pathname: '/fb3678277/settings',
  })

  assert.equal(invalid.ready, false)
  assert.equal(invalid.reason, 'conversation_route_not_recognized')
})

test('probe exige hash explícito e não reage a clique sintético', () => {
  const button = fakeButton()
  const document = fakeDocument(button)
  const window = {
    location: {
      hash: '',
      pathname: '/fb3678277/chat/438324835',
    },
  }

  assert.equal(
    runtime.installConversationIdentityProbe({ window, document }),
    null,
  )

  window.location.hash = runtime.CONVERSATION_PROBE_HASH

  const installed = runtime.installConversationIdentityProbe({
    window,
    document,
  })

  assert.equal(installed, button)
  assert.equal(document.appended, button)

  button.clickUntrusted()
  assert.equal(button.dataset.yolenConversationProbeResult, undefined)
})

test('valida A → B → A sem expor tokens brutos', () => {
  const button = fakeButton()
  const document = fakeDocument(button)
  const window = {
    location: {
      hash: runtime.CONVERSATION_PROBE_HASH,
      pathname: '/fb3678277/chat/438324835',
    },
  }

  runtime.installConversationIdentityProbe({ window, document })

  button.clickTrusted()
  let result = JSON.parse(button.dataset.yolenConversationProbeResult)
  assert.equal(result.stage, 'baseline_captured')
  assert.equal(button.dataset.yolenConversationProbePassed, 'false')

  window.location.pathname = '/fb3678277/chat/999999999'
  button.clickTrusted()
  result = JSON.parse(button.dataset.yolenConversationProbeResult)
  assert.equal(result.stage, 'distinct_conversation_seen')
  assert.equal(result.workspace_same, true)
  assert.equal(result.conversation_changed, true)
  assert.equal(button.dataset.yolenConversationProbePassed, 'false')

  window.location.pathname = '/fb3678277/chat/438324835'
  button.clickTrusted()
  result = JSON.parse(button.dataset.yolenConversationProbeResult)
  assert.equal(result.stage, 'returned_to_baseline')
  assert.equal(result.returned_to_baseline, true)
  assert.equal(button.dataset.yolenConversationProbePassed, 'true')
  assert.match(button.textContent, /PASS/)

  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes('fb3678277'), false)
  assert.equal(serialized.includes('438324835'), false)
  assert.equal(serialized.includes('999999999'), false)
  assert.equal(result.privacy.raw_path_exposed, false)
  assert.equal(result.privacy.raw_workspace_token_exposed, false)
  assert.equal(result.privacy.raw_conversation_token_exposed, false)
  assert.equal(result.privacy.persisted, false)
  assert.equal(result.privacy.network_sent, false)
})

test('mudança de workspace falha fechado', () => {
  const button = fakeButton()
  const document = fakeDocument(button)
  const window = {
    location: {
      hash: runtime.CONVERSATION_PROBE_HASH,
      pathname: '/fb3678277/chat/438324835',
    },
  }

  runtime.installConversationIdentityProbe({ window, document })
  button.clickTrusted()

  window.location.pathname = '/fb9999999/chat/777777777'
  button.clickTrusted()

  const result = JSON.parse(button.dataset.yolenConversationProbeResult)
  assert.equal(result.stage, 'workspace_changed')
  assert.equal(result.workspace_same, false)
  assert.equal(button.dataset.yolenConversationProbePassed, 'false')
})
