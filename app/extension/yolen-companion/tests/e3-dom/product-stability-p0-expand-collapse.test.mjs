// Pacote de estabilização P0 — FNC-03: minimizar e expandir o Companion
// não pode reconstruir a UI aos pedaços.
//
// Contrato de produto (seller-facing), nos dois canais (mesmo Core):
// - com um clique REAL (pointerdown → foco → click), minimizar aplica a
//   casca recolhida na hora e o botão de expandir responde de imediato;
// - expandir monta o shell inteiro na hora (marca, empresa, conexão,
//   contato, abas, corpo e rodapé) e ele continua inteiro depois que as
//   filas dos runtimes de estabilidade terminam — nunca um painel escuro
//   sem identidade, nunca regiões voltando em etapas;
// - a aba ativa e o contexto comercial já válido permanecem;
// - minimizar/expandir não dispara análise, sessão, resolução nem recarga
//   de resumo;
// - o mesmo vale durante a proteção de retomada da janela (resume guard).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARITY_PHONE,
  panelOf,
  sleep,
  startParityChannel,
  waitForBoth,
  waitForQuiet,
} from '../e3-test-support/cross-channel-parity.mjs'
import {
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadResolution,
} from '../e3-test-support/load-content-script.mjs'
import {
  callCounts,
  pinAutomaticAnalysisDelay,
  realClick,
  settleStabilityQueues,
} from '../e3-test-support/product-stability.mjs'

const CHANNELS = ['whatsapp', 'manychat']
const SHELL_REGIONS = ['header', 'contact-card', 'seller-area-tabs', 'footer']

function ownedResolution() {
  return defaultLeadResolution({
    status: 'OWNED_BY_ME',
    phone: PARITY_PHONE,
    lead: { id: 'lead-p0', name: 'Lead Estável', phone: PARITY_PHONE, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: 'cycle-p0', status: 'contato', owner_user_id: 'user-1' },
  })
}

