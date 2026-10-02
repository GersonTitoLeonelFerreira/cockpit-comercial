// Leitura completa no painel (AGORA/ANÁLISE do HML): frescor da rodada,
// uma rodada por conversa, travas do kanban e view model. Banco em
// memória e fixtures sintéticas: nenhum teste toca apply-suggestion, o
// fechamento ou qualquer tabela real.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DUPLICATE_RUN_FAILURE_CODE,
  FULL_READING_PANEL_TRIGGER_SOURCE,
  RUN_EXPIRED_FAILURE_CODE,
  attachFullReadingToAgora,
  attachFullReadingToAnalysis,
  buildAgoraFullReadingView,
  isFullReadingPanelEnabled,
  loadFullReadingPanelForRequest,
  planFullReadingPanel,
  resolveFullReadingPanel,
} from '../server/full-reading-panel.ts'

import {
  FULL_READING_PROMPT_VERSION,
} from './full-reading/prompt.ts'

import {
  FULL_READING_RUNNING_NOTICE,
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
  formatSince,
  humanizePanelText,
  methodStageLabel,
  parseFullReadingAnalysisSections,
} from '../server/full-reading-panel-view.ts'

const COMPANY = '10000000-0000-4000-8000-000000000001'
const CYCLE = '20000000-0000-4000-8000-000000000001'
const OTHER_CYCLE = '20000000-0000-4000-8000-000000000002'
const CONVERSATION = 'phone:5511900000000'
const NOW = '2026-10-01T15:00:00.000Z'

function minutesBefore(minutes, base = NOW) {
  return new Date(Date.parse(base) - minutes * 60_000).toISOString()
}

function storedDecision(overrides = {}, kanbanStatus = 'novo') {
  return {
    fase_relacao: 'cliente_ativo',
    etapa_metodo_atual: 'Pós-venda',
    venda_concluida: 'provavel',
    vez_de: 'cliente',
    pendencia_do_vendedor: false,
    situacao_resumo: 'Cliente já usa o serviço.',
    acao_agora: 'nao_intervir',
    acao_resumo: 'Não enviar nada agora.',
    por_que: 'Não há pergunta em aberto.',
    etapa_kanban_sugerida: 'ganho',
    motivo_etapa: 'Pediu acesso ao aplicativo em 29/09.',
    fechamento: {
      produto: 'Plano Sintético',
      valor: 'R$ 199,90',
      forma_pagamento: 'pix',
      motivo_perda: '',
      valor_total: '199,90',
      forma_pagamento_codigo: 'pix',
      tipo_pagamento_codigo: '',
    },
    cliente: {
      sabemos: ['Usa o serviço desde 20/09.'],
      inferimos: ['Deve renovar no fim do mês.'],
      a_confirmar: ['Se o plano inclui o adicional.'],
    },
    oportunidades: [],
    afirmacoes_a_confirmar: ['Regra de renovação dita pelo vendedor'],
    alertas_de_captura: ['Imagem não capturada'],
    confianca_geral: 'alta',
    proximo_passo_titulo: 'Confirmar o próximo passo com o cliente',
    proximo_passo_complemento: 'Retomar a conversa pelo ponto em aberto.',
    linha_do_tempo: [
      { dia: '23/09', hora: '11:08', texto: 'Cliente pediu informações do plano' },
      { dia: '23/09', hora: '11:20', texto: 'Vendedor enviou os valores' },
    ],
    pendencias: [{ de: 'vendedor', texto: 'Confirmar a condição oferecida' }],
    conducao: { acertos: ['Respondeu rápido'], ajustes: ['Fazer uma pergunta de descoberta'] },
    sistema: {
      kanban_lido: { status: kanbanStatus, stage_entered_at: minutesBefore(600) },
      alertas: [],
      saida_estruturada: true,
    },
    ...overrides,
  }
}

function run(overrides = {}) {
  return {
    run_id: 'run-1',
    cycle_id: CYCLE,
    status: 'succeeded',
    prompt_version: FULL_READING_PROMPT_VERSION,
    reference_time: minutesBefore(10),
    created_at: minutesBefore(10),
    started_at: minutesBefore(10),
    completed_at: minutesBefore(9),
    failure_code: null,
    analysis_markdown: '### Agora\n- Situação: x',
    decision: storedDecision(),
    ...overrides,
  }
}

function kanban(overrides = {}) {
  return {
    status: 'novo',
    stage_entered_at: minutesBefore(600),
    next_action: null,
    next_action_date: null,
    closed_at: null,
    ...overrides,
  }
}

