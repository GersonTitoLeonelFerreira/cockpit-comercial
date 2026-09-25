// FASE 6 — ManyChatAdapter (contrato §6/§7/§8). Comportamento em jsdom com
// fixtures na estrutura já validada ao vivo (MANYCHAT_*_GATE.md): raiz
// div[data-test-id="chat-messages-list"], mensagens
// :scope > div > div[data-title-at][data-title-offset-bottom][data-title],
// autoria por tokens _typeIn_/_typeOut_/_botMessage_, identidade nativa
// data-mid, telefone só em contexto WhatsApp fora de
// details-subscriber-id, composer = exatamente um <textarea>.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import { CONTRACT_MEMBERS } from './e3-test-support/contract-channel-adapter.mjs'

const require = createRequire(import.meta.url)
require('../src/platform-contract.js')
const surfaceApi = require('../src/manychat-surface.js')
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
require('../src/manychat-message-profile.js')
require('../src/manychat-dom-reader.js')
require('../src/manychat-composer.js')
require('../src/manychat-phone-evidence.js')
require('../src/manychat-audio-source.js')
const adapterApi = require('../src/manychat-channel-adapter.js')

const URL_A = 'https://app.manychat.com/fb3678277/chat/438324835'
const URL_B = 'https://app.manychat.com/fb3678277/chat/999999999'
const KEY_X = `manychat:contact:v1:sha256:${'a'.repeat(64)}`
const KEY_Y = `manychat:contact:v1:sha256:${'b'.repeat(64)}`
const CHANNEL_KEY = `manychat:channel:whatsapp:v1:sha256:${'c'.repeat(64)}`

function messageHtml(message) {
  const inner = message.audioUrl
    ? `<audio><source src="${message.audioUrl}" type="audio/ogg"></audio>`
    : (message.text ?? '')

  return `
    <div>
      <div
        class="_wrapper_x ${message.classes ?? '_typeIn_x'}"
        data-title="${message.title ?? '2026-09-14T20:30:00'}"
        data-title-at="1"
        data-title-offset-bottom="1"
      ><span data-mid="${message.mid}">${inner}</span></div>
    </div>`
}

function buildDom({ messages = [], contactHtml = '', composers = 1, draft = '' } = {}) {
  const textareas = Array.from({ length: composers }, () => `<textarea>${draft}</textarea>`).join('')

  return new JSDOM(
    `<!doctype html><html><body>
      <main>
        <div data-test-id="chat-messages-list">${messages.map(messageHtml).join('')}</div>
        <section class="userColumnContent_1">${contactHtml}</section>
        <footer>${textareas}<button type="button" data-test-id="send">Enviar</button></footer>
      </main>
    </body></html>`,
    { url: URL_A },
  )
}

function identity(key = KEY_X) {
  return {
    ready: true,
    reason: null,
    safe: {
      platform: 'manychat',
      platform_identity: { source: 'subscriber_id', key },
      channel_identity: { channel: 'whatsapp', source: 'whatsapp_user_id', key: CHANNEL_KEY },
    },
  }
}

