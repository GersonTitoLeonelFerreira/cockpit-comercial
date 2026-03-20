'use client'

import React from 'react'

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HELPERS (shared — single source of truth)
// ============================================================================

export function toBRL(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function getRevenueStatus(pacingRatio: number): RevenueStatus {
  if (pacingRatio >= 1) return 'no_ritmo'
  if (pacingRatio >= 0.9) return 'atencao'
  return 'acelerar'
}

export function statusLabel(s: RevenueStatus): string {
  if (s === 'no_ritmo') return '✅ No ritmo'
  if (s === 'atencao') return '⚠️ Atenção'
  return '🚨 Acelerar'
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

// ============================================================================
// MetaCard — individual card (unifies RevenueCard + Card)
// ============================================================================

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
  const border =
    tone === 'good'
      ? '1px solid #1f5f3a'
      : tone === 'bad'
        ? '1px solid #5f1f1f'
        : '1px solid #2a2a2a'
  const bg = tone === 'good' ? '#07140c' : tone === 'bad' ? '#140707' : '#0f0f0f'

  return (
    <div style={{ border, background: bg, borderRadius: 14, padding: 14, minHeight: 92 }}>
      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.2 }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>{subtitle}</div> : null}
    </div>
  )
}

// ============================================================================
// MetaSummaryHeader — row of 5 KPI cards (single source of truth)
// ============================================================================

export default function MetaSummaryHeader({
  title,
  kpis,
}: {
  title: string
  kpis: MetaSummaryKpis
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 900, opacity: 0.9 }}>{title}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
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
        <MetaCard
          title="Status (pacing)"
          value={statusLabel(kpis.status)}
          subtitle={`Projeção: ${toBRL(kpis.projection)} (${Math.round(kpis.pacingRatio * 100)}% da meta)`}
          tone={statusTone(kpis.status)}
        />
      </div>
    </div>
  )
}
