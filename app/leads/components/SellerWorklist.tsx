'use client'

import React, { useCallback, useEffect, useState } from 'react'
import LeadQuickDrawer, { type WorklistItem } from './LeadQuickDrawer'

type WorklistData = {
  overdue: WorklistItem[]
  today: WorklistItem[]
  sla_danger: WorklistItem[]
}

type SellerWorklistProps = {
  userId: string
  groupId?: string | null
  supabase: any
  refreshKey?: number
  onRefresh?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  novo: '#3b82f6',
  contato: '#06b6d4',
  respondeu: '#eab308',
  negociacao: '#8b5cf6',
  ganho: '#22c55e',
  perdido: '#ef4444',
}

function WorklistItemRow({
  item,
  onClick,
}: {
  item: WorklistItem
  onClick: (item: WorklistItem) => void
}) {
  const isPast = item.next_action_date
    ? new Date(item.next_action_date) < new Date()
    : false

  return (
    <div
      onClick={() => onClick(item)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #222',
        background: '#111',
        cursor: 'pointer',
        transition: 'border-color 150ms',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = '#374151')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = '#222')}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[item.status] ?? '#6b7280',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: 'white',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
          {item.phone ?? 'Sem telefone'}
          {item.next_action && (
            <span style={{ marginLeft: 6, color: '#6b7280' }}>• {item.next_action}</span>
          )}
        </div>
      </div>
      {item.next_action_date && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: isPast ? '#f87171' : '#fbbf24',
            flexShrink: 0,
            textAlign: 'right',
          }}
        >
          {new Date(item.next_action_date).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}
    </div>
  )
}

type SectionProps = {
  title: string
  icon: string
  color: string
  bg: string
  items: WorklistItem[]
  defaultOpen?: boolean
  onItemClick: (item: WorklistItem) => void
}

function WorklistSection({ title, icon, color, bg, items, defaultOpen = true, onItemClick }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: bg,
          border: 'none',
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer',
          color,
          fontWeight: 900,
          fontSize: 12,
          textAlign: 'left',
        }}
      >
        <span>{icon}</span>
        <span style={{ flex: 1 }}>
          {title} ({items.length})
        </span>
        <span style={{ fontSize: 10 }}>{open ? '^' : 'v'}</span>
      </button>

      {open && (
        <div
          style={{
            border: '1px solid #222',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            background: '#0d0d0d',
          }}
        >
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280', padding: '4px 4px', textAlign: 'center' }}>
              Nenhum item
            </div>
          ) : (
            items.map((item) => (
              <WorklistItemRow key={item.id} item={item} onClick={onItemClick} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function SellerWorklist({
  userId,
  groupId,
  supabase,
  refreshKey,
  onRefresh,
}: SellerWorklistProps) {
  const [data, setData] = useState<WorklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<WorklistItem | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data: result, error } = await supabase.rpc('rpc_seller_worklist', {
        p_owner_user_id: userId,
        p_group_id: groupId ?? null,
        p_limit: 10,
      })
      if (error) throw error
      setData(result as WorklistData)
    } catch (e: any) {
      console.error('SellerWorklist error:', e)
    } finally {
      setLoading(false)
    }
  }, [userId, groupId, supabase])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const totalItems = data
    ? data.overdue.length + data.today.length + data.sla_danger.length
    : 0

  return (
    <div
      style={{
        background: '#0b0b0b',
        borderBottom: '1px solid #222',
        padding: '8px 20px',
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: collapsed ? 0 : 10,
        }}
      >
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: 0,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 700,
          }}
        >
          <span style={{ fontSize: 14 }}>{collapsed ? '>' : 'v'}</span>
          <span>Fila do Dia</span>
          {!loading && totalItems > 0 && (
            <span
              style={{
                background: '#1e40af',
                color: '#93c5fd',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: 900,
              }}
            >
              {totalItems}
            </span>
          )}
        </button>
        {!collapsed && (
          <button
            onClick={load}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: '1px solid #374151',
              color: '#9ca3af',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ↻ Atualizar
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {loading ? (
            <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>Carregando fila…</div>
          ) : data ? (
            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                maxHeight: 280,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {/* Overdue */}
              <div style={{ flex: '1 1 240px', minWidth: 240 }}>
                <WorklistSection
                  title="Atrasados"
                  icon="!"
                  color="#fca5a5"
                  bg="#7f1d1d"
                  items={data.overdue}
                  defaultOpen={data.overdue.length > 0}
                  onItemClick={setSelectedItem}
                />
              </div>

              {/* Today */}
              <div style={{ flex: '1 1 240px', minWidth: 240 }}>
                <WorklistSection
                  title="Hoje"
                  icon=">"
                  color="#93c5fd"
                  bg="#1e3a5f"
                  items={data.today}
                  defaultOpen
                  onItemClick={setSelectedItem}
                />
              </div>

              {/* SLA Danger */}
              <div style={{ flex: '1 1 240px', minWidth: 240 }}>
                <WorklistSection
                  title="SLA Estourado"
                  icon="*"
                  color="#fca5a5"
                  bg="#3b0f0f"
                  items={data.sla_danger}
                  defaultOpen={data.sla_danger.length > 0}
                  onItemClick={setSelectedItem}
                />
              </div>
            </div>
          ) : null}
        </>
      )}

      {selectedItem && (
        <LeadQuickDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          supabase={supabase}
          onSaved={() => {
            setSelectedItem(null)
            void load()
            onRefresh?.()
          }}
        />
      )}
    </div>
  )
}
