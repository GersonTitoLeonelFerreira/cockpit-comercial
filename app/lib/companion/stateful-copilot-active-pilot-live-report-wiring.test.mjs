import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const script =
  readFileSync(
    new URL(
      '../../../scripts/companion-active-pilot-live-report.mjs',
      import.meta.url,
    ),
    'utf8',
  )

const packageJson =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../package.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

test(
  'relatório live lê somente auditoria do piloto active',
  () => {
    assert.match(
      script,
      /\.from\(\s*'companion_active_pilot_events'/,
    )

    assert.match(
      script,
      /\.select\(\s*'telemetry,recorded_at'/,
    )

    assert.doesNotMatch(
      script,
      /\.insert\(/,
    )

    assert.doesNotMatch(
      script,
      /\.update\(/,
    )

    assert.doesNotMatch(
      script,
      /\.delete\(/,
    )
  },
)

test(
  'relatório live usa service role server-side e env local',
  () => {
    assert.match(
      script,
      /SUPABASE_SERVICE_ROLE_KEY/,
    )

    assert.equal(
      packageJson
        .scripts[
          'report:companion-active-pilot-live'
        ],
      'node --env-file=.env.local --conditions=react-server --import ./scripts/register-typescript-test-loader.mjs scripts/companion-active-pilot-live-report.mjs',
    )
  },
)
