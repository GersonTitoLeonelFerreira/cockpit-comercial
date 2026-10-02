// Rodada 5 (Parte B): "Nova oportunidade" no card do ciclo fechado.
// CLOSED_CYCLE continua sem workspace; ganha a ação por capability
// (decisão do Controle Mestre, 01/10/2026). O controller é o mesmo no
// WhatsApp e no ManyChat (Core único); API e resolução falsas.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const controllerSource = readSrc('companion-lead-creation-controller.js')

const CLOSED_CYCLE_ID = '50000000-0000-4000-8000-0000000000c1'
const NEW_CYCLE_ID = '50000000-0000-4000-8000-0000000000c9'
const LEAD_ID = '50000000-0000-4000-8000-0000000000b1'

function closedResolution(capability = true) {
  return {
    status: 'CLOSED_CYCLE',
    cycle: { id: CLOSED_CYCLE_ID, status: 'ganho' },
    capabilities: {
      can_create_lead: false,
      can_open_pool: false,
      can_open_cycle: true,
      can_create_successor_opportunity: capability,
    },
  }
}

function ownedResolution() {
  return {
    status: 'OWNED_BY_ME',
    cycle: { id: NEW_CYCLE_ID, status: 'novo' },
    capabilities: { can_create_lead: false, can_open_pool: false, can_open_cycle: true },
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function createHarness({
  capability = true,
  apiResult = { ok: true, statusCode: 200, payload: { ok: true, status: 'SUCCESSOR_CREATED', cycle: { id: NEW_CYCLE_ID, status: 'novo' } } },
  resolutions = [ownedResolution()],
} = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="panel"></div></body></html>', {
    url: 'https://web.whatsapp.com/',
  })

  const apiCalls = []
  const events = []
  let state = {
    connected: true,
    conversationKey: 'whatsapp:conversa-1',
    leadResolutionLoading: false,
    leadResolutionViewModel: closedResolution(capability),
  }

  const pendingResolutions = [...resolutions]
  let controller = null

  const ctx = {
    escapeHtml,
    renderPanel() {
      dom.window.document.getElementById('panel').innerHTML = controller.getLeadActionButton()
    },
    async resolveCurrentLead(options) {
      events.push(['resolve', options])
      if (pendingResolutions.length > 0) {
        state = { ...state, leadResolutionViewModel: pendingResolutions.shift() }
      }
    },
    async sleep() {},
    clearLeadResolutionCache() {
      events.push(['clear_cache'])
    },
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  }

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    Promise,
    Set,
    Object,
    String,
  }
  sandbox.globalThis = sandbox
  dom.window.YolenCompanionApi = {
    async createSuccessorOpportunity(payload) {
      apiCalls.push(payload)
      events.push(['create'])
      return typeof apiResult === 'function' ? apiResult(apiCalls.length) : apiResult
    },
  }

  vm.createContext(sandbox)
  vm.runInContext(controllerSource, sandbox, { filename: 'companion-lead-creation-controller.js' })

  controller = sandbox.YolenCompanionLeadCreationController.create(ctx)
  ctx.renderPanel()

  const panel = () => dom.window.document.getElementById('panel')

  return {
    controller,
    apiCalls,
    events,
    panel,
    getState: () => state,
    query: (selector) => panel().querySelector(selector),
  }
}

test('sem a capability: só "Abrir vínculo na Yolen" (Cancelado, ciclo de outro, oportunidade aberta)', () => {
  const harness = createHarness({ capability: false })

  assert.ok(harness.query('[data-yolen-action="open-cycle-yolen"]'))
  assert.equal(harness.query('[data-yolen-action="successor-open"]'), null)
  assert.equal(harness.controller.openSuccessorChooser(), false)
})

test('com a capability: mantém "Abrir vínculo na Yolen" e adiciona "Nova oportunidade"', () => {
  const harness = createHarness()

  assert.ok(harness.query('[data-yolen-action="open-cycle-yolen"]'))
  assert.equal(harness.query('[data-yolen-action="successor-open"]').textContent.trim(), 'Nova oportunidade')
})

