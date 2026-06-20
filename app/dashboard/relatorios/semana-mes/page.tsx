'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getMonthWeekPerformance } from '@/app/lib/services/monthWeekPerformance'
import * as faturamentoService from '@/app/lib/services/faturamento'
import type {
  MonthWeekPerformanceRow,
  MonthWeekPerformanceSummary,
} from '@/app/types/monthWeekPerformance'

// ==============================================================================
// Design system
// ==============================================================================

const DS = {
  contentBg: '#090b0f',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

  blueLight: '#60a5fa',
  blueSoft: '#93c5fd',

  greenSoft: '#86efac',

  yellowSoft: '#fef3c7',

  redSoft: '#fca5a5',

  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

const REPORT_LINKS = [
  {
    label: 'Performance por Produto',
    href: '/dashboard/relatorios/produto',
    active: false,
  },
  {
    label: 'Dia da Semana',
    href: '/dashboard/relatorios/dia-semana',
    active: false,
  },
  {
    label: 'Semana do Mês',
    href: '/dashboard/relatorios/semana-mes',
    active: true,
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

function getFirstDayOfCurrentYear(): string {
  return `${new Date().getFullYear()}-01-01`
}

function getTodayDate(): string {
  const now = new Date()

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
            }}
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

function WeekRow({
  row,
  bestRevenueWeek,
  bestActionWeek,
}: {
  row: MonthWeekPerformanceRow
  bestRevenueWeek: number | null
  bestActionWeek: number | null
}) {
  const isBestRevenue =
    bestRevenueWeek === row.week && row.faturamento > 0

  const isBestAction =
    bestActionWeek === row.week && row.acoes_comerciais > 0

  const isWeekFive = row.week === 5

  const isZero =
    row.acoes_comerciais === 0 &&
    row.avancos === 0 &&
    row.ganhos === 0 &&
    row.perdidos === 0

  return (
    <tr
      style={{
        background: isBestRevenue
          ? 'rgba(34,197,94,0.045)'
          : isBestAction
            ? 'rgba(59,130,246,0.045)'
            : 'transparent',
        borderBottom: `1px solid ${DS.borderSubtle}`,
        opacity: isZero ? 0.45 : 1,
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
              color: DS.textPrimary,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {row.week_label}
          </span>

          {isBestRevenue ? (
            <span
              style={{
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(134,239,172,0.2)',
                borderRadius: 4,
                color: DS.greenSoft,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.04em',
                padding: '3px 6px',
                textTransform: 'uppercase',
              }}
            >
              maior receita
            </span>
          ) : null}

          {!isBestRevenue && isBestAction ? (
            <span
              style={{
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(147,197,253,0.18)',
                borderRadius: 4,
                color: DS.blueSoft,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.04em',
                padding: '3px 6px',
                textTransform: 'uppercase',
              }}
            >
              maior execução
            </span>
          ) : null}
        </div>

        <div
          style={{
            color: isWeekFive ? DS.yellowSoft : DS.textMuted,
            fontSize: 11,
            marginTop: 4,
          }}
        >
          {row.week_description}
          {isWeekFive ? ' · janela menor' : ''}
        </div>
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
        {row.acoes_comerciais}
      </td>

      <td
        style={{
          color: DS.blueSoft,
          fontSize: 13,
          fontWeight: 700,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {row.avancos}
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
        {row.ganhos}
      </td>

      <td
        style={{
          color: row.perdidos > 0 ? DS.redSoft : DS.textSecondary,
          fontSize: 13,
          fontWeight: row.perdidos > 0 ? 700 : 400,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {row.perdidos}
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
        {row.faturamento > 0 ? toBRL(row.faturamento) : '—'}
      </td>

      <td
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          padding: '14px 12px',
          textAlign: 'right',
        }}
      >
        {row.ganhos >= 3 ? toBRL(row.ticket_medio) : '—'}
      </td>

      <td
        style={{
          color: DS.textSecondary,
          fontSize: 13,
          padding: '14px 18px',
          textAlign: 'right',
        }}
      >
        {row.meses_com_dados}
      </td>
    </tr>
  )
}

// ==============================================================================
// Main page
// ==============================================================================

export default function SemanaMesRelatorioPg() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [pageError, setPageError] = React.useState<string | null>(null)

  const [canFilterSellers, setCanFilterSellers] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  const [dateStart, setDateStart] = React.useState(
    getFirstDayOfCurrentYear(),
  )

  const [dateEnd, setDateEnd] = React.useState(getTodayDate())

  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(
    null,
  )

  const [summary, setSummary] =
    React.useState<MonthWeekPerformanceSummary | null>(null)

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
        const result = await getMonthWeekPerformance({
          companyId: activeCompanyId,
          ownerId: selectedSellerId,
          dateStart,
          dateEnd,
        })

        if (!cancelled) {
          setSummary(result)
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setDataError(
            getErrorMessage(
              cause,
              'Erro ao buscar os dados por semana do mês.',
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
        Carregando Semana do Mês...
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
              Semana do Mês
            </h1>
          </div>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              maxWidth: 780,
            }}
          >
            Leitura da execução comercial e dos resultados conforme a fase do
            mês em que cada registro ocorreu.
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
            {dataLoading
              ? 'Atualizando dados...'
              : 'Dados atualizados automaticamente'}
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
            Carregando resultado por semana do mês...
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
                  label="Ações Comerciais"
                  value={String(summary.total_acoes_comerciais)}
                  description="Atividades comerciais registradas no período."
                />

                <MetricCard
                  label="Avanços de Etapa"
                  value={String(summary.total_avancos)}
                  description="Movimentações reais entre etapas do funil."
                />

                <MetricCard
                  label="Vendas Ganhas"
                  value={String(summary.total_ganhos)}
                  description="Ciclos encerrados como ganho no período."
                  accent={DS.greenSoft}
                />

                <MetricCard
                  label="Faturamento das Vendas"
                  value={toBRL(summary.total_faturamento)}
                  description="Receita das vendas ganhas no período."
                  accent={DS.greenSoft}
                />
              </div>
            </section>

            <section style={{ marginBottom: 28 }}>
              <SectionLabel>Destaques por Semana</SectionLabel>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                <HighlightCard
                  label="Maior Faturamento"
                  name={
                    summary.melhor_semana_faturamento?.week_label ?? null
                  }
                  value={
                    summary.melhor_semana_faturamento
                      ? toBRL(summary.melhor_semana_faturamento.faturamento)
                      : '—'
                  }
                  description={
                    summary.melhor_semana_faturamento
                      ? `${summary.melhor_semana_faturamento.ganhos} venda(s) ganha(s)`
                      : undefined
                  }
                  accent={DS.greenSoft}
                />

                <HighlightCard
                  label="Maior Volume de Vendas"
                  name={summary.melhor_semana_ganhos?.week_label ?? null}
                  value={
                    summary.melhor_semana_ganhos
                      ? `${summary.melhor_semana_ganhos.ganhos} venda(s)`
                      : '—'
                  }
                  description="Volume de ciclos fechados como ganho."
                />

                <HighlightCard
                  label="Maior Execução"
                  name={summary.melhor_semana_acoes?.week_label ?? null}
                  value={
                    summary.melhor_semana_acoes
                      ? `${summary.melhor_semana_acoes.acoes_comerciais} ação(ões)`
                      : '—'
                  }
                  description="Maior quantidade de atividades comerciais registradas."
                />

                <HighlightCard
                  label="Maior Avanço"
                  name={summary.melhor_semana_avancos?.week_label ?? null}
                  value={
                    summary.melhor_semana_avancos
                      ? `${summary.melhor_semana_avancos.avancos} avanço(s)`
                      : '—'
                  }
                  description="Movimentações reais no funil."
                />

                <HighlightCard
                  label="Maior Ticket Médio"
                  name={summary.melhor_semana_ticket?.week_label ?? null}
                  value={
                    summary.melhor_semana_ticket
                      ? toBRL(summary.melhor_semana_ticket.ticket_medio)
                      : '—'
                  }
                  description={
                    summary.melhor_semana_ticket
                      ? `Base de ${summary.melhor_semana_ticket.ganhos} vendas ganhas`
                      : 'Exige no mínimo três vendas na mesma faixa.'
                  }
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
                    Distribuição por Semana do Mês
                  </h2>

                  <p
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.5,
                      margin: '6px 0 0',
                    }}
                  >
                    Comparação entre execução comercial, avanço do funil e
                    resultado financeiro conforme a faixa do mês.
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(59,130,246,0.09)',
                    border: '1px solid rgba(147,197,253,0.18)',
                    borderRadius: 6,
                    color: DS.blueSoft,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '6px 9px',
                  }}
                >
                  {summary.meses_no_periodo} mês(es) analisado(s)
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    minWidth: 980,
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
                        Semana
                      </th>

                      <th style={{ padding: '12px', textAlign: 'right' }}>
                        Ações
                      </th>

                      <th style={{ padding: '12px', textAlign: 'right' }}>
                        Avanços
                      </th>

                      <th style={{ padding: '12px', textAlign: 'right' }}>
                        Vendas
                      </th>

                      <th style={{ padding: '12px', textAlign: 'right' }}>
                        Perdas
                      </th>

                      <th style={{ padding: '12px', textAlign: 'right' }}>
                        Faturamento
                      </th>

                      <th style={{ padding: '12px', textAlign: 'right' }}>
                        Ticket Médio
                      </th>

                      <th
                        style={{
                          padding: '12px 18px',
                          textAlign: 'right',
                        }}
                      >
                        Amostra
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {summary.rows.map((row) => (
                      <WeekRow
                        key={row.week}
                        row={row}
                        bestRevenueWeek={
                          summary.melhor_semana_faturamento?.week ?? null
                        }
                        bestActionWeek={
                          summary.melhor_semana_acoes?.week ?? null
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              style={{
                ...cardStyle(),
                marginBottom: 20,
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
                Resumo do Período
              </div>

              <p
                style={{
                  color: DS.textSecondary,
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {summary.diagnostico}
              </p>

              <div
                style={{
                  borderTop: `1px solid ${DS.borderSubtle}`,
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(180px, 1fr))',
                  marginTop: 18,
                  paddingTop: 14,
                }}
              >
                <div>
                  <div style={fieldLabelStyle}>Período</div>
                  <div
                    style={{
                      color: DS.textPrimary,
                      fontSize: 13,
                      fontWeight: 800,
                      marginTop: 5,
                    }}
                  >
                    {summary.period_start} até {summary.period_end}
                  </div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Perdas Registradas</div>
                  <div
                    style={{
                      color:
                        summary.total_perdidos > 0
                          ? DS.redSoft
                          : DS.textPrimary,
                      fontSize: 13,
                      fontWeight: 800,
                      marginTop: 5,
                    }}
                  >
                    {summary.total_perdidos}
                  </div>
                </div>

                <div>
                  <div style={fieldLabelStyle}>Ticket Médio Geral</div>
                  <div
                    style={{
                      color: DS.textPrimary,
                      fontSize: 13,
                      fontWeight: 800,
                      marginTop: 5,
                    }}
                  >
                    {toBRL(summary.ticket_medio_geral)}
                  </div>
                </div>
              </div>
            </section>

            <section
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusContainer,
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
                Ações comerciais e avanços vêm de
                <strong style={{ color: DS.textPrimary }}>
                  {' '}
                  cycle_events
                </strong>
                . Vendas, perdas e faturamento vêm de
                <strong style={{ color: DS.textPrimary }}>
                  {' '}
                  sales_cycles
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
                Receita usa a data financeira oficial:
                <strong style={{ color: DS.textPrimary }}>
                  {' '}
                  revenue_seller_ref_date → won_at → closed_at
                </strong>
                . Perdas são consideradas somente quando
                <strong style={{ color: DS.textPrimary }}> lost_at</strong>
                está preenchido.
              </div>

              <div
                style={{
                  color: DS.yellowSoft,
                  fontSize: 12,
                  lineHeight: 1.65,
                  marginTop: 8,
                }}
              >
                A 5ª semana tem somente os dias 29, 30 e 31. Ela naturalmente
                possui uma janela menor e não deve ser comparada como se tivesse
                o mesmo peso das demais semanas.
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}