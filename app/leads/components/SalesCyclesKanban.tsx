'use client'

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
import { adminListSellersStats } from '@/app/lib/services/admin-sellers'

import CreateLeadModal from './CreateLeadModal'
import SellerMicroKPIs from './SellerMicroKPIs'
import StageCheckpointModal, { CheckpointPayload } from './StageCheckpointModal'
import { ToastContainer, useToast } from './Toast'
import { SALES_CYCLE_VISUAL_LABELS as STATUS_LABELS } from '@/app/lib/sales-cycle-status'

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  divider: '#1f2330',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  iconNeutral: '#7a869a',
  iconHover: '#cbd5e1',
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
  shadowCard: '0 1px 2px rgba(0,0,0,0.35)',
  radius: 6,
  radiusContainer: 8,
} as const

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'
type KanbanScope = 'mine' | 'seller' | 'company'
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
  cpf?: string | null
  document?: string | null
  phone_digits?: string | null
  document_digits?: string | null
  next_action: string | null
  next_action_date: string | null
  lead_groups?: { name: string } | null
}

const STATUSES: Status[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

const STATUS_COLORS: Record<Status, string> = {
  novo: '#1685ff',
  contato: '#06d6e8',
  respondeu: '#f5c400',
  negociacao: '#a855f7',
  ganho: '#00e889',
  perdido: '#ff4d5e',
}

const STATUS_RGB: Record<Status, string> = {
  novo: '22, 133, 255',
  contato: '6, 214, 232',
  respondeu: '245, 196, 0',
  negociacao: '168, 85, 247',
  ganho: '0, 232, 137',
  perdido: '255, 77, 94',
}

const STATUS_STAGE_META: Record<Status, { index: string; label: string }> = {
  novo: { index: '01', label: 'Novo' },
  contato: { index: '02', label: 'Contato' },
  respondeu: { index: '03', label: 'Agenda' },
  negociacao: { index: '04', label: 'Negociação' },
  ganho: { index: '05', label: 'Ganho' },
  perdido: { index: '06', label: 'Perdido' },
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

function EmptyColumnSkeleton({ status }: { status: Status }) {
  const rgb = STATUS_RGB[status]

  return (
    <div style={{ display: 'grid', gap: 16, paddingTop: 2 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          style={{
            minHeight: 82,
            borderRadius: 14,
            border: `1px solid rgba(${rgb},0.14)`,
            background: `linear-gradient(135deg, rgba(18,27,44,0.72), rgba(10,16,27,0.40))`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 28px rgba(0,0,0,0.24)`,
            padding: 14,
            opacity: 0.76,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 13 }}>
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: 4,
                background: `rgba(${rgb},0.58)`,
                boxShadow: `0 0 14px rgba(${rgb},0.30)`,
              }}
            />
            <div
              style={{
                width: index % 2 === 0 ? 90 : 126,
                height: 11,
                borderRadius: 999,
                background: 'rgba(148,163,184,0.15)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: 4,
                background: 'rgba(71,85,105,0.38)',
              }}
            />
            <div
              style={{
                width: index % 2 === 0 ? 158 : 120,
                height: 11,
                borderRadius: 999,
                background: 'rgba(148,163,184,0.08)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function detectSearchType(term: string): 'email' | 'numeric' | 'name' {
  const clean = term.trim()
  if (clean.includes('@')) return 'email'

  const digits = clean.replace(/\D/g, '')

  // 6+ dígitos já é suficiente para tratar como busca numérica.
  // Isso cobre:
  // - telefone com ou sem máscara
  // - telefone parcial
  // - CPF com ou sem máscara
  // - CNPJ com ou sem máscara
  if (digits.length >= 6) return 'numeric'

  return 'name'
}

function emptyKanbanItems(): Record<Status, PipelineItem[]> {
  return {
    novo: [],
    contato: [],
    respondeu: [],
    negociacao: [],
    ganho: [],
    perdido: [],
  }
}

function emptyKanbanTotals(): Record<Status, number> {
  return {
    novo: 0,
    contato: 0,
    respondeu: 0,
    negociacao: 0,
    ganho: 0,
    perdido: 0,
  }
}

type KanbanApiResponse = {
  ok?: boolean
  error?: string
  itemsByStatus?: Record<Status, PipelineItem[]>
  totals?: Record<Status, number>
  exactCount?: number
}

type KanbanActionResponse = {
  ok?: boolean
  success?: boolean
  error?: string
  id?: string
  name?: string
  updated_count?: number
  skipped_count?: number
}

async function loadKanbanFromApi(params: {
  scope: KanbanScope
  ownerId: string | null
  groupId: string | null
  searchTerm: string
  limit: number
  signal?: AbortSignal
}) {
  const query = new URLSearchParams({
    scope: params.scope,
    search: params.searchTerm,
    limit: String(params.limit),
  })

  if (params.ownerId) {
    query.set('owner_id', params.ownerId)
  }

  if (params.groupId) {
    query.set('group_id', params.groupId)
  }

  const response = await fetch(`/api/leads/kanban?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    signal: params.signal,
  })

  let json: KanbanApiResponse

  try {
    json = (await response.json()) as KanbanApiResponse
  } catch {
    throw new Error('Resposta inválida ao carregar Kanban.')
  }

  if (!response.ok || !json.ok) {
    throw new Error(json.error ?? 'Erro ao carregar Kanban.')
  }

  return {
    data: json.itemsByStatus ?? emptyKanbanItems(),
    totals: json.totals ?? emptyKanbanTotals(),
    exactCount: json.exactCount ?? 0,
  }
}

async function postKanbanAction(body: Record<string, unknown>): Promise<KanbanActionResponse> {
  const response = await fetch('/api/leads/kanban/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })

  const json = (await response.json()) as KanbanActionResponse

  if (!response.ok || !json.ok) {
    throw new Error(json.error ?? 'Erro ao executar ação do Kanban.')
  }

  return json
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

  const canReturnToPool = item.status !== 'ganho' && item.status !== 'perdido'

  const viewportPadding = 12
  const menuWidth = 300
  const estimatedMenuHeight = 320
  const availableBelow = window.innerHeight - anchorRect.bottom - viewportPadding
  const shouldOpenUp = availableBelow < estimatedMenuHeight

  const menuTop = shouldOpenUp
    ? Math.max(viewportPadding, anchorRect.top - estimatedMenuHeight - 6)
    : Math.min(anchorRect.bottom + 6, window.innerHeight - viewportPadding - estimatedMenuHeight)

  const menuLeft = Math.min(
    Math.max(anchorRect.left, viewportPadding),
    window.innerWidth - menuWidth - viewportPadding
  )

  const menu = (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          top: menuTop,
          left: menuLeft,
          width: menuWidth,
          maxHeight: estimatedMenuHeight,
          overflowY: 'auto',
          background: DS.surfaceBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
          padding: 8,
          zIndex: 9001,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          color: DS.textPrimary,
          fontSize: 13,
        }}
      >
        {canReturnToPool && (
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
        )}

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
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textLabel, padding: '4px 12px' }}>
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

function CopilotMovePortal({
  open,
  pending,
  companyId,
  onClose,
  onApplied,
  onTerminalApply,
}: {
  open: boolean
  pending: {
    cycleId: string
    fromStatus: Status
    toStatus: Status
    cycle: PipelineItem | null
  } | null
  companyId: string
  onClose: () => void
  onApplied: () => void | Promise<void>
  onTerminalApply: (status: 'ganho' | 'perdido') => void
}) {
  if (!open || !pending || !pending.cycle) return null
  const item = pending.cycle

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
          <div style={{ fontSize: 14, fontWeight: 800, color: DS.textPrimary }}>
            Confirmar movimentação com IA
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DS.textSecondary, cursor: 'pointer', fontSize: 20 }}>
            ×
          </button>
        </div>

        <LeadCopilotPanel
          variant="compact"
          forcedInitialStatus={pending.toStatus as any}
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
          }}
          onCancel={async () => {
            onClose()
          }}
          onTerminalApply={(status) => {
            onTerminalApply(status)
          }}
        />
      </div>
    </div>,
    document.body,
  )
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
        background: isSelected ? 'rgba(59,130,246,0.07)' : DS.cardBg,
        borderTop: `1px solid ${isSelected ? 'rgba(59,130,246,0.35)' : DS.border}`,
        borderRight: `1px solid ${isSelected ? 'rgba(59,130,246,0.35)' : DS.border}`,
        borderBottom: `1px solid ${isSelected ? 'rgba(59,130,246,0.35)' : DS.border}`,
        borderLeft: `3px solid ${STATUS_COLORS[item.status]}`,
        borderRadius: DS.radius,
        padding: '8px 10px 8px 8px',
        cursor: isSaving ? 'not-allowed' : 'grab',
        transition: 'box-shadow 150ms ease, background 150ms ease',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.45)' : DS.shadowCard,
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
        style={{ position: 'absolute', top: 6, right: 6, cursor: 'pointer', opacity: isSelected || isHovered ? 1 : 0.35, transition: 'opacity 120ms ease' }}
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
          style={{ width: 13, height: 13, cursor: 'pointer', pointerEvents: 'auto' }}
        />
      </div>

      <div
        style={{ cursor: 'pointer', marginRight: 18, overflow: 'hidden', minWidth: 0 }}
        onClick={() => {
          window.location.href = `/sales-cycles/${item.id}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: DS.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
            {item.name}
          </div>
          {supportsOperationalSLA(item.status) && (
            <div
              title={`${getSLALabel(slaLevel)} — ${formatTimeInStage(minutesInStage)} no estágio`}
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 3,
                background: slaLevel === 'ok' ? 'transparent' : `${getSLAColor(slaLevel)}18`,
                color: slaLevel === 'ok' ? DS.textMuted : getSLAColor(slaLevel),
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTimeInStage(minutesInStage)}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: DS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{item.phone || '—'}</div>

        {supportsOperationalAgenda(item.status) && item.next_action && (
          <div style={{ fontSize: 10.5, color: DS.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.next_action}
          </div>
        )}

        {groupName && <div style={{ fontSize: 10, color: DS.textLabel, marginTop: 2 }}>{groupName}</div>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 6 }}>
          {agendaState !== 'none' ? (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 3,
                background: 'transparent',
                color: agendaBadge.text,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                opacity: 0.95,
              }}
            >
              <span>{agendaBadge.icon}</span>
              {agendaLabel}
            </div>
          ) : (
            <div />
          )}

          <div
            style={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 5px',
                    cursor: 'pointer',
                    color: '#25d366',
                    lineHeight: 1,
                    display: 'inline-flex',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37,211,102,0.12)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
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
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 5px',
                    cursor: 'pointer',
                    color: DS.iconNeutral,
                    lineHeight: 1,
                    display: 'inline-flex',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = DS.iconHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = DS.iconNeutral }}
                >
                  <ClipboardCopyIcon size={14} />
                </button>
              </>
            )}

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
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                padding: '3px 6px',
                cursor: 'pointer',
                fontSize: 10,
                color: DS.iconNeutral,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '0.02em',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = DS.blueSoft }}
              onMouseLeave={(e) => { e.currentTarget.style.color = DS.iconNeutral }}
            >
              IA
            </button>

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
              title="Mais ações"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: 16,
                color: DS.iconNeutral,
                fontWeight: 700,
                lineHeight: 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = DS.iconHover }}
              onMouseLeave={(e) => { e.currentTarget.style.color = DS.iconNeutral }}
            >
              ⋯
            </button>
          </div>
        </div>

        {suggestedStatus && suggestedStatus !== item.status && (
          <div
            style={{
              marginTop: 6,
              padding: '4px 6px',
              background: 'transparent',
              borderTop: `1px dashed ${DS.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10,
              gap: 6,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ color: DS.textSecondary }}>
              IA sugere: <span style={{ color: STATUS_COLORS[suggestedStatus as Status] }}>{STATUS_LABELS[suggestedStatus as keyof typeof STATUS_LABELS] || suggestedStatus}</span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => {
                  onMoveItem(item.id, suggestedStatus as Status)
                  setSuggestedStatus(null)
                }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${DS.border}`,
                  borderRadius: 3,
                  color: DS.textPrimary,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 7px',
                  cursor: 'pointer',
                }}
              >
                Mover
              </button>
              <button
                onClick={() => setSuggestedStatus(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  color: DS.textMuted,
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                Ignorar
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'none' }}>
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
  const [menuState, setMenuState] = useState<{ item: PipelineItem; anchorRect: DOMRect } | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

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
  const stageMeta = STATUS_STAGE_META[status]
  const statusRgb = STATUS_RGB[status]

  return (
    <>
      <div
        style={{
          position: 'relative',
          minWidth: 272,
          maxWidth: 272,
          flex: '0 0 272px',
          height: 'calc(100vh - 200px)',
          minHeight: 460,
          display: 'flex',
          flexDirection: 'column',
          background: isDraggingOver
            ? `rgba(${statusRgb},0.04)`
            : DS.panelBg,
          borderRadius: 8,
          borderTop: `2px solid ${STATUS_COLORS[status]}`,
          borderRight: isDraggingOver
            ? `1px solid rgba(${statusRgb},0.45)`
            : `1px solid ${DS.border}`,
          borderBottom: isDraggingOver
            ? `1px solid rgba(${statusRgb},0.45)`
            : `1px solid ${DS.border}`,
          borderLeft: isDraggingOver
            ? `1px solid rgba(${statusRgb},0.45)`
            : `1px solid ${DS.border}`,
          transition: 'background 150ms ease, border-color 150ms ease',
          overflow: 'hidden',
          boxShadow: 'none',
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          setIsDraggingOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (!isDraggingOver) setIsDraggingOver(true)
        }}
        onDragLeave={() => {
          setIsDraggingOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          const cycleId = e.dataTransfer.getData('cycleId')
          setIsDraggingOver(false)
          if (cycleId) onDrop(cycleId, status)
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'transparent',
          }}
        />

<div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: '10px 12px 8px',
            background: DS.panelBg,
            borderBottom: `1px solid ${DS.borderSubtle}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  display: 'grid',
                  placeItems: 'center',
                  color: STATUS_COLORS[status],
                  fontSize: 10,
                  fontWeight: 800,
                  background: `rgba(${statusRgb},0.12)`,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {stageMeta.index}
              </div>

              <div
                style={{
                  color: DS.textPrimary,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {stageMeta.label}
              </div>
            </div>

            <div
              style={{
                color: DS.textSecondary,
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: 4,
                padding: '1px 7px',
                minWidth: 24,
                textAlign: 'center',
              }}
              title={total > shown ? `${shown} visíveis de ${total} totais` : `${shown} leads`}
            >
              {total > shown ? `${shown}/${total}` : shown}
            </div>
          </div>

          {total > 0 && (
            <div
              style={{
                marginTop: 8,
                height: 2,
                background: DS.borderSubtle,
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (shown / total) * 100)}%`,
                  background: STATUS_COLORS[status],
                  opacity: 0.7,
                  transition: 'width 300ms ease',
                }}
              />
            </div>
          )}
        </div>

        <div
          className="kanban-column-scroll"
          style={{ position: 'relative', flex: 1, overflowY: 'auto', padding: '8px 8px 14px' }}
        >
          {filteredCycles.length === 0 ? (
            <div
              style={{
                minHeight: 82,
                borderRadius: 8,
                border: `1px dashed ${DS.border}`,
                background: 'rgba(17, 19, 24, 0.38)',
                color: DS.textMuted,
                display: 'grid',
                placeItems: 'center',
                padding: 14,
                fontSize: 12,
                lineHeight: 1.4,
                textAlign: 'center',
              }}
            >
              Nenhum lead nesta etapa
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
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
  const [selectedScope, setSelectedScope] = useState<KanbanScope>(() => {
    if (!isAdmin) return 'mine'
    if (defaultOwnerId) return 'seller'
    return 'company'
  })
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(defaultOwnerId ?? null)

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

  const [bulkReturnReasonModalOpen, setBulkReturnReasonModalOpen] = useState(false)
  const [bulkReturnCycleIds, setBulkReturnCycleIds] = useState<string[]>([])
  const [bulkReturnSkippedTerminalCount, setBulkReturnSkippedTerminalCount] = useState(0)

// ==========================================================================
  // Movimentação via Análise de IA (substitui o StageCheckpointModal no arrasto)
  // ==========================================================================
  const [aiMoveOpen, setAiMoveOpen] = useState(false)
  const [aiMovePending, setAiMovePending] = useState<{
    cycleId: string
    fromStatus: Status
    toStatus: Status
    cycle: PipelineItem | null
  } | null>(null)

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
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kanbanAbortRef = useRef<AbortController | null>(null)
  const kanbanRequestSeqRef = useRef(0)

  const scopedOwnerId =
  selectedScope === 'mine'
    ? userId
    : selectedScope === 'seller'
      ? selectedOwnerId
      : null


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

    const ownerToLoadGroups = isAdmin ? scopedOwnerId : userId

    if (!ownerToLoadGroups) {
      setGroups([])
      return
    }

    try {
      const params = new URLSearchParams({
        owner_id: ownerToLoadGroups,
      })

      const response = await fetch(`/api/leads/kanban/groups?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      })

      const json = (await response.json()) as {
        ok?: boolean
        error?: string
        groups?: LeadGroup[]
      }

      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? 'Erro ao carregar grupos.')
      }

      setGroups(json.groups ?? [])
    } catch (e) {
      console.error('Erro ao carregar grupos:', e)
    }
  }, [companyId, isAdmin, scopedOwnerId, userId])

  const loadSellers = useCallback(async () => {
    if (!companyId || !isAdmin) return
  
    try {
      const sellersData = await adminListSellersStats({
        companyId,
        days: 30,
      })
  
      const activeSellers = sellersData
        .filter((seller) => seller.is_active)
        .map((seller) => ({
          id: seller.seller_id,
          full_name: seller.full_name,
          email: seller.email,
          role: seller.role ?? 'member',
        }))
  
      setSellers(activeSellers)
    } catch (e) {
      console.error('Erro ao carregar vendedores:', e)
    }
  }, [companyId, isAdmin])

  const loadItems = useCallback(async (searchTermParam = '') => {
    if (!companyId) return

    const requestSeq = kanbanRequestSeqRef.current + 1
    kanbanRequestSeqRef.current = requestSeq

    if (kanbanAbortRef.current) {
      kanbanAbortRef.current.abort()
    }

    const controller = new AbortController()
    kanbanAbortRef.current = controller
  
    setLoading(true)
    setError(null)
  
    try {
      const scopeToLoad: KanbanScope = isAdmin ? selectedScope : 'mine'
      const ownerToFilter = isAdmin ? scopedOwnerId : userId
  
      if (scopeToLoad !== 'company' && !ownerToFilter) {
        setItems(emptyKanbanItems())
        setTotals(emptyKanbanTotals())
        setSearchCount(null)
        return
      }
  
      const {
        data,
        totals: nextTotals,
        exactCount,
      } = await loadKanbanFromApi({
        scope: scopeToLoad,
        ownerId: ownerToFilter,
        groupId: selectedGroupId,
        searchTerm: searchTermParam.trim(),
        limit: 50,
        signal: controller.signal,
      })

      if (controller.signal.aborted || requestSeq !== kanbanRequestSeqRef.current) {
        return
      }
  
      setItems(data)
      setTotals(nextTotals)
      setSearchCount(searchTermParam.trim() ? exactCount : null)
    } catch (e: unknown) {
      if (controller.signal.aborted || requestSeq !== kanbanRequestSeqRef.current) {
        return
      }

      setError(e instanceof Error ? e.message : 'Erro ao carregar ciclos')
    } finally {
      if (requestSeq === kanbanRequestSeqRef.current) {
        setLoading(false)

        if (kanbanAbortRef.current === controller) {
          kanbanAbortRef.current = null
        }
      }
    }
  }, [companyId, isAdmin, selectedGroupId, selectedScope, scopedOwnerId, userId])

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
    const interval = setInterval(() => setNowTick(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setShowBulkModal(false)
    setSelectedIds(new Set())
  }, [selectedGroupId, selectedScope, selectedOwnerId, searchTerm, slaFilter, agendaFilter])

  useEffect(() => {
    let isCurrentSearch = true

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    const normalizedSearch = searchTerm.trim()

    setIsSearching(Boolean(normalizedSearch))

    debounceTimeoutRef.current = setTimeout(() => {
      void loadItems(searchTerm).finally(() => {
        if (isCurrentSearch) {
          setIsSearching(false)
        }
      })
    }, normalizedSearch ? 300 : 0)

    return () => {
      isCurrentSearch = false

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [searchTerm, loadItems])

  const handleCopilotSaved = useCallback(async () => {
    await loadItems(searchTerm)
    setKpiRefreshKey((v) => v + 1)
  }, [loadItems, searchTerm])

  const moveItem = useCallback(async (cycleId: string, toStatus: Status) => {
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
        throw new Error(result.error ?? 'Ciclo não encontrado ou sem permissão')
      }

      await loadItems(searchTerm)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Erro ao mover ciclo')
    } finally {
      setSavingId(null)
    }
  }, [loadItems, searchTerm])

  const setGroupForCycle = useCallback(async (cycleId: string, groupId: string | null) => {
    setSavingId(cycleId)
    setError(null)
  
    try {
      const data = await postKanbanAction({
        action: 'set_group',
        cycle_id: cycleId,
        group_id: groupId,
      })
  
      if (!data.success) throw new Error('Ciclo não encontrado ou sem permissão')
  
      await loadItems(searchTerm)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao vincular grupo')
    } finally {
      setSavingId(null)
    }
  }, [loadItems, searchTerm])

  const returnCycleToPoolWithReason = useCallback(async (cycleId: string, reason: string, details: string) => {
    setReturnSaving(true)
    setError(null)

    try {
      const data = await postKanbanAction({
        action: 'return_to_pool_with_reason',
        cycle_id: cycleId,
        reason,
        details,
      })

      if (!data.success) throw new Error('Falha ao devolver ciclo')

      await loadItems(searchTerm)
      addToast('Lead devolvido ao pool!')
      setKpiRefreshKey((v) => v + 1)
      setReturnReasonModalOpen(false)
      setReturnCycleId(null)
      setReturnCycleName('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao devolver ciclo')
    } finally {
      setReturnSaving(false)
    }
  }, [loadItems, searchTerm, addToast])

  const reassignCycle = useCallback(async (cycleId: string, newOwnerId: string) => {
    setSavingId(cycleId)
    setError(null)

    try {
      const data = await postKanbanAction({
        action: 'reassign_owner',
        cycle_id: cycleId,
        owner_user_id: newOwnerId,
      })

      if (!data.success) throw new Error('Operação não confirmada')

      await loadItems(searchTerm)
      addToast('Lead redistribuído!')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao redistribuir')
    } finally {
      setSavingId(null)
    }
  }, [loadItems, searchTerm, addToast])

  const handleCreateGroupInline = useCallback(async (target: 'bulk' | 'card', cycleId?: string) => {
    if (!isAdmin) return
  
    const groupName = window.prompt('Nome do novo grupo:')
    if (!groupName || !groupName.trim()) return
  
    setCreatingGroup(true)
  
    try {
      const data = await postKanbanAction({
        action: 'create_group',
        name: groupName.trim(),
      })
  
      if (!data.success || !data.id) throw new Error('Falha ao criar grupo')
  
      const createdGroupName = data.name ?? groupName.trim()
      const createdGroup = {
        id: data.id,
        name: createdGroupName,
      }
  
      await loadGroups()
  
      setGroups((currentGroups) => {
        const alreadyExists = currentGroups.some((group) => group.id === createdGroup.id)
  
        if (alreadyExists) {
          return currentGroups
        }
  
        return [...currentGroups, createdGroup].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR'),
        )
      })
  
      if (target === 'bulk') {
        setBulkGroup(data.id)
        addToast(`Grupo "${createdGroupName}" criado e selecionado. Clique em "Agrupar Todos" para vincular os leads.`)
      } else if (cycleId) {
        const shouldBind = window.confirm(`Grupo "${createdGroupName}" criado. Deseja vincular neste lead agora?`)
        if (shouldBind) await setGroupForCycle(cycleId, data.id)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar grupo')
    } finally {
      setCreatingGroup(false)
    }
  }, [isAdmin, loadGroups, setGroupForCycle, addToast])

  const bulkReturnToPool = useCallback(async () => {
    if (selectedIds.size === 0) return

    const selectedCycles = allItems.filter((item) => selectedIds.has(item.id))
    const eligibleCycleIds = selectedCycles
      .filter((item) => item.status !== 'ganho' && item.status !== 'perdido')
      .map((item) => item.id)

    const skippedTerminalCount = selectedCycles.length - eligibleCycleIds.length

    if (eligibleCycleIds.length === 0) {
      addToast('Selecione leads que não estejam em ganho ou perdido.')
      return
    }

    setBulkReturnCycleIds(eligibleCycleIds)
    setBulkReturnSkippedTerminalCount(skippedTerminalCount)
    setBulkReturnReasonModalOpen(true)
  }, [selectedIds, allItems, addToast])

  const confirmBulkReturnToPoolWithReason = useCallback(async (_cycleId: string, reason: string, details: string) => {
    if (bulkReturnCycleIds.length === 0) return

    setAssigningId('bulk')
    setReturnSaving(true)
    setError(null)

    try {
      const data = await postKanbanAction({
        action: 'bulk_return_to_pool',
        cycle_ids: bulkReturnCycleIds,
        reason,
        details,
      })

      if (!data.success) throw new Error('Operação não confirmada')

      await loadItems(searchTerm)

      setSelectedIds(new Set())
      setShowBulkModal(false)

      const returnedCount = data.updated_count ?? bulkReturnCycleIds.length
      const skippedCount = bulkReturnSkippedTerminalCount + (data.skipped_count ?? 0)

      if (skippedCount > 0) {
        addToast(`${returnedCount} leads devolvidos ao pool. ${skippedCount} ignorados.`)
      } else {
        addToast(`${returnedCount} leads devolvidos ao pool!`)
      }

      setBulkReturnReasonModalOpen(false)
      setBulkReturnCycleIds([])
      setBulkReturnSkippedTerminalCount(0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao devolver leads')
    } finally {
      setAssigningId(null)
      setReturnSaving(false)
    }
  }, [
    bulkReturnCycleIds,
    bulkReturnSkippedTerminalCount,
    loadItems,
    searchTerm,
    addToast,
  ])

  const bulkReassignToSeller = useCallback(async (sellerId: string) => {
    if (selectedIds.size === 0 || !sellerId || !isAdmin) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)

      const data = await postKanbanAction({
        action: 'bulk_reassign_owner',
        cycle_ids: cycleIds,
        owner_user_id: sellerId,
      })

      if (!data.success) throw new Error('Operação não confirmada')

      await loadItems(searchTerm)

      setSelectedIds(new Set())
      setBulkSeller('')
      setShowBulkModal(false)

      addToast(`${data.updated_count ?? cycleIds.length} leads redistribuídos!`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao redistribuir leads')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, isAdmin, loadItems, searchTerm, addToast])

  const bulkSetGroup = useCallback(async (groupId: string) => {
    if (selectedIds.size === 0 || !groupId) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)

      const data = await postKanbanAction({
        action: 'bulk_set_group',
        cycle_ids: cycleIds,
        group_id: groupId,
      })

      if (!data.success) throw new Error('Operação não confirmada')

      await loadItems(searchTerm)

      setSelectedIds(new Set())
      setBulkGroup('')
      setShowBulkModal(false)

      addToast(`${data.updated_count ?? cycleIds.length} leads vinculados ao grupo!`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao agrupar leads')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, loadItems, searchTerm, addToast])

  const distributeAutomatically = useCallback(async () => {
    if (selectedIds.size === 0 || sellers.length === 0 || !isAdmin) return

    setAssigningId('bulk')
    setError(null)

    try {
      const cycleIds = Array.from(selectedIds)
      const sellerIds = sellers.map((seller) => seller.id)

      const data = await postKanbanAction({
        action: 'bulk_round_robin',
        cycle_ids: cycleIds,
        owner_ids: sellerIds,
      })

      if (!data.success) throw new Error('Operação não confirmada')

      await loadItems(searchTerm)

      setSelectedIds(new Set())
      setShowBulkModal(false)

      addToast(`${data.updated_count ?? cycleIds.length} leads distribuídos automaticamente!`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao distribuir')
    } finally {
      setAssigningId(null)
    }
  }, [selectedIds, sellers, isAdmin, loadItems, searchTerm, addToast])

  const handleCheckpointConfirm = useCallback(async (payload: CheckpointPayload) => {
    if (!pendingMove) return

    setCheckpointLoading(true)

    try {
      const normalizedPayload = {
        ...payload,
        next_action_date: payload.next_action_date
          ? new Date(payload.next_action_date).toISOString()
          : null,
      }

      const { data, error } = await supabase.rpc('rpc_move_cycle_stage_checkpoint_for_company', {
        p_company_id: companyId,
        p_cycle_id: pendingMove.cycleId,
        p_to_status: pendingMove.toStatus,
        p_checkpoint: normalizedPayload,
      })

      if (error) throw error
      if (!data?.success) {
        throw new Error(data?.error_message ?? data?.error ?? 'Operação não confirmada')
      }

      await loadItems(searchTerm)
      addToast('Lead atualizado com sucesso!')
      setCheckpointOpen(false)
      setPendingMove(null)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Erro ao mover lead')
    } finally {
      setCheckpointLoading(false)
    }
  }, [pendingMove, supabase, companyId, loadItems, searchTerm, addToast])

  const handleDrop = useCallback((cycleId: string, toStatus: Status) => {
    const fromStatus = Object.entries(items).find(([, cycles]) =>
      cycles.some((cycle) => cycle.id === cycleId)
    )?.[0] as Status | undefined
    if (!fromStatus || fromStatus === toStatus) return

    const cycle = Object.values(items).flat().find((item) => item.id === cycleId) ?? null

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

    setAiMovePending({ cycleId, fromStatus, toStatus, cycle })
    setAiMoveOpen(true)
  }, [items])

  const toggleSelect = useCallback((cycleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cycleId)) next.delete(cycleId)
      else next.add(cycleId)
      return next
    })
  }, [])

  const visibleKanbanItems = useMemo(() => {
    return Object.values(items).flat().filter((item) => {
      if (slaFilter !== 'all') {
        if (!supportsOperationalSLA(item.status)) return false

        const minutes = Math.floor(
          (nowTick.getTime() - new Date(item.stage_entered_at).getTime()) / 60000,
        )
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
  }, [items, slaFilter, agendaFilter, nowTick, slaRules])

  const toggleSelectAllKanban = useCallback(() => {
    const allSelected = selectedIds.size === visibleKanbanItems.length && visibleKanbanItems.length > 0

    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleKanbanItems.map((item) => item.id)))
    }
  }, [visibleKanbanItems, selectedIds])

  const currentRedistributionOwnerId =
    selectedScope === 'mine'
      ? userId
      : selectedScope === 'seller'
        ? selectedOwnerId
        : null

  const validSellersForRedistribution = sellers.filter(
    (s) => !!s.full_name && (!currentRedistributionOwnerId || s.id !== currentRedistributionOwnerId),
  )
  const canRedistribute = validSellersForRedistribution.length > 0

  const allKanbanItems = visibleKanbanItems
  const allKanbanSelected = selectedIds.size === visibleKanbanItems.length && visibleKanbanItems.length > 0

  const pillStyle: React.CSSProperties = {
    borderRadius: DS.radius,
    padding: '6px 10px',
    background: 'transparent',
    border: `1px solid ${DS.border}`,
    color: DS.textSecondary,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 500,
    outline: 'none',
    height: 30,
    lineHeight: 1,
  }

  const iconButtonStyle: React.CSSProperties = {
    ...pillStyle,
    padding: '0 9px',
    width: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
  }

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 18,
    background: DS.divider,
    margin: '0 2px',
    flexShrink: 0,
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
          background: 'rgba(13,15,20,0.92)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${DS.border}`,
          padding: '8px 16px',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Zona 1 — Contexto */}
        {isAdmin && (
          <select
            value={
              selectedScope === 'company'
                ? 'company'
                : selectedScope === 'mine'
                  ? 'mine'
                  : selectedOwnerId ?? ''
            }
            onChange={(e) => {
              const value = e.target.value

              if (value === 'company') {
                setSelectedScope('company')
                setSelectedOwnerId(null)
                setSelectedGroupId(null)
                return
              }

              if (value === 'mine') {
                setSelectedScope('mine')
                setSelectedOwnerId(null)
                setSelectedGroupId(null)
                return
              }

              setSelectedScope('seller')
              setSelectedOwnerId(value)
              setSelectedGroupId(null)
            }}
            style={pillStyle}
            title="Escopo do Kanban"
          >
            <option value="company">Empresa inteira</option>
            <option value="mine">Meu Cockpit</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.email} ({s.role})
              </option>
            ))}
          </select>
        )}

        <select value={selectedGroupId || ''} onChange={(e) => setSelectedGroupId(e.target.value || null)} style={pillStyle} title="Grupo">
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <div style={dividerStyle} />

        {/* Zona 2 — Filtros */}
        <select value={slaFilter} onChange={(e) => setSLAFilter(e.target.value as 'all' | 'ok' | 'warn' | 'danger')} style={pillStyle} title="Filtrar por SLA">
          <option value="all">SLA: Todos</option>
          <option value="ok">SLA: OK</option>
          <option value="warn">SLA: Atenção</option>
          <option value="danger">SLA: Estourado</option>
        </select>

        <select value={agendaFilter} onChange={(e) => setAgendaFilter(e.target.value as 'all' | 'today' | 'overdue' | 'next7')} style={pillStyle} title="Filtrar por agenda">
          <option value="all">Agenda: Todos</option>
          <option value="today">Hoje ({todayCount})</option>
          <option value="overdue">Atrasados ({overdueCount})</option>
          <option value="next7">Próximos 7d ({next7Count})</option>
        </select>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar nome, telefone, CPF, email..."
            style={{
              borderRadius: DS.radius,
              padding: '6px 10px 6px 28px',
              background: DS.selectBg,
              border: `1px solid ${DS.border}`,
              color: DS.textPrimary,
              fontSize: 12,
              minWidth: 240,
              outline: 'none',
              height: 30,
            }}
          />
          <span style={{ position: 'absolute', left: 9, color: DS.textMuted, fontSize: 12, pointerEvents: 'none' }}>⌕</span>
          {searchTerm.trim() && !isSearching && searchCount !== null && (
            <span style={{ position: 'absolute', right: 8, fontSize: 10, color: DS.textMuted, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
              {searchCount}
            </span>
          )}
          {isSearching && <span style={{ position: 'absolute', right: 8, fontSize: 10, color: DS.textMuted, pointerEvents: 'none' }}>...</span>}
        </div>

        {/* Zona 3 — Ações */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setShowBulkModal(true)}
                style={{
                  ...pillStyle,
                  borderColor: DS.amberBorder,
                  color: DS.amberText,
                }}
                title="Executar ações em massa nos leads selecionados"
              >
                Ações em massa · {selectedIds.size}
              </button>
              <div style={dividerStyle} />
            </>
          )}

          <button
            onClick={toggleSelectAllKanban}
            style={pillStyle}
            title={allKanbanSelected ? 'Desmarcar todos' : `Selecionar todos (${allKanbanItems.length})`}
          >
            {allKanbanSelected ? 'Desmarcar' : 'Selecionar tudo'}
          </button>

          <button
            onClick={() => {
              void loadItems(searchTerm)
            }}
            style={iconButtonStyle}
            title="Atualizar kanban"
            aria-label="Atualizar kanban"
          >
            ↻
          </button>

          <button
            onClick={() => setFocusMode((v) => !v)}
            style={{
              ...iconButtonStyle,
              color: focusMode ? DS.blueSoft : DS.textSecondary,
              borderColor: focusMode ? 'rgba(59,130,246,0.4)' : DS.border,
            }}
            title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
          >
            {focusMode ? '⊡' : '⊞'}
          </button>

          <div style={dividerStyle} />

          <button
            onClick={() => {
              onShowCreateLeadModal?.()
              setShowCreateLeadModal(true)
            }}
            style={{
              ...pillStyle,
              background: '#1e7d4a',
              border: '1px solid #1e7d4a',
              color: '#ffffff',
              fontWeight: 600,
              padding: '6px 12px',
            }}
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
        alerts={[
          { key: 'overdue', label: 'Atrasados', value: overdueCount, active: agendaFilter === 'overdue' },
          { key: 'danger', label: 'SLA estourado', value: dangerCount, active: slaFilter === 'danger' },
          { key: 'today', label: 'Agenda hoje', value: todayCount, active: agendaFilter === 'today' },
          { key: 'next7', label: 'Próximos 7d', value: next7Count, active: agendaFilter === 'next7' },
        ]}
        onAlertClick={(key) => {
          if (key === 'danger') {
            setSLAFilter((prev) => (prev === 'danger' ? 'all' : 'danger'))
          } else {
            setAgendaFilter((prev) => (prev === key ? 'all' : key))
          }
        }}
        onToggleInsights={() => setInsightsExpanded((v) => !v)}
        insightsExpanded={insightsExpanded}
      />

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
              { title: 'SLA Estourado', count: dangerItems.length, accent: '#f59e0b', items: dangerItems, renderDetail: (c: PipelineItem) => `${formatTimeInStage(Math.floor((nowTick.getTime() - new Date(c.stage_entered_at).getTime()) / 60000))} em ${STATUS_LABELS[c.status as keyof typeof STATUS_LABELS]}` },
              { title: 'Agenda Hoje', count: todayItems.length, accent: '#3b82f6', items: todayItems, renderDetail: (c: PipelineItem) => formatNextActionDate(c.next_action_date) },
              { title: 'Próximos 7d', count: next7Items.length, accent: '#8b5cf6', items: next7Items, renderDetail: (c: PipelineItem) => formatNextActionDate(c.next_action_date) },
            ]

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {sections.map((sec) => (
                  <div key={sec.title} style={{ background: DS.panelBg, border: `1px solid ${DS.border}`, borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: DS.textSecondary, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sec.accent, display: 'inline-block' }} />
                      {sec.title}
                      <span style={{ fontSize: 10, fontWeight: 700, color: sec.count > 0 ? sec.accent : DS.textMuted, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                        {sec.count}
                      </span>
                    </div>

                    {sec.items.length === 0 ? (
                      <div style={{ fontSize: 10.5, color: DS.textMuted }}>Nenhum</div>
                    ) : (
                      sec.items.slice(0, 10).map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            window.location.href = `/sales-cycles/${c.id}`
                          }}
                          style={{ fontSize: 11, padding: '4px 6px', borderRadius: 3, marginBottom: 1, cursor: 'pointer', color: DS.textPrimary, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = DS.surfaceBg }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.name}</span>
                          <span style={{ fontSize: 9.5, color: DS.textMuted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{sec.renderDetail(c)}</span>
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

<div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
          background: DS.contentBg,
        }}
      >

        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {error && <div style={{ background: DS.redBg, color: DS.redText, padding: '8px 16px', borderLeft: `3px solid #ef4444`, fontSize: 12, border: `1px solid ${DS.redBorder}` }}>{error}</div>}

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: DS.textMuted, fontSize: 13 }}>Carregando...</div>
          ) : (
            <div
              className="kanban-column-scroll"
              style={{
                flex: 1,
                overflowX: 'auto',
                overflowY: 'hidden',
                padding: '12px 16px 16px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
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
            void loadItems(searchTerm)
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
        key={returnCycleId ?? 'return-reason-modal'}
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

      <ReturnReasonModal
        key={`bulk-return-${bulkReturnCycleIds.join('-') || 'empty'}`}
        isOpen={bulkReturnReasonModalOpen}
        cycleId="bulk-return"
        cycleName={`${bulkReturnCycleIds.length} lead(s) selecionado(s)`}
        onClose={() => {
          setBulkReturnReasonModalOpen(false)
          setBulkReturnCycleIds([])
          setBulkReturnSkippedTerminalCount(0)
        }}
        onConfirm={confirmBulkReturnToPoolWithReason}
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

      {/* Análise de IA quando o vendedor arrasta o card entre colunas. */}
      <CopilotMovePortal
        open={aiMoveOpen}
        pending={aiMovePending}
        companyId={companyId}
        onClose={() => {
          setAiMoveOpen(false)
          setAiMovePending(null)
          // força refetch pra garantir que o card volte pra coluna original
          // caso a UI tenha otimisticamente movido.
          void loadItems(searchTerm)
        }}
        onApplied={async () => {
          setAiMoveOpen(false)
          setAiMovePending(null)
          await handleCopilotSaved()
        }}
        onTerminalApply={(terminalStatus) => {
          if (!aiMovePending) return
          const cycle = aiMovePending.cycle
          const cycleId = aiMovePending.cycleId

          setAiMoveOpen(false)
          setAiMovePending(null)

          if (terminalStatus === 'ganho') {
            setWinDealCycleId(cycleId)
            setWinDealName(cycle?.name || '')
            setWinDealOwnerId(cycle?.owner_id || undefined)
            setWinDealOpen(true)
          } else {
            setLostDealCycleId(cycleId)
            setLostDealName(cycle?.name || '')
            setLostDealOpen(true)
          }
        }}
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
          await loadItems(searchTerm)
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
          await loadItems(searchTerm)
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
