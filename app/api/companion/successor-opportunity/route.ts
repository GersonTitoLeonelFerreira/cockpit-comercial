import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import {
  SUCCESSOR_ERROR_MESSAGES,
  evaluateSuccessorOpportunityEligibility,
  getSuccessorErrorHttpStatus,
  isSuccessorOpportunityType,
  readSuccessorNote,
} from '@/app/lib/companion/successor-opportunity'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import { isFullReadingPanelEnabled } from '@/app/lib/server/full-reading-flag'

// "Nova oportunidade" pelo Companion (decisão do Controle Mestre,
// 01/10/2026): cria um ciclo sucessor a partir de um ciclo Ganho/Perdido,
// sempre na carteira de quem confirma. Só com confirmação humana explícita
// (o vendedor escolhe o tipo e confirma); nunca automático, nunca a partir
// do conteúdo da conversa. A rota refaz as verificações (sessão, vínculo,
// ciclo, lead, carteira, ciclo aberto) e a RPC
// rpc_create_successor_cycle_from_companion refaz tudo no banco. A resposta
// nunca leva lead_id: só o id do ciclo novo, para o painel resolver de
// novo e abrir nele.

type SuccessorBody = {
  cycle_id?: unknown
  opportunity_type?: unknown
  note?: unknown
  confirmed_by_human?: unknown
}


type CycleRow = {
  id: string
  company_id: string
  lead_id: string
  status: string | null
  owner_user_id: string | null
  won_owner_user_id: string | null
  lost_owner_user_id: string | null
}

type SuccessorRpcResult = {
  success?: boolean
  error?: string
  cycle_id?: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function respond(
  request: Request,
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: getCorsHeaders(request),
  })
}

function refuse(request: Request, code: string) {
  return respond(
    request,
    {
      ok: false,
      status: 'SUCCESSOR_REFUSED',
      code,
      error:
        SUCCESSOR_ERROR_MESSAGES[code] ??
        'Não foi possível criar a nova oportunidade.',
    },
    getSuccessorErrorHttpStatus(code),
  )
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  try {
    const tokenPayload =
      verifyCompanionRequestToken(request)

    if (!tokenPayload) {
      return respond(
        request,
        {
          ok: false,
          status: 'INVALID_COMPANION_TOKEN',
          error: 'Sessão do Companion inválida ou expirada.',
        },
        401,
      )
    }

    const body =
      ((await request.json().catch(() => ({}))) ?? {}) as SuccessorBody

    const sourceCycleId =
      typeof body.cycle_id === 'string' && UUID_PATTERN.test(body.cycle_id.trim())
        ? body.cycle_id.trim().toLowerCase()
        : null

    if (!sourceCycleId) {
      return respond(
        request,
        {
          ok: false,
          status: 'INVALID_PAYLOAD',
          error: 'Ciclo de origem inválido.',
        },
        400,
      )
    }

    if (!isSuccessorOpportunityType(body.opportunity_type)) {
      return refuse(request, 'invalid_opportunity_type')
    }

    if (body.confirmed_by_human !== true) {
      return respond(
        request,
        {
          ok: false,
          status: 'CONFIRMATION_REQUIRED',
          error: 'Confirme a criação da nova oportunidade.',
        },
        400,
      )
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return respond(
        request,
        {
          ok: false,
          status: 'ENV_MISSING',
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        500,
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: membershipRow } = await admin
      .from('company_memberships')
      .select('company_id, user_id, role, is_active')
      .eq('company_id', tokenPayload.company_id)
      .eq('user_id', tokenPayload.sub)
      .eq('is_active', true)
      .maybeSingle()

    const { data: profileRow } = await admin
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', tokenPayload.sub)
      .maybeSingle()

    const membership =
      membershipRow as { role?: string | null } | null

    if (
      !membership?.role ||
      !profileRow ||
      (profileRow as { is_active_global?: boolean | null }).is_active_global === false
    ) {
      return refuse(request, 'membership_not_found')
    }

    const { data: sourceRow } = await admin
      .from('sales_cycles')
      .select('id, company_id, lead_id, status, owner_user_id, won_owner_user_id, lost_owner_user_id')
      .eq('id', sourceCycleId)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    const sourceCycle =
      sourceRow as CycleRow | null

    if (!sourceCycle) {
      return refuse(request, 'source_cycle_not_found')
    }

    const { data: leadRow } = await admin
      .from('leads')
      .select('id, deleted_at')
      .eq('id', sourceCycle.lead_id)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    const { data: cycleRows } = await admin
      .from('sales_cycles')
      .select('id, status')
      .eq('company_id', tokenPayload.company_id)
      .eq('lead_id', sourceCycle.lead_id)

    const eligibility =
      evaluateSuccessorOpportunityEligibility({
        actorUserId: tokenPayload.sub,
        role: membership.role,
        lead: leadRow as { deleted_at?: string | null } | null,
        sourceCycle,
        cycles: (cycleRows ?? []) as { status: string | null }[],
      })

    if (!eligibility.eligible && eligibility.reason) {
      return refuse(request, eligibility.reason)
    }

    const { data, error } = await admin.rpc(
      'rpc_create_successor_cycle_from_companion',
      {
        p_company_id: tokenPayload.company_id,
        p_actor_user_id: tokenPayload.sub,
        p_source_cycle_id: sourceCycle.id,
        p_opportunity_type: body.opportunity_type,
        // "O que é esta oportunidade?": só com a leitura completa ligada.
        p_note: readSuccessorNote(body.note, isFullReadingPanelEnabled()),
      },
    )

    if (error) {
      // Migração 20261001150000 ainda não aplicada: nada é criado.
      if (error.code === 'PGRST202' || error.code === '42883') {
        return respond(
          request,
          {
            ok: false,
            status: 'SUCCESSOR_RPC_UNAVAILABLE',
            error: 'A criação de oportunidade pelo Companion ainda não está liberada. Use a Yolen.',
          },
          503,
        )
      }

      return respond(
        request,
        {
          ok: false,
          status: 'SUCCESSOR_ERROR',
          error: 'Não foi possível criar a nova oportunidade.',
        },
        500,
      )
    }

    const result =
      (data ?? {}) as SuccessorRpcResult

    if (!result.success || typeof result.cycle_id !== 'string') {
      return refuse(
        request,
        typeof result.error === 'string' ? result.error : 'successor_cycle_creation_failed',
      )
    }

    return respond(
      request,
      {
        ok: true,
        status: 'SUCCESSOR_CREATED',
        cycle: {
          id: result.cycle_id,
          status: 'novo',
        },
        opportunity_type: body.opportunity_type,
      },
      200,
    )
  } catch {
    return respond(
      request,
      {
        ok: false,
        status: 'SUCCESSOR_ERROR',
        error: 'Não foi possível criar a nova oportunidade.',
      },
      500,
    )
  }
}
