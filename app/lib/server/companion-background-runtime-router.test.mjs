import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DEEP_ANALYSIS_RUNTIME_ENV,
  buildLegacyStatefulBackgroundRuntimeOptions,
  resolveCompanionBackgroundRuntime,
} from './companion-background-runtime-router.ts'

const COMPANY_ID =
  '10000000-0000-4000-8000-000000000001'

function coreExecution({
  engineMode =
    'model',

  persistenceMode =
    'persisted',

  persisted =
    true,
} = {}) {
  return {
    engine_mode:
      engineMode,

    persistence_mode:
      persistenceMode,

    persisted,

    candidate_state_version:
      engineMode ===
        'model'
        ? 5
        : null,

    output_contract_version:
      engineMode ===
        'model'
        ? 'commercial-reasoning-core-v2'
        : null,

    communication_contract_version:
      null,

    communication_intervention_needed:
      engineMode ===
        'model'
        ? true
        : null,

    communication_message_present:
      engineMode ===
        'model'
        ? true
        : null,

    communication_attempts:
      engineMode ===
        'model'
        ? 1
        : null,

    communication_recovered_after_retry:
      engineMode ===
        'model'
        ? false
        : null,

    known_message_count:
      3,

    active_message_count:
      2,

    commercial_config_status:
      'published',

    previous_state_found:
      true,
  }
}

function coreActiveResult() {
  return {
    runtime_version:
      'commercial-reasoning-core-v2-server-runtime-v1',

    mode:
      'core_v2_active',

    response_source:
      'commercial_reasoning_core_v2',

    stateful_executed:
      true,

    response: {
      engine_source:
        'commercial_reasoning_core_v2',

      seller_actionable:
        true,
    },

    commercial_reading: {
      contract_version:
        'commercial-reading-v1',
    },

    stateful_execution:
      coreExecution(),

    stateful_failure:
      null,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}

function coreFailedResult({
  engineMode =
    'blocked',

  persistenceMode =
    'skipped',
} = {}) {
  return {
    runtime_version:
      'commercial-reasoning-core-v2-server-runtime-v1',

    mode:
      'core_v2_failed',

    response_source:
      'commercial_reasoning_core_v2',

    stateful_executed:
      true,

    response:
      null,

    commercial_reading:
      null,

    stateful_execution:
      coreExecution({
        engineMode,
        persistenceMode,
        persisted:
          false,
      }),

    stateful_failure:
      null,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}

function runtimeArgs() {
  return {
    company_id:
      COMPANY_ID,

    cycle_id:
      '30000000-0000-4000-8000-000000000001',

    conversation_key:
      'conversation-test',

    device_key:
      'device-test',

    reference_time:
      '2026-09-14T03:00:00.000Z',

    v1_response:
      undefined,
  }
}

function createFactories({
  coreResult =
    coreActiveResult(),
} = {}) {
  const calls = []

  const legacyRuntime =
    async () => ({
      mode:
        'legacy-test',
    })

  const coreRuntime =
    async args => {
      calls.push({
        runtime:
          'core',

        args,
      })

      return coreResult
    }

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
  'background só cria Core V2 com seletor explícito e adapta sucesso ao worker existente',
  async () => {
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

    const adapted =
      await result.run_runtime(
        runtimeArgs(),
      )

    assert.equal(
      adapted.mode,
      'active',
    )

    assert.equal(
      adapted.response_source,
      'stateful',
    )

    assert.equal(
      adapted.stateful_execution.engine_mode,
      'model',
    )

    assert.equal(
      adapted.stateful_execution.persistence_mode,
      'persisted',
    )

    assert.equal(
      adapted.stateful_execution.candidate_state_version,
      5,
    )

    assert.equal(
      adapted.stateful_execution.communication_attempts,
      1,
    )

    assert.equal(
      adapted.automatic_crm_write,
      false,
    )

    assert.equal(
      adapted.automatic_agenda_write,
      false,
    )
  },
)

test(
  'Core V2 bloqueado vira falha worker-compatible sem disparar fallback de IA',
  async () => {
    const fixture =
      createFactories({
        coreResult:
          coreFailedResult(),
      })

    const result =
      resolveCompanionBackgroundRuntime({
        company_id:
          COMPANY_ID,

        configured_value:
          'commercial_reasoning_core_v2',

        dependencies:
          fixture.dependencies,
      })

    const adapted =
      await result.run_runtime(
        runtimeArgs(),
      )

    assert.equal(
      adapted.mode,
      'active_fallback_v1',
    )

    assert.equal(
      adapted.response,
      undefined,
    )

    assert.equal(
      adapted.stateful_execution.engine_mode,
      'blocked',
    )

    assert.equal(
      adapted.stateful_execution.persistence_mode,
      'skipped',
    )

    assert.equal(
      adapted.fallback_reason,
      'stateful_output_unavailable',
    )
  },
)

test(
  'conflito CAS do Core V2 permanece retryable pelo worker existente',
  async () => {
    const fixture =
      createFactories({
        coreResult:
          coreFailedResult({
            engineMode:
              'model',

            persistenceMode:
              'conflict',
          }),
      })

    const result =
      resolveCompanionBackgroundRuntime({
        company_id:
          COMPANY_ID,

        configured_value:
          'commercial_reasoning_core_v2',

        dependencies:
          fixture.dependencies,
      })

    const adapted =
      await result.run_runtime(
        runtimeArgs(),
      )

    assert.equal(
      adapted.mode,
      'active_fallback_v1',
    )

    assert.equal(
      adapted.stateful_execution.engine_mode,
      'model',
    )

    assert.equal(
      adapted.stateful_execution.persistence_mode,
      'conflict',
    )

    assert.equal(
      adapted.fallback_reason,
      'stateful_state_not_persisted',
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
