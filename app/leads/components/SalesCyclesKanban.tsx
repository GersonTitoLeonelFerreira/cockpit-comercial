'use client'

import CreateLeadModal from './CreateLeadModal'
import { ReturnToPoolModal } from './ReturnToPoolModal'
import StageCheckpointModal from './StageCheckpointModal'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

// ============================================================================
// TIPOS SLA
// ============================================================================
type SLARuleDB = {
  id: string
  status: Status
  target_minutes: number
  warning_minutes: number
  danger_minutes: number
}

type SLALevel = 'ok' | 'warn' | 'danger'

// ============================================================================
// DEFAULTS SLA
// ============================================================================
const DEFAULT_SLA_RULES: Record<Status, Omit<SLARuleDB, 'id'>> = {
  novo: { status: 'novo', target_minutes: 1440, warning_minutes: 1440, danger_minutes: 2880 },
  contato: { status: 'contato', target_minutes: 2880, warning_minutes: 2880, danger_minutes: 4320 },
  respondeu: { status: 'respondeu', target_minutes: 1440, warning_minutes: 1440, danger_minutes: 2880 },
  negociacao: { status: 'negociacao', target_minutes: 4320, warning_minutes: 4320, danger_minutes: 7200 },
  ganho: { status: 'ganho', target_minutes: 999999, warning_minutes: 999999, danger_minutes: 999999 },
  perdido: { status: 'perdido', target_minutes: 999999, warning_minutes: 999999, danger_minutes: 999999 },
}

// ============================================================================
// HELPERS SLA
// ============================================================================
function getSLALevel(minutesInStage: number, rule: SLARuleDB): SLALevel {
  if (rule.status === 'ganho' || rule.status === 'perdido') return 'ok'
  if (minutesInStage >= rule.danger_minutes) return 'danger'
  if (minutesInStage >= rule.warning_minutes) return 'warn'
  return 'ok'
}

function formatTimeInStage(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  if (minutes < 60) return `${Math.floor(minutes)}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

function getSLAColor(level: SLALevel): string {
  switch (level) {
    case 'ok': return '#10b981'
    case 'warn': return '#f59e0b'
    case 'danger': return '#ef4444'
  }
}

function getSLALabel(level: SLALevel): string {
  switch (level) {
    case 'ok': return '🟢 OK'
    case 'warn': return '🟡 ATENÇÃO'
    case 'danger': return '🔴 ESTOURADO'
  }
}

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

const RETURN_REASONS = [
  { value: 'contato_incorreto', label: 'Contato Incorreto' },
  { value: 'incontactavel', label: 'Incontactável' },
  { value: 'duplicado', label: 'Duplicado' },
  { value: 'invalido_dados_incompletos', label: 'Dados Inválidos/Incompletos' },
  { value: 'fora_do_icp', label: 'Fora do ICP' },
  { value: 'fora_da_regiao_unidade', label: 'Fora da Região/Unidade' },
  { value: 'opt_out_lgpd', label: 'Opt-out LGPD' },
  { value: 'reatribuicao_melhor_fit', label: 'Reatribuição (Melhor fit)' },
  { value: 'outro', label: 'Outro' },
]

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

type LeadGroup = {
  id: string
  name: string
}

type PipelineItem = {
  id: string
  lead_id: string
  owner_id: string | null
  group_id: string | null
  status: Status
  stage_entered_at: string
  created_at: string
  name: string
  phone: string | null
  next_action: string | null
  next_action_date: string | null
  lead_groups?: { name: string } | null
}

type PoolItem = PipelineItem & {
  last_return_reason?: string | null
  last_return_details?: string | null
  last_return_at?: string | null
  last_return_by?: string | null
}

// ============================================================================
// HELPERS AGENDA
// ============================================================================
type AgendaState = 'none' | 'today' | 'overdue' | 'future'

function isSameLocalDay(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

function getAgendaState(nextActionDateStr: string | null): AgendaState {
  if (!nextActionDateStr) return 'none'

  const now = new Date()
  const actionDate = new Date(nextActionDateStr)

  if (actionDate < now) return 'overdue'
  if (isSameLocalDay(actionDate, now)) return 'today'
  return 'future'
}

function formatNextActionDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month} ${hours}:${mins}`
}

function getAgendaBadgeStyle(state: AgendaState): { bg: string; text: string; icon: string } {
  switch (state) {
    case 'today':
      return { bg: '#1e40af', text: '#93c5fd', icon: '📅' }
    case 'overdue':
      return { bg: '#7f1d1d', text: '#fecaca', icon: '⏰' }
    case 'future':
      return { bg: '#1f2937', text: '#9ca3af', icon: '🗓️' }
    default:
      return { bg: '', text: '', icon: '' }
  }
}

function getAgendaBadgeLabel(state: AgendaState, dateStr: string | null): string {
  switch (state) {
    case 'today':
      return '📅 HOJE'
    case 'overdue':
      return '⏰ ATRASADO'
    case 'future':
      return `🗓️ ${formatNextActionDate(dateStr)}`
    default:
      return ''
  }
}

