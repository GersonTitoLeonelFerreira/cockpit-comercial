// Testes do worker do Message Intelligence Engine V1 — Shadow
// Validation.
//
// Cobre:
// - Execução bem-sucedida persiste a run com os campos mínimos e
//   safety flags sempre false.
// - Idempotência: retry da mesma mensagem nunca re-executa uma run já
//   concluída nem cria uma segunda run.
// - Run não encontrada (fila sem linha persistida) não executa nada.
// - Falha do pipeline marca a run como failed sem derrubar o worker.
// - Zero side effect: nenhuma escrita fora de
//   message_intelligence_shadow_runs (nada de sales_cycles,
//   companion_commercial_states, WhatsApp, CRM, Agenda).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMessageIntelligenceFakeAdmin,
  buildTestConfigVersion,
} from '../companion/e2-test-support/fake-message-intelligence-admin.mjs'

import {
  processMessageIntelligenceShadowMessage,
} from './message-intelligence-shadow-worker.ts'

import {
  buildMessageIntelligenceShadowJobV1,
} from './message-intelligence-shadow-job.ts'

const IDS = {
  company: '10000000-0000-4000-8000-000000000001',
  lead: '20000000-0000-4000-8000-000000000001',
  cycle: '30000000-0000-4000-8000-000000000001',
  seller: '40000000-0000-4000-8000-000000000001',
  configVersion: '50000000-0000-4000-8000-000000000001',
}

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-08-29T22:00:00.000Z'

function baseFixtures() {
  return {
    companies: [
      {
        id: IDS.company,
        name: 'Empresa Fixture',
        platform_status: 'active',
        onboarding_status: 'active',
      },
    ],
    leads: [
      {
        id: IDS.lead,
        company_id: IDS.company,
        name: 'Cliente Fixture',
        phone: '+5547999990001',
        email: null,
        updated_at: '2026-08-29T21:55:00.000Z',
      },
    ],
    cycles: [
      {
        id: IDS.cycle,
        company_id: IDS.company,
        lead_id: IDS.lead,
        owner_user_id: IDS.seller,
        status: 'respondeu',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-08-29T21:55:00.000Z',
        origin_cycle_id: null,
      },
    ],
    reconciliation: [
      {
        company_id: IDS.company,
        conversation_key: CONVERSATION_KEY,
        current_message_id: 1,
        message_key: 'm1',
      },
    ],
    messages: [
      {
        id: 1,
        company_id: IDS.company,
        cycle_id: IDS.cycle,
        conversation_key: CONVERSATION_KEY,
        message_key: 'm1',
        version: 1,
        direction: 'incoming',
        occurred_at: '2026-08-29T21:55:00.000Z',
        observed_at: '2026-08-29T21:55:01.000Z',
        content_type: 'text',
        text_content: 'Qual é a condição de pagamento?',
        audio_transcription: null,
        is_deleted: false,
      },
    ],
    configVersions: [
      buildTestConfigVersion({
        id: IDS.configVersion,
        companyId: IDS.company,
      }),
    ],
  }
}

function buildJob(overrides = {}) {
  return buildMessageIntelligenceShadowJobV1({
    shadow_run_id: '60000000-0000-4000-8000-000000000001',
    company_id: IDS.company,
    seller_user_id: IDS.seller,
    cycle_id: IDS.cycle,
    conversation_key: CONVERSATION_KEY,
    seller_intent:
      'Quero confirmar o próximo passo com o cliente.',
    reference_time: REFERENCE_TIME,
    legacy_generation_status: 'ready',
    legacy_message: 'Mensagem legacy real, gerada pelo Companion hoje.',
    enqueued_at: REFERENCE_TIME,
    ...overrides,
  })
}

function shadowRunRow({ execution_status = 'queued', ...rest } = {}) {
  const job = buildJob()

  return {
    shadow_run_id: job.shadow_run_id,
    company_id: job.company_id,
    seller_user_id: job.seller_user_id,
    cycle_id: job.cycle_id,
    conversation_key: job.conversation_key,
    reference_time: job.reference_time,
    seller_intent: job.seller_intent,
    legacy_generation_status: job.legacy_generation_status,
    legacy_message: job.legacy_message,
    execution_status,
    automatic_send: false,
    automatic_crm_write: false,
    automatic_agenda_write: false,
    ...rest,
  }
}


