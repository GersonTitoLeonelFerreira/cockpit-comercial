// Rodada 9 (HML), Fase 1: custo sob controle e base. Fixtures sintéticas,
// nenhum dado de cliente.
//
// - Saída: o caminho sem formato fixo é o padrão (uma chamada), com o
//   esquema no prompt e a parte fixa no cache; JSON inválido repete uma
//   vez; duas vezes inválido é falha determinística.
// - Eventos do ManyChat: classificador por texto (o mesmo da extensão),
//   linha EVENTO compacta, fora das contas e da staleness.
// - Relacionamento só com mensagens reais e com a cadeia.
// - Economia: rajada de 20 s, mensagem do vendedor não dispara leitura,
//   teto diário, log com modo e tokens.
// - Continuação: entrada certa, gatilhos de completa, 5 seguidas,
//   precisa_ler_inteira.
// - Tempo: revisar_em no passado relê uma vez.
// - Prompt v6: gênero, pendência "nenhum", catálogo, áudio, ciclo
//   encerrado.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  FULL_READING_PROMPT_VERSION,
  buildFullReadingSystemPrompt,
} from './full-reading/prompt.ts'

import {
  FULL_READING_OUTPUT_JSON_SCHEMA,
  applyFullReadingCoherence,
  normalizeReviewAt,
  parseFullReadingOutput,
} from './full-reading/output.ts'

import {
  classifyLedgerEvent,
  classifyManyChatEventText,
} from './full-reading/conversation-events.ts'

import {
  buildFullReadingTranscript,
} from './full-reading/transcript.ts'

import {
  splitContinuationMessages,
} from './full-reading/continuation.ts'

import {
  computeCompanionClientRelationship,
} from './companion-client-relationship.ts'

import {
  DAILY_CAP_SKIP_CODE,
  FULL_READING_BURST_QUIET_MS,
  applyDailyCap,
  buildAgoraFullReadingView,
  classifyRunFailure,
  countRunsForDailyCap,
  planFullReadingPanel,
  resolveFullReadingDailyCap,
  resolveFullReadingPanel,
  sellerRepliedAfterReading,
  startOfBrasiliaDay,
  summarizeLedgerActivity,
} from '../server/full-reading-panel.ts'

import {
  buildFullReadingAgoraView,
  buildFullReadingAnalysisView,
} from '../server/full-reading-panel-view.ts'

import {
  executeFullReadingRun,
} from '../server/full-reading-runner.ts'

const require = createRequire(import.meta.url)

const NOW = '2026-10-02T21:00:00.000Z'
const CYCLE = '91000000-0000-4000-8000-0000000000c1'
const ORIGIN = '91000000-0000-4000-8000-0000000000c0'
const COMPANY = '91000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000009'

const minutesBefore = (minutes) =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString()

const secondsBefore = (seconds) =>
  new Date(Date.parse(NOW) - seconds * 1000).toISOString()

