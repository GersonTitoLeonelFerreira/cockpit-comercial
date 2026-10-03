// Rodada 11 (HML): áudio do WhatsApp e arquivos com "Incluir na leitura".
// Fixtures sintéticas, nenhum dado de cliente.
//
// - A: o áudio com duração entra na transcrição como áudio ("[áudio de
//   0:42] ..."), com ou sem transcrição.
// - B1: a marca de arquivo vira "[arquivo não incluído: tipo, nome]" com
//   uma referência curta (sem a chave da mensagem); a leitura não recebe o
//   conteúdo.
// - B2: "Arquivos na conversa (N)", "Incluir na leitura" e a sugestão da
//   leitura (arquivos_sugeridos).
// - B3: inclusão — só o resumo é guardado, uma vez só, sem número de
//   documento; o resumo entra na leitura como "[arquivo incluído: ...]" e
//   relê (continuação marca a mensagem como atualizada).
// - B4: limites e teto diário.
// - B7: prompt v8 geral; a troca de versão não força releitura.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ATTACHMENT_LIMITS,
  attachmentKindFromName,
  attachmentRef,
  describeAttachmentLine,
  parseAttachmentMarker,
  parseAudioDurationMarker,
} from './full-reading/attachments.ts'

import {
  buildFullReadingTranscript,
  describeMessageContent,
} from './full-reading/transcript.ts'

import {
  splitContinuationMessages,
} from './full-reading/continuation.ts'

import {
  FULL_READING_COMPATIBLE_PROMPT_VERSIONS,
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  buildClaudeRequestBody,
} from './full-reading/anthropic-client.ts'

import {
  ATTACHMENT_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_ATTACHMENT_SUMMARY_MODEL,
  attachmentSummariesAt,
  includeConversationAttachment,
  normalizeAttachmentSummary,
  readReceivedAttachment,
  resolveAttachmentSummaryModel,
} from '../server/full-reading-attachments.ts'

import {
  ATTACHMENTS_UNAVAILABLE_NOTE,
  attachmentLimitText,
  buildAttachmentSuggestionView,
  buildAttachmentsView,
} from '../server/full-reading-attachments-view.ts'

import {
  attachmentPanelStatus,
  buildAgoraFullReadingView,
  buildAnalysisFullReadingView,
  planFullReadingPanel,
  summarizeLedgerActivity,
} from '../server/full-reading-panel.ts'

