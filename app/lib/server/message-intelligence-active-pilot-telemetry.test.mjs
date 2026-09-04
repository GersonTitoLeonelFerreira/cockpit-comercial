import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MessageIntelligenceActivePilotTelemetryPersistenceError,
  buildMessageIntelligenceActivePilotTelemetryV1,
  buildMessageIntelligenceActivePilotTelemetryV2,
  persistMessageIntelligenceActivePilotTelemetryV1,
} from './message-intelligence-active-pilot-telemetry.ts'

const COMPANY_ID =
  'aaaaaaaa-0000-4000-8000-000000000001'

const USER_ID =
  'aaaaaaaa-0000-4000-8000-0000000000a1'

const CYCLE_ID =
  'aaaaaaaa-0000-4000-8000-0000000000d1'

function fakeRun() {
  return {
    final_message_result: {
      status:
        'selected',
      final_message: {
        text:
          'Texto que nunca deve entrar na telemetria.',
      },
    },

    hard_gate_result: {
      status:
        'all_passed',
    },

    shadow_evaluation: {
      final_status:
        'selected',

      would_surface_message:
        true,

      selected_overall_score:
        94,

      selected_critic_status:
        'recommended',

      automatic_send:
        false,

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    },
  }
}

test(
  'telemetria MIE active contém somente metadados técnicos',
  () => {
    const telemetry =
      buildMessageIntelligenceActivePilotTelemetryV1({
        event_type:
          'active_selected',

        company_id:
          COMPANY_ID,

        seller_user_id:
          USER_ID,

        cycle_id:
          CYCLE_ID,

        duration_ms:
          127.8,

        run:
          fakeRun(),
      })

    assert.equal(
      telemetry.duration_ms,
      127,
    )

    assert.equal(
      telemetry.final_status,
      'selected',
    )

    assert.equal(
      telemetry.would_surface_message,
      true,
    )

    const serialized =
      JSON.stringify(
        telemetry,
      )

    assert.equal(
      serialized.includes(
        'Texto que nunca deve entrar na telemetria.',
      ),
      false,
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
          telemetry,
          forbiddenKey,
        ),
        false,
      )
    }
  },
)

test(
  'persistência grava somente a tabela interna do piloto MIE',
  async () => {
    const inserted = []

    const admin = {
      from(table) {
        assert.equal(
          table,
          'message_intelligence_active_pilot_events',
        )

        return {
          insert(row) {
            inserted.push(row)

            return Promise.resolve({
              data: null,
              error: null,
            })
          },
        }
      },
    }

    const telemetry =
      buildMessageIntelligenceActivePilotTelemetryV1({
        event_type:
          'active_selected',

        company_id:
          COMPANY_ID,

        seller_user_id:
          USER_ID,

        cycle_id:
          CYCLE_ID,

        duration_ms:
          20,

        run:
          fakeRun(),
      })

    await persistMessageIntelligenceActivePilotTelemetryV1({
      admin,
      telemetry,
    })

    assert.equal(
      inserted.length,
      1,
    )

    assert.equal(
      inserted[0].event_type,
      'active_selected',
    )

    assert.equal(
      'message' in
        inserted[0],
      false,
    )
  },
)

// Reprodução literal, em JS puro, das constraints da migration
// supabase/migrations/20260904014500_create_message_intelligence_active_pilot_events.sql
// — sem depender de um Postgres real. Qualquer telemetria (V1 ou V2) que
// não satisfaça isso aqui seria rejeitada pelo INSERT real no banco.
const LEGACY_FINAL_STATUS_VALUES = new Set([
  'selected',
  'no_acceptable_message',
  'no_eligible_candidates',
  'blocked',
  'approval_required',
  'inconsistent_input',
])

function assertSatisfiesActivePilotEventsMigrationConstraints(
  telemetry,
) {
  assert.ok(
    [
      'active_selected',
      'active_fallback_no_message',
      'active_execution_failed',
    ].includes(telemetry.event_type),
    'message_intelligence_active_pilot_event_type_check',
  )

  assert.ok(
    telemetry.final_status === null ||
      LEGACY_FINAL_STATUS_VALUES.has(
        telemetry.final_status,
      ),
    'message_intelligence_active_pilot_final_status_check',
  )

  assert.equal(
    telemetry.automatic_send,
    false,
    'message_intelligence_active_pilot_no_auto_action_check (automatic_send)',
  )
  assert.equal(
    telemetry.automatic_crm_write,
    false,
    'message_intelligence_active_pilot_no_auto_action_check (automatic_crm_write)',
  )
  assert.equal(
    telemetry.automatic_agenda_write,
    false,
    'message_intelligence_active_pilot_no_auto_action_check (automatic_agenda_write)',
  )

  const payloadOk =
    (
      telemetry.event_type ===
        'active_selected' &&
      telemetry.final_status ===
        'selected' &&
      telemetry.would_surface_message ===
        true
    ) ||
    (
      telemetry.event_type ===
        'active_fallback_no_message' &&
      telemetry.final_status !== null
    ) ||
    (
      telemetry.event_type ===
        'active_execution_failed' &&
      telemetry.final_status === null &&
      telemetry.would_surface_message ===
        null
    )

  assert.ok(
    payloadOk,
    'message_intelligence_active_pilot_event_payload_check',
  )
}

