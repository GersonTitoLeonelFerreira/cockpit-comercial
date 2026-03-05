'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import ConversationPasteAI from './ConversationPasteAI'

type Lead = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  stage_entered_at: string | null
  deal_value?: number | null
  current_stage_id?: string | null
}

const STATUSES = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido'] as const
type Status = (typeof STATUSES)[number]

const STATUS_LABEL: Record<Status, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
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

const WON_STAGE_ID = '956d91ff-64a6-4298-b023-3953333f3761' // pipeline_stages.key='won'

function parseBRLMoney(input: string) {
  // aceita "2000", "2.000", "2.000,50", "2000,50"
  const s = (input || '').trim()
  if (!s) return null
  const norm = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const n = Number(norm)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function moneyBRL(n: number) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pctFromPctNumber(pct: number) {
  const v = Number.isFinite(pct) ? pct : 0
  return `${Math.round(v)}%`
}

// debounce simples (sem libs)
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

type PendingWonMove = {
  leadId: string
  fromStatus: Status
  toStatus: 'ganho'
  secondsInFromStage: number
}

type SortMode = 'alpha_asc' | 'alpha_desc' | 'wait_long' | 'wait_short' | 'newest' | 'oldest'

function sortLabel(m: SortMode) {
  switch (m) {
    case 'alpha_asc':
      return 'A → Z'
    case 'alpha_desc':
      return 'Z → A'
    case 'wait_long':
      return 'Mais tempo na coluna'
    case 'wait_short':
      return 'Menos tempo na coluna'
    case 'newest':
      return 'Mais novos'
    case 'oldest':
      return 'Mais antigos'
  }
}

function getSortSpec(mode: SortMode) {
  // Importante: ordenar no banco. A ordenação é “global” para a coluna,
  // mas trazemos só os TOP N para manter leve.
  switch (mode) {
    case 'alpha_asc':
      return { column: 'name', ascending: true as const }
    case 'alpha_desc':
      return { column: 'name', ascending: false as const }
    case 'wait_long':
      // mais tempo esperando = stage_entered_at mais antigo
      return { column: 'stage_entered_at', ascending: true as const }
    case 'wait_short':
      return { column: 'stage_entered_at', ascending: false as const }
    case 'oldest':
      return { column: 'created_at', ascending: true as const }
    case 'newest':
    default:
      return { column: 'created_at', ascending: false as const }
  }
}

function Chevron({ open }: { open: boolean }) {
  // triângulo simples (não depende de lib)
  return (
    <span
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: open ? 'none' : '8px solid rgba(255,255,255,0.65)',
        borderBottom: open ? '8px solid rgba(255,255,255,0.65)' : 'none',
        transform: open ? 'translateY(-1px)' : 'translateY(1px)',
      }}
    />
  )
}