test('confirmação obrigatória: escolher o tipo (rótulos da Yolen) habilita "Criar oportunidade"; cancelar volta', () => {
  const harness = createHarness()

  harness.query('[data-yolen-action="successor-open"]')
  assert.equal(harness.controller.openSuccessorChooser(), true)

  const labels = [...harness.panel().querySelectorAll('.yolen-successor-option span')].map((node) => node.textContent)
  assert.deepEqual(labels, ['Reativação', 'Renovação', 'Recompra', 'Upgrade', 'Novo produto'])
  // Nenhum tipo vem marcado: o vendedor escolhe.
  assert.equal(harness.panel().querySelectorAll('input[checked]').length, 0)
  assert.equal(harness.query('[data-yolen-action="successor-confirm"]').disabled, true)

  harness.controller.selectSuccessorType('upgrade')
  assert.equal(harness.query('[data-yolen-action="successor-confirm"]').disabled, false)
  assert.equal(harness.query('[data-yolen-successor-type="upgrade"]').checked, true)

  // Tipo fora da lista é ignorado.
  assert.equal(harness.controller.selectSuccessorType('pool'), false)

  harness.controller.cancelSuccessorChooser()
  assert.ok(harness.query('[data-yolen-action="successor-open"]'))
  assert.deepEqual(harness.apiCalls, [])
})

test('sem tipo escolhido nada é criado', async () => {
  const harness = createHarness()

  harness.controller.openSuccessorChooser()
  const result = await harness.controller.confirmSuccessorOpportunity()

  assert.equal(result.ok, false)
  assert.deepEqual(harness.apiCalls, [])
})

test('criar: uma chamada com confirmed_by_human, sem lead_id; depois só reconsulta e o painel vai para o ciclo novo', async () => {
  const harness = createHarness()

  harness.controller.openSuccessorChooser()
  harness.controller.selectSuccessorType('recompra')

  // Duplo clique: a segunda confirmação não gera outra chamada.
  const first = harness.controller.confirmSuccessorOpportunity()
  const second = harness.controller.confirmSuccessorOpportunity()
  await Promise.all([first, second])

  assert.equal(harness.apiCalls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(harness.apiCalls[0])), {
    cycle_id: CLOSED_CYCLE_ID,
    opportunity_type: 'recompra',
    confirmed_by_human: true,
  })
  assert.doesNotMatch(JSON.stringify(harness.apiCalls[0]), /lead/)

  // Cache limpo antes de reconsultar (CLOSED_CYCLE ficaria em cache).
  assert.deepEqual(harness.events.map(([name]) => name), ['create', 'clear_cache', 'resolve'])
  assert.equal(harness.events[2][1].requireFreshAfterInFlight, true)

  assert.equal(harness.getState().leadResolutionViewModel.status, 'OWNED_BY_ME')
  assert.equal(harness.getState().leadResolutionViewModel.cycle.id, NEW_CYCLE_ID)
  assert.equal(harness.getState().successorOpportunity, null)
})

test('criada mas a resolução ainda mostra o ciclo fechado: nunca oferece criar de novo', async () => {
  const harness = createHarness({
    resolutions: [closedResolution(true), closedResolution(true), closedResolution(true), closedResolution(true)],
  })

  harness.controller.openSuccessorChooser()
  harness.controller.selectSuccessorType('renovacao')
  await harness.controller.confirmSuccessorOpportunity()

  assert.equal(harness.apiCalls.length, 1)
  assert.equal(harness.getState().successorOpportunity.step, 'created_unresolved')
  assert.equal(harness.query('[data-yolen-action="successor-open"]'), null)
  assert.ok(harness.query('[data-yolen-action="retry-lead-link"]'))
  assert.equal(harness.controller.openSuccessorChooser(), false)
})

test('já existe oportunidade aberta (409): aviso claro, reconsulta e nenhum botão de criar', async () => {
  const harness = createHarness({
    apiResult: {
      ok: false,
      statusCode: 409,
      payload: {
        ok: false,
        status: 'SUCCESSOR_REFUSED',
        code: 'active_cycle_exists',
        error: 'Este lead já tem uma oportunidade aberta. Só pode haver uma oportunidade aberta por lead.',
      },
    },
    resolutions: [closedResolution(false)],
  })

  harness.controller.openSuccessorChooser()
  harness.controller.selectSuccessorType('reativacao')
  await harness.controller.confirmSuccessorOpportunity()

  assert.equal(harness.getState().successorOpportunity.step, 'blocked')
  assert.match(harness.query('[data-yolen-successor-status]').textContent, /oportunidade aberta/)
  assert.equal(harness.query('[data-yolen-action="successor-open"]'), null)
  assert.ok(harness.events.some(([name]) => name === 'resolve'))
})

