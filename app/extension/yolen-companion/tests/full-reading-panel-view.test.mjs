// Leitura completa no painel (HML): o texto do modelo nunca entra em HTML.
// O HTML do painel leva só o marcador; o conteúdo é montado com
// createElement/textContent. Textos sintéticos.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const view = require('../src/companion-seller-information-view.js')
const reasoningView = require('../src/companion-reasoning-view.js')

const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>'

function agoraView(overrides = {}) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    kanban: { status: 'novo', label: 'NOVO' },
    kanban_line: 'Etapa no kanban: NOVO',
    main: {
      situacao: `Cliente ativa ${HOSTILE}`,
      acao: 'Não enviar nada agora.',
      por_que: 'Sem pergunta em aberto.',
    },
    stage_card: {
      kind: 'confirm_won',
      current_status: 'novo',
      current_label: 'NOVO',
      suggested_status: 'ganho',
      suggested_label: 'GANHO',
      title: 'Kanban: NOVO → a conversa indica GANHO',
      reason: `Pediu acesso em 29/09 ${HOSTILE}`,
      button_label: 'Confirmar venda',
      cycle_path: '/sales-cycles/20000000-0000-4000-8000-000000000001?fechar=ganho',
      apply_request: null,
      prefill: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '' },
    },
    kanban_late: true,
    hide_stage_sla: true,
    locks: [],
    footer: 'Leitura completa · Claude · 01/10/2026 11:05',
    run_id: 'run-1',
    view_key: 'agora-key-1',
    ...overrides,
  }
}

function analysisView(overrides = {}) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    sections: [
      { key: 'fase', title: 'Fase da relação', blocks: [{ type: 'paragraph', items: [`Cliente ativa ${HOSTILE}`] }] },
      { key: 'linha_do_tempo', title: 'Linha do tempo', blocks: [{ type: 'list', items: ['20/09: contato', '29/09: acesso'] }] },
    ],
    afirmacoes_a_confirmar: ['Regra de renovação'],
    alertas_de_captura: [`Imagem ausente ${HOSTILE}`],
    footer: 'Leitura completa · Claude · 01/10/2026 11:05',
    run_id: 'run-1',
    view_key: 'analysis-key-1',
    ...overrides,
  }
}

