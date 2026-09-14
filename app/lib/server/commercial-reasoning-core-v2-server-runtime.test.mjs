import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_MODEL,
  COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_REASONING_EFFORT,
  COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION,
  createCommercialReasoningCoreV2ServerRuntime,
} from './commercial-reasoning-core-v2-server-runtime.ts'

function buildContext({
  found = true,
} = {}) {
  const previousState = {
    contract_version:
      'phase-5.1-commercial-state-v1',

    cycle_id:
      '30000000-0000-4000-8000-000000000001',

    version:
      4,

    updated_at:
      '2026-09-14T02:00:00.000Z',
  }

  return {
    loaded_at:
      '2026-09-14T02:10:00.000Z',

    diagnostic_input: {
      company_id:
        '10000000-0000-4000-8000-000000000001',

      cycle_id:
        '30000000-0000-4000-8000-000000000001',

      conversation_key:
        'conversation-test',
    },

    known_message_ids: [
      'm1',
      'm2',
      'm3',
    ],

    active_message_ids: [
      'm2',
      'm3',
    ],

    commercial_config_status:
      'published',

    durable_memory_seed: {
      source_cycle_id:
        'prior-cycle',

      facts: [],
      objections: [],
    },

    state_read:
      found
        ? {
            mode:
              'found',

            found:
              true,

            state:
              previousState,
          }
        : {
            mode:
              'missing',

            found:
              false,

            state:
              null,
          },
  }
}

function buildModelRuntimeResult({
  stateVersion = 5,
} = {}) {
  return {
    mode:
      'model',

    model_calls:
      1,

    memory_reduction: {
      state: {
        version:
          stateVersion,
      },
    },

    core_result: {
      output: {
        contract_version:
          'commercial-reasoning-core-v2',
      },
    },

    seller_projection: {
      adapter_version:
        'commercial-reasoning-core-v2-seller-adapter-v1',

      engine_source:
        'commercial_reasoning_core_v2',

      seller_actionable:
        true,

      commercial_role:
        'buyer',

      commercial_relevance:
        'commercial',

      summary:
        'Cliente já escolheu a modalidade e pediu confirmação operacional.',

      decision:
        'set_commitment',

      recommended_next_approach:
        'Confirmar a disponibilidade sem reabrir descoberta.',

      reason:
        'A decisão de compra já avançou.',

      intervention_needed:
        true,

      recommended_question:
        null,

      suggested_message:
        'Vou confirmar a disponibilidade e já te retorno.',

      evidence_message_ids: [
        'm3',
      ],
    },

    commercial_reading: {
      reading: {
        contract_version:
          'commercial-reading-v1',
      },

      report: {},
    },
  }
}

