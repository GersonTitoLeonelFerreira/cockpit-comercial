// Leitura completa de uma oportunidade nova (ciclo sucessor): a leitura do
// ciclo novo lê a mesma conversa nos ciclos de origem e marca onde a
// oportunidade nova começou. Banco em memória e fixtures sintéticas: só
// leitura, nada é gravado fora de companion_full_reading_runs.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFullReadingTranscript,
} from './full-reading/transcript.ts'

import {
  buildSuccessorMarkers,
  loadFullReadingCycleChain,
  loadSuccessorNotes,
  mergeChainMessages,
} from '../server/full-reading-cycle-chain.ts'

import {
  executeFullReadingRun,
  loadFullReadingTranscriptMarkers,
} from '../server/full-reading-runner.ts'

import {
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

const COMPANY = '10000000-0000-4000-8000-000000000001'
const NEW_CYCLE = '20000000-0000-4000-8000-000000000002'
const ORIGIN = '20000000-0000-4000-8000-000000000001'
const OTHER_COMPANY = '10000000-0000-4000-8000-000000000009'

function transcriptMessage(overrides = {}) {
  return {
    id: '1',
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: '2026-09-20T12:00:00.000Z',
    content_type: 'text',
    text_content: 'Oi',
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
    ...overrides,
  }
}

function readOnlyAdmin(tables) {
  const reads = []

  function from(table) {
    const filters = []
    let single = false

    const execute = () => {
      reads.push(table)
      const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))

      return single
        ? { data: rows[0] ? structuredClone(rows[0]) : null, error: null }
        : { data: structuredClone(rows), error: null }
    }

    const builder = {
      select() { return builder },
      eq(column, value) { filters.push((row) => row[column] === value); return builder },
      in(column, values) { filters.push((row) => values.includes(row[column])); return builder },
      maybeSingle() { single = true; return builder },
      insert() { throw new Error('a cadeia de ciclos não grava nada') },
      update() { throw new Error('a cadeia de ciclos não grava nada') },
      then(resolve, reject) {
        Promise.resolve().then(() => resolve(execute()), reject)
      },
    }

    return builder
  }

  return { admin: { from }, reads }
}

function chainTables(overrides = {}) {
  return {
    sales_cycles: [
      { id: NEW_CYCLE, company_id: COMPANY, origin_cycle_id: ORIGIN, created_at: '2026-10-01T13:30:00.000Z', opportunity_type: 'upgrade' },
      { id: ORIGIN, company_id: COMPANY, origin_cycle_id: null, created_at: '2026-09-01T12:00:00.000Z', opportunity_type: null },
    ],
    cycle_events: [
      { cycle_id: NEW_CYCLE, company_id: COMPANY, event_type: 'cycle_created', metadata: { source: 'successor_cycle', note: '  Quer   passar para o plano anual  ' } },
      { cycle_id: NEW_CYCLE, company_id: COMPANY, event_type: 'stage_changed', metadata: { note: 'não é a nota' } },
    ],
    ...overrides,
  }
}

test('cadeia: ciclo atual primeiro, depois a origem; para em laço, em outra empresa e no teto', async () => {
  const { admin } = readOnlyAdmin(chainTables())

  const chain =
    await loadFullReadingCycleChain({ admin, companyId: COMPANY, cycleId: NEW_CYCLE })

  assert.deepEqual(chain.map((link) => link.id), [NEW_CYCLE, ORIGIN])
  assert.equal(chain[0].opportunity_type, 'upgrade')

  // Laço (dado ruim): não gira para sempre.
  const loop = readOnlyAdmin(chainTables({
    sales_cycles: [
      { id: NEW_CYCLE, company_id: COMPANY, origin_cycle_id: ORIGIN, created_at: '2026-10-01T13:30:00.000Z', opportunity_type: 'upgrade' },
      { id: ORIGIN, company_id: COMPANY, origin_cycle_id: NEW_CYCLE, created_at: '2026-09-01T12:00:00.000Z', opportunity_type: null },
    ],
  }))

  assert.equal((await loadFullReadingCycleChain({ admin: loop.admin, companyId: COMPANY, cycleId: NEW_CYCLE })).length, 2)

  // Origem de outra empresa não entra.
  const foreign = readOnlyAdmin(chainTables({
    sales_cycles: [
      { id: NEW_CYCLE, company_id: COMPANY, origin_cycle_id: ORIGIN, created_at: '2026-10-01T13:30:00.000Z', opportunity_type: 'upgrade' },
      { id: ORIGIN, company_id: OTHER_COMPANY, origin_cycle_id: null, created_at: '2026-09-01T12:00:00.000Z', opportunity_type: null },
    ],
  }))

  assert.deepEqual(
    (await loadFullReadingCycleChain({ admin: foreign.admin, companyId: COMPANY, cycleId: NEW_CYCLE })).map((link) => link.id),
    [NEW_CYCLE],
  )

  assert.equal((await loadFullReadingCycleChain({ admin, companyId: COMPANY, cycleId: NEW_CYCLE, maxDepth: 1 })).length, 1)
})

