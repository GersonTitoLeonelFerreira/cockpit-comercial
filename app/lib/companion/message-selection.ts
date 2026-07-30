export type CompanionMessageCursor = {
  has_cursor: boolean
  last_message_timestamp_ms: number
  last_message_id: string | null
  processed_message_ids: string[]
}

export type CompanionStructuredMessage = {
  id: string
  timestamp_ms: number
  date_key: string
}

type SelectStructuredMessageBatchInput<
  Message extends CompanionStructuredMessage,
> = {
  messages: Message[]
  cursor: CompanionMessageCursor
  forceReanalysis: boolean
  limit?: number
}

type ShouldForceReanalysisInput = {
  requested: boolean
  currentSnapshotHash: string | null
  previousSnapshotHash: string | null
}

export function shouldForceReanalysis({
  requested,
  currentSnapshotHash,
  previousSnapshotHash,
}: ShouldForceReanalysisInput) {
  return (
    requested &&
    (
      !currentSnapshotHash ||
      currentSnapshotHash !==
        previousSnapshotHash
    )
  )
}

export function getLatestDateMessageBlock<
  Message extends CompanionStructuredMessage,
>(
  messages: Message[],
  limit = 80,
) {
  if (messages.length === 0) {
    return []
  }

  const latestDateKey =
    messages.at(-1)?.date_key

  const latestMessages =
    latestDateKey
      ? messages.filter(
          (message) =>
            message.date_key ===
            latestDateKey,
        )
      : messages

  return latestMessages.slice(
    -Math.max(1, limit),
  )
}

export function selectStructuredMessageBatch<
  Message extends CompanionStructuredMessage,
>({
  messages,
  cursor,
  forceReanalysis,
  limit = 80,
}: SelectStructuredMessageBatchInput<Message>) {
  if (
    forceReanalysis ||
    !cursor.has_cursor
  ) {
    return {
      messages:
        getLatestDateMessageBlock(
          messages,
          limit,
        ),
      incremental: false,
      cursor,
    }
  }

  const processedIds =
    new Set(
      cursor.processed_message_ids,
    )

  const newMessages =
    messages.filter((message) => {
      if (
        message.timestamp_ms >
        cursor.last_message_timestamp_ms
      ) {
        return true
      }

      if (
        message.timestamp_ms ===
          cursor.last_message_timestamp_ms &&
        !processedIds.has(message.id)
      ) {
        return true
      }

      return false
    })

  return {
    messages:
      newMessages.slice(-limit),
    incremental: true,
    cursor,
  }
}
