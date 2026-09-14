import {
  COMMERCIAL_READING_CONTRACT_VERSION,
} from './commercial-reading-contract'

import {
  COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,
} from './commercial-reasoning-core-v2-contract'

import {
  CommercialReasoningCoreV2PersistenceExecutionError,
  type CommercialReasoningCoreV2PersistenceWriter,
} from './commercial-reasoning-core-v2-persistence-executor'

import {
  createCommercialReasoningCoreV2SupabaseWriter,
  type CommercialReasoningCoreV2SupabaseRpcClient,
} from './commercial-reasoning-core-v2-supabase-writer'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract'

type JsonRecord =
  Record<string, unknown>

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function cloneValue<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T
}

function fail(
  message: string,
): never {
  throw new CommercialReasoningCoreV2PersistenceExecutionError({
    code:
      'CORE_V2_V4_STORAGE_BRIDGE_INVALID_INPUT',
    message,
    status_code:
      500,
    retryable:
      false,
  })
}

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (!isRecord(value)) {
    fail(`${path} precisa ser um objeto.`)
  }

  return value
}

function requireText(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    fail(`${path} precisa ser texto não vazio.`)
  }

  return value.trim()
}

function nullableText(
  value: unknown,
  path: string,
): string | null {
  if (value === null) {
    return null
  }

  if (
    typeof value !== 'string'
  ) {
    fail(`${path} precisa ser texto ou null.`)
  }

  const normalized =
    value.trim()

  return normalized || null
}

function requireStringArray(
  value: unknown,
  path: string,
): string[] {
  if (!Array.isArray(value)) {
    fail(`${path} precisa ser uma lista.`)
  }

  const normalized =
    value.map((item, index) =>
      requireText(
        item,
        `${path}[${index}]`,
      ),
    )

  return [
    ...new Set(normalized),
  ]
}

function emptyStatePatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],
    needs_to_add: [],
    need_ids_to_resolve: [],
    need_ids_to_supersede: [],
    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],
    open_loop_ids_to_supersede: [],
    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],
    commitments_to_upsert: [],
    signals_to_add: [],
    signal_ids_to_resolve: [],
    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
    uncertainty_ids_to_supersede: [],
  }
}

