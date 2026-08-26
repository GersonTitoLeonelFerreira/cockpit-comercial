import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  computeConversationWatermark,
  isPendingAudioTranscription,
  loadCanonicalMessages,
  toCanonicalMessagePromptText,
  type CanonicalConversationMessage,
} from '../../../lib/server/companion-conversation-registration-loader'

import {
  CompanionLeadSummaryError,
  getCompanionLeadConversationSummary,
  resolveCompanionLeadIdentity,
  type CompanionLeadConversationSummary,
  type CompanionLeadIdentity,
} from '../../../lib/server/companion-lead-summary-store'

import { verifyCompanionRequestToken } from '../../../lib/server/companion-token'

import {
  createStatefulCopilotOpenAIProvider,
} from '../../../lib/companion/stateful-copilot-openai-provider'

type LeadSummaryBody = {
  cycle_id?: unknown
  conversation_key?: unknown
}

type JsonRecord = Record<string, unknown>

type LegacyHistoryEntry = {
  created_at: string
  conversation_summary: string
  customer_interests: string[]
  objections: string[]
}

type RegisteredConversationHistoryEntry = {
  cycle_id: string
  conversation_key: string
  watermark: string
  summary_text: string
  message_count: number
  created_at: string
}

type SummarySource =
  | 'canonical'
  | 'canonical_plus_conversation'
  | 'canonical_plus_history'
  | 'canonical_plus_history_plus_conversation'
  | 'registered_history'
  | 'registered_history_plus_conversation'
  | 'legacy_history'
  | 'legacy_history_plus_conversation'
  | 'conversation_only'
  | 'empty'

const LEAD_SUMMARY_PROMPT_VERSION = 'lead-summary-v1'
const LEAD_SUMMARY_CONTRACT_VERSION = 'lead-summary-v1'
const MAX_WORKING_SUMMARY_LENGTH = 8000

const LEAD_SUMMARY_STRUCTURED_OUTPUT_FORMAT = {
  type: 'json_schema',
  name: 'yolen_lead_working_summary_v1',
  description:
    'Resumo factual consolidado do relacionamento comercial de um lead.',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      working_summary: {
        type: 'string',
        description:
          'Resumo factual consolidado, sem recomendação, coaching ou mensagem sugerida.',
      },
    },
    required: ['working_summary'],
  },
} as const

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')

  const allowOrigin =
    allowedOrigins.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeString)
    .filter((item): item is string => Boolean(item))
}

function normalizeLegacyHistoryRows(data: unknown): LegacyHistoryEntry[] {
  if (!Array.isArray(data)) {
    return []
  }

  const entries: LegacyHistoryEntry[] = []

  for (const row of data) {
    if (!isRecord(row) || typeof row.created_at !== 'string' || !isRecord(row.coaching)) {
      continue
    }

    const conversationSummary = normalizeString(row.coaching.conversation_summary)

    if (!conversationSummary) {
      continue
    }

    entries.push({
      created_at: row.created_at,
      conversation_summary: conversationSummary,
      customer_interests: normalizeStringArray(row.coaching.customer_interests),
      objections: normalizeStringArray(row.coaching.objections),
    })
  }

  entries.sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))

  return entries
}

function dedupeLegacyHistory(entries: LegacyHistoryEntry[]): LegacyHistoryEntry[] {
  const seen = new Set<string>()
  const result: LegacyHistoryEntry[] = []

  for (const entry of entries) {
    const key = JSON.stringify({
      conversation_summary: entry.conversation_summary,
      customer_interests: entry.customer_interests,
      objections: entry.objections,
    })

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(entry)
  }

  return result
}

