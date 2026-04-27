'use client'

import React from 'react'
import type {
  DailyGoalDistribution,
  DistributionConfidence,
  OperationalFocusType,
} from '@/app/types/distribution'

const DISTRIBUTION_UI = {
  surface: '#0d0f14',
  surfaceSoft: '#10131a',
  surfaceElevated: '#121621',
  borderSoft: 'rgba(148, 163, 184, 0.10)',
  borderMuted: 'rgba(148, 163, 184, 0.07)',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  blue: '#60a5fa',
  green: '#86efac',
  amber: '#fbbf24',
  red: '#fca5a5',
  purple: '#c4b5fd',
} as const

const FOCUS_COLORS: Record<OperationalFocusType, string> = {
  prospeccao: DISTRIBUTION_UI.blue,
  followup: DISTRIBUTION_UI.amber,
  negociacao: DISTRIBUTION_UI.purple,
  fechamento: DISTRIBUTION_UI.green,
  neutro: DISTRIBUTION_UI.textSubtle,
}

const FOCUS_LABELS: Record<OperationalFocusType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
  neutro: 'Neutro',
}

const CONFIDENCE_COLORS: Record<DistributionConfidence, string> = {
  alta: DISTRIBUTION_UI.green,
  moderada: DISTRIBUTION_UI.amber,
  baixa: DISTRIBUTION_UI.red,
  insuficiente: DISTRIBUTION_UI.textSubtle,
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })
}

function formatDay(date: string) {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  return `${parts[2]}/${parts[1]}`
}

function getSignalBusinessLabel(source: string) {
  const normalized = source.toLowerCase()

  if (normalized.includes('vocação') || normalized.includes('weekday')) {
    return 'Histórico por dia da semana'
  }

  if (normalized.includes('sazonalidade') || normalized.includes('seasonality')) {
    return 'Sazonalidade mensal'
  }

  if (normalized.includes('radar')) {
    return 'Radar do período'
  }

  if (normalized.includes('semana')) {
    return 'Comportamento da semana'
  }

  return 'Critério operacional'
}

function cleanText(value?: string | null) {
  return String(value ?? '')
    .replace(/^[\s✅⚠️❌🔥📌📊📈📉💡⭐•-]+/gu, '')
    .replace(/Fases?\s*6(?:\.\d+)?(?:[–-]\d(?:\.\d+)?)?/gi, 'histórico operacional')
    .replace(/das Fases 6\.1[–-]6\.5/gi, 'do histórico operacional')
    .replace(/Fase 6\.\d+/gi, 'histórico operacional')
    .replace(/sinal\(is\) estatístico\(s\)/gi, 'critério(s) operacional(is)')
    .replace(/sinais estatísticos/gi, 'critérios operacionais')
    .replace(/sinal estatístico/gi, 'critério operacional')
    .replace(/fallback/gi, 'plano conservador')
    .replace(/distribuição uniforme/gi, 'distribuição conservadora')
    .replace(/\s+/g, ' ')
    .trim()
}

function getConfidenceBusinessLabel(confidence: DistributionConfidence, available: boolean) {
  if (!available) return 'ausente'

  const map: Record<DistributionConfidence, string> = {
    alta: 'forte',
    moderada: 'moderada',
    baixa: 'limitada',
    insuficiente: 'insuficiente',
  }

  return map[confidence]
}