function summary(text = 'Cliente pediu a proposta do plano anual.') {
  return (_count, request) => ({
    ok: true,
    data: {
      identity: { company_id: 'company-1', lead_id: 'lead-p0', cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
      summary: { summary: text, version: 1, updated_at: '2026-09-20T12:00:00.000Z' },
      working_summary: text,
    },
  })
}

function start(channel, extra = {}) {
  return startParityChannel(
    channel,
    {
      resolution: ownedResolution(),
      messages: [{ mid: 'm1', text: 'Quanto custa o plano anual com implantação?' }],
      backend: {
        decisionStateResult: defaultAgoraDecisionState(),
        clientContextResult: defaultClientContext(),
        leadSummaryResult: summary(),
      },
    },
    {
      beforeLoad: ({ dom }) => pinAutomaticAnalysisDelay(dom, 2 ** 31 - 1),
      ...extra,
    },
  )
}

const workspaceLoaded = (runtime) => runtime.calls.some((call) => call.action === 'LOAD_CUSTOMER_VIEW_MODEL')

function region(runtime, key) {
  return panelOf(runtime)?.querySelector(`[data-yolen-region="${key}"]`) ?? null
}

// O que o vendedor vê do shell expandido, lido do DOM real.
function shellSnapshot(runtime) {
  const panel = panelOf(runtime)
  return {
    collapsed: Boolean(panel.querySelector('.yolen-collapsed-shell')),
    regions: Object.fromEntries(
      SHELL_REGIONS.map((key) => [key, (region(runtime, key)?.innerHTML.trim().length ?? 0) > 0]),
    ),
    brand: panel.querySelector('.yolen-title')?.textContent.trim() ?? null,
    company: panel.querySelector('.yolen-subtitle')?.textContent.trim() ?? null,
    connection: panel.querySelector('.yolen-connection-pill')?.textContent.trim() ?? null,
    lead: panel.querySelector('.yolen-lead-name')?.textContent.trim() ?? null,
    activeTab: panel.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-yolen-seller-area') ?? null,
    workspaceBody: Boolean(panel.querySelector('[data-yolen-workspace-body] [data-yolen-seller-panel]')),
  }
}

function assertExpandedShell(runtime, expected, label) {
  const snapshot = shellSnapshot(runtime)
  assert.equal(snapshot.collapsed, false, `${runtime.channel} ${label}: casca recolhida não pode continuar no painel expandido`)
  for (const key of SHELL_REGIONS) {
    assert.equal(snapshot.regions[key], true, `${runtime.channel} ${label}: região "${key}" precisa existir com conteúdo`)
  }
  assert.equal(snapshot.brand, 'Yolen Companion', `${runtime.channel} ${label}: marca visível`)
  assert.equal(snapshot.company, expected.company, `${runtime.channel} ${label}: empresa visível`)
  assert.equal(snapshot.connection, expected.connection, `${runtime.channel} ${label}: conexão visível`)
  assert.equal(snapshot.lead, expected.lead, `${runtime.channel} ${label}: contexto comercial do contato preservado`)
  assert.equal(snapshot.activeTab, expected.activeTab, `${runtime.channel} ${label}: aba ativa preservada`)
  assert.equal(snapshot.workspaceBody, true, `${runtime.channel} ${label}: conteúdo das abas presente`)
}

async function readyRuntime(channel, extra) {
  const runtime = start(channel, extra)
  await waitForBoth([runtime], workspaceLoaded)
  await waitForBoth([runtime], (candidate) => Boolean(panelOf(candidate)?.querySelector('[data-yolen-seller-area="analysis"]')))
  await waitForQuiet([runtime])
  return runtime
}

for (const channel of CHANNELS) {
  test(`FNC-03 (${channel}): minimizar e expandir com clique real montam o shell inteiro na hora e ele continua inteiro`, async () => {
    const runtime = await readyRuntime(channel)

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-area="analysis"]'))
    await settleStabilityQueues(runtime)
    const expected = shellSnapshot(runtime)
    assert.equal(expected.activeTab, 'analysis')
    assert.ok(expected.company && expected.connection && expected.lead, 'pré-condição: shell com identidade')

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="collapse-companion"]'))

    // Na mesma tarefa do clique: a casca recolhida já está aplicada.
    assert.ok(panelOf(runtime).querySelector('.yolen-collapsed-shell'), 'minimizar aplica a casca recolhida na hora')
    assert.equal(region(runtime, 'header'), null, 'shell expandido saiu junto')

    // Expandir logo em seguida, sem nenhum render de fundo no meio.
    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="expand-companion"]'))
    assertExpandedShell(runtime, expected, 'na mesma tarefa do clique de expandir')

    await settleStabilityQueues(runtime)
    assertExpandedShell(runtime, expected, 'depois das filas dos runtimes de estabilidade')

    await sleep(300)
    assertExpandedShell(runtime, expected, '300 ms depois')
  })

  test(`FNC-03 (${channel}): minimizar/expandir repetidos não têm frame vazio nem efeito de rede (sessão, resolução, resumo, análise)`, async () => {
    const runtime = await readyRuntime(channel, {
      // A análise automática fica elegível e falha: se minimizar/expandir
      // disparasse qualquer reexecução, ela apareceria como nova chamada.
      beforeLoad: ({ dom }) => pinAutomaticAnalysisDelay(dom, 50),
      analysisResult: { ok: false, error: 'Falha controlada do cenário.' },
    })
    await waitForBoth([runtime], (candidate) => callCounts(candidate).ANALYZE_CONVERSATION >= 1)
    await waitForQuiet([runtime], 1200)

    const expected = shellSnapshot(runtime)
    const before = callCounts(runtime)

    for (let round = 0; round < 5; round += 1) {
      realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="collapse-companion"]'))
      await settleStabilityQueues(runtime)
      assert.ok(panelOf(runtime).querySelector('.yolen-collapsed-shell'), `rodada ${round}: recolhido`)

      realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="expand-companion"]'))
      assertExpandedShell(runtime, expected, `rodada ${round}: imediatamente`)
      await settleStabilityQueues(runtime)
      assertExpandedShell(runtime, expected, `rodada ${round}: depois das filas`)
    }

    // Recuperação de runtime (350 ms) + debounce da análise automática.
    await sleep(1200)
    await waitForQuiet([runtime])
    assert.deepEqual(callCounts(runtime), before, 'minimizar/expandir não pode chamar backend nem iniciar análise')
  })

  test(`FNC-03 (${channel}): logo depois de voltar para a janela (resume guard ativo) minimizar/expandir continuam imediatos e estáveis`, async () => {
    const runtime = await readyRuntime(channel)
    const expected = shellSnapshot(runtime)

    runtime.window.dispatchEvent(new runtime.window.Event('blur'))
    runtime.window.dispatchEvent(new runtime.window.Event('focus'))
    assert.equal(runtime.window.YolenCompanionPanelStabilityRuntime.isResumeGuardActive(), true, 'pré-condição: proteção de retomada ativa')

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="collapse-companion"]'))
    assert.ok(panelOf(runtime).querySelector('.yolen-collapsed-shell'), 'minimizar aplica na hora mesmo com a proteção de retomada')

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="expand-companion"]'))
    assertExpandedShell(runtime, expected, 'expandido durante a proteção de retomada')

    // Fim da proteção (2 s): nada adiado pode apagar o shell depois.
    await sleep(2300)
    await settleStabilityQueues(runtime)
    assertExpandedShell(runtime, expected, 'depois do fim da proteção de retomada')
  })
}
