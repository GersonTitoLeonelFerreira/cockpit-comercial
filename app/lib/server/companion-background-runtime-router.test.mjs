import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DEEP_ANALYSIS_RUNTIME_ENV,
  buildLegacyStatefulBackgroundRuntimeOptions,
  resolveCompanionBackgroundRuntime,
} from './companion-background-runtime-router.ts'

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'

function createFactories() {
  const calls = []

  const legacyRuntime =
    async () => ({
      mode:
        'legacy-test',
    })

  const coreRuntime =
    async () => ({
      mode:
        'core-test',
    })

  return {
    calls,
    legacyRuntime,
    coreRuntime,

    dependencies: {
      create_legacy_runtime(
        options,
      ) {
        calls.push({
          factory:
            'legacy',

          options,
        })

        return legacyRuntime
      },

      create_core_v2_runtime(
        options,
      ) {
        calls.push({
          factory:
            'core',

          options,
        })

        return coreRuntime
      },
    },
  }
}

test(
  'background mantém legacy stateful por padrão',
  () => {
    const fixture =
      createFactories()

    const result =
      resolveCompanionBackgroundRuntime({
        company_id:
          COMPANY_ID,

        configured_value:
          undefined,

        dependencies:
          fixture.dependencies,
      })

    assert.equal(
      result.selection.mode,
      'legacy_stateful',
    )

    assert.equal(
      result.run_runtime,
      fixture.legacyRuntime,
    )

    assert.equal(
      fixture.calls.length,
      1,
    )

    assert.equal(
      fixture.calls[0].factory,
      'legacy',
    )

    assert.deepEqual(
      fixture.calls[0].options,
      buildLegacyStatefulBackgroundRuntimeOptions(
        COMPANY_ID,
      ),
    )
  },
)

test(
  'background só cria Core V2 com seletor explícito',
  () => {
    const fixture =
      createFactories()

    const result =
      resolveCompanionBackgroundRuntime({
        company_id:
          COMPANY_ID,

        configured_value:
          'commercial_reasoning_core_v2',

        dependencies:
          fixture.dependencies,
      })

    assert.equal(
      result.selection.mode,
      'commercial_reasoning_core_v2',
    )

    assert.equal(
      result.run_runtime,
      fixture.coreRuntime,
    )

    assert.equal(
      fixture.calls.length,
      1,
    )

    assert.equal(
      fixture.calls[0].factory,
      'core',
    )

    assert.equal(
      fixture.calls[0]
        .options
        .cycle_deadline_ms,
      120_000,
    )
  },
)

test(
  'valor legado v2 não ativa o novo Core por acidente',
  () => {
    const fixture =
      createFactories()

    const result =
      resolveCompanionBackgroundRuntime({
        company_id:
          COMPANY_ID,

        configured_value:
          'v2',

        dependencies:
          fixture.dependencies,
      })

    assert.equal(
      result.selection.mode,
      'legacy_stateful',
    )

    assert.equal(
      result.selection.reason,
      'invalid_value_fallback_legacy',
    )

    assert.equal(
      result.run_runtime,
      fixture.legacyRuntime,
    )
  },
)

test(
  'nome do seletor de ambiente permanece dedicado ao deep analysis',
  () => {
    assert.equal(
      COMPANION_DEEP_ANALYSIS_RUNTIME_ENV,
      'COMPANION_DEEP_ANALYSIS_RUNTIME',
    )
  },
)
