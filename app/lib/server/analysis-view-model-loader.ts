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
  loadCanonicalIntegratedCommercialContext,
} from './canonical-integrated-commercial-context-source'

import {
  buildAnalysisViewModel,
  type AnalysisViewModel,
} from './analysis-view-model'

import {
  buildSellerFacingReasoningProjection,
  type SellerFacingReasoningProjection,
} from './seller-facing-reasoning-projection'

export type AnalysisReasoningViewModel =
  AnalysisViewModel & {
    reasoning:
      SellerFacingReasoningProjection
  }

// ---------------------------------------------------------------------------
// FASE 16-R6 — ANÁLISE continua sendo a visão completa da venda e da
// condução. O Commercial Reasoning passa a explicar técnica, limites e
// conhecimento de empresa sobre a mesma fotografia canônica; nunca cria uma
// leitura paralela da oportunidade.
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
}): Promise<AnalysisReasoningViewModel> {
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

  const [
    integratedContext,
    commercialReasoning,
  ] =
    await Promise.all([
      loadCanonicalIntegratedCommercialContext({
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
    buildAnalysisViewModel(
      integratedContext,
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

  // O cabeçalho da oportunidade passa a usar a situação atual estruturada
  // pelo reasoning quando disponível. Riscos, objeções, compromissos e
  // coaching continuam vindo de suas fontes canônicas específicas.
  const opportunity =
    viewModel.opportunity &&
    reasoning.status !== 'silent' &&
    reasoning.what_is_happening
      ? {
          ...viewModel.opportunity,
          headline:
            reasoning.what_is_happening,
        }
      : viewModel.opportunity

  return {
    ...viewModel,
    opportunity,
    reasoning,
  }
}

export {
  CompanionClientContextError,
}
