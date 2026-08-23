import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runtime =
  fs.readFileSync(
    new URL(
      '../server/stateful-copilot-runtime-orchestrator.ts',
      import.meta.url,
    ),
    'utf8',
  )

const worker =
  fs.readFileSync(
    new URL(
      '../server/stateful-copilot-background-worker.ts',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'candidate state preserva diagnóstico seguro até o background job',
  () => {
    assert.match(
      runtime,
      /state_failure_path\?:/,
    )

    assert.match(
      runtime,
      /state_failure_invariant\?:/,
    )

    assert.match(
      runtime,
      /details\s*\?\.state_failure_path/,
    )

    assert.match(
      runtime,
      /details\s*\?\.state_failure_invariant/,
    )

    assert.match(
      worker,
      /failure\s*\?\.state_failure_path/,
    )

    assert.match(
      worker,
      /failure\s*\?\.state_failure_invariant/,
    )
  },
)
