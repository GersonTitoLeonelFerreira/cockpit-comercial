'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useState } from 'react'

type MicroKPIs = {
  worked_today: number
  overdue_count: number
  scheduled_today: number
  stage_moves_today: number
  advance_rate: number
  period_days: number
  worked_period?: number
  won_period?: number
}

export type AlertChip = {
  key: 'overdue' | 'danger' | 'today' | 'next7'
  label: string
  value: number
  active?: boolean
}

type KanbanScope = 'mine' | 'seller' | 'company'

type SellerMicroKPIsProps = {
  scope: KanbanScope
  ownerUserId: string | null
  groupId?: string | null
  supabase: any
  refreshKey?: number
  alerts?: AlertChip[]
  onAlertClick?: (key: AlertChip['key']) => void
  onToggleInsights?: () => void
  insightsExpanded?: boolean
}

const DS = {
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  cardBg: '#141722',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  divider: '#1f2330',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
} as const

export default function SellerMicroKPIs({
  scope,
  ownerUserId,
  supabase,
  refreshKey,
  alerts = [],
  onAlertClick,
  onToggleInsights,
  insightsExpanded = false,
}: SellerMicroKPIsProps) {
  const [kpis, setKpis] = useState<MicroKPIs | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (scope === 'company' || !ownerUserId) {
      setKpis(null)
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.rpc('rpc_seller_micro_kpis', {
        p_owner_user_id: ownerUserId,
        p_days: 7,
      })

      if (error) throw error

      setKpis(data as MicroKPIs)
    } catch (e: any) {
      console.error('SellerMicroKPIs error:', e)
      setKpis(null)
    } finally {
      setLoading(false)
    }
  }, [scope, ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const hasConv = kpis && typeof kpis.advance_rate === 'number'
  const periodDays = kpis?.period_days ?? 7
  const conversionAccent =
    !hasConv ? DS.textSecondary : kpis!.advance_rate >= 10 ? '#86efac' : kpis!.advance_rate >= 5 ? '#fde68a' : '#fca5a5'

  const productivityStats: { label: string; value: string | number; title?: string; accent?: string }[] = kpis
    ? [
        { label: 'Trabalhados', value: kpis.worked_today ?? 0, title: 'Ciclos com atividade hoje' },
        { label: 'Movidos', value: kpis.stage_moves_today ?? 0, title: 'Movimentos de etapa hoje' },
        {
          label: `Conversão ${periodDays}d`,
          value: hasConv ? `${kpis!.advance_rate}%` : '—',
          accent: conversionAccent,
          title: `${kpis.won_period ?? 0} de ${kpis.worked_period ?? 0} leads convertidos nos últimos ${periodDays} dias`,
        },
      ]
    : []

  const alertColor = (key: AlertChip['key'], value: number) => {
    if (value === 0) return DS.textMuted
    switch (key) {
      case 'overdue':
        return '#fca5a5'
      case 'danger':
        return '#fcd34d'
      case 'today':
        return '#93c5fd'
      case 'next7':
        return '#c4b5fd'
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(17,21,29,0.92), rgba(13,15,20,0.96))',
        border: '1px solid #1f2635',
        borderRadius: 11,
        padding: '8px 12px',
        marginTop: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 42,
        flexWrap: 'wrap',
        boxShadow: '0 8px 22px rgba(0,0,0,0.14)',
      }}
    >
      {/* Produtividade */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
      {loading ? (
          <span style={{ color: DS.textMuted }}>Carregando...</span>
        ) : scope === 'company' ? (
          <span style={{ color: DS.textMuted }}>
            Produtividade individual: selecione um vendedor
          </span>
        ) : productivityStats.length > 0 ? (
          productivityStats.map((s) => (
            <div key={s.label} title={s.title} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: DS.textMuted, fontSize: 10.5 }}>{s.label}</span>
              <span style={{ color: s.accent ?? DS.textPrimary, fontWeight: 700 }}>{s.value}</span>
            </div>
          ))
        ) : (
          <span style={{ color: DS.textMuted }}>Sem dados de produtividade</span>
        )}
      </div>

      <div style={{ width: 1, height: 16, background: DS.divider }} />

      {/* Alertas (clicáveis = filtros) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {alerts.map((chip) => {
          const color = alertColor(chip.key, chip.value)
          const isActive = chip.active
          return (
            <button
              key={chip.key}
              onClick={() => onAlertClick?.(chip.key)}
              style={{
                background: isActive ? `${color}15` : 'transparent',
                border: `1px solid ${isActive ? color : DS.border}`,
                borderRadius: 7,
                padding: '4px 9px',
                fontSize: 10.5,
                color: chip.value > 0 ? color : DS.textMuted,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.4,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              title={`Filtrar por ${chip.label.toLowerCase()}`}
            >
              <span style={{ color: DS.textMuted, fontWeight: 500 }}>{chip.label}</span>
              <span style={{ fontWeight: 700 }}>{chip.value}</span>
            </button>
          )
        })}
      </div>

      {onToggleInsights && (
        <>
          <div style={{ width: 1, height: 16, background: DS.divider }} />
          <button
            onClick={onToggleInsights}
            style={{
              background: 'transparent',
              border: 'none',
              color: DS.textSecondary,
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '3px 6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={insightsExpanded ? 'Ocultar listas detalhadas' : 'Ver listas detalhadas'}
          >
            {insightsExpanded ? '▾' : '▸'} Detalhes
          </button>
        </>
      )}
    </div>
  )
}
