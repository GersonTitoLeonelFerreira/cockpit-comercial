import {
  CUSTOMER_COMMUNICATION_PROFILE_CONTRACT_VERSION,
  type CustomerCommunicationProfileV1,
  type CustomerCommunicationSignalKindV1,
} from './customer-communication-profile'

import {
  SELLER_VOICE_PROFILE_CONTRACT_VERSION,
  type SellerFormalityV1,
  type SellerVoiceProfileV1,
} from './seller-voice-profile'

import type {
  SourceTraceV1,
} from './source-trace'

export const COMMUNICATION_ADAPTATION_CONTRACT_VERSION =
  'communication-adaptation-v1' as const

export type CommunicationAdaptationV1 = {
  contract_version:
    typeof COMMUNICATION_ADAPTATION_CONTRACT_VERSION

  source_contracts: {
    customer_profile:
      typeof CUSTOMER_COMMUNICATION_PROFILE_CONTRACT_VERSION
    seller_voice:
      typeof SELLER_VOICE_PROFILE_CONTRACT_VERSION
  }

  status:
    | 'absent'
    | 'partial'
    | 'ready'

  prefer_shorter: boolean
  prefer_more_direct: boolean
  avoid_large_paragraphs: boolean
  use_question_sparingly: boolean
  maintain_formality:
    SellerFormalityV1 | null
  maintain_seller_greeting: boolean
  reduce_emoji: boolean
  preserve_seller_closing: boolean

  customer_signals_used:
    CustomerCommunicationSignalKindV1[]

  seller_voice_dimensions_used: string[]
  provenance: SourceTraceV1[]
}