function plan(overrides = {}) {
  return planFullReadingPanel({
    runs: [run()],
    cycleId: CYCLE,
    kanban: kanban(),
    latestObservedAt: minutesBefore(30),
    force: false,
    now: NOW,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Frescor
// ---------------------------------------------------------------------------

test('frescor: sem mudança, reaproveita a rodada (nenhuma rodada nova)', () => {
  const result = plan()

  assert.equal(result.action, 'use')
  assert.equal(result.reading.run_id, 'run-1')
  assert.deepEqual(result.stale_reasons, [])
})

test('frescor: mensagem observada depois do reference_time cria rodada nova', () => {
  const result = plan({ latestObservedAt: minutesBefore(2) })

  assert.equal(result.action, 'start')
  assert.deepEqual(result.stale_reasons, ['mensagem_nova'])
  // A leitura anterior continua disponível para ficar na tela enquanto roda.
  assert.equal(result.reading.run_id, 'run-1')
})

test('frescor: mudança de etapa (status ou stage_entered_at) cria rodada nova', () => {
  assert.deepEqual(
    plan({ kanban: kanban({ status: 'ganho', stage_entered_at: minutesBefore(600) }) }).stale_reasons,
    ['kanban_mudou'],
  )

  assert.deepEqual(
    plan({ kanban: kanban({ stage_entered_at: minutesBefore(1) }) }).stale_reasons,
    ['kanban_mudou'],
  )
})

test('frescor: "Atualizar análise" (force) cria rodada nova, mas não duas seguidas', () => {
  assert.equal(plan({ force: true }).action, 'start')
  assert.deepEqual(plan({ force: true }).stale_reasons, ['forcado'])

  // AGORA e ANÁLISE mandam o force quase juntos: uma rodada criada há
  // menos de 1 minuto já atende.
  const recent = run({ created_at: minutesBefore(0.5), reference_time: minutesBefore(0.5) })

  assert.equal(plan({ runs: [recent], force: true }).action, 'use')
})

test('frescor: rodada de prompt antigo (v1, v2, v3) não serve: a v4 roda sozinha', () => {
  assert.equal(plan({ runs: [run({ prompt_version: 'full-reading-v3' })] }).action, 'start')

  const result = plan({ runs: [run({ prompt_version: 'full-reading-v1' })] })

  assert.equal(result.action, 'start')
  assert.equal(result.reading, null)
  assert.deepEqual(result.stale_reasons, ['sem_leitura'])
})

test('uma por conversa: com rodada na fila ou rodando, nunca cria outra', () => {
  const active = run({ run_id: 'run-2', status: 'running', created_at: minutesBefore(1), started_at: minutesBefore(1), completed_at: null })

  const result =
    plan({ runs: [active, run()], latestObservedAt: minutesBefore(0.1), force: true })

  assert.equal(result.action, 'wait')
  assert.equal(result.active_run.run_id, 'run-2')

  // Rodada viva de OUTRO ciclo da mesma conversa também segura.
  const otherCycle = { ...active, cycle_id: OTHER_CYCLE }

  assert.equal(plan({ runs: [otherCycle, run()], latestObservedAt: minutesBefore(0.1) }).action, 'wait')
})

test('rodada há mais de 5 minutos conta como falha; sem mudança, o polling não repete', () => {
  const stuck = run({
    run_id: 'run-stuck',
    status: 'running',
    reference_time: minutesBefore(7),
    created_at: minutesBefore(7),
    started_at: minutesBefore(7),
    completed_at: null,
  })

  // A leitura boa ainda está fresca: é usada, e a presa é dada como falha.
  const result =
    plan({ runs: [stuck, run({ created_at: minutesBefore(20), reference_time: minutesBefore(20) })], latestObservedAt: minutesBefore(25) })

  assert.deepEqual(result.expired_run_ids, ['run-stuck'])
  assert.equal(result.action, 'use')

  // Leitura boa velha e a presa já tinha visto a mensagem: mostra a falha.
  assert.equal(
    plan({ runs: [stuck, run({ created_at: minutesBefore(20), reference_time: minutesBefore(20) })], latestObservedAt: minutesBefore(8) }).action,
    'show_failure',
  )

  // Sem leitura anterior: a falha aparece e nada é disparado de novo.
  const alone = plan({ runs: [stuck], latestObservedAt: minutesBefore(8) })

  assert.equal(alone.action, 'show_failure')
  assert.equal(alone.failed_run.failure_code, RUN_EXPIRED_FAILURE_CODE)
})

// Rodada 8: vale para falha determinística (A3). Falta de crédito e falha
// passageira também tentam de novo sozinhas depois da espera
// (full-reading-r8.test.mjs).
test('falha determinística: só tenta de novo se algo mudou desde ela ou com force', () => {
  const failed = run({
    run_id: 'run-failed',
    status: 'failed',
    failure_code: 'INVALID_MODEL_OUTPUT',
    created_at: minutesBefore(3),
    reference_time: minutesBefore(3),
    completed_at: minutesBefore(2),
  })

  const runs = [failed, run({ created_at: minutesBefore(20), reference_time: minutesBefore(20) })]

  // A leitura boa ficou velha (mensagem às -10), mas a falha (-3) já viu
  // essa mensagem: polling não dispara outra.
  assert.equal(plan({ runs, latestObservedAt: minutesBefore(10) }).action, 'show_failure')
  // Mensagem nova depois da falha: tenta de novo.
  assert.equal(plan({ runs, latestObservedAt: minutesBefore(1) }).action, 'start')
  // Force (sem rodada no último minuto): tenta de novo.
  assert.equal(plan({ runs, latestObservedAt: minutesBefore(10), force: true }).action, 'start')
})

// ---------------------------------------------------------------------------
// Orquestração com banco em memória
// ---------------------------------------------------------------------------

function createMemoryAdmin(initial = {}) {
  const tables = {
    sales_cycles: [],
    conversation_messages: [],
    companion_full_reading_runs: [],
    ...structuredClone(initial),
  }

  const writes = []
  let tick = 0

  function from(table) {
    const rows = tables[table] ?? (tables[table] = [])
    const filters = []
    let mode = 'select'
    let payload = null
    let orderBy = null
    let limitCount = null
    let single = false

    const execute = () => {
      if (mode === 'insert') {
        tick += 1
        writes.push({ table, mode, payload })
        rows.push({ created_at: new Date(Date.parse(NOW) + tick).toISOString(), ...payload })
        return { error: null }
      }

      const matched = rows.filter((row) => filters.every((filter) => filter(row)))

      if (mode === 'update') {
        writes.push({ table, mode, payload, count: matched.length })
        matched.forEach((row) => Object.assign(row, payload))
        return { error: null }
      }

      let data = [...matched]

      if (orderBy) {
        data.sort((left, right) => {
          const a = String(left[orderBy.column] ?? '')
          const b = String(right[orderBy.column] ?? '')
          return orderBy.ascending ? a.localeCompare(b) : b.localeCompare(a)
        })
      }

      if (limitCount !== null) {
        data = data.slice(0, limitCount)
      }

      return single
        ? { data: data[0] ? structuredClone(data[0]) : null, error: null }
        : { data: structuredClone(data), error: null }
    }

    const builder = {
      select() { return builder },
      insert(values) { mode = 'insert'; payload = values; return builder },
      update(values) { mode = 'update'; payload = values; return builder },
      eq(column, value) { filters.push((row) => row[column] === value); return builder },
      in(column, values) { filters.push((row) => values.includes(row[column])); return builder },
      order(column, options) { orderBy = { column, ascending: options?.ascending !== false }; return builder },
      limit(count) { limitCount = count; return builder },
      maybeSingle() { single = true; return builder },
      then(resolve, reject) {
        Promise.resolve().then(() => resolve(execute()), reject)
      },
    }

    return builder
  }

  return {
    admin: { from },
    tables,
    writes,
  }
}

const SCOPE = {
  company_id: COMPANY,
  cycle_id: CYCLE,
  conversation_key: CONVERSATION,
}

function seed({ runs = [], status = 'novo', messages = [] } = {}) {
  return {
    sales_cycles: [
      {
        id: CYCLE,
        company_id: COMPANY,
        status,
        stage_entered_at: minutesBefore(600),
        next_action: null,
        next_action_date: null,
        lost_at: null,
        canceled_at: null,
        closed_at: null,
      },
    ],
    conversation_messages: messages,
    companion_full_reading_runs: runs.map((entry) => ({
      company_id: COMPANY,
      conversation_key: CONVERSATION,
      ...entry,
    })),
  }
}

function message(overrides = {}) {
  return {
    id: 1,
    company_id: COMPANY,
    cycle_id: CYCLE,
    conversation_key: CONVERSATION,
    direction: 'incoming',
    occurred_at: minutesBefore(40),
    observed_at: minutesBefore(30),
    ...overrides,
  }
}

function resolveWith(memory, overrides = {}) {
  const scheduled = []
  let counter = 0

  return {
    scheduled,
    promise: resolveFullReadingPanel({
      admin: memory.admin,
      scope: SCOPE,
      force: false,
      now: NOW,
      apiKey: 'sk-ant-teste',
      schedule: (task) => scheduled.push(task),
      createRunId: () => `${overrides.idPrefix ?? 'new'}-${++counter}`,
      env: { VERCEL_ENV: 'preview' },
      ...overrides,
    }),
  }
}

test('painel: rodada fresca é reaproveitada, sem escrita nenhuma', async () => {
  const memory = createMemoryAdmin(seed({ runs: [run()], messages: [message()] }))
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.state, 'ready')
  assert.equal(snapshot.reading.run_id, 'run-1')
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])
})