// ============================================================================
// QuickActionModal
// ============================================================================
function QuickActionModal({
  isOpen,
  leadName,
  onClose,
  onSave,
  isLoading,
}: {
  isOpen: boolean
  leadName: string
  onClose: () => void
  onSave: (action: string, detail: string) => void
  isLoading: boolean
}) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [detail, setDetail] = useState('')

  const actions = [
    { id: 'quick_approach_contact', label: 'Abordagem realizada', nextStatus: 'contato' },
    { id: 'quick_call_done', label: 'Ligação feita', nextStatus: 'contato' },
    { id: 'quick_answered_doubt', label: 'Respondido dúvida', nextStatus: 'respondeu' },
    { id: 'quick_scheduled', label: 'Agendamento realizado', nextStatus: 'respondeu' },
    { id: 'quick_proposal', label: 'Proposta realizada', nextStatus: 'negociacao' },
    { id: 'quick_bad_data', label: 'Telefone incorreto', nextStatus: null },
  ]

  const handleSave = () => {
    if (!selectedAction) {
      alert('Selecione uma ação')
      return
    }
    onSave(selectedAction, detail)
    setSelectedAction(null)
    setDetail('')
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 20,
          width: '90%',
          maxWidth: 400,
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 12 }}>
          Registrar Contato
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 16, color: '#bfdbfe' }}>
          Lead: <strong>{leadName}</strong>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 8 }}>
            Ação *
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => setSelectedAction(action.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: selectedAction === action.id ? '1px solid #10b981' : '1px solid #2a2a2a',
                  background: selectedAction === action.id ? '#10b981' : '#222',
                  color: selectedAction === action.id ? '#000' : 'white',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 700,
                  transition: 'all 200ms',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
            Detalhes (opcional)
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Adicione notas..."
            style={{
              width: '100%',
              minHeight: 60,
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#222',
              color: 'white',
              fontSize: 11,
              fontFamily: 'system-ui',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: 'transparent',
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 11,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedAction || isLoading}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              border: 'none',
              background: selectedAction && !isLoading ? '#10b981' : '#1f2937',
              color: 'white',
              cursor: selectedAction && !isLoading ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: 11,
              opacity: selectedAction && !isLoading ? 1 : 0.5,
            }}
          >
            {isLoading ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ReturnReasonModal
// ============================================================================
function ReturnReasonModal({
  isOpen,
  cycleId,
  cycleName,
  onClose,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean
  cycleId: string | null
  cycleName: string
  onClose: () => void
  onConfirm: (cycleId: string, reason: string, details: string) => void
  isLoading: boolean
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')

  useEffect(() => {
    if (isOpen) {
      setReason('')
      setDetails('')
    }
  }, [isOpen, cycleId])

  const isValid = reason && details.trim().length >= 15

  const handleConfirm = () => {
    if (!isValid) {
      alert('⚠️ Preencha motivo e detalhes (min 15 caracteres)')
      return
    }
    if (!cycleId) return
    onConfirm(cycleId, reason, details.trim())
  }

  const handleClose = () => {
    setReason('')
    setDetails('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 500,
          color: 'white',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>
          Devolver ao Pool
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16, color: '#bfdbfe' }}>
          Lead: <strong>{cycleName}</strong>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
            Motivo *
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#222',
              color: 'white',
              fontSize: 12,
            }}
          >
            <option value="">Selecione motivo…</option>
            {RETURN_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
            Detalhes (mín. 15 caracteres) *
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Descreva o motivo do retorno..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: '#222',
              color: 'white',
              fontSize: 12,
              fontFamily: 'system-ui',
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
            {details.trim().length}/15 caracteres
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: '1px solid #2a2a2a',
              background: 'transparent',
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              fontSize: 12,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || isLoading}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              border: 'none',
              background: isValid && !isLoading ? '#dc2626' : '#1f2937',
              color: 'white',
              cursor: isValid && !isLoading ? 'pointer' : 'not-allowed',
              fontWeight: 900,
              fontSize: 12,
              opacity: isValid && !isLoading ? 1 : 0.5,
            }}
          >
            {isLoading ? 'Devolvendo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// KanbanCard
// ============================================================================
function KanbanCard({
  item,
  isSaving,
  onSetGroup,
  groups,
  isSelected,
  onToggleSelect,
  onReturnToPoolWithReason,
  onReassign,
  onCreateGroupInline,
  onMoveItem,
  sellers,
  isAdmin,
  currentUserId,
  supabase,
  companyId,
  slaRules,
  nowTick,
}: {
  item: PipelineItem
  isSaving: boolean
  onSetGroup: (cycleId: string, groupId: string | null) => void
  groups: LeadGroup[]
  isSelected: boolean
  onToggleSelect: (cycleId: string) => void
  onReturnToPoolWithReason: (cycleId: string, cycleName: string) => void
  onReassign: (cycleId: string, sellerId: string) => void
  onCreateGroupInline: (target: 'card', cycleId: string) => void
  onMoveItem: (cycleId: string, toStatus: Status) => void
  sellers: Profile[]
  isAdmin: boolean
  currentUserId: string
  supabase: any
  companyId: string
  slaRules: Record<Status, SLARuleDB | null>
  nowTick: Date
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [showQuickActionModal, setShowQuickActionModal] = useState(false)
  const [quickActionLoading, setQuickActionLoading] = useState(false)
  const [suggestedStatus, setSuggestedStatus] = useState<string | null>(null)

  const canReturnToPool = isAdmin || item.owner_id === currentUserId

  const handleWhatsApp = () => {
    if (!item.phone) return
    const digits = item.phone.replace(/\D/g, '')
    if (digits.length >= 10) {
      window.open(`https://wa.me/55${digits}`, '_blank')
      setShowQuickActionModal(true)
    }
  }

  const handleCopyPhone = () => {
    if (!item.phone) return
    navigator.clipboard.writeText(item.phone)
    alert('Telefone copiado!')
    setShowQuickActionModal(true)
  }

  const handleQuickActionSave = async (action: string, detail: string) => {
    setQuickActionLoading(true)
    try {
      const suggested = await logQuickAction(
        supabase,
        companyId,
        item.id,
        currentUserId,
        action as QuickActionType,
        detail,
        'whatsapp'
      )

      setSuggestedStatus(suggested)
      setShowQuickActionModal(false)
    } catch (e: any) {
      console.error('Erro ao salvar ação rápida:', e)
      alert('Erro ao registrar ação')
    } finally {
      setQuickActionLoading(false)
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${STATUS_COLORS[item.status]}20`,
        background: isSelected ? '#0f3d2e' : '#111',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        cursor: isSaving ? 'not-allowed' : 'grab',
        transition: 'all 200ms',
        position: 'relative',
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer!.effectAllowed = 'move'
        e.dataTransfer!.setData('cycleId', item.id)
      }}
    >
      {/* CHECKBOX */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(item.id)
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          draggable={false}
          style={{
            width: 18,
            height: 18,
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        />
      </div>

      {/* HEADER: NOME + TELEFONE + MENU */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          marginBottom: 8,
          marginLeft: 28,
        }}
      >
        <div
          style={{
            cursor: 'pointer',
            flex: 1,
          }}
          onClick={() => (window.location.href = `/leads/${item.lead_id}`)}
        >
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>{item.name}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{item.phone || '—'}</div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          draggable={false}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: 16,
            padding: '4px 8px',
            pointerEvents: 'auto',
          }}
        >
          ⋯
        </button>
      </div>

      {/* AÇÃO IMEDIATA */}
      {item.phone && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, marginLeft: 28 }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleWhatsApp()
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid #10b981',
              background: 'transparent',
              color: '#10b981',
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 700,
            }}
            title="Enviar WhatsApp"
          >
            📱 WhatsApp
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleCopyPhone()
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid #60a5fa',
              background: 'transparent',
              color: '#60a5fa',
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 700,
            }}
            title="Copiar telefone"
          >
            📋 Copiar
          </button>
        </div>
      )}

      {/* SLA STATUS */}
      {item.stage_entered_at && (
        (() => {
          const minutes = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at).getTime()) / 60000)
          const rule = slaRules[item.status] || {
            status: item.status,
            ...DEFAULT_SLA_RULES[item.status],
            id: 'default',
          }
          const level = getSLALevel(minutes, rule)
          const timeStr = formatTimeInStage(minutes)
          const color = getSLAColor(level)

          if (item.status === 'ganho' || item.status === 'perdido') {
            return (
              <div style={{ fontSize: 10, opacity: 0.6, marginLeft: 28, marginTop: 6 }}>
                ⏱ {timeStr}
              </div>
            )
          }

          return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 28, marginTop: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color }}>
                {getSLALabel(level)}
              </div>
              <div style={{ fontSize: 9, opacity: 0.6 }}>
                ⏱ {timeStr}
              </div>
            </div>
          )
        })()
      )}

            {/* AGENDA STATUS */}
            {item.next_action_date && (
        (() => {
          const agendaState = getAgendaState(item.next_action_date)
          if (agendaState === 'none') return null

          const { bg, text, icon } = getAgendaBadgeStyle(agendaState)
          const label = getAgendaBadgeLabel(agendaState, item.next_action_date)

          return (
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: text,
                background: bg,
                padding: '4px 8px',
                borderRadius: 4,
                marginLeft: 28,
                marginTop: 4,
                display: 'inline-block',
              }}
            >
              {label}
            </div>
          )
        })()
      )}

      {/* SUGESTÃO DE PRÓXIMA ETAPA COM BOTÃO MOVER */}
      {suggestedStatus && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 28, marginBottom: 8 }}>
          <div style={{ fontSize: 9, opacity: 0.7, color: '#fbbf24', flex: 1 }}>
            💡 Sugestão: mover para <strong>{suggestedStatus.toUpperCase()}</strong>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMoveItem(item.id, suggestedStatus as Status)
              setSuggestedStatus(null)
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: 'none',
              background: '#10b981',
              color: '#000',
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            Mover
          </button>
        </div>
      )}

      {/* PRÓXIMA AÇÃO */}
      {item.next_action && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, fontStyle: 'italic', marginLeft: 28 }}>
          Próx: {item.next_action}
        </div>
      )}

      {/* GRUPO */}
      {item.group_id && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6, color: '#10b981', fontWeight: 'bold', marginLeft: 28 }}>
          {groups.find((g) => g.id === item.group_id)?.name || 'Grupo desconhecido'}
        </div>
      )}

      {/* SALVANDO */}
      {isSaving && <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6, marginLeft: 28 }}>Salvando…</div>}

      {/* MENU DE AÇÕES */}
      {showMenu && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: '#222',
            border: '1px solid #444',
            borderRadius: 8,
            zIndex: 1000,
            minWidth: 200,
            marginTop: 8,
          }}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ padding: 8 }}>
            {canReturnToPool && (
              <>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    onReturnToPoolWithReason(item.id, item.name)
                  }}
                  draggable={false}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#dc2626',
                    color: '#fecaca',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                    marginBottom: 4,
                    fontWeight: 900,
                    pointerEvents: 'auto',
                  }}
                >
                  Devolver ao Pool
                </button>

                {isAdmin && (
                  <>
                    {(() => {
                      const validReassignSellers = sellers.filter((s) => s.id !== item.owner_id)
                      return validReassignSellers.length > 0 ? (
                        <div style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #333' }}>
                          <div style={{ fontSize: 10, fontWeight: 900, opacity: 0.7, marginBottom: 4, paddingLeft: 10 }}>
                            REDISTRIBUIR
                          </div>
                          {validReassignSellers.map((s) => (
                            <button
                              key={s.id}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                onReassign(item.id, s.id)
                                setShowMenu(false)
                              }}
                              draggable={false}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: 4,
                                border: 'none',
                                background: '#333',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: 10,
                                textAlign: 'left',
                                marginBottom: 2,
                                pointerEvents: 'auto',
                              }}
                            >
                              {s.full_name}
                            </button>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </>
                )}
              </>
            )}

            <div>
              <div style={{ fontSize: 10, fontWeight: 900, opacity: 0.7, marginBottom: 4, paddingLeft: 10 }}>
                GRUPOS
              </div>

              {isAdmin && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    onCreateGroupInline('card', item.id)
                  }}
                  draggable={false}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid #10b981',
                    background: 'transparent',
                    color: '#10b981',
                    cursor: 'pointer',
                    fontSize: 10,
                    textAlign: 'left',
                    marginBottom: 6,
                    fontWeight: 900,
                    pointerEvents: 'auto',
                  }}
                >
                  Criar Grupo
                </button>
              )}

              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSetGroup(item.id, null)
                  setShowMenu(false)
                }}
                draggable={false}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 4,
                  border: 'none',
                  background: !item.group_id ? '#444' : '#333',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 10,
                  textAlign: 'left',
                  marginBottom: 2,
                  fontWeight: !item.group_id ? 900 : 400,
                  pointerEvents: 'auto',
                }}
              >
                {!item.group_id ? '✓ ' : '• '} Sem grupo
              </button>

              {groups.map((g) => (
                <button
                  key={g.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetGroup(item.id, g.id)
                    setShowMenu(false)
                  }}
                  draggable={false}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: item.group_id === g.id ? '#10b981' : '#333',
                    color: item.group_id === g.id ? '#000' : 'white',
                    cursor: 'pointer',
                    fontSize: 10,
                    textAlign: 'left',
                    marginBottom: 2,
                    fontWeight: item.group_id === g.id ? 900 : 400,
                    pointerEvents: 'auto',
                  }}
                >
                  {item.group_id === g.id ? '✓ ' : '• '} {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* QUICK ACTION MODAL */}
      <QuickActionModal
        isOpen={showQuickActionModal}
        leadName={item.name}
        onClose={() => {
          setShowQuickActionModal(false)
          setSuggestedStatus(null)
        }}
        onSave={handleQuickActionSave}
        isLoading={quickActionLoading}
      />
    </div>
  )
}

// ============================================================================
// VirtualizedStatusColumn
// ============================================================================
type VirtualizedStatusColumnProps = {
  status: Status
  cycles: PipelineItem[]
  totalCount: number
  savingId: string | null
  onDrop: (cycleId: string, toStatus: Status) => void
  onSetGroup: (cycleId: string, groupId: string | null) => void
  onReturnToPoolWithReason: (cycleId: string, cycleName: string) => void
  onReassign: (cycleId: string, sellerId: string) => void
  onCreateGroupInline: (target: 'card', cycleId: string) => void
  onMoveItem: (cycleId: string, toStatus: Status) => void
  groups: LeadGroup[]
  selectedIds: Set<string>
  onToggleSelect: (cycleId: string) => void
  sellers: Profile[]
  isAdmin: boolean
  currentUserId: string
  supabase: any
  companyId: string
  slaRules: Record<Status, SLARuleDB | null>
  nowTick: Date
  slaFilter: 'all' | 'ok' | 'warn' | 'danger'
  agendaFilter: 'all' | 'today' | 'overdue' | 'next7'
}

function VirtualizedStatusColumn({
  status,
  cycles,
  totalCount,
  savingId,
  onDrop,
  onSetGroup,
  onReturnToPoolWithReason,
  onReassign,
  onCreateGroupInline,
  onMoveItem,
  groups,
  selectedIds,
  onToggleSelect,
  sellers,
  isAdmin,
  currentUserId,
  supabase,
  companyId,
  slaRules,
  nowTick,
  slaFilter,
  agendaFilter,
}: VirtualizedStatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  })

  const shown = cycles.length
  const total = totalCount ?? shown
  const headerLabel = total > shown ? `${status.toUpperCase()} (${shown} de ${total})` : `${status.toUpperCase()} (${total})`

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 280,
        background: isOver ? '#1a1a2e' : '#0f0f0f',
        borderRadius: 12,
        padding: 12,
        borderTop: `3px solid ${STATUS_COLORS[status]}`,
        transition: 'background 200ms',
        maxHeight: 600,
        overflowY: 'auto',
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'
      }}
      onDrop={(e) => {
        e.preventDefault()
        const cycleId = e.dataTransfer!.getData('cycleId')
        if (cycleId) {
          onDrop(cycleId, status)
        }
      }}
    >
      <div
        style={{
          fontWeight: 900,
          marginBottom: 12,
          fontSize: 14,
          position: 'sticky',
          top: 0,
          background: isOver ? '#1a1a2e' : '#0f0f0f',
          paddingBottom: 8,
          zIndex: 10,
        }}
      >
        {headerLabel}
      </div>

      {cycles.length === 0 ? (
  <div style={{ opacity: 0.5, fontSize: 12 }}>Vazio</div>
) : (
  <div style={{ display: 'grid', gap: 10 }}>
    {cycles
      .filter((item) => {
        // Filtro SLA
        if (slaFilter !== 'all') {
          const minutes = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at || new Date()).getTime()) / 60000)
          const rule = slaRules[item.status] || {
            status: item.status,
            ...DEFAULT_SLA_RULES[item.status],
            id: 'default',
          }
          const level = getSLALevel(minutes, rule)
          if (level !== slaFilter) return false
        }

        // Filtro AGENDA
        if (agendaFilter !== 'all') {
          const agendaState = getAgendaState(item.next_action_date)
          
          if (agendaFilter === 'today') {
            return agendaState === 'today'
          } else if (agendaFilter === 'overdue') {
            return agendaState === 'overdue'
          } else if (agendaFilter === 'next7') {
            if (agendaState === 'none' || agendaState === 'overdue') return false
            const actionDate = new Date(item.next_action_date!)
            const now = new Date()
            const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
            return actionDate <= sevenDaysLater
          }
        }

        return true
      })
      .map((item) => (
        <KanbanCard
          key={item.id}
          item={item}
          isSaving={savingId === item.id}
          onSetGroup={onSetGroup}
          onReturnToPoolWithReason={onReturnToPoolWithReason}
          onReassign={onReassign}
          onCreateGroupInline={onCreateGroupInline}
          onMoveItem={onMoveItem}
          groups={groups}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={onToggleSelect}
          sellers={sellers}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          supabase={supabase}
          slaRules={slaRules}
          nowTick={nowTick}
          companyId={companyId}
        />
      ))}
  </div>
)}
        </div>
      )
    }

type PoolPage = {
  items: PoolItem[]
  total: number
  hasMore: boolean
}

// ============================================================================
// HELPER: LOG QUICK ACTION
// ============================================================================
type QuickActionType = 'quick_approach_contact' | 'quick_call_done' | 'quick_answered_doubt' | 'quick_scheduled' | 'quick_proposal' | 'quick_bad_data'
async function logQuickAction(
  supabase: any,
  companyId: string,
  cycleId: string,
  userId: string,
  eventType: QuickActionType,
  detail: string = '',
  channel: 'whatsapp' | 'copy' = 'copy'
) {
  try {
    const suggestedMap: Record<QuickActionType, string | null> = {
      quick_approach_contact: 'contato',
      quick_call_done: 'contato',
      quick_answered_doubt: 'respondeu',
      quick_scheduled: 'respondeu',
      quick_proposal: 'negociação',
      quick_bad_data: null
    }

    const metadata = {
      source: 'kanban_quick_action',
      detail,
      channel,
      suggested_next_status: suggestedMap[eventType],
    }

    await supabase.from('cycle_events').insert({
      company_id: companyId,
      cycle_id: cycleId,
      event_type: eventType,
      created_by: userId,
      metadata,
      occurred_at: new Date().toISOString(),
    })

    return suggestedMap[eventType]
  } catch (e: any) {
    console.error('Erro ao registrar ação rápida:', e)
    return null
  }
}

// ============================================================================
// DETECTAR TIPO DE BUSCA
// ============================================================================
function detectSearchType(term: string): 'phone' | 'name' {
  const clean = term.trim()
  const digits = clean.replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 13) return 'phone'
  return 'name'
}

async function loadPoolWithOffset(
  supabase: any,
  companyId: string,
  selectedGroupId: string | null,
  pageNum: number,
  pageSize: number
): Promise<PoolPage> {
  try {
    const offset = (pageNum - 1) * pageSize

    let countQuery = supabase
      .from('v_pipeline_items')
      .select('id', { head: true, count: 'exact' })
      .eq('company_id', companyId)
      .is('owner_id', null)

    if (selectedGroupId) {
      countQuery = countQuery.eq('group_id', selectedGroupId)
    }

    const { count } = await countQuery

    let query = supabase
      .from('v_pipeline_items')
      .select('id, lead_id, name, phone, status, stage_entered_at, owner_id, group_id, lead_groups(id, name), next_action, next_action_date, created_at') 
      .eq('company_id', companyId)
      .is('owner_id', null)
      .order('created_at', { ascending: false })

    if (selectedGroupId) {
      query = query.eq('group_id', selectedGroupId)
    }

    const { data, error: err } = await query.range(offset, offset + pageSize - 1)

    if (err) throw err

    return {
      items: (data ?? []) as PoolItem[],
      total: count ?? 0,
      hasMore: offset + pageSize < (count ?? 0),
    }
  } catch (e: any) {
    console.error('Erro ao carregar pool:', e)
    throw e
  }
}

async function loadKanbanWithCursor(
  supabase: any,
  companyId: string,
  selectedOwnerId: string | null,
  userId: string,
  selectedGroupId: string | null,
  searchTerm: string = '',
  pageSize: number = 50
): Promise<Record<Status, PipelineItem[]>> {
  const ownerToFilter = selectedOwnerId ?? userId
  const result: Record<Status, PipelineItem[]> = {
    novo: [],
    contato: [],
    respondeu: [],
    negociacao: [],
    ganho: [],
    perdido: [],
  }

  const STATUSES_LIST: Status[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

  await Promise.all(
    STATUSES_LIST.map(async (status) => {
      try {
        let query = supabase
          .from('v_pipeline_items')
          .select('id, lead_id, name, phone, status, stage_entered_at, owner_id, group_id, next_action')
          .eq('company_id', companyId)
          .eq('owner_id', ownerToFilter)
          .eq('status', status)

        if (selectedGroupId) {
          query = query.eq('group_id', selectedGroupId)
        }

        // FILTRO DE BUSCA
        if (searchTerm.trim()) {
          const searchType = detectSearchType(searchTerm)
          if (searchType === 'phone') {
            const digits = searchTerm.replace(/\D/g, '')
            query = query.ilike('phone', `%${digits}%`)
          } else if (searchType === 'name') {
            query = query.ilike('name', `%${searchTerm}%`)
          }
        }

        const { data, error: err } = await query
          .order('stage_entered_at', { ascending: false })
          .limit(pageSize)

        if (err) throw err

        result[status] = (data ?? []) as PipelineItem[]
      } catch (e: any) {
        console.error(`Erro ao carregar status ${status}:`, e)
      }
    })
  )

  return result
}

export default function SalesCyclesKanban({
  userId,
  companyId,
  isAdmin,
  defaultOwnerId,
  onShowCreateLeadModal,
}: {
  userId: string
  companyId: string
  isAdmin: boolean
  defaultOwnerId?: string
  onShowCreateLeadModal?: () => void
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

  const [totals, setTotals] = useState<Record<Status, number>>({
    novo: 0,
    contato: 0,
    respondeu: 0,
    negociacao: 0,
    ganho: 0,
    perdido: 0,
  })

  const [groups, setGroups] = useState<LeadGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const prevGroupIdRef = useRef<string | null>(null)
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false)

  const [sellers, setSellers] = useState<Profile[]>([])
  const [poolCycles, setPoolCycles] = useState<PoolItem[]>([])
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(defaultOwnerId ?? null)

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allPoolSelected, setAllPoolSelected] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [poolTotal, setPoolTotal] = useState(0)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolPageNum, setPoolPageNum] = useState(1)
  const [bulkSeller, setBulkSeller] = useState<string>('')
  const [bulkGroup, setBulkGroup] = useState<string>('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [distributeGroupLoading, setDistributeGroupLoading] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)

  const [returnReasonModalOpen, setReturnReasonModalOpen] = useState(false)
  const [returnCycleId, setReturnCycleId] = useState<string | null>(null)
  const [returnCycleName, setReturnCycleName] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)

  const [checkpointOpen, setCheckpointOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState<PendingMove>(null)
  const [checkpointLoading, setCheckpointLoading] = useState(false)

    // SLA STATES
    const [slaRules, setSLARules] = useState<Record<Status, SLARuleDB | null>>({
      novo: null,
      contato: null,
      respondeu: null,
      negociacao: null,
      ganho: null,
      perdido: null,
    })
    const [slaFilter, setSLAFilter] = useState<'all' | 'ok' | 'warn' | 'danger'>('all')
    const [nowTick, setNowTick] = useState(new Date())
    const [agendaFilter, setAgendaFilter] = useState<'all' | 'today' | 'overdue' | 'next7'>('all')

      // Calcular contadores de agenda
  const allItems = Object.values(items).flat()
  const todayCount = allItems.filter((item) => getAgendaState(item.next_action_date) === 'today').length
  const overdueCount = allItems.filter((item) => getAgendaState(item.next_action_date) === 'overdue').length
  const next7Count = allItems.filter((item) => {
    const state = getAgendaState(item.next_action_date)
    if (state === 'none' || state === 'overdue') return false
    const actionDate = new Date(item.next_action_date!)
    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return actionDate <= sevenDaysLater
  }).length

  // SEARCH STATES
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchCount, setSearchCount] = useState<number | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { distance: 8 }))
  const PAGE_SIZE = 50

  const loadGroups = useCallback(async () => {
    if (!companyId) return

    try {
      const { data, error: err } = await supabase
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name', { ascending: true })

      if (err) throw err
      setGroups((data ?? []) as LeadGroup[])
    } catch (e: any) {
      console.error('Erro ao carregar grupos:', e)
    }
  }, [companyId, supabase])

  const loadTotals = useCallback(async () => {
    if (!companyId) return

    if (isAdmin && !selectedOwnerId) {
      setTotals({
        novo: 0,
        contato: 0,
        respondeu: 0,
        negociacao: 0,
        ganho: 0,
        perdido: 0,
      })
      return
    }

    const ownerToCount = isAdmin ? selectedOwnerId : userId

    try {
      const { data, error: err } = await supabase.rpc('rpc_cycles_status_totals', {
        p_owner_user_id: ownerToCount,
        p_group_id: selectedGroupId,
      })

      if (err) throw err

      const next: Record<Status, number> = {
        novo: 0,
        contato: 0,
        respondeu: 0,
        negociacao: 0,
        ganho: 0,
        perdido: 0,
      }

      for (const row of (data ?? []) as any[]) {
        const st = row.status as Status
        next[st] = Number(row.total ?? 0)
      }

      setTotals(next)
    } catch (e: any) {
      console.error('Erro ao carregar totals:', e)
    }
  }, [companyId, isAdmin, selectedOwnerId, userId, selectedGroupId, supabase])

  const loadItems = useCallback(
    async (searchTermParam: string = '') => {
      if (!companyId) return
      setLoading(true)
      setError(null)

      try {
        if (isAdmin && !selectedOwnerId) {
          setItems({
            novo: [],
            contato: [],
            respondeu: [],
            negociacao: [],
            ganho: [],
            perdido: [],
          })
          setLoading(false)
          return
        }

        const kanbanData = await loadKanbanWithCursor(
          supabase,
          companyId,
          selectedOwnerId,
          userId,
          selectedGroupId,
          searchTermParam
        )

        setItems(kanbanData)
        setSearchCount(Object.values(kanbanData).flat().length)
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao carregar ciclos')
      } finally {
        setLoading(false)
      }
    },
    [companyId, userId, supabase, selectedGroupId, isAdmin, selectedOwnerId]
  )

  const loadPoolAndSellers = useCallback(async () => {
    if (!companyId || !isAdmin) return

    try {
      const [sellersResult, poolPage] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('company_id', companyId)
          .in('role', ['member', 'seller', 'consultor'])
          .order('full_name', { ascending: true }),
        loadPoolWithOffset(supabase, companyId, selectedGroupId, 1, PAGE_SIZE),
      ])

      if (sellersResult.error) throw sellersResult.error

      setSellers((sellersResult.data ?? []) as Profile[])
      setPoolCycles(poolPage.items)
      setPoolTotal(poolPage.total)
      setPoolPageNum(1)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar pool')
    }
  }, [companyId, isAdmin, supabase, selectedGroupId])

  const loadPoolPage = useCallback(
    async (pageNum: number) => {
      if (!companyId || !isAdmin) return

      setPoolLoading(true)
      try {
        const poolPage = await loadPoolWithOffset(supabase, companyId, selectedGroupId, pageNum, PAGE_SIZE)
        setPoolCycles(poolPage.items)
        setPoolPageNum(pageNum)
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao carregar página')
      } finally {
        setPoolLoading(false)
      }
    },
    [companyId, isAdmin, supabase, selectedGroupId]
  )

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    void loadTotals()
  }, [loadTotals])

  useEffect(() => {
    void loadPoolAndSellers()
  }, [loadPoolAndSellers])

  const loadSLARules = useCallback(async () => {
    if (!companyId) return

    try {
      const { data, error: err } = await supabase.rpc('rpc_get_company_sla_rules')

      if (err) {
        console.warn('SLA rules não disponível, usando defaults')
        return
      }

      const rulesMap: Record<Status, SLARuleDB | null> = {
        novo: null,
        contato: null,
        respondeu: null,
        negociacao: null,
        ganho: null,
        perdido: null,
      }

      if (data && data.length > 0) {
        data.forEach((rule: SLARuleDB) => {
          rulesMap[rule.status] = rule
        })
      }

      setSLARules(rulesMap)
    } catch (e: any) {
      console.error('Erro ao carregar SLA rules:', e)
    }
  }, [companyId, supabase])

  useEffect(() => {
    void loadSLARules()
  }, [loadSLARules])

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setShowBulkModal(false)
    setShowReturnModal(false)
    setSelectedIds(new Set())
    setAllPoolSelected(false)
  }, [selectedGroupId, selectedOwnerId])

  useEffect(() => {
    if (prevGroupIdRef.current !== selectedGroupId) {
      setShowBulkModal(false)
      setShowReturnModal(false)
      setSelectedIds(new Set())
      setAllPoolSelected(false)
      prevGroupIdRef.current = selectedGroupId
    }
  }, [selectedGroupId])

  // ============================================================================
  // DEBOUNCE SEARCH
  // ============================================================================
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    if (!searchTerm.trim()) {
      void loadItems()
      setSearchCount(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    debounceTimeoutRef.current = setTimeout(() => {
      void loadItems(searchTerm)
      setIsSearching(false)
    }, 300)

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [searchTerm, loadItems])

  useEffect(() => {
    setAllPoolSelected(false)
  }, [poolCycles])

  const moveItem = useCallback(
    async (cycleId: string, toStatus: Status) => {
      setSavingId(cycleId)
      setError(null)

      try {
        const { data, error: err } = await supabase.rpc('rpc_move_cycle_stage', {
          p_cycle_id: cycleId,
          p_to_status: toStatus,
        })

        if (err) throw new Error(err.message || 'Erro ao chamar RPC')
        if (!data) throw new Error('Ciclo não encontrado ou sem permissão')

        await Promise.all([loadItems(searchTerm), loadTotals()])
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao mover ciclo')
      } finally {
        setSavingId(null)
      }
    },
    [supabase, loadItems, loadTotals, searchTerm]
  )

  const setGroupForCycle = useCallback(
    async (cycleId: string, groupId: string | null) => {
      setSavingId(cycleId)
      setError(null)

      try {
        const { data, error: err } = await supabase.rpc('rpc_set_cycle_group', {
          p_cycle_id: cycleId,
          p_group_id: groupId,
        })

        if (err) throw new Error(err.message || 'Erro ao vincular grupo')
        if (!data) throw new Error('Ciclo não encontrado ou sem permissão')

        await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao vincular grupo')
      } finally {
        setSavingId(null)
      }
    },
    [supabase, loadItems, loadTotals, loadPoolAndSellers]
  )

  const returnCycleToPoolWithReason = useCallback(
    async (cycleId: string, reason: string, details: string) => {
      setReturnSaving(true)
      setError(null)

      try {
        const { data, error: err } = await supabase.rpc('rpc_return_cycle_to_pool_with_reason', {
          p_cycle_id: cycleId,
          p_reason: reason,
          p_details: details,
        })

        if (err) throw err
        if (!data?.success) throw new Error('Falha ao devolver ciclo')

        await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])
        alert('Lead devolvido ao pool!')

        setReturnReasonModalOpen(false)
        setReturnCycleId(null)
        setReturnCycleName('')
      } catch (e: any) {
        const msg = e?.message ?? 'Erro ao devolver ciclo'
        setError(msg)
        alert(`${msg}`)
      } finally {
        setReturnSaving(false)
      }
    },
    [supabase, loadItems, loadTotals, loadPoolAndSellers]
  )

  const handleOpenReturnReasonModal = useCallback((cycleId: string, cycleName: string) => {
    setReturnCycleId(cycleId)
    setReturnCycleName(cycleName)
    setReturnReasonModalOpen(true)
  }, [])

  const reassignCycle = useCallback(
    async (cycleId: string, newOwnerId: string) => {
      setSavingId(cycleId)
      try {
        const { error: err } = await supabase.rpc('rpc_reassign_cycle_owner', {
          p_cycle_id: cycleId,
          p_owner_user_id: newOwnerId,
        })

        if (err) throw err
        await Promise.all([loadItems(searchTerm), loadTotals()])
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao redistribuir')
      } finally {
        setSavingId(null)
      }
    },
    [supabase, loadItems, loadTotals, searchTerm]
  )

  const assignCycleToSeller = useCallback(
    async (cycleId: string, sellerId: string) => {
      if (!sellerId) return
      setAssigningId(cycleId)
      setError(null)

      try {
        const { data, error: err } = await supabase.rpc('rpc_bulk_assign_cycles_owner', {
          p_cycle_ids: [cycleId],
          p_owner_user_id: sellerId,
        })

        if (err) throw err
        if (!data?.success) throw new Error('Operação não confirmada')

        await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])
        alert(`Lead atribuído!`)
      } catch (e: any) {
        const msg = e?.message ?? 'Erro ao atribuir'
        setError(msg)
        alert(`${msg}`)
      } finally {
        setAssigningId(null)
      }
    },
    [supabase, loadItems, loadTotals, loadPoolAndSellers]
  )

  const handleCreateGroupInline = useCallback(
    async (target: 'bulk' | 'card', cycleId?: string) => {
      if (!isAdmin) return

      const groupName = prompt('Nome do novo grupo:')
      if (!groupName || groupName.trim() === '') return

      setCreatingGroup(true)

      try {
        const { data, error: err } = await supabase.rpc('rpc_create_lead_group', {
          p_name: groupName.trim(),
        })

        if (err) {
          const msg =
            err.message === 'Já existe um grupo com esse nome' ? 'Já existe um grupo com esse nome' : err.message || 'Erro ao criar grupo'
          alert(`${msg}`)
          return
        }

        if (!data?.success) throw new Error('Falha ao criar grupo')

        const newGroupId = data.id
        const newGroupName = data.name

        await loadGroups()

        if (target === 'bulk') {
          setBulkGroup(newGroupId)
          alert(`Grupo "${newGroupName}" criado!`)
        } else if (target === 'card' && cycleId) {
          const confirmVincular = confirm(`Grupo "${newGroupName}" criado!\n\nDeseja vincular neste lead agora?`)
          if (confirmVincular) {
            await setGroupForCycle(cycleId, newGroupId)
          }
        }
      } catch (e: any) {
        const msg = e?.message ?? 'Erro ao criar grupo'
        alert(`${msg}`)
      } finally {
        setCreatingGroup(false)
      }
    },
    [isAdmin, supabase, loadGroups, setGroupForCycle]
  )

  const bulkReturnToPool = async () => {
    if (selectedIds.size === 0) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)
      const rpcName = isAdmin ? 'rpc_bulk_return_cycles_to_pool' : 'rpc_bulk_return_cycles_to_pool_self'

      const { data, error: err } = await supabase.rpc(rpcName, { p_cycle_ids: cycleIds })

      if (err) throw err
      if (!data?.success) throw new Error('Operação não confirmada')

      await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setShowReturnModal(false)
      alert(`${cycleIds.length} leads devolvidos ao pool!`)
    } catch (e: any) {
      const msg = e?.message ?? 'Erro ao devolver leads'
      setError(msg)
      alert(`${msg}`)
    } finally {
      setAssigningId(null)
    }
  }

  const bulkReassignToSeller = async (sellerId: string) => {
    if (selectedIds.size === 0 || !sellerId || !isAdmin) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)

      const { data, error: err } = await supabase.rpc('rpc_bulk_assign_cycles_owner', {
        p_cycle_ids: cycleIds,
        p_owner_user_id: sellerId,
      })
      if (err) throw err
      if (!data?.success) throw new Error('Operação não confirmada')

      await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setBulkSeller('')
      setShowBulkModal(false)
      alert(`${cycleIds.length} leads redistribuídos!`)
    } catch (e: any) {
      const msg = e?.message ?? 'Erro ao redistribuir leads'
      setError(msg)
      alert(`${msg}`)
    } finally {
      setAssigningId(null)
    }
  }

  const bulkSetGroup = async (groupId: string) => {
    if (selectedIds.size === 0 || !groupId || !isAdmin) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)

      const { data, error: err } = await supabase.rpc('rpc_bulk_set_cycles_group', {
        p_cycle_ids: cycleIds,
        p_group_id: groupId,
      })
      if (err) throw err
      if (!data?.success) throw new Error('Operação não confirmada')

      await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setBulkGroup('')
      setShowBulkModal(false)
      alert(`${cycleIds.length} leads vinculados ao grupo!`)
    } catch (e: any) {
      const msg = e?.message ?? 'Erro ao agrupar leads'
      setError(msg)
      alert(`${msg}`)
    } finally {
      setAssigningId(null)
    }
  }

  const distributeAutomatically = async () => {
    if (selectedIds.size === 0 || sellers.length === 0 || !isAdmin) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)
      const sellerIds = sellers.map((s) => s.id)

      const { data, error: err } = await supabase.rpc('rpc_bulk_assign_round_robin', {
        p_cycle_ids: cycleIds,
        p_owner_ids: sellerIds,
      })
      if (err) throw err
      if (!data?.success) throw new Error('Operação não confirmada')

      await Promise.all([loadItems(), loadTotals(), loadPoolAndSellers()])

      setSelectedIds(new Set())
      setAllPoolSelected(false)
      setShowBulkModal(false)
      alert(`${cycleIds.length} leads distribuídos automaticamente!`)
    } catch (e: any) {
      const msg = e?.message ?? 'Erro ao distribuir'
      setError(msg)
      alert(`${msg}`)
    } finally {
      setAssigningId(null)
    }
  }

  const recallGroupToPool = useCallback(async () => {
    if (!selectedGroupId || !isAdmin) return

    if (!confirm('Tem certeza? Isso vai retirar todos os ciclos do grupo do pool de vendedores.')) {
      return
    }

    setError(null)

    try {
      const { error: err } = await supabase.rpc('rpc_recall_group_to_pool', {
        p_group_id: selectedGroupId,
      })

      if (err) throw err
      setError('Grupo recolhido ao pool com sucesso!')
      await loadPoolAndSellers()
    } catch (e: any) {
      setError(`Erro ao recolher grupo: ${e?.message ?? String(e)}`)
    }
  }, [selectedGroupId, isAdmin, supabase, loadPoolAndSellers])

  const distributeGroupPoolRoundRobin = useCallback(async () => {
    if (!selectedGroupId || !isAdmin || sellers.length === 0) return
  
    if (!confirm('Distribuir TODOS os leads do grupo entre os vendedores em round-robin?')) {
      return
    }
  
    setDistributeGroupLoading(true)
    setError(null)
  
    try {
      const sellerIds = sellers.map((s) => s.id)
  
      // ⭐ BUSCAR TODOS OS LEADS DO GRUPO (não apenas os 50 da página)
      const { data: allGroupLeads, error: fetchErr } = await supabase
        .from('v_pipeline_items')
        .select('id')
        .eq('company_id', companyId)
        .eq('group_id', selectedGroupId)
        .is('owner_id', null)
  
      if (fetchErr) throw fetchErr
  
      const allLeadIds = (allGroupLeads ?? []).map((lead: any) => lead.id)
  
      if (allLeadIds.length === 0) {
        alert('Nenhum lead no pool para este grupo.')
        setDistributeGroupLoading(false)
        return
      }
  
      // ⭐ DISTRIBUIR TODOS OS LEADS
      const { data, error: err } = await supabase.rpc('rpc_bulk_assign_round_robin', {
        p_cycle_ids: allLeadIds,
        p_owner_ids: sellerIds,
      })
  
      if (err) throw err
      if (!data?.success) throw new Error('Operação não confirmada')
  
      const updatedCount = data.updated_count ?? allLeadIds.length
  
      alert(`${updatedCount} leads distribuídos do grupo com sucesso!`)

      setSelectedGroupId(null)  // ⭐ Isso vai automaticamente resetar tudo via useEffect
  
      // ⭐ AGUARDAR um pouco para o banco atualizar
      await new Promise(resolve => setTimeout(resolve, 500))
  
      console.log('Iniciando recarregamento...')
      
      try {
        await Promise.all([loadPoolAndSellers(), loadItems(), loadTotals()])
        console.log('Recarregamento concluído!')
      } catch (err) {
        console.error('Erro ao recarregar:', err)
        throw err
      }
  
    } catch (e: any) {
      const msg = e?.message ?? 'Erro ao distribuir grupo'
      setError(msg)
      alert(`${msg}`)
    } finally {
      setDistributeGroupLoading(false)
    }
  }, [selectedGroupId, isAdmin, sellers, supabase, loadPoolAndSellers, loadItems, loadTotals, companyId])

  const handleCheckpointConfirm = useCallback(
    async (payload: {
      action_channel: string
      action_result: string
      next_action: string
      next_action_date: string
      note: string
      win_reason?: string
      lost_reason?: string
    }) => {
      if (!pendingMove) return

      setCheckpointLoading(true)
      try {
        const { data, error: err } = await supabase.rpc('rpc_move_cycle_stage_checkpoint', {
          p_cycle_id: pendingMove.cycleId,
          p_to_status: pendingMove.toStatus,
          p_checkpoint: payload,
        })

        if (err) throw err
        if (!data?.success) throw new Error('Operação não confirmada')

        alert('✓ Lead atualizado com sucesso!')

        // Recarrega dados
        await Promise.all([loadItems(), isAdmin ? loadPoolAndSellers() : Promise.resolve()])

        setCheckpointOpen(false)
        setPendingMove(null)
      } catch (e: any) {
        const msg = e?.message ?? 'Erro ao mover lead'
        setError(msg)
        alert(`Erro: ${msg}`)
      } finally {
        setCheckpointLoading(false)
      }
    },
    [pendingMove, supabase, loadItems, loadPoolAndSellers, isAdmin]
  )

    const handleDrop = useCallback(
    (cycleId: string, toStatus: Status) => {
      // Descobre o status anterior (fromStatus)
      const fromStatus = Object.entries(items).find(([_, cycles]) =>
        cycles.some((c) => c.id === cycleId)
      )?.[0] as Status | undefined

      if (!fromStatus || fromStatus === toStatus) return

      // Abre o modal ao invés de mover direto
      setPendingMove({ cycleId, fromStatus, toStatus })
      setCheckpointOpen(true)
    },
    [items]
  )

  const toggleSelect = (cycleId: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(cycleId)) {
      newSet.delete(cycleId)
    } else {
      newSet.add(cycleId)
    }
    setSelectedIds(newSet)
  }

  const toggleSelectAllPool = useCallback(() => {
    if (allPoolSelected) {
      setSelectedIds(new Set())
      setAllPoolSelected(false)
    } else {
      const allPoolIds = new Set(poolCycles.map((c) => c.id))
      setSelectedIds(allPoolIds)
      setAllPoolSelected(true)
    }
  }, [allPoolSelected, poolCycles])

  const toggleSelectAllKanban = useCallback(() => {
    const allKanbanItems = Object.values(items).flat()
    const allSelected = selectedIds.size === allKanbanItems.length && allKanbanItems.length > 0

    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      const allIds = new Set(allKanbanItems.map((item) => item.id))
      setSelectedIds(allIds)
    }
  }, [items, selectedIds])

  const validSellersForRedistribution = sellers.filter(
    (s) => !!s.full_name && (!selectedOwnerId || s.id !== selectedOwnerId)
  )
  const canRedistribute = validSellersForRedistribution.length > 0
  const totalPages = Math.ceil(poolTotal / PAGE_SIZE)

  const allKanbanItems = Object.values(items).flat()
  const allKanbanSelected = selectedIds.size === allKanbanItems.length && allKanbanItems.length > 0

  // ============================================================================
  // ADMIN VIEW - Pool
  // ============================================================================
  if (isAdmin && !selectedOwnerId) {
    return (
      <div style={{ background: '#0b0b0b', minHeight: '100vh', color: 'white' }}>
        {/* FILTERS */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #222', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedOwnerId || ''}
            onChange={(e) => setSelectedOwnerId(e.target.value || null)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            <option value="">Selecione um vendedor…</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.email} ({s.role})
              </option>
            ))}
          </select>

          <select
            value={selectedGroupId || ''}
            onChange={(e) => setSelectedGroupId(e.target.value || null)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {selectedGroupId && (
            <button
              onClick={() => void recallGroupToPool()}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #ef4444',
                background: '#7f1d1d',
                color: '#fecaca',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              Recolher Grupo
            </button>
          )}

          {selectedGroupId && sellers.length > 0 && (
            <button
              onClick={() => void distributeGroupPoolRoundRobin()}
              disabled={distributeGroupLoading}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #10b981',
                background: !distributeGroupLoading ? '#047857' : '#1f2937',
                color: 'white',
                cursor: !distributeGroupLoading ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 900,
                opacity: !distributeGroupLoading ? 1 : 0.5,
              }}
            >
              {distributeGroupLoading ? 'Distribuindo…' : 'Distribuir Grupo'}
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={toggleSelectAllPool}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #8b5cf6',
                background: allPoolSelected ? '#8b5cf6' : 'transparent',
                color: allPoolSelected ? '#000' : '#d8b4fe',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 900,
                transition: 'all 200ms',
              }}
            >
              {allPoolSelected ? 'Desmarcar' : 'Selecionar'} ({poolCycles.length})
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #f59e0b',
                  background: '#92400e',
                  color: '#fef3c7',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                Ações ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div style={{ background: '#7f1d1d', color: '#fecaca', padding: 12, borderLeft: '4px solid #ef4444', margin: 20, borderRadius: 6, fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* POOL CONTENT */}
        <div style={{ padding: '20px' }}>
          <div style={{ border: '1px solid #222', borderRadius: 14, background: '#0f0f0f', padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                Pool de Leads {selectedGroupId && '(filtrado)'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{poolCycles.length} de {poolTotal}</div>
            </div>

            {poolCycles.length === 0 ? (
              <div style={{ opacity: 0.5, fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
                Nenhum lead no pool
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, maxHeight: '70vh', overflowY: 'auto', marginBottom: 20 }}>
                {poolCycles.map((cycle) => (
                  <div
                    key={cycle.id}
                    style={{
                      border: '1px solid #2a2a2a',
                      borderRadius: 12,
                      padding: 12,
                      background: selectedIds.has(cycle.id) ? '#0f3d2e' : '#0b0b0b',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      transition: 'all 200ms',
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedIds.has(cycle.id)) {
                        ;(e.currentTarget as HTMLElement).style.background = '#151515'
                        ;(e.currentTarget as HTMLElement).style.borderColor = '#10b981'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = selectedIds.has(cycle.id) ? '#0f3d2e' : '#0b0b0b'
                      ;(e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(cycle.id)}
                      onChange={() => toggleSelect(cycle.id)}
                      style={{ width: 20, height: 20, cursor: 'pointer', marginTop: 2 }}
                    />

                    <div style={{ flex: 1, minWidth: 200, cursor: 'pointer' }} onClick={() => (window.location.href = `/leads/${cycle.lead_id}`)}>
  <div style={{ fontWeight: 800, color: '#10b981' }}>{cycle.name}</div>
  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
    {cycle.phone ?? 'Sem telefone'} • {new Date(cycle.created_at).toLocaleString()}
  </div>
  
  {/* GRUPO - Agora com badge visual melhorado */}
  {cycle.lead_groups ? (
    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, color: '#10b981', fontWeight: 700, background: '#0f3d2e', padding: '4px 8px', borderRadius: 4, display: 'inline-block', border: '1px solid #10b981' }}>
      📁 {cycle.lead_groups.name}
    </div>
  ) : (
    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4, color: '#999', fontStyle: 'italic' }}>
      Sem grupo
    </div>
  )}

  {cycle.last_return_reason && (
                        <div
                          style={{
                            fontSize: 10,
                            opacity: 0.7,
                            marginTop: 6,
                            background: '#1f2937',
                            padding: '6px 8px',
                            borderRadius: 4,
                            border: '1px solid #374151',
                            color: '#fbbf24',
                          }}
                        >
                          <div style={{ fontWeight: 900, marginBottom: 2 }}>Retornado ao Pool</div>
                          <div>
                            <strong>Motivo:</strong>{' '}
                            {RETURN_REASONS.find((r) => r.value === cycle.last_return_reason)?.label || cycle.last_return_reason}
                          </div>
                          <div style={{ marginTop: 2, opacity: 0.85 }}>{cycle.last_return_details}</div>
                          {cycle.last_return_at && (
                            <div style={{ marginTop: 2, fontSize: 9, opacity: 0.7 }}>
                              {new Date(cycle.last_return_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            void assignCycleToSeller(cycle.id, e.target.value)
                            e.target.value = ''
                          }
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid #2a2a2a',
                          background: '#111',
                          color: 'white',
                          cursor: 'pointer',
                          minWidth: 220,
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                        <option value="">Encaminhar para…</option>
                        {sellers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.full_name ?? s.email ?? s.id) + ` (${s.role})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PAGINATION */}
            {poolTotal > PAGE_SIZE && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #222' }}>
                <button
                  onClick={() => loadPoolPage(poolPageNum - 1)}
                  disabled={poolLoading || poolPageNum === 1}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #2a2a2a',
                    background: poolPageNum === 1 ? '#1f2937' : '#111',
                    color: '#fff',
                    cursor: poolLoading || poolPageNum === 1 ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 900,
                    opacity: poolLoading || poolPageNum === 1 ? 0.5 : 1,
                  }}
                >
                  ◀
                </button>

                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1
                  const isCurrentPage = poolPageNum === pageNum
                  const show = pageNum <= 7 || isCurrentPage

                  return show ? (
                    <button
                      key={pageNum}
                      onClick={() => loadPoolPage(pageNum)}
                      disabled={poolLoading}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: isCurrentPage ? '1px solid #3b82f6' : '1px solid #2a2a2a',
                        background: isCurrentPage ? '#3b82f6' : '#111',
                        color: isCurrentPage ? '#000' : '#fff',
                        cursor: poolLoading ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: isCurrentPage ? 900 : 400,
                        opacity: poolLoading ? 0.5 : 1,
                      }}
                    >
                      {pageNum}
                    </button>
                  ) : null
                })}

                {totalPages > 7 && <span style={{ opacity: 0.5, fontSize: 12 }}>…</span>}

                <button
                  onClick={() => loadPoolPage(poolPageNum + 1)}
                  disabled={poolLoading || poolPageNum >= totalPages}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #2a2a2a',
                    background: poolPageNum >= totalPages ? '#1f2937' : '#111',
                    color: '#fff',
                    cursor: poolLoading || poolPageNum >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 900,
                    opacity: poolLoading || poolPageNum >= totalPages ? 0.5 : 1,
                  }}
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        </div>

        {showCreateLeadModal && (
          <CreateLeadModal
            companyId={companyId}
            userId={userId}
            isAdmin={isAdmin}
            groups={groups}
            onLeadCreated={() => {
              void loadItems()
              void loadPoolAndSellers()
            }}
            onClose={() => setShowCreateLeadModal(false)}
          />
        )}

        {showBulkModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
            onClick={() => setShowBulkModal(false)}
          >
            <div
              style={{
                background: '#111',
                border: '1px solid #333',
                borderRadius: 12,
                padding: 24,
                width: '90%',
                maxWidth: 600,
                color: 'white',
                maxHeight: '80vh',
                overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 20 }}>
                Ações em Massa ({selectedIds.size} leads)
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
                <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 12 }}>
                  Devolver ao Pool
                </label>
                <button
                  onClick={bulkReturnToPool}
                  disabled={assigningId === 'bulk'}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 6,
                    border: 'none',
                    background: assigningId !== 'bulk' ? '#dc2626' : '#1f2937',
                    color: assigningId !== 'bulk' ? '#fecaca' : '#999',
                    cursor: assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                    fontWeight: 900,
                    fontSize: 12,
                    marginBottom: 12,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  {assigningId === 'bulk' ? 'Devolvendo…' : 'Devolver'}
                </button>
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
                <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 12 }}>
                  Distribuição Automática
                </label>
                <p style={{ fontSize: 11, opacity: 0.7, marginBottom: 12 }}>
                  Distribui {selectedIds.size} leads uniformemente entre {sellers.length} vendedores
                </p>
                <button
                  onClick={distributeAutomatically}
                  disabled={assigningId === 'bulk' || sellers.length === 0}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 6,
                    border: 'none',
                    background: sellers.length > 0 && assigningId !== 'bulk' ? '#10b981' : '#1f2937',
                    color: 'white',
                    cursor: sellers.length > 0 && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                    fontWeight: 900,
                    fontSize: 12,
                    opacity: sellers.length > 0 && assigningId !== 'bulk' ? 1 : 0.5,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  {assigningId === 'bulk' ? 'Distribuindo…' : 'Distribuir Automaticamente'}
                </button>
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
                <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                  Atribuir para Um Vendedor
                </label>
                {!canRedistribute ? (
                  <div style={{ fontSize: 12, opacity: 0.7, color: '#f87171' }}>
                    Nenhum vendedor disponível
                  </div>
                ) : (
                  <>
                    <select
                      value={bulkSeller}
                      onChange={(e) => setBulkSeller(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: 6,
                        border: '1px solid #2a2a2a',
                        background: '#222',
                        color: 'white',
                        fontSize: 12,
                        marginBottom: 12,
                      }}
                    >
                      <option value="">Selecione vendedor…</option>
                      {validSellersForRedistribution.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.role})
                        </option>
                      ))}
                      
                    </select>
                    <button
                      onClick={() => bulkReassignToSeller(bulkSeller)}
                      disabled={!bulkSeller || assigningId === 'bulk'}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: 6,
                        border: 'none',
                        background: bulkSeller && assigningId !== 'bulk' ? '#3b82f6' : '#1f2937',
                        color: 'white',
                        cursor: bulkSeller && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                        fontWeight: 900,
                        fontSize: 12,
                        opacity: bulkSeller && assigningId !== 'bulk' ? 1 : 0.5,
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                    >
                      {assigningId === 'bulk' ? 'Atribuindo…' : 'Atribuir Todos'}
                    </button>
                  </>
                )}
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
                <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                  Vincular Grupo
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <select
                    value={bulkGroup}
                    onChange={(e) => setBulkGroup(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 6,
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: 12,
                    }}
                  >
                    <option value="">Selecione grupo…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  {isAdmin && (
                    <button
                      onClick={() => void handleCreateGroupInline('bulk')}
                      disabled={creatingGroup}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #10b981',
                        background: !creatingGroup ? '#047857' : '#1f2937',
                        color: 'white',
                        cursor: !creatingGroup ? 'pointer' : 'not-allowed',
                        fontSize: 12,
                        fontWeight: 900,
                        opacity: !creatingGroup ? 1 : 0.5,
                        whiteSpace: 'nowrap',
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                    >
                      {creatingGroup ? 'Criando…' : '+'}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => bulkSetGroup(bulkGroup)}
                  disabled={!bulkGroup || assigningId === 'bulk'}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 6,
                    border: 'none',
                    background: bulkGroup && assigningId !== 'bulk' ? '#8b5cf6' : '#1f2937',
                    color: 'white',
                    cursor: bulkGroup && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                    fontWeight: 900,
                    fontSize: 12,
                    opacity: bulkGroup && assigningId !== 'bulk' ? 1 : 0.5,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  {assigningId === 'bulk' ? 'Agrupando…' : 'Agrupar Todos'}
                </button>
              </div>

              <button
                onClick={() => setShowBulkModal(false)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 12,
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        <ReturnReasonModal
          isOpen={returnReasonModalOpen}
          cycleId={returnCycleId}
          cycleName={returnCycleName}
          onClose={() => {
            setReturnReasonModalOpen(false)
            setReturnCycleId(null)
            setReturnCycleName('')
          }}
          onConfirm={returnCycleToPoolWithReason}
          isLoading={returnSaving}
        />
      </div>
    )
  }

  // ============================================================================
  // VENDOR KANBAN VIEW
  // ============================================================================
  return (
    <div style={{ background: '#0b0b0b', minHeight: '100vh', color: 'white' }}>
            {/* HEADER INDICATORS */}
            <div style={{ padding: '12px 20px', background: '#0b0b0b', borderBottom: '1px solid #222', display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, fontWeight: 900 }}>
        {overdueCount > 0 && (
          <div style={{ color: '#fecaca', background: '#7f1d1d', padding: '6px 12px', borderRadius: 6 }}>
            ⏰ Atrasados: {overdueCount}
          </div>
        )}
        {todayCount > 0 && (
          <div style={{ color: '#93c5fd', background: '#1e40af', padding: '6px 12px', borderRadius: 6 }}>
            📅 Hoje: {todayCount}
          </div>
        )}
      </div>
      {/* FILTERS */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #222', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {isAdmin && (
          <select
            value={selectedOwnerId || ''}
            onChange={(e) => setSelectedOwnerId(e.target.value || null)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            <option value="">Mudar vendedor…</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.email} ({s.role})
              </option>
            ))}
          </select>
        )}

        <select
          value={selectedGroupId || ''}
          onChange={(e) => setSelectedGroupId(e.target.value || null)}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 900,
          }}
        >
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <select
  value={slaFilter}
  onChange={(e) => setSLAFilter(e.target.value as 'all' | 'ok' | 'warn' | 'danger')}
  style={{
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 900,
  }}
