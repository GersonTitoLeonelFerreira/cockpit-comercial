// AGORA e ANÁLISE com a flag COMPANION_FULL_READING_PANEL.
//
// Desligada (ou fora de preview), a resposta das duas rotas é exatamente a
// de hoje: o mesmo JSON, e o painel da leitura completa não toca no banco.
// Ligada em preview, a resposta de hoje ganha só `full_reading`. Os
// loaders de hoje são substituídos por fixtures sintéticas; nada aqui
// chama apply-suggestion, o fechamento ou a API do Claude.

import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

register(
  fileURLToPath(
    new URL(
      '../../../../scripts/typescript-test-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

const {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} = await import(
  '../../../lib/companion/e2-test-support/fake-companion-token.mjs'
)

installFakeSupabaseEnv()

const COMPANY = '10000000-0000-4000-8000-000000000001'
const USER = '10000000-0000-4000-8000-0000000000a1'
const CYCLE = '20000000-0000-4000-8000-000000000001'
const CONVERSATION = 'phone:5511900000000'

const adminBox = { admin: null }

const supabaseMockOptions = {
  namedExports: {
    createClient: () => adminBox.admin,
  },
}

const require =
  createRequire(import.meta.url)

mock.module(import.meta.resolve('@supabase/supabase-js'), supabaseMockOptions)
mock.module(pathToFileURL(require.resolve('@supabase/supabase-js')).href, supabaseMockOptions)

const AGORA_FIXTURE = {
  silent: false,
  silent_reason: null,
  primary: {
    status: 'respond',
    priority: 'medium',
    headline: 'Situação sintética de hoje.',
    action: 'Ação sintética de hoje.',
    provenance: { decision_kind: 'respond', source: null, evidence_message_ids: [], memory_ids: [] },
  },
  secondary: [
    {
      status: 'follow_up',
      priority: 'high',
      headline: 'Oportunidade estagnada na etapa acima do limite de SLA.',
      action: 'Retomar.',
      provenance: { decision_kind: 'follow_up', source: 'client_sla', evidence_message_ids: [], memory_ids: [] },
    },
  ],
  reference_time: '2026-10-01T15:00:00.000Z',
  reasoning: { status: 'ready', what_is_happening: 'x' },
}

const ANALYSIS_FIXTURE = {
  opportunity: { headline: 'Negociação sintética.' },
  coaching_diagnosis: { id: 'coaching-sintetico' },
  reasoning: { status: 'ready' },
}

class FakeReadError extends Error {}

const loaderCalls = []

mock.module(
  pathToFileURL(fileURLToPath(new URL('../../../lib/server/agora-decision-state-loader.ts', import.meta.url))).href,
  {
    namedExports: {
      loadAgoraViewModel: async (args) => {
        loaderCalls.push(['agora', args.cycle_id, args.conversation_key])
        return structuredClone(AGORA_FIXTURE)
      },
      AgoraDecisionStateReadError: FakeReadError,
      CompanionClientContextError: FakeReadError,
    },
  },
)

mock.module(
  pathToFileURL(fileURLToPath(new URL('../../../lib/server/analysis-view-model-loader.ts', import.meta.url))).href,
  {
    namedExports: {
      loadAnalysisViewModel: async (args) => {
        loaderCalls.push(['analysis', args.cycle_id, args.conversation_key])
        return structuredClone(ANALYSIS_FIXTURE)
      },
      AnalysisViewModelReadError: FakeReadError,
      CompanionClientContextError: FakeReadError,
    },
  },
)

const { POST: decisionStatePost } = await import('./route.ts')
const { POST: analysisPost } = await import('../analysis-view-model/route.ts')
const { POST: messagePost } = await import('../full-reading/message/route.ts')

function untouchableAdmin() {
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return undefined
      }

      throw new Error(`o painel tocou no banco com a flag desligada (${String(property)})`)
    },
  })
}

function request(body) {
  return new Request('https://preview.example/api/companion/decision-state', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearerHeader(buildToken({ sub: USER, companyId: COMPANY })),
    },
    body: JSON.stringify(body),
  })
}

async function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

const BODY = {
  cycle_id: CYCLE,
  conversation_key: CONVERSATION,
  force_reanalysis: true,
}

