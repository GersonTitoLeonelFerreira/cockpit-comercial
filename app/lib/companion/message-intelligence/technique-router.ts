import type {
  CommercialSituationPlaybookRuleV1,
} from './commercial-situation-playbook'

import type {
  CommercialMoveV1,
  CommercialObjectiveV1,
  FrameworkReferenceV1,
  GovernanceDecisionV1,
  SituationKeyV1,
  TechniqueSelectionV1,
} from './strategy-contracts'

export type TechniqueLibraryEntryV1 = {
  technique_key: string
  commercial_move: CommercialMoveV1
  framework_reference: FrameworkReferenceV1
  applicable_situations: SituationKeyV1[]
  applicable_objectives: CommercialObjectiveV1[]
  why_applicable: string
  constraints: string[]
}

export const TECHNIQUE_LIBRARY_V1:
  readonly TechniqueLibraryEntryV1[] = [
  {
    technique_key:
      'yolen_direct_fact_answer',
    commercial_move:
      'answer_directly',
    framework_reference:
      'Yolen-native',
    applicable_situations: [
      'information_request',
    ],
    applicable_objectives: [
      'answer_factually',
    ],
    why_applicable:
      'Prioriza resposta factual antes de tentar avançar a venda.',
    constraints: [
      'Usar somente fatos, condições e claims comprováveis.',
    ],
  },
  {
    technique_key:
      'spin_problem_clarification',
    commercial_move:
      'advance_discovery',
    framework_reference: 'SPIN',
    applicable_situations: [
      'discovery',
    ],
    applicable_objectives: [
      'advance_discovery',
      'clarify_need',
    ],
    why_applicable:
      'Ajuda a compreender problema e necessidade sem transformar perguntas em checklist rígido.',
    constraints: [
      'Perguntar apenas o que ainda acrescenta evidência comercial.',
    ],
  },
  {
    technique_key:
      'gap_current_future_delta',
    commercial_move:
      'surface_impact',
    framework_reference: 'GAP',
    applicable_situations: [
      'discovery',
      'uncertainty',
    ],
    applicable_objectives: [
      'advance_discovery',
      'reduce_uncertainty',
    ],
    why_applicable:
      'Estrutura o contraste entre estado atual e resultado desejado quando o impacto é relevante.',
    constraints: [
      'Não inventar impacto nem amplificar dor sem evidência.',
    ],
  },
  {
    technique_key:
      'sandler_objection_isolation',
    commercial_move:
      'isolate_objection',
    framework_reference: 'Sandler',
    applicable_situations: [
      'objection',
    ],
    applicable_objectives: [
      'address_objection',
    ],
    why_applicable:
      'Separa a barreira real de perguntas, condições e dúvidas antes de argumentar.',
    constraints: [
      'Não pressionar o cliente a defender a objeção.',
    ],
  },
  {
    technique_key:
      'challenger_constructive_reframe',
    commercial_move:
      'compare_on_criteria',
    framework_reference:
      'Challenger',
    applicable_situations: [
      'comparison',
    ],
    applicable_objectives: [
      'confirm_decision_criteria',
    ],
    why_applicable:
      'Permite reorganizar a comparação por critérios de decisão relevantes, sem atacar concorrentes.',
    constraints: [
      'Usar apenas diferenciais verificados.',
      'Não depreciar concorrentes sem fato comprovável.',
    ],
  },
  {
    technique_key:
      'meddpicc_decision_criteria',
    commercial_move:
      'confirm_decision_criteria',
    framework_reference:
      'MEDDPICC',
    applicable_situations: [
      'comparison',
      'decision_pending',
    ],
    applicable_objectives: [
      'confirm_decision_criteria',
      'reduce_decision_risk',
    ],
    why_applicable:
      'Organiza critérios e processo decisório quando eles influenciam o próximo passo.',
    constraints: [
      'Não transformar qualificação em interrogatório.',
    ],
  },
  {
    technique_key:
      'jolt_decision_support',
    commercial_move:
      'reduce_decision_risk',
    framework_reference: 'JOLT',
    applicable_situations: [
      'uncertainty',
      'decision_pending',
    ],
    applicable_objectives: [
      'reduce_uncertainty',
      'reduce_decision_risk',
    ],
    why_applicable:
      'Reduz complexidade e risco percebido sem fabricar urgência.',
    constraints: [
      'Não usar pressão, falsa urgência ou falsa escassez.',
    ],
  },
  {
    technique_key:
      'cialdini_commitment_consistency_ethical',
    commercial_move:
      'confirm_commitment',
    framework_reference:
      'Cialdini',
    applicable_situations: [
      'commitment_pending',
      'closing',
    ],
    applicable_objectives: [
      'confirm_commitment',
      'confirm_decision',
    ],
    why_applicable:
      'Pode apoiar a confirmação de um compromisso que o próprio cliente já expressou.',
    constraints: [
      'Usar influência ética; nunca criar obrigação artificial, culpa ou pressão.',
    ],
  },
  {
    technique_key:
      'yolen_next_step',
    commercial_move:
      'propose_next_step',
    framework_reference:
      'Yolen-native',
    applicable_situations: [
      'follow_up',
      'recovery',
    ],
    applicable_objectives: [
      'secure_next_step',
      'recover_process',
    ],
    why_applicable:
      'Converte continuidade comercial em próximo passo claro e proporcional ao contexto.',
    constraints: [
      'Não criar urgência artificial.',
    ],
  },
  {
    technique_key:
      'yolen_recovery_move',
    commercial_move:
      'recover_stalled_process',
    framework_reference:
      'Yolen-native',
    applicable_situations: [
      'recovery',
    ],
    applicable_objectives: [
      'recover_process',
    ],
    why_applicable:
      'Retoma o processo a partir da lacuna ou compromisso quebrado identificado no contexto.',
    constraints: [
      'Recuperar sem fingir que a quebra não aconteceu.',
    ],
  },
  {
    technique_key:
      'yolen_respect_timing',
    commercial_move:
      'respect_customer_timing',
    framework_reference:
      'Yolen-native',
    applicable_situations: [
      'postponement',
    ],
    applicable_objectives: [
      'respect_timing',
    ],
    why_applicable:
      'Preserva o timing declarado pelo cliente e evita transformar adiamento em objeção artificial.',
    constraints: [
      'Não converter espera legítima em pressão.',
    ],
  },
  {
    technique_key:
      'yolen_customer_space',
    commercial_move:
      'give_customer_space',
    framework_reference:
      'Yolen-native',
    applicable_situations: [
      'decision_pending',
    ],
    applicable_objectives: [
      'reduce_decision_risk',
    ],
    why_applicable:
      'Evita excesso de intervenção quando o próximo ganho comercial vem de respeitar espaço de decisão.',
    constraints: [
      'Não abandonar compromisso já acordado.',
    ],
  },
  {
    technique_key:
      'yolen_graceful_close',
    commercial_move:
      'close_conversation',
    framework_reference:
      'Yolen-native',
    applicable_situations: [
      'rejection',
    ],
    applicable_objectives: [
      'stop_pursuit',
    ],
    why_applicable:
      'Encerra a perseguição comercial diante de recusa explícita.',
    constraints: [
      'Não insistir após recusa clara.',
    ],
  },
] as const

