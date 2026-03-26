import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getMonthlySeasonalityPerformance } from '@/app/lib/services/monthlySeasonalityPerformance'
import type {
  MonthlySeasonalitySummary,
  MonthlySeasonalityRow,
} from '@/app/types/monthlySeasonality'
import { getMonthlySeasonalityVocation } from '@/app/lib/services/monthlySeasonalityVocation'
import type {
  MonthlyVocationalSummary,
  MonthlyVocationalRow,
  MonthlyVocationType,
  MonthlyVocationConfidence,
} from '@/app/types/monthlySeasonality'

// ==============================================================================
// Helpers
// ==============================================================================

function toBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function toPercent(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + '%'
}

/** Default: 2 anos atrás (para ter amostra multi-ano) */
function getTwoYearsAgo(): string {
  const now = new Date()
  return `${now.getFullYear() - 2}-01-01`
}

function getTodayDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ==============================================================================
// Sub-components
// ==============================================================================

function KpiCard({
  label,
  name,
  value,
  sub,
}: {
  label: string
  name: string | null
  value: string
  sub?: string
}) {
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '1 1 200px',
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      {name ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#e8e8e8' }}>{value}</div>
          {sub ? <div style={{ fontSize: 11, opacity: 0.6 }}>{sub}</div> : null}
        </>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Base insuficiente</div>
      )}
    </div>
  )
}

// ==============================================================================
// Main page
// ==============================================================================

interface SellerOption {
  id: string
  label: string
}

interface SellerProfileRow {
  id: string
  full_name: string | null
}

