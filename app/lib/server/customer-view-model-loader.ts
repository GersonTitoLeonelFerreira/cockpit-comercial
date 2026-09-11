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
  buildCustomerViewModel,
  type CustomerViewModel,
} from './customer-view-model'

// ---------------------------------------------------------------------------
// FASE 16-R1 — CLIENTE consome a mesma fotografia comercial canônica de
// AGORA e ANÁLISE. Continua deliberadamente sem Cycle Memory/Method/
// Decision State no presenter, mas deixa de reconstruir ledger/state/
// Commercial Reading em paralelo.
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
      throw new CustomerViewModelReadError({
        code: 'CUSTOMER_STATE_READ_FAILED',
        message:
          'Não foi possível carregar o estado comercial persistido.',
        status_code: 500,
        retryable: error.retryable,
      })
    }

    throw error
  }

  return buildCustomerViewModel(
    canonicalContext.current_reading,
  )
}

export {
  CompanionClientContextError,
}
