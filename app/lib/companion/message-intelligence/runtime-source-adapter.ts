import type {
  MessageIntelligenceCanonicalContextV1,
  MessageIntelligenceCanonicalScopeV1,
  MessageIntelligenceCommercialReadingSourceV1,
  MessageIntelligenceContextSourceLoaderV1,
  MessageIntelligenceRequestV1,
} from './contracts'

import {
  normalizeMessageIntelligenceRequestV1,
} from './contracts'

export const MESSAGE_INTELLIGENCE_RUNTIME_SOURCE_ADAPTER_ID =
  'message-intelligence-runtime-source-adapter-v1' as const

export const MESSAGE_INTELLIGENCE_RUNTIME_INTEGRATION_POINT =
  'app/lib/server/message-intelligence-source-loader.ts' as const

export const MESSAGE_INTELLIGENCE_RUNTIME_SOURCE_PLAN = {
  scope: {
    authority:
      'resolveCompanionLeadIdentity + membership/cycle scope validation',
    reuse_status:
      'available',
  },
  conversation_ledger: {
    authority:
      'conversation_messages canonical reconciliation',
    reuse_status:
      'requires_device_independent_extraction',
    note:
      'O loader seller-message atual não preserva conversation_messages.id; o Message Intelligence precisa de uma primitive canônica que preserve message_id sem device_key.',
  },
  state_read: {
    authority:
      'createStatefulCopilotSupabaseReader',
    reuse_status:
      'available',
  },
  durable_memory: {
    authority:
      'durable memory seed do stateful real context loader',
    reuse_status:
      'requires_device_independent_extraction',
    note:
      'A busca do seed é privada no loader stateful amplo; a integração live deve extrair essa leitura como primitive server-side sem duplicar a query.',
  },
  commercial_config: {
    authority:
      'commercial config publicada + perfis/fatos/objeções existentes',
    reuse_status:
      'available',
  },
  products: {
    authority:
      'products da empresa no mesmo company_id',
    reuse_status:
      'available',
  },
  commercial_reading: {
    authority:
      'CommercialReading já produzido pelo pipeline stateful',
    reuse_status:
      'runtime_injected',
  },
} as const

export type MessageIntelligenceCommercialContextLoadV1 =
  Pick<
    MessageIntelligenceCanonicalContextV1,
    | 'commercial_config_status'
    | 'commercial_config'
    | 'products'
  >

export type MessageIntelligenceConversationContextLoadV1 =
  Pick<
    MessageIntelligenceCanonicalContextV1,
    | 'diagnostic_input'
    | 'known_message_ids'
    | 'active_message_ids'
  >

export type MessageIntelligenceRuntimeSourceAdapterDependenciesV1 = {
  load_scope: (
    request:
      MessageIntelligenceRequestV1,
  ) => Promise<MessageIntelligenceCanonicalScopeV1>

  load_commercial_context: (
    args: {
      request:
        MessageIntelligenceRequestV1

      scope:
        MessageIntelligenceCanonicalScopeV1
    },
  ) => Promise<MessageIntelligenceCommercialContextLoadV1>

  load_conversation_context: (
    args: {
      request:
        MessageIntelligenceRequestV1

      scope:
        MessageIntelligenceCanonicalScopeV1

      commercial_context:
        MessageIntelligenceCommercialContextLoadV1
    },
  ) => Promise<MessageIntelligenceConversationContextLoadV1>

  load_state_read: (
    args: {
      request:
        MessageIntelligenceRequestV1

      scope:
        MessageIntelligenceCanonicalScopeV1

      known_message_ids:
        string[]

      active_message_ids:
        string[]
    },
  ) => Promise<
    MessageIntelligenceCanonicalContextV1[
      'state_read'
    ]
  >

  load_durable_memory: (
    args: {
      request:
        MessageIntelligenceRequestV1

      scope:
        MessageIntelligenceCanonicalScopeV1

      state_read:
        MessageIntelligenceCanonicalContextV1[
          'state_read'
        ]
    },
  ) => Promise<
    MessageIntelligenceCanonicalContextV1[
      'durable_memory_seed'
    ]
  >

  load_commercial_reading: (
    args: {
      request:
        MessageIntelligenceRequestV1

      context:
        MessageIntelligenceCanonicalContextV1
    },
  ) => Promise<
    MessageIntelligenceCommercialReadingSourceV1 | null
  >
}

export function createMessageIntelligenceRuntimeSourceAdapterV1(
  dependencies:
    MessageIntelligenceRuntimeSourceAdapterDependenciesV1,
): MessageIntelligenceContextSourceLoaderV1 {
  return async (
    rawRequest:
      MessageIntelligenceRequestV1,
  ) => {
    const request =
      normalizeMessageIntelligenceRequestV1(
        rawRequest,
      )

    const scope =
      await dependencies.load_scope(
        request,
      )

    const commercialContext =
      await dependencies
        .load_commercial_context({
          request,
          scope,
        })

    const conversationContext =
      await dependencies
        .load_conversation_context({
          request,
          scope,
          commercial_context:
            commercialContext,
        })

    const stateRead =
      await dependencies.load_state_read({
        request,
        scope,
        known_message_ids:
          conversationContext
            .known_message_ids,
        active_message_ids:
          conversationContext
            .active_message_ids,
      })

    const durableMemory =
      await dependencies
        .load_durable_memory({
          request,
          scope,
          state_read:
            stateRead,
        })

    const context:
      MessageIntelligenceCanonicalContextV1 = {
        loaded_at:
          request.reference_time,
        scope,
        ...commercialContext,
        ...conversationContext,
        state_read:
          stateRead,
        durable_memory_seed:
          durableMemory,
      }

    const commercialReading =
      await dependencies
        .load_commercial_reading({
          request,
          context,
        })

    return {
      real_context:
        context,
      commercial_reading:
        commercialReading,
    }
  }
}
