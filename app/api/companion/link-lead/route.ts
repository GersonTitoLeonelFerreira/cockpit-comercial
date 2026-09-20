import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import {
  canUserLinkLead,
  getCompanionCorsHeaders,
  loadSalesCyclesForLead,
  verifyActiveCompanionMembership,
} from '@/app/lib/companion/companion-lead-access'

// STEP 2A.2 — first-link produtivo. Único caller autorizado de
// rpc_link_companion_external_identity_first (nunca de
// rpc_link_companion_external_identity, que é a primitiva de RELINK sem
// caller produtivo — ver EXTERNAL_IDENTITY_RELINK_CONTRACT.md).
//
// Nesta fase: ManyChat apenas, sem captura/análise/mudança de ciclo. O
// endpoint só estabelece o vínculo; resolve-lead continua sendo a única
// fonte de verdade sobre o estado resultante (LINKED/IDEMPOTENT nunca
// mudam artificialmente OWNED_BY_ME/OWNED_BY_OTHER/IN_POOL/etc.).
//
// A autorização (member vs. admin/manager) usa a role da membership ATUAL
// no banco, nunca tokenPayload.role — o token dura até 6h e pode ficar
// desatualizado se a role da pessoa mudar nesse meio-tempo (STEP 2A.2,
// correção 1).

const PLATFORM_CONTACT_KEY_PATTERN = /^manychat:contact:v1:sha256:[a-f0-9]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mesmo contrato de app/extension/yolen-companion/src/manychat-safe-identity-bridge.js:
// safe.platform_identity.source é sempre exatamente "subscriber_id" — a
// ORIGEM da identidade (de onde ela veio no ManyChat), nunca o nome do
// componente que fez a ponte. Definido pelo servidor, nunca pelo cliente:
// o corpo da requisição pode enviar qualquer coisa em identity_source,
// isso é sempre ignorado. Nunca persiste o subscriber_id bruto — apenas a
// chave pseudônima manychat:contact:v1:sha256:<64 hex> já validada acima.
const IDENTITY_SOURCE = 'subscriber_id'

type LinkLeadBody = {
  platform?: unknown
  platform_contact_key?: unknown
  lead_id?: unknown
  confirmed?: unknown
  channel?: unknown
}

type LeadRow = {
  id: string
  company_id: string
  deleted_at: string | null
}

