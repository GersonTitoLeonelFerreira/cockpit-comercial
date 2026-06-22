'use client'

import * as React from 'react'
import ReportNavDropdown from '@/app/relatorios/components/ReportNavDropdown'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getSellers } from '@/app/lib/services/faturamento'
import { getPeriodRadar } from '@/app/lib/services/periodRadar'
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
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  green: '#22c55e',
  greenSoft: '#86efac',
  amber: '#f59e0b',
  amberSoft: '#fef3c7',
  red: '#ef4444',
  redSoft: '#fca5a5',
  radius: 7,
  radiusContainer: 10,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

type SellerOption = {
  id: string
  label: string
}

type MeResponse =
  | {
      ok: true
      user_id: string
      active_company_id: string | null
      active_company_name: string | null
      active_role: 'admin' | 'manager' | 'member' | null
    }
  | {
      ok?: false
      error?: string
    }

const SIGNAL_HELP: Record<string, { what: string; why: string }> = {
  weekday_vocation: {
    what: 'Compara o comportamento histórico do dia da semana de hoje com a média dos demais dias.',
    why: 'Mostra se este dia costuma concentrar mais ou menos ciclos trabalhados e ganhos.',
  },
  month_week: {
    what: 'Compara a semana atual do mês com as outras semanas do histórico selecionado.',
    why: 'Mostra se este trecho do mês costuma favorecer ou pressionar a operação.',
  },
  month_seasonality: {
    what: 'Compara o mês atual com a média dos meses da própria empresa.',
    why: 'Só entra na leitura quando existe ao menos 12 meses de referência, para não inventar sazonalidade.',
  },
  recent_work_rhythm: {
    what: 'Compara os ciclos que receberam o primeiro trabalho nos últimos 7 dias com o ritmo diário histórico.',
    why: 'Mostra se a operação acelerou, manteve ou reduziu o ritmo de trabalho.',
  },
  recent_win_rhythm: {
    what: 'Compara os ganhos dos últimos 14 dias com a média histórica do mesmo intervalo.',
    why: 'Mostra se o ritmo recente de fechamentos está acima, dentro ou abaixo do padrão.',
  },
  active_pipeline: {
    what: 'Mostra quantos ciclos estão abertos agora.',
    why: 'É contexto operacional. Ainda não pesa no status porque o sistema não possui snapshots históricos do pipeline para comparar estoque com estoque.',
  },
}

const STATUS_PRESENTATION: Record<
  PeriodRadarStatus,
  {
    eyebrow: string
    title: string
    definition: string
    action: string
    color: string
    bg: string
  }
> = {
  favoravel: {
    eyebrow: 'Cenário favorável',
    title: 'As condições atuais ajudam a gerar resultado',
    definition:
      'Os sinais históricos e o ritmo recente apontam mais fatores a favor do que contra a execução comercial agora.',
    action:
      'Aproveite o momento para concentrar energia em negociações abertas, retornos de leads quentes e avanço de oportunidades.',
    color: DS.green,
    bg: 'rgba(22,163,74,0.10)',
  },
  neutro: {
    eyebrow: 'Cenário estável',
    title: 'Não há vantagem nem pressão clara agora',
    definition:
      'Os sinais estão equilibrados, mistos ou ainda sem base suficiente para indicar uma direção confiável.',
    action:
      'Mantenha a cadência comercial, trabalhe oportunidades em estágio avançado e continue abastecendo o pipeline.',
    color: DS.amber,
    bg: 'rgba(245,158,11,0.10)',
  },
  arriscado: {
    eyebrow: 'Cenário pressionado',
    title: 'As condições atuais dificultam a geração de resultado',
    definition:
      'Há mais sinais desfavoráveis do que favoráveis no histórico e no ritmo recente da operação.',
    action:
      'Aumente o volume de trabalho, recupere negociações paradas e reduza a dependência de poucas oportunidades.',
    color: DS.red,
    bg: 'rgba(239,68,68,0.10)',
  },
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTwelveMonthsAgo() {
  const now = new Date()
  return toDateInputValue(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()))
}

function getTodayDate() {
  return toDateInputValue(new Date())
}

