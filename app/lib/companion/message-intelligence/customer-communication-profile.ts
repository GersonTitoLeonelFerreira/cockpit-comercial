import type {
  MessageContextMemoryItemV1,
  MessageContextSnapshotMessageV1,
  MessageContextSnapshotV1,
} from './context-snapshot'

import {
  stableUniqueStrings,
  type SourceTraceV1,
} from './source-trace'

export const CUSTOMER_COMMUNICATION_PROFILE_CONTRACT_VERSION =
  'customer-communication-profile-v1' as const

export const CUSTOMER_COMMUNICATION_RECENT_WINDOW_MS =
  14 * 24 * 60 * 60 * 1000

export const CUSTOMER_COMMUNICATION_RECENT_MESSAGE_LIMIT =
  40

export const CUSTOMER_COMMUNICATION_MIN_PATTERN_OBSERVATIONS =
  2

export const CUSTOMER_COMMUNICATION_CURRENT_INTERACTION_WEIGHT =
  2

export type CommunicationEvidenceConfidenceV1 =
  | 'low'
  | 'medium'
  | 'high'

export const CUSTOMER_COMMUNICATION_SIGNAL_KINDS = [
  'short_responses',
  'direct_questions',
  'long_messages',
  'frequent_audio',
  'emoji_sparse',
  'emoji_frequent',
  'prefers_short_explanations',
  'requests_data_or_numbers',
  'negative_reaction_to_pressure',
  'responds_to_clear_alternatives',
  'other_observed_behavior',
] as const

export type CustomerCommunicationSignalKindV1 =
  (typeof CUSTOMER_COMMUNICATION_SIGNAL_KINDS)[number]

export type CustomerCommunicationSignalV1 = {
  signal:
    CustomerCommunicationSignalKindV1

  observation_count: number
  eligible_message_count: number
  weighted_observation_score: number
  confidence:
    CommunicationEvidenceConfidenceV1

  current_interaction_count: number
  recent_conversation_count: number
  durable_observation_count: number

  evidence_message_ids: string[]
  provenance: SourceTraceV1[]
}

export type CustomerCommunicationProfileV1 = {
  contract_version:
    typeof CUSTOMER_COMMUNICATION_PROFILE_CONTRACT_VERSION

  status:
    | 'absent'
    | 'partial'
    | 'established'

  recent_window: {
    window_ms: number
    message_limit: number
    incoming_message_count: number
    current_interaction_incoming_count: number
  }

  signals:
    CustomerCommunicationSignalV1[]
}

type MessageSignalCandidate = {
  signal:
    CustomerCommunicationSignalKindV1
  matches:
    MessageContextSnapshotMessageV1[]
  eligible:
    MessageContextSnapshotMessageV1[]
  thresholdRatio: number
}

const DURABLE_BEHAVIOR_SIGNALS =
  new Set<CustomerCommunicationSignalKindV1>([
    'short_responses',
    'direct_questions',
    'frequent_audio',
    'prefers_short_explanations',
    'requests_data_or_numbers',
    'negative_reaction_to_pressure',
    'responds_to_clear_alternatives',
    'other_observed_behavior',
  ])

function wordCount(
  value: string | null,
): number {
  if (!value) {
    return 0
  }

  return value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .length
}

function hasEmoji(
  value: string | null,
): boolean {
  return Boolean(
    value &&
    /\p{Extended_Pictographic}/u.test(
      value,
    ),
  )
}

function uniqueTraces(
  traces: readonly SourceTraceV1[],
): SourceTraceV1[] {
  const seen = new Set<string>()
  const result: SourceTraceV1[] = []

  for (const trace of traces) {
    const key = JSON.stringify({
      source_type:
        trace.source_type,
      source_id:
        trace.source_id,
      source_version:
        trace.source_version,
      observed_at:
        trace.observed_at,
      source_cycle_id:
        trace.source_cycle_id ?? null,
      inheritance:
        trace.inheritance ?? null,
      evidence_message_ids:
        stableUniqueStrings(
          trace.evidence_message_ids ?? [],
        ),
      evidence_memory_ids:
        stableUniqueStrings(
          trace.evidence_memory_ids ?? [],
        ),
    })

    if (!seen.has(key)) {
      seen.add(key)
      result.push(trace)
    }
  }

  return result.sort((left, right) => {
    const type =
      left.source_type.localeCompare(
        right.source_type,
      )

    if (type !== 0) {
      return type
    }

    return (
      left.source_id ?? ''
    ).localeCompare(
      right.source_id ?? '',
      'en',
      {
        numeric: true,
      },
    )
  })
}

function messageTimestamp(
  message:
    MessageContextSnapshotMessageV1,
): number {
  const timestamp =
    Date.parse(
      message.occurred_at,
    )

  return Number.isFinite(timestamp)
    ? timestamp
    : Number.NEGATIVE_INFINITY
}

