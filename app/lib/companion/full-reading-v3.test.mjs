// Leitura completa v3: regra de contradição com o cadastro, cliente em
// fatos/inferências/a confirmar, fechamento codificado, ANÁLISE sem
// duplicação e o painel inteiro (MENSAGEM, resumo, CLIENTE, ícone)
// alinhado à leitura. Fixtures sintéticas; o Claude é simulado.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FULL_READING_PAYMENT_METHOD_CODES,
  FULL_READING_PAYMENT_TYPE_CODES,
  FullReadingOutputError,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  FULL_READING_MESSAGE_JSON_SCHEMA,
  buildFullReadingMessageSystemPrompt,
  parseFullReadingMessageOutput,
} from './full-reading/message-prompt.ts'

import {
  FULL_READING_NO_SEND_NOTICE,
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
  parseFullReadingAnalysisSections,
  stripConfirmationList,
} from '../server/full-reading-panel-view.ts'

import {
  FullReadingMessageError,
  decisionForMessagePrompt,
  generateFullReadingMessage,
  resolveFullReadingMessageEffort,
} from '../server/full-reading-message.ts'

const CYCLE = '20000000-0000-4000-8000-000000000001'
const NOW = '2026-10-01T15:00:00.000Z'

function decision(overrides = {}) {
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
      produto: 'Plano Sintético Duo',
      valor: 'R$ 149,90 para os dois (R$ 74,95 cada)',
      forma_pagamento: 'Cartão, com débito mês a mês',
      motivo_perda: '',
      valor_total: '149,90',
      forma_pagamento_codigo: 'credito',
      tipo_pagamento_codigo: 'recorrente',
    },
    cliente: {
      sabemos: ['Usa o serviço desde 20/09.'],
      inferimos: ['Deve renovar no fim do mês (pagamento recorrente).'],
      a_confirmar: ['Se o plano inclui o adicional.'],
    },
    oportunidades: [],
    afirmacoes_a_confirmar: ['O vendedor disse que o plano inclui o adicional.'],
    alertas_de_captura: [],
    confianca_geral: 'alta',
    sistema: {
      kanban_lido: { status: 'novo', stage_entered_at: null },
      alertas: [],
      saida_estruturada: true,
    },
    ...overrides,
  }
}

const MARKDOWN = [
  '### Agora',
  '- Situação: x',
  '### Fase da relação e etapa do método',
  'Cliente ativa.',
  '### Condução do vendedor: acertos e ajustes',
  '- Acertos: respondeu rápido.',
  '- Ajustes: confirmar a regra antes de prometer.',
  '- Afirmações a confirmar:',
  '  - O plano inclui o adicional.',
  '  - A cobrança é no dia 5.',
  '- Postura: cordial.',
  '### Mensagem sugerida',
  'Não enviar nada agora. A cliente não deixou pergunta.',
].join('\n')

function reading(decisionOverrides = {}, markdown = MARKDOWN) {
  return {
    run_id: 'run-v3',
    completed_at: '2026-10-01T14:05:00.000Z',
    analysis_markdown: markdown,
    decision: decision(decisionOverrides),
  }
}

function agora({ decisionOverrides = {}, markdown = MARKDOWN, kanbanOverrides = {}, state = 'ready' } = {}) {
  return buildFullReadingAgoraView({
    state,
    reading: reading(decisionOverrides, markdown),
    failureCode: state === 'failed' ? 'X' : null,
    kanban: {
      status: 'novo',
      stage_entered_at: '2026-09-20T12:00:00.000Z',
      next_action: null,
      next_action_date: null,
      closed_at: null,
      ...kanbanOverrides,
    },
    cycleId: CYCLE,
    lastCustomerMessageAt: null,
  })
}

// ---------------------------------------------------------------------------
// Prompt e saída v3
// ---------------------------------------------------------------------------

