// Leitura completa no painel (HML, rodada 6): decisão primeiro, cada
// informação uma vez por aba, nenhum código cru, ícones de traço (sem
// emoji) e botões de verdade. O texto do modelo nunca entra em HTML: o
// HTML do painel leva só o marcador; o conteúdo é montado com
// createElement/textContent. Textos sintéticos.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const view = require('../src/companion-seller-information-view.js')
const reasoningView = require('../src/companion-reasoning-view.js')
const clientContextView = require('../src/companion-client-context-view.js')

const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
const EMOJI = /\p{Extended_Pictographic}/u

function agoraView(overrides = {}) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    kanban: { status: 'novo', label: 'Novo' },
    kanban_line: 'Etapa no kanban: Novo',
    main: {
      situacao: `Cliente ativa ${HOSTILE}`,
      acao: 'Perguntar como foi a demonstração.',
      por_que: 'A demonstração era 15/09 às 10h e não houve resposta depois.',
    },
    next_step: {
      turn: 'vendedor',
      turn_label: 'Vez do vendedor',
      title: `Perguntar como foi a demonstração ${HOSTILE}`,
      complement: 'Se não aconteceu, oferecer outro horário.',
      why: 'A demonstração era 15/09 às 10h e não houve resposta depois.',
      send: true,
      no_send_reason: null,
    },
    stage_card: {
      kind: 'apply',
      current_status: 'novo',
      current_label: 'Novo',
      suggested_status: 'contato',
      suggested_label: 'Contato',
      title: 'Kanban: Novo → a conversa indica Contato',
      reason: `Ele respondeu e marcou a demonstração (15/09) ${HOSTILE}`,
      button_label: 'Aplicar no kanban',
      cycle_path: null,
      apply_request: { cycle_id: 'c' },
      prefill: { produto: '', valor: '', forma_pagamento: '', motivo_perda: '' },
    },
    facts: [
      { key: 'aguardando', label: 'Cliente aguardando', value: 'Não' },
      { key: 'venda', label: 'Venda', value: 'Ainda não' },
      { key: 'ultimo_contato', label: 'Último contato', value: 'há 1 dia' },
      { key: 'confianca', label: 'Confiança da leitura', value: 'Média' },
    ],
    before_send: ['O Plano Anual Plus (12x R$ 99,00) não está no catálogo.', 'Condição de adesão grátis.', 'terceiro item nunca aparece'],
    message: { mode: 'send' },
    kanban_late: true,
    hide_stage_sla: true,
    locks: [],
    footer: 'Leitura completa · 01/10, 20:07',
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
    has_reading: true,
    summary: [
      { key: 'fase', label: 'Fase', value: 'Descoberta' },
      { key: 'metodo', label: 'Método', value: 'Descoberta incompleta' },
      { key: 'kanban', label: 'Kanban', value: 'Novo → Contato' },
      { key: 'venda', label: 'Venda', value: 'Ainda não' },
    ],
    timeline: [
      {
        day: '15/09',
        items: [
          { time: '11:07', text: `Entrou pelo bot e pediu uma demonstração ${HOSTILE}` },
          { time: '11:22', text: 'Perguntou os planos' },
          { time: 'depois', text: 'Nenhuma mensagem desde então' },
        ],
      },
    ],
    pending: [
      { owner: 'vendedor', label: 'Sua', tone: 'attention', text: 'Confirmar se a demonstração aconteceu' },
      { owner: 'cliente', label: 'Do cliente', tone: 'neutral', text: 'Ainda não viu os planos' },
      { owner: 'nenhum', label: '', tone: 'ok', text: 'Nenhuma pergunta do cliente sem resposta' },
    ],
    opportunities: [
      { text: 'Plano anual', status: 'sem_resposta', status_label: 'Sem resposta', tone: 'attention' },
    ],
    coaching: {
      acertos: ['Respondeu em cerca de 5 minutos'],
      ajustes: ['Nenhuma pergunta de descoberta'],
    },
    sections: [],
    afirmacoes_a_confirmar: ['Regra de renovação', 'Preço do plano anual'],
    alertas_de_captura: [`Imagem ausente ${HOSTILE}`],
    footer: 'Leitura completa · 01/10, 20:07',
    run_id: 'run-1',
    view_key: 'analysis-key-1',
    ...overrides,
  }
}

