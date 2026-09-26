// F11-01 (FASE 11): posição de scroll do workspace-body com métricas de
// layout realistas. Os demais testes de scroll só simulam métricas DEPOIS
// da montagem (o jsdom não faz layout: scrollHeight/clientHeight são 0);
// aqui elas existem desde o primeiro render:
//
// - viewport do workspace-body: 600px (clientHeight);
// - antes das áreas seller-facing (painel quase vazio): conteúdo cabe
//   inteiro (scrollHeight 600, sem overflow);
// - com as áreas montadas: conteúdo maior que a viewport (scrollHeight
//   configurável, 3000 por padrão).
//
// Regressão coberta: com o painel quase vazio o runtime registrava a
// posição como "no fim" (distância 0 do fim sem overflow nenhum) e, quando
// o workspace da primeira conversa crescia, restaurava "no fim" — o
// workspace abria rolado até o fim em vez do topo.
//
// Nenhuma espera por tempo fixo decide o resultado: as esperas são por
// condição (áreas montadas, restauração de scroll concluída).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const VIEWPORT_HEIGHT = 600
const CONVERSATION_A = { title: '+55 11 98888-7777', phone: '5511988887777', name: 'Lead Alfa', cycle: 'cycle-a' }
const CONVERSATION_B = { title: '+55 11 97777-6666', phone: '5511977776666', name: 'Lead Beta', cycle: 'cycle-b' }

function resolutionFor(conversation) {
  return defaultLeadResolution({
    phone: conversation.phone,
    lead: { id: `lead-${conversation.cycle}`, name: conversation.name, phone: conversation.phone, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: conversation.cycle, status: 'contato', owner_user_id: 'user-1' },
  })
}

function isWorkspaceBody(element) {
  return element?.hasAttribute?.('data-yolen-workspace-body') === true
}

// Instala métricas de layout realistas no workspace-body antes de qualquer
// render (beforeLoad roda antes do primeiro módulo da composição).
function installRealisticLayout(window, layout) {
  const elementPrototype = window.Element.prototype
  const nativeScrollHeight = Object.getOwnPropertyDescriptor(elementPrototype, 'scrollHeight')
  const nativeClientHeight = Object.getOwnPropertyDescriptor(elementPrototype, 'clientHeight')

  Object.defineProperty(elementPrototype, 'clientHeight', {
    configurable: true,
    get() {
      return isWorkspaceBody(this) ? VIEWPORT_HEIGHT : nativeClientHeight.get.call(this)
    },
  })
  Object.defineProperty(elementPrototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (!isWorkspaceBody(this)) return nativeScrollHeight.get.call(this)
      return this.querySelector('[data-yolen-seller-panel]') ? layout.contentHeight : VIEWPORT_HEIGHT
    },
  })
}

function start() {
  const layout = { contentHeight: 3000 }
  const loaded = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({
      headerTitle: CONVERSATION_A.title,
      messagesHtml: buildMessageHtml({ id: 'msg-1', prePlainText: '[10:15, 21/08/2026] Cliente: ', text: 'Ola, bom dia' }),
    }),
    resolutionsByPhone: {
      [CONVERSATION_A.phone]: resolutionFor(CONVERSATION_A),
      [CONVERSATION_B.phone]: resolutionFor(CONVERSATION_B),
    },
    beforeLoad: ({ dom }) => installRealisticLayout(dom.window, layout),
  })
  return { ...loaded, layout }
}

function stabilityRuntime(loaded) {
  return loaded.window.YolenCompanionPanelStabilityRuntime ?? loaded.sandbox.YolenCompanionPanelStabilityRuntime
}

function workspaceBody(document) {
  return document.getElementById('yolen-companion-panel')?.querySelector('[data-yolen-workspace-body]') ?? null
}

function dispatch(target, type) {
  const EventCtor = target.ownerDocument?.defaultView?.Event ?? target.defaultView?.Event
  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true }))
}

async function waitForRestorationSettled(loaded) {
  await waitFor(() => stabilityRuntime(loaded)?.isRestoring() === false, { intervalMs: 10 })
}

// Espera as áreas da conversa montarem (nome do lead visível + painéis
// seller-facing no workspace-body) e a restauração de scroll terminar.
async function waitForWorkspaceOf(loaded, conversation) {
  const { document } = loaded
  await waitFor(
    () =>
      document.getElementById('yolen-companion-panel')?.textContent.includes(conversation.name) &&
      Boolean(workspaceBody(document)?.querySelector('[data-yolen-seller-panel]')),
    { intervalMs: 10 },
  )
  await waitForRestorationSettled(loaded)
}

