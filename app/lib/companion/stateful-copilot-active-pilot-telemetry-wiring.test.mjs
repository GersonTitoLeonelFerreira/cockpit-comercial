import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource =
  readFileSync(
    new URL(
      '../../api/companion/analyze-conversation/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'rota active utiliza telemetria padronizada da fase 5.4',
  () => {
    assert.match(
      routeSource,
      /buildStatefulCopilotActivePilotTelemetry/,
    )

    assert.match(
      routeSource,
      /event:\s*'active_success'/,
    )

    assert.match(
      routeSource,
      /event:\s*'active_fallback_v1'/,
    )

    assert.match(
      routeSource,
      /event:\s*'active_unhandled_fallback_v1'/,
    )
  },
)

test(
  'telemetria active continua usando canal exclusivo do piloto',
  () => {
    assert.match(
      routeSource,
      /YOLEN_COMPANION_STATEFUL_ACTIVE/,
    )
  },
)
