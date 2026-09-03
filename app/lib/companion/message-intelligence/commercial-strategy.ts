import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

import {
  resolveCommercialSituationPlaybookRuleV1,
  type CommercialSituationPlaybookV1,
} from './commercial-situation-playbook'

import {
  evaluateGovernanceDecisionV1,
} from './governance'

import {
  evaluateMethodAlignmentV1,
} from './method-alignment'

import {
  classifyCommercialSituationV1,
} from './situation-classifier'

import {
  getSituationTaxonomyEntryV1,
} from './situation-taxonomy'

import {
  selectTechniqueV1,
} from './technique-router'

import {
  COMMERCIAL_STRATEGY_CONTRACT_VERSION,
  type CommercialMoveDecisionV1,
  type CommercialMoveV1,
  type CommercialObjectiveV1,
  type CommercialStrategyDecisionV1,
  type CommercialStrategyDependenciesV1,
  type ResponseModeV1,
  type StrategyKnowledgeHintsV1,
} from './strategy-contracts'

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function supportAvailabilityIntent(
  text: string,
): boolean {
  const hasOffer =
    /\b(?:oferecer|ofereco|manter|ficar|deixar)\b/u.test(
      text,
    )
  const hasSupport =
    /\b(?:apoio|ajuda|auxilio|auxiliar|disponibilidade|disponivel)\b/u.test(
      text,
    )
  const hasSupportContext =
    /\b(?:pendenc|administrativ|operacion|duvid|necessidad|ajudar)\w*/u.test(
      text,
    )

  return (
    (hasOffer && hasSupport) ||
    (hasSupport && hasSupportContext)
  )
}

function commitmentConfirmationIntent(
  text: string,
): boolean {
  return (
    /\b(?:confirmar|reafirmar)\b.*\b(?:agendamento|horario combinado|demonstracao|encontro|reuniao|compromisso|fechamento)\b/u.test(
      text,
    ) ||
    /\b(?:agendamento|horario combinado|demonstracao|encontro|reuniao|compromisso)\b.*\bconfirmar\b/u.test(
      text,
    )
  )
}

export function inferSellerRequestedMoveV1(
  sellerIntent: string,
): CommercialMoveV1 | null {
  const text =
    normalizeText(sellerIntent)

  if (
    supportAvailabilityIntent(
      text,
    )
  ) {
    return 'no_commercial_move'
  }

  if (
    commitmentConfirmationIntent(
      text,
    )
  ) {
    return 'confirm_commitment'
  }

  const rules: Array<{
    move: CommercialMoveV1
    terms: string[]
  }> = [
    {
      move: 'no_commercial_move',
      terms: [
        'conversa descontraida',
        'conversa casual',
        'fortalecer vinculo',
        'fortalecer relacionamento',
        'sem objetivo comercial',
        'responder de forma casual',
        'oferecer apoio para pendencias operacionais',
        'oferecer apoio para pendencias atuais',
        'oferecer apoio operacional',
        'apoio para pendencias operacionais',
      ],
    },
    {
      move: 'close_conversation',
      terms: [
        'encerrar',
        'parar contato',
      ],
    },
    {
      move: 'give_customer_space',
      terms: [
        'dar espaco',
        'deixar pensar',
      ],
    },
    {
      move: 'respect_customer_timing',
      terms: [
        'esperar',
        'aguardar',
      ],
    },
    {
      move: 'resolve_objection',
      terms: [
        'resolver objecao',
        'rebater objecao',
        'contornar objecao',
      ],
    },
    {
      move: 'isolate_objection',
      terms: [
        'isolar objecao',
        'entender a objecao',
      ],
    },
    {
      move: 'compare_on_criteria',
      terms: [
        'comparar',
        'comparacao',
      ],
    },
    {
      move: 'clarify_request',
      terms: [
        'confirmar com o cliente se',
        'confirmar com a cliente se',
        'perguntar ao cliente se',
        'perguntar para o cliente se',
        'perguntar preferencia',
        'perguntar a preferencia',
        'perguntar qual formato',
        'perguntar se prefere',
        'preferencia de formato',
      ],
    },
    {
      move: 'advance_discovery',
      terms: [
        'fazer pergunta',
        'perguntar',
        'descobrir',
        'diagnosticar',
      ],
    },
    {
      move: 'answer_directly',
      terms: [
        'responder direto',
        'responder a pergunta',
        'confirmar identificacao',
        'confirmar dado',
        'confirmar dados',
        'responder apos verificar',
        'responder depois de verificar',
        'informar apos verificar',
      ],
    },
    {
      move: 'recover_stalled_process',
      terms: [
        'recuperar',
        'retomar processo',
      ],
    },
    {
      move: 'confirm_commitment',
      terms: [
        'fechar agora',
        'pedir fechamento',
        'confirmar fechamento',
        'confirmar recebimento',
      ],
    },
    {
      move: 'propose_next_step',
      terms: [
        'apresentar a solucao',
        'apresentar solucao',
        'avancar agora',
        'propor proximo passo',
        'insistir',
        'desviar delicadamente o assunto para o foco principal da negociacao',
        'voltar ao foco principal da negociacao',
        'retomar o foco principal da negociacao',
        'redirecionar para a negociacao',
        'retomar o assunto principal da negociacao',
      ],
    },
  ]

  for (const rule of rules) {
    if (
      rule.terms.some(
        term => text.includes(term),
      )
    ) {
      return rule.move
    }
  }

  return null
}

