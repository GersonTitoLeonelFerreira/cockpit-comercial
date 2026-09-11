// ============================================================================
// Message Intelligence Engine V1 — Runner / Orchestrator
//
// FASE 16-R6: quando o runtime real possui Commercial Reading + estado
// persistido, o MIE passa a alinhar sua estratégia ao mesmo Commercial
// Reasoning que alimenta AGORA/ANÁLISE. Fixtures isolados continuam podendo
// rodar sem reasoning para preservar testes unitários do pipeline.
// ============================================================================

import {
  assembleMessageContextSnapshotV1,
} from './context-assembler'

import type {
  MessageIntelligenceContextSourceLoaderV1,
} from './contracts'

import {
  normalizeMessageIntelligenceRequestV1,
} from './contracts'

import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

import {
  evaluateCommercialStrategyV1,
} from './commercial-strategy'

import type {
  CommercialStrategyDecisionV1,
} from './strategy-contracts'

import {
  applyCommercialReasoningToMessageStrategy,
} from './reasoning-strategy-adapter'

import {
  buildCommercialReasoning,
} from '../commercial-reasoning-engine'

import type {
  CommercialReasoning,
} from '../commercial-reasoning-contract'

import {
  planMessageV1,
} from './message-planner'

import type {
  MessagePlanV1,
} from './message-plan'

import {
  generateMessageCandidatesV1,
} from './candidate-generator'

import type {
  CandidateGenerationResultV1,
} from './message-candidate'

import {
  runHardGatesV1,
} from './hard-gates'

import type {
  HardGateResultV1,
} from './hard-gate-contracts'

import {
  critiqueMessageCandidatesV1,
} from './commercial-naturalness-critic'

import type {
  CriticResultV1,
} from './critic-contracts'

import {
  selectFinalMessageV1,
} from './final-message-selector'

import type {
  FinalMessageResultV1,
} from './final-message-contracts'

import {
  createShadowEvaluationV1,
} from './shadow-evaluation'

import type {
  ShadowEvaluationV1,
} from './final-message-contracts'

export const MESSAGE_INTELLIGENCE_RUNNER_CONTRACT_VERSION =
  'message-intelligence-runner-v1' as const

export type MessageIntelligenceRunResultV1 = {
  contract_version:
    typeof MESSAGE_INTELLIGENCE_RUNNER_CONTRACT_VERSION

  snapshot: MessageContextSnapshotV1
  strategy: CommercialStrategyDecisionV1
  plan: MessagePlanV1
  generation_result: CandidateGenerationResultV1
  hard_gate_result: HardGateResultV1
  critic_result: CriticResultV1
  final_message_result: FinalMessageResultV1
  shadow_evaluation: ShadowEvaluationV1
}

function buildRuntimeCommercialReasoning({
  sources,
}: {
  sources:
    Awaited<
      ReturnType<
        MessageIntelligenceContextSourceLoaderV1
      >
    >
}): CommercialReasoning | null {
  if (
    !sources.commercial_reading ||
    sources.real_context.state_read.mode !==
      'found'
  ) {
    return null
  }

  return buildCommercialReasoning({
    reading:
      sources.commercial_reading.reading,
    cycle_state:
      sources.real_context.state_read.state,
    diagnostic_input:
      sources.real_context.diagnostic_input,
  })
}

/**
 * Roda o pipeline completo do Message Intelligence Engine V1 usando fontes
 * canônicas server-side. O reasoning é derivado somente dessas mesmas
 * fontes; nenhum dado client-side/viewport participa da decisão.
 */
export async function runMessageIntelligenceV1({
  request: rawRequest,
  load_sources,
}: {
  request: unknown
  load_sources:
    MessageIntelligenceContextSourceLoaderV1
}): Promise<MessageIntelligenceRunResultV1> {
  const request =
    normalizeMessageIntelligenceRequestV1(
      rawRequest,
    )

  const sources =
    await load_sources(request)

  const snapshot =
    assembleMessageContextSnapshotV1({
      request,
      sources,
    })

  const reasoning =
    buildRuntimeCommercialReasoning({
      sources,
    })

  return runMessageIntelligenceFromSnapshotWithReasoningV1({
    snapshot,
    reasoning,
  })
}

/**
 * Entrada pública histórica para testes/fixtures que já fornecem o snapshot.
 * Sem fontes canônicas completas não fabricamos reasoning: o pipeline usa a
 * estratégia existente, exatamente como antes da R6.
 */
export function runMessageIntelligenceFromSnapshotV1(
  snapshot: MessageContextSnapshotV1,
): MessageIntelligenceRunResultV1 {
  return runMessageIntelligenceFromSnapshotWithReasoningV1({
    snapshot,
    reasoning: null,
  })
}

function runMessageIntelligenceFromSnapshotWithReasoningV1({
  snapshot,
  reasoning,
}: {
  snapshot: MessageContextSnapshotV1
  reasoning: CommercialReasoning | null
}): MessageIntelligenceRunResultV1 {
  const baseStrategy =
    evaluateCommercialStrategyV1({
      snapshot,
    })

  const strategy =
    applyCommercialReasoningToMessageStrategy({
      strategy:
        baseStrategy,
      reasoning,
    })

  const plan =
    planMessageV1({
      snapshot,
      strategy,
    })

  const generationResult =
    generateMessageCandidatesV1({
      message_plan: plan,
    })

  const hardGateResult =
    runHardGatesV1({
      message_plan: plan,
      generation_result: generationResult,
    })

  const criticResult =
    critiqueMessageCandidatesV1({
      message_plan: plan,
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
    })

  const finalMessageResult =
    selectFinalMessageV1({
      message_plan: plan,
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
      critic_result: criticResult,
    })

  const shadowEvaluation =
    createShadowEvaluationV1({
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
      critic_result: criticResult,
      final_message_result: finalMessageResult,
    })

  return {
    contract_version:
      MESSAGE_INTELLIGENCE_RUNNER_CONTRACT_VERSION,

    snapshot,
    strategy,
    plan,
    generation_result: generationResult,
    hard_gate_result: hardGateResult,
    critic_result: criticResult,
    final_message_result: finalMessageResult,
    shadow_evaluation: shadowEvaluation,
  }
}
