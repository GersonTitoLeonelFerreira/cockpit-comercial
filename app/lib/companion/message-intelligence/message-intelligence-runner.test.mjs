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


function buildSanitizedShadowQualitySnapshot({
  sellerIntent,
  incomingText,
}) {
  const request =
    buildMessageIntelligenceRequestFixture()

  request.seller_intent =
    sellerIntent

  const snapshot =
    assembleMessageContextSnapshotV1({
      request,
      sources:
        buildMessageIntelligenceSourcesFixture(),
    })

  for (
    const key of [
      'objectives',
      'problems',
      'impacts',
      'needs',
      'interests',
      'decision_criteria',
      'preferences',
      'open_questions',
      'objections',
      'uncertainties',
      'products',
      'competitors',
      'commitments',
      'missing_discovery',
      'communication_observations',
      'signals',
      'resolved_information',
      'superseded_information',
    ]
  ) {
    snapshot.customer[key] = []
  }

  snapshot.commercial
    .commercial_relevance =
    null
  snapshot.commercial
    .recovery_guidance =
    null

  const incoming =
    snapshot.conversation.messages
      .filter(
        message =>
          message.direction ===
            'incoming',
      )
      .at(-1)

  assert.ok(incoming)
  incoming.text_content =
    incomingText
  incoming.audio_transcription =
    null

  const currentIncoming =
    snapshot.conversation
      .current_interaction
      ?.messages
      .filter(
        message =>
          message.direction ===
            'incoming',
      )
      .at(-1)

  assert.ok(currentIncoming)
  currentIncoming.text_content =
    incomingText
  currentIncoming.audio_transcription =
    null

  return snapshot
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


test(
  'shadow quality: confirmação de agendamento não cai em pergunta genérica',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Quero responder ao ponto principal desta conversa.',
          incomingText:
            'Agendado',
        }),
      )

    assert.equal(
      run.strategy.situation.situation,
      'closing',
    )
    assert.equal(
      run.strategy
        .commercial_move.move,
      'confirm_commitment',
    )
    assert.equal(
      run.final_message_result.status,
      'selected',
    )

    const text =
      run.final_message_result
        .final_message?.text ?? ''

    assert.equal(
      text,
      'Combinado.',
    )
    assert.doesNotMatch(
      text,
      /O que você precisa confirmar agora/iu,
    )
  },
)

test(
  'shadow quality: confirmação factual sem fonte canônica se abstém em vez de perguntar genericamente',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Confirmar identificação da aluna com dado fornecido',
          incomingText:
            'Aqui está o identificador dela.',
        }),
      )

    assert.equal(
      run.strategy
        .commercial_move.move,
      'answer_directly',
    )
    assert.equal(
      run.strategy
        .commercial_move.source,
      'seller_request',
    )
    assert.equal(
      run.final_message_result.status,
      'no_eligible_candidates',
    )
    assert.equal(
      run.shadow_evaluation
        .would_surface_message,
      false,
    )
  },
)

test(
  'shadow quality: conversa relacional explícita não recebe linguagem de decisão comercial',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Continuar conversa descontraída para fortalecer vínculo',
          incomingText:
            'Certo, estou aqui em frente ao supermercado.',
        }),
      )

    assert.equal(
      run.strategy.situation.situation,
      'non_commercial',
    )
    assert.equal(
      run.strategy
        .commercial_move.move,
      'no_commercial_move',
    )
    assert.equal(
      run.final_message_result.status,
      'no_eligible_candidates',
    )
    assert.equal(
      run.shadow_evaluation
        .would_surface_message,
      false,
    )
  },
)

