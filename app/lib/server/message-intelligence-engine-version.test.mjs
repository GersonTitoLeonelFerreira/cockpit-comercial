import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveMessageIntelligenceEngineVersion,
} from './message-intelligence-engine-version.ts'

test(
  'engine version: default é v1 quando a env não está definida',
  () => {
    assert.equal(
      resolveMessageIntelligenceEngineVersion({}),
      'v1',
    )
  },
)

test(
  'engine version: default é v1 para qualquer valor desconhecido',
  () => {
    assert.equal(
      resolveMessageIntelligenceEngineVersion({
        MESSAGE_INTELLIGENCE_ENGINE_VERSION:
          'v3',
      }),
      'v1',
    )
    assert.equal(
      resolveMessageIntelligenceEngineVersion({
        MESSAGE_INTELLIGENCE_ENGINE_VERSION: '',
      }),
      'v1',
    )
  },
)

test(
  'engine version: v2 só é selecionada quando explicitamente configurada',
  () => {
    assert.equal(
      resolveMessageIntelligenceEngineVersion({
        MESSAGE_INTELLIGENCE_ENGINE_VERSION:
          'v2',
      }),
      'v2',
    )
    assert.equal(
      resolveMessageIntelligenceEngineVersion({
        MESSAGE_INTELLIGENCE_ENGINE_VERSION:
          'V2',
      }),
      'v2',
    )
  },
)
