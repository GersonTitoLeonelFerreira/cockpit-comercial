import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { after, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { analyzeConversationWithCopilotDetailed } from '@/app/lib/ai/sales-copilot'
import { generateSalesCoaching } from '@/app/lib/ai/sales-coaching'
import { resolveCompanionEngineVersion } from '@/app/lib/companion/engine-version'
import {
  resolveStatefulCopilotActivationGate,
} from '@/app/lib/companion/stateful-copilot-activation-gate'
import {
  createStatefulCopilotServerRuntimeOrchestrator,
} from '@/app/lib/server/stateful-copilot-runtime-orchestrator'
import {
  selectStructuredMessageBatch,
  shouldForceReanalysis,
} from '@/app/lib/companion/message-selection'
import type { AICoaching } from '@/app/types/ai-coaching'
import type {
  AISalesContext,
  AISalesRecentEvent,
  AISalesSuggestion,
  AnalyzeConversationResponse,
  ConversationSource,
} from '@/app/types/ai-sales'
import type { LeadStatus } from '@/app/types/sales_cycles'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

type AnalyzeCompanionBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  device_key?: unknown
  conversation_text?: unknown
  messages?: unknown
  source?: unknown
  audio_count?: unknown
  force_reanalysis?: unknown
  message_snapshot_hash?: unknown
}

const runStatefulCopilotRuntime =
  createStatefulCopilotServerRuntimeOrchestrator()

type CompanionMessageDirection =
  | 'incoming'
  | 'outgoing'

type CompanionMessage = {
  id: string
  timestamp_ms: number
  timestamp_label: string
  date_key: string
  direction: CompanionMessageDirection
  sender: string | null
  text: string
  has_audio: boolean
  audio_transcription: string | null
}

type CompanionMessageCursor = {
  has_cursor: boolean
  last_message_timestamp_ms: number
  last_message_id: string | null
  processed_message_ids: string[]
}


type JsonRecord = Record<string, unknown>

type CompanionQueryError = {
  message?: string
}

type SavedCompanionCoaching = {
  id: string
  occurred_at: string
  reused?: boolean
  incremental?: boolean
  analyzed_character_count?: number
  audio_count?: number
  has_audio_without_transcription?: boolean
}

type InsertResult = {
  error: CompanionQueryError | null
}

type InsertSingleResult = {
  data: JsonRecord | null
  error: CompanionQueryError | null
}

type InsertSelectBuilder = {
  single: () => PromiseLike<InsertSingleResult>
}

type InsertBuilder = PromiseLike<InsertResult> & {
  select: (columns: string) => InsertSelectBuilder
}

type CompanionWriteTable = {
  insert: (values: JsonRecord) => InsertBuilder
}

type CompanionWriteClient = {
  from: (table: 'ai_coaching_notes' | 'cycle_events') => CompanionWriteTable
}


type ExistingCoachingQueryResult = {
  data: JsonRecord | null
  error: CompanionQueryError | null
}

type ExistingCoachingQueryBuilder = {
  eq: (column: string, value: string) => ExistingCoachingQueryBuilder
  order: (
    column: string,
    options?: {
      ascending?: boolean
    },
  ) => ExistingCoachingQueryBuilder
  limit: (count: number) => ExistingCoachingQueryBuilder
  maybeSingle: () => PromiseLike<ExistingCoachingQueryResult>
}

type ExistingCoachingTable = {
  select: (columns: string) => ExistingCoachingQueryBuilder
}


type CompanionReadClient = {
  from: (table: 'ai_coaching_notes') => ExistingCoachingTable
}

type ExistingCompanionCoaching = SavedCompanionCoaching & {
  yolenDecision: JsonRecord | null
  coaching: JsonRecord | null
}

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

function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    value === 'novo' ||
    value === 'contato' ||
    value === 'respondeu' ||
    value === 'negociacao' ||
    value === 'pausado' ||
    value === 'cancelado' ||
    value === 'ganho' ||
    value === 'perdido'
  )
}

function isConversationSource(value: unknown): value is ConversationSource {
  return value === 'whatsapp' || value === 'phone_summary' || value === 'notes'
}

function getTokenSecret() {
  const secret =
    process.env.COMPANION_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!secret) {
    throw new Error(
      'ENV faltando: COMPANION_TOKEN_SECRET, SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  return secret
}

function decodeBase64UrlJson<T>(value: string): T {
  const json = Buffer.from(value, 'base64url').toString('utf8')
  return JSON.parse(json) as T
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getTokenSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function safeCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return timingSafeEqual(aBuffer, bBuffer)
}

function verifyCompanionToken(request: Request): CompanionTokenPayload | null {
  const authorization = request.headers.get('authorization') ?? ''

  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.replace('Bearer ', '').trim()
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature = signPayload(encodedPayload)

  if (!safeCompare(signature, expectedSignature)) {
    return null
  }

  const payload = decodeBase64UrlJson<CompanionTokenPayload>(encodedPayload)
  const now = Math.floor(Date.now() / 1000)

  if (!payload.sub || !payload.company_id || !payload.role || !payload.exp) {
    return null
  }

  if (payload.exp <= now) {
    return null
  }

  return payload
}

function cleanConversationText(value: unknown) {
  const text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()

  return text.slice(0, 24000)
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function getNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null
}

function getRecord(value: unknown) {
  return isRecord(value) ? value : null
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}


function getNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}


function getAudioCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }

  return 0
}

function getStatefulActivationAudit(
  companyId: string,
) {
  try {
    const activation =
      resolveStatefulCopilotActivationGate({
        company_id:
          companyId,
      })

    return {
      mode:
        activation.mode,
      reason:
        activation.reason,
      engine_version:
        activation.engine_version,
      enabled:
        activation.enabled,
      should_execute_stateful:
        activation
          .should_execute_stateful,
      should_persist_stateful_state:
        activation
          .should_persist_stateful_state,
    }
  } catch {
    return {
      mode:
        'invalid',
      reason:
        'activation_gate_error',
      engine_version:
        null,
      enabled:
        false,
      should_execute_stateful:
        false,
      should_persist_stateful_state:
        false,
    }
  }
}

function getCompanionRecordFromDecision(value: unknown) {
  const decision = getRecord(value)

  return getRecord(decision?.companion)
}

function getCompanionAudioCount(value: unknown) {
  return getAudioCount(getCompanionRecordFromDecision(value)?.audio_count)
}

function hasCompanionAudioWithoutTranscription(value: unknown) {
  const companion = getCompanionRecordFromDecision(value)
  const audioCount = getAudioCount(companion?.audio_count)

  return audioCount > 0 && companion?.audio_transcribed !== true
}

function cleanCompanionMessageText(
  value: unknown,
  maxLength: number,
) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function cleanCompanionMessages(
  value: unknown,
): CompanionMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  const byId =
    new Map<string, CompanionMessage>()

  for (const item of value.slice(-300)) {
    const record = getRecord(item)

    if (!record) {
      continue
    }

    const id =
      getString(record.id)
        ?.trim()
        .slice(0, 500)

    const timestampMs =
      getNumber(record.timestamp_ms)

    const timestampLabel =
      cleanCompanionMessageText(
        record.timestamp_label,
        40,
      )

    const dateKey =
      cleanCompanionMessageText(
        record.date_key,
        20,
      )

    const direction =
      record.direction === 'outgoing'
        ? 'outgoing'
        : record.direction ===
            'incoming'
          ? 'incoming'
          : null

    const sender =
      getNullableString(record.sender)

    const text =
      cleanCompanionMessageText(
        record.text,
        4000,
      )

    const audioTranscription =
      cleanCompanionMessageText(
        record.audio_transcription,
        8000,
      ) || null

    const hasAudio =
      record.has_audio === true

    if (
      !id ||
      !timestampMs ||
      !Number.isFinite(timestampMs) ||
      timestampMs <
        new Date(
          '2000-01-01T00:00:00Z',
        ).getTime() ||
      timestampMs >
        Date.now() +
          24 * 60 * 60 * 1000 ||
      !timestampLabel ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        dateKey,
      ) ||
      !direction
    ) {
      continue
    }

    if (
      !text &&
      !audioTranscription &&
      !hasAudio
    ) {
      continue
    }

    byId.set(id, {
      id,
      timestamp_ms: timestampMs,
      timestamp_label:
        timestampLabel,
      date_key: dateKey,
      direction,
      sender,
      text,
      has_audio: hasAudio,
      audio_transcription:
        audioTranscription,
    })
  }

  return Array.from(
    byId.values(),
  )
    .sort((a, b) => {
      if (
        a.timestamp_ms !==
        b.timestamp_ms
      ) {
        return (
          a.timestamp_ms -
          b.timestamp_ms
        )
      }

      return a.id.localeCompare(b.id)
    })
    .slice(-300)
}

function buildStructuredConversationText(
  messages: CompanionMessage[],
) {
  return messages
    .map((message) => {
      const actor =
        message.direction ===
        'outgoing'
          ? 'Vendedor'
          : 'Lead'

      const parts: string[] = []

      if (message.text) {
        parts.push(message.text)
      }

      if (
        message.audio_transcription
      ) {
        parts.push(
          `[Áudio transcrito: ${message.audio_transcription}]`,
        )
      } else if (message.has_audio) {
        parts.push(
          '[Áudio ainda sem transcrição]',
        )
      }

      if (parts.length === 0) {
        return null
      }

      return `[${message.timestamp_label}] ${actor}: ${parts.join(
        ' ',
      )}`
    })
    .filter(
      (line): line is string =>
        Boolean(line),
    )
    .join('\n')
    .trim()
    .slice(0, 24000)
}

