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
  loadCanonicalDecisionState,
} from './canonical-decision-state-source'

import {
  buildAgoraViewModel,
  type AgoraViewModel,
} from './agora-view-model'

// ---------------------------------------------------------------------------
// FASE 16-R1 — AGORA deixa de montar por conta própria ledger + state +
// Commercial Reading. A mesma fotografia comercial canônica é agora
// composta por canonical-seller-commercial-context-loader.ts e compartilhada
// com ANÁLISE e CLIENTE. O presenter recebe decisão pronta; DOM/viewport não
// participa da verdade comercial seller-facing.
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
      throw new AgoraDecisionStateReadError({
        code: 'AGORA_STATE_READ_FAILED',
        message:
          'Não foi possível carregar o estado comercial persistido.',
        status_code: 500,
        retryable: error.retryable,
      })
    }

    throw error
  }

  const decisionState =
    await loadCanonicalDecisionState({
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

  return buildAgoraViewModel(decisionState)
}

export {
  CompanionClientContextError,
}