function StatusIcon({
  tone = 'neutral',
}: {
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? DISTRIBUTION_UI.green
      : tone === 'warn'
        ? DISTRIBUTION_UI.amber
        : tone === 'bad'
          ? DISTRIBUTION_UI.red
          : DISTRIBUTION_UI.blue

  if (tone === 'warn') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        <path
          d="M12 3.5 21 20H3L12 3.5Z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 9v5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17.5h.01" stroke={color} strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }

  if (tone === 'good') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        <circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2" />
        <path d="m8.5 12.2 2.2 2.2 4.8-5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (tone === 'bad') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        <circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2" />
        <path d="M9 9l6 6M15 9l-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: 2 }}
    >
      <circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth="2" />
      <path d="M12 10.5v5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7.5h.01" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function getObservationTone(text: string): 'good' | 'warn' | 'bad' | 'neutral' {
  const normalized = text.toLowerCase()

  if (
    normalized.includes('atenção') ||
    normalized.includes('risco') ||
    normalized.includes('baixa') ||
    normalized.includes('insuficiente') ||
    normalized.includes('conservador') ||
    normalized.includes('base ausente') ||
    normalized.includes('base limitada')
  ) {
    return 'warn'
  }

  if (
    normalized.includes('acima') ||
    normalized.includes('favorável') ||
    normalized.includes('adequado') ||
    normalized.includes('base forte')
  ) {
    return 'good'
  }

  if (
    normalized.includes('erro') ||
    normalized.includes('crítico') ||
    normalized.includes('inválido')
  ) {
    return 'bad'
  }

  return 'neutral'
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'good' | 'bad' | 'neutral' | 'warn'
}) {
  const valueColor =
    tone === 'good'
      ? DISTRIBUTION_UI.green
      : tone === 'bad'
        ? DISTRIBUTION_UI.red
        : tone === 'warn'
          ? DISTRIBUTION_UI.amber
          : DISTRIBUTION_UI.textPrimary

  return (
    <div
      style={{
        border: `1px solid ${DISTRIBUTION_UI.borderMuted}`,
        background: 'rgba(9, 11, 15, 0.46)',
        borderRadius: 14,
        padding: '14px',
        minHeight: 96,
        display: 'grid',
        alignContent: 'space-between',
        gap: 8,
      }}
    >
      <div
        style={{
          color: DISTRIBUTION_UI.textSubtle,
          fontSize: 11.5,
          fontWeight: 850,
          textTransform: 'uppercase',
          letterSpacing: '0.045em',
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: valueColor,
          fontSize: 23,
          fontWeight: 950,
          letterSpacing: -0.45,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>

      {sub ? (
        <div
          style={{
            color: DISTRIBUTION_UI.textSubtle,
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        border: `1px solid ${DISTRIBUTION_UI.borderMuted}`,
        background: 'rgba(9, 11, 15, 0.38)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            color: DISTRIBUTION_UI.textPrimary,
            fontSize: 13.5,
            fontWeight: 900,
            letterSpacing: -0.15,
          }}
        >
          {title}
        </div>

        {description ? (
          <div
            style={{
              color: DISTRIBUTION_UI.textSubtle,
              fontSize: 12.5,
              lineHeight: 1.45,
              maxWidth: 760,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      {children}
    </div>
  )
}

function FocusChip({
  type,
  count,
}: {
  type: OperationalFocusType
  count: number
}) {
  const color = FOCUS_COLORS[type]

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: `1px solid ${color}26`,
        background: 'rgba(15, 18, 26, 0.74)',
        borderRadius: 999,
        padding: '7px 10px',
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 0 4px ${color}18`,
          flexShrink: 0,
        }}
      />

      <span
        style={{
          color,
          fontWeight: 850,
        }}
      >
        {FOCUS_LABELS[type]}
      </span>

      <span
        style={{
          color: DISTRIBUTION_UI.textSubtle,
          fontWeight: 750,
        }}
      >
        {count} dia{count !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

interface SimulatorDistributionSummaryProps {
  distribution: DailyGoalDistribution
}

export default function SimulatorDistributionSummary({
  distribution,
}: SimulatorDistributionSummaryProps) {
  const { summary, signals_used, observations, is_fallback, fallback_reason } = distribution

  const confidenceColor = CONFIDENCE_COLORS[summary.confidence]
  const peakDay = summary.peak_day

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${DISTRIBUTION_UI.borderSoft}`,
          background: `linear-gradient(135deg, ${DISTRIBUTION_UI.surfaceElevated} 0%, ${DISTRIBUTION_UI.surfaceSoft} 45%, ${DISTRIBUTION_UI.surface} 100%)`,
          borderRadius: 20,
          padding: 18,
          boxShadow: '0 14px 34px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 1,
            background: `linear-gradient(90deg, transparent, ${confidenceColor}66, transparent)`,
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                color: DISTRIBUTION_UI.textPrimary,
                fontSize: 16,
                fontWeight: 950,
                letterSpacing: -0.25,
                lineHeight: 1.2,
              }}
            >
              Distribuição do saldo restante
            </div>

            <div
              style={{
                marginTop: 6,
                color: DISTRIBUTION_UI.textMuted,
                fontSize: 13,
                lineHeight: 1.45,
                maxWidth: 780,
              }}
            >
              Traduz o esforço restante em dias de execução, foco operacional e carga diária até o fim do período.
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${confidenceColor}2e`,
              background: `${confidenceColor}14`,
              color: confidenceColor,
              borderRadius: 999,
              padding: '7px 11px',
              fontSize: 12,
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            Base: {getConfidenceBusinessLabel(summary.confidence, true)}
          </div>
        </div>

        {is_fallback && fallback_reason ? (
          <div
            style={{
              border: `1px solid rgba(245, 158, 11, 0.18)`,
              background: 'rgba(245, 158, 11, 0.08)',
              color: DISTRIBUTION_UI.amber,
              borderRadius: 14,
              padding: '10px 12px',
              fontSize: 12.5,
              lineHeight: 1.45,
              marginBottom: 16,
            }}
          >
            {cleanText(fallback_reason)}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}
        >
          <KpiCard
            label="Dias de execução"
            value={summary.total_working_days}
            sub="período configurado"
          />

          <KpiCard
            label="Leads distribuídos"
            value={summary.total_leads}
            sub={`${formatNumber(summary.avg_leads_per_day)} leads/dia de execução`}
          />

          <KpiCard
            label="Ganhos previstos"
            value={summary.total_wins}
            sub={`${formatNumber(summary.avg_wins_per_day)} ganhos/dia de execução`}
            tone="good"
          />

          {peakDay ? (
            <KpiCard
              label="Dia de maior carga"
              value={`${peakDay.weekday_short} ${formatDay(peakDay.date)}`}
              sub={`${peakDay.leads_goal} leads · ${peakDay.focus_label}`}
              tone="warn"
            />
          ) : (
            <KpiCard
              label="Dia de maior carga"
              value="—"
              sub="sem pico identificado"
            />
          )}
        </div>
      </div>

      <Panel
        title="Dias por foco operacional"
        description="Mostra como o calendário está distribuído entre prospecção, follow-up, negociação e fechamento."
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {(Object.entries(summary.focus_distribution) as [OperationalFocusType, number][])
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <FocusChip key={type} type={type} count={count} />
            ))}
        </div>
      </Panel>

      <Panel
        title="Leituras usadas na distribuição"
        description="Mostra quais bases foram consideradas para montar a carga diária do período."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {signals_used.map((signal) => {
            const signalColor = signal.available
              ? CONFIDENCE_COLORS[signal.confidence]
              : DISTRIBUTION_UI.textSubtle

            const signalTone =
              !signal.available
                ? 'warn'
                : signal.confidence === 'alta'
                  ? 'good'
                  : signal.confidence === 'baixa' || signal.confidence === 'insuficiente'
                    ? 'warn'
                    : 'neutral'

            return (
              <div
                key={signal.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 10,
                  alignItems: 'flex-start',
                  border: `1px solid ${DISTRIBUTION_UI.borderMuted}`,
                  background: signal.available ? 'rgba(15, 18, 26, 0.62)' : 'rgba(15, 18, 26, 0.34)',
                  borderRadius: 14,
                  padding: '11px 12px',
                  opacity: signal.available ? 1 : 0.72,
                }}
              >
                <StatusIcon tone={signalTone} />

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        color: DISTRIBUTION_UI.textSecondary,
                        fontSize: 12.5,
                        fontWeight: 850,
                        lineHeight: 1.3,
                      }}
                    >
                      {signal.label}
                    </span>

                    <span
                      style={{
                        color: DISTRIBUTION_UI.textSubtle,
                        fontSize: 11.5,
                        fontWeight: 750,
                      }}
                    >
                      {getSignalBusinessLabel(signal.source)}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      color: DISTRIBUTION_UI.textSubtle,
                      fontSize: 12.2,
                      lineHeight: 1.45,
                    }}
                  >
                    {cleanText(signal.available ? signal.description : signal.fallback_reason)}
                  </div>
                </div>

                <span
                  style={{
                    border: `1px solid ${signalColor}24`,
                    background: `${signalColor}10`,
                    color: signalColor,
                    borderRadius: 999,
                    padding: '4px 8px',
                    fontSize: 10.5,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {signal.available
                    ? `Base ${getConfidenceBusinessLabel(signal.confidence, true)}`
                    : 'Base ausente'}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>

      {observations.length > 0 ? (
        <Panel
          title="Observações gerenciais"
          description="Pontos de atenção para interpretar a distribuição sem transformar o calendário em regra cega."
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {observations.map((obs, index) => {
              const cleanedObservation = cleanText(obs)
              const tone = getObservationTone(cleanedObservation)

              return (
                <div
                  key={`${obs}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: 10,
                    alignItems: 'flex-start',
                    border: `1px solid ${DISTRIBUTION_UI.borderMuted}`,
                    background: 'rgba(15, 18, 26, 0.58)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    color: DISTRIBUTION_UI.textMuted,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  <StatusIcon tone={tone} />
                  <span>{cleanedObservation}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