function formatDateBR(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function DirectionBadge({
  direction,
  available,
  isContext,
}: {
  direction: SignalDirection
  available: boolean
  isContext: boolean
}) {
  if (isContext) {
    return (
      <span
        style={{
          color: DS.blueSoft,
          background: 'rgba(59,130,246,0.12)',
          border: '1px solid rgba(59,130,246,0.28)',
          borderRadius: 999,
          padding: '3px 8px',
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Apenas contexto
      </span>
    )
  }

  if (!available) {
    return (
      <span
        style={{
          color: DS.textMuted,
          background: DS.surfaceBg,
          border: `1px solid ${DS.border}`,
          borderRadius: 999,
          padding: '3px 8px',
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Sem base suficiente
      </span>
    )
  }

  const config =
    direction === 'positivo'
      ? { label: 'Contribui a favor', color: DS.greenSoft, bg: 'rgba(22,163,74,0.12)' }
      : direction === 'negativo'
        ? { label: 'Pressiona o cenário', color: DS.redSoft, bg: 'rgba(239,68,68,0.12)' }
        : { label: 'Sem impacto relevante', color: DS.amberSoft, bg: 'rgba(245,158,11,0.12)' }

  return (
    <span
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.color}35`,
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {config.label}
    </span>
  )
}

function SignalCard({ signal }: { signal: PeriodRadarSignal }) {
  const isContext = signal.id === 'active_pipeline'
  const help = SIGNAL_HELP[signal.id]

  const weightLabel = isContext
    ? 'Não altera o status'
    : `${Math.round(signal.weight * 100)}% da classificação`

  return (
    <article
      style={{
        background: DS.cardBg,
        border: `1px solid ${signal.available ? DS.border : DS.borderSubtle}`,
        borderRadius: DS.radiusContainer,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: signal.available || isContext ? 1 : 0.62,
        boxShadow: DS.shadowCard,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, color: DS.textPrimary, fontSize: 14, fontWeight: 800 }}>
            {signal.label}
          </h3>
          <p style={{ margin: '5px 0 0', color: DS.textMuted, fontSize: 11, lineHeight: 1.5 }}>
            {help?.what ?? 'Indicador analisado pelo radar comercial.'}
          </p>
        </div>

        <DirectionBadge
          direction={signal.direction}
          available={signal.available}
          isContext={isContext}
        />
      </div>

      <div
        style={{
          borderLeft: `3px solid ${
            isContext
              ? DS.blue
              : signal.direction === 'positivo'
                ? DS.green
                : signal.direction === 'negativo'
                  ? DS.red
                  : DS.amber
          }`,
          paddingLeft: 10,
          color: DS.textSecondary,
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        {signal.available || isContext ? signal.description : signal.fallback_reason}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          borderTop: `1px solid ${DS.border}`,
          paddingTop: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: DS.textMuted, fontSize: 10 }}>
          {help?.why ?? 'Sinal usado na leitura do cenário.'}
        </span>
        <span style={{ color: DS.blueSoft, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {weightLabel}
        </span>
      </div>

      <details>
        <summary style={{ color: DS.textMuted, cursor: 'pointer', fontSize: 10 }}>
          Ver origem do dado
        </summary>
        <div style={{ color: DS.textMuted, fontSize: 10, marginTop: 7, lineHeight: 1.5 }}>
          Fonte: {signal.source}
          <br />
          Confiança da leitura: {signal.confidence}
        </div>
      </details>
    </article>
  )
}

function Metric({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div
      style={{
        minWidth: 130,
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radius,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          color: DS.textMuted,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ color: color ?? DS.textPrimary, fontSize: 20, fontWeight: 900, marginTop: 3 }}>
        {value}
      </div>
    </div>
  )
}

export default function RadarRelatorioPg() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [companyName, setCompanyName] = React.useState<string | null>(null)
  const [canChooseOwner, setCanChooseOwner] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  const [dateStart, setDateStart] = React.useState(getTwelveMonthsAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  const [radar, setRadar] = React.useState<PeriodRadarSummary | null>(null)
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/me', { cache: 'no-store' })
        const me = (await response.json()) as MeResponse

        if (!response.ok) {
          throw new Error('Não foi possível identificar a sessão atual.')
        }

        if (me.ok !== true) {
          throw new Error(me.error ?? 'Não foi possível identificar a sessão atual.')
        }

        if (!me.active_company_id) {
          throw new Error('Selecione uma empresa antes de abrir o Radar Comercial.')
        }

        const canFilterByOwner =
          me.active_role === 'admin' || me.active_role === 'manager'

        setCompanyId(me.active_company_id)
        setCompanyName(me.active_company_name)
        setCanChooseOwner(canFilterByOwner)

        if (canFilterByOwner) {
          const sellersData = await getSellers(supabaseBrowser(), me.active_company_id)

          setSellers(
            sellersData.map((seller) => ({
              id: seller.id,
              label: seller.full_name || seller.email || seller.id,
            })),
          )
          setSelectedSellerId(null)
        } else {
          setSellers([])
          setSelectedSellerId(me.user_id)
        }
      } catch (caught: unknown) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Erro ao preparar o Radar Comercial.',
        )
      } finally {
        setLoading(false)
      }
    }

    void init()
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
          dateStart,
          dateEnd,
        })

        setRadar(result)
      } catch (caught: unknown) {
        setDataError(
          caught instanceof Error
            ? caught.message
            : 'Erro ao calcular o Radar Comercial.',
        )
      } finally {
        setDataLoading(false)
      }
    }

    void loadRadar()
  }, [companyId, dateEnd, dateStart, selectedSellerId])

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          fontSize: 13,
        }}
      >
        Carregando contexto da empresa...
      </main>
    )
  }

  if (error) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: DS.contentBg,
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            color: DS.redSoft,
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: DS.radiusContainer,
            padding: 18,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {error}
        </div>
      </main>
    )
  }

  const status = radar ? STATUS_PRESENTATION[radar.status] : null

  return (
    <main
      style={{
        minHeight: '100vh',
        background: DS.contentBg,
        color: DS.textPrimary,
      }}
    >
      <header
        style={{
          background: `linear-gradient(135deg, ${DS.blue}1c 0%, ${DS.contentBg} 58%)`,
          borderBottom: `1px solid ${DS.border}`,
          padding: '30px 24px 26px',
        }}
      >
        <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              color: DS.blueSoft,
              fontSize: 11,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 8,
            }}
          >
            Leitura de cenário comercial
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 28,
              letterSpacing: '-0.03em',
              fontWeight: 900,
            }}
          >
            Radar Comercial Atual
          </h1>

          <p
            style={{
              maxWidth: 760,
              margin: '10px auto 20px',
              color: DS.textSecondary,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            Mostra se as condições comerciais de agora ajudam, mantêm estáveis ou
            pressionam a geração de resultados — usando o ritmo recente da operação e
            os padrões da própria empresa.
          </p>

          <ReportNavDropdown currentPath="/dashboard/relatorios/radar" />
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 24px 80px' }}>
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 0.6fr)',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              padding: 18,
            }}
          >
            <div
              style={{
                color: DS.blueSoft,
                fontSize: 11,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              O que esta tela responde
            </div>
            <div style={{ color: DS.textPrimary, fontSize: 16, fontWeight: 800, lineHeight: 1.45 }}>
              O cenário comercial atual está ajudando, neutro ou pressionando a
              capacidade de gerar resultado agora?
            </div>
            <p style={{ margin: '9px 0 0', color: DS.textSecondary, fontSize: 12, lineHeight: 1.6 }}>
              O radar não calcula meta, previsão de faturamento nem nota do vendedor.
              Ele lê condições do momento para orientar a execução comercial.
            </p>
          </div>

          <div
            style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.24)',
              borderRadius: DS.radiusContainer,
              padding: 18,
            }}
          >
            <div
              style={{
                color: DS.blueSoft,
                fontSize: 11,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              Empresa analisada
            </div>
            <div style={{ color: DS.textPrimary, fontSize: 15, fontWeight: 800, lineHeight: 1.4 }}>
              {companyName ?? 'Empresa ativa'}
            </div>
            <p style={{ margin: '8px 0 0', color: DS.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
              A leitura sempre respeita a empresa ativa e o responsável comercial
              escolhido abaixo.
            </p>
          </div>
        </section>

        <section
          style={{
            background: DS.cardBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: '14px 18px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'flex-end',
            marginBottom: 22,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label
              style={{
                color: DS.textLabel,
                fontSize: 10,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Base histórica — início
            </label>
            <input
              type="date"
              value={dateStart}
              max={dateEnd}
              onChange={(event) => setDateStart(event.target.value)}
              style={{
                color: DS.textPrimary,
                background: DS.panelBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radius,
                padding: '8px 10px',
                fontSize: 13,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label
              style={{
                color: DS.textLabel,
                fontSize: 10,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Base histórica — fim
            </label>
            <input
              type="date"
              value={dateEnd}
              min={dateStart}
              max={getTodayDate()}
              onChange={(event) => setDateEnd(event.target.value)}
              style={{
                color: DS.textPrimary,
                background: DS.panelBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radius,
                padding: '8px 10px',
                fontSize: 13,
              }}
            />
          </div>

          {canChooseOwner && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label
                style={{
                  color: DS.textLabel,
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Responsável comercial
              </label>
              <select
                value={selectedSellerId ?? ''}
                onChange={(event) => setSelectedSellerId(event.target.value || null)}
                style={{
                  color: DS.textPrimary,
                  background: DS.panelBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  padding: '8px 10px',
                  fontSize: 13,
                  minWidth: 210,
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

          <div
            style={{
              flex: '1 1 260px',
              color: DS.textMuted,
              fontSize: 11,
              lineHeight: 1.55,
              paddingBottom: 2,
            }}
          >
            O período acima é apenas a base de comparação. A data avaliada pelo radar
            é sempre o momento atual.
          </div>
        </section>

        {dataLoading && (
          <div style={{ color: DS.textSecondary, textAlign: 'center', padding: 34, fontSize: 13 }}>
            Atualizando a leitura do cenário comercial...
          </div>
        )}

        {dataError && (
          <div
            style={{
              color: DS.redSoft,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: DS.radius,
              padding: 14,
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {dataError}
          </div>
        )}

        {!dataLoading && radar && status && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section
              style={{
                background: status.bg,
                border: `1px solid ${status.color}45`,
                borderLeft: `4px solid ${status.color}`,
                borderRadius: DS.radiusContainer,
                padding: '24px 26px',
              }}
            >
              <div
                style={{
                  color: status.color,
                  fontSize: 11,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                {status.eyebrow}
              </div>

              <h2
                style={{
                  color: DS.textPrimary,
                  fontSize: 26,
                  letterSpacing: '-0.03em',
                  margin: 0,
                  fontWeight: 900,
                }}
              >
                {status.title}
              </h2>

              <p
                style={{
                  margin: '10px 0 0',
                  color: DS.textSecondary,
                  lineHeight: 1.65,
                  fontSize: 14,
                  maxWidth: 820,
                }}
              >
                {status.definition}
              </p>

              <div
                style={{
                  marginTop: 16,
                  borderTop: `1px solid ${status.color}30`,
                  paddingTop: 14,
                  color: DS.textPrimary,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ color: status.color }}>Direcionamento:</strong> {status.action}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <Metric label="Referência" value={formatDateBR(radar.reference_date)} />
                <Metric label="Confiança" value={radar.confidence_label} color={status.color} />
                <Metric label="Dia atual" value={radar.current_weekday} />
                <Metric label="Semana atual" value={`${radar.current_month_week}ª`} />
              </div>
            </section>

            <section>
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    color: DS.blueSoft,
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  Por que o cenário está assim
                </div>
                <p style={{ margin: '6px 0 0', color: DS.textSecondary, fontSize: 13, lineHeight: 1.55 }}>
                  A classificação usa somente os sinais abaixo que têm base histórica
                  suficiente. Cada card mostra exatamente o que foi comparado e quanto
                  ele influenciou na leitura.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <Metric
                  label="Sinais que classificam"
                  value={radar.signals_available}
                  color={DS.textPrimary}
                />
                <Metric label="A favor" value={radar.signals_positive} color={DS.green} />
                <Metric label="Pressionando" value={radar.signals_negative} color={DS.red} />
                <Metric label="Sem direção" value={radar.signals_neutral} color={DS.amber} />
                <Metric label="Sem base" value={radar.signals_unavailable} color={DS.textMuted} />
                <Metric
                  label="Apenas contexto"
                  value={radar.signals.filter((signal) => signal.id === 'active_pipeline').length}
                  color={DS.blueSoft}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 12,
                }}
              >
                {radar.signals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
              </div>
            </section>

            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
              }}
            >
              <div
                style={{
                  background: DS.cardBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radiusContainer,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    color: DS.blueSoft,
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: 8,
                  }}
                >
                  Como usar este radar
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    color: DS.textSecondary,
                    fontSize: 12,
                    lineHeight: 1.75,
                  }}
                >
                  <li>Leia primeiro o status e o direcionamento.</li>
                  <li>Veja os sinais que estão ajudando ou pressionando.</li>
                  <li>Transforme a leitura em execução no Kanban, agenda e follow-up.</li>
                </ol>
              </div>

              <div
                style={{
                  background: DS.cardBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radiusContainer,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    color: DS.blueSoft,
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: 8,
                  }}
                >
                  O que ele não mede
                </div>
                <p style={{ margin: 0, color: DS.textSecondary, fontSize: 12, lineHeight: 1.65 }}>
                  Não substitui o Simulador de Meta, o Faturamento nem os relatórios de
                  conversão. Ele não prevê um valor de venda e não avalia sozinho a
                  qualidade de um vendedor.
                </p>
              </div>
            </section>

            <section
              style={{
                background: DS.cardBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusContainer,
                padding: '16px 18px',
              }}
            >
              <details>
                <summary
                  style={{
                    cursor: 'pointer',
                    color: DS.textPrimary,
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Ver detalhamento técnico e rastreabilidade
                </summary>

                <div
                  style={{
                    marginTop: 14,
                    borderTop: `1px solid ${DS.border}`,
                    paddingTop: 14,
                    color: DS.textSecondary,
                    fontSize: 12,
                    lineHeight: 1.65,
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    Base histórica analisada: {formatDateBR(radar.period_start)} até{' '}
                    {formatDateBR(radar.period_end)}.
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      font: 'inherit',
                      color: DS.textMuted,
                    }}
                  >
                    {radar.diagnostico}
                  </pre>
                </div>
              </details>
            </section>
          </div>
        )}

        {!dataLoading && !radar && !dataError && (
          <div style={{ color: DS.textMuted, textAlign: 'center', padding: 40, fontSize: 13 }}>
            Escolha uma base histórica para gerar a leitura do cenário comercial.
          </div>
        )}
      </div>
    </main>
  )
}
