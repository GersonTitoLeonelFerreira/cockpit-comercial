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
  defaultLeadResolution,
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


test('V) bridge confirma grupo mesmo com JID individual único em #main: nunca resolve lead pelo fallback', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Grupo Sem Aria Main',
      mainDataIds: [
        'true_5511987654321@c.us_A',
      ],
    }),
  })

  const requests = installFakeIdentityBridge(
    window,
    () => ({
      chatId: '120363099999999999@g.us',
      chatIdType: 'g.us',
      phone: null,
      phoneJid: null,
      phoneServer: null,
      isGroup: true,
    }),
  )

  await sleep(1800)

  assert.ok(
    requests.length >= 1,
    'o bridge precisa ter sido consultado antes do fallback',
  )

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'grupo confirmado pelo bridge é terminal mesmo com um @c.us único em #main',
  )
})

test('W) bridge confirma grupo sem aria-label reconhecível e com JID individual na conversa selecionada: nunca resolve lead', async () => {
  const { calls, window } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Grupo Em Outro Idioma',
      sidebarDataId: '5511976543210@c.us',
    }),
  })

  const requests = installFakeIdentityBridge(
    window,
    () => ({
      chatId: '120363088888888888@g.us',
      chatIdType: 'g.us',
      phone: null,
      phoneJid: null,
      phoneServer: null,
      isGroup: true,
    }),
  )

  await sleep(1800)

  assert.ok(
    requests.length >= 1,
    'a classificação forte do bridge precisa ser consultada',
  )

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'grupo confirmado pelo bridge nunca pode cair para o JID individual da sidebar',
  )
})


test('X) grupo confirmado pelo bridge permanece terminal após mutation que expõe telefone no header', async () => {
  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Grupo Persistido Pelo Bridge',
      sidebarDataId:
        '120363077777777777@g.us',
    }),
  })

  const requests = installFakeIdentityBridge(
    window,
    () => ({
      chatId: '120363077777777777@g.us',
      chatIdType: 'g.us',
      phone: null,
      phoneJid: null,
      phoneServer: null,
      isGroup: true,
    }),
  )

  await waitFor(() => requests.length >= 1)
  await sleep(300)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'grupo confirmado inicialmente não pode resolver lead',
  )

  // Simula uma mutation posterior do WhatsApp em que o detector visual
  // continua sem aria-label reconhecível, mas aparece um texto/atributo
  // com formato de telefone dentro do header. A conversa continua sendo
  // a MESMA: o título primário permanece intacto.
  const header = document.querySelector('#main header')
  const participantPhone = document.createElement('span')
  participantPhone.setAttribute(
    'title',
    '5511965432109',
  )
  participantPhone.textContent =
    '5511965432109'
  header.appendChild(participantPhone)

  await sleep(1600)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'a classificação de grupo do bridge deve sobreviver às mutations da mesma conversa e bloquear getConversationPhone/resolveCurrentLead',
  )
})

test('Y) trocar do grupo confirmado para uma nova conversa 1:1 descarta a classificação persistida', async () => {
  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Grupo Antes Da Troca',
      sidebarDataId:
        '120363066666666666@g.us',
    }),
  })

  const requests = installFakeIdentityBridge(
    window,
    () => {
      const selectedDataId =
        document
          .querySelector(
            '[aria-selected="true"]',
          )
          ?.getAttribute('data-id') ||
        ''

      if (
        selectedDataId.includes(
          '5511954321098@c.us',
        )
      ) {
        return {
          chatId: '5511954321098@c.us',
          chatIdType: 'c.us',
          phone: '5511954321098',
          phoneJid:
            '5511954321098@c.us',
          phoneServer: 'c.us',
          isGroup: false,
        }
      }

      return {
        chatId:
          '120363066666666666@g.us',
        chatIdType: 'g.us',
        phone: null,
        phoneJid: null,
        phoneServer: null,
        isGroup: true,
      }
    },
  )

  await waitFor(() => requests.length >= 1)
  await sleep(300)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
  )

  const app = document.getElementById('app')

  app.innerHTML = buildAppInnerHtml({
    headerTitle: 'Cliente Depois Do Grupo',
    sidebarDataId: '5511954321098@c.us',
  })

  const resolved = await waitFor(
    () => resolveLeadCalls(calls).at(-1),
  )

  assert.equal(
    resolved.payload.phone,
    '5511954321098',
  )
})

