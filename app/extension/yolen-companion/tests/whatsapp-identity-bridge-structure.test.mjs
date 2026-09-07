// P0 — Real WhatsApp Active Chat Identity: prova por texto-fonte de que o
// bridge é carregado pelo mecanismo NATIVO do Manifest V3 (content_scripts
// com "world": "MAIN", "run_at": "document_start") — não mais por injeção
// manual de <script src> — e que o protocolo request/response por
// postMessage (sem polling) e as regras de validação continuam intactos,
// sem nenhuma navegação sintética introduzida em content-script.js.
//
// Correção de arquitetura: a injeção manual (document.createElement
// ('script') + runtime.getURL + appendChild, o mesmo padrão de
// whatsapp-audio-bridge.js) foi comprovada, por diagnóstico real no
// Firefox, como insuficiente para este bridge — bridgeInstalled
// permanecia false mesmo com o React Fiber e o mapeamento LID -> PN
// comprovadamente acessíveis na página. Trocado pela declaração nativa
// "world": "MAIN" do Manifest V3.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bridgeSource = readFileSync(
  new URL('../src/whatsapp-identity-bridge.js', import.meta.url),
  'utf8',
)

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

const manifest = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
)

function blockBetween(source, startMarker, endMarker, fromIndex = 0) {
  const start = source.indexOf(startMarker, fromIndex)
  const end = source.indexOf(endMarker, start)

  assert.notEqual(start, -1, `marcador de início não encontrado: ${startMarker}`)
  assert.notEqual(end, -1, `marcador de fim não encontrado: ${endMarker}`)

  return source.slice(start, end)
}

test('A/B/C) manifest: bloco dedicado com world MAIN, document_start, contendo só o bridge de identidade', () => {
  const mainWorldBlock = manifest.content_scripts.find(
    (block) => block.world === 'MAIN',
  )

  assert.ok(mainWorldBlock, 'esperava um bloco content_scripts com "world": "MAIN"')
  assert.deepEqual(mainWorldBlock.matches, ['https://web.whatsapp.com/*'])
  assert.deepEqual(mainWorldBlock.js, ['src/whatsapp-identity-bridge.js'])
  assert.equal(mainWorldBlock.run_at, 'document_start')
})

test('D) whatsapp-identity-bridge.js não está em nenhum bloco ISOLATED (sem world, ou world diferente de MAIN)', () => {
  const isolatedBlocksWithBridge = manifest.content_scripts.filter(
    (block) =>
      block.world !== 'MAIN' &&
      (block.js || []).includes('src/whatsapp-identity-bridge.js'),
  )

  assert.deepEqual(isolatedBlocksWithBridge, [])
})

test('E) whatsapp-identity-bridge.js não é mais web_accessible_resource (não precisa mais — carregado nativamente via content_scripts)', () => {
  const whatsappResourceBlock = manifest.web_accessible_resources.find(
    (block) => (block.resources || []).includes('src/whatsapp-identity-bridge.js'),
  )

  assert.equal(whatsappResourceBlock, undefined)

  // whatsapp-audio-bridge.js continua na arquitetura antiga — não faz
  // parte desta correção e não pode ter sido removido por engano.
  const audioResourceBlock = manifest.web_accessible_resources.find(
    (block) => (block.resources || []).includes('src/whatsapp-audio-bridge.js'),
  )

  assert.ok(audioResourceBlock)
})

test('bridge: só responde a mensagens da própria janela, mesma origem, e da fonte esperada (mesmo padrão do audio bridge)', () => {
  assert.match(bridgeSource, /event\.source !== window/)
  assert.match(bridgeSource, /event\.origin !== window\.location\.origin/)
  assert.match(bridgeSource, /event\.data\?\.source !== CONTENT_SCRIPT_SOURCE/)
  assert.match(bridgeSource, /window\.__yolenWhatsAppIdentityBridgeInstalled/)
})

