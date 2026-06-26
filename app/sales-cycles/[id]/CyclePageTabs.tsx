'use client'

// ---------------------------------------------------------------------------
// CyclePageTabs — Client component managing the 4 operational tabs for a
// sales cycle detail page.
// ---------------------------------------------------------------------------

import * as React from 'react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import CycleOperationalSummary from './CycleOperationalSummary'
import CycleContextAlerts from './CycleContextAlerts'
import CycleResumeContext from './CycleResumeContext'
import CycleSuggestedAction from './CycleSuggestedAction'
import EditLeadProfileModal from '@/app/leads/components/EditLeadProfileModal'
import LeadCopilotPanel from '@/app/components/leads/LeadCopilotPanel'
import { WinDealModal } from '@/app/components/leads/WinDealModal'
import { LostDealModal } from '@/app/components/leads/LostDealModal'
import { QuickActionModal, logQuickAction } from '@/app/components/leads/QuickActionModal'
import { resolveActionId, getActionLabel } from '@/app/config/stageActions'
import { setNextAction } from '@/app/lib/services/sales-cycles'
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
  whatsappLink,
  getEventTitle,
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
  novo: '#1685ff',
  contato: '#06d6e8',
  respondeu: '#f5c400',
  negociacao: '#a855f7',
  pausado: '#f5c400',
  cancelado: '#6b7280',
  ganho: '#00e889',
  perdido: '#ff4d5e',
}

const STATUS_STAGE_ACTION_META: Record<
  LeadStatus,
  { index: string; label: string; actionLabel: string }
> = {
  novo: { index: '01', label: 'Novo', actionLabel: 'IA' },
  contato: { index: '02', label: 'Contato', actionLabel: 'IA' },
  respondeu: { index: '03', label: 'Agenda', actionLabel: 'IA' },
  negociacao: { index: '04', label: 'Negociação', actionLabel: 'IA' },
  pausado: { index: '--', label: 'Pausado', actionLabel: 'IA' },
  cancelado: { index: '--', label: 'Cancelado', actionLabel: 'Bloqueado' },
  ganho: { index: '05', label: 'Ganho', actionLabel: 'Venda ganha' },
  perdido: { index: '06', label: 'Perdido', actionLabel: 'Venda perdida' },
}

