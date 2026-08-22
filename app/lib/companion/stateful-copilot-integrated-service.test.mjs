import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,
} from './stateful-copilot-persistence-plan.ts'

import {
  StatefulCopilotIntegratedServiceError,
  runStatefulCopilotIntegratedService,
} from './stateful-copilot-integrated-service.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const cycleId =
  '30000000-0000-4000-8000-000000000001'

const conversationKey =
  'whatsapp:+5547999990001'

const referenceTime =
  '2026-08-06T20:00:00-03:00'

const generatedAt =
  '2026-08-06T20:00:01-03:00'

function buildDiagnosticInput(
  overrides = {},
) {
  return {
    input_version:
      'phase-5-input-v1',

    diagnostic_contract_version:
      'phase-5-diagnostic-v1',

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    current_crm_status:
      'negociacao',

    reference_time:
      referenceTime,

    analysis_precondition: {
      status:
        'ready',

      limitations:
        [],
    },

    conversation: {
      active_message_ids: [
        'm2',
      ],

      excluded_message_ids:
        [],

      messages:
        [],

      excluded_messages:
        [],
    },

    commercial_context: {
      configured:
        true,

      config_version_id:
        'config-1',

      config_version_number:
        1,

      config_contract_version:
        'commercial-config-v1',

      business_description:
        'Empresa de teste',

      target_audience:
        'Cliente de teste',

      value_proposition:
        'Proposta de teste',

      communication_tone:
        'direto',

      required_behaviors:
        [],

      prohibited_behaviors:
        [],

      sales_method: {
        configured:
          false,

        name:
          null,

        description:
          null,

        steps:
          [],
      },

      products:
        [],

      facts:
        [],

      objection_guides:
        [],
    },

    ...overrides,
  }
}

function buildState({
  version = 2,
  updatedAt =
    '2026-08-06T19:50:00-03:00',
  evidenceMessageId =
    'm2',
} = {}) {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      cycleId,

    version,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'O cliente está avaliando a solução.',

      evidence_message_ids: [
        evidenceMessageId,
      ],
    },

    current_priority: {
      summary:
        'Conduzir a próxima etapa comercial.',

      evidence_message_ids: [
        evidenceMessageId,
      ],
    },

    last_analyzed_message_ids: [
      evidenceMessageId,
    ],

    last_evidence_message_ids: [
      evidenceMessageId,
    ],

    facts:
      [],

    needs:
      [],

    open_loops:
      [],

    objections:
      [],

    commitments:
      [],

    signals:
      [],

    uncertainties:
      [],

    created_at:
      '2026-08-06T19:00:00-03:00',

    updated_at:
      updatedAt,
  }
}

function buildMissingReadResult() {
  return {
    mode:
      'missing',

    found:
      false,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    state_record_id:
      null,

    state_version:
      null,

    state_updated_at:
      null,

    persisted_at:
      null,

    state:
      null,
  }
}

function buildFoundReadResult() {
  return {
    mode:
      'found',

    found:
      true,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    state_record_id:
      '50000000-0000-4000-8000-000000000001',

    state_version:
      2,

    state_updated_at:
      '2026-08-06T22:50:00.000Z',

    persisted_at:
      '2026-08-06T22:50:02.000Z',

    state:
      buildState(),
  }
}

function buildBlockedEngineResult() {
  return {
    mode:
      'blocked',

    input: {
      diagnostic_input:
        buildDiagnosticInput(),

      state_context: {
        previous_state:
          null,

        previous_state_version:
          null,

        target_state_version:
          1,
      },
    },

    plan: {
      mode:
        'blocked',
    },

    output:
      null,

    previous_state:
      null,

    candidate_state:
      null,

    limitations: [
      'análise bloqueada para teste',
    ],

    execution: {
      provider:
        'none',

      model:
        null,

      request_id:
        null,

      usage:
        null,

      attempts:
        1,

      recovered_after_retry:
        false,
    },
  }
}

