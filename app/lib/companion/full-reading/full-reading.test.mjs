import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFullReadingTranscript,
  describeMessageContent,
  formatTranscriptTimestamp,
} from './transcript.ts'

import {
  FULL_READING_PROMPT_VERSION,
  buildCommercialContextSection,
  buildFullReadingSystemPrompt,
  buildFullReadingUserPrompt,
} from './prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FullReadingOutputError,
  parseFullReadingOutput,
} from './output.ts'

import {
  ClaudeProviderError,
  buildClaudeRequestBody,
  callClaudeReading,
  readClaudeText,
} from './anthropic-client.ts'

import {
  buildCommercialContextFromConfig,
  executeFullReadingRun,
  resolveFullReadingEffort,
  resolveFullReadingModel,
} from '../../server/full-reading-runner.ts'

function message(overrides = {}) {
  return {
    id: '1',
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: '2026-09-29T20:39:00.000Z',
    content_type: 'text',
    text_content: 'Oi',
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
    ...overrides,
  }
}

function validDecision(overrides = {}) {
  return {
    fase_relacao: 'cliente_ativo',
    etapa_metodo_atual: 'Follow-up',
    venda_concluida: 'provavel',
    vez_de: 'cliente',
    pendencia_do_vendedor: false,
    situacao_resumo: 'Cliente ativa, usando o serviço.',
    acao_agora: 'nao_intervir',
    acao_resumo: 'Não enviar nada agora.',
    por_que: 'Não há pendência e a vez é da cliente.',
    etapa_kanban_sugerida: 'ganho',
    motivo_etapa: 'Pediu acesso ao app em 29/09.',
    fechamento: {
      produto: '',
      valor: '',
      forma_pagamento: '',
      motivo_perda: '',
      valor_total: '',
      forma_pagamento_codigo: '',
      tipo_pagamento_codigo: '',
    },
    cliente: {
      sabemos: ['Usa o serviço desde 20/09.'],
      inferimos: [],
      a_confirmar: [],
    },
    oportunidades: [
      {
        descricao: 'Aulas coletivas',
        status: 'adiada',
      },
    ],
    afirmacoes_a_confirmar: ['Regra de renovação'],
    alertas_de_captura: ['Mensagens do mesmo minuto fora de ordem'],
    confianca_geral: 'alta',
    proximo_passo_titulo: 'Confirmar o próximo passo com o cliente',
    proximo_passo_complemento: 'Retomar a conversa pelo ponto em aberto.',
    linha_do_tempo: [
      { dia: '23/09', hora: '11:08', texto: 'Cliente pediu informações do plano' },
      { dia: '23/09', hora: '11:20', texto: 'Vendedor enviou os valores' },
    ],
    pendencias: [{ de: 'vendedor', texto: 'Confirmar a condição oferecida' }],
    conducao: { acertos: ['Respondeu rápido'], ajustes: ['Fazer uma pergunta de descoberta'] },
    ...overrides,
  }
}

function validOutput(decisionOverrides = {}) {
  return {
    analise_markdown: '### Agora\n- Situação: cliente ativa.',
    decisao: validDecision(decisionOverrides),
  }
}

function okResponse(payload, headers = {}) {
  return new Response(
    JSON.stringify(payload),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'request-id': 'req_123',
        ...headers,
      },
    },
  )
}

