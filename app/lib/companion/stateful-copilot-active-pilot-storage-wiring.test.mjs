import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const source =
  readFileSync(
    new URL(
      '../../api/companion/analyze-conversation/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'active persiste telemetria antes de expor resposta V2',
  () => {
    const activeTelemetry =
      source.indexOf(
        'const activeTelemetry =',
      )

    const persistence =
      source.indexOf(
        'await persistStatefulCopilotActivePilotTelemetry',
        activeTelemetry,
      )

    const response =
      source.indexOf(
        'return NextResponse.json<AnalyzeConversationResponse>',
        activeTelemetry,
      )

    assert.ok(
      activeTelemetry >= 0,
    )

    assert.ok(
      persistence >
        activeTelemetry,
    )

    assert.ok(
      response >
        persistence,
    )
  },
)

test(
  'fallback V1 também possui auditoria durável',
  () => {
    const fallback =
      source.indexOf(
        'const fallbackTelemetry =',
      )

    const persistence =
      source.indexOf(
        'await persistStatefulCopilotActivePilotTelemetry',
        fallback,
      )

    assert.ok(
      fallback >= 0,
    )

    assert.ok(
      persistence >
        fallback,
    )
  },
)

test(
  'falha não tratada usa persistência best effort e preserva fallback V1',
  () => {
    const unhandled =
      source.indexOf(
        'const unhandledTelemetry =',
      )

    const persistence =
      source.indexOf(
        'await persistStatefulCopilotActivePilotTelemetry',
        unhandled,
      )

    const bestEffort =
      source.indexOf(
        '.catch(',
        persistence,
      )

    assert.ok(
      unhandled >= 0,
    )

    assert.ok(
      persistence >
        unhandled,
    )

    assert.ok(
      bestEffort >
        persistence,
    )
  },
)
