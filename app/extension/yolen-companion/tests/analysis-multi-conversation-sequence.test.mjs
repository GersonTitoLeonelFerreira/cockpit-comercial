// R9 — análise em sequência por várias conversas, com o controller REAL de
// análise (companion-analysis-controller.js), relógio virtual e um servidor
// falso que simula o ciclo de vida de cada job.
//
// Caso real: Lorena concluía; Júlia ficava em "A análise está na fila da
// Yolen…" / "Analisando…". O produto precisa funcionar para qualquer
// conversa: cada uma recebe o próprio job e o próprio poll, a troca de
// conversa nunca herda loading/resultado de outra, e um job órfão é
// recuperado (não reaproveitado parado).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = readFileSync(
  new URL('../src/companion-analysis-controller.js', import.meta.url),
  'utf8',
)

const CONVERSATIONS = {
  lorena: { cycleId: 'cycle-lorena', conversationKey: 'phone:554484352775', text: 'Podemos fazer a aula experimental hoje?' },
  julia: { cycleId: 'cycle-julia', conversationKey: 'phone:554498923820', text: 'Oi, queria saber os horários da academia à noite.' },
  contatoC: { cycleId: 'cycle-c', conversationKey: 'phone:554498928199', text: 'Vocês têm plano para casal? Quanto fica?' },
}

// Script de status por job: cada consulta consome o próximo; o último fica.
function createServer(scripts) {
  const jobs = new Map()
  const calls = { analyze: [], status: [], recover: [] }

  return {
    calls,
    jobs,
    api: {
      async analyzeConversation(payload) {
        calls.analyze.push(payload.conversation_key)
        const script = scripts[payload.conversation_key]
        const jobId = `job-${payload.conversation_key}`

        if (!jobs.has(jobId)) {
          jobs.set(jobId, { script: [...script.statuses], recovered: false })
        }

        return {
          ok: true,
          payload: {
            ok: true,
            data: {
              deep_analysis: {
                analysis_job_id: jobId,
                status: script.initial ?? 'queued',
                message_watermark: `wm-${payload.conversation_key}`,
              },
            },
          },
        }
      },

      async getAnalysisJobStatus(payload) {
        calls.status.push(payload.conversation_key)
        const job = jobs.get(payload.analysis_job_id)
        const step = job.script.length > 1 ? job.script.shift() : job.script[0]
        const status = typeof step === 'string' ? { status: step } : step

        return {
          ok: true,
          payload: {
            ok: true,
            data: {
              analysis_job_id: payload.analysis_job_id,
              conversation_key: payload.conversation_key,
              message_watermark: `wm-${payload.conversation_key}`,
              attempt_count: status.attempt_count ?? 1,
              requested_at: '2026-09-30T12:00:00.000Z',
              started_at: status.status === 'queued' ? null : '2026-09-30T12:00:03.000Z',
              updated_at: '2026-09-30T12:00:00.000Z',
              failure_code: status.failure_code ?? null,
              stale: status.stale === true,
              result: status.status === 'succeeded' ? { summary: `ok ${payload.conversation_key}` } : null,
              ...status,
            },
          },
        }
      },

      async recoverAnalysisJob(payload) {
        calls.recover.push(payload.analysis_job_id)
        const job = jobs.get(payload.analysis_job_id)
        job.recovered = true
        // Depois da recuperação a entrega nova roda e conclui.
        job.script = ['running', 'succeeded']
        return { ok: true, payload: { ok: true, data: { analysis_job_id: payload.analysis_job_id, status: 'queued' } } }
      },

      async loadDecisionState() { return { ok: false, payload: { ok: false } } },
      async loadAnalysisViewModel() { return { ok: false, payload: { ok: false } } },
    },
  }
}

