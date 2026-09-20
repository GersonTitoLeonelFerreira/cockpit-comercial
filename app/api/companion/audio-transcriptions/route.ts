import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyActiveCompanionProfile } from '@/app/lib/companion/companion-principal-access'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

type AudioTranscriptionsBody = {
  cycle_id?: unknown
}

type JsonRecord = Record<string, unknown>

type QueryError = {
  message?: string
}

type AudioHistoryRow = {
  event_type?: unknown
  occurred_at?: unknown
  metadata?: unknown
}

type AudioHistoryResult = {
  data: AudioHistoryRow[] | null
  error: QueryError | null
}

type AudioHistoryQueryBuilder = {
  eq: (
    column: string,
    value: string,
  ) => AudioHistoryQueryBuilder
  in: (
    column: string,
    values: string[],
  ) => AudioHistoryQueryBuilder
  order: (
    column: string,
    options?: {
      ascending?: boolean
    },
  ) => AudioHistoryQueryBuilder
  limit: (
    count: number,
  ) => PromiseLike<AudioHistoryResult>
}

type AudioHistoryTable = {
  select: (
    columns: string,
  ) => AudioHistoryQueryBuilder
}

type AudioHistoryClient = {
  from: (
    table: 'cycle_events',
  ) => AudioHistoryTable
}

type SavedAudioTranscription = {
  audio_target_key: string | null
  audio_index: number
  text: string
  occurred_at: string
  audio_fingerprint: string | null
  platform: string
  channel: string
}

type AudioTranscriptionsResponse = {
  ok: boolean
  data?: {
    transcriptions: SavedAudioTranscription[]
  }
  error?: string
}

const AUDIO_EVENT_TYPES = [
  'whatsapp_audio_transcribed',
  'companion_audio_transcribed',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://')

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

function verifyCompanionToken(
  request: Request,
): CompanionTokenPayload | null {
  const authorization =
    request.headers.get('authorization') ?? ''

  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization
    .replace('Bearer ', '')
    .trim()

  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature =
    signPayload(encodedPayload)

  if (!safeCompare(signature, expectedSignature)) {
    return null
  }

  const payload =
    decodeBase64UrlJson<CompanionTokenPayload>(
      encodedPayload,
    )

  const now = Math.floor(Date.now() / 1000)

  if (
    !payload.sub ||
    !payload.company_id ||
    !payload.role ||
    !payload.exp
  ) {
    return null
  }

  if (payload.exp <= now) {
    return null
  }

  return payload
}

function getString(value: unknown) {
  return typeof value === 'string'
    ? value
    : null
}

function getRecord(
  value: unknown,
): JsonRecord | null {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? (value as JsonRecord)
    : null
}

function getNullableString(value: unknown) {
  return (
    value === null ||
    typeof value === 'string'
  )
    ? value
    : null
}

function getAudioIndex(value: unknown) {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return Math.max(
      0,
      Math.floor(value),
    )
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return Math.max(
        0,
        Math.floor(parsed),
      )
    }
  }

  return 0
}

