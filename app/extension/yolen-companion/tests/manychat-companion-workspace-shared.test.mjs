// STEP 2B.5-B — prova arquitetural de que o ManyChat passou a consumir o
// MESMO workspace compartilhado que o WhatsApp já usa
// (companion-workspace-runtime.js), sem recriar SELLER_AREAS, o gerador
// de tabs/panels ou a navegação por teclado localmente.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [
  contentScript,
  manyChatSellerPanelRuntime,
  manyChatCaptureBootstrap,
  manifestRaw,
] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/manychat-seller-panel-runtime.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/manychat-capture-bootstrap.js', 'utf8'),
  readFile('app/extension/yolen-companion/manifest.json', 'utf8'),
])

const manifest = JSON.parse(manifestRaw)

test('A: WhatsApp e ManyChat referenciam o MESMO global YolenCompanionWorkspaceRuntime', () => {
  assert.match(contentScript, /globalThis\s*\.\s*YolenCompanionWorkspaceRuntime/)
  assert.match(manyChatSellerPanelRuntime, /root\.YolenCompanionWorkspaceRuntime/)

  // Só existe UM arquivo físico que registra esse global (a fonte
  // canônica) — nem content-script.js nem o runtime ManyChat podem
  // registrar `root.YolenCompanionWorkspaceRuntime = ...` eles mesmos.
  assert.doesNotMatch(contentScript, /YolenCompanionWorkspaceRuntime\s*=\s*(?:Object\.freeze\(|\{)/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /YolenCompanionWorkspaceRuntime\s*=\s*(?:Object\.freeze\(|\{)/)
})

test('B: manifest do ManyChat carrega companion-workspace-runtime.js ANTES de manychat-seller-panel-runtime.js e do bootstrap', () => {
  const manyChatBlock = manifest.content_scripts.find(
    (block) =>
      block.matches?.includes('https://app.manychat.com/*') &&
      block.js?.some((file) => file.endsWith('manychat-seller-panel-runtime.js')),
  )

  assert.ok(manyChatBlock, 'bloco de content_scripts do ManyChat com o seller panel runtime não encontrado')

  const workspaceIndex = manyChatBlock.js.indexOf('src/companion-workspace-runtime.js')
  const sellerPanelIndex = manyChatBlock.js.indexOf('src/manychat-seller-panel-runtime.js')
  const bootstrapIndex = manyChatBlock.js.indexOf('src/manychat-capture-bootstrap.js')

  assert.notEqual(workspaceIndex, -1)
  assert.notEqual(sellerPanelIndex, -1)
  assert.notEqual(bootstrapIndex, -1)
  assert.ok(workspaceIndex < sellerPanelIndex)
  assert.ok(sellerPanelIndex < bootstrapIndex)
})

test('C: manychat-seller-panel-runtime.js não contém uma lista própria equivalente a SELLER_AREAS', () => {
  assert.doesNotMatch(
    manyChatSellerPanelRuntime,
    /\[\s*'now'\s*,\s*'message'\s*,\s*'analysis'\s*,\s*'client'\s*\]/,
  )
  assert.doesNotMatch(manyChatSellerPanelRuntime, /const SELLER_AREAS/)
})

test('D: ManyChat (seller panel runtime + bootstrap) não reimplementa localmente as funções do módulo compartilhado', () => {
  for (const source of [manyChatSellerPanelRuntime, manyChatCaptureBootstrap]) {
    assert.doesNotMatch(source, /function getSellerAreaTabHtml\(/)
    assert.doesNotMatch(source, /function getSellerAreaPanelHtml\(/)
    assert.doesNotMatch(source, /function getSellerAreaTabsBarHtml\(/)
    assert.doesNotMatch(source, /function getNextSellerAreaForKeydown\(/)
  }

  // E usa de fato o módulo compartilhado para essas responsabilidades.
  assert.match(manyChatSellerPanelRuntime, /workspaceRuntimeApi\.getSellerAreaTabsBarHtml\(/)
  assert.match(manyChatSellerPanelRuntime, /workspaceRuntimeApi\.getSellerAreaPanelHtml\(/)
  assert.match(manyChatCaptureBootstrap, /workspaceRuntimeApi\.getNextSellerAreaForKeydown\(/)
})

test('M: o antigo shell empilhado (<h3>AGORA</h3>/<h3>ANÁLISE</h3>/<h3>CLIENTE</h3>) não existe mais no ManyChat', () => {
  assert.doesNotMatch(manyChatSellerPanelRuntime, /<h3>AGORA<\/h3>/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /<h3>ANÁLISE<\/h3>/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /<h3>CLIENTE<\/h3>/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /data-yolen-section="agora"/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /data-yolen-section="analise"/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /data-yolen-section="cliente"/)
  assert.doesNotMatch(manyChatSellerPanelRuntime, /data-yolen-section="suggested-message"/)
})