test('bridge: profundidade de fiber é limitada e não hardcoded em depth 1', () => {
  assert.match(bridgeSource, /MAX_FIBER_DEPTH\s*=\s*30/)
  assert.match(bridgeSource, /depth < MAX_FIBER_DEPTH/)
  assert.doesNotMatch(bridgeSource, /depth\s*===\s*1\b/)
  // A chave real do fiber varia por carregamento — nunca pode ser fixa.
  assert.match(bridgeSource, /startsWith\('__reactFiber\$'\)/)
  assert.doesNotMatch(bridgeSource, /__reactFiber\$[0-9a-zA-Z]{2,}['"]/)
})

test('bridge: sem polling — nenhum setInterval, nenhum MutationObserver interno', () => {
  assert.doesNotMatch(bridgeSource, /setInterval/)
  assert.doesNotMatch(bridgeSource, /MutationObserver/)
})

test('bridge: payload de resposta é o protocolo mínimo combinado, sem enviar mensagens/histórico/lista de contatos', () => {
  assert.match(bridgeSource, /action: 'ACTIVE_CHAT_IDENTITY'/)
  assert.match(bridgeSource, /requestId: event\.data\.requestId/)
  assert.match(bridgeSource, /sequence:/)
  assert.match(bridgeSource, /observedAt: Date\.now\(\)/)

  assert.doesNotMatch(bridgeSource, /msgs/)
  assert.doesNotMatch(bridgeSource, /messages/i)
  assert.doesNotMatch(bridgeSource, /contacts/i)
  assert.doesNotMatch(bridgeSource, /history/i)
})

test('bridge: nunca clica, nunca navega, nunca dispara Escape — é leitura pura', () => {
  assert.doesNotMatch(bridgeSource, /\.click\(/)
  assert.doesNotMatch(bridgeSource, /Escape/)
  assert.doesNotMatch(bridgeSource, /dispatchEvent/)
})

test('F/G) content-script não injeta mais o bridge manualmente — nem a função, nem <script>, nem runtime.getURL para ele', () => {
  assert.doesNotMatch(contentScript, /function injectWhatsAppIdentityBridge/)
  assert.doesNotMatch(contentScript, /injectWhatsAppIdentityBridge\(\)/)
  assert.doesNotMatch(
    contentScript,
    /runtime\.getURL\('src\/whatsapp-identity-bridge\.js'\)/,
  )

  // O bridge de áudio continua usando a arquitetura antiga — não pode ter
  // sido removido por engano junto com a do bridge de identidade.
  assert.match(contentScript, /function injectWhatsAppAudioBridge\(\)/)
  assert.match(contentScript, /injectWhatsAppAudioBridge\(\)/)
})

test('H) listener, request e response continuam presentes e intactos após a correção de arquitetura', () => {
  assert.match(contentScript, /function listenToWhatsAppIdentityBridge\(\)/)
  assert.match(contentScript, /function requestActiveChatIdentity\(/)
  assert.match(contentScript, /async function tryResolveViaIdentityBridge\(/)
})

test('BRIDGE_READY é só diagnóstico: requestActiveChatIdentity/tryResolveViaIdentityBridge nunca checam identityBridgeInstalled (o MAIN world pode carregar antes OU depois do listener isolado)', () => {
  const requestBlock = blockBetween(
    contentScript,
    'function requestActiveChatIdentity(',
    'function onlyDigits(',
  )

  assert.doesNotMatch(requestBlock, /identityBridgeInstalled/)

  const tryResolveBlock = blockBetween(
    contentScript,
    'async function tryResolveViaIdentityBridge(',
    'function getVisibleMessagesCount(',
  )

  assert.doesNotMatch(tryResolveBlock, /identityBridgeInstalled/)

  // identityBridgeInstalled só é ESCRITO (ao receber BRIDGE_READY) — nunca
  // lido/checado em lugar nenhum do arquivo, então não pode virar um
  // requisito funcional nem um motivo para introduzir polling/retry.
  const readSites = (contentScript.match(/identityBridgeInstalled/g) || []).length
  assert.equal(readSites, 2, 'esperava só a declaração (let) e a atribuição em BRIDGE_READY — nenhuma leitura')
})

test('content-script: listener do bridge de identidade valida origem/fonte antes de processar', () => {
  const block = blockBetween(
    contentScript,
    'function listenToWhatsAppIdentityBridge()',
    'function requestActiveChatIdentity(',
  )

  assert.match(block, /event\.source !== window/)
  assert.match(block, /event\.origin !== window\.location\.origin/)
  assert.match(
    block,
    /'YOLEN_COMPANION_WHATSAPP_IDENTITY_BRIDGE'/,
  )
})

test('content-script: pedido de identidade é request/response único (sem polling) e o listener descarta respostas de requestId desconhecido', () => {
  const requestBlock = blockBetween(
    contentScript,
    'function requestActiveChatIdentity(',
    'function onlyDigits(',
  )

  assert.match(requestBlock, /window\.postMessage\(/)
  assert.match(requestBlock, /window\.setTimeout\(\(\) => finish\(null\), timeoutMs\)/)
  assert.doesNotMatch(requestBlock, /setInterval/)

  const listenerBlock = blockBetween(
    contentScript,
    'function listenToWhatsAppIdentityBridge()',
    'function requestActiveChatIdentity(',
  )

  assert.match(listenerBlock, /identityBridgeResponseWaiters\.get\(\s*requestId\s*\)/)
  assert.match(listenerBlock, /if \(!waiter\) \{\s*return\s*\}/)
})

test('content-script: validateBridgeIdentityPhone reusa PHONE_JID_DOMAINS (mesma allowlist do fallback JID) e não cria uma nova', () => {
  const block = blockBetween(
    contentScript,
    'function validateBridgeIdentityPhone(',
    'function isProfileOrContactPanelText(',
  )

  assert.match(block, /PHONE_JID_DOMAINS\.has\(\s*phoneServer\s*\)/)
  assert.doesNotMatch(block, /new Set\(\[/)
  assert.match(block, /identity\.isGroup/)
  assert.match(block, /phoneJid/)
})

test('content-script: tryResolveViaIdentityBridge revalida conversationKey (ao vivo e via state) antes de aceitar qualquer resultado', () => {
  const block = blockBetween(
    contentScript,
    'async function tryResolveViaIdentityBridge(',
    'function getVisibleMessagesCount(',
  )

  assert.match(block, /state\.conversationKey !==\s*conversationKey/)
  assert.match(block, /currentConversationKey !==\s*conversationKey/)
  assert.match(block, /getConversationKey\(/)
  assert.match(block, /getMainHeaderPrimaryTitle\(\)/)
})

test('content-script: runAutomaticContactLookup consulta o bridge ANTES do fallback JID de DOM e do painel de contato', () => {
  const block = blockBetween(
    contentScript,
    'async function runAutomaticContactLookup(conversationKey)',
    'function clearLeadStateForNewConversation()',
  )

  const bridgeIndex = block.indexOf('tryResolveViaIdentityBridge(')
  const passiveIndex = block.indexOf('resolvePassivePhoneForConversation(')
  const panelIndex = block.indexOf('if (!hadContactPanelOpen) {')

  assert.ok(bridgeIndex >= 0)
  assert.ok(passiveIndex > bridgeIndex)
  assert.ok(panelIndex > passiveIndex)
})

test('P) integração do bridge não introduz click/Escape/navegação/observer novo', () => {
  const block = blockBetween(
    contentScript,
    'function listenToWhatsAppIdentityBridge()',
    'function onlyDigits(',
  )

  assert.doesNotMatch(block, /\.click\(/)
  assert.doesNotMatch(block, /Escape/)
  assert.doesNotMatch(block, /setInterval/)
  assert.doesNotMatch(block, /new MutationObserver/)
  assert.doesNotMatch(block, /aria-selected=["']true["']/)
})

test('start() só escuta o bridge de identidade — não injeta mais nada para ele (o MAIN world já carrega via manifest)', () => {
  const startBlock = blockBetween(
    contentScript,
    'async function start()',
    '\n  start()',
  )

  const audioListenIndex = startBlock.indexOf('listenToWhatsAppAudioBridge()')
  const audioInjectIndex = startBlock.indexOf('injectWhatsAppAudioBridge()')
  const identityListenIndex = startBlock.indexOf('listenToWhatsAppIdentityBridge()')

  assert.ok(audioListenIndex >= 0)
  assert.ok(audioInjectIndex > audioListenIndex)
  assert.ok(identityListenIndex > audioInjectIndex)
  assert.doesNotMatch(startBlock, /injectWhatsAppIdentityBridge/)
})

test('commits de fallback (b84d300/6c0b9cb) não foram removidos: resolvePassivePhoneForConversation e a allowlist de JID continuam presentes', () => {
  assert.match(contentScript, /function resolvePassivePhoneForConversation\(/)
  assert.match(contentScript, /function collectPhoneJidCandidatesInMain\(/)
  assert.match(contentScript, /function extractPhoneFromJid\(/)
  assert.match(contentScript, /const PHONE_JID_DOMAINS = new Set\(\['c\.us', 's\.whatsapp\.net'\]\)/)
})

test('conversationKey continua no formato canônico existente — esta missão não migra a chave', () => {
  assert.match(
    contentScript,
    /function getConversationKey\(title\) \{\s*const safeTitle =/,
  )
  assert.doesNotMatch(contentScript, /activeWhatsAppIdentity/)
})
