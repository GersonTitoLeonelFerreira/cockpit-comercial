'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import { STAGE_LABELS, resolveActionId, resolveCheckpointData } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'

// ============================================================================
// Helpers
// ============================================================================

function getThirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function safePct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0
}

// ============================================================================
// Types
// ============================================================================

interface SellerOption {
  id: string
  full_name: string | null
}

interface RawEvent {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

interface ObjectionStat {
  text: string
  total: number
  byStage: Record<string, number>
}

interface LossStat {
  reason: string
  total: number
  byStage: Record<string, number>
}

interface ReportData {
  objections: ObjectionStat[]
  losses: LossStat[]
  totalLost: number
  totalWon: number
  totalObjectionEvents: number
}

type ViewType = 'both' | 'objections' | 'losses'

// ============================================================================
// Constants
// ============================================================================

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const STAGE_COLORS: Record<string, string> = {
  novo: '#60a5fa',
  contato: '#a78bfa',
  respondeu: '#34d399',
  negociacao: '#fbbf24',
}

const OBJECTION_ACTION_ID = 'negociacao_objecao_registrada'

// ============================================================================
// Core analytics
// ============================================================================

function buildReportData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
  stageFilter: string,
): ReportData {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  const objectionMap = new Map<string, { total: number; byStage: Record<string, number> }>()
  const lossMap = new Map<string, { total: number; byStage: Record<string, number> }>()
  let totalLost = 0
  let totalWon = 0

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Seller filter (in-memory)
    if (isAdmin && selectedSellerId) {
      if (ev.created_by !== selectedSellerId) continue
    } else if (!isAdmin && currentUserId) {
      if (ev.created_by !== currentUserId) continue
    }

    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const kind = classifyEvent(ev)
    // Resolve checkpoint data — supports both storage formats:
    //   Format 1: { checkpoint: { action_result, ... } }
    //   Format 2: { metadata: { action_result, ... }, from_status, to_status }
    const cp = resolveCheckpointData(meta)

    if (kind === 'won') {
      const stage = String(meta.from_status ?? meta.from_stage ?? meta.stage ?? '').toLowerCase() || 'negociacao'
      if (stageFilter && stage !== stageFilter) continue
      totalWon++
      continue
    }

    if (kind === 'lost') {
      // Stage where the cycle was when closed (check from_status, from_stage, then stage)
      const stage = String(meta.from_status ?? meta.from_stage ?? meta.stage ?? '').toLowerCase() || 'negociacao'
      if (stageFilter && stage !== stageFilter) continue

      totalLost++

      const reason = String(
        meta.reason ?? cp.reason ?? meta.loss_reason ??
        cp.lost_reason ?? cp.loss_reason ?? cp.note ??
        meta.detail ?? meta.details ?? cp.details ?? ''
      ).trim() || 'Sem motivo registrado'

      const existing = lossMap.get(reason) ?? { total: 0, byStage: {} }
      existing.total++
      existing.byStage[stage] = (existing.byStage[stage] ?? 0) + 1
      lossMap.set(reason, existing)
      continue
    }

    // Objection detection — three paths:
    // 1. metadata.action_id resolves to OBJECTION_ACTION_ID via resolveActionId()
    // 2. metadata.objection field is non-empty
    // 3. checkpoint.action_result === "Objeção identificada" (stage_changed/stage_checkpoint events)
    const rawId = String(meta.action_id ?? meta.quick_action ?? ev.event_type ?? '').trim()
    const resolvedId = rawId ? resolveActionId(rawId) : ''
    const hasObjectionField = typeof meta.objection === 'string' && meta.objection.trim().length > 0
    const hasCheckpointObjection = cp.action_result === 'Objeção identificada'

    if (resolvedId !== OBJECTION_ACTION_ID && !hasObjectionField && !hasCheckpointObjection) continue

    // Stage where the objection was registered. `to_status` is preferred because
    // checkpoint-based objections come from stage_changed events where the objection
    // was recorded at the destination stage. Falls back to from_status / stage for
    // quick_action events that lack to_status in their metadata.
    const stage = String(meta.to_status ?? meta.from_status ?? meta.from_stage ?? meta.stage ?? '').toLowerCase() || 'negociacao'
    if (stageFilter && stage !== stageFilter) continue

    const text = String(
      cp.result_detail ?? meta.result_detail ?? meta.objection ?? meta.detail ?? meta.details ?? ''
    ).trim() || 'Sem detalhe registrado'

    const existing = objectionMap.get(text) ?? { total: 0, byStage: {} }
    existing.total++
    existing.byStage[stage] = (existing.byStage[stage] ?? 0) + 1
    objectionMap.set(text, existing)
  }

  const objections: ObjectionStat[] = []
  for (const [text, val] of objectionMap.entries()) {
    objections.push({ text, total: val.total, byStage: val.byStage })
  }
  objections.sort((a, b) => b.total - a.total)

  const losses: LossStat[] = []
  for (const [reason, val] of lossMap.entries()) {
    losses.push({ reason, total: val.total, byStage: val.byStage })
  }
  losses.sort((a, b) => b.total - a.total)

  const totalObjectionEvents = objections.reduce((s, o) => s + o.total, 0)

  return { objections, losses, totalLost, totalWon, totalObjectionEvents }
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconAlertCircle() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconCircleX() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconPercent() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 5 5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLoader() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="#333" strokeWidth="2" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#888" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconTrendDown() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M23 18l-9.5-9.5-5 5L1 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 18h6v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function SummaryCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: string
  icon?: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '1 1 180px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' }}>
          {label}
        </span>
        {icon && <span style={{ color: accent ?? '#444' }}>{icon}</span>}
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: accent ?? 'white',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{sub}</span>}
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const fill = max > 0 ? (value / max) * 100 : 0
  return (
    <div
      style={{
        flex: '1 1 0',
        height: 4,
        background: '#1e1e1e',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${fill}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function StageDots({ byStage }: { byStage: Record<string, number> }) {
  const entries = STAGE_ORDER.filter(s => byStage[s] > 0)
  if (entries.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {entries.map((stage) => (
        <div
          key={stage}
          title={`${STAGE_LABELS[stage] ?? stage}: ${byStage[stage]}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: STAGE_COLORS[stage] ?? '#555',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 10, color: '#555' }}>{byStage[stage]}</span>
        </div>
      ))}
    </div>
  )
}

function ObjectionRow({ stat, maxTotal }: { stat: ObjectionStat; maxTotal: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid #181818',
      }}
    >
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'white',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stat.text}
        </span>
      </div>
      <StageDots byStage={stat.byStage} />
      <ProgressBar value={stat.total} max={maxTotal} color="#fb923c" />
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#fb923c',
          flexShrink: 0,
          minWidth: 24,
          textAlign: 'right',
        }}
      >
        {stat.total}
      </span>
    </div>
  )
}

function LossRow({ stat, maxTotal }: { stat: LossStat; maxTotal: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid #181818',
      }}
    >
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'white',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stat.reason}
        </span>
      </div>
      <StageDots byStage={stat.byStage} />
      <ProgressBar value={stat.total} max={maxTotal} color="#f87171" />
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#f87171',
          flexShrink: 0,
          minWidth: 24,
          textAlign: 'right',
        }}
      >
        {stat.total}
      </span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '28px 20px',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>{message}</p>
      <p style={{ color: '#444', fontSize: 12, margin: '6px 0 0' }}>
        Tente ampliar o intervalo de datas ou remover filtros.
      </p>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function ObjecoesEPerdasPage() {
  const supabase = supabaseBrowser()

  // Auth/profile
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters
  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)
  const [selectedStage, setSelectedStage] = React.useState('')
  const [viewType, setViewType] = React.useState<ViewType>('both')

  // Data
  const [reportData, setReportData] = React.useState<ReportData>({
    objections: [],
    losses: [],
    totalLost: 0,
    totalWon: 0,
    totalObjectionEvents: 0,
  })
  const [dataLoading, setDataLoading] = React.useState(false)

  // ==========================================================================
  // Init — auth + profile
  // ==========================================================================
  React.useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Sessão expirada. Faça login novamente.')

        const uid = userData.user.id
        setCurrentUserId(uid)

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, company_id')
          .eq('id', uid)
          .maybeSingle()

        if (!profile?.company_id) throw new Error('Perfil não encontrado.')

        const adminUser = profile.role === 'admin'
        setIsAdmin(adminUser)
        setCompanyId(profile.company_id)

        if (adminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

          setSellers((sellersData ?? []) as SellerOption[])
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar.')
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ==========================================================================
  // Load data
  // ==========================================================================
  React.useEffect(() => {
    if (!companyId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateStart, dateEnd, selectedSellerId, selectedStage, isAdmin, currentUserId])

  async function loadData() {
    if (!companyId) return
    setDataLoading(true)
    try {
      const data = await fetchAllCycleEvents(supabase, {
        companyId,
        dateStart,
        dateEnd,
        columns: 'id, cycle_id, event_type, metadata, occurred_at, created_by',
      })

      const result = buildReportData(
        (data ?? []) as RawEvent[],
        dateStart,
        dateEnd,
        selectedSellerId,
        isAdmin,
        currentUserId,
        selectedStage,
      )
      setReportData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ==========================================================================
  // Derived values
  // ==========================================================================

  const { objections, losses, totalLost, totalWon, totalObjectionEvents } = reportData
  const totalClosed = totalLost + totalWon
  const lossRate = safePct(totalLost, totalClosed)

  const topObjection = objections.length > 0 ? objections[0] : null
  const topLoss = losses.length > 0 ? losses[0] : null

  // Aggregate all losses by stage across all reasons, then find the top stage
  const lossByStage: Record<string, number> = {}
  for (const l of losses) {
    for (const [stage, count] of Object.entries(l.byStage)) {
      lossByStage[stage] = (lossByStage[stage] ?? 0) + count
    }
  }
  const topLossStage = Object.keys(lossByStage).length > 0
    ? Object.entries(lossByStage).reduce<{ stage: string; count: number }>(
        (best, [stage, count]) => count > best.count ? { stage, count } : best,
        { stage: '', count: 0 }
      )
    : null

  const maxObjectionTotal = objections.length > 0 ? objections[0].total : 1
  const maxLossTotal = losses.length > 0 ? losses[0].total : 1

  const filteredObjections = viewType === 'losses' ? [] : objections
  const filteredLosses = viewType === 'objections' ? [] : losses

  // ==========================================================================
  // Loading / Error states
  // ==========================================================================
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0c0c0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#666', fontSize: 14 }}>
          <IconLoader />
          Carregando...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0c0c0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#0f0f0f',
            border: '1px solid #333',
            borderRadius: 12,
            padding: '24px 32px',
            maxWidth: 420,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#ef4444', fontSize: 14, margin: 0 }}>{error}</p>
          <a
            href="/login"
            style={{
              display: 'inline-block',
              marginTop: 16,
              fontSize: 13,
              color: '#60a5fa',
              textDecoration: 'none',
            }}
          >
            Ir para o login
          </a>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0c0c0c',
        color: 'white',
        padding: '40px 24px 80px',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 28 }}>
          <a
            href="/relatorios"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: '#555',
              textDecoration: 'none',
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#aaa')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#555')}
          >
            <IconChevronLeft />
            Voltar para Relatórios
          </a>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ color: '#fb923c' }}>
              <IconAlertCircle />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Objeções e Perdas
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Por que os leads estão travando, recuando ou sendo perdidos no funil
          </p>
        </div>

        {/* Sub-navigation */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            marginBottom: 32,
            borderBottom: '1px solid #1a1a1a',
            paddingBottom: 0,
          }}
        >
          {[
            { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa', active: false, comingSoon: false },
            { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao', active: false, comingSoon: false },
            { label: 'Objeções e Perdas', href: null, active: true, comingSoon: false },
            { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes', active: false, comingSoon: false },
            { label: 'Canais', href: '/relatorios/operacao/canais', active: false, comingSoon: false },
            { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor', active: false, comingSoon: false },
          ].map((tab) => {
            if (tab.active) {
              return (
                <button
                  key={tab.label}
                  disabled
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: '2px solid #fb923c',
                    cursor: 'default',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fb923c',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              )
            }
            if (tab.href) {
              return (
                <a
                  key={tab.label}
                  href={tab.href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderBottom: '2px solid transparent',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 400,
                    color: '#555',
                    textDecoration: 'none',
                    marginBottom: -1,
                    transition: 'color 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#aaa')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#555')}
                >
                  {tab.label}
                </a>
              )
            }
            return (
              <button
                key={tab.label}
                disabled
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '2px solid transparent',
                  cursor: 'not-allowed',
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#444',
                  marginBottom: -1,
                }}
              >
                {tab.label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#333',
                    background: '#151515',
                    border: '1px solid #222',
                    borderRadius: 3,
                    padding: '1px 5px',
                  }}
                >
                  em breve
                </span>
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 32,
            padding: '16px 20px',
            background: '#0f0f0f',
            border: '1px solid #1e1e1e',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              De
            </label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              Até
            </label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>

          {isAdmin && sellers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
                Consultor
              </label>
              <select
                value={selectedSellerId ?? ''}
                onChange={(e) => setSelectedSellerId(e.target.value || null)}
                style={{
                  background: '#151515',
                  border: '1px solid #2a2a2a',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 13,
                  padding: '6px 10px',
                  outline: 'none',
                  minWidth: 180,
                }}
              >
                <option value="">Todos os consultores</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? s.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              Etapa
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                minWidth: 150,
              }}
            >
              <option value="">Todas as etapas</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              Tipo
            </label>
            <select
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                minWidth: 150,
              }}
            >
              <option value="both">Objeções e Perdas</option>
              <option value="objections">Só Objeções</option>
              <option value="losses">Só Perdas</option>
            </select>
          </div>

          {dataLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 12 }}>
              <IconLoader />
              Atualizando...
            </div>
          )}
        </div>

        {/* Executive Summary — 5 cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
          <SummaryCard
            label="Objeção mais frequente"
            value={topObjection ? topObjection.text : '—'}
            sub={topObjection ? `${topObjection.total}× registrada` : 'sem dados'}
            accent="#fb923c"
            icon={<IconAlertCircle />}
          />
          <SummaryCard
            label="Motivo de perda mais frequente"
            value={topLoss ? topLoss.reason : '—'}
            sub={topLoss ? `${topLoss.total}× registrado` : 'sem dados'}
            accent="#f87171"
            icon={<IconCircleX />}
          />
          <SummaryCard
            label="Etapa com mais perdas"
            value={topLossStage ? (STAGE_LABELS[topLossStage.stage] ?? topLossStage.stage) : '—'}
            sub={topLossStage ? `${topLossStage.count} ocorrência(s)` : 'sem dados'}
            accent={topLossStage ? (STAGE_COLORS[topLossStage.stage] ?? '#555') : undefined}
            icon={<IconLayers />}
          />
          <SummaryCard
            label="Total de perdas no período"
            value={totalLost > 0 ? `${totalLost}` : '—'}
            sub={totalLost > 0 ? `de ${totalClosed} ciclos fechados` : 'sem dados'}
            accent="#f87171"
            icon={<IconTrendDown />}
          />
          <SummaryCard
            label="Taxa de perda"
            value={totalClosed > 0 ? `${lossRate}%` : '—'}
            sub={totalClosed > 0 ? `${totalLost} perdas / ${totalClosed} fechamentos` : 'sem dados'}
            accent={lossRate > 50 ? '#f87171' : lossRate > 25 ? '#fbbf24' : '#34d399'}
            icon={<IconPercent />}
          />
        </div>

        {/* Objections Section */}
        {viewType !== 'losses' && (
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1e1e1e',
              borderRadius: 14,
              padding: '20px 24px',
              marginBottom: 20,
            }}
          >
            {/* Section header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                paddingBottom: 14,
                borderBottom: '1px solid #1a1a1a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#fb923c' }}>
                  <IconAlertCircle />
                </span>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'white' }}>
                    Objeções
                  </h2>
                  <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>
                    Resistências registradas durante o ciclo, antes da decisão final
                  </p>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
                {totalObjectionEvents}{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>ocorrência(s)</span>
              </span>
            </div>

            {/* Column headers */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 0 6px',
                borderBottom: '1px solid #161616',
                marginBottom: 2,
              }}
            >
              <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
                Objeção
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, width: 60 }}>
                Etapas
              </span>
              <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
                Volume
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
                Qtd
              </span>
            </div>

            {filteredObjections.length > 0 ? (
              filteredObjections.map((stat) => (
                <ObjectionRow key={stat.text} stat={stat} maxTotal={maxObjectionTotal} />
              ))
            ) : (
              <EmptyState message="Nenhuma objeção registrada no período." />
            )}
          </div>
        )}

        {/* Losses Section */}
        {viewType !== 'objections' && (
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1e1e1e',
              borderRadius: 14,
              padding: '20px 24px',
              marginBottom: 20,
            }}
          >
            {/* Section header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                paddingBottom: 14,
                borderBottom: '1px solid #1a1a1a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#f87171' }}>
                  <IconCircleX />
                </span>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'white' }}>
                    Perdas
                  </h2>
                  <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>
                    Encerramentos negativos do ciclo — decisão final registrada como perda
                  </p>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
                {totalLost}{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>perda(s)</span>
              </span>
            </div>

            {/* Column headers */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 0 6px',
                borderBottom: '1px solid #161616',
                marginBottom: 2,
              }}
            >
              <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
                Motivo
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, width: 60 }}>
                Etapas
              </span>
              <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
                Volume
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
                Qtd
              </span>
            </div>

            {filteredLosses.length > 0 ? (
              filteredLosses.map((stat) => (
                <LossRow key={stat.reason} stat={stat} maxTotal={maxLossTotal} />
              ))
            ) : (
              <EmptyState message="Nenhuma perda registrada no período." />
            )}
          </div>
        )}

        {/* Legend */}
        <div
          style={{
            marginTop: 8,
            padding: '14px 20px',
            background: '#0a0a0a',
            border: '1px solid #161616',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Legenda de etapas
          </span>
          {STAGE_ORDER.map((stage) => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: STAGE_COLORS[stage],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: '#555' }}>{STAGE_LABELS[stage]}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 4, borderRadius: 2, background: '#fb923c' }} />
              <span style={{ fontSize: 11, color: '#555' }}>Objeção</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 4, borderRadius: 2, background: '#f87171' }} />
              <span style={{ fontSize: 11, color: '#555' }}>Perda</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
