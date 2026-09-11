import type {
  CommercialReasoning,
} from '../commercial-reasoning-contract'

import type {
  CommercialReadingDecision,
} from '../commercial-reading-contract'

import type {
  CommercialMoveV1,
  CommercialObjectiveV1,
  CommercialStrategyDecisionV1,
  ResponseModeV1,
} from './strategy-contracts'

/**
 * FASE 16-R6 — adapta o Commercial Reasoning canônico para o contrato de
 * estratégia já consumido pelo Message Intelligence Engine.
 *
 * Não gera texto e não toca no Knowledge Resolver. O objetivo é impedir que
 * MENSAGEM escolha uma técnica/movimento incompatível com o mesmo reasoning
 * que alimenta AGORA e ANÁLISE, preservando os hard gates e factualidade do
 * MIE.
 */

function moveForDecision(
  decision: CommercialReadingDecision,
  reasoning: CommercialReasoning,
): CommercialMoveV1 {
  switch (decision) {
    case 'no_intervention':
      return 'no_commercial_move'
    case 'give_space':
      return 'give_customer_space'
    case 'wait':
      return 'respect_customer_timing'
    case 'respond':
      return 'answer_directly'
    case 'ask':
    case 'clarify':
    case 'confirm_information':
      return 'clarify_request'
    case 'deepen_discovery':
    case 'insufficient_information':
      return 'advance_discovery'
    case 'handle_objection':
      return reasoning.selected_techniques.some(
        item =>
          item.intelligence_id ===
            'technique.objection_diagnosis',
      )
        ? 'isolate_objection'
        : 'resolve_objection'
    case 'compare':
      return 'compare_on_criteria'
    case 'follow_up':
      return 'recover_stalled_process'
    case 'set_commitment':
      return 'confirm_commitment'
    case 'ask_for_decision':
      return 'confirm_decision_criteria'
    case 'close':
      return 'close_conversation'
    case 'present_solution':
    case 'demonstrate_value':
    case 'send_material':
    case 'propose_call':
    case 'propose_meeting':
    case 'propose_visit':
    case 'negotiate':
      return 'propose_next_step'
    case 'escalate':
      return 'request_more_context'
  }
}

function objectiveForMove(
  move: CommercialMoveV1,
): CommercialObjectiveV1 {
  switch (move) {
    case 'answer_directly':
      return 'answer_factually'
    case 'clarify_request':
      return 'clarify_need'
    case 'advance_discovery':
    case 'surface_impact':
      return 'advance_discovery'
    case 'confirm_decision_criteria':
      return 'confirm_decision_criteria'
    case 'isolate_objection':
    case 'resolve_objection':
      return 'address_objection'
    case 'reduce_decision_risk':
      return 'reduce_decision_risk'
    case 'compare_on_criteria':
      return 'confirm_decision_criteria'
    case 'propose_next_step':
      return 'secure_next_step'
    case 'confirm_commitment':
      return 'confirm_commitment'
    case 'recover_stalled_process':
      return 'recover_process'
    case 'respect_customer_timing':
    case 'give_customer_space':
      return 'respect_timing'
    case 'close_conversation':
      return 'stop_pursuit'
    case 'request_more_context':
      return 'obtain_context'
    case 'no_commercial_move':
      return 'no_commercial_action'
  }
}

function responseModeForMove(
  move: CommercialMoveV1,
): ResponseModeV1 {
  switch (move) {
    case 'answer_directly':
    case 'resolve_objection':
      return 'answer'
    case 'clarify_request':
    case 'advance_discovery':
    case 'confirm_decision_criteria':
    case 'isolate_objection':
    case 'request_more_context':
      return 'ask'
    case 'surface_impact':
    case 'reduce_decision_risk':
    case 'compare_on_criteria':
      return 'reframe'
    case 'propose_next_step':
    case 'recover_stalled_process':
      return 'advance'
    case 'confirm_commitment':
      return 'confirm'
    case 'respect_customer_timing':
      return 'wait'
    case 'give_customer_space':
      return 'give_space'
    case 'close_conversation':
    case 'no_commercial_move':
      return 'stop'
  }
}

export function applyCommercialReasoningToMessageStrategy({
  strategy,
  reasoning,
}: {
  strategy: CommercialStrategyDecisionV1
  reasoning: CommercialReasoning | null
}): CommercialStrategyDecisionV1 {
  if (!reasoning) {
    return strategy
  }

  if (reasoning.status === 'silent') {
    return {
      ...strategy,
      commercial_objective:
        'no_commercial_action',
      response_mode:
        'give_space',
      commercial_move: {
        ...strategy.commercial_move,
        move: 'no_commercial_move',
        default_move:
          'no_commercial_move',
        reason:
          reasoning.decision_reason,
        source:
          'playbook',
      },
      technique_selection: {
        status: 'not_applicable',
        technique_key: null,
        commercial_move:
          'no_commercial_move',
        framework_reference: null,
        why_applicable:
          reasoning.decision_reason,
        constraints: [
          ...reasoning.do_not_do,
        ],
      },
      limitations: [
        ...new Set([
          ...strategy.limitations,
          ...reasoning.limitations,
        ]),
      ],
    }
  }

  const move =
    moveForDecision(
      reasoning.decision,
      reasoning,
    )

  const selectedTechnique =
    reasoning.selected_techniques[0]

  const techniqueConstraints =
    [
      ...reasoning.do_not_do,
      ...(
        selectedTechnique?.risks ?? []
      ),
    ]

  return {
    ...strategy,
    commercial_objective:
      objectiveForMove(move),
    response_mode:
      responseModeForMove(move),
    commercial_move: {
      ...strategy.commercial_move,
      move,
      default_move: move,
      reason:
        reasoning.decision_reason,
      source: 'playbook',
    },
    technique_selection:
      selectedTechnique
        ? {
            status: 'selected',
            technique_key:
              selectedTechnique
                .intelligence_id,
            commercial_move: move,
            framework_reference:
              'Yolen-native',
            why_applicable:
              selectedTechnique
                .why_applicable,
            constraints:
              techniqueConstraints,
          }
        : {
            ...strategy.technique_selection,
            commercial_move: move,
            constraints: [
              ...new Set([
                ...strategy
                  .technique_selection
                  .constraints,
                ...reasoning.do_not_do,
              ]),
            ],
          },
    limitations: [
      ...new Set([
        ...strategy.limitations,
        ...reasoning.limitations,
      ]),
    ],
  }
}