test('painel: mensagem nova cria UMA rodada (trigger permitido pela constraint) e roda depois da resposta', async () => {
  const memory = createMemoryAdmin(seed({ runs: [run()], messages: [message({ observed_at: minutesBefore(1) })] }))
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.state, 'running')
  assert.equal(snapshot.started_run_id, 'new-1')
  assert.equal(scheduled.length, 1)
  // A leitura anterior continua para a tela enquanto a nova roda.
  assert.equal(snapshot.reading.run_id, 'run-1')

  const inserted = memory.writes.filter((write) => write.mode === 'insert')

  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].table, 'companion_full_reading_runs')
  assert.equal(inserted[0].payload.trigger_source, FULL_READING_PANEL_TRIGGER_SOURCE)
  assert.ok(['manual_preview', 'analysis_job'].includes(FULL_READING_PANEL_TRIGGER_SOURCE))
  assert.equal(inserted[0].payload.prompt_version, FULL_READING_PROMPT_VERSION)
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v5')
  assert.equal(inserted[0].payload.status, 'queued')

  // Só companion_full_reading_runs recebe escrita.
  assert.deepEqual(
    [...new Set(memory.writes.map((write) => write.table))],
    ['companion_full_reading_runs'],
  )
})

test('painel: duas requisições simultâneas (AGORA e ANÁLISE) nunca executam duas rodadas', async () => {
  const memory = createMemoryAdmin(seed({ messages: [message()] }))
  const first = resolveWith(memory, { idPrefix: 'a' })
  const second = resolveWith(memory, { idPrefix: 'b' })

  const [left, right] = await Promise.all([first.promise, second.promise])

  assert.equal(first.scheduled.length + second.scheduled.length, 1)
  assert.equal(left.state, 'running')
  assert.equal(right.state, 'running')

  const runs = memory.tables.companion_full_reading_runs
  const live = runs.filter((row) => row.status === 'queued' || row.status === 'running')
  const discarded = runs.filter((row) => row.failure_code === DUPLICATE_RUN_FAILURE_CODE)

  assert.equal(live.length, 1)
  assert.equal(discarded.length, 1)

  // A descartada não conta como "última tentativa falhou".
  const { promise, scheduled } = resolveWith(memory, { idPrefix: 'c' })
  const again = await promise

  assert.equal(again.state, 'running')
  assert.equal(scheduled.length, 0)
})

test('painel: polling com rodada rodando não cria outra', async () => {
  const active = run({ run_id: 'run-live', status: 'running', reference_time: minutesBefore(0.5), created_at: minutesBefore(0.5), started_at: minutesBefore(0.5), completed_at: null, decision: null, analysis_markdown: null })
  const memory = createMemoryAdmin(seed({ runs: [active], messages: [message({ observed_at: minutesBefore(0.2) })] }))

  for (let poll = 0; poll < 3; poll += 1) {
    const { promise, scheduled } = resolveWith(memory)
    const snapshot = await promise

    assert.equal(snapshot.state, 'running')
    assert.equal(scheduled.length, 0)
  }

  assert.deepEqual(memory.writes, [])
})

test('painel: rodada presa há mais de 5 minutos é marcada como falha (RUN_EXPIRED)', async () => {
  const stuck = run({ run_id: 'run-stuck', status: 'running', reference_time: minutesBefore(9), created_at: minutesBefore(9), started_at: minutesBefore(9), completed_at: null, decision: null, analysis_markdown: null })
  const memory = createMemoryAdmin(seed({ runs: [stuck], messages: [message({ observed_at: minutesBefore(20) })] }))
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.failure_code, RUN_EXPIRED_FAILURE_CODE)
  assert.equal(scheduled.length, 0)
  assert.equal(memory.tables.companion_full_reading_runs[0].status, 'failed')
  assert.equal(memory.tables.companion_full_reading_runs[0].failure_code, RUN_EXPIRED_FAILURE_CODE)
})

test('flag: desligada (ou fora de preview) não toca no banco e devolve null', async () => {
  const untouchable = new Proxy({}, {
    get() {
      throw new Error('o painel não pode tocar no banco com a flag desligada')
    },
  })

  for (const env of [
    {},
    { COMPANION_FULL_READING_PANEL: 'off', VERCEL_ENV: 'preview' },
    { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' },
    { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'development' },
    { COMPANION_FULL_READING_PANEL: 'ON', VERCEL_ENV: 'preview' },
  ]) {
    assert.equal(isFullReadingPanelEnabled(env), false, JSON.stringify(env))

    const result =
      await loadFullReadingPanelForRequest({
        admin: untouchable,
        companyId: COMPANY,
        cycleId: CYCLE,
        conversationKey: CONVERSATION,
        force: true,
        referenceTime: NOW,
        schedule: () => {
          throw new Error('nada pode ser agendado')
        },
        createRunId: () => 'x',
        env,
      })

    assert.equal(result, null, JSON.stringify(env))
  }

  assert.equal(isFullReadingPanelEnabled({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }), true)
})

// ---------------------------------------------------------------------------
// View model do AGORA
// ---------------------------------------------------------------------------

function reading(decisionOverrides = {}, kanbanStatus = 'novo') {
  return {
    run_id: 'run-1',
    completed_at: '2026-10-01T14:05:00.000Z',
    analysis_markdown: [
      '### Agora',
      '- Situação: x',
      '### Fase da relação e etapa do método',
      'Cliente ativa. O kanban está **atrasado**.',
      '### Linha do tempo resumida',
      '- 20/09: primeiro contato',
      '- 29/09: pediu acesso',
      '### Pendências abertas',
      'Nenhuma.',
      '### Oportunidades',
      '- Adicional: adiado',
      '### Cliente: o que sabemos e o que inferimos',
      '- Fato: usa o serviço',
      '### Condução do vendedor: acertos, ajustes e afirmações a confirmar',
      '- Acerto: respondeu rápido',
      '### Mensagem sugerida',
      'Não enviar nada agora.',
    ].join('\n'),
    decision: storedDecision(decisionOverrides, kanbanStatus),
  }
}

function agora({ decisionOverrides = {}, kanbanOverrides = {}, state = 'ready', lastCustomerMessageAt = null, failureCode = null } = {}) {
  return buildFullReadingAgoraView({
    state,
    reading: reading(decisionOverrides),
    failureCode,
    kanban: kanban(kanbanOverrides),
    cycleId: CYCLE,
    referenceTime: NOW,
    lastCustomerMessageAt,
  })
}

test('AGORA: ganho sugerido → "Confirmar venda" abrindo o fechamento pré-preenchido, sem card de SLA', () => {
  const view = agora()

  assert.equal(view.kanban_line, 'Etapa no kanban: Novo')
  assert.deepEqual(view.main, {
    situacao: 'Cliente já usa o serviço.',
    acao: 'Não enviar nada agora.',
    por_que: 'Não há pergunta em aberto.',
  })
  assert.equal(view.stage_card.kind, 'confirm_won')
  assert.equal(view.stage_card.button_label, 'Confirmar venda')
  assert.equal(view.stage_card.title, 'Kanban: Novo → a conversa indica Ganho')
  assert.equal(view.stage_card.current_label, 'Novo')
  assert.equal(view.stage_card.suggested_label, 'Ganho')
  assert.equal(view.stage_card.reason, 'Pediu acesso ao aplicativo em 29/09.')
  assert.equal(view.stage_card.apply_request, null)
  assert.equal(
    view.stage_card.cycle_path,
    `/sales-cycles/${CYCLE}?fechar=ganho&produto=Plano+Sint%C3%A9tico&valor=R%24+199%2C90&pagamento=pix&valor_total=199%2C90&pagamento_codigo=pix`,
  )
  assert.equal(view.kanban_late, true)
  assert.equal(view.hide_stage_sla, true)
  assert.equal(view.footer, 'Leitura completa · 01/10, 11:05')
})

test('AGORA: perdido sugerido → "Registrar no Yolen" com o motivo, nunca fecha sozinho', () => {
  const view = agora({
    decisionOverrides: {
      fase_relacao: 'perdido',
      venda_concluida: 'nao',
      etapa_kanban_sugerida: 'perdido',
      fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: 'Fechou com concorrente' },
    },
    kanbanOverrides: { status: 'negociacao' },
  })

  assert.equal(view.stage_card.kind, 'confirm_lost')
  // Rodada 8 (D5): abre o LostDealModal com "Outro" e o motivo.
  assert.equal(view.stage_card.button_label, 'Registrar no Yolen')
  assert.equal(view.stage_card.apply_request, null)
  assert.equal(view.stage_card.cycle_path, `/sales-cycles/${CYCLE}?fechar=perdido&motivo=Fechou+com+concorrente`)
})

