import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { CSSProperties } from 'react'

export const metadata = {
  title: 'Empresas Cadastradas | Administração da Plataforma',
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
  created_at: string | null
}

type CompanyMembershipRow = {
    id: string
    company_id: string
    user_id: string
    role: string
    is_active: boolean
  }

type CompanyView = CompanyRow & {
  usersTotal: number
  activeUsers: number
  activeAdmins: number
  activeMembers: number
  inactiveUsers: number
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

function formatDateBR(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('pt-BR')
}

function onlyDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function formatCnpj(value: string | null) {
  const digits = onlyDigits(value)
  if (digits.length !== 14) return value || '—'

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

function empty(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : '—'
}

function statusStyle(company: CompanyView): CSSProperties {
  if (company.activeAdmins > 0) {
    return {
      border: '1px solid rgba(34,197,94,0.35)',
      background: 'rgba(34,197,94,0.12)',
      color: '#86efac',
    }
  }

  return {
    border: '1px solid rgba(245,158,11,0.35)',
    background: 'rgba(245,158,11,0.12)',
    color: '#fde68a',
  }
}

function statusLabel(company: CompanyView) {
  if (company.activeAdmins > 0) return 'Admin ativo'
  return 'Sem admin ativo'
}

function metricCard(label: string, value: number, hint: string) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        background:
          'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 60%, #0d0f14 100%)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, color: C.text, fontSize: 26, fontWeight: 950 }}>{value}</div>
      <div style={{ marginTop: 6, color: C.textSoft, fontSize: 12 }}>{hint}</div>
    </div>
  )
}

