'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useState } from 'react'
import { getBusinessDateKey, shiftDateKey } from '@/app/lib/services/executionDayMath'

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

const EVENT_PAGE_SIZE = 1000

type SellerMicroKPIsProps = {
  scope: KanbanScope
  companyId: string
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
  companyId,
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
      const periodDays = 7
      const todayKey = getBusinessDateKey()
      const periodStartKey = shiftDateKey(todayKey, -(periodDays - 1))
      const todayStart = new Date(`${todayKey}T00:00:00-03:00`).toISOString()
      const todayEnd = new Date(`${todayKey}T23:59:59.999-03:00`).toISOString()
      const periodStart = new Date(`${periodStartKey}T00:00:00-03:00`).toISOString()

      const rows: Array<{
        id: string
        cycle_id: string | null
        event_type: string
        occurred_at: string
      }> = []
      let from = 0

      while (true) {
        const { data, error } = await supabase
          .from('cycle_events')
          .select('id, cycle_id, event_type, occurred_at')
          .eq('company_id', companyId)
          .eq('created_by', ownerUserId)
          .gte('occurred_at', periodStart)
          .lte('occurred_at', todayEnd)
          .order('occurred_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + EVENT_PAGE_SIZE - 1)

        if (error) throw error

        const page = (data ?? []) as typeof rows
        rows.push(...page)

        if (page.length < EVENT_PAGE_SIZE) break
        from += EVENT_PAGE_SIZE
      }
      const movedTypes = new Set(['stage_checkpoint', 'stage_changed', 'stage_moved'])
      const workedPeriod = new Set(rows.map((row) => row.cycle_id).filter(Boolean)).size
      const advancedPeriod = new Set(
        rows.filter((row) => movedTypes.has(row.event_type)).map((row) => row.cycle_id).filter(Boolean),
      ).size
      const todayRows = rows.filter(
        (row) => row.occurred_at >= todayStart && row.occurred_at <= todayEnd,
      )

      setKpis({
        worked_today: new Set(todayRows.map((row) => row.cycle_id).filter(Boolean)).size,
        overdue_count: 0,
        scheduled_today: 0,
        stage_moves_today: todayRows.filter((row) => movedTypes.has(row.event_type)).length,
        worked_period: workedPeriod,
        won_period: advancedPeriod,
        advance_rate: workedPeriod > 0 ? Number(((advancedPeriod / workedPeriod) * 100).toFixed(1)) : 0,
        period_days: periodDays,
      })
    } catch (e: any) {
      console.error('SellerMicroKPIs error:', e)
      setKpis(null)
    } finally {
      setLoading(false)
    }
  }, [scope, companyId, ownerUserId, supabase])

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
          label: `Avanço ${periodDays}d`,
          value: hasConv ? `${kpis!.advance_rate}%` : '—',
          accent: conversionAccent,
          title: `${kpis.won_period ?? 0} de ${kpis.worked_period ?? 0} oportunidades tiveram avanço nos últimos ${periodDays} dias`,
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