function successfulRunFixture() {
  return {
    snapshot: {
      contract_version: 'message-context-snapshot-v1',
    },
    strategy: {
      contract_version: 'commercial-strategy-result-v1',
    },
    plan: {
      contract_version: 'message-plan-v1',
    },
    generation_result: {
      contract_version: 'candidate-generation-result-v1',
    },
    hard_gate_result: {
      contract_version: 'hard-gate-v1',
      status: 'all_passed',
    },
    critic_result: {
      contract_version: 'commercial-naturalness-critic-v1',
    },
    final_message_result: {
      contract_version: 'final-message-result-v1',
      final_message: null,
    },
    shadow_evaluation: {
      contract_version: 'message-intelligence-shadow-v1',
      final_status: 'no_acceptable_message',
      selected_candidate_id: null,
      candidate_count: 1,
      hard_gate_pass_count: 1,
      critic_evaluated_count: 1,
      selected_critic_status: null,
      selected_overall_score: null,
      would_surface_message: false,
      automatic_send: false,
      automatic_crm_write: false,
      automatic_agenda_write: false,
    },
  }
}

test(
  'execução bem-sucedida persiste a run com safety flags sempre false e nenhuma outra tabela é escrita',
  async () => {
    const { admin, tables, writeLog } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [shadowRunRow()],
      })

    await processMessageIntelligenceShadowMessage(
      buildJob(),
      { create_admin_client: () => admin },
    )

    const persisted = tables.message_intelligence_shadow_runs[0]

    assert.equal(persisted.execution_status, 'succeeded')
    assert.equal(typeof persisted.mie_final_status, 'string')
    assert.equal(persisted.automatic_send, false)
    assert.equal(persisted.automatic_crm_write, false)
    assert.equal(persisted.automatic_agenda_write, false)
    assert.equal(typeof persisted.candidate_count, 'number')
    assert.equal(typeof persisted.hard_gate_pass_count, 'number')
    assert.equal(typeof persisted.critic_evaluated_count, 'number')
    assert.equal(typeof persisted.completed_at, 'string')
    assert.notEqual(persisted.shadow_evaluation, undefined)
    assert.notEqual(persisted.contract_versions, undefined)

    // Zero side effect: a única tabela escrita em toda a execução é o
    // domínio shadow. Nenhuma escrita em sales_cycles,
    // companion_commercial_states ou qualquer outra tabela
    // operacional/CRM/Agenda.
    const writtenTables = new Set(
      writeLog.map((entry) => entry.table),
    )

    assert.deepEqual(
      [...writtenTables],
      ['message_intelligence_shadow_runs'],
    )
  },
)

test(
  'idempotência: retry de uma run já succeeded não re-executa o pipeline nem duplica a run',
  async () => {
    const { admin, tables, writeLog } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow({ execution_status: 'succeeded' }),
        ],
      })

    let pipelineCalls = 0

    await processMessageIntelligenceShadowMessage(
      buildJob(),
      {
        create_admin_client: () => admin,
        run_message_intelligence: async () => {
          pipelineCalls += 1
          throw new Error(
            'não deveria ter sido chamado para uma run já succeeded',
          )
        },
      },
    )

    assert.equal(pipelineCalls, 0)
    assert.equal(
      tables.message_intelligence_shadow_runs.length,
      1,
    )
    assert.equal(writeLog.length, 0)
  },
)

test(
  'idempotência: retry de uma run já failed também não re-executa',
  async () => {
    const { admin, tables } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow({
            execution_status: 'failed',
            failure_code: 'SOME_PREVIOUS_FAILURE',
          }),
        ],
      })

    let pipelineCalls = 0

    await processMessageIntelligenceShadowMessage(
      buildJob(),
      {
        create_admin_client: () => admin,
        run_message_intelligence: async () => {
          pipelineCalls += 1
          throw new Error('não deveria ter sido chamado')
        },
      },
    )

    assert.equal(pipelineCalls, 0)
    assert.equal(
      tables.message_intelligence_shadow_runs[0]
        .execution_status,
      'failed',
    )
    assert.equal(
      tables.message_intelligence_shadow_runs[0]
        .failure_code,
      'SOME_PREVIOUS_FAILURE',
    )
  },
)

