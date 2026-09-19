import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const runtimeApi = require('../src/manychat-seller-panel-runtime.js')

function createQueuedSender(responders) {
  const calls = []
  return {
    calls,
    async sendMessage(message) {
      calls.push(message)
      const next = responders[calls.length - 1]
      if (!next) {
        throw new Error(`[fake-send-message] fila vazia na chamada ${calls.length}`)
      }
      return typeof next === 'function' ? next(message) : next
    },
  }
}

function loadOk(data) {
  return { ok: true, payload: { ok: true, data } }
}

function createFakePanelMount() {
  const contents = []
  return {
    contents,
    setPanelContent(html) {
      contents.push(html)
    },
  }
}

function createFakeComposer(applyResult = { applied: true, reason: null }) {
  const calls = []
  return {
    calls,
    applyManyChatComposerSuggestion(options) {
      calls.push(options)
      return applyResult
    },
  }
}

function createFakeScheduler() {
  const pending = []
  return {
    pending,
    schedule(fn) {
      pending.push(fn)
      return pending.length - 1
    },
    cancel() {},
    async flushOne() {
      const fn = pending.shift()
      if (fn) await fn()
    },
  }
}

test('refreshViewModels chama os 5 view models em paralelo com {cycle_id, conversation_key} e renderiza', async () => {
  const fake = createQueuedSender([
    loadOk({ relationship: 'ok' }),
    loadOk({ primary: null, secondary: [] }),
    loadOk({ available: false }),
    loadOk({ available: false }),
    loadOk({ suggested_message: 'Posso te explicar as opções.' }),
  ])

  const panelMount = createFakePanelMount()

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    panelMountApi: panelMount,
  })

  await runtime.refreshViewModels({ cycleId: 'cycle-1', conversationKey: 'conv-1' })

  assert.equal(fake.calls.length, 5)
  const actions = fake.calls.map((call) => call.action)
  assert.deepEqual(
    [...actions].sort(),
    [
      'LOAD_ANALYSIS_VIEW_MODEL',
      'LOAD_CLIENT_CONTEXT',
      'LOAD_CUSTOMER_VIEW_MODEL',
      'LOAD_DECISION_STATE',
      'LOAD_METHOD_GUIDANCE',
    ].sort(),
  )

  for (const call of fake.calls) {
    assert.equal(call.payload.cycle_id, 'cycle-1')
    assert.equal(call.payload.conversation_key, 'conv-1')
  }

  assert.equal(panelMount.contents.length, 1)
  assert.ok(panelMount.contents[0].includes('Posso te explicar as opções.'))

  const state = runtime.getConversationPanelState('conv-1')
  assert.equal(state.clientContext.status, 'ready')
  assert.equal(state.methodGuidance.data.suggested_message, 'Posso te explicar as opções.')
})

test('refreshViewModels sem cycle_id/conversation_key não chama nada', async () => {
  const fake = createQueuedSender([])
  const runtime = runtimeApi.createManyChatSellerPanelRuntime({ sendMessage: fake.sendMessage })

  await runtime.refreshViewModels({ cycleId: null, conversationKey: 'conv-1' })
  await runtime.refreshViewModels({ cycleId: 'cycle-1', conversationKey: null })

  assert.equal(fake.calls.length, 0)
})

test('erro em um view model não impede os outros nem lança exceção', async () => {
  const fake = createQueuedSender([
    { ok: false, payload: { ok: false, error: 'falhou' } },
    loadOk({ primary: null, secondary: [] }),
    loadOk({ available: false }),
    loadOk({ available: false }),
    loadOk({ suggested_message: null }),
  ])

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({ sendMessage: fake.sendMessage })
  await runtime.refreshViewModels({ cycleId: 'cycle-1', conversationKey: 'conv-1' })

  const state = runtime.getConversationPanelState('conv-1')
  assert.equal(state.clientContext.status, 'error')
  assert.equal(state.decisionState.ready, true)
})

test('requestAnalysis dispara ANALYZE_CONVERSATION e nunca duas ao mesmo tempo para a mesma conversa', async () => {
  const fake = createQueuedSender([
    { ok: true, payload: { data: { analysis_job_id: 'job-1' } } },
  ])
  const scheduler = createFakeScheduler()

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })

  const first = runtime.requestAnalysis({ cycleId: 'cycle-1', conversationKey: 'conv-1' })
  const second = runtime.requestAnalysis({ cycleId: 'cycle-1', conversationKey: 'conv-1' })
  await Promise.all([first, second])

  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].action, 'ANALYZE_CONVERSATION')
  assert.equal(fake.calls[0].payload.cycle_id, 'cycle-1')
})

