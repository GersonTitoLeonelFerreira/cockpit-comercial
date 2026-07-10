import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import type {
  AISalesSuggestion,
  ApplyAISuggestionResponse,
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

type ApplyCompanionSuggestionBody = {
  cycle_id?: unknown
  applied_status?: unknown
  next_action?: unknown
  next_action_date?: unknown
  edited_summary?: unknown
  suggestion?: unknown
  source?: unknown
}

type JsonRecord = Record<string, unknown>

type CompanionQueryError = {
  message?: string
}

type MutationResult = {
  error: CompanionQueryError | null
}

type MutationFilterBuilder = PromiseLike<MutationResult> & {
  eq: (column: string, value: string) => MutationFilterBuilder
}

type CompanionApplyTable = {
  update: (values: JsonRecord) => MutationFilterBuilder
  insert: (values: JsonRecord) => PromiseLike<MutationResult>
}

type CompanionApplyWriteClient = {
  from: (table: 'sales_cycles' | 'cycle_events') => CompanionApplyTable
}

const OPEN_APPLY_STATUSES: LeadStatus[] = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-commercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')

  const allowOrigin =
    allowedOrigins.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-commercial-vocn.vercel.app'

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

function isOpenApplyStatus(value: unknown): value is LeadStatus {
  return isLeadStatus(value) && OPEN_APPLY_STATUSES.includes(value)
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

function getString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function getNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null
}

function getCleanString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const clean = value.trim()

  return clean || null
}

function isAISalesSuggestion(value: unknown): value is AISalesSuggestion {
  if (!isRecord(value)) {
    return false
  }

  return (
    isLeadStatus(value.recommended_status) &&
    typeof value.summary === 'string' &&
    typeof value.reason_for_recommendation === 'string'
  )
}

function normalizeNextActionDate(value: unknown) {
  const raw = getCleanString(value)

  if (!raw) {
    return null
  }

  const parsed = new Date(raw)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('next_action_date inválida.')
  }

  return parsed.toISOString()
}

function getSource(value: unknown) {
  return value === 'whatsapp_companion'
    ? 'whatsapp_companion'
    : 'ai_copilot_detail'
}