test(
  'run não persistida (fila sem linha correspondente) nunca executa o pipeline',
  async () => {
    const { admin, tables, writeLog } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [],
      })

    let pipelineCalls = 0

    await processMessageIntelligenceShadowMessage(
      buildJob(),
      {
        create_admin_client: () => admin,
        run_message_intelligence: async () => {
          pipelineCalls += 1
          return {}
        },
      },
    )

    assert.equal(pipelineCalls, 0)
    assert.equal(
      tables.message_intelligence_shadow_runs.length,
      0,
    )
    assert.equal(writeLog.length, 0)
  },
)

test(
  'falha do pipeline marca a run como failed, preserva safety flags e não derruba o worker',
  async () => {
    const { admin, tables } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [shadowRunRow()],
      })

    await assert.doesNotReject(
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client: () => admin,
          run_message_intelligence: async () => {
            throw new Error('falha simulada do pipeline')
          },
        },
      ),
    )

    const persisted = tables.message_intelligence_shadow_runs[0]

    assert.equal(persisted.execution_status, 'failed')
    assert.equal(
      typeof persisted.failure_code,
      'string',
    )
    assert.equal(persisted.automatic_send, false)
    assert.equal(persisted.automatic_crm_write, false)
    assert.equal(persisted.automatic_agenda_write, false)
    // A falha nunca fabrica um resultado do MIE: nenhum campo
    // mie_final_status/mie_message chega a ser escrito.
    assert.equal(
      'mie_final_status' in persisted,
      false,
    )
    assert.equal(
      'mie_message' in persisted,
      false,
    )
  },
)

test(
  'violação de safety (automatic_* !== false) nunca chega a ser persistida como sucesso',
  async () => {
    const { admin, tables } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [shadowRunRow()],
      })

    await processMessageIntelligenceShadowMessage(
      buildJob(),
      {
        create_admin_client: () => admin,
        run_message_intelligence: async () => ({
          snapshot: { contract_version: 'x' },
          strategy: { contract_version: 'x' },
          plan: { contract_version: 'x' },
          generation_result: { contract_version: 'x' },
          hard_gate_result: { contract_version: 'x' },
          critic_result: { contract_version: 'x' },
          final_message_result: {
            contract_version: 'x',
            final_message: null,
          },
          shadow_evaluation: {
            contract_version: 'message-intelligence-shadow-v1',
            final_status: 'selected',
            selected_candidate_id: 'c1',
            candidate_count: 1,
            hard_gate_pass_count: 1,
            critic_evaluated_count: 1,
            selected_critic_status: 'recommended',
            selected_overall_score: 90,
            would_surface_message: true,
            automatic_send: true,
            automatic_crm_write: false,
            automatic_agenda_write: false,
          },
        }),
      },
    )

    const persisted = tables.message_intelligence_shadow_runs[0]

    assert.equal(persisted.execution_status, 'failed')
    assert.equal(persisted.failure_code, 'SAFETY_VIOLATION')
    assert.equal(persisted.automatic_send, false)
  },
)


test(
  'read error faz o worker falhar para retry antes de executar o pipeline',
  async () => {
    const {
      admin,
    } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow(),
        ],
        resolveInterceptor({
          table,
          operation,
        }) {
          if (
            table === 'message_intelligence_shadow_runs' &&
            operation === 'select'
          ) {
            return {
              data: null,
              error: {
                message: 'read failed',
              },
            }
          }

          return null
        },
      })

    let pipelineCalls = 0

    await assert.rejects(
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client:
            () => admin,
          run_message_intelligence:
            async () => {
              pipelineCalls += 1
              return successfulRunFixture()
            },
        },
      ),
      /MESSAGE_INTELLIGENCE_SHADOW_RUN_READ_FAILED/,
    )

    assert.equal(
      pipelineCalls,
      0,
    )
  },
)

test(
  'claim update error faz o worker falhar para retry e não executa MIE',
  async () => {
    const {
      admin,
    } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow(),
        ],
        resolveInterceptor({
          table,
          operation,
          patch,
        }) {
          if (
            table === 'message_intelligence_shadow_runs' &&
            operation === 'update' &&
            patch?.execution_status === 'running'
          ) {
            return {
              data: null,
              error: {
                message: 'claim update failed',
              },
            }
          }

          return null
        },
      })

    let pipelineCalls = 0

    await assert.rejects(
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client:
            () => admin,
          run_message_intelligence:
            async () => {
              pipelineCalls += 1
              return successfulRunFixture()
            },
        },
      ),
      /MESSAGE_INTELLIGENCE_SHADOW_CLAIM_UPDATE_FAILED/,
    )

    assert.equal(
      pipelineCalls,
      0,
    )
  },
)

