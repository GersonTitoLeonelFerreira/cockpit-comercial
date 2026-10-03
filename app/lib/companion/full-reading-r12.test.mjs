// Rodada 12 (HML). Fixtures sintéticas, nenhum dado de cliente.
//
// - B2: no servidor, versão só conta como atividade quando o conteúdo muda
//   de verdade (mensagem nova, transcrição nova ou alterada, exclusão, texto
//   alterado). Em áudio, diferença só no rótulo de duração (inclusive vazio
//   ↔ rótulo) não deixa a leitura velha nem reinicia a espera de 20 s, e
//   versões repetidas não empurram mensagens reais para fora da janela.
// - B3: a leitura usa a duração congelada do áudio, nunca o tempo corrido.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyActivityRows,
  planFullReadingPanel,
  readLedgerActivity,
  summarizeLedgerActivity,
} from '../server/full-reading-panel.ts'

import {
  executeFullReadingRun,
  frozenAudioLabelsFromRows,
  withFrozenAudioLabels,
} from '../server/full-reading-runner.ts'

import {
  FULL_READING_PROMPT_VERSION,
} from './full-reading/prompt.ts'

const NOW = '2026-10-02T22:40:00.000Z'
const CYCLE = '9e000000-0000-4000-8000-0000000000c1'
const COMPANY = '9e000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000013'

const at = (minutesAgo, seconds = 0) =>
  new Date(Date.parse(NOW) - minutesAgo * 60_000 + seconds * 1000).toISOString()

function row(overrides = {}) {
  return {
    message_key: 'audio-1',
    version: 1,
    is_deleted: false,
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: at(600),
    observed_at: at(600),
    content_type: 'audio',
    text_content: '[duração 0:42]',
    audio_transcription: 'Quero o plano anual.',
    ...overrides,
  }
}

// Ouvir de novo um áudio antigo (extensão antiga): várias versões só com
// o tempo corrido do player, uma delas sem texto.
function replayVersions(key, from, count, startMinutesAgo) {
  return Array.from({ length: count }, (_, index) => row({
    message_key: key,
    version: from + index,
    observed_at: at(startMinutesAgo, index * 2),
    text_content: index === 0 ? null : `[duração 0:${String(index).padStart(2, '0')}]`,
  }))
}

function storedDecision() {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'O cliente mandou um áudio pedindo o plano anual.',
    cliente: { sabemos: ['Quer o plano anual'], inferimos: [], a_confirmar: [] },
    pendencias: [{ de: 'vendedor', texto: 'Responder sobre o plano anual' }],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: 'Interessado.', passos: [], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Responder sobre o plano anual.',
    por_que: 'O cliente pediu.',
    proximo_passo_titulo: 'Responder sobre o plano anual',
    proximo_passo_complemento: '',
    mensagem_sugerida: 'Oi! O plano anual sai por R$ 100,00 por mês.',
    mensagem_observacao: '',
    conducao: { acertos: [], ajustes: [] },
    para_o_gestor: [],
    etapa_kanban_sugerida: 'negociacao',
    motivo_etapa: 'Pediu o plano.',
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
    arquivos_sugeridos: [],
    sistema: {
      kanban_lido: { status: 'negociacao', stage_entered_at: at(900) },
      alertas: [],
      saida_estruturada: false,
      modo: 'completa',
      leitura_base: null,
      motivo: ['sem_leitura'],
      continuacoes_seguidas: 0,
      cadeia: [CYCLE],
    },
  }
}

// ---------------------------------------------------------------------------
// B2. Só mudança real conta
// ---------------------------------------------------------------------------

test('B2: versões só com o rótulo do áudio (inclusive vazio ↔ rótulo) não mexem nos horários de atividade', () => {
  const rows = [
    row(),
    ...replayVersions('audio-1', 2, 15, 8),
  ]

  const activity = summarizeLedgerActivity(rows)

  assert.equal(activity.latest_customer_observed_at, at(600))
  assert.equal(activity.latest_observed_at, at(600))
  assert.equal(activity.latest_transcription_observed_at, at(600))
  assert.equal(activity.last_message_at, at(600))
})

