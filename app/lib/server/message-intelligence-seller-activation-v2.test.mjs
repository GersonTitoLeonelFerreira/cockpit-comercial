import assert from 'node:assert/strict'
import test from 'node:test'

import {
  tryGenerateActivatedMessageIntelligenceSellerMessageV2,
} from './message-intelligence-seller-activation-v2.ts'

const COMPANY_ID =
  'aaaaaaaa-0000-4000-8000-000000000001'

const USER_ID =
  'aaaaaaaa-0000-4000-8000-0000000000a1'

const CYCLE_ID =
  'aaaaaaaa-0000-4000-8000-0000000000d1'

function activeEnv(
  companyIds = COMPANY_ID,
) {
  return {
    MESSAGE_INTELLIGENCE_SELLER_MODE:
      'active',

    MESSAGE_INTELLIGENCE_SELLER_COMPANY_IDS:
      companyIds,
  }
}

function fakeRun({
  status = 'generated',
  message =
    'Mensagem produzida pelo MIE V2.',
  wouldSurface = true,
  automaticSend = false,
  automaticCrmWrite = false,
  automaticAgendaWrite = false,
} = {}) {
  return {
    status,
    final_message: message,
    execution: {
      provider: 'openai',
      model: 'fake-model-v2',
      request_id: 'req-1',
      usage: null,
      attempts: 1,
      recovered_after_retry: false,
    },
    model_config: {
      status: 'ready',
      model: 'fake-model-v2',
      source: 'message_intelligence_env',
    },
    safety: {
      automatic_send: automaticSend,
      automatic_crm_write:
        automaticCrmWrite,
      automatic_agenda_write:
        automaticAgendaWrite,
      would_surface_message: wouldSurface,
    },
    error: null,
  }
}

function spyingPersist(
  recorded,
  impl = async () => {},
) {
  return async ({ telemetry }) => {
    recorded.push(telemetry)
    return impl()
  }
}

function baseArguments(dependencies) {
  return {
    admin: {},
    company_id: COMPANY_ID,
    seller_user_id: USER_ID,
    cycle_id: CYCLE_ID,
    conversation_key:
      'whatsapp:+5547999990001',
    seller_intent: 'Responder ao cliente.',
    reference_time:
      '2026-09-03T23:00:00.000Z',
    dependencies: {
      env: activeEnv(),
      persist_telemetry: async () => {},
      now: (() => {
        let value = 1_000
        return () => {
          value += 10
          return value
        }
      })(),
      ...dependencies,
    },
  }
}

test(
  'V2 seller activation: fora do modo ativo, retorna null sem executar o runner',
  async () => {
    let runs = 0

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          env: {},
          run_message_intelligence_v2: async () => {
            runs += 1
            return fakeRun()
          },
        }),
      )

    assert.equal(result, null)
    assert.equal(runs, 0)
  },
)

test(
  'V2 seller activation: run gerado e seguro pode ser seller-facing (outcome=message)',
  async () => {
    const recorded = []

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun(),
          persist_telemetry:
            spyingPersist(recorded),
        }),
      )

    assert.deepEqual(result, {
      outcome: 'message',
      status: 'ready',
      message: 'Mensagem produzida pelo MIE V2.',
      error: null,
    })

    assert.equal(recorded.length, 1)
    assert.equal(
      recorded[0].event_type,
      'active_selected',
    )
    assert.equal(
      recorded[0].final_status,
      'selected',
    )
    assert.equal(
      recorded[0].would_surface_message,
      true,
    )
  },
)

test(
  'V2 seller activation: silêncio válido (no_message) retorna outcome=silence, NUNCA null — não pode cair para o fallback legacy',
  async () => {
    const recorded = []

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun({
              status: 'no_message',
              message: null,
              wouldSurface: false,
            }),
          persist_telemetry:
            spyingPersist(recorded),
        }),
      )

    assert.deepEqual(result, {
      outcome: 'silence',
    })

    assert.equal(recorded.length, 1)
    assert.equal(
      recorded[0].event_type,
      'active_fallback_no_message',
    )
    assert.equal(
      recorded[0].final_status,
      'no_acceptable_message',
    )
  },
)

test(
  'V2 seller activation: silêncio válido continua outcome=silence mesmo se a telemetria falhar ao persistir',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun({
              status: 'no_message',
              message: null,
              wouldSurface: false,
            }),
          persist_telemetry: async () => {
            throw new Error(
              'persist failed',
            )
          },
        }),
      )

    // Silêncio não expõe conteúdo nenhum ao cliente, então a regra de
    // "nenhuma exposição sem trilha durável" (que existe para proteger
    // active_selected) não se aplica aqui — bloquear o silêncio faria o
    // chamador cair para o legacy e substituir uma decisão válida por uma
    // mensagem não solicitada.
    assert.deepEqual(result, {
      outcome: 'silence',
    })
  },
)

for (
  const status of [
    'config_not_ready',
    'provider_error',
    'invalid_output',
  ]
) {
  test(
    `V2 seller activation: falha técnica (${status}) cai para o fallback (retorna null) com telemetria active_execution_failed`,
    async () => {
      const recorded = []

      const result =
        await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
          baseArguments({
            run_message_intelligence_v2: async () =>
              fakeRun({
                status,
                message: null,
                wouldSurface: false,
              }),
            persist_telemetry:
              spyingPersist(recorded),
          }),
        )

      assert.equal(result, null)

      assert.equal(recorded.length, 1)
      assert.equal(
        recorded[0].event_type,
        'active_execution_failed',
      )
      assert.equal(
        recorded[0].final_status,
        null,
      )
      assert.equal(
        recorded[0].would_surface_message,
        null,
      )
    },
  )
}

test(
  'V2 seller activation: automatic_send=true nunca pode ser surfado',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun({
              automaticSend: true,
            }),
        }),
      )

    assert.equal(result, null)
  },
)

test(
  'V2 seller activation: erro do runner é contido e cai para o fallback',
  async () => {
    const recorded = []

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () => {
            throw new Error('boom')
          },
          persist_telemetry:
            spyingPersist(recorded),
        }),
      )

    assert.equal(result, null)
    assert.equal(recorded.length, 1)
    assert.equal(
      recorded[0].event_type,
      'active_execution_failed',
    )
    assert.equal(
      recorded[0].final_status,
      null,
    )
  },
)

test(
  'V2 seller activation: falha ao persistir telemetria de active_selected impede exposição',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun(),
          persist_telemetry: async () => {
            throw new Error('persist failed')
          },
        }),
      )

    assert.equal(result, null)
  },
)