function normalizeRegisteredHistoryRows(
  data: unknown,
): RegisteredConversationHistoryEntry[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data
    .filter(isRecord)
    .map((row) => ({
      cycle_id: normalizeString(row.cycle_id),
      conversation_key:
        normalizeString(row.conversation_key),
      watermark: normalizeString(row.watermark),
      summary_text:
        normalizeString(row.summary_text),
      message_count:
        typeof row.message_count === 'number'
          ? row.message_count
          : null,
      created_at: normalizeString(row.created_at),
    }))
    .filter(
      (
        row,
      ): row is RegisteredConversationHistoryEntry =>
        Boolean(
          row.cycle_id &&
            row.conversation_key &&
            row.watermark &&
            row.summary_text &&
            row.created_at &&
            row.message_count !== null,
        ),
    )
    .sort(
      (left, right) =>
        Date.parse(left.created_at) -
        Date.parse(right.created_at),
    )
}

function dedupeRegisteredHistory(
  entries: RegisteredConversationHistoryEntry[],
) {
  // Cada registro resume o snapshot completo daquela conversa. Portanto,
  // a versão mais recente por conversation_key substitui os marcos antigos
  // da mesma conversa, sem apagar registros de outras conversas do lead.
  const latestByConversation = new Map<
    string,
    RegisteredConversationHistoryEntry
  >()

  for (const entry of entries) {
    latestByConversation.set(
      entry.conversation_key,
      entry,
    )
  }

  const seenSummaries = new Set<string>()

  return Array.from(
    latestByConversation.values(),
  )
    .sort(
      (left, right) =>
        Date.parse(left.created_at) -
        Date.parse(right.created_at),
    )
    .filter((entry) => {
      const key = entry.summary_text
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('pt-BR')

      if (seenSummaries.has(key)) {
        return false
      }

      seenSummaries.add(key)
      return true
    })
}

async function loadLegacyHistory({
  admin,
  identity,
}: {
  admin: SupabaseClient
  identity: CompanionLeadIdentity
}): Promise<LegacyHistoryEntry[]> {
  const { data, error } = await admin
    .from('ai_coaching_notes')
    .select('created_at, coaching')
    .eq('company_id', identity.company_id)
    .eq('cycle_id', identity.cycle_id)

  if (error) {
    throw new CompanionLeadSummaryError({
      code: 'LEAD_SUMMARY_HISTORY_FAILED',
      message: 'Não foi possível carregar o histórico comercial já salvo deste lead.',
      status_code: 500,
      retryable: true,
    })
  }

  return normalizeLegacyHistoryRows(data)
}

async function loadRegisteredHistory({
  admin,
  identity,
}: {
  admin: SupabaseClient
  identity: CompanionLeadIdentity
}): Promise<RegisteredConversationHistoryEntry[]> {
  const { data, error } = await admin
    .from('companion_conversation_registrations')
    .select(
      'cycle_id, conversation_key, watermark, summary_text, message_count, created_at',
    )
    .eq('company_id', identity.company_id)
    .eq('lead_id', identity.lead_id)

  if (error) {
    throw new CompanionLeadSummaryError({
      code: 'LEAD_SUMMARY_REGISTERED_HISTORY_FAILED',
      message:
        'Não foi possível carregar as conversas registradas deste lead.',
      status_code: 500,
      retryable: true,
    })
  }

  return normalizeRegisteredHistoryRows(data)
}

async function loadMessagesForSummary({
  admin,
  identity,
}: {
  admin: SupabaseClient
  identity: CompanionLeadIdentity
}): Promise<CanonicalConversationMessage[]> {
  try {
    return await loadCanonicalMessages({
      admin,
      companyId: identity.company_id,
      cycleId: identity.cycle_id,
      conversationKey: identity.conversation_key,
    })
  } catch {
    throw new CompanionLeadSummaryError({
      code: 'LEAD_SUMMARY_MESSAGES_FAILED',
      message: 'Não foi possível carregar as mensagens atuais desta conversa.',
      status_code: 500,
      retryable: true,
    })
  }
}

