// Rodada 8 (HML): leitura v5 e falha que não gruda. Fixtures sintéticas.
//
// - Planner: falta de crédito e falha passageira tentam de novo sozinhas
//   depois de um sucesso (qualquer conversa) ou da espera (5 min / 2 min),
//   no máximo 3 vezes por conversa por hora; determinística não repete.
// - "Atualizar" sem nada novo não relê ("Nada novo desde HH:MM").
// - Esquema e parser v5 (como_conduzir, para_o_gestor, ajustes
//   { houve, melhor }, contradicoes_cadastro, mensagem_sugerida).
// - "Nada a enviar agora" só com a mensagem vazia.
// - Perdido aceito em nao_comercial; rótulos "Não é venda", "Não se aplica".
// - Rodada v5 sem markdown vale no planner, nas views e no "Gerar mensagem".

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXPERT_CONDUCT_SECTION,
  FULL_READING_EVAL_PROMPT_VERSION,
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
  buildKanbanSection,
  buildCommercialContextSection,
} from './full-reading/prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FULL_READING_RELATIONSHIP_PHASES,
  FullReadingOutputError,
  applyFullReadingCoherence,
  findRegistryContradictionAlerts,
  findStageCoherenceProblem,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  FULL_READING_AUTO_RETRY_LIMIT,
  FULL_READING_CREDIT_COOLDOWN_MS,
  FULL_READING_TRANSIENT_RETRY_MS,
  buildAgoraFullReadingView,
  buildAnalysisFullReadingView,
  classifyRunFailure,
  isUsableReadingRun,
  planFullReadingPanel,
  resolveFullReadingPanel,
} from '../server/full-reading-panel.ts'

import {
  FULL_READING_PHASE_LABELS,
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
  mentionsKanbanChange,
  saleLabel,
} from '../server/full-reading-panel-view.ts'

import {
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

import {
  generateFullReadingMessage,
  loadLatestFullReading,
} from '../server/full-reading-message.ts'

const NOW = '2026-10-01T23:00:00.000Z'
const CYCLE = '81000000-0000-4000-8000-0000000000c1'
const COMPANY = '81000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000001'

const minutesBefore = (minutes) =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString()

function decisionV5(overrides = {}) {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'Cliente pediu o valor do plano e espera resposta.',
    cliente: {
      sabemos: ['Pediu o valor do plano mensal (01/10)'],
      inferimos: ['Quer começar logo (perguntou o horário de início).'],
      a_confirmar: ['Se prefere manhã ou noite.'],
    },
    pendencias: [{ de: 'vendedor', texto: 'Responder o valor do plano' }],
    contradicoes_cadastro: [],
    como_conduzir: {
      leitura_do_momento: 'Cliente interessado, esperando o valor.',
      passos: [
        { tecnica: 'Valor antes de preço', como: 'Ligar o plano ao objetivo que ele contou antes de dizer o valor.', exemplo: 'Pelo que você contou, o plano mensal encaixa bem.' },
      ],
      evitar: ['Mandar só o número sem contexto.'],
    },
    acao_agora: 'responder',
    acao_resumo: 'Responder o valor do plano.',
    por_que: 'O cliente perguntou e está esperando.',
    proximo_passo_titulo: 'Responder o valor do plano',
    proximo_passo_complemento: 'Depois, propor um horário para começar.',
    mensagem_sugerida: 'Oi! O plano mensal sai por R$ 100,00. Quer começar esta semana?',
    mensagem_observacao: 'Confira o valor no cadastro antes de enviar.',
    conducao: {
      acertos: ['Respondeu rápido no primeiro contato.'],
      ajustes: [{ houve: 'Mandou o preço sem perguntar o objetivo.', melhor: 'Perguntar o objetivo antes do preço.' }],
    },
    para_o_gestor: [],
    etapa_kanban_sugerida: 'negociacao',
    motivo_etapa: 'Pediu o valor em 01/10.',
    fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '', valor_total: '', forma_pagamento_codigo: '', tipo_pagamento_codigo: '' },
    oportunidades: [],
    afirmacoes_a_confirmar: [],
    alertas_de_captura: [],
    linha_do_tempo: [{ dia: '01/10', hora: '19:00', texto: 'Pediu o valor do plano' }],
    confianca_geral: 'alta',
    ...overrides,
  }
}

function storedDecision(overrides = {}) {
  return {
    ...decisionV5(overrides),
    sistema: {
      kanban_lido: { status: 'contato', stage_entered_at: minutesBefore(600) },
      alertas: [],
      saida_estruturada: true,
    },
  }
}

function run(overrides = {}) {
  return {
    run_id: 'run-a',
    cycle_id: CYCLE,
    status: 'succeeded',
    prompt_version: FULL_READING_PROMPT_VERSION,
    reference_time: minutesBefore(30),
    created_at: minutesBefore(30),
    started_at: minutesBefore(30),
    completed_at: minutesBefore(29),
    failure_code: null,
    failure_detail: null,
    analysis_markdown: null,
    decision: storedDecision(),
    ...overrides,
  }
}

function failedRun(minutesAgo, failureCode, overrides = {}) {
  return run({
    run_id: `run-failed-${minutesAgo}-${failureCode}`,
    status: 'failed',
    failure_code: failureCode,
    reference_time: minutesBefore(minutesAgo),
    created_at: minutesBefore(minutesAgo),
    started_at: minutesBefore(minutesAgo),
    completed_at: minutesBefore(minutesAgo),
    decision: null,
    ...overrides,
  })
}

const KANBAN = { status: 'contato', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null }

