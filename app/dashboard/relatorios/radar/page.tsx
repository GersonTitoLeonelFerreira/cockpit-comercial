'use client'

import * as React from 'react'
import ReportNavDropdown from '@/app/relatorios/components/ReportNavDropdown'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getSellers } from '@/app/lib/services/faturamento'
import { getPeriodRadar } from '@/app/lib/services/periodRadar'
import { getBusinessDateKey } from '@/app/lib/services/executionDayMath'
import type {
  PeriodRadarSignal,
  PeriodRadarStatus,
  PeriodRadarSummary,
  SignalDirection,
} from '@/app/types/periodRadar'

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  border: '#1a1d2e',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  green: '#22c55e',
  greenSoft: '#86efac',
  amber: '#f59e0b',
  amberSoft: '#fef3c7',
  red: '#ef4444',
  redSoft: '#fca5a5',
  radius: 8,
  radiusContainer: 10,
} as const

type SellerOption = {
  id: string
  label: string
}

type MeResponse = {
  ok?: boolean
  error?: string
  user_id?: string
  active_company_id?: string | null
  active_role?: string | null
}

const STATUS_COPY: Record<
  PeriodRadarStatus,
  {
    label: string
    summary: string
    action: string
    color: string
    background: string
    border: string
  }
> = {
  favoravel: {
    label: 'Favorável',
    summary: 'O momento ajuda a gerar resultado.',
    action: 'Acelere as negociações abertas.',
    color: DS.green,
    background: 'rgba(22,163,74,0.10)',
    border: 'rgba(22,163,74,0.34)',
  },
  neutro: {
    label: 'Neutro',
    summary: 'Sem tendência clara para ajudar ou pressionar o resultado.',
    action: 'Mantenha o ritmo e avance as negociações.',
    color: DS.amber,
    background: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.34)',
  },
  arriscado: {
    label: 'Pressionado',
    summary: 'O momento exige mais execução para proteger o resultado.',
    action: 'Aumente a cadência e recupere ciclos parados.',
    color: DS.red,
    background: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.34)',
  },
}

