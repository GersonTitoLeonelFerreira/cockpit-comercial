// Rodada 9 (Fase 2): Leitura do Companion no cadastro do ciclo. Matriz de
// autorização da rota nova, de ponta a ponta (route.ts real), com a sessão
// do Yolen (next/headers + @supabase/ssr) e o cliente de serviço
// (@supabase/supabase-js) simulados. Fixtures sintéticas.
//
// - Flag desligada: 404 antes de qualquer leitura.
// - Sem sessão: 401. Sem empresa ativa ou sem vínculo ativo: 403.
// - Ciclo que o usuário não vê (RLS) ou de outra empresa: 404, e as
//   leituras nem são lidas.
// - Com acesso: a última leitura, a lista, e a origem (Nova oportunidade)
//   só se o usuário também vê o ciclo de origem. Só leitura (nenhuma
//   escrita, nenhum evento novo).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://fake.supabase.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'fake-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'fake-service-role'

const COMPANY = '92000000-0000-4000-8000-000000000001'
const OTHER_COMPANY = '92000000-0000-4000-8000-000000000002'
const CYCLE = '92000000-0000-4000-8000-0000000000c1'
const ORIGIN = '92000000-0000-4000-8000-0000000000c0'
const HIDDEN = '92000000-0000-4000-8000-0000000000c9'
const USER = '92000000-0000-4000-8000-0000000000a1'

const box = {
  user: { id: USER },
  company: COMPANY,
  memberships: [],
  visibleCycles: [],
  runs: [],
  calls: [],
}

function builder(rows, log, label) {
  const filters = []
  let single = false

  const run = () => {
    const data = rows.filter((row) => filters.every((filter) => filter(row)))
    return single ? { data: data[0] ?? null, error: null } : { data, error: null }
  }

  const chain = {
    select(columns) { log.push({ client: label, op: 'select', columns }); return chain },
    insert() { log.push({ client: label, op: 'insert' }); return chain },
    update() { log.push({ client: label, op: 'update' }); return chain },
    upsert() { log.push({ client: label, op: 'upsert' }); return chain },
    delete() { log.push({ client: label, op: 'delete' }); return chain },
    eq(column, value) { filters.push((row) => row[column] === value); return chain },
    in(column, values) { filters.push((row) => values.includes(row[column])); return chain },
    order() { return chain },
    limit() { return chain },
    maybeSingle() { single = true; return chain },
    then(resolve, reject) { Promise.resolve().then(() => resolve(run()), reject) },
  }

  return chain
}

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      get(name) {
        return name === 'cockpit_active_company_id' && box.company
          ? { value: box.company }
          : undefined
      },
      getAll() {
        return []
      },
      set() {},
    }),
  },
})

mock.module('@supabase/ssr', {
  namedExports: {
    createServerClient: () => ({
      auth: {
        async getUser() {
          box.calls.push({ client: 'user', op: 'auth.getUser' })
          return box.user ? { data: { user: box.user }, error: null } : { data: null, error: { message: 'no session' } }
        },
      },
      from(table) {
        box.calls.push({ client: 'user', op: 'from', table })
        const rows =
          table === 'company_memberships'
            ? box.memberships
            : table === 'sales_cycles'
              ? box.visibleCycles
              : []
        return builder(rows, box.calls, 'user')
      },
    }),
  },
})

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      from(table) {
        box.calls.push({ client: 'admin', op: 'from', table })
        return builder(table === 'companion_full_reading_runs' ? box.runs : [], box.calls, 'admin')
      },
    }),
  },
})

const { GET } = await import('./route.ts')

function decision(overrides = {}) {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'O cliente pediu o valor e espera resposta.',
    cliente: { sabemos: ['Pediu o valor (02/10)'], inferimos: ['Quer começar logo.'], a_confirmar: ['O melhor horário.'] },
    pendencias: [{ de: 'cliente', texto: 'Nenhuma pendência do cliente.' }, { de: 'vendedor', texto: 'Responder o valor' }],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: 'Interessado.', passos: [{ tecnica: 'Valor antes de preço', como: 'Ligar ao objetivo.', exemplo: '' }], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Responder o valor.',
    por_que: 'O cliente perguntou.',
    proximo_passo_titulo: 'Responder o valor do plano',
    proximo_passo_complemento: 'Depois, propor um horário.',
    mensagem_sugerida: 'Oi! O valor é R$ 100,00.',
    mensagem_observacao: '',
    conducao: { acertos: [], ajustes: [] },
    para_o_gestor: ['Risco de perder o cliente pela demora.'],
    etapa_kanban_sugerida: 'negociacao',
    motivo_etapa: 'Pediu o valor.',
    fechamento: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '', valor_total: '', forma_pagamento_codigo: '', tipo_pagamento_codigo: '' },
    oportunidades: [{ descricao: 'Indicação de um amigo', status: 'em_aberto' }],
    afirmacoes_a_confirmar: ['Qual plano foi vendido.'],
    alertas_de_captura: [],
    linha_do_tempo: [],
    confianca_geral: 'alta',
    sistema: { kanban_lido: { status: 'contato', stage_entered_at: null }, alertas: [], saida_estruturada: false, modo: 'completa' },
    ...overrides,
  }
}