async function insertCycleEvent({
  writeAdmin,
  companyId,
  cycleId,
  userId,
  eventType,
  occurredAt,
  metadata,
}: {
  writeAdmin: CompanionApplyWriteClient
  companyId: string
  cycleId: string
  userId: string
  eventType: string
  occurredAt: string
  metadata: JsonRecord
}) {
  const { error } = await writeAdmin.from('cycle_events').insert({
    company_id: companyId,
    cycle_id: cycleId,
    event_type: eventType,
    created_by: userId,
    occurred_at: occurredAt,
    metadata,
  })

  if (error) {
    throw new Error(error.message || `Erro ao registrar evento ${eventType}.`)
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
      return NextResponse.json<ApplyAISuggestionResponse>(
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

    const body = (await request.json().catch(() => ({}))) as ApplyCompanionSuggestionBody

    const cycleId = getString(body.cycle_id)
    const appliedStatus = isOpenApplyStatus(body.applied_status)
      ? body.applied_status
      : null
    const suggestion = isAISalesSuggestion(body.suggestion)
      ? body.suggestion
      : null
    const source = getSource(body.source)

    if (!cycleId) {
      return NextResponse.json<ApplyAISuggestionResponse>(
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

    if (!suggestion) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        {
          ok: false,
          error: 'Sugestão operacional inválida.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!appliedStatus) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        {
          ok: false,
          error: 'Nesta fase, só é permitido aplicar etapas abertas: novo, contato, respondeu, negociacao ou pausado.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (suggestion.recommended_status !== appliedStatus) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        {
          ok: false,
          error: 'A etapa aplicada precisa ser igual à etapa sugerida pela análise.',
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
      return NextResponse.json<ApplyAISuggestionResponse>(
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
      return NextResponse.json<ApplyAISuggestionResponse>(
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
      return NextResponse.json<ApplyAISuggestionResponse>(
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
        'id, company_id, status, owner_user_id, next_action, next_action_date',
      )
      .eq('id', cycleId)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (cycleError) {
      return NextResponse.json<ApplyAISuggestionResponse>(
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

    if (!cycle?.id || !isLeadStatus(cycle.status)) {
      return NextResponse.json<ApplyAISuggestionResponse>(
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

    if (
      cycle.status === 'ganho' ||
      cycle.status === 'perdido' ||
      cycle.status === 'cancelado'
    ) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        {
          ok: false,
          error: 'Este ciclo já está fechado e não pode receber sugestão aberta.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const ownerUserId = getNullableString(cycle.owner_user_id)
    const isAdminOrManager = tokenPayload.role === 'admin' || tokenPayload.role === 'manager'

    if (!isAdminOrManager && ownerUserId !== tokenPayload.sub) {
      return NextResponse.json<ApplyAISuggestionResponse>(
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

    let nextAction = getCleanString(body.next_action)
    let nextActionDate = normalizeNextActionDate(body.next_action_date)

    if (appliedStatus === 'novo') {
      nextAction = null
      nextActionDate = null
    }

    if (!nextAction) {
      nextActionDate = null
    }

    const now = new Date().toISOString()
    const currentStatus = cycle.status
    const statusChanged = currentStatus !== appliedStatus
    const currentNextAction = getNullableString(cycle.next_action)
    const currentNextActionDate = getNullableString(cycle.next_action_date)
    const actionChanged =
      currentNextAction !== nextAction ||
      currentNextActionDate !== nextActionDate

    const updatePayload: JsonRecord = {
      next_action: nextAction,
      next_action_date: nextActionDate,
      updated_at: now,
    }

    if (statusChanged) {
      updatePayload.previous_status = currentStatus
      updatePayload.status = appliedStatus
      updatePayload.stage_entered_at = now
    }

    const writeAdmin = admin as unknown as CompanionApplyWriteClient

    const { error: updateError } = await writeAdmin
      .from('sales_cycles')
      .update(updatePayload)
      .eq('id', cycleId)
      .eq('company_id', tokenPayload.company_id)

    if (updateError) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        {
          ok: false,
          error: updateError.message || 'Erro ao atualizar ciclo.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const commonMetadata = {
      source,
      companion: {
        applied_with_user_approval: true,
        applied_from: 'whatsapp_companion',
      },
      suggestion: {
        recommended_status: suggestion.recommended_status,
        confidence: suggestion.confidence,
        action_result: suggestion.action_result,
        result_detail: suggestion.result_detail,
        next_action: suggestion.next_action,
        next_action_date: suggestion.next_action_date,
        summary: suggestion.summary,
        tags: suggestion.tags,
        reason_for_recommendation: suggestion.reason_for_recommendation,
        source: suggestion.source,
      },
    }

    if (statusChanged) {
      await insertCycleEvent({
        writeAdmin,
        companyId: tokenPayload.company_id,
        cycleId,
        userId: tokenPayload.sub,
        eventType: 'stage_changed',
        occurredAt: now,
        metadata: {
          ...commonMetadata,
          from_status: currentStatus,
          to_status: appliedStatus,
        },
      })
    }

    if (actionChanged && nextAction) {
      await insertCycleEvent({
        writeAdmin,
        companyId: tokenPayload.company_id,
        cycleId,
        userId: tokenPayload.sub,
        eventType: 'next_action_set',
        occurredAt: now,
        metadata: {
          ...commonMetadata,
          next_action: nextAction,
          next_action_date: nextActionDate,
        },
      })
    }

    await insertCycleEvent({
      writeAdmin,
      companyId: tokenPayload.company_id,
      cycleId,
      userId: tokenPayload.sub,
      eventType: 'ai_suggestion_applied',
      occurredAt: now,
      metadata: {
        ...commonMetadata,
        applied_status: appliedStatus,
        previous_status: statusChanged ? currentStatus : null,
        edited_summary: getNullableString(body.edited_summary),
      },
    })

    return NextResponse.json<ApplyAISuggestionResponse>(
      {
        ok: true,
        data: {
          id: String(cycle.id),
          status: appliedStatus,
          previous_status: statusChanged ? currentStatus : null,
          next_action: nextAction,
          next_action_date: nextActionDate,
        },
      },
      {
        headers: corsHeaders,
      },
    )
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao aplicar sugestão pelo Companion.'

    return NextResponse.json<ApplyAISuggestionResponse>(
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
