'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragEndEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

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
  next_action: string | null
}

function KanbanCard({ item, isSaving }: { item: PipelineItem; isSaving: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: isSaving,
  })

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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  
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
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar ciclos')
      console.error('SellerKanban load error:', e)
    } finally {
      setLoading(false)
    }
  }, [companyId, userId, supabase])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // ✅ Mover ciclo via RPC
  const moveItem = useCallback(
    async (cycleId: string, toStatus: Status) => {
      setSavingId(cycleId)
      setError(null)

      try {
        const { data, error: err } = await supabase.rpc('rpc_move_cycle_stage', {
          p_cycle_id: cycleId,
          p_to_status: toStatus,
          p_metadata: {},
        })

        if (err) throw err

        if (data && data[0]?.error_message) {
          throw new Error(data[0].error_message)
        }

        await loadItems()
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao mover')
      } finally {
        setSavingId(null)
      }
    },
    [supabase, loadItems]
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
                      <KanbanCard key={item.id} item={item} isSaving={savingId === item.id} />
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