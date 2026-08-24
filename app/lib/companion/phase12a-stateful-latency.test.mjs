import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const deadlineSource =
  readFileSync(
    new URL(
      './stateful-copilot-cycle-deadline.ts',
      import.meta.url,
    ),
    'utf8',
  )

const backgroundJobSource =
  readFileSync(
    new URL(
      '../server/stateful-copilot-background-job.ts',
      import.meta.url,
    ),
    'utf8',
  )

const routeSource =
  readFileSync(
    new URL(
      '../../api/companion/analyze-conversation/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

const salesCopilotSource =
  readFileSync(
    new URL(
      '../ai/sales-copilot.ts',
      import.meta.url,
    ),
    'utf8',
  )

const salesCoachingSource =
  readFileSync(
    new URL(
      '../ai/sales-coaching.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'guardrail stateful padrão permanece em 25s',
  () => {
    assert.match(
      deadlineSource,
      /DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS\s*=\s*25_000/,
    )
  },
)

test(
  'background profundo possui orçamento separado de 120s',
  () => {
    assert.match(
      backgroundJobSource,
      /STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS\s*=\s*120_000/,
    )
  },
)

test(
  'first value active limita V1 a 8s',
  () => {
    assert.match(
      routeSource,
      /providerTimeoutMs:\s*statefulActiveBackgroundRequested\s*\?\s*8_000\s*:\s*V1_COMPANION_AI_CALL_TIMEOUT_MS/,
    )

    assert.match(
      salesCopilotSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
    )
  },
)

test(
  'V1 fora do modo active também tem teto — as duas chamadas de IA sequenciais não ficam sem limite',
  () => {
    assert.match(
      routeSource,
      /const V1_COMPANION_AI_CALL_TIMEOUT_MS\s*=\s*25_000/,
    )

    assert.match(
      salesCoachingSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
    )
  },
)

test(
  'first value active evita segunda IA de coaching',
  () => {
    assert.match(
      routeSource,
      /statefulActiveBackgroundRequested\s*\?\s*buildCompanionCoaching/,
    )
  },
)

test(
  'request seller-facing não executa runtime V2 profundo',
  () => {
    assert.doesNotMatch(
      routeSource,
      /runStatefulCopilotBackgroundRuntime/,
    )

    assert.match(
      routeSource,
      /await send\(/,
    )
  },
)
