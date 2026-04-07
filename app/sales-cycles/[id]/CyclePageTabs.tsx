'use client'

// ---------------------------------------------------------------------------
// CyclePageTabs — Client component managing the 4 operational tabs for a
// sales cycle detail page.
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import CycleOperationalSummary from './CycleOperationalSummary'
import CycleContextAlerts from './CycleContextAlerts'
import CycleResumeContext from './CycleResumeContext'
import CycleSuggestedAction from './CycleSuggestedAction'
import EditLeadProfileModal from '@/app/leads/components/EditLeadProfileModal'
import StageCheckpointModal from '@/app/leads/components/StageCheckpointModal'
import { WinDealModal } from '@/app/components/leads/WinDealModal'
import { LostDealModal } from '@/app/components/leads/LostDealModal'
import { QuickActionModal, logQuickAction, QuickActionType } from '@/app/components/leads/QuickActionModal'
import {
  moveCycleStage,
  setNextAction,
} from '@/app/lib/services/sales-cycles'
import type { LeadStatus } from '@/app/types/sales_cycles'
import {
  IconWhatsApp,
  IconClipboard,
  IconPencil,
  IconArrowRightCircle,
  IconX,
  IconHistory,
  IconCircleCheck,
} from '@/app/components/icons/UiIcons'
import {
  type CycleEvent,
  statusLabel,
  fmtDate,
  fmtDateShort,
  whatsappLink,
  statusBadgeStyle,
  getNextActionUrgency,
  getEventTitle,
  HEX_ALPHA_LIGHT,
  HEX_ALPHA_MEDIUM,
  CheckpointCard,
  LostCard,
  WonCard,
  AdminCard,
  ActivityCard,
  NextActionCard,
  classifyEvent,
  EVENT_CLASS_DOT_COLOR,
} from './cycle-event-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'history' | 'lead-data' | 'actions'

interface Tab {
  id: TabId
  label: string
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'history', label: 'Histórico' },
  { id: 'lead-data', label: 'Dados do Lead' },
  { id: 'actions', label: 'Ações' },
]

const STATUS_OPTIONS: LeadStatus[] = [
  'novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido',
]

const STATUS_COLOR_MAP: Record<LeadStatus, string> = {
  novo: '#60a5fa',
  contato: '#a855f7',
  respondeu: '#e879f9',
  negociacao: '#fb923c',
  ganho: '#34d399',
  perdido: '#f87171',
}

interface CyclePageTabsProps {
  cycle: any
  events: CycleEvent[]
  leadProfile: any
  companyId: string
}

// ---------------------------------------------------------------------------
// DataRow helper (used in Dados do Lead tab)
// ---------------------------------------------------------------------------

