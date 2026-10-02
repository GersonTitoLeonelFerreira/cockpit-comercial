// Rodada 9 (HML), Fase 3: ciclo fechado lido como atendimento e leitura
// que espera a transcrição de áudio. Fixtures sintéticas.
//
// - Ciclo em ganho, perdido ou cancelado: sem mensagem real do cliente
//   depois do encerramento, nada roda (como antes); com ela, a leitura roda
//   em modo atendimento, só mensagens posteriores deixam a leitura velha e
//   a etapa sugerida é sempre a atual.
// - Áudio sendo transcrito na extensão: nenhuma leitura nova começa (nem
//   pelo "Atualizar"); a faixa diz "Transcrevendo áudio 1 de 2…". Áudio
//   que ganhou transcrição deixa a leitura velha (uma leitura, já com o
//   texto).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FULL_READING_PROMPT_VERSION,
} from './full-reading/prompt.ts'

import {
  CLOSED_CYCLE_SKIP_CODE,
  buildAgoraFullReadingView,
  normalizeAudioHold,
  planFullReadingPanel,
  resolveFullReadingPanel,
  summarizeLedgerActivity,
} from '../server/full-reading-panel.ts'

import {
  buildFullReadingAgoraView,
} from '../server/full-reading-panel-view.ts'

import {
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

const NOW = '2026-10-02T21:00:00.000Z'
const CYCLE = '93000000-0000-4000-8000-0000000000c1'
const COMPANY = '93000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000011'

const minutesBefore = (minutes) =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString()

function decision(overrides = {}) {
  return {
    fase_relacao: 'cliente_ativo',
    etapa_metodo_atual: '',
    venda_concluida: 'confirmada',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'Cliente já comprou e pediu ajuda com o acesso.',
    cliente: { sabemos: [], inferimos: [], a_confirmar: [] },
    pendencias: [{ de: 'vendedor', texto: 'Ajudar com o acesso' }],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: 'Precisa de ajuda.', passos: [], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Ajudar com o acesso.',
    por_que: 'O cliente pediu ajuda.',
    proximo_passo_titulo: 'Ajudar com o acesso',
    proximo_passo_complemento: '',
    mensagem_sugerida: 'Oi! Vou te ajudar com o acesso agora.',
    mensagem_observacao: '',
    conducao: { acertos: [], ajustes: [] },
    para_o_gestor: [],
    etapa_kanban_sugerida: 'ganho',
    motivo_etapa: 'Venda registrada.',
    fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '', valor_total: '', forma_pagamento_codigo: '', tipo_pagamento_codigo: '' },
    oportunidades: [],
    afirmacoes_a_confirmar: [],
    alertas_de_captura: [],
    linha_do_tempo: [],
    confianca_geral: 'alta',
    revisar_em: '',
    revisar_motivo: '',
    precisa_ler_inteira: false,
    precisa_ler_inteira_motivo: '',
    ...overrides,
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
    decision: { ...decision(), sistema: { kanban_lido: { status: 'negociacao', stage_entered_at: null }, alertas: [], saida_estruturada: false, modo: 'completa', cadeia: [CYCLE] } },
    ...overrides,
  }
}

const WON = { status: 'ganho', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: minutesBefore(600) }
const OPEN = { status: 'negociacao', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null }

