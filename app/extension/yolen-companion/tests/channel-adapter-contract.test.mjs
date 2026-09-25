// FASE 5 — ChannelAdapter (contrato §§5–8): o Core recebe do adapter só
// estado técnico, motivos técnicos, handles opacos, o ponto de montagem e
// a matriz de capabilities. Elementos da plataforma (composer, botão
// Enviar, contêineres de áudio) nunca saem do adapter, e a copy
// seller-facing do Core não cita a plataforma — interpola displayName.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { sliceFunction } from './support/whatsapp-composition-source.mjs'

const readSrc = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../src/${name}`, import.meta.url)),
    'utf8',
  )

const adapterSource = readSrc('whatsapp-adapter.js')
const coreSource = readSrc('companion-core.js')
const messageControllerSource = readSrc('companion-message-controller.js')

function createAdapter({ composerDraft = '', withSendButton = false } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="main">
        <footer>
          <div contenteditable="true" role="textbox" data-lexical-editor="true">${composerDraft}</div>
          ${withSendButton ? '<button aria-label="Enviar" data-testid="send"><span data-icon="send"></span></button>' : ''}
        </footer>
      </div>
    </body></html>`,
    { url: 'https://web.whatsapp.com/' },
  )

  let insertCommandCount = 0

  dom.window.document.execCommand = (command, _showUi, value) => {
    if (command === 'delete') {
      return true
    }

    if (command !== 'insertText') {
      return false
    }

    insertCommandCount += 1
    dom.window.document.querySelector(
      '#main footer [contenteditable="true"]',
    ).textContent = value
    return true
  }

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    MutationObserver: dom.window.MutationObserver,
    InputEvent: dom.window.InputEvent,
    Event: dom.window.Event,
    Promise,
    Map,
    WeakMap,
    Math,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(adapterSource, sandbox, {
    filename: 'whatsapp-adapter.js',
  })

  return {
    dom,
    adapter: sandbox.YolenCompanionWhatsAppAdapter.create(),
    getInsertCommandCount: () => insertCommandCount,
  }
}

test('§7: adapter declara platform, getMountPoint e getCapabilities (§8)', () => {
  const { dom, adapter } = createAdapter()

  assert.equal(adapter.platform.id, 'whatsapp')
  assert.equal(adapter.platform.displayName, 'WhatsApp')
  assert.equal(adapter.getMountPoint(), dom.window.document.body)

  assert.deepEqual(
    { ...adapter.getCapabilities() },
    {
      canProvideTrustedPhone: 'conditional',
      canProvideDisplayName: 'conditional',
      canReadMessages: true,
      canObserveConversationChanges: true,
      canApplyMessage: true,
      canInterceptSend: true,
      canReadAudio: true,
      canRequestContactDetails: true,
      canClassifyGroupOrSelf: true,
      canDetectDeletedOrEdited: true,
      canProvideMountPoint: true,
    },
  )
})

test('§7: getComposerState/applyMessage devolvem estado e motivos técnicos, nunca o elemento', async () => {
  const { adapter, dom, getInsertCommandCount } = createAdapter()

  const state = adapter.getComposerState()

  assert.deepEqual(
    { ...state },
    { available: true, busy: false, reason: null },
  )

  const result = await adapter.applyMessage(
    'Podemos conversar amanhã às 10h sobre a proposta?',
  )

  assert.deepEqual({ ...result }, { applied: true, reason: null })
  assert.equal(getInsertCommandCount(), 1)
  assert.match(
    dom.window.document.querySelector('#main footer [contenteditable="true"]')
      .textContent,
    /conversar amanhã/,
  )

  const withDraft = createAdapter({ composerDraft: 'Rascunho' })

  // busy = composer já contém texto (contrato §7).
  assert.equal(withDraft.adapter.getComposerState().busy, true)
})

