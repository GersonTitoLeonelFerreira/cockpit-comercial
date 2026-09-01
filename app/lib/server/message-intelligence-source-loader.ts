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
  loadDurableMemorySeedForMissingState,
  type StatefulCopilotRealContextSupabaseClient,
} from '@/app/lib/companion/stateful-copilot-real-context-loader'

import {
  loadCommercialConfig,
} from './companion-diagnostic-snapshot'

import {
  loadCompanionDiagnosticSnapshot,
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

const COMPANY_FIELDS =
  'id, name, platform_status, onboarding_status'

const LEAD_FIELDS =
  'id, company_id, name, phone, email, updated_at'

const CYCLE_FIELDS =
  'id, company_id, lead_id, owner_user_id, status, next_action, next_action_date, updated_at, origin_cycle_id'

export class MessageIntelligenceSourceLoaderError
  extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
  ) {
    super(message)

    this.name =
      'MessageIntelligenceSourceLoaderError'

    this.code =
      code
  }
}

function fail(
  code: string,
  message: string,
): never {
  throw new MessageIntelligenceSourceLoaderError(
    code,
    message,
  )
}

function requireText(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    fail(
      'MESSAGE_INTELLIGENCE_SOURCE_INVALID_ROW',
      `${path} veio inválido do banco.`,
    )
  }

  return value
}

function requireNullableText(
  value: unknown,
  path: string,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return requireText(
    value,
    path,
  )
}

