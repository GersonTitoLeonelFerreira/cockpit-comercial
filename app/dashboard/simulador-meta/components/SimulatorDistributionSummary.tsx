'use client'

import React from 'react'
import type {
  DailyGoalDistribution,
  DistributionConfidence,
  OperationalFocusType,
} from '@/app/types/distribution'

// ==============================================================================
// Helpers
// ==============================================================================

const FOCUS_COLORS: Record<OperationalFocusType, string> = {
  prospeccao: '#3b82f6',
  followup: '#f59e0b',
  negociacao: '#8b5cf6',
  fechamento: '#10b981',
  neutro: '#6b7280',
}

const FOCUS_LABELS: Record<OperationalFocusType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
  neutro: 'Neutro',
}

const CONFIDENCE_COLORS: Record<DistributionConfidence, string> = {
  alta: '#10b981',
  moderada: '#f59e0b',
  baixa: '#ef4444',
  insuficiente: '#6b7280',
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'good' | 'bad' | 'neutral' | 'warn'
}) {
  const color =
    tone === 'good'
      ? '#10b981'
      : tone === 'bad'
      ? '#ef4444'
      : tone === 'warn'
      ? '#f59e0b'
      : '#e8e8e8'
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, opacity: 0.6 }}>{sub}</div> : null}
    </div>
  )
}

// ==============================================================================
// Main component
// ==============================================================================

interface SimulatorDistributionSummaryProps {
  distribution: DailyGoalDistribution
}

export default function SimulatorDistributionSummary({
  distribution,
}: SimulatorDistributionSummaryProps) {
  const { summary, signals_used, observations, is_fallback, fallback_reason } = distribution

  const confidenceColor = CONFIDENCE_COLORS[summary.confidence]

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header: confiança e fallback */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderRadius: 10,
          background: is_fallback ? '#1a1500' : '#0a1a0f',
          border: `1px solid ${is_fallback ? '#a16207' : '#14532d'}`,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: confidenceColor,
            flexShrink: 0,
          }}
        />
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: confidenceColor }}>
            Confiança: {summary.confidence_label}
          </span>
          {is_fallback && fallback_reason ? (
            <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 10 }}>{fallback_reason}</span>
          ) : null}
        </div>
      </div>

      {/* KPIs da distribuição */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        <KpiCard
          label="Dias úteis"
          value={summary.total_working_days}
          sub="no período configurado"
        />
        <KpiCard
          label="Total de leads"
          value={summary.total_leads}
          sub={`${summary.avg_leads_per_day} leads/dia`}
          tone="neutral"
        />
        <KpiCard
          label="Total de ganhos"
          value={summary.total_wins}
          sub={`${summary.avg_wins_per_day} ganhos/dia`}
          tone="good"
        />
        {summary.peak_day ? (
          <KpiCard
            label="Dia pico"
            value={`${summary.peak_day.weekday_short} ${summary.peak_day.date.slice(8)}`}
            sub={`${summary.peak_day.leads_goal} leads · ${summary.peak_day.focus_label}`}
            tone="warn"
          />
        ) : null}
      </div>

      {/* Distribuição por foco */}
      <div
        style={{
          background: '#0d0d0d',
          border: '1px solid #1a1a1a',
          borderRadius: 10,
          padding: '14px 16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Dias por foco operacional
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {(Object.entries(summary.focus_distribution) as [OperationalFocusType, number][])
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div
                key={type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#111',
                  border: `1px solid ${FOCUS_COLORS[type]}33`,
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: FOCUS_COLORS[type],
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: FOCUS_COLORS[type], fontWeight: 600 }}>
                  {FOCUS_LABELS[type]}
                </span>
                <span style={{ opacity: 0.7 }}>{count} dia{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Sinais utilizados */}
      <div
        style={{
          background: '#0d0d0d',
          border: '1px solid #1a1a1a',
          borderRadius: 10,
          padding: '14px 16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Sinais utilizados
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {signals_used.map((signal) => (
            <div
              key={signal.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 12,
                opacity: signal.available ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: signal.available ? CONFIDENCE_COLORS[signal.confidence] : '#444',
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>
                  {signal.label}
                  <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 6 }}>
                    ({signal.source})
                  </span>
                </div>
                <div style={{ opacity: 0.7, marginTop: 2 }}>
                  {signal.available ? signal.description : signal.fallback_reason}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observações gerenciais */}
      {observations.length > 0 ? (
        <div
          style={{
            background: '#0d0d0d',
            border: '1px solid #1a1a1a',
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Observações gerenciais
          </div>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {observations.map((obs, i) => (
              <li key={i} style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
                {obs}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </div>
  )
}