function plan(overrides = {}) {
  return planFullReadingPanel({
    runs: [],
    cycleId: CYCLE,
    kanban: KANBAN,
    latestObservedAt: minutesBefore(40),
    force: false,
    now: NOW,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// A. Falha que não gruda (planner)
// ---------------------------------------------------------------------------

test('A1: falha de crédito com sucesso depois (em qualquer conversa) → tenta de novo sozinho', () => {
  const runs = [failedRun(2, 'PROVIDER_CREDIT_EXHAUSTED'), run({ created_at: minutesBefore(60), reference_time: minutesBefore(60) })]

  // Mensagem nova depois da leitura boa (a leitura ficou velha), nenhuma
  // depois da falha.
  const waiting = plan({ runs, latestObservedAt: minutesBefore(10) })

  assert.equal(waiting.action, 'show_failure')
  assert.equal(waiting.failure_kind, 'credit')
  assert.equal(waiting.credit_notice, true)
  assert.equal(waiting.retry_at, new Date(Date.parse(minutesBefore(2)) + FULL_READING_CREDIT_COOLDOWN_MS).toISOString())

  // Uma leitura deu certo depois da falha: start, sem esperar.
  const retried = plan({ runs, latestObservedAt: minutesBefore(10), lastClaudeSuccessAt: minutesBefore(1) })

  assert.equal(retried.action, 'start')
  assert.ok(retried.stale_reasons.includes('nova_tentativa'))
})

test('A1: crédito com menos de 5 min e sem sucesso → mostra a falha; depois de 5 min → tenta', () => {
  const recent = plan({ runs: [failedRun(4, 'PROVIDER_CREDIT_EXHAUSTED')], latestObservedAt: minutesBefore(10) })

  assert.equal(recent.action, 'show_failure')
  assert.equal(recent.failure_at, minutesBefore(4))

  const later = plan({ runs: [failedRun(6, 'PROVIDER_CREDIT_EXHAUSTED')], latestObservedAt: minutesBefore(10) })

  assert.equal(later.action, 'start')

  // Rodada antiga gravada como 400 com o texto da Anthropic conta igual.
  const legacy = plan({
    runs: [failedRun(4, 'PROVIDER_CREDIT_EXHAUSTED', { failure_code: 'PROVIDER_CREDIT_EXHAUSTED' })],
    latestObservedAt: minutesBefore(10),
  })

  assert.equal(legacy.failure_kind, 'credit')
})

test('A1: falha passageira espera 2 min; tempo esgotado, rede, indisponível e limite de uso são passageiras', () => {
  for (const code of ['PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'PROVIDER_UNAVAILABLE', 'PROVIDER_RATE_LIMITED']) {
    assert.equal(classifyRunFailure(code), 'transient', code)
  }

  assert.equal(FULL_READING_TRANSIENT_RETRY_MS, 2 * 60 * 1000)

  const waiting = plan({ runs: [failedRun(1, 'PROVIDER_TIMEOUT')], latestObservedAt: minutesBefore(10) })

  assert.equal(waiting.action, 'show_failure')
  assert.equal(waiting.failure_kind, 'transient')
  assert.equal(waiting.credit_notice, false)
  assert.equal(waiting.retry_at, minutesBefore(-1))

  assert.equal(plan({ runs: [failedRun(3, 'PROVIDER_TIMEOUT')], latestObservedAt: minutesBefore(10) }).action, 'start')
})

test('A1: no máximo 3 tentativas automáticas por conversa por hora', () => {
  assert.equal(FULL_READING_AUTO_RETRY_LIMIT, 3)

  // A primeira falha + 3 tentativas automáticas falharam na última hora.
  const runs = [
    failedRun(10, 'PROVIDER_UNAVAILABLE'),
    failedRun(20, 'PROVIDER_UNAVAILABLE'),
    failedRun(30, 'PROVIDER_UNAVAILABLE'),
    failedRun(40, 'PROVIDER_UNAVAILABLE'),
  ]

  const stopped = plan({ runs, latestObservedAt: minutesBefore(50) })

  assert.equal(stopped.action, 'show_failure')
  assert.equal(stopped.retry_at, null)

  // Com 3 falhas, ainda tenta.
  assert.equal(plan({ runs: runs.slice(0, 3), latestObservedAt: minutesBefore(50) }).action, 'start')

  // "Tentar de novo" sempre tenta.
  assert.equal(plan({ runs, latestObservedAt: minutesBefore(50), force: true }).action, 'start')
})

test('A3: falha determinística mostra a falha (com "Tentar de novo") e não repete sozinha', () => {
  for (const code of ['INVALID_MODEL_OUTPUT', 'EMPTY_CONVERSATION', 'RUN_EXPIRED', 'PROVIDER_MAX_TOKENS']) {
    const result = plan({ runs: [failedRun(30, code)], latestObservedAt: minutesBefore(40) })

    assert.equal(result.action, 'show_failure', code)
    assert.equal(result.failure_kind, 'deterministic', code)
    assert.equal(result.retry_at, null, code)
  }

  // Com "Tentar de novo", tenta.
  assert.equal(plan({ runs: [failedRun(30, 'INVALID_MODEL_OUTPUT')], latestObservedAt: minutesBefore(40), force: true }).action, 'start')

  const view = buildFullReadingAgoraView({
    state: 'failed',
    reading: null,
    failureCode: 'INVALID_MODEL_OUTPUT',
    kanban: KANBAN,
    cycleId: CYCLE,
    lastCustomerMessageAt: null,
    now: Date.parse(NOW),
    panel: { failure_kind: 'deterministic', failure_at: '2026-10-02T00:50:00.000Z', retry_at: null },
  })

  assert.equal(view.notice, 'Não consegui ler a conversa às 21:50.')
  assert.equal(view.status.failure.detail, null)
  assert.deepEqual(view.status.refresh, { label: 'Tentar de novo', mode: 'always', disabled: false, hint: null })
})

test('A2/A5: a espera global de crédito acaba no primeiro sucesso depois da última falha de crédito', () => {
  const base = { latestObservedAt: minutesBefore(1) }

  assert.equal(plan({ ...base, creditExhaustedAt: minutesBefore(2) }).action, 'skip')
  assert.equal(plan({ ...base, creditExhaustedAt: minutesBefore(2), lastClaudeSuccessAt: minutesBefore(3) }).action, 'skip')
  assert.equal(plan({ ...base, creditExhaustedAt: minutesBefore(2), lastClaudeSuccessAt: minutesBefore(1) }).action, 'start')

  // A5: falha de crédito desta conversa seguida de sucesso em outra
  // conversa (com o limite estourado): o aviso não fala em crédito.
  const runs = [
    failedRun(10, 'PROVIDER_CREDIT_EXHAUSTED'),
    failedRun(20, 'PROVIDER_CREDIT_EXHAUSTED'),
    failedRun(30, 'PROVIDER_CREDIT_EXHAUSTED'),
    failedRun(40, 'PROVIDER_CREDIT_EXHAUSTED'),
  ]

  const limited = plan({ runs, latestObservedAt: minutesBefore(50), lastClaudeSuccessAt: minutesBefore(5) })

  assert.equal(limited.action, 'show_failure')
  assert.equal(limited.credit_notice, false)

  const view = buildFullReadingAnalysisView({
    state: 'failed',
    reading: null,
    failureCode: 'PROVIDER_CREDIT_EXHAUSTED',
    panel: { failure_kind: 'credit', failure_at: limited.failure_at, credit_notice: limited.credit_notice },
  })

  assert.match(view.notice, /^Não consegui ler a conversa às \d{2}:\d{2}\.$/)
})

test('A4: "Tentar de novo" dentro dos 60 s da última rodada diz isso em vez de não fazer nada', () => {
  const result = plan({ runs: [failedRun(0.5, 'INVALID_MODEL_OUTPUT')], latestObservedAt: minutesBefore(40), force: true })

  assert.equal(result.action, 'show_failure')
  assert.equal(result.force_debounced, true)
  assert.equal(result.force_available_at, minutesBefore(-0.5))

  const view = buildFullReadingAgoraView({
    state: 'failed',
    reading: null,
    failureCode: 'INVALID_MODEL_OUTPUT',
    kanban: KANBAN,
    cycleId: CYCLE,
    lastCustomerMessageAt: null,
    now: Date.parse(NOW),
    panel: { failure_kind: 'deterministic', force_debounced: true, force_available_at: result.force_available_at },
  })

  assert.equal(view.status.refresh.hint, 'Acabei de ler esta conversa. Tente de novo em 30 s.')
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

        if (mode === 'insert') {
          rows.push({ ...payload })
          tables[table] = rows
        }

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

  return { admin: { from }, writes, tables }
}

function panelTables(runs) {
  return {
    sales_cycles: [{ id: CYCLE, company_id: COMPANY, status: 'contato', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, lost_at: null, canceled_at: null, closed_at: null }],
    conversation_messages: [{ company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', occurred_at: minutesBefore(5), observed_at: minutesBefore(5) }],
    companion_full_reading_runs: runs.map((row) => ({ company_id: COMPANY, conversation_key: CONVERSATION, ...row })),
  }
}

async function resolveWith(memory, overrides = {}) {
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
      ...overrides,
    })

  return { snapshot, scheduled }
}

test('A4 (ponta a ponta): falha passageira recente → aviso com a hora, "Tentar de novo" e a última leitura boa embaixo', async () => {
  const memory = memoryAdmin(panelTables([
    run({ run_id: 'run-good', created_at: minutesBefore(60), reference_time: minutesBefore(60), completed_at: minutesBefore(59) }),
    failedRun(1, 'PROVIDER_TIMEOUT', { run_id: 'run-bad' }),
  ]))

  const { snapshot, scheduled } = await resolveWith(memory)

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.failure_kind, 'transient')
  assert.equal(snapshot.reading.run_id, 'run-good')
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])

  const agora = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.match(agora.notice, /^Não consegui ler a conversa às \d{2}:\d{2}\.$/)
  assert.match(agora.status.failure.detail, /^Vou tentar de novo sozinho às \d{2}:\d{2}\.$/)
  assert.equal(agora.status.retry_at, minutesBefore(-1))
  assert.equal(agora.status.refresh.label, 'Tentar de novo')
  assert.ok(agora.next_step, 'a última leitura boa continua na tela')
  assert.equal(agora.footer, 'Leitura completa · 01/10, 19:01')

  const analysis = buildAnalysisFullReadingView(snapshot)

  assert.equal(analysis.has_reading, true)
  assert.equal(analysis.notice, agora.notice)
})

test('A1 (ponta a ponta): sucesso em outra conversa depois da falha de crédito libera a nova tentativa', async () => {
  const memory = memoryAdmin(panelTables([
    run({ run_id: 'run-good', created_at: minutesBefore(60), reference_time: minutesBefore(60), completed_at: minutesBefore(59) }),
    failedRun(3, 'PROVIDER_CREDIT_EXHAUSTED', { run_id: 'run-credit', reference_time: minutesBefore(3) }),
    // Outra conversa leu com sucesso há 1 min.
    { ...run({ run_id: 'run-elsewhere', cycle_id: 'outro-ciclo', created_at: minutesBefore(2), completed_at: minutesBefore(1) }), conversation_key: 'phone:outra' },
  ]))

  const { snapshot, scheduled } = await resolveWith(memory)

  assert.equal(snapshot.state, 'running')
  assert.equal(scheduled.length, 1)
  assert.ok(snapshot.stale_reasons.includes('nova_tentativa'))
})

// ---------------------------------------------------------------------------
// B4: "Atualizar" sem nada novo
// ---------------------------------------------------------------------------

test('B4: "Atualizar" com a leitura em dia não relê; "Ler de novo mesmo assim" relê', async () => {
  const fresh = run({ created_at: minutesBefore(3), reference_time: minutesBefore(3), completed_at: minutesBefore(2.5) })

  const nothing = plan({ runs: [fresh], latestObservedAt: minutesBefore(10), force: true, forceMode: 'if_changed' })

  assert.equal(nothing.action, 'use')
  assert.equal(nothing.nothing_new, true)

  assert.equal(plan({ runs: [fresh], latestObservedAt: minutesBefore(10), force: true, forceMode: 'always' }).action, 'start')
  // Mensagem nova: relê direto.
  assert.equal(plan({ runs: [fresh], latestObservedAt: minutesBefore(1), force: true, forceMode: 'if_changed' }).action, 'start')
  // Kanban mudou: relê direto.
  assert.equal(
    plan({ runs: [fresh], latestObservedAt: minutesBefore(10), force: true, forceMode: 'if_changed', kanban: { ...KANBAN, status: 'negociacao', stage_entered_at: minutesBefore(1) } }).action,
    'start',
  )

  const memory = memoryAdmin(panelTables([fresh]))
  memory.tables.conversation_messages[0].observed_at = minutesBefore(10)

  const { snapshot, scheduled } = await resolveWith(memory, { force: true, forceMode: 'if_changed' })

  assert.equal(snapshot.state, 'ready')
  assert.equal(scheduled.length, 0)

  const agora = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(agora.status.nothing_new_since, '19:57')
  assert.equal(agora.status.refresh.mode, 'if_changed')
  assert.equal(agora.status.refresh.label, 'Atualizar')
})

test('rodadas de medição (…-eval) nunca viram a leitura do painel nem seguram a rodada', () => {
  assert.equal(FULL_READING_EVAL_PROMPT_VERSION, 'full-reading-v5-eval')

  const evalRun = run({ run_id: 'run-eval', prompt_version: FULL_READING_EVAL_PROMPT_VERSION, created_at: minutesBefore(1), reference_time: minutesBefore(1) })
  const evalLive = run({ run_id: 'run-eval-live', prompt_version: FULL_READING_EVAL_PROMPT_VERSION, status: 'running', completed_at: null, decision: null, created_at: minutesBefore(0.5) })

  const result = plan({ runs: [evalLive, evalRun], latestObservedAt: minutesBefore(40) })

  assert.equal(result.action, 'start')
  assert.equal(result.reading, null)
  assert.equal(result.active_run, null)
})

// ---------------------------------------------------------------------------
// B1/C/F: esquema e parser v5
// ---------------------------------------------------------------------------

test('esquema v5: sem analise_markdown; decisão na ordem "entender antes de decidir"; tudo obrigatório', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v5')
  assert.deepEqual(FULL_READING_OUTPUT_JSON_SCHEMA.required, ['decisao'])
  assert.equal('analise_markdown' in FULL_READING_OUTPUT_JSON_SCHEMA.properties, false)

  const decision =
    FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao

  const keys =
    Object.keys(decision.properties)

  assert.deepEqual(decision.required, keys)

  const order = (key) => keys.indexOf(key)

  // situação → cliente → pendências → contradições → como conduzir → ação e
  // próximo passo → mensagem → condução → para o gestor → o resto.
  assert.ok(order('situacao_resumo') < order('cliente'))
  assert.ok(order('cliente') < order('pendencias'))
  assert.ok(order('pendencias') < order('contradicoes_cadastro'))
  assert.ok(order('contradicoes_cadastro') < order('como_conduzir'))
  assert.ok(order('como_conduzir') < order('acao_agora'))
  assert.ok(order('acao_agora') < order('proximo_passo_titulo'))
  assert.ok(order('proximo_passo_complemento') < order('mensagem_sugerida'))
  assert.ok(order('mensagem_observacao') < order('conducao'))
  assert.ok(order('conducao') < order('para_o_gestor'))
  assert.ok(order('para_o_gestor') < order('etapa_kanban_sugerida'))

  assert.deepEqual(decision.properties.como_conduzir.required, ['leitura_do_momento', 'passos', 'evitar'])
  assert.deepEqual(decision.properties.como_conduzir.properties.passos.items.required, ['tecnica', 'como', 'exemplo'])
  assert.deepEqual(decision.properties.conducao.properties.ajustes.items.required, ['houve', 'melhor'])
  assert.deepEqual(decision.properties.contradicoes_cadastro.items.required, ['dito', 'cadastro', 'muda_o_que_o_cliente_paga_ou_recebe'])
  assert.equal(decision.properties.contradicoes_cadastro.items.properties.muda_o_que_o_cliente_paga_ou_recebe.type, 'boolean')
  assert.ok(FULL_READING_RELATIONSHIP_PHASES.includes('nao_comercial'))

  // Saída estruturada: todo objeto fechado, nenhuma união.
  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'object') assert.equal(node.additionalProperties, false, path)
    assert.equal('anyOf' in node || 'oneOf' in node, false, path)
    for (const [key, value] of Object.entries(node)) visit(value, `${path}.${key}`)
  }

  visit(FULL_READING_OUTPUT_JSON_SCHEMA, 'schema')
})