test('falha comum: mostra o erro e deixa tentar de novo (com o mesmo tipo)', async () => {
  const harness = createHarness({
    apiResult: (attempt) =>
      attempt === 1
        ? { ok: false, statusCode: 503, payload: { ok: false, status: 'SUCCESSOR_RPC_UNAVAILABLE', error: 'A criação de oportunidade pelo Companion ainda não está liberada. Use a Yolen.' } }
        : { ok: true, statusCode: 200, payload: { ok: true, status: 'SUCCESSOR_CREATED', cycle: { id: NEW_CYCLE_ID, status: 'novo' } } },
  })

  harness.controller.openSuccessorChooser()
  harness.controller.selectSuccessorType('upgrade')
  await harness.controller.confirmSuccessorOpportunity()

  assert.equal(harness.getState().successorOpportunity.step, 'error')
  assert.match(harness.panel().textContent, /ainda não está liberada/)
  assert.equal(harness.query('[data-yolen-successor-type="upgrade"]').checked, true)

  await harness.controller.confirmSuccessorOpportunity()
  assert.equal(harness.apiCalls.length, 2)
  assert.equal(harness.getState().leadResolutionViewModel.status, 'OWNED_BY_ME')
})

test('estado de outra conversa nunca vale aqui (troca de conversa no meio)', async () => {
  const harness = createHarness()

  harness.controller.openSuccessorChooser()
  harness.controller.selectSuccessorType('recompra')

  const state = harness.getState()
  // Simula a troca de conversa: a chave do estado deixa de bater.
  Object.assign(state, { conversationKey: 'whatsapp:conversa-2' })

  const result = await harness.controller.confirmSuccessorOpportunity()
  assert.equal(result.ok, false)
  assert.deepEqual(harness.apiCalls, [])
})

// ---------------------------------------------------------------------------
// Paridade WhatsApp/ManyChat e privacidade
// ---------------------------------------------------------------------------

test('ManyChat recebe a capability pela allowlist do background; a resposta da criação nunca leva lead_id', () => {
  const privacy = require('../src/companion-background-privacy.js')

  const sanitized = privacy.sanitizeResolutionPayload({
    ok: true,
    status: 'CLOSED_CYCLE',
    user_message: 'Este lead possui apenas ciclo fechado. Ajustes no ciclo fechado são feitos só na Yolen.',
    lead: { id: LEAD_ID, name: 'Cliente' },
    cycle: { id: CLOSED_CYCLE_ID, status: 'ganho', owner_user_id: 'x' },
    capabilities: { can_open_cycle: true, can_create_successor_opportunity: true },
  })

  assert.equal(sanitized.capabilities.can_create_successor_opportunity, true)
  assert.doesNotMatch(JSON.stringify(sanitized), new RegExp(LEAD_ID))

  const response = privacy.sanitizeSuccessorPayload({
    ok: true,
    status: 'SUCCESSOR_CREATED',
    cycle: { id: NEW_CYCLE_ID, status: 'novo' },
    lead_id: LEAD_ID,
    origin_cycle_id: CLOSED_CYCLE_ID,
  })

  assert.deepEqual(response, {
    ok: true,
    status: 'SUCCESSOR_CREATED',
    code: null,
    error: null,
    cycle: { id: NEW_CYCLE_ID, status: 'novo' },
  })

  const background = privacy.createBackgroundPrivacy()
  const sender = { tab: { id: 7, url: 'https://app.manychat.com/fb1/chat/2' } }
  const sanitizedResponse = background.sanitizeResponse(
    { action: 'CREATE_SUCCESSOR_OPPORTUNITY' },
    sender,
    { ok: true, statusCode: 200, payload: { ok: true, cycle: { id: NEW_CYCLE_ID }, lead_id: LEAD_ID } },
  )

  assert.doesNotMatch(JSON.stringify(sanitizedResponse), new RegExp(LEAD_ID))
})

test('a capability vem só do backend: status CLOSED_CYCLE ou flags legacy nunca a ligam', () => {
  require('../src/companion-lead-resolution-controller.js')
  const resolutionController = globalThis.YolenCompanionLeadResolutionController

  const withCapability = resolutionController.createDomainResolutionViewModel({
    ok: true,
    status: 'CLOSED_CYCLE',
    cycle: { id: CLOSED_CYCLE_ID, status: 'ganho' },
    capabilities: { can_create_successor_opportunity: true },
  })

  const statusOnly = resolutionController.createDomainResolutionViewModel({
    ok: true,
    status: 'CLOSED_CYCLE',
    cycle: { id: CLOSED_CYCLE_ID, status: 'ganho' },
    actions: { can_create_successor_opportunity: true },
  })

  assert.equal(withCapability.capabilities.can_create_successor_opportunity, true)
  assert.equal(statusOnly.capabilities.can_create_successor_opportunity, false)
})

