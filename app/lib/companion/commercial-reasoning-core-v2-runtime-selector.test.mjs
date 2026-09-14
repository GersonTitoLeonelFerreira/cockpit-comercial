import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION,
  resolveCommercialReasoningCoreV2RuntimeSelection,
} from './commercial-reasoning-core-v2-runtime-selector.ts'

test(
  'seletor mantém runtime legado por padrão',
  () => {
    const result =
      resolveCommercialReasoningCoreV2RuntimeSelection()

    assert.equal(
      result.selector_version,
      COMMERCIAL_REASONING_CORE_V2_RUNTIME_SELECTOR_VERSION,
    )

    assert.equal(
      result.mode,
      'legacy_stateful',
    )

    assert.equal(
      result.uses_legacy_stateful,
      true,
    )

    assert.equal(
      result.uses_commercial_reasoning_core_v2,
      false,
    )

    assert.equal(
      result.reason,
      'default_legacy',
    )
  },
)

test(
  'seletor ativa Core V2 somente com valor explícito',
  () => {
    const result =
      resolveCommercialReasoningCoreV2RuntimeSelection({
        configured_value:
          ' commercial_reasoning_core_v2 ',
      })

    assert.equal(
      result.mode,
      'commercial_reasoning_core_v2',
    )

    assert.equal(
      result.uses_legacy_stateful,
      false,
    )

    assert.equal(
      result.uses_commercial_reasoning_core_v2,
      true,
    )

    assert.equal(
      result.reason,
      'explicit_core_v2',
    )
  },
)

test(
  'valor inválido cai de forma segura para o runtime legado',
  () => {
    const result =
      resolveCommercialReasoningCoreV2RuntimeSelection({
        configured_value:
          'v2',
      })

    assert.equal(
      result.mode,
      'legacy_stateful',
    )

    assert.equal(
      result.uses_legacy_stateful,
      true,
    )

    assert.equal(
      result.uses_commercial_reasoning_core_v2,
      false,
    )

    assert.equal(
      result.reason,
      'invalid_value_fallback_legacy',
    )
  },
)