function MesRelatorioPg() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // User/profile state
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters — default: 2 anos atrás para ter amostra multi-ano
  const [dateStart, setDateStart] = React.useState(getTwoYearsAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  // Data — performance
  const [summary, setSummary] = React.useState<MonthlySeasonalitySummary | null>(null)
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

  // Data — vocation
  const [vocation, setVocation] = React.useState<MonthlyVocationalSummary | null>(null)
  const [vocationLoading, setVocationLoading] = React.useState(false)
  const [vocationError, setVocationError] = React.useState<string | null>(null)

  // Init: load profile + sellers
  React.useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Sessão expirada. Faça login novamente.')

        const uid = userData.user.id

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, company_id')
          .eq('id', uid)
          .maybeSingle()

        if (!profile?.company_id) throw new Error('Perfil não encontrado.')

        const adminUser = profile.role === 'admin'
        setIsAdmin(adminUser)
        setCompanyId(profile.company_id)

        if (adminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

          setSellers(
            (sellersData ?? []).map((s: SellerProfileRow) => ({
              id: s.id,
              label: s.full_name || s.id,
            }))
          )
          setSelectedSellerId(null)
        } else {
          setSelectedSellerId(uid)
        }
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao carregar perfil.')
      } finally {
        setLoading(false)
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load performance data
  React.useEffect(() => {
    if (!companyId) return

    async function load() {
      setDataLoading(true)
      setDataError(null)
      try {
        const result = await getMonthlySeasonalityPerformance({
          companyId: companyId!,
          ownerId: selectedSellerId,
          dateStart,
          dateEnd,
        })
        setSummary(result)
      } catch (e: any) {
        setDataError(e?.message ?? 'Erro ao buscar dados.')
      } finally {
        setDataLoading(false)
      }
    }
    void load()
  }, [companyId, selectedSellerId, dateStart, dateEnd])

  // Load vocation data
  React.useEffect(() => {
    if (!companyId) return

    async function loadVocation() {
      setVocationLoading(true)
      setVocationError(null)
      try {
        const result = await getMonthlySeasonalityVocation({
          companyId: companyId!,
          ownerId: selectedSellerId,
          dateStart,
          dateEnd,
        })
        setVocation(result)
      } catch (e: any) {
        setVocationError(e?.message ?? 'Erro ao buscar vocação operacional.')
      } finally {
        setVocationLoading(false)
      }
    }
    void loadVocation()
  }, [companyId, selectedSellerId, dateStart, dateEnd])

  // ============================================================================
  // Render
  // ============================================================================

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

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'white', opacity: 0.7 }}>Carregando perfil...</div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: '#ef4444' }}>Erro: {error}</div>
    )
  }

  const bestFaturamentoMes = summary?.melhor_mes_faturamento
  const anyInsuficiente =
    summary?.rows.some((r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho) ?? false
  const maxAnos = summary ? Math.max(...summary.rows.map((r) => r.anos_com_dados)) : 0

  return (
    <div style={{ width: '100%', padding: 40, color: 'white' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Sazonalidade Mensal</h1>
      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          opacity: 0.5,
          marginBottom: 20,
          maxWidth: 600,
          margin: '0 auto 20px',
        }}
      >
        Leitura sazonal por mês do ano (janeiro a dezembro). Identifica quais meses historicamente
        lideram em faturamento, volume de ganhos, ticket médio e trabalho comercial.
      </p>

      {/* Sub-navigation */}
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
        <a href="/relatorios" style={navLinkBase} title="Hub de Relatórios">
          Relatórios
        </a>
        <a
          href="/dashboard/relatorios/produto"
          style={navLinkBase}
          title="Performance por Produto"
        >
          Performance por Produto
        </a>
        <a
          href="/dashboard/relatorios/dia-semana"
          style={navLinkBase}
          title="Sazonalidade por dia da semana"
        >
          Dia da Semana
        </a>
        <a
          href="/dashboard/relatorios/semana-mes"
          style={navLinkBase}
          title="Sazonalidade por semana do mês"
        >
          Semana do Mês
        </a>
        <a
          href="/dashboard/relatorios/mes"
          style={navLinkActive}
          title="Sazonalidade mensal"
        >
          Mês
        </a>
        <a href="/dashboard/relatorios/radar" style={navLinkBase} title="Radar do Período">
          🎯 Radar
        </a>
      </div>

      {/* Filters */}
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto 28px',
          background: '#0f0f0f',
          border: '1px solid #202020',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
            Data Início
          </label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              color: 'white',
              padding: '8px 10px',
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
            Data Fim
          </label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              color: 'white',
              padding: '8px 10px',
              fontSize: 13,
            }}
          />
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
              Vendedor
            </label>
            <select
              value={selectedSellerId ?? ''}
              onChange={(e) => setSelectedSellerId(e.target.value || null)}
              style={{
                background: '#111',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                padding: '8px 10px',
                fontSize: 13,
                minWidth: 180,
              }}
            >
              <option value="">Empresa toda</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            opacity: 0.4,
            alignSelf: 'center',
            marginLeft: 4,
          }}
        >
          💡 Recomendado: pelo menos 2 anos de dados para leitura sazonal confiável.
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        {dataLoading ? (
          <div style={{ opacity: 0.6, padding: 20 }}>Carregando dados...</div>
        ) : dataError ? (
          <div style={{ color: '#ef4444', padding: 20 }}>Erro: {dataError}</div>
        ) : summary ? (
          <>
            {/* BLOCO A — KPIs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <KpiCard
                label="Mês com mais Ganhos"
                name={summary.melhor_mes_ganhos?.month_label ?? null}
                value={
                  summary.melhor_mes_ganhos
                    ? `${summary.melhor_mes_ganhos.ganhos} ganho(s)`
                    : '—'
                }
                sub={
                  summary.melhor_mes_ganhos
                    ? `${summary.melhor_mes_ganhos.anos_com_dados} ano(s) com dados`
                    : undefined
                }
              />
              <KpiCard
                label="Mês com maior Faturamento"
                name={summary.melhor_mes_faturamento?.month_label ?? null}
                value={
                  summary.melhor_mes_faturamento
                    ? toBRL(summary.melhor_mes_faturamento.faturamento)
                    : '—'
                }
                sub={
                  summary.melhor_mes_faturamento
                    ? `${summary.melhor_mes_faturamento.anos_com_dados} ano(s) com dados`
                    : undefined
                }
              />
              <KpiCard
                label="Mês com melhor Ticket Médio"
                name={summary.melhor_mes_ticket?.month_label ?? null}
                value={
                  summary.melhor_mes_ticket
                    ? toBRL(summary.melhor_mes_ticket.ticket_medio)
                    : '—'
                }
                sub={
                  summary.melhor_mes_ticket
                    ? `${summary.melhor_mes_ticket.anos_com_dados} ano(s) com dados`
                    : 'Base insuficiente em todos os meses'
                }
              />
              <KpiCard
                label="Mês mais forte em Trabalho"
                name={summary.melhor_mes_trabalho?.month_label ?? null}
                value={
                  summary.melhor_mes_trabalho
                    ? `${summary.melhor_mes_trabalho.leads_trabalhados} lead(s)`
                    : '—'
                }
                sub={
                  summary.melhor_mes_trabalho
                    ? `${summary.melhor_mes_trabalho.anos_com_dados} ano(s) com dados`
                    : undefined
                }
              />
            </div>

            {/* BLOCO B — Tabela por Mês */}
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #202020' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  Desempenho por Mês do Ano
                </span>
                <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 10 }}>
                  leads_trabalhados via first_worked_at · ganhos via won_at
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid #202020' }}>
                      {[
                        { label: 'Mês', align: 'left' },
                        { label: 'Leads Trabalhados', align: 'right' },
                        { label: 'Ganhos', align: 'right' },
                        { label: 'Perdidos', align: 'right' },
                        { label: 'Faturamento', align: 'right' },
                        { label: 'Ticket Médio', align: 'right' },
                        { label: 'Taxa de Ganho', align: 'right' },
                        { label: 'Anos c/ Dados', align: 'right' },
                      ].map((col) => (
                        <th
                          key={col.label}
                          style={{
                            padding: '10px 14px',
                            textAlign: col.align as React.CSSProperties['textAlign'],
                            fontWeight: 600,
                            opacity: 0.6,
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row: MonthlySeasonalityRow) => {
                      const isBestFaturamento =
                        bestFaturamentoMes?.month === row.month && row.faturamento > 0
                      const isZeroActivity = row.leads_trabalhados === 0 && row.ganhos === 0
                      const isLowBase =
                        row.leads_trabalhados > 0 && !row.base_suficiente_trabalho

                      return (
                        <tr
                          key={row.month}
                          style={{
                            borderBottom: '1px solid #1a1a1a',
                            borderLeft: isBestFaturamento
                              ? '3px solid #22c55e'
                              : '3px solid transparent',
                            opacity: isZeroActivity ? 0.35 : 1,
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {row.month_label}
                            {isLowBase ? (
                              <span
                                style={{ marginLeft: 6, fontSize: 12 }}
                                title="Base insuficiente para taxa de ganho"
                              >
                                ⚠️
                              </span>
                            ) : null}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.leads_trabalhados}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.ganhos}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.perdidos}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.faturamento > 0 ? toBRL(row.faturamento) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.base_suficiente_ganho
                              ? toBRL(row.ticket_medio)
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.base_suficiente_trabalho
                              ? toPercent(row.taxa_ganho)
                              : row.leads_trabalhados > 0
                              ? 'Base insuf.'
                              : '—'}
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              textAlign: 'right',
                              fontSize: 12,
                              opacity: 0.6,
                            }}
                          >
                            {row.anos_com_dados > 0 ? row.anos_com_dados : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BLOCO C — Leitura Resumida + Diagnóstico */}
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                padding: '18px 20px',
                display: 'grid',
                gap: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>Leitura Resumida</div>

              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                {summary.leitura_resumida.map((frase, idx) => (
                  <li key={idx} style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
                    {frase}
                  </li>
                ))}
              </ul>

              {/* Diagnostic text */}
              <div
                style={{
                  background: '#111',
                  border: '1px solid #1e1e1e',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  opacity: 0.85,
                }}
              >
                {summary.diagnostico}
              </div>

              {/* Period info grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 10,
                  fontSize: 13,
                }}
              >
                {[
                  {
                    label: 'Período analisado',
                    value: `${summary.period_start} a ${summary.period_end}`,
                  },
                  { label: 'Meses no período', value: `${summary.meses_no_periodo}` },
                  {
                    label: 'Total de leads trabalhados',
                    value: `${summary.total_leads_trabalhados}`,
                  },
                  { label: 'Total de ganhos', value: `${summary.total_ganhos}` },
                  { label: 'Total de perdidos', value: `${summary.total_perdidos}` },
                  {
                    label: 'Faturamento total',
                    value: toBRL(summary.total_faturamento),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: '#111',
                      border: '1px solid #1e1e1e',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        opacity: 0.5,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ fontWeight: 700 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {anyInsuficiente && (
                <div
                  style={{
                    background: '#1a1500',
                    border: '1px solid #3a2e00',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#fbbf24',
                  }}
                >
                  ⚠️ Alguns meses têm menos de 10 leads trabalhados. A taxa de ganho para esses
                  meses é indicada como &quot;Base insuf.&quot; e não deve ser usada como
                  referência. Amplie o período de análise para obter leituras mais confiáveis.
                </div>
              )}

              {maxAnos === 1 && (
                <div
                  style={{
                    background: '#1a1500',
                    border: '1px solid #3a2e00',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#fbbf24',
                  }}
                >
                  ⚠️ Todos os dados vêm de apenas 1 ano. A sazonalidade mensal precisa de pelo
                  menos 2 anos para ser estatisticamente relevante. Amplie o período para obter uma
                  leitura sazonal mais confiável.
                </div>
              )}

              <div style={{ fontSize: 11, opacity: 0.35 }}>
                Fonte leads trabalhados: <code>sales_cycles.first_worked_at</code> (somente
                eventos de trabalho comercial real). Fonte ganhos:{' '}
                <code>sales_cycles.won_at</code> + <code>won_total {'>'} 0</code> + status=ganho.
                Fonte perdidos: <code>sales_cycles.lost_at</code> quando disponível,{' '}
                <code>updated_at</code> como proxy caso contrário. Mês = mês do calendário (1–12).
              </div>
            </div>
          </>
        ) : null}

        {/* ================================================================= */}
        {/* Vocação Operacional por Mês                                        */}
        {/* ================================================================= */}

        <div
          style={{
            marginTop: 28,
            borderTop: '1px solid #202020',
            paddingTop: 24,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
            Vocação Operacional por Mês
          </h2>
          <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 20 }}>
            Classificação do tipo de trabalho comercial mais indicado para cada mês do ano,
            baseada em eventos reais de prospecção, follow-up, negociação e fechamento.
          </p>

          {vocationLoading ? (
            <div style={{ opacity: 0.6, padding: 20 }}>Carregando vocação operacional...</div>
          ) : vocationError ? (
            <div style={{ color: '#ef4444', padding: 20 }}>Erro: {vocationError}</div>
          ) : vocation ? (
            <>
              {/* KPIs de Vocação */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                <VocationKpiCard
                  label="Mês de Prospecção"
                  color="#60a5fa"
                  row={vocation.melhor_mes_prospeccao}
                  vocType="prospeccao"
                />
                <VocationKpiCard
                  label="Mês de Follow-up"
                  color="#a78bfa"
                  row={vocation.melhor_mes_followup}
                  vocType="followup"
                  unavailable={!vocation.has_cycle_events}
                />
                <VocationKpiCard
                  label="Mês de Negociação"
                  color="#fbbf24"
                  row={vocation.melhor_mes_negociacao}
                  vocType="negociacao"
                  unavailable={!vocation.has_cycle_events}
                />
                <VocationKpiCard
                  label="Mês de Fechamento"
                  color="#34d399"
                  row={vocation.melhor_mes_fechamento}
                  vocType="fechamento"
                />
              </div>

              {/* Tabela de Vocação */}
              <div
                style={{
                  background: '#0f0f0f',
                  border: '1px solid #202020',
                  borderRadius: 12,
                  overflow: 'hidden',
                  marginBottom: 18,
                }}
              >
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #202020' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    Tabela de Vocação Operacional por Mês
                  </span>
                  {!vocation.has_cycle_events && (
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 11,
                        color: '#fbbf24',
                        background: '#1a1500',
                        border: '1px solid #3a2e00',
                        borderRadius: 6,
                        padding: '2px 8px',
                      }}
                    >
                      Follow-up e Negociação indisponíveis (sem dados de cycle_events)
                    </span>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #202020' }}>
                        {[
                          { label: 'Mês', align: 'left' },
                          { label: 'Vocação Dominante', align: 'left' },
                          { label: 'Prospecção', align: 'right' },
                          { label: 'Follow-up', align: 'right' },
                          { label: 'Negociação', align: 'right' },
                          { label: 'Fechamento', align: 'right' },
                          { label: 'Confiança', align: 'center' },
                          { label: 'Observação', align: 'left' },
                        ].map((col) => (
                          <th
                            key={col.label}
                            style={{
                              padding: '10px 14px',
                              textAlign: col.align as React.CSSProperties['textAlign'],
                              fontWeight: 600,
                              opacity: 0.6,
                              fontSize: 11,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vocation.rows.map((row: MonthlyVocationalRow) => {
                        const prosp = row.signals.find((s) => s.type === 'prospeccao')!
                        const followup = row.signals.find((s) => s.type === 'followup')!
                        const neg = row.signals.find((s) => s.type === 'negociacao')!
                        const fech = row.signals.find((s) => s.type === 'fechamento')!

                        return (
                          <tr
                            key={row.month}
                            style={{
                              borderBottom: '1px solid #1a1a1a',
                            }}
                          >
                            <td
                              style={{
                                padding: '10px 14px',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {row.month_label}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <VocationBadge
                                vocation={row.dominant_vocation}
                                label={row.dominant_label}
                              />
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <StrengthBar
                                strength={prosp.strength}
                                color="#60a5fa"
                                count={prosp.count}
                              />
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              {vocation.has_cycle_events ? (
                                <StrengthBar
                                  strength={followup.strength}
                                  color="#a78bfa"
                                  count={followup.count}
                                />
                              ) : (
                                <span style={{ opacity: 0.3, fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              {vocation.has_cycle_events ? (
                                <StrengthBar
                                  strength={neg.strength}
                                  color="#fbbf24"
                                  count={neg.count}
                                />
                              ) : (
                                <span style={{ opacity: 0.3, fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <StrengthBar
                                strength={fech.strength}
                                color="#34d399"
                                count={fech.count}
                              />
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <ConfidenceBadge confidence={row.dominant_confidence} />
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                fontSize: 12,
                                opacity: 0.75,
                                maxWidth: 280,
                                lineHeight: 1.4,
                              }}
                            >
                              {row.observation}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Leitura Resumida de Vocação */}
              <div
                style={{
                  background: '#0f0f0f',
                  border: '1px solid #202020',
                  borderRadius: 12,
                  padding: '18px 20px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
                  Leitura Resumida — Vocação por Mês do Ano
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                  {vocation.leitura_resumida.map((frase, idx) => (
                    <li key={idx} style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
                      {frase}
                    </li>
                  ))}
                </ul>

                <div
                  style={{
                    marginTop: 16,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  {[
                    {
                      label: 'Total Prospecções',
                      value: vocation.total_events_prospeccao,
                    },
                    {
                      label: 'Total Follow-ups',
                      value: vocation.has_cycle_events ? vocation.total_events_followup : null,
                    },
                    {
                      label: 'Total Negociações',
                      value: vocation.has_cycle_events ? vocation.total_events_negociacao : null,
                    },
                    {
                      label: 'Total Fechamentos',
                      value: vocation.total_events_fechamento,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        background: '#111',
                        border: '1px solid #1e1e1e',
                        borderRadius: 8,
                        padding: '10px 12px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.5,
                          textTransform: 'uppercase',
                          marginBottom: 4,
                        }}
                      >
                        {item.label}
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        {item.value !== null ? (
                          item.value
                        ) : (
                          <span style={{ opacity: 0.4, fontSize: 12 }}>indisponível</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14, fontSize: 11, opacity: 0.35 }}>
                  Prospecção: <code>sales_cycles.first_worked_at</code>. Fechamento:{' '}
                  <code>sales_cycles.won_at</code> (status=ganho). Follow-up e Negociação:{' '}
                  <code>cycle_events</code> (event_type=stage_changed).
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ==============================================================================
// Sub-components — Vocação Operacional
// ==============================================================================

const VOCATION_COLORS: Record<MonthlyVocationType, string> = {
  prospeccao: '#60a5fa',
  followup: '#a78bfa',
  negociacao: '#fbbf24',
  fechamento: '#34d399',
}

const VOCATION_LABELS_MAP: Record<MonthlyVocationType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
}

function VocationBadge({
  vocation,
  label,
}: {
  vocation: MonthlyVocationType | null
  label: string
}) {
  if (!vocation) {
    return (
      <span
        style={{
          fontSize: 11,
          opacity: 0.4,
          border: '1px solid #333',
          borderRadius: 6,
          padding: '2px 8px',
        }}
      >
        {label}
      </span>
    )
  }
  const color = VOCATION_COLORS[vocation]
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid ${color}44`,
        background: `${color}18`,
        borderRadius: 6,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {VOCATION_LABELS_MAP[vocation]}
    </span>
  )
}

function StrengthBar({
  strength,
  color,
  count,
}: {
  strength: number
  color: string
  count: number
}) {
  const pct = Math.round(strength * 100)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 3,
        minWidth: 80,
      }}
    >
      <span style={{ fontSize: 11, opacity: 0.7 }}>{pct}%</span>
      <div
        style={{
          width: 80,
          height: 6,
          background: '#1e1e1e',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: count === 0 ? '#333' : color,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 10, opacity: 0.4 }}>{count} ev.</span>
    </div>
  )
}

const CONFIDENCE_STYLES: Record<
  MonthlyVocationConfidence,
  { label: string; color: string; bg: string; border: string }
> = {
  alta: { label: 'Alta', color: '#34d399', bg: '#0d2e1e', border: '#1a5c3a' },
  moderada: { label: 'Moderada', color: '#fbbf24', bg: '#1a1200', border: '#3a2e00' },
  baixa: { label: 'Baixa', color: '#f97316', bg: '#1a0e00', border: '#3a2200' },
  insuficiente: { label: 'Insuficiente', color: '#6b7280', bg: '#111', border: '#222' },
}

function ConfidenceBadge({ confidence }: { confidence: MonthlyVocationConfidence }) {
  const s = CONFIDENCE_STYLES[confidence]
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 6,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  )
}

function VocationKpiCard({
  label,
  color,
  row,
  vocType,
  unavailable,
}: {
  label: string
  color: string
  row: MonthlyVocationalRow | null
  vocType: MonthlyVocationType
  unavailable?: boolean
}) {
  const sig = row?.signals.find((s) => s.type === vocType)

  return (
    <div
      style={{
        background: '#0f0f0f',
        border: `1px solid ${row ? color + '44' : '#202020'}`,
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '1 1 200px',
        minWidth: 180,
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.55,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color,
        }}
      >
        {label}
      </div>
      {unavailable ? (
        <div style={{ fontSize: 12, opacity: 0.4 }}>Sem dados de cycle_events</div>
      ) : row ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, color }}>{row.month_label}</div>
          {sig && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {sig.count} evento(s) — {Math.round(sig.strength * 100)}% de força
            </div>
          )}
          <ConfidenceBadge confidence={sig?.confidence ?? 'insuficiente'} />
        </>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>Base insuficiente</div>
      )}
    </div>
  )
}