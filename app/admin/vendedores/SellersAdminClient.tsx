'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  adminListSellersStats,
  adminUpdateSellerAccess,
  type AdminSellerStatsRow,
} from '@/app/lib/services/admin-sellers'

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

type FilterActive = 'all' | 'active' | 'inactive'

const TABLE_GRID = {
  gridTemplateColumns:
    'minmax(240px, 1.7fr) minmax(115px, .65fr) 110px 120px minmax(130px, .8fr) minmax(165px, .9fr) 205px',
} as const

// ==============================================================================
// Helpers
// ==============================================================================

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function toBRDateTime(value?: string | null) {
  if (!value) {
    return 'Sem atividade'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Sem atividade'
  }

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function roleLabel(role?: string | null) {
  const normalized = String(role ?? '').toLowerCase()

  if (normalized === 'admin') {
    return 'Administrador'
  }

  if (normalized === 'manager') {
    return 'Gerente'
  }

  if (
    normalized === 'member' ||
    normalized === 'seller' ||
    normalized === 'consultor'
  ) {
    return 'Vendedor'
  }

  return role || 'Sem perfil'
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
        flex: '1 1 190px',
        flexDirection: 'column',
        minHeight: 118,
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

function StatusBadge({
  active,
}: {
  active: boolean
}) {
  return (
    <span
      style={{
        background: active
          ? 'rgba(34,197,94,0.09)'
          : 'rgba(239,68,68,0.09)',
        border: `1px solid ${
          active
            ? 'rgba(134,239,172,0.18)'
            : 'rgba(252,165,165,0.18)'
        }`,
        borderRadius: 999,
        color: active ? DS.greenSoft : DS.redSoft,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.04em',
        padding: '5px 9px',
        textTransform: 'uppercase',
      }}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function RoleBadge({
  role,
}: {
  role?: string | null
}) {
  return (
    <span
      style={{
        background: 'rgba(59,130,246,0.09)',
        border: '1px solid rgba(147,197,253,0.18)',
        borderRadius: 6,
        color: DS.blueSoft,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 800,
        padding: '5px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {roleLabel(role)}
    </span>
  )
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = 'secondary',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
}) {
  const variants: Record<
    'primary' | 'secondary' | 'danger' | 'success',
    React.CSSProperties
  > = {
    primary: {
      background: '#166534',
      border: '1px solid rgba(134,239,172,0.22)',
      color: '#f0fdf4',
    },
    secondary: {
      background: DS.surfaceBg,
      border: `1px solid ${DS.border}`,
      color: DS.textSecondary,
    },
    danger: {
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(252,165,165,0.18)',
      color: DS.redSoft,
    },
    success: {
      background: 'rgba(34,197,94,0.08)',
      border: '1px solid rgba(134,239,172,0.18)',
      color: DS.greenSoft,
    },
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        borderRadius: DS.radius,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 800,
        minHeight: 32,
        opacity: disabled ? 0.55 : 1,
        padding: '0 11px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ==============================================================================
// Main component
// ==============================================================================

export default function SellersAdminClient({
  activeCompanyId,
}: {
  activeCompanyId: string
}) {
  const [query, setQuery] = React.useState('')
  const [activeFilter, setActiveFilter] =
    React.useState<FilterActive>('active')

  const [days, setDays] = React.useState<7 | 30 | 90>(30)

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  )

  const [rows, setRows] = React.useState<AdminSellerStatsRow[]>([])
  const [pendingSeller, setPendingSeller] =
    React.useState<AdminSellerStatsRow | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await adminListSellersStats({
        companyId: activeCompanyId,
        days,
      })

      setRows(data)
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Erro ao carregar vendedores.'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, days])

  React.useEffect(() => {
    void load()
  }, [load])

  const filteredRows = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return rows.filter((seller) => {
      const name = (seller.full_name ?? '').toLowerCase()
      const email = (seller.email ?? '').toLowerCase()

      const matchesQuery =
        !normalizedQuery ||
        name.includes(normalizedQuery) ||
        email.includes(normalizedQuery)

      const matchesStatus =
        activeFilter === 'all'
          ? true
          : activeFilter === 'active'
            ? seller.is_active
            : !seller.is_active

      return matchesQuery && matchesStatus
    })
  }, [activeFilter, query, rows])

  const totals = React.useMemo(() => {
    const total = rows.length
    const active = rows.filter((seller) => seller.is_active).length
    const inactive = total - active

    const activeCycles = rows.reduce(
      (sum, seller) => sum + Number(seller.active_cycles_count ?? 0),
      0,
    )

    const gains = rows.reduce(
      (sum, seller) => sum + Number(seller.ganho_count_period ?? 0),
      0,
    )

    const losses = rows.reduce(
      (sum, seller) => sum + Number(seller.perdido_count_period ?? 0),
      0,
    )

    return {
      total,
      active,
      inactive,
      activeCycles,
      gains,
      losses,
    }
  }, [rows])

  async function toggleActive(seller: AdminSellerStatsRow) {
    const nextStatus = !seller.is_active
    const label = seller.full_name ?? seller.email ?? seller.seller_id

    setError(null)
    setSuccessMessage(null)

    try {
      await adminUpdateSellerAccess({
        companyId: activeCompanyId,
        sellerId: seller.seller_id,
        role: seller.role ?? 'member',
        isActive: nextStatus,
      })

      setPendingSeller(null)

      setSuccessMessage(
        `${label} foi ${nextStatus ? 'ativado' : 'desativado'} com sucesso.`,
      )

      await load()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'Erro ao atualizar acesso.'))
    }
  }

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100%',
        padding: '32px 24px 80px',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          maxWidth: 1200,
        }}
      >
        <Link
          href="/dashboard"
          style={{
            color: DS.textSecondary,
            display: 'inline-flex',
            fontSize: 13,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← Voltar para Dashboard
        </Link>

        <header
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            justifyContent: 'space-between',
            marginBottom: 28,
          }}
        >
          <div>
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
                Gestão de Vendedores
              </h1>
            </div>

            <p
              style={{
                color: DS.textSecondary,
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
                maxWidth: 720,
              }}
            >
              Acompanhe o acesso, a carteira ativa e o resultado recente de cada
              vendedor da empresa ativa.
            </p>
          </div>

          <Link
            href="/admin/vendedores/novo"
            style={{
              alignItems: 'center',
              background: '#166534',
              border: '1px solid rgba(134,239,172,0.22)',
              borderRadius: DS.radius,
              color: '#f0fdf4',
              display: 'inline-flex',
              fontSize: 12,
              fontWeight: 850,
              height: 38,
              justifyContent: 'center',
              padding: '0 15px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + Cadastrar vendedor
          </Link>
        </header>

        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Panorama da Equipe</SectionLabel>

          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            }}
          >
            <MetricCard
              label="Vendedores Cadastrados"
              value={String(totals.total)}
              description="Pessoas vinculadas à empresa ativa."
            />

            <MetricCard
              label="Vendedores Ativos"
              value={String(totals.active)}
              description="Pessoas com acesso liberado ao sistema."
              accent={DS.greenSoft}
            />

            <MetricCard
              label="Carteira Ativa"
              value={String(totals.activeCycles)}
              description="Ciclos abertos distribuídos entre os vendedores."
            />

            <MetricCard
              label={`Ganhos em ${days} dias`}
              value={String(totals.gains)}
              description={
                totals.losses > 0
                  ? `${totals.losses} perda(s) registrada(s) no mesmo período.`
                  : 'Nenhuma perda registrada no período.'
              }
              accent={DS.greenSoft}
            />
          </div>
        </section>

        {error ? (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div
            style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(134,239,172,0.18)',
              borderRadius: DS.radius,
              color: DS.greenSoft,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {successMessage}
          </div>
        ) : null}

        <section
          style={{
            ...cardStyle(),
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            padding: '15px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {(['all', 'active', 'inactive'] as FilterActive[]).map((item) => {
              const isSelected = activeFilter === item

              const labels: Record<FilterActive, string> = {
                all: 'Todos',
                active: 'Ativos',
                inactive: 'Inativos',
              }

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setActiveFilter(item)}
                  style={{
                    background: isSelected
                      ? 'rgba(59,130,246,0.13)'
                      : DS.surfaceBg,
                    border: `1px solid ${
                      isSelected
                        ? 'rgba(147,197,253,0.28)'
                        : DS.border
                    }`,
                    borderRadius: DS.radius,
                    color: isSelected ? DS.blueSoft : DS.textSecondary,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: isSelected ? 850 : 650,
                    height: 36,
                    padding: '0 13px',
                  }}
                >
                  {labels[item]}
                </button>
              )
            })}
          </div>

          <div
            style={{
              flex: '1 1 230px',
              maxWidth: 330,
              minWidth: 220,
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              style={{
                ...inputStyle,
                width: '100%',
              }}
            />
          </div>

          <label
            style={{
              display: 'grid',
              gap: 5,
            }}
          >
            <span style={fieldLabelStyle}>Período</span>

            <select
              value={days}
              onChange={(event) =>
                setDays(Number(event.target.value) as 7 | 30 | 90)
              }
              style={{
                ...inputStyle,
                minWidth: 125,
              }}
            >
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </label>

          <ActionButton
            variant="secondary"
            disabled={loading}
            onClick={() => {
              setError(null)
              setSuccessMessage(null)
              void load()
            }}
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </ActionButton>

          <div
            style={{
              color: DS.textMuted,
              fontSize: 12,
              fontWeight: 700,
              marginLeft: 'auto',
            }}
          >
            {loading
              ? 'Atualizando equipe...'
              : `${filteredRows.length} de ${rows.length} vendedor(es)`}
          </div>
        </section>

        <section
          style={{
            ...cardStyle(),
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
                  color: DS.textPrimary,
                  fontSize: 16,
                  fontWeight: 850,
                  margin: 0,
                }}
              >
                Equipe Comercial
              </h2>

              <p
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.5,
                  margin: '6px 0 0',
                }}
              >
                Acompanhe acesso, carteira, resultado recente e última atividade
                registrada de cada vendedor.
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
              EMPRESA ATIVA
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1180 }}>
              <div
                style={{
                  ...TABLE_GRID,
                  background: '#0f1118',
                  borderBottom: `1px solid ${DS.border}`,
                  color: DS.textMuted,
                  display: 'grid',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  padding: '12px 18px',
                  textTransform: 'uppercase',
                }}
              >
                <span>Vendedor</span>
                <span>Perfil</span>
                <span style={{ textAlign: 'center' }}>Status</span>
                <span style={{ textAlign: 'right' }}>Carteira</span>
                <span style={{ textAlign: 'right' }}>Resultado</span>
                <span style={{ textAlign: 'right' }}>Última Atividade</span>
                <span style={{ textAlign: 'right' }}>Ações</span>
              </div>

              {loading ? (
                <div
                  style={{
                    color: DS.textSecondary,
                    fontSize: 13,
                    padding: '42px 20px',
                    textAlign: 'center',
                  }}
                >
                  Carregando vendedores da empresa ativa...
                </div>
              ) : null}

              {!loading && filteredRows.length === 0 ? (
                <div
                  style={{
                    color: DS.textSecondary,
                    padding: '48px 20px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      color: DS.textPrimary,
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    Nenhum vendedor encontrado
                  </div>

                  <div
                    style={{
                      color: DS.textMuted,
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    Ajuste os filtros ou cadastre um novo vendedor para iniciar
                    a operação comercial.
                  </div>
                </div>
              ) : null}

              {!loading &&
                filteredRows.map((seller, index) => {
                  const sellerLabel =
                    seller.full_name ?? seller.email ?? seller.seller_id

                  return (
                    <div
                      key={seller.seller_id}
                      style={{
                        ...TABLE_GRID,
                        alignItems: 'center',
                        background:
                          index % 2 === 0
                            ? 'transparent'
                            : 'rgba(17,19,24,0.36)',
                        borderBottom: `1px solid ${DS.borderSubtle}`,
                        display: 'grid',
                        padding: '14px 18px',
                      }}
                    >
                      <Link
                        href={`/admin/vendedores/${seller.seller_id}`}
                        style={{
                          alignItems: 'center',
                          display: 'flex',
                          gap: 10,
                          minWidth: 0,
                          paddingRight: 10,
                          textDecoration: 'none',
                        }}
                      >
                        <div
                          style={{
                            alignItems: 'center',
                            background: seller.is_active
                              ? 'rgba(59,130,246,0.1)'
                              : 'rgba(84,96,112,0.14)',
                            border: `1px solid ${
                              seller.is_active
                                ? 'rgba(147,197,253,0.18)'
                                : 'rgba(84,96,112,0.2)'
                            }`,
                            borderRadius: '50%',
                            color: seller.is_active
                              ? DS.blueSoft
                              : DS.textMuted,
                            display: 'flex',
                            flexShrink: 0,
                            fontSize: 11,
                            fontWeight: 900,
                            height: 32,
                            justifyContent: 'center',
                            width: 32,
                          }}
                        >
                          {getInitials(sellerLabel) || '—'}
                        </div>

                        <div
                          style={{
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              color: DS.textPrimary,
                              fontSize: 13,
                              fontWeight: 850,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={sellerLabel}
                          >
                            {seller.full_name ?? 'Sem nome informado'}
                          </div>

                          <div
                            style={{
                              color: DS.textSecondary,
                              fontSize: 11,
                              marginTop: 3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={seller.email ?? ''}
                          >
                            {seller.email ?? 'Sem e-mail informado'}
                          </div>
                        </div>
                      </Link>

                      <div>
                        <RoleBadge role={seller.role} />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <StatusBadge active={seller.is_active} />
                      </div>

                      <div
                        style={{
                          color: DS.textPrimary,
                          fontSize: 14,
                          fontWeight: 850,
                          textAlign: 'right',
                        }}
                      >
                        {seller.active_cycles_count}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            color: DS.greenSoft,
                            fontSize: 12,
                            fontWeight: 850,
                          }}
                        >
                          {seller.ganho_count_period} ganho(s)
                        </div>

                        <div
                          style={{
                            color:
                              seller.perdido_count_period > 0
                                ? DS.redSoft
                                : DS.textMuted,
                            fontSize: 11,
                            fontWeight:
                              seller.perdido_count_period > 0 ? 750 : 500,
                          }}
                        >
                          {seller.perdido_count_period} perda(s)
                        </div>
                      </div>

                      <div
                        style={{
                          color: seller.last_activity_at
                            ? DS.textSecondary
                            : DS.textMuted,
                          fontSize: 12,
                          lineHeight: 1.4,
                          textAlign: 'right',
                        }}
                      >
                        {toBRDateTime(seller.last_activity_at)}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: 7,
                          justifyContent: 'flex-end',
                        }}
                      >
                        <Link
                          href={`/admin/vendedores/${seller.seller_id}`}
                          style={{
                            alignItems: 'center',
                            background: DS.surfaceBg,
                            border: `1px solid ${DS.border}`,
                            borderRadius: DS.radius,
                            color: DS.textSecondary,
                            display: 'inline-flex',
                            fontSize: 12,
                            fontWeight: 800,
                            height: 32,
                            justifyContent: 'center',
                            padding: '0 11px',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Detalhes
                        </Link>

                        <ActionButton
                          variant={seller.is_active ? 'danger' : 'success'}
                          onClick={() => {
                            setError(null)
                            setSuccessMessage(null)
                            setPendingSeller(seller)
                          }}
                        >
                          {seller.is_active ? 'Desativar' : 'Ativar'}
                        </ActionButton>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </section>

        <section
          style={{
            background: DS.surfaceBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            marginTop: 20,
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
            Critério de gestão
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.65,
            }}
          >
            Desativar um vendedor remove o acesso operacional à empresa ativa,
            mas preserva o histórico comercial e os resultados já registrados.
            A carteira ativa e os ganhos exibidos seguem o período selecionado.
          </div>
        </section>
      </div>

      {pendingSeller ? (
        <div
          onClick={() => setPendingSeller(null)}
          style={{
            alignItems: 'center',
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            padding: 20,
            position: 'fixed',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              ...cardStyle(),
              maxWidth: 470,
              padding: 22,
              width: '100%',
            }}
          >
            <div
              style={{
                color: pendingSeller.is_active ? DS.redSoft : DS.greenSoft,
                fontSize: 11,
                fontWeight: 850,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
              }}
            >
              Alteração de acesso
            </div>

            <h2
              style={{
                color: DS.textPrimary,
                fontSize: 18,
                fontWeight: 850,
                margin: '9px 0 0',
              }}
            >
              {pendingSeller.is_active
                ? 'Desativar vendedor?'
                : 'Ativar vendedor?'}
            </h2>

            <p
              style={{
                color: DS.textSecondary,
                fontSize: 13,
                lineHeight: 1.65,
                margin: '10px 0 0',
              }}
            >
              Confirme a alteração de acesso para{' '}
              <strong style={{ color: DS.textPrimary }}>
                {pendingSeller.full_name ??
                  pendingSeller.email ??
                  pendingSeller.seller_id}
              </strong>
              .
            </p>

            <div
              style={{
                background: pendingSeller.is_active
                  ? 'rgba(239,68,68,0.06)'
                  : 'rgba(34,197,94,0.06)',
                border: `1px solid ${
                  pendingSeller.is_active
                    ? 'rgba(252,165,165,0.14)'
                    : 'rgba(134,239,172,0.14)'
                }`,
                borderRadius: DS.radius,
                color: DS.textSecondary,
                fontSize: 12,
                lineHeight: 1.55,
                marginTop: 16,
                padding: '11px 12px',
              }}
            >
              {pendingSeller.is_active
                ? 'O vendedor perderá o acesso à empresa ativa. O histórico e os resultados permanecerão preservados.'
                : 'O vendedor voltará a ter acesso à empresa ativa com o perfil atual.'}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                marginTop: 20,
              }}
            >
              <ActionButton
                variant="secondary"
                onClick={() => setPendingSeller(null)}
              >
                Cancelar
              </ActionButton>

              <ActionButton
                variant={pendingSeller.is_active ? 'danger' : 'success'}
                onClick={() => {
                  void toggleActive(pendingSeller)
                }}
              >
                {pendingSeller.is_active
                  ? 'Confirmar desativação'
                  : 'Confirmar ativação'}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}