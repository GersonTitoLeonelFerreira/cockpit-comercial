'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getWeekdayPerformance } from '@/app/lib/services/weekdayPerformance'
import type {
  WeekdayPerformanceSummary,
  WeekdayPerformanceRow,
} from '@/app/types/weekdayPerformance'

// ==============================================================================
// Helpers
// ==============================================================================

function toBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function toPercent(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + '%'
}

function getFirstDayOfMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function getLastDayOfMonth(): string {
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
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

export default function DiaSemanaRelatorioPg() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // User/profile state
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters
  const [dateStart, setDateStart] = React.useState(getFirstDayOfMonth())
  const [dateEnd, setDateEnd] = React.useState(getLastDayOfMonth())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  // Data
  const [summary, setSummary] = React.useState<WeekdayPerformanceSummary | null>(null)
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

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
          setSelectedSellerId(null) // empresa toda por padrão
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

  // Load data when filters or profile are ready
  React.useEffect(() => {
    if (!companyId) return

    async function load() {
      setDataLoading(true)
      setDataError(null)
      try {
        const result = await getWeekdayPerformance({
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

  const bestFaturamentoDia = summary?.melhor_dia_faturamento
  const anyInsuficiente =
    summary?.rows.some((r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho) ?? false

  return (
    <div style={{ width: '100%', padding: 40, color: 'white' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Sazonalidade por Dia da Semana</h1>

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
          style={navLinkActive}
          title="Sazonalidade por dia da semana"
        >
          Dia da Semana
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
                label="Melhor dia p/ Ganhos"
                name={summary.melhor_dia_ganhos?.weekday_label ?? null}
                value={
                  summary.melhor_dia_ganhos
                    ? `${summary.melhor_dia_ganhos.ganhos} ganho(s)`
                    : '—'
                }
              />
              <KpiCard
                label="Melhor dia p/ Faturamento"
                name={summary.melhor_dia_faturamento?.weekday_label ?? null}
                value={
                  summary.melhor_dia_faturamento
                    ? toBRL(summary.melhor_dia_faturamento.faturamento)
                    : '—'
                }
              />
              <KpiCard
                label="Melhor dia p/ Ticket Médio"
                name={summary.melhor_dia_ticket?.weekday_label ?? null}
                value={
                  summary.melhor_dia_ticket
                    ? toBRL(summary.melhor_dia_ticket.ticket_medio)
                    : '—'
                }
                sub={summary.melhor_dia_ticket ? undefined : 'Base insuficiente em todos os dias'}
              />
              <KpiCard
                label="Dia mais forte em trabalho"
                name={summary.melhor_dia_trabalho?.weekday_label ?? null}
                value={
                  summary.melhor_dia_trabalho
                    ? `${summary.melhor_dia_trabalho.leads_trabalhados} lead(s)`
                    : '—'
                }
              />
            </div>

            {/* BLOCO B — Tabela por Dia da Semana */}
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #202020' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Desempenho por Dia da Semana</span>
                <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 10 }}>
                  leads_trabalhados via first_worked_at (operação real)
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
                        'Dia da Semana',
                        'Leads Trabalhados',
                        'Ganhos',
                        'Perdidos',
                        'Faturamento',
                        'Ticket Médio',
                        'Taxa de Ganho',
                      ].map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: '10px 14px',
                            textAlign: col === 'Dia da Semana' ? 'left' : 'right',
                            fontWeight: 600,
                            opacity: 0.6,
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row: WeekdayPerformanceRow) => {
                      const isBestFaturamento =
                        bestFaturamentoDia?.weekday === row.weekday &&
                        row.faturamento > 0
                      const isZeroActivity = row.leads_trabalhados === 0 && row.ganhos === 0
                      const isLowBase =
                        row.leads_trabalhados > 0 && !row.base_suficiente_trabalho

                      return (
                        <tr
                          key={row.weekday}
                          style={{
                            borderBottom: '1px solid #1a1a1a',
                            borderLeft: isBestFaturamento ? '3px solid #22c55e' : '3px solid transparent',
                            opacity: isZeroActivity ? 0.4 : 1,
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                            {row.weekday_label}
                            {isLowBase ? (
                              <span style={{ marginLeft: 6, fontSize: 12 }} title="Base insuficiente para taxa de ganho">
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
                              : row.ganhos > 0
                              ? '—'
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {row.base_suficiente_trabalho
                              ? toPercent(row.taxa_ganho)
                              : row.leads_trabalhados > 0
                              ? 'Base insuf.'
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BLOCO C — Resumo / Diagnóstico */}
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
              <div style={{ fontWeight: 600, fontSize: 14 }}>Resumo do Período</div>

              {/* Diagnostic text */}
              <div
                style={{
                  background: '#111',
                  border: '1px solid #1e1e1e',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  opacity: 0.9,
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
                  { label: 'Semanas no período', value: `${summary.semanas_no_periodo}` },
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
                    <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
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
                  ⚠️ Alguns dias da semana têm menos de 10 leads trabalhados. A taxa de ganho
                  para esses dias é indicada como &quot;Base insuf.&quot; e não deve ser usada como
                  referência. Amplie o período de análise para obter leituras mais confiáveis.
                </div>
              )}

              <div style={{ fontSize: 11, opacity: 0.35 }}>
                Fonte leads trabalhados: <code>sales_cycles.first_worked_at</code> (somente eventos de trabalho comercial real — exclui ações administrativas).
                Fonte perdidos: <code>sales_cycles.lost_at</code> quando disponível, <code>updated_at</code> como proxy caso contrário.
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
