import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import ReportNavDropdown from '@/app/relatorios/components/ReportNavDropdown'

// ==============================================================================
// DESIGN TOKENS — mesmos do shell/kanban
// ==============================================================================
const DS = {
  contentBg:     '#090b0f',
  surfaceBg:     '#0d1017',
  panelBg:       '#101420',
  cardBg:        '#141722',
  border:        '#1a1d2e',
  textPrimary:   '#edf2f7',
  textSecondary: '#8fa3bc',
  textLabel:     '#6b7fa3',
  textMuted:     '#4a5568',
  blueSoft:      '#7eb6ff',
  blue:          '#3b82f6',
  red:           '#ef4444',
  redBg:         '#1c0a0a',
  redBorder:     '#450a0a',
  green:         '#22c55e',
  yellow:        '#fbbf24',
  radius:        7,
  radiusContainer: 9,
  shadowCard:    '0 2px 12px rgba(0,0,0,0.25)',
}

// ==============================================================================
// Helpers
// ==============================================================================

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

// ==============================================================================
// Types
// ==============================================================================

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

// ==============================================================================
// Table styles
// ==============================================================================

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 10,
  fontWeight: 800,
  color: DS.textLabel,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${DS.border}`,
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 13,
  color: DS.textSecondary,
  borderBottom: `1px solid ${DS.border}`,
}

const tdBold: React.CSSProperties = {
  ...tdStyle,
  color: DS.textPrimary,
  fontWeight: 700,
}

// ==============================================================================
// Main page
// ==============================================================================

export default async function RelatoriosGeraisPage() {
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
      <div style={{ width: 900, margin: '80px auto', color: DS.textPrimary }}>
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

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '0 0 60px 0',
        color: DS.textPrimary,
        background: DS.contentBg,
      }}
    >
      {/* ================================================================== */}
      {/* Header com degradê azul                                            */}
      {/* ================================================================== */}
      <div
        style={{
          background: `linear-gradient(135deg, ${DS.blue}18 0%, ${DS.contentBg} 60%)`,
          borderBottom: `1px solid ${DS.border}`,
          padding: '32px 40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: DS.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          Relatórios Gerais
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: DS.textSecondary,
            maxWidth: 600,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Conversão entre etapas, perdas por estágio, gargalos de tempo e leads em risco de SLA.
        </p>

        {/* Navegação de relatórios — dropdown agrupado */}
        <div style={{ marginTop: 8 }}>
          <ReportNavDropdown currentPath="/relatorios/gerais" />
        </div>
      </div>

      {/* ================================================================== */}
      {/* Conteúdo principal                                                 */}
      {/* ================================================================== */}
      <div style={{ maxWidth: 980, margin: '28px auto 0', padding: '0 24px', display: 'grid', gap: 20 }}>

        {/* ============================================================== */}
        {/* SLA / Risco                                                     */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                style={{
                  margin: '0 0 6px 0',
                  fontSize: 13,
                  fontWeight: 800,
                  color: DS.blueSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Leads em risco (acima do SLA)
              </h3>

              <div style={{ fontSize: 12, color: DS.textSecondary }}>
                Total em risco: <b style={{ color: DS.textPrimary }}>{slaCount}</b>
                {worstStageByCount ? (
                  <>
                    {' '}
                    | Etapa mais crítica:{' '}
                    <b style={{ textTransform: 'capitalize', color: DS.red }}>{worstStageByCount}</b>
                  </>
                ) : null}
              </div>
            </div>

            <a
              href="/leads?risk=1"
              style={{
                color: DS.textPrimary,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
                whiteSpace: 'nowrap',
                transition: 'all 200ms ease',
                opacity: slaCount === 0 ? 0.6 : 1,
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
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar SLA/Risco: {slaErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                Aqui aparecem leads em etapas ativas (exceto <b>fechado</b> e <b>perdido</b>)
                cujo tempo na etapa ultrapassou o SLA padrão.
              </p>

              {slaRows.length === 0 ? (
                <div style={{ marginTop: 12, color: DS.textMuted, fontSize: 13 }}>
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
                      <tr>
                        <th style={thStyle}>Lead</th>
                        <th style={thStyle}>Etapa</th>
                        <th style={thStyle}>Tempo na etapa</th>
                        <th style={thStyle}>SLA</th>
                        <th style={thStyle}>Atraso</th>
                        <th style={thStyle}>Contato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRiskLeads.map((r) => (
                        <tr key={r.lead_id}>
                          <td style={tdStyle}>
                            <a
                              href={`/leads?risk=1&lead=${encodeURIComponent(r.lead_id)}`}
                              style={{ color: DS.textPrimary, textDecoration: 'none', fontWeight: 700 }}
                              title="Abrir no Pipeline e destacar este lead"
                            >
                              {r.name}
                            </a>
                          </td>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.stage}</td>
                          <td style={tdStyle}>{formatSeconds(r.seconds_in_stage)}</td>
                          <td style={tdStyle}>{formatSeconds(r.sla_seconds)}</td>
                          <td style={tdBold}>{formatSeconds(r.over_seconds)}</td>
                          <td style={tdStyle}>{r.phone ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {slaRows.length > 20 ? (
                    <div style={{ marginTop: 10, color: DS.textMuted, fontSize: 12 }}>
                      Mostrando top 20 por atraso. Total em risco: {slaRows.length}.
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* Conversão                                                       */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                color: DS.blueSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Taxa de conversão entre etapas
            </h3>
            <div style={{ fontSize: 12, color: DS.textSecondary }}>
              Conversão final (Negociação → Fechado): <b style={{ color: DS.textPrimary }}>{finalConv.toFixed(2)}%</b>
            </div>
          </div>

          {convErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar conversão: {convErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                Baseado em leads únicos que <b>entraram</b> na etapa e depois <b>progrediram</b> para a próxima.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>De</th>
                      <th style={thStyle}>Para</th>
                      <th style={thStyle}>Entraram</th>
                      <th style={thStyle}>Progrediram</th>
                      <th style={thStyle}>Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convRows.length === 0 ? (
                      <tr>
                        <td style={{ ...tdStyle, color: DS.textMuted }} colSpan={5}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      convRows.map((r) => (
                        <tr key={`${r.from_stage}->${r.to_stage}`}>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.from_stage}</td>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.to_stage}</td>
                          <td style={tdStyle}>{r.entered}</td>
                          <td style={tdStyle}>{r.progressed}</td>
                          <td style={tdBold}>{r.conversion.toFixed(2)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* Perdas                                                          */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                color: DS.blueSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Perdas por etapa
            </h3>
            <div style={{ fontSize: 12, color: DS.textSecondary }}>
              Maior perda:{' '}
              <b style={{ color: DS.red }}>
                {worstLoss ? `${worstLoss.stage} (${worstLoss.loss_rate.toFixed(2)}%)` : '—'}
              </b>
            </div>
          </div>

          {lossErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar perdas: {lossErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                % de leads que saíram da etapa direto para <b>perdido</b>.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Etapa</th>
                      <th style={thStyle}>Entraram</th>
                      <th style={thStyle}>Viraram perdido</th>
                      <th style={thStyle}>Taxa de perda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lossRows.length === 0 ? (
                      <tr>
                        <td style={{ ...tdStyle, color: DS.textMuted }} colSpan={4}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      lossRows.map((r) => (
                        <tr key={`loss-${r.stage}`}>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.stage}</td>
                          <td style={tdStyle}>{r.entered}</td>
                          <td style={tdStyle}>{r.lost}</td>
                          <td style={tdBold}>{r.loss_rate.toFixed(2)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* Gargalo                                                         */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <h3
            style={{
              margin: '0 0 6px 0',
              fontSize: 13,
              fontWeight: 800,
              color: DS.blueSoft,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Gargalo por etapa
          </h3>

          {timeErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar gargalo: {timeErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
                Baseado em eventos <code style={{ background: DS.panelBg, padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>stage_changed</code> (lead_events).
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Etapa (from)</th>
                      <th style={thStyle}>Movimentos</th>
                      <th style={thStyle}>Tempo médio</th>
                      <th style={thStyle}>Mediana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeRows.length === 0 ? (
                      <tr>
                        <td style={{ ...tdStyle, color: DS.textMuted }} colSpan={4}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      timeRows.map((r) => (
                        <tr key={r.from_stage}>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.from_stage}</td>
                          <td style={tdStyle}>{r.moves}</td>
                          <td style={tdStyle}>{formatSeconds(r.avg_seconds)}</td>
                          <td style={tdStyle}>{formatSeconds(r.median_seconds)}</td>
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