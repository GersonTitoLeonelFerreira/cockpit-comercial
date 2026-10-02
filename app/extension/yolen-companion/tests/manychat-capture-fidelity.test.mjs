// Rodada 6 (Parte C): fidelidade da captura do ManyChat. Fixtures de DOM
// sintéticas na estrutura já validada ao vivo (wrapper com data-title,
// _typeIn_/_typeOut_/_botMessage_, data-mid nas mensagens humanas, bot sem
// data-mid). As classes da citação e dos botões (_quote_, _button_) são as
// formas que o leitor reconhece; o texto também é desmontado sem elas, pela
// mensagem citada que está na tela. Nenhum dado de cliente.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
require('../src/platform-contract.js')
const surfaceApi = require('../src/manychat-surface.js')
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
const content = require('../src/manychat-message-content.js')
const profile = require('../src/manychat-message-profile.js')
require('../src/manychat-dom-reader.js')
require('../src/manychat-composer.js')
require('../src/manychat-phone-evidence.js')
require('../src/manychat-audio-source.js')
const adapterApi = require('../src/manychat-channel-adapter.js')

const URL_A = 'https://app.manychat.com/fb1/chat/111'
const KEY_X = `manychat:contact:v1:sha256:${'a'.repeat(64)}`
const CHANNEL_KEY = `manychat:channel:whatsapp:v1:sha256:${'c'.repeat(64)}`

const WELCOME = 'Olá! Bem-vindo à Empresa Exemplo. Hoje tem o Combo Duplo: traga um amigo e ganhe desconto.'
const MENU = 'Escolha uma opção abaixo para continuar o atendimento com a nossa equipe.'
const SELLER = 'Oi! Aqui é a Ana, da equipe. Tudo certo por aí?'

// Bolha do bot: sem data-mid, texto e botões dentro do wrapper.
function botBubble({ title = '2026-09-15T11:07:00', html }) {
  return `
    <div>
      <div class="_wrapper_x _typeOut_x _botMessage_x" data-title="${title}" data-title-at="1" data-title-offset-bottom="1">
        <div class="_bubble_x">${html}</div>
      </div>
    </div>`
}

function humanBubble({ mid, classes = '_typeIn_x', title = '2026-09-15T11:08:00', html }) {
  return `
    <div>
      <div class="_wrapper_x ${classes}" data-title="${title}" data-title-at="1" data-title-offset-bottom="1">
        <div data-mid="${mid}">${html}</div>
      </div>
    </div>`
}

function buildDom(bubbles) {
  return new JSDOM(
    `<!doctype html><html><body>
      <main>
        <div data-test-id="chat-messages-list">${bubbles.join('')}</div>
        <footer><textarea></textarea></footer>
      </main>
    </body></html>`,
    { url: URL_A },
  )
}

function createAdapter(dom) {
  return adapterApi.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    surfaceProvider: () => surfaceApi.parseManyChatConversationUrl(URL_A),
    readSafeIdentity: async () => ({
      ready: true,
      reason: null,
      safe: {
        platform: 'manychat',
        platform_identity: { source: 'subscriber_id', key: KEY_X },
        channel_identity: { channel: 'whatsapp', source: 'whatsapp_user_id', key: CHANNEL_KEY },
      },
    }),
    mutationDebounceMs: 1,
    scheduleInterval: () => 1,
    cancelInterval: () => {},
  })
}

function read(bubbles) {
  const adapter = createAdapter(buildDom(bubbles))
  const entries = adapter.readVisibleMessageEntries({ observedAt: '2026-09-15T12:00:00.000Z' })

  assert.ok(Array.isArray(entries), 'a leitura não pode falhar fechado')

  return entries.map((entry) => ({
    key: entry.messageId.split('::').pop(),
    direction: entry.message.direction,
    author: entry.message.authorKind,
    text: entry.message.text,
  }))
}

const welcome = botBubble({
  title: '2026-09-15T11:07:00',
  html: `<p>${WELCOME}</p>`,
})

const menu = botBubble({
  title: '2026-09-15T11:07:00',
  html: `
    <div class="_header_x">MAIS OPÇÕES</div>
    <p>${MENU}</p>
    <div class="_buttons_x">
      <div class="_button_x">Demonstração</div>
      <div class="_button_x">Agendar visita</div>
      <div class="_button_x">Ver planos</div>
    </div>`,
})