// P2 (PR #271, achado Codex) — "Persist group status only with a unique
// chat identity": a confirmação de grupo do bridge só pode ser persistida
// com uma identidade realmente única (o chatId do próprio bridge, ou um
// data-id estrutural real) — nunca com `title:<nome exibido>`, porque dois
// chats homônimos sem data-id/avatar disponível no momento da leitura
// produziriam o mesmo valor e um contato 1:1 herdaria a classificação de
// grupo de outro chat.
test('Z) grupo confirmado só por título homônimo não gruda em um contato 1:1 diferente com o mesmo nome', async () => {
  const HOMONYM_TITLE = 'Mesmo Nome'

  // Linha da sidebar deliberadamente sem data-id/avatar (só o título é
  // visível) — o mesmo shape valerá para o contato 1:1 homônimo mais
  // adiante, reproduzindo o cenário em que nenhum dos dois lados tem
  // data-id/avatar confiável no momento da leitura.
  const { calls, window, document } = loadContentScript({
    initialHtml: `<!doctype html><html><body>
      <div id="app">
        <div id="pane-side">
          <div aria-selected="true" role="row">
            <span title="${HOMONYM_TITLE}">${HOMONYM_TITLE}</span>
          </div>
        </div>
        <div id="main">
          <header><span title="${HOMONYM_TITLE}">${HOMONYM_TITLE}</span></header>
          <div id="conversation-body"></div>
        </div>
      </div>
    </body></html>`,
  })

  let secondConversationActive = false

  const requests = installFakeIdentityBridge(window, () => {
    if (secondConversationActive) {
      return {
        chatId: '5511955554444@c.us',
        chatIdType: 'c.us',
        phone: '5511955554444',
        phoneJid: '5511955554444@c.us',
        phoneServer: 'c.us',
        isGroup: false,
      }
    }

    return {
      chatId: '120363011112222333@g.us',
      chatIdType: 'g.us',
      phone: null,
      phoneJid: null,
      phoneServer: null,
      isGroup: true,
    }
  })

  await waitFor(() => requests.length >= 1)
  await sleep(300)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'grupo confirmado pelo bridge (mesmo sem data-id/avatar na sidebar) não pode resolver lead',
  )

  // Troca real para um contato 1:1 com o MESMO título e a MESMA ausência
  // de data-id/avatar na sidebar — a única evidência estrutural
  // realmente única vem do chatId que o próprio identity bridge devolve
  // para a conversa ativa, não do DOM.
  secondConversationActive = true

  const app = document.getElementById('app')

  app.innerHTML = `<div id="pane-side">
      <div aria-selected="true" role="row">
        <span title="${HOMONYM_TITLE}">${HOMONYM_TITLE}</span>
      </div>
    </div>
    <div id="main">
      <header><span title="${HOMONYM_TITLE}">${HOMONYM_TITLE}</span></header>
      <div id="conversation-body"></div>
    </div>`

  const resolved = await waitFor(
    () => resolveLeadCalls(calls).at(-1),
  )

  assert.equal(
    resolved.payload.phone,
    '5511955554444',
    'o contato 1:1 homônimo não pode herdar a classificação de grupo persistida sob o mesmo título — ele deve resolver normalmente',
  )
})

