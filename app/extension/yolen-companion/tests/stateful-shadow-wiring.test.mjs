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

const queueRoute =
  readFileSync(
    new URL(
      '../../../api/queues/companion-deep-analysis/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'análise envia conversation key canônica',
  () => {
    const functionStart =
      contentScript.indexOf(
        'async function analyzeCurrentConversation(',
      )

    assert.notEqual(
      functionStart,
      -1,
    )

    const start =
      contentScript.indexOf(
        '.analyzeConversation({',
        functionStart,
      )

    assert.notEqual(
      start,
      -1,
    )

    const functionBlock =
      contentScript.slice(
        functionStart,
        start,
      )

    const block =
      contentScript.slice(
        start,
        start + 900,
      )

    // Capturada uma única vez (getCaptureConversationKey()) e reutilizada
    // tanto na requisição de análise quanto no guard de identidade de
    // contexto que descarta respostas que não pertencem mais à conversa
    // atual.
    assert.match(
      functionBlock,
      /conversationKeyAtRequest\s*=\s*\n?\s*getCaptureConversationKey\(\)/,
    )

    assert.match(
      block,
      /conversation_key:\s*conversationKeyAtRequest/,
    )
  },
)

test(
  'background da extensão injeta device key',
  () => {
    assert.match(
      background,
      /handleConversationAnalysis[\s\S]*getOrCreateDeviceKey\(\)/,
    )

    assert.match(
      background,
      /device_key:\s*deviceKey/,
    )
  },
)

test(
  'shadow continua usando after',
  () => {
    assert.match(
      analyzeRoute,
      /statefulRouteMode ===\s*'shadow'[\s\S]*after\(async \(\) => \{/,
    )

    assert.match(
      analyzeRoute,
      /stateful_shadow_completed/,
    )
  },
)

test(
  'active usa Queue e não after para V2 profundo',
  () => {
    assert.match(
      analyzeRoute,
      /statefulActiveBackgroundRequested[\s\S]*await send\(/,
    )

    const afterOccurrences =
      analyzeRoute.match(
        /after\(async \(\) => \{/g,
      ) ?? []

    assert.equal(
      afterOccurrences.length,
      1,
    )
  },
)

test(
  'consumer é separado da chamada seller-facing',
  () => {
    assert.match(
      queueRoute,
      /handleCallback/,
    )

    assert.match(
      queueRoute,
      /processStatefulCopilotBackgroundMessage/,
    )
  },
)
