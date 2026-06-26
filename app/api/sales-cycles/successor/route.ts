import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getAuthedSupabase } from '@/app/lib/supabase/server'

type AssignmentMode =
  | 'same_seller'
  | 'pool'
  | 'auto_balance'
  | 'specific_seller'

type OpportunityType =
  | 'reativacao'
  | 'renovacao'
  | 'recompra'
  | 'upgrade'
  | 'novo_produto'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type SourceCycleRow = {
  id: string
  company_id: string
  lead_id: string
  status: 'ganho' | 'perdido' | string
  owner_user_id: string | null
  won_owner_user_id: string | null
  lost_owner_user_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  is_active_global: boolean | null
}

type ActiveMembershipRow = {
  user_id: string
  role: string | null
}

type GroupRow = {
  id: string
  name: string
}

type SuccessorRpcResult = {
  success?: boolean
  error?: string
  cycle_id?: string
  lead_id?: string
  active_cycle_id?: string
  owner_user_id?: string | null
  assignment_mode?: AssignmentMode
  opportunity_type?: OpportunityType
  group_id?: string | null
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const OPPORTUNITY_TYPES: OpportunityType[] = [
  'reativacao',
  'renovacao',
  'recompra',
  'upgrade',
  'novo_produto',
]

const ASSIGNMENT_MODES: AssignmentMode[] = [
  'same_seller',
  'pool',
  'auto_balance',
  'specific_seller',
]

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

function normalizeUuid(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  if (!UUID_REGEX.test(trimmed)) {
    return null
  }

  return trimmed
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''

  return value.trim()
}

function getProfileLabel(profile: ProfileRow | undefined, fallbackId: string) {
  const fullName = profile?.full_name?.trim()

  if (fullName) {
    return fullName
  }

  const email = profile?.email?.trim()

  if (email) {
    return email
  }

  return `Usuário ${fallbackId.slice(0, 8)}`
}

async function getActorContext() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  const { supabase, user } = await getAuthedSupabase()
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    throw new Error('Empresa ativa não selecionada.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (!profile?.id) {
    throw new Error('Perfil do usuário logado não encontrado.')
  }

  if (profile.is_active_global === false) {
    throw new Error('Usuário globalmente inativo.')
  }

  const { data: actorMembership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    throw new Error(membershipError.message)
  }

  const membership = actorMembership as MembershipRow | null

  if (!membership?.company_id) {
    throw new Error('Usuário sem vínculo ativo com a empresa.')
  }

  const admin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return {
    supabase,
    admin,
    user,
    companyId: membership.company_id,
    role: membership.role ?? 'member',
  }
}

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url)
    const sourceCycleId = normalizeUuid(
      requestUrl.searchParams.get('source_cycle_id'),
    )

    if (!sourceCycleId) {
      return jsonError('Ciclo de origem inválido.', 400)
    }

    const {
      admin,
      user,
      companyId,
      role,
    } = await getActorContext()

    const isAdminOrManager = role === 'admin' || role === 'manager'

    const { data: sourceCycle, error: sourceCycleError } = await admin
      .from('sales_cycles')
      .select(
        'id, company_id, lead_id, status, owner_user_id, won_owner_user_id, lost_owner_user_id',
      )
      .eq('id', sourceCycleId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (sourceCycleError) {
      return jsonError(sourceCycleError.message, 400)
    }

    const source = sourceCycle as SourceCycleRow | null

    if (!source?.id) {
      return jsonError('Ciclo de origem não encontrado.', 404)
    }

    if (source.status !== 'ganho' && source.status !== 'perdido') {
      return jsonError(
        'Uma nova oportunidade só pode ser criada a partir de Ganho ou Perdido.',
        400,
      )
    }

    const terminalOwnerId =
      source.status === 'ganho'
        ? source.won_owner_user_id
        : source.lost_owner_user_id

    if (
      !isAdminOrManager &&
      source.owner_user_id !== user.id &&
      terminalOwnerId !== user.id
    ) {
      return jsonError(
        'Você não tem permissão para criar uma oportunidade a partir deste ciclo.',
        403,
      )
    }

    const { data: memberships, error: membershipsError } = await admin
      .from('company_memberships')
      .select('user_id, role')
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (membershipsError) {
      return jsonError(membershipsError.message, 400)
    }

    const activeMemberships = (memberships ?? []) as ActiveMembershipRow[]
    const activeUserIds = activeMemberships.map((membership) => membership.user_id)

    const { data: profiles, error: profilesError } = activeUserIds.length
      ? await admin
          .from('profiles')
          .select('id, full_name, email, is_active_global')
          .in('id', activeUserIds)
      : { data: [], error: null }

    if (profilesError) {
      return jsonError(profilesError.message, 400)
    }

    const profileById = new Map(
      ((profiles ?? []) as ProfileRow[])
        .filter((profile) => profile.is_active_global !== false)
        .map((profile) => [profile.id, profile]),
    )

    const membershipsWithActiveProfiles = activeMemberships.filter((membership) =>
      profileById.has(membership.user_id),
    )

    const sellerMemberships = membershipsWithActiveProfiles.filter(
      (membership) =>
        membership.role === 'member' || membership.role === 'manager',
    )

    const sellers = sellerMemberships
      .map((membership) => ({
        id: membership.user_id,
        label: getProfileLabel(
          profileById.get(membership.user_id),
          membership.user_id,
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

    const recommendedOwnerId =
      terminalOwnerId ?? source.owner_user_id ?? null

    const recommendedOwnerProfile = recommendedOwnerId
      ? profileById.get(recommendedOwnerId)
      : undefined

    const recommendedOwnerIsActive =
      Boolean(recommendedOwnerId) &&
      membershipsWithActiveProfiles.some(
        (membership) => membership.user_id === recommendedOwnerId,
      )

    const { data: groups, error: groupsError } = await admin
      .from('lead_groups')
      .select('id, name')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('name')

    if (groupsError) {
      return jsonError(groupsError.message, 400)
    }

    return NextResponse.json({
      ok: true,
      source_cycle_id: source.id,
      can_change_destination: isAdminOrManager,
      recommended_owner_id: recommendedOwnerIsActive
        ? recommendedOwnerId
        : null,
      recommended_owner_label:
        recommendedOwnerIsActive && recommendedOwnerId
          ? getProfileLabel(recommendedOwnerProfile, recommendedOwnerId)
          : null,
      sellers,
      groups: (groups ?? []) as GroupRow[],
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao carregar opções da nova oportunidade.'

    const status =
      message === 'Empresa ativa não selecionada.'
        ? 400
        : message === 'Usuário sem vínculo ativo com a empresa.'
          ? 403
          : message === 'Usuário globalmente inativo.'
            ? 403
            : 500

    return jsonError(message, status)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      source_cycle_id?: unknown
      opportunity_type?: unknown
      assignment_mode?: unknown
      owner_user_id?: unknown
      group_id?: unknown
      note?: unknown
    }

    const sourceCycleId = normalizeUuid(body.source_cycle_id)
    const opportunityType = normalizeText(body.opportunity_type)
      .toLowerCase() as OpportunityType
    const assignmentMode = normalizeText(body.assignment_mode)
      .toLowerCase() as AssignmentMode
    const ownerUserId = normalizeUuid(body.owner_user_id)
    const groupId = normalizeUuid(body.group_id)
    const note = normalizeText(body.note).slice(0, 2000) || null

    if (!sourceCycleId) {
      return jsonError('Ciclo de origem inválido.', 400)
    }

    if (!OPPORTUNITY_TYPES.includes(opportunityType)) {
      return jsonError('Tipo de oportunidade inválido.', 400)
    }

    if (!ASSIGNMENT_MODES.includes(assignmentMode)) {
      return jsonError('Destino da oportunidade inválido.', 400)
    }

    const {
      supabase,
      companyId,
    } = await getActorContext()

    const { data, error } = await supabase.rpc(
      'rpc_create_successor_cycle_for_company',
      {
        p_company_id: companyId,
        p_source_cycle_id: sourceCycleId,
        p_opportunity_type: opportunityType,
        p_assignment_mode: assignmentMode,
        p_owner_user_id: ownerUserId,
        p_group_id: groupId,
        p_note: note,
      },
    )

    if (error) {
      return jsonError(error.message, 400)
    }

    const result = (data ?? {}) as SuccessorRpcResult

    if (!result.success) {
      const errorCode = result.error ?? 'successor_cycle_creation_failed'

      const status =
        errorCode === 'active_cycle_exists'
          ? 409
          : errorCode === 'permission_denied' ||
              errorCode === 'membership_not_found' ||
              errorCode === 'destination_change_requires_manager'
            ? 403
            : 400

      return NextResponse.json(
        {
          ok: false,
          ...result,
          error: errorCode,
        },
        { status },
      )
    }

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro ao criar nova oportunidade.'

    const status =
      message === 'Empresa ativa não selecionada.'
        ? 400
        : message === 'Usuário sem vínculo ativo com a empresa.'
          ? 403
          : message === 'Usuário globalmente inativo.'
            ? 403
            : 500

    return jsonError(message, status)
  }
}