function mount(html) {
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`)
  return dom.window.document.getElementById('root')
}

test('o marcador no HTML não leva nenhum texto do modelo', () => {
  const html =
    view.renderFullReadingSlot('agora', agoraView()) +
    view.renderFullReadingSlot('analysis', analysisView())

  assert.doesNotMatch(html, /Cliente ativa|Pediu acesso|Linha do tempo|onerror|<img|<script/)
  assert.match(html, /data-yolen-full-reading="agora"/)
  assert.match(html, /data-yolen-full-reading-key="agora-key-1"/)
  assert.equal(view.renderFullReadingSlot('outro', agoraView()), '')
  assert.equal(view.renderFullReadingSlot('agora', null), '')
})

test('AGORA: kanban, Situação/Ação/Por quê, card de etapa e rodapé montados com textContent', () => {
  const root = mount(view.renderFullReadingSlot('agora', agoraView()))

  assert.equal(view.hydrateFullReadingSlots(root, { agora: agoraView() }), 1)

  assert.equal(root.querySelector('.yolen-full-reading-kanban').textContent, 'Etapa no kanban: NOVO')
  assert.deepEqual(
    [...root.querySelectorAll('[data-yolen-full-reading-field] .yolen-decision-kicker')].map((node) => node.textContent),
    ['Situação', 'Ação', 'Por quê'],
  )

  const button = root.querySelector('[data-yolen-action="full-reading-stage"]')

  assert.equal(button.textContent, 'Confirmar venda')
  assert.equal(button.getAttribute('data-yolen-full-reading-stage-kind'), 'confirm_won')
  assert.equal(root.querySelector('.yolen-full-reading-stage-title').textContent, 'Kanban: NOVO → a conversa indica GANHO')
  assert.equal(root.querySelector('.yolen-full-reading-footer').textContent, 'Leitura completa · Claude · 01/10/2026 11:05')

  // O texto hostil vira texto: nenhum elemento é criado a partir dele.
  assert.equal(root.querySelectorAll('img, script').length, 0)
  assert.match(root.textContent, /<img src=x onerror="alert\(1\)">/)
})

test('AGORA: "Aplicar", "Confirmar perda", estado do botão e aviso de leitura em andamento', () => {
  const apply = agoraView({
    stage_card: { ...agoraView().stage_card, kind: 'apply', button_label: 'Aplicar', cycle_path: null },
  })
  const root = mount(view.renderFullReadingSlot('agora', apply))

  view.hydrateFullReadingSlots(root, { agora: apply }, { stageBusy: true, stageStatus: 'Aplicando no Yolen…' })

  const button = root.querySelector('[data-yolen-action="full-reading-stage"]')

  assert.equal(button.textContent, 'Aplicar')
  assert.equal(button.disabled, true)
  assert.equal(root.querySelector('[data-yolen-full-reading-stage-status]').textContent, 'Aplicando no Yolen…')

  const running = agoraView({ state: 'running', notice: 'Lendo a conversa inteira…', main: null, stage_card: null, footer: null, view_key: 'k2' })
  const runningRoot = mount(view.renderFullReadingSlot('agora', running))

  view.hydrateFullReadingSlots(runningRoot, { agora: running })

  assert.equal(runningRoot.querySelector('[data-yolen-full-reading-notice="running"]').textContent, 'Lendo a conversa inteira…')
  assert.equal(runningRoot.querySelector('[data-yolen-action="full-reading-stage"]'), null)
})

test('hidratar de novo com o mesmo conteúdo não recria o botão; status novo recria', () => {
  const root = mount(view.renderFullReadingSlot('agora', agoraView()))

  view.hydrateFullReadingSlots(root, { agora: agoraView() })
  const button = root.querySelector('[data-yolen-action="full-reading-stage"]')

  assert.equal(view.hydrateFullReadingSlots(root, { agora: agoraView() }), 0)
  assert.equal(root.querySelector('[data-yolen-action="full-reading-stage"]'), button)

  assert.equal(view.hydrateFullReadingSlots(root, { agora: agoraView() }, { stageStatus: 'Etapa aplicada no Yolen.' }), 1)
  assert.notEqual(root.querySelector('[data-yolen-action="full-reading-stage"]'), button)
})

test('marcador com chave antiga não recebe o conteúdo de uma view nova', () => {
  const root = mount(view.renderFullReadingSlot('agora', agoraView({ view_key: 'antiga' })))

  assert.equal(view.hydrateFullReadingSlots(root, { agora: agoraView({ view_key: 'nova' }) }), 0)
  assert.equal(root.querySelector('[data-yolen-full-reading]').childNodes.length, 0)
})

test('ANÁLISE: seções, afirmações a confirmar e alertas de captura, sem HTML do modelo', () => {
  const root = mount(view.renderFullReadingSlot('analysis', analysisView()))

  assert.equal(view.hydrateFullReadingSlots(root, { analysis: analysisView() }), 1)

  assert.deepEqual(
    [...root.querySelectorAll('[data-yolen-full-reading-section] h3')].map((node) => node.textContent),
    ['Fase da relação', 'Linha do tempo', 'Afirmações a confirmar', 'Alertas de captura'],
  )
  assert.deepEqual(
    [...root.querySelectorAll('[data-yolen-full-reading-section="linha_do_tempo"] li')].map((node) => node.textContent),
    ['20/09: contato', '29/09: acesso'],
  )
  assert.equal(root.querySelectorAll('img, script').length, 0)
})

test('o módulo da leitura completa nunca usa innerHTML nem insertAdjacentHTML', () => {
  const source = readFileSync(new URL('../src/companion-seller-information-view.js', import.meta.url), 'utf8')
  const start = source.indexOf('function renderFullReadingSlot(')
  const end = source.indexOf('const api = Object.freeze({')
  const block = source.slice(start, end)

  assert.ok(start > 0 && end > start)
  assert.doesNotMatch(block, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/)
})

test('a view composta com o raciocínio expõe as funções da leitura completa', () => {
  const enhanced = reasoningView.enhanceSellerInformationView(view)

  assert.equal(typeof enhanced.renderFullReadingSlot, 'function')
  assert.equal(typeof enhanced.hydrateFullReadingSlots, 'function')
})

test('core: com a leitura completa, a sugestão antiga de etapa some e o "Atualizar análise" pede rodada nova', () => {
  const core = readFileSync(new URL('../src/companion-core.js', import.meta.url), 'utf8')

  const operational = core.slice(core.indexOf('function getOperationalSuggestionHtml()'), core.indexOf('function getLegacyAnalysisCardHtml()'))
  assert.match(operational, /if \(isFullReadingPanelActive\(\)\) {\s*return ''/)

  const canApply = core.slice(core.indexOf('function canApplyCurrentSuggestion()'), core.indexOf('function canApplyCurrentSuggestion()') + 400)
  assert.match(canApply, /if \(isFullReadingPanelActive\(\)\) {\s*return false/)

  const analyzeClick = core.slice(core.indexOf('function handleAnalyzeActionClick()'), core.indexOf('function handleUnwiredAnalyzeActionClick('))
  assert.match(analyzeClick, /requestFullReadingRefresh\({\s*force: true,/)

  // Ganho/Perdido só abrem o Yolen; o único caminho de escrita é a rota
  // de sempre, depois do window.confirm.
  const stageClick = core.slice(core.indexOf('async function handleFullReadingStageClick()'), core.indexOf('// AGORA é a única superfície de decisão'))
  assert.match(stageClick, /if \(card\.kind !== 'apply'\) {[\s\S]*openYolen\(card\.cycle_path\)[\s\S]*return\s*}/)
  assert.ok(stageClick.indexOf('window.confirm(') < stageClick.indexOf('applySuggestion('))
  assert.doesNotMatch(stageClick, /sales-cycles\/close|close_cycle/)
})