test('AGORA: etapa aberta → "Aplicar no kanban" com o corpo exato da rota apply-suggestion', () => {
  const view = agora({
    decisionOverrides: { fase_relacao: 'negociacao', venda_concluida: 'nao', etapa_kanban_sugerida: 'negociacao' },
    kanbanOverrides: {
      status: 'contato',
      next_action: 'Enviar proposta',
      next_action_date: '2026-10-02T13:00:00.000Z',
    },
  })

  assert.equal(view.stage_card.kind, 'apply')
  assert.equal(view.stage_card.button_label, 'Aplicar no kanban')
  assert.equal(view.stage_card.cycle_path, null)
  assert.equal(view.stage_card.apply_request.applied_status, 'negociacao')
  assert.equal(view.stage_card.apply_request.source, 'whatsapp_companion')
  assert.equal(view.stage_card.apply_request.confirmed_by_human, true)
  assert.equal(view.stage_card.apply_request.suggestion.source, 'full_reading')
  assert.equal(view.stage_card.apply_request.suggestion.recommended_status, 'negociacao')
  // Aplicar só muda a etapa: a rota preserva a próxima ação registrada
  // (e a data dela, mesmo vencida) — o corpo nem leva esses campos.
  assert.equal(view.stage_card.apply_request.preserve_next_action, true)
  assert.equal(view.stage_card.apply_request.next_action, null)
  assert.equal(view.stage_card.apply_request.next_action_date, null)

  const past = agora({
    decisionOverrides: { fase_relacao: 'negociacao', venda_concluida: 'nao', etapa_kanban_sugerida: 'negociacao' },
    kanbanOverrides: { status: 'contato', next_action: 'Ligar', next_action_date: minutesBefore(60) },
  })

  assert.equal(past.stage_card.apply_request.preserve_next_action, true)
  assert.equal(past.stage_card.apply_request.next_action_date, null)
})

test('AGORA: mesma etapa → sem card, e o SLA da etapa continua', () => {
  const view = agora({
    decisionOverrides: { fase_relacao: 'descoberta', venda_concluida: 'nao', etapa_kanban_sugerida: 'contato' },
    kanbanOverrides: { status: 'contato' },
  })

  assert.equal(view.stage_card, null)
  assert.equal(view.kanban_late, false)
  assert.equal(view.hide_stage_sla, false)
})

test('AGORA: kanban já em Ganho → nada de retomar, nada de card, sem "estagnada"', () => {
  const view = agora({
    decisionOverrides: {
      acao_agora: 'retomar',
      acao_resumo: 'Retomar a negociação do plano.',
      por_que: 'O cliente sumiu.',
      etapa_kanban_sugerida: 'negociacao',
      venda_concluida: 'confirmada',
    },
    kanbanOverrides: { status: 'ganho' },
  })

  assert.equal(view.kanban_line, 'Etapa no kanban: Ganho')
  assert.equal(view.stage_card, null)
  assert.doesNotMatch(`${view.main.acao} ${view.main.por_que}`, /retom|follow|estagnad/i)
  assert.match(view.main.acao, /Acompanhar o pós-venda/)
  assert.ok(view.locks.includes('ganho_sem_retomada'))
  assert.equal(view.hide_stage_sla, true)

  // follow-up de venda também é bloqueado.
  const followUp = agora({
    decisionOverrides: { acao_agora: 'follow_up', acao_resumo: 'Fazer follow-up da venda.' },
    kanbanOverrides: { status: 'ganho' },
  })

  assert.ok(followUp.locks.includes('ganho_sem_retomada'))
})

test('AGORA: Perdido/Cancelado sem mensagem do cliente depois do encerramento → nenhuma ação', () => {
  const view = agora({
    decisionOverrides: { acao_agora: 'retomar', acao_resumo: 'Retomar o contato.', etapa_kanban_sugerida: 'negociacao', venda_concluida: 'nao', fase_relacao: 'negociacao' },
    kanbanOverrides: { status: 'perdido', closed_at: minutesBefore(1440) },
    lastCustomerMessageAt: minutesBefore(2000),
  })

  assert.equal(view.stage_card, null)
  assert.equal(view.main.acao, 'Nenhuma ação comercial agora.')
  assert.ok(view.locks.includes('encerrado_sem_acao'))

  // O cliente escreveu depois: a leitura vale, e o card só abre o ciclo
  // (a rota de aplicar recusa ciclo fechado).
  const reopened = agora({
    decisionOverrides: { acao_agora: 'responder', acao_resumo: 'Responder o pedido novo.', etapa_kanban_sugerida: 'negociacao', venda_concluida: 'nao', fase_relacao: 'negociacao' },
    kanbanOverrides: { status: 'cancelado', closed_at: minutesBefore(1440) },
    lastCustomerMessageAt: minutesBefore(30),
  })

  assert.equal(reopened.main.acao, 'Responder o pedido novo.')
  assert.equal(reopened.stage_card.kind, 'open_cycle')
  assert.equal(reopened.stage_card.button_label, 'Abrir no Yolen')
  assert.equal(reopened.stage_card.apply_request, null)
  assert.equal(reopened.stage_card.cycle_path, `/sales-cycles/${CYCLE}`)
})

