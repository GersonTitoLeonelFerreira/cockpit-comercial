// FASE 7 — enforcement estrutural da fronteira Core → contrato → adapter.
//
// 1. Os módulos ManyChat carregados pelo manifest são só canal: nenhum
//    status comercial, ação de backend, área seller-facing, view ou estado
//    do Core é reconstruído neles (sem segundo cérebro seller-facing).
// 2. Core, controllers, views e bootstrap compartilhados não conhecem
//    implementação ManyChat (globals, seletores, hosts, arquivos).
// 3. A composição ManyChat carrega EXATAMENTE os mesmos módulos
//    compartilhados do WhatsApp, na mesma ordem relativa (sem fork).
// Cada regra tem controle positivo sintético que prova que o detector
// acusa a violação.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const SRC = new URL('../src/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

function read(file) {
  return readFileSync(new URL(file, SRC), 'utf8')
}

// Remove comentários de linha/bloco (heurística suficiente para estes
// arquivos: nenhum deles tem "//" ou "/*" dentro de string literal usada
// pelas regras abaixo).
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const strip = (file) => file.replace(/^src\//, '')
const manyChatEntries = manifest.content_scripts.filter((entry) => entry.matches.includes('https://app.manychat.com/*'))
const whatsAppEntry = manifest.content_scripts.find((entry) => !entry.world && entry.matches.includes('https://web.whatsapp.com/*'))
const manyChatRuntimeEntry = manyChatEntries.find((entry) => !entry.world && entry.run_at === 'document_idle')

const WHATSAPP_CHANNEL_FILES = new Set(['whatsapp-adapter.js', 'content-script.js'])
const SHARED_FILES = whatsAppEntry.js.map(strip).filter((file) => !WHATSAPP_CHANNEL_FILES.has(file))
const MANYCHAT_CHANNEL_FILES = manyChatEntries
  .flatMap((entry) => entry.js)
  .map(strip)
  .filter((file) => !SHARED_FILES.includes(file))

// ---------------------------------------------------------------------------
// Regra 1 — ManyChat só canal
// ---------------------------------------------------------------------------

const SELLER_FACING_PATTERNS = Object.freeze([
  ['status comercial', /['"`](?:OWNED_BY_ME|OWNED_BY_OTHER|IN_POOL|CLOSED_CYCLE|CONTACT_NOT_LINKED|NOT_FOUND|WORKSPACE_READY|LEAD_CREATE_READY|NO_CONTACT_EVIDENCE)['"`]/],
  ['ação comercial de backend', /['"`](?:RESOLVE_LEAD|CREATE_LEAD|ANALYZE_CONVERSATION|GET_ANALYSIS_JOB_STATUS|APPLY_SUGGESTION|APPLY_LEAD_ENRICHMENT|REGISTER_MESSAGE_ACTION|SEARCH_LINKABLE_LEADS|FIRST_LINK_EXTERNAL_IDENTITY|TRANSCRIBE_AUDIO|INGEST_CAPTURE_MESSAGES|LOAD_[A-Z_]+|(?:PREVIEW|CONFIRM)_CONVERSATION_REGISTRATION|(?:SAVE)_LEAD_SUMMARY)['"`]/],
  ['área seller-facing', /data-yolen-seller-area|data-yolen-seller-panel|data-yolen-section|SELLER_AREAS/],
  ['view/estado do Core', /YolenCompanion(?:Core|WorkspaceRuntime|\w*View|\w*Controller|CoreApiComposition|Api)\b/],
  ['resolução/decisão comercial', /\b(?:leadResolution|leadResolutionViewModel|decisionState|commercial_reading|recommended_message|best_approach|next_action)\b/],
])

// O content script do canal só pode tocar o bootstrap e a fronteira
// compartilhados (pré-condição de composição), nunca o Core diretamente.
const CONTENT_SCRIPT_ALLOWED = /YolenCompanion(?:Bootstrap|ConversationBoundary)\b/

export function detectSellerFacingLogic(name, code) {
  const stripped = stripComments(code)
  const found = []
  for (const [label, pattern] of SELLER_FACING_PATTERNS) {
    const match = stripped.match(pattern)
    if (!match) continue
    if (label === 'view/estado do Core' && name === 'manychat-content-script.js') continue
    found.push(`${name}: ${label} (${match[0]})`)
  }
  if (name === 'manychat-content-script.js') {
    for (const match of stripped.matchAll(/YolenCompanion\w+/g)) {
      if (!CONTENT_SCRIPT_ALLOWED.test(match[0])) found.push(`${name}: global do Core (${match[0]})`)
    }
  }
  return found
}

test('composição ManyChat: módulos de canal presentes e nenhum módulo WhatsApp', () => {
  assert.ok(MANYCHAT_CHANNEL_FILES.includes('manychat-channel-adapter.js'))
  assert.ok(MANYCHAT_CHANNEL_FILES.includes('manychat-content-script.js'))
  assert.ok(MANYCHAT_CHANNEL_FILES.every((file) => !file.startsWith('whatsapp-') && file !== 'content-script.js'))
})

test('Q: nenhum módulo ManyChat composto contém lógica seller-facing (sem segundo cérebro)', () => {
  const violations = MANYCHAT_CHANNEL_FILES.flatMap((file) => detectSellerFacingLogic(file, read(file)))
  assert.deepEqual(violations, [])
})

test('Q (controle positivo): o detector acusa lógica seller-facing sintética no canal', () => {
  const samples = {
    'manychat-x.js': "if (resolution.status === 'OWNED_BY_ME') render()",
    'manychat-y.js': "sendMessage({ action: 'LOAD_DECISION_STATE' })",
    'manychat-z.js': "panel.querySelector('[data-yolen-seller-area=\"now\"]')",
    'manychat-w.js': 'root.YolenCompanionSellerInformationView.render()',
    'manychat-v.js': 'const text = reading.recommended_message',
    'manychat-content-script.js': 'root.YolenCompanionCore.create({})',
  }
  for (const [name, code] of Object.entries(samples)) {
    assert.ok(detectSellerFacingLogic(name, code).length > 0, name)
  }
  assert.deepEqual(detectSellerFacingLogic('manychat-content-script.js', 'root.YolenCompanionBootstrap.create({}); root.YolenCompanionConversationBoundary'), [])
  assert.deepEqual(detectSellerFacingLogic('manychat-composer.js', "// OWNED_BY_ME só em comentário\nreturn { reason: 'composer_not_found' }"), [])
})

// ---------------------------------------------------------------------------
// Regra 2 — Core/compartilhados sem implementação ManyChat
// ---------------------------------------------------------------------------

const MANYCHAT_IMPLEMENTATION_PATTERNS = Object.freeze([
  ['global ManyChat', /\bYolenManyChat\w*/],
  ['arquivo ManyChat', /manychat-[\w-]+\.js/],
  ['host ManyChat', /manychat\.com|manybot-files/],
  ['seletor/atributo DOM ManyChat', /chat-messages-list|data-title-at|data-title-offset-bottom|data-mid\b|userColumnContent|details-subscriber-id|_typeIn_|_typeOut_|_botMessage_/],
  ['mensagem de transporte ManyChat', /GET_MANYCHAT_SAFE_IDENTITY|FETCH_MANYCHAT_AUDIO_SOURCE|TRANSCRIBE_MANYCHAT_AUDIO/],
])

export function detectManyChatImplementation(name, code) {
  const stripped = stripComments(code)
  return MANYCHAT_IMPLEMENTATION_PATTERNS
    .filter(([, pattern]) => pattern.test(stripped))
    .map(([label]) => `${name}: ${label}`)
}

test('§23: Core, controllers, views e bootstrap compartilhados não conhecem implementação ManyChat', () => {
  const violations = SHARED_FILES.flatMap((file) => detectManyChatImplementation(file, read(file)))
  assert.deepEqual(violations, [])
})

test('§23 (controle positivo): o detector acusa detalhe ManyChat sintético no Core', () => {
  for (const code of [
    'root.YolenManyChatComposer.find()',
    "document.querySelector('div[data-test-id=\"chat-messages-list\"]')",
    "if (location.host === 'app.manychat.com') {}",
    "sendMessage({ action: 'GET_MANYCHAT_SAFE_IDENTITY' })",
    "import('./manychat-composer.js')",
  ]) {
    assert.ok(detectManyChatImplementation('companion-core.js', code).length > 0, code)
  }
})

// ---------------------------------------------------------------------------
// Regra 3 — mesma composição compartilhada nos dois canais
// ---------------------------------------------------------------------------

test('ManyChat carrega exatamente os mesmos módulos compartilhados do WhatsApp, na mesma ordem relativa', () => {
  const manyChatShared = manyChatRuntimeEntry.js.map(strip).filter((file) => SHARED_FILES.includes(file))
  assert.deepEqual(manyChatShared, SHARED_FILES)
  for (const file of ['companion-core.js', 'companion-bootstrap.js', 'companion-workspace-runtime.js', 'companion-seller-information-view.js', 'companion-message-controller.js', 'companion-analysis-controller.js', 'companion-client-controller.js', 'companion-lead-creation-controller.js']) {
    assert.ok(SHARED_FILES.includes(file), file)
  }
  // Nenhum Core/view alternativo só do ManyChat.
  assert.ok(MANYCHAT_CHANNEL_FILES.every((file) => !/^companion-/.test(file)))
})
