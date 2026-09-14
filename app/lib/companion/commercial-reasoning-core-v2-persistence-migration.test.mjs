import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const migration =
  readFileSync(
    new URL(
      '../../../supabase/migrations/20260914013000_allow_commercial_reasoning_core_v2_persistence.sql',
      import.meta.url,
    ),

    'utf8',
  )

test(
  'migration preserva histórico V2 V3 V4 e adiciona Core V2 à constraint',
  () => {
    assert.ok(
      migration.includes(
        "'phase-5.1-stateful-copilot-v2'",
      ),
    )

    assert.ok(
      migration.includes(
        "'phase-5.2-stateful-copilot-v3'",
      ),
    )

    assert.ok(
      migration.includes(
        "'phase-5.2-stateful-copilot-v4'",
      ),
    )

    assert.ok(
      migration.includes(
        "'commercial-reasoning-core-v2'",
      ),
    )

    assert.ok(
      migration.includes(
        'validate constraint',
      ),
    )
  },
)

test(
  'migration reutiliza a RPC stateful e amplia apenas o gate de output contract',
  () => {
    assert.ok(
      migration.includes(
        'rpc_persist_stateful_copilot_state',
      ),
    )

    assert.ok(
      migration.includes(
        "v_output_contract_version not in (''phase-5.2-stateful-copilot-v4'', ''commercial-reasoning-core-v2'')",
      ),
    )

    assert.ok(
      migration.includes(
        'regexp_matches',
      ),
    )

    assert.equal(
      migration
        .toLowerCase()
        .includes(
          'drop function',
        ),
      false,
    )
  },
)

test(
  'migration não amplia acesso da RPC além de service role',
  () => {
    assert.ok(
      migration.includes(
        'from\n  public,\n  anon,\n  authenticated,\n  service_role;',
      ),
    )

    assert.ok(
      migration.includes(
        'to\n  service_role;',
      ),
    )

    assert.equal(
      migration.includes(
        'to\n  authenticated;',
      ),
      false,
    )

    assert.equal(
      migration.includes(
        'to\n  anon;',
      ),
      false,
    )
  },
)