function errorResponse(status, messageText) {
  return new Response(
    JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: messageText,
      },
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

function claudePayload(text, overrides = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [
      { type: 'thinking', thinking: 'raciocínio interno' },
      { type: 'text', text },
    ],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 5000,
      output_tokens: 3000,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Transcrição
// ---------------------------------------------------------------------------

test('formata data e hora no fuso de Brasília', () => {
  assert.equal(
    formatTranscriptTimestamp('2026-09-29T20:39:00.000Z'),
    '29/09/2026 17:39',
  )
})

test('ordena por horário e, no mesmo horário, pela ordem de ingestão', () => {
  const transcript =
    buildFullReadingTranscript([
      message({ id: '10', occurred_at: '2026-09-29T20:40:00.000Z', text_content: 'terceira' }),
      message({ id: '9', occurred_at: '2026-09-29T20:39:00.000Z', text_content: 'segunda' }),
      message({ id: '8', occurred_at: '2026-09-29T20:39:00.000Z', text_content: 'primeira' }),
    ])

  assert.deepEqual(
    transcript.text.split('\n').map((line) => line.split(': ')[1]),
    ['primeira', 'segunda', 'terceira'],
  )
  assert.equal(transcript.message_count, 3)
  assert.equal(transcript.omitted_message_count, 0)
})

test('rotula autores e junta linhas da mesma mensagem', () => {
  const transcript =
    buildFullReadingTranscript([
      message({ id: '1', author_kind: 'customer', text_content: 'Oi\n\ntudo bem?' }),
      message({ id: '2', direction: 'outgoing', author_kind: 'human_agent', text_content: 'Olá!' }),
      message({ id: '3', direction: 'outgoing', author_kind: 'automation', text_content: 'Mensagem automática' }),
      message({ id: '4', direction: 'outgoing', author_kind: 'unknown', text_content: 'Sem autor' }),
    ])

  const lines =
    transcript.text.split('\n')

  assert.equal(lines[0], '[29/09/2026 17:39] CLIENTE: Oi / tudo bem?')
  assert.match(lines[1], /\] VENDEDOR: Olá!$/)
  assert.match(lines[2], /\] AUTOMAÇÃO: Mensagem automática$/)
  assert.match(lines[3], /\] EMPRESA \(autoria incerta\): Sem autor$/)
})

test('trata exclusão, sumiço do DOM, áudio e mídia sem texto', () => {
  assert.equal(
    describeMessageContent(message({ is_deleted: true, deletion_reason: 'explicit_deletion' })),
    '[mensagem apagada]',
  )

  assert.equal(
    describeMessageContent(message({ is_deleted: true, deletion_reason: 'dom_disappearance', text_content: null })),
    null,
  )

  assert.equal(
    describeMessageContent(message({ is_deleted: true, deletion_reason: 'dom_disappearance', text_content: 'ainda aqui' })),
    'ainda aqui',
  )

  assert.equal(
    describeMessageContent(message({ content_type: 'audio', text_content: null, audio_transcription: 'quero o plano' })),
    '[áudio] quero o plano',
  )

  assert.equal(
    describeMessageContent(message({ content_type: 'audio', text_content: null })),
    '[áudio sem transcrição]',
  )

  assert.equal(
    describeMessageContent(message({ text_content: '   ' })),
    '[mídia ou mensagem sem texto capturado]',
  )
})

test('acima do teto mantém as mensagens mais recentes e declara o corte', () => {
  const messages =
    Array.from({ length: 10 }, (_, index) =>
      message({
        id: String(index + 1),
        occurred_at: new Date(Date.UTC(2026, 8, 29, 12, index)).toISOString(),
        text_content: `mensagem ${index + 1}`,
      }),
    )

  const transcript =
    buildFullReadingTranscript(messages, { maxChars: 120 })

  assert.ok(transcript.omitted_message_count > 0)
  assert.match(transcript.text, /^\[\d+ mensagens mais antigas foram omitidas por tamanho\]/)
  assert.match(transcript.text, /mensagem 10$/)
})

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

test('o prompt de sistema pede a análise e a decisão consistentes', () => {
  const system =
    buildFullReadingSystemPrompt()

  assert.match(system, /analise_markdown/)
  assert.match(system, /nunca pode contradizê-la/)
  assert.match(system, /"Não fazer nada agora" é uma decisão válida/)
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v4')
})

test('o prompt do usuário leva referência, cadastro e conversa', () => {
  const user =
    buildFullReadingUserPrompt({
      transcriptText: '[29/09/2026 17:39] CLIENTE: Oi',
      referenceTime: '2026-09-29T22:36:00.000Z',
      commercialContext: {
        business_description: 'Academia de bairro',
        method_name: 'Método da casa',
        method_steps: [{ name: 'Descoberta', objective: 'Entender o objetivo' }],
        products: [{ name: 'Plano Duo', category: 'Duas pessoas' }],
        facts: ['A recepção abre às 6h'],
      },
    })

  assert.match(user, /agora\): 29\/09\/2026 19:36/)
  assert.match(user, /1\. Descoberta: Entender o objetivo/)
  assert.match(user, /- Plano Duo: Duas pessoas/)
  assert.match(user, /- A recepção abre às 6h/)
  assert.match(user, /<conversa>\n\[29\/09\/2026 17:39\] CLIENTE: Oi\n<\/conversa>/)
})

