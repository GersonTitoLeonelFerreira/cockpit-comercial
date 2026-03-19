'use client'

import React, { useCallback, useEffect, useState } from 'react'

type MicroKPIs = {
  worked_today: number
  overdue_count: number
  scheduled_today: number
  stage_moves_today: number
  advance_rate: number
  period_days: number
}

type SellerMicroKPIsProps = {
  userId: string
  groupId?: string | null
  supabase: any
  refreshKey?: number
}

type KPICard = {
  label: string
  value: string | number
  color: string
  bg: string
  icon: string
  title?: string
}

export default function SellerMicroKPIs({ userId, supabase, refreshKey }: SellerMicroKPIsProps) {
  const [kpis, setKpis] = useState<MicroKPIs | null>(null)
  const [loading, setLoading] = useState(true)

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
          padding: '10px 20px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          borderBottom: '1px solid #222',
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 52,
              width: 120,
              background: '#1a1a1a',
              borderRadius: 8,
              animation: 'pulse 1.5s infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (!kpis) return null

  const cards: KPICard[] = [
    {
      label: 'Trabalhados hoje',
      value: kpis.worked_today,
      color: '#a5f3fc',
      bg: '#0e7490',
      icon: '🔄',
      title: 'Ciclos com atividade hoje',
    },
    {
      label: 'Atrasados',
      value: kpis.overdue_count,
      color: kpis.overdue_count > 0 ? '#fca5a5' : '#6ee7b7',
      bg: kpis.overdue_count > 0 ? '#7f1d1d' : '#064e3b',
      icon: '⏰',
      title: 'Leads com agenda vencida',
    },
    {
      label: 'Agendados hoje',
      value: kpis.scheduled_today,
      color: '#93c5fd',
      bg: '#1e3a5f',
      icon: '📅',
      title: 'Contatos agendados para hoje',
    },
    {
      label: 'Etapas movidas',
      value: kpis.stage_moves_today,
      color: '#c4b5fd',
      bg: '#3b0764',
      icon: '🚀',
      title: 'Movimentos de etapa hoje',
    },
    {
      label: `Avanço ${kpis.period_days}d`,
      value: `${kpis.advance_rate}%`,
      color: kpis.advance_rate >= 50 ? '#6ee7b7' : kpis.advance_rate >= 25 ? '#fde68a' : '#fca5a5',
      bg: kpis.advance_rate >= 50 ? '#064e3b' : kpis.advance_rate >= 25 ? '#78350f' : '#7f1d1d',
      icon: '📈',
      title: `Taxa de avanço de etapa nos últimos ${kpis.period_days} dias`,
    },
  ]

  return (
    <div
      style={{
        padding: '10px 20px',
        display: 'flex',
        gap: 8,
        alignItems: 'stretch',
        borderBottom: '1px solid #222',
        flexWrap: 'wrap',
        background: '#0b0b0b',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          title={card.title}
          style={{
            background: card.bg,
            border: `1px solid ${card.color}33`,
            borderRadius: 8,
            padding: '8px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 110,
          }}
        >
          <div style={{ fontSize: 11, color: card.color, fontWeight: 700, opacity: 0.8 }}>
            {card.icon} {card.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: card.color, lineHeight: 1.1 }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}
