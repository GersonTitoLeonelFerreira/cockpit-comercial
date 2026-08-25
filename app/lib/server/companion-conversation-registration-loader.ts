import 'server-only'

import { createHash } from 'crypto'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionTokenPayload,
} from './companion-token'

// Carrega o snapshot canônico de uma conversa (company_id + cycle_id +
// conversation_key) para a ação manual "Registrar conversa". Independente
// da análise profunda (V2): não importa nada de
// app/lib/companion/stateful-copilot-* nem de
// app/lib/companion/stateful-communication*.
//
// A fonte de verdade é sempre conversation_messages via o ponteiro de
// versão vigente em conversation_message_reconciliation_state — o mesmo
// mecanismo já usado por companion-client-context-loader.ts. Mensagens
// editadas/deletadas/restauradas são resolvidas automaticamente porque o
// ponteiro sempre aponta para a versão atual de cada message_key.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MAX_CANONICAL_MESSAGES = 1000

export type CanonicalConversationMessage = {
  message_key: string
  version: number
  direction: 'incoming' | 'outgoing'
  occurred_at: string
  content_type: 'text' | 'audio'
  text: string | null
  is_deleted: boolean
}

export type CanonicalConversationSnapshot = {
  company_id: string
  cycle_id: string
  lead_id: string
  conversation_key: string
  messages: CanonicalConversationMessage[]
  message_count: number
  watermark: string
}

type JsonRecord = Record<string, unknown>

type QueryResult = {
  data: unknown
  error: {
    message?: string
  } | null
}

export class CompanionConversationRegistrationError extends Error {
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