export default async function PlatformAdminCompaniesPage() {
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
    .select('is_active_global, is_platform_admin')
    .eq('id', auth.user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login')
  }

  if (profile.is_active_global === false) {
    redirect('/login')
  }

  if (profile.is_platform_admin !== true) {
    redirect('/leads')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return (
      <main style={{ color: C.text }}>
        <h1>Empresas Cadastradas</h1>
        <p style={{ color: C.red }}>
          ENV ausente: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </main>
    )
  }

  const admin = createClient(url, serviceKey)

  const { data: companiesData, error: companiesError } = await admin
    .from('companies')
    .select(
      'id, name, legal_name, trade_name, cnpj, plan, segment, email, phone, city, state, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const companies = (companiesData ?? []) as CompanyRow[]
  const companyIds = companies.map((company) => company.id)

  let memberships: CompanyMembershipRow[] = []
  let profilesErrorMessage: string | null = null

  if (companyIds.length > 0) {
    const { data: membershipsData, error: membershipsError } = await admin
      .from('company_memberships')
      .select('id, company_id, user_id, role, is_active')
      .in('company_id', companyIds)

    if (membershipsError) {
      profilesErrorMessage = membershipsError.message
    } else {
      memberships = (membershipsData ?? []) as CompanyMembershipRow[]
    }
  }

  const companiesView: CompanyView[] = companies.map((company) => {
    const companyMemberships = memberships.filter(
      (membership) => membership.company_id === company.id,
    )
    const activeMemberships = companyMemberships.filter(
      (membership) => membership.is_active === true,
    )

    return {
      ...company,
      usersTotal: companyMemberships.length,
      activeUsers: activeMemberships.length,
      activeAdmins: activeMemberships.filter((membership) => membership.role === 'admin').length,
      activeMembers: activeMemberships.filter((membership) => membership.role === 'member').length,
      inactiveUsers: companyMemberships.filter((membership) => membership.is_active === false).length,
    }
  })

  const totalCompanies = companiesView.length
  const companiesWithAdmin = companiesView.filter((company) => company.activeAdmins > 0).length
  const companiesWithoutAdmin = companiesView.filter((company) => company.activeAdmins === 0).length

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
        <div style={{ maxWidth: 980 }}>
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
            Empresas cadastradas
          </h1>

          <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
            Visão global das empresas clientes cadastradas na plataforma, com leitura de usuários,
            administradores ativos e status básico de operação.
          </p>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginTop: 18,
        }}
      >
        {metricCard('Empresas', totalCompanies, 'Últimas 100 empresas cadastradas')}
        {metricCard('Com admin ativo', companiesWithAdmin, 'Empresas aptas a operar')}
        {metricCard('Sem admin ativo', companiesWithoutAdmin, 'Exigem atenção no onboarding')}
      </section>

      {companiesError ? (
        <section
          style={{
            marginTop: 18,
            border: '1px solid rgba(239,68,68,0.28)',
            background: 'rgba(239,68,68,0.10)',
            color: '#fecaca',
            borderRadius: 16,
            padding: 16,
          }}
        >
          Falha ao carregar empresas: {companiesError.message}
        </section>
      ) : null}

      {profilesErrorMessage ? (
        <section
          style={{
            marginTop: 18,
            border: '1px solid rgba(245,158,11,0.28)',
            background: 'rgba(245,158,11,0.10)',
            color: '#fde68a',
            borderRadius: 16,
            padding: 16,
          }}
        >
          Empresas carregadas, mas houve falha ao carregar usuários: {profilesErrorMessage}
        </section>
      ) : null}

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
            <div style={{ fontSize: 16, fontWeight: 900 }}>Base de empresas</div>
            <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
              Ordenado da empresa mais recente para a mais antiga.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href="/platform-admin/companies/new"
              style={{
                border: `1px solid ${C.blue}`,
                background:
                  'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
                color: '#93c5fd',
                padding: '9px 12px',
                borderRadius: 10,
                fontWeight: 900,
                fontSize: 12,
                textDecoration: 'none',
              }}
            >
              Nova empresa
            </Link>

            <Link
              href="/platform-admin"
              style={{
                color: '#93c5fd',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 800,
                alignSelf: 'center',
              }}
            >
              Voltar ao cockpit
            </Link>
          </div>
        </div>

        {companiesView.length === 0 ? (
          <div style={{ padding: 18, color: C.textSoft, fontSize: 13 }}>
            Nenhuma empresa cadastrada.
          </div>
        ) : (
          <div style={{ display: 'grid' }}>
            {companiesView.map((company) => (
              <article
                key={company.id}
                style={{
                  padding: 16,
                  borderBottom: `1px solid ${C.border}`,
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900 }}>
                      {company.trade_name || company.name || company.legal_name || 'Empresa sem nome'}
                    </div>
                    <div style={{ marginTop: 4, color: C.textSoft, fontSize: 13 }}>
                      Razão social: {empty(company.legal_name)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        ...statusStyle(company),
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 900,
                        height: 'fit-content',
                      }}
                    >
                      {statusLabel(company)}
                    </div>

                    <Link
                      href={`/platform-admin/companies/${company.id}`}
                      style={{
                        border: `1px solid ${C.blue}`,
                        background:
                          'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
                        color: '#93c5fd',
                        padding: '7px 10px',
                        borderRadius: 10,
                        fontWeight: 900,
                        fontSize: 12,
                        textDecoration: 'none',
                      }}
                    >
                      Abrir detalhe
                    </Link>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: 10,
                    color: C.textSoft,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: C.text }}>CNPJ:</strong> {formatCnpj(company.cnpj)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Segmento:</strong> {empty(company.segment)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Plano:</strong> {empty(company.plan)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Criada em:</strong>{' '}
                    {formatDateBR(company.created_at)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: 10,
                    color: C.textSoft,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: C.text }}>E-mail:</strong> {empty(company.email)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Telefone:</strong>{' '}
                    {formatPhone(company.phone)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Cidade/UF:</strong>{' '}
                    {empty(
                      [company.city, company.state]
                        .filter((item) => item && item.trim())
                        .join(' / '),
                    )}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>ID:</strong>{' '}
                    <span style={{ color: C.textMuted }}>{company.id}</span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.panelSoft,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900 }}>
                      Usuários
                    </div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>
                      {company.usersTotal}
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.panelSoft,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900 }}>
                      Admins ativos
                    </div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>
                      {company.activeAdmins}
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.panelSoft,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900 }}>
                      Membros ativos
                    </div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>
                      {company.activeMembers}
                    </div>
                  </div>

                  <div
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.panelSoft,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900 }}>
                      Inativos
                    </div>
                    <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950 }}>
                      {company.inactiveUsers}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}