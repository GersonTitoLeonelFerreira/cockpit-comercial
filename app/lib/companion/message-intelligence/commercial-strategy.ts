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
  type CommercialStrategyDecisionV1,
  type CommercialStrategyDependenciesV1,
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

export function inferSellerRequestedMoveV1(
  sellerIntent: string,
): CommercialMoveV1 | null {
  const text =
    normalizeText(sellerIntent)

  const rules: Array<{
    move: CommercialMoveV1
    terms: string[]
  }> = [
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

function buildCommercialMoveDecisionV1({
  default_move,
  requested_move,
  playbook_allowed_moves,
}: {
  default_move: CommercialMoveV1
  requested_move: CommercialMoveV1 | null
  playbook_allowed_moves: CommercialMoveV1[]
}): CommercialMoveDecisionV1 {
  if (
    playbook_allowed_moves.length > 0 &&
    !playbook_allowed_moves.includes(
      default_move,
    )
  ) {
    return {
      move:
        playbook_allowed_moves[0],
      reason:
        'O playbook da empresa especializa o movimento permitido para esta situação.',
      source: 'playbook',
      requested_move,
    }
  }

  return {
    move: default_move,
    reason:
      'Movimento derivado da situação comercial e do objetivo imediato; técnica ainda não participa desta decisão.',
    source:
      requested_move === default_move
        ? 'seller_request'
        : 'strategy_default',
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
        taxonomy.default_objective,
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
    taxonomy.default_objective ===
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
      taxonomy.default_objective,
    response_mode:
      taxonomy.default_response_mode,
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