function createHarness(server) {
  let now = Date.parse('2026-09-30T12:00:00.000Z')
  let nextTimerId = 1
  const timers = new Map()

  class VirtualDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]))
    }

    static now() {
      return now
    }
  }

  const current = { conversation: null }

  const window = {
    setTimeout(fn, ms) {
      const id = nextTimerId++
      timers.set(id, { at: now + (ms || 0), fn })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    YolenCompanionApi: server.api,
  }

  const sandbox = {
    window,
    Date: VirtualDate,
    Promise,
    Map,
    Set,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Error,
    console,
    YolenCompanionConversationRegistrationTools: {
      shouldApplyConversationRegistrationResult: ({ requestCycleId, requestConversationKey, currentCycleId, currentConversationKey }) =>
        requestCycleId === currentCycleId && requestConversationKey === currentConversationKey,
    },
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'companion-analysis-controller.js' })

  const conversationOf = () => CONVERSATIONS[current.conversation]

  const ctx = {
    state: {
      connected: true,
      isSelfConversation: false,
      companyId: 'company-a',
      leadResolutionOutcome: { workspace_ready: true },
    },
    messageLedgerMutationRevision: 0,
    messageLedgerRequiresRebase: false,
    analysisViewModelRequestSequence: 0,
    buildConversationFingerprint: (text) => `fp:${text}`,
    buildConversationTextFromMessages: (messages) => messages.map((message) => message.text).join('\n'),
    getCanonicalResolutionCycleId: () => conversationOf()?.cycleId ?? null,
    getCaptureConversationKey: () => conversationOf()?.conversationKey ?? null,
    getComposerText: () => '',
    getCurrentConversationFingerprint: () => (conversationOf() ? `fp:${conversationOf().text}` : null),
    getPendingAudioCountForCurrentConversation: () => 0,
    getSelectedChatActivitySnapshot: () => null,
    getStructuredMessagesForAnalysis: () => (conversationOf() ? [{ direction: 'incoming', text: conversationOf().text }] : []),
    registerSuggestionShownTelemetry: () => {},
    renderPanel: () => {},
    updatePreSendAssessmentFromDraft: () => {},
    rememberLastKnownClientCommercialReadingIfPresent: () => ({}),
    loadCustomerViewModelForCurrentCycle: async () => {},
  }

  const controller = sandbox.YolenCompanionAnalysisController.create(ctx)

  async function flush() {
    for (let index = 0; index < 20; index += 1) {
      await Promise.resolve()
    }
  }

  async function advance(ms) {
    const end = now + ms

    for (;;) {
      await flush()
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0]

      if (!due) {
        break
      }

      const [id, timer] = due
      timers.delete(id)
      now = Math.max(now, timer.at)
      await timer.fn()
    }

    now = end
    await flush()
  }

  // Mesma troca que o Core faz em hardResetConversationWorkspace().
  function openConversation(name) {
    controller.clearAutomaticAnalysisTimer()
    controller.clearDeepAnalysisPollTimer()
    controller.clearAnalysisWatchdogTimer()
    controller.activeAnalysisAttempt = null
    controller.forgetAnalysisAttemptContent()
    current.conversation = name
    ctx.state = {
      ...ctx.state,
      conversationAnalysisLoading: false,
      conversationAnalysis: null,
      conversationAnalysisError: null,
      deepAnalysisStatus: null,
      deepAnalysisResult: null,
      deepAnalysisNotice: null,
      deepAnalysisDebug: null,
    }
  }

  return { ctx, controller, advance, openConversation, timers }
}

function assertTerminalFor(ctx, conversationKey, status) {
  assert.equal(ctx.state.conversationAnalysisLoading, false, 'sem spinner depois do estado terminal')
  assert.equal(ctx.state.deepAnalysisStatus, status)
  assert.equal(ctx.state.deepAnalysisDebug?.conversation_key, conversationKey, 'o estado exibido é da conversa aberta')
  if (status === 'succeeded') {
    assert.equal(ctx.state.deepAnalysisResult?.summary, `ok ${conversationKey}`)
  }
}

test('Lorena → Júlia (job órfão recuperado) → contato C → volta Lorena → volta Júlia: cada uma termina com o próprio job, sem vazamento', async () => {
  const server = createServer({
    [CONVERSATIONS.lorena.conversationKey]: { statuses: ['running', 'succeeded'] },
    // Júlia: o job fica parado em queued e o servidor o marca como órfão.
    [CONVERSATIONS.julia.conversationKey]: { statuses: ['queued', { status: 'queued', stale: true, attempt_count: 0 }] },
    [CONVERSATIONS.contatoC.conversationKey]: { statuses: ['queued', 'running', 'running', 'succeeded'] },
  })
  const { ctx, controller, advance, openConversation } = createHarness(server)

  // 1. Lorena
  openConversation('lorena')
  await controller.analyzeCurrentConversation()
  await advance(20_000)
  assertTerminalFor(ctx, CONVERSATIONS.lorena.conversationKey, 'succeeded')

  // 2. Júlia — sem leitura anterior, job órfão: recuperação real, uma vez.
  openConversation('julia')
  assert.equal(ctx.state.deepAnalysisResult, null, 'Júlia não herda o resultado de Lorena')
  await controller.analyzeCurrentConversation()
  await advance(30_000)
  assertTerminalFor(ctx, CONVERSATIONS.julia.conversationKey, 'succeeded')
  assert.deepEqual(server.calls.recover, [`job-${CONVERSATIONS.julia.conversationKey}`])

  // 3. Contato C — começa, e a troca acontece com C ainda em voo.
  openConversation('contatoC')
  await controller.analyzeCurrentConversation()
  await advance(1_600)
  assert.equal(ctx.state.conversationAnalysisLoading, true)

  // 4. Volta para Lorena com C em voo: o poll de C não pode tocar Lorena.
  openConversation('lorena')
  const statusCallsBefore = server.calls.status.length
  await advance(60_000)
  assert.equal(
    server.calls.status.slice(statusCallsBefore).filter((key) => key === CONVERSATIONS.contatoC.conversationKey).length,
    0,
    'poll da conversa anterior foi cancelado na troca',
  )
  assert.equal(ctx.state.conversationAnalysisLoading, false, 'Lorena não herda o loading de C')
  await controller.analyzeCurrentConversation()
  await advance(20_000)
  assertTerminalFor(ctx, CONVERSATIONS.lorena.conversationKey, 'succeeded')

  // 5. Volta para Júlia: carrega de novo o próprio job (já concluído).
  openConversation('julia')
  await controller.analyzeCurrentConversation()
  await advance(20_000)
  assertTerminalFor(ctx, CONVERSATIONS.julia.conversationKey, 'succeeded')

  // 6. Contato C de novo: termina com o próprio job.
  openConversation('contatoC')
  await controller.analyzeCurrentConversation()
  await advance(30_000)
  assertTerminalFor(ctx, CONVERSATIONS.contatoC.conversationKey, 'succeeded')

  // Uma única recuperação em toda a sequência (só o órfão).
  assert.equal(server.calls.recover.length, 1)
})

