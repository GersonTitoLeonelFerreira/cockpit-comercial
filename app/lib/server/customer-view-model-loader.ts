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
  loadCanonicalSellerReasoning,
} from './canonical-seller-reasoning-source'

import {
  buildCustomerViewModel,
  type CustomerViewModel,
} from './customer-view-model'

import {
  buildSellerFacingReasoningProjection,
  type SellerFacingReasoningProjection,
} from './seller-facing-reasoning-projection'

export type CustomerReasoningViewModel =
  CustomerViewModel & {
    roles:
      SellerFacingReasoningProjection[
        'customer_roles'
      ]
    reasoning:
      SellerFacingReasoningProjection
  }

// ---------------------------------------------------------------------------
// FASE 16-R6 — CLIENTE continua sem virar ANÁLISE/AGORA, mas passa a expor
// os papéis comerciais persistidos pela R2 (interlocutor, prospect, decisor,
// influenciador, usuário/beneficiário) e o reasoning compartilhado para que
// a UI não precise inferir papéis por texto.
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
}): Promise<CustomerReasoningViewModel> {
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

  const commercialReasoning =
    await loadCanonicalSellerReasoning({
      admin,
      context:
        canonicalContext,
    })

  const viewModel =
    buildCustomerViewModel(
      canonicalContext.current_reading,
    )

  const reasoning =
    buildSellerFacingReasoningProjection({
      reasoning:
        commercialReasoning,
      reading:
        canonicalContext.current_reading,
      state:
        canonicalContext.state_read.mode ===
          'found'
          ? canonicalContext.state_read.state
          : null,
    })

  return {
    ...viewModel,
    roles:
      reasoning.customer_roles,
    reasoning,
  }
}

export {
  CompanionClientContextError,
}
