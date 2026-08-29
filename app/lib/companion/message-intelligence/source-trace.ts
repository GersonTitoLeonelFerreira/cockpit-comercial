export const MESSAGE_INTELLIGENCE_SOURCE_TYPES = [
  'request',
  'conversation_message',
  'state_memory',
  'state_snapshot',
  'commercial_reading',
  'commercial_method',
  'commercial_config',
  'commercial_product',
  'product_catalog',
  'commercial_fact',
  'commercial_objection',
  'cycle',
] as const

export type MessageIntelligenceSourceType =
  (typeof MESSAGE_INTELLIGENCE_SOURCE_TYPES)[number]

export const MESSAGE_INTELLIGENCE_INHERITANCE_MODES = [
  'observed_in_current_cycle',
  'inherited_from_previous_cycle',
] as const

export type MessageIntelligenceInheritance =
  (typeof MESSAGE_INTELLIGENCE_INHERITANCE_MODES)[number]

export type SourceTraceV1 = {
  source_type:
    MessageIntelligenceSourceType

  source_id:
    string | null

  source_version:
    string | null

  observed_at:
    string | null

  source_cycle_id?:
    string | null

  inheritance?:
    MessageIntelligenceInheritance

  evidence_message_ids?:
    string[]

  evidence_memory_ids?:
    string[]
}

export type SourcedValueV1<T> = {
  value: T
  provenance: SourceTraceV1[]
}

export function stableUniqueStrings(
  values: readonly string[],
): string[] {
  return [
    ...new Set(
      values.filter(
        value =>
          typeof value === 'string' &&
          value.length > 0,
      ),
    ),
  ].sort((left, right) =>
    left.localeCompare(
      right,
      'en',
      {
        numeric: true,
      },
    ),
  )
}

export function createSourceTraceV1({
  source_type,
  source_id = null,
  source_version = null,
  observed_at = null,
  source_cycle_id,
  inheritance,
  evidence_message_ids,
  evidence_memory_ids,
}: SourceTraceV1): SourceTraceV1 {
  return {
    source_type,
    source_id,
    source_version,
    observed_at,
    ...(source_cycle_id !== undefined
      ? {
          source_cycle_id,
        }
      : {}),
    ...(inheritance !== undefined
      ? {
          inheritance,
        }
      : {}),
    ...(evidence_message_ids !== undefined
      ? {
          evidence_message_ids:
            stableUniqueStrings(
              evidence_message_ids,
            ),
        }
      : {}),
    ...(evidence_memory_ids !== undefined
      ? {
          evidence_memory_ids:
            stableUniqueStrings(
              evidence_memory_ids,
            ),
        }
      : {}),
  }
}
