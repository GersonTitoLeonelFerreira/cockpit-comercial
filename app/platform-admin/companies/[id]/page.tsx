import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { CSSProperties } from 'react'

export const metadata = {
  title: 'Detalhe da Empresa | Administração da Plataforma',
}

type CompanyRow = {
  id: string
  name: string | null
  legal_name: string | null
  trade_name: string | null
  cnpj: string | null
  plan: string | null
  segment: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  cep: string | null
  address: string | null
  created_at: string | null
  platform_status: string | null
  onboarding_status: string | null
  platform_status_updated_at: string | null
  onboarding_status_updated_at: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  role: string | null
  is_active: boolean | null
  created_at: string | null
}

const C = {
  page: '#090b0f',
  panel: '#0d0f14',
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
} as const

function onlyDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function formatCnpj(value: string | null) {
  const digits = onlyDigits(value)

  if (digits.length !== 14) {
    return value || '—'
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(
    8,
    12,
  )}-${digits.slice(12)}`
}

function formatPhone(value: string | null) {
  const digits = onlyDigits(value)

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return value || '—'
}

function formatDateBR(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function empty(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : '—'
}

function platformStatusLabel(status: string | null) {
  if (status === 'active') return 'Ativa'
  if (status === 'blocked') return 'Bloqueada'
  if (status === 'cancelled') return 'Cancelada'
  if (status === 'archived') return 'Arquivada'

  return status || '—'
}

function onboardingStatusLabel(status: string | null) {
  if (status === 'company_created') return 'Empresa criada'
  if (status === 'admin_invite_pending') return 'Aguardando convite do admin'
  if (status === 'admin_invited') return 'Admin convidado'
  if (status === 'admin_active') return 'Admin ativo'
  if (status === 'onboarding_done') return 'Onboarding concluído'

  return status || '—'
}

function platformStatusStyle(status: string | null): CSSProperties {
  if (status === 'active') {
    return {
      border: '1px solid rgba(34,197,94,0.35)',
      background: 'rgba(34,197,94,0.12)',
      color: '#86efac',
    }
  }

  if (status === 'blocked' || status === 'cancelled') {
    return {
      border: '1px solid rgba(239,68,68,0.35)',
      background: 'rgba(239,68,68,0.12)',
      color: '#fecaca',
    }
  }

  return {
    border: `1px solid ${C.border}`,
    background: C.panelSoft,
    color: C.textSoft,
  }
}

function onboardingStatusStyle(status: string | null): CSSProperties {
  if (status === 'onboarding_done' || status === 'admin_active') {
    return {
      border: '1px solid rgba(34,197,94,0.35)',
      background: 'rgba(34,197,94,0.12)',
      color: '#86efac',
    }
  }

  if (status === 'admin_invite_pending' || status === 'company_created') {
    return {
      border: '1px solid rgba(245,158,11,0.35)',
      background: 'rgba(245,158,11,0.12)',
      color: '#fde68a',
    }
  }

  if (status === 'admin_invited') {
    return {
      border: '1px solid rgba(59,130,246,0.35)',
      background: 'rgba(59,130,246,0.12)',
      color: '#93c5fd',
    }
  }

  return {
    border: `1px solid ${C.border}`,
    background: C.panelSoft,
    color: C.textSoft,
  }
}

function badge(label: string, style: CSSProperties) {
  return (
    <div
      style={{
        ...style,
        borderRadius: 999,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 900,
        width: 'fit-content',
      }}
    >
      {label}
    </div>
  )
}

function infoCard(label: string, value: string | number, hint?: string) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        background: C.panelSoft,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>

      <div style={{ marginTop: 7, color: C.text, fontSize: 16, fontWeight: 900 }}>
        {value}
      </div>

      {hint ? <div style={{ marginTop: 5, color: C.textMuted, fontSize: 12 }}>{hint}</div> : null}
    </div>
  )
}

async function requirePlatformAdmin() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Server component de leitura.
        },
      },
    },
  )

  const { data: auth } = await supabase.auth.getUser()

  if (!auth?.user?.id) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active, is_platform_admin')
    .eq('id', auth.user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login')
  }

  if (profile.is_active === false) {
    redirect('/login')
  }

  if (profile.is_platform_admin !== true) {
    redirect('/leads')
  }
}

export default async function PlatformAdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePlatformAdmin()

  const { id } = await params

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return (
      <main style={{ color: C.text }}>
        <h1>Detalhe da empresa</h1>
        <p style={{ color: C.red }}>
          ENV ausente: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </main>
    )
  }

  const admin = createClient(url, serviceKey)

  const { data: companyData, error: companyError } = await admin
    .from('companies')
    .select(
      'id, name, legal_name, trade_name, cnpj, plan, segment, email, phone, city, state, cep, address, created_at, platform_status, onboarding_status, platform_status_updated_at, onboarding_status_updated_at',
    )
    .eq('id', id)
    .single()

  if (companyError || !companyData) {
    redirect('/platform-admin/companies')
  }

  const company = companyData as CompanyRow

  const { data: profilesData, error: profilesError } = await admin
    .from('profiles')
    .select('id, full_name, email, phone, job_title, role, is_active, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: true })

  const users = (profilesData ?? []) as ProfileRow[]

  const activeUsers = users.filter((user) => user.is_active === true)
  const inactiveUsers = users.filter((user) => user.is_active === false)
  const activeAdmins = activeUsers.filter((user) => user.role === 'admin')
  const activeMembers = activeUsers.filter((user) => user.role === 'member')
  const activeManagers = activeUsers.filter((user) => user.role === 'manager')

  const companyDisplayName =
    company.trade_name || company.name || company.legal_name || 'Empresa sem nome'

  return (
    <main style={{ minHeight: '100%', background: C.page, color: C.text }}>
      <section
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(34,197,94,0.13) 0%, rgba(59,130,246,0.05) 55%, #0d0f14 100%)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 2px 18px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 900 }}>
            <div
              style={{
                display: 'inline-flex',
                border: '1px solid rgba(34,197,94,0.28)',
                background: 'rgba(34,197,94,0.10)',
                color: '#86efac',
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 14,
              }}
            >
              Administração da Plataforma
            </div>

            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 950, letterSpacing: '-0.04em' }}>
              {companyDisplayName}
            </h1>

            <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
              Detalhe administrativo da empresa cliente dentro da plataforma. Esta tela ainda é
              somente leitura e prepara o fluxo de convite do primeiro administrador.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            {badge(platformStatusLabel(company.platform_status), platformStatusStyle(company.platform_status))}
            {badge(
              onboardingStatusLabel(company.onboarding_status),
              onboardingStatusStyle(company.onboarding_status),
            )}
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
        }}
      >
        {infoCard('Usuários', users.length, 'Total vinculado à empresa')}
        {infoCard('Admins ativos', activeAdmins.length, 'Responsáveis da empresa')}
        {infoCard('Gestores ativos', activeManagers.length, 'Role manager')}
        {infoCard('Membros ativos', activeMembers.length, 'Role member')}
        {infoCard('Inativos', inactiveUsers.length, 'Usuários desativados')}
      </section>

      <section
        style={{
          marginTop: 18,
          border: `1px solid ${C.border}`,
          background: C.panel,
          borderRadius: 16,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900 }}>Dados cadastrais</div>

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {infoCard('Razão social', empty(company.legal_name))}
          {infoCard('Nome fantasia', empty(company.trade_name))}
          {infoCard('CNPJ', formatCnpj(company.cnpj))}
          {infoCard('Segmento', empty(company.segment))}
          {infoCard('Plano', empty(company.plan))}
          {infoCard('Criada em', formatDateBR(company.created_at))}
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {infoCard('E-mail', empty(company.email))}
          {infoCard('Telefone', formatPhone(company.phone))}
          {infoCard('Cidade/UF', empty([company.city, company.state].filter(Boolean).join(' / ')))}
          {infoCard('CEP', empty(company.cep))}
          {infoCard('Endereço', empty(company.address))}
          {infoCard('ID', company.id)}
        </div>
      </section>

      <section
        style={{
          marginTop: 18,
          border: `1px solid ${C.border}`,
          background: C.panel,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${C.border}`,
            background: C.panelSoft,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Usuários vinculados</div>
            <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
              Leitura dos usuários já existentes nesta empresa.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                border: '1px solid rgba(245,158,11,0.28)',
                background: 'rgba(245,158,11,0.10)',
                color: '#fde68a',
                padding: '9px 12px',
                borderRadius: 10,
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              Convite do admin: próxima etapa
            </div>

            <Link
              href="/platform-admin/companies"
              style={{
                color: '#93c5fd',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 800,
                alignSelf: 'center',
              }}
            >
              Voltar para empresas
            </Link>
          </div>
        </div>

        {profilesError ? (
          <div
            style={{
              padding: 16,
              color: '#fecaca',
              borderBottom: `1px solid ${C.border}`,
              background: 'rgba(239,68,68,0.08)',
            }}
          >
            Falha ao carregar usuários: {profilesError.message}
          </div>
        ) : null}

        {users.length === 0 ? (
          <div style={{ padding: 18, color: C.textSoft, fontSize: 13 }}>
            Nenhum usuário vinculado. Esta empresa ainda precisa receber o convite do primeiro
            administrador.
          </div>
        ) : (
          <div style={{ display: 'grid' }}>
            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
                  gap: 12,
                  padding: 14,
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>{user.full_name || '—'}</div>
                  <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
                    {user.job_title || 'Sem cargo'}
                  </div>
                </div>

                <div>
                  <div style={{ color: C.textSoft }}>{user.email || '—'}</div>
                  <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
                    {formatPhone(user.phone)}
                  </div>
                </div>

                <div style={{ color: C.textSoft }}>{user.role || '—'}</div>

                <div>
                  {badge(
                    user.is_active ? 'Ativo' : 'Inativo',
                    user.is_active
                      ? {
                          border: '1px solid rgba(34,197,94,0.35)',
                          background: 'rgba(34,197,94,0.12)',
                          color: '#86efac',
                        }
                      : {
                          border: '1px solid rgba(239,68,68,0.35)',
                          background: 'rgba(239,68,68,0.12)',
                          color: '#fecaca',
                        },
                  )}
                </div>

                <div style={{ color: C.textMuted }}>{formatDateBR(user.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}