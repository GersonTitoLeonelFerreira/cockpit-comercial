import type {
  CommercialReasoning,
} from '@/app/lib/companion/commercial-reasoning-contract'

import {
  parseCommercialPartyFactKind,
} from '@/app/lib/companion/commercial-truth'

import type {
  StatefulCommercialState,
} from '@/app/lib/companion/stateful-commercial-state'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

export type SellerFacingCommercialRole = {
  scope: 'current_contact' | 'related'
  role:
    | 'prospect'
    | 'intermediary'
    | 'decision_maker'
    | 'influencer'
    | 'user'
    | 'beneficiary'
  label: string | null
  evidence_message_ids: string[]
}

export type SellerFacingReasoningProjection = {
  status: 'ready' | 'limited' | 'silent' | 'unavailable'
  decision: string | null
  what_is_happening: string | null
  why_now: string | null
  next_best_action: string | null
  technique: {
    id: string
    title: string
    why_applicable: string
    risks: string[]
  } | null
  do_not_do: string[]
  company_knowledge: Array<{
    title: string
    source_type: string
    why_relevant: string
  }>
  customer_roles: SellerFacingCommercialRole[]
  message: {
    ready_to_send: string | null
    editable: true
  }
  limitations: string[]
}

function roleLabel(
  role: SellerFacingCommercialRole['role'],
): string {
  switch (role) {
    case 'prospect':
      return 'Prospect'
    case 'intermediary':
      return 'Intermediário'
    case 'decision_maker':
      return 'Decisor'
    case 'influencer':
      return 'Influenciador'
    case 'user':
      return 'Usuário'
    case 'beneficiary':
      return 'Beneficiário'
  }
}

function buildCustomerRoles(
  state: StatefulCommercialState | null,
): SellerFacingCommercialRole[] {
  if (!state) {
    return []
  }

  const roles: SellerFacingCommercialRole[] = []

  for (const fact of state.facts) {
    if (fact.memory_status !== 'active') {
      continue
    }

    const descriptor =
      parseCommercialPartyFactKind(
        fact.kind,
      )

    if (!descriptor) {
      continue
    }

    roles.push({
      scope:
        descriptor.scope,
      role:
        descriptor.role,
      label:
        fact.value?.trim() ||
        roleLabel(descriptor.role),
      evidence_message_ids: [
        ...fact.evidence_message_ids,
      ],
    })
  }

  return roles
}

export function buildSellerFacingReasoningProjection({
  reasoning,
  reading,
  state,
  fallback_action = null,
}: {
  reasoning: CommercialReasoning | null
  reading: CanonicalCommercialReadingSource | null
  state: StatefulCommercialState | null
  fallback_action?: string | null
}): SellerFacingReasoningProjection {
  if (!reasoning) {
    return {
      status: 'unavailable',
      decision: null,
      what_is_happening: null,
      why_now: null,
      next_best_action: fallback_action,
      technique: null,
      do_not_do: [],
      company_knowledge: [],
      customer_roles:
        buildCustomerRoles(state),
      message: {
        ready_to_send: null,
        editable: true,
      },
      limitations: [
        'commercial_reasoning_unavailable',
      ],
    }
  }

  const selectedTechnique =
    reasoning.selected_techniques[0]

  const readyMessage =
    reasoning.status === 'silent' ||
    !reading?.reading.communication
      .intervention_needed
      ? null
      : reading.reading.communication
          .recommended_message

  return {
    status:
      reasoning.status,
    decision:
      reasoning.decision,
    what_is_happening:
      reasoning.current_situation,
    why_now:
      reasoning.decision_reason,
    next_best_action:
      fallback_action ||
      reasoning.objective_now,
    technique:
      selectedTechnique
        ? {
            id:
              selectedTechnique
                .intelligence_id,
            title:
              selectedTechnique.title,
            why_applicable:
              selectedTechnique
                .why_applicable,
            risks: [
              ...selectedTechnique.risks,
            ],
          }
        : null,
    do_not_do: [
      ...reasoning.do_not_do,
    ],
    company_knowledge:
      reasoning.company_knowledge_used
        .map((item) => ({
          title:
            item.title,
          source_type:
            item.source_type,
          why_relevant:
            item.why_relevant,
        })),
    customer_roles:
      buildCustomerRoles(state),
    message: {
      ready_to_send:
        readyMessage,
      editable: true,
    },
    limitations: [
      ...reasoning.limitations,
    ],
  }
}
