// Rodada 11 (HML), item A e B1 (WhatsApp). DOM sintético do WhatsApp Web,
// sem nenhum dado real.
//
// Causa raiz do A1: a nota de voz (e a foto) do WhatsApp vem numa bolha sem
// o nó de texto com data e hora ([data-pre-plain-text]). A leitura dessas
// bolhas só aceitava o cartão de arquivo com nome; o áudio era descartado e
// nunca chegava ao ledger.
//
// - A1/A4: áudio do cliente, do vendedor, encaminhado e voz longa entram
//   como áudio, com a duração, na posição certa da conversa.
// - A2: o áudio que já estava na conversa entra na próxima captura, pela
//   data e hora dele (entre as mensagens vizinhas).
// - A3: a transcrição manual (cycle_events) volta pela chave do alvo, que é
//   o mesmo data-id da mensagem: entra sem chamar o serviço de novo.
// - B1: foto e documento com tipo, nome, tamanho e páginas; figurinha e
//   emoji ficam de fora.
// - Sem a leitura completa, a captura é a de hoje.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const captureBatch = require('../src/capture-batch.js')
const mutations = require('../src/message-mutations.js')

function textMessage(id, { time, date = '29/09/2026', who = 'Cliente', out = false, text }) {
  return `
    <div data-id="${id}">
      <div class="${out ? 'message-out' : 'message-in'}">
        <div data-pre-plain-text="[${time}, ${date}] ${who}: ">
          <span class="selectable-text copyable-text"><span>${text}</span></span>
        </div>
      </div>
    </div>`
}

function voiceMessage(id, { out = false, duration = '0:42', time = '11:21', meta = true, forwarded = false, icon = 'ptt' } = {}) {
  return `
    <div data-id="${id}">
      <div class="${out ? 'message-out' : 'message-in'}">
        ${forwarded ? '<span data-testid="forwarded">Encaminhada</span>' : ''}
        <button aria-label="Reproduzir mensagem de voz"><span data-icon="${icon}"></span></button>
        <div><span>${duration}</span></div>
        ${meta ? `<div data-testid="msg-meta"><span>${time}</span></div>` : `<div><span>${time}</span></div>`}
      </div>
    </div>`
}

