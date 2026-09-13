import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contentScript = readFileSync(
  new URL('../src/content-script.js', import.meta.url),
  'utf8',
)

test(
  'nova mensagem usa a fotografia real da conversa para rearmar a analise automatica',
  () => {
    const processingStart =
      contentScript.indexOf(
        'function processObservedWhatsAppChange()',
      )

    const observerStart =
      contentScript.indexOf(
        'function observeWhatsAppChanges()',
        processingStart,
      )

    assert.notEqual(
      processingStart,
      -1,
    )

    assert.notEqual(
      observerStart,
      -1,
    )

    const processingBlock =
      contentScript.slice(
        processingStart,
        observerStart,
      )

    assert.match(
      processingBlock,
      /refreshConversationSnapshot\(\)[\s\S]*scheduleCaptureIngestion\(\)[\s\S]*scheduleAutomaticAnalysis\([\s\S]*Nova mensagem detectada/,
    )

    assert.doesNotMatch(
      processingBlock,
      /handleConversationActivityForAutomaticAnalysis\(\)/,
    )
  },
)

test(
  'mutacoes paralelas do WhatsApp nao reiniciam o mesmo temporizador de oito segundos',
  () => {
    const start =
      contentScript.indexOf(
        'function scheduleAutomaticAnalysis(message)',
      )

    const end =
      contentScript.indexOf(
        'function handleConversationActivityForAutomaticAnalysis()',
        start,
      )

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const block =
      contentScript.slice(
        start,
        end,
      )

    const sameKeyGuard =
      block.indexOf(
        'automaticAnalysisScheduledKey ===',
      )

    const clearTimer =
      block.indexOf(
        'clearAutomaticAnalysisTimer()',
      )

    assert.ok(
      sameKeyGuard >= 0,
    )

    assert.ok(
      clearTimer > sameKeyGuard,
    )
  },
)
