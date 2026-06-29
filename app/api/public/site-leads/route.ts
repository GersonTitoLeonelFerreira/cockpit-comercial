import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type SiteLeadBody = {
  name?: unknown
  phone?: unknown
  email?: unknown
  cpf_cnpj?: unknown
  message?: unknown
  campaign_name?: unknown
  external_id?: unknown
  form_name?: unknown
  page_url?: unknown
  utm_source?: unknown
  utm_medium?: unknown
  utm_campaign?: unknown
}

type ApiKeyRow = {
  id: string
  company_id: string
  name: string
  created_by: string
  revoked_at: string | null
}

type IngestResult = {
  result: 'created' | 'duplicate' | 'conflict'
  lead_id: string | null
  cycle_id: string | null
  error_code: 'active_lead_conflict' | 'deleted_lead_conflict' | null
}

function cleanText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

function onlyDigits(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function normalizeEmail(value: unknown): string | null {
  const email = cleanText(value, 254)?.toLowerCase() ?? null
  return email || null
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function hasRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value)
}

function isValidCPF(value: string): boolean {
  if (value.length !== 11 || hasRepeatedDigits(value)) return false

  let sum = 0
  for (let index = 0; index < 9; index += 1) {
    sum += Number(value[index]) * (10 - index)
  }

  let firstCheck = (sum * 10) % 11
  if (firstCheck === 10) firstCheck = 0
  if (firstCheck !== Number(value[9])) return false

  sum = 0
  for (let index = 0; index < 10; index += 1) {
    sum += Number(value[index]) * (11 - index)
  }

  let secondCheck = (sum * 10) % 11
  if (secondCheck === 10) secondCheck = 0

  return secondCheck === Number(value[10])
}

function isValidCNPJ(value: string): boolean {
  if (value.length !== 14 || hasRepeatedDigits(value)) return false

  const calculate = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0)

    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const base12 = value.slice(0, 12)
  const digit1 = calculate(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const digit2 = calculate(`${base12}${digit1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return value === `${base12}${digit1}${digit2}`
}

function isValidDocument(value: string): boolean {
  if (value.length === 11) return isValidCPF(value)
  if (value.length === 14) return isValidCNPJ(value)
  return false
}

function getApiKey(req: Request): string | null {
  const bearer = req.headers.get('authorization')?.trim() ?? ''
  const headerKey = req.headers.get('x-yolen-api-key')?.trim() ?? ''

  if (headerKey) return headerKey
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim() || null

  return null
}

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(req: Request) {
  const apiKey = getApiKey(req)

  if (!apiKey || !apiKey.startsWith('yln_live_')) {
    return NextResponse.json({ ok: false, error: 'Credencial de integração inválida.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: 'Configuração de integração indisponível.' },
      { status: 500 },
    )
  }

  const body = (await req.json().catch(() => null)) as SiteLeadBody | null

  if (!body) {
    return NextResponse.json({ ok: false, error: 'Payload JSON inválido.' }, { status: 400 })
  }

  const name = cleanText(body.name, 160)
  const phone = onlyDigits(body.phone)
  const email = normalizeEmail(body.email)
  const document = onlyDigits(body.cpf_cnpj)
  const message = cleanText(body.message, 4000)
  const campaignName = cleanText(body.campaign_name, 160)
  const externalId = cleanText(body.external_id, 180)

  if (!name) {
    return NextResponse.json({ ok: false, error: 'O campo name é obrigatório.' }, { status: 400 })
  }

  if (!phone && !email) {
    return NextResponse.json(
      { ok: false, error: 'Informe ao menos phone ou email para que a equipe possa atender o lead.' },
      { status: 400 },
    )
  }

  if (email && !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Email inválido.' }, { status: 400 })
  }

  if (document && !isValidDocument(document)) {
    return NextResponse.json({ ok: false, error: 'CPF/CNPJ inválido.' }, { status: 400 })
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: integration, error: integrationError } = await admin
    .from('company_lead_api_keys')
    .select('id, company_id, name, created_by, revoked_at')
    .eq('secret_hash', await hashSecret(apiKey))
    .is('revoked_at', null)
    .maybeSingle()

  if (integrationError || !integration) {
    return NextResponse.json({ ok: false, error: 'Credencial de integração inválida.' }, { status: 401 })
  }

  const key = integration as ApiKeyRow
  const externalKey = externalId ? `${key.id}:${externalId}` : null
  const metadata = {
    form_name: cleanText(body.form_name, 160),
    page_url: cleanText(body.page_url, 1000),
    utm_source: cleanText(body.utm_source, 160),
    utm_medium: cleanText(body.utm_medium, 160),
    utm_campaign: cleanText(body.utm_campaign, 160),
  }

  const { data, error } = await admin.rpc('rpc_ingest_site_lead', {
    p_company_id: key.company_id,
    p_created_by: key.created_by,
    p_api_key_id: key.id,
    p_source: key.name,
    p_name: name,
    p_phone: phone,
    p_email: email,
    p_document: document,
    p_notes: message,
    p_campaign_name: campaignName,
    p_external_key: externalKey,
    p_external_id: externalId,
    p_metadata: metadata,
  })

  if (error) {
    console.error('Erro ao receber lead do site:', error)
    return NextResponse.json({ ok: false, error: 'Não foi possível registrar o lead.' }, { status: 500 })
  }

  const result = Array.isArray(data) ? (data[0] as IngestResult | undefined) : undefined

  if (!result) {
    return NextResponse.json({ ok: false, error: 'A integração não retornou um resultado válido.' }, { status: 500 })
  }

  if (result.result === 'conflict') {
    return NextResponse.json(
      {
        ok: false,
        code: result.error_code,
        error:
          result.error_code === 'deleted_lead_conflict'
            ? 'Este contato pertence a um lead excluído e exige reativação administrativa.'
            : 'Este contato já possui um lead ativo nesta empresa.',
      },
      { status: 409 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      status: result.result,
      lead_id: result.lead_id,
      cycle_id: result.cycle_id,
      pool: true,
    },
    { status: result.result === 'created' ? 201 : 200 },
  )
}
