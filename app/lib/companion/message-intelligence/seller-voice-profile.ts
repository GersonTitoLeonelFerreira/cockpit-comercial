import type {
  MessageContextSnapshotMessageV1,
  MessageContextSnapshotV1,
} from './context-snapshot'

import {
  stableUniqueStrings,
  type SourceTraceV1,
} from './source-trace'

import type {
  CommunicationEvidenceConfidenceV1,
} from './customer-communication-profile'

export const SELLER_VOICE_PROFILE_CONTRACT_VERSION =
  'seller-voice-profile-v1' as const

export const SELLER_VOICE_RECENT_WINDOW_MS =
  30 * 24 * 60 * 60 * 1000

export const SELLER_VOICE_RECENT_MESSAGE_LIMIT =
  60

export const SELLER_VOICE_MIN_ESTABLISHED_MESSAGES =
  3

export type ObservedSellerVoiceValueV1<T> = {
  value: T
  observation_count: number
  confidence:
    CommunicationEvidenceConfidenceV1
  evidence_message_ids: string[]
  provenance: SourceTraceV1[]
}

export type SellerTypicalLengthV1 =
  | 'short'
  | 'medium'
  | 'long'

export type SellerFormalityV1 =
  | 'formal'
  | 'neutral'
  | 'informal'

export type SellerEmojiUsageV1 =
  | 'none'
  | 'occasional'
  | 'frequent'

export type SellerSentenceLengthV1 =
  | 'brief'
  | 'balanced'
  | 'extended'

export type SellerQuestionStyleV1 =
  | 'rare'
  | 'balanced'
  | 'frequent'

export type SellerParagraphStructureV1 =
  | 'compact'
  | 'multi_paragraph'

export type SellerVoiceProfileV1 = {
  contract_version:
    typeof SELLER_VOICE_PROFILE_CONTRACT_VERSION

  status:
    | 'absent'
    | 'partial'
    | 'established'

  recent_window: {
    window_ms: number
    message_limit: number
    outgoing_message_count: number
  }

  typical_length:
    ObservedSellerVoiceValueV1<SellerTypicalLengthV1> | null

  greeting_pattern:
    ObservedSellerVoiceValueV1<string> | null

  closing_pattern:
    ObservedSellerVoiceValueV1<string> | null

  formality:
    ObservedSellerVoiceValueV1<SellerFormalityV1> | null

  emoji_usage:
    ObservedSellerVoiceValueV1<SellerEmojiUsageV1> | null

  sentence_length:
    ObservedSellerVoiceValueV1<SellerSentenceLengthV1> | null

  question_style:
    ObservedSellerVoiceValueV1<SellerQuestionStyleV1> | null

  paragraph_structure:
    ObservedSellerVoiceValueV1<SellerParagraphStructureV1> | null
}

function confidenceForCount(
  count: number,
): CommunicationEvidenceConfidenceV1 {
  if (count >= 6) {
    return 'high'
  }

  if (count >= 3) {
    return 'medium'
  }

  return 'low'
}

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

function sentenceCount(
  value: string | null,
): number {
  if (!value) {
    return 0
  }

  const sentences =
    value
      .split(/[.!?]+/u)
      .map(part => part.trim())
      .filter(Boolean)

  return Math.max(
    sentences.length,
    1,
  )
}

