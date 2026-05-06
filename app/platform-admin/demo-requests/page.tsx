import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { CSSProperties, ReactNode } from 'react'

export const metadata = {
  title: 'Solicitações de Demonstração | Administração da Plataforma',
}

type DemoRequest = {
  id: string
  name: string
  company: string | null
  whatsapp: string | null
  email: string | null
  segment: string | null
  message: string | null
  status: string
  created_at: string
  team_size: string | null
  current_control: string | null
  main_bottleneck: string | null
  leads_volume: string | null
  timeline: string | null
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

function formatDateBR(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function empty(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : '—'
}

function statusLabel(status: string) {
  const normalized = status?.trim().toLowerCase()

  if (normalized === 'new') return 'Novo'
  if (normalized === 'contacted') return 'Contatado'
  if (normalized === 'qualified') return 'Qualificado'
  if (normalized === 'converted') return 'Convertido'
  if (normalized === 'discarded') return 'Descartado'

  return status || '—'
}

function statusStyle(status: string): CSSProperties {
  const normalized = status?.trim().toLowerCase()

  if (normalized === 'new') {
    return {
      border: '1px solid rgba(59,130,246,0.35)',
      background: 'rgba(59,130,246,0.12)',
      color: '#93c5fd',
    }
  }

  if (normalized === 'converted' || normalized === 'qualified') {
    return {
      border: '1px solid rgba(34,197,94,0.35)',
      background: 'rgba(34,197,94,0.12)',
      color: '#86efac',
    }
  }

  if (normalized === 'discarded') {
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

function metricCard(label: string, value: number, hint: string): ReactNode {
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

export default async function PlatformAdminDemoRequestsPage() {
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return (
      <main style={{ color: C.text }}>
        <h1>Solicitações de Demonstração</h1>
        <p style={{ color: C.red }}>
          ENV ausente: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </main>
    )
  }

  const admin = createClient(url, serviceKey)

  const { data, error } = await admin
    .from('demo_requests')
    .select(
      'id, name, company, whatsapp, email, segment, message, status, created_at, team_size, current_control, main_bottleneck, leads_volume, timeline',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const requests = (data ?? []) as DemoRequest[]

  const total = requests.length
  const novos = requests.filter((item) => item.status === 'new').length
  const comContato = requests.filter((item) => item.email || item.whatsapp).length

  return (
    <main style={{ minHeight: '100%', background: C.page, color: C.text }}>
      <section
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.13) 0%, rgba(59,130,246,0.05) 55%, #0d0f14 100%)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 2px 18px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ maxWidth: 980 }}>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid rgba(59,130,246,0.28)',
              background: 'rgba(59,130,246,0.10)',
              color: '#93c5fd',
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
            Solicitações de Demonstração
          </h1>

          <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
            Central para visualizar pedidos recebidos pelo site, identificar empresas interessadas e
            transformar demanda comercial em implantação da plataforma.
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
        {metricCard('Total', total, 'Últimas 100 solicitações')}
        {metricCard('Novas', novos, 'Status ainda não tratado')}
        {metricCard('Com contato', comContato, 'WhatsApp ou e-mail informado')}
      </section>

      {error ? (
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
          Falha ao carregar solicitações: {error.message}
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
            <div style={{ fontSize: 16, fontWeight: 900 }}>Pedidos recebidos</div>
            <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
              Ordenado do mais recente para o mais antigo.
            </div>
          </div>

          <Link
            href="/platform-admin"
            style={{
              color: '#93c5fd',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Voltar ao cockpit da plataforma
          </Link>
        </div>

        {requests.length === 0 ? (
          <div style={{ padding: 18, color: C.textSoft, fontSize: 13 }}>
            Nenhuma solicitação encontrada.
          </div>
        ) : (
          <div style={{ display: 'grid' }}>
            {requests.map((item) => (
              <article
                key={item.id}
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
                      {item.company || item.name}
                    </div>
                    <div style={{ marginTop: 4, color: C.textSoft, fontSize: 13 }}>
                      Responsável: {item.name}
                    </div>
                  </div>

                  <div
                    style={{
                      ...statusStyle(item.status),
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 900,
                      height: 'fit-content',
                    }}
                  >
                    {statusLabel(item.status)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                    color: C.textSoft,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: C.text }}>WhatsApp:</strong> {empty(item.whatsapp)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>E-mail:</strong> {empty(item.email)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Segmento:</strong> {empty(item.segment)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Recebido em:</strong>{' '}
                    {formatDateBR(item.created_at)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                    color: C.textSoft,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <strong style={{ color: C.text }}>Tamanho da equipe:</strong>{' '}
                    {empty(item.team_size)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Controle atual:</strong>{' '}
                    {empty(item.current_control)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Gargalo:</strong>{' '}
                    {empty(item.main_bottleneck)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Volume de leads:</strong>{' '}
                    {empty(item.leads_volume)}
                  </div>
                  <div>
                    <strong style={{ color: C.text }}>Prazo:</strong> {empty(item.timeline)}
                  </div>
                </div>

                {item.message ? (
                  <div
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.panelSoft,
                      borderRadius: 12,
                      padding: 12,
                      color: C.textSoft,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.message}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}