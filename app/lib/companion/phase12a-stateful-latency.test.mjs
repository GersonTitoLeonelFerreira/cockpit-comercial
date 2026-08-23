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

test(
  '12A preserva o deadline padrão de 25 segundos',
  () => {
    assert.match(
      deadlineSource,
      /DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS\s*=\s*25_000/,
    )
  },
)

test(
  '12A possui orçamento profundo separado de 120 segundos',
  () => {
    assert.match(
      backgroundJobSource,
      /STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS\s*=\s*120_000/,
    )
  },
)

test(
  '12A limita o first value V1 a 8 segundos quando active roda em background',
  () => {
    assert.match(
      routeSource,
      /providerTimeoutMs:\s*statefulActiveBackgroundRequested\s*\?\s*8_000\s*:\s*undefined/,
    )

    assert.match(
      salesCopilotSource,
      /AbortSignal\.timeout\(\s*providerTimeoutMs/,
    )

    assert.match(
      salesCopilotSource,
      /openai_timeout/,
    )
  },
)

test(
  '12A não executa segunda IA de coaching antes de devolver first value',
  () => {
    assert.match(
      routeSource,
      /statefulActiveBackgroundRequested\s*\?\s*buildCompanionCoaching/,
    )
  },
)
