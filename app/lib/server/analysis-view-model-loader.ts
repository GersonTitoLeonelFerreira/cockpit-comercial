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
  loadCanonicalSellerReasoningBundle,
} from './canonical-seller-reasoning-source'

import {
  buildCommercialCoachingDiagnosis,
  type CommercialCoachingDiagnosis,
} from '@/app/lib/companion/commercial-coaching-engine'

import {
  loadCanonicalIntegratedCommercialContext,
} from './canonical-integrated-commercial-context-source'

import {
  applySellerExecutionCoachingToNeutralView,
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
    coaching_diagnosis:
      CommercialCoachingDiagnosis | null
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

const WAITING_ON_CUSTOMER_COACHING_KINDS =
  new Set([
    'unanswered_question',
    'insufficient_discovery',
  ])

function reconcileCoachingWithResponsibility({
  viewModel,
  waitingState,
}: {
  viewModel: AnalysisViewModel
  waitingState: string | null
}): AnalysisViewModel {
  if (
    waitingState !==
      'seller_waiting_for_customer' ||
    viewModel.improvements.length === 0
  ) {
    return viewModel
  }

  return {
    ...viewModel,
    improvements:
      viewModel.improvements.filter(
        improvement =>
          !WAITING_ON_CUSTOMER_COACHING_KINDS
            .has(improvement.kind),
      ),
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
    reasoningBundle,
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
      loadCanonicalSellerReasoningBundle({
        admin,
        context:
          canonicalContext,
      }),
    ])

  const baseViewModel =
    buildAnalysisViewModel(
      integratedContext,
    )

  const viewModel =
    reconcileCoachingWithResponsibility({
      viewModel:
        baseViewModel,
      waitingState:
        canonicalContext.client_context
          .waiting.state,
    })

  const commercialReasoning =
    reasoningBundle.reasoning

  const coachingDiagnosis =
    commercialReasoning &&
    reasoningBundle.diagnostic_input &&
    canonicalContext.current_reading
      ? buildCommercialCoachingDiagnosis({
          reading:
            canonicalContext
              .current_reading
              .reading,
          reasoning:
            commercialReasoning,
          diagnostic_input:
            reasoningBundle
              .diagnostic_input,
          evaluated_at:
            canonicalContext
              .reference_time,
          cycle_state:
            canonicalContext.state_read
              .mode === 'found'
              ? canonicalContext
                  .state_read.state
              : null,
        })
      : null

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
    ...applySellerExecutionCoachingToNeutralView(
      viewModel,
      coachingDiagnosis,
    ),
    opportunity,
    reasoning,
    coaching_diagnosis:
      coachingDiagnosis,
  }
}

export {
  CompanionClientContextError,
}