export function buildCommercialReasoningCoreV2LegacyV4NormalizedOutput(
  auditEventValue: unknown,
): JsonRecord {
  const auditEvent =
    requireRecord(
      auditEventValue,
      'p_audit_event',
    )

  const corePersistedOutput =
    requireRecord(
      auditEvent.normalized_output,
      'p_audit_event.normalized_output',
    )

  if (
    corePersistedOutput.contract_version !==
    COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION
  ) {
    fail(
      'p_audit_event.normalized_output não pertence ao Commercial Reasoning Core V2.',
    )
  }

  const coreOutput =
    requireRecord(
      corePersistedOutput.core_output,
      'p_audit_event.normalized_output.core_output',
    )

  const sellerProjection =
    requireRecord(
      corePersistedOutput.seller_projection,
      'p_audit_event.normalized_output.seller_projection',
    )

  const commercialReading =
    requireRecord(
      corePersistedOutput.commercial_reading,
      'p_audit_event.normalized_output.commercial_reading',
    )

  if (
    coreOutput.contract_version !==
      COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION ||
    commercialReading.contract_version !==
      COMMERCIAL_READING_CONTRACT_VERSION ||
    sellerProjection.engine_source !==
      'commercial_reasoning_core_v2'
  ) {
    fail(
      'O payload Core V2 não possui contratos coerentes para a bridge V4.',
    )
  }

  const commercialRole =
    requireText(
      sellerProjection.commercial_role,
      'seller_projection.commercial_role',
    )

  const commercialRelevance =
    requireText(
      sellerProjection.commercial_relevance,
      'seller_projection.commercial_relevance',
    )

  if (
    coreOutput.commercial_role !== commercialRole ||
    coreOutput.commercial_relevance !== commercialRelevance
  ) {
    fail(
      'Core output e seller projection divergem em papel ou relevância comercial.',
    )
  }

  const summary =
    requireText(
      sellerProjection.summary,
      'seller_projection.summary',
    )

  const nextMove =
    requireText(
      sellerProjection.recommended_next_approach,
      'seller_projection.recommended_next_approach',
    )

  const rationale =
    requireText(
      sellerProjection.reason,
      'seller_projection.reason',
    )

  const recommendedQuestion =
    nullableText(
      sellerProjection.recommended_question,
      'seller_projection.recommended_question',
    )

  const suggestedMessage =
    nullableText(
      sellerProjection.suggested_message,
      'seller_projection.suggested_message',
    )

  const analyzedMessageIds =
    requireStringArray(
      auditEvent.analyzed_message_ids,
      'p_audit_event.analyzed_message_ids',
    )

  const evidenceMessageIds =
    requireStringArray(
      auditEvent.evidence_message_ids,
      'p_audit_event.evidence_message_ids',
    )

  const memoryIds =
    requireStringArray(
      auditEvent.memory_ids,
      'p_audit_event.memory_ids',
    )

  const previousStateVersion =
    auditEvent.previous_state_version === null
      ? null
      : Number(
          auditEvent.previous_state_version,
        )

  if (
    previousStateVersion !== null &&
    (
      !Number.isSafeInteger(previousStateVersion) ||
      previousStateVersion <= 0
    )
  ) {
    fail(
      'p_audit_event.previous_state_version precisa ser null ou inteiro positivo.',
    )
  }

  const interventionNeeded =
    sellerProjection.intervention_needed === true

  const methodApplication =
    'Derivado do Commercial Reasoning Core V2.'

  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      previousStateVersion,

    analyzed_message_ids:
      analyzedMessageIds,

    commercial_role:
      commercialRole,

    commercial_relevance:
      commercialRelevance,

    interpretation: {
      what_changed:
        null,

      what_remains_valid:
        [],

      current_moment: {
        summary,
        evidence_message_ids:
          evidenceMessageIds,
        memory_ids:
          memoryIds,
      },

      customer_need:
        null,

      uncertainties:
        [],
    },

    state_patch:
      emptyStatePatch(),

    strategy: {
      method_application:
        methodApplication,
      rationale,
      next_move:
        nextMove,
      recommended_question:
        recommendedQuestion,
      suggested_message:
        suggestedMessage,
      evidence_message_ids:
        evidenceMessageIds,
      memory_ids:
        memoryIds,
    },

    operational_suggestions: {
      crm: {
        should_change_crm_stage:
          false,
        recommended_status:
          null,
        rationale:
          null,
        requires_human_confirmation:
          true,
      },

      agenda: {
        should_change_agenda:
          false,
        expected_next_action_at:
          null,
        rationale:
          null,
        requires_human_confirmation:
          true,
      },
    },

    evidence_message_ids:
      evidenceMessageIds,

    memory_ids:
      memoryIds,

    communication: {
      contract_version:
        STATEFUL_COMMUNICATION_CONTRACT_VERSION,
      intervention_needed:
        interventionNeeded,
      method_application:
        methodApplication,
      guidance:
        nextMove,
      recommended_question:
        recommendedQuestion,
      suggested_message:
        suggestedMessage,
      commercial_reading:
        cloneValue(
          commercialReading,
        ),
    },

    core_v2_payload:
      cloneValue(
        corePersistedOutput,
      ),
  }
}

export function createCommercialReasoningCoreV2LegacyV4BridgeRpcClient(
  client:
    CommercialReasoningCoreV2SupabaseRpcClient,
): CommercialReasoningCoreV2SupabaseRpcClient {
  return {
    rpc(
      functionName,
      parameters,
    ) {
      const auditEvent =
        requireRecord(
          parameters.p_audit_event,
          'p_audit_event',
        )

      const bridgedAuditEvent = {
        ...cloneValue(
          auditEvent,
        ),

        normalized_output:
          buildCommercialReasoningCoreV2LegacyV4NormalizedOutput(
            auditEvent,
          ),
      }

      return client.rpc(
        functionName,
        {
          ...cloneValue(
            parameters,
          ),

          p_audit_event:
            bridgedAuditEvent,
        },
      )
    },
  }
}

export function createCommercialReasoningCoreV2LegacyV4BridgeWriter({
  client,
}: {
  client:
    CommercialReasoningCoreV2SupabaseRpcClient
}): CommercialReasoningCoreV2PersistenceWriter {
  return createCommercialReasoningCoreV2SupabaseWriter({
    client:
      createCommercialReasoningCoreV2LegacyV4BridgeRpcClient(
        client,
      ),
  })
}