function getUsableMessages(messages: CanonicalConversationMessage[]) {
  return messages.filter((message) => {
    if (message.is_deleted) {
      return false
    }

    // Uma mensagem de áudio ainda sem transcrição continua sendo um turno
    // real da conversa: mantê-la aqui (com um marcador técnico, nunca com
    // conteúdo inventado) evita que ela vire um buraco silencioso entre as
    // mensagens de texto vizinhas.
    if (message.content_type === 'audio') {
      return true
    }

    return typeof message.text === 'string' && message.text.trim().length > 0
  })
}

function getMessagesAfter(
  messages: CanonicalConversationMessage[],
  isoTimestamp: string | null,
) {
  if (!isoTimestamp) {
    return messages
  }

  const threshold = Date.parse(isoTimestamp)

  if (!Number.isFinite(threshold)) {
    return messages
  }

  return messages.filter((message) => Date.parse(message.occurred_at) > threshold)
}

function formatHistoryForPrompt(entries: LegacyHistoryEntry[]) {
  return entries.map((entry) => ({
    created_at: entry.created_at,
    conversation_summary: entry.conversation_summary,
    customer_interests: entry.customer_interests,
    objections: entry.objections,
  }))
}

function formatRegisteredHistoryForPrompt(
  entries: RegisteredConversationHistoryEntry[],
) {
  return entries.map((entry) => ({
    occurred_at: entry.created_at,
    conversation_key: entry.conversation_key,
    summary: entry.summary_text,
    message_count: entry.message_count,
  }))
}

function formatMessagesForPrompt(messages: CanonicalConversationMessage[]) {
  return messages.map((message) => ({
    occurred_at: message.occurred_at,
    speaker: message.direction === 'incoming' ? 'cliente' : 'vendedor',
    kind: message.content_type,
    text: toCanonicalMessagePromptText(message),
  }))
}

function resolveSource({
  savedSummary,
  registeredHistory,
  legacyHistory,
  messagesForPrompt,
  needsComposition,
}: {
  savedSummary: CompanionLeadConversationSummary | null
  registeredHistory: RegisteredConversationHistoryEntry[]
  legacyHistory: LegacyHistoryEntry[]
  messagesForPrompt: CanonicalConversationMessage[]
  needsComposition: boolean
}): SummarySource {
  if (savedSummary) {
    if (
      needsComposition &&
      registeredHistory.length > 0 &&
      messagesForPrompt.length > 0
    ) {
      return 'canonical_plus_history_plus_conversation'
    }

    if (
      needsComposition &&
      registeredHistory.length > 0
    ) {
      return 'canonical_plus_history'
    }

    return needsComposition
      ? 'canonical_plus_conversation'
      : 'canonical'
  }

  if (registeredHistory.length > 0) {
    return messagesForPrompt.length > 0
      ? 'registered_history_plus_conversation'
      : 'registered_history'
  }

  if (legacyHistory.length > 0) {
    return messagesForPrompt.length > 0
      ? 'legacy_history_plus_conversation'
      : 'legacy_history'
  }

  if (messagesForPrompt.length > 0) {
    return 'conversation_only'
  }

  return 'empty'
}

