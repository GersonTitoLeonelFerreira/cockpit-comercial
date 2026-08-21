import {
  TERMINAL_SALES_CYCLE_STATUSES,
} from '../sales-cycle-status'

import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

import type {
  CompanionClientRelationship,
  CompanionClientWaiting,
} from './companion-client-context-contract'

// Cálculo determinístico: nenhum campo aqui é inferido pela IA. Tudo vem de
// timestamps reais de mensagens já capturadas (banco prova o tempo).

export type CompanionClientMessageDirection =
  'incoming' | 'outgoing'

export type CompanionClientMessageFact = {
  direction:
    CompanionClientMessageDirection

  occurred_at:
    string
}

function parseTimestamp(
  value: string,
): number {
  const parsed =
    Date.parse(value)

  return Number.isFinite(parsed)
    ? parsed
    : NaN
}

function sortMessagesByTime(
  messages:
    readonly CompanionClientMessageFact[],
): CompanionClientMessageFact[] {
  return [...messages]
    .filter(
      (message) =>
        Number.isFinite(
          parseTimestamp(
            message.occurred_at,
          ),
        ),
    )
    .sort(
      (left, right) =>
        parseTimestamp(
          left.occurred_at,
        ) -
        parseTimestamp(
          right.occurred_at,
        ),
    )
}

export function computeCompanionClientRelationship({
  messages,
  reference_time,
}: {
  messages:
    readonly CompanionClientMessageFact[]

  reference_time:
    string
}): CompanionClientRelationship {
  const ordered =
    sortMessagesByTime(
      messages,
    )

  const referenceTimestamp =
    parseTimestamp(
      reference_time,
    )

  if (
    ordered.length === 0 ||
    !Number.isFinite(
      referenceTimestamp,
    )
  ) {
    return {
      first_known_interaction_at:
        null,

      relationship_age_ms:
        null,

      latest_customer_message_at:
        null,

      latest_seller_message_at:
        null,

      last_interaction_at:
        null,

      known_interaction_count:
        0,
    }
  }

  const first =
    ordered[0]

  const last =
    ordered[
      ordered.length - 1
    ]

  let latestCustomerMessageAt:
    string | null =
      null

  let latestSellerMessageAt:
    string | null =
      null

  for (
    const message of ordered
  ) {
    if (
      message.direction ===
      'incoming'
    ) {
      latestCustomerMessageAt =
        message.occurred_at
    } else {
      latestSellerMessageAt =
        message.occurred_at
    }
  }

  return {
    first_known_interaction_at:
      first.occurred_at,

    relationship_age_ms:
      Math.max(
        0,
        referenceTimestamp -
          parseTimestamp(
            first.occurred_at,
          ),
      ),

    latest_customer_message_at:
      latestCustomerMessageAt,

    latest_seller_message_at:
      latestSellerMessageAt,

    last_interaction_at:
      last.occurred_at,

    known_interaction_count:
      ordered.length,
  }
}

export function computeCompanionClientWaiting({
  messages,
  reference_time,
  cycle_status,
}: {
  messages:
    readonly CompanionClientMessageFact[]

  reference_time:
    string

  cycle_status:
    LeadStatus
}): CompanionClientWaiting {
  const referenceTimestamp =
    parseTimestamp(
      reference_time,
    )

  if (
    !Number.isFinite(
      referenceTimestamp,
    )
  ) {
    return {
      state:
        'unknown',

      waiting_since:
        null,

      waiting_duration_ms:
        null,
    }
  }

  // Um ciclo fechado (ganho/perdido/cancelado) é um fato determinístico do
  // CRM — não faz sentido dizer que alguém "está aguardando" uma
  // oportunidade encerrada, independentemente de quem mandou a última
  // mensagem.
  if (
    TERMINAL_SALES_CYCLE_STATUSES.includes(
      cycle_status,
    )
  ) {
    return {
      state:
        'no_pending_response',

      waiting_since:
        null,

      waiting_duration_ms:
        null,
    }
  }

  const ordered =
    sortMessagesByTime(
      messages,
    )

  if (
    ordered.length === 0
  ) {
    return {
      state:
        'unknown',

      waiting_since:
        null,

      waiting_duration_ms:
        null,
    }
  }

  const last =
    ordered[
      ordered.length - 1
    ]

  const state:
    'customer_waiting_for_seller' | 'seller_waiting_for_customer' =
    last.direction ===
    'incoming'
      ? 'customer_waiting_for_seller'
      : 'seller_waiting_for_customer'

  return {
    state,

    waiting_since:
      last.occurred_at,

    waiting_duration_ms:
      Math.max(
        0,
        referenceTimestamp -
          parseTimestamp(
            last.occurred_at,
          ),
      ),
  }
}
