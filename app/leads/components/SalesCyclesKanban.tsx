'use client'

import {
  WhatsAppIcon,
  ClipboardCopyIcon,
  ClockIcon,
  CalendarIcon,
  ClipboardListIcon,
  TagIcon,
  CircleAlertIcon,
  WarningTriangleIcon,
  CalendarRangeIcon,
  CalendarTodayIcon,
} from '@/app/components/icons/KanbanIcons'
import CreateLeadModal from './CreateLeadModal'
import { ReturnToPoolModal } from './ReturnToPoolModal'
import StageCheckpointModal from './StageCheckpointModal'
import { WinDealModal } from '@/app/components/leads/WinDealModal'
import { LostDealModal } from '@/app/components/leads/LostDealModal'
import { QuickActionModal, logQuickAction, QuickActionType } from '@/app/components/leads/QuickActionModal'
import SellerMicroKPIs from './SellerMicroKPIs'
import SellerWorklist from './SellerWorklist'
import { ToastContainer, useToast } from './Toast'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

// ============================================================================
// DESIGN TOKENS — shell DNA
// ============================================================================
const DS = {
  contentBg:       '#090b0f',
  panelBg:         '#0d0f14',
  surfaceBg:       '#111318',
  border:          '#1a1d2e',
  borderSubtle:    '#13162a',
  textPrimary:     '#edf2f7',
  textSecondary:   '#8fa3bc',
  textMuted:       '#546070',
  textLabel:       '#4a5569',
  blue:            '#3b82f6',
  blueSoft:        '#93c5fd',
  blueLight:       '#60a5fa',
  greenBg:         'rgba(22,163,74,0.10)',
  greenBorder:     'rgba(34,197,94,0.25)',
  greenText:       '#86efac',
  amberBg:         'rgba(245,158,11,0.12)',
  amberBorder:     'rgba(245,158,11,0.3)',
  amberText:       '#fef3c7',
  redBg:           'rgba(239,68,68,0.10)',
  redBorder:       'rgba(239,68,68,0.3)',
  redText:         '#fca5a5',
  selectBg:        '#0d0f14',
  shadowCard:      '0 1px 4px rgba(0,0,0,0.4)',
  radius:          7,
  radiusContainer: 9,
} as const

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
    case 'ok': return 'SLA OK'
    case 'warn': return 'SLA ATENCAO'
    case 'danger': return 'SLA ESTOURADO'
  }
}

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'

const STATUSES: Status[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

const STATUS_COLORS: Record<Status, string> = {
  novo: '#3b82f6',
  contato: '#06b6d4',
  respondeu: '#eab308',
  negociacao: '#8b5cf6',
  ganho: '#22c55e',
  perdido: '#ef4444',
}

const STATUS_LABELS: Record<Status, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIACAO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
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
  email: string | null
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
      return { bg: '#1e3a8a', text: '#93c5fd', icon: '>' }
    case 'overdue':
      return { bg: '#7f1d1d', text: '#fecaca', icon: '!' }
    case 'future':
      return { bg: '#1f2937', text: '#9ca3af', icon: '-' }
    default:
      return { bg: '', text: '', icon: '' }
  }
}

