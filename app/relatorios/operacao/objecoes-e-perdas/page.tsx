'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { STAGE_LABELS, resolveActionId } from '@/app/config/stageActions'
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
  label: string
  count: number
  pct: number
}

interface LossStat {
  reason: string
  count: number
  pct: number
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

// ============================================================================
// Core analytics: build ReportData from raw events
// ============================================================================

function buildReportData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
  selectedStage: string,
): ReportData {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  const objectionCounts: Record<string, number> = {}
  const lossCounts: Record<string, number> = {}
  let totalLost = 0
  let totalWon = 0
  let totalObjectionEvents = 0

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Apply consultant filter in-memory
    if (isAdmin && selectedSellerId) {
      if (ev.created_by !== selectedSellerId) continue
    } else if (!isAdmin && currentUserId) {
      if (ev.created_by !== currentUserId) continue
    }

    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const kind = classifyEvent(ev)

    // ── Won / Lost counts ────────────────────────────────────────────────
    if (kind === 'won') {
      totalWon++
      continue
    }

    if (kind === 'lost') {
      totalLost++
      const reason = String(meta.reason ?? meta.details ?? '').trim() || 'Sem motivo registrado'
      lossCounts[reason] = (lossCounts[reason] ?? 0) + 1
      continue
    }

    // ── Objections ────────────────────────────────────────────────────────
    // Case 1: action_id resolves to negociacao_objecao_registrada
    const rawActionId = (meta.action_id ?? meta.quick_action ?? '') as string
    const resolvedId = rawActionId ? resolveActionId(rawActionId) : ''
    const isObjectionAction = resolvedId === 'negociacao_objecao_registrada'

    // Case 2: metadata.objection field present
    const objectionText = String(meta.objection ?? '').trim()
    const hasObjField = objectionText.length > 0

    if (!isObjectionAction && !hasObjField) continue

    // Apply stage filter for objections (negociacao is the natural stage)
    if (selectedStage && selectedStage !== 'negociacao') continue

    totalObjectionEvents++

    // Determine the objection label
    let label: string
    if (hasObjField) {
      label = objectionText
    } else {
      // Action is negociacao_objecao_registrada but no free-text
      label = String(meta.details ?? meta.reason ?? '').trim() || 'Objeção sem descrição'
    }

    objectionCounts[label] = (objectionCounts[label] ?? 0) + 1
  }

  // Sort by count desc and compute percentages
  const sortedObjections = Object.entries(objectionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      pct: safePct(count, totalObjectionEvents),
    }))

  const sortedLosses = Object.entries(lossCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      pct: safePct(count, totalLost),
    }))

  return {
    objections: sortedObjections,
    losses: sortedLosses,
    totalLost,
    totalWon,
    totalObjectionEvents,
  }
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconMessageSquare() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconAlertTriangle() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function IconBarChart2() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function FrequencyBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        width: 60,
        height: 4,
        background: '#1e1e1e',
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function ObjectionRow({ stat, rank }: { stat: ObjectionStat; rank: number }) {
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
      <span style={{ fontSize: 11, color: '#444', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
        {rank}
      </span>
      <span
        style={{
          flex: '1 1 0',
          fontSize: 13,
          color: 'white',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {stat.label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
        {stat.count}
      </span>
      <span style={{ fontSize: 11, color: '#555', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
        {stat.pct}%
      </span>
      <FrequencyBar value={stat.pct} color="#fbbf24" />
    </div>
  )
}

function LossRow({ stat, rank }: { stat: LossStat; rank: number }) {
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
      <span style={{ fontSize: 11, color: '#444', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
        {rank}
      </span>
      <span
        style={{
          flex: '1 1 0',
          fontSize: 13,
          color: 'white',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {stat.reason}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
        {stat.count}
      </span>
      <span style={{ fontSize: 11, color: '#555', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
        {stat.pct}%
      </span>
      <FrequencyBar value={stat.pct} color="#f87171" />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '40px 24px',
        textAlign: 'center',
        color: '#444',
        fontSize: 13,
      }}
    >
      {message}
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
      const { data, error: fetchError } = await supabase
        .from('cycle_events')
        .select('id, cycle_id, event_type, metadata, occurred_at, created_by')
        .eq('company_id', companyId)
        .gte('occurred_at', `${dateStart}T00:00:00`)
        .lte('occurred_at', `${dateEnd}T23:59:59`)
        .order('occurred_at', { ascending: true })

      if (fetchError) throw fetchError

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
  const topObjection = reportData.objections[0] ?? null
  const topLossReason = reportData.losses[0] ?? null
  const lossRate = safePct(reportData.totalLost, reportData.totalWon + reportData.totalLost)

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
            <span style={{ color: '#f87171' }}>
              <IconMessageSquare />
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
            { label: 'Próximas Ações', href: null, active: false, comingSoon: true },
            { label: 'Canais', href: null, active: false, comingSoon: true },
            { label: 'Desempenho por Consultor', href: null, active: false, comingSoon: true },
          ].map((tab) => {
            if (tab.active) {
              return (
                <button
                  key={tab.label}
                  disabled
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: '2px solid #f87171',
                    cursor: 'default',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#f87171',
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
            label="Total de objeções"
            value={reportData.totalObjectionEvents}
            sub="no período selecionado"
            accent="#fbbf24"
            icon={<IconAlertTriangle />}
          />
          <SummaryCard
            label="Total de perdas"
            value={reportData.totalLost}
            sub="fechamentos negativos"
            accent="#f87171"
            icon={<IconCircleX />}
          />
          <SummaryCard
            label="Objeção mais frequente"
            value={topObjection ? topObjection.label : '—'}
            sub={topObjection ? `${topObjection.count}× registrada` : 'sem dados'}
            accent="#fbbf24"
            icon={<IconMessageSquare />}
          />
          <SummaryCard
            label="Motivo de perda principal"
            value={topLossReason ? topLossReason.reason : '—'}
            sub={topLossReason ? `${topLossReason.count}× registrado` : 'sem dados'}
            accent="#f87171"
            icon={<IconCircleX />}
          />
          <SummaryCard
            label="Taxa de perda"
            value={`${lossRate}%`}
            sub={`${reportData.totalWon} ganhos · ${reportData.totalLost} perdas`}
            accent={lossRate > 50 ? '#f87171' : lossRate > 30 ? '#fbbf24' : '#34d399'}
            icon={<IconBarChart2 />}
          />
        </div>

        {/* View toggle */}
        <div
          style={{
            display: 'flex',
            background: '#0f0f0f',
            border: '1px solid #1e1e1e',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 24,
            width: 'fit-content',
          }}
        >
          {([
            { key: 'both' as ViewType, label: 'Ambos' },
            { key: 'objections' as ViewType, label: 'Objeções' },
            { key: 'losses' as ViewType, label: 'Perdas' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewType(key)}
              style={{
                background: viewType === key ? '#1e1e1e' : 'none',
                border: 'none',
                color: viewType === key ? 'white' : '#555',
                fontSize: 13,
                fontWeight: viewType === key ? 600 : 400,
                padding: '7px 18px',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Objections section */}
          {(viewType === 'both' || viewType === 'objections') && (
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #1e1e1e',
                borderRadius: 14,
                padding: '20px 24px',
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
                  <span style={{ color: '#fbbf24' }}><IconAlertTriangle /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>Objeções</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
                  {reportData.totalObjectionEvents}{' '}
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>registradas</span>
                </span>
              </div>

              {reportData.objections.length === 0 ? (
                <EmptyState message="Nenhuma objeção registrada no período selecionado." />
              ) : (
                <>
                  {/* Column headers */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 0 8px',
                      borderBottom: '1px solid #161616',
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ minWidth: 20, flexShrink: 0 }} />
                    <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
                      Objeção
                    </span>
                    <span style={{ minWidth: 28, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#fbbf24', textAlign: 'right' }}>
                      Qtd
                    </span>
                    <span style={{ minWidth: 36, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', textAlign: 'right' }}>
                      Freq
                    </span>
                    <span style={{ width: 60, flexShrink: 0 }} />
                  </div>

                  {/* Rows */}
                  <div>
                    {reportData.objections.map((stat, idx) => (
                      <ObjectionRow key={stat.label} stat={stat} rank={idx + 1} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Losses section */}
          {(viewType === 'both' || viewType === 'losses') && (
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #1e1e1e',
                borderRadius: 14,
                padding: '20px 24px',
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
                  <span style={{ color: '#f87171' }}><IconCircleX /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>Perdas</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
                  {reportData.totalLost}{' '}
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>no período</span>
                </span>
              </div>

              {reportData.losses.length === 0 ? (
                <EmptyState message="Nenhuma perda registrada no período selecionado." />
              ) : (
                <>
                  {/* Column headers */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 0 8px',
                      borderBottom: '1px solid #161616',
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ minWidth: 20, flexShrink: 0 }} />
                    <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
                      Motivo de perda
                    </span>
                    <span style={{ minWidth: 28, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#f87171', textAlign: 'right' }}>
                      Qtd
                    </span>
                    <span style={{ minWidth: 36, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', textAlign: 'right' }}>
                      Freq
                    </span>
                    <span style={{ width: 60, flexShrink: 0 }} />
                  </div>

                  {/* Rows */}
                  <div>
                    {reportData.losses.map((stat, idx) => (
                      <LossRow key={stat.reason} stat={stat} rank={idx + 1} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  )
}