// P2 (follow-up, PR #271) — "keep bridge group fail-closed during ambiguous
// identity": isBridgeConfirmedGroupForConversation() compara a identidade
// FORTE persistida (chatId do bridge/data-id) contra getSelectedChatStableIdentity(),
// que pode cair para `title:<nome>` quando data-id/avatar somem numa
// mutation da MESMA conversa. Uma ausência temporária de identidade forte
// no DOM não é prova de troca — sem fail-closed, getConversationPhone()
// roda antes de qualquer revalidação e um telefone de participante exposto
// no header vira lead. Ao mesmo tempo, um título homônimo não pode grudar
// o grupo para sempre: só o próprio identity bridge (revalidação) ou uma
// identidade estrutural forte realmente diferente podem descartar a
// classificação.
test('AA) grupo ambíguo (sem data-id/avatar) fica fail-closed até o bridge revalidar; participante do header nunca vira lead; troca real para 1:1 homônimo resolve depois', async () => {
  const GROUP_TITLE = 'Grupo Ambíguo AA'
  const GROUP_JID = '120363055554444333@g.us'

  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: GROUP_TITLE,
      sidebarDataId: GROUP_JID,
    }),
  })

  let bridgeMode = 'group'

  const requests = installFakeIdentityBridge(
    window,
    () => {
      if (bridgeMode === 'group') {
        return {
          chatId: GROUP_JID,
          chatIdType: 'g.us',
          phone: null,
          phoneJid: null,
          phoneServer: null,
          isGroup: true,
        }
      }

      return {
        chatId: '5511933332222@c.us',
        chatIdType: 'c.us',
        phone: '5511933332222',
        phoneJid: '5511933332222@c.us',
        phoneServer: 'c.us',
        isGroup: false,
      }
    },
  )

  // 1+2) Grupo sem aria-label reconhecível, confirmado pelo bridge com
  // chatId @g.us — a linha da sidebar ainda tem o data-id do próprio grupo
  // neste momento (evidência forte disponível na confirmação inicial).
  await waitFor(() => requests.length >= 1)
  await sleep(300)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'grupo recém-confirmado não pode resolver lead',
  )

  const requestsAfterInitialConfirm = requests.length

  // 3+4) A MESMA conversa perde data-id na sidebar — ausência de
  // identidade forte não é evidência de troca.
  const sidebarRow = document.querySelector(
    '[aria-selected="true"]',
  )
  sidebarRow.removeAttribute('data-id')

  // 5+6) Mutation adicional expõe um telefone de participante no header —
  // exatamente o cenário que o fail-closed precisa bloquear.
  const header = document.querySelector('#main header')
  const participantPhone = document.createElement('span')
  participantPhone.setAttribute(
    'title',
    '5511965432109',
  )
  participantPhone.textContent = '5511965432109'
  header.appendChild(participantPhone)

  await sleep(1600)

  // 7) Continua fail-closed: nenhum participante vira lead.
  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'ausência temporária de data-id/avatar não pode derrubar a classificação de grupo nem deixar o participante do header resolver como lead',
  )

  // 8) O bridge foi consultado de novo para revalidar a MESMA ambiguidade
  // (fail-closed não significa "nunca mais pergunta") — mas sem storm:
  // várias mutations seguidas não geram uma tempestade de pedidos.
  assert.ok(
    requests.length > requestsAfterInitialConfirm,
    'a ambiguidade deveria ter disparado pelo menos uma revalidação via bridge',
  )
  assert.ok(
    requests.length <=
      requestsAfterInitialConfirm + 3,
    `revalidação não pode virar storm de requests; obteve ${requests.length - requestsAfterInitialConfirm} pedidos extras`,
  )

  // 9) Troca REAL para um contato 1:1 homônimo (mesmo título do grupo,
  // agora com um data-id estruturalmente diferente) — só com evidência
  // forte de identidade diferente (ou o bridge) a classificação pode cair.
  bridgeMode = 'individual'

  const app = document.getElementById('app')

  app.innerHTML = buildAppInnerHtml({
    headerTitle: GROUP_TITLE,
    sidebarDataId: '5511933332222@c.us',
  })

  // 10+11) O bridge/data-id prova que a conversa atual não é mais o grupo
  // antigo e o contato 1:1 resolve normalmente.
  const resolved = await waitFor(
    () => resolveLeadCalls(calls).at(-1),
  )

  assert.equal(
    resolved.payload.phone,
    '5511933332222',
    'o contato 1:1 homônimo deve resolver normalmente assim que uma identidade estrutural realmente diferente aparece — o grupo antigo não pode grudar para sempre',
  )
})