function getPlatformAndChannel(
  eventType: string | null,
  metadata: JsonRecord | null,
) {
  const metadataPlatform =
    getString(metadata?.platform)?.trim().toLowerCase() || null
  const metadataChannel =
    getString(metadata?.channel)?.trim().toLowerCase() || null

  if (eventType === 'whatsapp_audio_transcribed') {
    return {
      platform: metadataPlatform || 'whatsapp',
      channel: metadataChannel || 'whatsapp',
    }
  }

  return {
    platform: metadataPlatform || 'unknown',
    channel: metadataChannel || 'unknown',
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
    const tokenPayload =
      verifyCompanionToken(request)

    if (!tokenPayload) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error:
            'Sessão do Companion inválida ou expirada.',
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      )
    }

    const body = (
      await request
        .json()
        .catch(() => ({}))
    ) as AudioTranscriptionsBody

    const cycleId = getString(body.cycle_id)?.trim() || null

    if (!cycleId) {
      return NextResponse.json<AudioTranscriptionsResponse>(
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

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error:
            'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

    const {
      data: membership,
      error: membershipError,
    } = await admin
      .from('company_memberships')
      .select(
        'company_id, user_id, role, is_active',
      )
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .eq(
        'user_id',
        tokenPayload.sub,
      )
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json<AudioTranscriptionsResponse>(
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
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error:
            'Usuário sem vínculo ativo com a empresa do Companion.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    // Hardening (STEP 2A.4, "REVOGAÇÃO GLOBAL IMEDIATA"): membership
    // ativa sozinha não basta — um usuário com
    // profiles.is_active_global=false precisa perder acesso ao texto de
    // transcrições IMEDIATAMENTE, mesmo com um Companion token ainda
    // válido por horas.
    const profileAccess = await verifyActiveCompanionProfile({
      admin,
      userId: tokenPayload.sub,
    })

    if (profileAccess.error) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error: profileAccess.error,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!profileAccess.active) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error: 'Usuário globalmente inativo ou sem perfil válido.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const {
      data: cycle,
      error: cycleError,
    } = await admin
      .from('sales_cycles')
      .select(
        'id, company_id, owner_user_id',
      )
      .eq('id', cycleId)
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .maybeSingle()

    if (cycleError) {
      return NextResponse.json<AudioTranscriptionsResponse>(
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

    if (!cycle?.id) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error:
            'Ciclo não encontrado ou sem permissão.',
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      )
    }

    const ownerUserId =
      getNullableString(cycle.owner_user_id)

    const isAdminOrManager =
      membership.role === 'admin' ||
      membership.role === 'manager'

    if (
      !isAdminOrManager &&
      ownerUserId !== tokenPayload.sub
    ) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error:
            'Este ciclo não pertence à sua carteira.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const readAdmin =
      admin as unknown as AudioHistoryClient

    const {
      data: eventRows,
      error: eventsError,
    } = await readAdmin
      .from('cycle_events')
      .select('event_type, occurred_at, metadata')
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .eq('cycle_id', cycleId)
      .in('event_type', AUDIO_EVENT_TYPES)
      .order('occurred_at', {
        ascending: false,
      })
      .limit(100)

    if (eventsError) {
      return NextResponse.json<AudioTranscriptionsResponse>(
        {
          ok: false,
          error:
            eventsError.message ||
            'Erro ao carregar transcrições.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const identities = new Set<string>()
    const transcriptions: SavedAudioTranscription[] = []

    for (const row of eventRows ?? []) {
      const metadata = getRecord(row.metadata)
      const text =
        getString(metadata?.transcription_text)
          ?.trim()

      const occurredAt =
        getString(row.occurred_at)

      if (!text || !occurredAt) {
        continue
      }

      const audioTargetKey =
        getString(metadata?.audio_target_key)
          ?.trim() || null

      if (!audioTargetKey) {
        continue
      }

      const audioFingerprint =
        getString(metadata?.audio_fingerprint)
          ?.trim() || null

      const audioIndex =
        getAudioIndex(metadata?.audio_index)

      const eventType = getString(row.event_type)
      const { platform, channel } =
        getPlatformAndChannel(eventType, metadata)

      const identity =
        `platform:${platform}:target:${audioTargetKey}`

      if (identities.has(identity)) {
        continue
      }

      identities.add(identity)

      transcriptions.push({
        audio_target_key: audioTargetKey,
        audio_index: audioIndex,
        text,
        occurred_at: occurredAt,
        audio_fingerprint: audioFingerprint,
        platform,
        channel,
      })
    }

    return NextResponse.json<AudioTranscriptionsResponse>(
      {
        ok: true,
        data: {
          transcriptions,
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
        : 'Erro desconhecido ao carregar transcrições.'

    return NextResponse.json<AudioTranscriptionsResponse>(
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