test(
  'success update error não é tratado como sucesso: worker falha para retry',
  async () => {
    const {
      admin,
      tables,
    } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow(),
        ],
        resolveInterceptor({
          table,
          operation,
          patch,
        }) {
          if (
            table === 'message_intelligence_shadow_runs' &&
            operation === 'update' &&
            patch?.execution_status === 'succeeded'
          ) {
            return {
              data: null,
              error: {
                message: 'success persist failed',
              },
            }
          }

          return null
        },
      })

    await assert.rejects(
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client:
            () => admin,
          run_message_intelligence:
            async () =>
              successfulRunFixture(),
        },
      ),
      /MESSAGE_INTELLIGENCE_SHADOW_SUCCESS_UPDATE_FAILED/,
    )

    assert.equal(
      tables.message_intelligence_shadow_runs[0]
        .execution_status,
      'running',
    )
  },
)

test(
  'failure update error faz o worker falhar para retry em vez de engolir a falha terminal',
  async () => {
    const {
      admin,
      tables,
    } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow(),
        ],
        resolveInterceptor({
          table,
          operation,
          patch,
        }) {
          if (
            table === 'message_intelligence_shadow_runs' &&
            operation === 'update' &&
            patch?.execution_status === 'failed'
          ) {
            return {
              data: null,
              error: {
                message: 'failure persist failed',
              },
            }
          }

          return null
        },
      })

    await assert.rejects(
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client:
            () => admin,
          run_message_intelligence:
            async () => {
              throw new Error(
                'pipeline failed before terminal persist',
              )
            },
        },
      ),
      /MESSAGE_INTELLIGENCE_SHADOW_FAILURE_UPDATE_FAILED/,
    )

    assert.equal(
      tables.message_intelligence_shadow_runs[0]
        .execution_status,
      'running',
    )
  },
)

test(
  'claim lost no compare-and-set impede execução sem promover ownership inexistente',
  async () => {
    const {
      admin,
    } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow(),
        ],
        resolveInterceptor({
          table,
          operation,
          patch,
        }) {
          if (
            table === 'message_intelligence_shadow_runs' &&
            operation === 'update' &&
            patch?.execution_status === 'running'
          ) {
            return {
              data: [],
              error: null,
            }
          }

          return null
        },
      })

    let pipelineCalls = 0

    await processMessageIntelligenceShadowMessage(
      buildJob(),
      {
        create_admin_client:
          () => admin,
        run_message_intelligence:
          async () => {
            pipelineCalls += 1
            return successfulRunFixture()
          },
      },
    )

    assert.equal(
      pipelineCalls,
      0,
    )
  },
)

test(
  'concorrência: segundo worker não executa enquanto o primeiro possui claim ativo',
  async () => {
    const {
      admin,
      tables,
    } =
      createMessageIntelligenceFakeAdmin({
        ...baseFixtures(),
        shadowRuns: [
          shadowRunRow(),
        ],
      })

    let pipelineCalls = 0
    let releaseFirst
    let signalStarted

    const started =
      new Promise((resolve) => {
        signalStarted = resolve
      })

    const waitFirst =
      new Promise((resolve) => {
        releaseFirst = resolve
      })

    const first =
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client:
            () => admin,
          create_claim_token:
            () =>
              '70000000-0000-4000-8000-000000000001',
          run_message_intelligence:
            async () => {
              pipelineCalls += 1
              signalStarted()
              await waitFirst
              return successfulRunFixture()
            },
        },
      )

    await started

    await assert.rejects(
      processMessageIntelligenceShadowMessage(
        buildJob(),
        {
          create_admin_client:
            () => admin,
          create_claim_token:
            () =>
              '70000000-0000-4000-8000-000000000002',
          run_message_intelligence:
            async () => {
              pipelineCalls += 1
              return successfulRunFixture()
            },
        },
      ),
      /MESSAGE_INTELLIGENCE_SHADOW_RUN_ALREADY_CLAIMED/,
    )

    assert.equal(
      pipelineCalls,
      1,
    )

    releaseFirst()
    await first

    assert.equal(
      tables.message_intelligence_shadow_runs[0]
        .execution_status,
      'succeeded',
    )
  },
)
