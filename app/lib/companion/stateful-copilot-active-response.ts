import type {
  AISalesContext,
  CompanionAnalyzeSuggestion,
  AnalyzeConversationResponse,
} from '../../types/ai-sales'

import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

type AnalyzeConversationData =
  NonNullable<
    AnalyzeConversationResponse[
      'data'
    ]
  >

export type BuildStatefulActiveResponseDataArgs = {
  context:
    AISalesContext

  output:
    StatefulCopilotOutput
}

export function buildStatefulActiveResponseData({
  context,
  output,
}: BuildStatefulActiveResponseDataArgs): AnalyzeConversationData {
  const crm =
    output
      .operational_suggestions
      .crm

  const agenda =
    output
      .operational_suggestions
      .agenda

  const recommendedStatus =
    crm
      .should_change_crm_stage &&
    crm.recommended_status
      ? crm.recommended_status
      : context.current_status

  const rationale =
    crm.rationale ??
    output
      .strategy
      .rationale

  const shouldCloseWon =
    crm
      .should_change_crm_stage &&
    recommendedStatus ===
      'ganho'

  const shouldCloseLost =
    crm
      .should_change_crm_stage &&
    recommendedStatus ===
      'perdido'

  const suggestion:
    CompanionAnalyzeSuggestion = {
      recommended_status:
        recommendedStatus,

      confidence:
        null,

      action_channel:
        null,

      action_result:
        null,

      result_detail:
        null,

      next_action:
        agenda
          .should_change_agenda
          ? output
              .strategy
              .next_move
          : context
              .current_next_action ??
            null,

      next_action_date:
        agenda
          .should_change_agenda
          ? agenda
              .expected_next_action_at
          : context
              .current_next_action_date ??
            null,

      summary:
        output
          .interpretation
          .current_moment
          .summary,

      tags:
        [],

      should_close_won:
        shouldCloseWon,

      should_close_lost:
        shouldCloseLost,

      close_reason:
        shouldCloseWon ||
        shouldCloseLost
          ? rationale
          : null,

      reason_for_recommendation:
        rationale,

      source:
        'yolen',
    }

  return {
    engine_source:
      'stateful',

    context,

    suggestion,

    coaching: {
      recommended_next_approach:
        output
          .strategy
          .next_move,

      suggested_message:
        output
          .strategy
          .suggested_message,
    },
  }
}