test('marco: "Nova oportunidade aberta em <data> · tipo <tipo> · <nota>" só do cycle_created', async () => {
  const { admin } = readOnlyAdmin(chainTables())

  const notes =
    await loadSuccessorNotes({ admin, companyId: COMPANY, cycleIds: [NEW_CYCLE] })

  assert.equal(notes.get(NEW_CYCLE), 'Quer passar para o plano anual')

  const chain =
    await loadFullReadingCycleChain({ admin, companyId: COMPANY, cycleId: NEW_CYCLE })

  assert.deepEqual(buildSuccessorMarkers(chain, notes), [
    {
      occurred_at: '2026-10-01T13:30:00.000Z',
      text: 'Nova oportunidade aberta em 01/10/2026 · tipo Upgrade · Quer passar para o plano anual',
    },
  ])

  // Sem nota: só data e tipo.
  assert.equal(buildSuccessorMarkers(chain)[0].text, 'Nova oportunidade aberta em 01/10/2026 · tipo Upgrade')

  assert.deepEqual(
    await loadFullReadingTranscriptMarkers({ admin, companyId: COMPANY, cycleId: NEW_CYCLE }),
    buildSuccessorMarkers(chain, notes),
  )

  // Ciclo sem origem: nenhum marco.
  assert.deepEqual(await loadFullReadingTranscriptMarkers({ admin, companyId: COMPANY, cycleId: ORIGIN }), [])
})

test('transcrição: o marco entra na ordem do tempo, numa linha própria, e não conta como mensagem', () => {
  const transcript =
    buildFullReadingTranscript(
      [
        transcriptMessage({ id: '1', occurred_at: '2026-09-20T12:00:00.000Z', text_content: 'Quero o plano mensal' }),
        transcriptMessage({ id: '2', direction: 'outgoing', author_kind: 'human_agent', occurred_at: '2026-09-20T12:05:00.000Z', text_content: 'Fechado!' }),
        transcriptMessage({ id: '3', occurred_at: '2026-10-01T14:00:00.000Z', text_content: 'E o anual?' }),
      ],
      {
        markers: [
          { occurred_at: '2026-10-01T13:30:00.000Z', text: 'Nova oportunidade aberta em 01/10/2026 · tipo Upgrade' },
        ],
      },
    )

  assert.equal(transcript.text, [
    '[20/09/2026 09:00] CLIENTE: Quero o plano mensal',
    '[20/09/2026 09:05] VENDEDOR: Fechado!',
    '[01/10/2026 10:30] —— Nova oportunidade aberta em 01/10/2026 · tipo Upgrade ——',
    '[01/10/2026 11:00] CLIENTE: E o anual?',
  ].join('\n'))
  assert.equal(transcript.message_count, 3)
  assert.equal(transcript.first_message_at, '2026-09-20T12:00:00.000Z')
  assert.equal(transcript.last_message_at, '2026-10-01T14:00:00.000Z')

  // Ciclo novo ainda sem mensagem própria: o marco fica no fim.
  const onlyHistory =
    buildFullReadingTranscript(
      [transcriptMessage()],
      { markers: [{ occurred_at: '2026-10-01T13:30:00.000Z', text: 'Nova oportunidade aberta em 01/10/2026' }] },
    )

  assert.match(onlyHistory.text, /CLIENTE: Oi\n\[01\/10\/2026 10:30\] —— Nova oportunidade aberta em 01\/10\/2026 ——$/)
  assert.equal(onlyHistory.message_count, 1)
})

test('mensagens da cadeia: mesma message_key em dois ciclos fica uma vez, na versão mais nova', () => {
  const merged =
    mergeChainMessages([
      [
        { message_key: 'a', version: 1, id: '10' },
        { message_key: 'b', version: 2, id: '11' },
      ],
      [
        { message_key: 'b', version: 1, id: '20' },
        { message_key: 'c', version: 1, id: '21' },
      ],
    ])

  assert.deepEqual(merged.map((message) => message.id).sort(), ['10', '11', '21'])
})

test('prompt v4: o marco é explicado de forma genérica (ciclo anterior encerrado, foco na oportunidade nova)', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v9')

  const system =
    buildFullReadingSystemPrompt()

  assert.match(system, /Se a transcrição tiver o marco "Nova oportunidade aberta em \.\.\.", o ciclo comercial anterior está encerrado/)
  assert.match(system, /O foco da leitura é a oportunidade nova/)
  assert.match(system, /Não trate a venda anterior como venda desta oportunidade/)
})

test('runner: o marco da oportunidade nova chega à transcrição enviada ao Claude', async () => {
  let sentBody = null
  const updates = []

  const admin = {
    from(table) {
      const builder = {
        update(values) { updates.push({ table, values }); return builder },
        eq() { return builder },
        select() { return builder },
        maybeSingle() { return builder },
        then(resolve) { resolve({ data: null, error: null }) },
      }

      return builder
    },
  }

  await executeFullReadingRun({
    admin,
    runId: 'run-successor',
    companyId: COMPANY,
    cycleId: NEW_CYCLE,
    conversationKey: 'phone:5511900000000',
    referenceTime: '2026-10-01T15:00:00.000Z',
    model: 'claude-sonnet-5-5',
    effort: 'high',
    apiKey: 'sk-ant-teste',
    loadMessages: async () => [transcriptMessage({ text_content: 'Quero o plano mensal' })],
    loadMarkers: async () => [{ occurred_at: '2026-10-01T13:30:00.000Z', text: 'Nova oportunidade aberta em 01/10/2026 · tipo Upgrade' }],
    loadConfig: async () => ({ bundle: null, products: [] }),
    loadKanban: async () => null,
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(init.body)

      return new Response(JSON.stringify({ error: { type: 'overloaded_error' } }), { status: 529 })
    },
  })

  assert.ok(sentBody)
  assert.match(sentBody.messages[0].content, /CLIENTE: Quero o plano mensal\n\[01\/10\/2026 10:30\] —— Nova oportunidade aberta em 01\/10\/2026 · tipo Upgrade ——/)
  // Só a tabela de rodadas recebe escrita.
  assert.deepEqual([...new Set(updates.map((update) => update.table))], ['companion_full_reading_runs'])
})
