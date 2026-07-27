import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

type TranscribeCompanionAudioBody = {
  cycle_id?: unknown
  audio_base64?: unknown
  mime_type?: unknown
  file_name?: unknown
  audio_index?: unknown
  audio_target_key?: unknown
}

type TranscribeCompanionAudioResponse = {
    ok: boolean
    data?: {
      text: string
      event_type: string
      occurred_at: string
      audio_size_bytes: number
      already_transcribed?: boolean
    }
    error?: string
  }

type JsonRecord = Record<string, unknown>

type CompanionQueryError = {
  message?: string
}

type WriteResult = {
  error: CompanionQueryError | null
}

type ExistingAudioTranscriptionResult = {
  data: JsonRecord | null
  error: CompanionQueryError | null
}

type ExistingAudioTranscriptionQueryBuilder = {
  eq: (
    column: string,
    value: string,
  ) => ExistingAudioTranscriptionQueryBuilder
  order: (
    column: string,
    options?: {
      ascending?: boolean
    },
  ) => ExistingAudioTranscriptionQueryBuilder
  limit: (
    count: number,
  ) => ExistingAudioTranscriptionQueryBuilder
  maybeSingle: () => PromiseLike<ExistingAudioTranscriptionResult>
}

type ExistingAudioTranscriptionUpdateBuilder = {
  eq: (
    column: string,
    value: string,
  ) => PromiseLike<WriteResult>
}

type CompanionTranscribeWriteTable = {
  insert: (
    values: JsonRecord,
  ) => PromiseLike<WriteResult>
  select: (
    columns: string,
  ) => ExistingAudioTranscriptionQueryBuilder
  update: (
    values: JsonRecord,
  ) => ExistingAudioTranscriptionUpdateBuilder
}

type CompanionTranscribeWriteClient = {
  from: (
    table: 'cycle_events',
  ) => CompanionTranscribeWriteTable
}

const MAX_AUDIO_BYTES = 15 * 1024 * 1024

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


function getRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : null
  }

function getNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null
}

function getAudioIndex(value: unknown) {
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

function cleanBase64Audio(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const withoutDataUrl = trimmed.includes(',')
    ? trimmed.split(',').pop() || ''
    : trimmed

  return withoutDataUrl.replace(/\s/g, '')
}

function getCleanMimeType(value: unknown) {
    const mimeType = getString(value)?.trim().toLowerCase()
  
    if (!mimeType) {
      return 'audio/webm'
    }
  
    const cleanMimeType = mimeType.split(';')[0]?.trim() || 'audio/webm'
  
    if (
      cleanMimeType.startsWith('audio/') ||
      cleanMimeType === 'video/webm' ||
      cleanMimeType === 'video/mp4' ||
      cleanMimeType === 'application/octet-stream'
    ) {
      return cleanMimeType
    }
  
    return 'audio/webm'
  }
  
  function getAudioFormatFromMimeType(mimeType: string) {
    if (mimeType.includes('ogg') || mimeType.includes('opus')) {
      return {
        mimeType: 'audio/ogg',
        extension: 'ogg',
      }
    }
  
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
      return {
        mimeType: 'audio/mpeg',
        extension: 'mp3',
      }
    }
  
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      return {
        mimeType: 'audio/mp4',
        extension: 'm4a',
      }
    }
  
    if (mimeType.includes('wav')) {
      return {
        mimeType: 'audio/wav',
        extension: 'wav',
      }
    }
  
    return {
      mimeType: 'audio/webm',
      extension: 'webm',
    }
  }
  
  function detectAudioFormatFromBuffer(audioBuffer: Buffer, fallbackMimeType: string) {
    const header = audioBuffer.subarray(0, 16)
  
    const headerAscii = header.toString('ascii')
  
    if (headerAscii.startsWith('OggS')) {
      return {
        mimeType: 'audio/ogg',
        extension: 'ogg',
      }
    }
  
    if (headerAscii.startsWith('RIFF') && audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE') {
      return {
        mimeType: 'audio/wav',
        extension: 'wav',
      }
    }
  
    if (headerAscii.includes('ftyp')) {
      return {
        mimeType: 'audio/mp4',
        extension: 'm4a',
      }
    }
  
    if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
      return {
        mimeType: 'audio/webm',
        extension: 'webm',
      }
    }
  
    if (
      headerAscii.startsWith('ID3') ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
    ) {
      return {
        mimeType: 'audio/mpeg',
        extension: 'mp3',
      }
    }
  
    return getAudioFormatFromMimeType(fallbackMimeType)
  }
  
  function getSafeFileName(value: unknown, extension: string) {
    const rawName = getString(value)?.trim()
    const baseName = rawName
      ? rawName
          .replace(/\.[a-z0-9]+$/i, '')
          .replace(/[^\w.-]+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 70)
      : 'whatsapp-audio'
  
    return `${baseName || 'whatsapp-audio'}.${extension}`
  }


