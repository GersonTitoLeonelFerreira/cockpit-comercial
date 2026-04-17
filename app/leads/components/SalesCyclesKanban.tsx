'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core'

import {
  WhatsAppIcon,
  ClipboardCopyIcon,
  ClockIcon,
  CalendarIcon,
  ClipboardListIcon,
  TagIcon,
} from '@/app/components/icons/KanbanIcons'
import { WinDealModal } from '@/app/components/leads/WinDealModal'
import { LostDealModal } from '@/app/components/leads/LostDealModal'
import LeadCopilotPanel from '@/app/components/leads/LeadCopilotPanel'
import { QuickActionModal, logQuickAction, QuickActionType } from '@/app/components/leads/QuickActionModal'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

import CreateLeadModal from './CreateLeadModal'
import SellerMicroKPIs from './SellerMicroKPIs'
import StageCheckpointModal, { CheckpointPayload } from './StageCheckpointModal'
import { ToastContainer, useToast } from './Toast'

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenBg: 'rgba(22,163,74,0.10)',
  greenBorder: 'rgba(34,197,94,0.25)',
  greenText: '#86efac',
  amberBg: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.3)',
  amberText: '#fef3c7',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.3)',
  redText: '#fca5a5',
  selectBg: '#0d0f14',
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
  radius: 7,
  radiusContainer: 9,
} as const

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'
type SLALevel = 'ok' | 'warn' | 'danger'
type AgendaState = 'none' | 'today' | 'overdue' | 'future'
type PendingMove = { cycleId: string; fromStatus: Status; toStatus: Status } | null

type SLARuleDB = {
  id: string
  status: Status
  target_minutes: number
  warning_minutes: number
  danger_minutes: number
}

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
  name: string
  phone: string | null
  email: string | null
  next_action: string | null
  next_action_date: string | null
  lead_groups?: { name: string } | null
}

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
  negociacao: 'NEGOCIAÇÃO',
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
] as const

const DEFAULT_SLA_RULES: Record<Status, Omit<SLARuleDB, 'id'>> = {
  novo: { status: 'novo', target_minutes: 1440, warning_minutes: 1440, danger_minutes: 2880 },
  contato: { status: 'contato', target_minutes: 2880, warning_minutes: 2880, danger_minutes: 4320 },
  respondeu: { status: 'respondeu', target_minutes: 1440, warning_minutes: 1440, danger_minutes: 2880 },
  negociacao: { status: 'negociacao', target_minutes: 4320, warning_minutes: 4320, danger_minutes: 7200 },
  ganho: { status: 'ganho', target_minutes: 999999, warning_minutes: 999999, danger_minutes: 999999 },
  perdido: { status: 'perdido', target_minutes: 999999, warning_minutes: 999999, danger_minutes: 999999 },
}

function supportsOperationalSLA(status: Status) {
  return status === 'contato' || status === 'respondeu' || status === 'negociacao'
}

function supportsOperationalAgenda(status: Status) {
  return status === 'contato' || status === 'respondeu' || status === 'negociacao'
}

function getSLALevel(minutesInStage: number, rule: SLARuleDB): SLALevel {
  if (!supportsOperationalSLA(rule.status)) return 'ok'
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
    case 'ok':
      return '#10b981'
    case 'warn':
      return '#f59e0b'
    case 'danger':
      return '#ef4444'
  }
}

function getSLALabel(level: SLALevel): string {
  switch (level) {
    case 'ok':
      return 'SLA OK'
    case 'warn':
      return 'SLA ATENÇÃO'
    case 'danger':
      return 'SLA ESTOURADO'
  }
}

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

