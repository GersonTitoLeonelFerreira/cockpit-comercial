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
    const observerStart =
      contentScript.indexOf(
        'function observeWhatsAppChanges()',
      )

    assert.notEqual(
      observerStart,
      -1,
    )

    const observerBlock =
      contentScript.slice(
        observerStart,
        observerStart + 3500,
      )

    assert.match(
      observerBlock,
      /scheduleCaptureIngestion\(\)[\s\S]*scheduleAutomaticAnalysis\([\s\S]*Nova mensagem detectada/,
    )

    assert.doesNotMatch(
      observerBlock,
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
