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

import {
  emptyFactProvenanceReport,
  gateCustomerFacingText,
  sanitizeDerivedText,
  type FactEvidenceRegistry,
} from '@/app/lib/companion/commercial-fact-grounding'

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
    grounded_content?: string
  }>
  customer_roles: SellerFacingCommercialRole[]
  message: {
    ready_to_send: string | null
    editable: true
  }
  // Tempo como evidência comercial, em linguagem do vendedor.
  momentum: {
    state: string
    label: string
    requalify_before_continuing: boolean
    facts: string[]
  } | null
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

// Última barreira antes do vendedor: nenhuma frase do AGORA afirma fato
// específico (relação, objeção, preferência, valor, benefício) sem fonte
// primária/oficial válida. Inferência sem fato específico passa.
function groundProjection(
  projection: SellerFacingReasoningProjection,
  registry: FactEvidenceRegistry | null,
): SellerFacingReasoningProjection {
  if (!registry) {
    return projection
  }

  const text = (value: string | null) =>
    sanitizeDerivedText(value, registry).text

  const report =
    emptyFactProvenanceReport()

  return {
    ...projection,
    what_is_happening:
      text(projection.what_is_happening),
    why_now:
      text(projection.why_now),
    next_best_action:
      text(projection.next_best_action),
    technique:
      projection.technique
        ? {
            ...projection.technique,
            why_applicable:
              text(projection.technique.why_applicable) ?? '',
          }
        : null,
    message: {
      ...projection.message,
      ready_to_send:
        gateCustomerFacingText(
          projection.message.ready_to_send,
          'message.ready_to_send',
          registry,
          report,
        ),
    },
    momentum:
      projection.momentum
        ? {
            ...projection.momentum,
            facts:
              projection.momentum.facts
                .map((fact) => text(fact))
                .filter((fact): fact is string => Boolean(fact)),
          }
        : null,
  }
}

export function buildSellerFacingReasoningProjection({
  reasoning,
  reading,
  state,
  fallback_action = null,
  fact_registry = null,
}: {
  reasoning: CommercialReasoning | null
  reading: CanonicalCommercialReadingSource | null
  state: StatefulCommercialState | null
  fallback_action?: string | null
  fact_registry?: FactEvidenceRegistry | null
}): SellerFacingReasoningProjection {
  return groundProjection(
    buildUngroundedProjection({
      reasoning,
      reading,
      state,
      fallback_action,
    }),
    fact_registry,
  )
}

function buildUngroundedProjection({
  reasoning,
  reading,
  state,
  fallback_action,
}: {
  reasoning: CommercialReasoning | null
  reading: CanonicalCommercialReadingSource | null
  state: StatefulCommercialState | null
  fallback_action: string | null
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
      momentum: null,
      limitations: [
        'commercial_reasoning_unavailable',
      ],
    }
  }

  const selectedTechnique =
    reasoning.selected_techniques[0]

  const temporal =
    reasoning.temporal_context ??
    null

  // A mensagem sugerida pela leitura persistida foi escrita para o momento
  // da análise. Se o tempo exige reativação, recuperação de atraso ou
  // encerramento, ela descreve uma conversa que não existe mais.
  const timeRequiresNewMove =
    temporal !== null &&
    [
      'reactivate',
      'light_follow_up',
      'recover_delay',
      'respect_closure',
    ].includes(
      temporal.reactivation.mode,
    )

  const readyMessage =
    reasoning.status === 'silent' ||
    timeRequiresNewMove ||
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
      reasoning.status === 'silent'
        ? fallback_action
        : reasoning.objective_now ||
          fallback_action,
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
          grounded_content:
            item.grounded_content,
        })),
    customer_roles:
      buildCustomerRoles(state),
    message: {
      ready_to_send:
        readyMessage,
      editable: true,
    },
    momentum:
      temporal &&
      reasoning.status !== 'silent'
        ? {
            state:
              temporal.momentum.state,
            label:
              temporal.narrative
                .momentum_label,
            requalify_before_continuing:
              temporal.reactivation
                .requalify_before_continuing,
            facts:
              temporal.narrative.facts
                .slice(0, 3),
          }
        : null,
    limitations: [
      ...reasoning.limitations,
    ],
  }
}
