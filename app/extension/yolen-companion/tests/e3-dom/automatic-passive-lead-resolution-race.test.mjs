// UX8 — Automatic Passive Lead Resolution (harden): prova via DOM real de
// dois pontos endurecidos depois da auditoria remota do commit b84d300:
//
// 1) A corrida A->B: runAutomaticContactLookup(conversationKey) é agendado
//    por setTimeout(..., 300) a partir de refreshConversationSnapshot(). Se
//    o vendedor trocar de conversa (A -> B) antes desses 300ms vencerem, o
//    callback (que ainda carrega o conversationKey de A por closure) não
//    pode aplicar o telefone lido do DOM ATUAL (já de B) sob a chave de A.
//    O debounce do MutationObserver (600ms) é deliberadamente MAIOR que o
//    agendamento do lookup (300ms) — então essa corrida é reproduzível de
//    forma determinística com tempo real, sem mocks de timer.
//
// 2) Retry limitado: uma conversa sem nenhuma fonte passiva de telefone e
//    sem o painel de contato aberto não pode gerar um novo lookup a cada
//    mutation do WhatsApp (o DOM muda o tempo todo). Depois de falhar
//    fechado uma vez, a tentativa fica marcada — mas isso não pode
//    impedir para sempre: (a) o JID aparecendo depois continua resolvendo
//    via getConversationPhone() a cada refresh, e (b) o vendedor abrindo o
//    painel de contato manualmente depois ainda deve funcionar.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadContentScript,
  resolveLeadCalls,
} from '../e3-test-support/load-content-script.mjs'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate, { timeoutMs = 8000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const result = predicate()

    if (result) {
      return result
    }

    await sleep(intervalMs)
  }

  throw new Error(`waitFor: condição não satisfeita dentro de ${timeoutMs}ms`)
}

function buildAppInnerHtml({
  headerTitle = 'Cliente Teste',
  sidebarDataId = null,
  mainDataIds = [],
} = {}) {
  const sidebar = sidebarDataId
    ? `<div id="pane-side">
        <div aria-selected="true" data-id="${sidebarDataId}">
          <span title="${headerTitle}">${headerTitle}</span>
        </div>
      </div>`
    : ''

  const mainRows = mainDataIds
    .map((id) => `<div data-id="${id}"></div>`)
    .join('')

  return `${sidebar}
    <div id="main">
      <header><span title="${headerTitle}">${headerTitle}</span></header>
      <div id="conversation-body">${mainRows}</div>
    </div>`
}

function buildPageHtml(options = {}) {
  return `<!doctype html><html><body>
    <div id="app">${buildAppInnerHtml(options)}</div>
  </body></html>`
}

// Um "Dados do contato" mínimo, mas com a mesma forma que
// findContactInfoHeader()/findContactInfoPanel() reconhecem de verdade:
// um <header> com esse texto em algum lugar do documento (fora do painel
// da Yolen) e um container pai cujo texto combinado contenha o telefone.
function buildContactInfoPanelHtml(phone) {
  return `<div id="contact-info-drawer">
    <header><span>Dados do contato</span></header>
    <div>
      <span title="Cliente Painel Manual">Cliente Painel Manual</span>
      <span>${phone}</span>
      <span>Sobre: disponível para conversar sobre o pedido a qualquer hora</span>
    </div>
  </div>`
}

