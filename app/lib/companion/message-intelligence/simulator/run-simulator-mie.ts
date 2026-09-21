// ============================================================================
// MIE V1 — Simulador técnico interno
// Ponte entre a conversa sintética e o runner REAL do Message Intelligence
// Engine V1 (runMessageIntelligenceV1).
//
// Este módulo NÃO recria nenhuma lógica do MIE: ele apenas monta o request
// e o source loader in-memory e chama o runner oficial. Também garante,
// defensivamente, que a execução nunca reporta uma ação automática.
// ============================================================================

import {
  runMessageIntelligenceV1,
} from '../message-intelligence-runner'

import type {
  MessageIntelligenceRunResultV1,
} from '../message-intelligence-runner'

import type {
  FinalMessageStatusV1,
} from '../final-message-contracts'

import type {
  HardGateResultStatusV1,
} from '../hard-gate-contracts'

import type {
  SelectableCriticStatusV1,
} from '../final-message-contracts'

import {
  buildSimulatorRequest,
  buildSimulatorSources,
} from './synthetic-source'

import type {
  SimulatorMessage,
} from './conversation-engine'

import type {
  SimulatorScenarioDefinition,
} from './scenarios'

export class SimulatorUnsafeAutomaticActionError extends Error {
  constructor() {
    super(
      'O MIE retornou uma flag de ação automática ativa. ' +
        'O simulador nunca pode apresentar essa mensagem como utilizável.',
    )

    this.name = 'SimulatorUnsafeAutomaticActionError'
  }
}

export type SimulatorMieSummary = {
  status: FinalMessageStatusV1
  final_message_text: string | null
  would_surface_message: boolean
  hard_gate_status: HardGateResultStatusV1
  candidate_count: number
  hard_gate_pass_count: number
  selected_critic_status: SelectableCriticStatusV1 | null
  selected_overall_score: number | null
}

export function summarizeSimulatorMieResult(
  result: MessageIntelligenceRunResultV1,
): SimulatorMieSummary {
  const shadow = result.shadow_evaluation

  if (
    shadow.automatic_send ||
    shadow.automatic_crm_write ||
    shadow.automatic_agenda_write
  ) {
    throw new SimulatorUnsafeAutomaticActionError()
  }

  return {
    status: result.final_message_result.status,
    final_message_text:
      result.final_message_result.final_message?.text ?? null,
    would_surface_message: shadow.would_surface_message,
    hard_gate_status: result.hard_gate_result.status,
    candidate_count: shadow.candidate_count,
    hard_gate_pass_count: shadow.hard_gate_pass_count,
    selected_critic_status: shadow.selected_critic_status,
    selected_overall_score: shadow.selected_overall_score,
  }
}

export async function runSimulatorMie({
  scenario,
  conversation,
  seller_intent,
  reference_time,
}: {
  scenario: SimulatorScenarioDefinition
  conversation: readonly SimulatorMessage[]
  seller_intent: string
  reference_time: string
}): Promise<SimulatorMieSummary> {
  const request = buildSimulatorRequest({
    scenario,
    seller_intent,
    reference_time,
    request_id: `mie-simulator-${Date.now()}`,
  })

  const result = await runMessageIntelligenceV1({
    request,
    load_sources: async () =>
      buildSimulatorSources({
        scenario,
        conversation,
        reference_time,
      }),
  })

  return summarizeSimulatorMieResult(result)
}