type FirstLinkRpcRow = {
  status: 'LINKED' | 'IDEMPOTENT_ALREADY_LINKED_TO_TARGET' | 'ALREADY_LINKED_CONFLICT'
  lead_id: string | null
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCompanionCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCompanionCorsHeaders(request)

  try {
    const tokenPayload = verifyCompanionRequestToken(request)

    if (!tokenPayload) {
      return NextResponse.json(
        {
          ok: false,
          status: 'INVALID_COMPANION_TOKEN',
          error: 'Sessão do Companion inválida ou expirada.',
        },
        { status: 401, headers: corsHeaders },
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          status: 'ENV_MISSING',
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500, headers: corsHeaders },
      )
    }

    // company_id, actor_user_id e identity_source nunca vêm do cliente —
    // sempre do token/servidor (STEP 2A.2, seções 12 e 15).
    const body = (await request.json().catch(() => ({}))) as LinkLeadBody

    if (body.confirmed !== true) {
      return NextResponse.json(
        {
          ok: false,
          status: 'CONFIRMATION_REQUIRED',
          error: 'Confirmação explícita do vínculo é obrigatória.',
        },
        { status: 400, headers: corsHeaders },
      )
    }

    const platform = typeof body.platform === 'string' ? body.platform : ''

    if (platform !== 'manychat') {
      return NextResponse.json(
        {
          ok: false,
          status: 'UNSUPPORTED_PLATFORM',
          error: 'Apenas platform="manychat" é suportado nesta fase.',
        },
        { status: 400, headers: corsHeaders },
      )
    }

    const platformContactKey =
      typeof body.platform_contact_key === 'string' ? body.platform_contact_key : ''

    if (!PLATFORM_CONTACT_KEY_PATTERN.test(platformContactKey)) {
      return NextResponse.json(
        {
          ok: false,
          status: 'INVALID_EXTERNAL_IDENTITY_KEY',
          error:
            'platform_contact_key precisa seguir o formato manychat:contact:v1:sha256:<64 hex>.',
        },
        { status: 400, headers: corsHeaders },
      )
    }

    const leadId = typeof body.lead_id === 'string' ? body.lead_id : ''

    if (!UUID_PATTERN.test(leadId)) {
      return NextResponse.json(
        { ok: false, status: 'INVALID_LEAD_ID', error: 'lead_id inválido.' },
        { status: 400, headers: corsHeaders },
      )
    }

    let channel: 'whatsapp' | null = null

    if (body.channel !== undefined && body.channel !== null) {
      if (body.channel !== 'whatsapp') {
        return NextResponse.json(
          {
            ok: false,
            status: 'INVALID_CHANNEL',
            error: 'channel precisa ser null ou "whatsapp" nesta fase.',
          },
          { status: 400, headers: corsHeaders },
        )
      }

      channel = 'whatsapp'
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      active: hasActiveMembership,
      role: liveRole,
      error: membershipError,
    } = await verifyActiveCompanionMembership({
      admin,
      companyId: tokenPayload.company_id,
      userId: tokenPayload.sub,
    })

    if (membershipError) {
      return NextResponse.json(
        { ok: false, status: 'MEMBERSHIP_ERROR', error: membershipError },
        { status: 400, headers: corsHeaders },
      )
    }

    if (!hasActiveMembership) {
      return NextResponse.json(
        {
          ok: false,
          status: 'NO_COMPANY_PERMISSION',
          error: 'Usuário sem vínculo ativo com a empresa do Companion.',
        },
        { status: 403, headers: corsHeaders },
      )
    }

    // Revalida TUDO a partir do zero — nunca confia no estado que a busca
    // devolveu segundos antes (TOCTOU de autorização, STEP 2A.2 seção 22).
    const { data: leadData, error: leadError } = await admin
      .from('leads')
      .select('id, company_id, deleted_at')
      .eq('company_id', tokenPayload.company_id)
      .eq('id', leadId)
      .maybeSingle()

    if (leadError) {
      return NextResponse.json(
        { ok: false, status: 'LEAD_SEARCH_ERROR', error: 'Não foi possível validar o lead selecionado.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const lead = (leadData as LeadRow | null) ?? null

    if (!lead) {
      return NextResponse.json(
        {
          ok: false,
          status: 'LEAD_NOT_FOUND',
          error: 'Lead não encontrado para a empresa informada.',
        },
        { status: 404, headers: corsHeaders },
      )
    }

    if (lead.deleted_at) {
      return NextResponse.json(
        {
          ok: false,
          status: 'SOFT_DELETED',
          error: 'Lead arquivado ou excluído não pode receber vínculo de contato externo.',
        },
        { status: 409, headers: corsHeaders },
      )
    }

    const { cycles: cyclesForLead, error: cyclesError } = await loadSalesCyclesForLead({
      admin,
      companyId: tokenPayload.company_id,
      leadId: lead.id,
    })

    if (cyclesError) {
      return NextResponse.json(
        { ok: false, status: 'CYCLE_SEARCH_ERROR', error: cyclesError },
        { status: 400, headers: corsHeaders },
      )
    }

    const isAuthorized = canUserLinkLead({
      role: liveRole,
      userId: tokenPayload.sub,
      cyclesForLead,
    })

    if (!isAuthorized) {
      return NextResponse.json(
        {
          ok: false,
          status: 'LEAD_ACCESS_DENIED',
          error: 'Você não tem permissão para vincular este lead.',
        },
        { status: 403, headers: corsHeaders },
      )
    }

    const { data: rpcData, error: rpcError } = await admin.rpc(
      'rpc_link_companion_external_identity_first',
      {
        p_company_id: tokenPayload.company_id,
        p_lead_id: lead.id,
        p_platform: platform,
        p_external_identity_key: platformContactKey,
        p_identity_source: IDENTITY_SOURCE,
        p_actor_user_id: tokenPayload.sub,
        p_channel: channel,
      },
    )

    if (rpcError) {
      return NextResponse.json(
        { ok: false, status: 'FIRST_LINK_RPC_ERROR', error: 'Não foi possível vincular o contato ao lead.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as FirstLinkRpcRow | null

    if (!row) {
      return NextResponse.json(
        { ok: false, status: 'FIRST_LINK_RPC_ERROR', error: 'Resposta vazia da RPC de vínculo.' },
        { status: 400, headers: corsHeaders },
      )
    }

    if (row.status === 'ALREADY_LINKED_CONFLICT') {
      // Nunca revela qual é o outro lead/carteira (STEP 2A.2, seção 19).
      return NextResponse.json(
        {
          ok: false,
          status: 'ALREADY_LINKED_CONFLICT',
          error: 'Este contato já está vinculado a outro lead.',
        },
        { status: 409, headers: corsHeaders },
      )
    }

    return NextResponse.json(
      { ok: true, status: row.status, lead_id: row.lead_id },
      { status: 200, headers: corsHeaders },
    )
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: 'UNEXPECTED_ERROR',
        error: 'Erro inesperado ao vincular lead.',
      },
      { status: 500, headers: corsHeaders },
    )
  }
}
