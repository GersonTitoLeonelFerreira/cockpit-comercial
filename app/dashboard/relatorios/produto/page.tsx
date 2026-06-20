'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getProductPerformance } from '@/app/lib/services/productPerformance'
import { buildProductMixFromPerformance } from '@/app/lib/services/productMix'
import * as faturamentoService from '@/app/lib/services/faturamento'
import type {
  ProductPerformanceRow,
  ProductPerformanceSummary,
} from '@/app/types/productPerformance'
import type {
  ProductMixRow,
  ProductMixSummary,
} from '@/app/types/productMix'

// ==============================================================================
// Helpers
// ==============================================================================

function toBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function toPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

// ==============================================================================
// Types
// ==============================================================================

type SellerOption = {
  id: string
  label: string
}

type MeResponse = {
  user_id?: string
  active_company_id?: string | null
  active_role?: string | null
  is_platform_admin?: boolean
  error?: string
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
        display: 'flex',
        flex: '1 1 200px',
        flexDirection: 'column',
        gap: 6,
        minWidth: 180,
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1,
          opacity: 0.55,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      {name ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{name}</div>
          <div style={{ color: '#e8e8e8', fontSize: 18, fontWeight: 800 }}>
            {value}
          </div>

          {sub ? (
            <div style={{ fontSize: 11, opacity: 0.6 }}>{sub}</div>
          ) : null}
        </>
      ) : (
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.5 }}>
          Base insuficiente
        </div>
      )}
    </div>
  )
}

function SimpleKpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 12,
        display: 'flex',
        flex: '1 1 200px',
        flexDirection: 'column',
        gap: 6,
        minWidth: 180,
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1,
          opacity: 0.55,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div style={{ color: '#e8e8e8', fontSize: 18, fontWeight: 800 }}>
        {value}
      </div>

      {sub ? (
        <div style={{ fontSize: 11, opacity: 0.6 }}>{sub}</div>
      ) : null}
    </div>
  )
}

// ==============================================================================
// Main page
// ==============================================================================