export default function SellerKanban({ userId, companyId }: { userId: string; companyId: string }) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [loadingCounts, setLoadingCounts] = useState(true)
  const [loadingColumn, setLoadingColumn] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ✅ Superleve:
  // - leadsByStatus: carrega APENAS a coluna ativa
  // - counts: contagem por coluna para header
  const [counts, setCounts] = useState<Record<Status, number>>({
    novo: 0,
    contato: 0,
    respondeu: 0,
    negociacao: 0,
    ganho: 0,
    perdido: 0,
  })
  const [leadsByStatus, setLeadsByStatus] = useState<Record<Status, Lead[]>>({
    novo: [],
    contato: [],
    respondeu: [],
    negociacao: [],
    ganho: [],
    perdido: [],
  })

  // ✅ busca: raw + debounced
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebouncedValue(searchRaw, 350)

  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)

  const [pendingWonMove, setPendingWonMove] = useState<PendingWonMove | null>(null)
  const [wonValueRaw, setWonValueRaw] = useState('')
  const [savingWon, setSavingWon] = useState(false)

  // ✅ Coluna ativa (aberta). As outras ficam retraídas (header + contagem).
  const [activeStatus, setActiveStatus] = useState<Status>('contato')

  // ✅ Ordenação global da coluna (server-side)
  const [sortMode, setSortMode] = useState<SortMode>('wait_long')

  // ✅ Limit por coluna (30) + “carregar mais”
  const [pageSize, setPageSize] = useState<number>(30)

  // ✅ Banner metas mês (RPC) + debounce pós-move
  const [goalLoading, setGoalLoading] = useState(true)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [goalPayload, setGoalPayload] = useState<any>(null)
  const refreshTimerRef = useRef<any>(null)

  const closeWonModal = useCallback(() => {
    setPendingWonMove(null)
    setWonValueRaw('')
    setSavingWon(false)
  }, [])

  const loadMonthGoals = useCallback(async () => {
    setGoalLoading(true)
    setGoalError(null)
    try {
      const r = await fetch('/api/seller/month-progress', { method: 'GET' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `Erro ao carregar metas (HTTP ${r.status})`)
      setGoalPayload(j)
    } catch (e: any) {
      setGoalError(e?.message ?? 'Erro ao carregar metas.')
      setGoalPayload(null)
    } finally {
      setGoalLoading(false)
    }
  }, [])

  const scheduleGoalsRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      void loadMonthGoals()
    }, 800)
  }, [loadMonthGoals])

  useEffect(() => {
    void loadMonthGoals()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [loadMonthGoals])

  const loadCounts = useCallback(async () => {
    if (!userId || !companyId) return
    setLoadingCounts(true)

    try {
      const next: Record<Status, number> = { novo: 0, contato: 0, respondeu: 0, negociacao: 0, ganho: 0, perdido: 0 }

      await Promise.all(
        STATUSES.map(async (st) => {
          const { count, error } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('owner_id', userId)
            .eq('status', st)

          if (error) throw error
          next[st] = Number(count ?? 0)
        })
      )

      setCounts(next)
    } catch (e: any) {
      setErrorMsg('Erro ao carregar contagens: ' + (e?.message ?? String(e)))
    } finally {
      setLoadingCounts(false)
    }
  }, [companyId, userId, supabase])

  const loadColumn = useCallback(
    async (status: Status) => {
      if (!userId || !companyId) return
      setLoadingColumn(true)
      setErrorMsg(null)

      try {
        const s = search.trim()
        const { column, ascending } = getSortSpec(sortMode)

        let q = supabase
          .from('leads')
          .select('id,name,phone,status,created_at,stage_entered_at,deal_value,current_stage_id')
          .eq('company_id', companyId)
          .eq('owner_id', userId)
          .eq('status', status)

        if (s) {
          // filtro global da coluna (aplica no banco)
          q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`)
        }

        q = q.order(column as any, { ascending, nullsFirst: false }).limit(pageSize)

        const { data, error } = await q
        if (error) throw error

        setLeadsByStatus((prev) => ({ ...prev, [status]: (data ?? []) as any }))
      } catch (e: any) {
        setLeadsByStatus((prev) => ({ ...prev, [status]: [] }))
        setErrorMsg('Erro ao carregar coluna: ' + (e?.message ?? String(e)))
      } finally {
        setLoadingColumn(false)
      }
    },
    [companyId, userId, supabase, search, sortMode, pageSize]
  )

  // boot
  useEffect(() => {
    if (!userId || !companyId) return
    void loadCounts()
    void loadColumn(activeStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId])

  // quando muda a coluna / ordenação / busca / pageSize -> recarrega só a coluna ativa
  useEffect(() => {
    if (!userId || !companyId) return
    void loadColumn(activeStatus)
  }, [activeStatus, sortMode, search, pageSize, loadColumn, userId, companyId])

  const activeLeads = leadsByStatus[activeStatus] ?? []

  const moveLocal = useCallback((leadId: string, from: Status, to: Status) => {
    const nowIso = new Date().toISOString()

    setLeadsByStatus((prev) => {
      const fromList = prev[from] ?? []
      const toList = prev[to] ?? []
      const moving = fromList.find((x) => x.id === leadId)

      return {
        ...prev,
        [from]: fromList.filter((x) => x.id !== leadId),
        [to]: moving ? [{ ...moving, status: to, stage_entered_at: nowIso }, ...toList] : toList,
      }
    })

    setCounts((prev) => ({
      ...prev,
      [from]: Math.max(0, (prev[from] ?? 0) - 1),
      [to]: (prev[to] ?? 0) + 1,
    }))
  }, [])

  const rollbackLocal = useCallback((lead: Lead, from: Status, to: Status) => {
    setLeadsByStatus((prev) => {
      const fromList = prev[from] ?? []
      const toList = prev[to] ?? []
      return {
        ...prev,
        [to]: toList.filter((x) => x.id !== lead.id),
        [from]: [lead, ...fromList],
      }
    })
    setCounts((prev) => ({
      ...prev,
      [to]: Math.max(0, (prev[to] ?? 0) - 1),
      [from]: (prev[from] ?? 0) + 1,
    }))
  }, [])

  const performMove = useCallback(
    async (
      leadId: string,
      fromStatus: Status,
      toStatus: Status,
      secondsInFromStage: number,
      extraMeta?: any,
      dealValueOverride?: number | null
    ) => {
      setSavingLeadId(leadId)

      const dealValue = toStatus === 'ganho' ? (dealValueOverride ?? null) : null
      const toStageId = toStatus === 'ganho' ? WON_STAGE_ID : null

      if (toStatus === 'ganho' && (!dealValue || dealValue <= 0)) {
        setSavingLeadId(null)
        throw new Error('Informe um valor válido para Ganho.')
      }

      try {
        const { error: rpcErr } = await supabase.rpc('seller_move_lead_stage', {
          p_company_id: companyId,
          p_lead_id: leadId,
          p_to_status: toStatus,
          p_reason: extraMeta?.reason ?? null,
          p_deal_value: dealValue,
          p_to_stage_id: toStageId,
        })
        if (rpcErr) throw rpcErr
      } finally {
        setSavingLeadId(null)
      }
    },
    [companyId, supabase]
  )

  const confirmWonMove = useCallback(async () => {
    if (!pendingWonMove) return
    if (savingWon) return

    const parsed = parseBRLMoney(wonValueRaw)
    if (!parsed) {
      setErrorMsg('Informe um valor válido (ex.: 2000 ou 2.000,50).')
      return
    }

    setSavingWon(true)

    const lead = leadsByStatus[pendingWonMove.fromStatus]?.find((x) => x.id === pendingWonMove.leadId)
    if (lead) moveLocal(pendingWonMove.leadId, pendingWonMove.fromStatus, 'ganho')

    try {
      await performMove(
        pendingWonMove.leadId,
        pendingWonMove.fromStatus,
        'ganho',
        pendingWonMove.secondsInFromStage,
        undefined,
        parsed
      )
      closeWonModal()
      setActiveStatus('ganho')

      // ✅ refresh metas pós-move (debounced)
      scheduleGoalsRefresh()
    } catch (e: any) {
      if (lead) rollbackLocal(lead, pendingWonMove.fromStatus, 'ganho')
      setErrorMsg('Erro ao mover lead: ' + (e?.message ?? String(e)))
    } finally {
      setSavingWon(false)
    }
  }, [
    pendingWonMove,
    savingWon,
    wonValueRaw,
    leadsByStatus,
    performMove,
    closeWonModal,
    moveLocal,
    rollbackLocal,
    scheduleGoalsRefresh,
  ])

  const onDragEnd = useCallback(
    async (r: DropResult) => {
      if (!r.destination) return
      if (!companyId) return
      if (savingLeadId) return

      const leadId = r.draggableId
      const toStatus = r.destination.droppableId as Status
      const fromStatus = r.source.droppableId as Status

      if (fromStatus === toStatus) return

      const lead = leadsByStatus[fromStatus]?.find((l) => l.id === leadId)
      if (!lead) return

      const startIso = lead.stage_entered_at ?? lead.created_at
      const startMs = new Date(startIso).getTime()
      const secondsInFromStage = Math.max(1, Math.floor((Date.now() - startMs) / 1000))

      if (toStatus === 'ganho') {
        setPendingWonMove({ leadId, fromStatus, toStatus: 'ganho', secondsInFromStage })
        setWonValueRaw('')
        return
      }

      moveLocal(leadId, fromStatus, toStatus)
      setActiveStatus(toStatus)

      try {
        await performMove(leadId, fromStatus, toStatus, secondsInFromStage)

        // ✅ refresh metas pós-move (debounced)
        scheduleGoalsRefresh()
      } catch (e: any) {
        rollbackLocal(lead, fromStatus, toStatus)
        setErrorMsg('Erro ao mover lead: ' + (e?.message ?? String(e)))
      } finally {
        void loadColumn(toStatus)
      }
    },
    [companyId, savingLeadId, leadsByStatus, performMove, rollbackLocal, moveLocal, loadColumn, scheduleGoalsRefresh]
  )

  const pillBtnStyle: React.CSSProperties = {
    border: '1px solid #2a2a2a',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    fontWeight: 800,
  }

  const boardBg: React.CSSProperties = {
    display: 'flex',
    gap: 16,
    overflowX: 'auto',
    paddingTop: 14,
  }

  const colBase: React.CSSProperties = {
    minWidth: 280,
    background: '#0f0f0f',
    borderRadius: 12,
    padding: 12,
    minHeight: 220,
    transition: 'all 140ms ease',
  }

  const goal = goalPayload?.goal ?? null
  const stats = goalPayload?.stats ?? null

  const meta = Number(goal?.meta_brl ?? 0)
  const ticket = Number(goal?.ticket_medio ?? 0)
  const taxaPct = Number(goal?.taxa_pct ?? 0)

  // “Faltam contatos”: usa o RPC do mês (mais correto)
  const contatosNecessarios = (() => {
    const taxa = Math.min(1, Math.max(0.0001, taxaPct / 100))
    if (!meta || !ticket || !taxaPct) return null
    const fechamentos = Math.ceil(meta / ticket)
    return Math.ceil(fechamentos / taxa)
  })()

  const contatosTrabalhadosMes = (() => {
    if (!stats) return null
    // regra: tudo a partir de contato conta como “trabalho”
    const contatados = Number(stats?.contatados ?? 0)
    const respondeu = Number(stats?.respondeu ?? 0)
    const negociacao = Number(stats?.negociacao ?? 0)
    const ganho = Number(stats?.fechado ?? 0)
    const perdido = Number(stats?.perdido ?? 0)
    return contatados + respondeu + negociacao + ganho + perdido
  })()

  const faltamContatos = (() => {
    if (contatosNecessarios == null || contatosTrabalhadosMes == null) return null
    return Math.max(0, contatosNecessarios - contatosTrabalhadosMes)
  })()

  return (
    <div style={{ color: 'white' }}>
      {/* ✅ Banner leve (RPC mês). Se você quiser mover para outro componente, dá para extrair. */}
      <div style={{ border: '1px solid #222', background: '#0f0f0f', borderRadius: 14, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Minha meta ({goalPayload?.month ?? '—'}) {goal?.scope === 'group' ? '• Meta da empresa' : '• Meta individual'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>
              {goalLoading ? 'Carregando…' : goalError ? 'Metas indisponíveis' : meta ? moneyBRL(meta) : 'Meta não configurada'}
            </div>
            {goalError ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{goalError}</div> : null}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href="/simular-meta"
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              Ver no simulador →
            </a>
            <button
              onClick={() => void loadMonthGoals()}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 900,
              }}
              title="Atualizar metas (RPC mês)"
            >
              Atualizar metas
            </button>
          </div>
        </div>

        {!goalLoading && !goalError ? (
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div style={{ border: '1px solid #222', background: '#0b0b0b', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Ticket alvo</div>
              <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{ticket ? moneyBRL(ticket) : '—'}</div>
            </div>
            <div style={{ border: '1px solid #222', background: '#0b0b0b', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Taxa alvo</div>
              <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{taxaPct ? pctFromPctNumber(taxaPct) : '—'}</div>
            </div>
            <div style={{ border: '1px solid #222', background: '#0b0b0b', borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Contatos necessários</div>
              <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{contatosNecessarios ?? '—'}</div>
            </div>
            <div
              style={{
                border: faltamContatos != null && faltamContatos <= 0 ? '1px solid #1f5f3a' : '1px solid #5f1f1f',
                background: faltamContatos != null && faltamContatos <= 0 ? '#07140c' : '#140707',
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.78 }}>Faltam contatos</div>
              <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{faltamContatos ?? '—'}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                Trabalhados (mês): {contatosTrabalhadosMes ?? '—'}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Minha carteira (Kanban)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Coluna ativa: <b>{STATUS_LABEL[activeStatus]}</b>
            {loadingCounts ? ' • carregando contagens…' : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Buscar nesta coluna…"
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              color: 'white',
              padding: '10px 12px',
              borderRadius: 10,
              outline: 'none',
              minWidth: 220,
            }}
          />

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              color: 'white',
              padding: '10px 12px',
              borderRadius: 10,
              outline: 'none',
              minWidth: 220,
              cursor: 'pointer',
            }}
            title="Ordenação global da coluna (server-side)"
          >
            {(['wait_long', 'wait_short', 'alpha_asc', 'alpha_desc', 'newest', 'oldest'] as SortMode[]).map((m) => (
              <option key={m} value={m}>
                {sortLabel(m)}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              void loadCounts()
              void loadColumn(activeStatus)
              void loadMonthGoals()
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid #7f1d1d', background: '#1a0b0b', borderRadius: 10, color: '#fecaca' }}>
          {errorMsg}
        </div>
      ) : null}

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={boardBg}>
          {STATUSES.map((st) => {
            const isActive = st === activeStatus
            const colBorder = isActive ? '1px solid #3b82f6' : '1px solid #222'
            const colShadow = isActive ? '0 0 0 1px rgba(59,130,246,0.25), 0 12px 38px rgba(0,0,0,0.55)' : 'none'
            const colOpacity = isActive ? 1 : 0.55

            return (
              <Droppable key={st} droppableId={st}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      ...colBase,
                      border: colBorder,
                      boxShadow: colShadow,
                      opacity: colOpacity,
                      filter: isActive ? 'none' : 'saturate(0.85)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPageSize(30)
                          setActiveStatus(st)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: 0,
                          background: 'transparent',
                          border: 'none',
                          color: 'white',
                          cursor: 'pointer',
                          fontWeight: 900,
                        }}
                        title={isActive ? 'Coluna aberta' : 'Abrir coluna'}
                      >
                        <Chevron open={isActive} />
                        <span>{STATUS_LABEL[st]}</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>{counts[st] ?? 0}</div>
                      </div>
                    </div>

                    {isActive ? (
                      <>
                        {loadingColumn ? <div style={{ opacity: 0.8, fontSize: 12 }}>Carregando…</div> : null}

                        {!loadingColumn && activeLeads.length === 0 ? (
                          <div style={{ opacity: 0.75, fontSize: 12 }}>Nenhum lead nesta coluna com o filtro atual.</div>
                        ) : null}

                        {activeLeads.map((l, idx) => {
                          const wa = whatsappLink(l.phone)
                          const isSaving = savingLeadId === l.id

                          return (
                            <Draggable key={l.id} draggableId={l.id} index={idx} isDragDisabled={!!savingLeadId}>
                              {(p) => (
                                <div
                                  ref={p.innerRef}
                                  {...p.draggableProps}
                                  {...p.dragHandleProps}
                                  style={{
                                    ...p.draggableProps.style,
                                    border: '1px solid #333',
                                    background: '#111',
                                    borderRadius: 12,
                                    padding: 12,
                                    marginBottom: 10,
                                    opacity: isSaving ? 0.7 : 1,
                                    cursor: isSaving ? 'not-allowed' : 'grab',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                    <div style={{ fontWeight: 900, lineHeight: 1.2 }}>{l.name}</div>
                                    <div style={{ opacity: 0.6, fontSize: 12 }}>{isSaving ? 'Salvando…' : ''}</div>
                                  </div>

                                  <div style={{ opacity: 0.85, marginTop: 6 }}>{l.phone ?? '—'}</div>

                                  <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <a href={`/leads/${l.id}`} style={{ color: '#9aa', textDecoration: 'none', fontSize: 12 }}>
                                      Abrir →
                                    </a>

                                    {wa ? (
                                      <a href={wa} target="_blank" rel="noreferrer" style={{ color: '#9aa', textDecoration: 'none', fontSize: 12 }}>
                                        WhatsApp →
                                      </a>
                                    ) : null}

                                    <ConversationPasteAI
                                      lead={{ id: l.id, company_id: companyId, name: l.name, phone: l.phone, status: l.status }}
                                      onSaved={() => {}}
                                      trigger={
                                        <button type="button" style={pillBtnStyle} disabled={!!savingLeadId}>
                                          IA
                                        </button>
                                      }
                                    />
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          )
                        })}

                        {provided.placeholder}

                        {(counts[st] ?? 0) > pageSize ? (
                          <button
                            type="button"
                            onClick={() => setPageSize((p) => p + 30)}
                            style={{
                              marginTop: 10,
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 10,
                              border: '1px solid #2a2a2a',
                              background: '#0d0d0d',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 900,
                              opacity: 0.95,
                            }}
                          >
                            Carregar mais (+30)
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <div style={{ opacity: 0.65, fontSize: 12, lineHeight: 1.4 }}>
                        Coluna retraída.
                        <br />
                        Clique no título para abrir.
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            )
          })}
        </div>
      </DragDropContext>

      {pendingWonMove ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={closeWonModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#0f0f0f',
              border: '1px solid #222',
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>Fechar como ganho</div>
            <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>Informe o valor do negócio (R$)</div>

            <input
              value={wonValueRaw}
              onChange={(e) => setWonValueRaw(e.target.value)}
              placeholder="Ex.: 2000 ou 2.000,50"
              style={{
                marginTop: 12,
                width: '100%',
                background: '#111',
                border: '1px solid #2a2a2a',
                color: 'white',
                padding: '10px 12px',
                borderRadius: 10,
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                onClick={closeWonModal}
                disabled={savingWon}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  opacity: savingWon ? 0.7 : 1,
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmWonMove}
                disabled={savingWon}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  cursor: 'pointer',
                  opacity: savingWon ? 0.7 : 1,
                  fontWeight: 900,
                }}
              >
                {savingWon ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}