import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  computeCompanionClientRelationship,
  computeCompanionClientWaiting,
  type CompanionClientMessageFact,
} from '../companion/companion-client-relationship'

import {
  buildCompanionClientTimeline,
  type CompanionClientActionEventFact,
  type CompanionClientCycleEventFact,
} from '../companion/companion-client-timeline'

import {
  assessCompanionClientSla,
  type CompanionClientSlaRule,
} from '../companion/companion-client-sla'

import {
  COMPANION_CLIENT_CONTEXT_CONTRACT_VERSION,
  type CompanionClientContext,
} from '../companion/companion-client-context-contract'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const LEAD_STATUSES:
  readonly LeadStatus[] = [
    'novo',
    'contato',
    'respondeu',
    'negociacao',
    'pausado',
    'cancelado',
    'ganho',
    'perdido',
  ]

const MAX_CANONICAL_MESSAGES =
  1000

const MAX_CYCLE_EVENTS =
  60

const MAX_ACTION_EVENTS =
  60

const CYCLE_EVENT_TYPES_OF_INTEREST = [
  'stage_changed',
  'next_action_set',
  'ai_suggestion_applied',
  'closed_won',
  'closed_lost',
  'conversation_registered',
]

type JsonRecord =
  Record<string, unknown>

type QueryResult = {
  data: unknown
  error: {
    message?: string
  } | null
}

export class CompanionClientContextError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

  constructor({
    code,
    message,
    status_code,
    retryable,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
  }) {
    super(message)

    this.name =
      'CompanionClientContextError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable
  }
}

function fail({
  code,
  message,
  status_code,
  retryable,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
}): never {
  throw new CompanionClientContextError({
    code,
    message,
    status_code,
    retryable,
  })
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeUuid(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(
      value.trim(),
    )
  ) {
    fail({
      code:
        'INVALID_CLIENT_CONTEXT_ARGUMENT',

      message:
        `${path} precisa ser um UUID válido.`,

      status_code: 400,
      retryable: false,
    })
  }

  return value
    .trim()
    .toLowerCase()
}

function normalizeConversationKey(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_CLIENT_CONTEXT_ARGUMENT',

      message:
        'conversation_key precisa ser um texto.',

      status_code: 400,
      retryable: false,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > 500
  ) {
    fail({
      code:
        'INVALID_CLIENT_CONTEXT_ARGUMENT',

      message:
        'conversation_key possui um valor inválido.',

      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function normalizeReferenceTime(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_CLIENT_CONTEXT_ARGUMENT',

      message:
        'reference_time precisa ser um texto.',

      status_code: 400,
      retryable: false,
    })
  }

  const timestamp =
    Date.parse(value)

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    fail({
      code:
        'INVALID_CLIENT_CONTEXT_ARGUMENT',

      message:
        'reference_time possui uma data inválida.',

      status_code: 400,
      retryable: false,
    })
  }

  return new Date(
    timestamp,
  ).toISOString()
}

function isLeadStatus(
  value: unknown,
): value is LeadStatus {
  return (
    typeof value === 'string' &&
    LEAD_STATUSES.includes(
      value as LeadStatus,
    )
  )
}

function getRows(
  result: QueryResult,
  table: string,
): JsonRecord[] {
  if (result.error) {
    fail({
      code:
        'CLIENT_CONTEXT_QUERY_FAILED',

      message:
        'Não foi possível carregar a inteligência operacional do cliente.',

      status_code: 500,
      retryable: true,
    })
  }

  if (
    result.data === null ||
    result.data === undefined
  ) {
    return []
  }

  if (
    !Array.isArray(result.data)
  ) {
    fail({
      code:
        'CLIENT_CONTEXT_QUERY_INVALID',

      message:
        `O banco retornou um formato inesperado para ${table}.`,

      status_code: 500,
      retryable: false,
    })
  }

  return result.data.filter(
    isRecord,
  )
}