function buildPersistedResult({
  persistenceMode = 'persisted',
  persisted = true,
} = {}) {
  return {
    runtime_version:
      'commercial-reasoning-core-v2-persisted-runtime-v1',

    engine_source:
      'commercial_reasoning_core_v2',

    mode:
      'model',

    model_calls:
      1,

    runtime_result:
      buildModelRuntimeResult(),

    persistence_plan: {
      mode:
        'model',
    },

    persistence_result: {
      mode:
        persistenceMode,

      persisted,
    },

    persistence_mode:
      persistenceMode,

    persisted,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}

function buildBlockedResult() {
  return {
    runtime_version:
      'commercial-reasoning-core-v2-persisted-runtime-v1',

    engine_source:
      'commercial_reasoning_core_v2',

    mode:
      'blocked',

    model_calls:
      0,

    runtime_result: {
      mode:
        'blocked',

      model_calls:
        0,

      core_result:
        null,

      memory_reduction:
        null,

      commercial_reading:
        null,

      seller_projection:
        null,
    },

    persistence_plan: {
      mode:
        'blocked',
    },

    persistence_result: {
      mode:
        'skipped',

      persisted:
        false,
    },

    persistence_mode:
      'skipped',

    persisted:
      false,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}

function createFixture({
  context =
    buildContext(),

  persistedResult =
    buildPersistedResult(),
} = {}) {
  const calls = []

  const rpcClient = {
    async rpc() {
      throw new Error(
        'rpc real não deveria ser chamada no teste do runtime servidor',
      )
    },
  }

  const persistenceWriter =
    async () => {
      throw new Error(
        'writer real não deveria ser chamado pelo stub do persisted runtime',
      )
    }

  const provider =
    async () => {
      throw new Error(
        'provider real não deveria ser chamado pelo stub do persisted runtime',
      )
    }

  let receivedPersistedRuntimeArgs =
    null

  const runtime =
    createCommercialReasoningCoreV2ServerRuntime({
      supabase_url:
        'https://example.supabase.co',

      supabase_service_role_key:
        'service-role-test',

      openai_api_key:
        'openai-test',

      dependencies: {
        create_context_loader(
          options,
        ) {
          calls.push(
            'create_context_loader',
          )

          assert.equal(
            options.supabase_url,
            'https://example.supabase.co',
          )

          return async args => {
            calls.push(
              'load_context',
            )

            assert.equal(
              args.conversation_key,
              'conversation-test',
            )

            return context
          }
        },

        create_supabase_client(
          url,
          key,
          options,
        ) {
          calls.push(
            'create_supabase_client',
          )

          assert.equal(
            url,
            'https://example.supabase.co',
          )

          assert.equal(
            key,
            'service-role-test',
          )

          assert.equal(
            options.auth.persistSession,
            false,
          )

          return rpcClient
        },

        create_provider(
          options,
        ) {
          calls.push(
            'create_provider',
          )

          assert.equal(
            options.model,
            COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_MODEL,
          )

          assert.equal(
            options.diagnostic_reasoning_effort,
            COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_REASONING_EFFORT,
          )

          return provider
        },

        create_persistence_writer({
          client,
        }) {
          calls.push(
            'create_persistence_writer',
          )

          assert.equal(
            client,
            rpcClient,
          )

          return persistenceWriter
        },

        create_memory_id() {
          return 'memory-test'
        },

        async run_persisted_runtime(
          args,
        ) {
          calls.push(
            'run_persisted_runtime',
          )

          receivedPersistedRuntimeArgs =
            args

          return persistedResult
        },
      },
    })

  return {
    runtime,
    calls,
    context,
    persistenceWriter,
    getPersistedRuntimeArgs() {
      return receivedPersistedRuntimeArgs
    },
  }
}

function runtimeArgs() {
  return {
    company_id:
      '10000000-0000-4000-8000-000000000001',

    cycle_id:
      '30000000-0000-4000-8000-000000000001',

    conversation_key:
      'conversation-test',

    device_key:
      'device-test',

    reference_time:
      '2026-09-14T02:10:00.000Z',

    v1_response:
      undefined,
  }
}

test(
  'runtime servidor conecta contexto real ao persisted runtime Core V2 sem segundo cérebro',
  async () => {
    const fixture =
      createFixture()

    const result =
      await fixture.runtime(
        runtimeArgs(),
      )

    assert.equal(
      result.runtime_version,
      COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION,
    )

    assert.equal(
      result.mode,
      'core_v2_active',
    )

    assert.equal(
      result.response_source,
      'commercial_reasoning_core_v2',
    )

    assert.equal(
      result.automatic_crm_write,
      false,
    )

    assert.equal(
      result.automatic_agenda_write,
      false,
    )

    assert.equal(
      result.stateful_execution.engine_mode,
      'model',
    )

    assert.equal(
      result.stateful_execution.persistence_mode,
      'persisted',
    )

    assert.equal(
      result.stateful_execution.candidate_state_version,
      5,
    )

    assert.equal(
      result.stateful_execution.communication_attempts,
      1,
    )

    assert.equal(
      result.response.engine_source,
      'commercial_reasoning_core_v2',
    )

    const persistedArgs =
      fixture.getPersistedRuntimeArgs()

    assert.equal(
      persistedArgs.runtime_args.diagnostic_input,
      fixture.context.diagnostic_input,
    )

    assert.equal(
      persistedArgs.runtime_args.previous_state,
      fixture.context.state_read.state,
    )

    assert.deepEqual(
      persistedArgs.runtime_args.known_message_ids,
      fixture.context.known_message_ids,
    )

    assert.equal(
      persistedArgs.runtime_args.durable_memory_seed,
      fixture.context.durable_memory_seed,
    )

    assert.equal(
      persistedArgs.persistence_writer,
      fixture.persistenceWriter,
    )

    assert.equal(
      persistedArgs.generated_at,
      fixture.context.loaded_at,
    )

    assert.deepEqual(
      fixture.calls,
      [
        'create_context_loader',
        'create_supabase_client',
        'create_persistence_writer',
        'create_provider',
        'load_context',
        'run_persisted_runtime',
      ],
    )
  },
)

test(
  'conflito CAS não é exposto como sucesso seller-facing',
  async () => {
    const fixture =
      createFixture({
        persistedResult:
          buildPersistedResult({
            persistenceMode:
              'conflict',

            persisted:
              false,
          }),
      })

    const result =
      await fixture.runtime(
        runtimeArgs(),
      )

    assert.equal(
      result.mode,
      'core_v2_failed',
    )

    assert.equal(
      result.response,
      null,
    )

    assert.equal(
      result.commercial_reading,
      null,
    )

    assert.equal(
      result.stateful_execution.persistence_mode,
      'conflict',
    )

    assert.equal(
      result.stateful_failure,
      null,
    )
  },
)

test(
  'precondição bloqueada permanece zero-call e sem candidate state',
  async () => {
    const fixture =
      createFixture({
        context:
          buildContext({
            found:
              false,
          }),

        persistedResult:
          buildBlockedResult(),
      })

    const result =
      await fixture.runtime(
        runtimeArgs(),
      )

    assert.equal(
      result.mode,
      'core_v2_failed',
    )

    assert.equal(
      result.stateful_execution.engine_mode,
      'blocked',
    )

    assert.equal(
      result.stateful_execution.persistence_mode,
      'skipped',
    )

    assert.equal(
      result.stateful_execution.candidate_state_version,
      null,
    )

    assert.equal(
      result.stateful_execution.communication_attempts,
      null,
    )

    assert.equal(
      result.stateful_execution.previous_state_found,
      false,
    )
  },
)