test('AGORA: rodada com alerta de coerência nunca mostra card de etapa', () => {
  const view = agora({
    decisionOverrides: {
      etapa_kanban_sugerida: 'ganho',
      sistema: {
        kanban_lido: { status: 'novo', stage_entered_at: null },
        alertas: [{ campo: 'etapa_kanban_sugerida', valor_do_modelo: 'ganho', valor_aplicado: 'manter_etapa_atual', motivo: 'x' }],
        saida_estruturada: true,
      },
    },
  })

  assert.equal(view.stage_card, null)

  // Segunda trava: decisão incoerente sem alerta gravado também não vira card.
  const incoherent = agora({ decisionOverrides: { venda_concluida: 'nao' } })

  assert.equal(incoherent.stage_card, null)
})

// Rodada 8 (B3, A4): com leitura na tela, a faixa diz "Atualizando a
// leitura…"; em falha, o aviso (sem código) e a última leitura boa embaixo.
test('AGORA: rodando com leitura mostra "Atualizando a leitura…"; falha mostra o aviso sem código e a última leitura boa', () => {
  const running = agora({ state: 'running' })

  assert.equal(running.notice, 'Atualizando a leitura…')
  assert.equal(running.status.running, 'update')
  assert.equal(running.status.refresh.disabled, true)
  assert.ok(running.main)

  const failed = agora({ state: 'failed', failureCode: 'PROVIDER_UNAVAILABLE' })

  assert.ok(failed.main)
  assert.equal(failed.failure_code, 'PROVIDER_UNAVAILABLE')
  assert.doesNotMatch(failed.notice, /PROVIDER_UNAVAILABLE/)
  assert.equal(failed.notice, 'Não consegui ler a conversa agora.')
  assert.equal(failed.status.refresh.label, 'Tentar de novo')

  const runningWithoutReading = buildFullReadingAgoraView({
    state: 'running',
    reading: null,
    failureCode: null,
    kanban: kanban(),
    cycleId: CYCLE,
    referenceTime: NOW,
    lastCustomerMessageAt: null,
  })

  assert.equal(runningWithoutReading.main, null)
  assert.equal(runningWithoutReading.notice, FULL_READING_RUNNING_NOTICE)
  assert.equal(runningWithoutReading.notice, 'Lendo a conversa inteira…')
  assert.equal(runningWithoutReading.status.running, 'first')
  assert.notEqual(runningWithoutReading.view_key, running.view_key)
})

test('AGORA: o card de SLA da etapa (client_sla) sai do payload quando o kanban está atrasado', () => {
  const base = {
    silent: false,
    silent_reason: null,
    primary: { status: 'respond', provenance: { source: null } },
    secondary: [
      { status: 'follow_up', provenance: { source: 'client_sla' } },
      { status: 'respond', provenance: { source: 'customer_waiting' } },
    ],
    reference_time: NOW,
    reasoning: { status: 'ready' },
  }

  const late = attachFullReadingToAgora(base, agora())

  assert.deepEqual(late.secondary.map((signal) => signal.provenance.source), ['customer_waiting'])
  assert.equal(late.primary, base.primary)
  assert.equal(late.reasoning, base.reasoning)
  assert.equal(late.full_reading.stage_card.kind, 'confirm_won')

  const onTime = attachFullReadingToAgora(
    base,
    agora({
      decisionOverrides: { etapa_kanban_sugerida: 'contato', venda_concluida: 'nao', fase_relacao: 'descoberta' },
      kanbanOverrides: { status: 'contato' },
    }),
  )

  assert.equal(onTime.secondary.length, 2)
})

test('AGORA pelo snapshot da orquestração usa o kanban atual do ciclo', () => {
  const view =
    buildAgoraFullReadingView(
      {
        state: 'ready',
        plan_action: 'use',
        stale_reasons: [],
        reading: reading(),
        failure_code: null,
        kanban: kanban({ status: 'respondeu' }),
        last_customer_message_at: null,
        started_run_id: null,
      },
      { cycleId: CYCLE, referenceTime: NOW },
    )

  assert.equal(view.kanban_line, 'Etapa no kanban: Agenda')
  assert.equal(view.stage_card.title, 'Kanban: Agenda → a conversa indica Ganho')
})

// ---------------------------------------------------------------------------
// ANÁLISE
// ---------------------------------------------------------------------------

