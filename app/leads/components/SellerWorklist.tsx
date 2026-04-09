'use client'

import React, { useState, useMemo } from 'react'

const DS = {
  panelBg: '#0d0f14',
  cardBg: '#141722',
  border: '#1a1d2e',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  radius: 7,
} as const

const STATUS_COLORS: Record<string, string> = {
  novo: '#3b82f6',
  contato: '#06b6d4',
  respondeu: '#eab308',
  negociacao: '#8b5cf6',
  ganho: '#22c55e',
  perdido: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
}

type KanbanItem = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  status: string
  next_action: string | null
  next_action_date: string | null
  stage_entered_at: string
  created_at: string
  owner_id: string | null
  group_id: string | null
  email?: string | null
  lead_groups?: { name: string } | null
}

type SLARuleDB = {
  id: string
  status: string
  target_minutes: number
  warning_minutes: number
  danger_minutes: number
}

type SellerWorklistProps = {
  kanbanItems: Record<string, KanbanItem[]>
  slaRules: Record<string, SLARuleDB | null>
  nowTick: Date
  refreshKey?: number
  onRefresh?: () => void
}

function getAgendaState(dateStr: string | null): 'none' | 'today' | 'overdue' | 'future' {
  if (!dateStr) return 'none'
  const now = new Date()
  const d = new Date(dateStr)
  if (d < now) return 'overdue'
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return 'today'
  return 'future'
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatTimeInStage(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  if (minutes < 60) return `${Math.floor(minutes)}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

const DEFAULT_SLA: Record<string, { warning_minutes: number; danger_minutes: number }> = {
  novo: { warning_minutes: 1440, danger_minutes: 2880 },
  contato: { warning_minutes: 2880, danger_minutes: 4320 },
  respondeu: { warning_minutes: 1440, danger_minutes: 2880 },
  negociacao: { warning_minutes: 4320, danger_minutes: 7200 },
}

type Section = {
  title: string
  accent: string
  items: KanbanItem[]
  renderDetail: (c: KanbanItem) => string
}

function WorklistSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(section.items.length > 0)

  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          background: `${section.accent}12`,
          border: `1px solid ${section.accent}20`,
          borderBottom: open ? 'none' : `1px solid ${section.accent}20`,
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          color: section.accent,
          fontWeight: 800,
          fontSize: 10,
          textAlign: 'left',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ flex: 1 }}>{section.title}</span>
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          background: `${section.accent}18`,
          padding: '1px 6px',
          borderRadius: 4,
        }}>
          {section.items.length}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{
          border: `1px solid ${section.accent}20`,
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          background: DS.panelBg,
        }}>
          {section.items.length === 0 ? (
            <div style={{ fontSize: 10, color: DS.textMuted, padding: '6px 8px', textAlign: 'center', fontStyle: 'italic' }}>
              Nenhum
            </div>
          ) : (
            section.items.map((item) => (
              <div
                key={item.id}
                onClick={() => { window.location.href = `/sales-cycles/${item.id}` }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: `${section.accent}08`,
                  border: `1px solid ${section.accent}10`,
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${section.accent}18` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = `${section.accent}08` }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: STATUS_COLORS[item.status] ?? '#6b7280',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: 11,
                    color: DS.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.name}
                  </div>
                  {item.next_action && (
                    <div style={{ fontSize: 9, color: DS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.next_action}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: section.accent,
                  flexShrink: 0,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {section.renderDetail(item)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function SellerWorklist({
  kanbanItems,
  slaRules,
  nowTick,
  refreshKey,
  onRefresh,
}: SellerWorklistProps) {
  const sections = useMemo<Section[]>(() => {
    const all = Object.values(kanbanItems).flat()
      .filter((c) => c.status !== 'ganho' && c.status !== 'perdido')

    const overdueItems = all
      .filter((c) => getAgendaState(c.next_action_date) === 'overdue')
      .sort((a, b) => new Date(a.next_action_date!).getTime() - new Date(b.next_action_date!).getTime())

    const todayItems = all
      .filter((c) => getAgendaState(c.next_action_date) === 'today')
      .sort((a, b) => new Date(a.next_action_date!).getTime() - new Date(b.next_action_date!).getTime())

    const dangerItems = all
      .filter((c) => {
        const mins = Math.floor((nowTick.getTime() - new Date(c.stage_entered_at || new Date()).getTime()) / 60000)
        const rule = slaRules[c.status]
        const dangerMins = rule ? rule.danger_minutes : (DEFAULT_SLA[c.status]?.danger_minutes ?? 2880)
        return mins >= dangerMins
      })
      .sort((a, b) => new Date(a.stage_entered_at).getTime() - new Date(b.stage_entered_at).getTime())

    const next7Items = all
      .filter((c) => {
        const state = getAgendaState(c.next_action_date)
        if (state !== 'future') return false
        const d = new Date(c.next_action_date!)
        const limit = new Date(nowTick.getTime() + 7 * 24 * 60 * 60 * 1000)
        return d <= limit
      })
      .sort((a, b) => new Date(a.next_action_date!).getTime() - new Date(b.next_action_date!).getTime())

    return [
      {
        title: 'Atrasados',
        accent: '#ef4444',
        items: overdueItems,
        renderDetail: (c) => formatDate(c.next_action_date),
      },
      {
        title: 'Agenda Hoje',
        accent: '#3b82f6',
        items: todayItems,
        renderDetail: (c) => formatDate(c.next_action_date),
      },
      {
        title: 'SLA Estourado',
        accent: '#f59e0b',
        items: dangerItems,
        renderDetail: (c) => {
          const mins = Math.floor((nowTick.getTime() - new Date(c.stage_entered_at || new Date()).getTime()) / 60000)
          return `${formatTimeInStage(mins)} em ${STATUS_LABELS[c.status] ?? c.status}`
        },
      },
      {
        title: 'Próximos 7d',
        accent: '#8b5cf6',
        items: next7Items,
        renderDetail: (c) => formatDate(c.next_action_date),
      },
    ]
  }, [kanbanItems, slaRules, nowTick])

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0)

  return (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, letterSpacing: '0.08em' }}>
            FILA DO DIA
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            background: `${DS.blue}20`,
            color: DS.blue,
            padding: '1px 6px',
            borderRadius: 4,
          }}>
            {totalItems}
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              background: 'none',
              border: `1px solid ${DS.border}`,
              color: DS.textMuted,
              borderRadius: 5,
              padding: '2px 7px',
              fontSize: 10,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ↻
          </button>
        )}
      </div>

      {/* Sections */}
      {sections.map((sec) => (
        <WorklistSection key={sec.title} section={sec} />
      ))}
    </div>
  )
}