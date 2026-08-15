import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test('captura e analise priorizam o telefone confirmado pelo vinculo do lead', () => {
  const start = contentScript.indexOf(
    'function getCaptureConversationKey()',
  )
  const end = contentScript.indexOf(
    'function canIngestCurrentCapture()',
    start,
  )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  const block = contentScript.slice(start, end)

  const resolutionPhone = block.indexOf(
    'state.leadResolution?.phone',
  )
  const leadPhone = block.indexOf(
    'state.leadResolution?.lead?.phone',
  )
  const transientPhone = block.indexOf(
    'state.conversationPhone',
  )

  assert.ok(resolutionPhone >= 0)
  assert.ok(leadPhone > resolutionPhone)
  assert.ok(transientPhone > leadPhone)

  assert.match(
    block,
    /buildStableCaptureConversationKey\(\{[\s\S]*phone:\s*canonicalPhone/,
  )
})

test('analise envia a mesma chave canonica usada pela captura', () => {
  const analyzeStart = contentScript.indexOf(
    '.analyzeConversation({',
   )

  assert.notEqual(analyzeStart, -1)

  const analyzeBlock = contentScript.slice(
    analyzeStart,
    analyzeStart + 900,
   )

  assert.match(
    analyzeBlock,
    /conversation_key:\s*getCaptureConversationKey\(\)/,
  )
})
