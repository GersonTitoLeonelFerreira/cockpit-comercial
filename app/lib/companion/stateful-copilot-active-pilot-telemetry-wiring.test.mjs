import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
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
  'runtime background emite diagnóstico técnico sem conteúdo da conversa',
  () => {
    assert.match(
      routeSource,
      /YOLEN_COMPANION_STATEFUL_BACKGROUND/,
    )

    assert.match(
      routeSource,
      /background_analysis_succeeded/,
    )

    assert.match(
      routeSource,
      /background_analysis_failed/,
    )

    assert.match(
      routeSource,
      /communication_attempts:/,
    )
  },
)

test(
  'telemetria background preserva escopo e safety',
  () => {
    assert.match(
      routeSource,
      /analysis_job_id:/,
    )

    assert.match(
      routeSource,
      /company_id:/,
    )

    assert.match(
      routeSource,
      /cycle_id:/,
    )

    assert.match(
      routeSource,
      /automatic_crm_write:/,
    )

    assert.match(
      routeSource,
      /automatic_agenda_write:/,
    )
  },
)