function createAdapter({
  dom = buildDom(),
  identities = [identity()],
  fetchAudioSource,
} = {}) {
  let currentUrl = URL_A
  let identityIndex = 0
  const intervals = []
  const readIdentity = async () => {
    const value = identities[Math.min(identityIndex, identities.length - 1)]
    identityIndex += 1
    return typeof value === 'function' ? value() : value
  }

  const adapter = adapterApi.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    surfaceProvider: () => surfaceApi.parseManyChatConversationUrl(currentUrl),
    readSafeIdentity: readIdentity,
    fetchAudioSource,
    mutationDebounceMs: 1,
    scheduleInterval: (fn) => {
      intervals.push(fn)
      return intervals.length
    },
    cancelInterval: (handle) => {
      intervals[handle - 1] = null
    },
  })

  return {
    adapter,
    dom,
    document: dom.window.document,
    setUrl(url) {
      currentUrl = url
    },
    tickLifecycle() {
      for (const fn of intervals) {
        fn?.()
      }
    },
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const sourceText = readFileSync(new URL('../src/manychat-channel-adapter.js', import.meta.url), 'utf8')

test('contrato: implementa todos os membros consumidos pelo Core, plataforma, mount e capabilities (Q4)', () => {
  const { adapter, document } = createAdapter()

  for (const member of CONTRACT_MEMBERS) {
    assert.ok(member in adapter, member)
  }

  assert.deepEqual({ ...adapter.platform }, { id: 'manychat', displayName: 'ManyChat' })
  assert.equal(adapter.getMountPoint(), document.body)
  assert.deepEqual({ ...adapter.getCapabilities() }, {
    canProvideTrustedPhone: 'conditional',
    canProvideDisplayName: false,
    canReadMessages: true,
    canObserveConversationChanges: true,
    canApplyMessage: true,
    canInterceptSend: false,
    canReadAudio: 'conditional',
    canRequestContactDetails: false,
    canClassifyGroupOrSelf: false,
    canDetectDeletedOrEdited: false,
    canProvideMountPoint: true,
  })
})

test('conversa: chave autoritativa da rota; sem âncora de conversa não há conversa atual', () => {
  const { adapter, document, setUrl } = createAdapter()
  const keyA = adapter.getCurrentConversationKey()

  assert.match(keyA, /manychat/)
  const snapshot = adapter.readConversationSnapshot()
  assert.equal(snapshot.conversationKey, keyA)
  assert.equal(snapshot.conversationTitle, '', 'nenhum nome visível vira identidade')
  assert.equal(snapshot.conversationType, 'unknown')

  setUrl(URL_B)
  assert.notEqual(adapter.getCurrentConversationKey(), keyA)

  document.querySelector('[data-test-id="chat-messages-list"]').remove()
  assert.equal(adapter.getCurrentConversationKey(), null)

  setUrl('https://app.manychat.com/fb3678277/settings')
  assert.equal(adapter.getCurrentConversationKey(), null)
})

test('mensagens: autoria, identidade nativa escopada pela conversa, automação e áudio; duplicata falha fechado', () => {
  const dom = buildDom({
    messages: [
      { mid: 'm-1', text: 'Quero saber o preço.', classes: '_typeIn_x', title: '2026-09-14T20:30:00' },
      { mid: 'm-2', text: 'Custa R$ 100.', classes: '_typeOut_x', title: '2026-09-14T20:31:00' },
      { mid: 'm-3', text: 'Mensagem automática', classes: '_typeOut_x _botMessage_x' },
      { mid: 'm-4', audioUrl: 'https://manybot-files.manychat.io/a/audio-1.ogg', classes: '_typeIn_x', title: '2026-09-14T20:32:00' },
    ],
  })
  const { adapter } = createAdapter({ dom })
  const key = adapter.getCurrentConversationKey()
  const entries = adapter.readVisibleMessageEntries({ observedAt: '2026-09-14T20:40:00.000Z' })

  assert.deepEqual(
    entries.map((entry) => [entry.messageId, entry.message.direction, entry.message.authorKind, entry.message.text, entry.message.hasAudio]),
    [
      [`${key}::manychat:m-1`, 'incoming', 'customer', 'Quero saber o preço.', false],
      [`${key}::manychat:m-2`, 'outgoing', 'human_agent', 'Custa R$ 100.', false],
      [`${key}::manychat:m-4`, 'incoming', 'customer', '', true],
    ],
    'automação fica fora; áudio vira mensagem com hasAudio',
  )
  assert.equal(entries[0].message.sender, null)
  assert.ok(Number.isFinite(entries[0].message.timestampMs))
  assert.equal(adapter.getLatestOutgoingVisibleMessageText(), 'Custa R$ 100.')

  const duplicated = buildDom({
    messages: [
      { mid: 'dup', text: 'A' },
      { mid: 'dup', text: 'B' },
    ],
  })
  const { adapter: dupAdapter } = createAdapter({ dom: duplicated })
  assert.equal(dupAdapter.readVisibleMessageEntries({ observedAt: 'x' }), null)
})

test('identidade/telefone: identidade opaca sempre como evidência; telefone só com contexto WhatsApp; subscriber id nunca vira telefone', async () => {
  const trusted = createAdapter({
    dom: buildDom({
      contactHtml: '<span>WhatsApp</span><div class="mainContent_1">5547999990001</div><div data-test-id="details-subscriber-id"><span>5511000000000</span></div>',
    }),
  })
  const key = trusted.adapter.getCurrentConversationKey()
  const evidence = await trusted.adapter.getContactEvidence()

  assert.equal(evidence.status, 'ready')
  assert.deepEqual({ ...evidence.externalIdentity }, { platform: 'manychat', key: KEY_X, channel: 'whatsapp' })
  assert.deepEqual({ ...evidence.trustedPhone }, { phone: '5547999990001', source: 'manychat_dom_whatsapp_context_v1' })
  assert.equal(evidence.displayName, null)
  assert.equal(evidence.displayNameConfidence, 'unavailable')

  const acquired = await trusted.adapter.acquireContactEvidence({ conversationKey: key, isCurrentConversation: (value) => value === key })
  assert.equal(acquired.outcome, 'phone')
  assert.equal(acquired.phone, '5547999990001')
  assert.equal(trusted.adapter.readConversationSnapshot().phone, '5547999990001')

  // Só o subscriber id (dentro de details-subscriber-id): sem telefone, mas
  // a identidade opaca continua disponível como evidência de vínculo.
  const onlySubscriber = createAdapter({
    dom: buildDom({ contactHtml: '<span>WhatsApp</span><div data-test-id="details-subscriber-id"><span>5547999990001</span></div>' }),
  })
  const onlyKey = onlySubscriber.adapter.getCurrentConversationKey()
  let consumed = 0
  const unavailable = await onlySubscriber.adapter.acquireContactEvidence({
    conversationKey: onlyKey,
    isCurrentConversation: () => true,
    onLookupAttemptConsumed: () => {
      consumed += 1
    },
  })

  assert.equal(unavailable.outcome, 'phone_unavailable')
  assert.equal(unavailable.reason, 'phone_unavailable')
  assert.equal(unavailable.externalIdentity.key, KEY_X)
  assert.equal(consumed, 1)
  assert.equal(onlySubscriber.adapter.readConversationSnapshot().phone, null)

  const ambiguous = createAdapter({
    dom: buildDom({ contactHtml: '<span>WhatsApp</span><div>5547999990001</div><div>5547999990002</div>' }),
  })
  const ambiguousResult = await ambiguous.adapter.acquireContactEvidence({
    conversationKey: ambiguous.adapter.getCurrentConversationKey(),
    isCurrentConversation: () => true,
  })
  assert.equal(ambiguousResult.outcome, 'phone_unavailable')
  assert.equal(ambiguousResult.reason, 'phone_ambiguous')

  assert.doesNotMatch(JSON.stringify(evidence), /subscriber_id"\s*:\s*"\d|5511000000000/)
})

test('evidência atrasada: troca de conversa ou de contato durante a leitura é stale; A→B→A descarta evidência anterior', async () => {
  let release
  const slowIdentity = () =>
    new Promise((resolve) => {
      release = () => resolve(identity())
    })

  const switching = createAdapter({
    dom: buildDom({ contactHtml: '<span>WhatsApp</span><div>5547999990001</div>' }),
    identities: [slowIdentity, identity()],
  })
  const keyA = switching.adapter.getCurrentConversationKey()
  const pending = switching.adapter.acquireContactEvidence({ conversationKey: keyA, isCurrentConversation: () => true })

  switching.setUrl(URL_B)
  release()
  assert.deepEqual(await pending, { outcome: 'stale' }, 'evidência de A nunca é aplicada em B')

  // Contato diferente entre as duas leituras da MESMA rota → stale.
  const swapped = createAdapter({
    dom: buildDom({ contactHtml: '<span>WhatsApp</span><div>5547999990001</div>' }),
    identities: [identity(KEY_X), identity(KEY_Y)],
  })
  const swappedKey = swapped.adapter.getCurrentConversationKey()
  assert.deepEqual(
    await swapped.adapter.acquireContactEvidence({ conversationKey: swappedKey, isCurrentConversation: () => true }),
    { outcome: 'stale' },
  )

  // A → B → A: a evidência de A₁ não sobrevive à volta.
  const aba = createAdapter({
    dom: buildDom({ contactHtml: '<span>WhatsApp</span><div>5547999990001</div>' }),
  })
  const abaKey = aba.adapter.getCurrentConversationKey()
  await aba.adapter.acquireContactEvidence({ conversationKey: abaKey, isCurrentConversation: () => true })
  assert.equal(aba.adapter.readConversationSnapshot().phone, '5547999990001')

  aba.setUrl(URL_B)
  assert.equal(aba.adapter.readConversationSnapshot().phone, null)
  aba.setUrl(URL_A)
  assert.equal(aba.adapter.readConversationSnapshot().phone, null, 'A₂ precisa de evidência nova')
})

test('mesma rota, outro contato: revalidação acusa identityChanged e descarta a evidência', async () => {
  const { adapter } = createAdapter({
    dom: buildDom({ contactHtml: '<span>WhatsApp</span><div>5547999990001</div>' }),
    identities: [identity(KEY_X), identity(KEY_X), identity(KEY_X), identity(KEY_X), identity(KEY_Y)],
  })
  const key = adapter.getCurrentConversationKey()

  assert.equal(adapter.readConversationSnapshot().needsIdentityRevalidation, true)
  await adapter.acquireContactEvidence({ conversationKey: key, isCurrentConversation: () => true })
  assert.deepEqual(await adapter.revalidateConversationIdentity({ conversationKey: key }), { outcome: 'resolved', identityChanged: false })
  assert.equal(adapter.readConversationSnapshot().phone, '5547999990001')

  // O contato aberto passou a ser Y na mesma rota.
  assert.deepEqual(await adapter.revalidateConversationIdentity({ conversationKey: key }), { outcome: 'resolved', identityChanged: true })
  const afterSwap = adapter.readConversationSnapshot()
  assert.equal(afterSwap.contactEvidenceStale, true)
  assert.equal(afterSwap.phone, null, 'o telefone do contato anterior não sobrevive')

  // Leituras divergentes (troca no meio da revalidação) são inconclusivas.
  const divergent = createAdapter({ identities: [identity(KEY_X), identity(KEY_Y)] })
  assert.deepEqual(
    await divergent.adapter.revalidateConversationIdentity({ conversationKey: divergent.adapter.getCurrentConversationKey() }),
    { outcome: 'unavailable' },
  )
})

test('composer: estado, inserção verificada, rascunho preservado sem confirmação, substituição confirmada; nunca envia', async () => {
  const { adapter, document, setUrl } = createAdapter()
  const key = adapter.getCurrentConversationKey()
  let sendClicks = 0
  document.querySelector('[data-test-id="send"]').addEventListener('click', () => {
    sendClicks += 1
  })

  assert.deepEqual({ ...adapter.getComposerState() }, { available: true, busy: false, reason: null })
  assert.deepEqual(await adapter.applyMessage('Olá, podemos conversar?', { conversationKey: key }), { applied: true, reason: null })
  assert.equal(document.querySelector('textarea').value, 'Olá, podemos conversar?')
  assert.equal(adapter.getComposerState().busy, true)

  assert.deepEqual(await adapter.applyMessage('Outra', { conversationKey: key }), { applied: false, reason: 'composer_not_empty' })
  assert.equal(document.querySelector('textarea').value, 'Olá, podemos conversar?')
  assert.deepEqual(await adapter.applyMessage('Substituída', { conversationKey: key, replaceExisting: true }), { applied: true, reason: null })
  assert.equal(adapter.getComposerText(), 'Substituída')

  assert.equal(adapter.insertTextIntoEmptyComposer('Nova', { conversationKey: key }), 'composer_not_empty')

  setUrl(URL_B)
  assert.deepEqual(await adapter.applyMessage('Mensagem de A', { conversationKey: key, replaceExisting: true }), { applied: false, reason: 'conversation_changed' })
  assert.equal(adapter.insertTextIntoEmptyComposer('Mensagem de A', { conversationKey: key }), 'conversation_changed')
  assert.equal(adapter.getComposerText(), 'Substituída')

  assert.equal(sendClicks, 0, 'nenhuma operação envia')
  assert.equal(adapter.hasSendControl(), false)
  assert.deepEqual(adapter.triggerSend({ conversationKey: key }), { sent: false, reason: 'capability_unavailable' })
  assert.equal(sendClicks, 0)

  const ambiguous = createAdapter({ dom: buildDom({ composers: 2 }) })
  assert.deepEqual({ ...ambiguous.adapter.getComposerState() }, { available: false, busy: false, reason: 'composer_ambiguous' })
  assert.equal(ambiguous.adapter.insertTextIntoEmptyComposer('x', {}), 'composer_unavailable')
})

test('eventos: troca de conversa e mutação normalizadas; cancelamento encerra a inscrição; evento atrasado não vaza', async () => {
  const { adapter, document, setUrl, tickLifecycle } = createAdapter({
    dom: buildDom({ messages: [{ mid: 'm-1', text: 'Oi' }] }),
  })
  const events = []
  const drafts = []
  const unsubscribe = adapter.observeHostChanges((payload) => events.push(payload))
  const unsubscribeDraft = adapter.onComposerDraftInput((draft) => drafts.push(draft))

  adapter.readConversationSnapshot()
  const root = document.querySelector('[data-test-id="chat-messages-list"]')
  root.insertAdjacentHTML('beforeend', messageHtml({ mid: 'm-2', text: 'Nova' }))
  await sleep(20)
  assert.deepEqual(events.at(-1), { conversationInstanceChanged: false })
  assert.equal(adapter.readConversationSnapshot().needsIdentityRevalidation, true)

  setUrl(URL_B)
  tickLifecycle()
  assert.deepEqual(events.at(-1), { conversationInstanceChanged: true })

  const textarea = document.querySelector('textarea')
  textarea.value = 'rascunho'
  textarea.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  assert.deepEqual(drafts, ['rascunho'])

  const count = events.length
  unsubscribe()
  unsubscribeDraft()
  root.insertAdjacentHTML('beforeend', messageHtml({ mid: 'm-3', text: 'Depois' }))
  setUrl(URL_A)
  tickLifecycle()
  textarea.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  await sleep(20)
  assert.equal(events.length, count, 'nenhum evento depois do cancelamento')
  assert.deepEqual(drafts, ['rascunho'])
})

test('áudio: handles opacos; fonte validada buscada pelo transporte; troca de conversa invalida o handle', async () => {
  const fetched = []
  const dom = buildDom({
    messages: [
      { mid: 'a-1', audioUrl: 'https://manybot-files.manychat.io/a/audio-1.ogg', classes: '_typeIn_x' },
      { mid: 't-1', text: 'Texto' },
    ],
  })
  const { adapter, setUrl } = createAdapter({
    dom,
    fetchAudioSource: async (url) => {
      fetched.push(url)
      return { ok: true, payload: { ready: true, audio_base64: Buffer.from('OggS').toString('base64'), mime_type: 'audio/ogg' } }
    },
  })

  const targets = adapter.getVisibleAudioTargets()
  assert.equal(targets.length, 1)
  assert.deepEqual(Object.keys(targets[0]).sort(), ['durationSeconds', 'index', 'key'])
  assert.match(targets[0].key, /manychat:a-1$/)

  const source = await adapter.getAudioSource(targets[0])
  assert.equal(source.ok, true)
  assert.equal(source.blob.type, 'audio/ogg')
  assert.equal(source.blob.size, 4)
  assert.deepEqual(fetched, ['https://manybot-files.manychat.io/a/audio-1.ogg'])

  setUrl(URL_B)
  adapter.readConversationSnapshot()
  const stale = await adapter.getAudioSource(targets[0])
  assert.equal(stale.ok, false)
  assert.equal(stale.reason, 'audio_target_not_found')

  const failing = createAdapter({
    dom,
    fetchAudioSource: async () => ({ ok: false, payload: { ready: false, reason: 'audio_fetch_failed' } }),
  })
  const failed = await failing.adapter.getAudioSource(failing.adapter.getVisibleAudioTargets()[0])
  assert.deepEqual({ ok: failed.ok, reason: failed.reason }, { ok: false, reason: 'audio_fetch_failed' })
})

test('adapter só com mecânica de plataforma: sem copy/estado/ações comerciais, log, storage ou telefone a partir de id opaco', () => {
  const code = sourceText.replace(/\/\/.*$/gm, '')

  for (const forbidden of [
    /RESOLVE_LEAD|CREATE_LEAD|ANALYZE_CONVERSATION|INGEST_CAPTURE_MESSAGES|TRANSCRIBE_/,
    /innerHTML|insertAdjacentHTML/,
    /console\./,
    /localStorage|sessionStorage|storage\.(local|sync|session)/,
    /NOT_FOUND|OWNED_BY_|IN_POOL|CLOSED_CYCLE/,
    /\bphone\w*\s*[:=][^\n]*\b(subscriber_id|wa_id)\b/,
  ]) {
    assert.doesNotMatch(code, forbidden)
  }
})

test('FASE 6 não antecipa a FASE 7: o adapter não entra em nenhum content script do manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  const loaded = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? [])

  assert.equal(loaded.includes('src/manychat-channel-adapter.js'), false)
  assert.equal(loaded.includes('src/manychat-phone-evidence.js'), false)
})