// P1 (novo achado Codex, PR #271) — "Key bridge-resolved phones by the
// bridge chat ID": bridgeResult.status === 'resolved' cacheava o telefone
// só por conversationKey visual, descartando bridgeResult.chatId. Dois
// contatos 1:1 homônimos sem data-id/avatar disponível produzem a MESMA
// conversationKey — o telefone do primeiro vazava para o segundo assim
// que o vendedor trocasse de conversa, porque cachedPhonesByConversationKey
// nunca sabia que o chatId por trás da chave tinha mudado.
//
// A correção usa um ACTIVE CHAT EPOCH: um contador estrutural (referência
// de #main/header, nunca título/avatar) que muda quando o WhatsApp
// remonta a área da conversa — sinal independente de conversationKey, que
// pode colidir. bridgeResolvedContactContext ancora o telefone cacheado
// ao chatId do bridge E ao epoch vigente quando foi resolvido; qualquer
// troca estrutural detectada (epoch diferente) já suspende o reuso de
// forma SÍNCRONA, sem esperar o bridge confirmar nada — ausência de
// identidade forte no DOM nunca autoriza reuso.
test('AB) contato 1:1 resolvido pelo bridge não gruda em um homônimo diferente sob a MESMA conversationKey visual — leadResolution/telefone de A somem ANTES de qualquer resposta do bridge para B', async () => {
  const HOMONYM_TITLE = 'Mesmo Nome AB'
  const PHONE_A = '5511911111111'
  const PHONE_B = '5511922222222'
  const MARKER_A = 'MARCADOR_LEAD_A_AB'
  const MARKER_B = 'MARCADOR_LEAD_B_AB'

  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: HOMONYM_TITLE }),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({
        phone: PHONE_A,
        lead: {
          id: 'lead-a',
          name: MARKER_A,
          phone: PHONE_A,
          email: null,
          cpf_cnpj: null,
          deleted_at: null,
        },
      }),
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        lead: {
          id: 'lead-b',
          name: MARKER_B,
          phone: PHONE_B,
          email: null,
          cpf_cnpj: null,
          deleted_at: null,
        },
      }),
    },
  })

  let bridgeMode = 'A'

  const requests = installFakeIdentityBridge(
    window,
    () => {
      if (bridgeMode === 'A') {
        return {
          chatId: `${PHONE_A}@c.us`,
          chatIdType: 'c.us',
          phone: PHONE_A,
          phoneJid: `${PHONE_A}@c.us`,
          phoneServer: 'c.us',
          isGroup: false,
        }
      }

      return {
        chatId: `${PHONE_B}@c.us`,
        chatIdType: 'c.us',
        phone: PHONE_B,
        phoneJid: `${PHONE_B}@c.us`,
        phoneServer: 'c.us',
        isGroup: false,
      }
    },
    // Atraso proposital só na resposta de B: abre uma janela clara e
    // confortável (~800ms de folga) para observar o estado neutro ANTES
    // de qualquer resposta do bridge chegar.
    { delayMs: 500 },
  )

  function panelText() {
    return (
      document.getElementById(
        'yolen-companion-panel',
      )?.textContent || ''
    )
  }

  // A) contato 1:1 sem data-id/avatar disponível resolve normalmente pelo
  // bridge: telefone, leadResolution e workspace seller-facing de A
  // visíveis.
  const resolvedA = await waitFor(
    () => resolveLeadCalls(calls).at(-1),
  )

  assert.equal(resolvedA.payload.phone, PHONE_A)
  assert.equal(resolveLeadCalls(calls).length, 1)

  await waitFor(() => panelText().includes(MARKER_A))
  assert.ok(
    panelText().includes(MARKER_A),
    'o lead de A precisa estar visível no painel antes da troca (senão o teste não provaria nada ao checar a ausência depois)',
  )

  const requestsAfterA = requests.length

  // B) troca REAL para outro contato 1:1 com o MESMO título — o DOM
  // continua sem data-id/avatar, então a conversationKey visual
  // permanece IDÊNTICA à de A. Só uma identidade estrutural realmente
  // diferente (o epoch de #main/header remontado) ou o próprio bridge
  // podem provar a troca.
  bridgeMode = 'B'

  const app = document.getElementById('app')
  app.innerHTML = buildAppInnerHtml({
    headerTitle: HOMONYM_TITLE,
  })

  // ANTES de qualquer resposta do bridge para B (que só chega depois de
  // ~1400ms: debounce de 600ms + agendamento de 300ms + atraso proposital
  // de 500ms do bridge) — folga generosa —, o workspace de A precisa ter
  // desaparecido por completo, e nada de B pode ter aparecido ainda.
  await sleep(750)

  assert.equal(
    resolveLeadCalls(calls).length,
    1,
    'nenhuma nova resolução pode ter acontecido antes do bridge confirmar B',
  )

  assert.ok(
    !panelText().includes(MARKER_A),
    'o lead de A não pode continuar visível no painel depois da troca estrutural para B — mesmo sem o bridge ainda ter respondido',
  )

  assert.ok(
    !panelText().includes(PHONE_A),
    'o telefone de A não pode continuar visível no painel depois da troca estrutural para B',
  )

  assert.ok(
    !panelText().includes(MARKER_B),
    'o lead de B ainda não pode aparecer — o bridge para B ainda não respondeu (estado deve ser neutro/identificando, não B adiantado)',
  )

  // Depois que o bridge confirma B...
  const resolvedB = await waitFor(() => {
    const list = resolveLeadCalls(calls)
    return list.length >= 2 && list.at(-1)
  })

  assert.equal(
    resolveLeadCalls(calls).length,
    2,
    'B deve resolver exatamente uma vez a mais — nenhuma reaplicação espúria do telefone de A',
  )

  assert.equal(
    resolveLeadCalls(calls)[0].payload.phone,
    PHONE_A,
    'a primeira resolução continua sendo a de A',
  )

  assert.equal(
    resolvedB.payload.phone,
    PHONE_B,
    'B só pode resolver com o próprio telefone — nunca com o de A, mesmo com a conversationKey visual igual',
  )

  await waitFor(() => panelText().includes(MARKER_B))

  assert.ok(
    !panelText().includes(MARKER_A),
    'A não pode reaparecer no painel depois que B resolve',
  )

  assert.ok(
    requests.length > requestsAfterA,
    'o bridge precisa ter sido consultado de novo para B, mesmo com a conversationKey visual igual à de A (chatId é a autoridade, não o texto)',
  )
})