interface CyclePageTabsProps {
  // O detalhe recebe o objeto expandido da oportunidade e do lead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cycle: any
  events: CycleEvent[]
  historyEvents?: CycleEvent[]
  // O perfil possui campos opcionais variáveis conforme o cadastro do lead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getQuickActionToastLabel(actionId: string): string {
  if (actionId === 'quick_closed_won') return 'Fechamento registrado'
  if (actionId === 'quick_closed_lost') return 'Perda registrada'
  const label = getActionLabel(resolveActionId(actionId))
  return `${label} registrado`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CyclePageTabs({
  cycle,
  events,
  historyEvents,
  leadProfile,
  companyId,
}: CyclePageTabsProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(false)

  // Modals
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showWinModal, setShowWinModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [aiMoveStatus, setAiMoveStatus] = useState<LeadStatus | null>(null)

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

  const timelineEvents = historyEvents ?? events
  const historyEntityLabel = historyEvents ? 'lead' : 'ciclo'
  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const openAIMove = (toStatus: LeadStatus) => {
    if (toStatus === cycle.status) return

    if (toStatus === 'ganho') {
      setShowWinModal(true)
      return
    }

    if (toStatus === 'perdido') {
      setShowLostModal(true)
      return
    }

    setAiMoveStatus(toStatus)
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
    } catch (error: unknown) {
      setToastError(`Erro ao salvar: ${getErrorMessage(error)}`)
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
    } catch (error: unknown) {
      setToastError(`Erro ao salvar: ${getErrorMessage(error)}`)
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
    <div
      style={{
        borderBottom: '1px solid #1a1d2e',
        marginBottom: 18,
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        paddingBottom: 1,
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 800,
              border: `1px solid ${active ? 'rgba(59,130,246,0.36)' : 'transparent'}`,
              borderBottom: active ? '1px solid rgba(59,130,246,0.50)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease, border 150ms ease',
              background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
              color: active ? '#bfdbfe' : '#8fa3bc',
              borderRadius: 10,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )

  // --------------------------------------------------------------------------
  // ABA 1 — Visão Geral
  // --------------------------------------------------------------------------

  const renderOverview = () => (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <div
            style={{
              background: '#111318',
              border: '1px solid #1a1d2e',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                color: '#3b82f6',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Contexto do ciclo
            </div>

            <CycleOperationalSummary events={events} ciclo={cycle} />
          </div>

          {cycle.status === 'ganho' && cycle.won_at && (
            <div
              style={{
                background: '#111318',
                border: '1px solid #1a1d2e',
                borderRadius: 16,
                padding: 16,
              }}
            >
              <WonCard cycle={cycle as Record<string, unknown>} />
            </div>
          )}

          <div
            style={{
              background: '#111318',
              border: '1px solid #1a1d2e',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    color: '#3b82f6',
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    marginBottom: 5,
                  }}
                >
                  Histórico recente
                </div>
                <div style={{ color: '#8fa3bc', fontSize: 12 }}>
                  Últimos registros relevantes do ciclo.
                </div>
              </div>

              <button
                onClick={() => setActiveTab('history')}
                style={{
                  background: 'rgba(59,130,246,0.10)',
                  border: '1px solid rgba(59,130,246,0.30)',
                  color: '#93c5fd',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 800,
                  borderRadius: 10,
                  padding: '8px 10px',
                  whiteSpace: 'nowrap',
                }}
              >
                Ver completo
              </button>
            </div>

            {events.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '22px 0',
                  color: '#546070',
                  border: '1px dashed #1a1d2e',
                  borderRadius: 14,
                  background: '#0d0f14',
                }}
              >
                <div style={{ marginBottom: 8, opacity: 0.6, display: 'flex', justifyContent: 'center' }}>
                  <IconHistory size={22} />
                </div>
                <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                  Nenhum evento registrado ainda.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {events.slice(0, 4).map((event) => {
                  const cls = classifyEvent(event)
                  const dotColor = EVENT_CLASS_DOT_COLOR[cls]

                  return (
                    <div
                      key={event.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '10px minmax(0, 1fr)',
                        gap: 10,
                        alignItems: 'start',
                      }}
                    >
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          marginTop: 9,
                          background: dotColor,
                          opacity: 0.85,
                        }}
                      />

                      <div
                        style={{
                          background: '#0d0f14',
                          borderRadius: 12,
                          border: '1px solid #1a1d2e',
                          padding: '11px 12px',
                          minWidth: 0,
                        }}
                      >
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

        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <CycleSuggestedAction
            events={events}
            cycle={cycle}
            onOpenWhatsApp={waLink ? () => {
              window.open(waLink, '_blank', 'noopener,noreferrer')
              setContactBannerChannel('whatsapp')
              setShowContactBanner(true)
            } : undefined}
            onRegisterContact={() => setShowQuickActionModal(true)}
            onUpdateNextAction={() => setShowActionModal(true)}
            onMoveStage={() => setActiveTab('actions')}
          />

          <CycleContextAlerts
            events={events}
            lead={{
              status: cycle.status as string,
              next_action: cycle.next_action as string | null,
              next_action_date: cycle.next_action_date as string | null,
            }}
          />

          <CycleResumeContext events={events} cycle={cycle} />

          <div
            style={{
              background: '#111318',
              border: '1px solid #1a1d2e',
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div
              style={{
                color: '#3b82f6',
                fontSize: 10,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 12,
              }}
            >
              Ações rápidas
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {waLink && (
                <button
                  onClick={() => {
                    window.open(waLink, '_blank', 'noopener,noreferrer')
                    setContactBannerChannel('whatsapp')
                    setShowContactBanner(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(34,197,94,0.09)',
                    border: '1px solid rgba(34,197,94,0.24)',
                    borderRadius: 10,
                    color: '#86efac',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <IconWhatsApp size={14} /> WhatsApp
                </button>
              )}

              {lead?.phone && (
                <button
                  onClick={copyPhone}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    padding: '9px 12px',
                    background: copiedPhone ? 'rgba(34,197,94,0.10)' : '#0d0f14',
                    border: copiedPhone ? '1px solid rgba(34,197,94,0.28)' : '1px solid #1a1d2e',
                    borderRadius: 10,
                    color: copiedPhone ? '#86efac' : '#8fa3bc',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'background 150ms ease, color 150ms ease, border 150ms ease',
                  }}
                >
                  {copiedPhone
                    ? <><IconCircleCheck size={14} /> Copiado</>
                    : <><IconClipboard size={14} /> Copiar telefone</>}
                </button>
              )}

              <button
                onClick={() => setActiveTab('lead-data')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px 12px',
                  background: '#0d0f14',
                  border: '1px solid #1a1d2e',
                  borderRadius: 10,
                  color: '#8fa3bc',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <IconPencil size={14} /> Editar dados
              </button>

              <button
                onClick={() => setActiveTab('actions')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px 12px',
                  background: '#0d0f14',
                  border: '1px solid #1a1d2e',
                  borderRadius: 10,
                  color: '#8fa3bc',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <IconArrowRightCircle size={14} /> Mover etapa
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
  // --------------------------------------------------------------------------
  // ABA 2 — Histórico
  // --------------------------------------------------------------------------

  const renderHistory = () => (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          background: '#111318',
          border: '1px solid #1a1d2e',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: timelineEvents.length > 0 ? 14 : 0,
          }}
        >
          <div>
            <div
              style={{
                color: '#3b82f6',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 5,
              }}
            >
              Histórico
            </div>
            <div style={{ color: '#8fa3bc', fontSize: 12, lineHeight: 1.5 }}>
            Linha do tempo completa das movimentações, contatos e registros do {historyEntityLabel}.
            </div>
          </div>

          <div
            style={{
              border: '1px solid #1a1d2e',
              background: '#0d0f14',
              borderRadius: 12,
              padding: '8px 10px',
              color: '#8fa3bc',
              fontSize: 12,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {timelineEvents.length} registro{timelineEvents.length === 1 ? '' : 's'}
          </div>
        </div>

        {timelineEvents.length > 0 && (
          <div
            style={{
              background: '#0d0f14',
              border: '1px solid #1a1d2e',
              borderRadius: 14,
              padding: '11px 12px',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: '#546070',
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 4,
                }}
              >
                Última movimentação
              </div>
              <div
                style={{
                  color: '#edf2f7',
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={getEventTitle(timelineEvents[0])}
              >
                {getEventTitle(timelineEvents[0])}
              </div>
            </div>

            <span style={{ color: '#546070', fontSize: 11, whiteSpace: 'nowrap' }}>
            {fmtDate(timelineEvents[0].occurred_at)}
            </span>
          </div>
        )}
      </div>

      {cycle.status === 'ganho' && cycle.won_at && (
        <div
          style={{
            background: '#111318',
            border: '1px solid #1a1d2e',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <WonCard cycle={cycle as Record<string, unknown>} />
        </div>
      )}

{timelineEvents.length === 0 && cycle.status !== 'ganho' ? (
        <div
          style={{
            background: '#111318',
            border: '1px dashed #1a1d2e',
            borderRadius: 16,
            padding: '42px 20px',
            textAlign: 'center',
            color: '#546070',
          }}
        >
          <div style={{ marginBottom: 12, opacity: 0.7, display: 'flex', justifyContent: 'center' }}>
            <IconHistory size={28} />
          </div>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            Nenhum evento registrado ainda.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: '#111318',
            border: '1px solid #1a1d2e',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
          {timelineEvents.map((event) => {
              const cls = classifyEvent(event)
              const dotColor = EVENT_CLASS_DOT_COLOR[cls]

              return (
                <div
                  key={event.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '14px minmax(0, 1fr)',
                    gap: 10,
                    alignItems: 'start',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      paddingTop: 13,
                    }}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: dotColor,
                        opacity: 0.9,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      background: '#0d0f14',
                      borderRadius: 12,
                      border: '1px solid #1a1d2e',
                      padding: '12px 13px',
                      minWidth: 0,
                    }}
                  >
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
        </div>
      )}
    </div>
  )

  // --------------------------------------------------------------------------
  // ABA 3 — Dados do Lead
  // --------------------------------------------------------------------------

  const renderLeadData = () => {
    const sectionStyle: React.CSSProperties = {
      background: '#111318',
      border: '1px solid #1a1d2e',
      borderRadius: 16,
      padding: 16,
    }

    const titleStyle: React.CSSProperties = {
      color: '#edf2f7',
      fontWeight: 900,
      fontSize: 12,
      margin: 0,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }

    const birthDateLabel = leadProfile?.birth_date
      ? new Date(`${leadProfile.birth_date}T00:00:00`).toLocaleDateString('pt-BR')
      : null

    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div
          style={{
            background: '#111318',
            border: '1px solid #1a1d2e',
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                color: '#3b82f6',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Cadastro do lead
            </div>
            <div style={{ color: '#edf2f7', fontSize: 16, fontWeight: 900 }}>
              Dados operacionais e cadastrais
            </div>
            <div style={{ color: '#8fa3bc', fontSize: 12, marginTop: 4 }}>
              Informações usadas para contato, identificação e atendimento.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setEditingLead(!editingLead)}
              style={{
                padding: '8px 11px',
                background: editingLead ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.10)',
                border: editingLead ? '1px solid rgba(239,68,68,0.28)' : '1px solid rgba(59,130,246,0.28)',
                borderRadius: 10,
                color: editingLead ? '#fca5a5' : '#93c5fd',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {editingLead ? 'Cancelar edição' : 'Editar básicos'}
            </button>

            <button
              onClick={() => setShowEditProfile(true)}
              style={{
                padding: '8px 11px',
                background: '#0d0f14',
                border: '1px solid #1a1d2e',
                borderRadius: 10,
                color: '#8fa3bc',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Cadastro completo
            </button>
          </div>
        </div>

        {editingLead ? (
          <div style={sectionStyle}>
            <h3 style={{ ...titleStyle, marginBottom: 12 }}>Dados básicos</h3>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 4 }}>Nome</label>
                <input
                  type="text"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  disabled={leadEditLoading}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#0d0f14',
                    border: '1px solid #1a1d2e',
                    borderRadius: 8,
                    color: '#edf2f7',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 4 }}>Telefone</label>
                <input
                  type="text"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  disabled={leadEditLoading}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#0d0f14',
                    border: '1px solid #1a1d2e',
                    borderRadius: 8,
                    color: '#edf2f7',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8fa3bc', marginBottom: 4 }}>Email</label>
                <input
                  type="email"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  disabled={leadEditLoading}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#0d0f14',
                    border: '1px solid #1a1d2e',
                    borderRadius: 8,
                    color: '#edf2f7',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={handleSaveLead}
                disabled={leadEditLoading}
                style={{
                  padding: '10px 16px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: leadEditLoading ? 0.5 : 1,
                }}
              >
                {leadEditLoading ? 'Salvando...' : 'Salvar informações básicas'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <div style={sectionStyle}>
            <h3 style={{ ...titleStyle, marginBottom: 12 }}>Dados básicos</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DataRow label="Nome" value={lead?.name} />
                <DataRow label="Tipo" value={leadProfile?.lead_type} />
                <DataRow label="Telefone principal" value={lead?.phone} />
                <DataRow label="Email principal" value={lead?.email || leadProfile?.email} />
                <DataRow label="Celular" value={leadProfile?.phone_mobile} />
                <DataRow label="Telefone residencial" value={leadProfile?.phone_residential} />
                <DataRow label="Telefone comercial" value={leadProfile?.phone_commercial} />
                <DataRow label="Razão social" value={leadProfile?.razao_social} />
              </div>
            </div>

            <div style={sectionStyle}>
              <h3 style={{ ...titleStyle, marginBottom: 16 }}>Documentos e perfil</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DataRow label="CPF" value={leadProfile?.cpf} />
                <DataRow label="CNPJ" value={leadProfile?.cnpj} />
                <DataRow label="RG" value={leadProfile?.rg} />
                <DataRow label="Órgão emissor" value={leadProfile?.rg_issuer} />
                <DataRow label="UF do RG" value={leadProfile?.rg_state} />
                <DataRow label="Data de nascimento" value={birthDateLabel} />
                <DataRow label="Sexo biológico" value={leadProfile?.biological_sex} />
                <DataRow label="Profissão" value={leadProfile?.profession} />
                <DataRow label="Escolaridade" value={leadProfile?.education_level} />
                <DataRow label="Estado civil" value={leadProfile?.marital_status} />
              </div>
            </div>

            <div style={sectionStyle}>
              <h3 style={{ ...titleStyle, marginBottom: 16 }}>Endereço</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DataRow label="CEP" value={leadProfile?.cep} />
                <DataRow label="Rua" value={leadProfile?.address_street} />
                <DataRow label="Número" value={leadProfile?.address_number} />
                <DataRow label="Complemento" value={leadProfile?.address_complement} />
                <DataRow label="Bairro" value={leadProfile?.address_neighborhood} />
                <DataRow label="Cidade" value={leadProfile?.address_city} />
                <DataRow label="Estado" value={leadProfile?.address_state} />
                <DataRow label="País" value={leadProfile?.address_country} />
              </div>
            </div>

            <div style={sectionStyle}>
              <h3 style={{ ...titleStyle, marginBottom: 16 }}>Contato de emergência</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DataRow label="Nome" value={leadProfile?.emergency_contact_name} />
                <DataRow label="Telefone" value={leadProfile?.emergency_contact_phone} />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // ABA 4 — Ações
  // --------------------------------------------------------------------------

  const renderActions = () => (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          background: '#111318',
          border: '1px solid #1a1d2e',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            color: '#3b82f6',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Ações do ciclo
        </div>

        <div style={{ color: '#edf2f7', fontSize: 16, fontWeight: 900 }}>
          Controle operacional
        </div>

        <div style={{ color: '#8fa3bc', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
          Movimente a etapa com IA, defina a próxima ação e execute contatos rápidos.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 0.8fr)',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            background: '#111318',
            border: '1px solid #1a1d2e',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  color: '#546070',
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 5,
                }}
              >
                Mover etapa
              </div>

              <div style={{ color: '#edf2f7', fontSize: 14, fontWeight: 900 }}>
                Atualizar estágio do ciclo
              </div>
            </div>

            <div
              style={{
                border: '1px solid #1a1d2e',
                background: '#0d0f14',
                color: '#8fa3bc',
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              Atual: {STATUS_STAGE_ACTION_META[cycle.status as LeadStatus]?.label ?? statusLabel(cycle.status as LeadStatus)}
            </div>
          </div>

          {isClosed && (
            <div
              style={{
                fontSize: 12,
                color: '#8fa3bc',
                marginBottom: 12,
                padding: '10px 12px',
                background: '#0d0f14',
                border: '1px solid #1a1d2e',
                borderRadius: 12,
                lineHeight: 1.45,
              }}
            >
              Ciclo fechado. A movimentação de etapa está desabilitada.
            </div>
          )}

<div
            style={{
              position: 'relative',
              display: 'grid',
              gap: 10,
              paddingLeft: 18,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 7,
                top: 12,
                bottom: 12,
                width: 1,
                background: '#1a1d2e',
              }}
            />

{STATUS_OPTIONS.map((status) => {
              const isActive = status === cycle.status
              const statusColor = STATUS_COLOR_MAP[status]
              const stageMeta = STATUS_STAGE_ACTION_META[status]
              const disabled = loading || isClosed || isActive

              return (
                <button
                  key={status}
                  onClick={() => openAIMove(status)}
                  disabled={disabled}
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 12px',
                    background: isActive ? `${statusColor}14` : '#0d0f14',
                    border: isActive ? `1px solid ${statusColor}` : '1px solid #1a1d2e',
                    borderLeft: `3px solid ${statusColor}`,
                    borderRadius: 12,
                    color: isActive ? '#edf2f7' : '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: loading || (isClosed && !isActive) ? 0.55 : 1,
                    textAlign: 'left',
                    transition: 'background 150ms ease, border 150ms ease, color 150ms ease',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: -22,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: isActive ? statusColor : '#0d0f14',
                      border: `2px solid ${statusColor}`,
                      boxShadow: isActive ? `0 0 0 4px ${statusColor}20` : 'none',
                    }}
                  />

                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span
                      style={{
                        color: statusColor,
                        fontSize: 10,
                        fontWeight: 900,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {stageMeta.index}
                    </span>

                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stageMeta.label}
                    </span>
                  </span>

                  <span
                    style={{
                      color: isActive ? statusColor : '#8fa3bc',
                      fontSize: 10,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isActive ? 'Atual' : stageMeta.actionLabel}
                  </span>
                </button>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              border: '1px solid #1a1d2e',
              borderRadius: 12,
              background: '#0d0f14',
              color: '#8fa3bc',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            Etapas abertas usam IA. Ganho e Perdido seguem os mesmos fluxos próprios do Kanban.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              background: '#111318',
              border: '1px solid #1a1d2e',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                color: '#546070',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Definir próxima ação
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: '#8fa3bc',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  Ação
                </label>

                <input
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="Ex: ligar para cliente"
                  disabled={loading || isClosed}
                  style={{
                    width: '100%',
                    padding: '10px 11px',
                    background: '#090b0f',
                    border: '1px solid #1a1d2e',
                    borderRadius: 10,
                    color: '#edf2f7',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    outline: 'none',
                    opacity: loading || isClosed ? 0.6 : 1,
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: '#8fa3bc',
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  Data e hora
                </label>

                <input
                  type="datetime-local"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  disabled={loading || isClosed}
                  style={{
                    width: '100%',
                    padding: '10px 11px',
                    background: '#090b0f',
                    border: '1px solid #1a1d2e',
                    borderRadius: 10,
                    color: '#edf2f7',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    outline: 'none',
                    opacity: loading || isClosed ? 0.6 : 1,
                  }}
                />
              </div>

              <button
                onClick={handleSaveAction}
                disabled={loading || isClosed}
                style={{
                  padding: '10px 14px',
                  background: '#2563eb',
                  border: '1px solid rgba(147,197,253,0.18)',
                  borderRadius: 10,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: loading || isClosed ? 'not-allowed' : 'pointer',
                  opacity: loading || isClosed ? 0.6 : 1,
                }}
              >
                {loading ? 'Salvando...' : 'Salvar ação'}
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#111318',
              border: '1px solid #1a1d2e',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div
              style={{
                color: '#546070',
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Ações rápidas
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {waLink && (
                <button
                  onClick={() => {
                    window.open(waLink, '_blank', 'noopener,noreferrer')
                    setContactBannerChannel('whatsapp')
                    setShowContactBanner(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    padding: '10px 12px',
                    background: 'rgba(34,197,94,0.09)',
                    border: '1px solid rgba(34,197,94,0.24)',
                    borderRadius: 10,
                    color: '#86efac',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  <IconWhatsApp size={14} /> WhatsApp
                </button>
              )}

              {lead?.phone && (
                <button
                  onClick={copyPhone}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    padding: '10px 12px',
                    background: copiedPhone ? 'rgba(34,197,94,0.10)' : '#0d0f14',
                    border: copiedPhone ? '1px solid rgba(34,197,94,0.28)' : '1px solid #1a1d2e',
                    borderRadius: 10,
                    color: copiedPhone ? '#86efac' : '#8fa3bc',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                    transition: 'background 150ms ease, border 150ms ease, color 150ms ease',
                  }}
                >
                  {copiedPhone
                    ? <><IconCircleCheck size={14} /> Copiado</>
                    : <><IconClipboard size={14} /> Copiar telefone</>}
                </button>
              )}

              <button
                onClick={() => setActiveTab('lead-data')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '10px 12px',
                  background: '#0d0f14',
                  border: '1px solid #1a1d2e',
                  borderRadius: 10,
                  color: '#8fa3bc',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                <IconPencil size={14} /> Editar dados
              </button>
            </div>
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
                openAIMove(target)
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

      {/* Movimento com IA — mesmo fluxo do Kanban */}
      {aiMoveStatus && (
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
              borderLeft: '1px solid #1a1d2e',
              boxShadow: '-12px 0 36px rgba(0,0,0,0.52)',
              overflowY: 'auto',
              padding: 16,
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: '#edf2f7' }}>
                Confirmar movimentação com IA
              </div>

              <button
                onClick={() => setAiMoveStatus(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8fa3bc',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ×
              </button>
            </div>

            <LeadCopilotPanel
              variant="compact"
              forcedInitialStatus={aiMoveStatus}
              cycle={cycle}
              onApplied={async () => {
                setAiMoveStatus(null)
                router.refresh()
              }}
              onRejected={async () => {
                setAiMoveStatus(null)
              }}
              onCancel={async () => {
                setAiMoveStatus(null)
              }}
              onTerminalApply={(status) => {
                setAiMoveStatus(null)

                if (status === 'ganho') {
                  setShowWinModal(true)
                  return
                }

                setShowLostModal(true)
              }}
            />
          </div>
        </div>
      )}

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
            setToastMessage(getQuickActionToastLabel(actionType))
            if (suggested && suggested !== cycle.status) {
              setSuggestedStatus(suggested)
            }
            router.refresh()
          } catch (error: unknown) {
            setToastError(`Erro: ${getErrorMessage(error)}`)
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
