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
  'V2 seller activation: run gerado e seguro pode ser seller-facing',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun(),
        }),
      )

    assert.deepEqual(result, {
      status: 'ready',
      message: 'Mensagem produzida pelo MIE V2.',
      error: null,
    })
  },
)

test(
  'V2 seller activation: no_message cai para o fallback (retorna null)',
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
        }),
      )

    assert.equal(result, null)
  },
)

test(
  'V2 seller activation: config_not_ready cai para o fallback (retorna null)',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () =>
            fakeRun({
              status: 'config_not_ready',
              message: null,
              wouldSurface: false,
            }),
        }),
      )

    assert.equal(result, null)
  },
)

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
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV2(
        baseArguments({
          run_message_intelligence_v2: async () => {
            throw new Error('boom')
          },
        }),
      )

    assert.equal(result, null)
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
