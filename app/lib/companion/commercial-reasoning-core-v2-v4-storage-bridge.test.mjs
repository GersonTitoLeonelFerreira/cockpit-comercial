import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoningCoreV2LegacyV4NormalizedOutput,
  createCommercialReasoningCoreV2LegacyV4BridgeRpcClient,
} from './commercial-reasoning-core-v2-v4-storage-bridge.ts'

function auditEvent() {
  return {
    event_type:
      'stateful_copilot_analysis_completed',

    engine_source:
      'commercial_reasoning_core_v2',

    generated_at:
      '2026-09-14T03:30:00.000Z',

    company_id:
      '10000000-0000-4000-8000-000000000001',

    cycle_id:
      '30000000-0000-4000-8000-000000000001',

    conversation_key:
      'conversation-test',

    previous_state_version:
      4,

    candidate_state_version:
      5,

    analyzed_message_ids: [
      'm1',
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

      runtime_version:
        'commercial-reasoning-core-v2-runtime-v1',

      core_output: {
        contract_version:
          'commercial-reasoning-core-v2',
        commercial_role:
          'buyer',
        commercial_relevance:
          'commercial',
      },

      factual_guard: {
        issues: [],
      },

      seller_projection: {
        adapter_version:
          'commercial-reasoning-core-v2-seller-adapter-v1',
        engine_source:
          'commercial_reasoning_core_v2',
        seller_actionable:
          true,
        commercial_role:
          'buyer',
        commercial_relevance:
          'commercial',
        summary:
          'Cliente quer confirmar o próximo passo.',
        decision:
          'set_commitment',
        recommended_next_approach:
          'Confirmar o próximo passo objetivo.',
        reason:
          'A intenção já está explícita.',
        intervention_needed:
          true,
        recommended_question:
          'Posso confirmar agora?',
        suggested_message:
          'Posso confirmar isso agora para você?',
        evidence_message_ids: [
          'm2',
        ],
      },

      commercial_reading: {
        contract_version:
          'commercial-reading-v1',
      },

      commercial_reading_report: {
        adapter_version:
          'test',
      },
    },

    execution: {
      model_calls:
        1,
    },

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}

test(
  'bridge projeta Core V2 no envelope V4 aceito pelo banco atual',
  () => {
    const output =
      buildCommercialReasoningCoreV2LegacyV4NormalizedOutput(
        auditEvent(),
      )

    assert.equal(
      output.contract_version,
      'phase-5.2-stateful-copilot-v4',
    )

    assert.equal(
      output.commercial_role,
      'buyer',
    )

    assert.equal(
      output.commercial_relevance,
      'commercial',
    )

    assert.equal(
      output.interpretation.current_moment.summary,
      'Cliente quer confirmar o próximo passo.',
    )

    assert.equal(
      output.strategy.next_move,
      'Confirmar o próximo passo objetivo.',
    )

    assert.equal(
      output.communication.contract_version,
      'phase-5.2-communication-v5',
    )

    assert.equal(
      output.communication.commercial_reading.contract_version,
      'commercial-reading-v1',
    )

    assert.equal(
      output.operational_suggestions.crm.should_change_crm_stage,
      false,
    )

    assert.equal(
      output.operational_suggestions.agenda.should_change_agenda,
      false,
    )

    assert.equal(
      output.core_v2_payload.contract_version,
      'commercial-reasoning-core-v2',
    )
  },
)

test(
  'bridge RPC altera somente o envelope persistido e preserva o payload Core V2 dentro dele',
  async () => {
    const calls = []

    const rawClient = {
      rpc(
        functionName,
        parameters,
      ) {
        calls.push({
          functionName,
          parameters,
        })

        return Promise.resolve({
          data: {
            status:
              'persisted',
          },
          error:
            null,
        })
      },
    }

    const client =
      createCommercialReasoningCoreV2LegacyV4BridgeRpcClient(
        rawClient,
      )

    const originalAudit =
      auditEvent()

    await client.rpc(
      'rpc_persist_stateful_copilot_state',
      {
        p_operation_key:
          'operation-1',
        p_audit_event:
          originalAudit,
        p_state_snapshot: {
          contract_version:
            'stateful-commercial-state-v1',
        },
      },
    )

    assert.equal(
      calls.length,
      1,
    )

    assert.equal(
      calls[0].parameters.p_audit_event.normalized_output.contract_version,
      'phase-5.2-stateful-copilot-v4',
    )

    assert.equal(
      calls[0].parameters.p_audit_event.normalized_output.core_v2_payload.contract_version,
      'commercial-reasoning-core-v2',
    )

    assert.equal(
      originalAudit.normalized_output.contract_version,
      'commercial-reasoning-core-v2',
    )
  },
)

test(
  'bridge falha fechado quando recebe output que não é Core V2',
  () => {
    const invalid =
      auditEvent()

    invalid.normalized_output.contract_version =
      'outro-contrato'

    assert.throws(
      () =>
        buildCommercialReasoningCoreV2LegacyV4NormalizedOutput(
          invalid,
        ),
      error => {
        assert.equal(
          error.code,
          'CORE_V2_V4_STORAGE_BRIDGE_INVALID_INPUT',
        )

        return true
      },
    )
  },
)
