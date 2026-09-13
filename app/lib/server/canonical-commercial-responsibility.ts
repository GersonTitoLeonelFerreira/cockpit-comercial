import 'server-only'

import type {
  CompanionClientContext,
} from '@/app/lib/companion/companion-client-context-contract'

import type {
  CommercialReasoning,
} from '@/app/lib/companion/commercial-reasoning-contract'

import {
  DECISION_STATE_SESSION_GAP_MS,
  loadCanonicalDecisionState,
  type DecisionState,
} from './canonical-decision-state-source'

const WAIT_OVERRIDE_DECISIONS = new Set([
  'ask',
  'clarify',
  'confirm_information',
  'present_solution',
  'compare',
  'demonstrate_value',
  'send_material',
  'propose_call',
  'propose_meeting',
  'propose_visit',
  'negotiate',
  'ask_for_decision',
  'close',
  'follow_up',
  'set_commitment',
  'deepen_discovery',
  'insufficient_information',
])

function isActiveSellerWaitingMoment({
  clientContext,
  referenceTime,
}: {
  clientContext: CompanionClientContext | null
  referenceTime: string
}): boolean {
  if (
    !clientContext ||
    clientContext.waiting.state !==
      'seller_waiting_for_customer'
  ) {
    return false
  }

  const referenceInstant =
    Date.parse(referenceTime)

  const lastInteractionInstant =
    clientContext.relationship.last_interaction_at
      ? Date.parse(
          clientContext.relationship.last_interaction_at,
        )
      : Number.NaN

  if (
    !Number.isFinite(referenceInstant) ||
    !Number.isFinite(lastInteractionInstant)
  ) {
    return false
  }

  return (
    referenceInstant - lastInteractionInstant <=
    DECISION_STATE_SESSION_GAP_MS
  )
}

export function reconcileDecisionStateWithCommercialResponsibility({
  decisionState,
  clientContext,
}: {
  decisionState: DecisionState | null
  clientContext: CompanionClientContext | null
}): DecisionState | null {
  if (
    !decisionState ||
    !isActiveSellerWaitingMoment({
      clientContext,
      referenceTime:
        decisionState.reference_time,
    }) ||
    !WAIT_OVERRIDE_DECISIONS.has(
      decisionState.primary_decision.kind,
    )
  ) {
    return decisionState
  }

  const waitingSince =
    clientContext?.waiting.waiting_since ??
    null

  return {
    ...decisionState,
    primary_decision: {
      kind: 'wait',
      source: null,
      priority: null,
      silent: false,
      summary:
        'Aguardando resposta do cliente.',
      reason:
        'O vendedor já realizou a ação necessária nesta interação e a próxima resposta depende do cliente.',
      recommended_action:
        'Aguardar a resposta do cliente; não repetir a pergunta ou ação já realizada.',
      evidence_message_ids:
        decisionState.primary_decision
          .evidence_message_ids,
      memory_ids:
        decisionState.primary_decision
          .memory_ids,
    },
    interventions:
      decisionState.interventions.filter(
        intervention =>
          !WAIT_OVERRIDE_DECISIONS.has(
            intervention.kind,
          ),
      ),
    provenance: {
      ...decisionState.provenance,
      agora_updated_at:
        decisionState.provenance.agora_updated_at ??
        waitingSince,
    },
  }
}

export function reconcileReasoningWithCommercialResponsibility({
  reasoning,
  clientContext,
  referenceTime,
}: {
  reasoning: CommercialReasoning | null
  clientContext: CompanionClientContext | null
  referenceTime: string
}): CommercialReasoning | null {
  if (
    !reasoning ||
    !isActiveSellerWaitingMoment({
      clientContext,
      referenceTime,
    }) ||
    !WAIT_OVERRIDE_DECISIONS.has(
      reasoning.decision,
    )
  ) {
    return reasoning
  }

  return {
    ...reasoning,
    decision: 'wait',
    decision_reason:
      'O vendedor já fez a pergunta ou ação necessária e agora aguarda a resposta do cliente.',
    objective_now:
      'Aguardar a resposta do cliente sem repetir a pergunta ou forçar novo avanço.',
    do_not_do: Array.from(
      new Set([
        'Não repetir a pergunta ou ação que o vendedor já realizou nesta interação.',
        ...reasoning.do_not_do,
      ]),
    ),
  }
}

export async function loadCanonicalDecisionStateWithResponsibility(
  args: Parameters<
    typeof loadCanonicalDecisionState
  >[0],
): Promise<DecisionState | null> {
  const decisionState =
    await loadCanonicalDecisionState(args)

  return reconcileDecisionStateWithCommercialResponsibility({
    decisionState,
    clientContext:
      args.client_context,
  })
}