test('composer: o campo de intenção do próprio painel Yolen nunca é candidato ao composer do ManyChat', async () => {
  const dom = buildDom()
  dom.window.document.body.insertAdjacentHTML(
    'beforeend',
    '<aside id="yolen-companion-panel"><textarea data-yolen-seller-message-intent>intenção</textarea></aside>',
  )
  const { adapter, document } = createAdapter({ dom })
  const key = adapter.getCurrentConversationKey()

  assert.deepEqual({ ...adapter.getComposerState() }, { available: true, busy: false, reason: null })
  assert.deepEqual(await adapter.applyMessage('Mensagem para o cliente', { conversationKey: key }), { applied: true, reason: null })
  assert.equal(document.querySelector('footer textarea').value, 'Mensagem para o cliente')
  assert.equal(document.querySelector('[data-yolen-seller-message-intent]').value, 'intenção')
})

// FASE 7 — isolamento do áudio (auditoria de 34c5a36a): a conversa viva e
// a instância do contato são conferidas antes do download e depois da
// resposta, sem depender de readConversationSnapshot nem do observador.
function audioDom() {
  return buildDom({
    messages: [{ mid: 'a-1', audioUrl: 'https://manybot-files.manychat.io/a/audio-1.ogg', classes: '_typeIn_x' }],
  })
}

