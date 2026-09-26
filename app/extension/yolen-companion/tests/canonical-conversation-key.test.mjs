import assert from 'node:assert/strict'
import test from 'node:test'
import { readWhatsAppCompositionSource } from './support/whatsapp-composition-source.mjs'

const contentScript = readWhatsAppCompositionSource()

test('captura e analise priorizam o telefone confirmado pelo vinculo do lead', () => {
  // FASE 8 — a derivação virou deriveCaptureConversationKey (dona única,
  // usada pela captura ao vivo e pela reposição da captura retida);
  // getCaptureConversationKey só a alimenta com o estado atual.
  const start = contentScript.indexOf(
    'function deriveCaptureConversationKey(',
  )
  const end = contentScript.indexOf(
    'function canIngestCurrentCapture()',
    start,
  )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  const block = contentScript.slice(start, end)

  const resolutionPhone = block.indexOf(
    'resolution?.phone',
  )
  const leadPhone = block.indexOf(
    'resolution?.lead?.phone',
  )
  const transientPhone = block.indexOf(
    'phone,\n',
    leadPhone,
  )

  assert.ok(resolutionPhone >= 0)
  assert.ok(leadPhone > resolutionPhone)
  assert.ok(transientPhone > leadPhone)

  assert.match(
    block,
    /buildStableCaptureConversationKey\(\{[\s\S]*phone:\s*resolution\?\.phone/,
  )

  const live = block.slice(
    block.indexOf('function getCaptureConversationKey()'),
  )
  assert.match(live, /resolution:\s*state\.leadResolution/)
  assert.match(live, /phone:\s*state\.conversationPhone/)
  assert.match(live, /title:\s*state\.conversationTitle/)
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