test('sem cadastro, o prompt avisa que não há contexto comercial', () => {
  assert.match(
    buildCommercialContextSection(null),
    /não está disponível/,
  )
})

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

test('o esquema exige additionalProperties false em todos os objetos', () => {
  const visit = (node, path) => {
    if (node && typeof node === 'object') {
      if (node.type === 'object') {
        assert.equal(node.additionalProperties, false, path)
      }

      for (const [key, value] of Object.entries(node)) {
        visit(value, `${path}.${key}`)
      }
    }
  }

  visit(FULL_READING_OUTPUT_JSON_SCHEMA, 'schema')
})

test('aceita a saída válida e normaliza a caixa dos enums', () => {
  const output =
    parseFullReadingOutput(
      JSON.stringify(validOutput({ acao_agora: 'NAO_INTERVIR', venda_concluida: 'Provavel' })),
    )

  assert.equal(output.decisao.acao_agora, 'nao_intervir')
  assert.equal(output.decisao.venda_concluida, 'provavel')
  assert.equal(output.decisao.oportunidades[0].status, 'adiada')
})

test('aceita JSON cercado por texto no modo sem saída estruturada', () => {
  const output =
    parseFullReadingOutput(
      `Segue a análise:\n\`\`\`json\n${JSON.stringify(validOutput())}\n\`\`\``,
    )

  assert.equal(output.decisao.fase_relacao, 'cliente_ativo')
})

test('recusa valores fora do permitido e campos ausentes', () => {
  assert.throws(
    () => parseFullReadingOutput(JSON.stringify(validOutput({ venda_concluida: 'talvez' }))),
    (error) => error instanceof FullReadingOutputError && /venda_concluida/.test(error.message),
  )

  assert.throws(
    () => parseFullReadingOutput(JSON.stringify({ decisao: validDecision() })),
    (error) => error instanceof FullReadingOutputError && /analise_markdown/.test(error.message),
  )

  assert.throws(
    () => parseFullReadingOutput('sem json aqui'),
    (error) => error instanceof FullReadingOutputError,
  )
})

// ---------------------------------------------------------------------------
// Cliente da API
// ---------------------------------------------------------------------------

test('a requisição liga o raciocínio adaptativo, o esforço e o formato fixo', () => {
  const body =
    buildClaudeRequestBody(
      {
        model: 'claude-sonnet-5-5',
        system: 'sistema',
        userText: 'conversa',
        maxTokens: 24000,
        effort: 'high',
        outputSchema: { type: 'object' },
      },
      { structured: true },
    )

  assert.deepEqual(body.thinking, { type: 'adaptive' })
  assert.equal(body.output_config.effort, 'high')
  assert.deepEqual(body.output_config.format, { type: 'json_schema', schema: { type: 'object' } })
  assert.deepEqual(body.messages, [{ role: 'user', content: 'conversa' }])

  const withoutFormat =
    buildClaudeRequestBody(
      {
        model: 'claude-sonnet-5-5',
        system: 'sistema',
        userText: 'conversa',
        maxTokens: 24000,
        effort: 'high',
        outputSchema: { type: 'object' },
      },
      { structured: false },
    )

  assert.equal(withoutFormat.output_config.format, undefined)
})

test('lê só o texto final e ignora os blocos de raciocínio', () => {
  const parsed =
    readClaudeText(claudePayload('{"a":1}'))

  assert.equal(parsed.text, '{"a":1}')
  assert.equal(parsed.input_tokens, 5000)
  assert.equal(parsed.output_tokens, 3000)
})