function audioOk() {
  return { ok: true, payload: { ready: true, audio_base64: Buffer.from('OggS').toString('base64'), mime_type: 'audio/ogg' } }
}

test('áudio: troca de conversa ANTES da solicitação (sem snapshot nem observador) não baixa nem devolve o áudio de A', async () => {
  const fetched = []
  const { adapter, setUrl } = createAdapter({
    dom: audioDom(),
    fetchAudioSource: async (url) => {
      fetched.push(url)
      return audioOk()
    },
  })

  const [handleA] = adapter.getVisibleAudioTargets()
  setUrl(URL_B)

  const result = await adapter.getAudioSource(handleA)

  assert.equal(result.ok, false)
  assert.equal(result.blob, null)
  assert.deepEqual(fetched, [], 'nenhum download para uma conversa que não está mais aberta')
})

test('áudio: troca de conversa DURANTE o download descarta o resultado', async () => {
  let release
  const { adapter, setUrl } = createAdapter({
    dom: audioDom(),
    fetchAudioSource: () =>
      new Promise((resolve) => {
        release = () => resolve(audioOk())
      }),
  })

  const [handleA] = adapter.getVisibleAudioTargets()
  const pending = adapter.getAudioSource(handleA)
  await sleep(5)
  setUrl(URL_B)
  release()

  const result = await pending
  assert.equal(result.ok, false)
  assert.equal(result.blob, null)
})