function selectRecentIncomingMessages(
  snapshot: MessageContextSnapshotV1,
): MessageContextSnapshotMessageV1[] {
  const reference =
    Date.parse(
      snapshot.reference_time,
    )

  const excluded =
    new Set(
      snapshot.conversation
        .excluded_messages
        .map(
          message =>
            message.message_id,
        ),
    )

  const lowerBound =
    Number.isFinite(reference)
      ? reference -
        CUSTOMER_COMMUNICATION_RECENT_WINDOW_MS
      : Number.NEGATIVE_INFINITY

  const upperBound =
    Number.isFinite(reference)
      ? reference + 5 * 60 * 1000
      : Number.POSITIVE_INFINITY

  return snapshot.conversation.messages
    .filter(
      message =>
        message.direction ===
          'incoming' &&
        !excluded.has(
          message.message_id,
        ) &&
        messageTimestamp(message) >=
          lowerBound &&
        messageTimestamp(message) <=
          upperBound,
    )
    .sort((left, right) => {
      const time =
        messageTimestamp(left) -
        messageTimestamp(right)

      if (time !== 0) {
        return time
      }

      return (
        left.sequence -
        right.sequence
      )
    })
    .slice(
      -CUSTOMER_COMMUNICATION_RECENT_MESSAGE_LIMIT,
    )
}

function currentIncomingIds(
  snapshot: MessageContextSnapshotV1,
): Set<string> {
  return new Set(
    snapshot.conversation
      .current_interaction
      ?.messages
      .filter(
        message =>
          message.direction ===
          'incoming',
      )
      .map(
        message =>
          message.message_id,
      ) ?? [],
  )
}

function confidenceForScore(
  score: number,
): CommunicationEvidenceConfidenceV1 {
  if (score >= 7) {
    return 'high'
  }

  if (score >= 3) {
    return 'medium'
  }

  return 'low'
}

function buildMessageSignal(
  candidate: MessageSignalCandidate,
  currentIds: Set<string>,
): CustomerCommunicationSignalV1 | null {
  const eligibleCount =
    candidate.eligible.length

  if (eligibleCount === 0) {
    return null
  }

  const ratio =
    candidate.matches.length /
    eligibleCount

  const currentMatches =
    candidate.matches.filter(
      message =>
        currentIds.has(
          message.message_id,
        ),
    )

  const currentEligible =
    candidate.eligible.filter(
      message =>
        currentIds.has(
          message.message_id,
        ),
    )

  const currentRatio =
    currentEligible.length > 0
      ? currentMatches.length /
        currentEligible.length
      : 0

  const recentQualified =
    candidate.matches.length >=
      CUSTOMER_COMMUNICATION_MIN_PATTERN_OBSERVATIONS &&
    ratio >= candidate.thresholdRatio

  const currentQualified =
    currentMatches.length >=
      CUSTOMER_COMMUNICATION_MIN_PATTERN_OBSERVATIONS &&
    currentRatio >=
      candidate.thresholdRatio

  if (
    !recentQualified &&
    !currentQualified
  ) {
    return null
  }

  const evidence =
    stableUniqueStrings(
      candidate.matches.map(
        message =>
          message.message_id,
      ),
    )

  const score =
    candidate.matches.length +
    currentMatches.length *
      (
        CUSTOMER_COMMUNICATION_CURRENT_INTERACTION_WEIGHT -
        1
      )

  return {
    signal:
      candidate.signal,
    observation_count:
      evidence.length,
    eligible_message_count:
      eligibleCount,
    weighted_observation_score:
      score,
    confidence:
      confidenceForScore(score),
    current_interaction_count:
      currentMatches.length,
    recent_conversation_count:
      candidate.matches.length,
    durable_observation_count: 0,
    evidence_message_ids:
      evidence,
    provenance:
      uniqueTraces(
        candidate.matches.flatMap(
          message =>
            message.provenance,
        ),
      ),
  }
}

function durableSignalKind(
  observation:
    MessageContextMemoryItemV1,
): CustomerCommunicationSignalKindV1 | null {
  if (
    observation.memory_status !==
      'active' ||
    !observation.kind.startsWith(
      'client.communication.',
    ) ||
    typeof observation.value !==
      'string' ||
    !DURABLE_BEHAVIOR_SIGNALS.has(
      observation.value as
        CustomerCommunicationSignalKindV1,
    )
  ) {
    return null
  }

  return observation.value as
    CustomerCommunicationSignalKindV1
}

