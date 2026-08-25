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
  // Fase 12A — V2 stateful como único motor: o Companion nunca mais chama
  // V1 (analyzeConversationWithCopilotDetailed/generateSalesCoaching),
  // nem tem gate de modo escolhendo entre engines — toda chamada cria o
  // job em segundo plano do V2. sales-copilot.ts/sales-coaching.ts (V1)
  // continuam intactos e com teto (AbortSignal.timeout) porque ainda
  // servem /api/ai/analyze-conversation, fora do Companion.
  'Companion nunca chama V1 — nem sugestão nem coaching, nem gate de modo',
  () => {
    assert.doesNotMatch(
      routeSource,
      /analyzeConversationWithCopilotDetailed/,
    )

    assert.doesNotMatch(
      routeSource,
      /generateSalesCoaching/,
    )

    assert.doesNotMatch(
      routeSource,
      /generateCompanionCoachingOrFallback/,
    )

    assert.doesNotMatch(
      routeSource,
      /statefulRouteMode/,
    )

    assert.doesNotMatch(
      routeSource,
      /statefulActiveBackgroundRequested/,
    )

    assert.doesNotMatch(
      routeSource,
      /engine_source:\s*'v1'/,
    )

    assert.match(
      salesCopilotSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
    )

    assert.match(
      salesCoachingSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
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
