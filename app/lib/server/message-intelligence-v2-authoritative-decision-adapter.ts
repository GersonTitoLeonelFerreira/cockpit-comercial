import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  loadCanonicalLedgerAtReferenceTime,
  selectStatefulDiagnosticMessages,
  type StatefulCopilotRealContextSupabaseClient,
} from '@/app/lib/companion/stateful-copilot-real-context-loader'

import {
  createStatefulCopilotSupabaseReader,
  type StatefulCopilotStateReadResult,
  type StatefulCopilotSupabaseReadClient,
} from '@/app/lib/companion/stateful-copilot-supabase-reader'

import {
  buildUnavailableAuthoritativeDecision,
  mapDecisionKindToAllowedObjectives,
  type MessageIntelligenceV2AuthoritativeDecision,
} from '@/app/lib/companion/message-intelligence/v2/authoritative-decision'

import type {
  MessageIntelligenceV2AuthoritativeDecisionLoader,
} from '@/app/lib/companion/message-intelligence/v2/runner'

import {
  loadCanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

import {
  loadCanonicalDecisionState,
} from './canonical-decision-state-source'

import {
  loadCanonicalCommunicationContext,
} from './canonical-communication-context-source'

// ---------------------------------------------------------------------------
// FASE 16.9 — adapta a mesma cadeia canônica que decide AGORA/ANÁLISE
// (Commercial Reading -> Decision State -> Communication Context, FASE
// 16.3F) para o formato server-agnostic que o Message Intelligence Engine
// V2 consome (MessageIntelligenceV2AuthoritativeDecision, definido em
// app/lib/companion/ — que nunca importa de app/lib/server/). Este é o
// único arquivo que conhece os dois lados.
//
// Deliberadamente NÃO reaproveita `sources.commercial_reading` do source
// loader do MIE (MessageIntelligenceCommercialReadingSourceV1): esse tipo
// já descarta state_record_id/state_version/state_updated_at exigidos por
// loadCanonicalDecisionState, então reconstruir a leitura canônica aqui é
// mais seguro do que forçar um tipo incompatível. Isso paga uma leitura
// adicional de estado/ledger por execução do V2 — aceito nesta fase em
// troca de correção; ver checkpoint da FASE 16.9 para o registro desse
// custo como otimização pendente, não bloqueante.
//
// client_context é omitido de propósito (null): loadCanonicalDecisionState
// já trata isso como "sem sinal operacional de SLA/espera disponível" (só
// suprime os candidatos client_sla/customer_waiting, nunca falha) — esta
// função roda fora do caminho HTTP autenticado por token que produziria um
// client_context real, e SLA/espera não são necessários para o gate que o
// V2 precisa (best_approach/method/coaching já bastam).
// ---------------------------------------------------------------------------

function collectStateMemoryIds(
  state: StatefulCopilotStateReadResult,
): string[] {
  if (state.mode !== 'found') {
    return []
  }

  return [
    ...state.state.facts,
    ...state.state.needs,
    ...state.state.open_loops,
    ...state.state.objections,
    ...state.state.commitments,
    ...state.state.signals,
    ...state.state.uncertainties,
  ].map(item => item.id)
}

export function createMessageIntelligenceV2AuthoritativeDecisionLoader({
  admin,
}: {
  admin: SupabaseClient
}): MessageIntelligenceV2AuthoritativeDecisionLoader {
  return async ({
    company_id,
    cycle_id,
    conversation_key,
    reference_time,
  }) => {
    try {
      const {
        knownMessageIds,
        canonicalMessages,
      } =
        await loadCanonicalLedgerAtReferenceTime({
          client:
            admin as unknown as
              StatefulCopilotRealContextSupabaseClient,
          companyId: company_id,
          cycleId: cycle_id,
          conversationKey: conversation_key,
          referenceTime: reference_time,
        })

      const activeMessageIds =
        selectStatefulDiagnosticMessages(
          canonicalMessages,
        ).map(message => message.id)

      const reader =
        createStatefulCopilotSupabaseReader({
          client:
            admin as unknown as
              StatefulCopilotSupabaseReadClient,
        })

      const stateRead =
        await reader({
          company_id,
          cycle_id,
          conversation_key,
          known_message_ids: knownMessageIds,
          active_message_ids: activeMessageIds,
        })

      const currentReading =
        stateRead.mode === 'found'
          ? await loadCanonicalCommercialReadingSource({
              admin,
              company_id,
              cycle_id,
              conversation_key,
              reference_time,
              state_read: stateRead,
              validation_context: {
                available_message_ids:
                  knownMessageIds,
                available_memory_ids:
                  collectStateMemoryIds(
                    stateRead,
                  ),
                seller_message_ids:
                  canonicalMessages
                    .filter(
                      message =>
                        message.direction ===
                        'outgoing',
                    )
                    .map(message => message.id),
                current_crm_status: null,
                reference_time,
              },
            })
          : null

      const decisionState =
        await loadCanonicalDecisionState({
          admin,
          company_id,
          cycle_id,
          conversation_key,
          reference_time,
          current_reading: currentReading,
          client_context: null,
        })

      if (!decisionState) {
        return buildUnavailableAuthoritativeDecision()
      }

      const communicationContext =
        await loadCanonicalCommunicationContext({
          admin,
          company_id,
          cycle_id,
          conversation_key,
          reference_time,
          decision_state: decisionState,
          current_reading: currentReading,
        })

      if (
        !communicationContext ||
        !communicationContext.executable
      ) {
        return buildUnavailableAuthoritativeDecision()
      }

      const decisionKind =
        communicationContext.decision_kind

      const dominantIntent =
        communicationContext.dominant_intent

      const result: MessageIntelligenceV2AuthoritativeDecision =
        {
          available: true,

          decision_kind: decisionKind,

          recommended_action:
            dominantIntent?.recommended_action ??
            null,

          reason:
            dominantIntent?.reason ?? null,

          communication_goal:
            communicationContext.communication_goal,

          method_note:
            communicationContext.method_context
              .approach_constraint,

          do_not_generate:
            communicationContext.do_not_generate ||
            dominantIntent?.silent === true,

          allowed_objectives: decisionKind
            ? mapDecisionKindToAllowedObjectives(
                decisionKind,
              )
            : [],

          prohibited_moves:
            communicationContext.prohibited_moves,

          evidence_message_ids:
            communicationContext.evidence
              .evidence_message_ids,

          memory_ids:
            communicationContext.evidence
              .memory_ids,
        }

      return result
    } catch {
      // Best-effort por natureza (mandato §16.9): uma falha aqui nunca
      // derruba a geração da mensagem — o V2 apenas degrada para "sem
      // decisão autoritativa disponível", exatamente como antes desta
      // fase existir.
      return buildUnavailableAuthoritativeDecision()
    }
  }
}
