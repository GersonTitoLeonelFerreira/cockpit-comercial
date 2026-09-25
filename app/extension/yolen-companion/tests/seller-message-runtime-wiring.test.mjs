import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readWhatsAppCompositionSource } from './support/whatsapp-composition-source.mjs'

// FASE 5: o composer de MENSAGEM é o controller do Core
// (companion-message-controller.js), composto explicitamente pelo Core.
test('seller-message composer is explicitly synchronized after lead summary becomes ready', async () => {
  const contentScript = await Promise.resolve(readWhatsAppCompositionSource())

  assert.match(
    contentScript,
    /companionLeadSummary:\s*\{\s*status:\s*'ready',[\s\S]*?messageController\.syncContext\(/,
  )
  assert.match(
    contentScript,
    /wirePanelInteractions\(panel\)[\s\S]*?messageController\.render\(\)/,
  )
})

test('seller-message runtime exposes syncContext and clears on conversation switch', async () => {
  const [runtime, contentScript] = await Promise.all([
    readFile(
      'app/extension/yolen-companion/src/companion-message-controller.js',
      'utf8',
    ),
    Promise.resolve(readWhatsAppCompositionSource()),
  ])

  assert.match(runtime, /function syncContext\(payload, data\)/)
  assert.match(
    runtime,
    /return Object\.freeze\(\{[\s\S]*?render: queueRender,[\s\S]*?syncContext,/,
  )
  assert.match(
    contentScript,
    /function hardResetConversationWorkspace\(\)[\s\S]*?messageController\.clear\(\)/,
  )
})
