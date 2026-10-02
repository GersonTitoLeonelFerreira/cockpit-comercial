// Rodada 10 (HML), item F: Yolen web sem análise duplicada. Fixtures
// sintéticas; clientes do banco falsos (nada toca o banco).
//
// - F1: o quadro "Resumo salvo na Yolen" da página do lead mostra a última
//   leitura do Companion (situação, próximo passo, data e hora) com link
//   para a seção; sem leitura, fica a frase de hoje. Só com a flag e com as
//   mesmas regras de acesso da seção.
// - F2: no HML, o Copiloto Comercial da página do lead leva para a seção
//   (sem gerar outra análise paga).
// - F3: com a flag desligada, a página é a de hoje.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  loadLatestLeadCompanionReading,
} from './full-reading-cycle-readings.ts'

const COMPANY = '9b000000-0000-4000-8000-000000000001'
const USER = '9b000000-0000-4000-8000-0000000000a1'
const CYCLE = '9b000000-0000-4000-8000-0000000000c1'
const OLD_CYCLE = '9b000000-0000-4000-8000-0000000000c0'
const HIDDEN = '9b000000-0000-4000-8000-0000000000c9'

const HML = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }

function decision(overrides = {}) {
  return {
    fase_relacao: 'negociacao',
    etapa_metodo_atual: '',
    venda_concluida: 'nao',
    vez_de: 'vendedor',
    pendencia_do_vendedor: true,
    situacao_resumo: 'O cliente pediu o valor e espera resposta.',
    cliente: { sabemos: [], inferimos: [], a_confirmar: [] },
    pendencias: [],
    contradicoes_cadastro: [],
    como_conduzir: { leitura_do_momento: '', passos: [], evitar: [] },
    acao_agora: 'responder',
    acao_resumo: 'Responder o valor.',
    por_que: 'O cliente perguntou.',
    proximo_passo_titulo: 'Responder o valor do plano',
    proximo_passo_complemento: 'Depois, propor um horário.',
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
    sistema: { kanban_lido: { status: 'contato', stage_entered_at: null }, alertas: [], saida_estruturada: false, modo: 'completa' },
    ...overrides,
  }
}

function runRow(overrides = {}) {
  return {
    run_id: '9b000000-0000-4000-8000-0000000000f1',
    company_id: COMPANY,
    cycle_id: CYCLE,
    status: 'succeeded',
    prompt_version: 'full-reading-v7',
    completed_at: '2026-10-02T22:32:00.000Z',
    created_at: '2026-10-02T22:31:00.000Z',
    analysis_markdown: null,
    decision: decision(),
    ...overrides,
  }
}

