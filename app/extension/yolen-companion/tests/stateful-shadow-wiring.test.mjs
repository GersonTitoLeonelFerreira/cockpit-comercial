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
  'rota operacional possui roteamento explícito v1 shadow active',
  () => {
    assert.match(
      analyzeRoute,
      /resolveStatefulCopilotRouteMode/,
    )

    assert.match(
      analyzeRoute,
      /getStatefulRouteMode/,
    )

    assert.match(
      analyzeRoute,
      /statefulRouteMode ===\s*'shadow'/,
    )

    assert.match(
      analyzeRoute,
      /statefulRouteMode ===\s*'active'/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /O motor Companion V2 ainda não está disponível/,
    )

    assert.doesNotMatch(
      analyzeRoute,
      /resolveCompanionEngineVersion/,
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

    assert.match(
      analyzeRoute,
      /YOLEN_COMPANION_STATEFUL_SHADOW/,
    )
  },
)

test(
  'active executa stateful sincronamente e adapta saída para a extensão',
  () => {
    assert.match(
      analyzeRoute,
      /statefulRouteMode ===\s*'active'[\s\S]*await runStatefulCopilotRuntime\(\{/,
    )

    assert.match(
      analyzeRoute,
      /statefulResult\.mode ===\s*'active'/,
    )

    assert.match(
      analyzeRoute,
      /buildStatefulActiveResponseData/,
    )

    assert.match(
      analyzeRoute,
      /data:\s*activeResponseData/,
    )

    assert.match(
      analyzeRoute,
      /stateful_active_completed/,
    )
  },
)

test(
  'active preserva fallback V1 quando V2 não pode ser exposto',
  () => {
    assert.match(
      analyzeRoute,
      /stateful_active_fallback_v1/,
    )

    assert.match(
      analyzeRoute,
      /stateful_active_unhandled_fallback_v1/,
    )

    assert.match(
      analyzeRoute,
      /data:\s*v1ResponseData/,
    )
  },
)

test(
  'active executa V2 antes de qualquer análise V1',
  () => {
    const activeStart =
      analyzeRoute.indexOf(
        'Fase 5.3 — active:',
      )

    const activeRuntimeCall =
      analyzeRoute.indexOf(
        'await runStatefulCopilotRuntime({',
        activeStart,
      )

    const v1AnalysisCall =
      analyzeRoute.indexOf(
        'const result = await analyzeConversationWithCopilotDetailed({',
      )

    assert.notEqual(
      activeStart,
      -1,
    )

    assert.notEqual(
      activeRuntimeCall,
      -1,
    )

    assert.notEqual(
      v1AnalysisCall,
      -1,
    )

    assert.ok(
      activeRuntimeCall <
        v1AnalysisCall,
      'V2 active precisa executar antes da análise V1.',
    )

    const activeSection =
      analyzeRoute.slice(
        activeStart,
        v1AnalysisCall,
      )

    assert.match(
      activeSection,
      /v1_response:\s*undefined/,
    )

    assert.match(
      activeSection,
      /v1_executed:\s*false/,
    )
  },
)

test(
  'shadow permanece depois do V1 e recebe v1ResponseData',
  () => {
    const v1AnalysisCall =
      analyzeRoute.indexOf(
        'const result = await analyzeConversationWithCopilotDetailed({',
      )

    const shadowStart =
      analyzeRoute.indexOf(
        'Fase 5.3 — shadow:',
        v1AnalysisCall,
      )

    assert.notEqual(
      v1AnalysisCall,
      -1,
    )

    assert.notEqual(
      shadowStart,
      -1,
    )

    assert.ok(
      shadowStart >
        v1AnalysisCall,
      'Shadow deve permanecer posterior à análise V1.',
    )

    const shadowSection =
      analyzeRoute.slice(
        shadowStart,
      )

    assert.match(
      shadowSection,
      /v1_response:\s*v1ResponseData/,
    )

    assert.match(
      shadowSection,
      /after\(async \(\) => \{/,
    )
  },
)
