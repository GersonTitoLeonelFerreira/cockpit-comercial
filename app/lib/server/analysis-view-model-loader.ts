import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  CompanionClientContextError,
} from './companion-client-context-loader'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  CanonicalSellerStateReadError,
  loadCanonicalSellerCommercialContext,
} from './canonical-seller-commercial-context-loader'

import {
  loadCanonicalIntegratedCommercialContext,
} from './canonical-integrated-commercial-context-source'

import {
  buildAnalysisViewModel,
  type AnalysisViewModel,
} from './analysis-view-model'

// ---------------------------------------------------------------------------
// FASE 16-R1 — ANÁLISE consome a mesma fotografia comercial canônica de
// AGORA e CLIENTE. O loader deixa de reconstruir ledger/state/Commercial
// Reading em paralelo; viewport/DOM não é fonte de verdade do presenter.
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
  let canonicalContext:
    Awaited<
      ReturnType<
        typeof loadCanonicalSellerCommercialContext
      >
    >

  try {
    canonicalContext =
      await loadCanonicalSellerCommercialContext({
        admin,
        token,
        cycle_id,
        conversation_key,
        reference_time,
      })
  } catch (error) {
    if (
      error instanceof
        CanonicalSellerStateReadError
    ) {
      throw new AnalysisViewModelReadError({
        code: 'ANALYSIS_STATE_READ_FAILED',
        message:
          'Não foi possível carregar o estado comercial persistido.',
        status_code: 500,
        retryable: error.retryable,
      })
    }

    throw error
  }

  const integratedContext =
    await loadCanonicalIntegratedCommercialContext({
      admin,
      company_id:
        canonicalContext.company_id,
      cycle_id:
        canonicalContext.cycle_id,
      conversation_key:
        canonicalContext.conversation_key,
      reference_time:
        canonicalContext.reference_time,
      current_reading:
        canonicalContext.current_reading,
      client_context:
        canonicalContext.client_context,
    })

  return buildAnalysisViewModel(integratedContext)
}

export {
  CompanionClientContextError,
}
