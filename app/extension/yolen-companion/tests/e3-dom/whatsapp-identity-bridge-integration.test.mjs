// P0 — Real WhatsApp Active Chat Identity: prova via DOM real (jsdom) do
// CONSUMO, por content-script.js, das respostas do whatsapp-identity-bridge.
//
// jsdom não reproduz isolated world/page world de uma WebExtension — não
// carregamos src/whatsapp-identity-bridge.js aqui (isso é coberto por
// tests/whatsapp-identity-bridge-extraction.test.mjs, num sandbox
// dedicado). Em vez disso, simulamos o bridge pela ÚNICA superfície real
// que ele usa para falar com o content-script: window.postMessage — a
// mesma técnica que os testes de PR anteriores já usam para observar
// content-script.js pela sua superfície pública (chrome.runtime.sendMessage).
// O smoke real no Firefox continua obrigatório para provar que o bridge
// de verdade enxerga o Fiber do WhatsApp.

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

const IDENTITY_BRIDGE_SOURCE = 'YOLEN_COMPANION_WHATSAPP_IDENTITY_BRIDGE'
const CONTENT_SCRIPT_SOURCE = 'YOLEN_COMPANION_CONTENT_SCRIPT'

// Instala um "bridge falso" que reage exatamente à mesma mensagem que o
// bridge real receberia (GET_ACTIVE_CHAT_IDENTITY) e responde com o que
// `resolveIdentity(requestData)` mandar — undefined para simular "bridge
// não responde" (timeout), um objeto para simular uma leitura real de
// Fiber. `delayMs` simula o atraso real de um postMessage entre worlds.
function installFakeIdentityBridge(window, resolveIdentity, { delayMs = 0 } = {}) {
  const requests = []

  // jsdom não popula event.source/event.origin corretamente para
  // window.postMessage() direcionado à própria janela (verificado
  // diretamente: origin volta vazio e source não é o window) — por isso
  // aqui capturamos o pedido só pelo formato do payload (o que o
  // content-script realmente envia via a API real de postMessage) e
  // respondemos construindo um MessageEvent manualmente, com
  // source/origin corretos, para que o listener REAL do content-script
  // (que SIM valida event.source/event.origin, exatamente como o bridge
  // real precisa validar) aceite a resposta. Isto simula fielmente o
  // que um bridge de outro world entregaria via postMessage de verdade
  // num navegador real.
  window.addEventListener('message', (event) => {
    if (event.data?.source !== CONTENT_SCRIPT_SOURCE) {
      return
    }

    if (event.data?.action !== 'GET_ACTIVE_CHAT_IDENTITY') {
      return
    }

    requests.push(event.data)

    const respond = () => {
      const identity = resolveIdentity(event.data)

      if (identity === undefined) {
        return
      }

      const responseEvent = new window.MessageEvent('message', {
        data: {
          source: IDENTITY_BRIDGE_SOURCE,
          action: 'ACTIVE_CHAT_IDENTITY',
          requestId: event.data.requestId,
          sequence: event.data.sequence,
          observedAt: Date.now(),
          identity,
        },
        origin: window.location.origin,
        source: window,
      })

      window.dispatchEvent(responseEvent)
    }

    if (delayMs > 0) {
      window.setTimeout(respond, delayMs)
    } else {
      respond()
    }
  })

  return requests
}

const REAL_SHAPE_LID_WITH_PN = {
  chatId: '218235995730114@lid',
  chatIdType: 'lid',
  phone: '554499712555',
  phoneJid: '554499712555@c.us',
  phoneServer: 'c.us',
  isGroup: false,
}

test('bridge acima do fallback DOM: resolve mesmo sem nenhum JID/telefone visível no DOM', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente Só Via Bridge' }),
  })

  installFakeIdentityBridge(window, () => REAL_SHAPE_LID_WITH_PN)

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '554499712555')
})

test('E/F) LID com PN válido resolve; LID sem PN explícito falha fechado (nunca inventa telefone a partir do LID)', async () => {
  const withPn = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente LID Com PN' }),
  })
  installFakeIdentityBridge(withPn.window, () => REAL_SHAPE_LID_WITH_PN)

  const resolved = await waitFor(() => resolveLeadCalls(withPn.calls).at(-1))
  assert.equal(resolved.payload.phone, '554499712555')

  const withoutPn = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente LID Sem PN' }),
  })
  installFakeIdentityBridge(withoutPn.window, () => ({
    chatId: '218235995730114@lid',
    chatIdType: 'lid',
    phone: null,
    phoneJid: null,
    phoneServer: null,
    isGroup: false,
  }))

  await sleep(1600)
  assert.equal(resolveLeadCalls(withoutPn.calls).length, 0)
})

test('H) phoneServer @g.us nunca resolve (grupo não é lead individual)', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente Grupo Via Bridge' }),
  })

  installFakeIdentityBridge(window, () => ({
    chatId: '120363012345678901@g.us',
    chatIdType: 'g.us',
    phone: '120363012345678901',
    phoneJid: '120363012345678901@g.us',
    phoneServer: 'g.us',
    isGroup: true,
  }))

  await sleep(1600)
  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('I) phoneServer desconhecido nunca resolve (allowlist estrita)', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente Server Desconhecido' }),
  })

  installFakeIdentityBridge(window, () => ({
    chatId: '5511999998888@unknown.domain',
    chatIdType: 'unknown.domain',
    phone: '5511999998888',
    phoneJid: '5511999998888@unknown.domain',
    phoneServer: 'unknown.domain',
    isGroup: false,
  }))

  await sleep(1600)
  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('J) phoneServer @s.whatsapp.net é aceito (segundo domínio válido da allowlist)', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente SWhatsappNet' }),
  })

  installFakeIdentityBridge(window, () => ({
    chatId: '5511988889999@s.whatsapp.net',
    chatIdType: 's.whatsapp.net',
    phone: '5511988889999',
    phoneJid: '5511988889999@s.whatsapp.net',
    phoneServer: 's.whatsapp.net',
    isGroup: false,
  }))

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))
  assert.equal(resolved.payload.phone, '5511988889999')
})

