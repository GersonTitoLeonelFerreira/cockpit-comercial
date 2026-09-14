import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialReasoningCoreV2PersistenceExecutionError,
} from './commercial-reasoning-core-v2-persistence-executor.ts'

import {
  COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_RPC_NAME,
  buildCommercialReasoningCoreV2SupabaseRpcParameters,
  createCommercialReasoningCoreV2SupabaseWriter,
} from './commercial-reasoning-core-v2-supabase-writer.ts'

function buildPlan() {
  return {
    plan_version:
      'commercial-reasoning-core-v2-persistence-plan-v1',

    mode:
      'model',

    should_persist:
      true,

    generated_at:
      '2026-09-13T22:00:01-03:00',

    company_id:
      '11111111-1111-4111-8111-111111111111',

    cycle_id:
      '22222222-2222-4222-8222-222222222222',

    conversation_key:
      'conversation-a',

    write_guard: {
      company_id:
        '11111111-1111-4111-8111-111111111111',

      cycle_id:
        '22222222-2222-4222-8222-222222222222',

      conversation_key:
        'conversation-a',

      expected_previous_state_version:
        1,

      expected_previous_state_updated_at:
        '2026-09-13T21:50:00-03:00',

      candidate_state_version:
        2,

      requires_compare_and_swap:
        true,

      requires_atomic_write:
        true,
    },

    state_snapshot: {
      contract_version:
        'phase-5.1-commercial-state-v1',

      cycle_id:
        '22222222-2222-4222-8222-222222222222',

      version:
        2,

      current_moment: {
        summary:
          'Cliente deseja avançar.',
      },

      updated_at:
        '2026-09-13T22:00:00-03:00',
    },

    audit_event: {
      event_type:
        'stateful_copilot_analysis_completed',

      engine_source:
        'commercial_reasoning_core_v2',

      generated_at:
        '2026-09-13T22:00:01-03:00',

      company_id:
        '11111111-1111-4111-8111-111111111111',

      cycle_id:
        '22222222-2222-4222-8222-222222222222',

      conversation_key:
        'conversation-a',

      previous_state_version:
        1,

      candidate_state_version:
        2,

      analyzed_message_ids: [
        'm2',
      ],

      evidence_message_ids: [
        'm2',
      ],

      memory_ids: [
        'memory-1',
      ],

      normalized_output: {
        contract_version:
          'commercial-reasoning-core-v2',
      },

      execution: {
        model_calls:
          1,
      },

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    },
  }
}

function buildRequest() {
  return {
    operation_key:
      'commercial-reasoning-core-v2:company:cycle:v2:test',

    plan:
      buildPlan(),
  }
}

function clone(
  value,
) {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  )
}

test(
  'writer V2 transforma plano CAS nos parâmetros exatos da RPC existente',
  () => {
    const request =
      buildRequest()

    const parameters =
      buildCommercialReasoningCoreV2SupabaseRpcParameters(
        request,
      )

    assert.deepEqual(
      parameters,
      {
        p_operation_key:
          request.operation_key,

        p_company_id:
          request.plan.company_id,

        p_cycle_id:
          request.plan.cycle_id,

        p_conversation_key:
          request.plan.conversation_key,

        p_expected_previous_state_version:
          1,

        p_expected_previous_state_updated_at:
          '2026-09-13T21:50:00-03:00',

        p_candidate_state_version:
          2,

        p_state_snapshot:
          request.plan.state_snapshot,

        p_audit_event:
          request.plan.audit_event,
      },
    )

    assert.notEqual(
      parameters
        .p_state_snapshot,
      request
        .plan
        .state_snapshot,
    )

    assert.notEqual(
      parameters
        .p_audit_event,
      request
        .plan
        .audit_event,
    )
  },
)

