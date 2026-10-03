// Rodada 11 (HML), item B, lado da extensão. DOM e arquivos sintéticos,
// nenhum dado de cliente.
//
// - B1 (ManyChat): imagem e arquivo do domínio de arquivos do ManyChat
//   entram com a marca de arquivo só com a leitura completa; sem ela, a
//   bolha visual fica fora da captura, como hoje.
// - B3: a extensão só busca arquivo no domínio de arquivos do ManyChat
//   (manybot-files.manychat.io), pelo remetente permitido; o servidor nunca
//   recebe um endereço.
// - B4: limites antes de enviar (imagem até 5 MB, reduzida; PDF até 10 MB e
//   20 páginas; acima de 3 MB o PDF ainda não vai).
// - B2: "Arquivos na conversa (N)" com "Incluir na leitura" e a linha da
//   sugestão no Agora.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
require('../src/message-mutations.js')
require('../src/platform-contract.js')
const surfaceApi = require('../src/manychat-surface.js')
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
const content = require('../src/manychat-message-content.js')
require('../src/manychat-message-profile.js')
require('../src/manychat-dom-reader.js')
require('../src/manychat-composer.js')
require('../src/manychat-phone-evidence.js')
require('../src/manychat-audio-source.js')
const adapterApi = require('../src/manychat-channel-adapter.js')
const transport = require('../src/manychat-audio-background-transport.js')
const analysis = require('../src/companion-analysis-controller.js')
const view = require('../src/companion-seller-information-view.js')

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const URL_A = 'https://app.manychat.com/fb1/chat/111'
const KEY_X = `manychat:contact:v1:sha256:${'b'.repeat(64)}`
const CHANNEL_KEY = `manychat:channel:whatsapp:v1:sha256:${'d'.repeat(64)}`
const FILES = 'https://manybot-files.manychat.io/000000/wa/2026/10/01'

function humanBubble({ mid, classes = '_typeIn_x', title = '2026-10-01T16:59:00', html }) {
  return `
    <div>
      <div class="_wrapper_x ${classes}" data-title="${title}" data-title-at="1" data-title-offset-bottom="1">
        <div data-mid="${mid}">${html}</div>
      </div>
    </div>`
}

