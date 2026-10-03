// Rodada 10 (HML): leitura mais curta e sem desperdício. Fixtures
// sintéticas, nenhum dado de cliente.
//
// - A: etapa igual à sugerida não relê (nem pelo painel, nem pelo Yolen);
//   etapa diferente relê; a leitura que continua valendo compara a sugestão
//   com a etapa atual (sem "Novo → Negociação" depois de aplicada).
// - C: continuação só quando sai mais barata (estimativa no log e em
//   sistema.estimativa); decisão anterior compacta.
// - D: prompt full-reading-v7 com limites; o parser corta sem falhar e
//   registra; v6 continua valendo e serve de base para a continuação.
// - E: rota de captura — helper do ciclo encerrado.
// - F: resumo da última leitura para o quadro da página do lead (só com a
//   flag).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FULL_READING_COMPATIBLE_PROMPT_VERSIONS,
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FULL_READING_V7_LIMITS,
  applyFullReadingLimits,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  planFullReadingPanel,
} from '../server/full-reading-panel.ts'

import {
  buildFullReadingAgoraView,
} from '../server/full-reading-panel-view.ts'

import {
  CONTINUATION_MAX_INPUT_RATIO,
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

import {
  closedAtFromCycleRow,
  isClosedCycleCaptureUnavailable,
} from '../server/full-reading-closed-cycle.ts'

const NOW = '2026-10-02T21:00:00.000Z'
const CYCLE = '9a000000-0000-4000-8000-0000000000c1'
const COMPANY = '9a000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000010'

const minutesBefore = (minutes) =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString()

function decision(overrides = {}) {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'O cliente pediu o valor e espera resposta.',
    cliente: { sabemos: ['Pediu o valor (02/10)'], inferimos: [], a_confirmar: [] },
    pendencias: [{ de: 'vendedor', texto: 'Responder o valor' }],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: 'Interessado.', passos: [], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Responder o valor.',
    por_que: 'O cliente perguntou.',
    proximo_passo_titulo: 'Responder o valor',
    proximo_passo_complemento: '',
    mensagem_sugerida: 'Oi! O valor é R$ 100,00.',
    mensagem_observacao: '',
    conducao: { acertos: [], ajustes: [] },
    para_o_gestor: [],
    etapa_kanban_sugerida: 'negociacao',
    motivo_etapa: 'Pediu o valor.',
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

function storedDecision(overrides = {}, system = {}) {
  return {
    ...decision(overrides),
    sistema: {
      kanban_lido: { status: 'novo', stage_entered_at: minutesBefore(600) },
      alertas: [],
      saida_estruturada: false,
      modo: 'completa',
      leitura_base: null,
      motivo: ['sem_leitura'],
      continuacoes_seguidas: 0,
      cadeia: [CYCLE],
      ...system,
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

// Leitura feita com o kanban em "Novo", sugerindo "Negociação".
const NOVO = { status: 'novo', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null }

function plan(overrides = {}) {
  return planFullReadingPanel({
    runs: [run()],
    cycleId: CYCLE,
    kanban: NOVO,
    latestObservedAt: minutesBefore(40),
    latestCustomerObservedAt: minutesBefore(40),
    force: false,
    now: NOW,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// A. Etapa aplicada sem leitura à toa
// ---------------------------------------------------------------------------

test('A2: a etapa nova é a sugerida (painel ou Yolen) — a leitura continua valendo, sem kanban_mudou', () => {
  const applied = plan({ kanban: { ...NOVO, status: 'negociacao', stage_entered_at: minutesBefore(1) } })

  assert.equal(applied.action, 'use')
  assert.deepEqual(applied.stale_reasons, [])
  assert.equal(applied.reading.run_id, 'run-a')

  // Mesmo com o "Atualizar" (if_changed): nada novo, não relê.
  const refresh = plan({ kanban: { ...NOVO, status: 'negociacao', stage_entered_at: minutesBefore(1) }, force: true, forceMode: 'if_changed' })

  assert.equal(refresh.action, 'use')
})

test('A2: a etapa foi para outra, diferente da sugerida — relê (kanban_mudou)', () => {
  const other = plan({ kanban: { ...NOVO, status: 'respondeu', stage_entered_at: minutesBefore(1) } })

  assert.equal(other.action, 'start')
  assert.deepEqual(other.stale_reasons, ['kanban_mudou'])
})

test('A2: ciclo encerrado segue a regra do J (a etapa sugerida "ganho" não abre exceção)', () => {
  const won = plan({
    runs: [run({ decision: storedDecision({ etapa_kanban_sugerida: 'ganho', venda_concluida: 'sim' }) })],
    kanban: { ...NOVO, status: 'ganho', stage_entered_at: minutesBefore(1), closed_at: minutesBefore(1) },
  })

  assert.equal(won.action, 'skip')
  assert.equal(won.skip_reason, 'CLOSED_CYCLE')
})

test('A3: a leitura que continua valendo compara a sugestão com a etapa atual — sem cartão "Novo → Negociação"', () => {
  const reading = {
    run_id: 'run-a',
    completed_at: minutesBefore(29),
    analysis_markdown: null,
    decision: storedDecision(),
  }

  const before =
    buildFullReadingAgoraView({
      state: 'ready',
      reading,
      failureCode: null,
      kanban: NOVO,
      cycleId: CYCLE,
      lastCustomerMessageAt: minutesBefore(40),
    })

  assert.ok(before.stage_card, 'antes de aplicar, o cartão aparece')
  assert.equal(before.stage_card.suggested_status, 'negociacao')

  const after =
    buildFullReadingAgoraView({
      state: 'ready',
      reading,
      failureCode: null,
      kanban: { ...NOVO, status: 'negociacao', stage_entered_at: minutesBefore(1) },
      cycleId: CYCLE,
      lastCustomerMessageAt: minutesBefore(40),
    })

  assert.equal(after.stage_card, null)
  assert.equal(after.kanban.status, 'negociacao')
  assert.doesNotMatch(JSON.stringify(after), /Novo → Negociação/)
})

// ---------------------------------------------------------------------------
// C. Continuação só quando sai mais barata
// ---------------------------------------------------------------------------

function msg(index, minutesAgo, overrides = {}) {
  const at = minutesBefore(minutesAgo)

  return {
    id: String(index),
    message_key: `k${String(index).padStart(3, '0')}`,
    direction: index % 2 === 0 ? 'outgoing' : 'incoming',
    author_kind: index % 2 === 0 ? 'human_agent' : 'customer',
    occurred_at: at,
    observed_at: at,
    content_type: 'text',
    text_content: `Mensagem sintética ${String(index).padStart(3, '0')}`,
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
    ...overrides,
  }
}

function apiText(text, usage = { input_tokens: 10, output_tokens: 5 }) {
  return new Response(JSON.stringify({
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function updatesAdmin() {
  const updates = []

  return {
    updates,
    admin: {
      from(table) {
        return {
          update(values) {
            updates.push({ table, values })
            const chain = { eq() { return chain }, then(resolve) { resolve({ error: null }) } }
            return chain
          },
        }
      },
    },
  }
}

async function runReading({ messages, baseRun = null, output = decision() }) {
  const { admin, updates } = updatesAdmin()
  const bodies = []
  const lines = []
  const original = console.info
  console.info = (...args) => { lines.push(args.join(' ')) }

  try {
    const result =
      await executeFullReadingRun({
        admin,
        runId: 'run-new',
        companyId: COMPANY,
        cycleId: CYCLE,
        conversationKey: CONVERSATION,
        referenceTime: NOW,
        model: 'claude-sonnet-5-5',
        effort: 'high',
        apiKey: 'sk-ant-teste',
        logger: () => {},
        baseRun,
        reasons: ['mensagem_nova'],
        loadMessages: async ({ referenceTime }) =>
          messages.filter((item) => Date.parse(item.observed_at) <= Date.parse(referenceTime)),
        loadChain: async () => [CYCLE],
        loadConfig: async () => ({ bundle: null, products: [] }),
        loadKanban: async () => null,
        fetchImpl: async (_url, init) => {
          bodies.push(JSON.parse(init.body))
          return apiText(JSON.stringify({ decisao: output }))
        },
      })

    return {
      result,
      bodies,
      lines,
      final: updates[updates.length - 1]?.values ?? null,
    }
  } finally {
    console.info = original
  }
}

function logEvent(lines, event) {
  const line = lines.find((entry) => entry.includes(`"event":"${event}"`))
  return line ? JSON.parse(line.slice(line.indexOf('{'))) : null
}

// Decisão anterior "pesada" (como a v6): muitos itens e frases longas.
function heavyPrevious() {
  const long = (label) => `${label}: frase longa e sintética que repete o mesmo assunto da conversa para pesar na entrada.`

  return storedDecision({
    situacao_resumo: long('Situação'),
    cliente: {
      sabemos: Array.from({ length: 6 }, (_, index) => long(`Sabemos ${index}`)),
      inferimos: Array.from({ length: 4 }, (_, index) => long(`Inferimos ${index}`)),
      a_confirmar: Array.from({ length: 3 }, (_, index) => long(`Confirmar ${index}`)),
    },
    afirmacoes_a_confirmar: Array.from({ length: 9 }, (_, index) => long(`Afirmação ${index}`)),
    conducao: {
      acertos: [{ texto: long('Acerto'), evidencia: long('Evidência') }],
      ajustes: Array.from({ length: 4 }, (_, index) => ({ houve: long(`Houve ${index}`), melhor: long(`Melhor ${index}`) })),
    },
    para_o_gestor: [long('Gestor')],
    mensagem_sugerida: long('Mensagem'),
  }, {
    kanban_lido: { status: 'novo', stage_entered_at: minutesBefore(600) },
  })
}

test('C1: conversa curta — a continuação sairia mais cara: leitura completa, com a estimativa no log e em sistema.estimativa', async () => {
  // 26 mensagens curtas vistas + 2 novas (o caso da evidência).
  const seen = Array.from({ length: 26 }, (_, index) => msg(index + 1, 200 - index * 5))
  const messages = [...seen, msg(27, 10), msg(28, 5)]

  const { result, bodies, lines, final } =
    await runReading({
      messages,
      baseRun: { run_id: 'run-base', reference_time: minutesBefore(60), completed_at: minutesBefore(59), decision: heavyPrevious() },
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(bodies.length, 1)
  assert.match(bodies[0].messages[0].content, /<conversa>/)
  assert.doesNotMatch(bodies[0].messages[0].content, /<leitura_anterior/)

  assert.equal(final.decision.sistema.modo, 'completa')
  assert.ok(final.decision.sistema.motivo.includes('continuacao_mais_cara'))
  assert.equal(final.decision.sistema.estimativa.escolha, 'completa')
  assert.ok(final.decision.sistema.estimativa.proporcao >= CONTINUATION_MAX_INPUT_RATIO)

  const estimate = logEvent(lines, 'mode_estimate')

  assert.ok(estimate, 'a estimativa vai para o log')
  assert.equal(estimate.choice, 'completa')
  assert.equal(typeof estimate.full_input_tokens, 'number')
  assert.equal(typeof estimate.continuation_input_tokens, 'number')
  assert.doesNotMatch(JSON.stringify(estimate), /Mensagem sintética/)
})

test('C1: conversa longa — a continuação é claramente menor (menos de 70%): continuação', async () => {
  const filler = ' Assunto sintético do pedido, do prazo e da forma de pagamento.'.repeat(30)
  const seen = Array.from({ length: 60 }, (_, index) => msg(index + 1, 600 - index * 8, { text_content: `Mensagem sintética ${index + 1}.${filler}` }))
  const messages = [...seen, msg(61, 10), msg(62, 5)]

  const { bodies, lines, final } =
    await runReading({
      messages,
      baseRun: { run_id: 'run-base', reference_time: minutesBefore(60), completed_at: minutesBefore(59), decision: heavyPrevious() },
    })

  assert.match(bodies[0].messages[0].content, /<mensagens_novas>/)
  assert.equal(final.decision.sistema.modo, 'continuacao')
  assert.equal(final.decision.sistema.estimativa.escolha, 'continuacao')
  assert.ok(final.decision.sistema.estimativa.proporcao < CONTINUATION_MAX_INPUT_RATIO)
  assert.equal(logEvent(lines, 'mode_estimate').choice, 'continuacao')
})

test('C2: a continuação manda a decisão anterior compacta — condução, como conduzir, mensagem e gestor ficam de fora', async () => {
  const filler = ' Assunto sintético do pedido, do prazo e da forma de pagamento.'.repeat(30)
  const seen = Array.from({ length: 60 }, (_, index) => msg(index + 1, 600 - index * 8, { text_content: `Mensagem sintética ${index + 1}.${filler}` }))

  const { bodies } =
    await runReading({
      messages: [...seen, msg(61, 10)],
      baseRun: { run_id: 'run-base', reference_time: minutesBefore(60), completed_at: minutesBefore(59), decision: heavyPrevious() },
    })

  const content = bodies[0].messages[0].content
  const previous = content.slice(content.indexOf('<leitura_anterior'), content.indexOf('</leitura_anterior>'))
  const json = JSON.parse(previous.slice(previous.indexOf('\n') + 1))

  for (const kept of ['situacao_resumo', 'cliente', 'pendencias', 'oportunidades', 'contradicoes_cadastro', 'fechamento', 'linha_do_tempo', 'etapa_kanban_sugerida']) {
    assert.ok(kept in json, kept)
  }

  for (const dropped of ['conducao', 'como_conduzir', 'mensagem_sugerida', 'para_o_gestor', 'afirmacoes_a_confirmar', 'sistema']) {
    assert.equal(dropped in json, false, dropped)
  }

  assert.match(bodies[0].system[0].text, /refa[çc]a a partir das mensagens/i)
})

// ---------------------------------------------------------------------------
// D. Leitura mais curta (v7)
// ---------------------------------------------------------------------------

test('D1/D2/D4: prompt full-reading-v7 geral, com os limites, uma frase curta por item e meta de ~6 mil caracteres', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v8')
  assert.deepEqual(FULL_READING_COMPATIBLE_PROMPT_VERSIONS, ['full-reading-v8', 'full-reading-v7', 'full-reading-v6'])

  const system = buildFullReadingSystemPrompt()

  assert.match(system, /Leitura curta/)
  assert.match(system, /20 palavras/)
  assert.match(system, /6 mil caracteres/)
  assert.match(system, /até 8/i)

  // Prompt geral: as regras de tamanho não trazem exemplo de conversa.
  const short = system.slice(system.indexOf('Leitura curta'), system.indexOf('Leitura curta') + 1200)

  assert.doesNotMatch(short, /\b(Oi|Olá)\b/)

  assert.deepEqual(FULL_READING_V7_LIMITS, {
    linha_do_tempo: 8,
    pendencias: 4,
    oportunidades: 3,
    afirmacoes_a_confirmar: 5,
    contradicoes_cadastro: 4,
    cliente_sabemos: 5,
    cliente_inferimos: 3,
    cliente_a_confirmar: 3,
    conducao_acertos: 3,
    conducao_ajustes: 3,
    como_conduzir_passos: 3,
    como_conduzir_evitar: 2,
    para_o_gestor: 2,
  })

  assert.ok(FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao)
})

test('D3: o corte guarda os primeiros (os mais importantes) e, na linha do tempo, os marcos mais recentes; registra quanto cortou', () => {
  const many = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`)

  const oversized = decision({
    linha_do_tempo: Array.from({ length: 11 }, (_, index) => ({ dia: `${String(index + 1).padStart(2, '0')}/10`, hora: '10:00', texto: `Marco ${index + 1}` })),
    pendencias: many('Pendência', 6).map((texto) => ({ de: 'vendedor', texto })),
    oportunidades: many('Oportunidade', 5).map((texto) => ({ texto, evidencia: '' })),
    afirmacoes_a_confirmar: many('Confirmar', 9),
    contradicoes_cadastro: many('Contradição', 6).map((texto) => ({ campo: 'cidade', texto })),
    cliente: { sabemos: many('Sabemos', 6), inferimos: many('Inferimos', 4), a_confirmar: many('A confirmar', 4) },
    conducao: { acertos: many('Acerto', 5).map((texto) => ({ texto })), ajustes: many('Ajuste', 4).map((houve) => ({ houve, melhor: 'Melhor' })) },
    como_conduzir: { leitura_do_momento: 'x', passos: many('Passo', 5), evitar: many('Evitar', 4) },
    para_o_gestor: many('Gestor', 3),
  })

  const { decision: cut, cuts } = applyFullReadingLimits(oversized)

  assert.equal(cut.linha_do_tempo.length, 8)
  assert.equal(cut.linha_do_tempo[0].texto, 'Marco 4')
  assert.equal(cut.linha_do_tempo[7].texto, 'Marco 11')
  assert.deepEqual(cut.pendencias.map((item) => item.texto), many('Pendência', 4))
  assert.equal(cut.oportunidades.length, 3)
  assert.deepEqual(cut.afirmacoes_a_confirmar, many('Confirmar', 5))
  assert.equal(cut.contradicoes_cadastro.length, 4)
  assert.deepEqual(cut.cliente.sabemos, many('Sabemos', 5))
  assert.equal(cut.cliente.inferimos.length, 3)
  assert.equal(cut.cliente.a_confirmar.length, 3)
  assert.equal(cut.conducao.acertos.length, 3)
  assert.equal(cut.conducao.ajustes.length, 3)
  assert.equal(cut.como_conduzir.passos.length, 3)
  assert.equal(cut.como_conduzir.evitar.length, 2)
  assert.deepEqual(cut.para_o_gestor, many('Gestor', 2))

  assert.deepEqual(cuts, {
    linha_do_tempo: 3,
    pendencias: 2,
    oportunidades: 2,
    afirmacoes_a_confirmar: 4,
    contradicoes_cadastro: 2,
    'cliente.sabemos': 1,
    'cliente.inferimos': 1,
    'cliente.a_confirmar': 1,
    'conducao.acertos': 2,
    'conducao.ajustes': 1,
    'como_conduzir.passos': 2,
    'como_conduzir.evitar': 2,
    para_o_gestor: 1,
  })

  // Dentro do limite: nada muda, nada registrado.
  const small = applyFullReadingLimits(decision())

  assert.deepEqual(small.cuts, {})
  assert.deepEqual(small.decision.pendencias, decision().pendencias)
})

test('D3: a leitura que passa do limite não falha — o corte vai para o log e para sistema.cortes', async () => {
  const output = decision({
    afirmacoes_a_confirmar: Array.from({ length: 9 }, (_, index) => `Confirmar ${index + 1}`),
    para_o_gestor: ['Gestor 1', 'Gestor 2', 'Gestor 3'],
  })

  const { result, lines, final } =
    await runReading({ messages: [msg(1, 5)], output })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(final.decision.afirmacoes_a_confirmar.length, 5)
  assert.equal(final.decision.para_o_gestor.length, 2)
  assert.deepEqual(final.decision.sistema.cortes, { afirmacoes_a_confirmar: 4, para_o_gestor: 1 })

  const trimmed = logEvent(lines, 'output_trimmed')

  assert.ok(trimmed)
  assert.deepEqual(trimmed.cuts, { afirmacoes_a_confirmar: 4, para_o_gestor: 1 })
})

test('D3: o parser mantém os marcos mais recentes quando a linha do tempo passa do teto', () => {
  const output =
    parseFullReadingOutput(JSON.stringify({
      decisao: decision({
        linha_do_tempo: Array.from({ length: 12 }, (_, index) => ({ dia: '02/10', hora: '10:00', texto: `Marco ${index + 1}` })),
      }),
    }), { format: 'v6' })

  assert.equal(output.decisao.linha_do_tempo[output.decisao.linha_do_tempo.length - 1].texto, 'Marco 12')
})

test('D5: a troca para v7 não força releitura — a leitura v6 continua valendo; com mensagem nova, a continuação parte dela', () => {
  const v6 = run({ prompt_version: 'full-reading-v6' })

  const same = plan({ runs: [v6] })

  assert.equal(same.action, 'use')
  assert.equal(same.reading.run_id, 'run-a')
  assert.deepEqual(same.stale_reasons, [])

  const fresh = plan({ runs: [v6], latestObservedAt: minutesBefore(1), latestCustomerObservedAt: minutesBefore(1) })

  assert.equal(fresh.action, 'start')
  assert.deepEqual(fresh.stale_reasons, ['mensagem_nova'])
  assert.deepEqual(fresh.full_reasons, [])

  // Versões mais antigas (v5) continuam fora: leitura nova.
  const v5 = plan({ runs: [run({ prompt_version: 'full-reading-v5' })] })

  assert.equal(v5.action, 'start')
  assert.equal(v5.reading, null)
})

// ---------------------------------------------------------------------------
// E. Ciclo encerrado na captura (helper da rota)
// ---------------------------------------------------------------------------

test('E3/E4: encerramento do ciclo e recusa reconhecida (função sem o parâmetro ou ciclo encerrado)', () => {
  assert.equal(closedAtFromCycleRow({ status: 'ganho', won_at: '2026-10-01T10:00:00Z', closed_at: '2026-10-01T11:00:00Z' }), '2026-10-01T10:00:00Z')
  assert.equal(closedAtFromCycleRow({ status: 'perdido', lost_at: null, closed_at: '2026-10-01T11:00:00Z' }), '2026-10-01T11:00:00Z')
  assert.equal(closedAtFromCycleRow({ status: 'cancelado', canceled_at: '2026-10-01T09:00:00Z' }), '2026-10-01T09:00:00Z')

  assert.equal(isClosedCycleCaptureUnavailable({ error: { code: 'PGRST202' }, classificationCode: 'CAPTURE_INGESTION_ERROR' }), true)
  assert.equal(isClosedCycleCaptureUnavailable({ error: { code: 'P0001' }, classificationCode: 'CAPTURE_CYCLE_CLOSED' }), true)
  assert.equal(isClosedCycleCaptureUnavailable({ error: { code: 'P0001' }, classificationCode: 'OBSERVED_AT_INVALID' }), false)
})
