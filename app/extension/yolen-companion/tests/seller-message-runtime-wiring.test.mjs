import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('seller-message composer is explicitly synchronized after lead summary becomes ready', async () => {
  const contentScript = await readFile(
    'app/extension/yolen-companion/src/content-script.js',
    'utf8',
  )

  assert.match(
    contentScript,
    /companionLeadSummary:\s*\{\s*status:\s*'ready',[\s\S]*?YolenCompanionSellerMessageRuntime[\s\S]*?\.syncContext\?\.\(/,
  )
  assert.match(
    contentScript,
    /wirePanelInteractions\(panel\)[\s\S]*?YolenCompanionSellerMessageRuntime[\s\S]*?\.render\?\.\(\)/,
  )
})

test('seller-message runtime exposes syncContext and clears on conversation switch', async () => {
  // STEP 2B.5-D1: syncContext() foi extraído de seller-message-runtime.js
  // para o engine compartilhado companion-seller-message-engine.js (usado
  // tanto por WhatsApp quanto por ManyChat) — seller-message-runtime.js
  // continua expondo syncContext no objeto público
  // YolenCompanionSellerMessageRuntime, só que apontando para
  // engine.syncContext em vez de uma função local.
  const [runtime, engine, contentScript] = await Promise.all([
    readFile(
      'app/extension/yolen-companion/src/seller-message-runtime.js',
      'utf8',
    ),
    readFile(
      'app/extension/yolen-companion/src/companion-seller-message-engine.js',
      'utf8',
    ),
    readFile(
      'app/extension/yolen-companion/src/content-script.js',
      'utf8',
    ),
  ])

  assert.match(engine, /function syncContext\(payload, data\)/)
  assert.match(
    runtime,
    /YolenCompanionSellerMessageRuntime = Object\.freeze\(\{[\s\S]*?syncContext: engine\.syncContext,/,
  )
  assert.match(
    contentScript,
    /function hardResetConversationWorkspace\(\)[\s\S]*?YolenCompanionSellerMessageRuntime[\s\S]*?\.clear\?\.\(\)/,
  )
})
