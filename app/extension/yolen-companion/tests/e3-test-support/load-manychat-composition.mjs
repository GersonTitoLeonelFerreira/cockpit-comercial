// FASE 7 — harness de integração do ManyChat = composição efetiva do
// manifest (INV-9). Carrega, na mesma sandbox node:vm + jsdom do E3, a
// bridge isolated de identidade segura (document_start) e depois a lista
// EXATA do content script ManyChat (document_idle): o mesmo bootstrap,
// Core, controllers e views do WhatsApp com o ManyChatAdapter, ligados pelo
// manychat-content-script.js real. Nada é mockado dentro da composição; o
// único ponto controlado é o transporte do background, que passa pelo
// módulo REAL de privacidade do background (companion-background-privacy.js)
// com um remetente app.manychat.com, como no navegador.
//
// O pacote e2e grava a fonte e2e do kill switch no MESMO pathname do
// manifest (build-package.mjs); `flags: 'e2e'` reproduz esse staging e
// `flags: 'normal'` carrega a fonte normal (sempre false).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { loadCompanionComposition } from './load-content-script.mjs'

const require = createRequire(import.meta.url)
const backgroundPrivacyModule = require('../../src/companion-background-privacy.js')

export const MANYCHAT_BRIDGE_FILES = Object.freeze([
  'manychat-safe-identity-bridge.js',
])

export const MANYCHAT_MANIFEST_FILES = Object.freeze([
  'yolen-api.js',
  'ux8-interaction-consistency-runtime.js',
  'lead-summary-expand-state.js',
  'message-mutations.js',
  'conversation-registration-tools.js',
  'capture-batch.js',
  'capture-resilience.js',
  'capture-resilience-null-base.js',
  'lead-enrichment.js',
  'companion-client-context-view.js',
  'companion-lead-summary-view.js',
  'companion-seller-information-view.js',
  'companion-reasoning-view.js',
  'companion-conversation-boundary.js',
  'companion-lead-resolution-controller.js',
  'companion-workspace-runtime.js',
  'platform-contract.js',
  'manychat-surface.js',
  'manychat-message-semantics.js',
  'manychat-message-identity.js',
  'manychat-message-content.js',
  'manychat-message-profile.js',
  'manychat-dom-reader.js',
  'manychat-composer.js',
  'manychat-phone-evidence.js',
  'manychat-audio-source.js',
  'manychat-channel-adapter.js',
  'companion-analysis-controller.js',
  'companion-lead-creation-controller.js',
  'companion-contact-link-controller.js',
  'companion-conversation-registration-controller.js',
  'companion-lead-enrichment-controller.js',
  'companion-lead-summary-controller.js',
  'companion-message-controller.js',
  'companion-core-api-composition.js',
  'companion-client-controller.js',
  'companion-core.js',
  'companion-bootstrap.js',
  'manychat-feature-flags.js',
  'manychat-content-script.js',
  'panel-stability-runtime.js',
  'editable-field-stability-runtime.js',
  'lead-automation.js',
])

const MANIFEST_PATH = new URL('../../manifest.json', import.meta.url)
const MANYCHAT_MATCH = 'https://app.manychat.com/*'

export function assertManyChatHarnessMatchesManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const blocks = manifest.content_scripts.filter(
    (entry) => !entry.world && entry.matches.includes(MANYCHAT_MATCH),
  )
  const strip = (files) => (files ?? []).map((file) => file.replace(/^src\//, ''))
  const bridge = blocks.find((entry) => entry.run_at === 'document_start')
  const runtime = blocks.find((entry) => entry.run_at === 'document_idle')

  if (JSON.stringify(strip(bridge?.js)) !== JSON.stringify(MANYCHAT_BRIDGE_FILES)) {
    throw new Error(`E3 harness diverge da bridge ManyChat do manifest: ${JSON.stringify(strip(bridge?.js))}`)
  }

  if (JSON.stringify(strip(runtime?.js)) !== JSON.stringify(MANYCHAT_MANIFEST_FILES)) {
    throw new Error(
      'E3 harness diverge do manifest ManyChat: ' +
        JSON.stringify({ manifest: strip(runtime?.js), harness: MANYCHAT_MANIFEST_FILES }),
    )
  }
}

export const CHAT_A_URL = 'https://app.manychat.com/fb3678277/chat/438324835'
export const CHAT_B_URL = 'https://app.manychat.com/fb3678277/chat/999999999'
export const KEY_X = `manychat:contact:v1:sha256:${'a'.repeat(64)}`
export const KEY_Y = `manychat:contact:v1:sha256:${'b'.repeat(64)}`
export const KEY_Z = `manychat:contact:v1:sha256:${'d'.repeat(64)}`
export const CHANNEL_KEY = `manychat:channel:whatsapp:v1:sha256:${'c'.repeat(64)}`

// Mesma estrutura já validada ao vivo (MANYCHAT_*_GATE.md) e usada pelos
// testes do ManyChatAdapter.
export function manyChatMessageHtml(message) {
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

export function manyChatPageHtml({ messages = [], contactHtml = '', draft = '' } = {}) {
  return `<!doctype html><html><body>
    <main>
      <div data-test-id="chat-messages-list">${messages.map(manyChatMessageHtml).join('')}</div>
      <section class="userColumnContent_1">${contactHtml}</section>
      <footer><textarea>${draft}</textarea><button type="button" data-test-id="send">Enviar</button></footer>
    </main>
  </body></html>`
}

// Evidência de telefone em contexto WhatsApp (fora de details-subscriber-id),
// no formato aceito por manychat-phone-evidence.js.
export function whatsAppPhoneContactHtml(phone) {
  return `<div>WhatsApp</div><div>${phone}</div>`
}

export function safeIdentityResponse(key) {
  if (!key) {
    return { ok: false, statusCode: 409, payload: { ready: false, reason: 'identity_unavailable', safe: null } }
  }

  return {
    ok: true,
    statusCode: 200,
    payload: {
      ready: true,
      reason: null,
      safe: {
        platform: 'manychat',
        platform_identity: { source: 'subscriber_id', key },
        channel_identity: { channel: 'whatsapp', source: 'whatsapp_user_id', key: CHANNEL_KEY },
      },
    },
  }
}

// currentIdentity(): chave segura do contato aberto AGORA (controlada pelo
// teste). fetchAudioSource(url): resposta do background para a mídia.
export function loadManyChatComposition({
  url = CHAT_A_URL,
  pageHtml = manyChatPageHtml(),
  flags = 'e2e',
  currentIdentity = () => KEY_X,
  fetchAudioSource,
  extraHandlers = {},
  ...options
} = {}) {
  assertManyChatHarnessMatchesManifest()

  const privacy = backgroundPrivacyModule.createBackgroundPrivacy()
  // O que o content script ManyChat efetivamente recebe (já sanitizado) e
  // o que o transporte efetivamente recebe (depois de prepareRequest).
  const delivered = []
  const transported = []
  const sender = { tab: { id: 7, url }, frameId: 0, url }

  const sourceOverrides =
    flags === 'e2e'
      ? {
          'manychat-feature-flags.js': readFileSync(
            new URL('../../src/manychat-feature-flags.e2e.js', import.meta.url),
            'utf8',
          ),
        }
      : {}

  const runtime = loadCompanionComposition({
    ...options,
    files: [...MANYCHAT_BRIDGE_FILES, ...MANYCHAT_MANIFEST_FILES],
    url,
    initialHtml: pageHtml,
    sourceOverrides,
    extraHandlers: {
      GET_MANYCHAT_SAFE_IDENTITY: async () => safeIdentityResponse(await currentIdentity()),
      FETCH_MANYCHAT_AUDIO_SOURCE: async (payload) =>
        typeof fetchAudioSource === 'function'
          ? fetchAudioSource(payload?.audio_url)
          : { ok: false, statusCode: 404, payload: { ready: false, reason: 'not_configured' } },
      ...extraHandlers,
    },
    // Mesmo caminho do background real: prepareRequest → transporte →
    // sanitizeResponse, com remetente app.manychat.com.
    wrapSendMessage: (dispatch) => async (message) => {
      const prepared = privacy.prepareRequest(message, sender)
      if (prepared.response) {
        delivered.push({ action: message.action, response: prepared.response })
        return prepared.response
      }
      transported.push(prepared.message)
      const response = await dispatch(prepared.message)
      const sanitized = privacy.sanitizeResponse(prepared.message, sender, response)
      delivered.push({ action: message.action, response: sanitized })
      return sanitized
    },
  })

  return {
    ...runtime,
    delivered,
    transported,
    navigate(nextUrl) {
      runtime.window.history.pushState({}, '', nextUrl)
    },
  }
}