test('áudio: A→B→A durante o download descarta o resultado da instância A₁', async () => {
  let release
  const { adapter, setUrl, tickLifecycle } = createAdapter({
    dom: audioDom(),
    fetchAudioSource: () =>
      new Promise((resolve) => {
        release = () => resolve(audioOk())
      }),
  })

  adapter.observeHostChanges(() => {})
  const [handleA] = adapter.getVisibleAudioTargets()
  const pending = adapter.getAudioSource(handleA)
  await sleep(5)
  setUrl(URL_B)
  tickLifecycle()
  setUrl(URL_A)
  tickLifecycle()
  release()

  const result = await pending
  assert.equal(result.ok, false)
  assert.equal((await adapter.getAudioSource(handleA)).ok, false, 'o handle de A₁ não vale em A₂')
})

test('áudio: contato diferente na mesma rota (antes ou durante o download) recusa o áudio', async () => {
  const swappedBefore = createAdapter({
    dom: audioDom(),
    identities: [identity(KEY_X), identity(KEY_X), identity(KEY_Y), identity(KEY_Y)],
    fetchAudioSource: async () => audioOk(),
  })
  const keyBefore = swappedBefore.adapter.getCurrentConversationKey()
  await swappedBefore.adapter.acquireContactEvidence({ conversationKey: keyBefore, isCurrentConversation: () => true })
  const [handleX] = swappedBefore.adapter.getVisibleAudioTargets()
  // O contato aberto passa a ser Y na mesma rota (nenhuma revalidação rodou).
  assert.equal((await swappedBefore.adapter.getAudioSource(handleX)).ok, false)

  let release
  let identityNow = identity(KEY_X)
  const during = createAdapter({
    dom: audioDom(),
    identities: [() => identityNow],
    fetchAudioSource: () =>
      new Promise((resolve) => {
        release = () => resolve(audioOk())
      }),
  })
  const keyDuring = during.adapter.getCurrentConversationKey()
  await during.adapter.acquireContactEvidence({ conversationKey: keyDuring, isCurrentConversation: () => true })
  const [handleDuring] = during.adapter.getVisibleAudioTargets()
  const pending = during.adapter.getAudioSource(handleDuring)
  await sleep(5)
  identityNow = identity(KEY_Y)
  release()
  assert.equal((await pending).ok, false)
})

test('áudio: sem identidade confirmável a instância não é confirmada e o áudio é recusado', async () => {
  const fetched = []
  const { adapter } = createAdapter({
    dom: audioDom(),
    identities: [{ ready: false, reason: 'account_key_missing', safe: null }],
    fetchAudioSource: async (url) => {
      fetched.push(url)
      return audioOk()
    },
  })

  const [handle] = adapter.getVisibleAudioTargets()
  const result = await adapter.getAudioSource(handle)
  assert.equal(result.ok, false)
  assert.deepEqual(fetched, [])
})

test('áudio (controle positivo): mesma conversa e mesmo contato confirmados entregam o áudio', async () => {
  const { adapter } = createAdapter({ dom: audioDom(), fetchAudioSource: async () => audioOk() })
  const [handle] = adapter.getVisibleAudioTargets()
  const result = await adapter.getAudioSource(handle)
  assert.equal(result.ok, true)
  assert.equal(result.blob.size, 4)
})
