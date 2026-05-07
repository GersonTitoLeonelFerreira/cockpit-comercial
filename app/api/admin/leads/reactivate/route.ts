import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getAuthedSupabase } from '@/app/lib/supabase/server'

type ReactivateLeadBody = {
  lead_id?: unknown
  owner_user_id?: unknown
  group_id?: unknown
}

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type DeletedLeadRow = {
  id: string
  company_id: string
  name: string | null
  phone: string | null
  email: string | null
  cpf_cnpj: string | null
  deleted_at: string | null
}

type CycleRow = {
  id: string
  lead_id: string
  current_group_id: string | null
  owner_user_id: string | null
  status: string | null
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function isDuplicateError(message: string): boolean {
  const msg = String(message || '').toLowerCase()
  return msg.includes('duplicate') || msg.includes('unique')
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 },
      )
    }

    let authContext: Awaited<ReturnType<typeof getAuthedSupabase>>

    try {
      authContext = await getAuthedSupabase()
    } catch {
      return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
    }

    const { supabase, user } = authContext

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const body = (await req.json().catch(() => ({}))) as ReactivateLeadBody

    const leadId = cleanText(body.lead_id)
    const ownerUserId = cleanText(body.owner_user_id)
    const groupId = cleanText(body.group_id)

    if (!leadId) {
      return NextResponse.json({ ok: false, error: 'Lead obrigatório.' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        { ok: false, error: 'Empresa ativa não selecionada.' },
        { status: 400 },
      )
    }

    const { data: actorProfile, error: actorErr } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (actorErr) {
      return NextResponse.json({ ok: false, error: actorErr.message }, { status: 400 })
    }

    if (!actorProfile?.id) {
      return NextResponse.json(
        { ok: false, error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }

    if (actorProfile.is_active_global === false) {
      return NextResponse.json(
        { ok: false, error: 'Usuário globalmente inativo.' },
        { status: 403 },
      )
    }

    const { data: actorMembership, error: actorMembershipErr } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (actorMembershipErr) {
      return NextResponse.json(
        { ok: false, error: actorMembershipErr.message },
        { status: 400 },
      )
    }

    const membership = actorMembership as MembershipRow | null

    if (!membership?.company_id) {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem vínculo ativo com a empresa.' },
        { status: 403 },
      )
    }

    if (membership.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Apenas administradores podem reativar leads.' },
        { status: 403 },
      )
    }

    const companyId = membership.company_id

    if (ownerUserId) {
      const { data: ownerMembership, error: ownerErr } = await admin
        .from('company_memberships')
        .select('user_id, company_id, role, is_active')
        .eq('user_id', ownerUserId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (ownerErr) {
        return NextResponse.json({ ok: false, error: ownerErr.message }, { status: 400 })
      }

      if (!ownerMembership?.user_id) {
        return NextResponse.json(
          { ok: false, error: 'Vendedor inválido para esta empresa.' },
          { status: 400 },
        )
      }

      if (ownerMembership.is_active === false) {
        return NextResponse.json({ ok: false, error: 'Vendedor inativo.' }, { status: 403 })
      }
    }

    if (groupId) {
      const { data: group, error: groupErr } = await admin
        .from('lead_groups')
        .select('id')
        .eq('company_id', companyId)
        .eq('id', groupId)
        .is('archived_at', null)
        .maybeSingle()

      if (groupErr) {
        return NextResponse.json({ ok: false, error: groupErr.message }, { status: 400 })
      }

      if (!group?.id) {
        return NextResponse.json(
          { ok: false, error: 'Grupo inválido para esta empresa.' },
          { status: 400 },
        )
      }
    }

    const { data: leads, error: leadErr } = await admin
      .from('leads')
      .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at')
      .eq('id', leadId)
      .eq('company_id', companyId)
      .limit(1)

    if (leadErr) {
      return NextResponse.json({ ok: false, error: leadErr.message }, { status: 400 })
    }

    const lead = (leads ?? [])[0] as DeletedLeadRow | undefined

    if (!lead?.id) {
      return NextResponse.json(
        { ok: false, error: 'Lead não encontrado nesta empresa.' },
        { status: 404 },
      )
    }

    if (!lead.deleted_at) {
      return NextResponse.json(
        { ok: false, error: 'Este lead já está ativo.' },
        { status: 409 },
      )
    }

    const { data: updatedLeads, error: updateLeadErr } = await admin
      .from('leads')
      .update({
        deleted_at: null,
        deleted_by: null,
      })
      .eq('id', lead.id)
      .eq('company_id', companyId)
      .select('id')

    if (updateLeadErr) {
      return NextResponse.json({ ok: false, error: updateLeadErr.message }, { status: 400 })
    }

    if (!updatedLeads || updatedLeads.length !== 1) {
      return NextResponse.json(
        { ok: false, error: 'Falha ao reativar lead.' },
        { status: 409 },
      )
    }

    const { data: existingCycles, error: cycleLookupErr } = await admin
      .from('sales_cycles')
      .select('id, lead_id, current_group_id, owner_user_id, status')
      .eq('company_id', companyId)
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (cycleLookupErr) {
      return NextResponse.json({ ok: false, error: cycleLookupErr.message }, { status: 400 })
    }

    let cycle = ((existingCycles ?? [])[0] ?? null) as CycleRow | null

    const targetOwnerUserId = ownerUserId || null
    const targetGroupId = groupId || null

    if (!cycle) {
      const { data: createdCycles, error: createCycleErr } = await admin
        .from('sales_cycles')
        .insert({
          company_id: companyId,
          lead_id: lead.id,
          owner_user_id: targetOwnerUserId,
          status: 'novo',
          current_group_id: targetGroupId,
          stage_entered_at: new Date().toISOString(),
        })
        .select('id, lead_id, current_group_id, owner_user_id, status')

      if (createCycleErr) {
        return NextResponse.json({ ok: false, error: createCycleErr.message }, { status: 400 })
      }

      const createdCycle = createdCycles?.[0]

      if (!createdCycle?.id) {
        return NextResponse.json(
          { ok: false, error: 'Falha ao criar ciclo para lead reativado.' },
          { status: 400 },
        )
      }

      cycle = createdCycle as CycleRow
    } else {
      const { data: updatedCycles, error: updateCycleErr } = await admin
        .from('sales_cycles')
        .update({
          owner_user_id: targetOwnerUserId,
          status: 'novo',
          current_group_id: targetGroupId,
          stage_entered_at: new Date().toISOString(),
        })
        .eq('id', cycle.id)
        .eq('company_id', companyId)
        .select('id, lead_id, current_group_id, owner_user_id, status')

      if (updateCycleErr) {
        return NextResponse.json({ ok: false, error: updateCycleErr.message }, { status: 400 })
      }

      const updatedCycle = updatedCycles?.[0]

      if (!updatedCycle?.id) {
        return NextResponse.json(
          { ok: false, error: 'Falha ao atualizar ciclo do lead reativado.' },
          { status: 409 },
        )
      }

      cycle = updatedCycle as CycleRow
    }

    if (targetGroupId && cycle) {
      const { error: groupLinkErr } = await admin.from('lead_group_cycles').insert({
        company_id: companyId,
        group_id: targetGroupId,
        cycle_id: cycle.id,
        attached_by: user.id,
      })

      if (groupLinkErr && !isDuplicateError(groupLinkErr.message)) {
        return NextResponse.json(
          { ok: false, error: `Grupo do lead: ${groupLinkErr.message}` },
          { status: 400 },
        )
      }

      const { error: groupEventErr } = await admin.from('cycle_events').insert({
        company_id: companyId,
        cycle_id: cycle.id,
        event_type: 'group_attached',
        created_by: user.id,
        metadata: {
          group_id: targetGroupId,
          source: 'admin_reactivate',
        },
        occurred_at: new Date().toISOString(),
      })

      void groupEventErr
    }

    const { error: reactivationEventErr } = await admin.from('cycle_events').insert({
      company_id: companyId,
      cycle_id: cycle.id,
      event_type: 'lead_reactivated_by_admin',
      created_by: user.id,
      metadata: {
        lead_id: lead.id,
        previous_deleted_at: lead.deleted_at,
        owner_user_id: targetOwnerUserId,
        group_id: targetGroupId,
        source: 'admin_reactivate',
      },
      occurred_at: new Date().toISOString(),
    })

    void reactivationEventErr

    return NextResponse.json({
      ok: true,
      action: 'reactivated',
      lead_id: lead.id,
      cycle_id: cycle.id,
      owner_user_id: targetOwnerUserId,
      group_id: targetGroupId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao reativar lead.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}