import type {
  CommercialObjectiveV1,
  CommercialMoveV1,
  ResponseModeV1,
  SituationKeyV1,
} from './strategy-contracts'

export type SituationTaxonomyEntryV1 = {
  key: SituationKeyV1
  observable_definition: string
  default_objective: CommercialObjectiveV1
  default_response_mode: ResponseModeV1
  default_move: CommercialMoveV1
}

export const SITUATION_TAXONOMY_V1:
  readonly SituationTaxonomyEntryV1[] = [
  {
    key: 'information_request',
    observable_definition:
      'O cliente pede uma informação, preço, condição, característica ou dado verificável sem apresentar resistência comercial sustentada.',
    default_objective: 'answer_factually',
    default_response_mode: 'answer',
    default_move: 'answer_directly',
  },
  {
    key: 'discovery',
    observable_definition:
      'Há lacuna comercial relevante que precisa ser compreendida antes de recomendar ou avançar.',
    default_objective: 'advance_discovery',
    default_response_mode: 'ask',
    default_move: 'advance_discovery',
  },
  {
    key: 'objection',
    observable_definition:
      'Existe barreira explícita ou memória ativa de resistência que bloqueia o avanço; pergunta isolada não é objeção.',
    default_objective: 'address_objection',
    default_response_mode: 'clarify',
    default_move: 'isolate_objection',
  },
  {
    key: 'uncertainty',
    observable_definition:
      'O cliente explicita dúvida decisória, insegurança ou falta de certeza sem recusar a continuidade.',
    default_objective: 'reduce_uncertainty',
    default_response_mode: 'clarify',
    default_move: 'reduce_decision_risk',
  },
  {
    key: 'comparison',
    observable_definition:
      'O cliente compara alternativas, concorrentes ou opções e precisa decidir por critérios comerciais observáveis.',
    default_objective: 'confirm_decision_criteria',
    default_response_mode: 'clarify',
    default_move: 'compare_on_criteria',
  },
  {
    key: 'follow_up',
    observable_definition:
      'Existe continuidade comercial pendente depois de uma interação anterior, sem nova barreira explícita.',
    default_objective: 'secure_next_step',
    default_response_mode: 'advance',
    default_move: 'propose_next_step',
  },
  {
    key: 'commitment_pending',
    observable_definition:
      'Há compromisso proposto ou assumido que ainda precisa ser confirmado, executado ou reagendado.',
    default_objective: 'confirm_commitment',
    default_response_mode: 'confirm',
    default_move: 'confirm_commitment',
  },
  {
    key: 'postponement',
    observable_definition:
      'O cliente desloca explicitamente a continuidade para outro momento sem encerrar a oportunidade.',
    default_objective: 'respect_timing',
    default_response_mode: 'wait',
    default_move: 'respect_customer_timing',
  },
  {
    key: 'rejection',
    observable_definition:
      'O cliente recusa explicitamente a oferta, a continuidade ou novas abordagens.',
    default_objective: 'stop_pursuit',
    default_response_mode: 'stop',
    default_move: 'close_conversation',
  },
  {
    key: 'recovery',
    observable_definition:
      'O processo comercial precisa ser retomado ou corrigido após quebra, desvio de método, compromisso perdido ou estagnação.',
    default_objective: 'recover_process',
    default_response_mode: 'advance',
    default_move: 'recover_stalled_process',
  },
  {
    key: 'decision_pending',
    observable_definition:
      'O cliente ainda está decidindo e não estabeleceu rejeição nem adiamento claro.',
    default_objective: 'reduce_decision_risk',
    default_response_mode: 'give_space',
    default_move: 'give_customer_space',
  },
  {
    key: 'closing',
    observable_definition:
      'O cliente manifesta intenção de avançar, contratar, comprar ou formalizar o próximo passo.',
    default_objective: 'confirm_decision',
    default_response_mode: 'confirm',
    default_move: 'confirm_commitment',
  },
  {
    key: 'non_commercial',
    observable_definition:
      'A interação foi classificada como não comercial e não exige movimento de venda.',
    default_objective: 'no_commercial_action',
    default_response_mode: 'acknowledge',
    default_move: 'no_commercial_move',
  },
  {
    key: 'insufficient_context',
    observable_definition:
      'Não há evidência comercial suficiente para escolher um movimento seguro.',
    default_objective: 'obtain_context',
    default_response_mode: 'clarify',
    default_move: 'request_more_context',
  },
] as const

export function getSituationTaxonomyEntryV1(
  situation: SituationKeyV1,
): SituationTaxonomyEntryV1 {
  const entry =
    SITUATION_TAXONOMY_V1.find(
      item => item.key === situation,
    )

  if (!entry) {
    throw new Error(
      `Situation Taxonomy V1 sem entrada para ${situation}.`,
    )
  }

  return entry
}
