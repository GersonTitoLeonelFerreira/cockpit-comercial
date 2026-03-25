import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

function formatSeconds(secs: number) {
  const s = Math.max(0, Math.floor(secs || 0))
  const m = Math.floor(s / 60)
  if (m < 1) return '0min'
  const h = Math.floor(m / 60)
  const mm = m % 60
  const d = Math.floor(h / 24)
  const hh = h % 24

  if (d > 0) return `${d}d ${hh}h`
  if (h > 0) return mm > 0 ? `${h}h ${mm}min` : `${h}h`
  return `${m}min`
}

type StageTimeRow = {
  from_stage: string
  moves: number
  avg_seconds: number
  median_seconds: number
}

type ConvRow = {
  step_order: number
  from_stage: string
  to_stage: string
  entered: number
  progressed: number
  conversion: number
}

type LossRow = {
  step_order: number
  stage: string
  lost_to: string
  entered: number
  lost: number
  loss_rate: number
}

type SlaRiskRow = {
  lead_id: string
  name: string
  phone: string | null
  stage: string
  seconds_in_stage: number
  sla_seconds: number
  over_seconds: number
}

export default async function RelatoriosPage() {
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

  if (!user || userErr) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.company_id) {
    return (
      <div style={{ width: 900, margin: '80px auto', color: 'white' }}>
        <h1>Relatórios</h1>
        <p>
          Erro ao buscar seu perfil/empresa:{' '}
          {profileError?.message ?? 'company_id não encontrado'}
        </p>
      </div>
    )
  }

  const companyId = profile.company_id as string

  // --- Conversão ---
  const { data: convData, error: convErr } = await supabase.rpc(
    'report_stage_conversion',
    { p_company_id: companyId }
  )

  const convRows: ConvRow[] = (convData ?? []).map((r: any) => ({
    step_order: Number(r.step_order ?? 0),
    from_stage: r.from_stage,
    to_stage: r.to_stage,
    entered: Number(r.entered ?? 0),
    progressed: Number(r.progressed ?? 0),
    conversion: Number(r.conversion ?? 0),
  }))

  // --- Perdas ---
  const { data: lossData, error: lossErr } = await supabase.rpc(
    'report_stage_losses',
    { p_company_id: companyId }
  )

  const lossRows: LossRow[] = (lossData ?? []).map((r: any) => ({
    step_order: Number(r.step_order ?? 0),
    stage: r.stage,
    lost_to: r.lost_to,
    entered: Number(r.entered ?? 0),
    lost: Number(r.lost ?? 0),
    loss_rate: Number(r.loss_rate ?? 0),
  }))

  // --- Gargalo ---
  const { data: timeData, error: timeErr } = await supabase.rpc(
    'report_stage_time_summary',
    { p_company_id: companyId }
  )

  const timeRows: StageTimeRow[] = (timeData ?? []).map((r: any) => ({
    from_stage: r.from_stage,
    moves: Number(r.moves ?? 0),
    avg_seconds: Number(r.avg_seconds ?? 0),
    median_seconds: Number(r.median_seconds ?? 0),
  }))

  // --- SLA / Risco ---
  const { data: slaData, error: slaErr } = await supabase.rpc(
    'report_sla_risk',
    { p_company_id: companyId }
  )

  const slaRows: SlaRiskRow[] = (slaData ?? []).map((r: any) => ({
    lead_id: String(r.lead_id),
    name: String(r.name ?? ''),
    phone: r.phone ?? null,
    stage: String(r.stage ?? ''),
    seconds_in_stage: Number(r.seconds_in_stage ?? 0),
    sla_seconds: Number(r.sla_seconds ?? 0),
    over_seconds: Number(r.over_seconds ?? 0),
  }))

  const slaCount = slaRows.length
  const stageRiskCounts = slaRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1
    return acc
  }, {})

  const worstStageByCount =
    Object.entries(stageRiskCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const topRiskLeads = slaRows.slice(0, 20)

  const finalStep = convRows.find(
    (r) => r.from_stage === 'negociacao' && r.to_stage === 'fechado'
  )
  const finalConv = finalStep ? finalStep.conversion : 0

  const worstLoss = lossRows
    .slice()
    .sort((a, b) => (b.loss_rate ?? 0) - (a.loss_rate ?? 0))[0]

  const navLinkBase: React.CSSProperties = {
    color: '#9aa',
    textDecoration: 'none',
    fontSize: 13,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #333',
    background: 'transparent',
  }

  const navLinkActive: React.CSSProperties = {
    ...navLinkBase,
    color: 'white',
    background: '#111',
  }

  return (
    <div style={{ width: '100%', padding: 40, color: 'white' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Relatórios</h1>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginTop: 10,
          marginBottom: 30,
          flexWrap: 'wrap',
        }}
      >
        <a href="/leads" style={navLinkBase}>
          Pipeline
        </a>

        <a href="/prioridade" style={navLinkBase}>
          Prioridade
        </a>

        <a href="/relatorios" style={navLinkActive}>
          Relatórios
        </a>

        {/* Subpágina do Relatório IA */}
        <a href="/relatorios/ia" style={navLinkBase} title="Relatório de IA (objeções, próximos passos, score)">
          Relatório IA
        </a>

        {/* Subpágina de Performance por Produto (Fase 5.4) */}
        <a href="/relatorios/produto" style={navLinkBase} title="Ticket médio e conversão por produto">
          Performance por Produto
        </a>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        {/* SLA / Risco */}
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 16,
            background: '#0f0f0f',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'baseline',
            }}
          >
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                Leads em risco (acima do SLA)
              </h3>

              <div style={{ opacity: 0.85, fontSize: 12 }}>
                Total em risco: <b>{slaCount}</b>
                {worstStageByCount ? (
                  <>
                    {' '}
                    | Etapa mais crítica:{' '}
                    <b style={{ textTransform: 'capitalize' }}>{worstStageByCount}</b>
                  </>
                ) : null}
              </div>
            </div>

            <a
              href="/leads?risk=1"
              style={{
                color: 'white',
                textDecoration: 'none',
                fontSize: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #333',
                background: '#111',
                whiteSpace: 'nowrap',
                height: 'fit-content',
                opacity: slaCount === 0 ? 0.8 : 1,
              }}
              title={
                slaCount === 0
                  ? 'Abrir o Pipeline filtrado (no momento não há leads acima do SLA)'
                  : 'Abrir o Pipeline mostrando somente os leads acima do SLA'
              }
            >
              Abrir no Pipeline →
            </a>
          </div>

          {slaErr ? (
            <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>
              Erro ao buscar SLA/Risco: {slaErr.message}
            </div>
          ) : (
            <>
              <p style={{ opacity: 0.75, marginTop: 10 }}>
                Aqui aparecem leads em etapas ativas (exceto <b>fechado</b> e <b>perdido</b>)
                cujo tempo na etapa ultrapassou o SLA padrão.
              </p>

              {slaRows.length === 0 ? (
                <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
                  Nenhum lead acima do SLA no momento.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: 14 }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      minWidth: 820,
                    }}
                  >
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
                        <th style={{ padding: '10px 8px' }}>Lead</th>
                        <th style={{ padding: '10px 8px' }}>Etapa</th>
                        <th style={{ padding: '10px 8px' }}>Tempo na etapa</th>
                        <th style={{ padding: '10px 8px' }}>SLA</th>
                        <th style={{ padding: '10px 8px' }}>Atraso</th>
                        <th style={{ padding: '10px 8px' }}>Contato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRiskLeads.map((r) => (
                        <tr key={r.lead_id} style={{ borderBottom: '1px solid #1f1f1f' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <a
                              href={`/leads?risk=1&lead=${encodeURIComponent(r.lead_id)}`}
                              style={{ color: 'white', textDecoration: 'none' }}
                              title="Abrir no Pipeline e destacar este lead"
                            >
                              <b>{r.name}</b>
                            </a>
                          </td>

                          <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>
                            {r.stage}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {formatSeconds(r.seconds_in_stage)}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {formatSeconds(r.sla_seconds)}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <b>{formatSeconds(r.over_seconds)}</b>
                          </td>
                          <td style={{ padding: '10px 8px', opacity: 0.9 }}>
                            {r.phone ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {slaRows.length > 20 ? (
                    <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
                      Mostrando top 20 por atraso. Total em risco: {slaRows.length}.
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Conversão */}
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 16,
            background: '#0f0f0f',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'baseline',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>
              Taxa de conversão entre etapas
            </h3>
            <div style={{ opacity: 0.85, fontSize: 12 }}>
              Conversão final (Negociação → Fechado): <b>{finalConv.toFixed(2)}%</b>
            </div>
          </div>

          {convErr ? (
            <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>
              Erro ao buscar conversão: {convErr.message}
            </div>
          ) : (
            <>
              <p style={{ opacity: 0.75, marginTop: 0 }}>
                Baseado em leads únicos que <b>entraram</b> na etapa e depois <b>progrediram</b> para a próxima.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
                      <th style={{ padding: '10px 8px' }}>De</th>
                      <th style={{ padding: '10px 8px' }}>Para</th>
                      <th style={{ padding: '10px 8px' }}>Entraram</th>
                      <th style={{ padding: '10px 8px' }}>Progrediram</th>
                      <th style={{ padding: '10px 8px' }}>Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convRows.length === 0 ? (
                      <tr>
                        <td style={{ padding: 12, opacity: 0.7 }} colSpan={5}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      convRows.map((r) => (
                        <tr
                          key={`${r.from_stage}->${r.to_stage}`}
                          style={{ borderBottom: '1px solid #1f1f1f' }}
                        >
                          <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>
                            {r.from_stage}
                          </td>
                          <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>
                            {r.to_stage}
                          </td>
                          <td style={{ padding: '10px 8px' }}>{r.entered}</td>
                          <td style={{ padding: '10px 8px' }}>{r.progressed}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <b>{r.conversion.toFixed(2)}%</b>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Perdas */}
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 16,
            background: '#0f0f0f',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'baseline',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Perdas por etapa</h3>
            <div style={{ opacity: 0.85, fontSize: 12 }}>
              Maior perda:{' '}
              <b>{worstLoss ? `${worstLoss.stage} (${worstLoss.loss_rate.toFixed(2)}%)` : '—'}</b>
            </div>
          </div>

          {lossErr ? (
            <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>
              Erro ao buscar perdas: {lossErr.message}
            </div>
          ) : (
            <>
              <p style={{ opacity: 0.75, marginTop: 0 }}>
                % de leads que saíram da etapa direto para <b>perdido</b>.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
                      <th style={{ padding: '10px 8px' }}>Etapa</th>
                      <th style={{ padding: '10px 8px' }}>Entraram</th>
                      <th style={{ padding: '10px 8px' }}>Viraram perdido</th>
                      <th style={{ padding: '10px 8px' }}>Taxa de perda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lossRows.length === 0 ? (
                      <tr>
                        <td style={{ padding: 12, opacity: 0.7 }} colSpan={4}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      lossRows.map((r) => (
                        <tr key={`loss-${r.stage}`} style={{ borderBottom: '1px solid #1f1f1f' }}>
                          <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>
                            {r.stage}
                          </td>
                          <td style={{ padding: '10px 8px' }}>{r.entered}</td>
                          <td style={{ padding: '10px 8px' }}>{r.lost}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <b>{r.loss_rate.toFixed(2)}%</b>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Gargalo */}
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 16,
            background: '#0f0f0f',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Gargalo por etapa</h3>

          {timeErr ? (
            <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13 }}>
              Erro ao buscar gargalo: {timeErr.message}
            </div>
          ) : (
            <>
              <p style={{ opacity: 0.75, marginTop: 6 }}>
                Baseado em eventos <code>stage_changed</code> (lead_events).
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #222' }}>
                      <th style={{ padding: '10px 8px' }}>Etapa (from)</th>
                      <th style={{ padding: '10px 8px' }}>Movimentos</th>
                      <th style={{ padding: '10px 8px' }}>Tempo médio</th>
                      <th style={{ padding: '10px 8px' }}>Mediana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeRows.length === 0 ? (
                      <tr>
                        <td style={{ padding: 12, opacity: 0.7 }} colSpan={4}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      timeRows.map((r) => (
                        <tr key={r.from_stage} style={{ borderBottom: '1px solid #1f1f1f' }}>
                          <td style={{ padding: '10px 8px', textTransform: 'capitalize' }}>
                            {r.from_stage}
                          </td>
                          <td style={{ padding: '10px 8px' }}>{r.moves}</td>
                          <td style={{ padding: '10px 8px' }}>{formatSeconds(r.avg_seconds)}</td>
                          <td style={{ padding: '10px 8px' }}>{formatSeconds(r.median_seconds)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}