function adapterFor(body) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="main">${body}</div></body></html>`,
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
    vm.runInContext(
      readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'),
      sandbox,
    )
  }

  return sandbox.YolenCompanionWhatsAppAdapter.create({})
}

// O adaptador roda em outro contexto (vm): os objetos voltam como dados
// simples para a comparação.
function read(adapter, includeMediaBubbles = true) {
  return plain(adapter.readVisibleMessageEntries({
    observedAt: '2026-09-29T14:30:00.000Z',
    getPreviousMessage: () => null,
    includeMediaBubbles,
  }))
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

const CONVERSATION = [
  textMessage('false_sintetico_A1', { time: '11:20', text: 'Oi, tudo bem?' }),
  voiceMessage('false_sintetico_V1', { duration: '0:42', time: '11:21' }),
  voiceMessage('false_sintetico_V2', { duration: '1:05', time: '11:22' }),
  voiceMessage('false_sintetico_V3', { duration: '0:18', time: '11:23' }),
  textMessage('true_sintetico_B1', { time: '11:30', who: 'Vendedor', out: true, text: 'Já te respondo.' }),
].join('')

test('A1/A2: os 3 áudios do cliente entram como áudio, com a duração, entre as mensagens vizinhas', () => {
  const entries = read(adapterFor(CONVERSATION))

  assert.deepEqual(
    entries.map((entry) => entry.messageId),
    ['false_sintetico_A1', 'false_sintetico_V1', 'false_sintetico_V2', 'false_sintetico_V3', 'true_sintetico_B1'],
  )

  const voices = entries.slice(1, 4).map((entry) => entry.message)

  assert.deepEqual(voices.map((message) => message.hasAudio), [true, true, true])
  assert.deepEqual(voices.map((message) => message.text), ['[duração 0:42]', '[duração 1:05]', '[duração 0:18]'])
  assert.deepEqual(voices.map((message) => message.timestampLabel), ['29/09/2026 11:21', '29/09/2026 11:22', '29/09/2026 11:23'])
  assert.deepEqual(voices.map((message) => message.direction), ['incoming', 'incoming', 'incoming'])

  // A ordem da conversa (domOrder) vai junto para o mesmo minuto.
  assert.deepEqual(entries.map((entry) => entry.domOrder), [0, 1, 2, 3, 4])
})

test('A1: sem a leitura completa, a captura é a de hoje (o áudio sem texto fica de fora)', () => {
  const entries = read(adapterFor(CONVERSATION), false)

  assert.deepEqual(
    entries.map((entry) => entry.messageId),
    ['false_sintetico_A1', 'true_sintetico_B1'],
  )
})

test('A4: áudio do vendedor, áudio encaminhado e mensagem de voz longa', () => {
  const entries = read(adapterFor([
    textMessage('false_sintetico_A1', { time: '09:00', text: 'Bom dia' }),
    voiceMessage('true_sintetico_V1', { out: true, duration: '0:31', time: '09:01' }),
    voiceMessage('false_sintetico_V2', { forwarded: true, icon: 'audio-play', duration: '2:10', time: '09:02' }),
    // Voz longa e sem o rodapé: o último horário é a hora da mensagem.
    voiceMessage('false_sintetico_V3', { duration: '12:30', time: '09:05', meta: false }),
    textMessage('false_sintetico_A2', { time: '09:10', text: 'Ouviu?' }),
  ].join('')))

  const byId = Object.fromEntries(entries.map((entry) => [entry.messageId, entry.message]))

  assert.equal(byId.true_sintetico_V1.direction, 'outgoing')
  assert.equal(byId.true_sintetico_V1.text, '[duração 0:31]')
  assert.equal(byId.false_sintetico_V2.hasAudio, true)
  assert.equal(byId.false_sintetico_V2.text, '[duração 2:10]')
  assert.equal(byId.false_sintetico_V3.text, '[duração 12:30]')
  assert.equal(byId.false_sintetico_V3.timestampLabel, '29/09/2026 09:05')
})

test('A3: a transcrição manual já salva volta pela chave do alvo (o data-id) e entra sem chamar o serviço', () => {
  const entries = read(adapterFor(CONVERSATION))
  const voice = entries.find((entry) => entry.messageId === 'false_sintetico_V1').message

  // Formato do estado restaurado de cycle_events (targetKey = data-id).
  const transcriptionsByKey = {
    'audio-0': {
      audioIndex: 0,
      targetKey: 'false_sintetico_V1',
      capturedBlobId: null,
      text: 'Quero fechar o plano anual.',
      occurredAt: '2026-09-29T14:25:00.000Z',
    },
  }

  const [message] =
    captureBatch.buildCaptureMessages({
      activeMessages: [voice],
      transcriptionsByKey,
    })

  assert.equal(message.message_key, 'false_sintetico_V1')
  assert.equal(message.content_type, 'audio')
  assert.equal(message.text_content, '[duração 0:42]')
  assert.equal(message.audio_transcription, 'Quero fechar o plano anual.')

  // O core usa o mesmo data-id como alvo de transcrição (chave do botão).
  const core = readFileSync(new URL('../src/companion-core.js', import.meta.url), 'utf8')

  assert.match(core, /visibleTarget\.key ===\s*transcription\.audio_target_key/)
  assert.match(core, /includeMediaBubbles:\s*isFullReadingPanelMode\(\)/)
})

test('B1: foto e documento com tipo, nome, tamanho e páginas; figurinha e emoji ficam de fora', () => {
  const entries = read(adapterFor([
    textMessage('false_sintetico_A1', { time: '16:50', date: '01/10/2026', text: 'Segue' }),
    `<div data-id="false_sintetico_IMG">
       <div class="message-in">
         <img src="blob:https://web.whatsapp.com/foto-sintetica" alt="">
         <div data-testid="msg-meta"><span>16:58</span></div>
       </div>
     </div>`,
    `<div data-id="false_sintetico_DOC">
       <div class="message-in">
         <div data-testid="document-thumb" title="Proposta.pdf">
           <span>Proposta.pdf</span><span>3 páginas</span><span>PDF</span><span>1.2 MB</span>
         </div>
         <span data-icon="document-pdf"></span>
         <div data-testid="msg-meta"><span>16:59</span></div>
       </div>
     </div>`,
    `<div data-id="false_sintetico_STK">
       <div class="message-in">
         <div data-testid="sticker"><img src="blob:https://web.whatsapp.com/figurinha" alt="Figurinha"></div>
         <div data-testid="msg-meta"><span>17:00</span></div>
       </div>
     </div>`,
    textMessage('false_sintetico_A2', { time: '17:01', date: '01/10/2026', text: 'Viu? <img class="emoji" data-plain-text="🙂" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="🙂">' }),
  ].join('')))

  const byId = Object.fromEntries(entries.map((entry) => [entry.messageId, entry.message]))

  assert.equal(byId.false_sintetico_IMG.text, '[Arquivo | tipo: imagem]')
  assert.equal(byId.false_sintetico_IMG.hasAudio, false)
  assert.equal(byId.false_sintetico_IMG.timestampLabel, '01/10/2026 16:58')
  assert.equal(byId.false_sintetico_DOC.text, '[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB | páginas: 3]')
  assert.equal(byId.false_sintetico_DOC.timestampLabel, '01/10/2026 16:59')
  assert.equal(byId.false_sintetico_STK, undefined, 'figurinha fica de fora')
  assert.doesNotMatch(byId.false_sintetico_A2.text, /\[Arquivo/, 'emoji não é arquivo')

  // Sem a leitura completa: o cartão de arquivo continua como hoje.
  const today = read(adapterFor([
    textMessage('false_sintetico_A1', { time: '16:50', date: '01/10/2026', text: 'Segue' }),
    `<div data-id="false_sintetico_DOC">
       <div class="message-in">
         <div data-testid="document-thumb" title="Proposta.pdf"><span>Proposta.pdf</span><span>PDF</span><span>1.2 MB</span></div>
         <span data-icon="document-pdf"></span>
         <div data-testid="msg-meta"><span>16:59</span></div>
       </div>
     </div>`,
  ].join('')), false)

  assert.equal(today.find((entry) => entry.messageId === 'false_sintetico_DOC').message.text, '[Arquivo: Proposta.pdf]')
})

test('B1: a marca de arquivo é a mesma nos dois canais', () => {
  assert.equal(
    mutations.buildAttachmentMarkerText({ caption: 'Segue a proposta', name: 'Proposta.pdf', sizeLabel: '1,2 MB', pages: 3 }),
    'Segue a proposta\n[Arquivo: Proposta.pdf | tipo: pdf | tamanho: 1,2 MB | páginas: 3]',
  )
  assert.equal(mutations.buildAttachmentMarkerText({ kind: 'imagem' }), '[Arquivo | tipo: imagem]')
  assert.equal(mutations.buildAttachmentMarkerText({ name: 'planilha.xlsx' }), '[Arquivo: planilha.xlsx | tipo: documento]')
  assert.equal(mutations.buildAudioDurationText(42), '[duração 0:42]')
  assert.equal(mutations.buildAudioDurationText(0), '')
})