async function composeWorkingSummary({
  savedSummary,
  registeredHistory,
  legacyHistory,
  messages,
}: {
  savedSummary: CompanionLeadConversationSummary | null
  registeredHistory: RegisteredConversationHistoryEntry[]
  legacyHistory: LegacyHistoryEntry[]
  messages: CanonicalConversationMessage[]
}): Promise<string | null> {
  if (
    !savedSummary &&
    registeredHistory.length === 0 &&
    legacyHistory.length === 0 &&
    messages.length === 0
  ) {
    return null
  }

  const provider = createStatefulCopilotOpenAIProvider({
    timeout_ms: 45_000,
    max_output_tokens: 1800,
  })

  const response = await provider({
    prompt_version: LEAD_SUMMARY_PROMPT_VERSION,
    output_contract_version: LEAD_SUMMARY_CONTRACT_VERSION,
    system_prompt: [
      'Você é o motor V2 de resumo factual do Yolen Companion.',
      'Produza um único resumo consolidado em português do Brasil.',
      'O resumo deve registrar fatos do relacionamento: necessidades, dores, interesses, produtos/serviços/propostas discutidos, valores quando explicitamente registrados, objeções, dúvidas, critérios de decisão, compromissos, pendências e acontecimentos comerciais relevantes.',
      'Preserve fatos históricos ainda relevantes mesmo quando a conversa mais recente for pessoal, neutra ou operacional.',
      'O resumo persistente salvo é a memória consolidada prioritária e deve ser usado como base quando existir.',
      'Os registros confirmados de conversa são marcos históricos factuais. Eles complementam a memória, mas não substituem silenciosamente o resumo persistente salvo.',
      'Uma conversa registrada pode resumir mensagens também presentes no snapshot canônico. Una o fato uma única vez e nunca duplique informação por aparecer em mais de uma fonte.',
      'Não transforme silêncio ou conversa pessoal em perda de interesse.',
      'Não invente fatos e não repita a mesma informação em frases diferentes.',
      'Quando houver informação nova que contradiga uma antiga, prefira a informação explícita mais recente e descreva a mudança quando isso for importante.',
      'Não inclua coaching do vendedor, avaliação de condução, próximo passo, recomendação, estratégia ou mensagem sugerida.',
      'Uma mensagem marcada como "[mensagem de áudio deste participante ainda sem transcrição disponível]" representa um áudio real que ainda não foi transcrito: nunca invente, presuma ou infira o que foi dito nele. Quando isso afetar a compreensão do momento comercial, registre no resumo que existe um áudio pendente de transcrição, sem atribuir conteúdo a ele.',
      'Se houver apenas conversa pessoal e nenhum histórico comercial, descreva isso factualmente.',
      `O texto final deve ter no máximo ${MAX_WORKING_SUMMARY_LENGTH} caracteres.`,
    ].join('\n'),
    user_prompt: JSON.stringify({
      saved_summary: savedSummary?.summary ?? null,
      registered_conversation_history:
        formatRegisteredHistoryForPrompt(
          registeredHistory,
        ),
      legacy_yolen_history: formatHistoryForPrompt(legacyHistory),
      current_or_new_messages: formatMessagesForPrompt(messages),
    }),
    structured_output_format: LEAD_SUMMARY_STRUCTURED_OUTPUT_FORMAT,
  })

  if (typeof response.content !== 'string') {
    throw new CompanionLeadSummaryError({
      code: 'LEAD_SUMMARY_COMPOSE_INVALID_OUTPUT',
      message: 'A IA não retornou um resumo utilizável.',
      status_code: 502,
      retryable: true,
    })
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(response.content)
  } catch {
    throw new CompanionLeadSummaryError({
      code: 'LEAD_SUMMARY_COMPOSE_INVALID_JSON',
      message: 'A IA retornou um formato inválido para o resumo.',
      status_code: 502,
      retryable: true,
    })
  }

  const workingSummary =
    isRecord(parsed) ? normalizeString(parsed.working_summary) : null

  if (!workingSummary || workingSummary.length > MAX_WORKING_SUMMARY_LENGTH) {
    throw new CompanionLeadSummaryError({
      code: 'LEAD_SUMMARY_COMPOSE_INVALID_SUMMARY',
      message: 'A IA retornou um resumo fora do contrato esperado.',
      status_code: 502,
      retryable: true,
    })
  }

  return workingSummary
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request)

  const token = verifyCompanionRequestToken(request)

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_COMPANION_SESSION',
        error: 'Sessão do Companion inválida ou expirada.',
      },
      {
        status: 401,
        headers: corsHeaders,
      },
    )
  }

  const body = (await request.json().catch(() => ({}))) as LeadSummaryBody

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        code: 'LEAD_SUMMARY_SERVER_NOT_CONFIGURED',
        error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  try {
    const identity = await resolveCompanionLeadIdentity({
      admin,
      token,
      cycle_id: body.cycle_id,
      conversation_key: body.conversation_key,
    })

    const [
      summary,
      registeredHistoryRaw,
      legacyHistoryRaw,
      canonicalMessages,
    ] = await Promise.all([
      getCompanionLeadConversationSummary({
        admin,
        companyId: identity.company_id,
        leadId: identity.lead_id,
      }),
      loadRegisteredHistory({
        admin,
        identity,
      }),
      loadLegacyHistory({
        admin,
        identity,
      }),
      loadMessagesForSummary({
        admin,
        identity,
      }),
    ])

    const registeredHistory =
      dedupeRegisteredHistory(
        registeredHistoryRaw,
      )
    const legacyHistory = dedupeLegacyHistory(legacyHistoryRaw)
    const registeredSummaryKeys = new Set(
      registeredHistory.map((entry) =>
        entry.summary_text
          .replace(/\s+/g, ' ')
          .trim()
          .toLocaleLowerCase('pt-BR'),
      ),
    )
    const legacyHistoryWithoutRegisteredDuplicates =
      legacyHistory.filter(
        (entry) =>
          !registeredSummaryKeys.has(
            entry.conversation_summary
              .replace(/\s+/g, ' ')
              .trim()
              .toLocaleLowerCase('pt-BR'),
          ),
      )
    const usableMessages = getUsableMessages(canonicalMessages)
    const currentWatermark = computeConversationWatermark(canonicalMessages)
    const latestCurrentRegistration =
      registeredHistory
        .filter(
          (entry) =>
            entry.conversation_key ===
            identity.conversation_key,
        )
        .at(-1) ?? null

    let messagesForPrompt: CanonicalConversationMessage[] = []
    let registeredHistoryForPrompt:
      RegisteredConversationHistoryEntry[] = []
    let workingSummary: string | null = null
    let needsComposition = false

    if (summary) {
      const watermarkChanged = summary.last_message_watermark !== currentWatermark
      registeredHistoryForPrompt =
        registeredHistory.filter((entry) => {
          if (
            Date.parse(entry.created_at) <=
            Date.parse(summary.updated_at)
          ) {
            return false
          }

          // O mesmo snapshot já consolidado no resumo persistente não vira
          // uma alteração só porque o vendedor também o registrou no log.
          return !(
            entry.conversation_key ===
              identity.conversation_key &&
            entry.watermark === currentWatermark &&
            summary.last_message_watermark ===
              currentWatermark
          )
        })

      if (
        (!watermarkChanged ||
          usableMessages.length === 0) &&
        registeredHistoryForPrompt.length === 0
      ) {
        workingSummary = summary.summary
      } else {
        const currentRegistrationIsNewer =
          latestCurrentRegistration &&
          Date.parse(
            latestCurrentRegistration.created_at,
          ) > Date.parse(summary.updated_at)

        const currentConversationAnchor =
          currentRegistrationIsNewer
            ? latestCurrentRegistration.created_at
            : summary.updated_at

        if (watermarkChanged) {
          messagesForPrompt = getMessagesAfter(
            usableMessages,
            currentConversationAnchor,
          )
        }

        // Uma edição/restauração antiga também muda o watermark. Se nada ficou
        // cronologicamente "depois" do resumo, mande o snapshot canônico atual
        // inteiro para que a IA consiga reconciliar a mudança sem perder fatos.
        if (
          watermarkChanged &&
          usableMessages.length > 0 &&
          messagesForPrompt.length === 0 &&
          latestCurrentRegistration?.watermark !==
            currentWatermark
        ) {
          messagesForPrompt = usableMessages
        }

        needsComposition = true
        workingSummary = await composeWorkingSummary({
          savedSummary: summary,
          registeredHistory:
            registeredHistoryForPrompt,
          legacyHistory: [],
          messages: messagesForPrompt,
        })
      }
    } else if (registeredHistory.length > 0) {
      registeredHistoryForPrompt =
        registeredHistory

      if (
        latestCurrentRegistration?.watermark !==
        currentWatermark
      ) {
        messagesForPrompt =
          latestCurrentRegistration
            ? getMessagesAfter(
                usableMessages,
                latestCurrentRegistration.created_at,
              )
            : usableMessages

        if (
          latestCurrentRegistration &&
          usableMessages.length > 0 &&
          messagesForPrompt.length === 0
        ) {
          messagesForPrompt = usableMessages
        }
      }

      if (
        registeredHistoryForPrompt.length === 1 &&
        legacyHistoryWithoutRegisteredDuplicates.length === 0 &&
        messagesForPrompt.length === 0
      ) {
        workingSummary =
          registeredHistoryForPrompt[0].summary_text
      } else {
        needsComposition = true
        workingSummary = await composeWorkingSummary({
          savedSummary: null,
          registeredHistory:
            registeredHistoryForPrompt,
          legacyHistory:
            legacyHistoryWithoutRegisteredDuplicates,
          messages: messagesForPrompt,
        })
      }
    } else if (
      legacyHistoryWithoutRegisteredDuplicates.length > 0
    ) {
      const latestHistoryAt =
        legacyHistoryWithoutRegisteredDuplicates
          .at(-1)?.created_at ?? null
      messagesForPrompt = getMessagesAfter(
        usableMessages,
        latestHistoryAt,
      )
      needsComposition = true
      workingSummary = await composeWorkingSummary({
        savedSummary: null,
        registeredHistory: [],
        legacyHistory:
          legacyHistoryWithoutRegisteredDuplicates,
        messages: messagesForPrompt,
      })
    } else if (usableMessages.length > 0) {
      messagesForPrompt = usableMessages
      needsComposition = true
      workingSummary = await composeWorkingSummary({
        savedSummary: null,
        registeredHistory: [],
        legacyHistory: [],
        messages: messagesForPrompt,
      })
    }

    const source = resolveSource({
      savedSummary: summary,
      registeredHistory:
        registeredHistoryForPrompt,
      legacyHistory:
        legacyHistoryWithoutRegisteredDuplicates,
      messagesForPrompt,
      needsComposition,
    })

    const hasUnsavedChanges = Boolean(
      workingSummary &&
        (!summary ||
          summary.last_message_watermark !== currentWatermark ||
          workingSummary !== summary.summary),
    )

    const pendingAudioTranscriptionCount = canonicalMessages.filter(
      isPendingAudioTranscription,
    ).length

    return NextResponse.json(
      {
        ok: true,
        data: {
          identity,
          summary,
          working_summary: workingSummary,
          working_summary_source: source,
          has_unsaved_changes: hasUnsavedChanges,
          current_message_watermark: currentWatermark,
          registered_history_count:
            registeredHistoryRaw.length,
          registered_history_distinct_count:
            registeredHistory.length,
          legacy_history_count: legacyHistoryRaw.length,
          legacy_history_distinct_count: legacyHistory.length,
          messages_used_count: messagesForPrompt.length,
          pending_audio_transcription_count:
            pendingAudioTranscriptionCount,
        },
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
  } catch (error) {
    if (error instanceof CompanionLeadSummaryError) {
      console.error('[LEAD_SUMMARY_API] fetch failed', {
        code: error.code,
        status_code: error.status_code,
      })

      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          retryable: error.retryable,
        },
        {
          status: error.status_code,
          headers: corsHeaders,
        },
      )
    }

    console.error(
      '[LEAD_SUMMARY_API] fetch unexpected error',
      error instanceof Error ? error.name : 'unknown',
    )

    return NextResponse.json(
      {
        ok: false,
        code: 'LEAD_SUMMARY_COMPOSE_FAILED',
        error: 'Não foi possível atualizar o resumo deste lead.',
        retryable: true,
      },
      {
        status: 502,
        headers: corsHeaders,
      },
    )
  }
}
