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
  buildCustomerViewModel,
  type CustomerViewModel,
} from './customer-view-model'

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

// ---------------------------------------------------------------------------
// FASE 16.7 — loader read-only que alimenta o CLIENTE seller-facing view
// model a partir da Commercial Reading canônica atual (FASE 16.3B).
//
// Mesmo desenho de `agora-decision-state-loader.ts` (FASE 16.5) e
// `analysis-view-model-loader.ts` (FASE 16.6): monta o `state_read` que
// `loadCanonicalCommercialReadingSource` exige, reaproveitando
// exclusivamente leitores canônicos já existentes e testados. Mais
// enxuto que os dois anteriores por design — CLIENTE não precisa de
// Cycle Memory, Method/Coaching nem Decision State (mandato §3/§18/§25:
// esses são território de AGORA/ANÁLISE, nunca de CLIENTE), então este
// loader não os carrega.
//
// Não aciona nada do Message Intelligence Engine nem gera mensagem
// sugerida (mandato §40) — read-only, mesma disciplina de AGORA/ANÁLISE.
// ---------------------------------------------------------------------------

export class CustomerViewModelReadError
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

    this.name = 'CustomerViewModelReadError'
    this.code = code
    this.status_code = status_code
    this.retryable = retryable
  }
}

export async function loadCustomerViewModel({
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
}): Promise<CustomerViewModel> {
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
    throw new CustomerViewModelReadError({
      code: 'CUSTOMER_STATE_READ_FAILED',
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
            [
              ...stateRead.state.facts,
              ...stateRead.state.needs,
              ...stateRead.state.open_loops,
              ...stateRead.state.objections,
              ...stateRead.state.commitments,
              ...stateRead.state.signals,
              ...stateRead.state.uncertainties,
            ].map((item) => item.id),

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

  return buildCustomerViewModel(currentReading)
}

export {
  CompanionClientContextError,
}
