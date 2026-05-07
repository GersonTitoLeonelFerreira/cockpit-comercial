import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type AcceptInviteBody = {
  full_name?: string
  password?: string
  phone?: string | null
  cpf?: string
  birth_date?: string
}

type InvitationRow = {
  id: string
  company_id: string
  email: string
  full_name: string | null
  status: string
  expires_at: string
  accepted_user_id: string | null
  accepted_at: string | null
}

type CompanyRow = {
  id: string
  name: string | null
  legal_name: string | null
  trade_name: string | null
  platform_status: string | null
  onboarding_status: string | null
}

type ExistingAuthUser = {
  id: string
  email?: string
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function onlyDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function normalizeName(value: string | null | undefined) {
  return (value ?? '').trim()
}

function normalizePhone(value: string | null | undefined) {
  const digits = onlyDigits(value)
  return digits || null
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function getCompanyDisplayName(company: CompanyRow) {
  return company.trade_name || company.name || company.legal_name || 'Empresa'
}

async function findAuthUserByEmail(
    admin: SupabaseClient,
    email: string,
  ): Promise<ExistingAuthUser | null> {
  const normalizedEmail = normalizeEmail(email)

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) {
    throw new Error(`Falha ao consultar usuários existentes: ${error.message}`)
  }

  const found = data.users.find(
    (user) => normalizeEmail(user.email) === normalizedEmail,
  )

  if (!found?.id) return null

  return {
    id: found.id,
    email: found.email ?? normalizedEmail,
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params

    if (!token || token.trim().length < 32) {
      return NextResponse.json({ error: 'Convite inválido.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as AcceptInviteBody

    const fullName = normalizeName(body.full_name)
    const password = String(body.password ?? '')
    const phone = normalizePhone(body.phone)
    const cpf = onlyDigits(body.cpf)
    const birthDate = String(body.birth_date ?? '').trim()

    if (!fullName) {
      return NextResponse.json({ error: 'Informe seu nome completo.' }, { status: 400 })
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'A senha deve ter no mínimo 6 caracteres.' },
        { status: 400 },
      )
    }

    if (!cpf || cpf.length !== 11) {
      return NextResponse.json({ error: 'Informe um CPF válido com 11 dígitos.' }, { status: 400 })
    }

    if (!birthDate) {
      return NextResponse.json({ error: 'Informe sua data de nascimento.' }, { status: 400 })
    }

    const admin = createClient(url, serviceKey)
    const tokenHash = hashToken(token)

    const { data: invitationData, error: invitationError } = await admin
      .from('company_admin_invitations')
      .select('id, company_id, email, full_name, status, expires_at, accepted_user_id, accepted_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (invitationError) {
      return NextResponse.json({ error: invitationError.message }, { status: 400 })
    }

    if (!invitationData) {
      return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 })
    }

    const invitation = invitationData as InvitationRow
    const invitationEmail = normalizeEmail(invitation.email)

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error:
            invitation.status === 'accepted'
              ? 'Este convite já foi aceito.'
              : 'Este convite não está mais disponível.',
        },
        { status: 400 },
      )
    }

    const expiresAt = new Date(invitation.expires_at)

    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await admin
        .from('company_admin_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)
        .eq('status', 'pending')

      return NextResponse.json({ error: 'Este convite expirou.' }, { status: 400 })
    }

    const { data: companyData, error: companyError } = await admin
      .from('companies')
      .select('id, name, legal_name, trade_name, platform_status, onboarding_status')
      .eq('id', invitation.company_id)
      .single()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 400 })
    }

    if (!companyData) {
      return NextResponse.json(
        { error: 'Empresa vinculada ao convite não encontrada.' },
        { status: 404 },
      )
    }

    const company = companyData as CompanyRow

    if (company.platform_status && company.platform_status !== 'active') {
      return NextResponse.json(
        { error: 'Empresa não está ativa na plataforma.' },
        { status: 400 },
      )
    }

    const { count: activeAdminsCount, error: activeAdminsError } = await admin
      .from('company_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('role', 'admin')
      .eq('is_active', true)

    if (activeAdminsError) {
      return NextResponse.json({ error: activeAdminsError.message }, { status: 400 })
    }

    if ((activeAdminsCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Esta empresa já possui um administrador ativo.' },
        { status: 400 },
      )
    }

    const existingAuthUser = await findAuthUserByEmail(admin, invitationEmail)
    let userId = existingAuthUser?.id ?? null
    let createdNewAuthUser = false

    if (!userId) {
      const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
        email: invitationEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      })

      if (createUserError) {
        return NextResponse.json(
          { error: `Falha ao criar usuário: ${createUserError.message}` },
          { status: 400 },
        )
      }

      userId = createdUser.user?.id ?? null
      createdNewAuthUser = true

      if (!userId) {
        return NextResponse.json({ error: 'Usuário criado sem ID.' }, { status: 500 })
      }
    } else {
      const { error: updateUserError } = await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          full_name: fullName,
        },
      })

      if (updateUserError) {
        return NextResponse.json(
          { error: `Falha ao atualizar usuário existente: ${updateUserError.message}` },
          { status: 400 },
        )
      }
    }

    async function rollbackCreatedAuthUser() {
      if (!createdNewAuthUser || !userId) return

      await admin.from('profile_details').delete().eq('profile_id', userId)
      await admin.from('company_memberships').delete().eq('user_id', userId).eq('company_id', company.id)
      await admin.from('profiles').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId)
    }

    const { data: existingMembership, error: existingMembershipError } = await admin
      .from('company_memberships')
      .select('id, is_active, role')
      .eq('company_id', company.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMembershipError) {
      await rollbackCreatedAuthUser()

      return NextResponse.json({ error: existingMembershipError.message }, { status: 400 })
    }

    if (existingMembership?.is_active) {
      await rollbackCreatedAuthUser()

      return NextResponse.json(
        { error: 'Este usuário já possui vínculo ativo com esta empresa.' },
        { status: 400 },
      )
    }

    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      email: invitationEmail,
      full_name: fullName,

      // Compatibilidade temporária:
      // o banco ainda exige company_id em profiles para gerar user_code.
      // A fonte oficial de empresa/permissão continua sendo company_memberships.
      company_id: company.id,
      role: 'admin',
      is_active: true,

      is_active_global: true,
      is_platform_admin: false,
      status: 'active',
      phone,
      cpf,
      birth_date: birthDate,
    })

    if (profileError) {
      await rollbackCreatedAuthUser()

      return NextResponse.json(
        { error: `Falha ao salvar profile global: ${profileError.message}` },
        { status: 400 },
      )
    }

    const { error: detailsError } = await admin.from('profile_details').upsert({
      profile_id: userId,
      tipo_pessoa: 'fisica',
      legal_name: fullName,
      birth_date: birthDate,
      cpf,
      updated_at: new Date().toISOString(),
    })

    if (detailsError) {
      await rollbackCreatedAuthUser()

      return NextResponse.json(
        { error: `Falha ao criar profile_details: ${detailsError.message}` },
        { status: 400 },
      )
    }

    const membershipPayload = {
      company_id: company.id,
      user_id: userId,
      role: 'admin',
      is_active: true,
      metadata: {
        source: 'first_admin_invitation_accept',
        invitation_id: invitation.id,
        invitation_email: invitationEmail,
        reused_existing_auth_user: !createdNewAuthUser,
      },
    }

    const { error: membershipError } = await admin
      .from('company_memberships')
      .upsert(membershipPayload, {
        onConflict: 'company_id,user_id',
      })

    if (membershipError) {
      await rollbackCreatedAuthUser()

      return NextResponse.json(
        { error: `Falha ao criar vínculo com a empresa: ${membershipError.message}` },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()

    const { data: acceptedInvite, error: invitationUpdateError } = await admin
      .from('company_admin_invitations')
      .update({
        status: 'accepted',
        accepted_user_id: userId,
        accepted_at: now,
      })
      .eq('id', invitation.id)
      .eq('status', 'pending')
      .select('id, status, accepted_user_id')
      .maybeSingle()

    if (invitationUpdateError) {
      await rollbackCreatedAuthUser()

      return NextResponse.json(
        { error: `Falha ao atualizar convite: ${invitationUpdateError.message}` },
        { status: 400 },
      )
    }

    if (!acceptedInvite?.id) {
      await rollbackCreatedAuthUser()

      return NextResponse.json(
        {
          error:
            'Este convite foi consumido por outra requisição. A conta criada nesta tentativa foi revertida.',
        },
        { status: 409 },
      )
    }

    const { error: companyUpdateError } = await admin
      .from('companies')
      .update({
        onboarding_status: 'admin_active',
        onboarding_status_updated_at: now,
      })
      .eq('id', company.id)

    if (companyUpdateError) {
      return NextResponse.json(
        {
          error:
            'Conta vinculada e convite aceito, mas houve falha ao atualizar onboarding da empresa: ' +
            companyUpdateError.message,
        },
        { status: 500 },
      )
    }

    await admin.from('admin_events').insert({
      company_id: company.id,
      actor_user_id: userId,
      target_user_id: userId,
      event_type: 'first_admin_invitation_accepted',
      metadata: {
        invitation_id: invitation.id,
        company_name: getCompanyDisplayName(company),
        email: invitationEmail,
        reused_existing_auth_user: !createdNewAuthUser,
      },
    })

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        email: invitationEmail,
        full_name: fullName,
        reused_existing_auth_user: !createdNewAuthUser,
      },
      company: {
        id: company.id,
        name: getCompanyDisplayName(company),
        onboarding_status: 'admin_active',
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao aceitar convite.',
      },
      { status: 500 },
    )
  }
}