// Seção 6 da missão (corrida): o pedido para a conversa exibida no load
// ainda está em voo (atraso simulado, resposta FIXA — não lê o DOM ao
// responder, simulando o pior caso de uma resposta que descreve a
// conversa de ANTES da troca) quando o vendedor já troca para um homônimo
// sob a MESMA conversationKey visual. tryResolveViaIdentityBridge() já
// descarta uma resposta cuja conversationKey não bate mais com a atual
// (ver teste L/M) — mas isso não protege o caso em que a própria
// conversationKey COLIDE (mesmo título, nenhum data-id/avatar em nenhum
// dos dois lados). O ACTIVE CHAT EPOCH fecha exatamente esse ponto cego:
// o epoch muda de forma SÍNCRONA (no callback bruto do MutationObserver,
// antes de qualquer debounce ou gate de "lookup em voo") assim que
// #main/header são remontados pela troca — a resposta atrasada, capturada
// com o epoch ANTIGO, é descartada por completo quando finalmente chega,
// SEM aplicar telefone/cache/contexto algum. Nenhuma atividade adicional
// do vendedor é necessária: a conversa realmente atual (B) resolve pelo
// próprio ciclo automático, exatamente como se a resposta contaminada
// nunca tivesse existido.
test('race) resposta em voo durante a troca para um homônimo sob a MESMA conversationKey NUNCA aplica o telefone anterior — nem uma vez', async () => {
  const HOMONYM_TITLE = 'Mesmo Nome Corrida'
  const STALE_PHONE = '5511900003333'
  const PHONE_B = '5511900004444'

  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: HOMONYM_TITLE }),
  })

  let invocationCount = 0

  installFakeIdentityBridge(
    window,
    () => {
      invocationCount += 1

      // A PRIMEIRA resposta é sempre a "contaminada" (dados de antes da
      // troca), não importa quando ela realmente chega — modela o pior
      // caso de um bridge que capturou a identidade no momento do envio,
      // não do processamento. Qualquer chamada seguinte (o ciclo natural
      // de retentativa desta correção) já reflete a conversa realmente
      // atual.
      if (invocationCount === 1) {
        return {
          chatId: `${STALE_PHONE}@c.us`,
          chatIdType: 'c.us',
          phone: STALE_PHONE,
          phoneJid: `${STALE_PHONE}@c.us`,
          phoneServer: 'c.us',
          isGroup: false,
        }
      }

      return {
        chatId: `${PHONE_B}@c.us`,
        chatIdType: 'c.us',
        phone: PHONE_B,
        phoneJid: `${PHONE_B}@c.us`,
        phoneServer: 'c.us',
        isGroup: false,
      }
    },
    { delayMs: 400 },
  )

  // O primeiro lookup (para a conversa carregada) ainda está em voo
  // (atraso de 400ms) quando o vendedor já troca para um homônimo — mesmo
  // título, mesma conversationKey visual (nenhum dos dois expõe
  // data-id/avatar). A troca por si só (childList em #app) já remonta
  // #main/header e incrementa o epoch, de forma síncrona, muito antes da
  // resposta atrasada chegar.
  await sleep(150)

  const app = document.getElementById('app')
  app.innerHTML = buildAppInnerHtml({
    headerTitle: HOMONYM_TITLE,
  })

  // A resposta contaminada chega ~250ms depois da troca (400ms desde o
  // envio original, contra 150ms já decorridos) — tempo de sobra para o
  // epoch já ter mudado antes dela ser processada. Descartada por
  // completo: nenhuma resolução pode ter acontecido, nem com o telefone
  // certo nem com o errado, só pela resposta contaminada.
  await sleep(500)

  assert.equal(
    resolveLeadCalls(calls).length,
    0,
    'a resposta contaminada não pode ter resolvido NADA — nem uma vez — mesmo com a conversationKey visual coincidente com a conversa anterior',
  )

  // A conversa REALMENTE atual (B) resolve pelo próprio ciclo automático
  // de tentativa — sem depender de nenhuma atividade adicional do
  // vendedor além da troca em si.
  const resolved = await waitFor(
    () => resolveLeadCalls(calls).at(-1),
  )

  assert.equal(
    resolved.payload.phone,
    PHONE_B,
    'a conversa atual só pode resolver com o próprio telefone',
  )

  assert.equal(
    resolveLeadCalls(calls).length,
    1,
    'só pode existir UMA resolução no total — a de B; a resposta contaminada nunca contou',
  )
})