import {
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

const NOW = '2026-10-01T20:30:00.000Z'
const CYCLE = '9b000000-0000-4000-8000-0000000000c1'
const COMPANY = '9b000000-0000-4000-8000-000000000001'
const USER = '9b000000-0000-4000-8000-0000000000a1'
const CONVERSATION = 'phone:5511900000011'

// Chave sintética no formato do WhatsApp (traz um telefone fictício).
const PDF_KEY = 'false_5511900000011@c.us_SINTETICOPDF01'
const IMG_KEY = 'false_5511900000011@c.us_SINTETICOIMG01'

const minutesBefore = (minutes) =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString()

function message(overrides = {}) {
  return {
    id: overrides.message_key ?? 'm1',
    message_key: 'm1',
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: '2026-10-01T19:59:00.000Z',
    observed_at: '2026-10-01T19:59:30.000Z',
    content_type: 'text',
    text_content: 'Oi',
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// A. Áudio com duração
// ---------------------------------------------------------------------------

test('A: o áudio com duração entra como áudio, com ou sem transcrição', () => {
  assert.equal(parseAudioDurationMarker('[duração 0:42]'), '0:42')
  assert.equal(parseAudioDurationMarker('[duração 12:30]'), '12:30')
  assert.equal(parseAudioDurationMarker('[duração 1:02:03]'), '1:02:03')
  assert.equal(parseAudioDurationMarker('falei [duração 0:42]'), null)

  assert.equal(
    describeMessageContent(message({ content_type: 'audio', text_content: '[duração 0:42]' })),
    '[áudio de 0:42 sem transcrição]',
  )

  assert.equal(
    describeMessageContent(message({ content_type: 'audio', text_content: '[duração 0:42]', audio_transcription: 'Quero o plano anual.' })),
    '[áudio de 0:42] Quero o plano anual.',
  )

  // Áudio antigo (sem duração): como antes.
  assert.equal(
    describeMessageContent(message({ content_type: 'audio', text_content: null, audio_transcription: 'Pode ser amanhã.' })),
    '[áudio] Pode ser amanhã.',
  )
})

test('A2: áudio antigo que chega depois entra na posição dele e a continuação percebe (lê de novo uma vez)', () => {
  const seen = [
    message({ message_key: 't1', occurred_at: '2026-09-29T14:20:00.000Z', text_content: 'Oi' }),
    message({ message_key: 't2', occurred_at: '2026-09-29T14:30:00.000Z', direction: 'outgoing', author_kind: 'human_agent', text_content: 'Já te respondo.' }),
  ]

  const voice = message({ message_key: 'v1', occurred_at: '2026-09-29T14:21:00.000Z', content_type: 'audio', text_content: '[duração 0:42]' })

  const transcript = buildFullReadingTranscript([...seen, voice])

  assert.deepEqual(
    transcript.text.split('\n').map((line) => line.replace(/^\[[^\]]+\] /, '')),
    ['CLIENTE: Oi', 'CLIENTE: [áudio de 0:42 sem transcrição]', 'VENDEDOR: Já te respondo.'],
  )

  const split = splitContinuationMessages({ previous: seen, current: [...seen, voice] })

  assert.equal(split.new_message_count, 1)
  assert.equal(split.older_than_seen, true)
})

// ---------------------------------------------------------------------------
// B1. Marca de arquivo e linha da transcrição
// ---------------------------------------------------------------------------

test('B1: a marca de arquivo é lida (nova e antiga); texto comum não é arquivo', () => {
  assert.deepEqual(
    parseAttachmentMarker('Segue a proposta\n[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB | páginas: 3]'),
    { kind: 'pdf', name: 'Proposta.pdf', size_label: '1,2 MB', pages: 3, caption: 'Segue a proposta' },
  )

  assert.deepEqual(
    parseAttachmentMarker('[Arquivo | tipo: imagem]'),
    { kind: 'imagem', name: null, size_label: null, pages: null, caption: '' },
  )

  // Marca antiga (antes da rodada 11).
  assert.equal(parseAttachmentMarker('[Arquivo: Tabela.xlsx]').kind, 'documento')
  assert.equal(parseAttachmentMarker('[Arquivo: foto.jpeg]').kind, 'imagem')

  for (const text of ['Mandei o [Arquivo: x.pdf] ontem', 'Arquivo: x.pdf', '[Arquivo]', '', null]) {
    assert.equal(parseAttachmentMarker(text), null, String(text))
  }

  assert.equal(attachmentKindFromName('CONTRATO.PDF'), 'pdf')
})

test('B1: a transcrição mostra "[arquivo não incluído: tipo, nome]" com a referência — sem a chave da mensagem nem o conteúdo', () => {
  const pdf = message({
    message_key: PDF_KEY,
    text_content: 'Segue a proposta\n[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB | páginas: 3]',
  })

  const image = message({
    message_key: IMG_KEY,
    occurred_at: '2026-10-01T20:00:00.000Z',
    text_content: '[Arquivo | tipo: imagem]',
  })

  const transcript = buildFullReadingTranscript([pdf, image])

  assert.match(transcript.text, new RegExp(`CLIENTE: \\[arquivo não incluído: PDF, Proposta\\.pdf\\] \\(ref: ${attachmentRef(PDF_KEY)}\\) Legenda: Segue a proposta`))
  assert.match(transcript.text, new RegExp(`CLIENTE: \\[arquivo não incluído: imagem\\] \\(ref: ${attachmentRef(IMG_KEY)}\\)`))
  assert.doesNotMatch(transcript.text, /5511900000011|SINTETICO/)
  assert.doesNotMatch(transcript.text, /tamanho|1,2 MB/)

  // A referência é curta e estável.
  assert.match(attachmentRef(PDF_KEY), /^arq-[0-9a-z]{6,8}$/)
  assert.equal(attachmentRef(PDF_KEY), attachmentRef(PDF_KEY))
  assert.notEqual(attachmentRef(PDF_KEY), attachmentRef(IMG_KEY))

  // Incluído: o resumo entra no lugar.
  assert.equal(
    describeMessageContent({ ...pdf, attachment_summary: 'Proposta do plano anual, R$ 100,00 por mês.' }),
    `[arquivo incluído: Proposta do plano anual, R$ 100,00 por mês.] (ref: ${attachmentRef(PDF_KEY)}) Legenda: Segue a proposta`,
  )

  assert.equal(
    describeAttachmentLine({ attachment: parseAttachmentMarker('[Arquivo: Tabela.xlsx]'), ref: 'arq-000001', summary: null }),
    '[arquivo não incluído: documento, Tabela.xlsx] (ref: arq-000001)',
  )
})

// ---------------------------------------------------------------------------
// B7. Prompt v8 e arquivos_sugeridos
// ---------------------------------------------------------------------------

test('B7: prompt v8 geral — linhas de áudio e arquivo, nunca adivinhar, arquivos_sugeridos; v7 e v6 continuam valendo', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v10')
  assert.deepEqual(FULL_READING_COMPATIBLE_PROMPT_VERSIONS, ['full-reading-v10', 'full-reading-v9', 'full-reading-v8', 'full-reading-v7', 'full-reading-v6'])

  const system = buildFullReadingSystemPrompt()

  assert.match(system, /\[áudio de 0:42\] texto/)
  assert.match(system, /\[arquivo não incluído: tipo, nome\] \(ref: \.\.\.\)/)
  assert.match(system, /não adivinhe nem descreva o que ele traz/)
  assert.match(system, /\[arquivo incluído: resumo\]/)
  assert.match(system, /arquivos_sugeridos lista até 2 arquivos não incluídos/)

  // Geral: nada do caso real.
  assert.doesNotMatch(system, /Proposta\.pdf|SINTETICO/)

  assert.ok(FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao.required.includes('arquivos_sugeridos'))
})

test('B2: arquivos_sugeridos — ref no formato, sem repetição, até 2; formato errado vira lista vazia', () => {
  const read = (value) =>
    parseFullReadingOutput(JSON.stringify({ decisao: { ...decision(), arquivos_sugeridos: value } })).decisao.arquivos_sugeridos

  assert.deepEqual(
    read([
      { ref: 'ARQ-00abc1', motivo: '  A proposta   define o valor. ' },
      { ref: 'arq-00abc1', motivo: 'repetida' },
      { ref: 'mensagem-123', motivo: 'chave crua' },
      { ref: 'arq-00abc2', motivo: 'O comprovante confirma o pagamento.' },
      { ref: 'arq-00abc3', motivo: 'terceira' },
    ]),
    [
      { ref: 'arq-00abc1', motivo: 'A proposta define o valor.' },
      { ref: 'arq-00abc2', motivo: 'O comprovante confirma o pagamento.' },
    ],
  )

  assert.deepEqual(read('arq-00abc1'), [])
  assert.deepEqual(read(undefined), [])
})

// ---------------------------------------------------------------------------
// B2. Painel
// ---------------------------------------------------------------------------

function panelAttachment(overrides = {}) {
  return {
    message_key: PDF_KEY,
    ref: attachmentRef(PDF_KEY),
    kind: 'pdf',
    name: 'Proposta.pdf',
    size_label: '1,2 MB',
    pages: 3,
    occurred_at: '2026-10-01T19:59:00.000Z',
    from: 'cliente',
    status: 'nao_incluido',
    ...overrides,
  }
}

test('B2: Análise — "Arquivos na conversa (N)" com "Incluir na leitura" só em imagem e PDF dentro dos limites', () => {
  const view = buildAttachmentsView({
    available: true,
    attachments: [
      panelAttachment(),
      panelAttachment({ message_key: IMG_KEY, ref: attachmentRef(IMG_KEY), kind: 'imagem', name: null, size_label: null, pages: null, from: 'vendedor', status: 'incluido' }),
      panelAttachment({ message_key: 'doc', ref: attachmentRef('doc'), kind: 'documento', name: 'Tabela.xlsx', pages: null }),
      panelAttachment({ message_key: 'grande', ref: attachmentRef('grande'), name: 'Contrato.pdf', pages: 25 }),
      panelAttachment({ message_key: 'falha', ref: attachmentRef('falha'), status: 'falhou' }),
    ],
  })

  assert.equal(view.title, 'Arquivos na conversa (5)')
  assert.equal(view.note, null)

  const [pdf, image, doc, big, failed] = view.items

  assert.deepEqual(
    { kind_label: pdf.kind_label, when: pdf.when_label, from: pdf.from_label, can: pdf.can_include, label: pdf.include_label, status: pdf.status_text },
    { kind_label: 'PDF', when: '01/10 16:59', from: 'Cliente', can: true, label: 'Incluir na leitura', status: null },
  )

  assert.equal(image.can_include, false)
  assert.equal(image.status_text, 'Incluído na leitura')
  assert.equal(doc.can_include, false)
  assert.equal(doc.status_text, 'Este tipo de arquivo não pode ser incluído na leitura.')
  assert.equal(big.can_include, false)
  assert.equal(big.status_text, 'PDF com mais de 20 páginas: não é enviado.')
  assert.equal(failed.include_label, 'Tentar de novo')

  // Sem a tabela (defesa: banco sem a migração): a lista aparece, sem botão.
  const unavailable = buildAttachmentsView({ available: false, attachments: [panelAttachment()] })

  assert.equal(unavailable.items[0].can_include, false)
  assert.equal(unavailable.note, ATTACHMENTS_UNAVAILABLE_NOTE)

  assert.equal(buildAttachmentsView({ available: true, attachments: [] }), null)
})

test('B4: limites no painel — imagem até 5 MB, PDF até 10 MB e 20 páginas (acima de 3 MB ainda não envia)', () => {
  assert.equal(attachmentLimitText({ kind: 'imagem', size_label: '4,9 MB', pages: null }), null)
  assert.equal(attachmentLimitText({ kind: 'imagem', size_label: '6 MB', pages: null }), 'Imagem acima de 5 MB: não é enviada.')
  assert.equal(attachmentLimitText({ kind: 'pdf', size_label: '900 kB', pages: 20 }), null)
  assert.equal(attachmentLimitText({ kind: 'pdf', size_label: '900 kB', pages: 21 }), 'PDF com mais de 20 páginas: não é enviado.')
  assert.equal(attachmentLimitText({ kind: 'pdf', size_label: '11 MB', pages: null }), 'PDF acima de 10 MB: não é enviado.')
  assert.equal(attachmentLimitText({ kind: 'pdf', size_label: '4 MB', pages: null }), 'PDF acima de 3 MB: ainda não pode ser enviado.')
  assert.equal(attachmentLimitText({ kind: 'pdf', size_label: null, pages: null }), null)
  assert.equal(ATTACHMENT_LIMITS.image_max_bytes, 5 * 1024 * 1024)
  assert.equal(ATTACHMENT_LIMITS.pdf_max_bytes, 10 * 1024 * 1024)
  assert.equal(ATTACHMENT_LIMITS.pdf_max_pages, 20)
})

test('B2: Agora — "A leitura sugere incluir: PDF de 01/10 16:59 — <motivo>" (só arquivo ainda não incluído)', () => {
  const suggestion = buildAttachmentSuggestionView({
    available: true,
    attachments: [panelAttachment()],
    suggestions: [{ ref: attachmentRef(PDF_KEY), motivo: 'A proposta traz o valor combinado.' }],
  })

  assert.deepEqual(suggestion, {
    message_key: PDF_KEY,
    kind: 'pdf',
    text: 'A leitura sugere incluir: PDF de 01/10 16:59 — A proposta traz o valor combinado.',
    can_include: true,
  })

  assert.equal(
    buildAttachmentSuggestionView({
      available: true,
      attachments: [panelAttachment({ status: 'incluido' })],
      suggestions: [{ ref: attachmentRef(PDF_KEY), motivo: 'x' }],
    }),
    null,
  )

  assert.equal(
    buildAttachmentSuggestionView({ available: true, attachments: [panelAttachment()], suggestions: [{ ref: 'arq-zzzzzz', motivo: 'x' }] }),
    null,
  )
})

test('B2: o painel liga a lista e a sugestão às views (Agora e Análise), com a chave da view mudando', () => {
  const snapshot = {
    state: 'ready',
    reading: {
      run_id: 'run-a',
      completed_at: minutesBefore(10),
      analysis_markdown: null,
      decision: {
        ...decision({ arquivos_sugeridos: [{ ref: attachmentRef(PDF_KEY), motivo: 'A proposta traz o valor.' }] }),
        sistema: { kanban_lido: { status: 'negociacao', stage_entered_at: minutesBefore(600) }, alertas: [], saida_estruturada: false, modo: 'completa', leitura_base: null, motivo: ['sem_leitura'], continuacoes_seguidas: 0, cadeia: [CYCLE] },
      },
    },
    failure_code: null,
    kanban: { status: 'negociacao', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null },
    last_customer_message_at: minutesBefore(30),
    last_message_at: minutesBefore(30),
    attachments: [panelAttachment()],
    attachments_available: true,
  }

  const agora = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(agora.attachment_suggestion.text, 'A leitura sugere incluir: PDF de 01/10 16:59 — A proposta traz o valor.')
  assert.match(agora.view_key, /\|arq:/)

  const analysis = buildAnalysisFullReadingView(snapshot)

  assert.equal(analysis.attachments.title, 'Arquivos na conversa (1)')

  // Sem arquivos: as views ficam como antes.
  const plain = buildAnalysisFullReadingView({ ...snapshot, attachments: [] })

  assert.equal(plain.attachments, undefined)
})

test('B2: o ledger dá a lista de arquivos (última versão de cada mensagem; apagada sai)', () => {
  const activity = summarizeLedgerActivity([
    { message_key: PDF_KEY, direction: 'incoming', author_kind: 'customer', occurred_at: '2026-10-01T19:59:00.000Z', observed_at: '2026-10-01T19:59:30.000Z', content_type: 'text', text_content: '[Arquivo: Proposta.pdf]', audio_transcription: null, is_deleted: false },
    { message_key: PDF_KEY, direction: 'incoming', author_kind: 'customer', occurred_at: '2026-10-01T19:59:00.000Z', observed_at: '2026-10-01T20:05:00.000Z', content_type: 'text', text_content: '[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB | páginas: 3]', audio_transcription: null, is_deleted: false },
    { message_key: 'apagada', direction: 'incoming', author_kind: 'customer', occurred_at: '2026-10-01T19:50:00.000Z', observed_at: '2026-10-01T19:51:00.000Z', content_type: 'text', text_content: '[Arquivo | tipo: imagem]', audio_transcription: null, is_deleted: false },
    { message_key: 'apagada', direction: 'incoming', author_kind: 'customer', occurred_at: '2026-10-01T19:50:00.000Z', observed_at: '2026-10-01T19:55:00.000Z', content_type: 'text', text_content: '[Arquivo | tipo: imagem]', audio_transcription: null, is_deleted: true },
    { message_key: 'texto', direction: 'outgoing', author_kind: 'human_agent', occurred_at: '2026-10-01T19:58:00.000Z', observed_at: '2026-10-01T19:58:10.000Z', content_type: 'text', text_content: 'Oi', audio_transcription: null, is_deleted: false },
  ])

  assert.equal(activity.attachments.length, 1)
  assert.equal(activity.attachments[0].message_key, PDF_KEY)
  assert.equal(activity.attachments[0].parsed.pages, 3)
})

test('B3: "resumindo" parado há mais de 2 minutos aparece como falha (pode tentar de novo)', () => {
  assert.equal(attachmentPanelStatus(undefined, NOW), 'nao_incluido')
  assert.equal(attachmentPanelStatus({ status: 'resumindo', requested_at: minutesBefore(1) }, NOW), 'resumindo')
  assert.equal(attachmentPanelStatus({ status: 'resumindo', requested_at: minutesBefore(3) }, NOW), 'falhou')
  assert.equal(attachmentPanelStatus({ status: 'incluido', requested_at: minutesBefore(30) }, NOW), 'incluido')
})

// ---------------------------------------------------------------------------
// B3. Releitura depois de incluir
// ---------------------------------------------------------------------------

function decision(overrides = {}) {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'O cliente mandou a proposta e espera resposta.',
    cliente: { sabemos: ['Mandou a proposta (01/10)'], inferimos: [], a_confirmar: [] },
    pendencias: [{ de: 'vendedor', texto: 'Responder sobre a proposta' }],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: 'Interessado.', passos: [], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Responder sobre a proposta.',
    por_que: 'O cliente mandou o arquivo.',
    proximo_passo_titulo: 'Responder sobre a proposta',
    proximo_passo_complemento: '',
    mensagem_sugerida: 'Oi! Recebi a proposta.',
    mensagem_observacao: '',
    conducao: { acertos: [], ajustes: [] },
    para_o_gestor: [],
    etapa_kanban_sugerida: 'negociacao',
    motivo_etapa: 'Mandou a proposta.',
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
    ...overrides,
  }
}