test('B2: mensagem nova, transcrição nova ou alterada, exclusão e texto alterado contam', () => {
  const base = row({ audio_transcription: null })

  const cases = [
    { label: 'transcrição nova', version: row({ version: 2, observed_at: at(5), audio_transcription: 'Pode ser amanhã.' }), transcription: true },
    { label: 'exclusão', version: row({ version: 2, observed_at: at(5), audio_transcription: null, is_deleted: true }), transcription: false },
    { label: 'texto alterado', version: row({ version: 2, observed_at: at(5), audio_transcription: null, content_type: 'text', text_content: 'Mudei de ideia' }), transcription: false },
  ]

  for (const entry of cases) {
    const activity = summarizeLedgerActivity([base, entry.version])

    assert.equal(activity.latest_customer_observed_at, at(5), entry.label)
    assert.equal(activity.latest_transcription_observed_at ?? null, entry.transcription ? at(5) : null, entry.label)
  }

  const changed = summarizeLedgerActivity([
    row(),
    row({ version: 2, observed_at: at(5), audio_transcription: 'Quero o plano mensal.' }),
  ])

  assert.equal(changed.latest_transcription_observed_at, at(5), 'transcrição alterada')

  const fresh = summarizeLedgerActivity([
    row(),
    row({ message_key: 'texto-2', version: 1, content_type: 'text', text_content: 'Oi de novo', audio_transcription: null, occurred_at: at(4), observed_at: at(4) }),
  ])

  assert.equal(fresh.latest_customer_observed_at, at(4), 'mensagem nova')
})

test('B2: a versão anterior fora da janela é usada na comparação; sem ela, a versão conta (como antes)', () => {
  const window = replayVersions('audio-1', 3, 5, 8)
  const predecessor = row({ version: 2, observed_at: at(9), text_content: '[duração 0:42]' })

  const withPredecessor = classifyActivityRows(window, [predecessor])

  assert.deepEqual([...withPredecessor.values()].map((change) => change.meaningful), [false, false, false, false, false])

  const without = classifyActivityRows(window)

  assert.equal(without.get(window[0]).meaningful, true)
})

test('B2: ouvir de novo um áudio antigo depois da leitura não deixa a leitura velha nem segura a espera de 20 s', () => {
  const rows = [row(), ...replayVersions('audio-1', 2, 7, 1)]
  const activity = summarizeLedgerActivity(rows)

  const plan = planFullReadingPanel({
    runs: [{
      run_id: 'run-a',
      cycle_id: CYCLE,
      status: 'succeeded',
      prompt_version: FULL_READING_PROMPT_VERSION,
      reference_time: at(30),
      created_at: at(30),
      started_at: at(30),
      completed_at: at(29),
      failure_code: null,
      failure_detail: null,
      analysis_markdown: null,
      decision: storedDecision(),
    }],
    cycleId: CYCLE,
    kanban: { status: 'negociacao', stage_entered_at: at(900), next_action: null, next_action_date: null, closed_at: null },
    latestObservedAt: activity.latest_observed_at,
    latestCustomerObservedAt: activity.latest_customer_observed_at,
    latestCustomerOccurredAt: activity.latest_customer_occurred_at,
    latestTranscriptionObservedAt: activity.latest_transcription_observed_at,
    force: false,
    now: NOW,
  })

  assert.equal(plan.action, 'use')
  assert.deepEqual(plan.stale_reasons, [])
  assert.equal(plan.pending_update_at ?? null, null)
})

// Cliente falso do ledger: eq/in/lte/order/limit, como o PostgREST.
function ledgerAdmin(rows) {
  const queries = []

  return {
    queries,
    from(table) {
      assert.equal(table, 'conversation_messages')
      const filters = []
      let limit = Infinity
      const query = { filters: [] }
      queries.push(query)

      const chain = {
        select() { return chain },
        eq(column, value) { query.filters.push(`eq:${column}`); filters.push((item) => item[column] === value); return chain },
        in(column, values) { query.filters.push(`in:${column}`); filters.push((item) => values.includes(item[column])); return chain },
        lte(column, value) { query.filters.push(`lte:${column}`); filters.push((item) => Date.parse(item[column]) <= Date.parse(value)); return chain },
        order() { return chain },
        limit(count) { limit = count; return chain },
        then(resolve, reject) {
          const data = rows
            .filter((item) => filters.every((filter) => filter(item)))
            .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at))
            .slice(0, limit)

          return Promise.resolve({ data: structuredClone(data), error: null }).then(resolve, reject)
        },
      }

      return chain
    },
  }
}

function scoped(item) {
  return { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, ...item }
}

