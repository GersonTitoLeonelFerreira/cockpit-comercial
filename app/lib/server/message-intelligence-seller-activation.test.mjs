import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isMessageIntelligenceSellerActiveForCompanyV1,
  tryGenerateActivatedMessageIntelligenceSellerMessageV1,
} from './message-intelligence-seller-activation.ts'

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
  message =
    'Mensagem produzida pelo MIE.',
  wouldSurface = true,
  automaticSend = false,
  automaticCrmWrite = false,
  automaticAgendaWrite = false,
} = {}) {
  return {
    final_message_result: {
      status: 'selected',
      final_message: {
        text: message,
      },
    },

    shadow_evaluation: {
      would_surface_message:
        wouldSurface,

      automatic_send:
        automaticSend,

      automatic_crm_write:
        automaticCrmWrite,

      automatic_agenda_write:
        automaticAgendaWrite,
    },
  }
}

function baseArguments(
  dependencies,
) {
  return {
    admin: {},
    company_id: COMPANY_ID,
    seller_user_id: USER_ID,
    cycle_id: CYCLE_ID,
    conversation_key:
      'whatsapp:+5547999990001',
    seller_intent:
      'Responder ao cliente.',
    reference_time:
      '2026-09-03T23:00:00.000Z',
    dependencies: {
      persist_telemetry:
        async () => {},

      now:
        (() => {
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
  'seller activation: padrão continua shadow',
  () => {
    assert.equal(
      isMessageIntelligenceSellerActiveForCompanyV1({
        company_id: COMPANY_ID,
        env: {},
      }),
      false,
    )
  },
)

test(
  'seller activation: active exige empresa na allowlist',
  () => {
    assert.equal(
      isMessageIntelligenceSellerActiveForCompanyV1({
        company_id: COMPANY_ID,
        env: activeEnv(),
      }),
      true,
    )

    assert.equal(
      isMessageIntelligenceSellerActiveForCompanyV1({
        company_id: COMPANY_ID,
        env: activeEnv(
          'bbbbbbbb-0000-4000-8000-000000000001',
        ),
      }),
      false,
    )
  },
)

test(
  'seller activation: wildcard nunca ativa globalmente',
  () => {
    assert.equal(
      isMessageIntelligenceSellerActiveForCompanyV1({
        company_id: COMPANY_ID,
        env: activeEnv('*'),
      }),
      false,
    )
  },
)

test(
  'seller activation: MIE seguro e selecionado pode ser seller-facing',
  async () => {
    let runs = 0

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_request_id:
            () => 'request-1',

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () => {
              runs += 1
              return fakeRun()
            },
        }),
      )

    assert.equal(runs, 1)

    assert.deepEqual(
      result,
      {
        status: 'ready',
        message:
          'Mensagem produzida pelo MIE.',
        error: null,
      },
    )
  },
)

test(
  'seller activation: empresa fora da allowlist nem executa MIE',
  async () => {
    let runs = 0

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(
            'bbbbbbbb-0000-4000-8000-000000000001',
          ),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () => {
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
  'seller activation: qualquer ação automática bloqueia exposição',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () =>
              fakeRun({
                automaticSend: true,
              }),
        }),
      )

    assert.equal(result, null)
  },
)

test(
  'seller activation: falha do MIE retorna null para permitir fallback legacy',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () => {
              throw new Error(
                'falha simulada',
              )
            },
        }),
      )

    assert.equal(result, null)
  },
)


test(
  'seller activation: active_selected é persistido antes da mensagem ser liberada',
  async () => {
    const order = []
    let persisted = null

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () => {
              order.push('run')
              return fakeRun()
            },

          persist_telemetry:
            async ({ telemetry }) => {
              order.push('persist')
              persisted = telemetry
            },
        }),
      )

    assert.deepEqual(
      order,
      [
        'run',
        'persist',
      ],
    )

    assert.equal(
      result?.status,
      'ready',
    )

    assert.equal(
      persisted?.event_type,
      'active_selected',
    )

    for (const forbiddenKey of [
      'conversation_key',
      'seller_intent',
      'message',
      'mie_message',
      'legacy_message',
    ]) {
      assert.equal(
        Object.hasOwn(
          persisted,
          forbiddenKey,
        ),
        false,
      )
    }
  },
)

test(
  'seller activation: falha ao persistir active_selected impede exposição do MIE',
  async () => {
    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () =>
              fakeRun(),

          persist_telemetry:
            async () => {
              throw new Error(
                'fake telemetry failure',
              )
            },
        }),
      )

    assert.equal(
      result,
      null,
    )
  },
)

test(
  'seller activation: resultado não surfaciável registra fallback técnico',
  async () => {
    let persisted = null

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () =>
              fakeRun({
                wouldSurface:
                  false,
              }),

          persist_telemetry:
            async ({ telemetry }) => {
              persisted = telemetry
            },
        }),
      )

    assert.equal(
      result,
      null,
    )

    assert.equal(
      persisted?.event_type,
      'active_fallback_no_message',
    )
  },
)

test(
  'seller activation: falha de execução registra active_execution_failed',
  async () => {
    let persisted = null

    const result =
      await tryGenerateActivatedMessageIntelligenceSellerMessageV1(
        baseArguments({
          env: activeEnv(),

          create_source_loader:
            () => async () => ({}),

          run_message_intelligence:
            async () => {
              throw new Error(
                'fake execution failure',
              )
            },

          persist_telemetry:
            async ({ telemetry }) => {
              persisted = telemetry
            },
        }),
      )

    assert.equal(
      result,
      null,
    )

    assert.equal(
      persisted?.event_type,
      'active_execution_failed',
    )

    assert.equal(
      persisted?.final_status,
      null,
    )
  },
)