const MOVE_SEMANTICS:
  Record<
    CommercialMoveV1,
    {
      objective:
        CommercialObjectiveV1
      response_mode:
        ResponseModeV1
    }
  > = {
  answer_directly: {
    objective: 'answer_factually',
    response_mode: 'answer',
  },
  clarify_request: {
    objective: 'obtain_context',
    response_mode: 'clarify',
  },
  advance_discovery: {
    objective: 'advance_discovery',
    response_mode: 'ask',
  },
  surface_impact: {
    objective: 'clarify_need',
    response_mode: 'reframe',
  },
  confirm_decision_criteria: {
    objective:
      'confirm_decision_criteria',
    response_mode: 'clarify',
  },
  isolate_objection: {
    objective: 'address_objection',
    response_mode: 'clarify',
  },
  resolve_objection: {
    objective: 'address_objection',
    response_mode: 'answer',
  },
  reduce_decision_risk: {
    objective: 'reduce_decision_risk',
    response_mode: 'clarify',
  },
  compare_on_criteria: {
    objective:
      'confirm_decision_criteria',
    response_mode: 'clarify',
  },
  propose_next_step: {
    objective: 'secure_next_step',
    response_mode: 'advance',
  },
  confirm_commitment: {
    objective: 'confirm_commitment',
    response_mode: 'confirm',
  },
  recover_stalled_process: {
    objective: 'recover_process',
    response_mode: 'advance',
  },
  respect_customer_timing: {
    objective: 'respect_timing',
    response_mode: 'wait',
  },
  give_customer_space: {
    objective: 'reduce_decision_risk',
    response_mode: 'give_space',
  },
  close_conversation: {
    objective: 'stop_pursuit',
    response_mode: 'stop',
  },
  request_more_context: {
    objective: 'obtain_context',
    response_mode: 'clarify',
  },
  no_commercial_move: {
    objective: 'no_commercial_action',
    response_mode: 'acknowledge',
  },
}

function semanticsForMove(
  move: CommercialMoveV1,
): {
  objective:
    CommercialObjectiveV1
  response_mode:
    ResponseModeV1
} {
  return MOVE_SEMANTICS[move]
}