test(
  'shadow quality Scenario 20: intenções materialmente diferentes nunca convergem no mesmo fallback genérico',
  () => {
    const factual =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Confirmar identificação da aluna com dado fornecido',
          incomingText:
            'Aqui está o identificador dela.',
        }),
      )

    const relationship =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Continuar conversa descontraída para fortalecer vínculo',
          incomingText:
            'Certo, estou aqui em frente ao supermercado.',
        }),
      )

    const texts =
      [
        factual.final_message_result
          .final_message?.text ?? null,
        relationship.final_message_result
          .final_message?.text ?? null,
      ]

    assert.equal(
      texts.includes(
        'O que você precisa confirmar agora?',
      ),
      false,
    )
    assert.notDeepEqual(
      factual.strategy,
      relationship.strategy,
    )
  },
)


test(
  'shadow quality: pergunta comercial explícita prevalece sobre seller intent casual incompatível',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Continuar conversa descontraída para fortalecer vínculo',
          incomingText:
            'Qual o valor do plano?',
        }),
      )

    assert.equal(
      run.strategy.situation.situation,
      'information_request',
    )
    assert.equal(
      run.strategy
        .commercial_move.move,
      'answer_directly',
    )
    assert.equal(
      run.strategy
        .commercial_move.source,
      'strategy_default',
    )
    assert.equal(
      run.final_message_result.status,
      'selected',
    )
    assert.equal(
      run.critic_result
        .weak_candidate_ids.length,
      0,
    )
  },
)


test(
  'shadow round2: confirmar com cliente gera pergunta específica em vez de abstention',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Confirmar com o cliente se a aluna enviou o print do e-mail de cancelamento',
          incomingText:
            'beleza',
        }),
      )

    assert.equal(
      run.strategy
        .commercial_move.move,
      'clarify_request',
    )
    assert.equal(
      run.final_message_result.status,
      'selected',
    )
    assert.equal(
      run.final_message_result
        .final_message?.text,
      'A aluna enviou o print do e-mail de cancelamento?',
    )
  },
)

test(
  'shadow round2: aguardar manifestação do cliente produz silêncio',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Aguardar o cliente manifestar interesse para confirmar agenda da demonstração do Yolen',
          incomingText:
            'Também te amo muito',
        }),
      )

    assert.equal(
      run.generation_result
        .candidates.length,
      0,
    )
    assert.equal(
      run.final_message_result.status,
      'no_eligible_candidates',
    )
    assert.equal(
      run.shadow_evaluation
        .would_surface_message,
      false,
    )
  },
)

test(
  'shadow round2: compromisso atual do cliente prevalece sobre memória de incerteza',
  () => {
    const snapshot =
      buildSanitizedShadowQualitySnapshot({
        sellerIntent:
          'Quero responder ao ponto principal desta conversa.',
        incomingText:
          'Legal! Vou mandar',
      })

    snapshot.customer
      .uncertainties = [{
        memory_id:
          'uncertainty-old',
        collection:
          'uncertainties',
        kind:
          'decision_uncertainty',
        summary:
          'Dúvida anterior já superada pela mensagem atual.',
        value: null,
        confidence: 'high',
        memory_status: 'active',
        created_in_state_version: 1,
        updated_in_state_version: 1,
        closed_in_state_version: null,
        evidence_message_ids: [],
        attributes: {},
        provenance: [],
      }]

    const run =
      runMessageIntelligenceFromSnapshotV1(
        snapshot,
      )

    assert.equal(
      run.strategy.situation.situation,
      'commitment_pending',
    )
    assert.equal(
      run.final_message_result.status,
      'selected',
    )
    assert.equal(
      run.final_message_result
        .final_message?.text,
      'Combinado.',
    )
  },
)

test(
  'shadow round2: confirmar recebimento do atestado gera acknowledgement direto',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSanitizedShadowQualitySnapshot({
          sellerIntent:
            'Confirmar recebimento do atestado',
          incomingText:
            'Amanhã estou lá',
        }),
      )

    assert.equal(
      run.strategy
        .commercial_move.move,
      'confirm_commitment',
    )
    assert.equal(
      run.final_message_result.status,
      'selected',
    )
    assert.equal(
      run.final_message_result
        .final_message?.text,
      'Recebi o atestado.',
    )
  },
)