function decisionV6(overrides = {}) {
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
    ...decisionV6(overrides),
    sistema: {
      kanban_lido: { status: 'contato', stage_entered_at: minutesBefore(600) },
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

const KANBAN = { status: 'contato', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, closed_at: null }

function plan(overrides = {}) {
  return planFullReadingPanel({
    runs: [run()],
    cycleId: CYCLE,
    kanban: KANBAN,
    latestObservedAt: minutesBefore(40),
    latestCustomerObservedAt: minutesBefore(40),
    force: false,
    now: NOW,
    ...overrides,
  })
}

function apiText(text, usage = { input_tokens: 10, output_tokens: 5 }) {
  return new Response(JSON.stringify({
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

// Mensagem do ledger (observed_at = occurred_at, salvo override).
function msg(index, minutesAgo, overrides = {}) {
  const at = minutesBefore(minutesAgo)

  return {
    id: String(index),
    message_key: `k${String(index).padStart(3, '0')}`,
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: at,
    observed_at: at,
    content_type: 'text',
    text_content: `Mensagem número ${String(index).padStart(3, '0')}`,
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
    ...overrides,
  }
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

async function runReading({
  messages,
  baseRun = null,
  responses,
  mode,
  fullReasons,
  chain = [CYCLE],
  kanban = null,
  logger = () => {},
}) {
  const { admin, updates } = updatesAdmin()
  const bodies = []
  let call = 0

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
      logger,
      baseRun,
      mode,
      fullReasons,
      reasons: ['mensagem_nova'],
      loadMessages: async ({ referenceTime }) =>
        messages.filter((item) => Date.parse(item.observed_at) <= Date.parse(referenceTime)),
      loadChain: async () => chain,
      loadConfig: async () => ({ bundle: null, products: [] }),
      loadKanban: async () => kanban,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        const response = responses[Math.min(call, responses.length - 1)]
        call += 1
        return typeof response === 'function' ? response() : response
      },
    })

  return {
    result,
    bodies,
    final: updates[updates.length - 1]?.values ?? null,
  }
}

const validResponse = (overrides = {}) =>
  () => apiText(JSON.stringify({ decisao: decisionV6(overrides) }))

function captureConsole(fn) {
  const lines = []
  const original = console.info
  console.info = (...args) => { lines.push(args.join(' ')) }

  return Promise.resolve()
    .then(fn)
    .finally(() => { console.info = original })
    .then((value) => ({ value, lines }))
}

// ---------------------------------------------------------------------------
// A. Saída estável
// ---------------------------------------------------------------------------

test('A1/D3: caminho padrão sem formato fixo, esquema no prompt e parte fixa no cache de prompt (uma chamada)', async () => {
  const { result, bodies, final } =
    await runReading({
      messages: [msg(1, 5)],
      responses: [validResponse()],
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(bodies.length, 1)

  const body = bodies[0]

  assert.equal(body.output_config?.format, undefined)
  assert.ok(Array.isArray(body.system))
  assert.equal(body.system.length, 1)
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' })
  assert.match(body.system[0].text, /## Formato obrigatório da resposta/)
  // O que muda por conversa vem depois da parte fixa (na mensagem).
  assert.doesNotMatch(body.system[0].text, /Mensagem número/)
  assert.match(body.messages[0].content, /Mensagem número 001/)
  assert.equal(final.decision.sistema.saida_estruturada, false)
})

test('A2: JSON inválido repete a chamada uma vez (e vai para o log); duas vezes inválido é falha determinística', async () => {
  const once =
    await captureConsole(() =>
      runReading({
        messages: [msg(1, 5)],
        responses: [() => apiText('não é json'), validResponse()],
      }))

  assert.deepEqual(once.value.result, { status: 'succeeded' })
  assert.equal(once.value.bodies.length, 2)
  assert.ok(once.lines.some((line) => /YOLEN_FULL_READING .*"event":"output_retry"/.test(line)))
  // As duas chamadas custaram tokens: o uso conta as duas.
  assert.equal(once.value.final.decision.sistema.uso.chamadas, 2)

  const twice =
    await captureConsole(() =>
      runReading({
        messages: [msg(1, 5)],
        responses: [() => apiText('não é json'), () => apiText('{"decisao": {"incompleto": true')],
      }))

  assert.deepEqual(twice.value.result, { status: 'failed', failure_code: 'INVALID_MODEL_OUTPUT' })
  assert.equal(twice.value.bodies.length, 2, 'só uma repetição')
  assert.equal(classifyRunFailure('INVALID_MODEL_OUTPUT'), 'deterministic')
})

test('A1: o formato fixo continua só na rota de teste estrita (require_structured_output=1)', async () => {
  const { admin } = updatesAdmin()
  const bodies = []

  await executeFullReadingRun({
    admin,
    runId: 'run-strict',
    companyId: COMPANY,
    cycleId: CYCLE,
    conversationKey: CONVERSATION,
    referenceTime: NOW,
    model: 'claude-sonnet-5-5',
    effort: 'high',
    apiKey: 'sk-ant-teste',
    requireStructuredOutput: true,
    logger: () => {},
    loadMessages: async () => [msg(1, 5)],
    loadChain: async () => [CYCLE],
    loadConfig: async () => ({ bundle: null, products: [] }),
    loadKanban: async () => null,
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return apiText(JSON.stringify({ decisao: decisionV6() }))
    },
  })

  assert.equal(bodies[0].output_config.format.type, 'json_schema')
})

// ---------------------------------------------------------------------------
// B. Eventos do ManyChat
// ---------------------------------------------------------------------------

const EVENT_LINES = [
  ['Campo personalizado foi alterado: Origem Valor anterior: A Novo valor: B', 'internal'],
  ['Campo personalizado está vazio : Origem', 'internal'],
  ['Regra acionada :\n[opções: Planilha]', 'internal'],
  ['A automação foi acionada\n[opções: Boas vindas]', 'internal'],
  ['Tag adicionada : Lead quente', 'internal'],
  ['Tag removida : Lead frio', 'internal'],
  ['O atraso inteligente foi iniciado na automação : termina em 10 min', 'internal'],
  ['A conversa foi movida de Não atribuído para Abrir', 'internal'],
  ['A conversa foi movida de Abrir para Fechada', 'closed'],
  ['A conversa foi movida de Fechada para Abrir', 'reopened'],
  ['A conversa foi movida de Fechada para Não atribuído', 'reopened'],
  ['Conversa atribuída a Equipe Exemplo', 'assignment'],
  ['Atribuir automaticamente a Equipe Exemplo pela automação\n[opções: Fluxo inicial]', 'assignment'],
  ['a automação das respostas foi desativada para nesta conversa. É possív…', 'automation_paused'],
]

const BOT_MESSAGES = [
  'Olá! Seja bem-vindo(a) à Empresa Exemplo! Escolha uma opção abaixo ⤵\n[opções: Planos · Horários]',
  'Certo, vamos te direcionar para o atendimento.',
  'Para outros assuntos, selecione abaixo a opção desejada ⤵',
  'Entendi. Para assuntos financeiros, vamos te direcionar para o time.',
]

test('B1/B4: o classificador por texto separa eventos (úteis e internos) de mensagens do robô, igual ao da extensão', () => {
  require('../../extension/yolen-companion/src/platform-contract.js')
  require('../../extension/yolen-companion/src/manychat-message-semantics.js')
  require('../../extension/yolen-companion/src/manychat-message-identity.js')
  require('../../extension/yolen-companion/src/manychat-message-content.js')
  const profile = require('../../extension/yolen-companion/src/manychat-message-profile.js')

  for (const [text, kind] of EVENT_LINES) {
    assert.equal(classifyManyChatEventText(text)?.kind, kind, text)
    assert.equal(profile.classifyManyChatEventText(text)?.kind, kind, `extensão: ${text}`)
  }

  for (const text of BOT_MESSAGES) {
    assert.equal(classifyManyChatEventText(text), null, text)
    assert.equal(profile.classifyManyChatEventText(text), null, `extensão: ${text}`)
  }

  // Só a linha do robô (automation) é candidata a evento.
  assert.equal(classifyLedgerEvent({ author_kind: 'customer', content_type: 'text', text_content: 'Tag adicionada : X' }), null)
  assert.equal(classifyLedgerEvent({ author_kind: 'automation', content_type: 'text', text_content: 'Tag adicionada : X' })?.kind, 'internal')
})

test('B3: transcrição com linha EVENTO compacta, sem autoria, sem "[opções: …]"; internos fora; fechada/reaberta seguidas: só a última', () => {
  const bot = (index, minutesAgo, text) =>
    msg(index, minutesAgo, { direction: 'outgoing', author_kind: 'automation', text_content: text })

  const transcript =
    buildFullReadingTranscript([
      msg(1, 60, { text_content: 'Oi, quero saber dos planos' }),
      bot(2, 59, 'Tag adicionada : Lead quente'),
      bot(3, 58, 'Atribuir automaticamente a Equipe Exemplo pela automação\n[opções: Fluxo inicial]'),
      bot(4, 57, 'Regra acionada :\n[opções: Planilha]'),
      msg(5, 50, { direction: 'outgoing', author_kind: 'human_agent', text_content: 'Oi! Posso ajudar.' }),
      bot(6, 40, 'A conversa foi movida de Abrir para Fechada'),
      bot(7, 39, 'A conversa foi movida de Fechada para Abrir'),
      bot(8, 38, 'A conversa foi movida de Abrir para Fechada'),
      bot(9, 30, 'Certo, vamos te direcionar para o atendimento.'),
    ], { timeZone: 'America/Sao_Paulo' })

  const lines = transcript.text.split('\n')

  assert.equal(transcript.message_count, 3, 'evento não conta como mensagem')
  assert.ok(lines.some((line) => /\] EVENTO: conversa atribuída a Equipe Exemplo pela automação$/.test(line)))
  assert.equal(lines.filter((line) => /EVENTO: conversa (marcada como fechada|reaberta)/.test(line)).length, 1)
  assert.ok(lines.some((line) => /EVENTO: conversa marcada como fechada$/.test(line)))
  assert.doesNotMatch(transcript.text, /Tag adicionada|Regra acionada|\[opções:|Fluxo inicial|Planilha/)
  // A linha não diz quem fechou: nenhuma autoria.
  assert.doesNotMatch(transcript.text, /fechada por/)
  assert.ok(lines.some((line) => /AUTOMAÇÃO: Certo, vamos te direcionar/.test(line)))
})

test('B2: evento fica fora da staleness, de "última sua/do cliente" e da vez', () => {
  const activity =
    summarizeLedgerActivity([
      { direction: 'outgoing', author_kind: 'automation', occurred_at: minutesBefore(1), observed_at: minutesBefore(1), content_type: 'text', text_content: 'Regra acionada :\n[opções: Follow up]' },
      { direction: 'outgoing', author_kind: 'automation', occurred_at: minutesBefore(2), observed_at: minutesBefore(2), content_type: 'text', text_content: 'Certo, vamos te direcionar.' },
      { direction: 'outgoing', author_kind: 'human_agent', occurred_at: minutesBefore(60), observed_at: minutesBefore(60), content_type: 'text', text_content: 'Oi!' },
      { direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(90), observed_at: minutesBefore(90), content_type: 'text', text_content: 'Olá' },
    ])

  assert.equal(activity.latest_observed_at, minutesBefore(2), 'o evento das 1 min não conta')
  assert.equal(activity.latest_customer_observed_at, minutesBefore(90))
  assert.deepEqual(activity.latest_person, { occurred_at: minutesBefore(60), observed_at: minutesBefore(60) }, 'o robô não é "última sua"')
  assert.equal(activity.last_message_at, minutesBefore(2))

  // Um evento novo depois da leitura não deixa a leitura velha.
  const result =
    plan({
      latestObservedAt: activity.latest_observed_at,
      latestCustomerObservedAt: activity.latest_customer_observed_at,
    })

  assert.equal(result.action, 'use')
})

// ---------------------------------------------------------------------------
// C. Relacionamento
// ---------------------------------------------------------------------------

test('C1/C2: Relacionamento só com mensagens reais e a cadeia; "Última sua" é de uma pessoa da empresa', () => {
  const relationship =
    computeCompanionClientRelationship({
      reference_time: NOW,
      seller_is_person_only: true,
      messages: [
        // Ciclo de origem (Nova oportunidade): primeiro contato.
        { direction: 'incoming', occurred_at: minutesBefore(3000), author_kind: 'customer' },
        { direction: 'outgoing', occurred_at: minutesBefore(2990), author_kind: 'human_agent' },
        // Ciclo atual.
        { direction: 'incoming', occurred_at: minutesBefore(60), author_kind: 'customer' },
        { direction: 'outgoing', occurred_at: minutesBefore(30), author_kind: 'human_agent' },
        { direction: 'outgoing', occurred_at: minutesBefore(5), author_kind: 'automation' },
      ],
    })

  assert.equal(relationship.first_known_interaction_at, minutesBefore(3000))
  assert.equal(relationship.known_interaction_count, 5)
  assert.equal(relationship.latest_customer_message_at, minutesBefore(60))
  assert.equal(relationship.latest_seller_message_at, minutesBefore(30), 'o robô não é "Última sua"')

  // Flag desligada: igual a hoje (qualquer saída).
  const legacy =
    computeCompanionClientRelationship({
      reference_time: NOW,
      messages: [
        { direction: 'outgoing', occurred_at: minutesBefore(30), author_kind: 'human_agent' },
        { direction: 'outgoing', occurred_at: minutesBefore(5), author_kind: 'automation' },
      ],
    })

  assert.equal(legacy.latest_seller_message_at, minutesBefore(5))
})

// ---------------------------------------------------------------------------
// D. Economia
// ---------------------------------------------------------------------------

test('D1: com uma leitura na tela, mensagem nova do cliente espera 20 s sem outra; a primeira leitura não espera', () => {
  const burst = plan({ latestObservedAt: secondsBefore(5), latestCustomerObservedAt: secondsBefore(5) })

  assert.equal(burst.action, 'use')
  assert.equal(burst.pending_update_at, new Date(Date.parse(secondsBefore(5)) + FULL_READING_BURST_QUIET_MS).toISOString())

  const quiet = plan({ latestObservedAt: secondsBefore(25), latestCustomerObservedAt: secondsBefore(25) })

  assert.equal(quiet.action, 'start')
  assert.deepEqual(quiet.stale_reasons, ['mensagem_nova'])

  const first = plan({ runs: [], latestObservedAt: secondsBefore(2), latestCustomerObservedAt: secondsBefore(2) })

  assert.equal(first.action, 'start')

  // "Atualizar" não espera a rajada.
  assert.equal(plan({ latestObservedAt: secondsBefore(5), latestCustomerObservedAt: secondsBefore(5), force: true }).action, 'start')

  const view =
    buildFullReadingAgoraView({
      state: 'ready',
      reading: { run_id: 'run-a', completed_at: minutesBefore(29), analysis_markdown: null, decision: storedDecision() },
      failureCode: null,
      kanban: KANBAN,
      cycleId: CYCLE,
      lastCustomerMessageAt: null,
      now: Date.parse(NOW),
      panel: { pending_update_at: burst.pending_update_at },
    })

  assert.equal(view.notice, 'Mensagem nova — atualizando em instantes')
  assert.equal(view.status.band.kind, 'burst')
  assert.equal(view.status.pending_until, burst.pending_update_at)
})

test('D2: mensagem do vendedor ou do robô depois da leitura não inicia leitura; faixa "Você respondeu às HH:MM" e mensagem esmaecida', () => {
  const activity = {
    latest_observed_at: minutesBefore(2),
    latest_customer_observed_at: minutesBefore(40),
    latest_customer_occurred_at: minutesBefore(40),
    latest_person: { occurred_at: minutesBefore(2), observed_at: minutesBefore(2) },
    last_message_at: minutesBefore(2),
  }

  const result =
    plan({ latestObservedAt: activity.latest_observed_at, latestCustomerObservedAt: activity.latest_customer_observed_at })

  assert.equal(result.action, 'use')

  const replied =
    sellerRepliedAfterReading({ reading: run(), activity })

  assert.equal(replied, minutesBefore(2))

  // O cliente respondeu depois: a faixa sai (a leitura atualiza).
  assert.equal(
    sellerRepliedAfterReading({ reading: run(), activity: { ...activity, latest_customer_observed_at: minutesBefore(1) } }),
    null,
  )

  const view =
    buildFullReadingAgoraView({
      state: 'ready',
      reading: { run_id: 'run-a', completed_at: minutesBefore(29), analysis_markdown: null, decision: storedDecision() },
      failureCode: null,
      kanban: KANBAN,
      cycleId: CYCLE,
      lastCustomerMessageAt: null,
      now: Date.parse(NOW),
      panel: { seller_replied_at: replied },
    })

  assert.equal(view.notice, 'Você respondeu às 17:58. A leitura atualiza quando o cliente responder.')
  assert.equal(view.message.outdated, true)
  assert.equal(view.message.outdated_notice, 'pode estar desatualizada')
})

test('D4: teto diário por empresa no dia de Brasília; no teto nada começa (nem "Atualizar"/"Tentar de novo") e o painel diz "Limite diário de leituras atingido"', async () => {
  assert.equal(resolveFullReadingDailyCap({}), 100)
  assert.equal(resolveFullReadingDailyCap({ COMPANION_FULL_READING_DAILY_CAP: '5' }), 5)
  assert.equal(resolveFullReadingDailyCap({ COMPANION_FULL_READING_DAILY_CAP: 'abc' }), 100)

  // 23:30 de 01/10 em Brasília = 02:30Z de 02/10: o dia começa 01/10 03:00Z.
  assert.equal(startOfBrasiliaDay('2026-10-02T02:30:00.000Z'), '2026-10-01T03:00:00.000Z')
  assert.equal(startOfBrasiliaDay('2026-10-02T03:30:00.000Z'), '2026-10-02T03:00:00.000Z')

  assert.equal(
    countRunsForDailyCap([
      { status: 'succeeded' },
      { status: 'running' },
      { status: 'failed', failure_code: 'PROVIDER_TIMEOUT' },
      { status: 'failed', failure_code: 'DUPLICATE_RUN_DISCARDED' },
      { status: 'failed', failure_code: 'EMPTY_CONVERSATION' },
    ]),
    3,
  )

  const forced = plan({ force: true })

  assert.equal(forced.action, 'start')
  assert.equal(applyDailyCap(forced, { dailyCapReached: true, now: NOW }).action, 'skip')
  assert.equal(applyDailyCap(forced, { dailyCapReached: true, now: NOW }).skip_reason, DAILY_CAP_SKIP_CODE)
  assert.equal(applyDailyCap(forced, { dailyCapReached: false, now: NOW }).action, 'start')

  // Ponta a ponta: 2 leituras hoje com teto 2 → nenhuma rodada nova.
  const memory = memoryAdmin({
    sales_cycles: [{ id: CYCLE, company_id: COMPANY, status: 'contato', stage_entered_at: minutesBefore(600), next_action: null, next_action_date: null, lost_at: null, canceled_at: null, closed_at: null }],
    conversation_messages: [{ company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', author_kind: 'customer', occurred_at: minutesBefore(5), observed_at: minutesBefore(5), content_type: 'text', text_content: 'Oi' }],
    companion_full_reading_runs: [
      { company_id: COMPANY, conversation_key: CONVERSATION, ...run() },
      { company_id: COMPANY, conversation_key: 'phone:5511900000010', ...run({ run_id: 'run-other', cycle_id: '91000000-0000-4000-8000-0000000000c9' }) },
    ],
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
      env: { VERCEL_ENV: 'preview', COMPANION_FULL_READING_DAILY_CAP: '2' },
    })

  assert.equal(snapshot.state, 'failed')
  assert.equal(snapshot.failure_code, DAILY_CAP_SKIP_CODE)
  assert.equal(snapshot.reading.run_id, 'run-a', 'a última leitura continua na tela')
  assert.equal(scheduled.length, 0)
  assert.deepEqual(memory.writes, [])

  const agora = buildAgoraFullReadingView(snapshot, { cycleId: CYCLE })

  assert.equal(agora.notice, 'Limite diário de leituras atingido')
  assert.equal(agora.status.refresh.full, null)
})

test('D5: o log da leitura registra modo, motivo, tokens de entrada, saída e cache, e duração', async () => {
  const claudeLines = []

  const { lines } =
    await captureConsole(() =>
      runReading({
        messages: [msg(1, 5)],
        responses: [() => apiText(JSON.stringify({ decisao: decisionV6() }), { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 })],
        logger: (line) => claudeLines.push(line),
      }))

  const succeeded =
    lines.find((line) => /"event":"run_succeeded"/.test(line))

  assert.ok(succeeded)

  const fields = JSON.parse(succeeded.slice(succeeded.indexOf('{')))

  assert.equal(fields.mode, 'completa')
  assert.deepEqual(fields.reasons, ['mensagem_nova', 'sem_leitura_anterior'])
  assert.equal(fields.input_tokens, 900)
  assert.equal(fields.output_tokens, 300)
  assert.equal(fields.cache_read_input_tokens, 4000)
  assert.equal(fields.cache_creation_input_tokens, 0)
  assert.equal(typeof fields.duration_ms, 'number')

  const call = JSON.parse(claudeLines[0].slice(claudeLines[0].indexOf('{')))

  assert.equal(call.mode, 'completa')
  assert.equal(call.cache_read_input_tokens, 4000)
})

// ---------------------------------------------------------------------------
// E. Leitura de continuação
// ---------------------------------------------------------------------------

// 15 mensagens que a leitura anterior viu (100 → 44 min) e 3 novas. As 5
// primeiras (fora do contexto da continuação) são longas: a continuação sai
// mais barata que a leitura completa (rodada 10, C1).
const LONG_FILLER =
  ' Conversa sintética sobre o pedido, o prazo e a forma de pagamento.'.repeat(60)

function conversation() {
  const seen =
    Array.from({ length: 15 }, (_, index) => msg(index + 1, 100 - index * 4, {
      direction: index % 2 === 0 ? 'incoming' : 'outgoing',
      author_kind: index % 2 === 0 ? 'customer' : 'human_agent',
      ...(index < 5
        ? { text_content: `Mensagem número ${String(index + 1).padStart(3, '0')}.${LONG_FILLER}` }
        : {}),
    }))

  return [...seen, msg(16, 20), msg(17, 10), msg(18, 5)]
}

function baseRun(system = {}) {
  return {
    run_id: 'run-base',
    reference_time: minutesBefore(30),
    completed_at: minutesBefore(29),
    decision: storedDecision({ situacao_resumo: 'Leitura anterior salva.' }, system),
  }
}

test('E1/E3: continuação recebe a decisão anterior, as 10 últimas mensagens já vistas (contexto) e as novas; grava modo e leitura_base', async () => {
  const { result, bodies, final } =
    await runReading({
      messages: conversation(),
      baseRun: baseRun(),
      responses: [validResponse()],
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(bodies.length, 1)

  const content = bodies[0].messages[0].content
  const context = content.slice(content.indexOf('<conversa_contexto>'), content.indexOf('</conversa_contexto>'))
  const fresh = content.slice(content.indexOf('<mensagens_novas>'), content.indexOf('</mensagens_novas>'))

  assert.match(content, /Esta é uma leitura de continuação/)
  assert.match(content, /<leitura_anterior feita_em="[^"]+">\n\{.*"situacao_resumo":"Leitura anterior salva\."/)
  assert.doesNotMatch(content.slice(content.indexOf('<leitura_anterior'), content.indexOf('</leitura_anterior>')), /"sistema"/)
  assert.doesNotMatch(content, /<conversa>/)

  for (let index = 6; index <= 15; index += 1) {
    assert.match(context, new RegExp(`Mensagem número ${String(index).padStart(3, '0')}`))
  }

  assert.doesNotMatch(context, /Mensagem número 005/)

  for (const index of [16, 17, 18]) {
    assert.match(fresh, new RegExp(`Mensagem número 0${index}`))
    assert.doesNotMatch(context, new RegExp(`Mensagem número 0${index}`))
  }

  assert.equal(final.decision.sistema.modo, 'continuacao')
  assert.equal(final.decision.sistema.leitura_base, 'run-base')
  assert.equal(final.decision.sistema.continuacoes_seguidas, 1)
  assert.equal(final.transcript_message_count, 13)
})

test('E1: mensagem que mudou desde a leitura anterior (áudio transcrito) entra entre as novas, marcada', () => {
  const before = [msg(1, 60, { content_type: 'audio', text_content: null })]
  const after = [msg(1, 60, { content_type: 'audio', text_content: null, audio_transcription: 'Quero o plano anual', observed_at: minutesBefore(2) })]

  const split = splitContinuationMessages({ previous: before, current: after })

  assert.equal(split.fresh.length, 1)
  assert.ok(split.updated_keys.has('k001'))
  assert.equal(split.older_than_seen, false, 'mensagem que já tinha sido vista não é "mais antiga"')
})

test('E2: cada gatilho de leitura completa', async () => {
  const fullOf = async (options) => {
    const { bodies, final } =
      await runReading({ responses: [validResponse()], ...options })

    return {
      mode: final.decision.sistema.modo,
      reasons: final.decision.sistema.motivo,
      full: /<conversa>/.test(bodies[0].messages[0].content),
    }
  }

  // Sem leitura anterior.
  assert.deepEqual(await fullOf({ messages: conversation() }), { mode: 'completa', reasons: ['mensagem_nova', 'sem_leitura_anterior'], full: true })

  // Captura trouxe mensagem mais antiga que a última vista (rolou para cima).
  const scrolled = [...conversation(), msg(19, 300, { observed_at: minutesBefore(3) })]
  assert.deepEqual(await fullOf({ messages: scrolled, baseRun: baseRun() }), { mode: 'completa', reasons: ['mensagem_nova', 'mensagem_antiga'], full: true })

  // Mais de 40 mensagens novas.
  const many = [...conversation().slice(0, 15), ...Array.from({ length: 41 }, (_, index) => msg(100 + index, 25 - index * 0.5))]
  assert.deepEqual(await fullOf({ messages: many, baseRun: baseRun() }), { mode: 'completa', reasons: ['mensagem_nova', 'muitas_mensagens_novas'], full: true })

  // A cadeia mudou (Nova oportunidade aberta depois da leitura anterior).
  assert.deepEqual(await fullOf({ messages: conversation(), baseRun: baseRun(), chain: [CYCLE, ORIGIN] }), { mode: 'completa', reasons: ['mensagem_nova', 'cadeia_mudou'], full: true })

  // O kanban saiu de ganho.
  const reopened = await fullOf({
    messages: conversation(),
    baseRun: baseRun({ kanban_lido: { status: 'ganho', stage_entered_at: minutesBefore(600) } }),
    kanban: { status: 'negociacao', label: 'Negociação', stage_entered_at: minutesBefore(10), next_action: null, next_action_date: null, won: null, lost: null, paused: null, canceled: null },
  })
  assert.deepEqual(reopened, { mode: 'completa', reasons: ['mensagem_nova', 'kanban_reaberto'], full: true })

  // 5 continuações seguidas: a próxima é completa.
  assert.deepEqual(await fullOf({ messages: conversation(), baseRun: baseRun({ modo: 'continuacao', continuacoes_seguidas: 5 }) }), { mode: 'completa', reasons: ['mensagem_nova', 'continuacoes_seguidas'], full: true })
  assert.equal((await fullOf({ messages: conversation(), baseRun: baseRun({ modo: 'continuacao', continuacoes_seguidas: 4 }) })).mode, 'continuacao')

  // "Ler a conversa inteira" (o painel manda o motivo).
  assert.deepEqual(await fullOf({ messages: conversation(), baseRun: baseRun(), mode: 'completa', fullReasons: ['pedido_do_vendedor'] }), { mode: 'completa', reasons: ['mensagem_nova', 'pedido_do_vendedor'], full: true })

  // E o planner manda esse pedido com forceMode 'full'.
  const planned = plan({ force: true, forceMode: 'full', runs: [run({ created_at: minutesBefore(30) })] })
  assert.equal(planned.action, 'start')
  assert.deepEqual(planned.full_reasons, ['pedido_do_vendedor'])
})

test('E2: a continuação que pede a conversa inteira (precisa_ler_inteira) roda uma completa logo depois, uma vez só', async () => {
  const { result, bodies, final } =
    await runReading({
      messages: conversation(),
      baseRun: baseRun(),
      responses: [
        validResponse({ precisa_ler_inteira: true, precisa_ler_inteira_motivo: 'As mensagens novas citam um combinado antigo.' }),
        validResponse({ precisa_ler_inteira: true, precisa_ler_inteira_motivo: 'de novo' }),
      ],
    })

  assert.deepEqual(result, { status: 'succeeded' })
  assert.equal(bodies.length, 2)
  assert.match(bodies[0].messages[0].content, /<mensagens_novas>/)
  assert.match(bodies[1].messages[0].content, /<conversa>/)
  assert.equal(final.decision.sistema.modo, 'completa')
  assert.equal(final.decision.sistema.continuacao_pediu_inteira, 'As mensagens novas citam um combinado antigo.')
  assert.ok(final.decision.sistema.motivo.includes('continuacao_pediu'))
  assert.equal(final.decision.precisa_ler_inteira, false)
  assert.equal(final.decision.sistema.uso.chamadas, 2)
})

// ---------------------------------------------------------------------------
// G. Leitura que vence com o tempo
// ---------------------------------------------------------------------------

test('G1: revisar_em é normalizado para ISO no horário de Brasília; inválido vira vazio', () => {
  assert.equal(normalizeReviewAt('2026-10-02T18:00:00-03:00'), '2026-10-02T18:00:00-03:00')
  assert.equal(normalizeReviewAt('2026-10-02T18:00'), '2026-10-02T18:00:00-03:00')
  assert.equal(normalizeReviewAt('2026-10-02T21:00:00Z'), '2026-10-02T18:00:00-03:00')
  assert.equal(normalizeReviewAt('amanhã'), '')
  assert.equal(normalizeReviewAt(''), '')

  const output =
    parseFullReadingOutput(JSON.stringify({ decisao: decisionV6({ revisar_em: '2026-10-02T18:00', revisar_motivo: 'o horário da visita' }) }), { format: 'v6' })

  assert.equal(output.decisao.revisar_em, '2026-10-02T18:00:00-03:00')
  assert.equal(output.decisao.revisar_motivo, 'o horário da visita')

  assert.ok(FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao.required.includes('revisar_em'))
  assert.ok(FULL_READING_OUTPUT_JSON_SCHEMA.properties.decisao.required.includes('precisa_ler_inteira'))
})

test('G2/G3: revisar_em no passado relê uma vez (continuação); vazio não relê; o mesmo horário não faz reler de novo', () => {
  const reviewAt = '2026-10-02T17:30:00-03:00' // 20:30Z, 30 min antes de NOW

  const due =
    plan({ runs: [run({ created_at: minutesBefore(60), reference_time: minutesBefore(60), decision: storedDecision({ revisar_em: reviewAt, revisar_motivo: 'o horário da visita' }) })], latestObservedAt: minutesBefore(70), latestCustomerObservedAt: minutesBefore(70) })

  assert.equal(due.action, 'start')
  assert.deepEqual(due.stale_reasons, ['horario_passou'])
  assert.deepEqual(due.review_due, { at: reviewAt, motivo: 'o horário da visita' })
  assert.deepEqual(due.full_reasons, [], 'releitura de continuação')

  // Vazio: não relê.
  assert.equal(plan({ runs: [run({ created_at: minutesBefore(60), reference_time: minutesBefore(60) })], latestObservedAt: minutesBefore(70), latestCustomerObservedAt: minutesBefore(70) }).action, 'use')

  // Já houve uma tentativa depois do horário (mesmo que tenha falhado): não
  // relê de novo por esse motivo.
  const again =
    plan({
      runs: [
        run({ run_id: 'run-after', status: 'failed', failure_code: 'INVALID_MODEL_OUTPUT', decision: null, created_at: minutesBefore(20), reference_time: minutesBefore(20), completed_at: minutesBefore(19) }),
        run({ created_at: minutesBefore(60), reference_time: minutesBefore(60), decision: storedDecision({ revisar_em: reviewAt, revisar_motivo: 'o horário da visita' }) }),
      ],
      latestObservedAt: minutesBefore(70),
      latestCustomerObservedAt: minutesBefore(70),
    })

  assert.notEqual(again.action, 'start')

  // Horário no futuro: não relê ainda.
  assert.equal(plan({ runs: [run({ decision: storedDecision({ revisar_em: '2026-10-02T19:00:00-03:00' }) })] }).action, 'use')

  // G3: a faixa diz o motivo.
  const view =
    buildFullReadingAnalysisView({
      state: 'running',
      reading: { run_id: 'run-a', completed_at: minutesBefore(59), analysis_markdown: null, decision: storedDecision() },
      failureCode: null,
      kanban: KANBAN,
      panel: { running_review: due.review_due, running_since: NOW },
    })

  assert.equal(view.notice, 'Atualizando: já passou o horário da visita (17:30).')
})

// ---------------------------------------------------------------------------
// F. Prompt v6
// ---------------------------------------------------------------------------

test('F: prompt v6 geral — gênero, pendência "nenhum", catálogo ambíguo, áudio, EVENTO, continuação e ciclo encerrado', () => {
  const system = buildFullReadingSystemPrompt()

  assert.equal(FULL_READING_PROMPT_VERSION, 'full-reading-v7')
  assert.match(system, /Gênero: use o gênero do cliente só quando a conversa deixar claro[^\n]*Na dúvida, escreva "o cliente"/)
  assert.match(system, /"nenhum" para o que não está pendente com ninguém[^\n]*Nunca use "cliente" ou "vendedor" para dizer que não há pendência/)
  assert.match(system, /mais de um item do catálogo, a nenhum item, ou for diferente do produto registrado no fechamento[^\n]*afirmacoes_a_confirmar e em contradicoes_cadastro[^\n]*não pode ser cobrar nem oferecer algo com base num plano escolhido por suposição/)
  assert.match(system, /"\[áudio\] texto" é a transcrição automática[^\n]*"\[áudio sem transcrição\]"[^\n]*não adivinhe o conteúdo/)
  assert.match(system, /Linhas EVENTO são registros do sistema de atendimento[^\n]*só diga quem fez quando a própria linha disser/)
  assert.match(system, /## Leitura de continuação\n[\s\S]*A leitura anterior foi feita antes e pode ter erro\. As mensagens novas mandam\.[\s\S]*precisa_ler_inteira true com o motivo/)
  assert.match(system, /## Ciclo encerrado\n[\s\S]*etapa_kanban_sugerida é sempre a etapa atual[\s\S]*Nova oportunidade, com o tipo: reativação, renovação, recompra, upgrade ou novo produto/)
  assert.match(system, /revisar_em é a data e hora/)
})

test('F2: pendência que não é de ninguém aparece sem o prefixo "Do cliente:" ou "Sua:", mesmo marcada como do cliente', () => {
  const view =
    buildFullReadingAnalysisView({
      state: 'ready',
      reading: {
        run_id: 'run-a',
        completed_at: minutesBefore(29),
        analysis_markdown: null,
        decision: storedDecision({
          pendencias: [
            { de: 'cliente', texto: 'Nenhuma pendência da cliente no momento.' },
            { de: 'nenhum', texto: 'Nenhuma pergunta do cliente sem resposta.' },
            { de: 'vendedor', texto: 'Enviar o contrato.' },
          ],
        }),
      },
      failureCode: null,
      kanban: KANBAN,
      panel: {},
    })

  assert.deepEqual(view.pending.map((item) => [item.owner, item.label]), [['nenhum', ''], ['nenhum', ''], ['vendedor', 'Sua']])
})

test('F6: ciclo encerrado — a etapa sugerida é sempre a atual (trava)', () => {
  const decision = decisionV6({ etapa_kanban_sugerida: 'negociacao', venda_concluida: 'confirmada' })
  const locked = applyFullReadingCoherence(decision, { currentStatus: 'ganho' })

  assert.equal(locked.decision.etapa_kanban_sugerida, 'ganho')
  assert.equal(locked.alerts[0].motivo, 'ciclo encerrado: a etapa sugerida é a atual')

  assert.equal(applyFullReadingCoherence(decisionV6({ etapa_kanban_sugerida: 'novo' }), { currentStatus: 'perdido' }).decision.etapa_kanban_sugerida, 'perdido')
})

// ---------------------------------------------------------------------------
// Apoio: banco em memória (só as consultas que o painel usa).
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
