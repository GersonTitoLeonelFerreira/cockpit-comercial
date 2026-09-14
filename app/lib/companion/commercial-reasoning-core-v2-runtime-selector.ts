export const COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION =
  'commercial-reasoning-core-v2-runtime-selector-v1' as const

export const COMMERCIAL_REASONING_CORE_V2_RUNTIME_MODES = [
  'legacy_stateful',
  'commercial_reasoning_core_v2',
] as const

export type CommercialReasoningCoreV2RuntimeMode =
  (typeof COMMERCIAL_REASONING_CORE_V2_RUNTIME_MODES)[number]

export type CommercialReasoningCoreV2RuntimeSelection = {
  selector_version:
    typeof COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION

  mode:
    CommercialReasoningCoreV2RuntimeMode

  uses_legacy_stateful:
    boolean

  uses_commercial_reasoning_core_v2:
    boolean

  reason:
    'default_legacy' |
    'explicit_legacy' |
    'explicit_core_v2' |
    'invalid_value_fallback_legacy'
}

function normalizeSelectorValue(
  value:
    unknown,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const normalized =
    value
      .trim()
      .toLowerCase()

  return normalized || null
}

export function resolveCommercialReasoningCoreV2RuntimeSelection({
  configured_value,
}: {
  configured_value?:
    unknown
} = {}): CommercialReasoningCoreV2RuntimeSelection {
  const normalized =
    normalizeSelectorValue(
      configured_value,
    )

  if (
    normalized ===
    'commercial_reasoning_core_v2'
  ) {
    return {
      selector_version:
        COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION,

      mode:
        'commercial_reasoning_core_v2',

      uses_legacy_stateful:
        false,

      uses_commercial_reasoning_core_v2:
        true,

      reason:
        'explicit_core_v2',
    }
  }

  if (
    normalized ===
    'legacy_stateful'
  ) {
    return {
      selector_version:
        COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION,

      mode:
        'legacy_stateful',

      uses_legacy_stateful:
        true,

      uses_commercial_reasoning_core_v2:
        false,

      reason:
        'explicit_legacy',
    }
  }

  return {
    selector_version:
      COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION,

    mode:
      'legacy_stateful',

    uses_legacy_stateful:
      true,

    uses_commercial_reasoning_core_v2:
      false,

    reason:
      normalized ===
        null
        ? 'default_legacy'
        : 'invalid_value_fallback_legacy',
  }
}