function getMessageCursorFromDecision(
  value: unknown,
): CompanionMessageCursor {
  const companion =
    getCompanionRecordFromDecision(value)

  const processedMessageIds =
    getStringArray(
      companion?.processed_message_ids,
    )
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(-500)

  const lastTimestamp =
    getNumber(
      companion
        ?.last_message_timestamp_ms,
    ) || 0

  const lastMessageId =
    getNullableString(
      companion?.last_message_id,
    )

  return {
    has_cursor:
      companion
        ?.message_cursor_version ===
        1 ||
      lastTimestamp > 0 ||
      processedMessageIds.length > 0,
    last_message_timestamp_ms:
      lastTimestamp,
    last_message_id: lastMessageId,
    processed_message_ids:
      processedMessageIds,
  }
}

function getMessageSnapshotHashFromDecision(
  value: unknown,
) {
  const companion =
    getCompanionRecordFromDecision(value)

  return getNullableString(
    companion?.message_snapshot_hash,
  )
}

function buildNextMessageCursor({
  latestDecision,
  messageBatch,
}: {
  latestDecision: JsonRecord | null
  messageBatch: CompanionMessage[]
}) {
  const previousCursor =
    getMessageCursorFromDecision(
      latestDecision,
    )

  const mergedIds =
    Array.from(
      new Set([
        ...previousCursor
          .processed_message_ids,
        ...messageBatch.map(
          (message) => message.id,
        ),
      ]),
    ).slice(-500)

  const latestBatchMessage =
    messageBatch.at(-1) || null

  const lastTimestamp =
    Math.max(
      previousCursor
        .last_message_timestamp_ms,
      latestBatchMessage
        ?.timestamp_ms || 0,
    )

  const lastMessageId =
    latestBatchMessage &&
    latestBatchMessage
      .timestamp_ms >=
      previousCursor
        .last_message_timestamp_ms
      ? latestBatchMessage.id
      : previousCursor.last_message_id

  return {
    has_cursor:
      previousCursor.has_cursor ||
      messageBatch.length > 0,
    processed_message_ids:
      mergedIds,
    last_message_timestamp_ms:
      lastTimestamp,
    last_message_id:
      lastMessageId,
  }
}

function getSuggestionSource(value: unknown): AISalesSuggestion['source'] {
  if (value === 'ai' || value === 'fallback' || value === 'yolen') {
    return value
  }

  return 'fallback'
}

function getNestedString(record: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record

    for (const key of path) {
      if (!isRecord(current)) {
        current = null
        break
      }

      current = current[key]
    }

    if (typeof current === 'string' && current.trim()) {
      return current
    }
  }

  return null
}