async function loadScope({
  admin,
  request,
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
}): Promise<MessageIntelligenceCanonicalScopeV1> {
  const { data: cycleRow, error: cycleError } =
    await admin
      .from('sales_cycles')
      .select(CYCLE_FIELDS)
      .eq('id', request.cycle_id)
      .eq('company_id', request.company_id)
      .maybeSingle()

  if (cycleError) {
    fail(
      'MESSAGE_INTELLIGENCE_SCOPE_CYCLE_QUERY_FAILED',
      'Não foi possível carregar o ciclo comercial para o Message Intelligence.',
    )
  }

  if (!cycleRow) {
    fail(
      'MESSAGE_INTELLIGENCE_SCOPE_CYCLE_NOT_FOUND',
      'O ciclo comercial não foi encontrado para o escopo solicitado.',
    )
  }

  const leadId =
    requireText(
      (cycleRow as Record<string, unknown>).lead_id,
      'sales_cycles.lead_id',
    )

  const [
    { data: companyRow, error: companyError },
    { data: leadRow, error: leadError },
  ] = await Promise.all([
    admin
      .from('companies')
      .select(COMPANY_FIELDS)
      .eq('id', request.company_id)
      .maybeSingle(),

    admin
      .from('leads')
      .select(LEAD_FIELDS)
      .eq('id', leadId)
      .eq('company_id', request.company_id)
      .maybeSingle(),
  ])

  if (companyError) {
    fail(
      'MESSAGE_INTELLIGENCE_SCOPE_COMPANY_QUERY_FAILED',
      'Não foi possível carregar a empresa para o Message Intelligence.',
    )
  }

  if (!companyRow) {
    fail(
      'MESSAGE_INTELLIGENCE_SCOPE_COMPANY_NOT_FOUND',
      'A empresa não foi encontrada para o escopo solicitado.',
    )
  }

  if (leadError) {
    fail(
      'MESSAGE_INTELLIGENCE_SCOPE_LEAD_QUERY_FAILED',
      'Não foi possível carregar o lead para o Message Intelligence.',
    )
  }

  if (!leadRow) {
    fail(
      'MESSAGE_INTELLIGENCE_SCOPE_LEAD_NOT_FOUND',
      'O lead não foi encontrado para o escopo solicitado.',
    )
  }

  const company =
    companyRow as Record<string, unknown>
  const lead =
    leadRow as Record<string, unknown>
  const cycle =
    cycleRow as Record<string, unknown>

  return {
    company: {
      id: requireText(company.id, 'companies.id'),
      name: requireText(company.name, 'companies.name'),
      platform_status: requireText(
        company.platform_status,
        'companies.platform_status',
      ),
      onboarding_status: requireText(
        company.onboarding_status,
        'companies.onboarding_status',
      ),
    },

    lead: {
      id: requireText(lead.id, 'leads.id'),
      company_id: requireText(
        lead.company_id,
        'leads.company_id',
      ),
      name: requireText(lead.name, 'leads.name'),
      phone: requireNullableText(lead.phone, 'leads.phone'),
      email: requireNullableText(lead.email, 'leads.email'),
      updated_at: requireText(
        lead.updated_at,
        'leads.updated_at',
      ),
    },

    cycle: {
      id: requireText(cycle.id, 'sales_cycles.id'),
      company_id: requireText(
        cycle.company_id,
        'sales_cycles.company_id',
      ),
      lead_id: requireText(
        cycle.lead_id,
        'sales_cycles.lead_id',
      ),
      owner_user_id: requireNullableText(
        cycle.owner_user_id,
        'sales_cycles.owner_user_id',
      ),
      status: requireText(cycle.status, 'sales_cycles.status'),
      next_action: requireNullableText(
        cycle.next_action,
        'sales_cycles.next_action',
      ),
      next_action_date: requireNullableText(
        cycle.next_action_date,
        'sales_cycles.next_action_date',
      ),
      updated_at: requireText(
        cycle.updated_at,
        'sales_cycles.updated_at',
      ),
    },

    conversation_key: request.conversation_key,
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
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
}): Promise<MessageIntelligenceConversationContextLoadV1> {
  const snapshot =
    await loadCompanionDiagnosticSnapshot({
      admin,
      company_id: request.company_id,
      cycle_id: request.cycle_id,
      conversation_key: request.conversation_key,
      reference_time: request.reference_time,
    })

  const activeIds =
    snapshot.input.conversation.active_message_ids
  const excludedIds =
    snapshot.input.conversation.excluded_message_ids

  const knownIds = [
    ...new Set([
      ...activeIds,
      ...excludedIds,
    ]),
  ]

  return {
    diagnostic_input: snapshot.input,
    known_message_ids: knownIds,
    active_message_ids: [...activeIds],
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
}: {
  admin: SupabaseClient
  request: MessageIntelligenceRequestV1
  scope: MessageIntelligenceCanonicalScopeV1
  state_read: StatefulCopilotStateReadResult
}) {
  // Mesma regra do loader stateful amplo: a memória durável só é
  // buscada quando o estado do ciclo atual está ausente. Estado
  // presente é sempre a fonte de verdade.
  if (state_read.mode !== 'missing') {
    return null
  }

  const { data: cycleRow, error } =
    await admin
      .from('sales_cycles')
      .select('origin_cycle_id')
      .eq('id', request.cycle_id)
      .eq('company_id', request.company_id)
      .maybeSingle()

  if (error) {
    // Best-effort: falha ao localizar origin_cycle_id nunca fabrica
    // memória nem derruba o carregamento do restante do contexto.
    return null
  }

  const originCycleId =
    cycleRow &&
    typeof (cycleRow as Record<string, unknown>).origin_cycle_id === 'string'
      ? ((cycleRow as Record<string, unknown>).origin_cycle_id as string)
      : null

  return loadDurableMemorySeedForMissingState({
    client:
      admin as unknown as
        StatefulCopilotRealContextSupabaseClient,
    companyId: request.company_id,
    cycleId: request.cycle_id,
    leadId: scope.lead.id,
    originCycleId,
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
  return createMessageIntelligenceRuntimeSourceAdapterV1({
    load_scope: (request) =>
      loadScope({
        admin,
        request,
      }),

    load_commercial_context: ({ request }) =>
      loadCommercialContext({
        admin,
        request,
      }),

    load_conversation_context: ({ request }) =>
      loadConversationContext({
        admin,
        request,
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

    load_durable_memory: ({
      request,
      scope,
      state_read,
    }) =>
      loadDurableMemory({
        admin,
        request,
        scope,
        state_read,
      }),

    load_commercial_reading: () =>
      loadCommercialReading(),
  })
}
