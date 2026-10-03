// Rodada 13 (HML): qualidade da leitura (prompt full-reading-v10) e dois
// ajustes pequenos. Fixtures sintéticas, nenhum dado de cliente.
//
// - A: quem é quem — nome da saudação é de quem ouve; intermediário na
//   mensagem e em como conduzir.
// - B: conversa que começa no meio não vira erro do vendedor.
// - C: linha do tempo só com fatos.
// - D: para o gestor, a recomendação; "nada pendente" é de "nenhum" (também
//   no parser e no painel).
// - E: resumo de arquivo mais fiel.
// - F: vírgula esquecida não junta campos no conserto do JSON.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXPERT_CONDUCT_SECTION,
  FULL_READING_COMPATIBLE_PROMPT_VERSIONS,
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

import {
  FullReadingOutputError,
  fullReadingOutputFieldNames,
  isNothingPendingText,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  hasEmbeddedFieldKey,
  parseJsonWithRepair,
  repairJsonStructure,
} from './full-reading/json-repair.ts'

import {
  ATTACHMENT_SUMMARY_SYSTEM_PROMPT,
} from '../server/full-reading-attachments.ts'

import {
  buildFullReadingAnalysisView,
} from '../server/full-reading-panel-view.ts'

const system = buildFullReadingSystemPrompt()

