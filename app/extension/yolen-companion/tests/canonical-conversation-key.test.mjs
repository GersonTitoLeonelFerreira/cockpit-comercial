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
  const functionStart = contentScript.indexOf(
    'async function analyzeCurrentConversation(',
  )

  assert.notEqual(functionStart, -1)

  const analyzeStart = contentScript.indexOf(
    '.analyzeConversation({',
    functionStart,
   )

  assert.notEqual(analyzeStart, -1)

  const functionBlock = contentScript.slice(
    functionStart,
    analyzeStart,
   )

  const analyzeBlock = contentScript.slice(
    analyzeStart,
    analyzeStart + 900,
   )

  // A chave enviada na análise vem da MESMA leitura canônica usada pela
  // captura (getCaptureConversationKey()), capturada uma única vez no
  // início da função e reutilizada tanto na requisição quanto no guard
  // de identidade de contexto (isAnalysisResponseStillCurrent) — não
  // recalculada ad-hoc no meio da função.
  assert.match(
    functionBlock,
    /conversationKeyAtRequest\s*=\s*\n?\s*getCaptureConversationKey\(\)/,
  )

  assert.match(
    analyzeBlock,
    /conversation_key:\s*conversationKeyAtRequest/,
  )
})
