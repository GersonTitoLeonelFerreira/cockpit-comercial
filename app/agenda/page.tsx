import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import Link from 'next/link'

type LeadRelation = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

type CycleAgendaRow = {
  id: string
  lead_id: string | null
  owner_user_id: string | null
  status: string | null
  next_action: string | null
  next_action_date: string | null
  leads?: LeadRelation | LeadRelation[] | null
}

type AgendaItem = {
  id: string
  leadId: string | null
  leadName: string
  phone: string | null
  email: string | null
  status: string
  nextAction: string | null
  nextActionDate: string
}

const OPEN_STATUSES = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado']

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  pausado: 'Pausado',
}

function toISO(date: Date) {
  return date.toISOString()
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? '').trim().toLowerCase()
}

function getStatusLabel(status: string | null | undefined) {
  const normalized = normalizeStatus(status)
  return STATUS_LABELS[normalized] ?? status ?? 'Sem status'
}

function getLeadFromRelation(relation: LeadRelation | LeadRelation[] | null | undefined) {
  if (Array.isArray(relation)) return relation[0] ?? null
  return relation ?? null
}

function toAgendaItem(cycle: CycleAgendaRow): AgendaItem {
  const lead = getLeadFromRelation(cycle.leads)

  return {
    id: cycle.id,
    leadId: cycle.lead_id,
    leadName: lead?.name || lead?.phone || lead?.email || 'Lead sem identificação',
    phone: lead?.phone ?? null,
    email: lead?.email ?? null,
    status: getStatusLabel(cycle.status),
    nextAction: cycle.next_action,
    nextActionDate: cycle.next_action_date || '',
  }
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AgendaBox({ title, items }: { title: string; items: AgendaItem[] }) {
  return (
    <div
      style={{
        marginTop: 18,
        padding: 16,
        border: '1px solid #1a1d2e',
        borderRadius: 12,
        background: '#0d0f14',
      }}
    >
      <h3 style={{ margin: 0 }}>{title}</h3>

      {items.length === 0 && (
        <div style={{ opacity: 0.7, marginTop: 10 }}>Nada aqui por enquanto.</div>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: 14,
              border: '1px solid #1a1d2e',
              borderRadius: 12,
              background: '#090b0f',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <Link href={`/sales-cycles/${item.id}`} style={{ color: 'white', textDecoration: 'none' }}>
                <strong>{item.leadName}</strong>
              </Link>

              <div style={{ opacity: 0.8 }}>{item.phone ?? item.email ?? 'Sem contato'}</div>

              <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
                Status: <strong>{item.status}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ opacity: 0.85 }}>
                Próxima ação: <strong>{item.nextAction ?? '—'}</strong>
              </div>
              <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
                Data da ação: <strong>{formatDate(item.nextActionDate)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function AgendaPage() {
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
          // Server Component de leitura.
        },
      },
    }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.company_id) {
    redirect('/leads')
  }

  const now = new Date()

  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)

  const endToday = new Date(now)
  endToday.setHours(23, 59, 59, 999)

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const end7Days = new Date(now)
  end7Days.setDate(end7Days.getDate() + 7)
  end7Days.setHours(23, 59, 59, 999)

  let cyclesQuery = supabase
    .from('sales_cycles')
    .select(`
      id,
      lead_id,
      owner_user_id,
      status,
      next_action,
      next_action_date,
      leads:lead_id (
        id,
        name,
        phone,
        email
      )
    `)
    .eq('company_id', profile.company_id)
    .in('status', OPEN_STATUSES)
    .not('next_action_date', 'is', null)
    .lte('next_action_date', toISO(end7Days))
    .order('next_action_date', { ascending: true })

  if (profile.role !== 'admin') {
    cyclesQuery = cyclesQuery.eq('owner_user_id', user.id)
  }

  const { data: cyclesData, error: cyclesError } = await cyclesQuery
  const cycles = ((cyclesData ?? []) as CycleAgendaRow[]).map(toAgendaItem)

  const overdue = cycles.filter(
    (item) => new Date(item.nextActionDate).getTime() < startToday.getTime()
  )

  const today = cycles.filter((item) => {
    const time = new Date(item.nextActionDate).getTime()
    return time >= startToday.getTime() && time <= endToday.getTime()
  })

  const next7 = cycles.filter((item) => {
    const time = new Date(item.nextActionDate).getTime()
    return time >= tomorrow.getTime() && time <= end7Days.getTime()
  })

  return (
    <div style={{ width: 900, margin: '60px auto', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Agenda</h1>

        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/leads" style={{ color: '#9aa', textDecoration: 'none' }}>
            Pipeline
          </Link>
          <Link href="/dashboard" style={{ color: '#9aa', textDecoration: 'none' }}>
            Dashboard
          </Link>
        </div>
      </div>

      <p style={{ opacity: 0.75, marginTop: 6 }}>
        Cobrança operacional baseada nos ciclos comerciais: vencidos, hoje e próximos 7 dias.
      </p>

      {cyclesError && (
        <div style={{ marginTop: 18, padding: 16, border: '1px solid #553', borderRadius: 12 }}>
          Erro ao buscar agenda:{' '}
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.85 }}>
            {JSON.stringify({ error: cyclesError.message }, null, 2)}
          </pre>
        </div>
      )}

      <AgendaBox title="Vencidos (atrasados)" items={overdue} />
      <AgendaBox title="Hoje" items={today} />
      <AgendaBox title="Próximos 7 dias" items={next7} />
    </div>
  )
}