test('C.1/C.2: mensagem do bot (sem data-mid) entra como saída da empresa (automation), sem o rótulo, inclusive a primeira (boas-vindas com a oferta)', () => {
  const messages = read([welcome, menu])

  assert.equal(messages.length, 2)

  for (const message of messages) {
    assert.equal(message.direction, 'outgoing')
    assert.equal(message.author, 'automation')
    assert.match(message.key, /^manychat:auto:[0-9a-f]{8}$/)
    assert.doesNotMatch(message.text, /^Bot/)
  }

  assert.equal(messages[0].text, WELCOME)
  // Botões do bot ficam à parte do texto, como opções.
  assert.equal(messages[1].text, `MAIS OPÇÕES ${MENU}\n[opções: Demonstração · Agendar visita · Ver planos]`)
})

test('C.1: a chave do bot é estável entre leituras e dois textos iguais no mesmo minuto não colidem (a leitura não falha fechado)', () => {
  const first = read([welcome, menu]).map((message) => message.key)
  const again = read([welcome, menu]).map((message) => message.key)

  assert.deepEqual(first, again)

  const repeated = read([welcome, welcome])

  assert.equal(repeated.length, 2)
  assert.notEqual(repeated[0].key, repeated[1].key)
  assert.equal(repeated[1].key, `${repeated[0].key}:2`)

  // Cortado ou expandido: mesma chave (o começo do texto não muda).
  const cut = botBubble({ html: `<p class="_truncated_x">${WELCOME.slice(0, 90)}…</p><button>Ver mais</button>` })

  assert.equal(read([cut])[0].key, first[0])
})

test('C.3: botão tocado pelo cliente vira escolha separada ("[escolheu no menu] X"), sem a citação do bot colada', () => {
  // Com a estrutura da citação (classe _quote_).
  const structured = humanBubble({
    mid: 'c-1',
    html: `
      <div class="_quote_x"><span class="_author_x">Bot</span><span>MAIS OPÇÕES ${MENU.slice(0, 40)}…</span></div>
      <span>Demonstração</span>`,
  })

  // Sem estrutura nenhuma: o textContent da bolha é "Bot" + texto do bot +
  // escolha (como chegava ao ledger).
  const glued = humanBubble({
    mid: 'c-2',
    title: '2026-09-15T11:09:00',
    html: `<span>Bot</span><span>MAIS OPÇÕES</span><span>${MENU.slice(0, 50)}…</span><span>Agendar visita</span>`,
  })

  const messages = read([menu, structured, glued])

  assert.deepEqual(messages.slice(1).map((message) => [message.key, message.author, message.text]), [
    ['manychat:c-1', 'customer', '[escolheu no menu] Demonstração'],
    ['manychat:c-2', 'customer', '[escolheu no menu] Agendar visita'],
  ])
})

test('C.3: bot citado já fora da tela — "Bot" + texto cortado com "…" + escolha curta', () => {
  const glued = humanBubble({
    mid: 'c-3',
    html: `<span>Bot</span><span>MAIS OPÇÕES Escolha uma opção abaixo para conti…</span><span>Demonstração</span>`,
  })

  assert.equal(read([glued])[0].text, '[escolheu no menu] Demonstração')
})

test('C.4: resposta com citação de mensagem do vendedor guarda só a resposta (com e sem estrutura)', () => {
  const seller = humanBubble({ mid: 's-1', classes: '_typeOut_x', title: '2026-09-15T11:10:00', html: `<span>${SELLER}</span>` })

  const structured = humanBubble({
    mid: 'c-4',
    title: '2026-09-15T11:11:00',
    html: `<blockquote><span class="_name_x">Atendimento Exemplo</span><span>${SELLER}</span></blockquote><span>Tudo bem e você?</span>`,
  })

  const glued = humanBubble({
    mid: 'c-5',
    title: '2026-09-15T11:12:00',
    html: `<span>Atendimento Exemplo</span><span>${SELLER}</span><span>Tudo ótimo, obrigado!</span>`,
  })

  const messages = read([seller, structured, glued])

  assert.deepEqual(messages.map((message) => [message.author, message.text]), [
    ['human_agent', SELLER],
    // Resposta ao vendedor não é escolha de menu.
    ['customer', 'Tudo bem e você?'],
    ['customer', 'Tudo ótimo, obrigado!'],
  ])
})

