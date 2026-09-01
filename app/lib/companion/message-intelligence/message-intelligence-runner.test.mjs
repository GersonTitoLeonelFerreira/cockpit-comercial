// Testes do runner/orchestrator do Message Intelligence Engine V1 —
// Shadow Validation.
//
// Cobre:
// - Pipeline completo (request -> snapshot -> strategy -> plan ->
//   candidate -> hard gates -> critic -> final -> shadow) atingindo
//   status distintos: selected, no_eligible_candidates, blocked,
//   approval_required, inconsistent_input.
// - Scenario 20: dois contextos com a mesma intenção superficial do
//   vendedor, upstream materialmente diferente -> Final A !== Final B.
// - O runner apenas orquestra: nunca recalcula score, nunca reranqueia,
//   nunca reescreve candidate.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageIntelligenceRequestFixture,
  buildMessageIntelligenceSourcesFixture,
} from './fixtures.ts'

import {
  assembleMessageContextSnapshotV1,
} from './context-assembler.ts'

import {
  runMessageIntelligenceFromSnapshotV1,
} from './message-intelligence-runner.ts'

import {
  planMessageV1,
} from './message-planner.ts'

import {
  evaluateCommercialStrategyV1,
} from './commercial-strategy.ts'

import {
  generateMessageCandidatesV1,
} from './candidate-generator.ts'

import {
  runHardGatesV1,
} from './hard-gates.ts'

import {
  critiqueMessageCandidatesV1,
} from './commercial-naturalness-critic.ts'

import {
  selectFinalMessageV1,
} from './final-message-selector.ts'

import {
  createShadowEvaluationV1,
} from './shadow-evaluation.ts'

function assertShadowSelfConsistent(run) {
  const {
    shadow_evaluation: evaluation,
    generation_result: generationResult,
    hard_gate_result: hardGateResult,
    critic_result: criticResult,
    final_message_result: finalMessageResult,
  } = run

  assert.equal(
    evaluation.final_status,
    finalMessageResult.status,
  )
  assert.equal(
    evaluation.selected_candidate_id,
    finalMessageResult.selected_candidate_id,
  )
  assert.equal(
    evaluation.candidate_count,
    generationResult.candidates.length,
  )
  assert.equal(
    evaluation.hard_gate_pass_count,
    hardGateResult.passed_candidate_ids.length,
  )
  assert.equal(
    evaluation.critic_evaluated_count,
    criticResult.critiques.length,
  )
  assert.equal(evaluation.automatic_send, false)
  assert.equal(evaluation.automatic_crm_write, false)
  assert.equal(evaluation.automatic_agenda_write, false)

  if (finalMessageResult.status === 'selected') {
    assert.equal(evaluation.would_surface_message, true)
    assert.notEqual(finalMessageResult.final_message, null)
    assert.equal(
      evaluation.selected_critic_status,
      finalMessageResult.final_message.critic_status,
    )
    assert.equal(
      evaluation.selected_overall_score,
      finalMessageResult.final_message.overall_score,
    )

    // Final Message continua exatamente uma candidate já existente —
    // o runner nunca reescreve o texto.
    const matchingCandidate =
      generationResult.candidates.find(
        (candidate) =>
          candidate.candidate_id ===
          finalMessageResult.selected_candidate_id,
      )

    assert.notEqual(matchingCandidate, undefined)
    assert.equal(
      finalMessageResult.final_message.text,
      matchingCandidate.text,
    )
  } else {
    assert.equal(evaluation.would_surface_message, false)
    assert.equal(evaluation.selected_candidate_id, null)
    assert.equal(evaluation.selected_critic_status, null)
    assert.equal(evaluation.selected_overall_score, null)
  }
}

function buildDecisionPendingSnapshot() {
  const request = buildMessageIntelligenceRequestFixture()
  request.seller_intent =
    'Quero agradecer o contato dele.'

  const sources = buildMessageIntelligenceSourcesFixture()
  sources.real_context.diagnostic_input.conversation.messages[1]
    .text_content =
    'Muito obrigado pela atenção, vou pensar com calma.'

  return assembleMessageContextSnapshotV1({
    request,
    sources,
  })
}