function run(overrides = {}) {
  return {
    run_id: 'run-a',
    cycle_id: CYCLE,
    status: 'succeeded',
    prompt_version: 'full-reading-v7',
    reference_time: minutesBefore(30),
    created_at: minutesBefore(30),
    started_at: minutesBefore(30),
    completed_at: minutesBefore(29),
    failure_code: null,
    failure_detail: null,
    analysis_markdown: null,
    decision: {
      ...decision(),
      sistema: { kanban_lido: { status: 'negociacao', stage_entered_at: minutesBefore(600) }, alertas: [], saida_estruturada: false, modo: 'completa', leitura_base: null, motivo: ['sem_leitura'], continuacoes_seguidas: 0, cadeia: [CYCLE] },
    },
    ...overrides,
  }
}

const KANBAN = { status: 'negociacao', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null }

test('B3/B7: arquivo incluído depois da leitura relê uma vez (arquivo_incluido); leitura v7 continua valendo sem isso', () => {
  const base = {
    runs: [run()],
    cycleId: CYCLE,
    kanban: KANBAN,
    latestObservedAt: minutesBefore(40),
    latestCustomerObservedAt: minutesBefore(40),
    force: false,
    now: NOW,
  }

  const untouched = planFullReadingPanel(base)

  assert.equal(untouched.action, 'use')
  assert.deepEqual(untouched.stale_reasons, [])

  const included = planFullReadingPanel({ ...base, latestAttachmentIncludedAt: minutesBefore(2) })

  assert.equal(included.action, 'start')
  assert.deepEqual(included.stale_reasons, ['arquivo_incluido'])

  // Resumo de antes da leitura: já estava nela.
  const older = planFullReadingPanel({ ...base, latestAttachmentIncludedAt: minutesBefore(45) })

  assert.equal(older.action, 'use')
})

