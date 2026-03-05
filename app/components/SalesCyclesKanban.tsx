'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useSalesCycles } from '../hooks/useSalesCycles'
import { setCycleNextAction } from '../lib/salesCyclesService'
import type { SalesCycle, CycleStatus } from '../types/sales_cycles'

// ─── constants ────────────────────────────────────────────────────────────────
const STATUSES: CycleStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

const STATUS_LABEL: Record<CycleStatus, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
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
]

// ─── helpers ──────────────────────────────────────────────────────────────────
function onlyDigits(v: string | null) {
  return (v ?? '').replace(/\D/g, '')
}

function whatsappLink(phone: string | null) {
  const digits = onlyDigits(phone)
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}

function formatPhone(phone: string | null) {
  if (!phone) return 'Sem telefone'
  const d = onlyDigits(phone)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatAge(iso: string | null) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Hoje'
  if (days === 1) return '1 dia'
  return `${days} dias`
}

// ─── CycleCard ────────────────────────────────────────────────────────────────
function CycleCard({
  cycle,
  index,
  disabled,
  onOpenCloseModal,
  onOpenNextAction,
}: {
  cycle: SalesCycle
  index: number
  disabled: boolean
  onOpenCloseModal: (cycle: SalesCycle) => void
  onOpenNextAction: (cycle: SalesCycle) => void
}) {
  const leadName = cycle.lead?.name ?? 'Lead sem nome'
  const phone = cycle.lead?.phone ?? null
  const wa = whatsappLink(phone)

  return (
    <Draggable draggableId={cycle.id} index={index} isDragDisabled={disabled}>
      {(p) => (
        <div
          ref={p.innerRef}
          {...p.draggableProps}
          {...p.dragHandleProps}
          style={{
            ...p.draggableProps.style,
            border: '1px solid #333',
            borderRadius: 10,
            padding: 12,
            background: '#111',
            marginBottom: 10,
            cursor: disabled ? 'not-allowed' : 'grab',
            userSelect: 'none',
          }}
          aria-label={`Ciclo de ${leadName}`}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{leadName}</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" style={{ color: '#9aa', textDecoration: 'none' }}>
                {formatPhone(phone)}
              </a>
            ) : (
              formatPhone(phone)
            )}
          </div>

          <div style={{ height: 1, background: '#222', marginBottom: 8 }} />

          {cycle.next_action ? (
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              <span style={{ opacity: 0.7 }}>Próxima ação: </span>
              {cycle.next_action}
            </div>
          ) : null}

          {cycle.next_action_date ? (
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              <span style={{ opacity: 0.7 }}>Data: </span>
              {formatDateTime(cycle.next_action_date)}
            </div>
          ) : null}

          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>
            {formatAge(cycle.stage_entered_at ?? cycle.created_at)} nesta coluna
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenNextAction(cycle) }}
              style={smallBtnStyle}
              aria-label="Editar próxima ação"
            >
              ✏️ Ação
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenCloseModal(cycle) }}
              style={smallBtnStyle}
              aria-label="Fechar ciclo"
            >
              🏁 Fechar
            </button>
            <a
              href={`/sales-cycles/${cycle.id}`}
              style={{ ...smallBtnStyle, textDecoration: 'none', display: 'inline-block' }}
              onClick={(e) => e.stopPropagation()}
            >
              Detalhe →
            </a>
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ─── CloseModal ───────────────────────────────────────────────────────────────
function CloseModal({
  cycle,
  onConfirm,
  onCancel,
  saving,
}: {
  cycle: SalesCycle
  onConfirm: (type: 'ganho' | 'perdido', value?: number | null, reason?: string | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const [closeType, setCloseType] = useState<'ganho' | 'perdido'>('ganho')
  const [dealValueRaw, setDealValueRaw] = useState('')
  const [lossReason, setLossReason] = useState(LOSS_REASONS[0])

  const parsedValue = (() => {
    const s = dealValueRaw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fechar ciclo"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#0f0f0f',
          border: '1px solid #333',
          borderRadius: 16,
          padding: 24,
          color: 'white',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Fechar ciclo – {cycle.lead?.name}</h3>

        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Resultado</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['ganho', 'perdido'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCloseType(t)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${closeType === t ? (t === 'ganho' ? '#2a6' : '#a22') : '#333'}`,
                  background: closeType === t ? (t === 'ganho' ? '#0a2' : '#800') : 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: closeType === t ? 700 : 400,
                }}
              >
                {t === 'ganho' ? '🏆 Ganho' : '❌ Perdido'}
              </button>
            ))}
          </div>
        </div>

        {closeType === 'ganho' ? (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="deal-value">
              Valor do negócio (opcional)
            </label>
            <input
              id="deal-value"
              type="text"
              value={dealValueRaw}
              onChange={(e) => setDealValueRaw(e.target.value)}
              placeholder="Ex: 2.500,00"
              style={inputStyle}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="loss-reason">
              Motivo da perda
            </label>
            <select
              id="loss-reason"
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              style={inputStyle}
            >
              {LOSS_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={saving} style={btnSecondary}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onConfirm(
                closeType,
                closeType === 'ganho' ? parsedValue : undefined,
                closeType === 'perdido' ? lossReason : undefined
              )
            }
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NextActionModal ──────────────────────────────────────────────────────────
function NextActionModal({
  cycle,
  onConfirm,
  onCancel,
  saving,
}: {
  cycle: SalesCycle
  onConfirm: (action: string | null, date: string | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const [action, setAction] = useState(cycle.next_action ?? '')
  const [date, setDate] = useState(
    cycle.next_action_date ? cycle.next_action_date.slice(0, 16) : ''
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar próxima ação"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#0f0f0f',
          border: '1px solid #333',
          borderRadius: 16,
          padding: 24,
          color: 'white',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Próxima ação – {cycle.lead?.name}</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="next-action">
            Ação
          </label>
          <input
            id="next-action"
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Ex: Ligar para confirmar proposta"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="next-action-date">
            Data e hora
          </label>
          <input
            id="next-action-date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={saving} style={btnSecondary}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onConfirm(action || null, date ? new Date(date).toISOString() : null)}
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SalesCyclesKanban({
  userId,
  companyId,
}: {
  userId: string
  companyId: string
}) {
  const { cycles, loading, error, loadCycles, moveCycle, closeWon, closeLost, setNextAction } =
    useSalesCycles(userId, companyId, 60_000)

  const [savingId, setSavingId] = useState<string | null>(null)
  const [closeModal, setCloseModal] = useState<SalesCycle | null>(null)
  const [nextActionModal, setNextActionModal] = useState<SalesCycle | null>(null)

  // optional filter
  const [filterStatus, setFilterStatus] = useState<CycleStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const filteredCycles = useMemo(() => {
    let list = cycles
    if (filterStatus !== 'all') list = list.filter((c) => c.status === filterStatus)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.lead?.name?.toLowerCase().includes(q) ||
          c.lead?.phone?.toLowerCase().includes(q)
      )
    }
    return list
  }, [cycles, filterStatus, search])

  const cyclesByStatus = useMemo(() => {
    const map = {} as Record<CycleStatus, SalesCycle[]>
    for (const s of STATUSES) map[s] = []
    for (const c of filteredCycles) {
      if (map[c.status]) map[c.status].push(c)
    }
    return map
  }, [filteredCycles])

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination) return
      const from = result.source.droppableId as CycleStatus
      const to = result.destination.droppableId as CycleStatus
      if (from === to) return

      const cycleId = result.draggableId
      const cycle = cycles.find((c) => c.id === cycleId)
      if (!cycle) return

      // If moving to ganho/perdido, open modal instead
      if (to === 'ganho' || to === 'perdido') {
        setCloseModal(cycle)
        return
      }

      setSavingId(cycleId)
      try {
        await moveCycle(cycleId, from, to)
      } catch (e: any) {
        alert('Erro ao mover ciclo: ' + (e?.message ?? String(e)))
      } finally {
        setSavingId(null)
      }
    },
    [cycles, moveCycle]
  )

  const handleCloseConfirm = useCallback(
    async (type: 'ganho' | 'perdido', value?: number | null, reason?: string | null) => {
      if (!closeModal) return
      setSavingId(closeModal.id)
      try {
        if (type === 'ganho') {
          await closeWon(closeModal.id, closeModal.status, value)
        } else {
          await closeLost(closeModal.id, closeModal.status, reason)
        }
        setCloseModal(null)
      } catch (e: any) {
        alert('Erro ao fechar ciclo: ' + (e?.message ?? String(e)))
      } finally {
        setSavingId(null)
      }
    },
    [closeModal, closeWon, closeLost]
  )

  const handleNextActionConfirm = useCallback(
    async (action: string | null, date: string | null) => {
      if (!nextActionModal) return
      setSavingId(nextActionModal.id)
      try {
        await setNextAction(nextActionModal.id, action, date)
        setNextActionModal(null)
      } catch (e: any) {
        alert('Erro ao salvar próxima ação: ' + (e?.message ?? String(e)))
      } finally {
        setSavingId(null)
      }
    },
    [nextActionModal, setNextAction]
  )

  if (error) {
    return (
      <div style={{ color: 'white', padding: 20 }}>
        <p style={{ color: '#f66' }}>{error}</p>
        <button onClick={loadCycles} style={btnPrimary}>
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div style={{ color: 'white' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Ciclos de Vendas</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{cycles.length} ciclo(s) no total</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* search */}
          <input
            type="search"
            placeholder="Buscar lead…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
            aria-label="Buscar lead"
          />

          {/* filter by status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CycleStatus | 'all')}
            style={{ ...inputStyle, width: 160 }}
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadCycles}
            disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Carregando…' : '↺ Atualizar'}
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            paddingBottom: 12,
          }}
        >
          {STATUSES.map((col) => (
            <Droppable droppableId={col} key={col}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    minWidth: 240,
                    maxWidth: 280,
                    flex: '0 0 240px',
                    background: '#0f0f0f',
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #222',
                    minHeight: 320,
                  }}
                >
                  {/* column header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{STATUS_LABEL[col]}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{cyclesByStatus[col].length}</div>
                  </div>

                  {loading && cyclesByStatus[col].length === 0 ? (
                    <div style={{ opacity: 0.6, fontSize: 12 }}>Carregando…</div>
                  ) : cyclesByStatus[col].length === 0 ? (
                    <div style={{ opacity: 0.5, fontSize: 12 }}>Nenhum ciclo aqui.</div>
                  ) : null}

                  {cyclesByStatus[col].map((cycle, idx) => (
                    <CycleCard
                      key={cycle.id}
                      cycle={cycle}
                      index={idx}
                      disabled={savingId === cycle.id}
                      onOpenCloseModal={setCloseModal}
                      onOpenNextAction={setNextActionModal}
                    />
                  ))}

                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {/* Modals */}
      {closeModal ? (
        <CloseModal
          cycle={closeModal}
          onConfirm={handleCloseConfirm}
          onCancel={() => setCloseModal(null)}
          saving={savingId === closeModal.id}
        />
      ) : null}

      {nextActionModal ? (
        <NextActionModal
          cycle={nextActionModal}
          onConfirm={handleNextActionConfirm}
          onCancel={() => setNextActionModal(null)}
          saving={savingId === nextActionModal.id}
        />
      ) : null}
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.8, marginBottom: 6, display: 'block' }

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#0f0f0f',
  color: 'white',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const smallBtnStyle: React.CSSProperties = {
  padding: '5px 9px',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#1a1a1a',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: 11,
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#111',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 600,
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #333',
  background: 'transparent',
  color: '#9aa',
  cursor: 'pointer',
}
