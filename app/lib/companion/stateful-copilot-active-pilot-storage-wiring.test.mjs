import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const migrationSource =
  readFileSync(
    new URL(
      '../../../supabase/migrations/20260823001500_create_companion_background_analysis_jobs.sql',
      import.meta.url,
    ),
    'utf8',
  )

const workerSource =
  readFileSync(
    new URL(
      '../server/stateful-copilot-background-worker.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'storage possui escopo e watermark',
  () => {
    for (
      const field of [
        'company_id',
        'cycle_id',
        'conversation_key',
        'message_watermark',
        'attempt_count',
      ]
    ) {
      assert.match(
        migrationSource,
        new RegExp(
          field,
        ),
      )
    }
  },
)

test(
  'storage suporta estados do job',
  () => {
    for (
      const status of [
        'queued',
        'running',
        'succeeded',
        'failed',
        'superseded',
      ]
    ) {
      assert.match(
        migrationSource,
        new RegExp(
          `'${status}'`,
        ),
      )
    }
  },
)

test(
  'worker persiste diagnóstico seguro',
  () => {
    assert.match(
      workerSource,
      /communication_attempts:/,
    )

    assert.match(
      workerSource,
      /failure_code:/,
    )

    assert.match(
      workerSource,
      /failure_path:/,
    )

    assert.match(
      workerSource,
      /failure_invariant:/,
    )
  },
)

test(
  'storage não guarda conteúdo da conversa',
  () => {
    assert.doesNotMatch(
      migrationSource,
      /conversation_text/,
    )

    assert.doesNotMatch(
      migrationSource,
      /suggested_message/,
    )
  },
)
