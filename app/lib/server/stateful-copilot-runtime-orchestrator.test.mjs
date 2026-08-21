import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStatefulCopilotServerRuntimeOrchestrator,
} from './stateful-copilot-runtime-orchestrator.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const otherCompanyId =
  '10000000-0000-4000-8000-000000000002'

const cycleId =
  '20000000-0000-4000-8000-000000000001'

const deviceKey =
  '30000000-0000-4000-8000-000000000001'

const conversationKey =
  'whatsapp:+5547999990001'

const referenceTime =
  '2026-08-07T04:00:00.000Z'

const v1Response = {
  contract_version:
    'companion-v1',

  reply:
    'Resposta original do Companion V1.',
}

const statefulOutput = {
  contract_version:
    'phase-5.1-stateful-copilot-v2',

  strategy: {
    suggested_message:
      'Resposta stateful.',
  },
}

const commercialReading = {
  contract_version:
    'commercial-reading-v1',

  best_approach: {
    decision:
      'respond',
  },
}

function buildContext() {
  return {
    loaded_at:
      referenceTime,

    scope: {
      company: {
        id:
          companyId,
      },

      cycle: {
        id:
          cycleId,
      },

      conversation_key:
        conversationKey,
    },

    commercial_config_status:
      'published',

    diagnostic_input: {
      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      conversation: {
        active_message_ids: [
          '2',
        ],
      },
    },

    known_message_ids: [
      '1',
      '2',
    ],

    active_message_ids: [
      '2',
    ],

    state_read: {
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
    },
  }
}

function buildIntegratedResult({
  engineMode = 'model',
  persistenceMode = 'persisted',
} = {}) {
  const engineResult =
    engineMode === 'model'
      ? {
          mode:
            'model',

          output:
            statefulOutput,

          communication_output: {
            contract_version:
              'phase-5.2-communication-v2',

            intervention_needed:
              true,

            suggested_message:
              'Resposta stateful.',

            commercial_reading:
              commercialReading,
          },

          communication_execution: {
            attempts:
              1,
          },

          candidate_state: {
            version:
              1,
          },
        }
      : {
          mode:
            'blocked',

          output:
            null,

          candidate_state:
            null,
        }

  const persistenceResult =
    persistenceMode === 'persisted'
      ? {
          mode:
            'persisted',

          persisted:
            true,
        }
      : persistenceMode === 'conflict'
        ? {
            mode:
              'conflict',

            persisted:
              false,
          }
        : {
            mode:
              'skipped',

            persisted:
              false,
          }

  return {
    engine_result:
      engineResult,

    persistence_result:
      persistenceResult,
  }
}

function buildRunArgs() {
  return {
    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    device_key:
      deviceKey,

    reference_time:
      referenceTime,

    v1_response:
      v1Response,
  }
}

function createHarness({
  mode,
  engineVersion,
  allowedCompanyIds =
    companyId,
  integratedResult =
    buildIntegratedResult(),
  runtimeError =
    null,
} = {}) {
  const context =
    buildContext()

  const calls = {
    context_factory:
      0,

    composition_factory:
      0,

    context_loader:
      0,

    service:
      0,
  }

  const orchestrator =
    createStatefulCopilotServerRuntimeOrchestrator({
      configured_mode:
        mode,

      configured_company_ids:
        allowedCompanyIds,

      configured_engine_version:
        engineVersion,

      dependencies: {
        create_context_loader() {
          calls.context_factory +=
            1

          return async () => {
            calls.context_loader +=
              1

            if (runtimeError) {
              throw runtimeError
            }

            return context
          }
        },

        create_composition() {
          calls.composition_factory +=
            1

          return {
            writer:
              async () => ({
                status:
                  'persisted',
              }),

            provider:
              async () => ({
                output:
                  statefulOutput,
              }),

            create_memory_id:
              () =>
                'stateful-memory-test',
          }
        },

        async run_service({
          reader,
        }) {
          calls.service +=
            1

          const loadedState =
            await reader({
              company_id:
                companyId,

              cycle_id:
                cycleId,

              conversation_key:
                conversationKey,

              known_message_ids: [
                '1',
                '2',
              ],

              active_message_ids: [
                '2',
              ],
            })

          assert.equal(
            loadedState,
            context.state_read,
          )

          return integratedResult
        },
      },
    })

  return {
    orchestrator,
    calls,
  }
}

