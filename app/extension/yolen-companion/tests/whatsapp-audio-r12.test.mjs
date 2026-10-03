// Rodada 12 (HML), item B1: ouvir um áudio não grava o contador do player
// como mensagem nova. DOM sintético do WhatsApp Web, nenhum dado real.
//
// - A duração é lida uma vez, com a bolha parada, e congelada por mensagem.
// - Tocando (botão de pausa), pausado no meio (barra de progresso fora do
//   começo) ou sem rótulo: o texto continua o mesmo — nunca o tempo corrido,
//   nunca vazio.
// - Extensão recarregada com o áudio tocando: fica o texto que a mensagem
//   já tinha.
// - ManyChat: o áudio não leva rótulo de tempo no texto (não tem o
//   problema).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const captureBatch = require('../src/capture-batch.js')

function voice(id, { label = '0:42', icon = 'ptt', slider = null, time = '11:21' } = {}) {
  return `
    <div data-id="${id}">
      <div class="message-in">
        <button aria-label="${icon.includes('pause') ? 'Pausar' : 'Reproduzir mensagem de voz'}"><span data-icon="${icon}"></span></button>
        ${slider === null ? '' : `<div role="slider" aria-valuenow="${slider}"></div>`}
        <div class="duracao">${label === null ? '' : `<span>${label}</span>`}</div>
        <div data-testid="msg-meta"><span>${time}</span></div>
      </div>
    </div>`
}

function text(id, { time, body }) {
  return `
    <div data-id="${id}">
      <div class="message-in">
        <div data-pre-plain-text="[${time}, 29/09/2026] Cliente: ">
          <span class="selectable-text copyable-text"><span>${body}</span></span>
        </div>
      </div>
    </div>`
}

function page(audio) {
  return `${text('false_sintetico_T1', { time: '11:20', body: 'Oi' })}${audio}${text('false_sintetico_T2', { time: '11:30', body: 'Ouviu?' })}`
}

function createPage(audioHtml) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="main">${page(audioHtml)}</div></body></html>`,
    { url: 'https://web.whatsapp.com/' },
  )

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    console,
  }

  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  for (const file of ['message-mutations.js', 'whatsapp-adapter.js']) {
    vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), sandbox)
  }

  return {
    adapter: sandbox.YolenCompanionWhatsAppAdapter.create({}),
    setAudio(html) {
      dom.window.document.getElementById('main').innerHTML = page(html)
    },
  }
}

const VOICE_ID = 'false_sintetico_V1'

function readVoice(adapter, previous = null) {
  const entries = adapter.readVisibleMessageEntries({
    observedAt: '2026-09-29T14:32:00.000Z',
    getPreviousMessage: (id) => (id === VOICE_ID ? previous : null),
    includeMediaBubbles: true,
  })

  const entry = entries.find((item) => item.messageId === VOICE_ID)

  return entry ? JSON.parse(JSON.stringify(entry.message)) : null
}

test('B1: tocando, pausado no meio, em 0:00 ou sem rótulo — o texto do áudio continua a duração congelada', () => {
  const { adapter, setAudio } = createPage(voice(VOICE_ID, { label: '0:42' }))

  const atRest = readVoice(adapter)

  assert.equal(atRest.text, '[duração 0:42]')
  assert.equal(atRest.hasAudio, true)

  const states = [
    voice(VOICE_ID, { label: '0:00', icon: 'audio-pause' }),
    voice(VOICE_ID, { label: '0:07', icon: 'audio-pause' }),
    voice(VOICE_ID, { label: '0:15', icon: 'ptt-pause' }),
    // Pausado no meio: ícone de tocar, barra fora do começo.
    voice(VOICE_ID, { label: '0:21', icon: 'audio-play', slider: 21 }),
    // Rótulo some.
    voice(VOICE_ID, { label: null, icon: 'audio-play' }),
    // Acabou de tocar: o rótulo volta (até com outro valor).
    voice(VOICE_ID, { label: '0:41', icon: 'audio-play', slider: 0 }),
  ]

  for (const html of states) {
    setAudio(html)

    const message = readVoice(adapter, atRest)

    assert.equal(message.text, '[duração 0:42]', html)
    assert.equal(message.timestampLabel, atRest.timestampLabel)
  }
})

test('B1: o áudio não ganha versão nova ao ser ouvido — a captura manda o mesmo texto (sem mutação)', () => {
  const { adapter, setAudio } = createPage(voice(VOICE_ID, { label: '1:05' }))
  const first = readVoice(adapter)

  setAudio(voice(VOICE_ID, { label: '0:03', icon: 'audio-pause' }))
  const playing = readVoice(adapter, first)

  const [before] = captureBatch.buildCaptureMessages({ activeMessages: [first] })
  const [during] = captureBatch.buildCaptureMessages({ activeMessages: [playing] })

  assert.equal(before.content_type, 'audio')
  assert.equal(during.text_content, before.text_content)
  assert.equal(during.occurred_at, before.occurred_at)
})

test('B1: extensão recarregada com o áudio tocando — fica o texto que a mensagem já tinha; sem nada salvo, não inventa', () => {
  const { adapter } = createPage(voice(VOICE_ID, { label: '0:09', icon: 'audio-pause' }))

  assert.equal(readVoice(adapter, { text: '[duração 0:42]' }).text, '[duração 0:42]')

  const fresh = createPage(voice(VOICE_ID, { label: '0:09', icon: 'audio-pause' }))

  assert.equal(readVoice(fresh.adapter, null).text, '')
})

test('B1: a duração congelada vale para todos os áudios, cada um com a sua', () => {
  const { adapter, setAudio } = createPage(`${voice(VOICE_ID, { label: '0:42' })}${voice('false_sintetico_V2', { label: '2:10', time: '11:22' })}`)

  const read = () => {
    const entries = adapter.readVisibleMessageEntries({
      observedAt: '2026-09-29T14:33:00.000Z',
      getPreviousMessage: () => null,
      includeMediaBubbles: true,
    })

    return Object.fromEntries(entries.map((entry) => [entry.messageId, entry.message.text]))
  }

  assert.deepEqual(
    { a: read()[VOICE_ID], b: read().false_sintetico_V2 },
    { a: '[duração 0:42]', b: '[duração 2:10]' },
  )

  setAudio(`${voice(VOICE_ID, { label: '0:42' })}${voice('false_sintetico_V2', { label: '0:30', icon: 'audio-pause', time: '11:22' })}`)

  assert.equal(read().false_sintetico_V2, '[duração 2:10]')
})

test('B1: ManyChat — o áudio não leva o tempo do player no texto (não tem o problema)', () => {
  const source = readFileSync(new URL('../src/manychat-message-content.js', import.meta.url), 'utf8')
  const audioBranch = source.slice(source.indexOf('if (media.audio === 1) {'), source.indexOf('if (media.audio === 1) {') + 400)

  assert.match(audioBranch, /content_type: 'audio',\s*text_content: null,/)
})