test('ANÁLISE: blocos de resumo, linha do tempo por dia, pendências, oportunidades e condução vêm dos campos estruturados', () => {
  const view =
    buildFullReadingAnalysisView({
      state: 'ready',
      reading: reading({
        etapa_metodo_atual: 'Etapa do método AVANÇAR: Descoberta incompleta',
        oportunidades: [
          { descricao: 'Plano anual', status: 'sem_resposta' },
          { descricao: 'Indicação de amiga', status: 'aceita' },
        ],
        linha_do_tempo: [
          { dia: '15/09', hora: '11:07', texto: 'Entrou pelo bot e pediu uma demonstração' },
          { dia: '15/09', hora: '11:22', texto: 'Perguntou os planos' },
          { dia: '1/10', hora: '', texto: 'Vendedor mandou os valores' },
        ],
        pendencias: [
          { de: 'vendedor', texto: 'Confirmar se a demonstração aconteceu' },
          { de: 'cliente', texto: 'Ainda não escolheu o plano' },
          { de: 'nenhum', texto: 'Nenhuma pergunta do cliente sem resposta' },
        ],
        conducao: { acertos: ['Respondeu em cerca de 5 minutos'], ajustes: ['Nenhuma pergunta de descoberta'] },
      }),
      failureCode: null,
      kanban: kanban({ status: 'novo' }),
      lastMessageAt: '2026-10-01T12:00:00.000Z',
      now: Date.parse(NOW),
    })

  assert.equal(view.has_reading, true)
  assert.deepEqual(view.summary, [
    { key: 'fase', label: 'Fase', value: 'Cliente ativo' },
    { key: 'metodo', label: 'Método', value: 'Descoberta incompleta' },
    { key: 'kanban', label: 'Kanban', value: 'Novo → Ganho' },
    { key: 'venda', label: 'Venda', value: 'Provável' },
  ])
  // Linha do tempo agrupada por dia, hora à esquerda; a conversa parou há
  // 3 h: última linha "Nenhuma mensagem desde então".
  assert.deepEqual(view.timeline, [
    {
      day: '15/09',
      items: [
        { time: '11:07', text: 'Entrou pelo bot e pediu uma demonstração' },
        { time: '11:22', text: 'Perguntou os planos' },
      ],
    },
    {
      day: '01/10',
      items: [
        { time: '', text: 'Vendedor mandou os valores' },
        { time: 'depois', text: 'Nenhuma mensagem desde então' },
      ],
    },
  ])
  assert.deepEqual(view.pending, [
    { owner: 'vendedor', label: 'Sua', tone: 'attention', text: 'Confirmar se a demonstração aconteceu' },
    { owner: 'cliente', label: 'Do cliente', tone: 'neutral', text: 'Ainda não escolheu o plano' },
    { owner: 'nenhum', label: '', tone: 'ok', text: 'Nenhuma pergunta do cliente sem resposta' },
  ])
  // Status em português, nunca o código.
  assert.deepEqual(view.opportunities, [
    { text: 'Plano anual', status: 'sem_resposta', status_label: 'Sem resposta', tone: 'attention' },
    { text: 'Indicação de amiga', status: 'aceita', status_label: 'Aceita', tone: 'ok' },
  ])
  // v4: ajustes em texto (v5 traz { houve, melhor } em adjustments).
  assert.deepEqual(view.coaching, { acertos: ['Respondeu em cerca de 5 minutos'], ajustes: ['Nenhuma pergunta de descoberta'], adjustments: [] })
  // Com os campos estruturados, o markdown não vira tela.
  assert.deepEqual(view.sections, [])
  assert.deepEqual(view.afirmacoes_a_confirmar, ['Regra de renovação dita pelo vendedor'])
  assert.deepEqual(view.alertas_de_captura, ['Imagem não capturada'])
  assert.equal(view.footer, 'Leitura completa · 01/10, 11:05')

  // Conversa recente: sem "Nenhuma mensagem desde então".
  const recent =
    buildFullReadingAnalysisView({
      state: 'ready',
      reading: reading(),
      failureCode: null,
      kanban: kanban(),
      lastMessageAt: minutesBefore(30),
      now: Date.parse(NOW),
    })

  assert.ok(!JSON.stringify(recent.timeline).includes('Nenhuma mensagem desde então'))

  // Rodada 8 (A4, E5): em falha, o aviso sem código e a última leitura
  // boa embaixo.
  const failed =
    buildFullReadingAnalysisView({ state: 'failed', reading: reading(), failureCode: 'INVALID_MODEL_OUTPUT' })

  assert.equal(failed.has_reading, true)
  assert.deepEqual(failed.sections, [])
  assert.deepEqual(failed.summary.map((block) => block.label), ['Fase', 'Método', 'Kanban', 'Venda'])
  assert.doesNotMatch(failed.notice, /INVALID_MODEL_OUTPUT/)
  assert.equal(failed.notice, 'Não consegui ler a conversa agora.')
  assert.equal(failed.status.failure.detail, null)

  const attached = attachFullReadingToAnalysis({ coaching_diagnosis: { id: 'x' } }, view)

  // MENSAGEM continua lendo o mesmo coaching_diagnosis.
  assert.deepEqual(attached.coaching_diagnosis, { id: 'x' })
})

test('ANÁLISE plano B: rodada sem os campos estruturados mostra o markdown, sem Agora, Mensagem sugerida e Cliente', () => {
  const legacy =
    reading()

  for (const key of ['proximo_passo_titulo', 'proximo_passo_complemento', 'linha_do_tempo', 'pendencias', 'conducao']) {
    delete legacy.decision[key]
  }

  const view =
    buildFullReadingAnalysisView({ state: 'ready', reading: legacy, failureCode: null, kanban: kanban() })

  assert.equal(view.has_reading, true)
  assert.deepEqual(
    view.sections.map((section) => section.title),
    [
      'Fase da relação',
      'Linha do tempo',
      'Pendências',
      'Oportunidades',
      'Condução do vendedor',
    ],
  )
  // Markdown inline sai: o texto vai para textContent.
  assert.deepEqual(view.sections[0].blocks, [{ type: 'paragraph', items: ['Cliente ativa. O kanban está atrasado.'] }])
  assert.deepEqual(view.sections[1].blocks, [{ type: 'list', items: ['20/09: primeiro contato', '29/09: pediu acesso'] }])
  assert.deepEqual(view.timeline, [])
  assert.deepEqual(view.pending, [])
  // Os blocos de resumo vêm da decisão, que existe nas duas versões.
  assert.equal(view.summary.length, 4)
})

test('ANÁLISE: fora do formato, mostra o texto inteiro numa seção', () => {
  const sections = parseFullReadingAnalysisSections('Texto livre sem seções.\n\n- item')

  assert.equal(sections.length, 1)
  assert.equal(sections[0].title, 'Análise')
  assert.deepEqual(sections[0].blocks, [
    { type: 'paragraph', items: ['Texto livre sem seções.'] },
    { type: 'list', items: ['item'] },
  ])
})

test('travas valem também para o AGORA de hoje (fallback): Ganho sem retomada, encerrado sem ação', () => {
  const base = {
    silent: false,
    silent_reason: null,
    primary: { status: 'follow_up', headline: 'Retomar o contato.', action: 'Retomar.', provenance: { source: null } },
    secondary: [
      { status: 'respond', headline: 'Responder dúvida de uso.', action: 'Responder.', provenance: { source: 'customer_waiting' } },
      { status: 'follow_up', headline: 'Oportunidade estagnada na etapa acima do limite de SLA.', action: 'x', provenance: { source: 'client_sla' } },
    ],
    reference_time: NOW,
    reasoning: { status: 'ready' },
  }

  const failedWon = agora({ state: 'failed', failureCode: 'X', kanbanOverrides: { status: 'ganho' } })

  assert.equal(failedWon.legacy_lock, 'ganho')

  const won = attachFullReadingToAgora(base, failedWon)

  assert.equal(won.primary, null)
  assert.deepEqual(won.secondary.map((signal) => signal.provenance.source), ['customer_waiting'])
  assert.equal(won.silent, false)

  const failedLost = agora({ state: 'failed', failureCode: 'X', kanbanOverrides: { status: 'perdido', closed_at: minutesBefore(600) } })
  const lost = attachFullReadingToAgora(base, failedLost)

  assert.equal(failedLost.legacy_lock, 'encerrado')
  assert.equal(lost.primary, null)
  assert.deepEqual(lost.secondary, [])
  assert.equal(lost.silent, true)
  assert.equal(lost.silent_reason, 'nothing_to_do')

  // Cliente escreveu depois do encerramento: o AGORA de hoje fica.
  const reopened = agora({ state: 'failed', failureCode: 'X', kanbanOverrides: { status: 'perdido', closed_at: minutesBefore(600) }, lastCustomerMessageAt: minutesBefore(5) })

  assert.equal(reopened.legacy_lock, null)
  assert.equal(attachFullReadingToAgora(base, reopened).primary, base.primary)
})

// ---------------------------------------------------------------------------
// Rodada 5: a leitura só chama o Claude quando o painel vai mostrá-la
// ---------------------------------------------------------------------------

