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

const migrationSource =
  readFileSync(
    new URL(
      '../../../supabase/migrations/20260823001500_create_companion_background_analysis_jobs.sql',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'active cria job durável antes de executar o runtime background',
  () => {
    const insert =
      routeSource.indexOf(
        ".from(\n            'companion_background_analysis_jobs'",
      )

    const runtime =
      routeSource.indexOf(
        'runStatefulCopilotBackgroundRuntime({',
      )

    assert.ok(
      insert >=
        0,
    )

    assert.ok(
      runtime >
        insert,
    )
  },
)

test(
  'job possui estados queued running succeeded failed',
  () => {
    for (
      const status of [
        'queued',
        'running',
        'succeeded',
        'failed',
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
  'resultado persiste communication attempts e falha segura',
  () => {
    assert.match(
      routeSource,
      /communication_attempts:/,
    )

    assert.match(
      routeSource,
      /failure_code:/,
    )

    assert.match(
      routeSource,
      /failure_path:/,
    )

    assert.match(
      routeSource,
      /failure_invariant:/,
    )
  },
)

test(
  'storage não contém conteúdo da conversa',
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