function decision(overrides = {}) {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'O contato pediu o link do pré-cadastro para outra pessoa.',
    cliente: { sabemos: ['Pediu o link (02/10)'], inferimos: [], a_confirmar: [] },
    pendencias: [{ de: 'vendedor', texto: 'Mandar o link do pré-cadastro' }],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: 'Interessado.', passos: [], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Mandar o link.',
    por_que: 'O contato pediu.',
    proximo_passo_titulo: 'Mandar o link do pré-cadastro',
    proximo_passo_complemento: '',
    mensagem_sugerida: 'Oi! Segue o link.',
    mensagem_observacao: '',
    conducao: { acertos: [], ajustes: [] },
    para_o_gestor: [],
    etapa_kanban_sugerida: 'negociacao',
    motivo_etapa: 'Pediu o link.',
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

// ---------------------------------------------------------------------------
// Prompt v10
// ---------------------------------------------------------------------------

test('v10: versão nova; leituras v6 a v9 continuam valendo (sem releitura forçada)', () => {
  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v10')
  assert.deepEqual(FULL_READING_COMPATIBLE_PROMPT_VERSIONS, ['full-reading-v10', 'full-reading-v9', 'full-reading-v8', 'full-reading-v7', 'full-reading-v6'])
})

test('A1: nome da saudação é de quem ouve; instrução para outra pessoa indica intermediário; nome da saudação não vira alguém da equipe', () => {
  assert.match(system, /15\. Quem é quem: um nome numa saudação de áudio ou de texto \('Oi, Fulano, \.\.\.'\) é de quem ouve ou lê, não de quem fala\./)
  assert.match(system, /essa pessoa provavelmente é quem vai usar o produto ou serviço, e o contato é um intermediário/)
  assert.match(system, /Não trate o nome da saudação como alguém da equipe sem evidência\./)
})

test('A2/A3: com intermediário, a mensagem fala com o contato e cita o futuro cliente na terceira pessoa; sem certeza, serve para os dois; observação não faz o papel da mensagem; um passo pede o contato direto', () => {
  assert.match(system, /Com intermediário \(regra 15\), a mensagem fala com o contato como intermediário e se refere a quem vai usar o produto ou serviço na terceira pessoa, pelo nome quando a conversa trouxer; sem certeza, escreva uma mensagem que sirva para os dois casos\./)
  assert.match(system, /não deixe para ela o que a própria mensagem pode resolver\./)
  assert.match(system, /Com intermediário, um dos passos avalia pedir, com naturalidade e sem desvalorizar o contato, o contato direto de quem vai decidir ou usar o produto ou serviço\./)
})

test('B1: conversa que começa no meio — o que pode ter acontecido antes não vira erro do vendedor', () => {
  assert.match(system, /16\. Conversa que começa no meio: quando a primeira mensagem do vendedor responde a algo que não está na transcrição/)
  assert.match(system, /não vira erro do vendedor\. Registre em afirmacoes_a_confirmar ou escreva o ajuste como condição \('se a descoberta não aconteceu antes, \.\.\.'\)\./)
  assert.match(system, /O que pode ter acontecido antes do começo da captura não vira ajuste \(regra 16\)\./)
})

test('C1: linha do tempo só com mensagens e eventos — nunca "sem resposta" ou "nenhuma mensagem", nem com a hora da leitura', () => {
  assert.match(system, /Só mensagens e eventos que aconteceram na conversa: nunca um item de 'sem resposta' ou 'nenhuma mensagem', nem com a hora da leitura/)
})

test('D1: para o gestor — com compromisso da empresa por escrito, a decisão recomendada e o porquê; o vendedor continua prudente', () => {
  assert.match(system, /Quando a conversa ou um arquivo incluído mostra um compromisso da empresa \(confirmação, promessa ou condição por escrito\), uma das frases diz qual decisão a leitura recomenda e por quê/)
  assert.match(system, /honrar o que foi confirmado e corrigir o processo internamente, porque negar agora tende a virar reclamação/)
  assert.match(system, /A parte do vendedor continua prudente: a mensagem não promete o que depende de aval\./)
  assert.match(EXPERT_CONDUCT_SECTION, /Quando a empresa assumiu um compromisso por escrito, diga também qual decisão recomenda e por quê\./)
})

test('v10: prompt geral — sem palavras de um ramo específico', () => {
  for (const forbidden of [/treino/i, /academia/i, /matr[ií]cula/i]) {
    assert.doesNotMatch(system, forbidden)
  }
})

// ---------------------------------------------------------------------------
// D2. "Nada pendente" é de "nenhum"
// ---------------------------------------------------------------------------

test('D2: pendência que diz que não há nada pendente vira "nenhum" no parser; pendência de verdade fica como está', () => {
  const output = parseFullReadingOutput(JSON.stringify({
    decisao: decision({
      pendencias: [
        { de: 'cliente', texto: 'Aguardando o retorno da empresa; nada pendente da parte dela.' },
        { de: 'vendedor', texto: 'Nenhuma pergunta do cliente sem resposta' },
        { de: 'vendedor', texto: 'Confirmar o horário da visita' },
        { de: 'cliente', texto: 'Mandar o comprovante do pagamento' },
      ],
    }),
  }), { format: 'v6' })

  assert.deepEqual(output.decisao.pendencias.map((item) => item.de), ['nenhum', 'nenhum', 'vendedor', 'cliente'])

  assert.equal(isNothingPendingText('Sem pendência do cliente'), true)
  assert.equal(isNothingPendingText('Retorno combinado: não há nada pendente agora'), true)
  assert.equal(isNothingPendingText('Pendente: enviar o contrato'), false)
  assert.equal(isNothingPendingText('Cliente vai mandar o documento pendente'), false)
})

test('D2: leitura antiga (v9) gravada com "cliente" aparece no painel sem o prefixo "Do cliente"', () => {
  const view = buildFullReadingAnalysisView({
    state: 'ready',
    reading: {
      run_id: 'run-d2',
      completed_at: '2026-10-03T03:00:00.000Z',
      analysis_markdown: null,
      decision: {
        ...decision({ pendencias: [{ de: 'cliente', texto: 'Aguardando o retorno da empresa; nada pendente da parte dela.' }] }),
        sistema: { kanban_lido: { status: 'negociacao', stage_entered_at: '2026-10-01T03:00:00.000Z' }, alertas: [], saida_estruturada: false, modo: 'completa', leitura_base: null, motivo: ['sem_leitura'], continuacoes_seguidas: 0, cadeia: ['ciclo-sintetico'] },
      },
    },
    failureCode: null,
    kanban: { status: 'negociacao', stage_entered_at: '2026-10-01T03:00:00.000Z', next_action: null, next_action_date: null, closed_at: null },
    lastMessageAt: '2026-10-03T02:00:00.000Z',
  })

  const pending = view.pending.find((item) => /nada pendente/.test(item.text))

  assert.equal(pending.owner, 'nenhum')
  assert.equal(pending.label, '')
})

// ---------------------------------------------------------------------------
// E. Resumo de arquivo
// ---------------------------------------------------------------------------

test('E1: resumo de arquivo — "print de e-mail" entre os tipos; confirmações, promessas, prazos e valores citados entre aspas simples, sem interpretar', () => {
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /print de conversa, print de e-mail, foto de produto/)
  assert.match(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /Em confirmações, promessas, prazos e valores, cite a frase do arquivo entre aspas simples, do jeito que está escrita, sem interpretar abreviações nem expressões/)
  assert.doesNotMatch(ATTACHMENT_SUMMARY_SYSTEM_PROMPT, /WhatsApp|ManyChat/)
})