test('ciclo fechado (Ganho/Perdido/Cancelado): nenhuma rodada nova, nem com mudança de etapa ou force', () => {
  for (const status of ['ganho', 'perdido', 'cancelado']) {
    const changed = plan({ kanban: kanban({ status, stage_entered_at: minutesBefore(1) }) })

    assert.equal(changed.action, 'skip', status)
    assert.equal(changed.skip_reason, 'CLOSED_CYCLE', status)

    const forced = plan({ kanban: kanban({ status }), force: true })

    assert.equal(forced.action, 'skip', status)
    assert.equal(forced.skip_reason, 'CLOSED_CYCLE', status)

    const newMessage = plan({ kanban: kanban({ status }), latestObservedAt: minutesBefore(1) })

    assert.equal(newMessage.action, 'skip', status)
  }

  // Leitura fresca de antes continua servindo (sem chamada nova).
  assert.equal(
    plan({ runs: [run({}, 'ganho')], kanban: kanban({ status: 'ganho' }) }).action === 'start',
    false,
  )
})

test('conversa sem mensagem no ledger: nenhuma rodada (EMPTY_CONVERSATION), nem com force', () => {
  const empty = plan({ runs: [], latestObservedAt: null })

  assert.equal(empty.action, 'skip')
  assert.equal(empty.skip_reason, 'EMPTY_CONVERSATION')
  assert.equal(plan({ runs: [], latestObservedAt: null, force: true }).action, 'skip')
})

test('painel: ciclo Ganho com mensagens nunca agenda o Claude nem grava rodada', async () => {
  const memory = createMemoryAdmin(seed({ status: 'ganho', messages: [message({ observed_at: minutesBefore(1) })] }))
  const { promise, scheduled } = resolveWith(memory, { force: true })
  const snapshot = await promise

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.failure_code, 'CLOSED_CYCLE')
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])

  assert.equal(
    buildAgoraFullReadingView(snapshot, { cycleId: CYCLE }).notice,
    'Oportunidade encerrada: a leitura completa não roda para ciclo fechado.',
  )
})

test('painel: conversa vazia nunca agenda o Claude nem grava rodada; aviso de mensagens que não chegaram', async () => {
  const memory = createMemoryAdmin(seed({ messages: [] }))
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.failure_code, 'EMPTY_CONVERSATION')
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])

  const view = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(view.failure_code, 'EMPTY_CONVERSATION')
  assert.equal(view.notice, 'As mensagens desta conversa ainda não chegaram à Yolen.')
  assert.equal(
    buildFullReadingAnalysisView({ state: 'failed', reading: null, failureCode: 'EMPTY_CONVERSATION' }).notice,
    'As mensagens desta conversa ainda não chegaram à Yolen.',
  )
})

// ---------------------------------------------------------------------------
// Rodada 6: oportunidade nova (ciclo sucessor) lê o histórico da origem
// ---------------------------------------------------------------------------

const ORIGIN_CYCLE = '20000000-0000-4000-8000-0000000000aa'

function successorSeed({ runs = [] } = {}) {
  const base = seed({ runs, messages: [] })

  base.sales_cycles[0].origin_cycle_id = ORIGIN_CYCLE
  base.sales_cycles[0].created_at = minutesBefore(60)
  base.sales_cycles[0].opportunity_type = 'renovacao'
  base.sales_cycles.push({
    id: ORIGIN_CYCLE,
    company_id: COMPANY,
    status: 'ganho',
    origin_cycle_id: null,
    created_at: minutesBefore(60 * 24 * 30),
    opportunity_type: null,
  })
  // As mensagens ficaram gravadas no ciclo de origem.
  base.conversation_messages = [
    message({ id: 1, cycle_id: ORIGIN_CYCLE, occurred_at: minutesBefore(600), observed_at: minutesBefore(590) }),
    message({ id: 2, cycle_id: ORIGIN_CYCLE, direction: 'outgoing', occurred_at: minutesBefore(300), observed_at: minutesBefore(290) }),
  ]

  return base
}

test('oportunidade nova sem mensagem própria: o histórico da origem conta; a primeira abertura roda a leitura e não diz "não chegaram"', async () => {
  const memory = createMemoryAdmin(successorSeed())
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.state, 'running')
  assert.notEqual(snapshot.failure_code, 'EMPTY_CONVERSATION')
  assert.equal(snapshot.successor, true)
  assert.equal(snapshot.last_message_at, minutesBefore(300))
  assert.equal(scheduled.length, 1)

  const view = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(view.notice, FULL_READING_RUNNING_NOTICE)
  assert.doesNotMatch(String(view.notice), /não chegaram/)

  // Só a tabela de rodadas recebe escrita.
  assert.deepEqual([...new Set(memory.writes.map((write) => write.table))], ['companion_full_reading_runs'])
})

test('oportunidade nova: a leitura do ciclo de origem não serve para o ciclo novo', async () => {
  const originRun = run({ run_id: 'run-origin', cycle_id: ORIGIN_CYCLE })
  const memory = createMemoryAdmin(successorSeed({ runs: [originRun] }))
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.state, 'running')
  assert.equal(scheduled.length, 1)
  assert.equal(snapshot.reading, null)
})

test('ciclo sem origem e sem mensagem continua EMPTY_CONVERSATION (a cadeia não inventa histórico)', async () => {
  const memory = createMemoryAdmin(seed({ messages: [message({ cycle_id: OTHER_CYCLE })] }))
  const { promise, scheduled } = resolveWith(memory)
  const snapshot = await promise

  assert.equal(snapshot.failure_code, 'EMPTY_CONVERSATION')
  assert.equal(snapshot.successor, false)
  assert.equal(scheduled.length, 0)
})

// ---------------------------------------------------------------------------
// Rodada 6: AGORA decide primeiro, nada repetido, nenhum código cru
// ---------------------------------------------------------------------------

function agoraAt({ decisionOverrides = {}, kanbanOverrides = {}, markdown = null, lastMessageAt = minutesBefore(60 * 26) } = {}) {
  const base = reading(decisionOverrides)

  return buildFullReadingAgoraView({
    state: 'ready',
    reading: markdown ? { ...base, analysis_markdown: markdown } : base,
    failureCode: null,
    kanban: kanban(kanbanOverrides),
    cycleId: CYCLE,
    lastCustomerMessageAt: null,
    lastMessageAt,
    now: Date.parse(NOW),
  })
}

const SEND_MARKDOWN = [
  '### Agora',
  '- Situação: x',
  '### Mensagem sugerida',
  'Oi! Conseguiu ver a demonstração ontem? O que achou?',
].join('\n')

test('AGORA: próximo passo com título curto, complemento, vez em português e o porquê; "Ver mensagem pronta" quando há mensagem', () => {
  const view = agoraAt({
    markdown: SEND_MARKDOWN,
    decisionOverrides: {
      acao_agora: 'responder',
      vez_de: 'vendedor',
      acao_resumo: 'Perguntar como foi a demonstração.',
      proximo_passo_titulo: 'Perguntar como foi a demonstração',
      proximo_passo_complemento: 'Se não aconteceu, oferecer outro horário.',
      por_que: 'A demonstração era 15/09 às 10h e não houve resposta depois.',
      etapa_kanban_sugerida: 'novo',
    },
  })

  assert.deepEqual(view.next_step, {
    turn: 'vendedor',
    turn_label: 'Vez do vendedor',
    title: 'Perguntar como foi a demonstração',
    complement: 'Se não aconteceu, oferecer outro horário.',
    why: 'A demonstração era 15/09 às 10h e não houve resposta depois.',
    send: true,
    no_send_reason: null,
  })
  // Mesma etapa: sem card de etapa.
  assert.equal(view.stage_card, null)
  // "Para:" fica só na MENSAGEM.
  assert.equal(view.message.objective, 'Perguntar como foi a demonstração.')
})