test('job que continua na fila além do teto: spinner termina com aviso neutro (nunca eterno) e o diagnóstico mostra que o worker não começou', async () => {
  const server = createServer({
    [CONVERSATIONS.julia.conversationKey]: { statuses: ['queued'] },
  })
  const { ctx, controller, advance, openConversation } = createHarness(server)

  openConversation('julia')
  await controller.analyzeCurrentConversation()
  await advance(245_000)

  assert.equal(ctx.state.conversationAnalysisLoading, false)
  assert.equal(ctx.state.deepAnalysisStatus, 'queued')
  assert.match(ctx.state.deepAnalysisNotice, /fila/)
  assert.equal(ctx.state.deepAnalysisDebug.status, 'queued')
  assert.equal(ctx.state.deepAnalysisDebug.started_at, null, 'worker_started=false: o job nem saiu da fila')
  assert.ok(ctx.state.deepAnalysisDebug.poll_attempt > 5)
})

test('falha terminal recuperável: erro seller-facing com diagnóstico do código, sem loading preso', async () => {
  const server = createServer({
    [CONVERSATIONS.contatoC.conversationKey]: { statuses: ['running', { status: 'failed', failure_code: 'INVALID_MODEL_OUTPUT', attempt_count: 5 }] },
  })
  const { ctx, controller, advance, openConversation } = createHarness(server)

  openConversation('contatoC')
  await controller.analyzeCurrentConversation()
  await advance(20_000)

  assert.equal(ctx.state.conversationAnalysisLoading, false)
  assert.equal(ctx.state.deepAnalysisStatus, 'failed')
  assert.match(ctx.state.conversationAnalysisError, /Tente novamente/)
  assert.equal(ctx.state.deepAnalysisDebug.failure_code, 'INVALID_MODEL_OUTPUT')
})

// Diagnóstico técnico da fila: só no pacote HML, nunca em PROD.
const CORE_SOURCE = readFileSync(
  new URL('../src/companion-core.js', import.meta.url),
  'utf8',
)

function loadDebugRenderer(channel, deepAnalysisDebug) {
  const start = CORE_SOURCE.indexOf('  function getAnalysisDebugHtml() {')
  const end = CORE_SOURCE.indexOf('\n  }\n', start) + 4
  assert.ok(start > 0 && end > start, 'getAnalysisDebugHtml existe no Core')

  const sandbox = {
    globalThis: { YolenCompanionEnvironment: channel ? { channel } : undefined },
    state: { deepAnalysisDebug },
    escapeHtml: (value) => String(value).replace(/[&<>"']/g, ''),
    Date,
    Math,
    Number,
    String,
  }
  vm.createContext(sandbox)
  vm.runInContext(`${CORE_SOURCE.slice(start, end)}\nthis.render = getAnalysisDebugHtml`, sandbox)
  return sandbox.render
}

test('HML mostra "Analysis debug" (job, status, fila, worker, tentativas, falha); PROD e DEV nunca', () => {
  const debug = {
    analysis_job_id: 'd0701ebc7db0473e503e9a1859072763942148a1',
    conversation_key: 'phone:554498923820',
    message_watermark: '1543:bb862f9e',
    status: 'queued',
    attempt_count: 0,
    requested_at: new Date(Date.now() - 38_000).toISOString(),
    updated_at: new Date(Date.now() - 38_000).toISOString(),
    started_at: null,
    failure_code: null,
    stale: false,
    poll_attempt: 6,
    recovery_requested: false,
  }

  const html = loadDebugRenderer('homolog', debug)()
  assert.match(html, /Analysis debug \(HML\)/)
  assert.match(html, /status: queued/)
  assert.match(html, /queued_for: 3[89]s/)
  assert.match(html, /worker_started: false/)
  assert.match(html, /poll_attempt: 6/)
  assert.match(html, /conversation: phone:554498923820/)

  for (const channel of ['prod', 'dev', null]) {
    assert.equal(loadDebugRenderer(channel, debug)(), '', `canal ${channel} nunca mostra o diagnóstico`)
  }
})
