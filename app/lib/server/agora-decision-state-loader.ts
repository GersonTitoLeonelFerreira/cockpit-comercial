import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  CompanionClientContextError,
  loadCompanionClientContext,
} from './companion-client-context-loader'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  loadCanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

import {
  loadCanonicalDecisionState,
} from './canonical-decision-state-source'

import {
  buildAgoraViewModel,
  type AgoraViewModel,
} from './agora-view-model'

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

import type {
  StatefulCommercialState,
} from '@/app/lib/companion/stateful-commercial-state'

// ---------------------------------------------------------------------------
// FASE 16.5 — loader read-only que alimenta o AGORA seller-facing view
// model a partir do Decision State canônico (FASE 16.3E).
//
// Este módulo NÃO introduz nenhuma fonte de verdade nova. Ele monta o
// `state_read`/`validation_context` que `loadCanonicalCommercialReadingSource`
// (16.3B) já exige, reaproveitando exclusivamente leitores canônicos já
// existentes e testados:
// - `loadCompanionClientContext` (mesmo usado por
//   app/api/companion/client-context) — também é quem já faz a
//   validação de membership/permissão do vendedor sobre o ciclo (fail
//   closed antes de qualquer leitura comercial);
// - `loadCanonicalLedgerAtReferenceTime`/`selectStatefulDiagnosticMessages`
//   (stateful-copilot-real-context-loader.ts) — o mesmo par que
//   `message-intelligence-source-loader.ts` usa para resolver
//   known_message_ids/active_message_ids;
// - `createStatefulCopilotSupabaseReader` (stateful-copilot-supabase-reader.ts)
//   — o mesmo leitor de `companion_commercial_states` usado pelo motor
//   stateful em produção.
//
// Não duplica Commercial Reading, Cycle Memory, Method/Coaching nem
// Decision State (mandato FASE 16.5 §31) — apenas monta o contexto que
// esses módulos já exigem e repassa. Não aciona nada do Message
// Intelligence Engine (candidate ranking, critic, message planner,
// auto-send) — MIE seller-facing continua pausado (mandato §30).
// ---------------------------------------------------------------------------

export class AgoraDecisionStateReadError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

  constructor({
    code,
    message,
    status_code,
    retryable,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
  }) {
    super(message)

    this.name = 'AgoraDecisionStateReadError'
    this.code = code
    this.status_code = status_code
    this.retryable = retryable
  }
}

// Mesma composição usada em message-intelligence-source-loader.ts
// (collectStateMemoryIds) — os sete campos de fato/memória do contrato
// canônico de estado comercial (stateful-commercial-state.ts).
function collectStateMemoryIds(
  state: StatefulCommercialState,
): string[] {
  return [
    ...state.facts,
    ...state.needs,
    ...state.open_loops,
    ...state.objections,
    ...state.commitments,
    ...state.signals,
    ...state.uncertainties,
  ].map((item) => item.id)
}

export async function loadAgoraViewModel({
  admin,
  token,
  cycle_id,
  conversation_key,
  reference_time,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  cycle_id: unknown
  conversation_key: unknown
  reference_time: unknown
}): Promise<AgoraViewModel> {
  // `loadCompanionClientContext` normaliza company_id/cycle_id/
  // conversation_key/reference_time E valida membership/permissão do
  // vendedor sobre o ciclo — fail closed antes de qualquer leitura
  // comercial ser tentada. Reaproveitamos os valores normalizados que
  // ele devolve (identity.*) em vez de renormalizar por conta própria,
  // para nunca divergir do que o restante da leitura considera "o
  // mesmo escopo/instante".
  const clientContext =
    await loadCompanionClientContext({
      admin,
      token,
      cycle_id,
      conversation_key,
      reference_time,
    })

  const companyId =
    clientContext.identity.company_id

  const cycleId =
    clientContext.identity.cycle_id

  const conversationKey =
    clientContext.identity.conversation_key

  const referenceTime =
    clientContext.generated_at

  const {
    knownMessageIds,
    canonicalMessages,
  } = await loadCanonicalLedgerAtReferenceTime({
    client:
      admin as unknown as
        StatefulCopilotRealContextSupabaseClient,
    companyId,
    cycleId,
    conversationKey,
    referenceTime,
  })

  const activeMessageIds =
    selectStatefulDiagnosticMessages(
      canonicalMessages,
    ).map((message) => message.id)

  const reader =
    createStatefulCopilotSupabaseReader({
      client:
        admin as unknown as
          StatefulCopilotSupabaseReadClient,
    })

  let stateRead: StatefulCopilotStateReadResult

  try {
    stateRead =
      await reader({
        company_id: companyId,
        cycle_id: cycleId,
        conversation_key: conversationKey,
        known_message_ids: knownMessageIds,
        active_message_ids: activeMessageIds,
      })
  } catch {
    throw new AgoraDecisionStateReadError({
      code: 'AGORA_STATE_READ_FAILED',
      message: 'Não foi possível carregar o estado comercial persistido.',
      status_code: 500,
      retryable: true,
    })
  }

  const currentReading =
    stateRead.mode === 'found'
      ? await loadCanonicalCommercialReadingSource({
        admin,
        company_id: companyId,
        cycle_id: cycleId,
        conversation_key: conversationKey,
        reference_time: referenceTime,
        state_read: stateRead,

        validation_context: {
          available_message_ids: knownMessageIds,

          available_memory_ids:
            collectStateMemoryIds(
              stateRead.state,
            ),

          seller_message_ids:
            canonicalMessages
              .filter(
                (message) =>
                  message.direction === 'outgoing',
              )
              .map((message) => message.id),

          current_crm_status:
            clientContext.identity.current_status,

          reference_time: referenceTime,
        },
      })
      : null

  const decisionState =
    await loadCanonicalDecisionState({
      admin,
      company_id: companyId,
      cycle_id: cycleId,
      conversation_key: conversationKey,
      reference_time: referenceTime,
      current_reading: currentReading,
      client_context: clientContext,
    })

  return buildAgoraViewModel(decisionState)
}

export {
  CompanionClientContextError,
}
