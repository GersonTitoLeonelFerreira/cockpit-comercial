'use client'

import React from 'react'

export type Tone = 'neutral' | 'good' | 'bad'
export type RevenueStatus = 'no_ritmo' | 'atencao' | 'acelerar'

export type MetaSummaryKpis = {
  totalReal: number
  goal: number
  gap: number
  requiredPerBD: number
  businessDaysRemaining: number
  projection: number
  pacingRatio: number
  status: RevenueStatus
}

export function toBRL(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function getRevenueStatus(pacingRatio: number): RevenueStatus {
  if (pacingRatio >= 1) return 'no_ritmo'
  if (pacingRatio >= 0.9) return 'atencao'
  return 'acelerar'
}

export function statusLabel(s: RevenueStatus): string {
  if (s === 'no_ritmo') return 'No ritmo'
  if (s === 'atencao') return 'Atenção'
  return 'Acelerar'
}

export function statusTone(s: RevenueStatus): Tone {
  if (s === 'no_ritmo') return 'good'
  if (s === 'atencao') return 'neutral'
  return 'bad'
}

export function buildMetaSummaryKpis(
  totalReal: number,
  goal: number,
  businessDaysRemaining: number,
  projection: number,
): MetaSummaryKpis {
  const safeGoal = Math.max(0, Number(goal) || 0)
  const safeReal = Math.max(0, Number(totalReal) || 0)

  const gap = Math.max(0, safeGoal - safeReal)
  const requiredPerBD = businessDaysRemaining > 0 ? gap / businessDaysRemaining : gap

  const pacingRatio = safeGoal > 0 ? projection / safeGoal : 0
  const status = getRevenueStatus(pacingRatio)

  return {
    totalReal: safeReal,
    goal: safeGoal,
    gap,
    requiredPerBD,
    businessDaysRemaining,
    projection,
    pacingRatio,
    status,
  }
}

export function MetaCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: React.ReactNode
  value: React.ReactNode
  subtitle?: React.ReactNode
  tone?: Tone
}) {
  const accentColor =
    tone === 'good' ? '#10b981' : tone === 'bad' ? '#ef4444' : '#3b82f6'

  return (
    <div
      style={{
        border: `1px solid ${accentColor}22`,
        background: 'linear-gradient(180deg, rgba(10,14,22,0.98) 0%, rgba(8,12,18,0.98) 100%)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(2,6,23,0.18)`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#8fa3bc',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          letterSpacing: '0.02em',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 900,
          letterSpacing: -0.2,
          color: '#edf2f7',
        }}
      >
        {value}
      </div>
      {subtitle ? (
        <div style={{ marginTop: 5, fontSize: 11, color: '#546070', lineHeight: 1.4 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  )
}

function StatusIcon({ status }: { status: RevenueStatus }) {
  if (status === 'no_ritmo') {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    )
  }
  if (status === 'atencao') {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  }
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export default function MetaSummaryHeader({
  title,
  kpis,
}: {
  title: string
  kpis: MetaSummaryKpis
}) {
  const statusColor =
    kpis.status === 'no_ritmo' ? '#10b981' : kpis.status === 'atencao' ? '#f59e0b' : '#ef4444'

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        padding: '18px 18px',
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(12,16,24,0.98) 0%, rgba(9,11,15,0.98) 100%)',
        border: '1px solid rgba(59,130,246,0.16)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 32px rgba(2,6,23,0.24)',
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: '#edf2f7',
          fontSize: 13,
          paddingLeft: 12,
          borderLeft: '2px solid rgba(59,130,246,0.55)',
          letterSpacing: '0.01em',
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MetaCard title="Real no período" value={toBRL(kpis.totalReal)} />
        <MetaCard title="Meta do período" value={toBRL(kpis.goal)} />
        <MetaCard
          title="Gap (falta)"
          value={toBRL(kpis.gap)}
          tone={kpis.gap <= 0 ? 'good' : 'neutral'}
        />
        <MetaCard
          title="R$/dia útil (restante)"
          value={toBRL(kpis.requiredPerBD)}
          subtitle={`${kpis.businessDaysRemaining} dias úteis restantes`}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'linear-gradient(180deg, rgba(10,14,22,0.96) 0%, rgba(8,12,18,0.98) 100%)',
          border: `1px solid ${statusColor}24`,
          boxShadow: `0 0 0 1px ${statusColor}08, inset 0 1px 0 rgba(255,255,255,0.03)`,
        }}
      >
        <StatusIcon status={kpis.status} />
        <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
          {statusLabel(kpis.status)}
        </span>
        <div style={{ width: 1, height: 14, background: '#1a1d2e', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#8fa3bc' }}>
          Projeção: <b style={{ color: '#edf2f7' }}>{toBRL(kpis.projection)}</b> ({Math.round(kpis.pacingRatio * 100)}% da meta)
        </span>
        <div style={{ width: 1, height: 14, background: '#1a1d2e', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#546070' }}>
          {kpis.businessDaysRemaining} dias úteis restantes
        </span>
      </div>
    </div>
  )
}