function mount(html) {
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`)
  return dom.window.document.getElementById('root')
}

function hydrated(kind, viewValue, views, options) {
  const root = mount(view.renderFullReadingSlot(kind, viewValue))

  assert.equal(view.hydrateFullReadingSlots(root, views, options), 1)

  return root
}

const texts = (root, selector) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent)

test('o marcador no HTML não leva nenhum texto do modelo', () => {
  const html =
    view.renderFullReadingSlot('agora', agoraView()) +
    view.renderFullReadingSlot('analysis', analysisView()) +
    view.renderFullReadingSlot('client', agoraView())

  assert.doesNotMatch(html, /Perguntar|Entrou pelo bot|Linha do tempo|onerror|<img|<script/)
  assert.match(html, /data-yolen-full-reading="agora"/)
  assert.match(html, /data-yolen-full-reading-key="agora-key-1"/)
  assert.equal(view.renderFullReadingSlot('outro', agoraView()), '')
  // O card "Resumo da leitura completa" saiu.
  assert.equal(view.renderFullReadingSlot('lead_summary', agoraView()), '')
  assert.equal(view.renderFullReadingSlot('agora', null), '')
})

test('AGORA: próximo passo em destaque (vez, título, complemento, porquê) e "Ver mensagem pronta"', () => {
  const root = hydrated('agora', agoraView(), { agora: agoraView() })
  const card = root.querySelector('[data-yolen-fr-card="next_step"]')

  assert.ok(card.classList.contains('yolen-fr-card--highlight'))
  assert.equal(card.querySelector('.yolen-fr-label').textContent, 'Próximo passo')
  assert.equal(card.querySelector('.yolen-fr-pill').textContent, 'Vez do vendedor')
  assert.match(card.querySelector('.yolen-fr-title').textContent, /^Perguntar como foi a demonstração <img/)
  assert.equal(card.querySelector('.yolen-fr-body').textContent, 'Se não aconteceu, oferecer outro horário.')
  assert.equal(card.querySelector('.yolen-fr-why').textContent, 'A demonstração era 15/09 às 10h e não houve resposta depois.')
  assert.equal(card.querySelector('.yolen-fr-why svg').getAttribute('data-yolen-fr-icon'), 'clock')

  const open = card.querySelector('[data-yolen-action="full-reading-open-message"]')

  assert.equal(open.tagName, 'BUTTON')
  assert.equal(open.type, 'button')
  assert.equal(open.textContent, 'Ver mensagem pronta')
  assert.ok(open.classList.contains('yolen-fr-button--primary'))

  // A Situação, a Ação e o Por quê antigos não aparecem; nem a linha do
  // kanban (o kanban está no cabeçalho).
  assert.equal(root.querySelector('.yolen-decision-kicker'), null)
  assert.equal(root.querySelector('.yolen-full-reading-kanban'), null)
  assert.doesNotMatch(root.textContent, /Situação|Cliente ativa|Etapa no kanban: Novo/)
  assert.equal(root.querySelectorAll('img, script').length, 0)
})

test('AGORA: leitura "não enviar" → "Nada a enviar agora" + motivo no lugar do botão, motivo uma vez só', () => {
  const noSend = agoraView({
    next_step: {
      turn: 'cliente',
      turn_label: 'Vez do cliente',
      title: 'Aguardar a resposta do cliente',
      complement: '',
      why: 'Ele ainda não respondeu à proposta.',
      send: false,
      no_send_reason: 'Ele ainda não respondeu à proposta.',
    },
    before_send: [],
    view_key: 'agora-nosend',
  })
  const root = hydrated('agora', noSend, { agora: noSend })

  assert.equal(root.querySelector('[data-yolen-action="full-reading-open-message"]'), null)
  assert.equal(root.querySelector('.yolen-fr-nosend-title').textContent, 'Nada a enviar agora')
  assert.equal(root.querySelector('[data-yolen-full-reading-no-send] .yolen-fr-body').textContent, 'Ele ainda não respondeu à proposta.')
  assert.equal(root.querySelector('.yolen-fr-why'), null)
  assert.equal(root.textContent.split('Ele ainda não respondeu à proposta.').length - 1, 1)

  // Título já é "Nada a enviar agora": não repete.
  const titled = agoraView({
    next_step: { ...noSend.next_step, title: 'Nada a enviar agora' },
    before_send: [],
    view_key: 'agora-nosend-2',
  })
  const titledRoot = hydrated('agora', titled, { agora: titled })

  assert.equal(titledRoot.textContent.split('Nada a enviar agora').length - 1, 1)
})

test('AGORA: etapa no kanban com pílulas atual → sugerida, motivo e "Aplicar no kanban"', () => {
  const root = hydrated('agora', agoraView(), { agora: agoraView() }, { stageBusy: true, stageStatus: 'Aplicando no Yolen…' })
  const stage = root.querySelector('[data-yolen-fr-card="stage"]')

  assert.equal(stage.querySelector('.yolen-fr-label').textContent, 'Etapa no kanban')
  assert.deepEqual(texts(stage, '.yolen-fr-stage-pills .yolen-fr-pill'), ['Novo', 'Contato'])
  assert.equal(stage.querySelector('.yolen-fr-stage-pills svg').getAttribute('data-yolen-fr-icon'), 'arrow')
  assert.match(stage.querySelector('.yolen-full-reading-stage-reason').textContent, /^Ele respondeu e marcou a demonstração \(15\/09\) <img/)

  const button = stage.querySelector('[data-yolen-action="full-reading-stage"]')

  assert.equal(button.textContent, 'Aplicar no kanban')
  assert.equal(button.getAttribute('data-yolen-full-reading-stage-kind'), 'apply')
  assert.equal(button.disabled, true)
  assert.equal(stage.querySelector('[data-yolen-full-reading-stage-status]').textContent, 'Aplicando no Yolen…')

  // Sem etapa sugerida diferente, o card não existe.
  const same = agoraView({ stage_card: null, view_key: 'agora-same' })

  assert.equal(hydrated('agora', same, { agora: same }).querySelector('[data-yolen-fr-card="stage"]'), null)

  const won = agoraView({ stage_card: { ...agoraView().stage_card, kind: 'confirm_won', button_label: 'Confirmar venda' }, view_key: 'agora-won' })

  assert.equal(hydrated('agora', won, { agora: won }).querySelector('[data-yolen-action="full-reading-stage"]').textContent, 'Confirmar venda')
})

test('AGORA: grade 2×2, "Antes de enviar" âmbar com no máximo 2 itens, rodapé uma vez com Atualizar', () => {
  const root = hydrated('agora', agoraView(), { agora: agoraView() })

  assert.deepEqual(
    [...root.querySelectorAll('[data-yolen-fr-grid="agora"] .yolen-fr-cell')].map((cell) => [
      cell.querySelector('.yolen-fr-cell-label').textContent,
      cell.querySelector('.yolen-fr-cell-value').textContent,
    ]),
    [
      ['Cliente aguardando', 'Não'],
      ['Venda', 'Ainda não'],
      ['Último contato', 'há 1 dia'],
      ['Confiança da leitura', 'Média'],
    ],
  )

  const before = root.querySelector('[data-yolen-fr-card="before_send"]')

  assert.ok(before.classList.contains('yolen-fr-card--attention'))
  assert.equal(before.querySelector('.yolen-fr-label').textContent, 'Antes de enviar')
  assert.deepEqual(texts(before, '.yolen-fr-list-text'), ['O Plano Anual Plus (12x R$ 99,00) não está no catálogo.', 'Condição de adesão grátis.'])

  assert.deepEqual(texts(root, '.yolen-full-reading-footer'), ['Leitura completa · 01/10, 20:07'])
  assert.equal(root.querySelector('[data-yolen-action="full-reading-refresh"]').textContent, 'Atualizar')

  // Sem "Antes de enviar" quando a lista está vazia.
  const empty = agoraView({ before_send: [], view_key: 'agora-empty' })

  assert.equal(hydrated('agora', empty, { agora: empty }).querySelector('[data-yolen-fr-card="before_send"]'), null)
})

test('AGORA: ícones de traço (SVG), nenhum emoji, todo botão é <button> com tipo', () => {
  const root = hydrated('agora', agoraView(), { agora: agoraView() })

  assert.doesNotMatch(root.textContent, EMOJI)
  assert.ok(root.querySelectorAll('svg[data-yolen-fr-icon]').length >= 3)

  for (const svg of root.querySelectorAll('svg')) {
    assert.equal(svg.getAttribute('fill'), 'none')
    assert.equal(svg.getAttribute('stroke'), 'currentColor')
    assert.equal(svg.getAttribute('aria-hidden'), 'true')
  }

  for (const action of root.querySelectorAll('[data-yolen-action]')) {
    assert.equal(action.tagName, 'BUTTON')
    assert.equal(action.type, 'button')
  }
})

test('AGORA: leitura rodando sem leitura anterior mostra só o aviso', () => {
  const running = agoraView({ state: 'running', notice: 'Lendo a conversa inteira…', main: null, next_step: null, stage_card: null, facts: [], before_send: [], footer: null, view_key: 'k2' })
  const root = hydrated('agora', running, { agora: running })

  assert.equal(root.querySelector('[data-yolen-full-reading-notice="running"]').textContent, 'Lendo a conversa inteira…')
  assert.equal(root.querySelector('[data-yolen-fr-card]'), null)
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

test('ANÁLISE: quatro blocos, linha do tempo por dia, pendências com ícone, oportunidades, condução e recolhidos', () => {
  const root = hydrated('analysis', analysisView(), { analysis: analysisView() })

  assert.deepEqual(texts(root, '[data-yolen-fr-grid="analysis"] .yolen-fr-cell-label'), ['Fase', 'Método', 'Kanban', 'Venda'])
  assert.deepEqual(texts(root, '[data-yolen-fr-grid="analysis"] .yolen-fr-cell-value'), ['Descoberta', 'Descoberta incompleta', 'Novo → Contato', 'Ainda não'])

  const timeline = root.querySelector('[data-yolen-fr-card="timeline"]')

  assert.equal(timeline.querySelector('.yolen-fr-day').textContent, '15/09')
  assert.deepEqual(texts(timeline, '.yolen-fr-time'), ['11:07', '11:22', 'depois'])
  assert.equal([...timeline.querySelectorAll('.yolen-fr-timeline-text')].at(-1).textContent, 'Nenhuma mensagem desde então')

  const pending = root.querySelector('[data-yolen-fr-card="pending"]')

  assert.deepEqual(texts(pending, '.yolen-fr-list-text'), [
    'Sua: Confirmar se a demonstração aconteceu',
    'Do cliente: Ainda não viu os planos',
    'Nenhuma pergunta do cliente sem resposta',
  ])
  assert.deepEqual(
    [...pending.querySelectorAll('svg')].map((svg) => svg.getAttribute('class')),
    ['yolen-fr-icon yolen-fr-icon--attention', 'yolen-fr-icon yolen-fr-icon--neutral', 'yolen-fr-icon yolen-fr-icon--ok'],
  )

  const opportunities = root.querySelector('[data-yolen-fr-card="opportunities"]')

  assert.equal(opportunities.querySelector('.yolen-fr-list-text').textContent, 'Plano anual')
  assert.equal(opportunities.querySelector('.yolen-fr-pill').textContent, 'Sem resposta')
  assert.ok(opportunities.querySelector('.yolen-fr-pill').classList.contains('yolen-fr-pill--attention'))
  assert.doesNotMatch(root.textContent, /sem_resposta/)

  const coaching = root.querySelector('[data-yolen-fr-card="coaching"]')

  assert.deepEqual(texts(coaching, '.yolen-fr-sublabel'), ['Acertos', 'Ajustes'])
  assert.deepEqual(texts(coaching, '.yolen-fr-list-text'), ['Respondeu em cerca de 5 minutos', 'Nenhuma pergunta de descoberta'])

  const collapsed = [...root.querySelectorAll('details.yolen-fr-collapse')]

  assert.deepEqual(collapsed.map((details) => details.getAttribute('data-yolen-fr-collapse')), ['afirmacoes_a_confirmar', 'alertas_de_captura'])
  assert.deepEqual(collapsed.map((details) => details.querySelector('summary').textContent), ['Confirmar no cadastro2', 'Avisos da captura1'])
  assert.ok(collapsed.every((details) => !details.open))

  // Mensagem sugerida e Cliente têm aba própria.
  assert.doesNotMatch(root.textContent, /Mensagem sugerida|Cliente: fatos/)
  assert.deepEqual(texts(root, '.yolen-full-reading-footer'), ['Leitura completa · 01/10, 20:07'])
  assert.equal(root.querySelectorAll('img, script').length, 0)
  assert.doesNotMatch(root.textContent, EMOJI)
})

test('ANÁLISE plano B: rodada sem campos estruturados mostra as seções do texto', () => {
  const legacy = analysisView({
    summary: [{ key: 'fase', label: 'Fase', value: 'Cliente ativo' }],
    timeline: [],
    pending: [],
    opportunities: [],
    coaching: { acertos: [], ajustes: [] },
    sections: [
      { key: 'fase', title: 'Fase da relação', blocks: [{ type: 'paragraph', items: [`Cliente ativa ${HOSTILE}`] }] },
      { key: 'linha_do_tempo', title: 'Linha do tempo', blocks: [{ type: 'list', items: ['20/09: contato', '29/09: acesso'] }] },
    ],
    view_key: 'analysis-legacy',
  })
  const root = hydrated('analysis', legacy, { analysis: legacy })

  assert.deepEqual(
    texts(root, '[data-yolen-full-reading-section] .yolen-fr-label'),
    ['Fase da relação', 'Linha do tempo'],
  )
  assert.deepEqual(texts(root, '[data-yolen-full-reading-section="linha_do_tempo"] .yolen-fr-list-text'), ['20/09: contato', '29/09: acesso'])
  assert.equal(root.querySelectorAll('img, script').length, 0)
})

test('CLIENTE: o que ele disse com data à direita, o que parece com "Inferência", falta descobrir em checklist', () => {
  const agora = agoraView({
    client: {
      said: [
        { text: `Pediu uma demonstração pelo bot ${HOSTILE}`, date: '15/09' },
        { text: 'Usa o app desde 20/09', date: null },
      ],
      seems: ['Interesse alto: pediu horário para a mesma semana.'],
      missing: ['Se a demonstração aconteceu', 'Orçamento disponível'],
    },
  })

  assert.doesNotMatch(view.renderFullReadingSlot('client', agora), /Pediu uma demonstração|<img/)

  const root = hydrated('client', agora, { agora })

  assert.deepEqual(texts(root, '[data-yolen-fr-card] > .yolen-fr-card-head .yolen-fr-label'), ['O que ele disse', 'O que parece', 'Falta descobrir'])

  const said = root.querySelector('[data-yolen-fr-card="said"]')

  assert.match(said.querySelector('.yolen-fr-list-text').textContent, /^Pediu uma demonstração pelo bot <img/)
  assert.deepEqual(texts(said, '.yolen-fr-list-aside'), ['15/09'])
  assert.equal(root.querySelector('[data-yolen-fr-card="seems"] .yolen-fr-pill').textContent, 'Inferência')

  const missing = root.querySelector('[data-yolen-fr-card="missing"]')

  assert.deepEqual(texts(missing, '.yolen-fr-list-text'), ['Se a demonstração aconteceu', 'Orçamento disponível'])
  assert.equal(missing.querySelectorAll('svg[data-yolen-fr-icon="todo"]').length, 2)

  // O rodapé do CLIENTE vem uma vez, depois do Relacionamento (core).
  assert.equal(root.querySelector('.yolen-full-reading-footer'), null)
  assert.equal(root.querySelectorAll('img, script').length, 0)
})

test('CLIENTE: Relacionamento em grade de duas colunas, só dados do sistema', () => {
  const html = clientContextView.renderCompactRelationshipCard(
    {
      status: 'ready',
      data: {
        relationship: {
          first_known_interaction_at: '2026-09-15T14:00:00.000Z',
          known_interaction_count: 16,
          latest_customer_message_at: '2026-09-15T15:00:00.000Z',
          latest_seller_message_at: '2026-09-15T16:00:00.000Z',
        },
        identity: { current_status: 'respondeu' },
        waiting: { state: 'seller_waiting_for_customer' },
      },
    },
    Date.parse('2026-09-16T18:00:00.000Z'),
  )
  const root = mount(html)

  assert.deepEqual(texts(root, '.yolen-fr-cell-label'), ['Primeiro contato', 'Interações', 'Última do cliente', 'Última sua', 'Etapa', 'Aguardando'])
  assert.deepEqual(texts(root, '.yolen-fr-cell-value').slice(1), ['16', 'há 1 dia', 'há 1 dia', 'Agenda', 'O cliente'])
  assert.doesNotMatch(html, /respondeu|Etapa no pipeline/)
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

test('core: AGORA, resumo, CLIENTE, cabeçalho e ações seguem a leitura só quando ela existe', () => {
  const core = readFileSync(new URL('../src/companion-core.js', import.meta.url), 'utf8')
  const slice = (name, length = 3000) => core.slice(core.indexOf(name), core.indexOf(name) + length)

  // MENSAGEM não depende do resumo do lead quando há leitura.
  assert.match(slice('function isSellerMessageMountEligible()', 600), /getCurrentFullReadingViews\(\)\.agora\?\.message/)
  assert.match(core, /messageController\.syncFullReading\?\.\(/)

  // AGORA: com leitura pronta, só ela (sem os sinais antigos repetidos).
  // Rodada 7: com a leitura completa no painel (rodando ou em falha), só o
  // aviso dela; o AGORA antigo só volta com a flag desligada.
  const agora = slice('function getNowAttentionSnapshotHtml()', 2500)
  assert.match(agora, /fullReadingAgora\.main \|\| isFullReadingPanelMode\(\)\s*\?\s*''\s*:\s*sellerInformationViewTools\.renderAgoraViewModelSnapshot\(/)
  assert.match(agora, /return isFullReadingPanelMode\(\)\s*\?\s*getFullReadingPendingHtml\('Agora'\)\s*:\s*''/)

  // Resumo salvo / resumo da leitura: some com a leitura completa no painel
  // (pronta, rodando ou em falha — rodada 7); sem ela, '' e o card de hoje.
  const summary = slice('function getFullReadingLeadSummaryCardHtml()', 600)
  assert.match(summary, /return isFullReadingPanelMode\(\)\s*\?\s*'<div hidden data-yolen-full-reading-no-summary><\/div>'\s*:\s*''/)
  const summaryController = readFileSync(new URL('../src/companion-lead-summary-controller.js', import.meta.url), 'utf8')
  assert.match(summaryController, /ctx\.getFullReadingLeadSummaryCardHtml\(\)[\s\S]*if \(fullReadingCardHtml\) {\s*return fullReadingCardHtml/)

  // ANÁLISE: leitura estruturada ou plano B.
  assert.match(slice('function getDetailedAnalysisAreaHtml()', 6000), /fullReadingAnalysis\.has_reading === true/)

  // CLIENTE: leitura + Relacionamento compacto + rodapé uma vez.
  const client = slice('function getClientInformationAreaHtml()', 4000)
  assert.match(client, /renderFullReadingSlot\(\s*'client'/)
  assert.match(client, /getCompanionClientRelationshipCardHtml\({ compact: true }\)/)

  // Cabeçalho compacto só com a view da leitura e lead na carteira.
  const contact = slice('function getFullReadingContactCardHtml()', 1200)
  assert.match(contact, /!view \|\|\s*!isSellerWorkspaceReady\(\) \|\|\s*resolution\?\.status !== 'OWNED_BY_ME'\s*\) {\s*return ''/)
  assert.match(slice('function getContactCardHtml()', 400), /if \(fullReadingContactHtml\) {\s*return fullReadingContactHtml/)

  // Ações novas ligadas.
  const wiring = slice('function wirePanelInteractions(panel)', 20000)
  assert.match(wiring, /full-reading-open-message[\s\S]*setActiveSellerArea\('message'/)
  assert.match(wiring, /full-reading-refresh[\s\S]*requestFullReadingRefresh\({\s*force: true,/)
  assert.match(wiring, /full-reading-open-cycle[\s\S]*can_open_cycle === true/)

  // Ícone minimizado: a AGORA da leitura, não a antiga.
  const rail = slice('function getCollapsedCompanionAttentionSnapshot()', 9000)
  assert.match(rail, /isCurrentAgoraContext &&\s*!fullReadingDrivesRail/)
  assert.match(rail, /fullReadingAgora\??\.attention/)
})

test('flag desligada: sem `full_reading` nas respostas nada da leitura é montado', () => {
  const root = mount('<div data-yolen-full-reading="agora" data-yolen-full-reading-key="x"></div>')

  assert.equal(view.hydrateFullReadingSlots(root, { agora: null, analysis: null }), 0)
  assert.equal(root.querySelector('[data-yolen-full-reading]').childNodes.length, 0)

  // O core lê `full_reading` da resposta; sem ela, todas as entradas da
  // leitura no painel caem no caminho de hoje.
  const core = readFileSync(new URL('../src/companion-core.js', import.meta.url), 'utf8')
  const read = core.slice(core.indexOf('function readFullReadingView(data)'), core.indexOf('function readFullReadingView(data)') + 400)

  assert.match(read, /data\?\.full_reading/)
  assert.match(read, /typeof view\.view_key === 'string'\s*\?\s*view\s*:\s*null/)
})