test('corrida A->B: lookup agendado para A não aplica o telefone de B lido do DOM já trocado', async () => {
  const { calls, document } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente A Sem Telefone',
      // Conversa A não tem nenhuma fonte passiva — força o agendamento de
      // runAutomaticContactLookup(A) 300ms após o refreshConversationSnapshot
      // inicial de start().
    }),
  })

  // Dá tempo do refreshConversationSnapshot inicial de start() rodar e
  // agendar o lookup de A (acontece em poucos ms após o carregamento).
  await sleep(100)

  // Vendedor troca para B ANTES dos 300ms do lookup de A vencerem — troca
  // real de DOM, sem nenhum clique/Escape sintético da Yolen (o teste
  // simula a ação do vendedor, não o código sob teste).
  const app = document.getElementById('app')
  app.innerHTML = buildAppInnerHtml({
    headerTitle: 'Cliente B Com Telefone',
    sidebarDataId: '5511988887777@c.us',
  })

  // Checagem no meio da corrida: os 300ms do lookup de A já venceram, mas
  // o debounce do MutationObserver (600ms) para a mutação de B feita
  // acima ainda NÃO — ou seja, state.conversationKey pode muito bem ainda
  // estar em A neste instante. É exatamente essa janela que o segundo
  // guard (revalidação contra o DOM ao vivo) precisa fechar.
  await sleep(300)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'nada pode ter sido resolvido ainda: nem A (sem telefone) nem B sob a chave de A (esse seria exatamente o bug)',
  )

  // Passado o debounce de B, o fluxo normal (agora rodando com
  // conversationKey e DOM já consistentes) deve resolver B corretamente.
  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511988887777')
  assert.equal(
    resolveLeadCalls(calls).length,
    1,
    'só uma resolução deveria ter acontecido no total: a de B, na hora certa',
  )
})

test('retry limitado: conversa sem fonte de telefone não reagenda o lookup a cada mutation do WhatsApp', async () => {
  const { document, window } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Sem Fonte Nenhuma',
    }),
  })

  // content-script.js agenda o lookup via window.setTimeout (o setTimeout
  // do próprio jsdom Window, não o setTimeout global do Node) — é esse
  // que precisa ser instrumentado para contar quantas vezes
  // refreshConversationSnapshot() decidiu agendar uma NOVA tentativa.
  const originalSetTimeout = window.setTimeout.bind(window)
  let scheduledLookupCalls = 0

  window.setTimeout = (fn, delay, ...args) => {
    if (delay === 300) {
      scheduledLookupCalls += 1
    }

    return originalSetTimeout(fn, delay, ...args)
  }

  const conversationBody = document.getElementById('conversation-body')

  // Várias mutations irrelevantes (sem nenhum data-id novo) ao longo de
  // tempo suficiente para atravessar múltiplos ciclos de debounce
  // (600ms) — se o gate de deduplicação não estivesse funcionando, cada
  // uma dispararia um novo agendamento de runAutomaticContactLookup.
  for (let i = 0; i < 4; i += 1) {
    await sleep(700)
    const marker = document.createElement('div')
    marker.textContent = `mutação irrelevante ${i}`
    conversationBody.appendChild(marker)
  }

  await sleep(700)

  assert.ok(
    scheduledLookupCalls <= 1,
    `esperava no máximo 1 agendamento de lookup mesmo com 4 mutations irrelevantes; obteve ${scheduledLookupCalls}`,
  )
})

test('JID aparece depois de um fail-closed anterior: getConversationPhone resolve sozinho, sem reabrir o lookup nem o painel', async () => {
  const { calls, document } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Fonte Tardia',
    }),
  })

  // Deixa o primeiro ciclo (sem nenhuma fonte) falhar fechado e marcar a
  // conversationKey como tentada.
  await sleep(700)
  assert.equal(resolveLeadCalls(calls).length, 0)

  // Só agora o JID aparece no DOM (ex.: o WhatsApp terminou de renderizar
  // a lista de mensagens) — nenhuma ação do vendedor, nenhuma reabertura
  // de painel.
  const conversationBody = document.getElementById('conversation-body')
  const messageRow = document.createElement('div')
  messageRow.setAttribute('data-id', 'true_5511999998888@c.us_LATE')
  conversationBody.appendChild(messageRow)

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511999998888')
})

test('painel de contato aberto manualmente depois de um fail-closed anterior ainda é aproveitado', async () => {
  const { calls, document } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Painel Manual',
    }),
  })

  // Primeiro ciclo falha fechado (sem JID, sem painel) e marca a
  // conversationKey como tentada.
  await sleep(700)
  assert.equal(resolveLeadCalls(calls).length, 0)

  // Vendedor abre o painel "Dados do contato" manualmente (ação humana,
  // fora do controle da Yolen) — a marca de "já tentei" não pode impedir
  // que esse dado, agora disponível, seja lido.
  const app = document.getElementById('app')
  const panel = document.createElement('div')
  panel.innerHTML = buildContactInfoPanelHtml('+55 11 97777-6666')
  app.appendChild(panel.firstElementChild)

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511977776666')
})