function buildInformationRequestSnapshot() {
  return assembleMessageContextSnapshotV1({
    request: buildMessageIntelligenceRequestFixture(),
    sources: buildMessageIntelligenceSourcesFixture(),
  })
}

test(
  'pipeline completo: contexto que resolve a intenção chega a selected, com shadow evaluation consistente',
  () => {
    const snapshot = buildDecisionPendingSnapshot()
    const run = runMessageIntelligenceFromSnapshotV1(snapshot)

    assert.equal(
      run.final_message_result.status,
      'selected',
    )

    assertShadowSelfConsistent(run)
  },
)

test(
  'pipeline completo: contexto que exige mais informação nunca gera candidate e chega a no_eligible_candidates',
  () => {
    const snapshot = buildInformationRequestSnapshot()
    const run = runMessageIntelligenceFromSnapshotV1(snapshot)

    assert.equal(
      run.plan.status,
      'needs_information',
    )
    assert.equal(
      run.generation_result.candidates.length,
      0,
    )
    assert.equal(
      run.final_message_result.status,
      'no_eligible_candidates',
    )

    assertShadowSelfConsistent(run)
  },
)

test(
  '33. Scenario 20 — upstream materialmente diferente produz Final A !== Final B',
  () => {
    const runA = runMessageIntelligenceFromSnapshotV1(
      buildDecisionPendingSnapshot(),
    )
    const runB = runMessageIntelligenceFromSnapshotV1(
      buildInformationRequestSnapshot(),
    )

    assert.notEqual(
      runA.final_message_result.status,
      runB.final_message_result.status,
    )
    assert.notEqual(
      runA.shadow_evaluation.would_surface_message,
      runB.shadow_evaluation.would_surface_message,
    )
    assert.notDeepEqual(
      runA.shadow_evaluation,
      runB.shadow_evaluation,
    )
  },
)

test(
  'pipeline: plan bloqueado por governance nunca gera candidate (blocked)',
  () => {
    const snapshot = buildDecisionPendingSnapshot()

    const strategy = evaluateCommercialStrategyV1({
      snapshot,
    })

    const readyPlan = planMessageV1({
      snapshot,
      strategy,
    })

    // O Generator decide unicamente a partir de message_plan.status —
    // ver generateMessageCandidatesV1: retorno antecipado antes de
    // tocar qualquer outro campo do plano. generation_constraints
    // precisa refletir a mesma decisão (generation_allowed=false),
    // como um MessagePlanV1 blocked real sempre carrega — senão o
    // Hard Gate global GENERATION_ALLOWED_MISMATCH classificaria isso
    // como entrada inconsistente, não como blocked.
    const blockedPlan = {
      ...readyPlan,
      status: 'blocked',
      generation_constraints: {
        ...readyPlan.generation_constraints,
        generation_allowed: false,
      },
    }

    const generationResult =
      generateMessageCandidatesV1({
        message_plan: blockedPlan,
      })

    const hardGateResult = runHardGatesV1({
      message_plan: blockedPlan,
      generation_result: generationResult,
    })

    const criticResult = critiqueMessageCandidatesV1({
      message_plan: blockedPlan,
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
    })

    const finalMessageResult = selectFinalMessageV1({
      message_plan: blockedPlan,
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
      critic_result: criticResult,
    })

    const shadowEvaluation = createShadowEvaluationV1({
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
      critic_result: criticResult,
      final_message_result: finalMessageResult,
    })

    assert.equal(generationResult.status, 'blocked')
    assert.equal(generationResult.candidates.length, 0)
    assert.equal(finalMessageResult.status, 'blocked')
    assert.equal(shadowEvaluation.final_status, 'blocked')
    assert.equal(shadowEvaluation.would_surface_message, false)
    assert.equal(shadowEvaluation.automatic_send, false)
  },
)

