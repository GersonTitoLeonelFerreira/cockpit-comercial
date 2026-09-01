// ============================================================================
// Message Intelligence Engine V1 — Shadow Validation
// Runner / Orchestrator
//
// Executa, na ordem correta, os módulos já aprovados de cada frente:
//
//   MessageIntelligenceRequestV1
//     -> Message Context Source Loader
//     -> Context Assembler
//     -> Commercial Strategy
//     -> Message Planner
//     -> Candidate Generator
//     -> Hard Gates
//     -> Commercial/Naturalness Critic
//     -> Final Message Selector
//     -> Shadow Evaluation
//
// Este módulo APENAS orquestra. Ele não recalcula score, não muda
// Critic, não reranqueia, não reescreve candidate e não gera fallback.
// Final Message continua exatamente uma candidate já existente.
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

/**
 * Roda o pipeline completo do Message Intelligence Engine V1 para um
 * request já resolvido, usando um source loader real (server-side,
 * device-independent).
 *
 * Não escreve nada seller-facing, não decide governança e não escolhe
 * técnica comercial além do que os módulos das frentes já decidem.
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

  return runMessageIntelligenceFromSnapshotV1(
    snapshot,
  )
}

/**
 * Mesma orquestração, mas a partir de um MessageContextSnapshotV1 já
 * montado — útil para testes de pipeline completo que constroem o
 * snapshot diretamente a partir de fixtures.
 */
export function runMessageIntelligenceFromSnapshotV1(
  snapshot: MessageContextSnapshotV1,
): MessageIntelligenceRunResultV1 {
  const strategy =
    evaluateCommercialStrategyV1({
      snapshot,
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
