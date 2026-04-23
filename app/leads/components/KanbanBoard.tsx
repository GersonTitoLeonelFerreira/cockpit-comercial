// ✅ PRINCIPAIS PROBLEMAS NO SEU ARQUIVO (e o que vamos tirar):
// 1) Você recebe userId/companyId por props, MAS declarou de novo como state:
//    const [userId, setUserId] = useState...
//    => isso dá conflito (e foi o erro do print).
// 2) Você está usando "leads" dentro do Kanban, mas o componente NÃO recebe leads por props.
//    const [localLeads, setLocalLeads] = useState<Lead[]>(leads ?? [])
//    => "leads" está undefined.
// 3) Você importou AdminLeadsTable errado e nem usa ele nesse arquivo.
//
// ✅ CORREÇÃO MÍNIMA PARA VOLTAR A FUNCIONAR AGORA (sem implementar paginação ainda):
// - Remover toda a parte "Auth / company" (authReady, setUserId, loadAuth, setCompanyId).
// - Remover o uso de "leads ?? []" e iniciar localLeads vazio.
// - Adicionar um fetch simples de leads no Kanban (somente MY para vendedor) com limit 50 por status depois.
//   Por enquanto, vamos só carregar um lote pra não quebrar a tela.

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
  importance?: number // 0..3
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

const STAGE_META: Record<
  string,
  {
    label: string
    accent: string
    accentBorder: string
    accentGlow: string
    badgeBg: string
  }
> = {
  novo: {
    label: 'Novo',
    accent: '#077dcc',
    accentBorder: 'rgba(7, 125, 204, 0.48)',
    accentGlow: 'rgba(7, 125, 204, 0.22)',
    badgeBg: 'rgba(5, 38, 83, 0.72)',
  },
  contato: {
    label: 'Contato',
    accent: '#0bcbeb',
    accentBorder: 'rgba(11, 203, 235, 0.48)',
    accentGlow: 'rgba(11, 203, 235, 0.18)',
    badgeBg: 'rgba(6, 61, 78, 0.72)',
  },
  respondeu: {
    label: 'Respondeu',
    accent: '#dfcf2f',
    accentBorder: 'rgba(223, 207, 47, 0.44)',
    accentGlow: 'rgba(223, 207, 47, 0.16)',
    badgeBg: 'rgba(78, 67, 9, 0.72)',
  },
  negociacao: {
    label: 'Negociação',
    accent: '#7a4dff',
    accentBorder: 'rgba(122, 77, 255, 0.48)',
    accentGlow: 'rgba(122, 77, 255, 0.18)',
    badgeBg: 'rgba(49, 27, 96, 0.72)',
  },
  fechado: {
    label: 'Ganho',
    accent: '#05d495',
    accentBorder: 'rgba(5, 212, 149, 0.48)',
    accentGlow: 'rgba(5, 212, 149, 0.18)',
    badgeBg: 'rgba(7, 78, 54, 0.72)',
  },
  perdido: {
    label: 'Perdido',
    accent: '#ff5c70',
    accentBorder: 'rgba(255, 92, 112, 0.48)',
    accentGlow: 'rgba(255, 92, 112, 0.18)',
    badgeBg: 'rgba(92, 16, 28, 0.72)',
  },
}

const BOARD_BG = 'linear-gradient(180deg, rgba(10,14,24,0.96) 0%, rgba(7,10,18,0.98) 100%)'
const CARD_BG = 'linear-gradient(180deg, rgba(16,22,36,0.96) 0%, rgba(10,14,24,0.98) 100%)'
const SOFT_BORDER = 'rgba(255,255,255,0.06)'
const SOFT_TEXT = 'rgba(231,239,255,0.72)'
const MUTED_TEXT = 'rgba(231,239,255,0.48)'