test('envia a chave só no cabeçalho e devolve o texto', async () => {
  const calls = []

  const response =
    await callClaudeReading({
      apiKey: 'sk-ant-teste',
      model: 'claude-sonnet-5-5',
      system: 'sistema',
      userText: 'conversa',
      maxTokens: 24000,
      effort: 'high',
      outputSchema: { type: 'object' },
      timeoutMs: 10_000,
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        return okResponse(claudePayload('{"ok":true}'))
      },
    })

  assert.equal(response.text, '{"ok":true}')
  assert.equal(response.request_id, 'req_123')
  assert.equal(response.used_structured_output, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages')
  assert.equal(calls[0].init.headers['x-api-key'], 'sk-ant-teste')
  assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01')
  assert.ok(!calls[0].init.body.includes('sk-ant-teste'))
})

test('se a API recusar o formato fixo, repete uma vez sem ele', async () => {
  const bodies = []

  const response =
    await callClaudeReading({
      apiKey: 'sk-ant-teste',
      model: 'claude-sonnet-5-5',
      system: 'sistema',
      userText: 'conversa',
      maxTokens: 24000,
      effort: 'high',
      outputSchema: { type: 'object' },
      timeoutMs: 10_000,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        return bodies.length === 1
          ? errorResponse(400, 'output_config.format is not supported with thinking')
          : okResponse(claudePayload('{"ok":true}'))
      },
    })

  assert.equal(bodies.length, 2)
  assert.ok(bodies[0].output_config.format)
  assert.equal(bodies[1].output_config.format, undefined)
  assert.equal(response.used_structured_output, false)
})

test('repete uma vez em falha temporária e depois desiste', async () => {
  let attempts = 0

  await assert.rejects(
    callClaudeReading({
      apiKey: 'sk-ant-teste',
      model: 'claude-sonnet-5-5',
      system: 'sistema',
      userText: 'conversa',
      maxTokens: 24000,
      effort: 'high',
      outputSchema: null,
      timeoutMs: 60_000,
      sleep: async () => {},
      fetchImpl: async () => {
        attempts += 1
        return errorResponse(529, 'Overloaded')
      },
    }),
    (error) => error instanceof ClaudeProviderError && error.code === 'PROVIDER_UNAVAILABLE',
  )

  assert.equal(attempts, 2)
})

test('resposta cortada pelo limite de tokens vira erro explícito', async () => {
  await assert.rejects(
    callClaudeReading({
      apiKey: 'sk-ant-teste',
      model: 'claude-sonnet-5-5',
      system: 'sistema',
      userText: 'conversa',
      maxTokens: 24000,
      effort: 'high',
      outputSchema: null,
      timeoutMs: 10_000,
      fetchImpl: async () => okResponse(claudePayload('{"parcial":', { stop_reason: 'max_tokens' })),
    }),
    (error) => error instanceof ClaudeProviderError && error.code === 'PROVIDER_MAX_TOKENS',
  )
})

test('chave ausente falha antes de qualquer chamada', async () => {
  let called = false

  await assert.rejects(
    callClaudeReading({
      apiKey: '',
      model: 'claude-sonnet-5-5',
      system: 'sistema',
      userText: 'conversa',
      maxTokens: 24000,
      effort: 'high',
      outputSchema: null,
      timeoutMs: 10_000,
      fetchImpl: async () => {
        called = true
        return okResponse(claudePayload('{}'))
      },
    }),
    (error) => error instanceof ClaudeProviderError && error.code === 'ANTHROPIC_API_KEY_MISSING',
  )

  assert.equal(called, false)
})

// ---------------------------------------------------------------------------
// Execução da rodada
// ---------------------------------------------------------------------------

function fakeAdmin() {
  const updates = []

  const admin = {
    from(table) {
      return {
        update(values) {
          const record = { table, values, filters: [] }
          updates.push(record)

          const chain = {
            eq(column, value) {
              record.filters.push([column, value])
              return chain
            },
            then(resolve) {
              resolve({ error: null })
            },
          }

          return chain
        },
      }
    },
  }

  return { admin, updates }
}

test('modelo e esforço vêm do ambiente, com padrões seguros', () => {
  assert.equal(resolveFullReadingModel({}), 'claude-sonnet-5-5')
  assert.equal(resolveFullReadingModel({ COMPANION_FULL_READING_MODEL: 'claude-opus-5-5' }), 'claude-opus-5-5')
  assert.equal(resolveFullReadingEffort({}), 'high')
  assert.equal(resolveFullReadingEffort({ COMPANION_FULL_READING_EFFORT: 'Medium' }), 'medium')
  assert.equal(resolveFullReadingEffort({ COMPANION_FULL_READING_EFFORT: 'turbo' }), 'high')
})