test('polling de status refaz os view models quando a análise termina com sucesso', async () => {
  const fake = createQueuedSender([
    { ok: true, payload: { data: { analysis_job_id: 'job-1' } } },
    { ok: true, payload: { data: { status: 'running' } } },
    { ok: true, payload: { data: { status: 'succeeded' } } },
    loadOk({ relationship: 'ok' }),
    loadOk({ primary: null, secondary: [] }),
    loadOk({ available: false }),
    loadOk({ available: false }),
    loadOk({ suggested_message: null }),
  ])
  const scheduler = createFakeScheduler()

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })

  await runtime.requestAnalysis({ cycleId: 'cycle-1', conversationKey: 'conv-1' })
  await scheduler.flushOne() // primeiro poll: running
  await scheduler.flushOne() // segundo poll: succeeded -> refresh

  assert.equal(fake.calls.length, 8)
  assert.equal(fake.calls[1].action, 'GET_ANALYSIS_JOB_STATUS')
  assert.equal(fake.calls[2].action, 'GET_ANALYSIS_JOB_STATUS')
  assert.equal(fake.calls[3].action, 'LOAD_CLIENT_CONTEXT')

  const state = runtime.getConversationPanelState('conv-1')
  assert.equal(state.analyzing, false)
})

test('handleCaptureResult: primeira captura carrega os view models; captura pulada não dispara análise', async () => {
  const fake = createQueuedSender([
    loadOk({ relationship: 'ok' }),
    loadOk({ primary: null, secondary: [] }),
    loadOk({ available: false }),
    loadOk({ available: false }),
    loadOk({ suggested_message: null }),
  ])

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    getCycleId: () => 'cycle-1',
  })

  await runtime.handleCaptureResult({ ok: true, skipped: true, conversation_key: 'conv-1' })

  assert.equal(fake.calls.length, 5, 'primeira vez carrega os view models mesmo com skipped=true')
  assert.equal(
    fake.calls.some((call) => call.action === 'ANALYZE_CONVERSATION'),
    false,
    'captura pulada (sem mudança) nunca dispara uma análise nova',
  )
})

test('handleCaptureResult: captura com conteúdo novo dispara análise, mas não recarrega os view models de novo', async () => {
  const fake = createQueuedSender([
    loadOk({ relationship: 'ok' }),
    loadOk({ primary: null, secondary: [] }),
    loadOk({ available: false }),
    loadOk({ available: false }),
    loadOk({ suggested_message: null }),
    { ok: true, payload: { data: { analysis_job_id: 'job-1' } } },
  ])
  const scheduler = createFakeScheduler()

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    getCycleId: () => 'cycle-1',
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })

  await runtime.handleCaptureResult({ ok: true, skipped: true, conversation_key: 'conv-1' })
  await runtime.handleCaptureResult({ ok: true, skipped: false, conversation_key: 'conv-1' })

  assert.equal(fake.calls.length, 6)
  assert.equal(fake.calls[5].action, 'ANALYZE_CONVERSATION')
})

test('handleCaptureResult sem cycle_id resolvido não faz nada', async () => {
  const fake = createQueuedSender([])
  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    getCycleId: () => null,
  })

  await runtime.handleCaptureResult({ ok: true, skipped: false, conversation_key: 'conv-1' })
  assert.equal(fake.calls.length, 0)
})

test('applySuggestedMessage: sem sugestão carregada, recusa sem chamar o composer', async () => {
  const composer = createFakeComposer()
  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: async () => ({ ok: true, payload: {} }),
    composerApi: composer,
  })

  const result = runtime.applySuggestedMessage('conv-sem-dados')

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'no_suggestion_available')
  assert.equal(composer.calls.length, 0)
})

test('applySuggestedMessage: com sugestão carregada, aplica o texto real no composer (ação explícita)', async () => {
  const fake = createQueuedSender([
    loadOk({ relationship: 'ok' }),
    loadOk({ primary: null, secondary: [] }),
    loadOk({ available: false }),
    loadOk({ available: false }),
    loadOk({ suggested_message: 'Posso te ajudar com isso agora.' }),
  ])
  const composer = createFakeComposer({ applied: true, reason: null })

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: fake.sendMessage,
    composerApi: composer,
  })

  await runtime.refreshViewModels({ cycleId: 'cycle-1', conversationKey: 'conv-1' })
  const result = runtime.applySuggestedMessage('conv-1')

  assert.equal(result.applied, true)
  assert.equal(composer.calls.length, 1)
  assert.equal(composer.calls[0].text, 'Posso te ajudar com isso agora.')
})

test('applySuggestedMessage sem composerApi disponível falha fechado', () => {
  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage: async () => ({ ok: true, payload: {} }),
  })

  const result = runtime.applySuggestedMessage('conv-1')
  assert.equal(result.applied, false)
  assert.equal(result.reason, 'composer_unavailable')
})
