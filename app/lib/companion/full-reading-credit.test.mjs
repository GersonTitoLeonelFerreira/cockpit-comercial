// Rodada 7 (economia de créditos): uma linha de log por chamada ao Claude
// (rota, tokens de entrada e saída, sem conteúdo), e a API sem crédito vira
// "Leitura indisponível: créditos da IA esgotados" sem nova tentativa em
// loop. Claude simulado; banco em memória; fixtures sintéticas.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLAUDE_USAGE_LOG_TAG,
  ClaudeProviderError,
  PROVIDER_CREDIT_EXHAUSTED_CODE,
  callClaudeReading,
  isCreditExhaustedMessage,
} from './full-reading/anthropic-client.ts'

import {
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

import {
  FULL_READING_MESSAGE_ROUTE,
  generateFullReadingMessage,
} from '../server/full-reading-message.ts'

import {
  FULL_READING_CREDIT_COOLDOWN_MS,
  buildAgoraFullReadingView,
  normalizeRunFailureCode,
  planFullReadingPanel,
  resolveFullReadingPanel,
} from '../server/full-reading-panel.ts'

import {
  FULL_READING_CREDIT_EXHAUSTED_NOTICE,
  buildFullReadingAnalysisView,
} from '../server/full-reading-panel-view.ts'

import {
  FULL_READING_PROMPT_VERSION,
} from './full-reading/prompt.ts'

const NOW = '2026-10-02T12:00:00.000Z'
const COMPANY = '80000000-0000-4000-8000-000000000001'
const CYCLE = '80000000-0000-4000-8000-0000000000c1'
const CONVERSATION = 'phone:5511900000000'
const SECRET_TEXT = 'Texto sigiloso da conversa que nunca pode ir para o log'

const CREDIT_BODY = {
  type: 'error',
  error: {
    type: 'invalid_request_error',
    message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
  },
}

function minutesBefore(minutes, base = NOW) {
  return new Date(Date.parse(base) - minutes * 60_000).toISOString()
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function claudeOk(text, usage = { input_tokens: 1234, output_tokens: 567 }) {
  return jsonResponse({
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage,
  })
}

function capture() {
  const lines = []
  return { lines, logger: (line) => lines.push(line) }
}

function parseLog(line) {
  assert.ok(line.startsWith(`${CLAUDE_USAGE_LOG_TAG} `), line)
  return JSON.parse(line.slice(CLAUDE_USAGE_LOG_TAG.length + 1))
}

function baseRequest(overrides = {}) {
  return {
    apiKey: 'sk-ant-teste',
    model: 'claude-sonnet-5-5',
    system: `Sistema ${SECRET_TEXT}`,
    userText: `Usuário ${SECRET_TEXT}`,
    maxTokens: 1000,
    effort: null,
    outputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    timeoutMs: 30_000,
    sleep: async () => {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Log por chamada
// ---------------------------------------------------------------------------

test('log: cada chamada ao Claude registra rota, finalidade, tokens de entrada e de saída — e nada do conteúdo', async () => {
  const { lines, logger } = capture()

  await callClaudeReading(baseRequest({
    logger,
    usageLog: { route: '/api/companion/decision-state', purpose: 'full_reading', run_id: 'run-1' },
    fetchImpl: async () => claudeOk('{"ok":true}'),
  }))

  assert.equal(lines.length, 1)

  const entry = parseLog(lines[0])

  assert.deepEqual(
    { route: entry.route, purpose: entry.purpose, run_id: entry.run_id, outcome: entry.outcome, http_status: entry.http_status, input_tokens: entry.input_tokens, output_tokens: entry.output_tokens },
    { route: '/api/companion/decision-state', purpose: 'full_reading', run_id: 'run-1', outcome: 'ok', http_status: 200, input_tokens: 1234, output_tokens: 567 },
  )
  assert.equal(typeof entry.duration_ms, 'number')
  assert.doesNotMatch(lines[0], /sigiloso|Sistema|Usuário|\{"ok":true\}/)
  assert.doesNotMatch(lines[0], /sk-ant/)
})

test('log: sem contexto de log, nenhuma linha (chamadas internas não mudam)', async () => {
  const { lines, logger } = capture()

  await callClaudeReading(baseRequest({ logger, fetchImpl: async () => claudeOk('{"ok":true}') }))

  assert.deepEqual(lines, [])
})

// ---------------------------------------------------------------------------
// Sem crédito
// ---------------------------------------------------------------------------

test('sem crédito: falha definitiva PROVIDER_CREDIT_EXHAUSTED, uma chamada só (sem retry nem troca de formato), log sem o texto', async () => {
  const { lines, logger } = capture()
  let fetchCalls = 0

  await assert.rejects(
    callClaudeReading(baseRequest({
      logger,
      usageLog: { route: '/api/companion/analysis-view-model', purpose: 'full_reading', run_id: 'run-2' },
      fetchImpl: async () => {
        fetchCalls += 1
        return jsonResponse(CREDIT_BODY, 400)
      },
    })),
    (error) =>
      error instanceof ClaudeProviderError &&
      error.code === PROVIDER_CREDIT_EXHAUSTED_CODE &&
      error.retryable === false,
  )

  assert.equal(fetchCalls, 1)
  assert.equal(lines.length, 1)

  const entry = parseLog(lines[0])

  assert.equal(entry.outcome, 'error')
  assert.equal(entry.http_status, 400)
  assert.equal(entry.code, PROVIDER_CREDIT_EXHAUSTED_CODE)
  assert.equal(entry.input_tokens, null)
  assert.doesNotMatch(lines[0], /credit balance|sigiloso/)

  assert.equal(isCreditExhaustedMessage('Your credit balance is too low to access the Anthropic API.'), true)
  assert.equal(isCreditExhaustedMessage('max_tokens: field required'), false)
})

test('runner: sem crédito a rodada fica PROVIDER_CREDIT_EXHAUSTED e o log leva a rota que pediu', async () => {
  const updates = []
  const { lines, logger } = capture()

  const admin = {
    from(table) {
      const chain = {
        update(values) { updates.push({ table, values }); return chain },
        eq() { return chain },
        then(resolve) { resolve({ error: null }) },
      }

      return chain
    },
  }

  const result =
    await executeFullReadingRun({
      admin,
      runId: 'run-credit',
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
      referenceTime: NOW,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'sk-ant-teste',
      triggerRoute: '/api/companion/decision-state',
      logger,
      loadMessages: async () => [{
        id: '1',
        direction: 'incoming',
        author_kind: 'customer',
        occurred_at: minutesBefore(30),
        content_type: 'text',
        text_content: SECRET_TEXT,
        audio_transcription: null,
        is_deleted: false,
        deletion_reason: null,
      }],
      loadKanban: async () => null,
      loadConfig: async () => ({ bundle: null, products: [] }),
      fetchImpl: async () => jsonResponse(CREDIT_BODY, 400),
    })

  assert.deepEqual(result, { status: 'failed', failure_code: PROVIDER_CREDIT_EXHAUSTED_CODE })
  assert.equal(updates.at(-1).values.failure_code, PROVIDER_CREDIT_EXHAUSTED_CODE)
  assert.doesNotMatch(updates.at(-1).values.failure_detail, /sigiloso/)

  const entry = parseLog(lines[0])

  assert.equal(entry.route, '/api/companion/decision-state')
  assert.equal(entry.run_id, 'run-credit')
  assert.doesNotMatch(lines.join('\n'), /sigiloso/)
})

test('Gerar mensagem: log com a rota da mensagem e tokens; sem crédito, o erro é PROVIDER_CREDIT_EXHAUSTED', async () => {
  const args = (overrides) => ({
    admin: new Proxy({}, { get() { throw new Error('não toca no banco') } }),
    scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
    sellerIntent: 'Quero confirmar o horário.',
    apiKey: 'sk-ant-teste',
    now: NOW,
    env: {},
    loadReading: async () => ({ run_id: 'run-msg', analysis_markdown: '### Agora\n- Situação: x', decision: { acao_agora: 'responder' } }),
    loadMessages: async () => [],
    loadKanban: async () => null,
    loadConfig: async () => ({ bundle: null, products: [] }),
    ...overrides,
  })

  const ok = capture()

  await generateFullReadingMessage(args({
    logger: ok.logger,
    fetchImpl: async () => claudeOk(JSON.stringify({ mensagem: 'Oi! Tudo certo para amanhã?' }), { input_tokens: 900, output_tokens: 40 }),
  }))

  const entry = parseLog(ok.lines[0])

  assert.equal(entry.route, FULL_READING_MESSAGE_ROUTE)
  assert.equal(entry.route, '/api/companion/full-reading/message')
  assert.equal(entry.purpose, 'full_reading_message')
  assert.equal(entry.input_tokens, 900)
  assert.equal(entry.output_tokens, 40)
  assert.doesNotMatch(ok.lines[0], /Tudo certo|confirmar o horário/)

  await assert.rejects(
    generateFullReadingMessage(args({ logger: () => {}, fetchImpl: async () => jsonResponse(CREDIT_BODY, 400) })),
    (error) => error instanceof ClaudeProviderError && error.code === PROVIDER_CREDIT_EXHAUSTED_CODE,
  )
})

// ---------------------------------------------------------------------------
// Painel: aviso e nada de tentar de novo em loop
// ---------------------------------------------------------------------------

function run(overrides = {}) {
  return {
    run_id: 'run-a',
    cycle_id: CYCLE,
    status: 'failed',
    prompt_version: FULL_READING_PROMPT_VERSION,
    reference_time: minutesBefore(10),
    created_at: minutesBefore(10),
    started_at: minutesBefore(10),
    completed_at: minutesBefore(10),
    failure_code: PROVIDER_CREDIT_EXHAUSTED_CODE,
    failure_detail: null,
    analysis_markdown: null,
    decision: null,
    ...overrides,
  }
}

const KANBAN = { status: 'novo', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null }

test('painel: falha sem crédito recente bloqueia rodada nova até a espera passar; só "Atualizar" tenta', () => {
  const base = { runs: [], cycleId: CYCLE, kanban: KANBAN, latestObservedAt: minutesBefore(1), now: NOW }

  // Outra conversa ficou sem crédito há 5 min: esta não chama o Claude.
  const blocked = planFullReadingPanel({ ...base, force: false, creditExhaustedAt: minutesBefore(5) })

  assert.equal(blocked.action, 'skip')
  assert.equal(blocked.skip_reason, PROVIDER_CREDIT_EXHAUSTED_CODE)

  // "Atualizar": uma tentativa.
  assert.equal(planFullReadingPanel({ ...base, force: true, creditExhaustedAt: minutesBefore(5) }).action, 'start')

  // Depois da espera: tenta uma vez.
  assert.equal(
    planFullReadingPanel({ ...base, force: false, creditExhaustedAt: minutesBefore(FULL_READING_CREDIT_COOLDOWN_MS / 60_000 + 1) }).action,
    'start',
  )

  // Sem falha de crédito: como antes.
  assert.equal(planFullReadingPanel({ ...base, force: false }).action, 'start')

  // A própria conversa falhou sem crédito e nada mudou: mostra a falha.
  const same = planFullReadingPanel({ ...base, runs: [run()], latestObservedAt: minutesBefore(20), force: false })

  assert.equal(same.action, 'show_failure')
  assert.equal(same.failed_run.failure_code, PROVIDER_CREDIT_EXHAUSTED_CODE)
})

test('rodadas antigas (PROVIDER_REQUEST_REJECTED com o texto da Anthropic) contam como sem crédito', () => {
  assert.equal(
    normalizeRunFailureCode('PROVIDER_REQUEST_REJECTED', `API respondeu 400: ${CREDIT_BODY.error.message}`),
    PROVIDER_CREDIT_EXHAUSTED_CODE,
  )
  assert.equal(normalizeRunFailureCode('PROVIDER_REQUEST_REJECTED', 'API respondeu 400: outro erro'), 'PROVIDER_REQUEST_REJECTED')
  assert.equal(normalizeRunFailureCode('PROVIDER_UNAVAILABLE', null), 'PROVIDER_UNAVAILABLE')
})

function memoryAdmin(tables) {
  const writes = []

  function from(table) {
    const rows = tables[table] ?? []
    const filters = []
    let mode = 'select'
    let payload = null
    let single = false
    let orderBy = null
    let limitCount = null

    const execute = () => {
      if (mode !== 'select') {
        writes.push({ table, mode, payload })
        return { error: null }
      }

      let data = rows.filter((row) => filters.every((filter) => filter(row)))

      if (orderBy) {
        data = [...data].sort((a, b) => String(b[orderBy]).localeCompare(String(a[orderBy])))
      }

      if (limitCount !== null) {
        data = data.slice(0, limitCount)
      }

      return single ? { data: data[0] ?? null, error: null } : { data, error: null }
    }

    const builder = {
      select() { return builder },
      insert(values) { mode = 'insert'; payload = values; return builder },
      update(values) { mode = 'update'; payload = values; return builder },
      eq(column, value) { filters.push((row) => row[column] === value); return builder },
      in(column, values) { filters.push((row) => values.includes(row[column])); return builder },
      gte(column, value) { filters.push((row) => String(row[column]) >= String(value)); return builder },
      order(column) { orderBy = column; return builder },
      limit(count) { limitCount = count; return builder },
      maybeSingle() { single = true; return builder },
      then(resolve, reject) { Promise.resolve().then(() => resolve(execute()), reject) },
    }

    return builder
  }

  return { admin: { from }, writes }
}

test('painel ponta a ponta: crédito esgotado em outra conversa → aviso "créditos da IA esgotados", nenhuma rodada agendada nem gravada', async () => {
  const memory = memoryAdmin({
    sales_cycles: [{ id: CYCLE, company_id: COMPANY, status: 'novo', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, lost_at: null, canceled_at: null, closed_at: null }],
    conversation_messages: [{ id: 1, company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', occurred_at: minutesBefore(2), observed_at: minutesBefore(1) }],
    companion_full_reading_runs: [
      run({ run_id: 'run-other', company_id: '80000000-0000-4000-8000-000000000009', cycle_id: 'outro', conversation_key: 'phone:outro', failure_code: 'PROVIDER_REQUEST_REJECTED', failure_detail: `API respondeu 400: ${CREDIT_BODY.error.message}`, created_at: minutesBefore(5) }),
    ],
  })

  const scheduled = []

  const snapshot =
    await resolveFullReadingPanel({
      admin: memory.admin,
      scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
      force: false,
      now: NOW,
      apiKey: 'sk-ant-teste',
      schedule: (task) => scheduled.push(task),
      createRunId: () => 'new-run',
      env: { VERCEL_ENV: 'preview' },
    })

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.failure_code, PROVIDER_CREDIT_EXHAUSTED_CODE)
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])

  const agora = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(agora.notice, 'Leitura indisponível: créditos da IA esgotados')
  assert.equal(FULL_READING_CREDIT_EXHAUSTED_NOTICE, 'Leitura indisponível: créditos da IA esgotados')
  assert.equal(
    buildFullReadingAnalysisView({ state: 'failed', reading: null, failureCode: PROVIDER_CREDIT_EXHAUSTED_CODE }).notice,
    'Leitura indisponível: créditos da IA esgotados',
  )

  // Polling seguido: continua sem chamar o Claude.
  for (let poll = 0; poll < 3; poll += 1) {
    const again =
      await resolveFullReadingPanel({
        admin: memory.admin,
        scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
        force: false,
        now: NOW,
        apiKey: 'sk-ant-teste',
        schedule: (task) => scheduled.push(task),
        createRunId: () => 'new-run',
        env: { VERCEL_ENV: 'preview' },
      })

    assert.equal(again.failure_code, PROVIDER_CREDIT_EXHAUSTED_CODE)
  }

  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])
})

test('aviso genérico de falha não promete mais "a análise anterior" (o caminho antigo não volta)', () => {
  const view = buildFullReadingAnalysisView({ state: 'failed', reading: null, failureCode: 'PROVIDER_UNAVAILABLE' })

  assert.equal(view.notice, 'Leitura completa indisponível agora (PROVIDER_UNAVAILABLE).')
  assert.doesNotMatch(view.notice, /análise anterior/)
})
