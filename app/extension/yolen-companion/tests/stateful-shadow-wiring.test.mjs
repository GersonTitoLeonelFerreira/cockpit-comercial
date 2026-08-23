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
  'background injeta device key da instalação na análise',
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
  },
)

test(
  'rota mantém roteamento explícito v1 shadow active',
  () => {
    assert.match(
      analyzeRoute,
      /statefulRouteMode ===\s*'shadow'/,
    )

    assert.match(
      analyzeRoute,
      /statefulRouteMode ===\s*'active'/,
    )
  },
)

test(
  'shadow continua executando stateful depois da resposta operacional',
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
  'active executa V1 primeiro e agenda V2 profundo em background',
  () => {
    const v1Analysis =
      analyzeRoute.indexOf(
        'const result = await analyzeConversationWithCopilotDetailed({',
      )

    const backgroundRuntime =
      analyzeRoute.indexOf(
        'runStatefulCopilotBackgroundRuntime({',
      )

    assert.ok(
      v1Analysis >=
        0,
    )

    assert.ok(
      backgroundRuntime >
        v1Analysis,
    )

    const activeBackground =
      analyzeRoute.slice(
        v1Analysis,
        backgroundRuntime +
          300,
      )

    assert.match(
      activeBackground,
      /after\(async \(\) => \{/,
    )
  },
)

test(
  'active seller-facing permanece V1 enquanto análise profunda processa',
  () => {
    assert.match(
      analyzeRoute,
      /const responseData = \{[\s\S]*\.\.\.v1ResponseData/,
    )

    assert.match(
      analyzeRoute,
      /deep_analysis:\s*deepAnalysis/,
    )

    assert.match(
      analyzeRoute,
      /data:\s*responseData/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /data:\s*activeResponseData/,
    )
  },
)

test(
  'job mantém conversation e watermark originais mesmo com troca posterior de chat',
  () => {
    assert.match(
      analyzeRoute,
      /conversation_key:\s*backgroundJob\s*\.conversation_key/,
    )

    assert.match(
      analyzeRoute,
      /reference_time:\s*backgroundJob\s*\.requested_at/,
    )

    assert.match(
      analyzeRoute,
      /message_watermark:\s*backgroundJob\s*\.message_watermark/,
    )
  },
)
