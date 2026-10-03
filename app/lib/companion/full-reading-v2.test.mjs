// Leitura completa (v2 em diante): kanban do Yolen na entrada, campos da
// decisão e coerência da etapa sugerida. Fixtures sintéticas (nenhum
// texto de cliente real). As regras próprias da v3 ficam em
// full-reading-v3.test.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  toV5Output,
} from './e2-test-support/full-reading-v5-fixture.mjs'

import {
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
  buildFullReadingUserPrompt,
  buildKanbanSection,
} from './full-reading/prompt.ts'

import {
  FULL_READING_KANBAN_STAGES,
  FULL_READING_OUTPUT_JSON_SCHEMA,
  FullReadingOutputError,
  applyFullReadingCoherence,
  findStageCoherenceProblem,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  ClaudeProviderError,
  callClaudeReading,
} from './full-reading/anthropic-client.ts'

import {
  buildKanbanContextFromRow,
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

const REFERENCE = '2026-09-30T18:00:00.000Z'

function decision(overrides = {}) {
  return {
    fase_relacao: 'cliente_ativo',
    etapa_metodo_atual: 'Pós-venda',
    venda_concluida: 'provavel',
    vez_de: 'cliente',
    pendencia_do_vendedor: false,
    situacao_resumo: 'Cliente já usa o serviço; o adicional ficou para depois.',
    acao_agora: 'nao_intervir',
    acao_resumo: 'Não enviar nada agora.',
    por_que: 'Não há pergunta em aberto.',
    etapa_kanban_sugerida: 'ganho',
    motivo_etapa: 'Pediu acesso ao aplicativo em 29/09.',
    fechamento: {
      produto: 'Plano Sintético',
      valor: '',
      forma_pagamento: 'pix',
      motivo_perda: '',
      valor_total: '',
      forma_pagamento_codigo: 'pix',
      tipo_pagamento_codigo: '',
    },
    cliente: {
      sabemos: ['Usa o serviço desde 20/09.'],
      inferimos: [],
      a_confirmar: [],
    },
    oportunidades: [{ descricao: 'Adicional sintético', status: 'adiada' }],
    afirmacoes_a_confirmar: [],
    alertas_de_captura: [],
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

function output(overrides = {}) {
  return {
    analise_markdown: '### Agora\n- Situação: x\n### Fase da relação e etapa do método\nx',
    decisao: decision(overrides),
  }
}

function kanban(overrides = {}) {
  return {
    status: 'novo',
    label: 'NOVO',
    stage_entered_at: '2026-09-20T12:00:00.000Z',
    next_action: null,
    next_action_date: null,
    won: null,
    lost: null,
    paused: null,
    canceled: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

test('prompt: versão atual e regras genéricas do kanban no sistema', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v10')

  const system =
    buildFullReadingSystemPrompt()

  assert.match(system, /## Kanban do Yolen/)
  assert.match(system, /<kanban_do_yolen>/)
  // a) kanban pode estar atrasado; comparar e sugerir.
  assert.match(system, /pode estar atrasado ou errado\. Compare com a conversa/)
  // b) Ganho = venda confirmada, pós-venda, nunca retomar o que foi vendido.
  assert.match(system, /GANHO é venda confirmada pela equipe: venda_concluida é "confirmada"/)
  assert.match(system, /Nunca sugira retomar a negociação do que já foi vendido/)
  // c) Perdido/Cancelado: reabrir só com mensagem nova do cliente.
  // Rodada 9 (F6): com mensagem nova depois do encerramento, a seção
  // "Ciclo encerrado".
  assert.match(system, /Sem mensagem do cliente depois do encerramento, não proponha ação comercial; com mensagem nova, siga a seção "Ciclo encerrado"/)
  // d) Agenda: compromisso com dia e hora aceito pelos dois; continua Agenda
  // depois do horário até o resultado ser conhecido.
  assert.match(system, /Agenda é quando existe um compromisso marcado \(visita, reunião, consulta, demonstração, ligação\), com dia e hora, aceito pelos dois lados/)
  assert.match(system, /Continua sendo Agenda depois do horário marcado, enquanto o resultado \(compareceu, faltou, remarcou\) não for conhecido; nesse caso a ação é confirmar o resultado com o cliente/)
  // e) Nunca inventar fechamento.
  assert.match(system, /Nunca invente valor, plano ou forma de pagamento/)
  assert.match(system, /etapa_kanban_sugerida/)
  assert.match(system, /situacao_resumo/)
})

test('prompt v2: a seção do kanban vai no prompt do usuário, com o rótulo visual', () => {
  const user =
    buildFullReadingUserPrompt({
      transcriptText: '[29/09/2026 17:39] CLIENTE: Oi',
      referenceTime: REFERENCE,
      commercialContext: null,
      kanban: kanban({ status: 'respondeu', label: 'AGENDA' }),
    })

  assert.match(user, /<kanban_do_yolen>\n[\s\S]*Etapa atual: AGENDA\n[\s\S]*<\/kanban_do_yolen>/)
  assert.match(user, /Nessa etapa desde: 20\/09\/2026 09:00/)
  assert.match(user, /Próxima ação registrada: nenhuma/)
  assert.ok(user.indexOf('<kanban_do_yolen>') < user.indexOf('<conversa>'))
})

test('prompt v2: sem kanban, o prompt avisa em vez de inventar', () => {
  assert.match(buildKanbanSection(null), /não está disponível/)
  assert.match(
    buildFullReadingUserPrompt({
      transcriptText: 'x',
      referenceTime: REFERENCE,
      commercialContext: null,
    }),
    /<kanban_do_yolen>\nA etapa do kanban não está disponível nesta análise\.\n<\/kanban_do_yolen>/,
  )
})

test('prompt v2: fechamento registrado só aparece na etapa certa e só com o que existe', () => {
  const won =
    buildKanbanSection(kanban({
      status: 'ganho',
      label: 'GANHO',
      won: {
        won_at: '2026-09-25T15:00:00.000Z',
        won_total: 1234.5,
        product_name: 'Plano Sintético',
        payment_method: 'credito',
        payment_type: 'entrada_parcelas',
        installments_count: 3,
      },
    }))

  assert.match(won, /Venda registrada pela equipe: registrada em 25\/09\/2026 12:00, valor R\$ 1\.234,50, produto Plano Sintético, forma de pagamento cartão de crédito, tipo de pagamento entrada \+ parcelas, 3 parcela\(s\)\./)

  const wonEmpty =
    buildKanbanSection(kanban({
      status: 'ganho',
      label: 'GANHO',
      won: {
        won_at: null,
        won_total: null,
        product_name: null,
        payment_method: null,
        payment_type: null,
        installments_count: null,
      },
    }))

  assert.match(wonEmpty, /Venda registrada pela equipe, sem detalhes de fechamento\./)
  assert.doesNotMatch(wonEmpty, /R\$/)

  const lost =
    buildKanbanSection(kanban({
      status: 'perdido',
      label: 'PERDIDO',
      lost: { lost_at: '2026-09-26T13:00:00.000Z', lost_reason: 'Preço' },
    }))

  assert.match(lost, /Perda registrada em 26\/09\/2026 10:00\. Motivo: Preço\./)

  const paused =
    buildKanbanSection(kanban({ status: 'pausado', label: 'PAUSADO', paused: { paused_reason: null } }))

  assert.match(paused, /Motivo da pausa não informado\./)

  const canceled =
    buildKanbanSection(kanban({
      status: 'cancelado',
      label: 'CANCELADO',
      canceled: { canceled_at: null, canceled_reason: 'Duplicado' },
    }))

  assert.match(canceled, /Cancelado\. Motivo: Duplicado\./)
})

test('runner: a linha do sales_cycles vira kanban só com os campos da etapa', () => {
  const row = {
    status: 'respondeu',
    stage_entered_at: '2026-09-20T12:00:00.000Z',
    next_action: 'Ligar',
    next_action_date: '2026-10-02T13:00:00.000Z',
    won_at: '2026-09-01T00:00:00.000Z',
    won_total: '99.9',
    lost_reason: 'x',
  }

  const context =
    buildKanbanContextFromRow(row, 'Produto')

  assert.equal(context.label, 'AGENDA')
  assert.equal(context.won, null)
  assert.equal(context.lost, null)
  assert.equal(context.next_action, 'Ligar')

  const won =
    buildKanbanContextFromRow({ ...row, status: 'ganho', installments_count: 2 }, 'Produto')

  assert.deepEqual(won.won, {
    won_at: '2026-09-01T00:00:00.000Z',
    won_total: 99.9,
    product_name: 'Produto',
    payment_method: null,
    payment_type: null,
    installments_count: 2,
  })

  assert.equal(buildKanbanContextFromRow({}, null), null)
})

// ---------------------------------------------------------------------------
// Esquema e parser
// ---------------------------------------------------------------------------

function collectSchemaStats(node, stats = { unions: 0, optional: 0 }) {
  if (!node || typeof node !== 'object') {
    return stats
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectSchemaStats(item, stats))
    return stats
  }

  if (node.anyOf || node.oneOf || Array.isArray(node.type)) {
    stats.unions += 1
  }

  if (node.type === 'object' && node.properties) {
    const required = new Set(node.required ?? [])

    for (const key of Object.keys(node.properties)) {
      if (!required.has(key)) {
        stats.optional += 1
      }
    }
  }

  for (const value of Object.values(node)) {
    collectSchemaStats(value, stats)
  }

  return stats
}

test('esquema v2: campos novos obrigatórios, sem união e sem opcional', () => {
  const decisionSchema =
    FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao

  for (const field of ['situacao_resumo', 'etapa_kanban_sugerida', 'motivo_etapa', 'fechamento']) {
    assert.ok(decisionSchema.required.includes(field), field)
  }

  assert.deepEqual(
    decisionSchema.properties.etapa_kanban_sugerida.enum,
    ['novo', 'contato', 'respondeu', 'negociacao', 'pausado', 'ganho', 'perdido'],
  )
  assert.deepEqual([...FULL_READING_KANBAN_STAGES], decisionSchema.properties.etapa_kanban_sugerida.enum)
  assert.deepEqual(
    decisionSchema.properties.fechamento.required,
    ['produto', 'valor', 'forma_pagamento', 'motivo_perda', 'valor_total', 'forma_pagamento_codigo', 'tipo_pagamento_codigo'],
  )
  assert.equal(decisionSchema.properties.fechamento.additionalProperties, false)

  assert.deepEqual(
    collectSchemaStats(FULL_READING_OUTPUT_JSON_SCHEMA),
    { unions: 0, optional: 0 },
  )
})

test('parser v2: lê os campos novos e normaliza a caixa da etapa', () => {
  const parsed =
    parseFullReadingOutput(
      JSON.stringify(output({ etapa_kanban_sugerida: 'GANHO' })),
    )

  assert.equal(parsed.decisao.etapa_kanban_sugerida, 'ganho')
  assert.equal(parsed.decisao.situacao_resumo, 'Cliente já usa o serviço; o adicional ficou para depois.')
  assert.equal(parsed.decisao.motivo_etapa, 'Pediu acesso ao aplicativo em 29/09.')
  assert.deepEqual(parsed.decisao.fechamento, {
    produto: 'Plano Sintético',
    valor: '',
    forma_pagamento: 'pix',
    motivo_perda: '',
    valor_total: '',
    forma_pagamento_codigo: 'pix',
    tipo_pagamento_codigo: '',
  })
})

test('parser v2: recusa etapa fora do kanban, cancelado e fechamento ausente', () => {
  for (const stage of ['fechamento', 'cancelado', 'agenda']) {
    assert.throws(
      () => parseFullReadingOutput(JSON.stringify(output({ etapa_kanban_sugerida: stage }))),
      (error) => error instanceof FullReadingOutputError && /etapa_kanban_sugerida/.test(error.message),
      stage,
    )
  }

  assert.throws(
    () => parseFullReadingOutput(JSON.stringify(output({ fechamento: undefined }))),
    (error) => error instanceof FullReadingOutputError && /fechamento/.test(error.message),
  )

  assert.throws(
    () => parseFullReadingOutput(JSON.stringify(output({ situacao_resumo: '  ' }))),
    (error) => error instanceof FullReadingOutputError && /situacao_resumo/.test(error.message),
  )
})

// ---------------------------------------------------------------------------
// Coerência
// ---------------------------------------------------------------------------

test('coerência: ganho sem venda confirmada ou provável vira "manter etapa" com alerta', () => {
  const { decision: adjusted, alerts } =
    applyFullReadingCoherence(
      decision({ etapa_kanban_sugerida: 'ganho', venda_concluida: 'nao' }),
      { currentStatus: 'negociacao' },
    )

  assert.equal(adjusted.etapa_kanban_sugerida, 'negociacao')
  assert.equal(alerts.length, 1)
  assert.deepEqual(alerts[0], {
    campo: 'etapa_kanban_sugerida',
    valor_do_modelo: 'ganho',
    valor_aplicado: 'negociacao',
    motivo: 'ganho sugerido sem venda confirmada ou provável',
  })
  // A leitura continua: só a etapa muda.
  assert.equal(adjusted.situacao_resumo, decision().situacao_resumo)
})

test('coerência: perdido fora da fase perdido vira "manter etapa" com alerta', () => {
  const { decision: adjusted, alerts } =
    applyFullReadingCoherence(
      decision({ etapa_kanban_sugerida: 'perdido', fase_relacao: 'negociacao', venda_concluida: 'nao' }),
      { currentStatus: 'contato' },
    )

  assert.equal(adjusted.etapa_kanban_sugerida, 'contato')
  // Rodada 8: Perdido vale nas fases perdido e nao_comercial.
  assert.equal(alerts[0].motivo, 'perdido sugerido com a relação fora das fases perdido e não é venda')
})

test('coerência: ganho provável e perdido na fase perdido passam sem alerta', () => {
  assert.equal(findStageCoherenceProblem(decision({ venda_concluida: 'provavel' })), null)
  assert.equal(findStageCoherenceProblem(decision({ venda_concluida: 'confirmada' })), null)
  assert.equal(
    findStageCoherenceProblem(decision({ etapa_kanban_sugerida: 'perdido', fase_relacao: 'perdido', venda_concluida: 'nao' })),
    null,
  )

  const { alerts } =
    applyFullReadingCoherence(decision(), { currentStatus: 'novo' })

  assert.deepEqual(alerts, [])
})

test('coerência: sem etapa atual sugerível, registra "manter_etapa_atual"', () => {
  const { decision: adjusted, alerts } =
    applyFullReadingCoherence(
      decision({ etapa_kanban_sugerida: 'ganho', venda_concluida: 'indeterminado' }),
      { currentStatus: 'cancelado' },
    )

  assert.equal(alerts[0].valor_aplicado, 'manter_etapa_atual')
  assert.equal(adjusted.etapa_kanban_sugerida, 'ganho')
})

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function fakeAdmin() {
  const updates = []

  return {
    updates,
    admin: {
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
    },
  }
}

// O runner pede o formato v5 (rodada 8): a saída v4 dos testes é convertida.
function claudeResponse(body) {
  return new Response(
    JSON.stringify({
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text: JSON.stringify(toV5Output(body)) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const MESSAGE = {
  id: '1',
  direction: 'incoming',
  author_kind: 'customer',
  occurred_at: '2026-09-29T20:39:00.000Z',
  content_type: 'text',
  text_content: 'Oi',
  audio_transcription: null,
  is_deleted: false,
  deletion_reason: null,
}

function runInput(overrides = {}) {
  return {
    runId: 'run-v2',
    companyId: 'company-1',
    cycleId: 'cycle-1',
    conversationKey: 'phone:1',
    referenceTime: REFERENCE,
    model: 'claude-sonnet-5-5',
    effort: 'high',
    apiKey: 'sk-ant-teste',
    loadMessages: async () => [MESSAGE],
    loadConfig: async () => ({ bundle: null, products: [] }),
    loadKanban: async () => kanban(),
    ...overrides,
  }
}

test('runner v2: o kanban vai no prompt e a decisão gravada leva kanban lido e alertas', async () => {
  const { admin, updates } = fakeAdmin()
  let sentBody = null

  const result =
    await executeFullReadingRun({
      admin,
      ...runInput({
        fetchImpl: async (_url, init) => {
          sentBody = JSON.parse(init.body)
          return claudeResponse(output())
        },
      }),
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.match(sentBody.messages[0].content, /<kanban_do_yolen>[\s\S]*Etapa atual: NOVO(?! \(nome interno)/)

  const final = updates[updates.length - 1].values

  assert.equal(final.status, 'succeeded')
  assert.equal(final.decision.etapa_kanban_sugerida, 'ganho')
  // Rodada 9: sem o formato fixo (A1), e o registro do modo e do uso.
  assert.deepEqual(final.decision.sistema.kanban_lido, { status: 'novo', stage_entered_at: '2026-09-20T12:00:00.000Z' })
  assert.deepEqual(final.decision.sistema.alertas, [])
  assert.equal(final.decision.sistema.saida_estruturada, false)
  assert.equal(final.decision.sistema.modo, 'completa')
  assert.equal(final.decision.sistema.leitura_base, null)
})

test('runner v2: etapa incoerente é gravada como "manter etapa" e a rodada continua bem-sucedida', async () => {
  const { admin, updates } = fakeAdmin()

  const result =
    await executeFullReadingRun({
      admin,
      ...runInput({
        loadKanban: async () => kanban({ status: 'negociacao', label: 'NEGOCIAÇÃO' }),
        fetchImpl: async () => claudeResponse(output({ venda_concluida: 'nao' })),
      }),
    })

  assert.deepEqual(result, { status: 'succeeded' })

  const final = updates[updates.length - 1].values

  assert.equal(final.decision.etapa_kanban_sugerida, 'negociacao')
  assert.equal(final.decision.sistema.alertas.length, 1)
  assert.equal(final.decision.sistema.alertas[0].valor_do_modelo, 'ganho')
})

test('runner v2: sem kanban a leitura roda e a coerência mantém a etapa', async () => {
  const { admin, updates } = fakeAdmin()

  const result =
    await executeFullReadingRun({
      admin,
      ...runInput({
        loadKanban: async () => {
          throw Object.assign(new Error('x'), { code: 'KANBAN_READ_FAILED' })
        },
        fetchImpl: async (_url, init) => {
          assert.match(JSON.parse(init.body).messages[0].content, /A etapa do kanban não está disponível/)
          return claudeResponse(output())
        },
      }),
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(updates[updates.length - 1].values.decision.sistema.kanban_lido.status, null)
})

test('modo estrito: recusa do formato fixo vira falha, sem repetir sem o formato', async () => {
  let calls = 0

  await assert.rejects(
    callClaudeReading({
      apiKey: 'sk-ant-teste',
      model: 'claude-sonnet-5-5',
      system: 's',
      userText: 'u',
      maxTokens: 100,
      effort: 'high',
      outputSchema: { type: 'object' },
      timeoutMs: 10_000,
      requireStructuredOutput: true,
      fetchImpl: async () => {
        calls += 1
        return new Response(
          JSON.stringify({ type: 'error', error: { message: 'output_config.format: schema too complex' } }),
          { status: 400 },
        )
      },
    }),
    (error) => error instanceof ClaudeProviderError && error.code === 'STRUCTURED_OUTPUT_REJECTED',
  )

  assert.equal(calls, 1)
})
