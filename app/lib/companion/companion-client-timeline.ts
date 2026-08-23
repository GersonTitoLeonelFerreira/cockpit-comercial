import {
  getSalesCycleLabel,
} from '../sales-cycle-status'

import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

import type {
  CompanionClientTimelineEvent,
  CompanionClientTimelineEventKind,
} from './companion-client-context-contract'

// Traduz eventos técnicos já registrados (cycle_events, telemetria de ações
// da Yolen, primeira mensagem conhecida) em uma linha do tempo com
// significado operacional. Nenhum evento fora da lista permitida entra na
// timeline — isso evita despejar dezenas de eventos técnicos irrelevantes.

export const COMPANION_CLIENT_TIMELINE_DEFAULT_LIMIT =
  20

const ACTION_EVENT_LABELS: Record<
  string,
  string
> = {
  suggestion_shown:
    'Sugestão da Yolen exibida',

  suggestion_copied:
    'Sugestão copiada',

  suggestion_inserted:
    'Sugestão inserida na mensagem',

  suggestion_ignored:
    'Sugestão ignorada',

  suggestion_edited:
    'Sugestão editada antes de enviar',

  suggestion_sent:
    'Mensagem enviada',

  crm_accepted:
    'Atualização de CRM confirmada',

  crm_rejected:
    'Atualização de CRM recusada',

  agenda_accepted:
    'Atualização de Agenda confirmada',

  agenda_rejected:
    'Atualização de Agenda recusada',
}

const ACTION_EVENT_KINDS =
  new Set(
    Object.keys(
      ACTION_EVENT_LABELS,
    ),
  )

export type CompanionClientActionEventFact = {
  action_type:
    string

  occurred_at:
    string
}

export type CompanionClientCycleEventFact = {
  event_type:
    string

  occurred_at:
    string

  from_status?:
    string | null

  to_status?:
    string | null
}

function isRecognizedLeadStatus(
  value: unknown,
): value is LeadStatus {
  return (
    value === 'novo' ||
    value === 'contato' ||
    value === 'respondeu' ||
    value === 'negociacao' ||
    value === 'pausado' ||
    value === 'cancelado' ||
    value === 'ganho' ||
    value === 'perdido'
  )
}

function translateCycleEvent(
  event:
    CompanionClientCycleEventFact,
): CompanionClientTimelineEvent | null {
  if (
    event.event_type ===
    'stage_changed'
  ) {
    const from =
      isRecognizedLeadStatus(
        event.from_status,
      )
        ? getSalesCycleLabel(
            event.from_status,
          )
        : null

    const to =
      isRecognizedLeadStatus(
        event.to_status,
      )
        ? getSalesCycleLabel(
            event.to_status,
          )
        : null

    if (
      event.to_status ===
      'ganho'
    ) {
      return {
        kind:
          'closed_won',

        occurred_at:
          event.occurred_at,

        label:
          'Oportunidade ganha',

        detail:
          null,
      }
    }

    if (
      event.to_status ===
      'perdido'
    ) {
      return {
        kind:
          'closed_lost',

        occurred_at:
          event.occurred_at,

        label:
          'Oportunidade perdida',

        detail:
          null,
      }
    }

    return {
      kind:
        'stage_changed',

      occurred_at:
        event.occurred_at,

      label:
        'Etapa alterada',

      detail:
        from && to
          ? `${from} → ${to}`
          : null,
    }
  }

  if (
    event.event_type ===
    'next_action_set'
  ) {
    return {
      kind:
        'next_action_set',

      occurred_at:
        event.occurred_at,

      label:
        'Próxima ação definida',

      detail:
        null,
    }
  }

  if (
    event.event_type ===
    'ai_suggestion_applied'
  ) {
    return {
      kind:
        'ai_suggestion_applied',

      occurred_at:
        event.occurred_at,

      label:
        'Sugestão da Yolen aplicada',

      detail:
        null,
    }
  }

  if (
    event.event_type ===
    'closed_won'
  ) {
    return {
      kind:
        'closed_won',

      occurred_at:
        event.occurred_at,

      label:
        'Oportunidade ganha',

      detail:
        null,
    }
  }

  if (
    event.event_type ===
    'closed_lost'
  ) {
    return {
      kind:
        'closed_lost',

      occurred_at:
        event.occurred_at,

      label:
        'Oportunidade perdida',

      detail:
        null,
    }
  }

  if (
    event.event_type ===
    'conversation_registered'
  ) {
    return {
      kind:
        'conversation_registered',

      occurred_at:
        event.occurred_at,

      label:
        'Conversa registrada no histórico',

      detail:
        null,
    }
  }

  return null
}

function translateActionEvent(
  event:
    CompanionClientActionEventFact,
): CompanionClientTimelineEvent | null {
  if (
    !ACTION_EVENT_KINDS.has(
      event.action_type,
    )
  ) {
    return null
  }

  return {
    kind:
      event.action_type as
        CompanionClientTimelineEventKind,

    occurred_at:
      event.occurred_at,

    label:
      ACTION_EVENT_LABELS[
        event.action_type
      ],

    detail:
      null,
  }
}

export function buildCompanionClientTimeline({
  first_known_interaction_at,
  cycle_events,
  action_events,
  limit =
    COMPANION_CLIENT_TIMELINE_DEFAULT_LIMIT,
}: {
  first_known_interaction_at:
    string | null

  cycle_events:
    readonly CompanionClientCycleEventFact[]

  action_events:
    readonly CompanionClientActionEventFact[]

  limit?:
    number
}): CompanionClientTimelineEvent[] {
  const events:
    CompanionClientTimelineEvent[] =
      []

  if (
    first_known_interaction_at
  ) {
    events.push({
      kind:
        'first_contact',

      occurred_at:
        first_known_interaction_at,

      label:
        'Primeiro contato conhecido',

      detail:
        null,
    })
  }

  for (
    const event of cycle_events
  ) {
    const translated =
      translateCycleEvent(
        event,
      )

    if (translated) {
      events.push(
        translated,
      )
    }
  }

  for (
    const event of action_events
  ) {
    const translated =
      translateActionEvent(
        event,
      )

    if (translated) {
      events.push(
        translated,
      )
    }
  }

  const validTimestamp = (
    value: string,
  ) =>
    Number.isFinite(
      Date.parse(value),
    )

  const ordered =
    events
      .filter(
        (event) =>
          validTimestamp(
            event.occurred_at,
          ),
      )
      .sort(
        (left, right) =>
          Date.parse(
            right.occurred_at,
          ) -
          Date.parse(
            left.occurred_at,
          ),
      )

  return ordered.slice(
    0,
    Math.max(
      0,
      limit,
    ),
  )
}