const cycleRow = (id, overrides = {}) => ({
  id,
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

function fakeClient(tables, calls, label) {
  return {
    from(table) {
      calls.push({ client: label, table })
      const filters = []
      let single = false

      const run = () => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
        return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
      }

      const chain = {
        select() { return chain },
        eq(column, value) { filters.push((row) => row[column] === value); return chain },
        in(column, values) { filters.push((row) => values.includes(row[column])); return chain },
        order() { return chain },
        limit() { return chain },
        maybeSingle() { single = true; return chain },
        insert() { calls.push({ client: label, op: 'insert' }); return chain },
        update() { calls.push({ client: label, op: 'update' }); return chain },
        then(resolve, reject) { Promise.resolve().then(() => resolve(run()), reject) },
      }

      return chain
    },
  }
}

function access({ visible = [cycleRow(CYCLE)], runs = [runRow()], memberships = [{ company_id: COMPANY, user_id: USER, is_active: true }] } = {}) {
  const calls = []

  return {
    calls,
    access: {
      userClient: fakeClient({ company_memberships: memberships, sales_cycles: visible }, calls, 'user'),
      admin: fakeClient({ companion_full_reading_runs: runs }, calls, 'admin'),
      userId: USER,
      activeCompanyId: COMPANY,
    },
  }
}

test('F1: com a flag, o resumo do topo é a última leitura do Companion — situação, próximo passo, data e hora', async () => {
  const { access: scope, calls } = access({
    visible: [cycleRow(CYCLE), cycleRow(OLD_CYCLE, { status: 'ganho' })],
    runs: [
      runRow(),
      runRow({ run_id: '9b000000-0000-4000-8000-0000000000f0', cycle_id: OLD_CYCLE, created_at: '2026-09-01T10:00:00.000Z', completed_at: '2026-09-01T10:01:00.000Z', decision: decision({ situacao_resumo: 'Leitura antiga.' }) }),
    ],
  })

  const summary =
    await loadLatestLeadCompanionReading({ access: scope, cycleIds: [CYCLE, OLD_CYCLE], env: HML })

  assert.deepEqual(summary, {
    cycle_id: CYCLE,
    run_id: '9b000000-0000-4000-8000-0000000000f1',
    when_label: '02/10, 19:32',
    situation: 'O cliente pediu o valor e espera resposta.',
    next_step: 'Responder o valor do plano Depois, propor um horário.',
  })

  // Só leitura.
  assert.equal(calls.some((call) => call.op), false)
})

test('F1: sem leitura (ou só leitura de medição), o quadro fica como hoje', async () => {
  const none = access({ runs: [] })
  assert.equal(await loadLatestLeadCompanionReading({ access: none.access, cycleIds: [CYCLE], env: HML }), null)

  const evalOnly = access({ runs: [runRow({ prompt_version: 'full-reading-v7-eval' })] })
  assert.equal(await loadLatestLeadCompanionReading({ access: evalOnly.access, cycleIds: [CYCLE], env: HML }), null)
})

test('F1: mesmas regras de acesso da seção — sem vínculo ativo ou com ciclo invisível, nada é lido', async () => {
  const noMembership = access({ memberships: [] })

  assert.equal(await loadLatestLeadCompanionReading({ access: noMembership.access, cycleIds: [CYCLE], env: HML }), null)
  assert.equal(noMembership.calls.some((call) => call.client === 'admin'), false)

  // O ciclo que o usuário não vê (RLS) nunca entra na busca das leituras.
  const hidden = access({ visible: [cycleRow(CYCLE)], runs: [runRow({ cycle_id: HIDDEN, created_at: '2026-10-02T23:00:00.000Z' }), runRow()] })
  const summary = await loadLatestLeadCompanionReading({ access: hidden.access, cycleIds: [CYCLE, HIDDEN], env: HML })

  assert.equal(summary.cycle_id, CYCLE)
})

test('F3: flag desligada (ou fora do preview) — nada é lido e o quadro é o de hoje', async () => {
  for (const env of [{}, { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' }]) {
    const { access: scope, calls } = access()

    assert.equal(await loadLatestLeadCompanionReading({ access: scope, cycleIds: [CYCLE], env }), null)
    assert.deepEqual(calls, [])
  }
})

test('F1/F2/F3: a página do lead usa a leitura só com a flag; o Copiloto leva para a seção no HML', () => {
  const page = readFileSync(new URL('../../leads/[id]/page.tsx', import.meta.url), 'utf8')
  const toggle = readFileSync(new URL('../../sales-cycles/[id]/components/CopilotTogglePanel.tsx', import.meta.url), 'utf8')
  const section = readFileSync(new URL('../../sales-cycles/[id]/components/CompanionReadingsSection.tsx', import.meta.url), 'utf8')

  // A busca só acontece com a flag (sem ela, nenhum cliente de serviço).
  assert.match(page, /const companionAdmin =\s*isFullReadingPanelEnabled\(process\.env\)\s*\?\s*createFullReadingAdminClient\(\)\s*:\s*null/)
  assert.match(page, /companionReading \? \([\s\S]*?\) : leadSummary \? \(/)
  assert.match(page, /Ainda não existe resumo salvo para este lead\./)
  assert.match(page, /Leitura do Companion · \{companionReading\.when_label\}/)
  assert.match(page, /#leitura-do-companion/)
  assert.match(section, /id="leitura-do-companion"/)

  // Copiloto: com a flag, o link para a seção; sem ela, o painel de hoje.
  assert.match(page, /companionReadingHref=\{\s*isFullReadingPanelEnabled\(process\.env\)\s*\?\s*'#leitura-do-companion'\s*:\s*null\s*\}/)
  assert.match(toggle, /if \(companionReadingHref\) \{[\s\S]*?Ver a leitura do Companion[\s\S]*?return \(/)

  const companionBranch = toggle.slice(toggle.indexOf('if (companionReadingHref) {'), toggle.indexOf('return (\n    <>\n      <div\n        style={{\n          background', toggle.indexOf('if (companionReadingHref) {') + 30))

  assert.doesNotMatch(companionBranch, /ConversationCopilot/)
})