// ---------------------------------------------------------------------------
// F. Vírgula esquecida
// ---------------------------------------------------------------------------

test('F1/F2: {"a": "x" "b": "y"} sai com os dois campos certos (não junta "b" no texto de "a")', () => {
  const keys = new Set(['a', 'b'])
  const repaired = parseJsonWithRepair('{"a": "x" "b": "y"}', { knownKeys: keys })

  assert.deepEqual(repaired, { value: { a: 'x', b: 'y' }, repairs: ['virgula_faltando'] })

  // Sem saber os campos, o passe local também fecha antes de "campo":.
  assert.equal(repairJsonStructure('{"a": "x" "b": "y"}').text, '{"a": "x", "b": "y"}')
})

test('F2: na leitura, a vírgula esquecida antes de um campo opcional (revisar_em, mensagem_observacao) não embaralha o texto', () => {
  const base = JSON.stringify({ decisao: decision({ mensagem_sugerida: 'Oi! Segue o link do pré-cadastro.', revisar_em: '2026-10-04T10:00:00-03:00', revisar_motivo: 'o horário combinado' }) }, null, 2)

  const missingBeforeOptional = base
    .replace('"Oi! Segue o link do pré-cadastro.",', '"Oi! Segue o link do pré-cadastro."')
    .replace('"Pediu o link.",', '"Pediu o link."')

  assert.notEqual(missingBeforeOptional, base)

  const output = parseFullReadingOutput(missingBeforeOptional, { format: 'v6' })

  assert.equal(output.decisao.mensagem_sugerida, 'Oi! Segue o link do pré-cadastro.')
  assert.equal(output.decisao.mensagem_observacao, '')
  assert.equal(output.decisao.motivo_etapa, 'Pediu o link.')
  assert.equal(output.decisao.revisar_em, '2026-10-04T10:00:00-03:00')
  assert.deepEqual(output.reparo_json, ['virgula_faltando'])
})

test('F1: texto com um nome de campo no padrão de chave invalida o conserto (local ou da biblioteca)', () => {
  const keys = fullReadingOutputFieldNames()

  assert.equal(hasEmbeddedFieldKey({ a: 'x" "revisar_em": "y' }, keys), true)
  assert.equal(hasEmbeddedFieldKey({ a: 'disse "oi" e saiu' }, keys), false)
  assert.equal(hasEmbeddedFieldKey({ a: ['ok', { b: '"motivo_etapa": x' }] }, keys), true)
  assert.equal(hasEmbeddedFieldKey({ a: '"qualquer": x' }, keys), false)
})

test('F2: os casos da rodada 12 continuam (aspas, quebra de linha, vírgula sobrando, texto em volta, lixo)', () => {
  const quoted = parseFullReadingOutput(
    JSON.stringify({ decisao: decision({ situacao_resumo: '@@' }) }).replace('"@@"', '"A cliente disse "vou pensar" e sumiu."'),
    { format: 'v6' },
  )

  assert.equal(quoted.decisao.situacao_resumo, 'A cliente disse "vou pensar" e sumiu.')
  assert.deepEqual(quoted.reparo_json, ['aspas'])

  const colon = parseFullReadingOutput(
    JSON.stringify({ decisao: decision({ situacao_resumo: '@@' }) }).replace('"@@"', '"Cliente: "vou pensar" e depois "obrigada"."'),
    { format: 'v6' },
  )

  assert.equal(colon.decisao.situacao_resumo, 'Cliente: "vou pensar" e depois "obrigada".')

  const newline = parseFullReadingOutput(
    JSON.stringify({ decisao: decision({ situacao_resumo: '@@' }) }).replace('"@@"', '"linha um\nlinha dois"'),
    { format: 'v6' },
  )

  assert.equal(newline.decisao.situacao_resumo, 'linha um\nlinha dois')

  const fenced = parseFullReadingOutput(`Segue:\n\`\`\`json\n${JSON.stringify({ decisao: decision() })}\n\`\`\``, { format: 'v6' })

  assert.deepEqual(fenced.reparo_json, ['texto_em_volta'])

  assert.throws(() => parseFullReadingOutput('não é json', { format: 'v6' }), (error) => error instanceof FullReadingOutputError && error.code === 'INVALID_MODEL_OUTPUT')
})