function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '1px solid #2a2a3e' }}>
      <span style={{ fontSize: 12, color: '#8b8fa2' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f1f5f9', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick action toast labels
// ---------------------------------------------------------------------------

const TOAST_DURATION_MS = 4000

const QUICK_ACTION_TOAST_LABELS: Record<QuickActionType, string> = {
  // NOVO
  quick_approach_contact: 'Abordagem registrada',
  quick_call_done: 'Ligação registrada',
  quick_whats_sent: 'WhatsApp registrado',
  quick_email_sent: 'Email registrado',
  quick_bad_data: 'Telefone incorreto registrado',
  // CONTATO
  quick_showed_interest: 'Interesse registrado',
  quick_asked_info: 'Pedido de informação registrado',
  quick_answered_doubt: 'Dúvida registrada',
  quick_scheduled: 'Agendamento registrado',
  quick_asked_proposal: 'Pedido de proposta registrado',
  // RESPONDEU
  quick_qualified: 'Qualificação registrada',
  quick_proposal_presented: 'Proposta apresentada registrada',
  quick_doubt_answered: 'Dúvida respondida registrada',
  quick_visit_scheduled: 'Visita agendada registrada',
  quick_negotiation_started: 'Negociação iniciada registrada',
  // NEGOCIAÇÃO
  quick_final_proposal_sent: 'Proposta final registrada',
  quick_objection_registered: 'Objeção registrada',
  quick_commercial_condition: 'Condição comercial registrada',
  quick_closing_scheduled: 'Fechamento agendado registrado',
  quick_closed_won: 'Fechamento registrado',
  quick_closed_lost: 'Perda registrada',
  // Genérica
  quick_proposal: 'Proposta registrada',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CyclePageTabs({ cycle, events, leadProfile, companyId }: CyclePageTabsProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(false)

  // Modals
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showWinModal, setShowWinModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [checkpointOpen, setCheckpointOpen] = useState(false)
  const [checkpointToStatus, setCheckpointToStatus] = useState<LeadStatus>('contato')
  const [checkpointLoading, setCheckpointLoading] = useState(false)

  // Form state
  const [action, setAction] = useState('')
  const [actionDate, setActionDate] = useState('')

  // Lead basic edit state
  const [editingLead, setEditingLead] = useState(false)
  const [leadName, setLeadName] = useState(cycle.leads?.name || '')
  const [leadPhone, setLeadPhone] = useState(cycle.leads?.phone || '')
  const [leadEmail, setLeadEmail] = useState(cycle.leads?.email || '')
  const [leadEditLoading, setLeadEditLoading] = useState(false)

  // Contact registration banner (non-blocking, after WhatsApp/copy phone)
  const [showContactBanner, setShowContactBanner] = useState(false)
  const [contactBannerChannel, setContactBannerChannel] = useState<'whatsapp' | 'copy'>('whatsapp')
  const [showQuickActionModal, setShowQuickActionModal] = useState(false)
  const [quickActionLoading, setQuickActionLoading] = useState(false)
  // Suggestion strip (shown after quick action if stage advance is possible)
  const [suggestedStatus, setSuggestedStatus] = useState<string | null>(null)
  // Toast confirmation after quick action
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  // Error toast (replaces alert())
  const [toastError, setToastError] = useState<string | null>(null)
  // Copy phone feedback
  const [copiedPhone, setCopiedPhone] = useState(false)

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), TOAST_DURATION_MS)
    return () => clearTimeout(t)
  }, [toastMessage])

  // Auto-dismiss error toast after 5 seconds
  useEffect(() => {
    if (!toastError) return
    const t = setTimeout(() => setToastError(null), 5000)
    return () => clearTimeout(t)
  }, [toastError])

  // Reset "Copiado!" feedback after 2 seconds
  useEffect(() => {
    if (!copiedPhone) return
    const t = setTimeout(() => setCopiedPhone(false), 2000)
    return () => clearTimeout(t)
  }, [copiedPhone])

  const lead = cycle.leads as { id?: string; name?: string; phone?: string; email?: string } | null
  const isClosed = cycle.status === 'ganho' || cycle.status === 'perdido'
  const waLink = whatsappLink(lead?.phone)
  const { badge: nextActionBadge, borderColor: nextActionBorderColor } = getNextActionUrgency(cycle.next_action_date as string | null)

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const openCheckpoint = (toStatus: LeadStatus) => {
    if (toStatus === cycle.status) return
    if (toStatus === 'ganho') {
      setShowWinModal(true)
      return
    }
    if (toStatus === 'perdido') {
      setShowLostModal(true)
      return
    }
    setCheckpointToStatus(toStatus)
    setCheckpointOpen(true)
  }

  const handleSaveAction = async () => {
    if (!action.trim() || !actionDate) {
      setToastError('Preencha a ação e a data antes de salvar.')
      return
    }
    setLoading(true)
    try {
      await setNextAction({
        cycle_id: cycle.id,
        next_action: action,
        next_action_date: new Date(actionDate),
      })
      setAction('')
      setActionDate('')
      setShowActionModal(false)
      router.refresh()
    } catch (err: any) {
      setToastError(`Erro ao salvar: ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveLead = async () => {
    if (!leadName.trim()) {
      setToastError('Nome é obrigatório para salvar.')
      return
    }
    setLeadEditLoading(true)
    try {
      const supabase = supabaseBrowser()
      const { error } = await supabase
        .from('leads')
        .update({ name: leadName.trim(), phone: leadPhone.trim() || null, email: leadEmail.trim() || null })
        .eq('id', lead?.id)
        .eq('company_id', companyId)
      if (error) throw error
      setEditingLead(false)
      router.refresh()
    } catch (err: any) {
      setToastError(`Erro ao salvar: ${err?.message ?? String(err)}`)
    } finally {
      setLeadEditLoading(false)
    }
  }

  const copyPhone = async () => {
    if (lead?.phone) {
      try {
        await navigator.clipboard.writeText(lead.phone)
        setCopiedPhone(true)
        setContactBannerChannel('copy')
        setShowContactBanner(true)
      } catch {
        setToastError(`Não foi possível copiar. Número: ${lead.phone}`)
      }
    }
  }

  // --------------------------------------------------------------------------
  // Tab bar
  // --------------------------------------------------------------------------

  const renderTabBar = () => (
    <div style={{ borderBottom: '1px solid #2a2a3e', marginBottom: 24, display: 'flex', gap: 0, overflowX: 'auto' }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #60a5fa' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'color 0.15s',
            background: activeTab === tab.id ? '#2a2a3e' : 'transparent',
            color: activeTab === tab.id ? 'white' : '#8b8fa2',
            borderRadius: '8px 8px 0 0',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  // --------------------------------------------------------------------------
  // ABA 1 — Visão Geral
  // --------------------------------------------------------------------------

  const renderOverview = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
      {/* Coluna esquerda */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Resumo Operacional */}
        <CycleOperationalSummary events={events} ciclo={cycle} />

        {/* Card de ganho condicional */}
        {cycle.status === 'ganho' && cycle.won_at && (
          <div style={{
            background: '#1e1e2e',
            border: '1px solid #2a2a3e',
            borderLeft: '4px solid #34d399',
            borderRadius: 12,
            padding: '16px 18px',
          }}>
            <WonCard cycle={cycle as Record<string, unknown>} />
          </div>
        )}

        {/* Histórico recente */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 16,
          padding: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Histórico recente
            </h3>
            <button
              onClick={() => setActiveTab('history')}
              style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
            >
              Ver histórico completo →
            </button>
          </div>
          {events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
              <div style={{ marginBottom: 8, opacity: 0.5, display: 'flex', justifyContent: 'center' }}>
                <IconHistory size={22} />
              </div>
              <p style={{ fontSize: 13, fontStyle: 'italic', margin: 0, lineHeight: 1.5 }}>
                Nenhum evento registrado ainda — registre o primeiro contato para iniciar o acompanhamento
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {events.slice(0, 5).map((event) => {
                const cls = classifyEvent(event)
                const dotColor = EVENT_CLASS_DOT_COLOR[cls]
                return (
                  <div key={event.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 7, flexShrink: 0,
                      background: dotColor,
                    }} />
                    <div style={{ flex: 1, background: '#181824', borderRadius: 8, border: '1px solid #2a2a3e', padding: '10px 14px' }}>
                      {cls === 'perda' ? <LostCard event={event} /> :
                       cls === 'movimentacao' || cls === 'ganho' ? <CheckpointCard event={event} /> :
                       cls === 'atividade' ? <ActivityCard event={event} /> :
                       cls === 'proxima_acao' ? <NextActionCard event={event} /> :
                       <AdminCard event={event} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Coluna direita */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Próximo passo sugerido */}
        <CycleSuggestedAction
          events={events}
          cycle={cycle}
          onOpenWhatsApp={waLink ? () => { window.open(waLink, '_blank', 'noopener,noreferrer') } : undefined}
          onRegisterContact={() => setShowQuickActionModal(true)}
          onUpdateNextAction={() => setShowActionModal(true)}
          onMoveStage={() => setActiveTab('actions')}
        />

        {/* Próxima Ação */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderLeft: `4px solid ${nextActionBorderColor}`,
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Próxima Ação
          </div>
          {cycle.next_action ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fde68a', marginBottom: 6, lineHeight: 1.4 }}>
                {cycle.next_action as string}
              </div>
              {cycle.next_action_date && (
                <div style={{ fontSize: 12, color: '#8b8fa2', marginBottom: 8 }}>
                  {fmtDate(cycle.next_action_date as string)}
                </div>
              )}
              {nextActionBadge && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: nextActionBadge.color,
                  background: `${nextActionBadge.color}${HEX_ALPHA_LIGHT}`,
                  border: `1px solid ${nextActionBadge.color}${HEX_ALPHA_MEDIUM}`,
                  borderRadius: 20, padding: '2px 10px',
                  display: 'inline-block', marginBottom: 10,
                }}>
                  {nextActionBadge.label}
                </span>
              )}
              <button
                onClick={() => setShowActionModal(true)}
                disabled={isClosed}
                style={{
                  display: 'block', width: '100%', marginTop: 8,
                  padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  background: '#2a2a3e', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', cursor: isClosed ? 'not-allowed' : 'pointer',
                  opacity: isClosed ? 0.5 : 1,
                }}
              >
                Atualizar ação
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.5 }}>
                Nenhuma ação agendada — defina o próximo passo para manter o lead ativo
              </div>
              <button
                onClick={() => setShowActionModal(true)}
                disabled={isClosed}
                style={{
                  display: 'block', width: '100%',
                  padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  background: '#2a2a3e', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', cursor: isClosed ? 'not-allowed' : 'pointer',
                  opacity: isClosed ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                Definir ação
              </button>
            </div>
          )}
        </div>

        {/* Alertas */}
        <CycleContextAlerts
          events={events}
          lead={{
            status: cycle.status as string,
            next_action: cycle.next_action as string | null,
            next_action_date: cycle.next_action_date as string | null,
          }}
        />

        {/* Retomada inteligente */}
        <CycleResumeContext events={events} cycle={cycle} />

        {/* Ações rápidas */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '16px 18px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Ações Rápidas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {waLink && (
              <button
                onClick={() => {
                  window.open(waLink, '_blank', 'noopener,noreferrer')
                  setContactBannerChannel('whatsapp')
                  setShowContactBanner(true)
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '8px 12px',
                  background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
                  borderRadius: 8, color: '#34d399', fontSize: 12, fontWeight: 600,
                  textDecoration: 'none', textAlign: 'center', cursor: 'pointer',
                }}
              >
                <IconWhatsApp size={14} /> WhatsApp
              </button>
            )}
            {lead?.phone && (
              <button
                onClick={copyPhone}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 12px',
                  background: copiedPhone ? 'rgba(52,211,153,0.12)' : '#2a2a3e',
                  border: copiedPhone ? '1px solid rgba(52,211,153,0.4)' : '1px solid #3a3a4e',
                  borderRadius: 8,
                  color: copiedPhone ? '#34d399' : '#f1f5f9',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {copiedPhone
                  ? <><IconCircleCheck size={14} /> Copiado!</>
                  : <><IconClipboard size={14} /> Copiar telefone</>}
              </button>
            )}
            <button
              onClick={() => setActiveTab('lead-data')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', background: '#2a2a3e',
                border: '1px solid #3a3a4e', borderRadius: 8,
                color: '#f1f5f9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <IconPencil size={14} /> Editar dados
            </button>
            <button
              onClick={() => setActiveTab('actions')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', background: '#2a2a3e',
                border: '1px solid #3a3a4e', borderRadius: 8,
                color: '#f1f5f9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <IconArrowRightCircle size={14} /> Mover etapa
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // --------------------------------------------------------------------------
  // ABA 2 — Histórico
  // --------------------------------------------------------------------------

  const renderHistory = () => (
    <div style={{
      background: '#1e1e2e',
      border: '1px solid #2a2a3e',
      borderRadius: 16,
      padding: 24,
    }}>
      <h2 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16, margin: 0, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Histórico
      </h2>

      {/* Última movimentação */}
      {events.length > 0 && (
        <div style={{
          marginBottom: 20, background: '#181824', border: '1px solid #2a2a3e',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <span style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1 }}>Última movimentação</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', marginTop: 2 }}>{getEventTitle(events[0])}</div>
          </div>
          <span style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(events[0].occurred_at)}</span>
        </div>
      )}

      {/* Ganho no topo se ciclo ganho */}
      {cycle.status === 'ganho' && cycle.won_at && (
        <div style={{
          marginBottom: 20, background: '#181824',
          borderLeft: '4px solid #34d399', borderRadius: 8, padding: '14px 16px',
        }}>
          <WonCard cycle={cycle as Record<string, unknown>} />
        </div>
      )}

      {events.length === 0 && cycle.status !== 'ganho' ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
          <div style={{ marginBottom: 12, opacity: 0.4, display: 'flex', justifyContent: 'center' }}>
            <IconHistory size={28} />
          </div>
          <p style={{ fontSize: 13, fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>
            Nenhum evento registrado ainda — registre o primeiro contato para iniciar o acompanhamento
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {events.map((event) => {
            const cls = classifyEvent(event)
            const dotColor = EVENT_CLASS_DOT_COLOR[cls]
            return (
              <div key={event.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', marginTop: 7, flexShrink: 0,
                  background: dotColor,
                }} />
                <div style={{ flex: 1, background: '#181824', borderRadius: 10, border: '1px solid #2a2a3e', padding: '14px 16px' }}>
                  {cls === 'perda' ? <LostCard event={event} /> :
                   cls === 'movimentacao' || cls === 'ganho' ? <CheckpointCard event={event} /> :
                   cls === 'atividade' ? <ActivityCard event={event} /> :
                   cls === 'proxima_acao' ? <NextActionCard event={event} /> :
                   <AdminCard event={event} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // --------------------------------------------------------------------------
  // ABA 3 — Dados do Lead
  // --------------------------------------------------------------------------

  const renderLeadData = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Dados básicos */}
      <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Dados do Lead
          </h3>
          <button
            onClick={() => setEditingLead(!editingLead)}
            style={{
              padding: '6px 12px', background: '#2a2a3e',
              border: '1px solid #3a3a4e', borderRadius: 8,
              color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {editingLead ? 'Cancelar' : 'Editar informações'}
          </button>
        </div>

        {editingLead ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 4 }}>Nome</label>
              <input
                type="text"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                disabled={leadEditLoading}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: '#181824', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 4 }}>Telefone</label>
              <input
                type="text"
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
                disabled={leadEditLoading}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: '#181824', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                disabled={leadEditLoading}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: '#181824', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={handleSaveLead}
              disabled={leadEditLoading}
              style={{
                padding: '10px 16px', background: '#0066cc',
                border: 'none', borderRadius: 8,
                color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                opacity: leadEditLoading ? 0.5 : 1,
              }}
            >
              {leadEditLoading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DataRow label="Nome" value={lead?.name} />
            <DataRow label="Telefone" value={lead?.phone} />
            <DataRow label="Email" value={lead?.email || leadProfile?.email} />
            {!lead?.name && !lead?.phone && !lead?.email && !leadProfile?.email && (
              <div style={{ fontSize: 12, color: '#8b8fa2', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
                Nenhum dado básico registrado
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dados cadastrais */}
      <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Dados Cadastrais
          </h3>
          <button
            onClick={() => setShowEditProfile(true)}
            style={{
              padding: '6px 12px', background: '#2a2a3e',
              border: '1px solid #3a3a4e', borderRadius: 8,
              color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Editar
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DataRow label="CPF" value={leadProfile?.cpf} />
          <DataRow label="CEP" value={leadProfile?.cep} />
          <DataRow label="Rua" value={leadProfile?.address_street} />
          <DataRow label="Número" value={leadProfile?.address_number} />
          <DataRow label="Complemento" value={leadProfile?.address_complement} />
          <DataRow label="Bairro" value={leadProfile?.address_neighborhood} />
          <DataRow label="Cidade" value={leadProfile?.address_city} />
          <DataRow label="Estado" value={leadProfile?.address_state} />
          <DataRow label="País" value={leadProfile?.address_country} />
          {!leadProfile && (
            <div style={{ fontSize: 12, color: '#8b8fa2', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
              Nenhum dado cadastral registrado.<br />
              <span style={{ color: '#60a5fa', cursor: 'pointer' }} onClick={() => setShowEditProfile(true)}>
                Clique em Editar para adicionar.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // --------------------------------------------------------------------------
  // ABA 4 — Ações
  // --------------------------------------------------------------------------

  const renderActions = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Mover etapa */}
      <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 16, padding: 20 }}>
        <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, margin: 0, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Mover Etapa
        </h3>
        {isClosed && (
          <div style={{ fontSize: 12, color: '#8b8fa2', marginBottom: 12, padding: '8px 10px', background: '#181824', borderRadius: 8 }}>
            Ciclo fechado — movimentação desabilitada.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STATUS_OPTIONS.map((status) => {
            const isActive = status === cycle.status
            const color = STATUS_COLOR_MAP[status]
            return (
              <button
                key={status}
                onClick={() => openCheckpoint(status)}
                disabled={loading || isClosed || isActive}
                style={{
                  padding: '10px 14px',
                  background: isActive ? `${color}22` : '#181824',
                  border: `1px solid ${isActive ? color : color + '44'}`,
                  borderRadius: 10, color: isActive ? color : '#e5e7eb',
                  fontSize: 13, fontWeight: 600,
                  cursor: (loading || isClosed || isActive) ? 'not-allowed' : 'pointer',
                  opacity: (loading || (isClosed && !isActive)) ? 0.5 : 1,
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                {statusLabel(status)}
                {isActive && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 8 }}>(atual)</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ações operacionais */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Próxima ação inline */}
        <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 16, padding: 20 }}>
          <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, margin: 0, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Definir Próxima Ação
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 4 }}>Ação</label>
              <input
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Ex: Ligar para cliente"
                disabled={loading || isClosed}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: '#181824', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 4 }}>Data e Hora</label>
              <input
                type="datetime-local"
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
                disabled={loading || isClosed}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: '#181824', border: '1px solid #3a3a4e',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={handleSaveAction}
              disabled={loading || isClosed}
              style={{
                padding: '10px 16px', background: '#1d4ed8',
                border: 'none', borderRadius: 8,
                color: 'white', fontSize: 13, fontWeight: 600,
                cursor: (loading || isClosed) ? 'not-allowed' : 'pointer',
                opacity: (loading || isClosed) ? 0.5 : 1,
              }}
            >
              {loading ? 'Salvando...' : 'Salvar ação'}
            </button>
          </div>
        </div>

        {/* Ações Rápidas */}
        <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 16, padding: 20 }}>
          <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14, margin: 0, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Ações Rápidas
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {waLink && (
              <button
                onClick={() => {
                  window.open(waLink, '_blank', 'noopener,noreferrer')
                  setContactBannerChannel('whatsapp')
                  setShowContactBanner(true)
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 16px',
                  background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
                  borderRadius: 8, color: '#34d399', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                <IconWhatsApp size={14} /> WhatsApp
              </button>
            )}
            {lead?.phone && (
              <button
                onClick={copyPhone}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 16px',
                  background: copiedPhone ? 'rgba(52,211,153,0.12)' : '#2a2a3e',
                  border: copiedPhone ? '1px solid rgba(52,211,153,0.4)' : '1px solid #3a3a4e',
                  borderRadius: 8,
                  color: copiedPhone ? '#34d399' : '#f1f5f9',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {copiedPhone
                  ? <><IconCircleCheck size={14} /> Copiado!</>
                  : <><IconClipboard size={14} /> Copiar telefone</>}
              </button>
            )}
            <button
              onClick={() => setActiveTab('lead-data')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 16px', background: '#2a2a3e',
                border: '1px solid #3a3a4e', borderRadius: 8,
                color: '#f1f5f9', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <IconPencil size={14} /> Editar dados
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div>
      {/* ── Suggestion strip (shown after quick action if stage advance is possible) ── */}
      {suggestedStatus && suggestedStatus !== cycle.status && (
        <div style={{
          marginBottom: 12,
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 10,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ color: '#93c5fd', fontSize: 13, fontWeight: 600 }}>
            Sugestão: mover para <strong style={{ color: '#60a5fa' }}>{statusLabel(suggestedStatus)}</strong>
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => {
                const target = suggestedStatus as LeadStatus
                setSuggestedStatus(null)
                openCheckpoint(target)
              }}
              style={{
                background: '#2563eb', border: 'none', borderRadius: 6,
                color: 'white', fontSize: 12, fontWeight: 700,
                padding: '5px 14px', cursor: 'pointer',
              }}
            >
              Aceitar
            </button>
            <button
              onClick={() => setSuggestedStatus(null)}
              style={{
                background: 'transparent', border: '1px solid #374151',
                borderRadius: 6, color: '#9ca3af', fontSize: 12,
                padding: '5px 14px', cursor: 'pointer',
              }}
            >
              Dispensar
            </button>
          </div>
        </div>
      )}

      {renderTabBar()}

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'history' && renderHistory()}
      {activeTab === 'lead-data' && renderLeadData()}
      {activeTab === 'actions' && renderActions()}

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {/* StageCheckpointModal */}
      <StageCheckpointModal
        open={checkpointOpen}
        fromStatus={cycle.status as any}
        toStatus={checkpointToStatus as any}
        loading={checkpointLoading}
        onCancel={() => { if (!checkpointLoading) setCheckpointOpen(false) }}
        onConfirm={async (payload) => {
          setCheckpointLoading(true)
          try {
            await moveCycleStage({
              cycle_id: cycle.id,
              to_status: checkpointToStatus,
              metadata: payload as any,
            })
            if (payload?.next_action && payload?.next_action_date) {
              await setNextAction({
                cycle_id: cycle.id,
                next_action: payload.next_action,
                next_action_date: payload.next_action_date,
              })
            }
            setCheckpointOpen(false)
            router.refresh()
          } catch (err: any) {
            setToastError(`Erro: ${err?.message ?? String(err)}`)
          } finally {
            setCheckpointLoading(false)
          }
        }}
      />

      {/* WinDealModal */}
      <WinDealModal
        isOpen={showWinModal}
        dealId={cycle.id}
        dealName={cycle?.leads?.name || 'Deal'}
        ownerUserId={cycle?.owner_user_id || undefined}
        companyId={cycle.company_id}
        onClose={() => setShowWinModal(false)}
        onSuccess={() => {
          router.refresh()
          setShowWinModal(false)
        }}
      />

      {/* Lost Modal */}
      <LostDealModal
        isOpen={showLostModal}
        dealId={cycle.id}
        dealName={cycle?.leads?.name || 'Deal'}
        onClose={() => setShowLostModal(false)}
        onSuccess={() => {
          router.refresh()
          setShowLostModal(false)
        }}
      />

      {/* Próxima Ação Modal (from overview quick action) */}
      {showActionModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#1e1e2e', border: '1px solid #2a2a3e',
            borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw',
          }}>
            <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16, margin: 0, marginBottom: 16 }}>
              Próxima Ação
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 6 }}>Ação</label>
                <input
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="Ex: Ligar para cliente"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '10px 12px',
                    background: '#181824', border: '1px solid #3a3a4e',
                    borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8b8fa2', marginBottom: 6 }}>Data e Hora</label>
                <input
                  type="datetime-local"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '10px 12px',
                    background: '#181824', border: '1px solid #3a3a4e',
                    borderRadius: 8, color: '#f1f5f9', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setShowActionModal(false)}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '10px 16px', background: '#2a2a3e',
                    border: '1px solid #3a3a4e', borderRadius: 8,
                    color: '#f1f5f9', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAction}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '10px 16px', background: '#1d4ed8',
                    border: 'none', borderRadius: 8,
                    color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EditLeadProfileModal */}
      {showEditProfile && lead?.id && (
        <EditLeadProfileModal
          leadId={lead.id}
          companyId={companyId}
          profile={leadProfile}
          onClose={() => setShowEditProfile(false)}
          onSave={() => {
            router.refresh()
          }}
        />
      )}

      {/* ── Quick action modal (WhatsApp / Copiar telefone) ── */}
      <QuickActionModal
        isOpen={showQuickActionModal}
        leadName={lead?.name || 'Lead'}
        currentStatus={cycle.status}
        onClose={() => setShowQuickActionModal(false)}
        onSave={async (actionType, detail) => {
          setQuickActionLoading(true)
          try {
            const supabase = supabaseBrowser()
            const { data: { user } } = await supabase.auth.getUser()
            const userId = user?.id ?? ''
            const suggested = await logQuickAction(supabase, companyId, cycle.id, userId, actionType, detail, contactBannerChannel)
            setShowQuickActionModal(false)
            setToastMessage(QUICK_ACTION_TOAST_LABELS[actionType] ?? 'Contato registrado')
            if (suggested && suggested !== cycle.status) {
              setSuggestedStatus(suggested)
            }
            router.refresh()
          } catch (err: any) {
            setToastError(`Erro: ${err?.message ?? String(err)}`)
          } finally {
            setQuickActionLoading(false)
          }
        }}
        isLoading={quickActionLoading}
      />

      {/* ── Non-blocking contact registration banner ─────────────────────────── */}
      {showContactBanner && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 600,
          background: '#1e1e2e', border: '1px solid #2a2a3e',
          borderRadius: 14, padding: '16px 20px', maxWidth: 320,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                {contactBannerChannel === 'whatsapp'
                  ? <><IconWhatsApp size={14} /> WhatsApp aberto</>
                  : <><IconClipboard size={14} /> Telefone copiado</>}
              </div>
              <div style={{ fontSize: 12, color: '#8b8fa2' }}>
                Deseja registrar este contato?
              </div>
            </div>
            <button
              onClick={() => setShowContactBanner(false)}
              style={{
                background: 'none', border: 'none', color: '#4b5563',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                flexShrink: 0, display: 'flex', alignItems: 'center',
              }}
              aria-label="Fechar"
            >
              <IconX size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setShowContactBanner(false)
                setShowQuickActionModal(true)
              }}
              style={{
                flex: 1, padding: '8px 12px',
                background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)',
                borderRadius: 8, color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Sim, registrar
            </button>
            <button
              onClick={() => setShowContactBanner(false)}
              style={{
                flex: 1, padding: '8px 12px',
                background: '#2a2a3e', border: '1px solid #3a3a4e',
                borderRadius: 8, color: '#8b8fa2', fontSize: 12, cursor: 'pointer',
              }}
            >
              Agora não
            </button>
          </div>
        </div>
      )}

      {/* ── Toast confirmation after quick action ── */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 88, right: 28, zIndex: 700,
          background: '#065f46', border: '1px solid #059669',
          borderRadius: 10, padding: '12px 18px',
          color: '#a7f3d0', fontSize: 13, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <IconCircleCheck size={16} color="#a7f3d0" /> {toastMessage}
        </div>
      )}

      {/* ── Error toast (replaces alert) ── */}
      {toastError && (
        <div style={{
          position: 'fixed', bottom: 148, right: 28, zIndex: 800,
          background: '#450a0a', border: '1px solid #ef4444',
          borderRadius: 10, padding: '12px 18px',
          color: '#fca5a5', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: 10,
          maxWidth: 340,
        }}>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{toastError}</span>
          <button
            onClick={() => setToastError(null)}
            style={{
              background: 'none', border: 'none', color: '#f87171',
              cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
              flexShrink: 0,
            }}
            aria-label="Fechar"
          >
            <IconX size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