// Scroll do vendedor: aplicado no mesmo passo síncrono em que se confirma
// que não há restauração pendente (uma restauração em curso ignoraria o
// scroll, como num navegador real durante os dois frames de restauração).
async function scrollAsSeller(loaded, top) {
  await waitFor(
    () => {
      if (stabilityRuntime(loaded).isRestoring()) return false
      const body = workspaceBody(loaded.document)
      body.scrollTop = top
      dispatch(body, 'scroll')
      return true
    },
    { intervalMs: 10 },
  )
}

// Rerender da MESMA conversa (clique na aba já ativa). Espera o painel
// realmente mudar — o MutationObserver do runtime foi criado antes deste,
// então quando este dispara a restauração do runtime já foi agendada — e
// então a restauração terminar.
async function rerenderSameConversation(loaded) {
  const panel = loaded.document.getElementById('yolen-companion-panel')
  let mutated = false
  const observer = new loaded.window.MutationObserver(() => {
    mutated = true
  })
  observer.observe(panel, { childList: true, subtree: true, attributes: true, characterData: true })
  dispatch(loaded.document.querySelector('[data-yolen-seller-area="now"]'), 'click')
  await waitFor(() => mutated, { intervalMs: 10 })
  observer.disconnect()
  await waitForRestorationSettled(loaded)
}

function switchConversation(loaded, conversation) {
  const header = loaded.document.querySelector('header span[title]')
  header.setAttribute('title', conversation.title)
  header.textContent = conversation.title
  dispatch(header, 'click')
}

function scrollTop(loaded) {
  return workspaceBody(loaded.document).scrollTop
}

function maxScroll(loaded) {
  const body = workspaceBody(loaded.document)
  return body.scrollHeight - body.clientHeight
}

test('F11-01: a primeira conversa abre no topo quando o workspace cresce depois de um painel sem overflow', async () => {
  const loaded = start()

  await waitFor(() => resolveLeadCalls(loaded.calls).length > 0)
  await waitForWorkspaceOf(loaded, CONVERSATION_A)

  assert.ok(maxScroll(loaded) > 0, 'pré-condição: o workspace montado tem overflow real')
  assert.equal(scrollTop(loaded), 0, 'a primeira conversa precisa abrir no topo, não no fim do conteúdo')
})

test('F11-01: scroll manual do vendedor sobrevive a rerender da mesma conversa', async () => {
  const loaded = start()

  await waitForWorkspaceOf(loaded, CONVERSATION_A)
  await scrollAsSeller(loaded, 850)

  for (let i = 0; i < 3; i += 1) await rerenderSameConversation(loaded)

  assert.equal(scrollTop(loaded), 850)
})

test('F11-01: A → B começa B no topo e B → A começa A no topo, sem salto para o fim', async () => {
  const loaded = start()

  await waitForWorkspaceOf(loaded, CONVERSATION_A)
  await scrollAsSeller(loaded, 900)

  switchConversation(loaded, CONVERSATION_B)
  await waitFor(() => resolveLeadCalls(loaded.calls).some((call) => call.payload.phone === CONVERSATION_B.phone))
  await waitForWorkspaceOf(loaded, CONVERSATION_B)
  assert.equal(scrollTop(loaded), 0, 'B abre no topo')

  await scrollAsSeller(loaded, 700)

  switchConversation(loaded, CONVERSATION_A)
  await waitForWorkspaceOf(loaded, CONVERSATION_A)
  assert.equal(scrollTop(loaded), 0, 'voltar para A abre A no topo (troca de conversa), nunca no fim')
})

test('F11-01: com overflow real, vendedor no fim continua ancorado no fim quando o conteúdo cresce', async () => {
  const loaded = start()

  await waitForWorkspaceOf(loaded, CONVERSATION_A)
  await scrollAsSeller(loaded, maxScroll(loaded))

  // Conteúdo cresce e o runtime restaura pelo mesmo caminho de um
  // rerender em segundo plano (restorePanelInteraction). Um clique numa
  // aba não serve aqui: cliques seguem a âncora visual da ação.
  loaded.layout.contentHeight = 3500
  stabilityRuntime(loaded).restore()
  await waitForRestorationSettled(loaded)

  assert.equal(scrollTop(loaded), maxScroll(loaded), 'ancoragem no fim só com overflow real — e ela continua valendo')
})