async function validateMembership({
  admin,
  companyId,
  userId,
}: {
  admin: SupabaseClient
  companyId: string
  userId: string
}): Promise<
  'admin' | 'manager' | 'member'
> {
  const { data, error } =
    await admin
      .from(
        'company_memberships',
      )
      .select(
        'company_id, user_id, role, is_active',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'is_active',
        true,
      )
      .maybeSingle()

  if (error) {
    fail({
      code:
        'CLIENT_CONTEXT_QUERY_FAILED',

      message:
        'Não foi possível validar o vínculo com a empresa.',

      status_code: 500,
      retryable: true,
    })
  }

  if (
    !isRecord(data) ||
    data.company_id !== companyId ||
    data.user_id !== userId ||
    (
      data.role !== 'admin' &&
      data.role !== 'manager' &&
      data.role !== 'member'
    )
  ) {
    fail({
      code:
        'CLIENT_CONTEXT_MEMBERSHIP_REQUIRED',

      message:
        'Usuário sem vínculo ativo com a empresa do Companion.',

      status_code: 403,
      retryable: false,
    })
  }

  return data.role
}

async function loadCycle({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<{
  status: LeadStatus
  owner_user_id: string | null
  stage_entered_at: string
}> {
  const { data, error } =
    await admin
      .from('sales_cycles')
      .select(
        'id, company_id, owner_user_id, status, stage_entered_at',
      )
      .eq(
        'id',
        cycleId,
      )
      .eq(
        'company_id',
        companyId,
      )
      .maybeSingle()

  if (error) {
    fail({
      code:
        'CLIENT_CONTEXT_QUERY_FAILED',

      message:
        'Não foi possível carregar o ciclo comercial.',

      status_code: 500,
      retryable: true,
    })
  }

  if (!isRecord(data)) {
    fail({
      code:
        'CLIENT_CONTEXT_CYCLE_NOT_FOUND',

      message:
        'O ciclo comercial não foi encontrado para a empresa informada.',

      status_code: 404,
      retryable: false,
    })
  }

  if (
    data.id !== cycleId ||
    data.company_id !== companyId ||
    !isLeadStatus(
      data.status,
    ) ||
    typeof data.stage_entered_at !==
      'string'
  ) {
    fail({
      code:
        'CLIENT_CONTEXT_SCOPE_VIOLATION',

      message:
        'O ciclo retornado está fora do escopo solicitado.',

      status_code: 500,
      retryable: false,
    })
  }

  const ownerUserId =
    typeof data.owner_user_id ===
    'string'
      ? data.owner_user_id
      : null

  return {
    status:
      data.status,

    owner_user_id:
      ownerUserId,

    stage_entered_at:
      data.stage_entered_at,
  }
}

function validateCyclePermission({
  role,
  ownerUserId,
  userId,
}: {
  role: 'admin' | 'manager' | 'member'
  ownerUserId: string | null
  userId: string
}): void {
  const hasManagerAccess =
    role === 'admin' ||
    role === 'manager'

  if (
    !hasManagerAccess &&
    ownerUserId !== userId
  ) {
    fail({
      code:
        'CLIENT_CONTEXT_PERMISSION_DENIED',

      message:
        'Este ciclo não pertence à carteira do usuário.',

      status_code: 403,
      retryable: false,
    })
  }
}

async function loadMessages({
  admin,
  companyId,
  cycleId,
  conversationKey,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
}): Promise<
  CompanionClientMessageFact[]
> {
  const reconciliationResult =
    await admin
      .from(
        'conversation_message_reconciliation_state',
      )
      .select(
        'current_message_id',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .limit(
        MAX_CANONICAL_MESSAGES +
          1,
      )

  const reconciliationRows =
    getRows(
      reconciliationResult,
      'conversation_message_reconciliation_state',
    )

  if (
    reconciliationRows.length >
    MAX_CANONICAL_MESSAGES
  ) {
    fail({
      code:
        'CLIENT_CONTEXT_MESSAGE_LIMIT_EXCEEDED',

      message:
        `A conversa ultrapassa o limite de ${MAX_CANONICAL_MESSAGES} mensagens canônicas.`,

      status_code: 413,
      retryable: false,
    })
  }

  const currentMessageIds =
    reconciliationRows
      .map(
        (row) =>
          row.current_message_id,
      )
      .filter(
        (id): id is string | number =>
          typeof id === 'string' ||
          typeof id === 'number',
      )

  if (
    currentMessageIds.length === 0
  ) {
    return []
  }

  const messagesResult =
    await admin
      .from(
        'conversation_messages',
      )
      .select(
        'id, company_id, cycle_id, conversation_key, direction, occurred_at, is_deleted',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'conversation_key',
        conversationKey,
      )
      .in(
        'id',
        currentMessageIds,
      )

  const messageRows =
    getRows(
      messagesResult,
      'conversation_messages',
    )

  const facts:
    CompanionClientMessageFact[] =
      []

  for (
    const row of messageRows
  ) {
    if (
      row.is_deleted === true ||
      row.cycle_id !== cycleId ||
      row.company_id !== companyId ||
      row.conversation_key !==
        conversationKey
    ) {
      continue
    }

    if (
      (
        row.direction !==
          'incoming' &&
        row.direction !==
          'outgoing'
      ) ||
      typeof row.occurred_at !==
        'string'
    ) {
      continue
    }

    facts.push({
      direction:
        row.direction,

      occurred_at:
        row.occurred_at,
    })
  }

  return facts
}

async function loadCycleEvents({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<
  CompanionClientCycleEventFact[]
> {
  const result =
    await admin
      .from('cycle_events')
      .select(
        'event_type, occurred_at, metadata',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        cycleId,
      )
      .in(
        'event_type',
        CYCLE_EVENT_TYPES_OF_INTEREST,
      )
      .order(
        'occurred_at',
        {
          ascending:
            false,
        },
      )
      .limit(
        MAX_CYCLE_EVENTS,
      )

  const rows =
    getRows(
      result,
      'cycle_events',
    )

  return rows
    .filter(
      (row) =>
        typeof row.event_type ===
          'string' &&
        typeof row.occurred_at ===
          'string',
    )
    .map(
      (row) => {
        const metadata =
          isRecord(
            row.metadata,
          )
            ? row.metadata
            : {}

        return {
          event_type:
            row.event_type as string,

          occurred_at:
            row.occurred_at as string,

          from_status:
            typeof metadata.from_status ===
            'string'
              ? metadata.from_status
              : null,

          to_status:
            typeof metadata.to_status ===
            'string'
              ? metadata.to_status
              : null,
        }
      },
    )
}

async function loadActionEvents({
  admin,
  companyId,
  cycleId,
  requestingUserId,
  isAdminOrManager,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  requestingUserId: string
  isAdminOrManager: boolean
}): Promise<
  CompanionClientActionEventFact[]
> {
  const { data, error } =
    await admin.rpc(
      'rpc_list_companion_action_events',
      {
        p_company_id:
          companyId,

        p_requesting_user_id:
          requestingUserId,

        p_is_admin_or_manager:
          isAdminOrManager,

        p_cycle_id:
          cycleId,

        p_limit:
          MAX_ACTION_EVENTS,
      },
    )

  if (error) {
    // A telemetria de ações é um enriquecimento da timeline, não um dado
    // crítico de segurança — se a RPC falhar, a inteligência operacional
    // ainda deve funcionar sem essa parte, em vez de derrubar a resposta
    // inteira.
    return []
  }

  const rows =
    Array.isArray(data)
      ? data.filter(isRecord)
      : []

  return rows
    .filter(
      (row) =>
        typeof row.action_type ===
          'string' &&
        typeof row.occurred_at ===
          'string',
    )
    .map(
      (row) => ({
        action_type:
          row.action_type as string,

        occurred_at:
          row.occurred_at as string,
      }),
    )
}

async function loadSlaRule({
  admin,
  companyId,
  status,
}: {
  admin: SupabaseClient
  companyId: string
  status: LeadStatus
}): Promise<
  CompanionClientSlaRule | null
> {
  const { data, error } =
    await admin
      .from('sla_rules')
      .select(
        'company_id, status, target_minutes, warning_minutes, danger_minutes',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'status',
        status,
      )
      .maybeSingle()

  if (error) {
    // Diferente de "sem regra configurada" (data === null, sem erro): uma
    // falha na consulta não prova ausência de regra — o banco não
    // respondeu. Reportar como erro retryable em vez de silenciosamente
    // devolver `configured: false`, que esconderia um risco real de SLA
    // atrás de uma falha transitória de leitura.
    fail({
      code:
        'CLIENT_CONTEXT_QUERY_FAILED',

      message:
        'Não foi possível carregar a configuração de SLA da empresa.',

      status_code: 500,
      retryable: true,
    })
  }

  if (
    !isRecord(data) ||
    data.company_id !== companyId ||
    data.status !== status ||
    typeof data.target_minutes !==
      'number' ||
    typeof data.warning_minutes !==
      'number' ||
    typeof data.danger_minutes !==
      'number'
  ) {
    return null
  }

  return {
    status,

    target_minutes:
      data.target_minutes,

    warning_minutes:
      data.warning_minutes,

    danger_minutes:
      data.danger_minutes,
  }
}

export async function loadCompanionClientContext({
  admin,
  token,
  cycle_id,
  conversation_key,
  reference_time,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  cycle_id: unknown
  conversation_key: unknown
  reference_time: unknown
}): Promise<CompanionClientContext> {
  const companyId =
    normalizeUuid(
      token.company_id,
      'token.company_id',
    )

  const userId =
    normalizeUuid(
      token.sub,
      'token.sub',
    )

  const cycleId =
    normalizeUuid(
      cycle_id,
      'cycle_id',
    )

  const conversationKey =
    normalizeConversationKey(
      conversation_key,
    )

  const referenceTime =
    normalizeReferenceTime(
      reference_time,
    )

  const role =
    await validateMembership({
      admin,
      companyId,
      userId,
    })

  const cycle =
    await loadCycle({
      admin,
      companyId,
      cycleId,
    })

  validateCyclePermission({
    role,

    ownerUserId:
      cycle.owner_user_id,

    userId,
  })

  const isAdminOrManager =
    role === 'admin' ||
    role === 'manager'

  const [
    messages,
    cycleEvents,
    actionEvents,
    slaRule,
  ] = await Promise.all([
    loadMessages({
      admin,
      companyId,
      cycleId,
      conversationKey,
    }),

    loadCycleEvents({
      admin,
      companyId,
      cycleId,
    }),

    loadActionEvents({
      admin,
      companyId,
      cycleId,

      requestingUserId:
        userId,

      isAdminOrManager,
    }),

    loadSlaRule({
      admin,
      companyId,

      status:
        cycle.status,
    }),
  ])

  const relationship =
    computeCompanionClientRelationship({
      messages,

      reference_time:
        referenceTime,
    })

  const waiting =
    computeCompanionClientWaiting({
      messages,

      reference_time:
        referenceTime,

      cycle_status:
        cycle.status,
    })

  const timeline =
    buildCompanionClientTimeline({
      first_known_interaction_at:
        relationship.first_known_interaction_at,

      cycle_events:
        cycleEvents,

      action_events:
        actionEvents,
    })

  const sla =
    assessCompanionClientSla({
      cycle_status:
        cycle.status,

      stage_entered_at:
        cycle.stage_entered_at,

      reference_time:
        referenceTime,

      rule:
        slaRule,
    })

  return {
    contract_version:
      COMPANION_CLIENT_CONTEXT_CONTRACT_VERSION,

    generated_at:
      referenceTime,

    identity: {
      company_id:
        companyId,

      cycle_id:
        cycleId,

      conversation_key:
        conversationKey,

      current_status:
        cycle.status,
    },

    relationship,
    waiting,
    timeline,
    sla,
  }
}
