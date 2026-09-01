import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  MessageIntelligenceCanonicalScopeV1,
  MessageIntelligenceCommercialReadingSourceV1,
  MessageIntelligenceContextSourceLoaderV1,
  MessageIntelligenceRequestV1,
} from '@/app/lib/companion/message-intelligence/contracts'

import {
  createMessageIntelligenceRuntimeSourceAdapterV1,
  type MessageIntelligenceCommercialContextLoadV1,
  type MessageIntelligenceConversationContextLoadV1,
} from '@/app/lib/companion/message-intelligence/runtime-source-adapter'

import {
  createStatefulCopilotSupabaseReader,
  type StatefulCopilotStateReadResult,
  type StatefulCopilotSupabaseReadClient,
} from '@/app/lib/companion/stateful-copilot-supabase-reader'

import {
  loadCanonicalLedgerAtReferenceTime,
  loadDurableMemorySeedForMissingState,
  loadStatefulCopilotCanonicalScope,
  selectStatefulDiagnosticMessages,
  type StatefulCopilotCanonicalScope,
  type StatefulCopilotRealContextSupabaseClient,
} from '@/app/lib/companion/stateful-copilot-real-context-loader'

import {
  buildCompanionDiagnosticInput,
} from '@/app/lib/companion/diagnostic-input'

import {
  loadCommercialConfig,
} from './companion-diagnostic-snapshot'

// ============================================================================
// Message Intelligence — Shadow Validation
// Source Loader (server-side, device-independent)
//
// Implementa a integração real documentada em
// app/lib/companion/message-intelligence/runtime-source-adapter.ts
// (MESSAGE_INTELLIGENCE_RUNTIME_SOURCE_PLAN). Não duplica nenhuma fonte
// de verdade: cada primitive abaixo reutiliza uma query já auditada e
// canônica do loader stateful/diagnostic-snapshot existente.
//
// MIE É DEVICE-INDEPENDENT: nenhuma função aqui recebe, exige ou
// fabrica device_key.
// ============================================================================

async function loadScope({
  admin,
  request,
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
}): Promise<{
  scope: MessageIntelligenceCanonicalScopeV1
  canonical_scope: StatefulCopilotCanonicalScope
}> {
  const canonicalScope =
    await loadStatefulCopilotCanonicalScope({
      client:
        admin as unknown as
          StatefulCopilotRealContextSupabaseClient,
      companyId: request.company_id,
      cycleId: request.cycle_id,
    })

  return {
    scope: {
      company: {
        ...canonicalScope.company,
      },
      lead: {
        ...canonicalScope.lead,
      },
      cycle: {
        ...canonicalScope.cycle,
      },
      conversation_key:
        request.conversation_key,
    },
    canonical_scope:
      canonicalScope,
  }
}

async function loadCommercialContext({
  admin,
  request,
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
}): Promise<MessageIntelligenceCommercialContextLoadV1> {
  const { bundle, products } =
    await loadCommercialConfig({
      admin,
      companyId: request.company_id,
    })

  return {
    commercial_config_status:
      bundle ? 'published' : 'missing',
    commercial_config: bundle,
    products,
  }
}

async function loadConversationContext({
  admin,
  request,
  scope,
  commercial_context,
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
  scope: MessageIntelligenceCanonicalScopeV1
  commercial_context:
    MessageIntelligenceCommercialContextLoadV1
}): Promise<MessageIntelligenceConversationContextLoadV1> {
  const {
    knownMessageIds,
    canonicalMessages,
  } =
    await loadCanonicalLedgerAtReferenceTime({
      client:
        admin as unknown as
          StatefulCopilotRealContextSupabaseClient,
      companyId: request.company_id,
      cycleId: request.cycle_id,
      conversationKey:
        request.conversation_key,
      referenceTime:
        request.reference_time,
    })

  const diagnosticMessages =
    selectStatefulDiagnosticMessages(
      canonicalMessages,
    )

  const diagnosticInput =
    buildCompanionDiagnosticInput({
      company_id:
        request.company_id,
      cycle_id:
        request.cycle_id,
      conversation_key:
        request.conversation_key,
      current_crm_status:
        scope.cycle.status,
      reference_time:
        request.reference_time,
      messages:
        diagnosticMessages,
      commercial_config:
        commercial_context
          .commercial_config,
      products:
        commercial_context.products,
    })

  return {
    diagnostic_input:
      diagnosticInput,
    known_message_ids:
      knownMessageIds,
    active_message_ids: [
      ...diagnosticInput
        .conversation
        .active_message_ids,
    ],
  }
}