function buildModelEngineResult({
  previousState =
    buildState(),
  candidateState =
    buildState({
      version:
        3,

      updatedAt:
        referenceTime,
    }),
} = {}) {
  return {
    mode:
      'model',

    input: {
      diagnostic_input:
        buildDiagnosticInput(),

      state_context: {
        previous_state:
          previousState,

        previous_state_version:
          previousState?.version ?? null,

        target_state_version:
          candidateState.version,
      },
    },

    plan: {
      mode:
        'model',
    },

    output: {
      previous_state_version:
        previousState?.version ?? null,

      analyzed_message_ids: [
        'm2',
      ],

      evidence_message_ids: [
        'm2',
      ],

      memory_ids:
        [],

      interpretation: {
        what_changed:
          null,

        what_remains_valid:
          [],

        current_moment: {
          summary:
            'O cliente está avaliando a solução.',

          evidence_message_ids: [
            'm2',
          ],

          memory_ids:
            [],
        },

        current_priority: {
          summary:
            'Conduzir a próxima etapa comercial.',

          evidence_message_ids: [
            'm2',
          ],

          memory_ids:
            [],
        },

        commercial_role:
          'buyer',

        commercial_relevance:
          'commercial',
      },

      state_patch: {
        facts_to_add:
          [],

        fact_ids_to_supersede:
          [],

        needs_to_add:
          [],

        need_ids_to_resolve:
          [],

        open_loops_to_add:
          [],

        open_loop_ids_to_resolve:
          [],

        objections_to_add:
          [],

        objection_ids_to_resolve:
          [],

        objection_ids_to_supersede:
          [],

        commitments_to_upsert:
          [],

        signals_to_add:
          [],

        signal_ids_to_resolve:
          [],

        uncertainties_to_add:
          [],

        uncertainty_ids_to_resolve:
          [],
      },

      diagnostic: {
        lead_status:
          'negociacao',

        summary:
          'Diagnóstico de teste',

        positive_signals:
          [],

        risks:
          [],

        objections:
          [],

        next_best_action:
          'Continuar a negociação',

        recommended_message:
          'Mensagem de teste',

        manager_alert:
          null,
      },
    },

    previous_state:
      previousState,

    candidate_state:
      candidateState,

    execution: {
      provider:
        'mock',

      model:
        'mock-model',

      request_id:
        'request-1',

      usage: {
        input_tokens:
          10,

        output_tokens:
          20,

        total_tokens:
          30,
      },

      attempts:
        1,

      recovered_after_retry:
        false,
    },
  }
}

function buildBlockedPersistencePlan() {
  return {
    plan_version:
      STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

    mode:
      'blocked',

    should_persist:
      false,

    generated_at:
      generatedAt,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    expected_previous_state_version:
      null,

    limitations: [
      'análise bloqueada para teste',
    ],

    write_guard:
      null,

    state_snapshot:
      null,

    audit_event:
      null,
  }
}

