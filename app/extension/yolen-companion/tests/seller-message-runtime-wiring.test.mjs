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
  const [runtime, contentScript] = await Promise.all([
    readFile(
      'app/extension/yolen-companion/src/seller-message-runtime.js',
      'utf8',
    ),
    readFile(
      'app/extension/yolen-companion/src/content-script.js',
      'utf8',
    ),
  ])

  assert.match(runtime, /function syncContext\(payload, data\)/)
  assert.match(
    runtime,
    /YolenCompanionSellerMessageRuntime = Object\.freeze\(\{[\s\S]*?syncContext,/,
  )
  assert.match(
    contentScript,
    /function clearLeadStateForNewConversation\(\)[\s\S]*?YolenCompanionSellerMessageRuntime[\s\S]*?\.clear\?\.\(\)/,
  )
})
