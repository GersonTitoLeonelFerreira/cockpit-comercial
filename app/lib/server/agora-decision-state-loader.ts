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
  loadCanonicalDecisionState,
} from './canonical-decision-state-source'

import {
  buildAgoraViewModel,
  type AgoraViewModel,
} from './agora-view-model'

import {
  buildSellerFacingReasoningProjection,
  type SellerFacingReasoningProjection,
} from './seller-facing-reasoning-projection'

export type AgoraReasoningViewModel =
  AgoraViewModel & {
    reasoning:
      SellerFacingReasoningProjection
  }

// ---------------------------------------------------------------------------
// FASE 16-R6 — AGORA continua usando Decision State para prioridade e
// intervenção, mas a leitura seller-facing passa a receber também o
// Commercial Reasoning da R4. A prioridade não é recalculada no presenter;
// reasoning só explica o contexto, técnica e limites por trás da decisão.
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
}): Promise<AgoraReasoningViewModel> {
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

  const [
    decisionState,
    commercialReasoning,
  ] =
    await Promise.all([
      loadCanonicalDecisionState({
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
      }),
      loadCanonicalSellerReasoning({
        admin,
        context:
          canonicalContext,
      }),
    ])

  const viewModel =
    buildAgoraViewModel(decisionState)

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
      fallback_action:
        viewModel.primary?.action ?? null,
    })

  // A headline existente já era segura, porém podia ficar descritiva.
  // Quando o reasoning possui uma situação comercial atual explícita,
  // AGORA usa essa situação como enquadramento sem mexer na ação concreta
  // que Decision State já priorizou.
  const primary =
    viewModel.primary &&
    reasoning.status !== 'silent' &&
    reasoning.what_is_happening
      ? {
          ...viewModel.primary,
          headline:
            reasoning.what_is_happening,
        }
      : viewModel.primary

  return {
    ...viewModel,
    primary,
    reasoning,
  }
}

export {
  CompanionClientContextError,
}