test('prompt v3: contradição com o cadastro que muda o que o cliente paga ou recebe entra na Ação', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v3')

  const system =
    buildFullReadingSystemPrompt()

  assert.match(system, /contradiz o cadastro oficial e muda o que o cliente paga ou recebe \(preço, o que o plano inclui, regra de cobrança\)/)
  assert.match(system, /entra na Ação principal/)
  assert.match(system, /acao_agora "verificacao_interna" quando ela for a ação principal/)
  assert.match(system, /Se o cadastro estiver certo, corrigir a informação com o cliente é o próximo passo/)
  // Códigos de pagamento sem adivinhar.
  assert.match(system, /"debito" só quando a conversa disser cartão de débito, cobrança mensal no cartão de crédito é "credito", e na dúvida é texto vazio/)
  assert.match(system, /cliente separa, em frases curtas e com data quando houver: sabemos/)
  // Afirmações a confirmar ficam só no campo próprio.
  assert.match(system, /as afirmações a confirmar vão só no campo afirmacoes_a_confirmar/)
  assert.match(system, /### Mensagem sugerida\n\(somente o texto pronto para o vendedor enviar/)
})

test('prompt v3: regras genéricas, sem dicas do caso de teste', () => {
  const system =
    buildFullReadingSystemPrompt() + buildFullReadingMessageSystemPrompt()

  for (const hint of [/academia/i, /209/, /74,95/, /muscula/i, /\bduo\b/i]) {
    assert.doesNotMatch(system, hint)
  }
})

test('esquema v3: cliente e códigos obrigatórios; códigos aceitam texto vazio', () => {
  const decisionSchema =
    FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao

  assert.ok(decisionSchema.required.includes('cliente'))
  assert.deepEqual(decisionSchema.properties.cliente.required, ['sabemos', 'inferimos', 'a_confirmar'])
  assert.equal(decisionSchema.properties.cliente.additionalProperties, false)

  const closing =
    decisionSchema.properties.fechamento.properties

  assert.deepEqual(closing.forma_pagamento_codigo.enum, [...FULL_READING_PAYMENT_METHOD_CODES])
  assert.deepEqual(closing.tipo_pagamento_codigo.enum, [...FULL_READING_PAYMENT_TYPE_CODES])
  assert.ok(closing.forma_pagamento_codigo.enum.includes(''))
  assert.ok(closing.tipo_pagamento_codigo.enum.includes(''))
  assert.equal(closing.valor_total.type, 'string')
})

test('parser v3: "débito mês a mês" no cartão de crédito chega como credito; o texto nunca vira código', () => {
  const parsed =
    parseFullReadingOutput(JSON.stringify({ analise_markdown: MARKDOWN, decisao: decision() }))

  assert.equal(parsed.decisao.fechamento.forma_pagamento, 'Cartão, com débito mês a mês')
  assert.equal(parsed.decisao.fechamento.forma_pagamento_codigo, 'credito')
  assert.equal(parsed.decisao.fechamento.tipo_pagamento_codigo, 'recorrente')
  assert.equal(parsed.decisao.fechamento.valor_total, '149,90')
  assert.deepEqual(parsed.decisao.cliente.a_confirmar, ['Se o plano inclui o adicional.'])

  // Código vazio continua vazio, mesmo com "débito" no texto livre.
  const empty =
    parseFullReadingOutput(JSON.stringify({
      analise_markdown: MARKDOWN,
      decisao: decision({
        fechamento: { ...decision().fechamento, forma_pagamento_codigo: '', tipo_pagamento_codigo: '' },
      }),
    }))

  assert.equal(empty.decisao.fechamento.forma_pagamento_codigo, '')

  assert.throws(
    () => parseFullReadingOutput(JSON.stringify({
      analise_markdown: MARKDOWN,
      decisao: decision({ fechamento: { ...decision().fechamento, forma_pagamento_codigo: 'cartao' } }),
    })),
    (error) => error instanceof FullReadingOutputError && /forma_pagamento_codigo/.test(error.message),
  )

  assert.throws(
    () => parseFullReadingOutput(JSON.stringify({ analise_markdown: MARKDOWN, decisao: decision({ cliente: undefined }) })),
    (error) => error instanceof FullReadingOutputError && /cliente/.test(error.message),
  )
})