function runRow(overrides = {}) {
  return {
    run_id: '92000000-0000-4000-8000-0000000000f1',
    company_id: COMPANY,
    cycle_id: CYCLE,
    status: 'succeeded',
    prompt_version: 'full-reading-v6',
    completed_at: '2026-10-02T20:31:00.000Z',
    created_at: '2026-10-02T20:30:00.000Z',
    analysis_markdown: null,
    decision: decision(),
    ...overrides,
  }
}

const cycleRow = (overrides = {}) => ({
  id: CYCLE,
  company_id: COMPANY,
  status: 'contato',
  stage_entered_at: null,
  next_action: null,
  next_action_date: null,
  origin_cycle_id: null,
  lost_at: null,
  canceled_at: null,
  closed_at: null,
  ...overrides,
})

function withFlag(on, run) {
  const previous = { panel: process.env.COMPANION_FULL_READING_PANEL, env: process.env.VERCEL_ENV }
  process.env.COMPANION_FULL_READING_PANEL = on ? 'on' : 'off'
  process.env.VERCEL_ENV = 'preview'

  return Promise.resolve()
    .then(run)
    .finally(() => {
      process.env.COMPANION_FULL_READING_PANEL = previous.panel
      process.env.VERCEL_ENV = previous.env
      if (previous.panel === undefined) delete process.env.COMPANION_FULL_READING_PANEL
      if (previous.env === undefined) delete process.env.VERCEL_ENV
    })
}

const request = (query) =>
  new Request(`http://localhost/api/sales-cycles/companion-readings?${query}`)

const adminReads = () =>
  box.calls.filter((call) => call.client === 'admin' && call.op === 'from')

const writes = () =>
  box.calls.filter((call) => ['insert', 'update', 'upsert', 'delete'].includes(call.op))

test.beforeEach(() => {
  box.user = { id: USER }
  box.company = COMPANY
  box.memberships = [{ company_id: COMPANY, user_id: USER, is_active: true }]
  box.visibleCycles = [cycleRow()]
  box.runs = [runRow()]
  box.calls = []
})

test('flag desligada: 404 antes de qualquer leitura (a página do ciclo fica igual)', () =>
  withFlag(false, async () => {
    const response = await GET(request(`cycle_id=${CYCLE}`))

    assert.equal(response.status, 404)
    assert.deepEqual(box.calls, [])
  }))

test('sem sessão do Yolen: 401, sem ler nada', () =>
  withFlag(true, async () => {
    box.user = null
    const response = await GET(request(`cycle_id=${CYCLE}`))

    assert.equal(response.status, 401)
    assert.deepEqual(adminReads(), [])
  }))

test('sem empresa ativa ou sem vínculo ativo: 403, as leituras nem são lidas', () =>
  withFlag(true, async () => {
    box.company = null
    assert.equal((await GET(request(`cycle_id=${CYCLE}`))).status, 403)

    box.company = COMPANY
    box.memberships = [{ company_id: COMPANY, user_id: USER, is_active: false }]
    assert.equal((await GET(request(`cycle_id=${CYCLE}`))).status, 403)

    assert.deepEqual(adminReads(), [])
  }))

test('ciclo que o usuário não vê (RLS), de outra empresa ou id inválido: sem acesso e sem ler a tabela', () =>
  withFlag(true, async () => {
    box.visibleCycles = []
    assert.equal((await GET(request(`cycle_id=${CYCLE}`))).status, 404)

    box.visibleCycles = [cycleRow({ company_id: OTHER_COMPANY })]
    assert.equal((await GET(request(`cycle_id=${CYCLE}`))).status, 404)

    assert.equal((await GET(request('cycle_id=nao-e-uuid'))).status, 400)

    assert.deepEqual(adminReads(), [])
  }))