function uniqueTraces(
  traces: readonly SourceTraceV1[],
): SourceTraceV1[] {
  const seen = new Set<string>()
  const result: SourceTraceV1[] = []

  for (const trace of traces) {
    const key = JSON.stringify({
      source_type: trace.source_type,
      source_id: trace.source_id,
      source_version: trace.source_version,
      observed_at: trace.observed_at,
      source_cycle_id:
        trace.source_cycle_id ?? null,
      inheritance:
        trace.inheritance ?? null,
      evidence_message_ids:
        trace.evidence_message_ids ?? [],
      evidence_memory_ids:
        trace.evidence_memory_ids ?? [],
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

function signalScore(
  profile:
    CustomerCommunicationProfileV1,
  signal:
    CustomerCommunicationSignalKindV1,
): number {
  return profile.signals.find(
    item =>
      item.signal === signal,
  )?.weighted_observation_score ?? 0
}

function signalEntry(
  profile:
    CustomerCommunicationProfileV1,
  signal:
    CustomerCommunicationSignalKindV1,
) {
  return profile.signals.find(
    item =>
      item.signal === signal,
  ) ?? null
}

export function deriveCommunicationAdaptationV1({
  customer_profile,
  seller_voice,
}: {
  customer_profile:
    CustomerCommunicationProfileV1
  seller_voice:
    SellerVoiceProfileV1
}): CommunicationAdaptationV1 {
  const shortScore =
    signalScore(
      customer_profile,
      'short_responses',
    )

  const shortExplanationScore =
    signalScore(
      customer_profile,
      'prefers_short_explanations',
    )

  const longScore =
    signalScore(
      customer_profile,
      'long_messages',
    )

  const directQuestionScore =
    signalScore(
      customer_profile,
      'direct_questions',
    )

  const emojiSparseScore =
    signalScore(
      customer_profile,
      'emoji_sparse',
    )

  const preferShorter =
    (
      shortScore >= 3 &&
      shortScore > longScore
    ) ||
    shortExplanationScore >= 2

  const preferMoreDirect =
    directQuestionScore >= 3 ||
    (
      preferShorter &&
      shortScore >= 3
    )

  const avoidLargeParagraphs =
    preferShorter ||
    (
      shortScore >= 3 &&
      seller_voice
        .paragraph_structure
        ?.confidence !== 'low' &&
      seller_voice
        .paragraph_structure
        ?.value ===
        'multi_paragraph'
    )

  const useQuestionSparingly =
    preferShorter &&
    seller_voice
      .question_style
      ?.confidence !== 'low' &&
    seller_voice
      .question_style
      ?.value ===
      'frequent'

  const reduceEmoji =
    emojiSparseScore >= 3 &&
    seller_voice
      .emoji_usage
      ?.confidence !== 'low' &&
    seller_voice
      .emoji_usage
      ?.value !== undefined &&
    seller_voice
      .emoji_usage
      ?.value !== 'none'

  const maintainFormality =
    seller_voice.formality &&
    seller_voice.formality.confidence !==
      'low'
      ? seller_voice.formality.value
      : null

  const maintainSellerGreeting =
    seller_voice
      .greeting_pattern !== null

  const preserveSellerClosing =
    seller_voice
      .closing_pattern !== null

  const customerSignalsUsed = [
    ...(preferShorter
      ? [
          shortExplanationScore >= 2
            ? 'prefers_short_explanations' as const
            : 'short_responses' as const,
        ]
      : []),
    ...(preferMoreDirect &&
      directQuestionScore >= 3
      ? [
          'direct_questions' as const,
        ]
      : []),
    ...(reduceEmoji
      ? [
          'emoji_sparse' as const,
        ]
      : []),
  ]

  const sellerDimensionsUsed = [
    ...(maintainFormality !== null
      ? ['formality']
      : []),
    ...(maintainSellerGreeting
      ? ['greeting_pattern']
      : []),
    ...(preserveSellerClosing
      ? ['closing_pattern']
      : []),
    ...(seller_voice
      .paragraph_structure?.confidence !== 'low'
      ? ['paragraph_structure']
      : []),
    ...(seller_voice
      .question_style?.confidence !== 'low'
      ? ['question_style']
      : []),
    ...(seller_voice
      .emoji_usage?.confidence !== 'low'
      ? ['emoji_usage']
      : []),
  ]

  const customerProvenance =
    customerSignalsUsed.flatMap(
      signal =>
        signalEntry(
          customer_profile,
          signal,
        )?.provenance ?? [],
    )

  const sellerProvenance = [
    ...(seller_voice.formality
      ?.provenance ?? []),
    ...(seller_voice
      .greeting_pattern
      ?.provenance ?? []),
    ...(seller_voice
      .closing_pattern
      ?.provenance ?? []),
    ...(seller_voice
      .paragraph_structure
      ?.provenance ?? []),
    ...(seller_voice
      .question_style
      ?.provenance ?? []),
    ...(seller_voice
      .emoji_usage
      ?.provenance ?? []),
  ]

  const hasCustomerAdaptation =
    preferShorter ||
    preferMoreDirect ||
    avoidLargeParagraphs ||
    useQuestionSparingly ||
    reduceEmoji

  const hasSellerPreservation =
    maintainFormality !== null ||
    maintainSellerGreeting ||
    preserveSellerClosing

  const status:
    CommunicationAdaptationV1[
      'status'
    ] =
      !hasCustomerAdaptation &&
      !hasSellerPreservation
        ? 'absent'
        : customer_profile.status ===
            'established' &&
          seller_voice.status ===
            'established'
          ? 'ready'
          : 'partial'

  return {
    contract_version:
      COMMUNICATION_ADAPTATION_CONTRACT_VERSION,
    source_contracts: {
      customer_profile:
        CUSTOMER_COMMUNICATION_PROFILE_CONTRACT_VERSION,
      seller_voice:
        SELLER_VOICE_PROFILE_CONTRACT_VERSION,
    },
    status,
    prefer_shorter:
      preferShorter,
    prefer_more_direct:
      preferMoreDirect,
    avoid_large_paragraphs:
      avoidLargeParagraphs,
    use_question_sparingly:
      useQuestionSparingly,
    maintain_formality:
      maintainFormality,
    maintain_seller_greeting:
      maintainSellerGreeting,
    reduce_emoji:
      reduceEmoji,
    preserve_seller_closing:
      preserveSellerClosing,
    customer_signals_used:
      customerSignalsUsed,
    seller_voice_dimensions_used:
      [
        ...new Set(
          sellerDimensionsUsed,
        ),
      ].sort(),
    provenance:
      uniqueTraces([
        ...customerProvenance,
        ...sellerProvenance,
      ]),
  }
}