test('B2: 250 versões repetidas não empurram a mensagem real para fora da janela (lê as páginas seguintes e as versões anteriores)', async () => {
  const real = row({ message_key: 'texto-1', content_type: 'text', text_content: 'Quero fechar', audio_transcription: null, occurred_at: at(300), observed_at: at(300) })
  const audioFirst = row({ observed_at: at(200) })
  const replays = Array.from({ length: 250 }, (_, index) => row({
    version: index + 2,
    observed_at: at(120, index),
    text_content: index % 2 === 0 ? `[duração 0:${String(index % 60).padStart(2, '0')}]` : null,
  }))

  const admin = ledgerAdmin([real, audioFirst, ...replays].map(scoped))

  const activity = await readLedgerActivity(admin, { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION }, [CYCLE])

  assert.equal(activity.latest_customer_observed_at, at(200), 'o áudio de verdade (versão 1), não as repetições')
  assert.equal(activity.latest_observed_at, at(200))
  assert.ok(admin.queries.length >= 2, 'leu além da primeira página')
})

test('B2: conversa curta — uma consulta só, como antes', async () => {
  const admin = ledgerAdmin([
    row({ message_key: 'texto-1', content_type: 'text', text_content: 'Oi', audio_transcription: null, observed_at: at(10), occurred_at: at(10) }),
  ].map(scoped))

  const activity = await readLedgerActivity(admin, { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION }, [CYCLE])

  assert.equal(activity.latest_customer_observed_at, at(10))
  assert.equal(admin.queries.length, 1)
})

// ---------------------------------------------------------------------------
// B3. Duração congelada na leitura
// ---------------------------------------------------------------------------

test('B3: o rótulo do áudio na leitura é o da primeira versão que o trouxe, nunca o tempo corrido', () => {
  const labels = frozenAudioLabelsFromRows([
    { message_key: 'audio-1', version: 4, text_content: '[duração 0:07]' },
    { message_key: 'audio-1', version: 2, text_content: '[duração 0:42]' },
    { message_key: 'audio-1', version: 1, text_content: null },
    { message_key: 'audio-2', version: 1, text_content: '[duração 2:10]' },
    { message_key: 'audio-3', version: 1, text_content: 'legenda' },
  ])

  assert.deepEqual(Object.fromEntries(labels), { 'audio-1': '[duração 0:42]', 'audio-2': '[duração 2:10]' })

  const messages = withFrozenAudioLabels([
    { message_key: 'audio-1', content_type: 'audio', text_content: '[duração 0:07]' },
    { message_key: 'audio-2', content_type: 'audio', text_content: null },
    { message_key: 'texto-1', content_type: 'text', text_content: '[duração 0:42]' },
  ], labels)

  assert.deepEqual(messages.map((message) => message.text_content), ['[duração 0:42]', '[duração 2:10]', '[duração 0:42]'])
})

test('B3: a transcrição enviada para a leitura leva a duração congelada', async () => {
  const bodies = []
  const original = console.info
  console.info = () => {}

  try {
    await executeFullReadingRun({
      admin: { from() { const chain = { update() { return chain }, eq() { return chain }, then(resolve) { resolve({ error: null }) } }; return chain } },
      runId: 'run-b3',
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
      referenceTime: NOW,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'chave-sintetica',
      logger: () => {},
      reasons: ['sem_leitura'],
      loadMessages: async () => [{
        id: '1',
        message_key: 'audio-1',
        direction: 'incoming',
        author_kind: 'customer',
        occurred_at: at(60),
        observed_at: at(1),
        content_type: 'audio',
        text_content: '[duração 0:07]',
        audio_transcription: 'Quero o plano anual.',
        is_deleted: false,
        deletion_reason: null,
      }],
      loadAudioLabels: async () => new Map([['audio-1', '[duração 0:42]']]),
      loadChain: async () => [CYCLE],
      loadConfig: async () => ({ bundle: null, products: [] }),
      loadKanban: async () => null,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'não é json' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })
      },
    })
  } finally {
    console.info = original
  }

  const content = bodies[0].messages[0].content
  const text = typeof content === 'string' ? content : content.map((block) => block.text ?? '').join('')

  assert.match(text, /\[áudio de 0:42\] Quero o plano anual\./)
  assert.doesNotMatch(text, /0:07/)
})

// ---------------------------------------------------------------------------
// C. JSON da leitura: conserto local, diagnóstico sem texto, v9, dica
// ---------------------------------------------------------------------------