test(
  'pipeline: plan que exige aprovação humana nunca gera candidate (approval_required)',
  () => {
    const snapshot = buildDecisionPendingSnapshot()

    const strategy = evaluateCommercialStrategyV1({
      snapshot,
    })

    const readyPlan = planMessageV1({
      snapshot,
      strategy,
    })

    const approvalPlan = {
      ...readyPlan,
      status: 'approval_required',
      generation_constraints: {
        ...readyPlan.generation_constraints,
        generation_allowed: false,
      },
    }

    const generationResult =
      generateMessageCandidatesV1({
        message_plan: approvalPlan,
      })

    const hardGateResult = runHardGatesV1({
      message_plan: approvalPlan,
      generation_result: generationResult,
    })

    const criticResult = critiqueMessageCandidatesV1({
      message_plan: approvalPlan,
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
    })

    const finalMessageResult = selectFinalMessageV1({
      message_plan: approvalPlan,
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
      critic_result: criticResult,
    })

    const shadowEvaluation = createShadowEvaluationV1({
      generation_result: generationResult,
      hard_gate_result: hardGateResult,
      critic_result: criticResult,
      final_message_result: finalMessageResult,
    })

    assert.equal(generationResult.status, 'approval_required')
    assert.equal(finalMessageResult.status, 'approval_required')
    assert.equal(shadowEvaluation.final_status, 'approval_required')
    assert.equal(shadowEvaluation.would_surface_message, false)
  },
)

test(
  'pipeline: entrada inconsistente entre estágios nunca é resolvida silenciosamente (inconsistent_input)',
  () => {
    const run = runMessageIntelligenceFromSnapshotV1(
      buildDecisionPendingSnapshot(),
    )

    // Corrompe deliberadamente a consistência cruzada entre hard gate e
    // critic (critic aponta candidates "aprovados" que o hard gate não
    // aprovou) — nunca produzido pelo pipeline real, só para provar que
    // o Final Message Selector recusa a se comprometer diante disso.
    const corruptedHardGateResult = {
      ...run.hard_gate_result,
      passed_candidate_ids: [],
      failed_candidate_ids:
        run.generation_result.candidates.map(
          (candidate) => candidate.candidate_id,
        ),
      candidates:
        run.hard_gate_result.candidates.map((row) => ({
          ...row,
          status: 'fail',
        })),
      status: 'all_failed',
    }

    const finalMessageResult = selectFinalMessageV1({
      message_plan: run.plan,
      generation_result: run.generation_result,
      hard_gate_result: corruptedHardGateResult,
      critic_result: run.critic_result,
    })

    const shadowEvaluation = createShadowEvaluationV1({
      generation_result: run.generation_result,
      hard_gate_result: corruptedHardGateResult,
      critic_result: run.critic_result,
      final_message_result: finalMessageResult,
    })

    assert.equal(finalMessageResult.status, 'inconsistent_input')
    assert.equal(finalMessageResult.final_message, null)
    assert.equal(shadowEvaluation.would_surface_message, false)
    assert.equal(shadowEvaluation.selected_candidate_id, null)
  },
)


test(
  'pipeline/harness: Critic weak-only válido termina em no_acceptable_message sem gerar fallback',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildDecisionPendingSnapshot(),
      )

    assert.ok(
      run.hard_gate_result
        .passed_candidate_ids.length > 0,
    )

    const weakCritiques =
      run.critic_result.critiques.map(
        (critique) => ({
          ...critique,
          status: 'weak',
        }),
      )

    const weakCriticResult = {
      ...run.critic_result,
      status: 'evaluated',
      critiques:
        weakCritiques,
      recommended_candidate_ids: [],
      acceptable_candidate_ids: [],
      weak_candidate_ids:
        run.critic_result
          .ranked_candidate_ids
          .filter((candidateId) =>
            weakCritiques.some(
              (critique) =>
                critique.candidate_id ===
                candidateId,
            ),
          ),
    }

    const finalMessageResult =
      selectFinalMessageV1({
        message_plan:
          run.plan,
        generation_result:
          run.generation_result,
        hard_gate_result:
          run.hard_gate_result,
        critic_result:
          weakCriticResult,
      })

    const shadowEvaluation =
      createShadowEvaluationV1({
        generation_result:
          run.generation_result,
        hard_gate_result:
          run.hard_gate_result,
        critic_result:
          weakCriticResult,
        final_message_result:
          finalMessageResult,
      })

    assert.equal(
      finalMessageResult.status,
      'no_acceptable_message',
    )
    assert.equal(
      finalMessageResult.final_message,
      null,
    )
    assert.equal(
      finalMessageResult.selected_candidate_id,
      null,
    )
    assert.equal(
      shadowEvaluation.would_surface_message,
      false,
    )
  },
)
