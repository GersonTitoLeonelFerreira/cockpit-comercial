import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MessageIntelligenceActivePilotTelemetryPersistenceError,
  buildMessageIntelligenceActivePilotTelemetryV1,
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