function plan(overrides = {}) {
  return planFullReadingPanel({
    runs: [],
    cycleId: CYCLE,
    kanban: WON,
    latestObservedAt: minutesBefore(40),
    latestCustomerObservedAt: minutesBefore(40),
    latestCustomerOccurredAt: minutesBefore(40),
    force: false,
    now: NOW,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// J. Ciclo fechado lido como atendimento
// ---------------------------------------------------------------------------

test('J1: ciclo fechado sem mensagem do cliente depois do encerramento não roda (como hoje)', () => {
  for (const kanban of [WON, { ...WON, status: 'perdido' }, { ...WON, status: 'cancelado' }]) {
    const result = plan({ kanban, latestCustomerOccurredAt: minutesBefore(700), latestCustomerObservedAt: minutesBefore(700), latestObservedAt: minutesBefore(700) })

    assert.equal(result.action, 'skip', kanban.status)
    assert.equal(result.skip_reason, CLOSED_CYCLE_SKIP_CODE)
  }

  // Leitura antiga, ciclo fechado depois dela e nenhuma mensagem do
  // cliente depois do encerramento: continua como hoje.
  const stale = plan({ runs: [run({ reference_time: minutesBefore(900), created_at: minutesBefore(900) })], latestCustomerOccurredAt: minutesBefore(950), latestCustomerObservedAt: minutesBefore(950) })

  assert.equal(stale.action, 'skip')
})

test('J1: com mensagem real do cliente depois do encerramento, a leitura roda em modo atendimento', () => {
  const first = plan({ latestCustomerOccurredAt: minutesBefore(5), latestCustomerObservedAt: minutesBefore(5), latestObservedAt: minutesBefore(5) })

  assert.equal(first.action, 'start')
  assert.equal(first.closed_service, 'ganho')

  // Com uma leitura feita antes do fechamento: só a mensagem posterior
  // deixa velha (a mudança de etapa sozinha não).
  const reading = run({ reference_time: minutesBefore(30), created_at: minutesBefore(30) })

  assert.equal(
    plan({ runs: [reading], latestCustomerOccurredAt: minutesBefore(60), latestCustomerObservedAt: minutesBefore(60) }).action,
    'use',
    'a etapa mudou para Ganho, mas nenhuma mensagem nova do cliente depois da leitura',
  )

  const fresh = plan({ runs: [reading], latestCustomerOccurredAt: minutesBefore(2), latestCustomerObservedAt: secondsBefore(30), latestObservedAt: secondsBefore(30) })

  assert.equal(fresh.action, 'start')
  assert.deepEqual(fresh.stale_reasons, ['mensagem_nova'])

  // As regras de economia valem: rajada de 20 s.
  assert.equal(plan({ runs: [reading], latestCustomerOccurredAt: minutesBefore(1), latestCustomerObservedAt: secondsBefore(5), latestObservedAt: secondsBefore(5) }).action, 'use')
})

function secondsBefore(seconds) {
  return new Date(Date.parse(NOW) - seconds * 1000).toISOString()
}

test('J1/F6: a leitura de atendimento grava a etapa atual (trava) e marca o ciclo encerrado', async () => {
  const updates = []
  const bodies = []
  const admin = {
    from() {
      return {
        update(values) {
          updates.push(values)
          const chain = { eq() { return chain }, then(resolve) { resolve({ error: null }) } }
          return chain
        },
      }
    },
  }

  await executeFullReadingRun({
    admin,
    runId: 'run-closed',
    companyId: COMPANY,
    cycleId: CYCLE,
    conversationKey: CONVERSATION,
    referenceTime: NOW,
    model: 'claude-sonnet-5-5',
    effort: 'high',
    apiKey: 'sk-ant-teste',
    logger: () => {},
    loadMessages: async () => [{ id: '1', message_key: 'k1', direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(5), observed_at: minutesBefore(5), content_type: 'text', text_content: 'Não consigo acessar', audio_transcription: null, is_deleted: false, deletion_reason: null }],
    loadChain: async () => [CYCLE],
    loadConfig: async () => ({ bundle: null, products: [] }),
    loadKanban: async () => ({ status: 'ganho', label: 'Ganho', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, won: { won_at: minutesBefore(600), won_total: null, product_name: null, payment_method: null, payment_type: null, installments_count: null }, lost: null, paused: null, canceled: null }),
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text: JSON.stringify({ decisao: decision({ etapa_kanban_sugerida: 'negociacao' }) }) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })
    },
  })

  const final = updates[updates.length - 1]

  assert.equal(final.status, 'succeeded')
  assert.equal(final.decision.etapa_kanban_sugerida, 'ganho')
  assert.equal(final.decision.sistema.ciclo_encerrado, 'ganho')
  assert.match(bodies[0].system[0].text, /## Ciclo encerrado/)
})

test('J2: faixa "Oportunidade encerrada (Ganho) · leitura de atendimento"', () => {
  for (const [status, label] of [['ganho', 'Ganho'], ['perdido', 'Perdido'], ['cancelado', 'Cancelado']]) {
    const view =
      buildFullReadingAgoraView({
        state: 'ready',
        reading: { run_id: 'run-a', completed_at: minutesBefore(29), analysis_markdown: null, decision: run().decision },
        failureCode: null,
        kanban: { ...WON, status },
        cycleId: CYCLE,
        lastCustomerMessageAt: minutesBefore(5),
        now: Date.parse(NOW),
        panel: { closed_service: status },
      })

    assert.equal(view.notice, `Oportunidade encerrada (${label}) · leitura de atendimento`)
    assert.equal(view.status.band.kind, 'closed_service')
  }
})

test('J (ponta a ponta): ciclo ganho com mensagem do cliente depois do fechamento inicia a leitura', async () => {
  const memory = memoryAdmin({
    sales_cycles: [{ id: CYCLE, company_id: COMPANY, status: 'ganho', won_at: minutesBefore(600), stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, lost_at: null, canceled_at: null, closed_at: null }],
    conversation_messages: [
      { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(900), observed_at: minutesBefore(900), content_type: 'text', text_content: 'Quero fechar' },
      { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(3), observed_at: minutesBefore(3), content_type: 'text', text_content: 'Não consigo acessar' },
    ],
    companion_full_reading_runs: [],
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

  assert.equal(snapshot.state, 'running')
  assert.equal(snapshot.closed_service, 'ganho')
  assert.equal(scheduled.length, 1)
})

// ---------------------------------------------------------------------------
// I3. A leitura espera a transcrição
// ---------------------------------------------------------------------------

test('I3: com áudio sendo transcrito nenhuma leitura nova começa (nem pelo "Atualizar"); a faixa diz "Transcrevendo áudio 1 de 2…"', async () => {
  const hold = { current: 1, total: 2 }

  assert.equal(plan({ kanban: OPEN, latestCustomerObservedAt: minutesBefore(1), latestObservedAt: minutesBefore(1), audioHold: hold }).action, 'hold')
  assert.equal(plan({ kanban: OPEN, force: true, audioHold: hold }).action, 'hold')
  assert.equal(plan({ kanban: OPEN, latestCustomerObservedAt: minutesBefore(1), latestObservedAt: minutesBefore(1) }).action, 'start')

  // Rodada viva: continua esperando a rodada (não é a transcrição).
  const live = run({ run_id: 'run-live', status: 'running', created_at: minutesBefore(0.5), started_at: minutesBefore(0.5), decision: null })
  assert.equal(plan({ kanban: OPEN, runs: [live], audioHold: hold }).action, 'wait')

  assert.deepEqual(normalizeAudioHold({ current: 1, total: 2 }), hold)
  assert.equal(normalizeAudioHold({ current: 3, total: 2 }), null)
  assert.equal(normalizeAudioHold({ current: 1, total: 99 }), null)
  assert.equal(normalizeAudioHold('1/2'), null)

  const memory = memoryAdmin({
    sales_cycles: [{ id: CYCLE, company_id: COMPANY, status: 'negociacao', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, lost_at: null, canceled_at: null, closed_at: null }],
    conversation_messages: [{ company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(2), observed_at: minutesBefore(2), content_type: 'audio', text_content: null }],
    companion_full_reading_runs: [],
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
      audioHold: hold,
    })

  assert.equal(snapshot.state, 'running')
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])

  const agora = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(agora.notice, 'Transcrevendo áudio 1 de 2…')
  assert.equal(agora.status.band.kind, 'audio')
  assert.equal(agora.status.refresh.disabled, true)
})

test('I3: áudio que ganhou transcrição deixa a leitura velha (uma leitura, já com o texto)', () => {
  const activity =
    summarizeLedgerActivity([
      { direction: 'outgoing', author_kind: 'human_agent', occurred_at: minutesBefore(50), observed_at: minutesBefore(1), content_type: 'audio', text_content: null, audio_transcription: 'Te mando o contrato amanhã' },
      { direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(45), observed_at: minutesBefore(45), content_type: 'text', text_content: 'Ok' },
    ])

  assert.equal(activity.latest_transcription_observed_at, minutesBefore(1))

  const reading = run({ decision: { ...run().decision, sistema: { kanban_lido: { status: 'negociacao' }, alertas: [] } } })

  const result =
    plan({
      kanban: OPEN,
      runs: [reading],
      latestObservedAt: activity.latest_observed_at,
      latestCustomerObservedAt: activity.latest_customer_observed_at,
      latestTranscriptionObservedAt: minutesBefore(1),
    })

  assert.equal(result.action, 'start')
  assert.deepEqual(result.stale_reasons, ['mensagem_nova'])

  // Sem transcrição nova: a mensagem do vendedor não dispara leitura.
  assert.equal(
    plan({ kanban: OPEN, runs: [reading], latestObservedAt: minutesBefore(1), latestCustomerObservedAt: minutesBefore(45) }).action,
    'use',
  )
})

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

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