test('parser v5: como_conduzir, para_o_gestor, ajustes { houve, melhor }, contradições e mensagem', () => {
  const parsed =
    parseFullReadingOutput(JSON.stringify({
      decisao: decisionV5({
        como_conduzir: {
          leitura_do_momento: ' Cliente irritada com a demora. ',
          passos: [
            { tecnica: 'Acalmar antes de explicar', como: 'Reconhecer a falta de resposta.', exemplo: 'Desculpe a demora.' },
            { tecnica: 'Assumir o caso', como: 'Dizer que vai cuidar disso.', exemplo: '' },
            { tecnica: 'Caminho com prazo', como: 'Dizer quando volta.', exemplo: 'Volto [até amanhã às 12h].' },
            { tecnica: 'Quarto passo', como: 'Nunca aparece.', exemplo: '' },
          ],
          evitar: ['Discutir culpa.', 'Pedir o que ela já mandou.', 'Terceiro nunca aparece.'],
        },
        para_o_gestor: ['Risco de reclamação pública.', 'Falha de processo: mensagem sem resposta.', 'Terceira nunca aparece.'],
        contradicoes_cadastro: [
          { dito: 'Vendedor disse que o plano não inclui o adicional (01/10)', cadastro: 'O catálogo diz que inclui', muda_o_que_o_cliente_paga_ou_recebe: true },
        ],
        mensagem_sugerida: '',
        mensagem_observacao: 'Não enviar antes de verificar o plano.',
      }),
    }), { format: 'v5' })

  assert.equal(parsed.analise_markdown, null)
  assert.equal(parsed.decisao.como_conduzir.leitura_do_momento, 'Cliente irritada com a demora.')
  assert.equal(parsed.decisao.como_conduzir.passos.length, 3)
  assert.deepEqual(parsed.decisao.como_conduzir.evitar, ['Discutir culpa.', 'Pedir o que ela já mandou.'])
  assert.equal(parsed.decisao.para_o_gestor.length, 2)
  assert.deepEqual(parsed.decisao.conducao.ajustes, [{ houve: 'Mandou o preço sem perguntar o objetivo.', melhor: 'Perguntar o objetivo antes do preço.' }])
  assert.equal(parsed.decisao.contradicoes_cadastro[0].muda_o_que_o_cliente_paga_ou_recebe, true)
  assert.equal(parsed.decisao.mensagem_sugerida, '')
  assert.equal(parsed.decisao.mensagem_observacao, 'Não enviar antes de verificar o plano.')

  // Campo v5 ausente: recusa.
  const { como_conduzir: _missing, ...withoutConduct } = decisionV5()

  assert.throws(
    () => parseFullReadingOutput(JSON.stringify({ decisao: withoutConduct }), { format: 'v5' }),
    (error) => error instanceof FullReadingOutputError && /como_conduzir/.test(error.message),
  )

  // Contradição sem o booleano: recusa.
  assert.throws(
    () => parseFullReadingOutput(JSON.stringify({ decisao: decisionV5({ contradicoes_cadastro: [{ dito: 'x', cadastro: 'y', muda_o_que_o_cliente_paga_ou_recebe: 'sim' }] }) }), { format: 'v5' }),
    (error) => error instanceof FullReadingOutputError && /muda_o_que_o_cliente_paga_ou_recebe/.test(error.message),
  )

  // Fase nova aceita.
  assert.equal(parseFullReadingOutput(JSON.stringify({ decisao: decisionV5({ fase_relacao: 'nao_comercial' }) })).decisao.fase_relacao, 'nao_comercial')
})