function getAgendaBadgeLabel(state: AgendaState, dateStr: string | null): string {
  switch (state) {
    case 'today':
      return 'HOJE'
    case 'overdue':
      return 'ATRASADO'
    case 'future':
      return formatNextActionDate(dateStr)
    default:
      return ''
  }
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
      alert('Preencha motivo e detalhes (min 15 caracteres)')
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
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: DS.surfaceBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer + 3,
          padding: 24,
          width: '90%',
          maxWidth: 500,
          color: DS.textPrimary,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: DS.textPrimary }}>
          Devolver ao Pool
        </div>

        <div style={{ fontSize: 12, marginBottom: 16, color: DS.textSecondary }}>
          Lead: <strong style={{ color: DS.blueSoft }}>{cycleName}</strong>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Motivo *
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.selectBg,
              color: DS.textPrimary,
              fontSize: 12,
              outline: 'none',
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
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Detalhes (mín. 15 caracteres) *
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Descreva o motivo do retorno..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: '9px 10px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.selectBg,
              color: DS.textPrimary,
              fontSize: 12,
              fontFamily: 'system-ui',
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4 }}>
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
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              color: DS.textSecondary,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 12,
              opacity: isLoading ? 0.5 : 1,
              transition: 'all 200ms ease',
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
              borderRadius: DS.radius,
              border: 'none',
              background: isValid && !isLoading ? '#dc2626' : DS.panelBg,
              color: isValid && !isLoading ? '#fecaca' : DS.textMuted,
              cursor: isValid && !isLoading ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: 12,
              opacity: isValid && !isLoading ? 1 : 0.5,
              transition: 'all 200ms ease',
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
// CardActionsMenuPortal
// ============================================================================
function CardActionsMenuPortal({
  item,
  anchorRect,
  onClose,
  onReturnToPool,
  onReassign,
  onSetGroup,
  onCreateGroup,
  groups,
  sellers,
  isAdmin,
}: {
  item: PipelineItem
  anchorRect: DOMRect
  onClose: () => void
  onReturnToPool: (cycleId: string, cycleName: string) => void
  onReassign: (cycleId: string, newOwnerId: string) => void
  onSetGroup: (cycleId: string, groupId: string | null) => void
  onCreateGroup: (target: 'bulk' | 'card', cycleId?: string) => void
  groups: LeadGroup[]
  sellers: Profile[]
  isAdmin: boolean
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    right: window.innerWidth - anchorRect.right,
    background: DS.surfaceBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    padding: 8,
    zIndex: 9001,
    minWidth: 240,
flex: '1 1 0%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    color: DS.textPrimary,
    fontSize: 13,
  }

  const menuContent = (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9000 }}
        onClick={onClose}
      />
      <div style={menuStyle}>
        {/* Devolver ao Pool */}
        <div style={{ paddingBottom: 4, marginBottom: 4, borderBottom: `1px solid ${DS.borderSubtle}` }}>
          <button
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              color: DS.redText,
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: DS.radius,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.12)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            onClick={() => {
              onReturnToPool(item.id, item.name)
              onClose()
            }}
          >
            ↩ Devolver ao Pool
          </button>
        </div>

        {/* Redistribuir (admin only) */}
        {isAdmin && sellers.length > 0 && (
          <div style={{ paddingBottom: 4, marginBottom: 4, borderBottom: `1px solid ${DS.borderSubtle}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DS.textLabel, padding: '4px 12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              REDISTRIBUIR
            </div>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onReassign(item.id, e.target.value)
                  onClose()
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: DS.selectBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radius,
                color: DS.textPrimary,
                fontSize: 12,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">Para outro vendedor…</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name ?? s.email} ({s.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Grupos */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textLabel, padding: '4px 12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            GRUPO
          </div>
          <select
            value={item.group_id ?? ''}
            onChange={(e) => {
              onSetGroup(item.id, e.target.value || null)
              onClose()
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: DS.selectBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radius,
              color: DS.textPrimary,
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 4,
              outline: 'none',
            }}
          >
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {isAdmin && (
            <button
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                color: DS.greenText,
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: DS.radius,
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,197,94,0.08)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              onClick={() => {
                onCreateGroup('card', item.id)
                onClose()
              }}
            >
              + Criar novo grupo
            </button>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(menuContent, document.body)
}

// ============================================================================
// KanbanCard
// ============================================================================
function KanbanCard({
  item,
  isSaving,
  isSelected,
  onToggleSelect,
  onOpenMenu,
  onMoveItem,
  supabase,
  companyId,
  currentUserId,
  slaRules,
  nowTick,
}: {
  item: PipelineItem
  isSaving: boolean
  isSelected: boolean
  onToggleSelect: (cycleId: string) => void
  onOpenMenu: (item: PipelineItem, anchorRect: DOMRect) => void
  onMoveItem: (cycleId: string, toStatus: Status) => void
  supabase: any
  companyId: string
  currentUserId: string
  slaRules: Record<Status, SLARuleDB | null>
  nowTick: Date
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [showQuickActionModal, setShowQuickActionModal] = useState(false)
  const [quickActionLoading, setQuickActionLoading] = useState(false)
  const [suggestedStatus, setSuggestedStatus] = useState<string | null>(null)
  const [lastChannel, setLastChannel] = useState<'whatsapp' | 'copy'>('copy')
  const [isHovered, setIsHovered] = useState(false)

  const minutesInStage = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at || new Date()).getTime()) / 60000)
  const slaRule = slaRules[item.status] || { ...DEFAULT_SLA_RULES[item.status], id: 'default' }
  const slaLevel = getSLALevel(minutesInStage, slaRule)

  const agendaState = getAgendaState(item.next_action_date)
  const agendaBadge = getAgendaBadgeStyle(agendaState)
  const agendaLabel = getAgendaBadgeLabel(agendaState, item.next_action_date)

  const groupName = item.lead_groups?.name ?? null

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.phone) return
    const digits = item.phone.replace(/\D/g, '')
    const phone = digits.startsWith('55') ? digits : `55${digits}`
    window.open(`https://wa.me/${phone}`, '_blank')
    setLastChannel('whatsapp')
    setShowQuickActionModal(true)
  }

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.phone) return
    navigator.clipboard.writeText(item.phone).catch((err) => { console.error('Clipboard copy failed:', err) })
    setLastChannel('copy')
    setShowQuickActionModal(true)
  }

  const handleQuickActionSave = async (action: QuickActionType, detail: string) => {
    setQuickActionLoading(true)
    try {
      const suggested = await logQuickAction(
        supabase, companyId, item.id, currentUserId,
        action, detail, lastChannel
      )
      setSuggestedStatus(suggested)
    } finally {
      setQuickActionLoading(false)
      setShowQuickActionModal(false)
    }
  }

  return (
    <div
      style={{
        background: isHovered
          ? `linear-gradient(135deg, ${STATUS_COLORS[item.status]}06, ${STATUS_COLORS[item.status]}12)`
          : isSelected
            ? 'rgba(59,130,246,0.07)'
            : DS.panelBg,
        borderTop: isHovered
          ? `1px solid ${STATUS_COLORS[item.status]}55`
          : isSelected
            ? '1px solid rgba(59,130,246,0.35)'
            : `1px solid ${DS.border}`,
        borderRight: isHovered
          ? `1px solid ${STATUS_COLORS[item.status]}55`
          : isSelected
            ? '1px solid rgba(59,130,246,0.35)'
            : `1px solid ${DS.border}`,
        borderBottom: isHovered
          ? `1px solid ${STATUS_COLORS[item.status]}55`
          : isSelected
            ? '1px solid rgba(59,130,246,0.35)'
            : `1px solid ${DS.border}`,
        borderLeft: `3px solid ${STATUS_COLORS[item.status]}`,
        borderRadius: DS.radius + 3,
        padding: '10px 8px',
        cursor: isSaving ? 'not-allowed' : 'grab',
        transition: 'transform 200ms ease, box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
        position: 'relative',
        overflow: 'hidden',
        maxWidth: '100%',
        boxSizing: 'border-box',
        transform: isHovered ? 'translateY(-1px)' : 'none',
        boxShadow: isHovered
          ? `0 4px 16px rgba(0,0,0,0.4), 0 0 8px ${STATUS_COLORS[item.status]}18`
          : DS.shadowCard,
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer!.effectAllowed = 'move'
        e.dataTransfer!.setData('cycleId', item.id)
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* CHECKBOX */}
      <div
        style={{ position: 'absolute', top: 8, right: 4, cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id) }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          draggable={false}
          style={{ width: 14, height: 14, cursor: 'pointer', pointerEvents: 'auto' }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
        />
      </div>

      {/* MENU BUTTON */}
      <button
        ref={menuButtonRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!menuButtonRef.current) return
          const rect = menuButtonRef.current.getBoundingClientRect()
          onOpenMenu(item, rect)
        }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'none',
          border: 'none',
          color: DS.textLabel,
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
          padding: '2px 4px',
          borderRadius: 4,
        }}
        title="Ações"
      >
        ···
      </button>

            {/* CONTENT */}
            <div
  style={{ cursor: 'pointer', marginLeft: 20, marginRight: 16, overflow: 'hidden', minWidth: 0 }}
  onClick={() => { window.location.href = `/sales-cycles/${item.id}` }}
>
        {/* ROW: Name + SLA badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: DS.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {item.name}
          </div>
          {/* SLA BADGE */}
          {item.status !== 'ganho' && item.status !== 'perdido' && (
            <div
              title={`${getSLALabel(slaLevel)} — ${formatTimeInStage(minutesInStage)} no estágio`}
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: `${getSLAColor(slaLevel)}18`,
                color: getSLAColor(slaLevel),
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {formatTimeInStage(minutesInStage)}
            </div>
          )}
        </div>

        {/* Phone */}
        <div style={{ fontSize: 11, color: DS.textSecondary }}>{item.phone || '—'}</div>

        {/* Próxima ação */}
        {item.next_action && (
          <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4, fontStyle: 'italic' }}>
            Próx: {item.next_action}
          </div>
        )}

        {/* Group name */}
        {groupName && (
          <div style={{ fontSize: 10, color: DS.textLabel, marginTop: 2 }}>
            {groupName}
          </div>
        )}

        {/* ROW: Agenda badge + Quick action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          {/* AGENDA BADGE */}
          {agendaState !== 'none' && (
            <div style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 4,
              background: agendaBadge.bg,
              color: agendaBadge.text,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}>
              <span>{agendaBadge.icon}</span>
              {agendaLabel}
            </div>
          )}
          {agendaState === 'none' && <div />}

          {/* QUICK ACTION BUTTONS: WA + Copy */}
          <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
            {item.phone && (
              <>
                <button
                  onClick={handleWhatsApp}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                  title="Abrir WhatsApp"
                  style={{
                    background: 'rgba(37,211,102,0.15)',
                    border: '1px solid rgba(37,211,102,0.3)',
                    borderRadius: 5,
                    padding: '3px 7px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#25d366',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  <WhatsAppIcon size={14} />
                </button>
                <button
                  onClick={handleCopyPhone}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                  title="Copiar telefone"
                  style={{
                    background: 'rgba(156,163,175,0.1)',
                    border: '1px solid rgba(156,163,175,0.2)',
                    borderRadius: 5,
                    padding: '3px 7px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#9ca3af',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  <ClipboardCopyIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* SUGGESTED MOVE STRIP */}
        {suggestedStatus && suggestedStatus !== item.status && (
          <div
            style={{
              marginTop: 6,
              padding: '4px 8px',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ color: '#93c5fd' }}>
              Mover → {STATUS_LABELS[suggestedStatus as Status] || suggestedStatus}?
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => {
                  onMoveItem(item.id, suggestedStatus as Status)
                  setSuggestedStatus(null)
                }}
                style={{
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 4,
                  color: 'white',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Sim
              </button>
              <button
                onClick={() => setSuggestedStatus(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #374151',
                  borderRadius: 4,
                  color: '#9ca3af',
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Não
              </button>
            </div>
          </div>
        )}

                {/* HOVER DETAILS PANEL */}
                <div
          style={{
            maxHeight: isHovered ? 120 : 0,
            opacity: isHovered ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 200ms ease, opacity 150ms ease',
            marginTop: isHovered ? 8 : 0,
          }}
        >
          <div
            style={{
              padding: '6px 8px',
              background: `${STATUS_COLORS[item.status]}0c`,
              border: `1px solid ${STATUS_COLORS[item.status]}20`,
              borderRadius: DS.radius,
              fontSize: 10,
              color: DS.textSecondary,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {/* Tempo na etapa + SLA */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <ClockIcon size={12} /> {formatTimeInStage(minutesInStage)} na etapa
              </span>
              {item.status !== 'ganho' && item.status !== 'perdido' && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: getSLAColor(slaLevel),
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: `${getSLAColor(slaLevel)}15`,
                  }}
                >
                  {getSLALabel(slaLevel)}
                </span>
              )}
            </div>

            {/* Agenda */}
            {agendaState !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span><CalendarIcon size={12} /></span>
                <span style={{ color: agendaBadge.text }}>
                  {agendaState === 'today' && 'Agenda: HOJE'}
                  {agendaState === 'overdue' && 'Agenda: ATRASADO'}
                  {agendaState === 'future' && `Agenda: ${formatNextActionDate(item.next_action_date)}`}
                </span>
              </div>
            )}

            {/* Próxima ação */}
            {item.next_action && (
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <ClipboardListIcon size={12} /> Próx: {item.next_action}
                {item.next_action_date && ` — ${formatNextActionDate(item.next_action_date)}`}
              </div>
            )}

            {/* Grupo */}
            {groupName && (
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <TagIcon size={12} /> Grupo: {groupName}
              </div>
            )}
          </div>
        </div>

        {isSaving && <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 4 }}>Salvando...</div>}
        </div>

      {/* QUICK ACTION MODAL */}
      {showQuickActionModal && (
        <QuickActionModal
          isOpen={showQuickActionModal}
          leadName={item.name}
          currentStatus={item.status}
          onClose={() => setShowQuickActionModal(false)}
          onSave={handleQuickActionSave}
          isLoading={quickActionLoading}
        />
      )}
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
  selectedIds: Set<string>
  onToggleSelect: (cycleId: string) => void
  slaRules: Record<Status, SLARuleDB | null>
  nowTick: Date
  slaFilter: 'all' | 'ok' | 'warn' | 'danger'
  agendaFilter: 'all' | 'today' | 'overdue' | 'next7'
  onReturnToPool: (cycleId: string, cycleName: string) => void
  onReassign: (cycleId: string, newOwnerId: string) => void
  onSetGroup: (cycleId: string, groupId: string | null) => void
  onCreateGroup: (target: 'bulk' | 'card', cycleId?: string) => void
  groups: LeadGroup[]
  sellers: Profile[]
  isAdmin: boolean
  onMoveItem: (cycleId: string, toStatus: Status) => void
  supabase: any
  companyId: string
  currentUserId: string
}

function VirtualizedStatusColumn({
  status,
  cycles,
  totalCount,
  savingId,
  onDrop,
  selectedIds,
  onToggleSelect,
  slaRules,
  nowTick,
  slaFilter,
  agendaFilter,
  onReturnToPool,
  onReassign,
  onSetGroup,
  onCreateGroup,
  groups,
  sellers,
  isAdmin,
  onMoveItem,
  supabase,
  companyId,
  currentUserId,
}: VirtualizedStatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  })

  const [menuState, setMenuState] = useState<{ item: PipelineItem; anchorRect: DOMRect } | null>(null)

  const handleOpenMenu = useCallback((menuItem: PipelineItem, anchorRect: DOMRect) => {
    setMenuState({ item: menuItem, anchorRect })
  }, [])

  const shown = cycles.length
  const total = totalCount ?? shown
  const headerLabel = total > shown ? `${status.toUpperCase()} (${shown} de ${total})` : `${status.toUpperCase()} (${total})`

  const filteredCycles = cycles.filter((item) => {
    if (slaFilter !== 'all') {
      const minutes = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at || new Date()).getTime()) / 60000)
      const rule = slaRules[item.status] || { ...DEFAULT_SLA_RULES[item.status], id: 'default' }
      const level = getSLALevel(minutes, rule)
      if (level !== slaFilter) return false
    }
    if (agendaFilter !== 'all') {
      const agendaState = getAgendaState(item.next_action_date)
      if (agendaFilter === 'today') return agendaState === 'today'
      if (agendaFilter === 'overdue') return agendaState === 'overdue'
      if (agendaFilter === 'next7') {
        if (agendaState === 'none' || agendaState === 'overdue') return false
        const actionDate = new Date(item.next_action_date!)
        const now = new Date()
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        return actionDate <= sevenDaysLater
      }
    }
    return true
  })

  return (
    <>
    <div
      ref={setNodeRef}
      style={{
        minWidth: 300,
maxWidth: 340,
flex: '0 0 320px',
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? `${STATUS_COLORS[status]}07` : DS.panelBg,
        borderRadius: DS.radiusContainer + 3,
        border: `1px solid ${DS.border}`,
        borderTop: `3px solid ${STATUS_COLORS[status]}`,
        transition: 'background 200ms',
        maxHeight: 'calc(100vh - 200px)',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
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
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        background: `linear-gradient(to bottom, ${STATUS_COLORS[status]}12, transparent)`,
        borderBottom: `1px solid ${DS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', color: STATUS_COLORS[status], textTransform: 'uppercase' }}>
          {headerLabel}
        </div>
        {/* Progress bar */}
        <div style={{ marginTop: 6, height: 2, background: DS.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${total > 0 ? Math.min(100, (shown / total) * 100) : 0}%`,
            background: STATUS_COLORS[status],
            borderRadius: 2,
            transition: 'width 400ms ease',
          }} />
        </div>
      </div>

      {/* Scrollable cards area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 20px' }}>
        {filteredCycles.length === 0 ? (
          <div style={{ color: DS.textMuted, fontSize: 11, textAlign: 'center', paddingTop: 32 }}>
            Vazio
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, overflow: 'hidden' }}>
            {filteredCycles.map((item) => (
                            <KanbanCard
                            key={item.id}
                            item={item}
                            isSaving={savingId === item.id}
                            isSelected={selectedIds.has(item.id)}
                            onToggleSelect={onToggleSelect}
                            onOpenMenu={handleOpenMenu}
                            onMoveItem={onMoveItem}
                            supabase={supabase}
                            companyId={companyId}
                            currentUserId={currentUserId}
                            slaRules={slaRules}
                            nowTick={nowTick}
                          />
            ))}
          </div>
        )}
      </div>
    </div>
    {menuState && (
      <CardActionsMenuPortal
        item={menuState.item}
        anchorRect={menuState.anchorRect}
        onClose={() => setMenuState(null)}
        onReturnToPool={onReturnToPool}
        onReassign={onReassign}
        onSetGroup={onSetGroup}
        onCreateGroup={onCreateGroup}
        groups={groups}
        sellers={sellers}
        isAdmin={isAdmin}
      />
    )}
    </>
  )
}

type PoolPage = {
  items: PoolItem[]
  total: number
  hasMore: boolean
}

type PendingMove = {
  cycleId: string
  fromStatus: Status
  toStatus: Status
} | null

// ============================================================================
// DETECTAR TIPO DE BUSCA
// ============================================================================
function detectSearchType(term: string): 'email' | 'cpf' | 'phone' | 'name' {
  const clean = term.trim()
  if (clean.includes('@')) return 'email'
  const digits = clean.replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 13 && /[() -]/.test(clean)) return 'phone'
  if (digits.length === 11 || digits.length === 14) return 'cpf'
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

    const items = (data ?? []) as PoolItem[]

    // Fetch return reasons for loaded items
    if (items.length > 0) {
      const cycleIds = items.map((i) => i.id)
      const { data: events } = await supabase
        .from('cycle_events')
        .select('cycle_id, metadata, occurred_at, created_by')
        .eq('event_type', 'returned_to_pool')
        .eq('company_id', companyId)
        .in('cycle_id', cycleIds)
        .order('occurred_at', { ascending: false })

      if (events && events.length > 0) {
        // Keep only latest event per cycle
        const latestByCycle: Record<string, any> = {}
        for (const ev of events) {
          if (!latestByCycle[ev.cycle_id]) {
            latestByCycle[ev.cycle_id] = ev
          }
        }
        for (const item of items) {
          const ev = latestByCycle[item.id]
          if (ev) {
            item.last_return_reason = ev.metadata?.reason ?? null
            item.last_return_details = ev.metadata?.details ?? null
            item.last_return_at = ev.occurred_at ?? null
            item.last_return_by = ev.created_by ?? null
          }
        }
      }
    }

    return {
      items,
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
  pageSize: number = 50,
): Promise<{ data: Record<Status, PipelineItem[]>; exactCount: number | null }> {  
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
          .select('id, lead_id, name, phone, email, status, stage_entered_at, owner_id, group_id, next_action, next_action_date, lead_groups(name)')
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
            query = query.or(`phone.ilike.%${digits}%,phone.ilike.%${searchTerm}%`)
          } else if (searchType === 'email') {
            query = query.ilike('email', `%${searchTerm}%`)
          } else if (searchType === 'cpf') {
            const digits = searchTerm.replace(/\D/g, '')
            query = query.or(`phone.ilike.%${digits}%,name.ilike.%${searchTerm}%`)
          } else {
            query = query.ilike('name', `%${searchTerm}%`)
          }
        }

        const orderedQuery = query.order('stage_entered_at', { ascending: false }).limit(pageSize)

const { data, error: err } = await orderedQuery

        if (err) throw err

        result[status] = (data ?? []) as PipelineItem[]
      } catch (e: any) {
        console.error(`Erro ao carregar status ${status}:`, e)
      }
    })
  )

  // Compute exact search count via a single DB count query when searching
  let exactCount: number | null = null
  if (searchTerm.trim()) {
    try {
      const searchType = detectSearchType(searchTerm)
      let countQuery = supabase
        .from('v_pipeline_items')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('owner_id', ownerToFilter)

      if (selectedGroupId) {
        countQuery = countQuery.eq('group_id', selectedGroupId)
      }

      if (searchType === 'phone') {
        const digits = searchTerm.replace(/\D/g, '')
        countQuery = countQuery.or(`phone.ilike.%${digits}%,phone.ilike.%${searchTerm}%`)
      } else if (searchType === 'email') {
        countQuery = countQuery.ilike('email', `%${searchTerm}%`)
      } else if (searchType === 'cpf') {
        const digits = searchTerm.replace(/\D/g, '')
        countQuery = countQuery.or(`phone.ilike.%${digits}%,name.ilike.%${searchTerm}%`)
      } else {
        countQuery = countQuery.ilike('name', `%${searchTerm}%`)
      }

      const { count } = await countQuery
      exactCount = count ?? null
    } catch (e: any) {
      console.error('Erro ao contar resultados de busca:', e)
    }
  }

  return { data: result, exactCount }
}

function KPIChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 11, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 10, color: DS.textMuted }}>{label}</span>
    </div>
  )
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
  const { toasts, addToast, dismissToast } = useToast()

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

  // WIN DEAL MODAL
  const [winDealOpen, setWinDealOpen] = useState(false)
  const [winDealCycleId, setWinDealCycleId] = useState<string | null>(null)
  const [winDealName, setWinDealName] = useState('')
  const [winDealOwnerId, setWinDealOwnerId] = useState<string | undefined>(undefined)

  // LOST DEAL MODAL
  const [lostDealOpen, setLostDealOpen] = useState(false)
  const [lostDealCycleId, setLostDealCycleId] = useState<string | null>(null)
  const [lostDealName, setLostDealName] = useState('')

  // KPI / WORKLIST REFRESH KEY — bump to trigger SellerMicroKPIs and SellerWorklist reload
  const [kpiRefreshKey, setKpiRefreshKey] = useState(0)

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

  const dangerCount = allItems.filter((item) => {
    const minutes = Math.floor((new Date().getTime() - new Date(item.stage_entered_at || new Date()).getTime()) / 60000)
    const rule = slaRules[item.status]
    if (!rule) return false
    return getSLALevel(minutes, rule) === 'danger'
  }).length

  const [focusPanelOpen, setFocusPanelOpen] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)

  // SEARCH STATES
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchCount, setSearchCount] = useState<number | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const PAGE_SIZE = 50
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
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
        p_search_term: searchTerm.trim() || null,
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
  }, [companyId, isAdmin, selectedOwnerId, userId, selectedGroupId, supabase, searchTerm])

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

        const hasActiveFilter = slaFilter !== 'all' || agendaFilter !== 'all'

        const { data: kanbanData, exactCount } = await loadKanbanWithCursor(
          supabase,
          companyId,
          selectedOwnerId,
          userId,
          selectedGroupId,
          searchTermParam, 
          50,
        )

        setItems(kanbanData)
        if (searchTermParam.trim()) {
          setSearchCount(exactCount ?? Object.values(kanbanData).flat().length)
        } else {
          setSearchCount(null)
        }
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
          p_metadata: {},
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
        addToast('Lead devolvido ao pool!')
        setKpiRefreshKey((k) => k + 1)

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
  
      // BUSCAR TODOS OS LEADS DO GRUPO (nao apenas os 50 da pagina)
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
  
      // DISTRIBUIR TODOS OS LEADS
      const { data, error: err } = await supabase.rpc('rpc_bulk_assign_round_robin', {
        p_cycle_ids: allLeadIds,
        p_owner_ids: sellerIds,
      })
  
      if (err) throw err
      if (!data?.success) throw new Error('Operação não confirmada')
  
      const updatedCount = data.updated_count ?? allLeadIds.length
  
      alert(`${updatedCount} leads distribuídos do grupo com sucesso!`)

      setSelectedGroupId(null)  // Isso vai automaticamente resetar tudo via useEffect
  
      // AGUARDAR um pouco para o banco atualizar
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
      result_detail?: string
      next_action: string
      next_action_date: string | null
      note: string
      win_reason?: string
      lost_reason?: string
    }) => {
      if (!pendingMove) return

      setCheckpointLoading(true)
      try {
        const normalizedPayload = {
          ...payload,
          next_action_date: payload.next_action_date
            ? new Date(payload.next_action_date).toISOString()
            : null,
        }
        const { data, error: err } = await supabase.rpc('rpc_move_cycle_stage_checkpoint', {
          p_cycle_id: pendingMove.cycleId,
          p_to_status: pendingMove.toStatus,
          p_checkpoint: normalizedPayload,
        })

        if (err) throw err
        if (!data?.success) throw new Error('Operação não confirmada')

        alert('Lead atualizado com sucesso!')

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

      // Se for GANHO, abre o WinDealModal com campos de valor/faturamento
      if (toStatus === 'ganho') {
        const cycle = Object.values(items).flat().find((c) => c.id === cycleId)
        setWinDealCycleId(cycleId)
        setWinDealName(cycle?.name || '')
        setWinDealOwnerId(cycle?.owner_id || undefined)
        setWinDealOpen(true)
        return
      }

      // Se for PERDIDO, abre o LostDealModal
      if (toStatus === 'perdido') {
        const cycle = Object.values(items).flat().find((c) => c.id === cycleId)
        setLostDealCycleId(cycleId)
        setLostDealName(cycle?.name || '')
        setLostDealOpen(true)
        return
      }

      // Para os demais, abre o Checkpoint genérico
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
      <div style={{ background: DS.contentBg, minHeight: '100vh', color: DS.textPrimary }}>
        {/* FILTERS */}
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${DS.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: DS.surfaceBg }}>
          <select
            value={selectedOwnerId || ''}
            onChange={(e) => setSelectedOwnerId(e.target.value || null)}
            style={{
              padding: '9px 12px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.selectBg,
              color: DS.textPrimary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              outline: 'none',
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
              padding: '9px 12px',
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.selectBg,
              color: DS.textPrimary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              outline: 'none',
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
                padding: '9px 12px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.redBorder}`,
                background: DS.redBg,
                color: DS.redText,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                transition: 'all 200ms ease',
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
                padding: '9px 12px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.greenBorder}`,
                background: DS.greenBg,
                color: DS.greenText,
                cursor: !distributeGroupLoading ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 700,
                opacity: !distributeGroupLoading ? 1 : 0.5,
                transition: 'all 200ms ease',
              }}
            >
              {distributeGroupLoading ? 'Distribuindo…' : 'Distribuir Grupo'}
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={toggleSelectAllPool}
              style={{
                padding: '9px 12px',
                borderRadius: DS.radius,
                border: `1px solid ${allPoolSelected ? DS.blue : DS.border}`,
                background: allPoolSelected ? `rgba(59,130,246,0.15)` : DS.panelBg,
                color: allPoolSelected ? DS.blueSoft : DS.textSecondary,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                transition: 'all 200ms',
              }}
            >
              {allPoolSelected ? 'Desmarcar' : 'Selecionar'} ({poolCycles.length})
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                style={{
                  padding: '9px 12px',
                  borderRadius: DS.radius,
                  border: `1px solid ${DS.amberBorder}`,
                  background: DS.amberBg,
                  color: DS.amberText,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  transition: 'all 200ms',
                }}
              >
                Ações ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div style={{ background: DS.redBg, color: DS.redText, padding: '10px 16px', borderLeft: `3px solid #ef4444`, margin: 20, borderRadius: DS.radius, fontSize: 12, border: `1px solid ${DS.redBorder}` }}>
            {error}
          </div>
        )}

        {/* POOL CONTENT */}
        <div style={{ padding: '20px' }}>
          <div style={{ border: `1px solid ${DS.border}`, borderRadius: DS.radiusContainer + 3, background: DS.panelBg, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: DS.textPrimary }}>
                Pool de Leads {selectedGroupId && <span style={{ color: DS.textMuted, fontWeight: 500 }}>(filtrado)</span>}
              </div>
              <div style={{ fontSize: 12, color: DS.textMuted }}>{poolCycles.length} de {poolTotal}</div>
            </div>

            {poolCycles.length === 0 ? (
              <div style={{ color: DS.textMuted, fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
                Nenhum lead no pool
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8, maxHeight: '70vh', overflowY: 'auto', marginBottom: 20 }}>
                {poolCycles.map((cycle) => (
                  <div
                    key={cycle.id}
                    style={{
                      border: `1px solid ${selectedIds.has(cycle.id) ? DS.blue : DS.border}`,
                      borderRadius: DS.radiusContainer,
                      padding: '12px 14px',
                      background: selectedIds.has(cycle.id) ? 'rgba(59,130,246,0.07)' : DS.contentBg,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      transition: 'all 200ms ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedIds.has(cycle.id)) {
                        ;(e.currentTarget as HTMLElement).style.background = DS.panelBg
                        ;(e.currentTarget as HTMLElement).style.borderColor = DS.blue
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = selectedIds.has(cycle.id) ? 'rgba(59,130,246,0.07)' : DS.contentBg
                      ;(e.currentTarget as HTMLElement).style.borderColor = selectedIds.has(cycle.id) ? DS.blue : DS.border
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(cycle.id)}
                      onChange={() => toggleSelect(cycle.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 3, accentColor: DS.blue }}
                    />

<div
  style={{ flex: 1, minWidth: 200, cursor: 'pointer' }}
  onClick={() => {
    console.log('CARD cycle:', cycle)
    window.location.href = `/sales-cycles/${(cycle as any).id}`
  }}
>
  <div style={{ fontWeight: 700, color: DS.greenText, fontSize: 13 }}>{cycle.name}</div>
  <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 4 }}>
    {cycle.phone ?? 'Sem telefone'} · {new Date(cycle.created_at).toLocaleString()}
  </div>
  
  {/* GRUPO */}
  {cycle.lead_groups ? (
    <div style={{ fontSize: 10, marginTop: 5, color: DS.greenText, fontWeight: 700, background: DS.greenBg, padding: '3px 8px', borderRadius: 4, display: 'inline-block', border: `1px solid ${DS.greenBorder}` }}>
      [G] {cycle.lead_groups.name}
    </div>
  ) : (
    <div style={{ fontSize: 10, marginTop: 5, color: DS.textLabel, fontStyle: 'italic' }}>
      Sem grupo
    </div>
  )}

  {cycle.last_return_reason && (
                        <div
                          style={{
                            fontSize: 10,
                            marginTop: 6,
                            background: DS.amberBg,
                            padding: '6px 8px',
                            borderRadius: DS.radius,
                            border: `1px solid ${DS.amberBorder}`,
                            color: DS.amberText,
                          }}
                        >
                          <div style={{ fontWeight: 800, marginBottom: 2 }}>Retornado ao Pool</div>
                          <div>
                            <strong>Motivo:</strong>{' '}
                            {RETURN_REASONS.find((r) => r.value === cycle.last_return_reason)?.label || cycle.last_return_reason}
                          </div>
                          <div style={{ marginTop: 2, color: DS.textSecondary }}>{cycle.last_return_details}</div>
                          {cycle.last_return_at && (
                            <div style={{ marginTop: 2, fontSize: 9, color: DS.textMuted }}>
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
                          padding: '9px 12px',
                          borderRadius: DS.radius,
                          border: `1px solid ${DS.border}`,
                          background: DS.selectBg,
                          color: DS.textPrimary,
                          cursor: 'pointer',
                          minWidth: 200,
                          fontWeight: 700,
                          fontSize: 12,
                          outline: 'none',
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
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${DS.border}` }}>
                <button
                  onClick={() => loadPoolPage(poolPageNum - 1)}
                  disabled={poolLoading || poolPageNum === 1}
                  style={{
                    padding: '5px 10px',
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.border}`,
                    background: DS.panelBg,
                    color: DS.textSecondary,
                    cursor: poolLoading || poolPageNum === 1 ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: poolLoading || poolPageNum === 1 ? 0.4 : 1,
                  }}
                >
                  {'<<'}
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
                        padding: '5px 10px',
                        borderRadius: DS.radius,
                        border: isCurrentPage ? `1px solid ${DS.blue}` : `1px solid ${DS.border}`,
                        background: isCurrentPage ? DS.blue : DS.panelBg,
                        color: isCurrentPage ? '#fff' : DS.textSecondary,
                        cursor: poolLoading ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: isCurrentPage ? 800 : 400,
                        opacity: poolLoading ? 0.5 : 1,
                        transition: 'all 200ms ease',
                      }}
                    >
                      {pageNum}
                    </button>
                  ) : null
                })}

                {totalPages > 7 && <span style={{ color: DS.textMuted, fontSize: 12 }}>…</span>}

                <button
                  onClick={() => loadPoolPage(poolPageNum + 1)}
                  disabled={poolLoading || poolPageNum >= totalPages}
                  style={{
                    padding: '5px 10px',
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.border}`,
                    background: DS.panelBg,
                    color: DS.textSecondary,
                    cursor: poolLoading || poolPageNum >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: poolLoading || poolPageNum >= totalPages ? 0.4 : 1,
                  }}
                >
                  {'>>'}
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
              background: 'rgba(0,0,0,0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
            onClick={() => setShowBulkModal(false)}
          >
            <div
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusContainer + 3,
                padding: 24,
                width: '90%',
                maxWidth: 600,
                color: DS.textPrimary,
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 20, color: DS.textPrimary }}>
                Ações em Massa ({selectedIds.size} leads)
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Devolver ao Pool
                </label>
                <button
                  onClick={bulkReturnToPool}
                  disabled={assigningId === 'bulk'}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: DS.radius,
                    border: 'none',
                    background: assigningId !== 'bulk' ? 'rgba(220,38,38,0.85)' : DS.panelBg,
                    color: assigningId !== 'bulk' ? '#fecaca' : DS.textMuted,
                    cursor: assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                    fontSize: 12,
                    marginBottom: 4,
                    transition: 'all 200ms ease',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  {assigningId === 'bulk' ? 'Devolvendo…' : 'Devolver'}
                </button>
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Distribuição Automática
                </label>
                <p style={{ fontSize: 11, color: DS.textMuted, marginBottom: 12 }}>
                  Distribui {selectedIds.size} leads uniformemente entre {sellers.length} vendedores
                </p>
                <button
                  onClick={distributeAutomatically}
                  disabled={assigningId === 'bulk' || sellers.length === 0}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: DS.radius,
                    border: `1px solid ${sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBorder : DS.border}`,
                    background: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBg : DS.panelBg,
                    color: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenText : DS.textMuted,
                    cursor: sellers.length > 0 && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                    fontSize: 12,
                    opacity: sellers.length > 0 && assigningId !== 'bulk' ? 1 : 0.5,
                    transition: 'all 200ms ease',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  {assigningId === 'bulk' ? 'Distribuindo…' : 'Distribuir Automaticamente'}
                </button>
              </div>

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Atribuir para Um Vendedor
                </label>
                {!canRedistribute ? (
                  <div style={{ fontSize: 12, color: '#f87171' }}>
                    Nenhum vendedor disponível
                  </div>
                ) : (
                  <>
                    <select
                      value={bulkSeller}
                      onChange={(e) => setBulkSeller(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: DS.radius,
                        border: `1px solid ${DS.border}`,
                        background: DS.selectBg,
                        color: DS.textPrimary,
                        fontSize: 12,
                        marginBottom: 10,
                        outline: 'none',
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
                        padding: '11px',
                        borderRadius: DS.radius,
                        border: 'none',
                        background: bulkSeller && assigningId !== 'bulk' ? DS.blue : DS.panelBg,
                        color: 'white',
                        cursor: bulkSeller && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                        fontWeight: 700,
                        fontSize: 12,
                        opacity: bulkSeller && assigningId !== 'bulk' ? 1 : 0.5,
                        transition: 'all 200ms ease',
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

              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Vincular Grupo
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <select
                    value={bulkGroup}
                    onChange={(e) => setBulkGroup(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: DS.radius,
                      border: `1px solid ${DS.border}`,
                      background: DS.selectBg,
                      color: DS.textPrimary,
                      fontSize: 12,
                      outline: 'none',
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
                        borderRadius: DS.radius,
                        border: `1px solid ${DS.greenBorder}`,
                        background: DS.greenBg,
                        color: DS.greenText,
                        cursor: !creatingGroup ? 'pointer' : 'not-allowed',
                        fontSize: 12,
                        fontWeight: 700,
                        opacity: !creatingGroup ? 1 : 0.5,
                        whiteSpace: 'nowrap',
                        transition: 'all 200ms ease',
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
                    padding: '11px',
                    borderRadius: DS.radius,
                    border: 'none',
                    background: bulkGroup && assigningId !== 'bulk' ? 'rgba(139,92,246,0.7)' : DS.panelBg,
                    color: 'white',
                    cursor: bulkGroup && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                    fontSize: 12,
                    opacity: bulkGroup && assigningId !== 'bulk' ? 1 : 0.5,
                    transition: 'all 200ms ease',
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
                  borderRadius: DS.radius,
                  border: `1px solid ${DS.border}`,
                  background: DS.panelBg,
                  color: DS.textSecondary,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                  transition: 'all 200ms ease',
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

  const pillStyle: React.CSSProperties = {
    borderRadius: DS.radius,
    padding: '7px 12px',
    background: DS.panelBg,
    border: `1px solid ${DS.border}`,
    color: DS.textSecondary,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
    outline: 'none',
    transition: 'all 200ms ease',
  }

  return (
    <div style={{ background: DS.contentBg, minHeight: '100vh', color: DS.textPrimary, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* COMMAND BAR */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(17,19,24,0.94)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${DS.border}`,
        padding: '8px 16px',
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {isAdmin && (
          <select
            value={selectedOwnerId || ''}
            onChange={(e) => setSelectedOwnerId(e.target.value || null)}
            style={pillStyle}
          >
            <option value="">Mudar vendedor...</option>
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
          style={pillStyle}
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
          style={pillStyle}
        >
          <option value="all">SLA: Todos</option>
          <option value="ok">SLA: OK</option>
          <option value="warn">SLA: Atenção</option>
          <option value="danger">SLA: Estourado</option>
        </select>

        <select
          value={agendaFilter}
          onChange={(e) => setAgendaFilter(e.target.value as 'all' | 'today' | 'overdue' | 'next7')}
          style={pillStyle}
        >
          <option value="all">Agenda: Todos</option>
          <option value="today">Hoje ({todayCount})</option>
          <option value="overdue">Atrasados ({overdueCount})</option>
          <option value="next7">Próximos 7d ({next7Count})</option>
        </select>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, telefone, CPF ou email..."
            style={{
              borderRadius: DS.radius,
              padding: '7px 14px',
              background: DS.selectBg,
              border: `1px solid ${DS.border}`,
              color: DS.textPrimary,
              fontSize: 12,
              minWidth: 220,
              outline: 'none',
              transition: 'border-color 200ms ease',
            }}
          />
          {searchTerm.trim() && !isSearching && searchCount !== null && (
            <div style={{ fontSize: 10, color: DS.blueSoft, fontWeight: 700, paddingLeft: 4 }}>
              {searchCount} resultado{searchCount !== 1 ? 's' : ''}
            </div>
          )}
          {isSearching && (
            <div style={{ fontSize: 10, color: DS.textMuted, paddingLeft: 4 }}>Buscando...</div>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setFocusPanelOpen((v) => !v)}
            style={{
              ...pillStyle,
              background: focusPanelOpen ? 'rgba(59,130,246,0.14)' : DS.panelBg,
              border: focusPanelOpen ? `1px solid rgba(59,130,246,0.4)` : `1px solid ${DS.border}`,
              color: focusPanelOpen ? DS.blueSoft : DS.textSecondary,
            }}
          >
            {focusPanelOpen ? 'Fechar Fila' : 'Abrir Fila'} ({overdueCount + todayCount})
          </button>

          {selectedOwnerId && (
            <button
              onClick={() => { void loadItems(); void loadTotals() }}
              style={pillStyle}
              title="Atualizar kanban"
              aria-label="Atualizar kanban"
            >
              ↻
            </button>
          )}

          <button
            onClick={toggleSelectAllKanban}
            style={{
              ...pillStyle,
              background: allKanbanSelected ? 'rgba(139,92,246,0.15)' : DS.panelBg,
              border: allKanbanSelected ? '1px solid rgba(139,92,246,0.4)' : `1px solid ${DS.border}`,
              color: allKanbanSelected ? '#c4b5fd' : DS.textSecondary,
            }}
          >
            {allKanbanSelected ? 'Desmarcar' : 'Selecionar'} ({allKanbanItems.length})
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkModal(true)}
              style={{
                ...pillStyle,
                background: DS.amberBg,
                border: `1px solid ${DS.amberBorder}`,
                color: DS.amberText,
              }}
            >
              Ações ({selectedIds.size})
            </button>
          )}

          <button
            onClick={() => setShowCreateLeadModal(true)}
            style={{
              ...pillStyle,
              background: DS.greenBg,
              border: `1px solid ${DS.greenBorder}`,
              color: DS.greenText,
            }}
          >
            + Criar Lead
          </button>
        </div>
      </div>

      {/* MICRO KPIs */}
      <SellerMicroKPIs
        userId={isAdmin && selectedOwnerId ? selectedOwnerId : userId}
        groupId={selectedGroupId}
        supabase={supabase}
        refreshKey={kpiRefreshKey}
      />

      {/* INSIGHTS STRIP */}
      <div
        style={{
          background: DS.panelBg,
          borderBottom: `1px solid ${DS.border}`,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          minHeight: 40,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'background 200ms',
        }}
        onClick={() => setInsightsExpanded((v) => !v)}
        aria-label={insightsExpanded ? 'Recolher insights' : 'Expandir insights'}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: DS.textLabel, letterSpacing: '0.1em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {insightsExpanded ? '▾' : '▸'} INSIGHTS
        </span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <KPIChip label="Atrasados" value={overdueCount} color="#ef4444" />
          <KPIChip label="SLA estourado" value={dangerCount} color="#f59e0b" />
          <KPIChip label="Agenda hoje" value={todayCount} color={DS.blue} />
          <KPIChip label="Próximos 7d" value={next7Count} color="#8b5cf6" />
        </div>
      </div>

            {/* INSIGHTS EXPANDED PANEL */}
            {insightsExpanded && (
        <div style={{
          background: DS.contentBg,
          borderBottom: `1px solid ${DS.border}`,
          padding: '12px 16px',
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {/* SLA ESTOURADO LIST */}
          {(() => {
            const allItems = Object.values(items).flat()
            const overdueItems = allItems.filter((c) => {
              const agState = getAgendaState(c.next_action_date)
              return agState === 'overdue'
            })
            const dangerItems = allItems.filter((c) => {
              if (c.status === 'ganho' || c.status === 'perdido') return false
              const mins = Math.floor((nowTick.getTime() - new Date(c.stage_entered_at || new Date()).getTime()) / 60000)
              const rule = slaRules[c.status] || { ...DEFAULT_SLA_RULES[c.status], id: 'default' }
              return getSLALevel(mins, rule) === 'danger'
            })
            const todayItems = allItems.filter((c) => getAgendaState(c.next_action_date) === 'today')
            const next7Items = allItems.filter((c) => {
              const agState = getAgendaState(c.next_action_date)
              if (agState === 'none' || agState === 'overdue') return false
              const actionDate = new Date(c.next_action_date!)
              const sevenDays = new Date(nowTick.getTime() + 7 * 24 * 60 * 60 * 1000)
              return actionDate <= sevenDays
            })

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                {/* ATRASADOS */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CircleAlertIcon size={12} color="#ef4444" /> Atrasados ({overdueItems.length})
                  </div>
                  {overdueItems.length === 0 ? (
                    <div style={{ fontSize: 10, color: DS.textMuted }}>Nenhum atrasado</div>
                  ) : (
                    overdueItems.slice(0, 10).map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { window.location.href = `/sales-cycles/${c.id}` }}
                        style={{
                          fontSize: 11, padding: '4px 8px', borderRadius: DS.radius,
                          background: 'rgba(239,68,68,0.07)', marginBottom: 4,
                          cursor: 'pointer', color: '#fecaca',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: '1px solid rgba(239,68,68,0.12)',
                        }}
                      >
                        <span>{c.name}</span>
                        <span style={{ fontSize: 9, color: DS.textMuted }}>{formatNextActionDate(c.next_action_date)}</span>
                      </div>
                    ))
                  )}
                  {overdueItems.length > 10 && (
                    <div style={{ fontSize: 9, color: DS.textMuted }}>+{overdueItems.length - 10} mais</div>
                  )}
                </div>

                {/* SLA ESTOURADO */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <WarningTriangleIcon size={12} color="#f59e0b" /> SLA Estourado ({dangerItems.length})
                  </div>
                  {dangerItems.length === 0 ? (
                    <div style={{ fontSize: 10, color: DS.textMuted }}>Nenhum SLA estourado</div>
                  ) : (
                    dangerItems.slice(0, 10).map((c) => {
                      const mins = Math.floor((nowTick.getTime() - new Date(c.stage_entered_at || new Date()).getTime()) / 60000)
                      return (
                        <div
                          key={c.id}
                          onClick={() => { window.location.href = `/sales-cycles/${c.id}` }}
                          style={{
                            fontSize: 11, padding: '4px 8px', borderRadius: DS.radius,
                            background: 'rgba(245,158,11,0.07)', marginBottom: 4,
                            cursor: 'pointer', color: '#fef3c7',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            border: '1px solid rgba(245,158,11,0.12)',
                          }}
                        >
                          <span>{c.name}</span>
                          <span style={{ fontSize: 9, color: DS.textMuted }}>{formatTimeInStage(mins)} em {STATUS_LABELS[c.status]}</span>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* AGENDA HOJE */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: DS.blue, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CalendarTodayIcon size={12} color={DS.blue} /> Agenda Hoje ({todayItems.length})
                  </div>
                  {todayItems.length === 0 ? (
                    <div style={{ fontSize: 10, color: DS.textMuted }}>Nenhum para hoje</div>
                  ) : (
                    todayItems.slice(0, 10).map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { window.location.href = `/sales-cycles/${c.id}` }}
                        style={{
                          fontSize: 11, padding: '4px 8px', borderRadius: DS.radius,
                          background: 'rgba(59,130,246,0.07)', marginBottom: 4,
                          cursor: 'pointer', color: DS.blueSoft,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: `1px solid rgba(59,130,246,0.12)`,
                        }}
                      >
                        <span>{c.name}</span>
                        <span style={{ fontSize: 9, color: DS.textMuted }}>{formatNextActionDate(c.next_action_date)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* PRÓXIMOS 7D */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5cf6', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CalendarRangeIcon size={12} color="#8b5cf6" /> Próximos 7d ({next7Items.length})
                  </div>
                  {next7Items.length === 0 ? (
                    <div style={{ fontSize: 10, color: DS.textMuted }}>Nenhum nos próximos 7 dias</div>
                  ) : (
                    next7Items.slice(0, 10).map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { window.location.href = `/sales-cycles/${c.id}` }}
                        style={{
                          fontSize: 11, padding: '4px 8px', borderRadius: DS.radius,
                          background: 'rgba(139,92,246,0.07)', marginBottom: 4,
                          cursor: 'pointer', color: '#c4b5fd',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: '1px solid rgba(139,92,246,0.12)',
                        }}
                      >
                        <span>{c.name}</span>
                        <span style={{ fontSize: 9, color: DS.textMuted }}>{formatNextActionDate(c.next_action_date)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* MAIN AREA: KANBAN + FOCUS PANEL */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* KANBAN AREA */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {error && (
            <div style={{ background: DS.redBg, color: DS.redText, padding: '8px 16px', borderLeft: `3px solid #ef4444`, fontSize: 12, border: `1px solid ${DS.redBorder}` }}>
              {error}
            </div>
          )}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: DS.textMuted, fontSize: 13 }}>
              Carregando...
            </div>
          ) : (
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '12px 16px 16px', display: 'flex', gap: 12 }}>
              <DndContext sensors={sensors} collisionDetection={closestCorners}>
                {STATUSES.map((status) => (
                  <VirtualizedStatusColumn
                    key={status}
                    status={status}
                    cycles={items[status]}
                    totalCount={totals[status] ?? 0}
                    savingId={savingId}
                    onDrop={handleDrop}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    slaRules={slaRules}
                    nowTick={nowTick}
                    slaFilter={slaFilter}
                    agendaFilter={agendaFilter}
                    onReturnToPool={handleOpenReturnReasonModal}
                    onReassign={reassignCycle}
                    onSetGroup={setGroupForCycle}
                    onCreateGroup={handleCreateGroupInline}
                    groups={groups}
                    sellers={sellers}
                    isAdmin={isAdmin}
                    onMoveItem={handleDrop}
                    supabase={supabase}
                    companyId={companyId}
                    currentUserId={userId}
                  />
                ))}
              </DndContext>
            </div>
          )}
        </div>

        {/* FOCUS PANEL (RIGHT SIDE) */}
        {focusPanelOpen && (
          <div style={{
            width: 320,
            flexShrink: 0,
            borderLeft: `1px solid ${DS.border}`,
            background: DS.panelBg,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${DS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: DS.surfaceBg }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: DS.textPrimary }}>Fila do Dia</span>
              <button
                onClick={() => setFocusPanelOpen(false)}
                style={{ background: 'none', border: 'none', color: DS.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                aria-label="Fechar fila do dia"
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <SellerWorklist
                userId={isAdmin && selectedOwnerId ? selectedOwnerId : userId}
                groupId={selectedGroupId}
                supabase={supabase}
                refreshKey={kpiRefreshKey}
                onRefresh={() => {
                  setKpiRefreshKey((k) => k + 1)
                  addToast('Agenda salva!', 'success')
                }}
              />
            </div>
          </div>
        )}
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
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowBulkModal(false)}
        >
          <div
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer + 3,
              padding: 24,
              width: '90%',
              maxWidth: 600,
              color: DS.textPrimary,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 20, color: DS.textPrimary }}>
              Ações em Massa ({selectedIds.size} leads)
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Devolver ao Pool
              </label>
              <button
                onClick={bulkReturnToPool}
                disabled={assigningId === 'bulk'}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: DS.radius,
                  border: 'none',
                  background: assigningId !== 'bulk' ? 'rgba(220,38,38,0.85)' : DS.panelBg,
                  color: assigningId !== 'bulk' ? '#fecaca' : DS.textMuted,
                  cursor: assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  marginBottom: 4,
                  transition: 'all 200ms ease',
                }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              >
                {assigningId === 'bulk' ? 'Devolvendo…' : 'Devolver'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Distribuição Automática
              </label>
              <p style={{ fontSize: 11, color: DS.textMuted, marginBottom: 12 }}>
                Distribui {selectedIds.size} leads uniformemente entre {sellers.length} vendedores
              </p>
              <button
                onClick={distributeAutomatically}
                disabled={assigningId === 'bulk' || sellers.length === 0}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: DS.radius,
                  border: `1px solid ${sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBorder : DS.border}`,
                  background: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBg : DS.panelBg,
                  color: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenText : DS.textMuted,
                  cursor: sellers.length > 0 && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: sellers.length > 0 && assigningId !== 'bulk' ? 1 : 0.5,
                  transition: 'all 200ms ease',
                }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              >
                {assigningId === 'bulk' ? 'Distribuindo…' : 'Distribuir Automaticamente'}
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Atribuir para Um Vendedor
              </label>
              {!canRedistribute ? (
                <div style={{ fontSize: 12, color: '#f87171' }}>
                  Nenhum vendedor disponível
                </div>
              ) : (
                <>
                  <select
                    value={bulkSeller}
                    onChange={(e) => setBulkSeller(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: DS.radius,
                      border: `1px solid ${DS.border}`,
                      background: DS.selectBg,
                      color: DS.textPrimary,
                      fontSize: 12,
                      marginBottom: 10,
                      outline: 'none',
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
                      padding: '11px',
                      borderRadius: DS.radius,
                      border: 'none',
                      background: bulkSeller && assigningId !== 'bulk' ? DS.blue : DS.panelBg,
                      color: 'white',
                      cursor: bulkSeller && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                      fontWeight: 700,
                      fontSize: 12,
                      opacity: bulkSeller && assigningId !== 'bulk' ? 1 : 0.5,
                      transition: 'all 200ms ease',
                    }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                  >
                    {assigningId === 'bulk' ? 'Atribuindo…' : 'Atribuir Todos'}
                  </button>
                </>
              )}
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8, color: DS.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Vincular Grupo
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select
                  value={bulkGroup}
                  onChange={(e) => setBulkGroup(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: DS.radius,
                    border: `1px solid ${DS.border}`,
                    background: DS.selectBg,
                    color: DS.textPrimary,
                    fontSize: 12,
                    outline: 'none',
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
                      borderRadius: DS.radius,
                      border: `1px solid ${DS.greenBorder}`,
                      background: DS.greenBg,
                      color: DS.greenText,
                      cursor: !creatingGroup ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      fontWeight: 700,
                      opacity: !creatingGroup ? 1 : 0.5,
                      whiteSpace: 'nowrap',
                      transition: 'all 200ms ease',
                    }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
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
                  padding: '11px',
                  borderRadius: DS.radius,
                  border: 'none',
                  background: bulkGroup && assigningId !== 'bulk' ? 'rgba(139,92,246,0.7)' : DS.panelBg,
                  color: 'white',
                  cursor: bulkGroup && assigningId !== 'bulk' ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 12,
                  opacity: bulkGroup && assigningId !== 'bulk' ? 1 : 0.5,
                  transition: 'all 200ms ease',
                }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              >
                {assigningId === 'bulk' ? 'Agrupando…' : 'Agrupar Todos'}
              </button>
            </div>

            <button
              onClick={() => setShowBulkModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
                color: DS.textSecondary,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
                transition: 'all 200ms ease',
              }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
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

      <WinDealModal
        isOpen={winDealOpen}
        dealId={winDealCycleId || ''}
        dealName={winDealName}
        ownerUserId={winDealOwnerId}
        companyId={companyId}
        onClose={() => {
          setWinDealOpen(false)
          setWinDealCycleId(null)
          setWinDealName('')
        }}
        onSuccess={async () => {
          setWinDealOpen(false)
          setWinDealCycleId(null)
          setWinDealName('')
          await Promise.all([loadItems(), loadTotals(), isAdmin ? loadPoolAndSellers() : Promise.resolve()])
        }}
      />

      <LostDealModal
        isOpen={lostDealOpen}
        dealId={lostDealCycleId || ''}
        dealName={lostDealName}
        onClose={() => {
          setLostDealOpen(false)
          setLostDealCycleId(null)
          setLostDealName('')
        }}
        onSuccess={async () => {
          setLostDealOpen(false)
          setLostDealCycleId(null)
          setLostDealName('')
          await Promise.all([loadItems(), loadTotals(), isAdmin ? loadPoolAndSellers() : Promise.resolve()])
        }}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}