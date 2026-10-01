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

test('frescor: rodada de prompt antigo (v1, v2) não serve: a v3 roda sozinha', () => {
  assert.equal(plan({ runs: [run({ prompt_version: 'full-reading-v2' })] }).action, 'start')

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

test('falha: só tenta de novo se algo mudou desde ela ou com force', () => {
  const failed = run({
    run_id: 'run-failed',
    status: 'failed',
    failure_code: 'PROVIDER_UNAVAILABLE',
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
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v3')
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

  assert.equal(view.kanban_line, 'Etapa no kanban: NOVO')
  assert.deepEqual(view.main, {
    situacao: 'Cliente já usa o serviço.',
    acao: 'Não enviar nada agora.',
    por_que: 'Não há pergunta em aberto.',
  })
  assert.equal(view.stage_card.kind, 'confirm_won')
  assert.equal(view.stage_card.button_label, 'Confirmar venda')
  assert.equal(view.stage_card.title, 'Kanban: NOVO → a conversa indica GANHO')
  assert.equal(view.stage_card.reason, 'Pediu acesso ao aplicativo em 29/09.')
  assert.equal(view.stage_card.apply_request, null)
  assert.equal(
    view.stage_card.cycle_path,
    `/sales-cycles/${CYCLE}?fechar=ganho&produto=Plano+Sint%C3%A9tico&valor=R%24+199%2C90&pagamento=pix&valor_total=199%2C90&pagamento_codigo=pix`,
  )
  assert.equal(view.kanban_late, true)
  assert.equal(view.hide_stage_sla, true)
  assert.equal(view.footer, 'Leitura completa · Claude · 01/10/2026 11:05')
})

test('AGORA: perdido sugerido → "Confirmar perda" com o motivo, nunca fecha sozinho', () => {
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
  assert.equal(view.stage_card.button_label, 'Confirmar perda')
  assert.equal(view.stage_card.apply_request, null)
  assert.equal(view.stage_card.cycle_path, `/sales-cycles/${CYCLE}?fechar=perdido&motivo=Fechou+com+concorrente`)
})

test('AGORA: etapa aberta → "Aplicar" com o corpo exato da rota apply-suggestion', () => {
  const view = agora({
    decisionOverrides: { fase_relacao: 'negociacao', venda_concluida: 'nao', etapa_kanban_sugerida: 'negociacao' },
    kanbanOverrides: {
      status: 'contato',
      next_action: 'Enviar proposta',
      next_action_date: '2026-10-02T13:00:00.000Z',
    },
  })

  assert.equal(view.stage_card.kind, 'apply')
  assert.equal(view.stage_card.button_label, 'Aplicar')
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

  assert.equal(view.kanban_line, 'Etapa no kanban: GANHO')
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

test('AGORA: rodando mostra "Lendo a conversa inteira…"; falha volta ao AGORA de hoje com o código', () => {
  const running = agora({ state: 'running' })

  assert.equal(running.notice, FULL_READING_RUNNING_NOTICE)
  assert.equal(running.notice, 'Lendo a conversa inteira…')
  assert.ok(running.main)

  const failed = agora({ state: 'failed', failureCode: 'PROVIDER_UNAVAILABLE' })

  assert.equal(failed.main, null)
  assert.equal(failed.stage_card, null)
  assert.equal(failed.failure_code, 'PROVIDER_UNAVAILABLE')
  assert.match(failed.notice, /\(PROVIDER_UNAVAILABLE\)/)

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
  assert.equal(runningWithoutReading.notice, 'Lendo a conversa inteira…')
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

  assert.equal(view.kanban_line, 'Etapa no kanban: AGENDA')
  assert.equal(view.stage_card.title, 'Kanban: AGENDA → a conversa indica GANHO')
})

// ---------------------------------------------------------------------------
// ANÁLISE
// ---------------------------------------------------------------------------

test('ANÁLISE: seções da análise, afirmações a confirmar e alertas de captura à parte', () => {
  const view =
    buildFullReadingAnalysisView({ state: 'ready', reading: reading(), failureCode: null })

  assert.deepEqual(
    view.sections.map((section) => section.title),
    [
      'Fase da relação',
      'Linha do tempo',
      'Pendências',
      'Oportunidades',
      'Cliente: fatos e inferências',
      'Condução do vendedor',
      'Mensagem sugerida',
    ],
  )
  // A seção Agora fica só no AGORA.
  assert.ok(!view.sections.some((section) => section.title === 'Agora'))
  // Markdown inline sai: o texto vai para textContent.
  assert.deepEqual(view.sections[0].blocks, [{ type: 'paragraph', items: ['Cliente ativa. O kanban está atrasado.'] }])
  assert.deepEqual(view.sections[1].blocks, [{ type: 'list', items: ['20/09: primeiro contato', '29/09: pediu acesso'] }])
  assert.deepEqual(view.afirmacoes_a_confirmar, ['Regra de renovação dita pelo vendedor'])
  assert.deepEqual(view.alertas_de_captura, ['Imagem não capturada'])
  assert.equal(view.footer, 'Leitura completa · Claude · 01/10/2026 11:05')

  const failed =
    buildFullReadingAnalysisView({ state: 'failed', reading: reading(), failureCode: 'INVALID_MODEL_OUTPUT' })

  assert.deepEqual(failed.sections, [])
  assert.match(failed.notice, /INVALID_MODEL_OUTPUT/)

  const attached = attachFullReadingToAnalysis({ coaching_diagnosis: { id: 'x' } }, view)

  // MENSAGEM continua lendo o mesmo coaching_diagnosis.
  assert.deepEqual(attached.coaching_diagnosis, { id: 'x' })
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