test('Confirmar venda: o modal recebe os códigos (e não deduz nada do texto)', () => {
  const view = agora()

  assert.equal(view.stage_card.kind, 'confirm_won')
  assert.equal(view.stage_card.prefill.forma_pagamento_codigo, 'credito')
  assert.equal(view.stage_card.prefill.tipo_pagamento_codigo, 'recorrente')
  assert.equal(view.stage_card.prefill.valor_total, '149,90')

  const params = new URL(`https://x${view.stage_card.cycle_path}`).searchParams

  assert.equal(params.get('pagamento_codigo'), 'credito')
  assert.equal(params.get('tipo_codigo'), 'recorrente')
  assert.equal(params.get('valor_total'), '149,90')
  // A dica livre continua para o vendedor conferir.
  assert.equal(params.get('pagamento'), 'Cartão, com débito mês a mês')

  // Valor que não é número e código inválido não vão para o modal.
  const messy = agora({
    decisionOverrides: {
      fechamento: { ...decision().fechamento, valor_total: 'R$ 149,90 para os dois', forma_pagamento_codigo: 'cartao' },
    },
  })

  assert.equal(messy.stage_card.prefill.valor_total, '')
  assert.equal(messy.stage_card.prefill.forma_pagamento_codigo, '')
})

// ---------------------------------------------------------------------------
// ANÁLISE sem duplicação
// ---------------------------------------------------------------------------

test('ANÁLISE: "Afirmações a confirmar" aparece uma vez só (fora de Condução do vendedor)', () => {
  const view =
    buildFullReadingAnalysisView({ state: 'ready', reading: reading(), failureCode: null })

  const conduct =
    view.sections.find((section) => section.key === 'conducao')

  assert.deepEqual(conduct.blocks, [
    { type: 'list', items: ['Acertos: respondeu rápido.', 'Ajustes: confirmar a regra antes de prometer.', 'Postura: cordial.'] },
  ])
  assert.doesNotMatch(JSON.stringify(view.sections), /Afirmações a confirmar|dia 5/)
  assert.deepEqual(view.afirmacoes_a_confirmar, ['O vendedor disse que o plano inclui o adicional.'])
})

test('ANÁLISE: tira a sublista em rótulo de parágrafo e em item com texto na mesma linha', () => {
  assert.deepEqual(
    stripConfirmationList([
      '- Acerto: x',
      '',
      '**Afirmações a confirmar:**',
      '- A',
      '- B',
      '',
      'Fechamento: y',
    ]),
    ['- Acerto: x', '', 'Fechamento: y'],
  )

  assert.deepEqual(
    stripConfirmationList(['- Acerto: x', '- **Afirmação a confirmar**: preço dito pelo vendedor', '- Ajuste: z']),
    ['- Acerto: x', '- Ajuste: z'],
  )

  // Fora de Condução, nada é tirado.
  const sections =
    parseFullReadingAnalysisSections('### Pendências abertas\n- Afirmações a confirmar: nenhuma pendência real')

  assert.equal(sections[0].blocks[0].items[0], 'Afirmações a confirmar: nenhuma pendência real')
})

// ---------------------------------------------------------------------------
// MENSAGEM, resumo, CLIENTE e ícone minimizado
// ---------------------------------------------------------------------------

test('MENSAGEM: leitura "não enviar" → aviso + seção, sem objetivo nem mensagem', () => {
  const view = agora()

  assert.deepEqual(view.message, {
    mode: 'no_send',
    notice: FULL_READING_NO_SEND_NOTICE,
    section_text: 'Não enviar nada agora. A cliente não deixou pergunta.',
    recommended_objective: null,
    suggested_message: null,
    run_id: 'run-v3',
  })
  assert.equal(FULL_READING_NO_SEND_NOTICE, 'A leitura recomenda não enviar nada agora')

  // Verificação interna também é "não enviar agora".
  assert.equal(agora({ decisionOverrides: { acao_agora: 'verificacao_interna', acao_resumo: 'Confirmar a regra no cadastro.' } }).message.mode, 'no_send')

  // A seção diz para não enviar, mesmo com acao_agora responder.
  assert.equal(agora({ decisionOverrides: { acao_agora: 'responder' } }).message.mode, 'no_send')
})

