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
  loadCanonicalIntegratedCommercialContext,
} from './canonical-integrated-commercial-context-source'

import {
  buildAnalysisViewModel,
  type AnalysisViewModel,
} from './analysis-view-model'

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
// FASE 16.6 — loader read-only que alimenta o ANÁLISE seller-facing view
// model a partir do Integrated Commercial Context canônico (FASE 16.4).
//
// Mesmo desenho de `agora-decision-state-loader.ts` (FASE 16.5): monta o
// `state_read`/`validation_context` que `loadCanonicalCommercialReadingSource`
// (16.3B) exige, reaproveitando exclusivamente leitores canônicos já
// existentes e testados — nenhuma fonte de verdade nova, nenhuma
// reclassificação de estado/risco/objeção/compromisso.
//
// Não aciona nada do Message Intelligence Engine nem gera mensagem
// sugerida (mandato §26) — read-only, mesma disciplina de AGORA.
// ---------------------------------------------------------------------------

export class AnalysisViewModelReadError
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

    this.name = 'AnalysisViewModelReadError'
    this.code = code
    this.status_code = status_code
    this.retryable = retryable
  }
}

// Mesma composição usada em message-intelligence-source-loader.ts e
// agora-decision-state-loader.ts (collectStateMemoryIds).
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

export async function loadAnalysisViewModel({
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
}): Promise<AnalysisViewModel> {
  // `loadCompanionClientContext` normaliza company_id/cycle_id/
  // conversation_key/reference_time E valida membership/permissão do
  // vendedor sobre o ciclo — fail closed antes de qualquer leitura
  // comercial ser tentada. Reaproveitamos os valores normalizados
  // (identity.*), nunca renormalizamos por conta própria.
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
    throw new AnalysisViewModelReadError({
      code: 'ANALYSIS_STATE_READ_FAILED',
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

  const integratedContext =
    await loadCanonicalIntegratedCommercialContext({
      admin,
      company_id: companyId,
      cycle_id: cycleId,
      conversation_key: conversationKey,
      reference_time: referenceTime,
      current_reading: currentReading,
      client_context: clientContext,
    })

  return buildAnalysisViewModel(integratedContext)
}

export {
  CompanionClientContextError,
}