test('prompt v5: seção do especialista como está, regras de "Não é venda", cadastro e kanban', () => {
  const system =
    buildFullReadingSystemPrompt()

  assert.ok(system.includes(EXPERT_CONDUCT_SECTION))
  assert.match(EXPERT_CONDUCT_SECTION, /^## Como um especialista conduz\nVocê também é especialista em vendas e atendimento\./)
  assert.match(EXPERT_CONDUCT_SECTION, /Nunca repita CPF, documento, cartão ou dados bancários em nenhum texto\.$/)
  assert.match(system, /## Conversa sem oportunidade de venda \(fase nao_comercial\)/)
  assert.match(system, /motivo_perda "Não era oportunidade de venda: <motivo curto>"/)
  assert.match(system, /Kanban em Ganho nunca recebe sugestão de Perdido/)
  assert.match(system, /Um plano citado na conversa e um item do catálogo com o mesmo nome base são o mesmo plano quando não há outro parecido/)
  assert.match(system, /registre cada divergência em contradicoes_cadastro/)
  assert.match(system, /Quando a etapa sugerida for igual à atual, nenhum texto fala em ajustar, mover ou atualizar o kanban/)
  assert.match(system, /Estar em Novo desde a criação não é movimentação do kanban/)
  assert.doesNotMatch(system, /analise_markdown|### Mensagem sugerida/)

  // Catálogo com preço base.
  const catalog =
    buildCommercialContextSection({
      business_description: null,
      method_name: null,
      method_steps: [],
      products: [
        { name: 'Plano Exemplo', category: 'Serviço completo para duas pessoas', base_price: 120 },
        { name: 'Sem preço', category: '', base_price: 0 },
      ],
      facts: [],
    })

  assert.match(catalog, /- Plano Exemplo: Serviço completo para duas pessoas \(preço base R\$ 120,00\)/)
  assert.match(catalog, /- Sem preço$/m)
})

test('F3: o kanban diz quando e por onde a oportunidade foi criada ("criada agora pelo Companion")', () => {
  const section =
    buildKanbanSection(
      {
        status: 'novo',
        label: 'NOVO',
        stage_entered_at: minutesBefore(2),
        next_action: null,
        next_action_date: null,
        created_at: minutesBefore(2),
        created_via: 'companion',
        successor: false,
        won: null,
        lost: null,
        paused: null,
        canceled: null,
      },
      NOW,
    )

  assert.match(section, /Oportunidade criada em: 01\/10\/2026 19:58, pelo Companion \(criada agora, minutos antes do momento de referência: a etapa atual é a da criação, não uma movimentação\)/)

  const old =
    buildKanbanSection(
      { status: 'contato', label: 'CONTATO', stage_entered_at: null, next_action: null, next_action_date: null, created_at: minutesBefore(3000), created_via: 'yolen', successor: false, won: null, lost: null, paused: null, canceled: null },
      NOW,
    )

  assert.match(old, /Oportunidade criada em: 29\/09\/2026 \d{2}:\d{2}, no Yolen$/m)

  const successor =
    buildKanbanSection(
      { status: 'novo', label: 'NOVO', stage_entered_at: null, next_action: null, next_action_date: null, created_at: minutesBefore(3000), created_via: 'companion', successor: true, won: null, lost: null, paused: null, canceled: null },
      NOW,
    )

  assert.match(successor, /como nova oportunidade de um ciclo anterior/)
})

test('runner v5: grava analysis_markdown nulo, a decisão nova e o alerta F2 (sem mudar texto)', async () => {
  const updates = []
  const admin = {
    from(table) {
      return {
        update(values) {
          const record = { table, values }
          updates.push(record)
          const chain = { eq() { return chain }, then(resolve) { resolve({ error: null }) } }
          return chain
        },
      }
    },
  }

  const decision =
    decisionV5({
      acao_agora: 'responder',
      contradicoes_cadastro: [{ dito: 'Vendedor disse que o plano não inclui o adicional (01/10)', cadastro: 'O catálogo diz que inclui', muda_o_que_o_cliente_paga_ou_recebe: true }],
    })

  const lines = []

  const result =
    await executeFullReadingRun({
      admin,
      runId: 'run-v5',
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
      referenceTime: NOW,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'sk-ant-teste',
      loadMessages: async () => [{ id: '1', direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(5), content_type: 'text', text_content: 'Quanto custa?', audio_transcription: null, is_deleted: false, deletion_reason: null }],
      loadConfig: async () => ({ bundle: null, products: [] }),
      loadKanban: async () => ({ status: 'contato', label: 'CONTATO', stage_entered_at: null, next_action: null, next_action_date: null, won: null, lost: null, paused: null, canceled: null }),
      logger: (line) => lines.push(line),
      fetchImpl: async () => new Response(JSON.stringify({
        model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify({ decisao: decision }) }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })

  assert.deepEqual(result, { status: 'succeeded' })

  const final = updates[updates.length - 1].values

  assert.equal(final.analysis_markdown, null)
  assert.equal(final.decision.acao_agora, 'responder')
  assert.equal(final.decision.mensagem_sugerida, decision.mensagem_sugerida)
  assert.deepEqual(final.decision.sistema.alertas, [
    {
      campo: 'acao_agora',
      valor_do_modelo: 'responder',
      valor_aplicado: 'responder',
      motivo: 'contradição com o cadastro que muda o que o cliente paga ou recebe sem verificação interna como ação principal',
    },
  ])

  // Com verificação interna, nenhum alerta.
  assert.deepEqual(findRegistryContradictionAlerts({ ...decision, acao_agora: 'verificacao_interna' }), [])
  // Contradição que não muda o que o cliente paga ou recebe: nenhum alerta.
  assert.deepEqual(findRegistryContradictionAlerts({ acao_agora: 'responder', contradicoes_cadastro: [{ dito: 'a', cadastro: 'b', muda_o_que_o_cliente_paga_ou_recebe: false }] }), [])
})

// ---------------------------------------------------------------------------
// D: conversa sem venda
// ---------------------------------------------------------------------------

test('D3: a trava aceita Perdido em nao_comercial; nunca com Ganho nem com o cliente esperando', () => {
  const lost = { etapa_kanban_sugerida: 'perdido', venda_concluida: 'nao' }

  assert.equal(findStageCoherenceProblem({ ...lost, fase_relacao: 'nao_comercial', pendencia_do_vendedor: false }), null)
  assert.equal(findStageCoherenceProblem({ ...lost, fase_relacao: 'perdido', pendencia_do_vendedor: false }), null)
  assert.match(findStageCoherenceProblem({ ...lost, fase_relacao: 'cliente_ativo' }), /fora das fases/)
  assert.match(findStageCoherenceProblem({ ...lost, fase_relacao: 'nao_comercial', pendencia_do_vendedor: true }), /esperando resposta/)
  assert.match(findStageCoherenceProblem({ ...lost, fase_relacao: 'nao_comercial' }, { currentStatus: 'ganho' }), /ganho/)

  // Antes, "Novo" ficava no lugar do Perdido em nao_comercial; agora passa.
  const { decision, alerts } =
    applyFullReadingCoherence(
      decisionV5({ fase_relacao: 'nao_comercial', etapa_kanban_sugerida: 'perdido', pendencia_do_vendedor: false, fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: 'Não era oportunidade de venda: engano', valor_total: '', forma_pagamento_codigo: '', tipo_pagamento_codigo: '' } }),
      { currentStatus: 'novo' },
    )

  assert.equal(decision.etapa_kanban_sugerida, 'perdido')
  assert.deepEqual(alerts, [])
})

test('D4/D5: Venda "Não se aplica" em nao_comercial; cartão "Novo → Perdido" com o motivo e "Registrar no Yolen"', () => {
  assert.equal(FULL_READING_PHASE_LABELS.nao_comercial, 'Não é venda')
  assert.equal(saleLabel({ fase_relacao: 'nao_comercial', venda_concluida: 'nao' }), 'Não se aplica')
  assert.equal(saleLabel({ fase_relacao: 'nao_comercial', venda_concluida: 'indeterminado' }), 'Não se aplica')
  assert.equal(saleLabel({ fase_relacao: 'perdido', venda_concluida: 'nao' }), 'Não')
  assert.equal(saleLabel({ fase_relacao: 'negociacao', venda_concluida: 'nao' }), 'Ainda não')
  assert.equal(saleLabel({ fase_relacao: 'cliente_ativo', venda_concluida: 'confirmada' }), 'Confirmada')

  const decision =
    storedDecision({
      fase_relacao: 'nao_comercial',
      venda_concluida: 'nao',
      pendencia_do_vendedor: false,
      vez_de: 'ninguem',
      etapa_kanban_sugerida: 'perdido',
      motivo_etapa: 'Era um engano de número (01/10).',
      fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: 'Não era oportunidade de venda: engano de número', valor_total: '', forma_pagamento_codigo: '', tipo_pagamento_codigo: '' },
    })

  const view =
    buildFullReadingAgoraView({
      state: 'ready',
      reading: { run_id: 'run-lost', completed_at: minutesBefore(1), analysis_markdown: null, decision },
      failureCode: null,
      kanban: { ...KANBAN, status: 'novo' },
      cycleId: CYCLE,
      lastCustomerMessageAt: null,
      now: Date.parse(NOW),
    })

  assert.equal(view.stage_card.kind, 'confirm_lost')
  assert.equal(view.stage_card.current_label, 'Novo')
  assert.equal(view.stage_card.suggested_label, 'Perdido')
  assert.equal(view.stage_card.reason, 'Era um engano de número (01/10).')
  assert.equal(view.stage_card.button_label, 'Registrar no Yolen')
  assert.equal(view.stage_card.cycle_path, `/sales-cycles/${CYCLE}?fechar=perdido&motivo=N%C3%A3o+era+oportunidade+de+venda%3A+engano+de+n%C3%BAmero`)
  assert.equal(view.facts.find((fact) => fact.key === 'venda').value, 'Não se aplica')

  const analysis =
    buildFullReadingAnalysisView({ state: 'ready', reading: { run_id: 'run-lost', completed_at: minutesBefore(1), analysis_markdown: null, decision }, failureCode: null, kanban: { ...KANBAN, status: 'novo' } })

  assert.deepEqual(analysis.summary.find((block) => block.key === 'fase').value, 'Não é venda')
  assert.deepEqual(analysis.summary.find((block) => block.key === 'venda').value, 'Não se aplica')
})

test('D6: com a etapa sugerida igual à atual, nenhum texto fala em ajustar o kanban', () => {
  assert.equal(mentionsKanbanChange('Ajustar o kanban para Novo.'), true)
  assert.equal(mentionsKanbanChange('Kanban desatualizado.'), true)
  assert.equal(mentionsKanbanChange('Mudar de etapa do método sem descobrir o objetivo.'), false)

  const decision =
    storedDecision({
      etapa_kanban_sugerida: 'contato',
      proximo_passo_complemento: 'Depois, ajustar o kanban para Contato.',
      pendencias: [{ de: 'vendedor', texto: 'Atualizar o kanban' }, { de: 'vendedor', texto: 'Responder o valor' }],
      conducao: { acertos: [], ajustes: [{ houve: 'Não moveu o kanban.', melhor: 'Mover o kanban no mesmo dia.' }, { houve: 'Demorou a responder.', melhor: 'Responder no mesmo dia.' }] },
    })

  const reading = { run_id: 'run-same', completed_at: minutesBefore(1), analysis_markdown: null, decision }

  const agora = buildFullReadingAgoraView({ state: 'ready', reading, failureCode: null, kanban: KANBAN, cycleId: CYCLE, lastCustomerMessageAt: null })
  const analysis = buildFullReadingAnalysisView({ state: 'ready', reading, failureCode: null, kanban: KANBAN })

  assert.equal(agora.stage_card, null)
  assert.equal(agora.next_step.complement, '')
  assert.deepEqual(analysis.pending.map((item) => item.text), ['Responder o valor'])
  assert.deepEqual(analysis.coaching.adjustments, [{ happened: 'Demorou a responder.', better: 'Responder no mesmo dia.' }])
})

// ---------------------------------------------------------------------------
// E1 e C3: mensagem e condução vindas da decisão
// ---------------------------------------------------------------------------

function agoraFor(decisionOverrides, kanbanOverrides = {}) {
  return buildFullReadingAgoraView({
    state: 'ready',
    reading: { run_id: 'run-v5', completed_at: minutesBefore(1), analysis_markdown: null, decision: storedDecision(decisionOverrides) },
    failureCode: null,
    kanban: { ...KANBAN, ...kanbanOverrides },
    cycleId: CYCLE,
    lastCustomerMessageAt: null,
    now: Date.parse(NOW),
  })
}

test('E1: "Nada a enviar agora" só com mensagem_sugerida vazia; verificação interna com mensagem mostra a mensagem', () => {
  const internal =
    agoraFor({
      acao_agora: 'verificacao_interna',
      acao_resumo: 'Verificar a cobrança com o financeiro.',
      proximo_passo_titulo: 'Verificar a cobrança com o financeiro',
      mensagem_sugerida: 'Oi! Entendo sua preocupação. Vou verificar a cobrança com o financeiro e te respondo [até amanhã às 12h].',
      mensagem_observacao: 'Confirme o prazo antes de enviar.',
    })

  assert.equal(internal.message.mode, 'send')
  assert.equal(internal.message.suggested_message, 'Oi! Entendo sua preocupação. Vou verificar a cobrança com o financeiro e te respondo [até amanhã às 12h].')
  assert.equal(internal.message.observation, 'Confirme o prazo antes de enviar.')
  assert.equal(internal.next_step.send, true)
  assert.equal(internal.next_step.title, 'Verificar a cobrança com o financeiro')

  const empty =
    agoraFor({ acao_agora: 'nao_intervir', mensagem_sugerida: '', mensagem_observacao: 'A cliente disse que volta a falar amanhã.' })

  assert.equal(empty.message.mode, 'no_send')
  assert.equal(empty.message.no_send_reason, 'A cliente disse que volta a falar amanhã.')
  assert.equal(empty.next_step.send, false)

  // Mensagem com "não intervir": a mensagem aparece (só a vazia é "nada a
  // enviar").
  assert.equal(agoraFor({ acao_agora: 'nao_intervir', mensagem_sugerida: 'Combinado, até amanhã!' }).message.mode, 'send')

  // Trava do kanban continua valendo.
  assert.equal(agoraFor({ acao_agora: 'retomar', venda_concluida: 'confirmada', mensagem_sugerida: 'Vamos retomar?' }, { status: 'ganho' }).message.mode, 'no_send')
})

test('C3: "Como conduzir" no AGORA; "Houve/Melhor" e "Para o gestor" na ANÁLISE', () => {
  const decision = {
    como_conduzir: {
      leitura_do_momento: 'Cliente irritada: escreveu e ficou sem resposta.',
      passos: [
        { tecnica: 'Acalmar antes de explicar', como: 'Reconhecer a falta de resposta antes de qualquer explicação.', exemplo: 'Você tem razão, ficou sem resposta.' },
        { tecnica: 'Caminho com prazo', como: 'Dizer o que vai ser feito e quando volta.', exemplo: '' },
      ],
      evitar: ['Discutir contrato por mensagem.'],
    },
    para_o_gestor: ['Risco de reclamação pública: a cliente citou um advogado.'],
  }

  const agora = agoraFor(decision)

  assert.deepEqual(agora.conduct, {
    moment: 'Cliente irritada: escreveu e ficou sem resposta.',
    steps: [
      { technique: 'Acalmar antes de explicar', how: 'Reconhecer a falta de resposta antes de qualquer explicação.', example: 'Você tem razão, ficou sem resposta.' },
      { technique: 'Caminho com prazo', how: 'Dizer o que vai ser feito e quando volta.', example: '' },
    ],
    avoid: ['Discutir contrato por mensagem.'],
  })

  const analysis =
    buildFullReadingAnalysisView({ state: 'ready', reading: { run_id: 'run-v5', completed_at: minutesBefore(1), analysis_markdown: null, decision: storedDecision(decision) }, failureCode: null, kanban: KANBAN })

  assert.deepEqual(analysis.coaching.adjustments, [{ happened: 'Mandou o preço sem perguntar o objetivo.', better: 'Perguntar o objetivo antes do preço.' }])
  assert.deepEqual(analysis.coaching.ajustes, [])
  assert.deepEqual(analysis.manager_notes, ['Risco de reclamação pública: a cliente citou um advogado.'])
  assert.deepEqual(analysis.sections, [])
})

// ---------------------------------------------------------------------------
// B1: rodada v5 sem markdown vale em todo lugar
// ---------------------------------------------------------------------------

test('B1: rodada v5 sem markdown é leitura válida no planner, nas views e no "Gerar mensagem"', async () => {
  const fresh = run({ created_at: minutesBefore(3), reference_time: minutesBefore(3), completed_at: minutesBefore(2.5) })

  assert.equal(isUsableReadingRun(fresh), true)
  // Sem markdown e sem mensagem_sugerida (decisão incompleta): não vale.
  assert.equal(isUsableReadingRun({ ...fresh, decision: { ...fresh.decision, mensagem_sugerida: undefined } }), false)

  const result = plan({ runs: [fresh], latestObservedAt: minutesBefore(10) })

  assert.equal(result.action, 'use')
  assert.equal(result.reading.run_id, 'run-a')

  const memory = memoryAdmin(panelTables([fresh]))
  memory.tables.conversation_messages[0].observed_at = minutesBefore(10)

  const { snapshot } = await resolveWith(memory)

  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.reading.analysis_markdown, null)
  assert.equal(buildAgoraFullReadingView(snapshot, { cycleId: CYCLE }).message.suggested_message, decisionV5().mensagem_sugerida)
  assert.equal(buildAnalysisFullReadingView(snapshot).has_reading, true)

  // "Gerar mensagem": a leitura v5 (sem markdown) vai ao prompt só como
  // decisão.
  const readingRow = await loadLatestFullReading({
    admin: memoryAdmin({ companion_full_reading_runs: [{ ...fresh, company_id: COMPANY, conversation_key: CONVERSATION }] }).admin,
    scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
  })

  assert.equal(readingRow.analysis_markdown, null)
  assert.equal(readingRow.run_id, 'run-a')

  let sentBody = null

  const generated =
    await generateFullReadingMessage({
      admin: {},
      scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
      sellerIntent: 'Responder o valor do plano.',
      apiKey: 'sk-ant-teste',
      now: NOW,
      env: {},
      logger: () => {},
      loadReading: async () => readingRow,
      loadMessages: async () => [{ id: '1', direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(5), content_type: 'text', text_content: 'Quanto custa?', audio_transcription: null, is_deleted: false, deletion_reason: null }],
      loadKanban: async () => null,
      loadConfig: async () => ({ bundle: null, products: [] }),
      fetchImpl: async (_url, init) => {
        sentBody = JSON.parse(init.body)
        return new Response(JSON.stringify({
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: JSON.stringify({ mensagem: 'Oi! O plano mensal sai por R$ 100,00.' }) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })

  assert.equal(generated.message, 'Oi! O plano mensal sai por R$ 100,00.')

  const userText = sentBody.messages[0].content

  assert.match(userText, /<leitura_completa>\nDecisão da leitura \(campos fixos\):/)
  assert.match(userText, /"como_conduzir"/)
  assert.doesNotMatch(userText, /null\n\nDecisão/)
})

// ---------------------------------------------------------------------------
// Esquema grande demais para a API ("The compiled grammar is too large")
// ---------------------------------------------------------------------------

import {
  ClaudeProviderError,
  buildClaudeRequestBody,
  callClaudeReading,
  isSchemaRecentlyRejected,
  resetRejectedSchemas,
} from './full-reading/anthropic-client.ts'

const GRAMMAR_MESSAGE =
  'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.'

function apiError(status, message) {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function apiText(text) {
  return new Response(JSON.stringify({
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const BASE_REQUEST = {
  apiKey: 'sk-ant-teste',
  model: 'claude-sonnet-5-5',
  system: 'sistema',
  userText: 'conversa',
  maxTokens: 24000,
  effort: 'high',
  outputSchema: FULL_READING_OUTPUT_JSON_SCHEMA,
  timeoutMs: 10_000,
}

test('esquema v5: só os campos que decidem são enum (gramática menor); os códigos secundários vão como texto', () => {
  const decision =
    FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao.properties

  const enums =
    Object.entries(decision)
      .filter(([, value]) => Array.isArray(value.enum))
      .map(([key]) => key)
      .sort()

  assert.deepEqual(enums, ['acao_agora', 'etapa_kanban_sugerida', 'fase_relacao', 'venda_concluida', 'vez_de'])
  assert.equal(decision.confianca_geral.type, 'string')
  assert.equal(decision.pendencias.items.properties.de.type, 'string')
  assert.equal(decision.oportunidades.items.properties.status.type, 'string')
  assert.equal(JSON.stringify(FULL_READING_OUTPUT_JSON_SCHEMA).match(/"enum"/g).length, 5)
})

test('parser v5: códigos secundários fora da lista viram o padrão, sem derrubar a leitura', () => {
  const parsed =
    parseFullReadingOutput(JSON.stringify({
      decisao: decisionV5({
        confianca_geral: 'Alta',
        pendencias: [{ de: 'equipe', texto: 'Algo pendente' }],
        oportunidades: [{ descricao: 'Plano anual', status: 'talvez' }],
        fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '', valor_total: '', forma_pagamento_codigo: 'cartao', tipo_pagamento_codigo: 'Recorrente' },
      }),
    }), { format: 'v5' })

  assert.equal(parsed.decisao.confianca_geral, 'alta')
  assert.equal(parsed.decisao.pendencias[0].de, 'nenhum')
  assert.equal(parsed.decisao.oportunidades[0].status, 'em_aberto')
  assert.equal(parsed.decisao.fechamento.forma_pagamento_codigo, '')
  assert.equal(parsed.decisao.fechamento.tipo_pagamento_codigo, 'recorrente')

  // Campo que decide continua estrito.
  assert.throws(
    () => parseFullReadingOutput(JSON.stringify({ decisao: decisionV5({ acao_agora: 'ligar' }) }), { format: 'v5' }),
    (error) => error instanceof FullReadingOutputError && /acao_agora/.test(error.message),
  )
})

test('gramática grande demais: repete sem o formato fixo, com o esquema escrito no prompt, e lembra a recusa', async () => {
  resetRejectedSchemas()

  const bodies = []

  const response =
    await callClaudeReading({
      ...BASE_REQUEST,
      logger: () => {},
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        return bodies.length === 1
          ? apiError(400, GRAMMAR_MESSAGE)
          : apiText('{"ok":true}')
      },
    })

  assert.equal(bodies.length, 2)
  assert.ok(bodies[0].output_config.format)
  assert.equal(bodies[0].system, 'sistema')
  assert.equal(bodies[1].output_config.format, undefined)
  assert.match(bodies[1].system, /^sistema\n\n## Formato obrigatório da resposta\nResponda somente com um objeto JSON válido/)
  assert.ok(bodies[1].system.endsWith(JSON.stringify(FULL_READING_OUTPUT_JSON_SCHEMA)))
  assert.equal(response.used_structured_output, false)
  assert.equal(isSchemaRecentlyRejected(FULL_READING_OUTPUT_JSON_SCHEMA), true)

  // Próxima rodada desta instância: direto sem o formato fixo (uma
  // chamada só).
  const second = []

  await callClaudeReading({
    ...BASE_REQUEST,
    logger: () => {},
    fetchImpl: async (_url, init) => {
      second.push(JSON.parse(init.body))
      return apiText('{"ok":true}')
    },
  })

  assert.equal(second.length, 1)
  assert.equal(second[0].output_config.format, undefined)
  assert.match(second[0].system, /## Formato obrigatório da resposta/)

  // Modo estrito (rota de teste): sempre tenta o formato fixo e falha se
  // a API recusar.
  await assert.rejects(
    callClaudeReading({
      ...BASE_REQUEST,
      requireStructuredOutput: true,
      logger: () => {},
      fetchImpl: async () => apiError(400, GRAMMAR_MESSAGE),
    }),
    (error) => error instanceof ClaudeProviderError && error.code === 'STRUCTURED_OUTPUT_REJECTED',
  )

  resetRejectedSchemas()
  assert.equal(isSchemaRecentlyRejected(FULL_READING_OUTPUT_JSON_SCHEMA), false)

  // Com o formato fixo, o prompt não leva o esquema.
  const structuredBody = buildClaudeRequestBody({ ...BASE_REQUEST }, { structured: true })

  assert.equal(structuredBody.system, 'sistema')
})

test('runner: a recusa por gramática não derruba a leitura v5 (sai pelo modo sem formato fixo)', async () => {
  resetRejectedSchemas()

  const updates = []
  const admin = {
    from(table) {
      return {
        update(values) {
          updates.push({ table, values })
          const chain = { eq() { return chain }, then(resolve) { resolve({ error: null }) } }
          return chain
        },
      }
    },
  }

  let calls = 0

  const result =
    await executeFullReadingRun({
      admin,
      runId: 'run-grammar',
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
      referenceTime: NOW,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'sk-ant-teste',
      logger: () => {},
      loadMessages: async () => [{ id: '1', direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(5), content_type: 'text', text_content: 'Quanto custa?', audio_transcription: null, is_deleted: false, deletion_reason: null }],
      loadConfig: async () => ({ bundle: null, products: [] }),
      loadKanban: async () => null,
      fetchImpl: async () => {
        calls += 1
        return calls === 1
          ? apiError(400, GRAMMAR_MESSAGE)
          : apiText(`Aqui está:\n${JSON.stringify({ decisao: decisionV5() })}`)
      },
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(calls, 2)

  const final = updates[updates.length - 1].values

  assert.equal(final.status, 'succeeded')
  assert.equal(final.decision.sistema.saida_estruturada, false)
  assert.equal(final.decision.mensagem_sugerida, decisionV5().mensagem_sugerida)

  resetRejectedSchemas()
})
