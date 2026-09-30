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
// Design system
// ==============================================================================

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

  blue: '#3b82f6',
  blueLight: '#60a5fa',
  blueSoft: '#93c5fd',

  green: '#22c55e',
  greenSoft: '#86efac',

  yellow: '#f59e0b',
  yellowSoft: '#fef3c7',

  red: '#ef4444',
  redSoft: '#fca5a5',

  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

const REPORT_LINKS = [
  {
    label: 'Performance por Produto',
    href: '/dashboard/relatorios/produto',
    active: true,
  },
  {
    label: 'Dia da Semana',
    href: '/dashboard/relatorios/dia-semana',
    active: false,
  },
  {
    label: 'Semana do Mês',
    href: '/dashboard/relatorios/semana-mes',
    active: false,
  },
  {
    label: 'Sazonalidade Mensal',
    href: '/dashboard/relatorios/sazonalidade-mensal',
    active: false,
  },
]

// ==============================================================================
// Helpers
// ==============================================================================

function toBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    boxShadow: DS.shadowCard,
  }
}

const fieldLabelStyle: React.CSSProperties = {
  color: DS.textLabel,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  background: DS.surfaceBg,
  border: `1px solid ${DS.border}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  fontSize: 13,
  height: 38,
  outline: 'none',
  padding: '0 11px',
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
// Components
// ==============================================================================

function SectionLabel({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        color: DS.blueSoft,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        marginBottom: 12,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function MetricCard({
  label,
  value,
  description,
  accent = DS.blueSoft,
}: {
  label: string
  value: string
  description: string
  accent?: string
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        display: 'flex',
        flex: '1 1 200px',
        flexDirection: 'column',
        minHeight: 126,
        padding: '17px 18px',
      }}
    >
      <div
        style={{
          color: DS.textLabel,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: accent,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: '-0.025em',
          lineHeight: 1,
          marginTop: 12,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          lineHeight: 1.45,
          marginTop: 'auto',
          paddingTop: 10,
        }}
      >
        {description}
      </div>
    </div>
  )
}

function HighlightCard({
  label,
  name,
  value,
  description,
  accent = DS.blueSoft,
}: {
  label: string
  name: string | null
  value: string
  description?: string
  accent?: string
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        display: 'flex',
        flex: '1 1 220px',
        flexDirection: 'column',
        minHeight: 136,
        padding: '17px 18px',
      }}
    >
      <div
        style={{
          color: DS.textLabel,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      {name ? (
        <>
          <div
            style={{
              color: DS.textPrimary,
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1.3,
              marginTop: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={name}
          >
            {name}
          </div>

          <div
            style={{
              color: accent,
              fontSize: 21,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              marginTop: 7,
            }}
          >
            {value}
          </div>

          {description ? (
            <div
              style={{
                color: DS.textSecondary,
                fontSize: 11,
                lineHeight: 1.4,
                marginTop: 'auto',
                paddingTop: 8,
              }}
            >
              {description}
            </div>
          ) : null}
        </>
      ) : (
        <div
          style={{
            color: DS.textMuted,
            fontSize: 13,
            marginTop: 16,
          }}
        >
          Base insuficiente
        </div>
      )}
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
        background: isUnlinked ? 'rgba(245,158,11,0.025)' : 'transparent',
        borderBottom: `1px solid ${DS.borderSubtle}`,
      }}
    >
      <td style={{ padding: '14px 18px' }}>
        <div
          style={{
            color: isUnlinked ? DS.yellowSoft : DS.textPrimary,
            fontSize: 13,
            fontWeight: isUnlinked ? 600 : 800,
          }}
        >
          {row.product_name}
        </div>

        {row.product_category && !isUnlinked ? (
          <div
            style={{
              color: DS.textMuted,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            {row.product_category}
          </div>
        ) : null}
      </td>

      <td
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          fontWeight: 700,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {row.total_ganhos}
      </td>

      <td
        style={{
          color: DS.greenSoft,
          fontSize: 13,
          fontWeight: 800,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.total_faturamento)}
      </td>

      <td
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.ticket_medio)}
      </td>

      <td
        style={{
          color: DS.textSecondary,
          fontSize: 13,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_faturamento)}
      </td>

      <td
        style={{
          color: DS.textSecondary,
          fontSize: 13,
          padding: '14px 18px',
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
            ? 'rgba(59,130,246,0.055)'
            : isUnlinked
              ? 'rgba(245,158,11,0.025)'
              : 'transparent',
        borderBottom: `1px solid ${DS.borderSubtle}`,
      }}
    >
      <td style={{ padding: '14px 18px' }}>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 7,
          }}
        >
          <span
            style={{
              color: isUnlinked ? DS.yellowSoft : DS.textPrimary,
              fontSize: 13,
              fontWeight: isUnlinked ? 600 : 800,
            }}
          >
            {row.product_name}
          </span>

          {isDominant && !isUnlinked ? (
            <span
              style={{
                background: 'rgba(59,130,246,0.13)',
                border: '1px solid rgba(96,165,250,0.25)',
                borderRadius: 4,
                color: DS.blueSoft,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.04em',
                padding: '3px 6px',
                textTransform: 'uppercase',
              }}
            >
              dominante
            </span>
          ) : null}
        </div>

        {row.product_category && !isUnlinked ? (
          <div
            style={{
              color: DS.textMuted,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            {row.product_category}
          </div>
        ) : null}
      </td>

      <td
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          fontWeight: 700,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {row.total_ganhos}
      </td>

      <td
        style={{
          color: DS.greenSoft,
          fontSize: 13,
          fontWeight: 800,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.total_faturamento)}
      </td>

      <td
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toBRL(row.ticket_medio)}
      </td>

      <td
        style={{
          color: DS.textSecondary,
          fontSize: 13,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_faturamento)}
      </td>

      <td
        style={{
          color: DS.textSecondary,
          fontSize: 13,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.pct_volume)}
      </td>

      <td
        style={{
          color: isDominant ? DS.blueSoft : DS.textSecondary,
          fontSize: 13,
          fontWeight: isDominant ? 800 : 600,
          padding: '14px 18px',
          textAlign: 'right',
        }}
      >
        {toPercent(row.peso_mix)}
      </td>
    </tr>
  )
}

// ==============================================================================
// Main page
// ==============================================================================

export default function ProdutoRelatorioPg() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [pageError, setPageError] = React.useState<string | null>(null)

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
      setPageError(null)

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

        const currentUserId = me.user_id
        const activeCompanyId = me.active_company_id

        if (!currentUserId) {
          throw new Error('Sessão expirada. Faça login novamente.')
        }

        if (!activeCompanyId) {
          throw new Error('Nenhuma empresa ativa foi selecionada.')
        }

        const activeRole = String(me.active_role ?? '').toLowerCase()

        const canManage =
          me.is_platform_admin === true ||
          activeRole === 'admin' ||
          activeRole === 'manager'

        const sellerRows = await faturamentoService.getSellers(
          supabase,
          activeCompanyId,
        )

        setCompanyId(activeCompanyId)
        setCanFilterSellers(canManage)

        setSellers(
          sellerRows.map((seller) => ({
            id: seller.id,
            label: seller.full_name || seller.email || seller.id,
          })),
        )

        setSelectedSellerId(canManage ? null : currentUserId)
      } catch (cause: unknown) {
        setPageError(
          getErrorMessage(
            cause,
            'Erro ao carregar a empresa ativa e os consultores.',
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

    const activeCompanyId = companyId
    let cancelled = false

    async function loadData() {
      setDataLoading(true)
      setDataError(null)

      try {
        const result = await getProductPerformance({
          companyId: activeCompanyId,
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

  const unlinkedSales =
    summary?.rows.find((row) => row.product_id === null)?.total_ganhos ?? 0

  if (loading) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        Carregando Performance por Produto...
      </div>
    )
  }

  if (pageError) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div
          style={{
            ...cardStyle(),
            maxWidth: 460,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <strong style={{ color: DS.redSoft }}>
            Não foi possível carregar o relatório.
          </strong>

          <div style={{ fontSize: 13, marginTop: 8 }}>
            {pageError}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100vh',
        padding: '32px 24px 80px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a
          href="/relatorios"
          style={{
            color: DS.textSecondary,
            display: 'inline-flex',
            fontSize: 13,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 10,
              marginBottom: 7,
            }}
          >
            <span
              style={{
                color: DS.blueLight,
                fontSize: 19,
                lineHeight: 1,
              }}
            >
              ◫
            </span>

            <h1
              style={{
                fontSize: 23,
                fontWeight: 850,
                letterSpacing: '-0.015em',
                margin: 0,
              }}
            >
              Performance por Produto
            </h1>
          </div>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              maxWidth: 760,
            }}
          >
            Leitura comercial dos produtos que sustentam faturamento, ticket
            médio e volume de vendas ganhas no período.
          </p>
        </header>

        <nav
          style={{
            borderBottom: `1px solid ${DS.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: 28,
          }}
        >
          {REPORT_LINKS.map((item) =>
            item.active ? (
              <span
                key={item.href}
                style={{
                  borderBottom: `2px solid ${DS.blueLight}`,
                  color: DS.blueLight,
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: -1,
                  padding: '9px 14px',
                }}
              >
                {item.label}
              </span>
            ) : (
              <a
                key={item.href}
                href={item.href}
                style={{
                  borderBottom: '2px solid transparent',
                  color: DS.textSecondary,
                  fontSize: 13,
                  marginBottom: -1,
                  padding: '9px 14px',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </a>
            ),
          )}
        </nav>

        <section
          style={{
            ...cardStyle(),
            alignItems: 'flex-end',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
            padding: '16px 20px',
          }}
        >
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>De</span>

            <input
              type="date"
              value={dateStart}
              onChange={(event) => setDateStart(event.target.value)}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Até</span>

            <input
              type="date"
              value={dateEnd}
              onChange={(event) => setDateEnd(event.target.value)}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </label>

          {canFilterSellers ? (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={fieldLabelStyle}>Consultor</span>

              <select
                value={selectedSellerId ?? ''}
                onChange={(event) =>
                  setSelectedSellerId(event.target.value || null)
                }
                style={{
                  ...inputStyle,
                  minWidth: 225,
                }}
              >
                <option value="">Empresa toda</option>

                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div
            style={{
              color: dataLoading ? DS.blueSoft : DS.textMuted,
              fontSize: 12,
              fontWeight: 700,
              marginLeft: 'auto',
              paddingBottom: 10,
            }}
          >
            {dataLoading ? 'Atualizando dados...' : 'Dados atualizados automaticamente'}
          </div>
        </section>

        {dataError ? (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {dataError}
          </div>
        ) : null}

        {dataLoading && !summary ? (
          <div
            style={{
              ...cardStyle(),
              color: DS.textSecondary,
              fontSize: 13,
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            Carregando resultado comercial...
          </div>
        ) : null}

        {summary ? (
          <>
            <section style={{ marginBottom: 28 }}>
              <SectionLabel>Resultado Consolidado</SectionLabel>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                }}
              >
                <MetricCard
                  label="Faturamento das Vendas"
                  value={toBRL(summary.totals.total_faturamento)}
                  description="Soma das vendas ganhas no período."
                  accent={DS.greenSoft}
                />

                <MetricCard
                  label="Vendas Ganhas"
                  value={String(summary.totals.total_ganhos)}
                  description="Ciclos efetivamente fechados como ganho."
                  accent={DS.greenSoft}
                />

                <MetricCard
                  label="Ticket Médio"
                  value={toBRL(summary.totals.ticket_medio_geral)}
                  description="Faturamento das vendas dividido pelo volume ganho."
                  accent={DS.blueSoft}
                />

                <MetricCard
                  label="Produtos no Mix"
                  value={String(
                    summary.rows.filter((row) => row.product_id !== null).length,
                  )}
                  description={
                    unlinkedSales > 0
                      ? `${unlinkedSales} venda(s) ainda sem produto vinculado.`
                      : 'Todas as vendas possuem produto vinculado.'
                  }
                  accent={unlinkedSales > 0 ? DS.yellowSoft : DS.blueSoft}
                />
              </div>
            </section>

            <section style={{ marginBottom: 28 }}>
              <SectionLabel>Destaques por Produto</SectionLabel>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                }}
              >
                <HighlightCard
                  label="Maior Faturamento"
                  name={summary.melhor_faturamento?.product_name ?? null}
                  value={
                    summary.melhor_faturamento
                      ? toBRL(summary.melhor_faturamento.total_faturamento)
                      : '—'
                  }
                  description={
                    summary.melhor_faturamento
                      ? `${toPercent(summary.melhor_faturamento.pct_faturamento)} da receita das vendas`
                      : undefined
                  }
                  accent={DS.greenSoft}
                />

                <HighlightCard
                  label="Maior Volume"
                  name={summary.melhor_volume?.product_name ?? null}
                  value={
                    summary.melhor_volume
                      ? `${summary.melhor_volume.total_ganhos} venda(s)`
                      : '—'
                  }
                  description={
                    summary.melhor_volume
                      ? `${toPercent(summary.melhor_volume.pct_volume)} do volume ganho`
                      : undefined
                  }
                  accent={DS.blueSoft}
                />

                <HighlightCard
                  label="Maior Ticket Médio"
                  name={summary.melhor_ticket?.product_name ?? null}
                  value={
                    summary.melhor_ticket
                      ? toBRL(summary.melhor_ticket.ticket_medio)
                      : '—'
                  }
                  description={
                    summary.melhor_ticket
                      ? `Base de ${summary.melhor_ticket.total_ganhos} venda(s) ganha(s)`
                      : undefined
                  }
                  accent={DS.blueSoft}
                />
              </div>
            </section>

            <section
              style={{
                ...cardStyle(),
                marginBottom: 20,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  alignItems: 'flex-start',
                  borderBottom: `1px solid ${DS.border}`,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  justifyContent: 'space-between',
                  padding: '18px 20px',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 850,
                      margin: 0,
                    }}
                  >
                    Resultado por Produto
                  </h2>

                  <p
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.5,
                      margin: '6px 0 0',
                    }}
                  >
                    Participação de cada produto no faturamento e no volume de
                    vendas ganhas.
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.17)',
                    borderRadius: 6,
                    color: DS.greenSoft,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '6px 9px',
                  }}
                >
                  Base oficial de vendas
                </div>
              </div>

              {summary.rows.length === 0 ? (
                <div
                  style={{
                    color: DS.textSecondary,
                    fontSize: 13,
                    padding: '38px 20px',
                    textAlign: 'center',
                  }}
                >
                  Nenhuma venda ganha foi encontrada no período selecionado.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      borderCollapse: 'collapse',
                      minWidth: 760,
                      width: '100%',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#0f1118',
                          color: DS.textMuted,
                          fontSize: 10,
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <th style={{ padding: '12px 18px', textAlign: 'left' }}>
                          Produto
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Vendas
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Faturamento
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Ticket Médio
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          % Receita
                        </th>

                        <th style={{ padding: '12px 18px', textAlign: 'right' }}>
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
            </section>

            <section
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusContainer,
                marginBottom: 34,
                padding: '16px 18px',
              }}
            >
              <div
                style={{
                  color: DS.blueSoft,
                  fontSize: 12,
                  fontWeight: 850,
                  marginBottom: 7,
                }}
              >
                Critério de leitura
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.65,
                }}
              >
                O relatório considera apenas ciclos fechados como{' '}
                <strong style={{ color: DS.textPrimary }}>ganho</strong>. A
                receita é conciliada com a mesma base da Gestão de Faturamento e
                respeita a data financeira oficial:{' '}
                <strong style={{ color: DS.textPrimary }}>
                  revenue_seller_ref_date → won_at → closed_at
                </strong>
                .
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.65,
                  marginTop: 6,
                }}
              >
                Conversão por produto não é exibida porque o produto é
                normalmente informado apenas no fechamento. Criar esse
                percentual usando ciclos abertos e perdidos sem produto
                vinculado seria uma métrica artificial.
              </div>

              {summary.has_unlinked_sales ? (
                <div
                  style={{
                    color: DS.yellowSoft,
                    fontSize: 12,
                    lineHeight: 1.6,
                    marginTop: 9,
                  }}
                >
                  Atenção: existe faturamento sem produto vinculado, incluindo
                  possíveis ajustes de conciliação. Esse valor entra no total,
                  mas não é atribuído artificialmente a um produto.
                </div>
              ) : null}
            </section>

            {mixSummary ? (
              <section>
                <SectionLabel>Mix Comercial</SectionLabel>

                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    marginBottom: 20,
                  }}
                >
                  <MetricCard
                    label="Ticket Ponderado"
                    value={toBRL(mixSummary.ticket_medio_ponderado)}
                    description="Mesmo ticket médio geral das vendas ganhas."
                    accent={DS.blueSoft}
                  />

                  <MetricCard
                    label="Concentração do Mix"
                    value={toPercent(mixSummary.top3_pct_faturamento)}
                    description={`Top 3 produtos · concentração ${mixSummary.concentracao_label.toLowerCase()}.`}
                    accent={DS.blueSoft}
                  />

                  <MetricCard
                    label="Produtos Distintos"
                    value={String(mixSummary.total_produtos_distintos)}
                    description="Produtos efetivamente vendidos no período."
                    accent={DS.blueSoft}
                  />

                  <MetricCard
                    label="Qualidade do Cadastro"
                    value={
                      mixSummary.has_unlinked_sales
                        ? 'Atenção'
                        : 'Completo'
                    }
                    description={
                      mixSummary.has_unlinked_sales
                        ? 'Existem vendas sem produto vinculado.'
                        : 'Todas as vendas possuem produto vinculado.'
                    }
                    accent={
                      mixSummary.has_unlinked_sales
                        ? DS.yellowSoft
                        : DS.greenSoft
                    }
                  />
                </div>

                <section
                  style={{
                    ...cardStyle(),
                    marginBottom: 18,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      borderBottom: `1px solid ${DS.border}`,
                      padding: '18px 20px',
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 16,
                        fontWeight: 850,
                        margin: 0,
                      }}
                    >
                      Participação no Mix
                    </h2>

                    <p
                      style={{
                        color: DS.textSecondary,
                        fontSize: 12,
                        lineHeight: 1.5,
                        margin: '6px 0 0',
                      }}
                    >
                      Leitura da concentração de receita e volume entre os
                      produtos vendidos.
                    </p>
                  </div>

                  {mixSummary.rows.length === 0 ? (
                    <div
                      style={{
                        color: DS.textSecondary,
                        fontSize: 13,
                        padding: '38px 20px',
                        textAlign: 'center',
                      }}
                    >
                      Nenhuma venda ganha foi encontrada no período selecionado.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          borderCollapse: 'collapse',
                          minWidth: 900,
                          width: '100%',
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: '#0f1118',
                              color: DS.textMuted,
                              fontSize: 10,
                              letterSpacing: '0.07em',
                              textTransform: 'uppercase',
                            }}
                          >
                            <th
                              style={{
                                padding: '12px 18px',
                                textAlign: 'left',
                              }}
                            >
                              Produto
                            </th>

                            <th style={{ padding: '12px', textAlign: 'right' }}>
                              Vendas
                            </th>

                            <th style={{ padding: '12px', textAlign: 'right' }}>
                              Faturamento
                            </th>

                            <th style={{ padding: '12px', textAlign: 'right' }}>
                              Ticket Médio
                            </th>

                            <th style={{ padding: '12px', textAlign: 'right' }}>
                              % Receita
                            </th>

                            <th style={{ padding: '12px', textAlign: 'right' }}>
                              % Volume
                            </th>

                            <th
                              style={{
                                padding: '12px 18px',
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
                              key={row.product_id ?? `__unlinked_${index}`}
                              row={row}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section
                  style={{
                    ...cardStyle(),
                    padding: '18px 20px',
                  }}
                >
                  <div
                    style={{
                      color: DS.textPrimary,
                      fontSize: 15,
                      fontWeight: 850,
                      marginBottom: 10,
                    }}
                  >
                    Resumo do Mix
                  </div>

                  <p
                    style={{
                      color: DS.textSecondary,
                      fontSize: 13,
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    {mixSummary.diagnostico}
                  </p>
                </section>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
