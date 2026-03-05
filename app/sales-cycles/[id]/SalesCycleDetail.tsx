'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { moveCycleStage, assignCycleOwner, setCycleNextAction } from '../../lib/salesCyclesService'
import type { SalesCycle, CycleEvent, CycleStatus } from '../../types/sales_cycles'

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

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function eventLabel(ev: CycleEvent) {
  switch (ev.event_type) {
    case 'cycle_created': return '🆕 Ciclo criado'
    case 'stage_changed': return '↔️ Etapa alterada'
    case 'owner_assigned': return '👤 Responsável atribuído'
    case 'closed_won': return '🏆 Fechado (ganho)'
    case 'closed_lost': return '❌ Fechado (perdido)'
    case 'next_action_set': return '📅 Próxima ação definida'
    default: return ev.event_type
  }
}

type Seller = { id: string; full_name: string | null; email: string | null; role: string }

export default function SalesCycleDetail({
  cycle: initialCycle,
  ownerName,
  events: initialEvents,
  eventsErr,
  sellers,
  userId,
  companyId,
  isAdmin,
}: {
  cycle: SalesCycle
  ownerName: string | null
  events: CycleEvent[]
  eventsErr: string | null
  sellers: Seller[]
  userId: string
  companyId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [cycle, setCycle] = useState<SalesCycle>(initialCycle)
  const [saving, setSaving] = useState(false)

  // move stage
  const [toStatus, setToStatus] = useState<CycleStatus>(cycle.status)

  // close modal
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeType, setCloseType] = useState<'ganho' | 'perdido'>('ganho')
  const [dealValueRaw, setDealValueRaw] = useState('')
  const [lossReason, setLossReason] = useState(LOSS_REASONS[0])

  // next action modal
  const [showNextAction, setShowNextAction] = useState(false)
  const [nextAction, setNextAction] = useState(cycle.next_action ?? '')
  const [nextActionDate, setNextActionDate] = useState(
    cycle.next_action_date ? cycle.next_action_date.slice(0, 16) : ''
  )

  // assign owner (admin)
  const [newOwnerId, setNewOwnerId] = useState('')
  const [assigningOwner, setAssigningOwner] = useState(false)

  const parsedDealValue = (() => {
    const s = dealValueRaw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  async function handleMoveStage() {
    if (toStatus === cycle.status) return
    if (toStatus === 'ganho' || toStatus === 'perdido') {
      setCloseType(toStatus)
      setShowCloseModal(true)
      return
    }
    setSaving(true)
    try {
      await moveCycleStage(cycle.id, companyId, cycle.status, toStatus, userId)
      setCycle((prev) => ({ ...prev, status: toStatus, stage_entered_at: new Date().toISOString() }))
      alert('Etapa atualizada!')
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseConfirm() {
    setSaving(true)
    try {
      await moveCycleStage(cycle.id, companyId, cycle.status, closeType, userId, {
        dealValue: closeType === 'ganho' ? parsedDealValue : undefined,
        lossReason: closeType === 'perdido' ? lossReason : undefined,
      })
      setCycle((prev) => ({
        ...prev,
        status: closeType,
        closed_at: new Date().toISOString(),
        deal_value: closeType === 'ganho' ? parsedDealValue : prev.deal_value,
        loss_reason: closeType === 'perdido' ? lossReason : prev.loss_reason,
      }))
      setShowCloseModal(false)
      router.refresh()
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveNextAction() {
    setSaving(true)
    try {
      const date = nextActionDate ? new Date(nextActionDate).toISOString() : null
      await setCycleNextAction(cycle.id, companyId, userId, nextAction || null, date)
      setCycle((prev) => ({ ...prev, next_action: nextAction || null, next_action_date: date }))
      setShowNextAction(false)
      alert('Próxima ação salva!')
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function handleAssignOwner() {
    if (!newOwnerId) return
    setAssigningOwner(true)
    try {
      await assignCycleOwner(cycle.id, companyId, newOwnerId, userId)
      const seller = sellers.find((s) => s.id === newOwnerId)
      setCycle((prev) => ({ ...prev, owner_user_id: newOwnerId }))
      alert(`Responsável atribuído: ${seller?.full_name ?? seller?.email ?? newOwnerId}`)
      router.refresh()
    } catch (e: any) {
      alert('Erro: ' + (e?.message ?? String(e)))
    } finally {
      setAssigningOwner(false)
    }
  }

  const leadName = (cycle.lead as any)?.name ?? 'Lead sem nome'
  const leadPhone = (cycle.lead as any)?.phone ?? null

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', color: 'white' }}>
      {/* Back link */}
      <Link href="/sales-cycles" style={{ color: '#9aa', textDecoration: 'none', fontSize: 13 }}>
        ← Voltar para ciclos
      </Link>

      {/* Header */}
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{leadName}</h1>
        <div style={{ marginTop: 8, opacity: 0.8, fontSize: 14 }}>
          {leadPhone ? (
            <span>📞 {leadPhone}</span>
          ) : (
            <span style={{ opacity: 0.5 }}>Sem telefone</span>
          )}
          {' • '}
          <span>Status: <strong>{STATUS_LABEL[cycle.status] ?? cycle.status}</strong></span>
          {ownerName ? (
            <>{' • '}<span>Responsável: <strong>{ownerName}</strong></span></>
          ) : (
            <>{' • '}<span style={{ opacity: 0.6 }}>Sem responsável</span></>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.5 }}>
          Criado em {formatDateTime(cycle.created_at)}
          {cycle.closed_at ? ` • Fechado em ${formatDateTime(cycle.closed_at)}` : ''}
        </div>
      </div>

      {/* Actions panel */}
      <div
        style={{
          border: '1px solid #222',
          borderRadius: 14,
          background: '#0f0f0f',
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Ações</h3>

        <div style={{ display: 'grid', gap: 14 }}>
          {/* Move stage */}
          <div>
            <label style={labelStyle} htmlFor="move-stage">Mover para etapa</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                id="move-stage"
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value as CycleStatus)}
                style={{ ...inputStyle, flex: '1 1 auto', minWidth: 160 }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleMoveStage}
                disabled={saving || toStatus === cycle.status}
                style={{ ...btnPrimary, opacity: (saving || toStatus === cycle.status) ? 0.6 : 1 }}
              >
                {saving ? 'Salvando…' : 'Mover'}
              </button>
            </div>
          </div>

          {/* Next action */}
          <div>
            <div style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Próxima ação</div>
            {cycle.next_action ? (
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>{cycle.next_action}</strong>
                {cycle.next_action_date ? (
                  <span style={{ opacity: 0.7 }}> — {formatDateTime(cycle.next_action_date)}</span>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 8 }}>Nenhuma ação definida</div>
            )}
            <button type="button" onClick={() => setShowNextAction(true)} style={btnSecondary}>
              ✏️ Editar próxima ação
            </button>
          </div>

          {/* Close buttons */}
          <div>
            <div style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Fechar ciclo</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { setCloseType('ganho'); setShowCloseModal(true) }}
                disabled={saving || cycle.status === 'ganho'}
                style={{ ...btnPrimary, borderColor: '#2a6', opacity: cycle.status === 'ganho' ? 0.5 : 1 }}
              >
                🏆 Fechar (Ganho)
              </button>
              <button
                type="button"
                onClick={() => { setCloseType('perdido'); setShowCloseModal(true) }}
                disabled={saving || cycle.status === 'perdido'}
                style={{ ...btnPrimary, borderColor: '#a22', opacity: cycle.status === 'perdido' ? 0.5 : 1 }}
              >
                ❌ Fechar (Perdido)
              </button>
            </div>
          </div>

          {/* Assign owner (admin) */}
          {isAdmin ? (
            <div>
              <label style={labelStyle} htmlFor="assign-owner">Atribuir responsável</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select
                  id="assign-owner"
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  style={{ ...inputStyle, flex: '1 1 auto', minWidth: 200 }}
                >
                  <option value="">Selecionar vendedor…</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.full_name ?? s.email ?? s.id) + ` (${s.role})`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssignOwner}
                  disabled={assigningOwner || !newOwnerId}
                  style={{ ...btnPrimary, opacity: (!newOwnerId || assigningOwner) ? 0.6 : 1 }}
                >
                  {assigningOwner ? 'Atribuindo…' : 'Atribuir'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Events timeline */}
      <div
        style={{
          border: '1px solid #222',
          borderRadius: 14,
          background: '#0f0f0f',
          padding: 16,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Timeline do ciclo</h3>

        {eventsErr ? (
          <p style={{ color: '#f66' }}>Erro ao buscar eventos: {eventsErr}</p>
        ) : null}

        {initialEvents.length === 0 ? (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Nenhum evento registrado ainda.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {initialEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  padding: 12,
                  border: '1px solid #222',
                  borderRadius: 10,
                  background: '#111',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{eventLabel(ev)}</strong>
                    {ev.from_stage && ev.to_stage ? (
                      <span style={{ opacity: 0.75, fontSize: 13 }}>
                        {' '}• {STATUS_LABEL[ev.from_stage as CycleStatus] ?? ev.from_stage} →{' '}
                        {STATUS_LABEL[ev.to_stage as CycleStatus] ?? ev.to_stage}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ opacity: 0.5, fontSize: 12 }}>{formatDateTime(ev.created_at)}</div>
                </div>

                {ev.metadata && Object.keys(ev.metadata).length > 0 ? (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                    {ev.metadata.loss_reason ? <div>Motivo: {ev.metadata.loss_reason}</div> : null}
                    {ev.metadata.deal_value != null ? (
                      <div>
                        Valor:{' '}
                        {Number(ev.metadata.deal_value).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </div>
                    ) : null}
                    {ev.metadata.next_action ? <div>Ação: {ev.metadata.next_action}</div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close modal */}
      {showCloseModal ? (
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
          onClick={() => setShowCloseModal(false)}
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
            <h3 style={{ marginTop: 0 }}>Fechar ciclo</h3>

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
                <label style={labelStyle} htmlFor="modal-deal-value">Valor do negócio (opcional)</label>
                <input
                  id="modal-deal-value"
                  type="text"
                  value={dealValueRaw}
                  onChange={(e) => setDealValueRaw(e.target.value)}
                  placeholder="Ex: 2.500,00"
                  style={inputStyle}
                />
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle} htmlFor="modal-loss-reason">Motivo da perda</label>
                <select
                  id="modal-loss-reason"
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
              <button type="button" onClick={() => setShowCloseModal(false)} disabled={saving} style={btnSecondary}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCloseConfirm}
                disabled={saving}
                style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Next action modal */}
      {showNextAction ? (
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
          onClick={() => setShowNextAction(false)}
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
            <h3 style={{ marginTop: 0 }}>Próxima ação</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle} htmlFor="modal-next-action">Ação</label>
              <input
                id="modal-next-action"
                type="text"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="Ex: Ligar para confirmar proposta"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle} htmlFor="modal-next-action-date">Data e hora</label>
              <input
                id="modal-next-action-date"
                type="datetime-local"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowNextAction(false)} disabled={saving} style={btnSecondary}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNextAction}
                disabled={saving}
                style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.8, marginBottom: 6 }

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
