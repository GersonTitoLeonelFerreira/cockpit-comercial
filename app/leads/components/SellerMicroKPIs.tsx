'use client'

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

type SellerMicroKPIsProps = {
  userId: string
  groupId?: string | null
  supabase: any
  refreshKey?: number
}

const DS = {
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  cardBg: '#141722',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
} as const

type KPICard = {
  label: string
  value: string | number
  accent: string
  icon: string
  title?: string
}

export default function SellerMicroKPIs({ userId, supabase, refreshKey }: SellerMicroKPIsProps) {
  const [kpis, setKpis] = useState<MicroKPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('rpc_seller_micro_kpis', {
        p_owner_user_id: userId,
        p_days: 7,
      })
      if (error) throw error
      setKpis(data as MicroKPIs)
    } catch (e: any) {
      console.error('SellerMicroKPIs error:', e)
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  if (loading) {
    return (
      <div
        style={{
          padding: '0 16px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(180deg, rgba(13,15,20,0.98) 0%, rgba(9,11,15,0.96) 100%)',
          minHeight: 40,
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 24,
              width: 68,
              background: DS.borderSubtle,
              borderRadius: 8,
            }}
          />
        ))}
      </div>
    )
  }

  if (!kpis) return null

  const cards: KPICard[] = [
    {
      label: 'Trabalhados',
      value: kpis.worked_today,
      accent: '#60a5fa',
      icon: '*',
      title: 'Ciclos com atividade hoje',
    },
    {
      label: 'Atrasados',
      value: kpis.overdue_count,
      accent: kpis.overdue_count > 0 ? '#ef4444' : '#22c55e',
      icon: '!',
      title: 'Leads com agenda vencida',
    },
    {
      label: 'Agendados',
      value: kpis.scheduled_today,
      accent: '#3b82f6',
      icon: '>',
      title: 'Contatos agendados para hoje',
    },
    {
      label: 'Movidos',
      value: kpis.stage_moves_today,
      accent: '#8b5cf6',
      icon: '→',
      title: 'Movimentos de etapa hoje',
    },
    {
      label: `Conversão ${kpis.period_days}d`,
      value: `${kpis.advance_rate}%`,
      accent: kpis.advance_rate >= 10 ? '#22c55e' : kpis.advance_rate >= 5 ? '#eab308' : '#ef4444',
      icon: '↑',
      title: `Dos ${kpis.worked_period ?? 0} leads trabalhados nos últimos ${kpis.period_days} dias, ${kpis.won_period ?? 0} converteram em venda`,
    },
  ]

  return (
    <div
      style={{
        background: DS.panelBg,
        borderBottom: `1px solid ${DS.border}`,
      }}
    >
      <div
        style={{
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
          minHeight: 40,
          background: 'linear-gradient(180deg, rgba(13,15,20,0.98) 0%, rgba(9,11,15,0.96) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Recolher KPIs' : 'Expandir KPIs'}
      >
        <span
          style={{
            fontSize: 9,
            color: '#64748b',
            fontWeight: 800,
            marginRight: 2,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {expanded ? '▾' : '▸'} KPIS
        </span>

        {!expanded &&
          cards.map((card) => (
            <div
              key={card.label}
              title={card.title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: `linear-gradient(180deg, ${card.accent}14 0%, rgba(10,14,22,0.96) 100%)`,
                border: `1px solid ${card.accent}26`,
                borderRadius: 8,
                padding: '4px 9px',
                fontSize: 11,
                fontWeight: 800,
                color: card.accent,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                boxShadow: `0 0 0 1px ${card.accent}08, inset 0 1px 0 rgba(255,255,255,0.03)`,
              }}
            >
              <span style={{ fontSize: 9, opacity: 0.7 }}>{card.icon}</span>
              <span>{card.value}</span>
            </div>
          ))}
      </div>

      {expanded && (
        <div
          style={{
            padding: '10px 16px 12px',
            display: 'flex',
            gap: 10,
            alignItems: 'stretch',
            flexWrap: 'wrap',
            background: 'linear-gradient(180deg, rgba(13,15,20,0.98) 0%, rgba(9,11,15,0.96) 100%)',
          }}
        >
          {cards.map((card) => (
            <div
              key={card.label}
              title={card.title}
              style={{
                flex: '1 1 120px',
                background: 'linear-gradient(180deg, rgba(10,14,22,0.98) 0%, rgba(8,12,18,0.98) 100%)',
                border: `1px solid ${card.accent}22`,
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 110,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(2,6,23,0.18)`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: DS.textSecondary,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {card.icon} {card.label}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: card.accent,
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}