test(
  'fase 5.1 disabled preserva V1 sem criar runtime stateful',
  async () => {
    const {
      orchestrator,
      calls,
    } =
      createHarness({
        mode:
          'disabled',

        engineVersion:
          'v1',
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.project_phase,
      'phase-5',
    )

    assert.equal(
      result.project_subphase,
      'phase-5.4',
    )

    assert.equal(
      result.mode,
      'v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.stateful_executed,
      false,
    )

    assert.equal(
      calls.context_factory,
      0,
    )

    assert.equal(
      calls.composition_factory,
      0,
    )

    assert.equal(
      calls.service,
      0,
    )
  },
)

test(
  'configuração inválida do gate preserva V1 sem criar runtime stateful',
  async () => {
    let contextFactoryCalls =
      0

    const orchestrator =
      createStatefulCopilotServerRuntimeOrchestrator({
        configured_mode:
          'modo-invalido',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v1',

        dependencies: {
          create_context_loader() {
            contextFactoryCalls +=
              1

            throw new Error(
              'Runtime stateful não deveria ser criado.',
            )
          },

          create_composition() {
            throw new Error(
              'Composition stateful não deveria ser criada.',
            )
          },
        },
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.stateful_executed,
      false,
    )

    assert.equal(
      result.activation
        .preserve_v1_response,
      true,
    )

    assert.equal(
      contextFactoryCalls,
      0,
    )
  },
)

test(
  'empresa fora da allowlist preserva V1 sem criar runtime',
  async () => {
    const {
      orchestrator,
      calls,
    } =
      createHarness({
        mode:
          'shadow',

        engineVersion:
          'v1',

        allowedCompanyIds:
          otherCompanyId,
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'v1',
    )

    assert.equal(
      result.activation.reason,
      'company_not_allowed',
    )

    assert.equal(
      calls.context_factory,
      0,
    )

    assert.equal(
      calls.composition_factory,
      0,
    )
  },
)

test(
  'active com engine v1 falha fechado antes do runtime',
  async () => {
    const {
      orchestrator,
      calls,
    } =
      createHarness({
        mode:
          'active',

        engineVersion:
          'v1',
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'v1',
    )

    assert.equal(
      result.activation.reason,
      'active_engine_version_required',
    )

    assert.equal(
      calls.context_loader,
      0,
    )

    assert.equal(
      calls.service,
      0,
    )
  },
)

test(
  'shadow executa stateful mas preserva exatamente a resposta V1',
  async () => {
    const {
      orchestrator,
      calls,
    } =
      createHarness({
        mode:
          'shadow',

        engineVersion:
          'v1',
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'shadow',
    )

    assert.equal(
      result.response_source,
      'v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.stateful_executed,
      true,
    )

    assert.equal(
      result.stateful_execution.engine_mode,
      'model',
    )

    assert.equal(
      result.stateful_execution.persisted,
      true,
    )

    assert.equal(
      result
        .stateful_execution
        .communication_contract_version,
      'phase-5.2-communication-v2',
    )

    assert.equal(
      calls.context_loader,
      1,
    )

    assert.equal(
      calls.service,
      1,
    )

    assert.equal(
      result.automatic_crm_write,
      false,
    )

    assert.equal(
      result.automatic_agenda_write,
      false,
    )
  },
)

test(
  'active expoe V2 somente depois da persistencia confirmada',
  async () => {
    const {
      orchestrator,
      calls,
    } =
      createHarness({
        mode:
          'active',

        engineVersion:
          'v2',
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active',
    )

    assert.equal(
      result.response_source,
      'stateful',
    )

    assert.equal(
      result.response,
      statefulOutput,
    )

    assert.equal(
      result.commercial_reading,
      commercialReading,
    )

    assert.equal(
      result
        .commercial_reading
        .contract_version,
      'commercial-reading-v1',
    )

    assert.equal(
      result.stateful_execution.persisted,
      true,
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
      calls.context_loader,
      1,
    )

    assert.equal(
      calls.service,
      1,
    )
  },
)

test(
  'active preserva V1 quando o motor stateful fica bloqueado',
  async () => {
    const {
      orchestrator,
    } =
      createHarness({
        mode:
          'active',

        engineVersion:
          'v2',

        integratedResult:
          buildIntegratedResult({
            engineMode:
              'blocked',

            persistenceMode:
              'skipped',
          }),
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active_fallback_v1',
    )

    assert.equal(
      result.response_source,
      'v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.fallback_reason,
      'stateful_output_unavailable',
    )

    assert.equal(
      result.stateful_execution.engine_mode,
      'blocked',
    )

    assert.equal(
      result.stateful_execution.persisted,
      false,
    )
  },
)

test(
  'active preserva V1 quando a persistencia encontra conflito',
  async () => {
    const {
      orchestrator,
    } =
      createHarness({
        mode:
          'active',

        engineVersion:
          'v2',

        integratedResult:
          buildIntegratedResult({
            engineMode:
              'model',

            persistenceMode:
              'conflict',
          }),
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active_fallback_v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.fallback_reason,
      'stateful_state_not_persisted',
    )

    assert.equal(
      result.stateful_execution.persistence_mode,
      'conflict',
    )

    assert.equal(
      result.stateful_execution.persisted,
      false,
    )
  },
)

test(
  'falha do runtime stateful preserva V1 sem expor mensagem interna',
  async () => {
    const internalMessage =
      'detalhe privado da infraestrutura'

    const {
      orchestrator,
    } =
      createHarness({
        mode:
          'shadow',

        engineVersion:
          'v1',

        runtimeError: {
          code:
            'REAL_CONTEXT_READ_UNAVAILABLE',

          status_code:
            503,

          retryable:
            true,

          message:
            internalMessage,
        },
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active_fallback_v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.fallback_reason,
      'stateful_runtime_failed',
    )

    assert.deepEqual(
      result.stateful_failure,
      {
        code:
          'REAL_CONTEXT_READ_UNAVAILABLE',

        status_code:
          503,

        retryable:
          true,
      },
    )

    assert.equal(
      JSON.stringify(
        result,
      ).includes(
        internalMessage,
      ),
      false,
    )
  },
)

test(
  'runtime server-only e reutilizado entre execucoes stateful',
  async () => {
    const {
      orchestrator,
      calls,
    } =
      createHarness({
        mode:
          'shadow',

        engineVersion:
          'v1',
      })

    await orchestrator(
      buildRunArgs(),
    )

    await orchestrator(
      buildRunArgs(),
    )

    assert.equal(
      calls.context_factory,
      1,
    )

    assert.equal(
      calls.composition_factory,
      1,
    )

    assert.equal(
      calls.context_loader,
      2,
    )

    assert.equal(
      calls.service,
      2,
    )
  },
)

function delay(
  ms,
) {
  return new Promise(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        ms,
      )
    },
  )
}

// Cenário A: dentro de um orçamento de ciclo explícito, a chamada ao
// provedor termina a tempo e o resultado ativo segue normalmente.
test(
  'active com deadline de ciclo configurado permanece bem-sucedido quando o provedor termina a tempo',
  async () => {
    const context =
      buildContext()

    let providerCalls =
      0

    let writerCalls =
      0

    const orchestrator =
      createStatefulCopilotServerRuntimeOrchestrator({
        configured_mode:
          'active',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v2',

        cycle_deadline_ms:
          5_000,

        dependencies: {
          create_context_loader() {
            return async () =>
              context
          },

          create_composition() {
            return {
              writer:
                async () => {
                  writerCalls +=
                    1

                  return {
                    status:
                      'persisted',
                  }
                },

              provider:
                async () => {
                  providerCalls +=
                    1

                  await delay(
                    10,
                  )

                  return {
                    output:
                      statefulOutput,
                  }
                },

              create_memory_id:
                () =>
                  'stateful-memory-test',
            }
          },

          async run_service({
            reader,
            provider,
            writer,
          }) {
            await reader({
              company_id:
                companyId,

              cycle_id:
                cycleId,

              conversation_key:
                conversationKey,

              known_message_ids: [
                '1',
                '2',
              ],

              active_message_ids: [
                '2',
              ],
            })

            await provider({})

            await writer({
              operation_key:
                'op-1',

              plan: {},
            })

            return buildIntegratedResult()
          },
        },
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active',
    )

    assert.equal(
      result.response_source,
      'stateful',
    )

    assert.equal(
      providerCalls,
      1,
    )

    assert.equal(
      writerCalls,
      1,
    )
  },
)

// Cenário D/G: o provedor demora além do orçamento agregado do ciclo — o
// runtime abandona a chamada com segurança e cai para o V1, sem liberar
// gravação automática de CRM/Agenda.
test(
  'active cai para V1 com seguranca quando o deadline global do ciclo esgota durante o provedor',
  async () => {
    const context =
      buildContext()

    let providerCalls =
      0

    let writerCalls =
      0

    const orchestrator =
      createStatefulCopilotServerRuntimeOrchestrator({
        configured_mode:
          'active',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v2',

        cycle_deadline_ms:
          5_000,

        dependencies: {
          create_context_loader() {
            return async () =>
              context
          },

          create_composition() {
            return {
              writer:
                async () => {
                  writerCalls +=
                    1

                  return {
                    status:
                      'persisted',
                  }
                },

              provider:
                async () => {
                  providerCalls +=
                    1

                  await delay(
                    5_300,
                  )

                  return {
                    output:
                      statefulOutput,
                  }
                },

              create_memory_id:
                () =>
                  'stateful-memory-test',
            }
          },

          async run_service({
            reader,
            provider,
            writer,
          }) {
            await reader({
              company_id:
                companyId,

              cycle_id:
                cycleId,

              conversation_key:
                conversationKey,

              known_message_ids: [
                '1',
                '2',
              ],

              active_message_ids: [
                '2',
              ],
            })

            // O deadline global deve interromper esta chamada antes que o
            // provedor "lento" termine — se não interromper, o teste falha
            // porque o writer abaixo seria alcançado.
            await provider({})

            await writer({
              operation_key:
                'op-1',

              plan: {},
            })

            return buildIntegratedResult()
          },
        },
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active_fallback_v1',
    )

    assert.equal(
      result.response_source,
      'v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.fallback_reason,
      'stateful_runtime_failed',
    )

    assert.equal(
      result.stateful_failure.code,
      'STATEFUL_CYCLE_DEADLINE_EXCEEDED',
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
      providerCalls,
      1,
    )

    assert.equal(
      writerCalls,
      0,
    )
  },
)

// Cenário E/F/G: quando o orçamento do ciclo já se esgotou antes da
// persistência (por exemplo, o motor levou tempo demais processando o
// resultado do provedor), a gravação nunca é sequer iniciada — nada de
// estado parcial, nada de estado exposto sem persistência confirmada.
test(
  'active nao inicia gravacao quando o deadline global esgota antes da persistencia',
  async () => {
    const context =
      buildContext()

    let providerCalls =
      0

    let writerCalls =
      0

    const orchestrator =
      createStatefulCopilotServerRuntimeOrchestrator({
        configured_mode:
          'active',

        configured_company_ids:
          companyId,

        configured_engine_version:
          'v2',

        cycle_deadline_ms:
          5_000,

        dependencies: {
          create_context_loader() {
            return async () =>
              context
          },

          create_composition() {
            return {
              writer:
                async () => {
                  writerCalls +=
                    1

                  return {
                    status:
                      'persisted',
                  }
                },

              provider:
                async () => {
                  providerCalls +=
                    1

                  return {
                    output:
                      statefulOutput,
                  }
                },

              create_memory_id:
                () =>
                  'stateful-memory-test',
            }
          },

          async run_service({
            reader,
            provider,
            writer,
          }) {
            await reader({
              company_id:
                companyId,

              cycle_id:
                cycleId,

              conversation_key:
                conversationKey,

              known_message_ids: [
                '1',
                '2',
              ],

              active_message_ids: [
                '2',
              ],
            })

            await provider({})

            // Simula processamento (motor/reducer) que consumiu o resto do
            // orçamento do ciclo antes de chegar à persistência.
            await delay(
              5_300,
            )

            await writer({
              operation_key:
                'op-1',

              plan: {},
            })

            return buildIntegratedResult()
          },
        },
      })

    const result =
      await orchestrator(
        buildRunArgs(),
      )

    assert.equal(
      result.mode,
      'active_fallback_v1',
    )

    assert.equal(
      result.response_source,
      'v1',
    )

    assert.equal(
      result.response,
      v1Response,
    )

    assert.equal(
      result.fallback_reason,
      'stateful_runtime_failed',
    )

    assert.equal(
      result.stateful_failure.code,
      'STATEFUL_CYCLE_DEADLINE_EXCEEDED',
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
      providerCalls,
      1,
    )

    assert.equal(
      writerCalls,
      0,
    )
  },
)