// Seção 3/8 da missão: a correção do epoch estrutural não pode reintroduzir
// o loop resolve→reset→resolve que existia numa versão anterior desta
// mesma correção (ambiguidade de identidade forte, sozinha, disparando
// reset a cada mutation). Um contato sem data-id/avatar persistente no DOM
// — o caso comum, não a exceção — precisa continuar resolvido
// indefinidamente enquanto a conversa não muda de instância estrutural:
// nenhuma resolução repetida, nenhuma consulta repetida ao bridge, mesmo
// depois de várias mutations reais da MESMA conversa (novas mensagens).
test('AC) contato 1:1 resolvido sem data-id/avatar sobrevive a várias mutations da MESMA conversa sem resolução repetida nem storm de requests', async () => {
  const TITLE = 'Contato Sem DataId AC'
  const PHONE = '5511900007777'

  const { calls, window, document } = loadContentScript({
    initialHtml: buildPageHtml({ headerTitle: TITLE }),
  })

  const requests = installFakeIdentityBridge(
    window,
    () => ({
      chatId: `${PHONE}@c.us`,
      chatIdType: 'c.us',
      phone: PHONE,
      phoneJid: `${PHONE}@c.us`,
      phoneServer: 'c.us',
      isGroup: false,
    }),
  )

  const resolved = await waitFor(
    () => resolveLeadCalls(calls).at(-1),
  )

  assert.equal(resolved.payload.phone, PHONE)
  assert.equal(resolveLeadCalls(calls).length, 1)

  const requestsAfterResolve = requests.length

  // Seis mutations reais e sucessivas na MESMA conversa (mensagens
  // chegando) — nenhuma delas remonta #main/header, então o epoch
  // estrutural não muda.
  const conversationBody = document.getElementById(
    'conversation-body',
  )

  for (let index = 0; index < 6; index += 1) {
    const marker = document.createElement('div')
    marker.textContent = `mensagem irrelevante ${index}`
    conversationBody.appendChild(marker)
    await sleep(700)
  }

  assert.equal(
    resolveLeadCalls(calls).length,
    1,
    'nenhuma mutation da MESMA conversa pode reacender uma resolução repetida — isso seria o loop resolve→reset→resolve, não a correção',
  )

  assert.equal(
    requests.length,
    requestsAfterResolve,
    'nenhuma mutation da MESMA conversa pode gerar uma nova consulta ao bridge — a instância estrutural da conversa não mudou',
  )
})