function paragraphCount(
  value: string | null,
): number {
  if (!value) {
    return 0
  }

  return Math.max(
    value
      .split(/\n\s*\n|\n/u)
      .map(part => part.trim())
      .filter(Boolean)
      .length,
    1,
  )
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

function observedValue<T>(
  value: T,
  messages:
    readonly MessageContextSnapshotMessageV1[],
): ObservedSellerVoiceValueV1<T> | null {
  if (messages.length === 0) {
    return null
  }

  return {
    value,
    observation_count:
      messages.length,
    confidence:
      confidenceForCount(
        messages.length,
      ),
    evidence_message_ids:
      stableUniqueStrings(
        messages.map(
          message =>
            message.message_id,
        ),
      ),
    provenance:
      uniqueTraces(
        messages.flatMap(
          message =>
            message.provenance,
        ),
      ),
  }
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

function selectRecentOutgoingMessages(
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
        SELLER_VOICE_RECENT_WINDOW_MS
      : Number.NEGATIVE_INFINITY

  const upperBound =
    Number.isFinite(reference)
      ? reference + 5 * 60 * 1000
      : Number.POSITIVE_INFINITY

  return snapshot.conversation.messages
    .filter(
      message =>
        message.direction ===
          'outgoing' &&
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
      -SELLER_VOICE_RECENT_MESSAGE_LIMIT,
    )
}

function median(
  values: number[],
): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [
    ...values,
  ].sort(
    (left, right) =>
      left - right,
  )

  const middle =
    Math.floor(
      sorted.length / 2,
    )

  return sorted.length % 2 === 0
    ? (
        sorted[middle - 1] +
        sorted[middle]
      ) / 2
    : sorted[middle]
}

function detectGreeting(
  value: string | null,
): string | null {
  if (!value) {
    return null
  }

  const match =
    /^\s*(bom dia|boa tarde|boa noite|olá|ola|oi|opa|hey|e aí|e ai)\b/iu
      .exec(value)

  return match
    ? match[1]
        .trim()
        .toLocaleLowerCase(
          'pt-BR',
        )
    : null
}

function detectClosing(
  value: string | null,
): string | null {
  if (!value) {
    return null
  }

  const normalized =
    value.trim()

  const match =
    /(fico à disposição|fico a disposição|qualquer dúvida,? me chama|qualquer duvida,? me chama|obrigado|obrigada|até mais|ate mais|abraço|abraco)[.!\s]*$/iu
      .exec(normalized)

  return match
    ? match[1]
        .trim()
        .toLocaleLowerCase(
          'pt-BR',
        )
    : null
}

function recurringPattern(
  messages:
    readonly MessageContextSnapshotMessageV1[],
  detector: (
    value: string | null,
  ) => string | null,
): ObservedSellerVoiceValueV1<string> | null {
  const groups =
    new Map<
      string,
      MessageContextSnapshotMessageV1[]
    >()

  for (const message of messages) {
    const value =
      detector(
        message.text_content ??
          message.audio_transcription,
      )

    if (!value) {
      continue
    }

    const group =
      groups.get(value) ?? []

    group.push(message)
    groups.set(value, group)
  }

  const ranked = [
    ...groups.entries(),
  ].sort(
    (left, right) =>
      right[1].length -
        left[1].length ||
      left[0].localeCompare(
        right[0],
        'pt-BR',
      ),
  )

  const best = ranked[0]

  if (
    !best ||
    best[1].length < 2 ||
    best[1].length /
      Math.max(messages.length, 1) <
      0.34
  ) {
    return null
  }

  return observedValue(
    best[0],
    best[1],
  )
}

function formalityValue(
  messages:
    readonly MessageContextSnapshotMessageV1[],
): ObservedSellerVoiceValueV1<SellerFormalityV1> | null {
  if (messages.length === 0) {
    return null
  }

  const formalPattern =
    /\b(?:prezad[oa]s?|por favor|agradeço|agradeco|gostaria|poderia|fico à disposição|fico a disposição|atenciosamente)\b/iu

  const informalPattern =
    /\b(?:oi|opa|e aí|e ai|vc|vcs|tá|ta|pra|beleza|blz)\b/iu

  const formal =
    messages.filter(
      message =>
        formalPattern.test(
          message.text_content ?? '',
        ),
    )

  const informal =
    messages.filter(
      message =>
        informalPattern.test(
          message.text_content ?? '',
        ),
    )

  if (
    formal.length >= 2 &&
    formal.length > informal.length
  ) {
    return observedValue(
      'formal',
      formal,
    )
  }

  if (
    informal.length >= 2 &&
    informal.length > formal.length
  ) {
    return observedValue(
      'informal',
      informal,
    )
  }

  return observedValue(
    'neutral',
    messages,
  )
}

export function deriveSellerVoiceProfileV1(
  snapshot: MessageContextSnapshotV1,
): SellerVoiceProfileV1 {
  const outgoing =
    selectRecentOutgoingMessages(
      snapshot,
    )

  if (outgoing.length === 0) {
    return {
      contract_version:
        SELLER_VOICE_PROFILE_CONTRACT_VERSION,
      status: 'absent',
      recent_window: {
        window_ms:
          SELLER_VOICE_RECENT_WINDOW_MS,
        message_limit:
          SELLER_VOICE_RECENT_MESSAGE_LIMIT,
        outgoing_message_count: 0,
      },
      typical_length: null,
      greeting_pattern: null,
      closing_pattern: null,
      formality: null,
      emoji_usage: null,
      sentence_length: null,
      question_style: null,
      paragraph_structure: null,
    }
  }

  const textValues =
    outgoing.map(
      message =>
        message.text_content ??
        message.audio_transcription ??
        '',
    )

  const medianWords =
    median(
      textValues.map(
        value =>
          wordCount(value),
      ),
    )

  const typicalLength:
    SellerTypicalLengthV1 =
      medianWords <= 20
        ? 'short'
        : medianWords <= 55
          ? 'medium'
          : 'long'

  const emojiCount =
    textValues.filter(
      hasEmoji,
    ).length

  const emojiRatio =
    emojiCount /
    outgoing.length

  const emojiUsage:
    SellerEmojiUsageV1 =
      emojiCount === 0
        ? 'none'
        : emojiRatio >= 0.4
          ? 'frequent'
          : 'occasional'

  const totalWords =
    textValues.reduce(
      (total, value) =>
        total + wordCount(value),
      0,
    )

  const totalSentences =
    textValues.reduce(
      (total, value) =>
        total + sentenceCount(value),
      0,
    )

  const averageWordsPerSentence =
    totalWords /
    Math.max(totalSentences, 1)

  const sentenceLength:
    SellerSentenceLengthV1 =
      averageWordsPerSentence <= 10
        ? 'brief'
        : averageWordsPerSentence <= 20
          ? 'balanced'
          : 'extended'

  const questionCount =
    textValues.filter(
      value =>
        value.includes('?'),
    ).length

  const questionRatio =
    questionCount /
    outgoing.length

  const questionStyle:
    SellerQuestionStyleV1 =
      questionRatio <= 0.2
        ? 'rare'
        : questionRatio <= 0.6
          ? 'balanced'
          : 'frequent'

  const averageParagraphs =
    textValues.reduce(
      (total, value) =>
        total + paragraphCount(value),
      0,
    ) /
    outgoing.length

  const paragraphStructure:
    SellerParagraphStructureV1 =
      averageParagraphs <= 1.2
        ? 'compact'
        : 'multi_paragraph'

  return {
    contract_version:
      SELLER_VOICE_PROFILE_CONTRACT_VERSION,
    status:
      outgoing.length >=
        SELLER_VOICE_MIN_ESTABLISHED_MESSAGES
        ? 'established'
        : 'partial',
    recent_window: {
      window_ms:
        SELLER_VOICE_RECENT_WINDOW_MS,
      message_limit:
        SELLER_VOICE_RECENT_MESSAGE_LIMIT,
      outgoing_message_count:
        outgoing.length,
    },
    typical_length:
      observedValue(
        typicalLength,
        outgoing,
      ),
    greeting_pattern:
      recurringPattern(
        outgoing,
        detectGreeting,
      ),
    closing_pattern:
      recurringPattern(
        outgoing,
        detectClosing,
      ),
    formality:
      formalityValue(outgoing),
    emoji_usage:
      observedValue(
        emojiUsage,
        outgoing,
      ),
    sentence_length:
      observedValue(
        sentenceLength,
        outgoing,
      ),
    question_style:
      observedValue(
        questionStyle,
        outgoing,
      ),
    paragraph_structure:
      observedValue(
        paragraphStructure,
        outgoing,
      ),
  }
}
