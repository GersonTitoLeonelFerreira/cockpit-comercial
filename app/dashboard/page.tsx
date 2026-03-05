// app/dashboard/page.tsx
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

type Lead = {
  id: string
  status: string
  created_at: string
  company_id: string
}

type StageEvent = {
  from_status: string | null
  to_status: string | null
  company_id: string
}

export default async function DashboardPage() {
  // ✅ Next 16: cookies() é async
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // ✅ algumas versões retornam Cookie[] via getAll()
          const all =
            typeof (cookieStore as any).getAll === 'function'
              ? (cookieStore as any).getAll()
              : []

          return (all || []).map((c: any) => ({ name: c.name, value: c.value }))
        },
        setAll() {
          // Server Component: não persiste cookie aqui
        },
      },
    }
  )

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  const user = auth?.user
  if (authErr || !user?.id) redirect('/login')

  // ✅ pega company_id pelo profile (multi-tenant)
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profErr || !profile?.company_id) redirect('/login')
  const companyId = profile.company_id as string

  // 1) Estoque atual (por status) - filtrado por company
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id,status,created_at,company_id')
    .eq('company_id', companyId)

  if (leadsError) {
    return (
      <div style={{ width: 900, margin: '60px auto', color: 'white' }}>
        <h1>Dashboard Comercial</h1>
        <p>Erro ao carregar leads: {leadsError.message}</p>
      </div>
    )
  }

  const statuses = ['novo', 'contato', 'respondeu', 'negociacao', 'fechado', 'perdido'] as const

  const stock: Record<string, number> = {}
  statuses.forEach((s) => (stock[s] = 0))
  ;(leads as Lead[])?.forEach((l) => {
    stock[l.status] = (stock[l.status] || 0) + 1
  })

  // 2) Movimentações (eventos) - filtrado por company
  const { data: events, error: evErr } = await supabase
    .from('lead_stage_events')
    .select('from_status,to_status,company_id')
    .eq('company_id', companyId)

  if (evErr) {
    return (
      <div style={{ width: 900, margin: '60px auto', color: 'white' }}>
        <h1>Dashboard Comercial</h1>
        <p>Erro ao carregar eventos: {evErr.message}</p>
      </div>
    )
  }

  const transitions: Record<string, number> = {}
  ;(events as StageEvent[] | null)?.forEach((e) => {
    const key = `${e.from_status ?? '—'}→${e.to_status ?? '—'}`
    transitions[key] = (transitions[key] || 0) + 1
  })

  const count = (from: string, to: string) => transitions[`${from}→${to}`] || 0
  const safeRate = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 100))

  const novoContato = count('novo', 'contato')
  const contatoRespondeu = count('contato', 'respondeu')
  const respondeuNegociacao = count('respondeu', 'negociacao')
  const negociacaoFechado = count('negociacao', 'fechado')

  const recuoContatoNovo = count('contato', 'novo')
  const recuoRespondeuContato = count('respondeu', 'contato')
  const recuoRespondeuNovo = count('respondeu', 'novo')

  const saidasNovo = Object.keys(transitions)
    .filter((k) => k.startsWith('novo→'))
    .reduce((acc, k) => acc + (transitions[k] || 0), 0)

  const saidasContato = Object.keys(transitions)
    .filter((k) => k.startsWith('contato→'))
    .reduce((acc, k) => acc + (transitions[k] || 0), 0)

  const saidasRespondeu = Object.keys(transitions)
    .filter((k) => k.startsWith('respondeu→'))
    .reduce((acc, k) => acc + (transitions[k] || 0), 0)

  const saidasNegociacao = Object.keys(transitions)
    .filter((k) => k.startsWith('negociacao→'))
    .reduce((acc, k) => acc + (transitions[k] || 0), 0)

  return (
    <div style={{ width: 900, margin: '60px auto', color: 'white' }}>
      <h1>Dashboard Comercial</h1>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#111' }}>
        <h3>Estoque do funil (agora)</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          {statuses.map((s) => (
            <div key={s} style={{ padding: 12, border: '1px solid #222', borderRadius: 10, minWidth: 120 }}>
              <div style={{ opacity: 0.75, textTransform: 'capitalize' }}>{s}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{stock[s]}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#111' }}>
        <h3>Conversões (por movimentação)</h3>
        <div style={{ marginTop: 10, lineHeight: 1.9 }}>
          <div><strong>novo → contato</strong>: {novoContato} | taxa: {safeRate(novoContato, saidasNovo)}%</div>
          <div><strong>contato → respondeu</strong>: {contatoRespondeu} | taxa: {safeRate(contatoRespondeu, saidasContato)}%</div>
          <div><strong>respondeu → negociação</strong>: {respondeuNegociacao} | taxa: {safeRate(respondeuNegociacao, saidasRespondeu)}%</div>
          <div><strong>negociação → fechado</strong>: {negociacaoFechado} | taxa: {safeRate(negociacaoFechado, saidasNegociacao)}%</div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#111' }}>
        <h3>Recuos (atrito)</h3>
        <div style={{ marginTop: 10, lineHeight: 1.9 }}>
          <div><strong>contato → novo</strong>: {recuoContatoNovo}</div>
          <div><strong>respondeu → contato</strong>: {recuoRespondeuContato}</div>
          <div><strong>respondeu → novo</strong>: {recuoRespondeuNovo}</div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#111' }}>
        <h3>Movimentações do funil (raw)</h3>
        {Object.entries(transitions).length === 0 && <p>Nenhuma movimentação ainda.</p>}
        {Object.entries(transitions).map(([k, v]) => (
          <div key={k} style={{ marginTop: 8 }}>
            <strong>{k}</strong>: {v}
          </div>
        ))}
      </div>
    </div>
  )
}