    this.name = 'CompanionConversationRegistrationError'
    this.code = code
    this.status_code = status_code
    this.retryable = retryable
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
  throw new CompanionConversationRegistrationError({
    code,
    message,
    status_code,
    retryable,
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeUuid(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    fail({
      code: 'INVALID_CONVERSATION_REGISTRATION_ARGUMENT',
      message: `${path} precisa ser um UUID válido.`,
      status_code: 400,
      retryable: false,
    })
  }

  return value.trim().toLowerCase()
}

export function normalizeConversationKey(value: unknown): string {
  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_CONVERSATION_REGISTRATION_ARGUMENT',
      message: 'conversation_key precisa ser um texto.',
      status_code: 400,
      retryable: false,
    })
  }

  const normalized = value.trim()

  if (!normalized || normalized.length > 500) {
    fail({
      code: 'INVALID_CONVERSATION_REGISTRATION_ARGUMENT',
      message: 'conversation_key possui um valor inválido.',
      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function getRows(result: QueryResult, table: string): JsonRecord[] {
  if (result.error) {
    fail({
      code: 'CONVERSATION_REGISTRATION_QUERY_FAILED',
      message: `Não foi possível carregar dados de ${table}.`,
      status_code: 500,
      retryable: true,
    })
  }

  if (result.data === null || result.data === undefined) {
    return []
  }

  if (!Array.isArray(result.data)) {
    fail({
      code: 'CONVERSATION_REGISTRATION_QUERY_INVALID',
      message: `O banco retornou um formato inesperado para ${table}.`,
      status_code: 500,
      retryable: false,
    })
  }

  return result.data.filter(isRecord)
}

export async function validateMembership({
  admin,
  companyId,
  userId,
}: {
  admin: SupabaseClient
  companyId: string
  userId: string
}): Promise<'admin' | 'manager' | 'member'> {
  const { data, error } = await admin
    .from('company_memberships')
    .select('company_id, user_id, role, is_active')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    fail({
      code: 'CONVERSATION_REGISTRATION_QUERY_FAILED',
      message: 'Não foi possível validar o vínculo com a empresa.',
      status_code: 500,
      retryable: true,
    })
  }

  if (
    !isRecord(data) ||
    data.company_id !== companyId ||
    data.user_id !== userId ||
    (data.role !== 'admin' && data.role !== 'manager' && data.role !== 'member')
  ) {
    fail({
      code: 'CONVERSATION_REGISTRATION_MEMBERSHIP_REQUIRED',
      message: 'Usuário sem vínculo ativo com a empresa do Companion.',
      status_code: 403,
      retryable: false,
    })
  }

  return data.role
}

export async function loadCycle({
  admin,
  companyId,
  cycleId,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
}): Promise<{
  lead_id: string
  owner_user_id: string | null
}> {
  const { data, error } = await admin
    .from('sales_cycles')
    .select('id, company_id, lead_id, owner_user_id')
    .eq('id', cycleId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) {
    fail({
      code: 'CONVERSATION_REGISTRATION_QUERY_FAILED',
      message: 'Não foi possível carregar o ciclo comercial.',
      status_code: 500,
      retryable: true,
    })
  }

  if (!isRecord(data)) {
    fail({
      code: 'CONVERSATION_REGISTRATION_CYCLE_NOT_FOUND',
      message: 'O ciclo comercial não foi encontrado para a empresa informada.',
      status_code: 404,
      retryable: false,
    })
  }

  if (
    data.id !== cycleId ||
    data.company_id !== companyId ||
    typeof data.lead_id !== 'string'
  ) {
    fail({
      code: 'CONVERSATION_REGISTRATION_SCOPE_VIOLATION',
      message: 'O ciclo retornado está fora do escopo solicitado.',
      status_code: 500,
      retryable: false,
    })
  }

  const ownerUserId = typeof data.owner_user_id === 'string' ? data.owner_user_id : null

  return {
    lead_id: data.lead_id as string,
    owner_user_id: ownerUserId,
  }
}

export function validateCyclePermission({
  role,
  ownerUserId,
  userId,
}: {
  role: 'admin' | 'manager' | 'member'
  ownerUserId: string | null
  userId: string
}): void {
  const hasManagerAccess = role === 'admin' || role === 'manager'

  if (!hasManagerAccess && ownerUserId !== userId) {
    fail({
      code: 'CONVERSATION_REGISTRATION_PERMISSION_DENIED',
      message: 'Este ciclo não pertence à sua carteira.',
      status_code: 403,
      retryable: false,
    })
  }
}

export async function loadCanonicalMessages({
  admin,
  companyId,
  cycleId,
  conversationKey,
}: {
  admin: SupabaseClient
  companyId: string
  cycleId: string
  conversationKey: string
}): Promise<CanonicalConversationMessage[]> {
  const reconciliationResult = await admin
    .from('conversation_message_reconciliation_state')
    .select('current_message_id')
    .eq('company_id', companyId)
    .eq('conversation_key', conversationKey)
    .limit(MAX_CANONICAL_MESSAGES + 1)

  const reconciliationRows = getRows(
    reconciliationResult,
    'conversation_message_reconciliation_state',
  )

  if (reconciliationRows.length > MAX_CANONICAL_MESSAGES) {
    fail({
      code: 'CONVERSATION_REGISTRATION_MESSAGE_LIMIT_EXCEEDED',
      message: `A conversa ultrapassa o limite de ${MAX_CANONICAL_MESSAGES} mensagens canônicas.`,
      status_code: 413,
      retryable: false,
    })
  }

  const currentMessageIds = reconciliationRows
    .map((row) => row.current_message_id)
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')

  if (currentMessageIds.length === 0) {
    return []
  }

  const messagesResult = await admin
    .from('conversation_messages')
    .select(
      'id, company_id, cycle_id, conversation_key, message_key, version, direction, occurred_at, content_type, text_content, audio_transcription, is_deleted',
    )
    .eq('company_id', companyId)
    .eq('conversation_key', conversationKey)
    .in('id', currentMessageIds)

  const messageRows = getRows(messagesResult, 'conversation_messages')

  const messages: CanonicalConversationMessage[] = []

  for (const row of messageRows) {
    if (
      row.company_id !== companyId ||
      row.cycle_id !== cycleId ||
      row.conversation_key !== conversationKey
    ) {
      continue
    }

    if (
      typeof row.message_key !== 'string' ||
      typeof row.version !== 'number' ||
      (row.direction !== 'incoming' && row.direction !== 'outgoing') ||
      typeof row.occurred_at !== 'string' ||
      (row.content_type !== 'text' && row.content_type !== 'audio')
    ) {
      continue
    }

    const isDeleted = row.is_deleted === true

    const text = isDeleted
      ? null
      : row.content_type === 'audio'
        ? typeof row.audio_transcription === 'string' && row.audio_transcription.trim()
          ? row.audio_transcription.trim()
          : null
        : typeof row.text_content === 'string'
          ? row.text_content
          : null

    messages.push({
      message_key: row.message_key,
      version: row.version,
      direction: row.direction,
      occurred_at: row.occurred_at,
      content_type: row.content_type,
      text,
      is_deleted: isDeleted,
    })
  }

  messages.sort((left, right) => {
    const leftTime = Date.parse(left.occurred_at)
    const rightTime = Date.parse(right.occurred_at)

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.message_key.localeCompare(right.message_key)
  })

  return messages
}

export function computeConversationWatermark(
  messages: readonly CanonicalConversationMessage[],
): string {
  const lines = messages
    .map((message) => {
      const contentHash = createHash('sha256')
        .update(message.text ?? '')
        .digest('hex')

      return [
        message.message_key,
        String(message.version),
        message.direction,
        message.occurred_at,
        message.content_type,
        message.is_deleted ? 'deleted' : 'current',
        contentHash,
      ].join('|')
    })
    .sort()

  return createHash('sha256').update(lines.join('\n')).digest('hex')
}

export async function loadCanonicalConversationForRegistration({
  admin,
  token,
  cycle_id,
  conversation_key,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  cycle_id: unknown
  conversation_key: unknown
}): Promise<CanonicalConversationSnapshot> {
  const companyId = normalizeUuid(token.company_id, 'company_id')
  const cycleId = normalizeUuid(cycle_id, 'cycle_id')
  const conversationKey = normalizeConversationKey(conversation_key)

  const role = await validateMembership({
    admin,
    companyId,
    userId: token.sub,
  })

  const cycle = await loadCycle({
    admin,
    companyId,
    cycleId,
  })

  validateCyclePermission({
    role,
    ownerUserId: cycle.owner_user_id,
    userId: token.sub,
  })

  const messages = await loadCanonicalMessages({
    admin,
    companyId,
    cycleId,
    conversationKey,
  })

  const nonDeletedCount = messages.filter((message) => !message.is_deleted).length

  if (nonDeletedCount === 0) {
    fail({
      code: 'CONVERSATION_REGISTRATION_NO_MESSAGES',
      message: 'Não há mensagens canônicas para registrar nesta conversa.',
      status_code: 422,
      retryable: false,
    })
  }

  const watermark = computeConversationWatermark(messages)

  return {
    company_id: companyId,
    cycle_id: cycleId,
    lead_id: cycle.lead_id,
    conversation_key: conversationKey,
    messages,
    message_count: nonDeletedCount,
    watermark,
  }
}