function mergeDurableObservations(
  signals:
    CustomerCommunicationSignalV1[],
  observations:
    readonly MessageContextMemoryItemV1[],
): CustomerCommunicationSignalV1[] {
  const bySignal =
    new Map<
      CustomerCommunicationSignalKindV1,
      CustomerCommunicationSignalV1
    >(
      signals.map(
        signal => [
          signal.signal,
          signal,
        ] as const,
      ),
    )

  const durableGroups =
    new Map<
      CustomerCommunicationSignalKindV1,
      MessageContextMemoryItemV1[]
    >()

  for (const observation of observations) {
    const signal =
      durableSignalKind(observation)

    if (!signal) {
      continue
    }

    const group =
      durableGroups.get(signal) ?? []

    group.push(observation)
    durableGroups.set(
      signal,
      group,
    )
  }

  for (
    const [signal, group] of
    durableGroups
  ) {
    const existing =
      bySignal.get(signal)

    const durableEvidence =
      stableUniqueStrings(
        group.flatMap(
          observation =>
            observation
              .evidence_message_ids,
        ),
      )

    const durableCount =
      group.length

    const combinedEvidence =
      stableUniqueStrings([
        ...(
          existing
            ?.evidence_message_ids ?? []
        ),
        ...durableEvidence,
      ])

    const score =
      (
        existing
          ?.weighted_observation_score ?? 0
      ) + durableCount

    bySignal.set(signal, {
      signal,
      observation_count:
        combinedEvidence.length +
        durableCount,
      eligible_message_count:
        existing
          ?.eligible_message_count ?? 0,
      weighted_observation_score:
        score,
      confidence:
        confidenceForScore(score),
      current_interaction_count:
        existing
          ?.current_interaction_count ?? 0,
      recent_conversation_count:
        existing
          ?.recent_conversation_count ?? 0,
      durable_observation_count:
        durableCount,
      evidence_message_ids:
        combinedEvidence,
      provenance:
        uniqueTraces([
          ...(
            existing
              ?.provenance ?? []
          ),
          ...group.flatMap(
            observation =>
              observation.provenance,
          ),
        ]),
    })
  }

  return [
    ...bySignal.values(),
  ].sort(
    (left, right) =>
      left.signal.localeCompare(
        right.signal,
      ),
  )
}

function profileStatus(
  incomingCount: number,
  signals:
    readonly CustomerCommunicationSignalV1[],
): CustomerCommunicationProfileV1[
  'status'
] {
  if (
    incomingCount === 0 &&
    signals.length === 0
  ) {
    return 'absent'
  }

  const strongSignals =
    signals.filter(
      signal =>
        signal.confidence ===
          'high',
    ).length

  const supportedSignals =
    signals.filter(
      signal =>
        signal.confidence !==
          'low',
    ).length

  if (
    incomingCount >= 3 &&
    (
      strongSignals >= 1 ||
      supportedSignals >= 2
    )
  ) {
    return 'established'
  }

  return 'partial'
}

export function deriveCustomerCommunicationProfileV1(
  snapshot: MessageContextSnapshotV1,
): CustomerCommunicationProfileV1 {
  const incoming =
    selectRecentIncomingMessages(
      snapshot,
    )

  const currentIds =
    currentIncomingIds(snapshot)

  const textual =
    incoming.filter(
      message =>
        message.content_type ===
          'text' &&
        typeof message.text_content ===
          'string' &&
        message.text_content.trim()
          .length > 0,
    )

  const candidates:
    MessageSignalCandidate[] = [
      {
        signal:
          'short_responses',
        matches:
          textual.filter(
            message =>
              wordCount(
                message.text_content,
              ) <= 20,
          ),
        eligible:
          textual,
        thresholdRatio: 0.6,
      },
      {
        signal:
          'direct_questions',
        matches:
          textual.filter(
            message =>
              message.text_content!
                .includes('?'),
          ),
        eligible:
          textual,
        thresholdRatio: 0.5,
      },
      {
        signal:
          'long_messages',
        matches:
          textual.filter(
            message =>
              wordCount(
                message.text_content,
              ) >= 50,
          ),
        eligible:
          textual,
        thresholdRatio: 0.4,
      },
      {
        signal:
          'frequent_audio',
        matches:
          incoming.filter(
            message =>
              message.content_type ===
                'audio',
          ),
        eligible:
          incoming,
        thresholdRatio: 0.4,
      },
      {
        signal:
          'emoji_frequent',
        matches:
          textual.filter(
            message =>
              hasEmoji(
                message.text_content,
              ),
          ),
        eligible:
          textual,
        thresholdRatio: 0.4,
      },
      {
        signal:
          'emoji_sparse',
        matches:
          textual.filter(
            message =>
              !hasEmoji(
                message.text_content,
              ),
          ),
        eligible:
          textual,
        thresholdRatio: 0.85,
      },
    ]

  let signals =
    candidates
      .map(
        candidate =>
          buildMessageSignal(
            candidate,
            currentIds,
          ),
      )
      .filter(
        (
          signal,
        ): signal is CustomerCommunicationSignalV1 =>
          signal !== null,
      )

  signals =
    mergeDurableObservations(
      signals,
      snapshot.customer
        .communication_observations,
    )

  return {
    contract_version:
      CUSTOMER_COMMUNICATION_PROFILE_CONTRACT_VERSION,
    status:
      profileStatus(
        incoming.length,
        signals,
      ),
    recent_window: {
      window_ms:
        CUSTOMER_COMMUNICATION_RECENT_WINDOW_MS,
      message_limit:
        CUSTOMER_COMMUNICATION_RECENT_MESSAGE_LIMIT,
      incoming_message_count:
        incoming.length,
      current_interaction_incoming_count:
        incoming.filter(
          message =>
            currentIds.has(
              message.message_id,
            ),
        ).length,
    },
    signals,
  }
}
