import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import RelatoriosIAFilters from './RelatoriosIAFilters.client'
import LoadMore from './LoadMore.client'

type ProfileRow = {
  id: string
  full_name: string | null
  role: string | null
  company_id: string
}

type LeadRow = {
  id: string
  name: string
  owner_id: string | null
  phone: string | null
  phone_norm: string | null
}

type AnalysisRow = {
  id: string
  created_at: string
  lead_id: string
  user_id: string
  performance_score: number
  sentiment: string | null
  summary: string
}

function parseDays(v: string | null) {
  const n = Number(v ?? '')
  if (n === 7 || n === 30 || n === 90) return n
  return 30
}

function parseLimit(v: string | null) {
  const n = Number(v ?? '')
  const safe = Number.isFinite(n) ? Math.floor(n) : 50
  // clamp: min 50, max 500 (ajuste como quiser)
  return Math.max(50, Math.min(500, safe))
}

function parseMinScore(v: string | null) {
  const n = Number(v ?? '')
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.floor(n)))
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function ymdToIsoStart(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0)
  return dt.toISOString()
}

function ymdToIsoEnd(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999)
  return dt.toISOString()
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SentimentFilter = '' | 'positivo' | 'neutro' | 'negativo'

function parseSentiment(v: unknown): SentimentFilter {
  if (v === 'positivo' || v === 'neutro' || v === 'negativo') return v
  return ''
}