test('AD) linha selecionada separa homônimos com #main/header reutilizados, limpa A e recupera B após A em voo', async () => {
  const TITLE = 'Mesmo Nome AD'
  const PHONE_A = '5511900008881'
  const PHONE_B = '5511900008882'
  const MARKER_A = 'MARCADOR_LEAD_A_AD'
  const MARKER_B = 'MARCADOR_LEAD_B_AD'

  const initialHtml = `<!doctype html><html><body><div id="app">
    <div id="pane-side">
      <div id="row-a" role="row" aria-selected="true"><span title="${TITLE}">${TITLE}</span></div>
      <div id="row-b" role="row" aria-selected="false"><span title="${TITLE}">${TITLE}</span></div>
    </div>
    <div id="main">
      <header><span title="${TITLE}">${TITLE}</span></header>
      <div id="conversation-body"></div>
    </div>
  </div></body></html>`

  // Parte 1 — A já resolvido: mudar SOMENTE aria-selected precisa formar
  // uma boundary real mesmo com #main/header exatamente iguais, limpar A
  // imediatamente e reconstruir B do zero.
  const first = loadContentScript({
    initialHtml,
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({
        phone: PHONE_A,
        lead: {
          id: 'ad-a',
          name: MARKER_A,
          phone: PHONE_A,
        },
      }),
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        lead: {
          id: 'ad-b',
          name: MARKER_B,
          phone: PHONE_B,
        },
      }),
    },
  })

  let firstBridgeMode = 'A'
  const firstRequests = installFakeIdentityBridge(
    first.window,
    () => {
      const phone =
        firstBridgeMode === 'A'
          ? PHONE_A
          : PHONE_B

      return {
        chatId: `${phone}@c.us`,
        chatIdType: 'c.us',
        phone,
        phoneJid: `${phone}@c.us`,
        phoneServer: 'c.us',
        isGroup: false,
      }
    },
    { delayMs: 100 },
  )

  const firstPanelText = () =>
    first.document
      .getElementById('yolen-companion-panel')
      ?.textContent || ''

  const resolvedA = await waitFor(() =>
    resolveLeadCalls(first.calls).at(-1),
  )
  assert.equal(resolvedA.payload.phone, PHONE_A)
  await waitFor(() =>
    firstPanelText().includes(MARKER_A),
  )

  const main =
    first.document.getElementById('main')
  const header = main.querySelector('header')
  const requestsAfterA = firstRequests.length

  firstBridgeMode = 'B'
  first.document
    .getElementById('row-a')
    .setAttribute('aria-selected', 'false')
  first.document
    .getElementById('row-b')
    .setAttribute('aria-selected', 'true')

  await sleep(100)

  assert.strictEqual(
    first.document.getElementById('main'),
    main,
  )
  assert.strictEqual(
    main.querySelector('header'),
    header,
  )
  assert.ok(
    !firstPanelText().includes(MARKER_A),
    'A deve desaparecer imediatamente quando só a linha selecionada muda',
  )
  assert.ok(
    !firstPanelText().includes(PHONE_A),
    'o telefone stale de A deve desaparecer na mesma boundary',
  )

  const resolvedB = await waitFor(() => {
    const list = resolveLeadCalls(first.calls)
    return list.length === 2
      ? list.at(-1)
      : null
  })

  assert.equal(resolvedB.payload.phone, PHONE_B)
  assert.deepEqual(
    resolveLeadCalls(first.calls).map(
      (call) => call.payload.phone,
    ),
    [PHONE_A, PHONE_B],
  )
  assert.ok(
    firstRequests.length > requestsAfterA,
    'B precisa receber uma consulta própria ao bridge',
  )
  await waitFor(() =>
    firstPanelText().includes(MARKER_B),
  )

  // Parte 2 — corrida determinística: o request de A deve estar
  // comprovadamente RECEBIDO enquanto row-a ainda está selecionada e
  // continuar em voo quando row-b assume. Nenhuma mutation extra é feita
  // depois da troca; o pending do single-flight deve abrir B sozinho.
  const race = loadContentScript({
    initialHtml,
  })

  const requestSnapshots = []

  race.window.addEventListener(
    'message',
    (event) => {
      if (
        event.data?.source !==
          CONTENT_SCRIPT_SOURCE ||
        event.data?.action !==
          'GET_ACTIVE_CHAT_IDENTITY'
      ) {
        return
      }

      requestSnapshots.push(
        race.document
          .querySelector(
            '#pane-side [aria-selected="true"]',
          )
          ?.getAttribute('id') || null,
      )
    },
  )

  let raceBridgeInvocationCount = 0

  const raceRequests =
    installFakeIdentityBridge(
      race.window,
      () => {
        raceBridgeInvocationCount += 1
        const phone =
          raceBridgeInvocationCount === 1
            ? PHONE_A
            : PHONE_B

        return {
          chatId: `${phone}@c.us`,
          chatIdType: 'c.us',
          phone,
          phoneJid: `${phone}@c.us`,
          phoneServer: 'c.us',
          isGroup: false,
        }
      },
      { delayMs: 500 },
    )

  const raceMain =
    race.document.getElementById('main')
  const raceHeader =
    raceMain.querySelector('header')

  await waitFor(() =>
    raceRequests.length === 1,
  )

  assert.deepEqual(
    requestSnapshots,
    ['row-a'],
    'o request stale deve ter sido efetivamente recebido enquanto A era a linha selecionada',
  )
  assert.equal(
    resolveLeadCalls(race.calls).length,
    0,
    'A precisa continuar em voo antes da troca',
  )

  race.document
    .getElementById('row-a')
    .setAttribute('aria-selected', 'false')
  race.document
    .getElementById('row-b')
    .setAttribute('aria-selected', 'true')

  assert.strictEqual(
    race.document.getElementById('main'),
    raceMain,
  )
  assert.strictEqual(
    raceMain.querySelector('header'),
    raceHeader,
  )

  await waitFor(() =>
    raceRequests.length === 2,
  )

  assert.deepEqual(
    requestSnapshots,
    ['row-a', 'row-b'],
    'depois que A stale termina, B deve receber automaticamente o próprio request',
  )
  assert.equal(
    resolveLeadCalls(race.calls).length,
    0,
    'a resposta atrasada de A nunca pode resolver um lead',
  )

  const raceResolvedB = await waitFor(() =>
    resolveLeadCalls(race.calls).at(-1),
  )

  assert.equal(
    raceResolvedB.payload.phone,
    PHONE_B,
  )
  assert.deepEqual(
    resolveLeadCalls(race.calls).map(
      (call) => call.payload.phone,
    ),
    [PHONE_B],
    'a corrida A→B só pode resolver o telefone de B',
  )

  await sleep(700)
  assert.equal(
    raceRequests.length,
    2,
    'a boundary deve produzir exatamente um retry para B, sem request storm',
  )
})