test('monta o contexto comercial só com o que está ativo', () => {
  const context =
    buildCommercialContextFromConfig({
      bundle: {
        version: {
          business_description: ' Academia ',
          commercial_method_name: '',
        },
        method_steps: [
          { step_order: 2, name: 'Tour', objective: 'Conhecer' },
          { step_order: 1, name: 'Descoberta', objective: 'Entender' },
        ],
        facts: [
          { is_active: true, fact_value: 'Fato ativo' },
          { is_active: false, fact_value: 'Fato inativo' },
        ],
        product_profiles: [],
        objection_guides: [],
      },
      products: [
        { name: 'Duo', category: 'Duas pessoas', active: true },
        { name: 'Antigo', category: 'x', active: false },
      ],
    })

  assert.equal(context.business_description, 'Academia')
  assert.equal(context.method_name, null)
  assert.deepEqual(context.method_steps.map((step) => step.name), ['Descoberta', 'Tour'])
  assert.deepEqual(context.facts, ['Fato ativo'])
  assert.deepEqual(context.products, [{ name: 'Duo', category: 'Duas pessoas' }])
})

test('rodada completa grava sucesso com análise e decisão', async () => {
  const { admin, updates } =
    fakeAdmin()

  const result =
    await executeFullReadingRun({
      admin,
      runId: 'run-1',
      companyId: 'company-1',
      cycleId: 'cycle-1',
      conversationKey: 'phone:1',
      referenceTime: '2026-09-29T22:36:00.000Z',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'sk-ant-teste',
      loadMessages: async () => [message()],
      loadConfig: async () => ({ bundle: null, products: [] }),
      fetchImpl: async () => okResponse(claudePayload(JSON.stringify(validOutput()))),
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(updates[0].values.status, 'running')
  assert.deepEqual(updates[0].filters, [['run_id', 'run-1'], ['status', 'queued']])

  const final =
    updates[updates.length - 1].values

  assert.equal(final.status, 'succeeded')
  assert.equal(final.decision.acao_agora, 'nao_intervir')
  assert.match(final.analysis_markdown, /### Agora/)
  assert.equal(final.transcript_message_count, 1)
  assert.equal(final.input_tokens, 5000)
})

test('conversa vazia e resposta inválida viram falha registrada, sem lançar', async () => {
  const empty =
    fakeAdmin()

  const emptyResult =
    await executeFullReadingRun({
      admin: empty.admin,
      runId: 'run-2',
      companyId: 'company-1',
      cycleId: 'cycle-1',
      conversationKey: 'phone:1',
      referenceTime: '2026-09-29T22:36:00.000Z',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'sk-ant-teste',
      loadMessages: async () => [],
      loadConfig: async () => ({ bundle: null, products: [] }),
      fetchImpl: async () => {
        throw new Error('não deveria chamar a API')
      },
    })

  assert.deepEqual(emptyResult, { status: 'failed', failure_code: 'EMPTY_CONVERSATION' })
  assert.equal(empty.updates[empty.updates.length - 1].values.status, 'failed')

  const invalid =
    fakeAdmin()

  const invalidResult =
    await executeFullReadingRun({
      admin: invalid.admin,
      runId: 'run-3',
      companyId: 'company-1',
      cycleId: 'cycle-1',
      conversationKey: 'phone:1',
      referenceTime: '2026-09-29T22:36:00.000Z',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      apiKey: 'sk-ant-teste',
      loadMessages: async () => [message()],
      loadConfig: async () => {
        throw new Error('cadastro indisponível')
      },
      fetchImpl: async () => okResponse(claudePayload('{"analise_markdown":"x"}')),
    })

  assert.deepEqual(invalidResult, { status: 'failed', failure_code: 'INVALID_MODEL_OUTPUT' })

  const failed =
    invalid.updates[invalid.updates.length - 1].values

  assert.equal(failed.status, 'failed')
  assert.equal(failed.failure_code, 'INVALID_MODEL_OUTPUT')
  assert.equal(failed.transcript_message_count, 1)
})
