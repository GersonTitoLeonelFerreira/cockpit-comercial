// Rodada 12 (HML), item A (extensão): "Incluir na leitura" de uma foto do
// WhatsApp manda a foto inteira, nunca a prévia. DOM sintético.
//
// - A1: só blob: da página; entre vários, o de maior resolução; a prévia
//   data: nunca é enviada.
// - A2: só a prévia — com o botão de baixar da própria bolha, clica nele
//   (nunca na foto) e espera a foto virar blob:; sem o botão, ou se o clique
//   abrir o visualizador, ou se não carregar em 10 s, não busca nada.
// - A3: antes de enviar, foto com o lado maior abaixo de 300 px é a prévia
//   (mensagem ao vendedor, sem chamar o servidor).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const analysis = require('../src/companion-analysis-controller.js')

const PREVIEW = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'
const KEY = 'false_sintetico_FOTO1'

function photoBubble(inner) {
  return `
    <div data-id="${KEY}">
      <div class="message-in">
        ${inner}
        <div data-testid="msg-meta"><span>16:58</span></div>
      </div>
    </div>`
}

function createPage(inner, { fakeClock = false } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="main">${photoBubble(inner)}</div></body></html>`,
    { url: 'https://web.whatsapp.com/' },
  )

  const fetched = []

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    console,
    fetch: async (url) => {
      fetched.push(url)
      return { ok: true, blob: async () => ({ size: 250000, type: 'image/jpeg', url }) }
    },
  }

  if (fakeClock) {
    // Relógio que anda 1 s a cada consulta: os 10 s passam sem esperar.
    let now = Date.parse('2026-10-02T22:00:00.000Z')
    sandbox.Date = class extends Date {
      static now() {
        now += 1000
        return now
      }
    }
    dom.window.setTimeout = (callback) => { setImmediate(callback); return 1 }
  }

  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  for (const file of ['message-mutations.js', 'whatsapp-adapter.js']) {
    vm.runInContext(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), sandbox)
  }

  const adapter = sandbox.YolenCompanionWhatsAppAdapter.create({})

  return {
    adapter,
    fetched,
    document: dom.window.document,
    source: () => adapter.getAttachmentSource({ messageKey: KEY, kind: 'imagem' }).then((value) => JSON.parse(JSON.stringify(value))),
  }
}

test('A1: com a prévia e duas fotos blob:, vai a de maior resolução; a prévia nunca', async () => {
  const page = createPage(`
    <img src="${PREVIEW}" width="1600" height="1200" alt="">
    <img src="blob:https://web.whatsapp.com/foto-pequena" width="320" height="240" alt="">
    <img src="blob:https://web.whatsapp.com/foto-grande" width="1280" height="960" alt="">
  `)

  const result = await page.source()

  assert.equal(result.ok, true)
  assert.deepEqual(page.fetched, ['blob:https://web.whatsapp.com/foto-grande'])
})

test('A2: só a prévia e nenhum botão de baixar — não busca nada e avisa que a foto não carregou', async () => {
  const page = createPage(`<img src="${PREVIEW}" alt="">`)
  const result = await page.source()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'photo_not_loaded')
  assert.deepEqual(page.fetched, [])
  assert.equal(
    analysis.attachmentSourceMessage(result.reason),
    'A foto ainda não carregou no WhatsApp. Abra a foto na conversa e clique em Incluir de novo.',
  )
})

test('A2: só a prévia com o botão de baixar da bolha — clica no botão (não na foto) e espera a foto virar blob:', async () => {
  const page = createPage(`
    <div role="button" class="foto"><img src="${PREVIEW}" alt=""></div>
    <button class="baixar"><span data-icon="media-download"></span></button>
  `)

  const clicks = []

  page.document.querySelector('.foto').addEventListener('click', () => clicks.push('foto'))
  page.document.querySelector('.baixar').addEventListener('click', () => {
    clicks.push('baixar')
    // O WhatsApp baixa a foto para a conversa e troca a prévia pelo blob:.
    setTimeout(() => {
      page.document.querySelector('.foto img').setAttribute('src', 'blob:https://web.whatsapp.com/foto-baixada')
    }, 30)
  })

  const result = await page.source()

  assert.equal(result.ok, true)
  assert.deepEqual(clicks, ['baixar'])
  assert.deepEqual(page.fetched, ['blob:https://web.whatsapp.com/foto-baixada'])
})

test('A2: o clique abriu o visualizador — desiste sem buscar nada', async () => {
  const page = createPage(`
    <img src="${PREVIEW}" alt="">
    <button class="baixar"><span data-icon="media-download"></span></button>
  `)

  page.document.querySelector('.baixar').addEventListener('click', () => {
    const viewer = page.document.createElement('div')
    viewer.setAttribute('data-testid', 'media-viewer')
    page.document.body.appendChild(viewer)
  })

  const result = await page.source()

  assert.equal(result.reason, 'photo_not_loaded')
  assert.deepEqual(page.fetched, [])
})

test('A2: a foto não carregou em 10 s — não busca nada', async () => {
  const page = createPage(`
    <img src="${PREVIEW}" alt="">
    <button class="baixar"><span data-icon="media-download"></span></button>
  `, { fakeClock: true })

  const result = await page.source()

  assert.equal(result.reason, 'photo_not_loaded')
  assert.deepEqual(page.fetched, [])
})

test('A3: lado maior abaixo de 300 px é a prévia — o core para antes de chamar o servidor', () => {
  assert.equal(analysis.isPreviewSizedImage({ width: 299, height: 120 }), true)
  assert.equal(analysis.isPreviewSizedImage({ width: 0, height: 0 }), true)
  assert.equal(analysis.isPreviewSizedImage({ width: 300, height: 200 }), false)
  assert.equal(analysis.isPreviewSizedImage({ width: 1280, height: 960 }), false)
  assert.equal(analysis.ATTACHMENT_UPLOAD_LIMITS.image_min_edge, 300)

  const core = readFileSync(new URL('../src/companion-core.js', import.meta.url), 'utf8')
  const handler = core.slice(core.indexOf('async function handleAttachmentIncludeClick(button) {'))
  const check = handler.indexOf('isPreviewSizedImage')
  const send = handler.indexOf('includeFullReadingAttachment({')

  assert.ok(check > 0 && check < send, 'a conferência vem antes do envio')
  assert.match(handler.slice(check, send), /PHOTO_NOT_LOADED_MESSAGE[\s\S]*?return/)
  assert.match(core, /const bitmap = await createImageBitmap\(blob\)\s*const dimensions = \{ width: bitmap\.width, height: bitmap\.height \}/)
})