export function selectTechniqueV1({
  situation,
  objective,
  commercial_move,
  governance,
  playbook_rule,
}: {
  situation: SituationKeyV1
  objective: CommercialObjectiveV1
  commercial_move: CommercialMoveV1 
  governance: GovernanceDecisionV1
  playbook_rule: CommercialSituationPlaybookRuleV1 | null
}): TechniqueSelectionV1 {
  if (
    governance.status === 'blocked' ||
    governance.status ===
      'approval_required'
  ) {
    return {
      status:
        'withheld_by_governance',
      technique_key: null,
      commercial_move,
      framework_reference: null,
      why_applicable:
        governance.status === 'blocked'
          ? 'Governance bloqueou o movimento; nenhuma técnica pode contornar a restrição.'
          : 'A execução depende de aprovação; a técnica fica retida até a decisão humana.',
      constraints:
        governance.constraints.map(
          item => item.detail,
        ),
    }
  }

  if (
    [
      'no_commercial_move',
      'request_more_context',
      'clarify_request',
    ].includes(commercial_move)
  ) {
    return {
      status: 'not_applicable',
      technique_key: null,
      commercial_move,
      framework_reference: null,
      why_applicable:
        'O movimento não exige técnica de framework.',
      constraints: [],
    }
  }

  const playbookTechniques =
    new Set(
      playbook_rule?.techniques.map(
        item => item.technique_key,
      ) ?? [],
    )

  const candidates =
    TECHNIQUE_LIBRARY_V1.filter(
      technique =>
        technique.commercial_move ===
          commercial_move &&
        technique.applicable_situations
          .includes(situation) &&
        technique.applicable_objectives
          .includes(objective) &&
        (
          playbookTechniques.size === 0 ||
          playbookTechniques.has(
            technique.technique_key,
          )
        ),
    )

  const selected =
    candidates[0] ?? null

  if (!selected) {
    return {
      status: 'not_applicable',
      technique_key: null,
      commercial_move,
      framework_reference: null,
      why_applicable:
        'Nenhuma técnica cadastrada é necessária ou compatível com o movimento comercial atual.',
      constraints: [],
    }
  }

  return {
    status: 'selected',
    technique_key:
      selected.technique_key,
    commercial_move:
      selected.commercial_move,
    framework_reference:
      selected.framework_reference,
    why_applicable:
      selected.why_applicable,
    constraints: [
      ...selected.constraints,
      ...governance.constraints.map(
        item => item.detail,
      ),
    ],
  }
}
