import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveMessageIntelligenceV2ModelConfig,
} from './model-config.ts'

test(
  'V2 model config: sem nenhum modelo configurado, falha de forma segura',
  () => {
    const config =
      resolveMessageIntelligenceV2ModelConfig({})

    assert.equal(config.status, 'not_ready')
  },
)

test(
  'V2 model config: usa OPENAI_MESSAGE_INTELLIGENCE_MODEL quando explícito',
  () => {
    const config =
      resolveMessageIntelligenceV2ModelConfig({
        OPENAI_MESSAGE_INTELLIGENCE_MODEL:
          'gpt-mie-v2',
        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'gpt-communication',
      })

    assert.deepEqual(config, {
      status: 'ready',
      model: 'gpt-mie-v2',
      source: 'message_intelligence_env',
    })
  },
)

test(
  'V2 model config: cai para OPENAI_STATEFUL_COMMUNICATION_MODEL quando o específico não está configurado',
  () => {
    const config =
      resolveMessageIntelligenceV2ModelConfig({
        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'gpt-communication',
      })

    assert.deepEqual(config, {
      status: 'ready',
      model: 'gpt-communication',
      source: 'communication_env_reused',
    })
  },
)

test(
  'V2 model config: nunca cai silenciosamente no default histórico do provider stateful',
  () => {
    const config =
      resolveMessageIntelligenceV2ModelConfig({
        OPENAI_STATEFUL_COPILOT_MODEL:
          'gpt-4.1-mini-2025-04-14',
      })

    assert.equal(config.status, 'not_ready')
  },
)
