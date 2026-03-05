import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  next_action: string | null
  next_contact_at: string | null
}

function toISO(d: Date) {
  return d.toISOString()
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
          // aqui é só leitura — não mexe em cookies
        },
      },
    }
  )

  // agora
  const now = new Date()

  // início do dia (hoje) e fim do dia
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)

  const endToday = new Date(now)
  endToday.setHours(23, 59, 59, 999)

  // próximos 7 dias (fim do 7º dia)
  const end7Days = new Date(now)
  end7Days.setDate(end7Days.getDate() + 7)
  end7Days.setHours(23, 59, 59, 999)

  // VENCIDOS: next_contact_at < início de hoje
  const { data: overdue, error: errOverdue } = await supabase
    .from('leads')
    .select('id, name, phone, status, next_action, next_contact_at')
    .not('next_contact_at', 'is', null)
    .lt('next_contact_at', toISO(startToday))
    .order('next_contact_at', { ascending: true })

  // HOJE: next_contact_at entre início e fim de hoje
  const { data: today, error: errToday } = await supabase
    .from('leads')
    .select('id, name, phone, status, next_action, next_contact_at')
    .not('next_contact_at', 'is', null)
    .gte('next_contact_at', toISO(startToday))
    .lte('next_contact_at', toISO(endToday))
    .order('next_contact_at', { ascending: true })

  // PRÓXIMOS 7 DIAS: amanhã até 7 dias (exclui hoje)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const { data: next7, error: errNext7 } = await supabase
    .from('leads')
    .select('id, name, phone, status, next_action, next_contact_at')
    .not('next_contact_at', 'is', null)
    .gte('next_contact_at', toISO(tomorrow))
    .lte('next_contact_at', toISO(end7Days))
    .order('next_contact_at', { ascending: true })

  const anyError = errOverdue || errToday || errNext7

  const Box = ({ title, items }: { title: string; items: LeadRow[] | null | undefined }) => (
    <div style={{ marginTop: 18, padding: 16, border: '1px solid #333', borderRadius: 12, background: '#111' }}>
      <h3 style={{ margin: 0 }}>{title}</h3>

      {(!items || items.length === 0) && (
        <div style={{ opacity: 0.7, marginTop: 10 }}>Nada aqui por enquanto.</div>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items?.map((lead) => (
          <div
            key={lead.id}
            style={{
              padding: 14,
              border: '1px solid #222',
              borderRadius: 12,
              background: '#0f0f0f',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <Link href={`/leads/${lead.id}`} style={{ color: 'white', textDecoration: 'none' }}>
                <strong>{lead.name}</strong>
              </Link>

              <div style={{ opacity: 0.8 }}>{lead.phone ?? '—'}</div>

              <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
                Status: <strong>{lead.status}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ opacity: 0.85 }}>
                Próxima ação: <strong>{lead.next_action ?? '—'}</strong>
              </div>
              <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
                Próximo contato:{' '}
                <strong>
                  {lead.next_contact_at ? new Date(lead.next_contact_at).toLocaleString() : '—'}
                </strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

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
        Aqui fica a cobrança operacional: vencidos, hoje e próximos 7 dias.
      </p>

      {anyError && (
        <div style={{ marginTop: 18, padding: 16, border: '1px solid #553', borderRadius: 12 }}>
          Erro ao buscar agenda:{' '}
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.85 }}>
            {JSON.stringify(
              {
                overdue: errOverdue?.message,
                today: errToday?.message,
                next7: errNext7?.message,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      <Box title="Vencidos (atrasados)" items={overdue as LeadRow[] | null} />
      <Box title="Hoje" items={today as LeadRow[] | null} />
      <Box title="Próximos 7 dias" items={next7 as LeadRow[] | null} />
    </div>
  )
}