const SIGNAL_TITLES: Record<string, string> = {
  weekday_vocation: 'Hoje',
  month_week: 'Semana atual',
  month_seasonality: 'Mês atual',
  recent_work_rhythm: 'Ritmo de trabalho',
  recent_win_rhythm: 'Ritmo de ganhos',
  active_pipeline: 'Pipeline em aberto',
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getHistoryStart() {
  const today = getBusinessDateKey()

  return `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
}

function getTodayDate() {
  return getBusinessDateKey()
}

function getDirectionStyle(direction: SignalDirection) {
  if (direction === 'positivo') {
    return {
      label: 'A favor',
      color: DS.greenSoft,
      background: 'rgba(22,163,74,0.12)',
      border: 'rgba(22,163,74,0.30)',
      accent: DS.green,
    }
  }

  if (direction === 'negativo') {
    return {
      label: 'Pressiona',
      color: DS.redSoft,
      background: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.30)',
      accent: DS.red,
    }
  }

  return {
    label: 'Neutro',
    color: DS.amberSoft,
    background: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.30)',
    accent: DS.amber,
  }
}

function getFirstSentence(value: string) {
  const index = value.indexOf('. ')

  if (index === -1) return value

  return value.slice(0, index + 1)
}

function SignalCard({ signal }: { signal: PeriodRadarSignal }) {
  const title = SIGNAL_TITLES[signal.id] ?? signal.label
  const direction = getDirectionStyle(signal.direction)

  const detail = signal.available
    ? getFirstSentence(signal.description)
    : 'Ainda não há histórico suficiente para esta leitura.'

  return (
    <article
      style={{
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderLeft: `3px solid ${signal.available ? direction.accent : DS.textMuted}`,
        borderRadius: DS.radius,
        padding: '15px',
        minHeight: 128,
        opacity: signal.available ? 1 : 0.62,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2
            style={{
              color: DS.textPrimary,
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            {title}
          </h2>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.5,
              margin: '8px 0 0',
            }}
          >
            {detail}
          </p>
        </div>

        <span
          style={{
            color: signal.available ? direction.color : DS.textMuted,
            background: signal.available ? direction.background : DS.panelBg,
            border: `1px solid ${signal.available ? direction.border : DS.border}`,
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.05em',
            padding: '4px 8px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {signal.available ? direction.label : 'Sem base'}
        </span>
      </div>
    </article>
  )
}

function Counter({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: string
}) {
  return (
    <div
      style={{
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radius,
        minWidth: 112,
        padding: '9px 11px',
      }}
    >
      <div
        style={{
          color: DS.textMuted,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color,
          fontSize: 22,
          fontWeight: 900,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}

export default function RadarRelatorioPg() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [canChooseSeller, setCanChooseSeller] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)
  const [radar, setRadar] = React.useState<PeriodRadarSummary | null>(null)
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

  const historyStart = React.useMemo(() => getHistoryStart(), [])
  const historyEnd = React.useMemo(() => getTodayDate(), [])

  React.useEffect(() => {
    async function loadUserContext() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/me', { cache: 'no-store' })
        const me = (await response.json()) as MeResponse
        const activeCompanyId = me.active_company_id ?? null

        if (!response.ok || !me.ok || !activeCompanyId) {
          throw new Error(me.error ?? 'Não foi possível identificar a empresa ativa.')
        }

        const canFilter =
          me.active_role === 'admin' || me.active_role === 'manager'

        setCompanyId(activeCompanyId)
        setCanChooseSeller(canFilter)

        if (canFilter) {
          const sellersData = await getSellers(
            supabaseBrowser(),
            activeCompanyId,
          )

          setSellers(
            sellersData.map((seller) => ({
              id: seller.id,
              label: seller.full_name || seller.email || seller.id,
            })),
          )

          setSelectedSellerId(null)
        } else {
          setSelectedSellerId(me.user_id ?? null)
        }
      } catch (caught: unknown) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível carregar o radar.',
        )
      } finally {
        setLoading(false)
      }
    }

    void loadUserContext()
  }, [])

  React.useEffect(() => {
    if (!companyId) return

    async function loadRadar() {
      setDataLoading(true)
      setDataError(null)

      try {
        const result = await getPeriodRadar({
          companyId: companyId!,
          ownerId: selectedSellerId,
          dateStart: historyStart,
          dateEnd: historyEnd,
        })

        setRadar(result)
      } catch (caught: unknown) {
        setDataError(
          caught instanceof Error
            ? caught.message
            : 'Não foi possível atualizar o radar.',
        )
      } finally {
        setDataLoading(false)
      }
    }

    void loadRadar()
  }, [companyId, historyEnd, historyStart, selectedSellerId])

  if (loading) {
    return (
      <main
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        Carregando radar...
      </main>
    )
  }

  if (error) {
    return (
      <main
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div
          style={{
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: DS.radius,
            color: DS.redSoft,
            fontSize: 13,
            maxWidth: 520,
            padding: 16,
          }}
        >
          {error}
        </div>
      </main>
    )
  }

  const status = radar ? STATUS_COPY[radar.status] : null
  const hasLowConfidence = radar?.confidence === 'baixa'

  return (
    <main
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100vh',
      }}
    >
      <header
        style={{
          background: `linear-gradient(135deg, ${DS.blue}16 0%, ${DS.contentBg} 62%)`,
          borderBottom: `1px solid ${DS.border}`,
          padding: '28px 24px 24px',
        }}
      >
        <div
          style={{
            margin: '0 auto',
            maxWidth: 980,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Radar Comercial Atual
          </h1>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              margin: '7px 0 16px',
            }}
          >
            Leitura do cenário comercial de hoje.
          </p>

          <ReportNavDropdown currentPath="/dashboard/relatorios/radar" />
        </div>
      </header>

      <div
        style={{
          margin: '0 auto',
          maxWidth: 980,
          padding: '20px 24px 64px',
        }}
      >
        {canChooseSeller && (
          <div
            style={{
              alignItems: 'center',
              background: DS.cardBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radius,
              display: 'flex',
              gap: 10,
              marginBottom: 16,
              padding: '11px 13px',
            }}
          >
            <label
              htmlFor="radar-seller"
              style={{
                color: DS.textMuted,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Vendedor
            </label>

            <select
              id="radar-seller"
              value={selectedSellerId ?? ''}
              onChange={(event) => setSelectedSellerId(event.target.value || null)}
              style={{
                background: DS.panelBg,
                border: `1px solid ${DS.border}`,
                borderRadius: 6,
                color: DS.textPrimary,
                fontSize: 13,
                marginLeft: 'auto',
                maxWidth: 260,
                padding: '8px 10px',
                width: '100%',
              }}
            >
              <option value="">Toda a operação</option>

              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {dataLoading && (
          <div
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              padding: '28px 0',
              textAlign: 'center',
            }}
          >
            Atualizando...
          </div>
        )}

        {dataError && (
          <div
            style={{
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              padding: 14,
            }}
          >
            {dataError}
          </div>
        )}

        {!dataLoading && radar && status && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <section
              style={{
                background: status.background,
                border: `1px solid ${status.border}`,
                borderLeft: `4px solid ${status.color}`,
                borderRadius: DS.radiusContainer,
                padding: '21px 22px',
              }}
            >
              <div
                style={{
                  color: DS.textMuted,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}
              >
                Cenário de hoje
              </div>

              <div
                style={{
                  color: status.color,
                  fontSize: 34,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  marginTop: 7,
                  textTransform: 'uppercase',
                }}
              >
                {hasLowConfidence ? 'Sem base suficiente' : status.label}
              </div>

              <div
                style={{
                  color: DS.textPrimary,
                  fontSize: 15,
                  fontWeight: 800,
                  lineHeight: 1.4,
                  marginTop: 9,
                }}
              >
                {hasLowConfidence
                  ? 'Ainda não há histórico suficiente para classificar o momento.'
                  : status.summary}
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  marginTop: 9,
                }}
              >
                Foco agora:{' '}
                <strong style={{ color: DS.textPrimary }}>
                  {hasLowConfidence
                    ? 'registre o trabalho e os ganhos da operação.'
                    : status.action}
                </strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 9,
                  marginTop: 17,
                }}
              >
                <Counter
                  label="A favor"
                  value={radar.signals_positive}
                  color={DS.green}
                />

                <Counter
                  label="Pressionam"
                  value={radar.signals_negative}
                  color={DS.red}
                />

                <Counter
                  label="Neutros"
                  value={radar.signals_neutral}
                  color={DS.amber}
                />

                <Counter
                  label="Base"
                  value={radar.confidence_label}
                  color={hasLowConfidence ? DS.amber : DS.blueSoft}
                />
              </div>
            </section>

            <section>
              <h2
                style={{
                  color: DS.blueSoft,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  margin: '0 0 10px',
                  textTransform: 'uppercase',
                }}
              >
                O que está influenciando o momento
              </h2>

              <div
                style={{
                  display: 'grid',
                  gap: 11,
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(250px, 1fr))',
                }}
              >
                {radar.signals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