test('a criação só sai do clique de confirmação (nunca automática) e vai para a rota nova', () => {
  const core = readSrc('companion-core.js')
  const background = readSrc('background.js')
  const api = readSrc('yolen-api.js')

  const confirmCalls = core.match(/confirmSuccessorOpportunity\(\)/g) ?? []
  assert.equal(confirmCalls.length, 1)
  assert.match(
    core,
    /\[data-yolen-action="successor-confirm"\]'\),\s*'click',\s*\(\) => \{\s*confirmSuccessorOpportunity\(\)/,
  )
  assert.match(background, /'CREATE_SUCCESSOR_OPPORTUNITY'[\s\S]{0,120}'\/api\/companion\/successor-opportunity'/)
  assert.match(api, /sendToBackground\('CREATE_SUCCESSOR_OPPORTUNITY', payload\)/)
  // O pedido leva só o ciclo fechado, o tipo, a confirmação e (rodada 6,
  // só com a capability do backend) a nota opcional.
  assert.match(
    controllerSource,
    /createSuccessorOpportunity\(\{\s*cycle_id: resolution\.cycle\.id,\s*opportunity_type: current\.type,\s*\.\.\.\(\s*resolution\.capabilities\?\.can_note_successor_opportunity === true &&[\s\S]*?\),\s*confirmed_by_human: true,\s*\}\)/,
  )
})

test('WhatsApp e ManyChat carregam o MESMO controller e o MESMO Core', () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'))
  const panels = manifest.content_scripts.filter((entry) => entry.js.includes('src/companion-core.js'))
  const hosts = panels.flatMap((entry) => entry.matches)

  assert.ok(hosts.includes('https://web.whatsapp.com/*'))
  assert.ok(hosts.includes('https://app.manychat.com/*'))
  for (const entry of panels) {
    assert.ok(entry.js.includes('src/companion-lead-creation-controller.js'))
  }
})

// Rodada 6: "O que é esta oportunidade?" (opcional) só com a capability do
// backend (leitura completa ligada). Sem ela, o fluxo é o da rodada 5.
test('sem a capability da nota: nenhum campo e o pedido é igual ao de antes', async () => {
  const harness = createHarness()

  harness.controller.openSuccessorChooser()
  assert.equal(harness.query('[data-yolen-successor-note]'), null)
  assert.equal(harness.controller.updateSuccessorNote('Plano anual'), true)

  harness.controller.selectSuccessorType('upgrade')
  await harness.controller.confirmSuccessorOpportunity()

  assert.deepEqual(JSON.parse(JSON.stringify(harness.apiCalls[0])), {
    cycle_id: CLOSED_CYCLE_ID,
    opportunity_type: 'upgrade',
    confirmed_by_human: true,
  })
})

test('com a capability da nota: campo opcional "O que é esta oportunidade?" vai no pedido (aparado, sem HTML)', async () => {
  const harness = createHarness()

  harness.getState().leadResolutionViewModel.capabilities.can_note_successor_opportunity = true
  harness.controller.openSuccessorChooser()

  const field = harness.query('textarea[data-yolen-successor-note]')

  assert.ok(field)
  assert.match(harness.query('.yolen-successor-note-label').textContent, /^O que é esta oportunidade\? \(opcional\)$/)
  assert.equal(field.getAttribute('maxlength'), '300')

  // A digitação fica no estado; o redesenho seguinte mantém o texto.
  harness.controller.updateSuccessorNote('  Quer o plano anual <b>já</b>  ')
  harness.controller.selectSuccessorType('upgrade')

  assert.equal(harness.query('textarea[data-yolen-successor-note]').value, '  Quer o plano anual <b>já</b>  ')
  assert.equal(harness.panel().querySelectorAll('b').length, 0)

  await harness.controller.confirmSuccessorOpportunity()

  assert.deepEqual(JSON.parse(JSON.stringify(harness.apiCalls[0])), {
    cycle_id: CLOSED_CYCLE_ID,
    opportunity_type: 'upgrade',
    note: 'Quer o plano anual <b>já</b>',
    confirmed_by_human: true,
  })
})

test('nota vazia não vai no pedido', async () => {
  const harness = createHarness()

  harness.getState().leadResolutionViewModel.capabilities.can_note_successor_opportunity = true
  harness.controller.openSuccessorChooser()
  harness.controller.updateSuccessorNote('   ')
  harness.controller.selectSuccessorType('renovacao')
  await harness.controller.confirmSuccessorOpportunity()

  assert.equal('note' in harness.apiCalls[0], false)
})