function normalizeEventMetadata(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function buildConversationHash(conversationText: string) {
  return createHash('sha256').update(conversationText).digest('hex')
}


function mapRecentEvent(event: JsonRecord): AISalesRecentEvent | null {
  const metadata = normalizeEventMetadata(event.metadata)

  const eventType = getString(event.event_type)
  const occurredAt = getString(event.occurred_at)

  if (!eventType || !occurredAt) {
    return null
  }

  const fromStatus = getNestedString(metadata, [
    ['from_status'],
    ['payload', 'from_status'],
    ['checkpoint', 'from_status'],
    ['previous_status'],
    ['original_status'],
  ])

  const toStatus = getNestedString(metadata, [
    ['to_status'],
    ['payload', 'to_status'],
    ['checkpoint', 'to_status'],
    ['applied_status'],
    ['new_status'],
  ])

  return {
    event_type: eventType,
    occurred_at: occurredAt,
    from_status: isLeadStatus(fromStatus) ? fromStatus : null,
    to_status: isLeadStatus(toStatus) ? toStatus : null,
    action_channel: getNestedString(metadata, [
      ['action_channel'],
      ['payload', 'action_channel'],
      ['checkpoint', 'action_channel'],
      ['suggestion', 'action_channel'],
    ]),
    action_result: getNestedString(metadata, [
      ['action_result'],
      ['payload', 'action_result'],
      ['checkpoint', 'action_result'],
      ['suggestion', 'action_result'],
    ]),
    result_detail: getNestedString(metadata, [
      ['result_detail'],
      ['payload', 'result_detail'],
      ['checkpoint', 'result_detail'],
      ['suggestion', 'result_detail'],
    ]),
    next_action: getNestedString(metadata, [
      ['next_action'],
      ['payload', 'next_action'],
      ['checkpoint', 'next_action'],
      ['new_next_action'],
    ]),
    next_action_date: getNestedString(metadata, [
      ['next_action_date'],
      ['payload', 'next_action_date'],
      ['checkpoint', 'next_action_date'],
      ['new_next_action_date'],
    ]),
    lost_reason: getNestedString(metadata, [
      ['lost_reason'],
      ['payload', 'lost_reason'],
      ['checkpoint', 'lost_reason'],
      ['suggestion', 'close_reason'],
    ]),
    source: getNestedString(metadata, [
      ['source'],
      ['payload', 'source'],
    ]),
  }
}

function buildResponseCoaching(value: unknown) {
  const coaching = getRecord(value)

  if (!coaching) {
    return {
      recommended_next_approach: null,
      suggested_message: null,
    }
  }

  return {
    recommended_next_approach: getNullableString(coaching.recommended_next_approach),
    suggested_message: getNullableString(coaching.suggested_message),
  }
}

async function generateCompanionCoachingOrFallback({
  context,
  analysisText,
  suggestion,
}: {
  context: AISalesContext
  analysisText: string
  suggestion: AISalesSuggestion
}): Promise<AICoaching> {
  try {
    return await generateSalesCoaching({
      context,
      conversationText: analysisText,
      suggestion,
    })
  } catch {
    return buildCompanionCoaching({
      conversationText: analysisText,
      suggestion,
    })
  }
}



function buildSuggestionFromSavedDecision(value: unknown): AISalesSuggestion | null {
  const decision = getRecord(value)

  if (!decision || !isLeadStatus(decision.recommended_status)) {
    return null
  }

  const summary = getString(decision.summary)
  const reason = getString(decision.reason_for_recommendation)

  if (!summary || !reason) {
    return null
  }

  return {
    recommended_status: decision.recommended_status,
    confidence:
      typeof decision.confidence === 'number'
        ? decision.confidence
        : 0.55,
    action_channel: getNullableString(decision.action_channel),
    action_result: getNullableString(decision.action_result),
    result_detail: getNullableString(decision.result_detail),
    next_action: getNullableString(decision.next_action),
    next_action_date: getNullableString(decision.next_action_date),
    summary,
    tags: getStringArray(decision.tags),
    should_close_won: decision.should_close_won === true,
    should_close_lost: decision.should_close_lost === true,
    close_reason: getNullableString(decision.close_reason),
    reason_for_recommendation: reason,
    source: getSuggestionSource(decision.source),
  }
}

function getCapturedTextFromDecision(value: unknown) {
  const decision = getRecord(value)
  const companion = getRecord(decision?.companion)

  return getString(companion?.captured_text)
}

function getCapturedTailFromDecision(value: unknown) {
  const decision = getRecord(value)
  const companion = getRecord(decision?.companion)

  return getString(companion?.captured_text_tail)
}

function extractIncrementalConversationText({
  currentText,
  latestDecision,
}: {
  currentText: string
  latestDecision: JsonRecord | null
}) {
  const previousText = getCapturedTextFromDecision(latestDecision)
  const previousTail = getCapturedTailFromDecision(latestDecision)

  if (!previousText && !previousTail) {
    return {
      text: currentText,
      incremental: false,
      previous_captured_character_count: 0,
    }
  }

  if (previousText && currentText === previousText) {
    return {
      text: '',
      incremental: true,
      previous_captured_character_count: previousText.length,
    }
  }

  if (previousText && currentText.startsWith(previousText)) {
    return {
      text: currentText.slice(previousText.length).trim(),
      incremental: true,
      previous_captured_character_count: previousText.length,
    }
  }

  if (previousText) {
    const previousTextIndex = currentText.lastIndexOf(previousText)

    if (previousTextIndex >= 0) {
      return {
        text: currentText.slice(previousTextIndex + previousText.length).trim(),
        incremental: true,
        previous_captured_character_count: previousText.length,
      }
    }
  }

  if (previousTail) {
    const previousTailIndex = currentText.lastIndexOf(previousTail)

    if (previousTailIndex >= 0) {
      return {
        text: currentText.slice(previousTailIndex + previousTail.length).trim(),
        incremental: true,
        previous_captured_character_count: previousTail.length,
      }
    }
  }

  return {
    text: currentText,
    incremental: false,
    previous_captured_character_count: previousText?.length ?? previousTail?.length ?? 0,
  }
}

function buildCompanionCoaching({
  conversationText,
  suggestion,
}: {
  conversationText: string
  suggestion: {
    summary: string
    recommended_status: LeadStatus
    action_result: string | null
    result_detail: string | null
    next_action: string | null
    reason_for_recommendation: string
    tags: string[]
  }
}) {
  const whatWentWell = [
    suggestion.action_result,
    suggestion.result_detail,
  ].filter((item): item is string => Boolean(item && item.trim()))

  const whatToImprove = [
    suggestion.next_action
      ? `Próxima ação recomendada: ${suggestion.next_action}`
      : null,
    suggestion.reason_for_recommendation,
  ].filter((item): item is string => Boolean(item && item.trim()))

  const hasCommercialObjection =
    suggestion.recommended_status === 'negociacao' ||
    suggestion.tags.some((tag) => tag.includes('objecao'))

  return {
    conversation_summary:
      suggestion.summary ||
      conversationText.slice(0, 700) ||
      'Análise gerada pelo Yolen Companion a partir da conversa do WhatsApp.',
    customer_interests: suggestion.tags.slice(0, 6),
    objections: hasCommercialObjection
      ? [suggestion.result_detail || 'Objeção comercial identificada na conversa.']
      : [],
    what_went_well: whatWentWell.slice(0, 6),
    what_to_improve: whatToImprove.slice(0, 6),
    recommended_next_approach: suggestion.next_action,
    suggested_message: null,
  }
}

function buildYolenDecision({
  suggestion,
  diagnostics,
  conversationText,
  analysisText,
  conversationHash,
  incrementalAnalysis,
  previousCoachingNoteId,
  previousCapturedCharacterCount,
  audioCount,
  messageBatch,
  latestDecision,
  messageSnapshotHash,
  forceReanalysis,
  companyId,
}: {
  suggestion: JsonRecord
  diagnostics: unknown
  conversationText: string
  analysisText: string
  conversationHash: string
  incrementalAnalysis: boolean
  previousCoachingNoteId: string | null
  previousCapturedCharacterCount: number
  audioCount: number
  messageBatch: CompanionMessage[]
  latestDecision: JsonRecord | null
  messageSnapshotHash: string | null
  forceReanalysis: boolean
  companyId: string
}) {
  const messageCursor =
    buildNextMessageCursor({
      latestDecision,
      messageBatch,
    })
  return {
    recommended_status: suggestion.recommended_status,
    confidence: suggestion.confidence,
    action_channel: suggestion.action_channel,
    action_result: suggestion.action_result,
    result_detail: suggestion.result_detail,
    next_action: suggestion.next_action,
    next_action_date: suggestion.next_action_date,
    summary: suggestion.summary,
    tags: suggestion.tags,
    source: suggestion.source,
    reason_for_recommendation: suggestion.reason_for_recommendation,
    should_close_won: suggestion.should_close_won,
    should_close_lost: suggestion.should_close_lost,
    close_reason: suggestion.close_reason,
    diagnostics,
    companion: {
      source: 'whatsapp_companion',
      conversation_hash: conversationHash,
      analysis_text_hash: buildConversationHash(analysisText),
      captured_character_count: conversationText.length,
      analyzed_character_count: analysisText.length,
      incremental_analysis: incrementalAnalysis,
      previous_coaching_note_id: previousCoachingNoteId,
      previous_captured_character_count: previousCapturedCharacterCount,
      captured_text: conversationText,
      captured_text_tail: conversationText.slice(-4000),
      analysis_text_preview: analysisText.slice(0, 4000),
      audio_count: audioCount,
      audio_transcribed:
        audioCount === 0,
      has_audio_without_transcription:
        audioCount > 0,
      capture_mode:
        messageBatch.length > 0
          ? 'structured_messages'
          : 'legacy_text',
      message_cursor_version:
        messageCursor.has_cursor
          ? 1
          : null,
      processed_message_ids:
        messageCursor
          .processed_message_ids,
      last_message_timestamp_ms:
        messageCursor
          .last_message_timestamp_ms,
      last_message_id:
        messageCursor
          .last_message_id,
      message_batch_ids:
        messageBatch.map(
          (message) => message.id,
        ),
      message_count:
        messageBatch.length,
      message_snapshot_hash:
        messageSnapshotHash,
      force_reanalysis:
        forceReanalysis,
      stateful_activation:
        getStatefulActivationAudit(
          companyId,
        ),
      saved_without_applying: true,
    },
  }
}

async function findExistingCompanionCoachingNote({
  admin,
  tokenPayload,
  cycleId,
  conversationHash,
}: {
  admin: CompanionReadClient
  tokenPayload: CompanionTokenPayload
  cycleId: string
  conversationHash: string
}): Promise<ExistingCompanionCoaching | null> {
  const { data, error } = await admin
    .from('ai_coaching_notes')
    .select('id, created_at, coaching, yolen_decision')
    .eq('company_id', tokenPayload.company_id)
    .eq('cycle_id', cycleId)
    .eq('source', 'whatsapp_companion')
    .eq('yolen_decision->companion->>conversation_hash', conversationHash)
    .order('created_at', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Erro ao verificar análise já salva.')
  }

  const id = getString(data?.id)
  const occurredAt = getString(data?.created_at)

  if (!id || !occurredAt) {
    return null
  }

  return {
    id,
    occurred_at: occurredAt,
    reused: true,
    coaching: getRecord(data?.coaching),
    yolenDecision: getRecord(data?.yolen_decision),
  }
}

async function findLatestCompanionCoachingNote({
  admin,
  tokenPayload,
  cycleId,
}: {
  admin: CompanionReadClient
  tokenPayload: CompanionTokenPayload
  cycleId: string
}): Promise<ExistingCompanionCoaching | null> {
  const { data, error } = await admin
    .from('ai_coaching_notes')
    .select('id, created_at, coaching, yolen_decision')
    .eq('company_id', tokenPayload.company_id)
    .eq('cycle_id', cycleId)
    .eq('source', 'whatsapp_companion')
    .order('created_at', {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Erro ao verificar última análise salva.')
  }

  const id = getString(data?.id)
  const occurredAt = getString(data?.created_at)

  if (!id || !occurredAt) {
    return null
  }

  return {
    id,
    occurred_at: occurredAt,
    reused: true,
    coaching: getRecord(data?.coaching),
    yolenDecision: getRecord(data?.yolen_decision),
  }
}

async function saveCompanionCoachingNote({
  admin,
  tokenPayload,
  cycleId,
  coaching,
  yolenDecision,
}: {
  admin: CompanionWriteClient
  tokenPayload: CompanionTokenPayload
  cycleId: string
  coaching: JsonRecord
  yolenDecision: JsonRecord
}): Promise<SavedCompanionCoaching> {
  const now = new Date().toISOString()

  const { data: note, error: noteError } = await admin
    .from('ai_coaching_notes')
    .insert({
      company_id: tokenPayload.company_id,
      cycle_id: cycleId,
      created_by: tokenPayload.sub,
      source: 'whatsapp_companion',
      coaching,
      yolen_decision: yolenDecision,
      created_at: now,
    })
    .select('id, created_at')
    .single()

  if (noteError) {
    throw new Error(noteError.message || 'Erro ao salvar leitura no histórico.')
  }

  const noteId = getString(note?.id)

  if (!noteId) {
    throw new Error('Leitura salva sem ID retornado.')
  }

  const occurredAt = getString(note?.created_at) || now
  const summaryPreview = getString(coaching.conversation_summary)?.slice(0, 220) || ''
  const companion = getRecord(yolenDecision.companion)
  const audioCount = getAudioCount(companion?.audio_count)
  const hasAudioWithoutTranscription =
    audioCount > 0 && companion?.audio_transcribed !== true

  const { error: eventError } = await admin.from('cycle_events').insert({
    company_id: tokenPayload.company_id,
    cycle_id: cycleId,
    event_type: 'ai_coaching_saved',
    created_by: tokenPayload.sub,
    occurred_at: occurredAt,
    metadata: {
      coaching_note_id: noteId,
      summary_preview: summaryPreview,
      source: 'whatsapp_companion',
      companion: {
        saved_without_applying: true,
        audio_count: audioCount,
        audio_transcribed: false,
        has_audio_without_transcription: hasAudioWithoutTranscription,
      },
    },
  })

  if (eventError) {
    throw new Error(eventError.message || 'Erro ao registrar evento da leitura.')
  }

  return {
    id: noteId,
    occurred_at: occurredAt,
    reused: false,
    incremental: companion?.incremental_analysis === true,
    analyzed_character_count: getNumber(companion?.analyzed_character_count),
    audio_count: audioCount,
    has_audio_without_transcription: hasAudioWithoutTranscription,
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request)

  try {
    const tokenPayload = verifyCompanionToken(request)

    if (!tokenPayload) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Sessão do Companion inválida ou expirada.',
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      )
    }

    const engineVersion =
      resolveCompanionEngineVersion()

    if (engineVersion === 'v2') {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error:
            'O motor Companion V2 ainda não está disponível. Configure COMPANION_ENGINE_VERSION=v1 para manter o fluxo operacional.',
        },
        {
          status: 503,
          headers: corsHeaders,
        },
      )
    }

    const body = (
      await request
        .json()
        .catch(() => ({}))
    ) as AnalyzeCompanionBody

    const cycleId =
      getString(body.cycle_id)

    const conversationKey =
      getString(
        body.conversation_key,
      )?.trim() || null

    const deviceKey =
      getString(
        body.device_key,
      )?.trim() || null

    const legacyConversationText =
      cleanConversationText(
        body.conversation_text,
      )

    const structuredMessages =
      cleanCompanionMessages(
        body.messages,
      )

    const source =
      isConversationSource(
        body.source,
      )
        ? body.source
        : 'whatsapp'

    const audioCount =
      getAudioCount(
        body.audio_count,
      )

    const forceReanalysisRequested =
      body.force_reanalysis === true

    const messageSnapshotHash =
      getNullableString(
        body.message_snapshot_hash,
      )?.slice(0, 200) ?? null

    if (!cycleId) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'cycle_id é obrigatório.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (
      structuredMessages.length === 0 &&
      legacyConversationText.length < 15
    ) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error:
            'Nenhuma mensagem confiável foi encontrada. A Yolen exige ID e data válidos para impedir mistura com mensagens antigas.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
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

    const { data: membership, error: membershipError } = await admin
      .from('company_memberships')
      .select('company_id, user_id, role, is_active')
      .eq('company_id', tokenPayload.company_id)
      .eq('user_id', tokenPayload.sub)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: membershipError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!membership?.company_id) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Usuário sem vínculo ativo com a empresa do Companion.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const { data: cycle, error: cycleError } = await admin
      .from('sales_cycles')
      .select(
        'id, company_id, lead_id, status, owner_user_id, next_action, next_action_date, current_group_id',
      )
      .eq('id', cycleId)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (cycleError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: cycleError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!cycle?.id || !cycle.lead_id || !isLeadStatus(cycle.status)) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Ciclo não encontrado ou sem permissão.',
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      )
    }

    const ownerUserId = getNullableString(cycle.owner_user_id)
    const isAdminOrManager = tokenPayload.role === 'admin' || tokenPayload.role === 'manager'

    if (!isAdminOrManager && ownerUserId !== tokenPayload.sub) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Este ciclo não pertence à sua carteira.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id, name, phone, email, company_id')
      .eq('id', cycle.lead_id)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (leadError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: leadError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!lead?.id) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Lead do ciclo não encontrado.',
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      )
    }

    let currentGroupName: string | null = null

    if (cycle.current_group_id) {
      const { data: group, error: groupError } = await admin
        .from('lead_groups')
        .select('id, name')
        .eq('id', cycle.current_group_id)
        .eq('company_id', tokenPayload.company_id)
        .maybeSingle()

      if (groupError) {
        return NextResponse.json<AnalyzeConversationResponse>(
          {
            ok: false,
            error: groupError.message,
          },
          {
            status: 400,
            headers: corsHeaders,
          },
        )
      }

      currentGroupName = getNullableString(group?.name)
    }

    const { data: events, error: eventsError } = await admin
      .from('cycle_events')
      .select('event_type, occurred_at, metadata')
      .eq('company_id', tokenPayload.company_id)
      .eq('cycle_id', cycleId)
      .order('occurred_at', {
        ascending: false,
      })
      .limit(12)

    if (eventsError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: eventsError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const recentEvents: AISalesRecentEvent[] = Array.isArray(events)
      ? events
          .map((event) => mapRecentEvent(isRecord(event) ? event : {}))
          .filter((event): event is AISalesRecentEvent => Boolean(event))
      : []

    const context: AISalesContext = {
      cycle_id: String(cycle.id),
      current_status: cycle.status,
      lead_name: getNullableString(lead.name),
      lead_phone: getNullableString(lead.phone),
      lead_email: getNullableString(lead.email),
      owner_user_id: ownerUserId,
      current_next_action: getNullableString(cycle.next_action),
      current_next_action_date: getNullableString(cycle.next_action_date),
      current_group_id: getNullableString(cycle.current_group_id),
      current_group_name: currentGroupName,
      recent_events: recentEvents,
    }

    const companionReadAdmin =
    admin as unknown as CompanionReadClient

  const companionWriteAdmin =
    admin as unknown as CompanionWriteClient

  const latestSavedCoaching =
    await findLatestCompanionCoachingNote({
      admin:
        companionReadAdmin,
      tokenPayload,
      cycleId,
    })

  const latestMessageSnapshotHash =
    getMessageSnapshotHashFromDecision(
      latestSavedCoaching
        ?.yolenDecision,
    )

  const forceReanalysis =
    shouldForceReanalysis({
      requested:
        forceReanalysisRequested,
      currentSnapshotHash:
        messageSnapshotHash,
      previousSnapshotHash:
        latestMessageSnapshotHash,
    })

  const structuredSelection =
    selectStructuredMessageBatch({
      messages:
        structuredMessages,
      cursor:
        getMessageCursorFromDecision(
          latestSavedCoaching
            ?.yolenDecision ?? null,
        ),
      forceReanalysis,
    })

  const latestSuggestion =
    buildSuggestionFromSavedDecision(
      latestSavedCoaching
        ?.yolenDecision,
    )

  if (
    structuredMessages.length > 0 &&
    structuredSelection
      .messages.length === 0 &&
    latestSavedCoaching &&
    latestSuggestion
  ) {
    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: true,
        data: {
          context,
          suggestion:
            latestSuggestion,
          saved_coaching: {
            id:
              latestSavedCoaching.id,
            occurred_at:
              latestSavedCoaching
                .occurred_at,
            reused: true,
            incremental: true,
            analyzed_character_count:
              0,
            audio_count:
              getCompanionAudioCount(
                latestSavedCoaching
                  .yolenDecision,
              ),
            has_audio_without_transcription:
              hasCompanionAudioWithoutTranscription(
                latestSavedCoaching
                  .yolenDecision,
              ),
          },
          coaching:
            buildResponseCoaching(
              latestSavedCoaching
                .coaching,
            ),
        },
      },
      {
        headers: corsHeaders,
      },
    )
  }

  const conversationText =
    structuredMessages.length > 0
      ? buildStructuredConversationText(
          structuredSelection
            .messages,
        )
      : legacyConversationText

  if (
    conversationText.length < 15
  ) {
    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: false,
        error:
          'Não existem mensagens novas suficientes para uma nova análise.',
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  const incrementalResult =
    structuredMessages.length > 0
      ? {
          text:
            conversationText,
          incremental:
            structuredSelection
              .incremental,
          previous_captured_character_count:
            0,
        }
      : extractIncrementalConversationText({
          currentText:
            conversationText,
          latestDecision:
            latestSavedCoaching
              ?.yolenDecision ??
            null,
        })

  const analysisText =
    incrementalResult.text
      .trim().length >= 15
      ? incrementalResult.text.trim()
      : conversationText

  const incrementalAnalysis =
    structuredMessages.length > 0
      ? structuredSelection
          .incremental
      : incrementalResult.text
            .trim().length >= 15
        ? incrementalResult
            .incremental
        : false

  const conversationHash =
    buildConversationHash(
      conversationText,
    )

  const existingSavedCoaching =
    await findExistingCompanionCoachingNote({
      admin:
        companionReadAdmin,
      tokenPayload,
      cycleId,
      conversationHash,
    })

  const existingSuggestion =
    buildSuggestionFromSavedDecision(
      existingSavedCoaching
        ?.yolenDecision,
    )

  if (
    existingSavedCoaching &&
    existingSuggestion
  ) {
    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: true,
        data: {
          context,
          suggestion:
            existingSuggestion,
          saved_coaching: {
            id:
              existingSavedCoaching.id,
            occurred_at:
              existingSavedCoaching
                .occurred_at,
            reused: true,
            incremental:
              getRecord(
                existingSavedCoaching
                  .yolenDecision
                  ?.companion,
              )
                ?.incremental_analysis ===
              true,
            analyzed_character_count:
              getNumber(
                getRecord(
                  existingSavedCoaching
                    .yolenDecision
                    ?.companion,
                )
                  ?.analyzed_character_count,
              ),
            audio_count:
              getCompanionAudioCount(
                existingSavedCoaching
                  .yolenDecision,
              ),
            has_audio_without_transcription:
              hasCompanionAudioWithoutTranscription(
                existingSavedCoaching
                  .yolenDecision,
              ),
          },
          coaching:
            buildResponseCoaching(
              existingSavedCoaching
                .coaching,
            ),
        },
      },
      {
        headers: corsHeaders,
      },
    )
  }

    const result = await analyzeConversationWithCopilotDetailed({
      context,
      conversationText: analysisText,
      source,
    })

    const coaching = await generateCompanionCoachingOrFallback({
      context,
      analysisText,
      suggestion: result.suggestion,
    })

    const yolenDecision =
      buildYolenDecision({
        suggestion:
          result.suggestion as unknown as JsonRecord,
        diagnostics:
          result.diagnostics,
        conversationText,
        analysisText,
        conversationHash,
        incrementalAnalysis,
        previousCoachingNoteId:
          latestSavedCoaching
            ?.id ?? null,
        previousCapturedCharacterCount:
          incrementalResult
            .previous_captured_character_count,
        audioCount,
        messageBatch:
          structuredSelection
            .messages,
        latestDecision:
          latestSavedCoaching
            ?.yolenDecision ?? null,
        messageSnapshotHash,
        forceReanalysis,
        companyId:
          tokenPayload.company_id,
      })

    const savedCoaching = await saveCompanionCoachingNote({
      admin: companionWriteAdmin,
      tokenPayload,
      cycleId,
      coaching: coaching as unknown as JsonRecord,
      yolenDecision,
    })

    const v1ResponseData = {
      context,
      suggestion:
        result.suggestion,
      diagnostics:
        result.diagnostics,
      saved_coaching:
        savedCoaching,
      coaching:
        buildResponseCoaching(
          coaching,
        ),
    }

    /*
     * Fase 5.2:
     *
     * O V1 continua sendo a resposta operacional.
     * O stateful roda após a resposta, em shadow,
     * sem acrescentar sua latência ao vendedor.
     */
    after(async () => {
      const startedAt =
        Date.now()

      try {
        const statefulResult =
          await runStatefulCopilotRuntime({
            company_id:
              tokenPayload.company_id,

            cycle_id:
              cycleId,

            conversation_key:
              conversationKey,

            device_key:
              deviceKey,

            reference_time:
              new Date().toISOString(),

            v1_response:
              v1ResponseData,
          })

        if (
          statefulResult
            .activation
            .mode ===
          'disabled'
        ) {
          return
        }

        console.info(
          'YOLEN_COMPANION_STATEFUL_SHADOW',
          JSON.stringify({
            event:
              'stateful_shadow_completed',

            company_id:
              tokenPayload.company_id,

            cycle_id:
              cycleId,

            activation_mode:
              statefulResult
                .activation
                .mode,

            runtime_mode:
              statefulResult.mode,

            response_source:
              statefulResult
                .response_source,

            stateful_executed:
              statefulResult
                .stateful_executed,

            duration_ms:
              Math.max(
                0,
                Date.now() -
                  startedAt,
              ),

            execution:
              statefulResult
                .stateful_execution,

            failure:
              statefulResult
                .stateful_failure,

            automatic_crm_write:
              statefulResult
                .automatic_crm_write,

            automatic_agenda_write:
              statefulResult
                .automatic_agenda_write,
          }),
        )
      } catch {
        console.warn(
          'YOLEN_COMPANION_STATEFUL_SHADOW',
          JSON.stringify({
            event:
              'stateful_shadow_unhandled_failure',

            company_id:
              tokenPayload.company_id,

            cycle_id:
              cycleId,

            duration_ms:
              Math.max(
                0,
                Date.now() -
                  startedAt,
              ),
          }),
        )
      }
    })

    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: true,
        data:
          v1ResponseData,
      },
      {
        headers: corsHeaders,
      },
    )
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao analisar conversa pelo Companion.'

    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