test('K) phoneJid inconsistente com user@server é evidência não confiável — falha fechado', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente Serialized Inconsistente' }),
  })

  installFakeIdentityBridge(window, () => ({
    chatId: '218235995730114@lid',
    chatIdType: 'lid',
    phone: '554499712555',
    // phoneJid não bate com phone@phoneServer — evidência suspeita.
    phoneJid: '999999999999@c.us',
    phoneServer: 'c.us',
    isGroup: false,
  }))

  await sleep(1600)
  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('L/M) resposta atrasada de A (já lendo o DOM de B) chega depois da troca — descartada; B resolve pelo próprio ciclo', async () => {
  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente A Via Bridge' }),
  })

  // Simula fielmente o risco real: um bridge de verdade lê o DOM no
  // momento em que PROCESSA a mensagem, não no momento em que ela foi
  // enviada — se o vendedor já trocou de conversa quando isso acontece,
  // a resposta tardia carrega a identidade de B, mas ainda com o
  // requestId gerado para A.
  installFakeIdentityBridge(
    window,
    () => ({
      chatId: '5511977776666@c.us',
      chatIdType: 'c.us',
      phone: '5511977776666',
      phoneJid: '5511977776666@c.us',
      phoneServer: 'c.us',
      isGroup: false,
    }),
    { delayMs: 500 },
  )

  // Enquanto o pedido de A ainda está em voo (atraso de 500ms), o
  // vendedor troca para B — mutação real de DOM, sem clique/Escape da
  // Yolen (o teste simula a ação do vendedor, não o código sob teste).
  await sleep(150)

  const app = document.getElementById('app')
  app.innerHTML = buildAppInnerHtml({
    headerTitle: 'Cliente B Sem Telefone Nenhum',
  })

  // Passado o atraso da resposta de A (que na verdade carrega dados lidos
  // já com o DOM de B), nada pode ter sido aplicado sob nenhuma chave —
  // nem o telefone "de B" via essa resposta contaminada, nem nada de A.
  await sleep(700)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'a resposta atrasada (contaminada pela troca de conversa) não pode ter resolvido nada',
  )
})

test('N) bridge nunca responde (timeout): fallback passivo por JID de DOM continua funcionando', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Sem Bridge',
      sidebarDataId: '5511955554444@c.us',
    }),
  })

  // Nenhum installFakeIdentityBridge — o pedido do content-script nunca é
  // respondido, simulando um bridge ausente/não instalado.

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511955554444')
})

test('Q) resolução via bridge nunca clica em nada da página', async () => {
  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente Sem Clique' }),
  })

  let clickCount = 0
  const originalClick = window.HTMLElement.prototype.click
  window.HTMLElement.prototype.click = function trackedClick(...args) {
    clickCount += 1
    return originalClick.apply(this, args)
  }

  try {
    installFakeIdentityBridge(window, () => REAL_SHAPE_LID_WITH_PN)

    const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

    assert.equal(resolved.payload.phone, '554499712555')
    assert.equal(clickCount, 0)
  } finally {
    window.HTMLElement.prototype.click = originalClick
  }
})

test('S) requests repetidos não fazem storm — no máximo 1 GET_ACTIVE_CHAT_IDENTITY por conversationKey sem novidade', async () => {
  const { document, window } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente Sem Fonte Para Bridge' }),
  })

  const requests = installFakeIdentityBridge(window, () => null)

  const conversationBody = document.getElementById('conversation-body')

  for (let i = 0; i < 4; i += 1) {
    await sleep(700)
    const marker = document.createElement('div')
    marker.textContent = `mutação irrelevante ${i}`
    conversationBody.appendChild(marker)
  }

  await sleep(700)

  assert.ok(
    requests.length <= 1,
    `esperava no máximo 1 GET_ACTIVE_CHAT_IDENTITY mesmo com 4 mutations irrelevantes; obteve ${requests.length}`,
  )
})

test('T) troca rápida A->B->C mantém só C aplicável', async () => {
  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: 'Cliente A Rapido' }),
  })

  installFakeIdentityBridge(
    window,
    (requestData) => {
      // Sempre responde com a identidade lida do DOM ATUAL (fiel ao
      // comportamento real do bridge), nunca a identidade "esperada" pelo
      // requestId — exatamente o cenário de risco.
      void requestData
      const currentTitle = document.querySelector('#main header span')?.getAttribute('title')

      if (currentTitle === 'Cliente C Rapido') {
        return {
          chatId: '5511900001111@c.us',
          chatIdType: 'c.us',
          phone: '5511900001111',
          phoneJid: '5511900001111@c.us',
          phoneServer: 'c.us',
          isGroup: false,
        }
      }

      return null
    },
    { delayMs: 300 },
  )

  const app = document.getElementById('app')

  await sleep(50)
  app.innerHTML = buildAppInnerHtml({ headerTitle: 'Cliente B Rapido' })
  await sleep(50)
  app.innerHTML = buildAppInnerHtml({ headerTitle: 'Cliente C Rapido' })

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511900001111')
  assert.equal(
    resolveLeadCalls(calls).length,
    1,
    'só a resolução de C deveria ter acontecido — nenhuma resolução espúria de A ou B',
  )
})