for (const env of [
  { COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: 'preview' },
  { COMPANION_FULL_READING_PANEL: 'off', VERCEL_ENV: 'preview' },
  { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' },
  { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: undefined },
]) {
  test(`flag desligada (${JSON.stringify(env)}): AGORA e ANÁLISE respondem exatamente como hoje`, () =>
    withEnv({ ...env, ANTHROPIC_API_KEY: 'sk-ant-teste' }, async () => {
      adminBox.admin = untouchableAdmin()

      const agora = await decisionStatePost(request(BODY))
      const analysis = await analysisPost(request(BODY))

      assert.equal(agora.status, 200)
      assert.equal(analysis.status, 200)
      assert.deepEqual(await agora.json(), { ok: true, data: AGORA_FIXTURE })
      assert.deepEqual(await analysis.json(), { ok: true, data: ANALYSIS_FIXTURE })
    }))
}

// Banco em memória mínimo: só o que o painel lê quando a rodada está
// fresca (nenhuma escrita esperada).
function freshRunAdmin() {
  const tables = {
    sales_cycles: [
      { id: CYCLE, company_id: COMPANY, status: 'novo', stage_entered_at: '2026-09-20T12:00:00.000Z', next_action: null, next_action_date: null, lost_at: null, canceled_at: null, closed_at: null },
    ],
    conversation_messages: [
      { company_id: COMPANY, cycle_id: CYCLE, conversation_key: CONVERSATION, direction: 'incoming', occurred_at: '2026-09-29T20:00:00.000Z', observed_at: '2026-09-29T21:00:00.000Z' },
    ],
    companion_full_reading_runs: [
      {
        run_id: 'run-1',
        company_id: COMPANY,
        cycle_id: CYCLE,
        conversation_key: CONVERSATION,
        status: 'succeeded',
        prompt_version: 'full-reading-v4',
        reference_time: '2026-09-30T12:00:00.000Z',
        created_at: '2026-09-30T12:00:00.000Z',
        started_at: '2026-09-30T12:00:00.000Z',
        completed_at: '2026-09-30T12:00:50.000Z',
        failure_code: null,
        analysis_markdown: '### Fase da relação e etapa do método\nCliente ativa.',
        decision: {
          fase_relacao: 'cliente_ativo',
          etapa_metodo_atual: '',
          venda_concluida: 'provavel',
          vez_de: 'cliente',
          pendencia_do_vendedor: false,
          situacao_resumo: 'Cliente já usa o serviço.',
          acao_agora: 'nao_intervir',
          acao_resumo: 'Não enviar nada agora.',
          por_que: 'Sem pergunta em aberto.',
          etapa_kanban_sugerida: 'ganho',
          motivo_etapa: 'Pediu acesso em 29/09.',
          fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '', valor_total: '', forma_pagamento_codigo: '', tipo_pagamento_codigo: '' },
          cliente: { sabemos: ['Usa o serviço.'], inferimos: [], a_confirmar: [] },
          oportunidades: [],
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
          sistema: { kanban_lido: { status: 'novo', stage_entered_at: '2026-09-20T12:00:00.000Z' }, alertas: [], saida_estruturada: true },
        },
      },
    ],
  }

  const writes = []

  return {
    writes,
    admin: {
      from(table) {
        const filters = []
        let single = false
        let mode = 'select'

        const builder = {
          select() { return builder },
          eq(column, value) { filters.push((row) => row[column] === value); return builder },
          in(column, values) { filters.push((row) => values.includes(row[column])); return builder },
          order() { return builder },
          limit() { return builder },
          maybeSingle() { single = true; return builder },
          insert(payload) { mode = 'insert'; writes.push({ table, payload }); return builder },
          update(payload) { mode = 'update'; writes.push({ table, payload }); return builder },
          then(resolve) {
            const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))

            resolve(
              mode !== 'select'
                ? { error: null }
                : single
                  ? { data: rows[0] ?? null, error: null }
                  : { data: rows, error: null },
            )
          },
        }

        return builder
      },
    },
  }
}

test('flag ligada em preview: a resposta de hoje ganha só `full_reading` (e perde o SLA da etapa)', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview', ANTHROPIC_API_KEY: 'sk-ant-teste' }, async () => {
    const memory = freshRunAdmin()
    adminBox.admin = memory.admin

    const agora = await (await decisionStatePost(request({ cycle_id: CYCLE, conversation_key: CONVERSATION }))).json()
    const analysis = await (await analysisPost(request({ cycle_id: CYCLE, conversation_key: CONVERSATION }))).json()

    assert.equal(agora.ok, true)
    assert.equal(agora.data.full_reading.state, 'ready')
    assert.equal(agora.data.full_reading.stage_card.button_label, 'Confirmar venda')
    assert.deepEqual(agora.data.secondary, [])

    const { full_reading: _agoraView, secondary: _secondary, ...agoraRest } = agora.data
    const { secondary: _fixtureSecondary, ...fixtureRest } = AGORA_FIXTURE

    assert.deepEqual(agoraRest, fixtureRest)

    const { full_reading: analysisView, ...analysisRest } = analysis.data

    assert.deepEqual(analysisRest, ANALYSIS_FIXTURE)
    // v4: a ANÁLISE vem dos campos estruturados (blocos de resumo), não do
    // markdown.
    assert.equal(analysisView.has_reading, true)
    assert.deepEqual(analysisView.summary.map((block) => block.label), ['Fase', 'Método', 'Kanban', 'Venda'])
    assert.deepEqual(analysisView.sections, [])

    // Rodada fresca: nenhuma escrita.
    assert.deepEqual(memory.writes, [])
  }))

test('Gerar mensagem da leitura: com a flag desligada a rota não existe (404) e não toca no banco', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: 'preview', ANTHROPIC_API_KEY: 'sk-ant-teste' }, async () => {
    adminBox.admin = untouchableAdmin()

    const response = await messagePost(request({ ...BODY, seller_intent: 'Quero avisar que o acesso foi liberado.' }))

    assert.equal(response.status, 404)
  }))

test('Gerar mensagem da leitura: em produção também não existe; em preview exige a sessão do Companion', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production', ANTHROPIC_API_KEY: 'sk-ant-teste' }, async () => {
    adminBox.admin = untouchableAdmin()

    assert.equal((await messagePost(request({ ...BODY, seller_intent: 'x' }))).status, 404)

    process.env.VERCEL_ENV = 'preview'

    const unauthenticated = await messagePost(new Request('https://preview.example/api/companion/full-reading/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...BODY, seller_intent: 'x' }),
    }))

    assert.equal(unauthenticated.status, 401)
  }))
