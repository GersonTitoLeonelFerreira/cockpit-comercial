import 'server-only'

import type {
  CompanionClientContext,
} from '@/app/lib/companion/companion-client-context-contract'

import type {
  CommercialReadingImprovementKind,
} from '@/app/lib/companion/commercial-reading-contract'

import type {
  CommercialReasoning,
} from '@/app/lib/companion/commercial-reasoning-contract'

import {
  DECISION_STATE_SESSION_GAP_MS,
  loadCanonicalDecisionState,
  type DecisionState,
} from './canonical-decision-state-source'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

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

// O client_context calcula "quem escreveu por último" de forma
// determinística. Isso é informação operacional útil, mas não prova por si
// só quem deve a próxima ação comercial. Uma retomada genérica do vendedor
// depois de um pedido ainda aberto, por exemplo, continua deixando a ação
// sob responsabilidade do vendedor. Estes kinds já vêm da Commercial
// Reading canônica e funcionam apenas como hard guard para impedir que o
// sinal operacional apague uma pendência semanticamente comprovada.
const SELLER_STILL_OWES_ACTION_KINDS =
  new Set<CommercialReadingImprovementKind>([
    'unanswered_question',
    'repetition',
    'missing_next_commitment',
    'missed_commitment',
  ])

function readingShowsSellerStillOwesAction(
  currentReading:
    CanonicalCommercialReadingSource | null | undefined,
): boolean {
  const reading =
    currentReading?.reading

  if (!reading) {
    return false
  }

  if (
    reading.customer.open_questions.length > 0
  ) {
    return true
  }

  return reading.improvement_points.some(
    improvement =>
      SELLER_STILL_OWES_ACTION_KINDS.has(
        improvement.kind,
      ),
  )
}

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
  currentReading = null,
}: {
  decisionState: DecisionState | null
  clientContext: CompanionClientContext | null
  currentReading?:
    CanonicalCommercialReadingSource | null
}): DecisionState | null {
  if (
    !decisionState ||
    readingShowsSellerStillOwesAction(
      currentReading,
    ) ||
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
  currentReading = null,
}: {
  reasoning: CommercialReasoning | null
  clientContext: CompanionClientContext | null
  referenceTime: string
  currentReading?:
    CanonicalCommercialReadingSource | null
}): CommercialReasoning | null {
  if (
    !reasoning ||
    readingShowsSellerStillOwesAction(
      currentReading,
    ) ||
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
    currentReading:
      args.current_reading,
  })
}