function buildModelPersistencePlan(
  state,
) {
  return {
    plan_version:
      STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

    mode:
      'model',

    should_persist:
      true,

    generated_at:
      generatedAt,

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    write_guard: {
      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      expected_previous_state_version:
        2,

      expected_previous_state_updated_at:
        '2026-08-06T19:50:00-03:00',

      candidate_state_version:
        state.version,

      requires_compare_and_swap:
        true,

      requires_atomic_write:
        true,
    },

    state_snapshot:
      state,

    audit_event: {
      event_type:
        'stateful_copilot_analysis_completed',

      generated_at:
        generatedAt,

      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      previous_state_version:
        2,

      candidate_state_version:
        state.version,

      analyzed_message_ids: [
        'm2',
      ],

      evidence_message_ids: [
        'm2',
      ],

      memory_ids:
        [],

      normalized_output: {
        contract_version:
          'phase-5.2-stateful-copilot-v3',
      },

      execution: {
        provider:
          'mock',

        model:
          'mock-model',

        request_id:
          'request-1',

        usage: {
          input_tokens:
            10,

          output_tokens:
            20,

          total_tokens:
            30,
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

const provider =
  async () => {
    throw new Error(
      'provider não deveria ser chamado diretamente pelo teste',
    )
  }

const createMemoryId =
  () =>
    'memory-test'

test(
  'executa leitura, motor, plano e persistência na ordem correta',
  async () => {
    const calls =
      []

    const blockedEngineResult =
      buildBlockedEngineResult()

    const blockedPlan =
      buildBlockedPersistencePlan()

    const skippedResult = {
      mode:
        'skipped',

      persisted:
        false,

      reason:
        'blocked_plan',

      operation_key:
        null,

      writer_calls:
        0,

      limitations: [
        'análise bloqueada para teste',
      ],
    }

    const reader =
      async (
        request,
      ) => {
        calls.push(
          'reader',
        )

        assert.deepEqual(
          request,
          {
            company_id:
              companyId,

            cycle_id:
              cycleId,

            conversation_key:
              conversationKey,

            known_message_ids: [
              'm1',
              'm2',
            ],

            active_message_ids: [
              'm2',
            ],
          },
        )

        return buildMissingReadResult()
      }

    const runEngine =
      async (
        args,
      ) => {
        calls.push(
          'engine',
        )

        assert.equal(
          args.previous_state,
          null,
        )

        assert.deepEqual(
          args.known_message_ids,
          [
            'm1',
            'm2',
          ],
        )

        return blockedEngineResult
      }

    const buildPlan =
      (args) => {
        calls.push(
          'plan',
        )

        assert.equal(
          args.engine_result,
          blockedEngineResult,
        )

        assert.equal(
          args.generated_at,
          generatedAt,
        )

        return blockedPlan
      }

    const executePersistence =
      async (
        args,
      ) => {
        calls.push(
          'persistence',
        )

        assert.equal(
          args.plan,
          blockedPlan,
        )

        return skippedResult
      }

    const result =
      await runStatefulCopilotIntegratedService({
        diagnostic_input:
          buildDiagnosticInput(),

        known_message_ids: [
          'm1',
          'm2',
        ],

        generated_at:
          generatedAt,

        reader,

        writer:
          async () => {
            throw new Error(
              'writer não deveria ser chamado',
            )
          },

        provider,

        create_memory_id:
          createMemoryId,

        dependencies: {
          run_engine:
            runEngine,

          build_persistence_plan:
            buildPlan,

          execute_persistence:
            executePersistence,
        },
      })

    assert.deepEqual(
      calls,
      [
        'reader',
        'engine',
        'plan',
        'persistence',
      ],
    )

    assert.equal(
      result.state_read.mode,
      'missing',
    )

    assert.equal(
      result.engine_result,
      blockedEngineResult,
    )

    assert.equal(
      result.persistence_plan,
      blockedPlan,
    )

    assert.equal(
      result.persistence_result,
      skippedResult,
    )
  },
)

test(
  'carrega estado anterior, valida o candidato e propaga conflito',
  async () => {
    const loadedRead =
      buildFoundReadResult()

    const candidateState =
      buildState({
        version:
          3,

        updatedAt:
          referenceTime,
      })

    const rawEngineResult =
      buildModelEngineResult({
        previousState:
          loadedRead.state,

        candidateState,
      })

    const conflictResult = {
      mode:
        'conflict',

      persisted:
        false,

      operation_key:
        'stateful-copilot:company:cycle:conversation:v3',

      writer_calls:
        1,

      current_state_version:
        3,

      current_state_updated_at:
        '2026-08-06T20:00:02-03:00',
    }

    let planReceived =
      null

    const result =
      await runStatefulCopilotIntegratedService({
        diagnostic_input:
          buildDiagnosticInput(),

        known_message_ids: [
          'm1',
          'm2',
        ],

        generated_at:
          generatedAt,

        reader:
          async () =>
            loadedRead,

        writer:
          async () => {
            throw new Error(
              'writer real não deveria ser chamado pelo executor simulado',
            )
          },

        provider,

        create_memory_id:
          createMemoryId,

        dependencies: {
          run_engine:
            async (
              args,
            ) => {
              assert.notEqual(
                args.previous_state,
                loadedRead.state,
              )

              assert.deepEqual(
                args.previous_state,
                loadedRead.state,
              )

              return rawEngineResult
            },

          build_persistence_plan:
            (
              args,
            ) => {
              planReceived =
                args.engine_result

              assert.notEqual(
                args.engine_result.candidate_state,
                candidateState,
              )

              assert.deepEqual(
                args.engine_result.candidate_state,
                candidateState,
              )

              return buildModelPersistencePlan(
                args.engine_result.candidate_state,
              )
            },

          execute_persistence:
            async () =>
              conflictResult,
        },
      })

    assert.equal(
      planReceived.mode,
      'model',
    )

    assert.equal(
      result.persistence_result.mode,
      'conflict',
    )

    assert.equal(
      result.persistence_result.current_state_version,
      3,
    )

    assert.equal(
      result.state_read.state_version,
      2,
    )

    assert.equal(
      result.engine_result.candidate_state.version,
      3,
    )
  },
)

test(
  'rejeita candidato inválido antes de criar plano ou persistir',
  async () => {
    let planCalls =
      0

    let persistenceCalls =
      0

    const invalidCandidate =
      buildState({
        version:
          1,

        updatedAt:
          referenceTime,

        evidenceMessageId:
          'mensagem-inexistente',
      })

    await assert.rejects(
      () =>
        runStatefulCopilotIntegratedService({
          diagnostic_input:
            buildDiagnosticInput(),

          known_message_ids: [
            'm1',
            'm2',
          ],

          generated_at:
            generatedAt,

          reader:
            async () =>
              buildMissingReadResult(),

          writer:
            async () => {
              throw new Error(
                'writer não deveria ser chamado',
              )
            },

          provider,

          create_memory_id:
            createMemoryId,

          dependencies: {
            run_engine:
              async () =>
                buildModelEngineResult({
                  previousState:
                    null,

                  candidateState:
                    invalidCandidate,
                }),

            build_persistence_plan:
              () => {
                planCalls += 1

                return buildBlockedPersistencePlan()
              },

            execute_persistence:
              async () => {
                persistenceCalls += 1

                return {
                  mode:
                    'skipped',
                }
              },
          },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotIntegratedServiceError,
        )

        assert.equal(
          error.code,
          'INVALID_CANDIDATE_STATE',
        )

        assert.equal(
          error.retryable,
          false,
        )

        assert.equal(
          error.message.includes(
            'mensagem-inexistente',
          ),
          false,
        )

        return true
      },
    )

    assert.equal(
      planCalls,
      0,
    )

    assert.equal(
      persistenceCalls,
      0,
    )
  },
)

test(
  'falha do leitor interrompe motor, plano e persistência',
  async () => {
    let engineCalls =
      0

    let planCalls =
      0

    let persistenceCalls =
      0

    const readError =
      new Error(
        'falha controlada do leitor',
      )

    await assert.rejects(
      () =>
        runStatefulCopilotIntegratedService({
          diagnostic_input:
            buildDiagnosticInput(),

          known_message_ids: [
            'm1',
            'm2',
          ],

          generated_at:
            generatedAt,

          reader:
            async () => {
              throw readError
            },

          writer:
            async () => {
              throw new Error(
                'writer não deveria ser chamado',
              )
            },

          provider,

          create_memory_id:
            createMemoryId,

          dependencies: {
            run_engine:
              async () => {
                engineCalls += 1

                return buildBlockedEngineResult()
              },

            build_persistence_plan:
              () => {
                planCalls += 1

                return buildBlockedPersistencePlan()
              },

            execute_persistence:
              async () => {
                persistenceCalls += 1

                return {
                  mode:
                    'skipped',
                }
              },
          },
        }),
      (
        error,
      ) =>
        error === readError,
    )

    assert.equal(
      engineCalls,
      0,
    )

    assert.equal(
      planCalls,
      0,
    )

    assert.equal(
      persistenceCalls,
      0,
    )
  },
)

test(
  'rejeita mensagem ativa ausente no ledger antes de consultar o banco',
  async () => {
    let readerCalls =
      0

    await assert.rejects(
      () =>
        runStatefulCopilotIntegratedService({
          diagnostic_input:
            buildDiagnosticInput(),

          known_message_ids: [
            'm1',
          ],

          generated_at:
            generatedAt,

          reader:
            async () => {
              readerCalls += 1

              return buildMissingReadResult()
            },

          writer:
            async () => {
              throw new Error(
                'writer não deveria ser chamado',
              )
            },

          provider,

          create_memory_id:
            createMemoryId,
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotIntegratedServiceError,
        )

        assert.equal(
          error.code,
          'ACTIVE_MESSAGE_NOT_KNOWN',
        )

        return true
      },
    )

    assert.equal(
      readerCalls,
      0,
    )
  },
)

test(
  'rejeita resultado do leitor pertencente a outra empresa',
  async () => {
    let engineCalls =
      0

    await assert.rejects(
      () =>
        runStatefulCopilotIntegratedService({
          diagnostic_input:
            buildDiagnosticInput(),

          known_message_ids: [
            'm1',
            'm2',
          ],

          generated_at:
            generatedAt,

          reader:
            async () => ({
              ...buildMissingReadResult(),

              company_id:
                '10000000-0000-4000-8000-000000000099',
            }),

          writer:
            async () => {
              throw new Error(
                'writer não deveria ser chamado',
              )
            },

          provider,

          create_memory_id:
            createMemoryId,

          dependencies: {
            run_engine:
              async () => {
                engineCalls += 1

                return buildBlockedEngineResult()
              },
          },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotIntegratedServiceError,
        )

        assert.equal(
          error.code,
          'STATE_READ_SCOPE_MISMATCH',
        )

        return true
      },
    )

    assert.equal(
      engineCalls,
      0,
    )
  },
)

test(
  'não modifica o estado retornado pelo leitor',
  async () => {
    const loadedRead =
      buildFoundReadResult()

    const originalState =
      JSON.parse(
        JSON.stringify(
          loadedRead.state,
        ),
      )

    await runStatefulCopilotIntegratedService({
      diagnostic_input:
        buildDiagnosticInput(),

      known_message_ids: [
        'm1',
        'm2',
      ],

      generated_at:
        generatedAt,

      reader:
        async () =>
          loadedRead,

      writer:
        async () => {
          throw new Error(
            'writer não deveria ser chamado',
          )
        },

      provider,

      create_memory_id:
        createMemoryId,

      dependencies: {
        run_engine:
          async (
            args,
          ) => {
            args
              .previous_state
              .current_moment
              .summary =
                'alteração local do motor simulado'

            return buildBlockedEngineResult()
          },

        build_persistence_plan:
          () =>
            buildBlockedPersistencePlan(),

        execute_persistence:
          async () => ({
            mode:
              'skipped',

            persisted:
              false,

            reason:
              'blocked_plan',

            operation_key:
              null,

            writer_calls:
              0,

            limitations:
              [],
          }),
      },
    })

    assert.deepEqual(
      loadedRead.state,
      originalState,
    )
  },
)