import {
  FULL_READING_COMPATIBLE_PROMPT_VERSIONS,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FullReadingOutputError,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  maskForDiagnostic,
} from './full-reading/json-repair.ts'

function decisionOnly() {
  const { sistema, ...decision } = storedDecision()
  return decision
}

// JSON bem formado, com um marcador no lugar do texto a quebrar.
function jsonWith(field, raw) {
  const decision = { ...decisionOnly(), [field]: '@@TEXTO@@' }
  return JSON.stringify({ decisao: decision }, null, 2).replace('"@@TEXTO@@"', raw)
}

test('C2: aspas duplas sem escape dentro de texto — consertadas e validadas', () => {
  const cases = [
    ['situacao_resumo', '"A cliente disse "vou pensar" e sumiu."', 'A cliente disse "vou pensar" e sumiu.'],
    ['situacao_resumo', '"Cliente: "sim, pode mandar" e depois "obrigada"."', 'Cliente: "sim, pode mandar" e depois "obrigada".'],
    ['por_que', '"Ela respondeu "ok"."', 'Ela respondeu "ok".'],
  ]

  for (const [field, raw, expected] of cases) {
    const output = parseFullReadingOutput(jsonWith(field, raw), { format: 'v6' })

    assert.equal(output.decisao[field], expected, raw)
    assert.deepEqual(output.reparo_json, ['aspas'], raw)
  }
})

test('C2: quebra de linha crua, vírgula sobrando e cerca de código — consertadas e validadas', () => {
  const newline = parseFullReadingOutput(jsonWith('situacao_resumo', '"Primeira linha\nsegunda linha"'), { format: 'v6' })

  assert.equal(newline.decisao.situacao_resumo, 'Primeira linha\nsegunda linha')
  assert.deepEqual(newline.reparo_json, ['quebra_de_linha'])

  // Vírgula sobrando no fim de um objeto e de uma lista.
  const comma = parseFullReadingOutput(
    JSON.stringify({ decisao: decisionOnly() }, null, 2)
      .replace('"texto": "Responder sobre o plano anual"', '"texto": "Responder sobre o plano anual",')
      .replace('"Quer o plano anual"', '"Quer o plano anual",'),
    { format: 'v6' },
  )

  assert.deepEqual(comma.reparo_json, ['virgula'])
  assert.equal(comma.decisao.pendencias[0].texto, 'Responder sobre o plano anual')

  const fenced = parseFullReadingOutput(`Segue a leitura:\n\`\`\`json\n${JSON.stringify({ decisao: decisionOnly() })}\n\`\`\`\nQualquer coisa, me avise.`, { format: 'v6' })

  assert.deepEqual(fenced.reparo_json, ['texto_em_volta'])
  assert.equal(fenced.decisao.acao_resumo, 'Responder sobre o plano anual.')

  // JSON certo: nada de conserto.
  assert.equal(parseFullReadingOutput(JSON.stringify({ decisao: decisionOnly() }), { format: 'v6' }).reparo_json, undefined)
})

test('C2: lixo continua INVALID_MODEL_OUTPUT (e o conserto não inventa campos)', () => {
  for (const text of ['não é json', '{ isso: não, é: [json', '{"decisao": {"situacao_resumo": "só isso"}}']) {
    assert.throws(
      () => parseFullReadingOutput(text, { format: 'v6' }),
      (error) => error instanceof FullReadingOutputError && /INVALID_MODEL_OUTPUT|INVALID/.test(error.code),
      text,
    )
  }
})

const SECRET_WORDS = ['Orçamento', 'Fulana', 'parcelado', 'Vitrine', 'ficou', 'pensar']

