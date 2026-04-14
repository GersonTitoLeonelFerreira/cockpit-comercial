'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { supabase } from '../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { EVENT_SOURCES } from '@/app/config/analyticsBase'

type Lead = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  stage_entered_at?: string | null
  owner_id: string | null
  pinned?: boolean
  importance?: number
}

function formatTempo(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const totalMinutes = Math.floor(s / 60)
  if (totalMinutes < 1) return `0min`

  const MIN_PER_HOUR = 60
  const MIN_PER_DAY = 24 * 60
  const MIN_PER_MONTH = 30 * 24 * 60

  if (totalMinutes < MIN_PER_HOUR) return `${totalMinutes}min`

  if (totalMinutes < MIN_PER_DAY) {
    const h = Math.floor(totalMinutes / MIN_PER_HOUR)
    const m = totalMinutes % MIN_PER_HOUR
    return m > 0 ? `${h}h${m}min` : `${h}h`
  }

  if (totalMinutes < MIN_PER_MONTH) {
    const d = Math.floor(totalMinutes / MIN_PER_DAY)
    const remDay = totalMinutes % MIN_PER_DAY
    const h = Math.floor(remDay / MIN_PER_HOUR)
    const m = remDay % MIN_PER_HOUR

    let out = `${d}d`
    if (h > 0) out += `${h}h`
    if (m > 0) out += `${m}min`
    return out
  }

  const mo = Math.floor(totalMinutes / MIN_PER_MONTH)
  const remMonth = totalMinutes % MIN_PER_MONTH
  const d = Math.floor(remMonth / MIN_PER_DAY)
  const remDay = remMonth % MIN_PER_DAY
  const h = Math.floor(remDay / MIN_PER_HOUR)
  const m = remDay % MIN_PER_HOUR

  let out = `${mo}mo`
  if (d > 0) out += `${d}d`
  if (h > 0) out += `${h}h`
  if (m > 0) out += `${m}min`
  return out
}

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function whatsappLink(phone: string | null) {
  const digits = onlyDigits(phone ?? '')
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}

const LOSS_REASONS = [
  'Sem resposta',
  'Sem interesse',
  'Preço',
  'Já fechou com concorrente',
  'Sem tempo / prioridade baixa',
  'Não é o perfil (qualificação)',
  'Telefone inválido / contato incorreto',
  'Outro',
] as const

type PendingLostMove = {
  leadId: string
  fromStatus: string
  toStatus: 'perdido'
  secondsInFromStage: number
}

type MovingState = {
  leadId: string
  fromStatus: string
  toStatus: string
  prevStageEnteredAt: string | null
  nextStageEnteredAt: string
}

type BoardView = 'MY' | 'POOL' | 'ALL'

function stopBubble(e: any) {
  e.stopPropagation?.()
}

