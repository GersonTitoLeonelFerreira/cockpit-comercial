import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  CompanionConversationRegistrationError,
  computeConversationWatermark,
  loadCanonicalMessages,
  loadCycle,
  normalizeConversationKey,
  normalizeUuid,
  validateCyclePermission,
  validateMembership,
} from './companion-conversation-registration-loader'

// Etapa 1 da reconstrução controlada do Companion — "Resumo persistente do
// lead": a fonte única de verdade sobre o que a Yolen já sabe, de forma
// resumida, sobre o relacionamento comercial com um lead até o último
// salvamento explícito do vendedor.
//
// Isolado de conversationAnalysis / deepAnalysisResult / suggested_message /
// current_state / commercial_relevance — nenhuma dessas fontes alimenta
// este módulo. É uma entidade própria: public.companion_lead_conversation_summaries.
//
// Reaproveita a resolução de identidade (membership + posse de ciclo) já
// usada por "Registrar conversa" (Fase 12A) em vez de duplicar a checagem
// de segurança.

const MAX_SUMMARY_LENGTH = 8000

export type CompanionLeadConversationSummary = {
  id: string
  company_id: string
  lead_id: string
  conversation_key: string
  summary: string
  version: number
  last_message_watermark: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export type CompanionLeadIdentity = {
  company_id: string
  lead_id: string
  cycle_id: string
  conversation_key: string
}

export type CompanionLeadSummarySaveResult =
  | {
      conflict: false
      current_version: number
      summary: CompanionLeadConversationSummary
    }
  | {
      conflict: true
      current_version: number
      summary: CompanionLeadConversationSummary | null
    }

type JsonRecord = Record<string, unknown>

export class CompanionLeadSummaryError extends Error {
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

    this.name = 'CompanionLeadSummaryError'
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
  throw new CompanionLeadSummaryError({
    code,
    message,
    status_code,
    retryable,
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// A resolução de identidade reaproveita a checagem de membership/posse de
// ciclo de "Registrar conversa", que lança CompanionConversationRegistrationError.
// Esta função adapta esses erros para o tipo próprio deste módulo, mantendo
// um único tipo de erro para quem chama a store do resumo persistente.
async function withAdaptedErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof CompanionConversationRegistrationError) {
      fail({
        code: error.code.replace('CONVERSATION_REGISTRATION', 'LEAD_SUMMARY'),
        message: error.message,
        status_code: error.status_code,
        retryable: error.retryable,
      })
    }

    throw error
  }
}

export async function resolveCompanionLeadIdentity({
  admin,
  token,
  cycle_id,
  conversation_key,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  cycle_id: unknown
  conversation_key: unknown
}): Promise<CompanionLeadIdentity> {
  return withAdaptedErrors(async () => {
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

    return {
      company_id: companyId,
      lead_id: cycle.lead_id,
      cycle_id: cycleId,
      conversation_key: conversationKey,
    }
  })
}

function normalizeSummaryRow(data: unknown): CompanionLeadConversationSummary {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.company_id !== 'string' ||
    typeof data.lead_id !== 'string' ||
    typeof data.conversation_key !== 'string' ||
    typeof data.summary !== 'string' ||
    typeof data.version !== 'number' ||
    typeof data.last_message_watermark !== 'string' ||
    typeof data.created_at !== 'string' ||
    typeof data.updated_at !== 'string' ||
    typeof data.created_by !== 'string' ||
    typeof data.updated_by !== 'string'
  ) {
    fail({
      code: 'LEAD_SUMMARY_QUERY_INVALID',
      message: 'O banco retornou um formato inesperado para o resumo do lead.',
      status_code: 500,
      retryable: false,
    })
  }

  return {
    id: data.id,
    company_id: data.company_id,
    lead_id: data.lead_id,
    conversation_key: data.conversation_key,
    summary: data.summary,
    version: data.version,
    last_message_watermark: data.last_message_watermark,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
    updated_by: data.updated_by,
  }
}