// ✅ Só bloqueia “vazar” pro DnD. NÃO usa preventDefault.
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

  const columns = useMemo(() => ['novo', 'contato', 'respondeu', 'negociacao', 'fechado', 'perdido'], [])

  // ✅ antes estava: useState(leads ?? []) -> leads não existe aqui
  const [localLeads, setLocalLeads] = useState<Lead[]>([])

  // View
  const [view, setView] = useState<BoardView>('MY')
  useEffect(() => {
    if (!isAdmin) setView('MY')
  }, [isAdmin])

  // Hydration safety
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ✅ Antes havia authReady/userId/companyId state duplicados.
  // Agora userId/companyId vêm por props e são a fonte da verdade.

  // ✅ Carregamento mínimo: para vendedor, carrega apenas os leads dele (limitado).
  // (Depois vamos evoluir para 20 por coluna + "carregar mais" até 50.)
  const loadMyLeads = useCallback(async () => {
    if (!userId || !companyId) return

    const { data, error } = await supabase
      .from('leads')
      .select('id,name,phone,status,created_at,stage_entered_at,owner_id')
      .eq('company_id', companyId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(300) // mantém leve por enquanto

    if (error) {
      console.warn('Erro ao carregar leads do Kanban:', error.message)
      return
    }

    setLocalLeads((data ?? []) as any)
  }, [userId, companyId])

  useEffect(() => {
    // vendedor
    if (!isAdmin) loadMyLeads()
    // admin, se entrar no Kanban depois, a gente implementa modo "ver vendedor"
  }, [isAdmin, loadMyLeads])

  // Clock
  const [nowMs, setNowMs] = useState<number>(0)
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

  // Deep link highlight
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null)

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

  // Moving state
  const [moving, setMoving] = useState<MovingState | null>(null)
  const isMovingLead = useCallback((id: string) => moving?.leadId === id, [moving])

  // Modal perdido
  const [pendingLostMove, setPendingLostMove] = useState<PendingLostMove | null>(null)
  const [lossReason, setLossReason] = useState<string>('')
  const [lossReasonOther, setLossReasonOther] = useState<string>('')
  const [savingLost, setSavingLost] = useState<boolean>(false)

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
    async (leadId: string, fromStatus: string, toStatus: string, secondsInFromStage: number, extraMeta?: any) => {
      if (!userId) throw new Error('Você precisa estar logado.')
      if (!companyId) throw new Error('Erro: não encontrei sua empresa (company_id).')
      // Guard: never register a stage_changed event if from === to
      if (fromStatus === toStatus) return

      const nowIso = new Date().toISOString()

      const prev = localLeads.find((l) => l.id === leadId)
      const prevStageEnteredAt = prev?.stage_entered_at ?? null

      setMoving({ leadId, fromStatus, toStatus, prevStageEnteredAt, nextStageEnteredAt: nowIso })

      setLocalLeads((prevList) =>
        prevList.map((l) => (l.id === leadId ? { ...l, status: toStatus, stage_entered_at: nowIso } : l))
      )

      const { error: updateErr } = await supabase
        .from('leads')
        .update({ status: toStatus, stage_entered_at: nowIso })
        .eq('id', leadId)
        .eq('company_id', companyId)

      if (updateErr) {
        setLocalLeads((prevList) =>
          prevList.map((l) =>
            l.id === leadId ? { ...l, status: fromStatus, stage_entered_at: prevStageEnteredAt } : l
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

      if (eventErr) console.log('Erro ao registrar evento lead_events:', eventErr)

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
      setPendingLostMove({ leadId, fromStatus, toStatus: 'perdido', secondsInFromStage })
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

  const pillBtnStyle = (active = false): React.CSSProperties => ({
    border: active ? '1px solid rgba(65, 148, 255, 0.46)' : `1px solid ${SOFT_BORDER}`,
    background: active
      ? 'linear-gradient(180deg, rgba(18, 84, 198, 0.40) 0%, rgba(8, 24, 54, 0.96) 100%)'
      : 'linear-gradient(180deg, rgba(15,20,34,0.95) 0%, rgba(9,12,20,0.95) 100%)',
    color: active ? '#f8fbff' : SOFT_TEXT,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.2,
    padding: '8px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    boxShadow: active ? '0 0 0 1px rgba(65,148,255,0.10), 0 10px 24px rgba(0,0,0,0.24)' : 'none',
    transition: 'all 160ms ease',
  })

  const levelBtnStyle = (active: boolean, accent: string): React.CSSProperties => ({
    border: active ? `1px solid ${accent}` : `1px solid ${SOFT_BORDER}`,
    background: active
      ? `linear-gradient(180deg, ${accent}30 0%, rgba(10,14,24,0.96) 100%)`
      : 'linear-gradient(180deg, rgba(15,20,34,0.95) 0%, rgba(9,12,20,0.95) 100%)',
    color: '#f8fbff',
    fontSize: 12,
    fontWeight: 700,
    width: 30,
    height: 30,
    borderRadius: 10,
    cursor: 'pointer',
    boxShadow: active ? `0 0 18px ${accent}22` : 'none',
    transition: 'all 160ms ease',
  })

  const metaChipStyle = (accent: string): React.CSSProperties => ({
    border: `1px solid ${accent}55`,
    background: `${accent}14`,
    color: '#f8fbff',
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 10px',
    borderRadius: 999,
    lineHeight: 1,
  })

  const neutralChipStyle: React.CSSProperties = {
    border: `1px solid ${SOFT_BORDER}`,
    background: 'rgba(255,255,255,0.03)',
    color: SOFT_TEXT,
    fontSize: 11,
    fontWeight: 500,
    padding: '6px 10px',
    borderRadius: 999,
    lineHeight: 1,
  }

  const subtleActionStyle: React.CSSProperties = {
    border: `1px solid ${SOFT_BORDER}`,
    background: 'rgba(255,255,255,0.02)',
    color: '#f8fbff',
    fontSize: 12,
    fontWeight: 600,
    padding: '8px 12px',
    borderRadius: 12,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <>
      {/* Barra de visão */}
      {/* Barra de visão */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => setView('MY')} style={pillBtnStyle(view === 'MY')}>
          Minha carteira
        </button>

        {isAdmin ? (
          <button onClick={() => setView('POOL')} style={pillBtnStyle(view === 'POOL')}>
            POOL
          </button>
        ) : null}

        {isAdmin ? (
          <button onClick={() => setView('ALL')} style={pillBtnStyle(view === 'ALL')}>
            Todos
          </button>
        ) : null}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'flex',
            gap: 18,
            overflowX: 'auto',
            paddingTop: 8,
            paddingBottom: 8,
            alignItems: 'flex-start',
          }}
        >
          {columns.map((col, columnIndex) => {
            const meta = STAGE_META[col] ?? {
              label: col.charAt(0).toUpperCase() + col.slice(1),
              accent: '#3b82f6',
              accentBorder: 'rgba(59,130,246,0.40)',
              accentGlow: 'rgba(59,130,246,0.18)',
              badgeBg: 'rgba(30,41,59,0.80)',
            }

            return (
              <Droppable droppableId={col} key={col}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minWidth: 282,
                      minHeight: 420,
                      padding: 14,
                      borderRadius: 22,
                      border: `1px solid ${meta.accentBorder}`,
                      background: `radial-gradient(circle at top right, ${meta.accentGlow} 0%, rgba(7,10,18,0) 42%), ${BOARD_BG}`,
                      boxShadow: `0 18px 40px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.03), 0 0 18px ${meta.accentGlow}`,
                      position: 'relative',
                      overflow: 'hidden',
                      opacity: moving ? 0.92 : 1,
                      backdropFilter: 'blur(6px)',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background: `linear-gradient(180deg, ${meta.accentGlow} 0%, rgba(255,255,255,0) 26%)`,
                        opacity: 0.95,
                      }}
                    />

                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 16,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 999,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: `1px solid ${meta.accentBorder}`,
                              background: meta.badgeBg,
                              color: meta.accent,
                              fontWeight: 800,
                              fontSize: 13,
                              boxShadow: `0 0 14px ${meta.accentGlow}`,
                            }}
                          >
                            {String(columnIndex + 1).padStart(2, '0')}
                          </div>

                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: '#f8fbff',
                              letterSpacing: 0.1,
                            }}
                          >
                            {meta.label}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 28,
                            fontWeight: 800,
                            color: 'rgba(248,251,255,0.88)',
                            lineHeight: 1,
                          }}
                        >
                          {columnCounts[col] ?? 0}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                                        ? '1px solid rgba(34,197,94,0.92)'
                                        : isPriority
                                          ? `1px solid ${meta.accentBorder}`
                                          : `1px solid ${SOFT_BORDER}`,
                                      boxShadow: isHighlighted
                                        ? '0 0 0 1px rgba(34,197,94,0.42), 0 18px 30px rgba(0,0,0,0.34), 0 0 22px rgba(34,197,94,0.12)'
                                        : isPriority
                                          ? `0 16px 28px rgba(0,0,0,0.34), 0 0 18px ${meta.accentGlow}`
                                          : '0 16px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.03)',
                                      borderRadius: 18,
                                      background: CARD_BG,
                                      overflow: 'hidden',
                                      opacity: savingThis ? 0.72 : 1,
                                      transition: 'box-shadow 160ms ease, border 160ms ease, transform 160ms ease, opacity 160ms ease',
                                      ...provided.draggableProps.style,
                                    }}
                                  >
                                    <div
                                      {...provided.dragHandleProps}
                                      style={{
                                        padding: '10px 14px',
                                        borderBottom: `1px solid ${SOFT_BORDER}`,
                                        cursor: moving ? 'not-allowed' : 'grab',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span
                                          style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: 999,
                                            background: meta.accent,
                                            boxShadow: `0 0 14px ${meta.accentGlow}`,
                                            display: 'inline-block',
                                          }}
                                        />

                                        <span
                                          style={{
                                            fontSize: 11,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.8,
                                            color: MUTED_TEXT,
                                            fontWeight: 700,
                                          }}
                                        >
                                          {savingThis ? 'Atualizando' : meta.label}
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {isHighlighted && (
                                          <span
                                            style={{
                                              ...metaChipStyle('#22c55e'),
                                              border: '1px solid rgba(34,197,94,0.48)',
                                            }}
                                          >
                                            Aberto do relatório
                                          </span>
                                        )}

                                        {isPriority && !isHighlighted && (
                                          <span style={metaChipStyle(meta.accent)}>Prioridade</span>
                                        )}

                                        <span style={{ color: MUTED_TEXT, fontSize: 12 }}>⋮⋮</span>
                                      </div>
                                    </div>

                                    <div style={{ padding: 14 }}>
                                      <div
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'flex-start',
                                          gap: 12,
                                        }}
                                      >
                                        <strong
                                          style={{
                                            lineHeight: 1.2,
                                            fontSize: 15,
                                            color: '#f8fbff',
                                            fontWeight: 700,
                                          }}
                                        >
                                          {lead.name}
                                        </strong>

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
                                            ...pillBtnStyle(pinned),
                                            padding: '6px 10px',
                                            minWidth: 42,
                                            opacity: moving ? 0.6 : 1,
                                            cursor: moving ? 'not-allowed' : 'pointer',
                                          }}
                                          title="Destacar prioridade"
                                          disabled={!!moving}
                                        >
                                          {pinned ? '⭐' : '☆'}
                                        </button>
                                      </div>

                                      <div
                                        style={{
                                          marginTop: 8,
                                          color: SOFT_TEXT,
                                          fontSize: 13,
                                          fontWeight: 500,
                                        }}
                                      >
                                        {lead.phone ?? 'Sem telefone'}
                                      </div>

                                      <div
                                        style={{
                                          display: 'flex',
                                          flexWrap: 'wrap',
                                          gap: 8,
                                          marginTop: 12,
                                        }}
                                      >
                                        <span style={metaChipStyle(meta.accent)}>Tempo no status: {tempoLabel}</span>

                                        <span style={neutralChipStyle}>
                                          Criado: {mounted ? new Date(lead.created_at).toLocaleString() : '—'}
                                        </span>
                                      </div>

                                      <div
                                        style={{
                                          marginTop: 14,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 12,
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: MUTED_TEXT,
                                            textTransform: 'uppercase',
                                            letterSpacing: 0.7,
                                            fontWeight: 700,
                                          }}
                                        >
                                          Importância
                                        </div>

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
                                                ...levelBtnStyle(importance === lvl, meta.accent),
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

                                      <div
                                        style={{
                                          display: 'flex',
                                          gap: 8,
                                          marginTop: 14,
                                          flexWrap: 'wrap',
                                        }}
                                      >
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
                                            ...subtleActionStyle,
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
                                              ...subtleActionStyle,
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
                    </div>
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {/* ... resto do modal perdido permanece igual ... */}
    </>
  )
}