test('§6: sem composer, motivos técnicos composer_not_found; sem botão, send_control_not_found', async () => {
  const { adapter, dom } = createAdapter()

  dom.window.document.querySelector('#main footer').remove()

  assert.equal(adapter.getComposerState().available, false)
  assert.equal(adapter.getComposerState().reason, 'composer_not_found')
  assert.deepEqual(
    { ...(await adapter.applyMessage('Olá')) },
    { applied: false, reason: 'composer_not_found' },
  )
  assert.equal(adapter.hasSendControl(), false)
  assert.deepEqual(
    { ...adapter.triggerSend() },
    { sent: false, reason: 'send_control_not_found' },
  )
})

test('§7: elementos da plataforma não são exportados ao Core', () => {
  const { adapter } = createAdapter()

  for (const name of [
    'getWhatsAppComposer',
    'getWhatsAppSendButton',
    'writeTextInComposer',
    'getAudioBlobForTarget',
  ]) {
    assert.equal(adapter[name], undefined, name)
  }

  assert.equal(typeof adapter.getAudioSource, 'function')

  const handlesBlock = sliceFunction(
    adapterSource,
    'function getVisibleAudioTargets() {',
  )

  assert.match(
    handlesBlock,
    /Object\.freeze\(\{\s*index: target\.index,\s*key: target\.key,\s*durationSeconds: target\.durationSeconds,\s*\}\)/,
  )
  assert.doesNotMatch(handlesBlock, /element:|container:/)
  assert.equal(adapter.getVisibleAudioTargets().length, 0)
})

test('§5: Core não recebe elementos, não monta no body e não cita a plataforma na copy', () => {
  for (const forbidden of [
    'getWhatsAppComposer',
    'getWhatsAppSendButton',
    'writeTextInComposer',
    'document.body.appendChild',
    'composer.textContent',
    '.click()',
  ]) {
    assert.equal(coreSource.includes(forbidden), false, forbidden)
  }

  const createPanelBlock = sliceFunction(coreSource, 'function createPanel() {')

  assert.match(createPanelBlock, /channelAdapter\.getMountPoint\(\)/)
  assert.match(createPanelBlock, /if \(!mountPoint\) \{\s*return null\s*\}/)
  assert.match(createPanelBlock, /mountPoint\.appendChild\(panel\)/)

  // Identificadores do Core são neutros de canal (comentários à parte).
  const coreCode = coreSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  assert.deepEqual(
    coreCode.match(/\b\w*WhatsApp\w*\b/g) || [],
    [],
  )
  assert.match(coreSource, /channelAdapter\.getCapabilities\?\.\(\)/)

  // Nenhum literal de copy do Core ou do controller de MENSAGEM cita o
  // WhatsApp; comentários e identificadores legados não são copy.
  for (const [name, source] of [
    ['companion-core.js', coreSource],
    ['companion-message-controller.js', messageControllerSource],
  ]) {
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const literals =
      withoutComments.match(/'[^'\n]*'|`[^`]*`|"[^"\n]*"/g) || []

    const offending = literals.filter((literal) =>
      /WhatsApp/.test(literal),
    )

    assert.deepEqual(offending, [], name)
  }
})

test('§8: Core consulta capabilities antes de oferecer interceptação, áudio, inserção e telefone', () => {
  for (const [marker, capability] of [
    ['function observeManualChannelSend() {', 'canInterceptSend'],
    ['function observeComposerDraftForPreSend() {', 'canInterceptSend'],
    ['function listenToChannelAudio() {', 'canReadAudio'],
    ['async function insertSuggestedMessageInChannelWithOptions(', 'canApplyMessage'],
    ['async function runAutomaticContactLookup(conversationKey) {', 'canProvideTrustedPhone'],
    ['function createPanel() {', 'canProvideMountPoint'],
  ]) {
    assert.match(
      sliceFunction(coreSource, marker),
      new RegExp(`hasChannelCapability\\('${capability}'\\)`),
      marker,
    )
  }
})