function buildCommercialMoveDecisionV1({
  default_move,
  requested_move,
  playbook_allowed_moves,
}: {
  default_move: CommercialMoveV1
  requested_move: CommercialMoveV1 | null
  playbook_allowed_moves: CommercialMoveV1[]
}): CommercialMoveDecisionV1 {
  const sellerRequestCanOverride =
    requested_move !== null &&
    !(
      requested_move ===
        'no_commercial_move' &&
      default_move !==
        'no_commercial_move'
    )

  if (
    sellerRequestCanOverride &&
    requested_move &&
    (
      playbook_allowed_moves.length === 0 ||
      playbook_allowed_moves.includes(
        requested_move,
      )
    )
  ) {
    return {
      move: requested_move,
      default_move,
      reason:
        requested_move === default_move
          ? 'O pedido explícito do vendedor coincide com o movimento recomendado pela situação.'
          : 'O pedido explícito do vendedor governa o movimento, preservando o default da situação para Method Alignment e governance.',
      source: 'seller_request',
      requested_move,
    }
  }

  if (
    playbook_allowed_moves.length > 0 &&
    !playbook_allowed_moves.includes(
      default_move,
    )
  ) {
    return {
      move:
        playbook_allowed_moves[0],
      default_move,
      reason:
        'O playbook da empresa especializa o movimento permitido para esta situação.',
      source: 'playbook',
      requested_move,
    }
  }

  return {
    move: default_move,
    default_move,
    reason:
      'Movimento derivado da situação comercial e do objetivo imediato; técnica ainda não participa desta decisão.',
    source: 'strategy_default',
    requested_move,
  }
}

export function evaluateCommercialStrategyV1({
  snapshot,
  playbook = null,
  dependencies = {},
}: {
  snapshot: MessageContextSnapshotV1
  playbook?: CommercialSituationPlaybookV1 | null
  dependencies?: CommercialStrategyDependenciesV1
}): CommercialStrategyDecisionV1 {
  const resolvedHints =
    dependencies.resolve_knowledge_hints
      ?.call(null, snapshot) ?? null

  const inferredRequestedMove =
    inferSellerRequestedMoveV1(
      snapshot.seller_intent?.value ?? '',
    )

  const hints:
    StrategyKnowledgeHintsV1 | null =
      resolvedHints
        ? {
            ...resolvedHints,
            requested_move:
              resolvedHints.requested_move ??
              inferredRequestedMove ??
              undefined,
          }
        : inferredRequestedMove
          ? {
              requested_move:
                inferredRequestedMove,
            }
          : null

  const situation =
    classifyCommercialSituationV1(
      snapshot,
      hints,
    )

  const taxonomy =
    getSituationTaxonomyEntryV1(
      situation.situation,
    )

  const playbookRule =
    resolveCommercialSituationPlaybookRuleV1({
      playbook,
      situation:
        situation.situation,
      objective:
        taxonomy.default_objective,
    })

  const commercialMove =
    buildCommercialMoveDecisionV1({
      default_move:
        taxonomy.default_move,
      requested_move:
        hints?.requested_move ?? null,
      playbook_allowed_moves:
        playbookRule?.allowed_moves ?? [],
    })

  const moveSemantics =
    commercialMove.move ===
      taxonomy.default_move
      ? {
          objective:
            taxonomy.default_objective,
          response_mode:
            taxonomy.default_response_mode,
        }
      : semanticsForMove(
          commercialMove.move,
        )

  const methodAlignment =
    evaluateMethodAlignmentV1({
      snapshot,
      situation:
        situation.situation,
      commercial_move:
        commercialMove,
    })

  const governance =
    evaluateGovernanceDecisionV1({
      snapshot,
      commercial_move:
        commercialMove,
      hints,
      playbook_rule:
        playbookRule,
    })

  const technique =
    selectTechniqueV1({
      situation:
        situation.situation,
      objective:
        moveSemantics.objective,
      commercial_move:
        commercialMove.move,
      governance,
      playbook_rule:
        playbookRule,
    })

  const limitations: string[] = []

  if (!resolvedHints) {
    limitations.push(
      'Knowledge hints externos são opcionais; esta frente não depende da implementação paralela do Knowledge Resolver.',
    )
  }

  if (
    moveSemantics.objective ===
      'answer_factually' &&
    hints?.fact_support ===
      'insufficient'
  ) {
    limitations.push(
      'Suporte factual insuficiente para preencher lacunas além das fontes oficiais presentes no snapshot.',
    )
  }

  return {
    contract_version:
      COMMERCIAL_STRATEGY_CONTRACT_VERSION,
    situation,
    commercial_objective:
      moveSemantics.objective,
    response_mode:
      moveSemantics.response_mode,
    commercial_move:
      commercialMove,
    method_alignment:
      methodAlignment,
    governance,
    technique_selection:
      technique,
    limitations,
  }
}
