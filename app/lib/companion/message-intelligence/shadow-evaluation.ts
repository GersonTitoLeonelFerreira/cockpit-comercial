import {
  SHADOW_EVALUATION_CONTRACT_VERSION,
  type ShadowEvaluationInputV1,
  type ShadowEvaluationV1,
} from './final-message-contracts'

export function createShadowEvaluationV1(
  input: ShadowEvaluationInputV1,
): ShadowEvaluationV1 {
  const selected =
    input.final_message_result.status === 'selected' &&
    input.final_message_result.final_message !== null
      ? input.final_message_result.final_message
      : null

  return {
    contract_version:
      SHADOW_EVALUATION_CONTRACT_VERSION,
    final_status:
      input.final_message_result.status,
    selected_candidate_id:
      input.final_message_result.selected_candidate_id,
    candidate_count:
      input.generation_result.candidates.length,
    hard_gate_pass_count:
      input.hard_gate_result.passed_candidate_ids.length,
    critic_evaluated_count:
      input.critic_result.critiques.length,
    selected_critic_status:
      selected?.critic_status ?? null,
    selected_overall_score:
      selected?.overall_score ?? null,
    would_surface_message:
      input.final_message_result.status === 'selected' &&
      selected !== null,
    automatic_send: false,
    automatic_crm_write: false,
    automatic_agenda_write: false,
  }
}
