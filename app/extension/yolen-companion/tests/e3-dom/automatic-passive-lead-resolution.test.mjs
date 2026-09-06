// UX8 — Automatic Passive Lead Resolution: prova via DOM real (jsdom) de
// que content-script.js (não modificado por este teste) identifica o lead
// da conversa ATUAL automaticamente, sem qualquer ação do vendedor, lendo
// só dados já presentes no DOM (JIDs em data-id, da linha selecionada e de
// mensagens em #main) — nunca clicando, nunca abrindo o painel de
// contato, nunca navegando.
//
// Complementa (não duplica) tests/automatic-passive-lead-resolution-structure.test.mjs
// (prova por texto-fonte da ordem/estrutura) com prova de comportamento
// observável: chamadas reais a RESOLVE_LEAD com o telefone certo, ou a
// ausência delas quando a resolução deve falhar fechado.

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

// Constrói uma página mínima do WhatsApp Web com sidebar (linha
// selecionada, opcionalmente com data-id de JID) e #main (header,
// opcionalmente com aria-label de grupo, e linhas de mensagem com
// data-id). headerTitle nunca é um telefone (isso já é coberto pelo
// caminho existente/pré-UX8) — o objetivo aqui é forçar o resolvedor a
// cair na nova etapa passiva de JID.
function buildPageHtml({
  headerTitle = 'Cliente Teste',
  sidebarDataId = null,
  headerGroupAriaLabel = null,
  mainDataIds = [],
} = {}) {
  const sidebar = sidebarDataId
    ? `<div id="pane-side">
        <div aria-selected="true" data-id="${sidebarDataId}">
          <span title="${headerTitle}">${headerTitle}</span>
        </div>
      </div>`
    : ''

  const groupMarker = headerGroupAriaLabel
    ? `<div aria-label="${headerGroupAriaLabel}"></div>`
    : ''

  const mainRows = mainDataIds
    .map((id) => `<div data-id="${id}"></div>`)
    .join('')

  return `<!doctype html><html><body>
    <div id="app">
      ${sidebar}
      <div id="main">
        <header>
          ${groupMarker}
          <span title="${headerTitle}">${headerTitle}</span>
        </header>
        <div id="conversation-body">${mainRows}</div>
      </div>
    </div>
  </body></html>`
}

test('A) JID confiável da linha selecionada resolve o lead automaticamente, sem painel de contato aberto e sem clique algum', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Passivo A',
      sidebarDataId: '5511911112222@c.us',
    }),
  })

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511911112222')
})

test('B) sem JID na linha selecionada, JID único dentro de #main resolve o lead', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Passivo B',
      mainDataIds: ['true_5511922223333@c.us_ABC123'],
    }),
  })

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511922223333')
})

test('P) dois JIDs distintos em #main sem linha selecionada confiável são ambíguos: nunca resolve, nunca escolhe um', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Ambiguo',
      mainDataIds: [
        'true_5511933334444@c.us_A',
        'false_5511944445555@c.us_B',
      ],
    }),
  })

  // Dá tempo de sobra para qualquer ciclo de resolução (debounce +
  // agendamento de 300ms) acontecer, e confirma que NADA foi resolvido.
  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('Q) JID confiável da linha selecionada prevalece mesmo com #main ambíguo', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Selecionado Vence',
      sidebarDataId: '5511955556666@c.us',
      mainDataIds: [
        'true_5511911110000@c.us_A',
        'false_5511922220000@c.us_B',
      ],
    }),
  })

  const resolved = await waitFor(() => resolveLeadCalls(calls).at(-1))

  assert.equal(resolved.payload.phone, '5511955556666')
})

test('H) grupo nunca é resolvido como telefone individual, mesmo com JIDs de participantes em #main', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Grupo da Equipe',
      headerGroupAriaLabel: 'Conversa em grupo',
      mainDataIds: ['true_5511966667777@c.us_A'],
    }),
  })

  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('I) auto-conversa (Mensagens para mim) nunca resolve lead, mesmo com JID presente', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Mensagens para mim',
      sidebarDataId: '5511977778888@c.us',
    }),
  })

  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('J) sem nenhuma fonte passiva válida, a conversa fica sem telefone e nenhuma chamada de resolução é feita', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Sem Fonte',
    }),
  })

  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('R) @lid nunca é tratado como telefone (identificador opaco de privacidade, não é o número real)', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente LID',
      sidebarDataId: '123456789012345@lid',
      mainDataIds: ['true_123456789012345@lid_A'],
    }),
  })

  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('S) @g.us nunca é tratado como telefone individual', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente GUS',
      sidebarDataId: '120363012345678901@g.us',
    }),
  })

  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('T) @newsletter/@broadcast nunca são tratados como telefone', async () => {
  const { calls } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'Cliente Broadcast',
      sidebarDataId: '5511900001111@newsletter',
      mainDataIds: ['true_5511900002222@broadcast_A'],
    }),
  })

  await sleep(1500)

  assert.equal(resolveLeadCalls(calls).length, 0)
})

test('M/N/O) dois contatos homônimos (mesmo título, conversationKey/JID diferentes) nunca colidem no telefone', async () => {
  const { calls: callsA } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'João Silva',
      sidebarDataId: '5511911111111@c.us',
    }),
  })

  const resolvedA = await waitFor(() => resolveLeadCalls(callsA).at(-1))
  assert.equal(resolvedA.payload.phone, '5511911111111')

  const { calls: callsB } = loadContentScript({
    initialHtml: buildPageHtml({
      headerTitle: 'João Silva',
      sidebarDataId: '5522222222222@c.us',
    }),
  })

  const resolvedB = await waitFor(() => resolveLeadCalls(callsB).at(-1))
  assert.equal(resolvedB.payload.phone, '5522222222222')

  // Sessões (documentos jsdom) independentes de propósito — a garantia real
  // de não-colisão pela MESMA aba, quando a conversa muda de A para B, já
  // é coberta por content-script-dom-conversation-switch.test.mjs; aqui a
  // prova adicional é que a IDENTIDADE usada (conversationKey via data-id)
  // é o JID, não o nome exibido — dois nomes iguais nunca produzem o
  // mesmo telefone cacheado.
  assert.notEqual(resolvedA.payload.phone, resolvedB.payload.phone)
})
