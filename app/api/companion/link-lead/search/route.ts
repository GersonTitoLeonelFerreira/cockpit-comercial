import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import {
  getCompanionCorsHeaders,
  indexOwnedLeadsByApplicableOpenCycle,
  isAdminOrManagerRole,
  loadOpenCyclesOwnedByUser,
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
//
// A role usada para autorizar é a da membership ATUAL no banco, nunca
// tokenPayload.role: o token dura até 6h e pode ficar desatualizado se a
// role da pessoa mudar nesse meio-tempo (STEP 2A.2, correção 1).
//
// Estratégia de busca por papel (correção 4 do STEP 2A.2): para member,
// nunca faz "buscar candidatos company-wide com limite e filtrar depois"
// — isso poderia descartar, por causa do limite, um lead que o próprio
// usuário tem permissão de vincular antes mesmo de ele ser considerado.
// Em vez disso, parte da carteira REAL do member (ciclos abertos que ele
// possui, sem limite — nunca é um conjunto company-wide) e só then aplica
// o termo de busca dentro desse conjunto já autorizado. Para admin/manager
// não existe esse risco (toda a empresa já é autorizada), então a busca
// continua direto na tabela leads com um teto de candidatos.

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
}

// Limite público de resultados retornados ao cliente.
const MAX_RESULTS = 10

// Teto de candidatos buscados diretamente em `leads` no caminho
// admin/manager (company-wide, sempre autorizado — um teto aqui só limita
// quantos resultados aparecem de uma vez, nunca esconde algo que o próprio
// usuário tinha direito de ver). Nunca usado no caminho member.
const ADMIN_CANDIDATE_FETCH_LIMIT = 50

// Nunca retorna e-mail como nome de exibição (STEP 2A.2, correção 3).
function getOwnerName(owner: ProfileRow | null | undefined) {
  return owner?.full_name || null
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

    const isAdminOrManager = isAdminOrManagerRole(liveRole)

    let leads: Array<{
      id: string
      name: string | null
      phone_hint: string | null
      owner_name: string | null
      cycle_status: string | null
    }>

    if (isAdminOrManager) {
      let candidateQuery = admin
        .from('leads')
        .select('id, company_id, name, phone, deleted_at')
        .eq('company_id', tokenPayload.company_id)
        .is('deleted_at', null)
        .limit(ADMIN_CANDIDATE_FETCH_LIMIT)

      candidateQuery = isPhoneQuery
        ? candidateQuery.ilike('phone_digits', `%${digits}%`)
        : candidateQuery.ilike('name', `%${safeText}%`)

      const { data: candidateData, error: candidateError } = await candidateQuery

      if (candidateError) {
        return NextResponse.json(
          { ok: false, status: 'LEAD_SEARCH_ERROR', error: 'Não foi possível buscar leads.' },
          { status: 400, headers: corsHeaders },
        )
      }

      const candidates = ((candidateData ?? []) as LeadCandidateRow[])
        .filter((lead) => lead.company_id === tokenPayload.company_id && !lead.deleted_at)
        .slice(0, MAX_RESULTS)

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
          { ok: false, status: 'CYCLE_SEARCH_ERROR', error: 'Não foi possível validar os ciclos comerciais.' },
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

      const ownerIds = Array.from(
        new Set(
          candidates
            .map((lead) => pickApplicableCycle(cyclesByLead.get(lead.id) ?? []).latestCycle?.owner_user_id)
            .filter((ownerId): ownerId is string => Boolean(ownerId)),
        ),
      )

      let ownersById = new Map<string, ProfileRow>()

      if (ownerIds.length > 0) {
        const { data: ownerRows, error: ownerError } = await admin
          .from('profiles')
          .select('id, full_name')
          .in('id', ownerIds)

        if (ownerError) {
          return NextResponse.json(
            { ok: false, status: 'OWNER_SEARCH_ERROR', error: 'Não foi possível carregar os responsáveis dos leads.' },
            { status: 400, headers: corsHeaders },
          )
        }

        ownersById = new Map(((ownerRows ?? []) as ProfileRow[]).map((row) => [row.id, row]))
      }

      leads = candidates.map((lead) => {
        const { latestCycle } = pickApplicableCycle(cyclesByLead.get(lead.id) ?? [])
        const owner = latestCycle?.owner_user_id ? ownersById.get(latestCycle.owner_user_id) : null

        return {
          id: lead.id,
          name: lead.name,
          phone_hint: maskPhoneHint(lead.phone),
          owner_name: getOwnerName(owner),
          cycle_status: latestCycle?.status ?? null,
        }
      })
    } else {
      // Member: parte da carteira real (nunca de um recorte company-wide
      // com limite) — o termo de busca só filtra DENTRO do que o usuário
      // já tem permissão de ver.
      const { cycles: ownedCycles, error: ownedCyclesError } = await loadOpenCyclesOwnedByUser({
        admin,
        companyId: tokenPayload.company_id,
        userId: tokenPayload.sub,
      })

      if (ownedCyclesError) {
        return NextResponse.json(
          { ok: false, status: 'CYCLE_SEARCH_ERROR', error: ownedCyclesError },
          { status: 400, headers: corsHeaders },
        )
      }

      const ownedLeadCycle = indexOwnedLeadsByApplicableOpenCycle(ownedCycles)

      if (ownedLeadCycle.size === 0) {
        return NextResponse.json({ ok: true, leads: [] }, { status: 200, headers: corsHeaders })
      }

      const ownedLeadIds = Array.from(ownedLeadCycle.keys())

      let matchQuery = admin
        .from('leads')
        .select('id, company_id, name, phone, deleted_at')
        .eq('company_id', tokenPayload.company_id)
        .in('id', ownedLeadIds)
        .is('deleted_at', null)
        .limit(MAX_RESULTS)

      matchQuery = isPhoneQuery
        ? matchQuery.ilike('phone_digits', `%${digits}%`)
        : matchQuery.ilike('name', `%${safeText}%`)

      const { data: matchData, error: matchError } = await matchQuery

      if (matchError) {
        return NextResponse.json(
          { ok: false, status: 'LEAD_SEARCH_ERROR', error: 'Não foi possível buscar leads.' },
          { status: 400, headers: corsHeaders },
        )
      }

      const matches = ((matchData ?? []) as LeadCandidateRow[])
        .filter(
          (lead) =>
            lead.company_id === tokenPayload.company_id &&
            !lead.deleted_at &&
            ownedLeadCycle.has(lead.id),
        )
        .slice(0, MAX_RESULTS)

      // owner_name nunca é exibido para member (o único owner possível
      // nos resultados é o próprio usuário — redundante e desnecessário).
      leads = matches.map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone_hint: maskPhoneHint(lead.phone),
        owner_name: null,
        cycle_status: ownedLeadCycle.get(lead.id)?.status ?? null,
      }))
    }

    // Só o suficiente para o vendedor distinguir leads — nunca
    // cpf/cnpj/email completo/endereço/notas (STEP 2A.2, seção 9).
    return NextResponse.json({ ok: true, leads }, { status: 200, headers: corsHeaders })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: 'UNEXPECTED_ERROR',
        error: 'Erro inesperado ao buscar leads.',
      },
      { status: 500, headers: corsHeaders },
    )
  }
}