test('B3: a leitura recebe "[arquivo incluído: <resumo>]" — e, na continuação, a mensagem do arquivo vem como atualizada', async () => {
  const filler = ' Assunto sintético do pedido, do prazo e da forma de pagamento.'.repeat(30)

  const messages = Array.from({ length: 60 }, (_, index) =>
    message({
      id: String(index + 1),
      message_key: `k${String(index + 1).padStart(3, '0')}`,
      direction: index % 2 === 0 ? 'outgoing' : 'incoming',
      author_kind: index % 2 === 0 ? 'human_agent' : 'customer',
      occurred_at: minutesBefore(600 - index * 8),
      observed_at: minutesBefore(600 - index * 8),
      text_content: `Mensagem sintética ${index + 1}.${filler}`,
    }))

  messages.push(message({
    id: 'pdf',
    message_key: PDF_KEY,
    occurred_at: minutesBefore(100),
    observed_at: minutesBefore(100),
    text_content: 'Segue a proposta\n[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB | páginas: 3]',
  }))

  const bodies = []
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

  const original = console.info
  console.info = () => {}

  try {
    await executeFullReadingRun({
      admin,
      runId: 'run-new',
      companyId: COMPANY,
      cycleId: CYCLE,
      conversationKey: CONVERSATION,
      referenceTime: NOW,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'chave-sintetica',
      logger: () => {},
      baseRun: { run_id: 'run-base', reference_time: minutesBefore(30), completed_at: minutesBefore(29), decision: run().decision },
      reasons: ['arquivo_incluido'],
      loadMessages: async ({ referenceTime }) =>
        messages.filter((item) => Date.parse(item.observed_at) <= Date.parse(referenceTime)),
      loadChain: async () => [CYCLE],
      loadConfig: async () => ({ bundle: null, products: [] }),
      loadKanban: async () => null,
      loadAttachments: async () => [{
        message_key: PDF_KEY,
        kind: 'pdf',
        file_name: 'Proposta.pdf',
        status: 'incluido',
        summary: 'Proposta do plano anual: R$ 100,00 por mês, válida até 10/10.',
        failure_code: null,
        requested_at: minutesBefore(3),
        summarized_at: minutesBefore(2),
      }],
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        return new Response(JSON.stringify({
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: JSON.stringify({ decisao: decision() }) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })
  } finally {
    console.info = original
  }

  assert.equal(bodies.length, 1)

  const content = bodies[0].messages[0].content

  assert.match(content, /<mensagens_novas>/)
  assert.match(content, /\(atualizada\) \[arquivo incluído: Proposta do plano anual: R\$ 100,00 por mês, válida até 10\/10\.\] \(ref: arq-/)
  assert.doesNotMatch(content, /5511900000011@c\.us|SINTETICOPDF/)

  // Resumo de depois do momento de referência não entra.
  const summaries = attachmentSummariesAt([
    { message_key: PDF_KEY, status: 'incluido', summary: 'x', summarized_at: minutesBefore(2) },
    { message_key: IMG_KEY, status: 'incluido', summary: 'y', summarized_at: minutesBefore(-5) },
    { message_key: 'falhou', status: 'falhou', summary: null, summarized_at: null },
  ], NOW)

  assert.deepEqual([...summaries.keys()], [PDF_KEY])
})

// ---------------------------------------------------------------------------
// B3/B4. Inclusão: arquivo recebido, resumo, gravação
// ---------------------------------------------------------------------------

function pdfBytes(pages = 1, padding = 0) {
  const body = Array.from({ length: pages }, (_, index) => `${index + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n')
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count ${pages} >> endobj\n${body}\n${' '.repeat(padding)}%%EOF`, 'latin1')
}

test('B4: o servidor confere o arquivo — tipo, PDF de verdade, até 20 páginas e até 3 MB enviados', () => {
  const ok = readReceivedAttachment({ kind: 'pdf', mediaType: 'application/pdf', contentBase64: pdfBytes(3).toString('base64') })

  assert.equal(ok.kind, 'pdf')
  assert.equal(ok.page_count, 3)

  const reject = (input, code) =>
    assert.throws(() => readReceivedAttachment(input), (error) => error.code === code, code)

  reject({ kind: 'pdf', mediaType: 'application/pdf', contentBase64: pdfBytes(21).toString('base64') }, 'ATTACHMENT_TOO_MANY_PAGES')
  reject({ kind: 'pdf', mediaType: 'application/pdf', contentBase64: pdfBytes(1, ATTACHMENT_LIMITS.upload_max_bytes + 10).toString('base64') }, 'ATTACHMENT_TOO_LARGE')
  reject({ kind: 'pdf', mediaType: 'application/pdf', contentBase64: Buffer.from('não é pdf').toString('base64') }, 'ATTACHMENT_CONTENT_INVALID')
  reject({ kind: 'documento', mediaType: 'application/vnd.ms-excel', contentBase64: 'AAAA' }, 'ATTACHMENT_KIND_NOT_SUPPORTED')
  reject({ kind: 'video', mediaType: 'video/mp4', contentBase64: 'AAAA' }, 'ATTACHMENT_KIND_INVALID')
  reject({ kind: 'imagem', mediaType: 'image/svg+xml', contentBase64: 'AAAA' }, 'ATTACHMENT_CONTENT_INVALID')
  reject({ kind: 'imagem', mediaType: 'image/png', contentBase64: 'não-base64!' }, 'ATTACHMENT_CONTENT_INVALID')
  reject({ kind: 'imagem', mediaType: 'image/png', contentBase64: '' }, 'ATTACHMENT_CONTENT_MISSING')

  const image = readReceivedAttachment({ kind: 'imagem', mediaType: 'image/jpeg', contentBase64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64') })

  assert.equal(image.media_type, 'image/jpeg')
})

test('B3: modelo do resumo — o mais barato que lê imagem e PDF, configurável por variável', () => {
  assert.equal(DEFAULT_ATTACHMENT_SUMMARY_MODEL, 'claude-haiku-4-5')
  assert.equal(resolveAttachmentSummaryModel({}), 'claude-haiku-4-5')
  assert.equal(resolveAttachmentSummaryModel({ COMPANION_ATTACHMENT_SUMMARY_MODEL: 'claude-sonnet-5-5' }), 'claude-sonnet-5-5')
  assert.equal(resolveAttachmentSummaryModel({ COMPANION_ATTACHMENT_SUMMARY_MODEL: 'x; rm' }), 'claude-haiku-4-5')
})

test('B3: o resumo nunca traz CPF, documento, cartão ou dados bancários; prompt geral e factual', () => {
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /Nunca escreva CPF, RG, CNH, CNPJ/)
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /número de cartão/)
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /dados bancários/)
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /Não invente/)
  assert.doesNotMatch(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /WhatsApp|ManyChat/)

  const summary = normalizeAttachmentSummary(
    '**Comprovante** de pagamento do plano anual. CPF 123.456.789-00, CNPJ 12.345.678/0001-90, cartão 4111 1111 1111 1111, agência 1234 conta 56789-0. Valor R$ 1.200,00 em 01/10/2026.',
  )

  assert.doesNotMatch(summary, /123\.456\.789-00|12\.345\.678\/0001-90|4111 1111|56789-0|\*\*/)
  assert.match(summary, /Valor R\$ 1\.200,00 em 01\/10\/2026/)
  assert.match(summary, /\[dado pessoal omitido\]/)
})

test('B3: a requisição do resumo manda o arquivo antes do texto, sem raciocínio estendido', () => {
  const body = buildClaudeRequestBody({
    model: 'claude-haiku-4-5',
    system: 'sistema',
    userText: 'Resuma este arquivo.',
    userContent: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AAAA' } }],
    thinking: 'off',
    maxTokens: 600,
    effort: null,
    outputSchema: null,
  }, { structured: false })

  assert.equal(body.thinking, undefined)
  assert.deepEqual(body.messages[0].content.map((block) => block.type), ['document', 'text'])

  // A leitura continua com o raciocínio adaptativo e texto simples.
  const reading = buildClaudeRequestBody({ model: 'claude-sonnet-5-5', system: 's', userText: 't', maxTokens: 10, effort: 'high', outputSchema: null }, { structured: false })

  assert.deepEqual(reading.thinking, { type: 'adaptive' })
  assert.equal(reading.messages[0].content, 't')
})

// Cliente falso: guarda o que foi gravado e responde às consultas.
function fakeAdmin({
  ledger = [{ message_key: PDF_KEY }],
  existing = [],
  missingTable = false,
  todayAttachments = [],
} = {}) {
  const writes = []

  return {
    writes,
    from(table) {
      const filters = []
      let op = 'select'
      let payload = null

      const result = () => {
        if (table === 'companion_conversation_attachments' && missingTable) {
          return { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }
        }

        if (op !== 'select') {
          writes.push({ table, op, payload, filters: [...filters] })
          return { data: null, error: null }
        }

        if (table === 'conversation_messages') {
          return { data: ledger.filter((row) => filters.every(([column, value]) => column !== 'message_key' || row.message_key === value)), error: null }
        }

        if (filters.some(([column]) => column === 'requested_at')) {
          return { data: todayAttachments, error: null }
        }

        return { data: existing, error: null }
      }

      const chain = {
        select() { return chain },
        insert(values) { op = 'insert'; payload = values; return chain },
        update(values) { op = 'update'; payload = values; return chain },
        delete() { throw new Error('delete não é usado') },
        eq(column, value) { filters.push([column, value]); return chain },
        gte(column, value) { filters.push([column, value]); return chain },
        limit() { return chain },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }

      return chain
    },
  }
}

function includeInput(admin, overrides = {}) {
  const calls = []

  return {
    calls,
    input: {
      admin,
      scope: { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION },
      userId: USER,
      messageKey: PDF_KEY,
      fileName: 'Proposta.pdf',
      sizeBytes: 1200,
      kind: 'pdf',
      mediaType: 'application/pdf',
      contentBase64: pdfBytes(2).toString('base64'),
      apiKey: 'chave-sintetica',
      model: 'claude-haiku-4-5',
      dailyCap: 10,
      since: '2026-10-01T03:00:00.000Z',
      countRunsToday: async () => 0,
      now: () => NOW,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return new Response(JSON.stringify({
          model: 'claude-haiku-4-5',
          content: [{ type: 'text', text: 'Proposta do plano anual: R$ 100,00 por mês. CPF 123.456.789-00.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1500, output_tokens: 60 },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
      ...overrides,
    },
  }
}

test('B3: incluir — uma chamada ao modelo, só o resumo gravado (sem o arquivo), com modelo, tokens e quem incluiu', async () => {
  const admin = fakeAdmin()
  const { input, calls } = includeInput(admin)
  const originalInfo = console.info
  console.info = () => {}

  let result

  try {
    result = await includeConversationAttachment(input)
  } finally {
    console.info = originalInfo
  }

  assert.equal(result.status, 'incluido')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.model, 'claude-haiku-4-5')
  assert.equal(calls[0].body.messages[0].content[0].type, 'document')

  const [claim, done] = admin.writes

  assert.equal(claim.op, 'insert')
  assert.equal(claim.payload.status, 'resumindo')
  assert.equal(claim.payload.included_by, USER)
  assert.equal(claim.payload.kind, 'pdf')
  assert.equal(claim.payload.page_count, 2)

  assert.equal(done.op, 'update')
  assert.equal(done.payload.status, 'incluido')
  assert.equal(done.payload.model, 'claude-haiku-4-5')
  assert.equal(done.payload.input_tokens, 1500)
  assert.equal(done.payload.output_tokens, 60)
  assert.match(done.payload.summary, /^Proposta do plano anual: R\$ 100,00 por mês\./)
  assert.doesNotMatch(done.payload.summary, /123\.456\.789-00/)

  // Nada do arquivo vai para o banco.
  const stored = JSON.stringify(admin.writes.map((write) => write.payload))

  assert.doesNotMatch(stored, new RegExp(input.contentBase64.slice(0, 24).replace(/[+/]/g, '\\$&')))
  assert.doesNotMatch(stored, /content_base64|"bytes"|"data"/)
})

test('B3: já incluído não chama o modelo de novo; outro pedido em andamento espera', async () => {
  const done = fakeAdmin({ existing: [{ id: 'a1', status: 'incluido', summary: 'Resumo já feito.', requested_at: minutesBefore(60) }] })
  const first = includeInput(done)

  assert.deepEqual(await includeConversationAttachment(first.input), { status: 'ja_incluido', message_key: PDF_KEY, summary: 'Resumo já feito.' })
  assert.equal(first.calls.length, 0)
  assert.equal(done.writes.length, 0)

  const busy = fakeAdmin({ existing: [{ id: 'a1', status: 'resumindo', summary: null, requested_at: minutesBefore(1) }] })
  const second = includeInput(busy)

  await assert.rejects(includeConversationAttachment(second.input), (error) => error.code === 'ATTACHMENT_IN_PROGRESS' && error.status === 409)
  assert.equal(second.calls.length, 0)
})

test('B4: cada resumo conta no teto diário de leituras', async () => {
  const admin = fakeAdmin({ todayAttachments: [{ status: 'incluido', input_tokens: 900 }, { status: 'incluido', input_tokens: 800 }] })
  const { input, calls } = includeInput(admin, { dailyCap: 5, countRunsToday: async () => 3 })

  await assert.rejects(includeConversationAttachment(input), (error) => error.code === 'DAILY_CAP_REACHED' && error.status === 429)
  assert.equal(calls.length, 0)
  assert.equal(admin.writes.length, 0)
})

test('B5: sem a tabela (defesa: banco sem a migração) nada é chamado nem gravado; arquivo fora do ledger é recusado', async () => {
  const missing = fakeAdmin({ missingTable: true })
  const first = includeInput(missing)

  await assert.rejects(includeConversationAttachment(first.input), (error) => error.code === 'ATTACHMENTS_UNAVAILABLE' && error.status === 409)
  assert.equal(first.calls.length, 0)

  const elsewhere = fakeAdmin({ ledger: [] })
  const second = includeInput(elsewhere)

  await assert.rejects(includeConversationAttachment(second.input), (error) => error.code === 'ATTACHMENT_MESSAGE_NOT_FOUND' && error.status === 404)
  assert.equal(second.calls.length, 0)
})

test('B3: falha do modelo marca "falhou" (o vendedor pode tentar de novo) e não grava resumo', async () => {
  const admin = fakeAdmin()
  const { input } = includeInput(admin, {
    fetchImpl: async () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'x' } }), { status: 400, headers: { 'content-type': 'application/json' } }),
  })

  const originalInfo = console.info
  console.info = () => {}

  try {
    await assert.rejects(includeConversationAttachment(input), (error) => error.status === 502)
  } finally {
    console.info = originalInfo
  }

  const last = admin.writes[admin.writes.length - 1]

  assert.equal(last.payload.status, 'falhou')
  assert.equal(last.payload.summary, undefined)
})

test('B3: o servidor nunca baixa um endereço — a rota só recebe o arquivo', () => {
  const route = readFileSync(new URL('../../api/companion/full-reading/attachments/route.ts', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../server/full-reading-attachments.ts', import.meta.url), 'utf8')

  for (const source of [route, server]) {
    assert.doesNotMatch(source, /\bsource_url\b|\bfile_url\b|new URL\(/)
  }

  // Rodada 16: a rota existe com a flag 'on' e, depois do token, vale a
  // regra por usuário.
  assert.match(route, /COMPANION_FULL_READING_PANEL === 'on'/)
  assert.match(route, /isFullReadingEnabledForUser\(\{ userId: token\.sub \}\)/)
  assert.match(route, /resolveCompanionLeadIdentity/)
})