function buildAudioFingerprint(audioBuffer: Buffer) {
    return createHash('sha256').update(audioBuffer).digest('hex')
  }
  
  async function findExistingAudioTranscription({
    
    writeAdmin,
    companyId,
    cycleId,
    audioFingerprint,
  }: {
    writeAdmin: CompanionTranscribeWriteClient
    companyId: string
    cycleId: string
    audioFingerprint: string
  }) {
    const { data, error } = await writeAdmin
      .from('cycle_events')
      .select('id, occurred_at, metadata')
      .eq('company_id', companyId)
      .eq('cycle_id', cycleId)
      .eq('event_type', 'whatsapp_audio_transcribed')
      .eq('metadata->>audio_fingerprint', audioFingerprint)
      .order('occurred_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()
  
    if (error) {
      throw new Error(error.message || 'Erro ao verificar áudio já transcrito.')
    }
  
    const eventId = getString(data?.id)
    const metadata = getRecord(data?.metadata)
    const text = getString(metadata?.transcription_text)
    const occurredAt = getString(data?.occurred_at)

    if (!eventId || !metadata || !text || !occurredAt) {
      return null
    }

    return {
      eventId,
      metadata,
      text,
      occurredAt,
    }
  }

  async function bindExistingAudioTranscription({
    writeAdmin,
    eventId,
    metadata,
    audioTargetKey,
    audioIndex,
  }: {
    writeAdmin: CompanionTranscribeWriteClient
    eventId: string
    metadata: JsonRecord
    audioTargetKey: string | null
    audioIndex: number
  }) {
    if (!audioTargetKey) {
      return
    }
  
    const existingTargetKey =
      getString(metadata.audio_target_key)
  
    const existingAudioIndex =
      getAudioIndex(metadata.audio_index)
  
    if (
      existingTargetKey === audioTargetKey &&
      existingAudioIndex === audioIndex
    ) {
      return
    }
  
    const nextMetadata: JsonRecord = {
      ...metadata,
      audio_index: audioIndex,
      audio_target_key: audioTargetKey,
    }
  
    const { error } = await writeAdmin
      .from('cycle_events')
      .update({
        metadata: nextMetadata,
      })
      .eq('id', eventId)
  
    if (error) {
      throw new Error(
        error.message ||
          'Erro ao vincular a transcrição ao áudio do WhatsApp.',
      )
    }
  }

function getTextFromOpenAIResponse(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const text = (value as Record<string, unknown>).text

  return typeof text === 'string' && text.trim() ? text.trim() : null
}

async function requestOpenAITranscription({
    openAiKey,
    audioBuffer,
    mimeType,
    fileName,
    model,
  }: {
    openAiKey: string
    audioBuffer: Buffer
    mimeType: string
    fileName: string
    model: string
  }) {
    const formData = new FormData()
    const audioArrayBuffer = new ArrayBuffer(audioBuffer.length)
    const audioView = new Uint8Array(audioArrayBuffer)
  
    audioView.set(audioBuffer)
  
    const audioBlob = new Blob([audioArrayBuffer], {
      type: mimeType,
    })
  
    formData.append('file', audioBlob, fileName)
    formData.append('model', model)
    formData.append('language', 'pt')
    formData.append('response_format', 'json')
    formData.append(
      'prompt',
      'Transcreva em português do Brasil. O áudio faz parte de uma conversa comercial no WhatsApp.',
    )
  
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
      },
      body: formData,
    })
  
    const payload = (await response.json().catch(() => null)) as unknown
  
    if (!response.ok) {
      const message =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        typeof (payload as Record<string, unknown>).error === 'object'
          ? ((payload as Record<string, unknown>).error as Record<string, unknown>).message
          : null
  
      throw new Error(
        typeof message === 'string' && message
          ? message
          : 'Erro ao transcrever áudio na OpenAI.',
      )
    }
  
    const text = getTextFromOpenAIResponse(payload)
  
    if (!text) {
      throw new Error('A transcrição retornou vazia.')
    }
  
    return text
  }
  
  async function transcribeAudioWithOpenAI({
    audioBuffer,
    mimeType,
    fileName,
  }: {
    audioBuffer: Buffer
    mimeType: string
    fileName: string
  }) {
    const openAiKey = process.env.OPENAI_API_KEY
  
    if (!openAiKey) {
      throw new Error('ENV faltando: OPENAI_API_KEY.')
    }
  
    try {
      return await requestOpenAITranscription({
        openAiKey,
        audioBuffer,
        mimeType,
        fileName,
        model: 'gpt-4o-mini-transcribe',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
  
      if (
        !message.toLowerCase().includes('processing failed') &&
        !message.toLowerCase().includes('invalid file') &&
        !message.toLowerCase().includes('unsupported')
      ) {
        throw error
      }
  
      return requestOpenAITranscription({
        openAiKey,
        audioBuffer,
        mimeType,
        fileName,
        model: 'whisper-1',
      })
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
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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

    const body = (await request.json().catch(() => ({}))) as TranscribeCompanionAudioBody

    const cycleId = getString(body.cycle_id)
    const audioBase64 = cleanBase64Audio(body.audio_base64)
    const requestedMimeType = getCleanMimeType(body.mime_type)
    const audioIndex = getAudioIndex(body.audio_index)
    const audioTargetKey =
      getString(body.audio_target_key)
        ?.trim()
        .slice(0, 500) || null

    if (!cycleId) {
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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

    if (!audioBase64) {
      return NextResponse.json<TranscribeCompanionAudioResponse>(
        {
          ok: false,
          error: 'audio_base64 é obrigatório.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64')

    if (audioBuffer.length < 100) {
      return NextResponse.json<TranscribeCompanionAudioResponse>(
        {
          ok: false,
          error: 'Áudio inválido ou vazio.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
        return NextResponse.json<TranscribeCompanionAudioResponse>(
          {
            ok: false,
            error: 'Áudio muito grande para transcrição nesta fase.',
          },
          {
            status: 413,
            headers: corsHeaders,
          },
        )
      }
  
      const audioFormat = detectAudioFormatFromBuffer(audioBuffer, requestedMimeType)
      const fileName = getSafeFileName(body.file_name, audioFormat.extension)
      const audioFingerprint = buildAudioFingerprint(audioBuffer)
  
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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
      .select('id, company_id, status, owner_user_id')
      .eq('id', cycleId)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (cycleError) {
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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
      return NextResponse.json<TranscribeCompanionAudioResponse>(
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

    const eventType = 'whatsapp_audio_transcribed'
    const writeAdmin = admin as unknown as CompanionTranscribeWriteClient

    const existingTranscription = await findExistingAudioTranscription({
      writeAdmin,
      companyId: tokenPayload.company_id,
      cycleId,
      audioFingerprint,
    })

    if (existingTranscription) {
      await bindExistingAudioTranscription({
        writeAdmin,
        eventId: existingTranscription.eventId,
        metadata: existingTranscription.metadata,
        audioTargetKey,
        audioIndex,
      })

      return NextResponse.json<TranscribeCompanionAudioResponse>(
        {
          ok: true,
          data: {
            text: existingTranscription.text,
            event_type: eventType,
            occurred_at: existingTranscription.occurredAt,
            audio_size_bytes: audioBuffer.length,
            already_transcribed: true,
          },
        },
        {
          headers: corsHeaders,
        },
      )
    }

    const text = await transcribeAudioWithOpenAI({
      audioBuffer,
      mimeType: audioFormat.mimeType,
      fileName,
    })

    const now = new Date().toISOString()

    const { error: insertError } = await writeAdmin.from('cycle_events').insert({
      company_id: tokenPayload.company_id,
      cycle_id: cycleId,
      event_type: eventType,
      created_by: tokenPayload.sub,
      occurred_at: now,
      metadata: {
        source: 'whatsapp_companion',
        audio_index: audioIndex,
        audio_target_key: audioTargetKey,
        audio_size_bytes: audioBuffer.length,
        audio_fingerprint: audioFingerprint,
        mime_type: audioFormat.mimeType,
        file_name: fileName,
        transcription_text: text,
        companion: {
          audio_transcribed: true,
          sent_automatically: false,
          applied_automatically: false,
        },
      },
    })

    if (insertError) {
      return NextResponse.json<TranscribeCompanionAudioResponse>(
        {
          ok: false,
          error: insertError.message || 'Erro ao registrar transcrição no histórico.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json<TranscribeCompanionAudioResponse>(
      {
        ok: true,
        data: {
            text,
            event_type: eventType,
            occurred_at: now,
            audio_size_bytes: audioBuffer.length,
            already_transcribed: false,
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
        : 'Erro desconhecido ao transcrever áudio pelo Companion.'

    return NextResponse.json<TranscribeCompanionAudioResponse>(
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