test('C.5: texto do bot cortado pelo ManyChat — inteiro quando está no DOM, marcado quando não está', () => {
  const full = `${MENU} E também temos atendimento presencial todos os dias da semana.`

  const withFull = botBubble({
    html: `<p class="_truncated_x" title="${full}">${full.slice(0, 60)}…</p><button>Ver mais</button>`,
  })

  const withoutFull = botBubble({
    title: '2026-09-15T11:20:00',
    html: `<p class="_truncated_x">${full.slice(0, 60)}…</p><button>Ver mais</button>`,
  })

  const messages = read([withFull, withoutFull])

  assert.equal(messages[0].text, full)
  assert.equal(messages[1].text, `${full.slice(0, 60)}… [texto cortado no ManyChat]`)
  // "Ver mais" nunca vira opção.
  assert.doesNotMatch(messages.map((message) => message.text).join('\n'), /opções/)

  // Um bot que só termina com reticências (sem corte do layout) fica como é.
  const ellipsis = botBubble({ title: '2026-09-15T11:21:00', html: '<p>Um momento, estou verificando...</p>' })

  assert.equal(read([ellipsis])[0].text, 'Um momento, estou verificando...')
})

test('texto do bot sem espaço no HTML: o cabeçalho não gruda no corpo', () => {
  const compact = botBubble({ html: '<div class="_header_x">MAIS OPÇÕES</div><p>Escolha uma opção.</p><div class="_button_x">Ver planos</div>' })

  assert.equal(read([compact])[0].text, 'MAIS OPÇÕES Escolha uma opção.\n[opções: Ver planos]')
})

test('sem citação nem botão, o texto é exatamente o de antes (nenhuma versão nova à toa)', () => {
  const plain = humanBubble({ mid: 'p-1', html: '<span>Quero saber o preço</span> <b>do plano</b>' })
  const node = new JSDOM(`<!doctype html><div id="r">${plain}</div>`).window.document.querySelector('[data-title]')

  assert.equal(content.extractManyChatMessageContent(node).text_content, 'Quero saber o preço do plano')
  assert.equal(read([plain])[0].text, 'Quero saber o preço do plano')
})

test('sem falso positivo: mensagem que começa com o texto de outra do mesmo autor, ou com "Botão", fica inteira', () => {
  const first = humanBubble({ mid: 'f-1', html: '<span>Quero saber o preço</span>' })
  const second = humanBubble({ mid: 'f-2', title: '2026-09-15T11:09:00', html: '<span>Quero saber o preço do plano anual</span>' })
  const button = humanBubble({ mid: 'f-3', title: '2026-09-15T11:10:00', html: '<span>Botão não funciona… ok</span>' })

  assert.deepEqual(read([first, second, button]).map((message) => message.text), [
    'Quero saber o preço',
    'Quero saber o preço do plano anual',
    'Botão não funciona… ok',
  ])
})

test('vendedor citando o cliente também guarda só a resposta (e nunca vira escolha de menu)', () => {
  const customer = humanBubble({ mid: 'q-1', html: '<span>Vocês abrem no domingo de manhã?</span>' })
  const reply = humanBubble({
    mid: 'q-2',
    classes: '_typeOut_x',
    title: '2026-09-15T11:15:00',
    html: '<span>Cliente</span><span>Vocês abrem no domingo de manhã?</span><span>Sim, das 8h às 12h.</span>',
  })

  assert.deepEqual(read([customer, reply]).map((message) => message.text), [
    'Vocês abrem no domingo de manhã?',
    'Sim, das 8h às 12h.',
  ])
})

test('reconciliação é pura: sem citação reconhecível, devolve as mesmas mensagens', () => {
  const messages = [
    Object.freeze({ message_key: 'manychat:a', author_kind: 'customer', content_type: 'text', text_content: 'Oi' }),
    Object.freeze({ message_key: 'manychat:b', author_kind: 'human_agent', content_type: 'text', text_content: 'Olá!' }),
  ]

  const result = profile.reconcileManyChatMessages(messages)

  assert.equal(result[0], messages[0])
  assert.equal(result[1], messages[1])
})