async function loadStateRead({
  admin,
  request,
  known_message_ids,
  active_message_ids,
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
  known_message_ids: string[]
  active_message_ids: string[]
}): Promise<StatefulCopilotStateReadResult> {
  const reader =
    createStatefulCopilotSupabaseReader({
      client:
        admin as unknown as
          StatefulCopilotSupabaseReadClient,
    })

  return reader({
    company_id: request.company_id,
    cycle_id: request.cycle_id,
    conversation_key: request.conversation_key,
    known_message_ids,
    active_message_ids,
  })
}

async function loadDurableMemory({
  admin,
  request,
  scope,
  state_read,
  origin_cycle_id,
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
  scope: MessageIntelligenceCanonicalScopeV1
  state_read: StatefulCopilotStateReadResult
  origin_cycle_id: string | null
}) {
  // Mesma regra do loader stateful amplo: a memória durável só é
  // buscada quando o estado do ciclo atual está ausente. Estado
  // presente é sempre a fonte de verdade.
  if (state_read.mode !== 'missing') {
    return null
  }

  return loadDurableMemorySeedForMissingState({
    client:
      admin as unknown as
        StatefulCopilotRealContextSupabaseClient,
    companyId: request.company_id,
    cycleId: request.cycle_id,
    leadId: scope.lead.id,
    originCycleId:
      origin_cycle_id,
  })
}

async function loadCommercialReading(): Promise<
  MessageIntelligenceCommercialReadingSourceV1 | null
> {
  // Nenhuma fonte canônica de Commercial Reading está disponível de
  // forma segura para o worker de shadow validation nesta fase (ver
  // handoff). Ausência permanece ausência — o Context Assembler já
  // possui fallback para o estado persistido. PROIBIDO construir a
  // partir de guidance_status/guidance_stage_name/guidance_next_step/
  // working_summary/payload client-side.
  return null
}

/**
 * Cria o Message Context Source Loader real (server-side) do Message
 * Intelligence Engine V1, integrando com
 * app/lib/server/message-intelligence-source-loader.ts como planejado
 * pela Frente 1 em runtime-source-adapter.ts.
 */
export function createMessageIntelligenceSourceLoaderV1({
  admin,
}: {
  admin: SupabaseClient
}): MessageIntelligenceContextSourceLoaderV1 {
  const canonicalScopeByRequest =
    new Map<
      string,
      StatefulCopilotCanonicalScope
    >()

  return createMessageIntelligenceRuntimeSourceAdapterV1({
    load_scope: async (request) => {
      const loaded =
        await loadScope({
          admin,
          request,
        })

      canonicalScopeByRequest.set(
        request.request_id,
        loaded.canonical_scope,
      )

      return loaded.scope
    },

    load_commercial_context: ({ request }) =>
      loadCommercialContext({
        admin,
        request,
      }),

    load_conversation_context: ({
      request,
      scope,
      commercial_context,
    }) =>
      loadConversationContext({
        admin,
        request,
        scope,
        commercial_context,
      }),

    load_state_read: ({
      request,
      known_message_ids,
      active_message_ids,
    }) =>
      loadStateRead({
        admin,
        request,
        known_message_ids,
        active_message_ids,
      }),

    load_durable_memory: async ({
      request,
      scope,
      state_read,
    }) => {
      const canonicalScope =
        canonicalScopeByRequest.get(
          request.request_id,
        )

      if (!canonicalScope) {
        throw new Error(
          'MESSAGE_INTELLIGENCE_CANONICAL_SCOPE_NOT_LOADED',
        )
      }

      try {
        return await loadDurableMemory({
          admin,
          request,
          scope,
          state_read,
          origin_cycle_id:
            canonicalScope.origin_cycle_id,
        })
      } finally {
        canonicalScopeByRequest.delete(
          request.request_id,
        )
      }
    },

    load_commercial_reading: () =>
      loadCommercialReading(),
  })
}
