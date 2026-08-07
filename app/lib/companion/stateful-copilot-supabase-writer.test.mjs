import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,
} from './stateful-copilot-persistence-plan.ts'

import {
  StatefulCopilotPersistenceExecutionError,
} from './stateful-copilot-persistence-executor.ts'

import {
  STATEFUL_COPILOT_PERSISTENCE_RPC_NAME,
  buildStatefulCopilotSupabaseRpcParameters,
  createStatefulCopilotSupabaseWriter,
} from './stateful-copilot-supabase-writer.ts'

function buildPlan() {
  return {
    plan_version:
      STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

    mode:
      'model',

    should_persist:
      true,

    generated_at:
      '2026-08-06T19:50:01-03:00',

    company_id:
      '10000000-0000-4000-8000-000000000001',

    cycle_id:
      '30000000-0000-4000-8000-000000000001',

    conversation_key:
      'whatsapp:+5547999990001',

    write_guard: {
      company_id:
        '10000000-0000-4000-8000-000000000001',

      cycle_id:
        '30000000-0000-4000-8000-000000000001',

      conversation_key:
        'whatsapp:+5547999990001',

      expected_previous_state_version:
        1,

      expected_previous_state_updated_at:
        '2026-08-06T19:40:00-03:00',

      candidate_state_version:
        2,

      requires_compare_and_swap:
        true,

      requires_atomic_write:
        true,
    },

    state_snapshot: {
      contract_version:
        'stateful-commercial-state-v1',

      cycle_id:
        '30000000-0000-4000-8000-000000000001',

      version:
        2,

      commercial_role:
        'buyer',

      current_moment: {
        summary:
          'O cliente está avaliando a solução.',

        evidence_message_ids: [
          'm2',
        ],
      },

      current_priority: {
        summary:
          'Conduzir a próxima etapa comercial.',

        evidence_message_ids: [
          'm2',
        ],
      },

      last_analyzed_message_ids: [
        'm2',
      ],

      last_evidence_message_ids: [
        'm2',
      ],

      facts: [],
      needs: [],
      open_loops: [],
      objections: [],
      commitments: [],
      signals: [],
      uncertainties: [],

      created_at:
        '2026-08-06T19:00:00-03:00',

      updated_at:
        '2026-08-06T19:50:00-03:00',
    },

    audit_event: {
      event_type:
        'stateful_copilot_analysis_completed',

      generated_at:
        '2026-08-06T19:50:01-03:00',

      company_id:
        '10000000-0000-4000-8000-000000000001',

      cycle_id:
        '30000000-0000-4000-8000-000000000001',

      conversation_key:
        'whatsapp:+5547999990001',

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
        'fact-1',
      ],

      normalized_output: {
        contract_version:
          'stateful-copilot-v2',
      },

      execution: {
        provider:
          'openai',

        model:
          'test-model',

        request_id:
          'request-1',

        usage: {
          input_tokens:
            100,

          output_tokens:
            200,

          total_tokens:
            300,
        },

        attempts:
          1,

        recovered_after_retry:
          false,
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
      'stateful-copilot:company-1:cycle-1:conversation-1:v2',

    plan:
      buildPlan(),
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'transforma o plano validado nos parâmetros exatos da RPC',
  () => {
    const request =
      buildRequest()

    const parameters =
      buildStatefulCopilotSupabaseRpcParameters(
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
          '2026-08-06T19:40:00-03:00',

        p_candidate_state_version:
          2,

        p_state_snapshot:
          request.plan.state_snapshot,

        p_audit_event:
          request.plan.audit_event,
      },
    )

    assert.notEqual(
      parameters.p_state_snapshot,
      request.plan.state_snapshot,
    )

    assert.notEqual(
      parameters.p_audit_event,
      request.plan.audit_event,
    )
  },
)

test(
  'chama somente a RPC stateful e retorna a confirmação do banco',
  async () => {
    const calls = []

    const writer =
      createStatefulCopilotSupabaseWriter({
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
                    'state-record-1',

                  audit_event_id:
                    'audit-event-1',

                  persisted_state_version:
                    2,

                  persisted_at:
                    '2026-08-06T19:50:02-03:00',

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
      calls[0].functionName,
      STATEFUL_COPILOT_PERSISTENCE_RPC_NAME,
    )

    assert.equal(
      calls[0]
        .parameters
        .p_candidate_state_version,
      2,
    )

    assert.deepEqual(
      result,
      {
        status:
          'persisted',

        state_record_id:
          'state-record-1',

        audit_event_id:
          'audit-event-1',

        persisted_state_version:
          2,

        persisted_at:
          '2026-08-06T19:50:02-03:00',

        current_state_version:
          null,

        current_state_updated_at:
          null,
      },
    )
  },
)

test(
  'aceita resposta unitária do cliente Supabase sem lista',
  async () => {
    const writer =
      createStatefulCopilotSupabaseWriter({
        client: {
          async rpc() {
            return {
              data: {
                status:
                  'conflict',

                state_record_id:
                  null,

                audit_event_id:
                  null,

                persisted_state_version:
                  null,

                persisted_at:
                  null,

                current_state_version:
                  3,

                current_state_updated_at:
                  '2026-08-06T19:51:00-03:00',
              },

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
      result.status,
      'conflict',
    )

    assert.equal(
      result.current_state_version,
      3,
    )
  },
)

test(
  'o adaptador não modifica o plano recebido',
  async () => {
    const request =
      buildRequest()

    const original =
      clone(
        request,
      )

    const writer =
      createStatefulCopilotSupabaseWriter({
        client: {
          async rpc(
            functionName,
            parameters,
          ) {
            parameters
              .p_state_snapshot
              .current_moment
              .summary =
                'alterado pelo cliente'

            parameters
              .p_audit_event
              .memory_ids
              .push(
                'memory-added',
              )

            return {
              data: [
                {
                  status:
                    'conflict',

                  current_state_version:
                    3,

                  current_state_updated_at:
                    '2026-08-06T19:51:00-03:00',
                },
              ],

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
  'rejeita resposta vazia da RPC',
  async () => {
    const writer =
      createStatefulCopilotSupabaseWriter({
        client: {
          async rpc() {
            return {
              data: [],
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
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'INVALID_STATEFUL_PERSISTENCE_RPC_RESPONSE',
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
  'rejeita resposta com mais de um resultado',
  async () => {
    const writer =
      createStatefulCopilotSupabaseWriter({
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
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'INVALID_STATEFUL_PERSISTENCE_RPC_RESPONSE',
        )

        return true
      },
    )
  },
)

test(
  'classifica indisponibilidade transitória sem expor detalhes internos',
  async () => {
    const writer =
      createStatefulCopilotSupabaseWriter({
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
                  'senha interna e endereço do banco',
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
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'STATEFUL_PERSISTENCE_RPC_UNAVAILABLE',
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
            'senha interna',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'classifica rejeição permanente sem expor a mensagem do banco',
  async () => {
    const writer =
      createStatefulCopilotSupabaseWriter({
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
                  'detalhe privado da constraint',
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
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'STATEFUL_PERSISTENCE_RPC_REJECTED',
        )

        assert.equal(
          error.retryable,
          false,
        )

        assert.equal(
          error.message.includes(
            'constraint',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'falha de transporte é classificada como temporária',
  async () => {
    const writer =
      createStatefulCopilotSupabaseWriter({
        client: {
          async rpc() {
            throw new Error(
              'conexão recusada pelo host interno',
            )
          },
        },
      })

    await assert.rejects(
      () =>
        writer(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'STATEFUL_PERSISTENCE_RPC_UNAVAILABLE',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'host interno',
          ),
          false,
        )

        return true
      },
    )
  },
)
