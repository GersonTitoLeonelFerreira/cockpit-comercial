'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragEndEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import { calculateCyclePulse } from '@/app/lib/services/sales-pulse'
import type { SalesPulseCycleRow, SalesPulseSeverity } from '@/app/types/sales-pulse'

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'

const STATUSES: Status[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

const STATUS_COLORS: Record<Status, string> = {
  novo: '#3b82f6',
  contato: '#8b5cf6',
  respondeu: '#ec4899',
  negociacao: '#f59e0b',
  ganho: '#10b981',
  perdido: '#ef4444',
}

type PipelineItem = {
  id: string // cycle_id
  lead_id: string
  owner_id: string | null
  status: Status
  stage_entered_at: string
  created_at: string
  name: string
  phone: string | null
  email?: string | null
  next_action: string | null
  next_action_date?: string | null
}

const PULSE_BADGE_STYLES: Record<
  SalesPulseSeverity,
  { border: string; background: string; color: string }
> = {
  positive: {
    border: 'rgba(34,197,94,0.30)',
    background: 'rgba(34,197,94,0.10)',
    color: '#86efac',
  },
  neutral: {
    border: 'rgba(59,130,246,0.30)',
    background: 'rgba(59,130,246,0.10)',
    color: '#93c5fd',
  },
  warning: {
    border: 'rgba(245,158,11,0.34)',
    background: 'rgba(245,158,11,0.12)',
    color: '#fcd34d',
  },
  danger: {
    border: 'rgba(239,68,68,0.34)',
    background: 'rgba(239,68,68,0.12)',
    color: '#fca5a5',
  },
  dead: {
    border: 'rgba(113,113,122,0.34)',
    background: 'rgba(113,113,122,0.12)',
    color: '#d4d4d8',
  },
}

function supportsSalesPulse(status: Status) {
  return status === 'contato' || status === 'respondeu' || status === 'negociacao'
}

function getSellerKanbanPulse(item: PipelineItem, nowTick: Date) {
  if (!supportsSalesPulse(item.status)) return null

  const row: SalesPulseCycleRow = {
    id: item.id,
    company_id: '',
    lead_id: item.lead_id,
    owner_user_id: item.owner_id,
    status: item.status,
    previous_status: null,
    stage_entered_at: item.stage_entered_at,
    next_action: item.next_action,
    next_action_date: item.next_action_date ?? null,
    current_group_id: null,
    created_at: item.created_at,
    updated_at: item.stage_entered_at ?? item.created_at,
    closed_at: null,
    won_at: null,
    lost_at: null,
    lost_reason: null,
    leads: {
      id: item.lead_id,
      name: item.name,
      phone: item.phone,
      email: item.email ?? null,
    },
  }

  return calculateCyclePulse(row, nowTick)
}

function KanbanCard({
  item,
  isSaving,
  nowTick,
}: {
  item: PipelineItem
  isSaving: boolean
  nowTick: Date
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: isSaving,
  })

  const pulse = getSellerKanbanPulse(item, nowTick)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: `1px solid ${STATUS_COLORS[item.status]}20`,
        background: '#111',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        cursor: isSaving ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
        transition: 'all 200ms',
      }}
      {...attributes}
      {...listeners}
      onClick={() => (window.location.href = `/sales-cycles/${item.id}`)}
    >
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>{item.name}</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{item.phone || '—'}</div>

      {pulse && (
        <div
          title={`${pulse.stateLabel} — ${pulse.mainReason}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            width: 'fit-content',
            marginTop: 7,
            padding: '3px 7px',
            borderRadius: 999,
            border: `1px solid ${PULSE_BADGE_STYLES[pulse.severity].border}`,
            background: PULSE_BADGE_STYLES[pulse.severity].background,
            color: PULSE_BADGE_STYLES[pulse.severity].color,
            fontSize: 10,
            fontWeight: 900,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
          }}
        >
          {pulse.stateLabel} · {pulse.score}/100
        </div>
      )}

      {item.next_action && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, fontStyle: 'italic' }}>
          Próx: {item.next_action}
        </div>
      )}
      {isSaving && <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>Salvando…</div>}
    </div>
  )
}

export default function SellerKanban({
  userId,
  companyId,
}: {
  userId: string
  companyId: string
}) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [items, setItems] = useState<Record<Status, PipelineItem[]>>({
    novo: [],
    contato: [],
    respondeu: [],
    negociacao: [],
    ganho: [],
    perdido: [],
  })

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(new Date())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // ✅ Carregar ciclos via v_pipeline_items
  const loadItems = useCallback(async () => {
    if (!companyId || !userId) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('v_pipeline_items')
        .select('*')
        .eq('company_id', companyId)
        .eq('owner_id', userId)
        .order('stage_entered_at', { ascending: false })

      if (err) throw err

      const grouped: Record<Status, PipelineItem[]> = {
        novo: [],
        contato: [],
        respondeu: [],
        negociacao: [],
        ganho: [],
        perdido: [],
      }

      for (const item of (data ?? []) as PipelineItem[]) {
        if (item.status in grouped) {
          grouped[item.status as Status].push(item)
        }
      }

      setItems(grouped)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar ciclos'
      setError(message)
      console.error('SellerKanban load error:', error)
    } finally {
      setLoading(false)
    }
  }, [companyId, userId, supabase])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // ✅ Mover ciclo via API server-side com empresa ativa
  const moveItem = useCallback(
    async (cycleId: string, toStatus: Status) => {
      setSavingId(cycleId)
      setError(null)

      try {
        const response = await fetch('/api/sales-cycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            cycle_id: cycleId,
            to_status: toStatus,
            metadata: {},
          }),
        })

        const result = (await response.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
        }

        if (!response.ok || result.error) {
          throw new Error(result.error ?? 'Erro ao mover')
        }

        await loadItems()
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : 'Erro ao mover')
      } finally {
        setSavingId(null)
      }
    },
    [loadItems]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || savingId) return

      const cycleId = String(active.id)
      const toStatus = String(over.id) as Status

      let fromStatus: Status | null = null
      for (const st of STATUSES) {
        if (items[st].some((i) => i.id === cycleId)) {
          fromStatus = st
          break
        }
      }

      if (!fromStatus || fromStatus === toStatus) return

      void moveItem(cycleId, toStatus)
    },
    [items, savingId, moveItem]
  )

  return (
    <div style={{ color: 'white' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900 }}>Meu Pipeline</h2>
        {error && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button
          onClick={() => void loadItems()}
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          Atualizar
        </button>
      </div>

      {loading ? (
        <div style={{ opacity: 0.7 }}>Carregando ciclos…</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12 }}>
            {STATUSES.map((status) => (
              <SortableContext
                key={status}
                items={items[status].map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  style={{
                    minWidth: 280,
                    background: '#0f0f0f',
                    borderRadius: 12,
                    padding: 12,
                    borderTop: `3px solid ${STATUS_COLORS[status]}`,
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 14 }}>
                    {status.toUpperCase()} ({items[status].length})
                  </div>

                  {items[status].length === 0 ? (
                    <div style={{ opacity: 0.5, fontSize: 12 }}>Vazio</div>
                  ) : (
                    items[status].map((item) => (
                      <KanbanCard
                        key={item.id}
                        item={item}
                        isSaving={savingId === item.id}
                        nowTick={nowTick}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            ))}
          </div>
        </DndContext>
      )}
    </div>
  )
}