test('MENSAGEM: leitura "responder" → objetivo = acao_resumo e mensagem = seção "Mensagem sugerida"', () => {
  const markdown = MARKDOWN.replace(
    'Não enviar nada agora. A cliente não deixou pergunta.',
    'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.',
  )

  const view = agora({
    markdown,
    decisionOverrides: {
      acao_agora: 'responder',
      acao_resumo: 'Confirmar que o acesso ao app foi liberado.',
      pendencia_do_vendedor: true,
    },
  })

  assert.equal(view.message.mode, 'send')
  assert.equal(view.message.notice, null)
  assert.equal(view.message.recommended_objective, 'Confirmar que o acesso ao app foi liberado.')
  assert.equal(view.message.suggested_message, 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.')
  assert.deepEqual(view.attention, {
    level: 'attention',
    label: 'Cliente aguardando resposta',
    key: 'full-reading:run-v3:responder_pendente',
  })
})

test('MENSAGEM: travas do kanban (Ganho sem retomada) também viram "não enviar"', () => {
  const markdown = MARKDOWN.replace('Não enviar nada agora. A cliente não deixou pergunta.', 'Oi, tudo bem? Vamos retomar?')

  const view = agora({
    markdown,
    decisionOverrides: { acao_agora: 'retomar', acao_resumo: 'Retomar a negociação.', venda_concluida: 'confirmada' },
    kanbanOverrides: { status: 'ganho' },
  })

  assert.equal(view.message.mode, 'no_send')
  assert.equal(view.message.suggested_message, null)
  assert.equal(view.attention, null)
})

test('resumo do lead, CLIENTE e ícone minimizado vêm da leitura', () => {
  const view = agora()

  assert.deepEqual(view.lead_summary, {
    title: 'Resumo da leitura completa · 01/10/2026 11:05',
    text: 'Cliente já usa o serviço.',
  })
  assert.deepEqual(view.cliente, decision().cliente)
  // Não intervir, mas kanban atrasado: o ícone só informa.
  assert.deepEqual(view.attention, {
    level: 'information',
    label: 'Kanban desatualizado: a conversa indica GANHO',
    key: 'full-reading:run-v3:etapa_ganho',
  })

  assert.equal(
    agora({ decisionOverrides: { acao_agora: 'verificacao_interna', acao_resumo: 'Confirmar a regra no cadastro.' } }).attention.level,
    'attention',
  )

  // Falha: nada disso vem da leitura (o painel volta ao de hoje).
  const failed = agora({ state: 'failed' })

  assert.equal(failed.message, null)
  assert.equal(failed.lead_summary, null)
  assert.equal(failed.cliente, null)
  assert.equal(failed.attention, null)
})

// ---------------------------------------------------------------------------
// Gerar mensagem (Claude simulado)
// ---------------------------------------------------------------------------

function messageResponse(text) {
  return new Response(
    JSON.stringify({
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const untouchableAdmin = new Proxy({}, {
  get() {
    throw new Error('a geração de mensagem não pode tocar no banco aqui')
  },
})

const SCOPE = {
  company_id: '10000000-0000-4000-8000-000000000001',
  cycle_id: CYCLE,
  conversation_key: 'phone:5511900000000',
}

function messageArgs(overrides = {}) {
  return {
    admin: untouchableAdmin,
    scope: SCOPE,
    sellerIntent: 'Quero confirmar que o acesso foi liberado.',
    apiKey: 'sk-ant-teste',
    now: NOW,
    env: {},
    loadReading: async () => ({
      run_id: 'run-v3',
      analysis_markdown: MARKDOWN,
      decision: decision(),
    }),
    loadMessages: async () => [
      {
        id: '1',
        direction: 'incoming',
        author_kind: 'customer',
        occurred_at: '2026-09-29T20:39:00.000Z',
        content_type: 'text',
        text_content: 'Oi, como acesso o app?',
        audio_transcription: null,
        is_deleted: false,
        deletion_reason: null,
      },
    ],
    loadKanban: async () => ({
      status: 'novo',
      label: 'NOVO',
      stage_entered_at: null,
      next_action: null,
      next_action_date: null,
      won: null,
      lost: null,
      paused: null,
      canceled: null,
    }),
    loadConfig: async () => ({ bundle: null, products: [{ name: 'Plano Sintético', category: '', active: true }] }),
    ...overrides,
  }
}

test('Gerar mensagem: o pedido leva conversa, leitura, kanban, cadastro e objetivo, com esforço menor', async () => {
  let body = null

  const result =
    await generateFullReadingMessage(messageArgs({
      fetchImpl: async (_url, init) => {
        body = JSON.parse(init.body)
        return messageResponse(JSON.stringify({ mensagem: 'Oi! Seu acesso já está liberado.' }))
      },
    }))

  assert.deepEqual(result, { message: 'Oi! Seu acesso já está liberado.', run_id: 'run-v3' })

  assert.equal(body.model, 'claude-sonnet-5-5')
  assert.equal(body.output_config.effort, 'low')
  assert.deepEqual(body.output_config.format.schema, FULL_READING_MESSAGE_JSON_SCHEMA)
  assert.match(body.system, /cliente ativo não é lead frio/)
  assert.match(body.system, /Não repita pergunta que o cliente já respondeu/)
  assert.match(body.system, /"afirmações a confirmar" não é regra oficial/)

  const user = body.messages[0].content

  assert.match(user, /<leitura_completa>\n### Agora/)
  assert.match(user, /"acao_agora": "nao_intervir"/)
  assert.doesNotMatch(user, /"sistema"|saida_estruturada/)
  assert.match(user, /<kanban_do_yolen>[\s\S]*Etapa atual: NOVO/)
  assert.match(user, /<cadastro_da_empresa>[\s\S]*Plano Sintético/)
  assert.match(user, /<conversa>\n\[29\/09\/2026 17:39\] CLIENTE: Oi, como acesso o app\?\n<\/conversa>/)
  assert.match(user, /<objetivo_do_vendedor>\nQuero confirmar que o acesso foi liberado\.\n<\/objetivo_do_vendedor>/)
})

test('Gerar mensagem: sem leitura pronta, objetivo vazio ou sem chave, não chama o Claude', async () => {
  const neverCalled = async () => {
    throw new Error('não deveria chamar o Claude')
  }

  await assert.rejects(
    generateFullReadingMessage(messageArgs({ loadReading: async () => null, fetchImpl: neverCalled })),
    (error) => error instanceof FullReadingMessageError && error.code === 'FULL_READING_NOT_READY' && error.status === 409,
  )

  await assert.rejects(
    generateFullReadingMessage(messageArgs({ sellerIntent: '   ', fetchImpl: neverCalled })),
    (error) => error instanceof FullReadingMessageError && error.code === 'INVALID_SELLER_INTENT',
  )

  await assert.rejects(
    generateFullReadingMessage(messageArgs({ apiKey: '', fetchImpl: neverCalled })),
    (error) => error instanceof FullReadingMessageError && error.code === 'ANTHROPIC_API_KEY_MISSING',
  )
})

test('Gerar mensagem: esforço configurável, decisão sem campos do sistema e saída validada', () => {
  assert.equal(resolveFullReadingMessageEffort({}), 'low')
  assert.equal(resolveFullReadingMessageEffort({ COMPANION_FULL_READING_MESSAGE_EFFORT: 'Medium' }), 'medium')
  assert.equal(resolveFullReadingMessageEffort({ COMPANION_FULL_READING_MESSAGE_EFFORT: 'turbo' }), 'low')

  const cleaned = decisionForMessagePrompt(decision())

  assert.equal('sistema' in cleaned, false)
  assert.equal(cleaned.acao_agora, 'nao_intervir')

  assert.equal(parseFullReadingMessageOutput('{"mensagem":"  Oi!  "}'), 'Oi!')
  assert.equal(parseFullReadingMessageOutput('Segue:\n```json\n{"mensagem":"Oi!"}\n```'), 'Oi!')
  assert.throws(() => parseFullReadingMessageOutput('{"mensagem":""}'), /mensagem/)
})
