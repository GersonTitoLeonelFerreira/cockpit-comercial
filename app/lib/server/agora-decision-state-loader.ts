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
  loadCanonicalDecisionStateWithResponsibility,
} from './canonical-commercial-responsibility'

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
// FASE 16.9 — quem está aguardando quem é responsabilidade operacional
// determinística e reconcilia Decision State antes da projeção seller-facing.
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
      loadCanonicalDecisionStateWithResponsibility({
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
        fact_registry:
          canonicalContext.fact_registry ?? null,
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
      fact_registry:
        canonicalContext.fact_registry ?? null,
    })

  // Decision State continua definindo prioridade, urgência e provenance.
  // Quando o Commercial Reasoning está disponível, porém, ele passa a ser
  // a autoridade sobre o CONTEÚDO da ação seller-facing. Isso impede que
  // uma recomendação legada contradiga técnica, sequência ou método já
  // avaliados pelo novo motor comercial.
  const expertAction =
    reasoning.status === 'ready' ||
    reasoning.status === 'limited'
      ? reasoning.next_best_action
      : null

  const primary =
    viewModel.primary &&
    reasoning.status !== 'silent'
      ? {
          ...viewModel.primary,
          headline:
            reasoning.what_is_happening ||
            viewModel.primary.headline,
          action:
            expertAction ||
            viewModel.primary.action,
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