export default async function RelatoriosIAReportPage(props: {
  searchParams?:
    | Promise<{
        days?: string
        owner?: string
        from?: string
        to?: string
        limit?: string
        minScore?: string
        sentiment?: string
        lead?: string
      }>
    | {
        days?: string
        owner?: string
        from?: string
        to?: string
        limit?: string
        minScore?: string
        sentiment?: string
        lead?: string
      }
}) {
  const sp = await Promise.resolve(props.searchParams ?? {})

  const days = parseDays(sp.days ?? null)
  const limit = parseLimit(typeof sp.limit === 'string' ? sp.limit : null)
  const minScore = parseMinScore(typeof sp.minScore === 'string' ? sp.minScore : null)
  const sentiment = parseSentiment(sp.sentiment)

  const leadQuery = typeof sp.lead === 'string' ? sp.lead.trim() : ''
  const hasLeadFilter = leadQuery.length > 0

  const fromYmd = typeof sp.from === 'string' && isYmd(sp.from) ? sp.from : ''
  const toYmd = typeof sp.to === 'string' && isYmd(sp.to) ? sp.to : ''

  const owner = sp.owner && UUID_RE.test(sp.owner) ? sp.owner : ''
  const ownerFilter = owner

  const sinceIso = fromYmd
    ? ymdToIsoStart(fromYmd)
    : new Date(Date.now() - days * 864e5).toISOString()
  const untilIso = toYmd ? ymdToIsoEnd(toYmd) : null

  const periodLabel = fromYmd || toYmd ? `${fromYmd || '...'} → ${toYmd || '...'}` : `${days} dias`

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookies()
          return store.getAll()
        },
        async setAll() {
          // Server Component não escreve cookie
        },
      },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) redirect('/login')

  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, company_id')
    .eq('id', user.id)
    .single<ProfileRow>()

  if (meErr || !me?.company_id) {
    return (
      <div style={{ width: 980, margin: '60px auto', color: 'white' }}>
        <h1>Relatório IA</h1>
        <p>Erro ao carregar seu perfil: {meErr?.message ?? 'company_id ausente'}</p>
      </div>
    )
  }

  if (String(me.role ?? '') !== 'admin') {
    return (
      <div style={{ width: 980, margin: '60px auto', color: 'white' }}>
        <a href="/relatorios" style={{ color: '#9aa', textDecoration: 'none' }}>
          ← Voltar
        </a>
        <h1 style={{ marginTop: 16 }}>Relatório IA</h1>
        <p style={{ opacity: 0.8 }}>Acesso negado. Apenas administradores.</p>
      </div>
    )
  }

  const companyId = me.company_id

  const { data: sellers, error: sellersErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, company_id')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true })
    .returns<ProfileRow[]>()

  const ownerInCompany = owner ? (sellers ?? []).some((p) => p.id === owner) : true

  let base = supabase
    .from('lead_conversation_analyses')
    .select('id, created_at, lead_id, user_id, performance_score, sentiment, summary')
    .eq('company_id', companyId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })

  if (untilIso) base = base.lte('created_at', untilIso)
  if (ownerFilter) base = base.eq('user_id', ownerFilter)

  let leadIdsForFilter: string[] | null = null

  if (hasLeadFilter) {
    const maybeUuid = UUID_RE.test(leadQuery)

    const q = supabase
      .from('leads')
      .select('id')
      .eq('company_id', companyId)
      .limit(50)

    const digits = leadQuery.replace(/\D/g, '')
    const hasDigits = digits.length >= 6

    const { data: leadMatches, error: leadMatchErr } = maybeUuid
      ? await q.eq('id', leadQuery).returns<{ id: string }[]>()
      : hasDigits
        ? await q.ilike('phone_norm', `%${digits}%`).returns<{ id: string }[]>()
        : await q.ilike('name', `%${leadQuery}%`).returns<{ id: string }[]>()

    if (!leadMatchErr) {
      leadIdsForFilter = (leadMatches ?? []).map((x) => x.id)
      if (leadIdsForFilter.length === 0) leadIdsForFilter = ['__none__']
    }
  }

  if (minScore > 0) base = base.gte('performance_score', minScore)
  if (sentiment) base = base.eq('sentiment', sentiment)
  if (leadIdsForFilter) base = base.in('lead_id', leadIdsForFilter)

  const { data: recentAnalyses, error: recentErr } = await base.limit(limit).returns<AnalysisRow[]>()

  const total = recentAnalyses?.length ?? 0
  const avgScore =
    total > 0
      ? Math.round(
          (recentAnalyses ?? []).reduce((acc, x) => acc + (Number(x.performance_score) || 0), 0) / total
        )
      : 0

  const leadIds = Array.from(new Set((recentAnalyses ?? []).map((a) => a.lead_id).filter(Boolean)))
  const { data: leads, error: leadsErr } = leadIds.length
    ? await supabase
        .from('leads')
        .select('id, name, owner_id, phone, phone_norm')
        .eq('company_id', companyId)
        .in('id', leadIds)
        .returns<LeadRow[]>()
    : { data: [], error: null }

  const leadNameById = new Map((leads ?? []).map((l) => [l.id, l.name]))
  const leadPhoneById = new Map((leads ?? []).map((l) => [l.id, l.phone ?? '']))
  const leadPhoneNormById = new Map((leads ?? []).map((l) => [l.id, l.phone_norm ?? '']))
  const sellerNameById = new Map(
    (sellers ?? [])
      .filter((p) => p.role !== 'admin')
      .map((p) => [p.id, String(p.full_name ?? p.id.slice(0, 8))])
  )

  const { data: topObjections, error: topObjErr } = await supabase.rpc('report_ai_top_objections', {
    p_company_id: companyId,
    p_since: sinceIso,
    p_user_id: ownerFilter || null,
    p_limit: 10,
  })

  const { data: topNextActions, error: topNextErr } = await supabase.rpc('report_ai_top_next_actions', {
    p_company_id: companyId,
    p_since: sinceIso,
    p_user_id: ownerFilter || null,
    p_limit: 10,
  })

  const box: React.CSSProperties = {
    marginTop: 14,
    padding: 14,
    border: '1px solid #333',
    borderRadius: 12,
    background: '#0f0f0f',
  }

  const statCard: React.CSSProperties = {
    border: '1px solid #222',
    background: '#111',
    borderRadius: 12,
    padding: 12,
  }

  const currentOwnerName =
    ownerFilter && (sellers ?? []).find((p) => p.id === ownerFilter)?.full_name
      ? String((sellers ?? []).find((p) => p.id === ownerFilter)!.full_name)
      : ''

  const sellerOptions = (sellers ?? [])
    .filter((p) => p.role !== 'admin')
    .slice(0, 200)
    .map((p) => ({
      id: p.id,
      label: String(p.full_name ?? p.id.slice(0, 8)),
    }))

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1100,
        margin: '40px auto',
        padding: '0 16px',
        color: 'white',
        boxSizing: 'border-box',
      }}
    >
      <a href="/relatorios" style={{ color: '#9aa', textDecoration: 'none' }}>
        ← Voltar
      </a>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ marginTop: 16, marginBottom: 0 }}>Relatórios • IA</h1>

        <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
          Exibindo relatório para:{' '}
          <b style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {ownerFilter ? currentOwnerName || ownerFilter : 'Todos os vendedores'}
          </b>
        </div>

        <div style={{ opacity: 0.7, fontSize: 12 }}>Empresa: {companyId}</div>
      </div>

      <div style={box}>
        <RelatoriosIAFilters days={days} ownerFilter={ownerFilter} sellers={sellerOptions} />

        <div
          style={{
            marginTop: 10,
            opacity: 0.85,
            fontSize: 12,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span>
            Filtro atual: <b>{periodLabel}</b>
          </span>

          <span style={{ opacity: 0.55 }}>|</span>

          <span>
            Vendedor selecionado:{' '}
            <b>{ownerFilter ? currentOwnerName || ownerFilter : 'Todos'}</b>
          </span>
        </div>

        {sellersErr ? (
          <div style={{ marginTop: 10, color: '#fecaca' }}>Erro ao carregar vendedores: {sellersErr.message}</div>
        ) : null}

        {!ownerInCompany && ownerFilter ? (
          <div style={{ marginTop: 10, color: '#fde68a' }}>
            Aviso: este vendedor não aparece na lista da empresa (profiles.company_id). Mesmo assim, estou filtrando pelo
            ID informado na URL.
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginTop: 14,
        }}
      >
        <div style={statCard}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            Total de análises (amostra carregada: {limit})
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{total}</div>
        </div>
        <div style={statCard}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Score médio</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{avgScore}</div>
        </div>
        <div style={statCard}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Desde</div>
          <div style={{ fontSize: 14, fontWeight: 900, marginTop: 6 }}>{sinceIso}</div>
        </div>
      </div>

      {total === 0 ? (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            border: '1px solid #333',
            borderRadius: 12,
            background: '#0f0f0f',
            color: 'white',
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>
            Nenhuma análise encontrada para <b>{periodLabel}</b>
            {ownerFilter ? ' (vendedor selecionado)' : ''}.
          </div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Dica: aumente o período para <b>30</b> ou <b>90</b> dias para ver histórico.
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={`/relatorios/ia?days=30${ownerFilter ? `&owner=${ownerFilter}` : ''}`}
              style={{
                display: 'inline-block',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                textDecoration: 'none',
              }}
            >
              Ver 30 dias
            </a>
            <a
              href={`/relatorios/ia?days=90${ownerFilter ? `&owner=${ownerFilter}` : ''}`}
              style={{
                display: 'inline-block',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                textDecoration: 'none',
              }}
            >
              Ver 90 dias
            </a>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 12,
          marginTop: 14,
        }}
      >
        <div style={box}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Top objeções</div>
          {topObjErr ? (
            <div style={{ color: '#fecaca' }}>Erro: {topObjErr.message}</div>
          ) : !topObjections || topObjections.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Sem dados.</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, opacity: 0.92 }}>
              {topObjections.map((x: any, i: number) => (
                <li key={i} style={{ marginTop: 6 }}>
                  {String(x.item)} <span style={{ opacity: 0.65 }}>({Number(x.count)})</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div style={box}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Top próximas ações</div>
          {topNextErr ? (
            <div style={{ color: '#fecaca' }}>Erro: {topNextErr.message}</div>
          ) : !topNextActions || topNextActions.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Sem dados.</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, opacity: 0.92 }}>
              {topNextActions.map((x: any, i: number) => (
                <li key={i} style={{ marginTop: 6 }}>
                  {String(x.item)} <span style={{ opacity: 0.65 }}>({Number(x.count)})</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Últimas análises</div>

        {recentErr ? <div style={{ color: '#fecaca' }}>Erro ao carregar análises: {recentErr.message}</div> : null}
        {leadsErr ? <div style={{ color: '#fecaca' }}>Erro ao carregar leads: {leadsErr.message}</div> : null}

        {!recentAnalyses || recentAnalyses.length === 0 ? (
          <div style={{ opacity: 0.75 }}>Nenhuma análise no período.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {recentAnalyses.map((a) => {
              const leadName = leadNameById.get(a.lead_id) ?? a.lead_id
              const leadPhone = leadPhoneById.get(a.lead_id) ?? ''
              const sentimentLabel = a.sentiment ?? '—'

              return (
                <details
                  key={a.id}
                  style={{
                    border: '1px solid #1b1b1b',
                    borderRadius: 12,
                    background: '#0b0b0b',
                    overflow: 'hidden',
                  }}
                >
                  <summary
                    style={{
                      listStyle: 'none',
                      cursor: 'pointer',
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: '1.6fr 1fr 0.6fr 0.8fr 0.6fr',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Nome</div>
                      <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {leadName}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Telefone</div>
                      <div style={{ opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {leadPhone || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Score</div>
                      <div style={{ fontWeight: 900 }}>{a.performance_score}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Sentimento</div>
                      <div style={{ opacity: 0.9 }}>{sentimentLabel}</div>
                    </div>

                    <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.8 }}>Abrir</div>
                  </summary>

                  <div style={{ padding: 12, borderTop: '1px solid #151515' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{a.created_at}</div>
                      <div style={{ fontWeight: 900 }}>Score: {a.performance_score}</div>
                    </div>

                    {!ownerFilter ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>Vendedor</div>
                        <div style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {sellerNameById.get(a.user_id) ?? a.user_id}
                        </div>
                      </div>
                    ) : null}

                    <div style={{ marginTop: 10 }}>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>Lead</div>
                      <a
                        href={`/leads/${a.lead_id}`}
                        style={{
                          color: '#9aa',
                          textDecoration: 'none',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {leadName}
                      </a>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>Resumo</div>
                      <div style={{ opacity: 0.9, whiteSpace: 'pre-wrap' }}>{a.summary}</div>
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        )}

        <LoadMore
          currentLimit={limit}
          step={50}
          max={500}
          disabled={!recentAnalyses || recentAnalyses.length < limit}
        />
      </div>

      <div style={{ marginTop: 12, opacity: 0.6, fontSize: 12 }}>
        Nota: este relatório usa as análises salvas. Se você estiver em modo MOCK_AI, os insights são apenas para teste.
      </div>
    </div>
  )
}