export default function ProdutoRelatorioPg() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [canFilterSellers, setCanFilterSellers] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  const [dateStart, setDateStart] = React.useState(getFirstDayOfMonth())
  const [dateEnd, setDateEnd] = React.useState(getLastDayOfMonth())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  const [summary, setSummary] =
    React.useState<ProductPerformanceSummary | null>(null)

  const [mixSummary, setMixSummary] =
    React.useState<ProductMixSummary | null>(null)

  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function initialize() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/me', {
          cache: 'no-store',
        })

        const me = (await response.json()) as MeResponse

        if (!response.ok) {
          throw new Error(
            me.error ?? 'Não foi possível identificar a empresa ativa.',
          )
        }

        if (!me.user_id) {
          throw new Error('Sessão expirada. Faça login novamente.')
        }

        if (!me.active_company_id) {
          throw new Error('Nenhuma empresa ativa foi selecionada.')
        }

        const activeRole = String(me.active_role ?? '').toLowerCase()

        const canManage =
          me.is_platform_admin === true ||
          activeRole === 'admin' ||
          activeRole === 'manager'

        const sellerRows = await faturamentoService.getSellers(
          supabase,
          me.active_company_id,
        )

        setCompanyId(me.active_company_id)
        setCanFilterSellers(canManage)

        setSellers(
          sellerRows.map((seller) => ({
            id: seller.id,
            label: seller.full_name || seller.email || seller.id,
          })),
        )

        setSelectedSellerId(canManage ? null : me.user_id)
      } catch (cause: unknown) {
        setError(
          getErrorMessage(
            cause,
            'Erro ao carregar a empresa ativa e os vendedores.',
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [supabase])

  React.useEffect(() => {
    if (!companyId) {
      return
    }

    let cancelled = false

    async function loadData() {
      setDataLoading(true)
      setDataError(null)

      try {
        const result = await getProductPerformance({
          companyId,
          ownerId: selectedSellerId,
          dateStart,
          dateEnd,
        })

        if (cancelled) {
          return
        }

        setSummary(result)
        setMixSummary(buildProductMixFromPerformance(result))
      } catch (cause: unknown) {
        if (!cancelled) {
          setDataError(
            getErrorMessage(
              cause,
              'Erro ao buscar os dados de performance por produto.',
            ),
          )
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [companyId, dateEnd, dateStart, selectedSellerId])

  const navLinkBase: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 10,
    color: '#9aa',
    fontSize: 13,
    padding: '8px 12px',
    textDecoration: 'none',
  }

  const navLinkActive: React.CSSProperties = {
    ...navLinkBase,
    background: '#111',
    color: 'white',
  }

  const unlinkedSales =
    summary?.rows.find((row) => row.product_id === null)?.total_ganhos ?? 0

  if (loading) {
    return (
      <div style={{ color: 'white', opacity: 0.7, padding: 40 }}>
        Carregando empresa ativa...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ color: '#ef4444', padding: 40 }}>
        Erro: {error}
      </div>
    )
  }

  return (
    <div style={{ color: 'white', padding: 40, width: '100%' }}>
      <h1 style={{ marginBottom: 8, textAlign: 'center' }}>
        Performance por Produto
      </h1>

      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          margin: '0 auto 20px',
          maxWidth: 680,
          opacity: 0.55,
          textAlign: 'center',
        }}
      >
        Analisa quais produtos sustentam o faturamento, o ticket médio e o
        volume de vendas ganhas no período.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'center',
          marginBottom: 30,
          marginTop: 10,
        }}
      >
        <a href="/relatorios" style={navLinkBase}>
          Relatórios
        </a>

        <a
          href="/dashboard/relatorios/produto"
          style={navLinkActive}
        >
          Performance por Produto
        </a>
      </div>

      <div
        style={{
          alignItems: 'flex-end',
          background: '#0f0f0f',
          border: '1px solid #202020',
          borderRadius: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          margin: '0 auto 28px',
          maxWidth: 980,
          padding: '14px 18px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: 11,
              opacity: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Data Início
          </label>

          <input
            type="date"
            value={dateStart}
            onChange={(event) => setDateStart(event.target.value)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              color: 'white',
              fontSize: 13,
              padding: '8px 10px',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: 11,
              opacity: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Data Fim
          </label>

          <input
            type="date"
            value={dateEnd}
            onChange={(event) => setDateEnd(event.target.value)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              color: 'white',
              fontSize: 13,
              padding: '8px 10px',
            }}
          />
        </div>

        {canFilterSellers ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              style={{
                fontSize: 11,
                opacity: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Consultor
            </label>

            <select
              value={selectedSellerId ?? ''}
              onChange={(event) =>
                setSelectedSellerId(event.target.value || null)
              }
              style={{
                background: '#111',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                minWidth: 200,
                padding: '8px 10px',
              }}
            >
              <option value="">Empresa toda</option>

              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 18,
          margin: '0 auto',
          maxWidth: 980,
        }}
      >
        {dataLoading ? (
          <div style={{ opacity: 0.6, padding: 20 }}>
            Atualizando dados...
          </div>
        ) : null}

        {dataError ? (
          <div style={{ color: '#ef4444', padding: 20 }}>
            Erro: {dataError}
          </div>
        ) : null}

        {!dataLoading && !dataError && summary ? (
          <>
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
                value={
                  summary.melhor_ticket
                    ? toBRL(summary.melhor_ticket.ticket_medio)
                    : '—'
                }
                sub={
                  summary.melhor_ticket
                    ? `${summary.melhor_ticket.total_ganhos} venda(s) ganha(s) · base mínima de 3 vendas`
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
                    ? `${toPercent(
                        summary.melhor_faturamento.pct_faturamento,
                      )} do faturamento`
                    : undefined
                }
              />

              <KpiCard
                label="Maior Volume"
                name={summary.melhor_volume?.product_name ?? null}
                value={
                  summary.melhor_volume
                    ? `${summary.melhor_volume.total_ganhos} venda(s)`
                    : '—'
                }
                sub={
                  summary.melhor_volume
                    ? `${toPercent(summary.melhor_volume.pct_volume)} do volume`
                    : undefined
                }
              />

              <SimpleKpiCard
                label="Ticket Médio Geral"
                value={toBRL(summary.totals.ticket_medio_geral)}
                sub="Faturamento das vendas ganhas ÷ volume de vendas ganhas"
              />
            </div>

            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: 13,
                gap: 24,
                padding: '12px 18px',
              }}
            >
              <div>
                <span style={{ opacity: 0.55 }}>Vendas ganhas: </span>
                <b>{summary.totals.total_ganhos}</b>
              </div>

              <div>
                <span style={{ opacity: 0.55 }}>Faturamento das vendas: </span>
                <b>{toBRL(summary.totals.total_faturamento)}</b>
              </div>

              <div>
                <span style={{ opacity: 0.55 }}>
                  Vendas sem produto vinculado:{' '}
                </span>
                <b style={{ color: unlinkedSales > 0 ? '#fbbf24' : 'inherit' }}>
                  {unlinkedSales}
                </b>
              </div>
            </div>

            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3 style={{ margin: '0 0 14px' }}>
                Resultado por Produto
              </h3>

              {summary.rows.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.6 }}>
                  Nenhuma venda ganha foi encontrada no período.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      borderCollapse: 'collapse',
                      minWidth: 700,
                      width: '100%',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: '1px solid #222',
                          fontSize: 12,
                          opacity: 0.7,
                          textAlign: 'left',
                        }}
                      >
                        <th style={{ padding: '10px 8px' }}>Produto</th>
                        <th
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                          }}
                        >
                          Vendas
                        </th>
                        <th
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                          }}
                        >
                          Faturamento
                        </th>
                        <th
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                          }}
                        >
                          Ticket Médio
                        </th>
                        <th
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                          }}
                        >
                          % Receita
                        </th>
                        <th
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                          }}
                        >
                          % Volume
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {summary.rows.map((row) => (
                        <ProductRow
                          key={row.product_id ?? '__unlinked__'}
                          row={row}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #2a2a2a',
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.6,
                opacity: 0.9,
                padding: '14px 18px',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Critério das métricas
              </div>

              <div>
                O relatório considera vendas com status <b>ganho</b>. A data
                financeira segue a regra oficial do sistema:
                {' '}
                <b>revenue_seller_ref_date → won_at → closed_at</b>.
              </div>

              <div style={{ marginTop: 6 }}>
                Não existe conversão por produto nesta tela, porque o produto
                costuma ser informado somente no fechamento. Exibir essa taxa
                com ciclos abertos e perdidos sem produto seria criar uma
                métrica artificial.
              </div>

              {summary.has_unlinked_sales ? (
                <div style={{ color: '#fbbf24', marginTop: 6 }}>
                  Existem vendas ganhas sem produto vinculado. Elas entram no
                  faturamento geral, mas reduzem a precisão da leitura de mix.
                </div>
              ) : null}
            </div>

            {mixSummary ? (
              <div
                style={{
                  borderTop: '1px solid #1e1e1e',
                  marginTop: 20,
                  paddingTop: 32,
                }}
              >
                <h2 style={{ marginBottom: 20 }}>Mix Comercial</h2>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  <SimpleKpiCard
                    label="Ticket Ponderado"
                    value={toBRL(mixSummary.ticket_medio_ponderado)}
                    sub="Mesmo ticket médio geral das vendas ganhas"
                  />

                  <KpiCard
                    label="Líder Faturamento"
                    name={
                      mixSummary.lider_faturamento?.product_name ?? null
                    }
                    value={
                      mixSummary.lider_faturamento
                        ? toBRL(
                            mixSummary.lider_faturamento.total_faturamento,
                          )
                        : '—'
                    }
                    sub={
                      mixSummary.lider_faturamento
                        ? `${toPercent(
                            mixSummary.lider_faturamento.pct_faturamento,
                          )} do faturamento`
                        : undefined
                    }
                  />

                  <KpiCard
                    label="Líder Volume"
                    name={mixSummary.lider_volume?.product_name ?? null}
                    value={
                      mixSummary.lider_volume
                        ? `${mixSummary.lider_volume.total_ganhos} venda(s)`
                        : '—'
                    }
                    sub={
                      mixSummary.lider_volume
                        ? `${toPercent(
                            mixSummary.lider_volume.pct_volume,
                          )} do volume`
                        : undefined
                    }
                  />

                  <SimpleKpiCard
                    label="Concentração"
                    value={toPercent(mixSummary.top3_pct_faturamento)}
                    sub={`Top 3 produtos · concentração ${mixSummary.concentracao_label.toLowerCase()}`}
                  />
                </div>

                <div
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #202020',
                    borderRadius: 12,
                    marginBottom: 18,
                    padding: 16,
                  }}
                >
                  <h3 style={{ margin: '0 0 14px' }}>
                    Participação no Mix
                  </h3>

                  {mixSummary.rows.length === 0 ? (
                    <div style={{ fontSize: 13, opacity: 0.6 }}>
                      Nenhuma venda ganha foi encontrada no período.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          borderCollapse: 'collapse',
                          minWidth: 820,
                          width: '100%',
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              borderBottom: '1px solid #222',
                              fontSize: 12,
                              opacity: 0.7,
                              textAlign: 'left',
                            }}
                          >
                            <th style={{ padding: '10px 8px' }}>Produto</th>
                            <th
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                              }}
                            >
                              Vendas
                            </th>
                            <th
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                              }}
                            >
                              Faturamento
                            </th>
                            <th
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                              }}
                            >
                              Ticket Médio
                            </th>
                            <th
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                              }}
                            >
                              % Receita
                            </th>
                            <th
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                              }}
                            >
                              % Volume
                            </th>
                            <th
                              style={{
                                padding: '10px 8px',
                                textAlign: 'right',
                              }}
                            >
                              Peso no Mix
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {mixSummary.rows.map((row, index) => (
                            <MixRow
                              key={row.product_id ?? `__unlinked_${index}__`}
                              row={row}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #202020',
                    borderRadius: 12,
                    padding: '16px 18px',
                  }}
                >
                  <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>
                    Resumo do Mix
                  </h3>

                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      margin: '0 0 14px',
                      opacity: 0.9,
                    }}
                  >
                    {mixSummary.diagnostico}
                  </p>

                  <div
                    style={{
                      borderTop: '1px solid #1e1e1e',
                      display: 'flex',
                      flexWrap: 'wrap',
                      fontSize: 13,
                      gap: 20,
                      marginTop: 4,
                      paddingTop: 12,
                    }}
                  >
                    <div>
                      <span style={{ opacity: 0.55 }}>
                        Produtos distintos:{' '}
                      </span>
                      <b>{mixSummary.total_produtos_distintos}</b>
                    </div>

                    <div>
                      <span style={{ opacity: 0.55 }}>
                        Vendas sem produto vinculado:{' '}
                      </span>
                      <b
                        style={{
                          color: mixSummary.has_unlinked_sales
                            ? '#fbbf24'
                            : 'inherit',
                        }}
                      >
                        {mixSummary.has_unlinked_sales ? 'Sim' : 'Não'}
                      </b>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

