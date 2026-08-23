import { createHmac, timingSafeEqual } from 'crypto'

export type CompanionRole = 'admin' | 'manager' | 'member'

export type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_ROLES = new Set<CompanionRole>([
  'admin',
  'manager',
  'member',
])

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

function encodeBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeBase64UrlJson(value: string): unknown {
  const json = Buffer.from(value, 'base64url').toString('utf8')

  return JSON.parse(json) as unknown
}

function signEncodedPayload(encodedPayload: string) {
  return createHmac('sha256', getTokenSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function safeCompare(first: string, second: string) {
  const firstBuffer = Buffer.from(first)
  const secondBuffer = Buffer.from(second)

  if (firstBuffer.length !== secondBuffer.length) {
    return false
  }

  return timingSafeEqual(firstBuffer, secondBuffer)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCompanionRole(value: unknown): value is CompanionRole {
  return (
    typeof value === 'string' &&
    ALLOWED_ROLES.has(value as CompanionRole)
  )
}

function normalizeTokenPayload(
  value: unknown,
  nowSeconds: number,
): CompanionTokenPayload | null {
  if (!isRecord(value)) {
    return null
  }

  const sub = value.sub
  const companyId = value.company_id
  const role = value.role
  const issuedAt = value.iat
  const expiresAt = value.exp

  if (
    typeof sub !== 'string' ||
    !UUID_PATTERN.test(sub) ||
    typeof companyId !== 'string' ||
    !UUID_PATTERN.test(companyId) ||
    !isCompanionRole(role) ||
    typeof issuedAt !== 'number' ||
    !Number.isInteger(issuedAt) ||
    typeof expiresAt !== 'number' ||
    !Number.isInteger(expiresAt)
  ) {
    return null
  }

  if (issuedAt <= 0 || expiresAt <= 0 || issuedAt >= expiresAt) {
    return null
  }

  if (expiresAt <= nowSeconds) {
    return null
  }

  if (issuedAt > nowSeconds + 300) {
    return null
  }

  return {
    sub: sub.toLowerCase(),
    company_id: companyId.toLowerCase(),
    role,
    iat: issuedAt,
    exp: expiresAt,
  }
}

export function createCompanionToken(payload: CompanionTokenPayload) {
  const encodedPayload = encodeBase64Url(payload)
  const signature = signEncodedPayload(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifyCompanionTokenValue(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): CompanionTokenPayload | null {
  try {
    const parts = token.split('.')

    if (parts.length !== 2) {
      return null
    }

    const [encodedPayload, receivedSignature] = parts

    if (!encodedPayload || !receivedSignature) {
      return null
    }

    const expectedSignature = signEncodedPayload(encodedPayload)

    if (!safeCompare(receivedSignature, expectedSignature)) {
      return null
    }

    const decodedPayload = decodeBase64UrlJson(encodedPayload)

    return normalizeTokenPayload(decodedPayload, nowSeconds)
  } catch {
    return null
  }
}

export function verifyCompanionRequestToken(
  request: Request,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const authorization = request.headers.get('authorization') ?? ''

  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.slice('Bearer '.length).trim()

  if (!token) {
    return null
  }

  return verifyCompanionTokenValue(token, nowSeconds)
}

// ---------------------------------------------------------------------------
// Token de confirmação de "Registrar conversa" (Fase 12A).
//
// Reaproveita o MESMO mecanismo de assinatura do token de sessão do
// Companion acima (HMAC-SHA256 sobre payload base64url, mesmo segredo via
// getTokenSecret(), mesma comparação em tempo constante) — não introduz um
// segundo esquema criptográfico no projeto.
//
// Por que existe: o preview roda no servidor e devolve summary_text, mas o
// confirm chega numa requisição HTTP separada. Sem isso, o confirm teria
// que confiar cegamente no summary_text que a extensão devolve, tornando o
// cliente autoridade sobre o conteúdo que entra no histórico canônico. Este
// token vincula criptograficamente o preview ao confirm: prova que o
// summary_text confirmado é hash-idêntico ao que o servidor gerou, para o
// mesmo company_id/cycle_id/conversation_key/watermark, dentro de uma
// janela curta de validade — sem exigir um novo mecanismo de assinatura.
// ---------------------------------------------------------------------------

export const CONVERSATION_REGISTRATION_CONFIRMATION_TOKEN_TTL_SECONDS = 600

export type ConversationRegistrationConfirmationTokenPayload = {
  sub: string
  company_id: string
  cycle_id: string
  conversation_key: string
  watermark: string
  summary_hash: string
  exp: number
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

function normalizeConversationRegistrationConfirmationTokenPayload(
  value: unknown,
  nowSeconds: number,
): ConversationRegistrationConfirmationTokenPayload | null {
  if (!isRecord(value)) {
    return null
  }

  const sub = value.sub
  const companyId = value.company_id
  const cycleId = value.cycle_id
  const conversationKey = value.conversation_key
  const watermark = value.watermark
  const summaryHash = value.summary_hash
  const expiresAt = value.exp

  if (
    typeof sub !== 'string' ||
    !UUID_PATTERN.test(sub) ||
    typeof companyId !== 'string' ||
    !UUID_PATTERN.test(companyId) ||
    typeof cycleId !== 'string' ||
    !UUID_PATTERN.test(cycleId) ||
    typeof conversationKey !== 'string' ||
    conversationKey.trim() !== conversationKey ||
    conversationKey.length < 1 ||
    conversationKey.length > 500 ||
    typeof watermark !== 'string' ||
    !SHA256_HEX_PATTERN.test(watermark) ||
    typeof summaryHash !== 'string' ||
    !SHA256_HEX_PATTERN.test(summaryHash) ||
    typeof expiresAt !== 'number' ||
    !Number.isInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    return null
  }

  if (expiresAt <= nowSeconds) {
    return null
  }

  return {
    sub: sub.toLowerCase(),
    company_id: companyId.toLowerCase(),
    cycle_id: cycleId.toLowerCase(),
    conversation_key: conversationKey,
    watermark,
    summary_hash: summaryHash,
    exp: expiresAt,
  }
}

export function createConversationRegistrationConfirmationToken(
  payload: ConversationRegistrationConfirmationTokenPayload,
) {
  const encodedPayload = encodeBase64Url(payload)
  const signature = signEncodedPayload(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifyConversationRegistrationConfirmationTokenValue(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ConversationRegistrationConfirmationTokenPayload | null {
  try {
    const parts = token.split('.')

    if (parts.length !== 2) {
      return null
    }

    const [encodedPayload, receivedSignature] = parts

    if (!encodedPayload || !receivedSignature) {
      return null
    }

    const expectedSignature = signEncodedPayload(encodedPayload)

    if (!safeCompare(receivedSignature, expectedSignature)) {
      return null
    }

    const decodedPayload = decodeBase64UrlJson(encodedPayload)

    return normalizeConversationRegistrationConfirmationTokenPayload(decodedPayload, nowSeconds)
  } catch {
    return null
  }
}
