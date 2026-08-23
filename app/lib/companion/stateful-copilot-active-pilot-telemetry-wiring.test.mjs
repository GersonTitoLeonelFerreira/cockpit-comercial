import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const workerSource =
  readFileSync(
    new URL(
      '../server/stateful-copilot-background-worker.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'worker emite sucesso falha e superseded',
  () => {
    assert.match(
      workerSource,
      /background_analysis_succeeded/,
    )

    assert.match(
      workerSource,
      /background_analysis_failed/,
    )

    assert.match(
      workerSource,
      /background_analysis_superseded/,
    )
  },
)

test(
  'telemetria mantém escopo e safety',
  () => {
    assert.match(
      workerSource,
      /analysis_job_id:/,
    )

    assert.match(
      workerSource,
      /company_id:/,
    )

    assert.match(
      workerSource,
      /cycle_id:/,
    )

    assert.match(
      workerSource,
      /communication_attempts:/,
    )

    assert.match(
      workerSource,
      /automatic_crm_write:/,
    )

    assert.match(
      workerSource,
      /automatic_agenda_write:/,
    )
  },
)

test(
  'telemetria não escreve conversation text',
  () => {
    assert.doesNotMatch(
      workerSource,
      /conversation_text/,
    )
  },
)