export async function getCompanionLeadConversationSummary({
  admin,
  companyId,
  leadId,
}: {
  admin: SupabaseClient
  companyId: string
  leadId: string
}): Promise<CompanionLeadConversationSummary | null> {
  const { data, error } = await admin
    .from('companion_lead_conversation_summaries')
    .select(
      'id, company_id, lead_id, conversation_key, summary, version, last_message_watermark, created_at, updated_at, created_by, updated_by',
    )
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .maybeSingle()

  if (error) {
    fail({
      code: 'LEAD_SUMMARY_QUERY_FAILED',
      message: 'Não foi possível carregar o resumo persistente do lead.',
      status_code: 500,
      retryable: true,
    })
  }

  if (!data) {
    return null
  }

  return normalizeSummaryRow(data)
}

function normalizeSummaryText(value: unknown): string {
  if (typeof value !== 'string') {
    fail({
      code: 'LEAD_SUMMARY_INVALID_SUMMARY',
      message: 'summary precisa ser um texto.',
      status_code: 400,
      retryable: false,
    })
  }

  const normalized = value.trim()

  if (!normalized || normalized.length > MAX_SUMMARY_LENGTH) {
    fail({
      code: 'LEAD_SUMMARY_INVALID_SUMMARY',
      message: `summary é obrigatório e deve ter até ${MAX_SUMMARY_LENGTH} caracteres.`,
      status_code: 400,
      retryable: false,
    })
  }

  return normalized
}

function normalizeExpectedVersion(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail({
      code: 'LEAD_SUMMARY_INVALID_EXPECTED_VERSION',
      message: 'expected_version precisa ser um inteiro não negativo ou null.',
      status_code: 400,
      retryable: false,
    })
  }

  return value
}

type SaveRpcRow = {
  id: string | null
  company_id: string
  lead_id: string
  conversation_key: string | null
  summary: string | null
  version: number | null
  last_message_watermark: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  updated_by: string | null
  conflict: boolean
  current_version: number
}

// Salva uma nova versão do resumo persistente do lead — sempre por ação
// explícita do vendedor (nunca automático). Calcula o watermark a partir
// do snapshot canônico vigente da conversa vinculada (mesmo mecanismo do
// "Registrar conversa"), mas — diferente daquele fluxo — não exige que a
// conversa já tenha mensagens: um lead recém-criado, sem histórico ainda
// capturado, pode receber seu primeiro resumo manual.
export async function saveCompanionLeadConversationSummary({
  admin,
  identity,
  actorUserId,
  summary,
  expectedVersion,
}: {
  admin: SupabaseClient
  identity: CompanionLeadIdentity
  actorUserId: string
  summary: unknown
  expectedVersion: unknown
}): Promise<CompanionLeadSummarySaveResult> {
  const summaryText = normalizeSummaryText(summary)
  const expectedVersionValue = normalizeExpectedVersion(expectedVersion)

  const messages = await withAdaptedErrors(() =>
    loadCanonicalMessages({
      admin,
      companyId: identity.company_id,
      cycleId: identity.cycle_id,
      conversationKey: identity.conversation_key,
    }),
  )

  const watermark = computeConversationWatermark(messages)

  const { data, error } = await admin.rpc(
    'rpc_save_companion_lead_conversation_summary',
    {
      p_company_id: identity.company_id,
      p_lead_id: identity.lead_id,
      p_actor_user_id: actorUserId,
      p_conversation_key: identity.conversation_key,
      p_summary: summaryText,
      p_expected_version: expectedVersionValue,
      p_last_message_watermark: watermark,
    },
  )

  if (error) {
    fail({
      code: 'LEAD_SUMMARY_PERSIST_FAILED',
      message: error.message || 'Não foi possível salvar o resumo do lead.',
      status_code: 500,
      retryable: true,
    })
  }

  const rows = Array.isArray(data) ? data : data ? [data] : []
  const result = rows[0] as SaveRpcRow | undefined

  if (!result) {
    fail({
      code: 'LEAD_SUMMARY_EMPTY_RESULT',
      message: 'O salvamento não retornou confirmação do banco.',
      status_code: 500,
      retryable: true,
    })
  }

  if (result.conflict) {
    return {
      conflict: true,
      current_version: result.current_version,
      summary: result.id ? normalizeSummaryRow(result) : null,
    }
  }

  return {
    conflict: false,
    current_version: result.current_version,
    summary: normalizeSummaryRow(result),
  }
}
