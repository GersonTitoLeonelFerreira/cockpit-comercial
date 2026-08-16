import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const contentScript =
  readFileSync(
    new URL(
      '../src/content-script.js',
      import.meta.url,
    ),
    'utf8',
  )

const background =
  readFileSync(
    new URL(
      '../src/background.js',
      import.meta.url,
    ),
    'utf8',
  )

const analyzeRoute =
  readFileSync(
    new URL(
      '../../../api/companion/analyze-conversation/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'análise envia a chave canônica usada pelo ledger',
  () => {
    const start =
      contentScript.indexOf(
        '.analyzeConversation({',
      )

    assert.notEqual(
      start,
      -1,
    )

    const block =
      contentScript.slice(
        start,
        start + 900,
      )

    assert.match(
      block,
      /conversation_key:\s*getCaptureConversationKey\(\)/,
    )
  },
)

test(
  'background injeta o device key da instalação na análise',
  () => {
    assert.match(
      background,
      /async function handleConversationAnalysis\(message\)/,
    )

    assert.match(
      background,
      /handleConversationAnalysis[\s\S]*getOrCreateDeviceKey\(\)/,
    )

    assert.match(
      background,
      /device_key:\s*deviceKey/,
    )

    assert.match(
      background,
      /message\.action === 'ANALYZE_CONVERSATION'[\s\S]*handleConversationAnalysis/,
    )
  },
)

test(
  'rota operacional executa stateful como sidecar e preserva V1',
  () => {
    assert.match(
      analyzeRoute,
      /createStatefulCopilotServerRuntimeOrchestrator/,
    )

    assert.match(
      analyzeRoute,
      /conversation_key\?: unknown/,
    )

    assert.match(
      analyzeRoute,
      /device_key\?: unknown/,
    )

    assert.match(
      analyzeRoute,
      /import \{ after, NextResponse \} from 'next\/server'/,
    )

    assert.match(
      analyzeRoute,
      /after\(async \(\) => \{/,
    )

    assert.match(
      analyzeRoute,
      /await runStatefulCopilotRuntime\(\{/,
    )

    assert.match(
      analyzeRoute,
      /v1_response:\s*v1ResponseData/,
    )

    assert.match(
      analyzeRoute,
      /stateful_shadow_completed/,
    )

    assert.match(
      analyzeRoute,
      /duration_ms:/,
    )

    assert.match(
      analyzeRoute,
      /data:\s*v1ResponseData/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /data:\s*statefulRuntime/,
    )
  },
)