test('C1: o diagnóstico da falha não contém nenhuma letra do texto original', () => {
  const broken = `{"decisao": {"situacao_resumo": "Orçamento de R$ 1.250,00 parcelado; Fulana ficou de pensar" "Vitrine" ]]] }`

  let diagnostic = null

  try {
    parseFullReadingOutput(broken, { format: 'v6' })
  } catch (error) {
    diagnostic = error.diagnostic
  }

  assert.ok(diagnostic, 'há diagnóstico')
  assert.equal(diagnostic.length, broken.length)
  assert.equal(diagnostic.starts_with_brace, true)
  assert.equal(diagnostic.ends_with_brace, true)
  assert.equal(typeof diagnostic.position, 'number')
  assert.match(diagnostic.window, /^[a0\s\p{P}$+<=>^`|~]*$/u)
  assert.doesNotMatch(diagnostic.window, /[b-z]/i)

  const serialized = JSON.stringify(diagnostic)

  for (const word of [...SECRET_WORDS, '1.250', '250']) {
    assert.equal(serialized.toLowerCase().includes(word.toLowerCase()), false, word)
  }

  assert.equal(maskForDiagnostic('Ação 42: "Olá", Fulano!'), 'aaaa 00: "aaa", aaaaaa!')
})

test('C3: prompt v9 — falas com aspas simples, quebra só como \\n; v6, v7 e v8 continuam valendo', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v9')
  assert.deepEqual(FULL_READING_COMPATIBLE_PROMPT_VERSIONS, ['full-reading-v9', 'full-reading-v8', 'full-reading-v7', 'full-reading-v6'])

  const system = buildFullReadingSystemPrompt()

  assert.match(system, /cite falas com aspas simples \('…'\) ou sem aspas, nunca com aspas duplas; quebra de linha só como \\n\./)

  // Nenhum exemplo do formato com aspas duplas escapadas dentro de texto.
  assert.doesNotMatch(JSON.stringify(FULL_READING_OUTPUT_JSON_SCHEMA), /\\"/)
})

async function runWith(responses) {
  const bodies = []
  const lines = []
  const original = console.info
  console.info = (...args) => { lines.push(args.join(' ')) }

  let result

  try {
    result = await executeFullReadingRun({
      admin: { from() { const chain = { update() { return chain }, eq() { return chain }, then(resolve) { resolve({ error: null }) } }; return chain } },
      runId: 'run-c',
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
      referenceTime: NOW,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'chave-sintetica',
      logger: () => {},
      reasons: ['sem_leitura'],
      loadMessages: async () => [{
        id: '1', message_key: 't1', direction: 'incoming', author_kind: 'customer', occurred_at: at(60), observed_at: at(60),
        content_type: 'text', text_content: 'Quero o plano anual.', audio_transcription: null, is_deleted: false, deletion_reason: null,
      }],
      loadChain: async () => [CYCLE],
      loadConfig: async () => ({ bundle: null, products: [] }),
      loadKanban: async () => null,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        const text = responses[Math.min(bodies.length - 1, responses.length - 1)]
        return new Response(JSON.stringify({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 })
      },
    })
  } finally {
    console.info = original
  }

  const events = lines
    .filter((line) => line.startsWith('YOLEN_FULL_READING '))
    .map((line) => JSON.parse(line.slice('YOLEN_FULL_READING '.length)))

  return { result, bodies, events }
}

const userText = (body) => {
  const content = body.messages[0].content
  return typeof content === 'string' ? content : content.map((block) => block.text ?? '').join('')
}

test('C2: JSON consertado na primeira chamada — uma chamada só, output_repaired no log', async () => {
  const { result, bodies, events } = await runWith([jsonWith('situacao_resumo', '"A cliente disse "vou pensar" e sumiu."')])

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(bodies.length, 1)

  const repaired = events.find((event) => event.event === 'output_repaired')

  assert.deepEqual(repaired.repair, ['aspas'])
  assert.doesNotMatch(JSON.stringify(repaired), /pensar/)
})

test('C4: JSON sem conserto — a segunda chamada leva a linha da dica no fim da mensagem do usuário; o system fica igual', async () => {
  const broken = `{"decisao": {"situacao_resumo": "Orçamento parcelado; Fulana ficou de pensar" "Vitrine" ]]] }`
  const { result, bodies, events } = await runWith([broken, JSON.stringify({ decisao: decisionOnly() })])

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies[1].system, bodies[0].system)

  const failed = events.find((event) => event.event === 'output_parse_failed')

  assert.equal(failed.stop_reason, 'end_turn')
  assert.equal(typeof failed.position, 'number')

  for (const word of SECRET_WORDS) {
    assert.equal(JSON.stringify(failed).includes(word), false, word)
  }

  const second = userText(bodies[1])

  assert.ok(second.startsWith(userText(bodies[0])))
  assert.ok(second.endsWith(`Sua resposta anterior não era um JSON válido (erro perto do caractere ${failed.position}). Responda de novo só com o objeto JSON; dentro dos textos use aspas simples.`))
})

test('C5: lixo nas duas chamadas — continua INVALID_MODEL_OUTPUT', async () => {
  const { result, bodies } = await runWith(['não é json', 'ainda não é json'])

  assert.deepEqual(result, { status: 'failed', failure_code: 'INVALID_MODEL_OUTPUT' })
  assert.equal(bodies.length, 2)
})

// ---------------------------------------------------------------------------
// A. Foto: prévia recusada no servidor; LEGIVEL
// ---------------------------------------------------------------------------

import {
  ATTACHMENT_SUMMARY_SYSTEM_PROMPT,
  IMAGE_MIN_BYTES,
  attachmentSummariesAt,
  countAttachmentSummariesSince,
  includeConversationAttachment,
  splitLegibilityLine,
} from '../server/full-reading-attachments.ts'

import {
  attachmentPanelStatus,
} from '../server/full-reading-panel.ts'

import {
  buildAttachmentsView,
} from '../server/full-reading-attachments-view.ts'

const IMAGE_KEY = 'mensagem-sintetica-foto-001'
const PHOTO_TEXT = 'A foto ainda não carregou no WhatsApp. Abra a foto na conversa e clique em Incluir de novo.'
const UNREADABLE_TEXT = 'Não deu para ler o arquivo. Abra no WhatsApp e tente de novo.'

function jpeg(size) {
  const bytes = Buffer.alloc(size, 7)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  return bytes.toString('base64')
}

function attachmentsAdmin({ existing = [], today = [] } = {}) {
  const writes = []

  return {
    writes,
    from(table) {
      const filters = []
      let op = 'select'
      let payload = null

      const result = () => {
        if (op !== 'select') {
          writes.push({ table, op, payload })
          return { data: null, error: null }
        }

        if (table === 'conversation_messages') {
          return { data: [{ message_key: IMAGE_KEY }], error: null }
        }

        if (filters.includes('requested_at')) {
          return { data: today, error: null }
        }

        return { data: existing, error: null }
      }

      const chain = {
        select() { return chain },
        insert(values) { op = 'insert'; payload = values; return chain },
        update(values) { op = 'update'; payload = values; return chain },
        eq(column) { filters.push(column); return chain },
        gte(column) { filters.push(column); return chain },
        limit() { return chain },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }

      return chain
    },
  }
}

function include(admin, { size = 80_000, reply = 'LEGIVEL: sim\nFoto de um cardápio com o plano anual a R$ 100,00.' } = {}) {
  const calls = []

  return {
    calls,
    run: () => includeConversationAttachment({
      admin,
      scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
      userId: '9e000000-0000-4000-8000-0000000000a1',
      messageKey: IMAGE_KEY,
      fileName: null,
      sizeBytes: size,
      kind: 'imagem',
      mediaType: 'image/jpeg',
      contentBase64: jpeg(size),
      apiKey: 'chave-sintetica',
      model: 'claude-haiku-4-5',
      dailyCap: 10,
      since: '2026-10-02T03:00:00.000Z',
      countRunsToday: async () => 0,
      now: () => NOW,
      fetchImpl: async (_url, init) => {
        calls.push(JSON.parse(init.body))
        return new Response(JSON.stringify({ model: 'claude-haiku-4-5', content: [{ type: 'text', text: reply }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 40 } }), { status: 200 })
      },
    }),
  }
}

async function quietly(fn) {
  const original = console.info
  console.info = () => {}

  try {
    return await fn()
  } finally {
    console.info = original
  }
}

test('A4: imagem com menos de 5 KB é recusada antes do resumo — sem chamada, falha imagem_baixa_resolucao, fora do teto diário', async () => {
  const admin = attachmentsAdmin()
  const { run, calls } = include(admin, { size: 1321 })

  await assert.rejects(run(), (error) => error.code === 'ATTACHMENT_IMAGE_LOW_RESOLUTION' && error.status === 422 && error.message === PHOTO_TEXT)
  assert.equal(calls.length, 0)
  assert.equal(IMAGE_MIN_BYTES, 5 * 1024)

  const [row] = admin.writes

  assert.equal(row.op, 'insert')
  assert.equal(row.payload.status, 'falhou')
  assert.equal(row.payload.failure_code, 'imagem_baixa_resolucao')
  assert.equal(row.payload.summary, null)
  assert.equal(row.payload.input_tokens, null)

  // Não conta no teto: falha sem chamada ao modelo.
  const counted = await countAttachmentSummariesSince({
    admin: attachmentsAdmin({ today: [{ status: 'falhou', input_tokens: null }] }),
    companyId: COMPANY,
    since: '2026-10-02T03:00:00.000Z',
  })

  assert.equal(counted, 0)
})

test('A4: "incluido" antigo abaixo do mínimo vale como falha — inclui de novo (sem ja_incluido), atualizando a linha', async () => {
  const legacy = { id: 'linha-1', status: 'incluido', summary: 'Imagem ilegível.', requested_at: at(120), kind: 'imagem', size_bytes: 1321 }
  const admin = attachmentsAdmin({ existing: [legacy] })
  const { run, calls } = include(admin)

  const result = await quietly(run)

  assert.equal(result.status, 'incluido')
  assert.equal(calls.length, 1)
  assert.ok(admin.writes.length >= 2)
  assert.ok(admin.writes.every((write) => write.op === 'update'), 'a tabela não tem delete: atualiza')
  assert.equal(admin.writes.at(-1).payload.summary, 'Foto de um cardápio com o plano anual a R$ 100,00.')

  // Na leitura e no painel, o registro antigo não vale.
  const record = { message_key: IMAGE_KEY, kind: 'imagem', size_bytes: 1321, status: 'incluido', summary: 'Imagem ilegível.', failure_code: null, requested_at: at(120), summarized_at: at(119) }

  assert.equal(attachmentSummariesAt([record], NOW).size, 0)
  assert.equal(attachmentPanelStatus(record, NOW), 'falhou')

  const view = buildAttachmentsView({
    available: true,
    attachments: [{ message_key: IMAGE_KEY, ref: 'arq-000001', kind: 'imagem', name: null, size_label: null, pages: null, occurred_at: at(200), from: 'cliente', status: 'falhou', failure_code: 'imagem_baixa_resolucao' }],
  })

  assert.equal(view.items[0].status_text, PHOTO_TEXT)
  assert.equal(view.items[0].include_label, 'Tentar de novo')
  assert.equal(view.items[0].can_include, true)
})

test('A5: primeira linha LEGIVEL — sai do resumo; "nao" vira falha arquivo_ilegivel (sem resumo na leitura, conta no teto); sem a linha vale "sim"', async () => {
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /LEGIVEL: sim, LEGIVEL: parcial ou LEGIVEL: nao/)

  assert.deepEqual(splitLegibilityLine('LEGIVEL: parcial\nRecibo com a data cortada.'), { legibility: 'parcial', text: 'Recibo com a data cortada.' })
  assert.deepEqual(splitLegibilityLine('**LEGÍVEL: não**'), { legibility: 'nao', text: '' })
  assert.deepEqual(splitLegibilityLine('Foto de um cardápio.'), { legibility: 'sim', text: 'Foto de um cardápio.' })

  const partial = attachmentsAdmin()
  const ok = await quietly(include(partial, { reply: 'LEGIVEL: parcial\nRecibo do plano anual; a data está cortada.' }).run)

  assert.equal(ok.summary, 'Recibo do plano anual; a data está cortada.')

  const noLine = attachmentsAdmin()
  const plain = await quietly(include(noLine, { reply: 'Foto de um cardápio.' }).run)

  assert.equal(plain.summary, 'Foto de um cardápio.')

  const blurred = attachmentsAdmin()
  const attempt = include(blurred, { reply: 'LEGIVEL: nao' })

  await assert.rejects(quietly(attempt.run), (error) => error.code === 'ATTACHMENT_UNREADABLE' && error.status === 422 && error.message === UNREADABLE_TEXT)
  assert.equal(attempt.calls.length, 1)

  const final = blurred.writes.at(-1).payload

  assert.equal(final.status, 'falhou')
  assert.equal(final.failure_code, 'arquivo_ilegivel')
  assert.equal(final.summary, null)
  assert.equal(final.input_tokens, 1200, 'houve chamada: conta no teto')

  const counted = await countAttachmentSummariesSince({
    admin: attachmentsAdmin({ today: [{ status: 'falhou', input_tokens: 1200 }] }),
    companyId: COMPANY,
    since: '2026-10-02T03:00:00.000Z',
  })

  assert.equal(counted, 1)

  const view = buildAttachmentsView({
    available: true,
    attachments: [{ message_key: IMAGE_KEY, ref: 'arq-000001', kind: 'imagem', name: null, size_label: null, pages: null, occurred_at: at(200), from: 'cliente', status: 'falhou', failure_code: 'arquivo_ilegivel' }],
  })

  assert.equal(view.items[0].status_text, UNREADABLE_TEXT)
})
