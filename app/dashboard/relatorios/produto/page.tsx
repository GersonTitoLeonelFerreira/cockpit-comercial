'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getProductPerformance } from '@/app/lib/services/productPerformance'
import type {
  ProductPerformanceSummary,
  ProductPerformanceRow,
} from '@/app/types/productPerformance'

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

export default function ProdutoRelatorioPg() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // User/profile state
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters
  const [dateStart, setDateStart] = React.useState(getFirstDayOfMonth())
  const [dateEnd, setDateEnd] = React.useState(getLastDayOfMonth())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  // Data
  const [summary, setSummary] = React.useState<ProductPerformanceSummary | null>(null)
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
        setCurrentUserId(uid)

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
            (sellersData ?? []).map((s: any) => ({
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
        const result = await getProductPerformance({
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

  const hasUnreliableConversion =
    summary?.rows.some((r) => r.product_id !== null && !r.conversao_confiavel) ?? false

  return (
    <div style={{ width: '100%', padding: 40, color: 'white' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Performance por Produto</h1>

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
        <a href="/relatorios" style={navLinkBase}>
          Relatórios
        </a>
        <a href="/dashboard/relatorios/ia" style={navLinkBase}>
          Relatório IA
        </a>
        <a href="/dashboard/relatorios/produto" style={navLinkActive}>
          Performance por Produto
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
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <KpiCard
                label="Maior Ticket Médio"
                name={summary.melhor_ticket?.product_name ?? null}
                value={summary.melhor_ticket ? toBRL(summary.melhor_ticket.ticket_medio) : '—'}
                sub={
                  summary.melhor_ticket
                    ? `${summary.melhor_ticket.total_ganhos} ganho(s)`
                    : undefined
                }
              />
              <KpiCard
                label="Maior Faturamento"
                name={summary.melhor_faturamento?.product_name ?? null}
                value={
                  summary.melhor_faturamento
                    ? toBRL(summary.melhor_faturamento.total_faturamento)
                    : '—'
                }
                sub={
                  summary.melhor_faturamento
                    ? `${toPercent(summary.melhor_faturamento.pct_faturamento)} do total`
                    : undefined
                }
              />
              <KpiCard
                label="Maior Volume"
                name={summary.melhor_volume?.product_name ?? null}
                value={
                  summary.melhor_volume
                    ? `${summary.melhor_volume.total_ganhos} ganhos`
                    : '—'
                }
                sub={
                  summary.melhor_volume
                    ? `${toPercent(summary.melhor_volume.pct_volume)} do volume`
                    : undefined
                }
              />
              <KpiCard
                label="Melhor Conversão"
                name={summary.melhor_conversao?.product_name ?? null}
                value={
                  summary.melhor_conversao
                    ? toPercent(summary.melhor_conversao.conversao_produto)
                    : '—'
                }
                sub={
                  summary.melhor_conversao
                    ? `${summary.melhor_conversao.total_ciclos_produto} ciclos com produto`
                    : undefined
                }
              />
            </div>

            {/* Totals summary */}
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                padding: '12px 18px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 24,
                fontSize: 13,
              }}
            >
              <div>
                <span style={{ opacity: 0.55 }}>Total de ganhos: </span>
                <b>{summary.totals.total_ganhos}</b>
              </div>
              <div>
                <span style={{ opacity: 0.55 }}>Faturamento total: </span>
                <b>{toBRL(summary.totals.total_faturamento)}</b>
              </div>
              <div>
                <span style={{ opacity: 0.55 }}>Ticket médio geral: </span>
                <b>{toBRL(summary.totals.ticket_medio_geral)}</b>
              </div>
            </div>

            {/* BLOCO B — Tabela de Performance */}
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3 style={{ margin: '0 0 14px' }}>Performance por Produto</h3>

              {summary.rows.length === 0 ? (
                <div style={{ opacity: 0.6, fontSize: 13 }}>
                  Nenhuma venda encontrada no período.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                    <thead>
                      <tr
                        style={{
                          textAlign: 'left',
                          borderBottom: '1px solid #222',
                          fontSize: 12,
                          opacity: 0.7,
                        }}
                      >
                        <th style={{ padding: '10px 8px' }}>Produto</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Ganhos</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Faturamento</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Ticket Médio</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Conversão</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>% Fat.</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>% Vol.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <ProductRow key={row.product_id ?? '__unlinked__'} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* BLOCO C — Aviso de limitação da conversão */}
            {(hasUnreliableConversion || summary.has_unlinked_sales) && (
              <div
                style={{
                  background: '#0f0f0f',
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  padding: '14px 18px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  opacity: 0.85,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Nota sobre as métricas
                </div>
                {hasUnreliableConversion && (
                  <div style={{ marginBottom: 6 }}>
                    <b>Conversão por produto (base limitada):</b> O produto só é vinculado
                    no momento do fechamento da venda. Ciclos perdidos ou em andamento
                    normalmente não têm produto registrado. Por isso, a conversão aqui
                    representa a distribuição de produtos nos ganhos, não uma conversão real
                    de funil. Conversões marcadas com "—" têm menos de 5 ciclos registrados
                    com esse produto — base insuficiente para ser confiável.
                  </div>
                )}
                {summary.has_unlinked_sales && (
                  <div>
                    <b>Vendas sem produto vinculado:</b> Existem ganhos sem produto
                    registrado no período. Eles aparecem como "Sem produto vinculado" na
                    tabela. Para melhorar a qualidade dos dados, vincule o produto ao
                    registrar uma venda ganha.
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

// ==============================================================================
// ProductRow sub-component
// ==============================================================================

function ProductRow({ row }: { row: ProductPerformanceRow }) {
  const isUnlinked = row.product_id === null

  return (
    <tr
      style={{
        borderBottom: '1px solid #1a1a1a',
        opacity: isUnlinked ? 0.7 : 1,
      }}
    >
      <td style={{ padding: '10px 8px' }}>
        <div style={{ fontWeight: isUnlinked ? 400 : 600, fontSize: 13 }}>
          {row.product_name}
        </div>
        {row.product_category && !isUnlinked && (
          <div style={{ fontSize: 11, opacity: 0.5 }}>{row.product_category}</div>
        )}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>
        {row.total_ganhos}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>
        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          row.total_faturamento
        )}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>
        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          row.ticket_medio
        )}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>
        {isUnlinked ? (
          <span style={{ opacity: 0.4 }}>—</span>
        ) : row.conversao_confiavel ? (
          <span>{(row.conversao_produto * 100).toFixed(1)}%</span>
        ) : (
          <span
            title={`Base insuficiente (${row.total_ciclos_produto} ciclo(s) com produto). Mínimo: 5.`}
            style={{ opacity: 0.45, cursor: 'help' }}
          >
            —
          </span>
        )}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>
        {(row.pct_faturamento * 100).toFixed(1)}%
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13 }}>
        {(row.pct_volume * 100).toFixed(1)}%
      </td>
    </tr>
  )
}