test(
  'writer V2 chama somente a RPC stateful existente e retorna confirmação',
  async () => {
    const calls =
      []

    const writer =
      createCommercialReasoningCoreV2SupabaseWriter({
        client: {
          async rpc(
            functionName,
            parameters,
          ) {
            calls.push({
              functionName,
              parameters,
            })

            return {
              data: [
                {
                  status:
                    'persisted',

                  state_record_id:
                    'state-record-v2',

                  audit_event_id:
                    'audit-event-v2',

                  persisted_state_version:
                    2,

                  persisted_at:
                    '2026-09-13T22:00:02-03:00',

                  current_state_version:
                    null,

                  current_state_updated_at:
                    null,
                },
              ],

              error:
                null,
            }
          },
        },
      })

    const result =
      await writer(
        buildRequest(),
      )

    assert.equal(
      calls.length,
      1,
    )

    assert.equal(
      calls[0]
        .functionName,
      COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_RPC_NAME,
    )

    assert.equal(
      COMMERCIAL_REASONING_CORE_V2_PERSISTENCE_RPC_NAME,
      'rpc_persist_stateful_copilot_state',
    )

    assert.equal(
      calls[0]
        .parameters
        .p_audit_event
        .normalized_output
        .contract_version,
      'commercial-reasoning-core-v2',
    )

    assert.equal(
      result.status,
      'persisted',
    )

    assert.equal(
      result.persisted_state_version,
      2,
    )
  },
)

test(
  'writer V2 não modifica o request recebido',
  async () => {
    const request =
      buildRequest()

    const original =
      clone(
        request,
      )

    const writer =
      createCommercialReasoningCoreV2SupabaseWriter({
        client: {
          async rpc(
            functionName,
            parameters,
          ) {
            parameters
              .p_state_snapshot
              .current_moment
              .summary =
                'mutado'

            parameters
              .p_audit_event
              .memory_ids
              .push(
                'memory-mutated',
              )

            return {
              data: {
                status:
                  'conflict',

                current_state_version:
                  3,

                current_state_updated_at:
                  '2026-09-13T22:01:00-03:00',
              },

              error:
                null,
            }
          },
        },
      })

    await writer(
      request,
    )

    assert.deepEqual(
      request,
      original,
    )
  },
)

test(
  'writer V2 rejeita cardinalidade inválida da resposta RPC',
  async () => {
    const writer =
      createCommercialReasoningCoreV2SupabaseWriter({
        client: {
          async rpc() {
            return {
              data: [
                {
                  status:
                    'persisted',
                },
                {
                  status:
                    'persisted',
                },
              ],

              error:
                null,
            }
          },
        },
      })

    await assert.rejects(
      () =>
        writer(
          buildRequest(),
        ),

      error => {
        assert.ok(
          error instanceof
          CommercialReasoningCoreV2PersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'INVALID_CORE_V2_PERSISTENCE_RPC_RESPONSE',
        )

        assert.equal(
          error.retryable,
          false,
        )

        return true
      },
    )
  },
)

test(
  'writer V2 classifica indisponibilidade transitória sem expor detalhes internos',
  async () => {
    const writer =
      createCommercialReasoningCoreV2SupabaseWriter({
        client: {
          async rpc() {
            return {
              data:
                null,

              error: {
                code:
                  'PGRST001',

                status:
                  503,

                message:
                  'credencial interna do banco',
              },
            }
          },
        },
      })

    await assert.rejects(
      () =>
        writer(
          buildRequest(),
        ),

      error => {
        assert.ok(
          error instanceof
          CommercialReasoningCoreV2PersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'CORE_V2_PERSISTENCE_RPC_UNAVAILABLE',
        )

        assert.equal(
          error.status_code,
          503,
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'credencial interna',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'writer V2 classifica rejeição permanente e falha de transporte sem vazar detalhes',
  async () => {
    const rejectedWriter =
      createCommercialReasoningCoreV2SupabaseWriter({
        client: {
          async rpc() {
            return {
              data:
                null,

              error: {
                code:
                  '23514',

                status:
                  400,

                message:
                  'constraint privada do banco',
              },
            }
          },
        },
      })

    await assert.rejects(
      () =>
        rejectedWriter(
          buildRequest(),
        ),

      error => {
        assert.equal(
          error.code,
          'CORE_V2_PERSISTENCE_RPC_REJECTED',
        )

        assert.equal(
          error.retryable,
          false,
        )

        assert.equal(
          error.message.includes(
            'constraint privada',
          ),
          false,
        )

        return true
      },
    )

    const unavailableWriter =
      createCommercialReasoningCoreV2SupabaseWriter({
        client: {
          async rpc() {
            throw new Error(
              'host privado indisponível',
            )
          },
        },
      })

    await assert.rejects(
      () =>
        unavailableWriter(
          buildRequest(),
        ),

      error => {
        assert.equal(
          error.code,
          'CORE_V2_PERSISTENCE_RPC_UNAVAILABLE',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'host privado',
          ),
          false,
        )

        return true
      },
    )
  },
)
