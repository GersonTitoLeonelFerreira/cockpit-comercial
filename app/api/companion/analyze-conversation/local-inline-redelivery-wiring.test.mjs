import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync(
  new URL(
    './route.ts',
    import.meta.url,
  ),
  'utf8',
)

test(
  'analyze-conversation local-inline usa o mesmo limite de redelivery da queue durable',
  () => {
    assert.match(
      routeSource,
      /STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS/,
    )

    assert.match(
      routeSource,
      /deliveryCount\s*<=\s*\n\s*STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS/,
    )

    assert.match(
      routeSource,
      /processStatefulCopilotBackgroundMessage\(\s*backgroundMessage,\s*\{\s*delivery_count:\s*deliveryCount/,
    )
  },
)

test(
  'falha sintética LOCAL_INLINE_WORKER_FAILED só é gravada depois de esgotar entregas e confirmar job ainda queued',
  () => {
    const loopIndex =
      routeSource.indexOf(
        'for (\n            let deliveryCount = 1;',
      )
    const latestStatusIndex =
      routeSource.indexOf(
        'latestLocalJob?.status !==',
      )
    const syntheticFailureIndex =
      routeSource.indexOf(
        "failure_code:\n                'LOCAL_INLINE_WORKER_FAILED'",
      )

    assert.notEqual(loopIndex, -1)
    assert.notEqual(latestStatusIndex, -1)
    assert.notEqual(syntheticFailureIndex, -1)

    assert.ok(
      loopIndex < latestStatusIndex,
      'a confirmação do estado deve ocorrer somente depois do loop de redelivery',
    )

    assert.ok(
      latestStatusIndex < syntheticFailureIndex,
      'não pode terminalizar o job antes de confirmar que ele ainda está queued',
    )
  },
)