function createAdapter(bubbles) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <main>
        <div data-test-id="chat-messages-list">${bubbles.join('')}</div>
        <footer><textarea></textarea></footer>
      </main>
    </body></html>`,
    { url: URL_A },
  )

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

function read(bubbles, includeMediaBubbles) {
  const entries = createAdapter(bubbles).readVisibleMessageEntries({
    observedAt: '2026-10-01T20:00:00.000Z',
    includeMediaBubbles,
  })

  return entries.map((entry) => ({
    key: entry.messageId.split('::').pop().replace(/^manychat:/, ''),
    direction: entry.message.direction,
    text: entry.message.text,
  }))
}

const BUBBLES = [
  humanBubble({ mid: 'txt-1', title: '2026-10-01T16:58:00', html: '<span>Vou mandar a proposta</span>' }),
  humanBubble({ mid: 'pdf-1', html: `<a href="${FILES}/Proposta.pdf" target="_blank">Proposta.pdf</a>` }),
  humanBubble({ mid: 'img-1', title: '2026-10-01T17:00:00', html: `<img src="${FILES}/foto.jpg" alt="">` }),
  humanBubble({ mid: 'fora-1', title: '2026-10-01T17:01:00', html: '<img src="https://exemplo.test/foto.jpg" alt="">' }),
  humanBubble({ mid: 'emoji-1', title: '2026-10-01T17:02:00', html: `<span>Ok</span><img src="${FILES}/emoji.png" alt="emoji">` }),
]

test('B1 (ManyChat): PDF e imagem do domínio de arquivos entram com a marca; fora do domínio e emoji ficam de fora', () => {
  try {
    const messages = read(BUBBLES, true)
    const byKey = Object.fromEntries(messages.map((message) => [message.key, message]))

    assert.equal(byKey['pdf-1'].text, '[Arquivo: Proposta.pdf | tipo: pdf]')
    assert.equal(byKey['pdf-1'].direction, 'incoming')
    assert.equal(byKey['img-1'].text, '[Arquivo: foto.jpg | tipo: imagem]')
    assert.equal(byKey['fora-1'], undefined, 'imagem fora do domínio do ManyChat não vira arquivo')
    assert.doesNotMatch(byKey['emoji-1']?.text ?? '', /\[Arquivo/)
    assert.equal(byKey['txt-1'].text, 'Vou mandar a proposta')
  } finally {
    content.setMediaCaptureEnabled(false)
  }
})

test('B1 (ManyChat): sem a leitura completa, a captura é a de hoje (imagem fora; link de arquivo não vira marca)', () => {
  const messages = read(BUBBLES, false)
  const byKey = Object.fromEntries(messages.map((message) => [message.key, message]))

  assert.equal(byKey['img-1'], undefined)
  assert.doesNotMatch(JSON.stringify(messages), /tipo: (pdf|imagem)/)
})

test('B3: só o domínio de arquivos do ManyChat (https) é aceito', () => {
  assert.equal(content.MANYCHAT_FILE_HOST, 'manybot-files.manychat.io')

  for (const ok of [`${FILES}/a.pdf`, 'https://manybot-files.manychat.io/x/y.jpg']) {
    assert.equal(content.isManyChatFileUrl(ok), true, ok)
  }

  for (const bad of [
    'http://manybot-files.manychat.io/a.pdf',
    'https://manybot-files.manychat.io.exemplo.test/a.pdf',
    'https://exemplo.test/manybot-files.manychat.io/a.pdf',
    'https://app.manychat.com/a.pdf',
    'javascript:alert(1)',
    '',
  ]) {
    assert.equal(content.isManyChatFileUrl(bad), false, bad)
  }
})

function fileResponse({ url, contentType = 'application/pdf', bytes = Buffer.from('%PDF-1.4 sintetico'), ok = true } = {}) {
  return {
    ok,
    status: ok ? 200 : 404,
    url,
    headers: {
      get(name) {
        const key = String(name).toLowerCase()
        if (key === 'content-type') return contentType
        if (key === 'content-length') return String(bytes.length)
        return null
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
  }
}

test('B3: a extensão busca o arquivo só no domínio do ManyChat, sem cookies, e devolve os bytes (imagem ou PDF)', async () => {
  const calls = []

  const fetched = await transport.fetchManyChatAttachment({
    url: `${FILES}/Proposta.pdf`,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return fileResponse({ url })
    },
  })

  assert.equal(fetched.ready, true)
  assert.equal(fetched.mime_type, 'application/pdf')
  assert.equal(Buffer.from(fetched.content_base64, 'base64').toString(), '%PDF-1.4 sintetico')
  assert.equal(calls[0].init.credentials, 'omit')

  const refuse = async (input, reason) => {
    const result = await transport.fetchManyChatAttachment(input)
    assert.equal(result.ready, false, reason)
    assert.equal(result.reason, reason)
    assert.equal(result.content_base64, null)
  }

  let called = 0

  await refuse({ url: 'https://exemplo.test/Proposta.pdf', fetchImpl: async () => { called += 1 } }, 'attachment_url_not_allowed')
  assert.equal(called, 0, 'endereço fora do domínio nem é buscado')

  await refuse({ url: `${FILES}/a.pdf`, fetchImpl: async () => fileResponse({ url: 'https://exemplo.test/a.pdf' }) }, 'attachment_redirect_not_allowed')
  await refuse({ url: `${FILES}/a.html`, fetchImpl: async (url) => fileResponse({ url, contentType: 'text/html' }) }, 'attachment_content_type_invalid')
  await refuse({ url: `${FILES}/a.pdf`, maxBytes: 4, fetchImpl: async (url) => fileResponse({ url }) }, 'attachment_too_large')

  // Remetente: só a página do ManyChat (quadro principal).
  const denied = await transport.handleAttachmentSourceRequest(
    { payload: { attachment_url: `${FILES}/a.pdf` } },
    { frameId: 0, url: 'https://exemplo.test/' },
    { fetchImpl: async (url) => fileResponse({ url }) },
  )

  assert.equal(denied.statusCode, 403)

  const allowed = await transport.handleAttachmentSourceRequest(
    { payload: { attachment_url: `${FILES}/a.pdf` } },
    { frameId: 0, url: URL_A },
    { fetchImpl: async (url) => fileResponse({ url }) },
  )

  assert.equal(allowed.ok, true)
})

test('B4: limites antes de enviar — imagem até 5 MB (reduzida), PDF até 10 MB e 20 páginas, PDF acima de 3 MB ainda não vai', () => {
  const MB = 1024 * 1024
  const plan = analysis.planAttachmentUpload

  assert.deepEqual(plan({ kind: 'imagem', sizeBytes: 4 * MB }), { ok: true, downscale: true, message: null })
  assert.equal(plan({ kind: 'imagem', sizeBytes: 6 * MB }).message, 'Imagem acima de 5 MB: não é enviada.')
  assert.deepEqual(plan({ kind: 'pdf', sizeBytes: 2 * MB, pages: 20 }), { ok: true, downscale: false, message: null })
  assert.equal(plan({ kind: 'pdf', sizeBytes: 2 * MB, pages: 21 }).message, 'PDF com mais de 20 páginas: não é enviado.')
  assert.equal(plan({ kind: 'pdf', sizeBytes: 11 * MB }).message, 'PDF acima de 10 MB: não é enviado.')
  assert.equal(plan({ kind: 'pdf', sizeBytes: 4 * MB }).message, 'PDF acima de 3 MB: ainda não pode ser enviado.')
  assert.equal(plan({ kind: 'documento', sizeBytes: 1000 }).ok, false)
  assert.equal(plan({ kind: 'pdf', sizeBytes: 0 }).ok, false)

  assert.equal(analysis.countPdfPagesFromText('/Type /Pages /Type /Page /Type /Page'), 2)

  // Mensagens sem código interno.
  assert.doesNotMatch(analysis.attachmentSourceMessage('attachment_source_unavailable'), /attachment_|_/)
})

function analysisView(attachments) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    has_reading: true,
    summary: [],
    timeline: [],
    pending: [],
    opportunities: [],
    coaching: { acertos: [], ajustes: [] },
    sections: [],
    afirmacoes_a_confirmar: [],
    alertas_de_captura: [],
    footer: 'Leitura completa · 01/10, 20:07',
    run_id: 'run-1',
    view_key: 'analysis-r11',
    attachments,
  }
}

test('B2: Análise — "Arquivos na conversa (N)" com "Incluir na leitura" em cada arquivo que pode ir', () => {
  const analysisData = analysisView({
    title: 'Arquivos na conversa (2)',
    note: null,
    items: [
      { message_key: 'mensagem-sintetica-pdf', kind: 'pdf', kind_label: 'PDF', name: 'Proposta.pdf', when_label: '01/10 16:59', from_label: 'Cliente', size_label: '1,2 MB', status: 'nao_incluido', status_text: null, can_include: true, include_label: 'Incluir na leitura' },
      { message_key: 'mensagem-sintetica-img', kind: 'imagem', kind_label: 'Imagem', name: null, when_label: '01/10 17:00', from_label: 'Vendedor', size_label: null, status: 'incluido', status_text: 'Incluído na leitura', can_include: false, include_label: null },
    ],
  })

  const dom = new JSDOM(`<!doctype html><div id="root">${view.renderFullReadingSlot('analysis', analysisData)}</div>`)
  const root = dom.window.document.getElementById('root')

  view.hydrateFullReadingSlots(root, { analysis: analysisData })

  const card = root.querySelector('[data-yolen-fr-attachments]')

  assert.ok(card)
  assert.match(card.textContent, /Arquivos na conversa \(2\)/)
  assert.match(card.textContent, /PDF · Proposta\.pdf/)
  assert.match(card.textContent, /Cliente · 01\/10 16:59 · 1,2 MB/)
  assert.match(card.textContent, /Incluído na leitura/)

  const buttons = card.querySelectorAll('[data-yolen-action="full-reading-attachment-include"]')

  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].textContent, 'Incluir na leitura')
  assert.equal(buttons[0].getAttribute('data-yolen-fr-attachment-key'), 'mensagem-sintetica-pdf')
  assert.equal(buttons[0].getAttribute('data-yolen-fr-attachment-kind'), 'pdf')
})

test('B2: Agora — linha curta "A leitura sugere incluir: PDF de 01/10 16:59 — <motivo>" com o botão', () => {
  const agora = {
    state: 'ready',
    notice: null,
    failure_code: null,
    kanban: { status: 'negociacao', label: 'Negociação' },
    kanban_line: 'Etapa no kanban: Negociação',
    main: null,
    next_step: { turn: 'vendedor', turn_label: 'Sua vez', title: 'Responder sobre a proposta', complement: '', why: 'O cliente mandou o arquivo.' },
    conduct: null,
    stage_card: null,
    facts: [],
    before_send: [],
    message: null,
    kanban_late: false,
    hide_stage_sla: false,
    locks: [],
    footer: 'Leitura completa · 01/10, 20:07',
    run_id: 'run-sintetico',
    status: {
      running: null,
      running_since: null,
      failure: null,
      retry_at: null,
      refresh: { label: 'Atualizar', mode: 'if_changed', disabled: false, hint: null, full: { label: 'Ler a conversa inteira' } },
      nothing_new_since: null,
      band: null,
      message_outdated: false,
      pending_until: null,
      review_at: null,
    },
    attachment_suggestion: {
      message_key: 'mensagem-sintetica-pdf',
      kind: 'pdf',
      text: 'A leitura sugere incluir: PDF de 01/10 16:59 — A proposta traz o valor combinado.',
      can_include: true,
    },
    view_key: 'agora-r11',
  }

  const dom = new JSDOM(`<!doctype html><div id="root">${view.renderFullReadingSlot('agora', agora)}</div>`)
  const root = dom.window.document.getElementById('root')

  view.hydrateFullReadingSlots(root, { agora })

  const line = root.querySelector('[data-yolen-fr-attachment-suggestion]')

  assert.ok(line)
  assert.equal(line.getAttribute('role'), 'status')
  assert.match(line.textContent, /^A leitura sugere incluir: PDF de 01\/10 16:59 — A proposta traz o valor combinado\./)
  assert.equal(line.querySelector('[data-yolen-action="full-reading-attachment-include"]').getAttribute('data-yolen-fr-attachment-key'), 'mensagem-sintetica-pdf')

  // Sem sugestão: nada.
  const plain = new JSDOM(`<!doctype html><div id="root">${view.renderFullReadingSlot('agora', { ...agora, attachment_suggestion: null })}</div>`)
  const plainRoot = plain.window.document.getElementById('root')

  view.hydrateFullReadingSlots(plainRoot, { agora: { ...agora, attachment_suggestion: null } })
  assert.equal(plainRoot.querySelector('[data-yolen-fr-attachment-suggestion]'), null)
})

test('B3: o "Incluir na leitura" pega o arquivo na página, confere os limites, envia pelo background e relê — só com a leitura completa', () => {
  const core = readSrc('companion-core.js')
  const handler = core.slice(core.indexOf('async function handleAttachmentIncludeClick(button) {'), core.indexOf('async function handleAttachmentIncludeClick(button) {') + 5000)

  assert.match(handler, /!isFullReadingPanelMode\(\)/)
  assert.match(handler, /channelAdapter\.getAttachmentSource\(\{ messageKey, kind \}\)/)
  assert.match(handler, /planAttachmentUpload\?\.\(\{/)
  assert.match(handler, /plan\.downscale \? await downscaleImageBlob\(source\.blob\)/)
  assert.match(handler, /window\.YolenCompanionApi\.includeFullReadingAttachment\(\{/)
  assert.match(handler, /requestFullReadingRefresh\(\)/)
  // Troca de conversa no meio: descarta.
  assert.match(handler, /if \(!isStillCurrent\(\)\) \{\s*attachmentIncludeState\.delete\(messageKey\)/)

  assert.match(core, /'\[data-yolen-action="full-reading-attachment-include"\]'/)

  const background = readSrc('background.js')

  assert.match(background, /INCLUDE_FULL_READING_ATTACHMENT[\s\S]{0,400}\/api\/companion\/full-reading\/attachments/)
  assert.match(background, /FETCH_MANYCHAT_ATTACHMENT_SOURCE[\s\S]{0,400}handleAttachmentSourceRequest/)

  const api = readSrc('yolen-api.js')

  assert.match(api, /includeFullReadingAttachment/)

  // O ManyChat manda ao background só o endereço do arquivo, e o servidor
  // recebe só os bytes.
  const manychat = readSrc('manychat-channel-adapter.js')

  assert.match(manychat, /FETCH_MANYCHAT_ATTACHMENT_SOURCE/)
  assert.doesNotMatch(handler, /source_url|attachment_url/)
})

test('B3 (WhatsApp): o arquivo vem da própria página — o download disparado pelo clique é segurado, e só por 10 s', () => {
  const bridge = readSrc('whatsapp-audio-bridge.js')

  assert.match(bridge, /FILE_CAPTURE_TIMEOUT_MS = 10000/)
  assert.match(bridge, /CAPTURE_NEXT_FILE/)
  assert.match(bridge, /FILE_BLOB_CAPTURED/)
  assert.match(bridge, /suppressedDownloadUrls/)
})