export default function KanbanBoard({
  userId,
  companyId,
  isAdmin = false,
}: {
  userId: string
  companyId: string
  isAdmin?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const columns = useMemo(
    () => ['novo', 'contato', 'respondeu', 'negociacao', 'fechado', 'perdido'],
    []
  )

  const [localLeads, setLocalLeads] = useState<Lead[]>([])
  const [view, setView] = useState<BoardView>('MY')
  const [mounted, setMounted] = useState(false)
  const [nowMs, setNowMs] = useState<number>(0)
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null)
  const [moving, setMoving] = useState<MovingState | null>(null)
  const [pendingLostMove, setPendingLostMove] = useState<PendingLostMove | null>(null)
  const [lossReason, setLossReason] = useState<string>('')
  const [lossReasonOther, setLossReasonOther] = useState<string>('')
  const [savingLost, setSavingLost] = useState<boolean>(false)

  useEffect(() => {
    if (!isAdmin) setView('MY')
  }, [isAdmin])

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadMyLeads = useCallback(async () => {
    if (!userId || !companyId) return

    const { data, error } = await supabase
      .from('leads')
      .select('id,name,phone,status,created_at,stage_entered_at,owner_id')
      .eq('company_id', companyId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) {
      console.warn('Erro ao carregar leads do Kanban:', error.message)
      return
    }

    setLocalLeads((data ?? []) as Lead[])
  }, [userId, companyId])

  useEffect(() => {
    if (!isAdmin) loadMyLeads()
  }, [isAdmin, loadMyLeads])

  useEffect(() => {
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const secondsInCurrentStatus = useCallback(
    (lead: Lead) => {
      if (!mounted) return 0
      const startIso = lead.stage_entered_at || lead.created_at
      const start = new Date(startIso).getTime()
      const diff = Math.floor((nowMs - start) / 1000)
      return diff > 0 ? diff : 0
    },
    [nowMs, mounted]
  )

  const sortWithinStage = useCallback(
    (a: Lead, b: Lead) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (bp !== ap) return bp - ap

      const ai = a.importance ?? 0
      const bi = b.importance ?? 0
      if (bi !== ai) return bi - ai

      const as = secondsInCurrentStatus(a)
      const bs = secondsInCurrentStatus(b)
      if (bs !== as) return bs - as

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    },
    [secondsInCurrentStatus]
  )

  const savePriority = useCallback(
    async (leadId: string, patch: { pinned?: boolean; importance?: number }) => {
      if (!userId || !companyId) {
        alert('Você precisa estar logado.')
        return
      }

      setLocalLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l)))

      const { error } = await supabase
        .from('lead_user_priority')
        .upsert(
          {
            user_id: userId,
            company_id: companyId,
            lead_id: leadId,
            pinned: patch.pinned ?? undefined,
            importance: patch.importance ?? undefined,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,lead_id' }
        )

      if (error) {
        alert('Erro ao salvar prioridade: ' + error.message)
        router.refresh()
        return
      }

      router.refresh()
    },
    [userId, companyId, router]
  )

  const visibleLeads = useMemo(() => {
    if (view === 'POOL') return localLeads.filter((l) => l.owner_id == null)
    if (view === 'ALL') return localLeads
    return localLeads.filter((l) => l.owner_id === userId)
  }, [localLeads, view, userId])

  const columnCounts = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const col of columns) acc[col] = 0

    for (const l of visibleLeads) {
      const st = (l.status || '').toLowerCase()
      if (acc[st] == null) acc[st] = 0
      acc[st] += 1
    }

    return acc
  }, [visibleLeads, columns])

  const scrollToLead = useCallback((leadId: string) => {
    let tries = 0
    const maxTries = 18

    const tick = () => {
      tries += 1
      const el = document.querySelector(`[data-lead-card="${leadId}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        return true
      }
      return false
    }

    const loop = () => {
      if (tick()) return
      if (tries >= maxTries) return
      requestAnimationFrame(loop)
    }

    requestAnimationFrame(loop)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const leadId = (searchParams?.get('lead') ?? '').trim()
    if (!leadId) return

    setHighlightLeadId(leadId)
    scrollToLead(leadId)

    const t = setTimeout(() => setHighlightLeadId(null), 7000)
    return () => clearTimeout(t)
  }, [searchParams, localLeads, scrollToLead, mounted])

  const isMovingLead = useCallback((id: string) => moving?.leadId === id, [moving])

  const closeLostModal = useCallback(() => {
    setPendingLostMove(null)
    setLossReason('')
    setLossReasonOther('')
    setSavingLost(false)
  }, [])

  const finalizeLostReason = useCallback(() => {
    const reason = (lossReason || '').trim()
    if (!reason) return null
    if (reason === 'Outro') {
      const other = (lossReasonOther || '').trim()
      return other ? other : null
    }
    return reason
  }, [lossReason, lossReasonOther])

  const performMove = useCallback(
    async (
      leadId: string,
      fromStatus: string,
      toStatus: string,
      secondsInFromStage: number,
      extraMeta?: any
    ) => {
      if (!userId) throw new Error('Você precisa estar logado.')
      if (!companyId) throw new Error('Erro: não encontrei sua empresa (company_id).')
      if (fromStatus === toStatus) return

      const nowIso = new Date().toISOString()

      const prev = localLeads.find((l) => l.id === leadId)
      const prevStageEnteredAt = prev?.stage_entered_at ?? null

      setMoving({
        leadId,
        fromStatus,
        toStatus,
        prevStageEnteredAt,
        nextStageEnteredAt: nowIso,
      })

      setLocalLeads((prevList) =>
        prevList.map((l) =>
          l.id === leadId ? { ...l, status: toStatus, stage_entered_at: nowIso } : l
        )
      )

      const { error: updateErr } = await supabase
        .from('leads')
        .update({ status: toStatus, stage_entered_at: nowIso })
        .eq('id', leadId)
        .eq('company_id', companyId)

      if (updateErr) {
        setLocalLeads((prevList) =>
          prevList.map((l) =>
            l.id === leadId
              ? { ...l, status: fromStatus, stage_entered_at: prevStageEnteredAt }
              : l
          )
        )
        setMoving(null)
        throw new Error(updateErr.message)
      }

      const metadata = {
        source: EVENT_SOURCES.kanban_drag,
        seconds_in_from_status: secondsInFromStage,
        ...extraMeta,
      }

      const { error: eventErr } = await supabase.from('lead_events').insert({
        company_id: companyId,
        lead_id: leadId,
        user_id: userId,
        event_type: 'stage_changed',
        from_stage: fromStatus,
        to_stage: toStatus,
        seconds_in_from_stage: secondsInFromStage,
        metadata,
        created_at: nowIso,
      })

      if (eventErr) {
        console.log('Erro ao registrar evento lead_events:', eventErr)
      }

      const touchType =
        toStatus === 'ganho'
          ? 'won'
          : toStatus === 'perdido'
            ? 'lost'
            : 'move'

      const { data: touchData, error: touchErr } = await supabase.rpc(
        'rpc_touch_lead_in_current_competency',
        {
          p_lead_id: leadId,
          p_touch_type: touchType,
          p_touch_at: nowIso,
          p_won_total: toStatus === 'ganho' ? (extraMeta?.won_total ?? null) : null,
        }
      )

      if (touchErr) {
        throw new Error(`Erro ao registrar atividade por período: ${touchErr.message}`)
      }

      if (!touchData?.success) {
        throw new Error(`Falha ao registrar atividade por período: ${JSON.stringify(touchData)}`)
      }

      setMoving(null)
      router.refresh()
    },
    [userId, companyId, router, localLeads]
  )

  const onDragEnd = async (result: any) => {
    if (!result.destination) return
    if (isAdmin) return
    if (moving) return

    const leadId = result.draggableId as string
    const toStatus = result.destination.droppableId as string

    const lead = localLeads.find((l) => l.id === leadId)
    if (!lead) return

    const fromStatus = lead.status
    if (fromStatus === toStatus) return

    const startIso = lead.stage_entered_at || lead.created_at
    const startMs = new Date(startIso).getTime()
    const diff = Math.floor((Date.now() - startMs) / 1000)
    const secondsInFromStage = diff > 0 ? diff : 1

    if (toStatus === 'perdido') {
      setPendingLostMove({
        leadId,
        fromStatus,
        toStatus: 'perdido',
        secondsInFromStage,
      })
      setLossReason('')
      setLossReasonOther('')
      return
    }

    try {
      await performMove(leadId, fromStatus, toStatus, secondsInFromStage)
    } catch (e: any) {
      alert('Erro ao mover lead: ' + (e?.message ?? String(e)))
    }
  }

  const confirmLostMove = useCallback(async () => {
    if (!pendingLostMove) return
    const reason = finalizeLostReason()
    if (!reason) {
      alert('Selecione um motivo (obrigatório).')
      return
    }

    if (savingLost) return
    setSavingLost(true)

    try {
      await performMove(
        pendingLostMove.leadId,
        pendingLostMove.fromStatus,
        pendingLostMove.toStatus,
        pendingLostMove.secondsInFromStage,
        { reason }
      )
      closeLostModal()
    } catch (e: any) {
      alert('Erro ao salvar perda: ' + (e?.message ?? String(e)))
    } finally {
      setSavingLost(false)
    }
  }, [pendingLostMove, finalizeLostReason, savingLost, performMove, closeLostModal])

  const pillBtnStyle: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
  }

  const levelBtnStyle = (active: boolean): React.CSSProperties => ({
    border: '1px solid #2a2a2a',
    background: active ? '#111827' : 'transparent',
    color: '#e5e7eb',
    fontSize: 12,
    width: 28,
    height: 28,
    borderRadius: 8,
    cursor: 'pointer',
  })

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setView('MY')} style={pillBtnStyle}>
          Minha carteira
        </button>

        {isAdmin ? (
          <button onClick={() => setView('POOL')} style={pillBtnStyle}>
            POOL
          </button>
        ) : null}

        {isAdmin ? (
          <button onClick={() => setView('ALL')} style={pillBtnStyle}>
            Todos
          </button>
        ) : null}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingTop: 10 }}>
          {columns.map((col) => (
            <Droppable droppableId={col} key={col}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minWidth: 260,
                    background: '#0f0f0f',
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid #222',
                    minHeight: 320,
                    opacity: moving ? 0.92 : 1,
                  }}
                >
                  <h3
                    style={{
                      textTransform: 'capitalize',
                      marginBottom: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span>{col}</span>
                    <span style={{ opacity: 0.7, fontSize: 12 }}>{columnCounts[col] ?? 0}</span>
                  </h3>

                  {visibleLeads
                    .filter((l) => l.status === col)
                    .slice()
                    .sort(sortWithinStage)
                    .map((lead, index) => {
                      const wa = whatsappLink(lead.phone)
                      const secs = mounted ? secondsInCurrentStatus(lead) : 0
                      const tempoLabel = mounted ? formatTempo(secs) : '—'
                      const pinned = !!lead.pinned
                      const importance = lead.importance ?? 0
                      const isPriority = pinned || importance >= 2
                      const isHighlighted = highlightLeadId === lead.id
                      const savingThis = isMovingLead(lead.id)

                      return (
                        <Draggable
                          draggableId={lead.id}
                          index={index}
                          key={lead.id}
                          isDragDisabled={!!moving || isAdmin}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              data-lead-card={lead.id}
                              style={{
                                border: isHighlighted
                                  ? '2px solid #22c55e'
                                  : isPriority
                                    ? '1px solid #334155'
                                    : '1px solid #333',
                                boxShadow: isHighlighted ? '0 0 0 4px rgba(34,197,94,0.12)' : 'none',
                                borderRadius: 12,
                                marginTop: 10,
                                background: '#111',
                                overflow: 'hidden',
                                transition: 'box-shadow 160ms ease, border 160ms ease, opacity 160ms ease',
                                opacity: savingThis ? 0.72 : 1,
                                ...provided.draggableProps.style,
                              }}
                            >
                              <div
                                {...provided.dragHandleProps}
                                style={{
                                  padding: '8px 12px',
                                  borderBottom: '1px solid #222',
                                  cursor: moving ? 'not-allowed' : 'grab',
                                  opacity: 0.85,
                                  fontSize: 12,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <span>{savingThis ? 'Salvando…' : 'Arrastar'}</span>

                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  {isHighlighted && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        border: '1px solid #22c55e',
                                        color: '#22c55e',
                                        opacity: 0.95,
                                      }}
                                    >
                                      ABERTO DO RELATÓRIO
                                    </span>
                                  )}

                                  {isPriority && !isHighlighted && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        border: '1px solid #334155',
                                        color: '#e5e7eb',
                                        opacity: 0.9,
                                      }}
                                    >
                                      PRIORIDADE
                                    </span>
                                  )}

                                  <span style={{ opacity: 0.6 }}>⋮⋮</span>
                                </div>
                              </div>

                              <div style={{ padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                  <strong style={{ lineHeight: 1.2 }}>{lead.name}</strong>

                                  <button
                                    type="button"
                                    onPointerDown={stopBubble}
                                    onMouseDown={stopBubble}
                                    onClick={(e) => {
                                      stopBubble(e)
                                      if (moving) return
                                      savePriority(lead.id, { pinned: !pinned })
                                    }}
                                    style={{
                                      ...pillBtnStyle,
                                      borderColor: pinned ? '#334155' : '#2a2a2a',
                                      background: pinned ? '#0b1220' : 'transparent',
                                      opacity: moving ? 0.6 : 1,
                                      cursor: moving ? 'not-allowed' : 'pointer',
                                    }}
                                    title="Destacar prioridade"
                                    disabled={!!moving}
                                  >
                                    {pinned ? '⭐' : '☆'}
                                  </button>
                                </div>

                                <div style={{ opacity: 0.85, marginTop: 6 }}>{lead.phone ?? '—'}</div>

                                <div
                                  style={{
                                    marginTop: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                  }}
                                >
                                  <div style={{ opacity: 0.7, fontSize: 11 }}>Importância</div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    {[1, 2, 3].map((lvl) => (
                                      <button
                                        key={lvl}
                                        type="button"
                                        onPointerDown={stopBubble}
                                        onMouseDown={stopBubble}
                                        onClick={(e) => {
                                          stopBubble(e)
                                          if (moving) return
                                          const next = importance === lvl ? 0 : lvl
                                          savePriority(lead.id, { importance: next })
                                        }}
                                        style={{
                                          ...levelBtnStyle(importance === lvl),
                                          opacity: moving ? 0.6 : 1,
                                          cursor: moving ? 'not-allowed' : 'pointer',
                                        }}
                                        title={`Definir importância ${lvl}`}
                                        disabled={!!moving}
                                      >
                                        {lvl}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div style={{ opacity: 0.5, fontSize: 11, marginTop: 10 }}>
                                  Criado: {mounted ? new Date(lead.created_at).toLocaleString() : '—'}
                                </div>

                                <div style={{ opacity: 0.7, fontSize: 11, marginTop: 6 }}>
                                  Tempo no status: {tempoLabel}
                                </div>

                                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    onPointerDown={stopBubble}
                                    onMouseDown={stopBubble}
                                    onTouchStart={stopBubble}
                                    onClick={(e) => {
                                      stopBubble(e)
                                      if (moving) return
                                      window.location.assign(`/leads/${lead.id}`)
                                    }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: 0,
                                      color: '#9aa',
                                      fontSize: 12,
                                      cursor: moving ? 'not-allowed' : 'pointer',
                                      opacity: moving ? 0.6 : 1,
                                    }}
                                    disabled={!!moving}
                                  >
                                    Abrir →
                                  </button>

                                  {wa && (
                                    <a
                                      href={wa}
                                      target="_blank"
                                      rel="noreferrer"
                                      onPointerDown={stopBubble}
                                      onMouseDown={stopBubble}
                                      onClick={stopBubble}
                                      style={{
                                        color: '#9aa',
                                        textDecoration: 'none',
                                        fontSize: 12,
                                        opacity: moving ? 0.6 : 1,
                                        pointerEvents: moving ? 'none' : 'auto',
                                      }}
                                    >
                                      WhatsApp →
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}

                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {pendingLostMove && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingLost) closeLostModal()
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#0b0b0b',
              border: '1px solid #2a2a2a',
              borderRadius: 14,
              padding: 16,
              color: 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Motivo da perda (obrigatório)</h3>
              <button
                type="button"
                onClick={() => !savingLost && closeLostModal()}
                style={pillBtnStyle}
                disabled={savingLost}
              >
                Cancelar
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Selecione um motivo</label>

              <select
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                disabled={savingLost}
                style={{
                  width: '100%',
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  color: 'white',
                  padding: '10px 12px',
                  borderRadius: 10,
                  outline: 'none',
                }}
              >
                <option value="">— selecione —</option>
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {lossReason === 'Outro' && (
                <>
                  <label style={{ fontSize: 12, opacity: 0.8 }}>Descreva</label>
                  <input
                    value={lossReasonOther}
                    onChange={(e) => setLossReasonOther(e.target.value)}
                    disabled={savingLost}
                    placeholder="Ex.: Mudou de cidade / etc."
                    style={{
                      width: '100%',
                      background: '#111',
                      border: '1px solid #2a2a2a',
                      color: 'white',
                      padding: '10px 12px',
                      borderRadius: 10,
                      outline: 'none',
                    }}
                  />
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={confirmLostMove} disabled={savingLost} style={pillBtnStyle}>
                {savingLost ? 'Salvando...' : 'Confirmar perda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}