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
  // Fase 12A — V2 como único motor: não existe mais modo 'shadow' nem
  // 'v1' no Companion, nem o hook after() de auditoria silenciosa que
  // dependia de já ter um resultado V1 calculado por baixo.
  'Companion não tem mais shadow/after nem gate de statefulRouteMode',
  () => {
    assert.doesNotMatch(
      analyzeRoute,
      /after\(async \(\) => \{/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /stateful_shadow_completed/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /statefulRouteMode/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /statefulActiveBackgroundRequested/,
    )
  },
)

test(
  'toda chamada usa a Queue do V2 sem chamar V1 — sem gate de modo/engine',
  () => {
    assert.match(
      analyzeRoute,
      /await send\(/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /analyzeConversationWithCopilotDetailed/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /generateSalesCoaching/,
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