test('com acesso: última leitura com os textos do painel e a lista; medição e falha ficam fora; só leitura', () =>
  withFlag(true, async () => {
    box.runs = [
      runRow(),
      runRow({ run_id: '92000000-0000-4000-8000-0000000000f2', created_at: '2026-10-02T18:00:00.000Z', completed_at: '2026-10-02T18:01:00.000Z', decision: decision({ proximo_passo_titulo: 'Confirmar o horário', sistema: { kanban_lido: { status: 'contato' }, alertas: [], modo: 'continuacao' } }) }),
      runRow({ run_id: '92000000-0000-4000-8000-0000000000f3', prompt_version: 'full-reading-v6-eval' }),
      runRow({ run_id: '92000000-0000-4000-8000-0000000000f4', status: 'failed', decision: { pedido: { motivo: ['mensagem_nova'] } } }),
      runRow({ run_id: '92000000-0000-4000-8000-0000000000f5', company_id: OTHER_COMPANY }),
    ]

    const response = await GET(request(`cycle_id=${CYCLE}`))
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(body.current.readings.map((item) => [item.title, item.mode_label]), [
      ['Responder o valor do plano', 'Leitura completa'],
      ['Confirmar o horário', 'Atualização'],
    ])
    assert.equal(body.current.readings[0].when_label, '02/10, 17:31')

    const latest = body.current.latest

    assert.equal(latest.situation, 'O cliente pediu o valor e espera resposta.')
    assert.equal(latest.next_step.title, 'Responder o valor do plano')
    assert.deepEqual(latest.pending.map((item) => [item.label, item.text]), [['', 'Nenhuma pendência do cliente.'], ['Sua', 'Responder o valor']])
    assert.deepEqual(latest.to_confirm, ['Qual plano foi vendido.'])
    assert.deepEqual(latest.manager_notes, ['Risco de perder o cliente pela demora.'])
    assert.equal(latest.opportunities[0].text, 'Indicação de um amigo')
    assert.equal(latest.conduct.steps[0].technique, 'Valor antes de preço')
    assert.ok(latest.client.said.length > 0)
    assert.deepEqual(body.origins, [])
    // Sem código interno nos textos.
    assert.doesNotMatch(JSON.stringify(body), /PROVIDER_|INVALID_MODEL|nao_intervir|verificacao_interna/)
    assert.deepEqual(writes(), [], 'só leitura')
  }))

test('Nova oportunidade: as leituras do ciclo de origem aparecem separadas, só se o usuário também vê a origem', () =>
  withFlag(true, async () => {
    box.visibleCycles = [cycleRow({ origin_cycle_id: ORIGIN }), cycleRow({ id: ORIGIN, status: 'ganho' })]
    box.runs = [runRow(), runRow({ run_id: '92000000-0000-4000-8000-0000000000e1', cycle_id: ORIGIN, decision: decision({ proximo_passo_titulo: 'Acompanhar o uso' }) })]

    const body = await (await GET(request(`cycle_id=${CYCLE}`))).json()

    assert.equal(body.origins.length, 1)
    assert.equal(body.origins[0].cycle_id, ORIGIN)
    assert.equal(body.origins[0].label, 'Oportunidade de origem')
    assert.deepEqual(body.origins[0].readings.map((item) => item.title), ['Acompanhar o uso'])
    assert.deepEqual(body.current.readings.map((item) => item.title), ['Responder o valor do plano'])

    // Origem que o usuário não vê: fica de fora.
    box.visibleCycles = [cycleRow({ origin_cycle_id: HIDDEN })]
    const hidden = await (await GET(request(`cycle_id=${CYCLE}`))).json()

    assert.deepEqual(hidden.origins, [])
  }))

test('abrir uma leitura anterior: só de um ciclo conferido', () =>
  withFlag(true, async () => {
    box.runs = [runRow(), runRow({ run_id: '92000000-0000-4000-8000-0000000000f2', created_at: '2026-10-02T18:00:00.000Z', decision: decision({ proximo_passo_titulo: 'Confirmar o horário' }) })]

    const opened = await (await GET(request(`cycle_id=${CYCLE}&run_id=92000000-0000-4000-8000-0000000000f2`))).json()

    assert.equal(opened.selected.next_step.title, 'Confirmar o horário')

    const foreign = await (await GET(request(`cycle_id=${CYCLE}&run_id=92000000-0000-4000-8000-0000000000aa`))).json()

    assert.equal(foreign.selected, null)
    assert.equal((await GET(request(`cycle_id=${CYCLE}&run_id=xyz`))).status, 400)
  }))

test('página do ciclo: a seção só existe com a flag; nenhum evento novo na linha do tempo', () => {
  const page = readFileSync(fileURLToPath(new URL('../../../leads/[id]/page.tsx', import.meta.url)), 'utf8')
  const section = readFileSync(fileURLToPath(new URL('../../../sales-cycles/[id]/components/CompanionReadingsSection.tsx', import.meta.url)), 'utf8')
  const module = readFileSync(fileURLToPath(new URL('../../../lib/server/full-reading-cycle-readings.ts', import.meta.url)), 'utf8')

  assert.match(page, /isFullReadingPanelEnabled\(process\.env\) \? \(\s*<CompanionReadingsSection cycleId=\{selectedCycle\.id\} \/>\s*\) : null/)
  assert.match(section, /Leitura do Companion/)
  assert.doesNotMatch(module, /cycle_events|\.insert\(|\.update\(|\.upsert\(/)
  assert.doesNotMatch(section, /cycle_events/)
})