test('AE) mesma row preserva data-id forte através de gap temporário e separa A->B', async () => {
  const TITLE = 'Mesmo Nome AE'
  const PHONE_A = '5511900008891'
  const PHONE_B = '5511900008892'
  const MARKER_A = 'MARCADOR_LEAD_A_AE'
  const MARKER_B = 'MARCADOR_LEAD_B_AE'

  // O aria-selected fica num descendente. Assim:
  // - getSelectedChatStructuralRow() usa o ancestral role=row e enxerga data-id forte;
  // - getSelectedChatStableIdentity()/conversationKey ficam no mesmo title fraco.
  // Isso isola exatamente o activeChatEpoch: mesma row DOM, mesma
  // conversationKey, mesmo #main/header, strong ID A -> ausente -> B.
  const initialHtml = `<!doctype html><html><body><div id="app">
    <div id="pane-side">
      <div id="row-shared" role="row" data-id="${PHONE_A}@c.us">
        <div id="selected-shared" aria-selected="true">
          <span title="${TITLE}">${TITLE}</span>
        </div>
      </div>
    </div>
    <div id="main">
      <header><span title="${TITLE}">${TITLE}</span></header>
      <div id="conversation-body"></div>
    </div>
  </div></body></html>`

  const env = loadContentScript({
    initialHtml,
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({
        phone: PHONE_A,
        lead: {
          id: 'ae-a',
          name: MARKER_A,
          phone: PHONE_A,
        },
      }),
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        lead: {
          id: 'ae-b',
          name: MARKER_B,
          phone: PHONE_B,
        },
      }),
    },
  })

  let bridgeMode = 'A'
  const requests = installFakeIdentityBridge(
    env.window,
    () => {
      const phone =
        bridgeMode === 'A'
          ? PHONE_A
          : PHONE_B

      return {
        chatId: `${phone}@c.us`,
        chatIdType: 'c.us',
        phone,
        phoneJid: `${phone}@c.us`,
        phoneServer: 'c.us',
        isGroup: false,
      }
    },
    { delayMs: 100 },
  )

  const panelText = () =>
    env.document
      .getElementById('yolen-companion-panel')
      ?.textContent || ''

  const resolvedA = await waitFor(() =>
    resolveLeadCalls(env.calls).at(-1),
  )
  assert.equal(resolvedA.payload.phone, PHONE_A)
  await waitFor(() =>
    panelText().includes(MARKER_A),
  )

  const row =
    env.document.getElementById('row-shared')
  const main =
    env.document.getElementById('main')
  const header =
    main.querySelector('header')
  const requestsAfterA = requests.length

  // Fase gap: a mesma row perde temporariamente o strong data-id.
  // A mudança de data-id sozinha precisa acordar o observer real.
  // Isso NÃO é uma troca de conversa e não pode gerar reset/request storm.
  row.removeAttribute('data-id')

  await sleep(150)

  assert.strictEqual(
    env.document.getElementById('row-shared'),
    row,
  )
  assert.strictEqual(
    env.document.getElementById('main'),
    main,
  )
  assert.strictEqual(
    main.querySelector('header'),
    header,
  )
  assert.ok(
    panelText().includes(MARKER_A),
    'o gap temporário do strong ID na mesma row não pode invalidar A',
  )
  assert.equal(
    requests.length,
    requestsAfterA,
    'o gap temporário na mesma row não pode criar request storm',
  )

  // Agora a MESMA row recebe um strong ID diferente. Como o ID A foi
  // preservado através do gap, B deve ser comparado contra A e formar
  // boundary mesmo com conversationKey/#main/header inalterados.
  bridgeMode = 'B'
  row.setAttribute('data-id', `${PHONE_B}@c.us`)

  await sleep(150)

  assert.strictEqual(
    env.document.getElementById('row-shared'),
    row,
  )
  assert.strictEqual(
    env.document.getElementById('main'),
    main,
  )
  assert.strictEqual(
    main.querySelector('header'),
    header,
  )
  assert.ok(
    !panelText().includes(MARKER_A),
    'quando B aparece após o gap, o workspace stale de A deve sumir imediatamente',
  )
  assert.ok(
    !panelText().includes(PHONE_A),
    'o telefone stale de A não pode sobreviver à boundary A->gap->B',
  )

  const resolvedB = await waitFor(() => {
    const calls = resolveLeadCalls(env.calls)
    return calls.length === 2
      ? calls.at(-1)
      : null
  })

  assert.equal(resolvedB.payload.phone, PHONE_B)
  assert.deepEqual(
    resolveLeadCalls(env.calls).map(
      (call) => call.payload.phone,
    ),
    [PHONE_A, PHONE_B],
    'A->gap->B deve resolver B em ciclo próprio, sem reutilizar A',
  )
  await waitFor(() =>
    panelText().includes(MARKER_B),
  )

  assert.equal(
    requests.length,
    requestsAfterA + 1,
    'B deve receber exatamente uma consulta própria após a boundary',
  )

  await sleep(700)
  assert.equal(
    requests.length,
    requestsAfterA + 1,
    'A->gap->B não pode produzir request storm',
  )
})