test('AGORA: leitura "não enviar" → "Nada a enviar agora" com o motivo, sem botão de mensagem', () => {
  const view = agoraAt()

  assert.equal(view.next_step.send, false)
  assert.equal(view.next_step.turn_label, 'Vez do cliente')
  assert.equal(view.next_step.no_send_reason, 'Não há pergunta em aberto.')
  assert.equal(view.message.mode, 'no_send')
})

test('AGORA: trava do kanban (Ganho) manda no título; o complemento do modelo não aparece', () => {
  const view = agoraAt({
    decisionOverrides: { acao_agora: 'retomar', acao_resumo: 'Retomar a negociação.', proximo_passo_titulo: 'Retomar a negociação', venda_concluida: 'confirmada', etapa_kanban_sugerida: 'ganho' },
    kanbanOverrides: { status: 'ganho' },
  })

  assert.equal(view.next_step.title, 'Acompanhar o pós-venda. A negociação do que já foi vendido está encerrada.')
  assert.equal(view.next_step.complement, '')
  assert.equal(view.next_step.send, false)
})

test('AGORA: grade 2×2 em português (aguardando, venda, último contato, confiança)', () => {
  const view = agoraAt({ decisionOverrides: { pendencia_do_vendedor: true, venda_concluida: 'nao', confianca_geral: 'media' } })

  assert.deepEqual(view.facts, [
    { key: 'aguardando', label: 'Cliente aguardando', value: 'Sim' },
    { key: 'venda', label: 'Venda', value: 'Ainda não' },
    { key: 'ultimo_contato', label: 'Último contato', value: 'há 1 dia' },
    { key: 'confianca', label: 'Confiança da leitura', value: 'Média' },
  ])

  assert.equal(formatSince(minutesBefore(20), Date.parse(NOW)), 'há menos de 1 h')
  assert.equal(formatSince(minutesBefore(185), Date.parse(NOW)), 'há 3 h')
  assert.equal(formatSince(minutesBefore(60 * 72), Date.parse(NOW)), 'há 3 dias')
  assert.equal(formatSince(null, Date.parse(NOW)), null)
  assert.equal(agoraAt({ lastMessageAt: null }).facts[2].value, '—')
})

test('AGORA: "Antes de enviar" só com afirmação que muda a mensagem (preço, plano, condição), no máximo 2, e só quando há mensagem', () => {
  const claims = [
    'O Plano Anual Plus (12x R$ 99,00) não está no catálogo.',
    'O vendedor disse que a demonstração é às 10h.',
    'Condição de adesão grátis citada pelo vendedor.',
    'Desconto de 10% para pagamento à vista.',
  ]

  const send = agoraAt({
    markdown: SEND_MARKDOWN,
    decisionOverrides: { acao_agora: 'responder', afirmacoes_a_confirmar: claims },
  })

  assert.deepEqual(send.before_send, [
    'O Plano Anual Plus (12x R$ 99,00) não está no catálogo.',
    'Condição de adesão grátis citada pelo vendedor.',
  ])

  // Sem mensagem para enviar, não há "antes de enviar".
  assert.deepEqual(agoraAt({ decisionOverrides: { afirmacoes_a_confirmar: claims } }).before_send, [])
  // Nada que afete a mensagem: card some.
  assert.deepEqual(
    agoraAt({ markdown: SEND_MARKDOWN, decisionOverrides: { acao_agora: 'responder', afirmacoes_a_confirmar: ['O vendedor disse que a demonstração é às 10h.'] } }).before_send,
    [],
  )
})

test('AGORA: o card "Resumo da leitura completa" saiu; o texto do card de etapa sai sem código', () => {
  const view = agoraAt({
    decisionOverrides: {
      etapa_kanban_sugerida: 'respondeu',
      fase_relacao: 'descoberta',
      venda_concluida: 'nao',
      motivo_etapa: 'Ele respondeu e marcou a demonstração (15/09): mudar para AGENDA (respondeu).',
    },
    kanbanOverrides: { status: 'novo' },
  })

  assert.equal('lead_summary' in view, false)
  assert.equal(view.stage_card.kind, 'apply')
  assert.equal(view.stage_card.current_label, 'Novo')
  assert.equal(view.stage_card.suggested_label, 'Agenda')
  assert.equal(view.stage_card.reason, 'Ele respondeu e marcou a demonstração (15/09): mudar para Agenda.')
  assert.equal(view.stage_card.button_label, 'Aplicar no kanban')
  assert.doesNotMatch(JSON.stringify(view), /sem_resposta|nao_intervir|\(respondeu\)|nome interno/)
})

test('textos do modelo para a tela: sem nome interno nem código, sem mexer no português', () => {
  assert.equal(humanizePanelText('Mudar para AGENDA (respondeu) hoje'), 'Mudar para Agenda hoje')
  assert.equal(humanizePanelText('Agenda (nome interno: respondeu)'), 'Agenda')
  assert.equal(humanizePanelText('Oferta ficou sem_resposta'), 'Oferta ficou sem resposta')
  assert.equal(humanizePanelText('Kanban em respondeu'), 'Kanban em Agenda')
  assert.equal(humanizePanelText('O cliente respondeu ontem'), 'O cliente respondeu ontem')
  assert.equal(humanizePanelText('Vou negociar o valor'), 'Vou negociar o valor')
  assert.equal(methodStageLabel('Etapa do método AVANÇAR: Descoberta incompleta'), 'Descoberta incompleta')
  assert.equal(methodStageLabel('Pós-venda'), 'Pós-venda')
})

test('CLIENTE: o que ele disse com a data à direita; data no meio da frase fica no texto', () => {
  const view = agoraAt({
    decisionOverrides: {
      cliente: {
        sabemos: ['Pediu uma demonstração pelo bot (15/09)', 'Quer começar ainda este mês — 15/09', 'Usa o app desde 20/09'],
        inferimos: ['Interesse alto: pediu horário para a mesma semana.'],
        a_confirmar: ['Se a demonstração aconteceu'],
      },
    },
  })

  assert.deepEqual(view.client, {
    said: [
      { text: 'Pediu uma demonstração pelo bot', date: '15/09' },
      { text: 'Quer começar ainda este mês', date: '15/09' },
      { text: 'Usa o app desde 20/09', date: null },
    ],
    seems: ['Interesse alto: pediu horário para a mesma semana.'],
    missing: ['Se a demonstração aconteceu'],
  })
})