function detectSearchType(term: string): 'email' | 'cpf' | 'phone' | 'name' {
  const clean = term.trim()
  if (clean.includes('@')) return 'email'
  const digits = clean.replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 13 && /[() -]/.test(clean)) return 'phone'
  if (digits.length === 11 || digits.length === 14) return 'cpf'
  if (digits.length >= 10 && digits.length <= 13) return 'phone'
  return 'name'
}

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

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!isValid || !cycleId) return
    onConfirm(cycleId, reason, details.trim())
  }

  const handleClose = () => {
    setReason('')
    setDetails('')
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
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
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Devolver ao Pool</div>
        <div style={{ fontSize: 12, marginBottom: 16, color: DS.textSecondary }}>
          Lead: <strong style={{ color: DS.blueSoft }}>{cycleName}</strong>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: DS.textMuted }}>
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
          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, color: DS.textMuted }}>
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
            }}
          />
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
            }}
          >
            {isLoading ? 'Devolvendo…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

  const menu = (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          top: anchorRect.bottom + 4,
          right: window.innerWidth - anchorRect.right,
          background: DS.surfaceBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          padding: 8,
          zIndex: 9001,
          minWidth: 240,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          color: DS.textPrimary,
          fontSize: 13,
        }}
      >
        <div style={{ paddingBottom: 4, marginBottom: 4, borderBottom: `1px solid ${DS.borderSubtle}` }}>
          <button
            onClick={() => {
              onReturnToPool(item.id, item.name)
              onClose()
            }}
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
            }}
          >
            ↩ Devolver ao Pool
          </button>
        </div>

        {isAdmin && sellers.length > 0 && (
          <div style={{ paddingBottom: 4, marginBottom: 4, borderBottom: `1px solid ${DS.borderSubtle}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DS.textLabel, padding: '4px 12px' }}>
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

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textLabel, padding: '4px 12px' }}>GRUPO</div>
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
              marginBottom: 4,
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
              onClick={() => {
                onCreateGroup('card', item.id)
                onClose()
              }}
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
              }}
            >
              + Criar novo grupo
            </button>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(menu, document.body)
}

function CopilotDrawerPortal({
  open,
  item,
  companyId,
  onClose,
  onApplied,
}: {
  open: boolean
  item: PipelineItem | null
  companyId: string
  onClose: () => void
  onApplied: () => void | Promise<void>
}) {
  if (!open || !item) return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.16)',
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 'min(560px, 100vw)',
          height: '100vh',
          background: '#0f1117',
          borderLeft: `1px solid ${DS.border}`,
          boxShadow: '-12px 0 36px rgba(0,0,0,0.52)',
          overflowY: 'auto',
          padding: 16,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: DS.textPrimary }}>Copiloto Comercial</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DS.textSecondary, cursor: 'pointer', fontSize: 20 }}>
            ×
          </button>
        </div>

        <LeadCopilotPanel
          variant="compact"
          cycle={{
            ...(item as any),
            company_id: companyId,
            owner_user_id: item.owner_id,
            previous_status: null,
            stage_entered_at: item.stage_entered_at,
            current_group_id: item.group_id,
            closed_at: null,
            won_at: null,
            lost_at: null,
            won_owner_user_id: null,
            lost_owner_user_id: null,
            lost_reason: null,
            won_total: null,
            paused_at: null,
            paused_reason: null,
            canceled_at: null,
            canceled_reason: null,
            leads: {
              id: item.lead_id,
              name: item.name,
              phone: item.phone,
              email: item.email,
            },
          }}
          onApplied={async () => {
            await onApplied()
            onClose()
          }}
          onRejected={async () => {
            await onApplied()
          }}
        />
      </div>
    </div>,
    document.body
  )
}

function KanbanCard({
  item,
  isSaving,
  isSelected,
  onToggleSelect,
  onOpenMenu,
  onMoveItem,
  onCopilotSaved,
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
  onCopilotSaved: () => void | Promise<void>
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
  const [showCopilot, setShowCopilot] = useState(false)

  const minutesInStage = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at).getTime()) / 60000)
  const slaRule = slaRules[item.status] || { ...DEFAULT_SLA_RULES[item.status], id: 'default' }
  const slaLevel = getSLALevel(minutesInStage, slaRule)

  const agendaState = supportsOperationalAgenda(item.status) ? getAgendaState(item.next_action_date) : 'none'
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
    navigator.clipboard.writeText(item.phone).catch(() => null)
    setLastChannel('copy')
    setShowQuickActionModal(true)
  }

  const handleQuickActionSave = async (action: QuickActionType, detail: string) => {
    setQuickActionLoading(true)
    try {
      const suggested = await logQuickAction(supabase, companyId, item.id, currentUserId, action, detail, lastChannel)
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
            : DS.cardBg,
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
        transform: isHovered ? 'translateY(-1px)' : 'none',
        boxShadow: isHovered ? `0 4px 16px rgba(0,0,0,0.4)` : DS.shadowCard,
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('cycleId', item.id)
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{ position: 'absolute', top: 8, right: 4, cursor: 'pointer' }}
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
          style={{ width: 14, height: 14, cursor: 'pointer', pointerEvents: 'auto' }}
        />
      </div>

      <button
        ref={menuButtonRef}
        onClick={(e) => {
          e.stopPropagation()
          if (!menuButtonRef.current) return
          onOpenMenu(item, menuButtonRef.current.getBoundingClientRect())
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
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

      <div
        style={{ cursor: 'pointer', marginLeft: 20, marginRight: 16, overflow: 'hidden', minWidth: 0 }}
        onClick={() => {
          window.location.href = `/sales-cycles/${item.id}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: DS.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </div>
          {supportsOperationalSLA(item.status) && (
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

        <div style={{ fontSize: 11, color: DS.textSecondary }}>{item.phone || '—'}</div>

        {supportsOperationalAgenda(item.status) && item.next_action && (
          <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4, fontStyle: 'italic' }}>
            Próx: {item.next_action}
          </div>
        )}

        {groupName && <div style={{ fontSize: 10, color: DS.textLabel, marginTop: 2 }}>{groupName}</div>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          {agendaState !== 'none' ? (
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                background: agendaBadge.bg,
                color: agendaBadge.text,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span>{agendaBadge.icon}</span>
              {agendaLabel}
            </div>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowCopilot(true)
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              title="Registrar conversa com IA"
              style={{
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 5,
                padding: '3px 7px',
                cursor: 'pointer',
                fontSize: 11,
                color: '#93c5fd',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              IA
            </button>

            {item.phone && (
              <>
                <button
                  onClick={handleWhatsApp}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  title="Abrir WhatsApp"
                  style={{
                    background: 'rgba(37,211,102,0.15)',
                    border: '1px solid rgba(37,211,102,0.3)',
                    borderRadius: 5,
                    padding: '3px 7px',
                    cursor: 'pointer',
                    color: '#25d366',
                    lineHeight: 1,
                  }}
                >
                  <WhatsAppIcon size={14} />
                </button>
                <button
                  onClick={handleCopyPhone}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  title="Copiar telefone"
                  style={{
                    background: 'rgba(156,163,175,0.1)',
                    border: '1px solid rgba(156,163,175,0.2)',
                    borderRadius: 5,
                    padding: '3px 7px',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    lineHeight: 1,
                  }}
                >
                  <ClipboardCopyIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>

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
            {supportsOperationalSLA(item.status) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ClockIcon size={12} /> {formatTimeInStage(minutesInStage)} na etapa
                </span>
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
              </div>
            )}

            {agendaState !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <CalendarIcon size={12} />
                <span style={{ color: agendaBadge.text }}>
                  {agendaState === 'today' && 'Agenda: HOJE'}
                  {agendaState === 'overdue' && 'Agenda: ATRASADO'}
                  {agendaState === 'future' && `Agenda: ${formatNextActionDate(item.next_action_date)}`}
                </span>
              </div>
            )}

            {supportsOperationalAgenda(item.status) && item.next_action && (
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <ClipboardListIcon size={12} /> Próx: {item.next_action}
                {item.next_action_date && ` — ${formatNextActionDate(item.next_action_date)}`}
              </div>
            )}

            {groupName && (
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <TagIcon size={12} /> Grupo: {groupName}
              </div>
            )}
          </div>
        </div>

        {isSaving && <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 4 }}>Salvando...</div>}
      </div>

      <CopilotDrawerPortal
        open={showCopilot}
        item={item}
        companyId={companyId}
        onClose={() => setShowCopilot(false)}
        onApplied={async () => {
          await onCopilotSaved()
        }}
      />

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
  onCopilotSaved: () => void | Promise<void>
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
  onCopilotSaved,
  supabase,
  companyId,
  currentUserId,
}: VirtualizedStatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [menuState, setMenuState] = useState<{ item: PipelineItem; anchorRect: DOMRect } | null>(null)

  const filteredCycles = cycles.filter((item) => {
    if (slaFilter !== 'all') {
      if (!supportsOperationalSLA(item.status)) return false
      const minutes = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at).getTime()) / 60000)
      const rule = slaRules[item.status] || { ...DEFAULT_SLA_RULES[item.status], id: 'default' }
      const level = getSLALevel(minutes, rule)
      if (level !== slaFilter) return false
    }

    if (agendaFilter !== 'all') {
      if (!supportsOperationalAgenda(item.status)) return false
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

  const shown = filteredCycles.length
  const total = totalCount ?? shown
  const headerLabel = total > shown ? `${status.toUpperCase()} (${shown} de ${total})` : `${status.toUpperCase()} (${total})`

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
          background: isOver
            ? `linear-gradient(180deg, ${STATUS_COLORS[status]}30 0%, ${DS.panelBg} 100%)`
            : `linear-gradient(180deg, ${STATUS_COLORS[status]}50 0%, ${STATUS_COLORS[status]}08 90%, ${DS.panelBg} 100%)`,
          borderRadius: DS.radiusContainer + 3,
          border: `1px solid ${DS.border}`,
          borderTop: `3px solid ${STATUS_COLORS[status]}`,
          maxHeight: 'calc(100vh - 200px)',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => {
          e.preventDefault()
          const cycleId = e.dataTransfer.getData('cycleId')
          if (cycleId) onDrop(cycleId, status)
        }}
      >
        <div
          style={{
            padding: '10px 12px 8px',
            background: `linear-gradient(to bottom, ${STATUS_COLORS[status]}12, transparent)`,
            borderBottom: `1px solid ${DS.border}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', color: STATUS_COLORS[status], textTransform: 'uppercase' }}>
            {headerLabel}
          </div>
          <div style={{ marginTop: 6, height: 2, background: DS.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${total > 0 ? Math.min(100, (shown / total) * 100) : 0}%`, background: STATUS_COLORS[status] }} />
          </div>
        </div>

        <div className="kanban-column-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 20px' }}>
          {filteredCycles.length === 0 ? (
            <div style={{ color: DS.textMuted, fontSize: 11, textAlign: 'center', paddingTop: 32 }}>Vazio</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filteredCycles.map((item) => (
                <KanbanCard
                  key={item.id}
                  item={item}
                  isSaving={savingId === item.id}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={onToggleSelect}
                  onOpenMenu={(menuItem, rect) => setMenuState({ item: menuItem, anchorRect: rect })}
                  onMoveItem={onMoveItem}
                  onCopilotSaved={onCopilotSaved}
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

async function loadKanbanWithCursor(
  supabase: any,
  companyId: string,
  selectedOwnerId: string | null,
  userId: string,
  selectedGroupId: string | null,
  searchTerm = '',
  pageSize = 50
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

  await Promise.all(
    STATUSES.map(async (status) => {
      try {
        let query = supabase
          .from('v_pipeline_items')
          .select('id, lead_id, name, phone, email, status, stage_entered_at, owner_id, group_id, next_action, next_action_date, lead_groups(name)')
          .eq('company_id', companyId)
          .eq('owner_id', ownerToFilter)
          .eq('status', status)

        if (selectedGroupId) query = query.eq('group_id', selectedGroupId)

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

        const { data, error } = await query.order('stage_entered_at', { ascending: false }).limit(pageSize)
        if (error) throw error
        result[status] = (data ?? []) as PipelineItem[]
      } catch (e) {
        console.error(`Erro ao carregar status ${status}:`, e)
      }
    })
  )

  let exactCount: number | null = null
  if (searchTerm.trim()) {
    try {
      const searchType = detectSearchType(searchTerm)
      let countQuery = supabase
        .from('v_pipeline_items')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('owner_id', ownerToFilter)

      if (selectedGroupId) countQuery = countQuery.eq('group_id', selectedGroupId)

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
    } catch (e) {
      console.error('Erro ao contar resultados de busca:', e)
    }
  }

  return { data: result, exactCount }
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
  void onShowCreateLeadModal

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
  const [sellers, setSellers] = useState<Profile[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(defaultOwnerId ?? (isAdmin ? userId : null))

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSeller, setBulkSeller] = useState('')
  const [bulkGroup, setBulkGroup] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false)

  const [returnReasonModalOpen, setReturnReasonModalOpen] = useState(false)
  const [returnCycleId, setReturnCycleId] = useState<string | null>(null)
  const [returnCycleName, setReturnCycleName] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)

  const [checkpointOpen, setCheckpointOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState<PendingMove>(null)
  const [checkpointLoading, setCheckpointLoading] = useState(false)

  const [winDealOpen, setWinDealOpen] = useState(false)
  const [winDealCycleId, setWinDealCycleId] = useState<string | null>(null)
  const [winDealName, setWinDealName] = useState('')
  const [winDealOwnerId, setWinDealOwnerId] = useState<string | undefined>(undefined)

  const [lostDealOpen, setLostDealOpen] = useState(false)
  const [lostDealCycleId, setLostDealCycleId] = useState<string | null>(null)
  const [lostDealName, setLostDealName] = useState('')

  const [kpiRefreshKey, setKpiRefreshKey] = useState(0)

  const [slaRules, setSLARules] = useState<Record<Status, SLARuleDB | null>>({
    novo: null,
    contato: null,
    respondeu: null,
    negociacao: null,
    ganho: null,
    perdido: null,
  })
  const [slaFilter, setSLAFilter] = useState<'all' | 'ok' | 'warn' | 'danger'>('all')
  const [agendaFilter, setAgendaFilter] = useState<'all' | 'today' | 'overdue' | 'next7'>('all')
  const [nowTick, setNowTick] = useState(new Date())

  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchCount, setSearchCount] = useState<number | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const allItems = Object.values(items).flat()
  const operationalItems = allItems.filter((item) => supportsOperationalAgenda(item.status))

  const todayCount = operationalItems.filter((item) => getAgendaState(item.next_action_date) === 'today').length
  const overdueCount = operationalItems.filter((item) => getAgendaState(item.next_action_date) === 'overdue').length
  const next7Count = operationalItems.filter((item) => {
    const state = getAgendaState(item.next_action_date)
    if (state === 'none' || state === 'overdue') return false
    const actionDate = new Date(item.next_action_date!)
    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return actionDate <= sevenDaysLater
  }).length

  const dangerCount = allItems.filter((item) => {
    if (!supportsOperationalSLA(item.status)) return false
    const minutes = Math.floor((nowTick.getTime() - new Date(item.stage_entered_at).getTime()) / 60000)
    const rule = slaRules[item.status] || { ...DEFAULT_SLA_RULES[item.status], id: 'default' }
    return getSLALevel(minutes, rule) === 'danger'
  }).length

  const loadGroups = useCallback(async () => {
    if (!companyId) return
    try {
      const { data, error } = await supabase
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name', { ascending: true })
      if (error) throw error
      setGroups((data ?? []) as LeadGroup[])
    } catch (e) {
      console.error('Erro ao carregar grupos:', e)
    }
  }, [companyId, supabase])

  const loadSellers = useCallback(async () => {
    if (!companyId || !isAdmin) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', companyId)
        .in('role', ['member', 'seller', 'consultor'])
        .order('full_name', { ascending: true })
      if (error) throw error
      setSellers((data ?? []) as Profile[])
    } catch (e) {
      console.error('Erro ao carregar vendedores:', e)
    }
  }, [companyId, isAdmin, supabase])

  const loadTotals = useCallback(async () => {
    if (!companyId) return

    const ownerToCount = isAdmin ? selectedOwnerId : userId
    if (!ownerToCount) {
      setTotals({ novo: 0, contato: 0, respondeu: 0, negociacao: 0, ganho: 0, perdido: 0 })
      return
    }

    try {
      const { data, error } = await supabase.rpc('rpc_cycles_status_totals', {
        p_owner_user_id: ownerToCount,
        p_group_id: selectedGroupId,
        p_search_term: searchTerm.trim() || null,
      })
      if (error) throw error

      const next: Record<Status, number> = {
        novo: 0,
        contato: 0,
        respondeu: 0,
        negociacao: 0,
        ganho: 0,
        perdido: 0,
      }

      for (const row of (data ?? []) as any[]) {
        next[row.status as Status] = Number(row.total ?? 0)
      }

      setTotals(next)
    } catch (e) {
      console.error('Erro ao carregar totals:', e)
    }
  }, [companyId, isAdmin, selectedOwnerId, userId, selectedGroupId, supabase, searchTerm])

  const loadItems = useCallback(async (searchTermParam = '') => {
    if (!companyId) return
    setLoading(true)
    setError(null)

    try {
      const ownerToFilter = isAdmin ? selectedOwnerId : userId
      if (!ownerToFilter) {
        setItems({ novo: [], contato: [], respondeu: [], negociacao: [], ganho: [], perdido: [] })
        setSearchCount(null)
        return
      }

      const { data, exactCount } = await loadKanbanWithCursor(
        supabase,
        companyId,
        selectedOwnerId,
        userId,
        selectedGroupId,
        searchTermParam,
        50
      )

      setItems(data)
      setSearchCount(searchTermParam.trim() ? (exactCount ?? Object.values(data).flat().length) : null)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar ciclos')
    } finally {
      setLoading(false)
    }
  }, [companyId, isAdmin, selectedGroupId, selectedOwnerId, supabase, userId])

  const loadSLARules = useCallback(async () => {
    if (!companyId) return
    try {
      const { data, error } = await supabase.rpc('rpc_get_company_sla_rules')
      if (error) return

      const next: Record<Status, SLARuleDB | null> = {
        novo: null,
        contato: null,
        respondeu: null,
        negociacao: null,
        ganho: null,
        perdido: null,
      }

      for (const rule of (data ?? []) as SLARuleDB[]) {
        next[rule.status] = rule
      }

      setSLARules(next)
    } catch (e) {
      console.error('Erro ao carregar SLA rules:', e)
    }
  }, [companyId, supabase])

  useEffect(() => {
    void Promise.all([loadGroups(), loadSellers(), loadSLARules()])
  }, [loadGroups, loadSellers, loadSLARules])

  useEffect(() => {
    void loadTotals()
  }, [loadTotals])

  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setShowBulkModal(false)
    setSelectedIds(new Set())
  }, [selectedGroupId, selectedOwnerId])

  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)

    if (!searchTerm.trim()) {
      setIsSearching(false)
      void loadItems('')
      setSearchCount(null)
      return
    }

    setIsSearching(true)
    debounceTimeoutRef.current = setTimeout(() => {
      void loadItems(searchTerm)
      setIsSearching(false)
    }, 300)

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)
    }
  }, [searchTerm, loadItems])

  const handleCopilotSaved = useCallback(async () => {
    await Promise.all([loadItems(searchTerm), loadTotals()])
    setKpiRefreshKey((v) => v + 1)
  }, [loadItems, loadTotals, searchTerm])

  const moveItem = useCallback(async (cycleId: string, toStatus: Status) => {
    setSavingId(cycleId)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('rpc_move_cycle_stage', {
        p_cycle_id: cycleId,
        p_to_status: toStatus,
        p_metadata: {},
      })
      if (error) throw error
      if (!data) throw new Error('Ciclo não encontrado ou sem permissão')
      await Promise.all([loadItems(searchTerm), loadTotals()])
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao mover ciclo')
    } finally {
      setSavingId(null)
    }
  }, [supabase, loadItems, loadTotals, searchTerm])

  const setGroupForCycle = useCallback(async (cycleId: string, groupId: string | null) => {
    setSavingId(cycleId)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('rpc_set_cycle_group', {
        p_cycle_id: cycleId,
        p_group_id: groupId,
      })
      if (error) throw error
      if (!data) throw new Error('Ciclo não encontrado ou sem permissão')
      await Promise.all([loadItems(searchTerm), loadTotals()])
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao vincular grupo')
    } finally {
      setSavingId(null)
    }
  }, [supabase, loadItems, loadTotals, searchTerm])

  const returnCycleToPoolWithReason = useCallback(async (cycleId: string, reason: string, details: string) => {
    setReturnSaving(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('rpc_return_cycle_to_pool_with_reason', {
        p_cycle_id: cycleId,
        p_reason: reason,
        p_details: details,
      })
      if (error) throw error
      if (!data?.success) throw new Error('Falha ao devolver ciclo')
      await Promise.all([loadItems(searchTerm), loadTotals()])
      addToast('Lead devolvido ao pool!')
      setKpiRefreshKey((v) => v + 1)
      setReturnReasonModalOpen(false)
      setReturnCycleId(null)
      setReturnCycleName('')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao devolver ciclo')
    } finally {
      setReturnSaving(false)
    }
  }, [supabase, loadItems, loadTotals, searchTerm, addToast])

  const reassignCycle = useCallback(async (cycleId: string, newOwnerId: string) => {
    setSavingId(cycleId)
    try {
      const { error } = await supabase.rpc('rpc_reassign_cycle_owner', {
        p_cycle_id: cycleId,
        p_owner_user_id: newOwnerId,
      })
      if (error) throw error
      await Promise.all([loadItems(searchTerm), loadTotals()])
      addToast('Lead redistribuído!')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao redistribuir')
    } finally {
      setSavingId(null)
    }
  }, [supabase, loadItems, loadTotals, searchTerm, addToast])

  const handleCreateGroupInline = useCallback(async (target: 'bulk' | 'card', cycleId?: string) => {
    if (!isAdmin) return

    const groupName = window.prompt('Nome do novo grupo:')
    if (!groupName || !groupName.trim()) return

    setCreatingGroup(true)
    try {
      const { data, error } = await supabase.rpc('rpc_create_lead_group', { p_name: groupName.trim() })
      if (error) throw error
      if (!data?.success) throw new Error('Falha ao criar grupo')

      await loadGroups()

      if (target === 'bulk') {
        setBulkGroup(data.id)
        addToast(`Grupo "${data.name}" criado!`)
      } else if (cycleId) {
        const shouldBind = window.confirm(`Grupo "${data.name}" criado. Deseja vincular neste lead agora?`)
        if (shouldBind) await setGroupForCycle(cycleId, data.id)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar grupo')
    } finally {
      setCreatingGroup(false)
    }
  }, [isAdmin, supabase, loadGroups, setGroupForCycle, addToast])

  const bulkReturnToPool = useCallback(async () => {
    if (selectedIds.size === 0) return
    setAssigningId('bulk')
    setError(null)
    try {
      const cycleIds = Array.from(selectedIds)
      const rpcName = isAdmin ? 'rpc_bulk_return_cycles_to_pool' : 'rpc_bulk_return_cycles_to_pool_self'
      const { data, error } = await supabase.rpc(rpcName, { p_cycle_ids: cycleIds })
      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')
      await Promise.all([loadItems(searchTerm), loadTotals()])
      setSelectedIds(new Set())
      setShowBulkModal(false)
      addToast(`${cycleIds.length} leads devolvidos ao pool!`)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao devolver leads')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, isAdmin, supabase, loadItems, loadTotals, searchTerm, addToast])

  const bulkReassignToSeller = useCallback(async (sellerId: string) => {
    if (selectedIds.size === 0 || !sellerId || !isAdmin) return
    setAssigningId('bulk')
    setError(null)
    try {
      const cycleIds = Array.from(selectedIds)
      const { data, error } = await supabase.rpc('rpc_bulk_assign_cycles_owner', {
        p_cycle_ids: cycleIds,
        p_owner_user_id: sellerId,
      })
      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')
      await Promise.all([loadItems(searchTerm), loadTotals()])
      setSelectedIds(new Set())
      setBulkSeller('')
      setShowBulkModal(false)
      addToast(`${cycleIds.length} leads redistribuídos!`)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao redistribuir leads')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, isAdmin, supabase, loadItems, loadTotals, searchTerm, addToast])

  const bulkSetGroup = useCallback(async (groupId: string) => {
    if (selectedIds.size === 0 || !groupId) return
    setAssigningId('bulk')
    setError(null)
    try {
      const cycleIds = Array.from(selectedIds)
      const { data, error } = await supabase.rpc('rpc_bulk_set_cycles_group', {
        p_cycle_ids: cycleIds,
        p_group_id: groupId,
      })
      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')
      await Promise.all([loadItems(searchTerm), loadTotals()])
      setSelectedIds(new Set())
      setBulkGroup('')
      setShowBulkModal(false)
      addToast(`${cycleIds.length} leads vinculados ao grupo!`)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao agrupar leads')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, supabase, loadItems, loadTotals, searchTerm, addToast])

  const distributeAutomatically = useCallback(async () => {
    if (selectedIds.size === 0 || sellers.length === 0 || !isAdmin) return
    setAssigningId('bulk')
    setError(null)
    try {
      const cycleIds = Array.from(selectedIds)
      const sellerIds = sellers.map((s) => s.id)
      const { data, error } = await supabase.rpc('rpc_bulk_assign_round_robin', {
        p_cycle_ids: cycleIds,
        p_owner_ids: sellerIds,
      })
      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')
      await Promise.all([loadItems(searchTerm), loadTotals()])
      setSelectedIds(new Set())
      setShowBulkModal(false)
      addToast(`${cycleIds.length} leads distribuídos automaticamente!`)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao distribuir')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, sellers, isAdmin, supabase, loadItems, loadTotals, searchTerm, addToast])

  const handleCheckpointConfirm = useCallback(async (payload: CheckpointPayload) => {
    if (!pendingMove) return
    setCheckpointLoading(true)
    try {
      const normalizedPayload = {
        ...payload,
        next_action_date: payload.next_action_date ? new Date(payload.next_action_date).toISOString() : null,
      }
      const { data, error } = await supabase.rpc('rpc_move_cycle_stage_checkpoint', {
        p_cycle_id: pendingMove.cycleId,
        p_to_status: pendingMove.toStatus,
        p_checkpoint: normalizedPayload,
      })
      if (error) throw error
      if (!data?.success) throw new Error('Operação não confirmada')
      await Promise.all([loadItems(searchTerm), loadTotals()])
      addToast('Lead atualizado com sucesso!')
      setCheckpointOpen(false)
      setPendingMove(null)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao mover lead')
    } finally {
      setCheckpointLoading(false)
    }
  }, [pendingMove, supabase, loadItems, loadTotals, searchTerm, addToast])

  const handleDrop = useCallback((cycleId: string, toStatus: Status) => {
    const fromStatus = Object.entries(items).find(([_, cycles]) => cycles.some((c) => c.id === cycleId))?.[0] as Status | undefined
    if (!fromStatus || fromStatus === toStatus) return

    const cycle = Object.values(items).flat().find((c) => c.id === cycleId)

    if (toStatus === 'ganho') {
      setWinDealCycleId(cycleId)
      setWinDealName(cycle?.name || '')
      setWinDealOwnerId(cycle?.owner_id || undefined)
      setWinDealOpen(true)
      return
    }

    if (toStatus === 'perdido') {
      setLostDealCycleId(cycleId)
      setLostDealName(cycle?.name || '')
      setLostDealOpen(true)
      return
    }

    setPendingMove({ cycleId, fromStatus, toStatus })
    setCheckpointOpen(true)
  }, [items])

  const toggleSelect = useCallback((cycleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cycleId)) next.delete(cycleId)
      else next.add(cycleId)
      return next
    })
  }, [])

  const toggleSelectAllKanban = useCallback(() => {
    const allKanbanItems = Object.values(items).flat()
    const allSelected = selectedIds.size === allKanbanItems.length && allKanbanItems.length > 0
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allKanbanItems.map((item) => item.id)))
    }
  }, [items, selectedIds])

  const validSellersForRedistribution = sellers.filter((s) => !!s.full_name && (!selectedOwnerId || s.id !== selectedOwnerId))
  const canRedistribute = validSellersForRedistribution.length > 0

  const allKanbanItems = Object.values(items).flat()
  const allKanbanSelected = selectedIds.size === allKanbanItems.length && allKanbanItems.length > 0

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
  }

  return (
    <div
      style={{
        background: DS.contentBg,
        minHeight: '100vh',
        color: DS.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...(focusMode
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              height: '100vh',
            }
          : {}),
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(17,19,24,0.94)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${DS.border}`,
          padding: '8px 16px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {isAdmin && (
          <select value={selectedOwnerId || userId} onChange={(e) => setSelectedOwnerId(e.target.value || userId)} style={pillStyle}>
            <option value={userId}>Meu Cockpit</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.email} ({s.role})
              </option>
            ))}
          </select>
        )}

        <select value={selectedGroupId || ''} onChange={(e) => setSelectedGroupId(e.target.value || null)} style={pillStyle}>
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <select value={slaFilter} onChange={(e) => setSLAFilter(e.target.value as any)} style={pillStyle}>
          <option value="all">SLA: Todos</option>
          <option value="ok">SLA: OK</option>
          <option value="warn">SLA: Atenção</option>
          <option value="danger">SLA: Estourado</option>
        </select>

        <select value={agendaFilter} onChange={(e) => setAgendaFilter(e.target.value as any)} style={pillStyle}>
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
            }}
          />
          {searchTerm.trim() && !isSearching && searchCount !== null && (
            <div style={{ fontSize: 10, color: DS.blueSoft, fontWeight: 700, paddingLeft: 4 }}>
              {searchCount} resultado{searchCount !== 1 ? 's' : ''}
            </div>
          )}
          {isSearching && <div style={{ fontSize: 10, color: DS.textMuted, paddingLeft: 4 }}>Buscando...</div>}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setFocusMode((v) => !v)}
            style={{
              ...pillStyle,
              background: focusMode ? 'rgba(59,130,246,0.14)' : DS.panelBg,
              border: focusMode ? '1px solid rgba(59,130,246,0.4)' : `1px solid ${DS.border}`,
              color: focusMode ? DS.blueSoft : DS.textSecondary,
              fontSize: 14,
              padding: '5px 10px',
              lineHeight: 1,
            }}
            title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
          >
            {focusMode ? '⊡' : '⊞'}
          </button>

          <button
            onClick={() => {
              void Promise.all([loadItems(searchTerm), loadTotals()])
            }}
            style={pillStyle}
            title="Atualizar kanban"
            aria-label="Atualizar kanban"
          >
            ↻
          </button>

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
              style={{ ...pillStyle, background: DS.amberBg, border: `1px solid ${DS.amberBorder}`, color: DS.amberText }}
            >
              Ações ({selectedIds.size})
            </button>
          )}

          <button
            onClick={() => {
              onShowCreateLeadModal?.()
              setShowCreateLeadModal(true)
            }}
            style={{ ...pillStyle, background: DS.greenBg, border: `1px solid ${DS.greenBorder}`, color: DS.greenText }}
          >
            + Criar Lead
          </button>
        </div>
      </div>

      <SellerMicroKPIs
        userId={isAdmin && selectedOwnerId ? selectedOwnerId : userId}
        groupId={selectedGroupId}
        supabase={supabase}
        refreshKey={kpiRefreshKey}
      />

      <div
        style={{
          background: DS.panelBg,
          borderBottom: `1px solid ${DS.border}`,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 34,
          cursor: 'pointer',
          backgroundImage: 'linear-gradient(180deg, rgba(59,130,246,0.05) 0%, transparent 100%)',
        }}
        onClick={() => setInsightsExpanded((v) => !v)}
      >
        <span style={{ fontSize: 9, fontWeight: 700, color: DS.textLabel, letterSpacing: '0.12em', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase' }}>
          {insightsExpanded ? '▾' : '▸'} INSIGHTS
        </span>

        {!insightsExpanded && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { label: 'Atrasados', value: overdueCount, accent: '#ef4444' },
              { label: 'SLA estourado', value: dangerCount, accent: '#f59e0b' },
              { label: 'Agenda hoje', value: todayCount, accent: '#3b82f6' },
              { label: 'Próximos 7d', value: next7Count, accent: '#8b5cf6' },
            ].map((chip) => (
              <div key={chip.label} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${chip.accent}12`, border: `1px solid ${chip.accent}25`, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 800, color: chip.accent }}>
                <span>{chip.value}</span>
                <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{chip.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {insightsExpanded && (
        <div style={{ background: DS.contentBg, borderBottom: `1px solid ${DS.border}`, padding: '10px 16px 14px', maxHeight: 320, overflowY: 'auto' }}>
          {(() => {
            const overdueItems = operationalItems.filter((c) => getAgendaState(c.next_action_date) === 'overdue')
            const dangerItems = allItems.filter((c) => {
              if (!supportsOperationalSLA(c.status)) return false
              const mins = Math.floor((nowTick.getTime() - new Date(c.stage_entered_at).getTime()) / 60000)
              const rule = slaRules[c.status] || { ...DEFAULT_SLA_RULES[c.status], id: 'default' }
              return getSLALevel(mins, rule) === 'danger'
            })
            const todayItems = operationalItems.filter((c) => getAgendaState(c.next_action_date) === 'today')
            const next7Items = operationalItems.filter((c) => {
              const agState = getAgendaState(c.next_action_date)
              if (agState === 'none' || agState === 'overdue') return false
              const actionDate = new Date(c.next_action_date!)
              const sevenDays = new Date(nowTick.getTime() + 7 * 24 * 60 * 60 * 1000)
              return actionDate <= sevenDays
            })

            const sections = [
              { title: 'Atrasados', count: overdueItems.length, accent: '#ef4444', items: overdueItems, renderDetail: (c: PipelineItem) => formatNextActionDate(c.next_action_date) },
              { title: 'SLA Estourado', count: dangerItems.length, accent: '#f59e0b', items: dangerItems, renderDetail: (c: PipelineItem) => `${formatTimeInStage(Math.floor((nowTick.getTime() - new Date(c.stage_entered_at).getTime()) / 60000))} em ${STATUS_LABELS[c.status]}` },
              { title: 'Agenda Hoje', count: todayItems.length, accent: '#3b82f6', items: todayItems, renderDetail: (c: PipelineItem) => formatNextActionDate(c.next_action_date) },
              { title: 'Próximos 7d', count: next7Items.length, accent: '#8b5cf6', items: next7Items, renderDetail: (c: PipelineItem) => formatNextActionDate(c.next_action_date) },
            ]

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {sections.map((sec) => (
                  <div key={sec.title} style={{ background: `linear-gradient(135deg, ${sec.accent}08 0%, ${DS.panelBg} 100%)`, border: `1px solid ${sec.accent}20`, borderTop: `2px solid ${sec.accent}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: sec.accent, marginBottom: 8, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {sec.title}
                      <span style={{ fontSize: 9, fontWeight: 800, background: `${sec.accent}18`, color: sec.accent, padding: '1px 6px', borderRadius: 4 }}>
                        {sec.count}
                      </span>
                    </div>

                    {sec.items.length === 0 ? (
                      <div style={{ fontSize: 10, color: DS.textMuted, fontStyle: 'italic' }}>Nenhum</div>
                    ) : (
                      sec.items.slice(0, 10).map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            window.location.href = `/sales-cycles/${c.id}`
                          }}
                          style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, background: `${sec.accent}08`, border: `1px solid ${sec.accent}12`, marginBottom: 4, cursor: 'pointer', color: DS.textPrimary, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.name}</span>
                          <span style={{ fontSize: 9, color: DS.textMuted, flexShrink: 0 }}>{sec.renderDetail(c)}</span>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {error && <div style={{ background: DS.redBg, color: DS.redText, padding: '8px 16px', borderLeft: `3px solid #ef4444`, fontSize: 12, border: `1px solid ${DS.redBorder}` }}>{error}</div>}

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: DS.textMuted, fontSize: 13 }}>Carregando...</div>
          ) : (
            <div className="kanban-column-scroll" style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '12px 16px 16px', display: 'flex', gap: 12 }}>
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
                    onReturnToPool={(cycleId, cycleName) => {
                      setReturnCycleId(cycleId)
                      setReturnCycleName(cycleName)
                      setReturnReasonModalOpen(true)
                    }}
                    onReassign={reassignCycle}
                    onSetGroup={setGroupForCycle}
                    onCreateGroup={handleCreateGroupInline}
                    groups={groups}
                    sellers={sellers}
                    isAdmin={isAdmin}
                    onMoveItem={handleDrop}
                    onCopilotSaved={handleCopilotSaved}
                    supabase={supabase}
                    companyId={companyId}
                    currentUserId={userId}
                  />
                ))}
              </DndContext>
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
            void Promise.all([loadItems(searchTerm), loadTotals()])
          }}
          onClose={() => setShowCreateLeadModal(false)}
        />
      )}

      {showBulkModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={() => setShowBulkModal(false)}
        >
          <div
            style={{ background: DS.surfaceBg, border: `1px solid ${DS.border}`, borderRadius: DS.radiusContainer + 3, padding: 24, width: '90%', maxWidth: 600, color: DS.textPrimary, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>Ações em Massa ({selectedIds.size} leads)</div>

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, color: DS.textMuted }}>Devolver ao Pool</label>
              <button
                onClick={() => void bulkReturnToPool()}
                disabled={assigningId === 'bulk'}
                style={{ width: '100%', padding: '11px', borderRadius: DS.radius, border: 'none', background: assigningId !== 'bulk' ? 'rgba(220,38,38,0.85)' : DS.panelBg, color: assigningId !== 'bulk' ? '#fecaca' : DS.textMuted, cursor: assigningId !== 'bulk' ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12 }}
              >
                {assigningId === 'bulk' ? 'Devolvendo…' : 'Devolver'}
              </button>
            </div>

            {isAdmin && (
              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 10, color: DS.textMuted }}>Distribuição Automática</label>
                <p style={{ fontSize: 11, color: DS.textMuted, marginBottom: 12 }}>
                  Distribui {selectedIds.size} leads uniformemente entre {sellers.length} vendedores
                </p>
                <button
                  onClick={() => void distributeAutomatically()}
                  disabled={assigningId === 'bulk' || sellers.length === 0}
                  style={{ width: '100%', padding: '11px', borderRadius: DS.radius, border: `1px solid ${sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBorder : DS.border}`, background: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenBg : DS.panelBg, color: sellers.length > 0 && assigningId !== 'bulk' ? DS.greenText : DS.textMuted, cursor: sellers.length > 0 && assigningId !== 'bulk' ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12, opacity: sellers.length > 0 && assigningId !== 'bulk' ? 1 : 0.5 }}
                >
                  {assigningId === 'bulk' ? 'Distribuindo…' : 'Distribuir Automaticamente'}
                </button>
              </div>
            )}

            {isAdmin && (
              <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8, color: DS.textMuted }}>Atribuir para Um Vendedor</label>
                {!canRedistribute ? (
                  <div style={{ fontSize: 12, color: '#f87171' }}>Nenhum vendedor disponível</div>
                ) : (
                  <>
                    <select value={bulkSeller} onChange={(e) => setBulkSeller(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: DS.radius, border: `1px solid ${DS.border}`, background: DS.selectBg, color: DS.textPrimary, fontSize: 12, marginBottom: 10 }}>
                      <option value="">Selecione vendedor…</option>
                      {validSellersForRedistribution.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.role})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void bulkReassignToSeller(bulkSeller)}
                      disabled={!bulkSeller || assigningId === 'bulk'}
                      style={{ width: '100%', padding: '11px', borderRadius: DS.radius, border: 'none', background: bulkSeller && assigningId !== 'bulk' ? DS.blue : DS.panelBg, color: 'white', cursor: bulkSeller && assigningId !== 'bulk' ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12, opacity: bulkSeller && assigningId !== 'bulk' ? 1 : 0.5 }}
                    >
                      {assigningId === 'bulk' ? 'Atribuindo…' : 'Atribuir Todos'}
                    </button>
                  </>
                )}
              </div>
            )}

            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${DS.borderSubtle}` }}>
              <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 8, color: DS.textMuted }}>Vincular Grupo</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: DS.radius, border: `1px solid ${DS.border}`, background: DS.selectBg, color: DS.textPrimary, fontSize: 12 }}>
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
                    style={{ padding: '8px 12px', borderRadius: DS.radius, border: `1px solid ${DS.greenBorder}`, background: DS.greenBg, color: DS.greenText, cursor: creatingGroup ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: creatingGroup ? 0.5 : 1, whiteSpace: 'nowrap' }}
                  >
                    {creatingGroup ? 'Criando…' : '+'}
                  </button>
                )}
              </div>
              <button
                onClick={() => void bulkSetGroup(bulkGroup)}
                disabled={!bulkGroup || assigningId === 'bulk'}
                style={{ width: '100%', padding: '11px', borderRadius: DS.radius, border: 'none', background: bulkGroup && assigningId !== 'bulk' ? 'rgba(139,92,246,0.7)' : DS.panelBg, color: 'white', cursor: bulkGroup && assigningId !== 'bulk' ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12, opacity: bulkGroup && assigningId !== 'bulk' ? 1 : 0.5 }}
              >
                {assigningId === 'bulk' ? 'Agrupando…' : 'Agrupar Todos'}
              </button>
            </div>

            <button onClick={() => setShowBulkModal(false)} style={{ width: '100%', padding: '10px', borderRadius: DS.radius, border: `1px solid ${DS.border}`, background: DS.panelBg, color: DS.textSecondary, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
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
        fromStatus={pendingMove ? pendingMove.fromStatus : 'novo'}
        toStatus={pendingMove ? pendingMove.toStatus : 'novo'}
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
          await Promise.all([loadItems(searchTerm), loadTotals()])
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
          await Promise.all([loadItems(searchTerm), loadTotals()])
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
