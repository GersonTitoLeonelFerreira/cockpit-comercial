import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import {
  canUserLinkLead,
  getCompanionCorsHeaders,
  isAdminOrManagerRole,
  maskPhoneHint,
  onlyDigits,
  pickApplicableCycle,
  sanitizeSearchTerm,
  verifyActiveCompanionMembership,
  type CompanionSalesCycleRow,
} from '@/app/lib/companion/companion-lead-access'

// STEP 2A.2 — busca de leads vinculáveis, para o futuro fluxo
// CONTACT_NOT_LINKED -> buscar -> selecionar -> confirmar -> first-link.
//
// Nunca reutiliza app/api/search/route.ts: aquele endpoint usa sessão de
// cookie (getAuthedSupabase) e retorna qualquer lead da company_id sem
// nenhum recorte de carteira — amplo demais para o contrato do
// Companion/member (auditoria STEP 2A). Este endpoint usa o MESMO
// mecanismo de autenticação e a MESMA regra de autorização de
// resolve-lead/route.ts, via app/lib/companion/companion-lead-access.ts.

type SearchBody = {
  query?: unknown
}

type LeadCandidateRow = {
  id: string
  company_id: string
  name: string | null
  phone: string | null
  deleted_at: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

// Limite público de resultados retornados ao cliente.
const MAX_RESULTS = 10

// Teto interno de candidatos buscados no banco ANTES do recorte de
// carteira (necessário porque, para member, o filtro de posse só pode ser
// aplicado depois de carregar os ciclos de cada candidato) — nunca
// exposto/ajustável pelo cliente, nunca paginação ilimitada.
const CANDIDATE_FETCH_LIMIT = 50

function getOwnerName(owner: ProfileRow | null | undefined) {
  return owner?.full_name || owner?.email || null
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

    // company_id nunca vem do corpo da requisição — sempre do token.
    const body = (await request.json().catch(() => ({}))) as SearchBody
    const rawQuery = typeof body.query === 'string' ? body.query : ''
    const safeText = sanitizeSearchTerm(rawQuery)
    const digits = onlyDigits(rawQuery)

    const isPhoneQuery = digits.length >= 4
    const isNameQuery = !isPhoneQuery && safeText.length >= 2

    if (!isPhoneQuery && !isNameQuery) {
      return NextResponse.json(
        {
          ok: false,
          status: 'QUERY_TOO_SHORT',
          error:
            'Informe ao menos 2 caracteres de nome ou 4 dígitos de telefone para buscar.',
        },
        { status: 400, headers: corsHeaders },
      )
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { active: hasActiveMembership, error: membershipError } =
      await verifyActiveCompanionMembership({
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

    let candidateQuery = admin
      .from('leads')
      .select('id, company_id, name, phone, deleted_at')
      .eq('company_id', tokenPayload.company_id)
      .is('deleted_at', null)
      .limit(CANDIDATE_FETCH_LIMIT)

    candidateQuery = isPhoneQuery
      ? candidateQuery.ilike('phone_digits', `%${digits}%`)
      : candidateQuery.ilike('name', `%${safeText}%`)

    const { data: candidateData, error: candidateError } = await candidateQuery

    if (candidateError) {
      return NextResponse.json(
        { ok: false, status: 'LEAD_SEARCH_ERROR', error: candidateError.message },
        { status: 400, headers: corsHeaders },
      )
    }

    const candidates = ((candidateData ?? []) as LeadCandidateRow[]).filter(
      (lead) => lead.company_id === tokenPayload.company_id && !lead.deleted_at,
    )

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, leads: [] }, { status: 200, headers: corsHeaders })
    }

    const candidateIds = candidates.map((lead) => lead.id)

    const { data: cycleData, error: cycleError } = await admin
      .from('sales_cycles')
      .select('id, lead_id, company_id, status, owner_user_id, updated_at, created_at')
      .eq('company_id', tokenPayload.company_id)
      .in('lead_id', candidateIds)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })

    if (cycleError) {
      return NextResponse.json(
        { ok: false, status: 'CYCLE_SEARCH_ERROR', error: cycleError.message },
        { status: 400, headers: corsHeaders },
      )
    }

    const cyclesByLead = new Map<string, CompanionSalesCycleRow[]>()

    for (const cycle of (cycleData ?? []) as CompanionSalesCycleRow[]) {
      if (cycle.company_id !== tokenPayload.company_id) {
        continue
      }

      const existing = cyclesByLead.get(cycle.lead_id) ?? []
      existing.push(cycle)
      cyclesByLead.set(cycle.lead_id, existing)
    }

    const authorizedLeads = candidates.filter((lead) =>
      canUserLinkLead({
        role: tokenPayload.role,
        userId: tokenPayload.sub,
        cyclesForLead: cyclesByLead.get(lead.id) ?? [],
      }),
    )

    const limitedLeads = authorizedLeads.slice(0, MAX_RESULTS)
    const isAdminOrManager = isAdminOrManagerRole(tokenPayload.role)

    // owner_name só é exibido para admin/manager (para member, o único
    // owner possível nos resultados é o próprio usuário — redundante e
    // desnecessário expor). Evita uma consulta a profiles sem uso.
    const ownerIds = isAdminOrManager
      ? Array.from(
          new Set(
            limitedLeads
              .map((lead) => pickApplicableCycle(cyclesByLead.get(lead.id) ?? []).latestCycle?.owner_user_id)
              .filter((ownerId): ownerId is string => Boolean(ownerId)),
          ),
        )
      : []

    let ownersById = new Map<string, ProfileRow>()

    if (ownerIds.length > 0) {
      const { data: ownerRows, error: ownerError } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ownerIds)

      if (ownerError) {
        return NextResponse.json(
          { ok: false, status: 'OWNER_SEARCH_ERROR', error: ownerError.message },
          { status: 400, headers: corsHeaders },
        )
      }

      ownersById = new Map(((ownerRows ?? []) as ProfileRow[]).map((row) => [row.id, row]))
    }

    // Só o suficiente para o vendedor distinguir leads — nunca
    // cpf/cnpj/email completo/endereço/notas (STEP 2A.2, seção 9).
    const leads = limitedLeads.map((lead) => {
      const { latestCycle } = pickApplicableCycle(cyclesByLead.get(lead.id) ?? [])
      const owner = latestCycle?.owner_user_id ? ownersById.get(latestCycle.owner_user_id) : null

      return {
        id: lead.id,
        name: lead.name,
        phone_hint: maskPhoneHint(lead.phone),
        owner_name: isAdminOrManager ? getOwnerName(owner) : null,
        cycle_status: latestCycle?.status ?? null,
      }
    })

    return NextResponse.json({ ok: true, leads }, { status: 200, headers: corsHeaders })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'UNEXPECTED_ERROR',
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao buscar leads.',
      },
      { status: 500, headers: corsHeaders },
    )
  }
}
