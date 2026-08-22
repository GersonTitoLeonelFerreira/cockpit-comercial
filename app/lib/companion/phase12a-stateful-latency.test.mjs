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
  '12A limita o ciclo stateful seller-facing a 25 segundos',
  () => {
    assert.match(
      deadlineSource,
      /DEFAULT_STATEFUL_COPILOT_CYCLE_DEADLINE_MS\s*=\s*25_000/,
    )
  },
)

test(
  '12A limita o V1 quando ele é fallback de um stateful lento ou inválido',
  () => {
    assert.match(
      routeSource,
      /providerTimeoutMs:\s*statefulActiveFallbackTriggered\s*\?\s*8_000\s*:\s*undefined/,
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
  '12A não executa uma segunda IA de coaching depois do fallback stateful',
  () => {
    assert.match(
      routeSource,
      /statefulActiveFallbackTriggered\s*\?\s*buildCompanionCoaching/,
    )
  },
)