function ProductRow({
  row,
}: {
  row: ProductPerformanceRow
}) {
  const isUnlinked = row.product_id === null

  return (
    <tr
      style={{
        borderBottom: '1px solid #1a1a1a',
        opacity: isUnlinked ? 0.7 : 1,
      }}
    >
      <td style={{ padding: '10px 8px' }}>
        <div style={{ fontSize: 13, fontWeight: isUnlinked ? 400 : 600 }}>
          {row.product_name}
        </div>

        {row.product_category && !isUnlinked ? (
          <div style={{ fontSize: 11, opacity: 0.5 }}>
            {row.product_category}
          </div>
        ) : null}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {row.total_ganhos}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.total_faturamento)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.ticket_medio)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_faturamento)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_volume)}
      </td>
    </tr>
  )
}

function MixRow({
  row,
}: {
  row: ProductMixRow
}) {
  const isUnlinked = row.product_id === null
  const isDominant = row.peso_mix > 0.3

  return (
    <tr
      style={{
        background:
          isDominant && !isUnlinked
            ? 'rgba(255,255,255,0.03)'
            : 'transparent',
        borderBottom: '1px solid #1a1a1a',
        opacity: isUnlinked ? 0.6 : 1,
      }}
    >
      <td style={{ padding: '10px 8px' }}>
        <div style={{ fontSize: 13, fontWeight: isUnlinked ? 400 : 600 }}>
          {row.product_name}

          {isDominant && !isUnlinked ? (
            <span
              style={{
                background: '#1e3a1e',
                borderRadius: 4,
                color: '#4ade80',
                fontSize: 10,
                fontWeight: 500,
                marginLeft: 6,
                padding: '2px 6px',
              }}
            >
              dominante
            </span>
          ) : null}
        </div>

        {row.product_category && !isUnlinked ? (
          <div style={{ fontSize: 11, opacity: 0.5 }}>
            {row.product_category}
          </div>
        ) : null}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {row.total_ganhos}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.total_faturamento)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.ticket_medio)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_faturamento)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_volume)}
      </td>

      <td
        style={{
          fontSize: 13,
          padding: '10px 8px',
          textAlign: 'right',
        }}
      >
        <span
          style={{
            color: isDominant ? '#4ade80' : 'inherit',
            fontWeight: isDominant ? 700 : 400,
          }}
        >
          {toPercent(row.peso_mix)}
        </span>
      </td>
    </tr>
  )
}