>
  <option value="all">SLA: Todos</option>
  <option value="ok">SLA: OK 🟢</option>
  <option value="warn">SLA: Atenção 🟡</option>
  <option value="danger">SLA: Estourado 🔴</option>
</select>

<select
  value={agendaFilter}
  onChange={(e) => setAgendaFilter(e.target.value as 'all' | 'today' | 'overdue' | 'next7')}
  style={{
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 900,
  }}
>
  <option value="all">Agenda: Todos</option>
  <option value="today">Agenda: Hoje ({todayCount})</option>
  <option value="overdue">Agenda: Atrasados ({overdueCount})</option>
  <option value="next7">Agenda: Próximos 7d ({next7Count})</option>
</select>

<div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selectedOwnerId && (
            <button
              onClick={() => {
                void loadItems()
                void loadTotals()
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 900,
              }}
              title="Atualizar apenas o Kanban do vendedor"
            >
              Atualizar Kanban
            </button>
          )}

          <button
            onClick={toggleSelectAllKanban}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #8b5cf6',
              background: allKanbanSelected ? '#8b5cf6' : 'transparent',
              color: allKanbanSelected ? '#000' : '#d8b4fe',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 900,
              transition: 'all 200ms',
            }}
          >
            {allKanbanSelected ? 'Desmarcar' : 'Selecionar'} ({allKanbanItems.length})
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkModal(true)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #f59e0b',
                background: '#92400e',
                color: '#fef3c7',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              Ações ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: 12, borderLeft: '4px solid #ef4444', margin: 20, borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* KANBAN CONTENT */}
      {loading ? (
        <div style={{ opacity: 0.7, padding: '40px', textAlign: 'center' }}>Carregando…</div>
      ) : (
        <div style={{ padding: '20px' }}>
          <DndContext sensors={sensors} collisionDetection={closestCorners}>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12 }}>
              {STATUSES.map((status) => (
                <VirtualizedStatusColumn
                key={status}
                status={status}
                cycles={items[status]}
                totalCount={totals[status] ?? 0}
                savingId={savingId}
                onDrop={handleDrop}
                onSetGroup={setGroupForCycle}
                onReturnToPoolWithReason={handleOpenReturnReasonModal}
                onReassign={reassignCycle}
                onCreateGroupInline={handleCreateGroupInline}
                onMoveItem={moveItem}
                groups={groups}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                sellers={sellers}
                isAdmin={isAdmin}
                currentUserId={userId}
                supabase={supabase}
                slaRules={slaRules}
                nowTick={nowTick}
                slaFilter={slaFilter}
                agendaFilter={agendaFilter}
                companyId={companyId}
              />
              ))}
            </div>
          </DndContext>
        </div>
      )}

      {showCreateLeadModal && (
        <CreateLeadModal
          companyId={companyId}
          userId={userId}
          isAdmin={isAdmin}
          groups={groups}
          onLeadCreated={() => {
            void loadItems()
            void loadPoolAndSellers()
          }}
          onClose={() => setShowCreateLeadModal(false)}
        />
      )}

      {showBulkModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowBulkModal(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 600,
              color: 'white',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 20 }}>
              Ações em Massa ({selectedIds.size} leads)
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
              <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 12 }}>
                Devolver ao Pool
              </label>
              <button
                onClick={bulkReturnToPool}
                disabled={assigningId === 'bulk'}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 6,
                  border: 'none',
                  background: assigningId !== 'bulk' ? '#dc2626' : '#1f2937',
                  color: assigningId !== 'bulk' ? '#fecaca' : '#999',
                  cursor: assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 900,
                  fontSize: 12,
                  marginBottom: 12,
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                {assigningId === 'bulk' ? 'Devolvendo…' : 'Devolver'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
              <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 12 }}>
                Distribuição Automática
              </label>
              <p style={{ fontSize: 11, opacity: 0.7, marginBottom: 12 }}>
                Distribui {selectedIds.size} leads uniformemente entre {sellers.length} vendedores
              </p>
              <button
                onClick={distributeAutomatically}
                disabled={assigningId === 'bulk' || sellers.length === 0}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 6,
                  border: 'none',
                  background: sellers.length > 0 && assigningId !== 'bulk' ? '#10b981' : '#1f2937',
                  color: 'white',
                  cursor: sellers.length > 0 && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 900,
                  fontSize: 12,
                  opacity: sellers.length > 0 && assigningId !== 'bulk' ? 1 : 0.5,
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                {assigningId === 'bulk' ? 'Distribuindo…' : 'Distribuir Automaticamente'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
              <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                Atribuir para Um Vendedor
              </label>
              {!canRedistribute ? (
                <div style={{ fontSize: 12, opacity: 0.7, color: '#f87171' }}>
                  Nenhum vendedor disponível
                </div>
              ) : (
                <>
                  <select
                    value={bulkSeller}
                    onChange={(e) => setBulkSeller(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: 6,
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: 12,
                      marginBottom: 12,
                    }}
                  >
                    <option value="">Selecione vendedor…</option>
                    {validSellersForRedistribution.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.role})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => bulkReassignToSeller(bulkSeller)}
                    disabled={!bulkSeller || assigningId === 'bulk'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 6,
                      border: 'none',
                      background: bulkSeller && assigningId !== 'bulk' ? '#3b82f6' : '#1f2937',
                      color: 'white',
                      cursor: bulkSeller && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                      fontWeight: 900,
                      fontSize: 12,
                      opacity: bulkSeller && assigningId !== 'bulk' ? 1 : 0.5,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                  >
                    {assigningId === 'bulk' ? 'Atribuindo…' : 'Atribuir Todos'}
                  </button>
                </>
              )}
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #222' }}>
              <label style={{ fontSize: 13, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                Vincular Grupo
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <select
                  value={bulkGroup}
                  onChange={(e) => setBulkGroup(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 6,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 12,
                  }}
                >
                  <option value="">Selecione grupo…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {isAdmin && (
                  <button
                    onClick={() => void handleCreateGroupInline('bulk')}
                    disabled={creatingGroup}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #10b981',
                      background: !creatingGroup ? '#047857' : '#1f2937',
                      color: 'white',
                      cursor: !creatingGroup ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      fontWeight: 900,
                      opacity: !creatingGroup ? 1 : 0.5,
                      whiteSpace: 'nowrap',
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                  >
                    {creatingGroup ? 'Criando…' : '+'}
                  </button>
                )}
              </div>
              <button
                onClick={() => bulkSetGroup(bulkGroup)}
                disabled={!bulkGroup || assigningId === 'bulk'}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 6,
                  border: 'none',
                  background: bulkGroup && assigningId !== 'bulk' ? '#8b5cf6' : '#1f2937',
                  color: 'white',
                  cursor: bulkGroup && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 900,
                  fontSize: 12,
                  opacity: bulkGroup && assigningId !== 'bulk' ? 1 : 0.5,
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                {assigningId === 'bulk' ? 'Agrupando…' : 'Agrupar Todos'}
              </button>
            </div>

            <button
              onClick={() => setShowBulkModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #2a2a2a',
                background: 'transparent',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: 12,
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

            <ReturnReasonModal
        isOpen={returnReasonModalOpen}
        cycleId={returnCycleId}
        cycleName={returnCycleName}
        onClose={() => {
          setReturnReasonModalOpen(false)
          setReturnCycleId(null)
          setReturnCycleName('')
        }}
        onConfirm={returnCycleToPoolWithReason}
        isLoading={returnSaving}
      />

      <StageCheckpointModal
        open={checkpointOpen}
        fromStatus={pendingMove?.fromStatus || 'novo'}
        toStatus={pendingMove?.toStatus || 'novo'}
        onCancel={() => {
          setCheckpointOpen(false)
          setPendingMove(null)
        }}
        onConfirm={handleCheckpointConfirm}
        loading={checkpointLoading}
      />
    </div>
  )
}