function fakeV2Run(
  status,
  {
    would_surface_message = status ===
      'generated',
  } = {},
) {
  return {
    status,
    safety: {
      automatic_send: false,
      automatic_crm_write: false,
      automatic_agenda_write: false,
      would_surface_message,
    },
  }
}

test(
  'telemetria V1 satisfaz literalmente as constraints da migration em todos os event_types',
  () => {
    assertSatisfiesActivePilotEventsMigrationConstraints(
      buildMessageIntelligenceActivePilotTelemetryV1({
        event_type: 'active_selected',
        company_id: COMPANY_ID,
        seller_user_id: USER_ID,
        cycle_id: CYCLE_ID,
        duration_ms: 10,
        run: fakeRun(),
      }),
    )

    // O chamador real (message-intelligence-seller-activation.ts) só usa
    // active_fallback_no_message com o run completo (nunca null) — o
    // final_status vem de shadow_evaluation, não pode ficar null aqui.
    assertSatisfiesActivePilotEventsMigrationConstraints(
      buildMessageIntelligenceActivePilotTelemetryV1({
        event_type:
          'active_fallback_no_message',
        company_id: COMPANY_ID,
        seller_user_id: USER_ID,
        cycle_id: CYCLE_ID,
        duration_ms: 10,
        run: {
          hard_gate_result: {
            status: 'all_failed',
          },
          shadow_evaluation: {
            final_status:
              'no_eligible_candidates',
            would_surface_message: false,
            selected_overall_score: null,
            selected_critic_status: null,
            automatic_send: false,
            automatic_crm_write: false,
            automatic_agenda_write: false,
          },
        },
      }),
    )

    assertSatisfiesActivePilotEventsMigrationConstraints(
      buildMessageIntelligenceActivePilotTelemetryV1({
        event_type:
          'active_execution_failed',
        company_id: COMPANY_ID,
        seller_user_id: USER_ID,
        cycle_id: CYCLE_ID,
        duration_ms: 10,
        run: null,
      }),
    )
  },
)

test(
  'telemetria V2 satisfaz literalmente as constraints da migration para todo status possível do runner',
  () => {
    // active_selected — único caminho real usado pelo chamador para o
    // status 'generated' seguro.
    assertSatisfiesActivePilotEventsMigrationConstraints(
      buildMessageIntelligenceActivePilotTelemetryV2({
        event_type: 'active_selected',
        company_id: COMPANY_ID,
        seller_user_id: USER_ID,
        cycle_id: CYCLE_ID,
        duration_ms: 10,
        run: fakeV2Run('generated'),
      }),
    )

    // active_fallback_no_message — silêncio válido (no_message).
    assertSatisfiesActivePilotEventsMigrationConstraints(
      buildMessageIntelligenceActivePilotTelemetryV2({
        event_type:
          'active_fallback_no_message',
        company_id: COMPANY_ID,
        seller_user_id: USER_ID,
        cycle_id: CYCLE_ID,
        duration_ms: 10,
        run: fakeV2Run('no_message', {
          would_surface_message: false,
        }),
      }),
    )

    // active_execution_failed — cada uma das falhas técnicas do V2, com
    // um `run` completo (não uma exceção) chegando ao builder.
    for (const status of [
      'config_not_ready',
      'provider_error',
      'invalid_output',
    ]) {
      assertSatisfiesActivePilotEventsMigrationConstraints(
        buildMessageIntelligenceActivePilotTelemetryV2({
          event_type:
            'active_execution_failed',
          company_id: COMPANY_ID,
          seller_user_id: USER_ID,
          cycle_id: CYCLE_ID,
          duration_ms: 10,
          run: fakeV2Run(status, {
            would_surface_message: false,
          }),
        }),
      )
    }

    // active_execution_failed também precisa se sustentar quando run=null
    // (exceção não tratada antes de o runner concluir).
    assertSatisfiesActivePilotEventsMigrationConstraints(
      buildMessageIntelligenceActivePilotTelemetryV2({
        event_type:
          'active_execution_failed',
        company_id: COMPANY_ID,
        seller_user_id: USER_ID,
        cycle_id: CYCLE_ID,
        duration_ms: 10,
        run: null,
      }),
    )
  },
)

test(
  'erro do banco vira falha explícita de telemetria',
  async () => {
    const admin = {
      from() {
        return {
          insert() {
            return Promise.resolve({
              data: null,
              error: {
                message:
                  'fake failure',
              },
            })
          },
        }
      },
    }

    const telemetry =
      buildMessageIntelligenceActivePilotTelemetryV1({
        event_type:
          'active_execution_failed',

        company_id:
          COMPANY_ID,

        seller_user_id:
          USER_ID,

        cycle_id:
          CYCLE_ID,

        duration_ms:
          10,

        run:
          null,
      })

    await assert.rejects(
      () =>
        persistMessageIntelligenceActivePilotTelemetryV1({
          admin,
          telemetry,
        }),

      (
        error,
      ) =>
        error instanceof
        MessageIntelligenceActivePilotTelemetryPersistenceError,
    )
  },
)
