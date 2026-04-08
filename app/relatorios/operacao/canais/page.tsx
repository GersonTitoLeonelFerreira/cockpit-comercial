'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import { STAGE_LABELS } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import {
  CANONICAL_CHANNELS,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  extractChannelFromEvent,
} from '@/app/config/channelNormalization'

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

interface ChannelStat {
  channel: string
  total: number
  advances: number
  advancePct: number
  byStage: Record<string, number>
}

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

// ============================================================================
// Core analytics
// ============================================================================

function buildChannelStats(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
  stageFilter: string,
): ChannelStat[] {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  const totalMap = new Map<string, number>()
  const advanceMap = new Map<string, number>()
  const stageMap = new Map<string, Record<string, number>>()

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Seller filter (in-memory)
    if (isAdmin && selectedSellerId) {
      if (ev.created_by !== selectedSellerId) continue
    } else if (!isAdmin && currentUserId) {
      if (ev.created_by !== currentUserId) continue
    }

    const meta = (ev.metadata ?? {}) as Record<string, unknown>

    // Stage filter
    const stage = String(
      meta.from_status ?? meta.from_stage ?? meta.stage ?? ''
    ).toLowerCase() || 'desconhecido'
    if (stageFilter && stage !== stageFilter) continue

    // Extract channel
    const channel = extractChannelFromEvent(meta)
    if (!channel) continue

    // Count total
    totalMap.set(channel, (totalMap.get(channel) ?? 0) + 1)

    // Count by stage
    if (!stageMap.has(channel)) stageMap.set(channel, {})
    const stageEntry = stageMap.get(channel)!
    stageEntry[stage] = (stageEntry[stage] ?? 0) + 1

    // Count advances (stage_move)
    const kind = classifyEvent(ev)
    if (kind === 'stage_move') {
      advanceMap.set(channel, (advanceMap.get(channel) ?? 0) + 1)
    }
  }

  return CANONICAL_CHANNELS.map((channel) => {
    const total = totalMap.get(channel) ?? 0
    const advances = advanceMap.get(channel) ?? 0
    return {
      channel,
      total,
      advances,
      advancePct: safePct(advances, total),
      byStage: stageMap.get(channel) ?? {},
    }
  })
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconShare2() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function IconTrendUp() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 7l-8.5 8.5-5-5L2 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 7h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
  value: string | number
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
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#555',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {icon && <span style={{ color: accent ?? '#555' }}>{icon}</span>}
        {label}
      </span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ?? 'white',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 12, color: '#555' }}>{sub}</span>
      )}
    </div>
  )
}

function ChannelRow({
  stat,
  maxTotal,
}: {
  stat: ChannelStat
  maxTotal: number
}) {
  const color = CHANNEL_COLORS[stat.channel] ?? '#6b7280'
  const label = CHANNEL_LABELS[stat.channel] ?? stat.channel
  const barWidth = maxTotal > 0 ? (stat.total / maxTotal) * 100 : 0
  const stageEntries = Object.entries(stat.byStage).sort((a, b) => b[1] - a[1])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid #161616',
      }}
    >
      {/* Channel color dot + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 120px', minWidth: 0 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>

      {/* Stage dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, width: 80 }}>
        {stageEntries.slice(0, 4).map(([stage, count]) => (
          <div
            key={stage}
            title={`${STAGE_LABELS[stage] ?? stage}: ${count}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: STAGE_COLORS[stage] ?? '#555',
              opacity: 0.85,
            }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ flex: '2 1 80px', minWidth: 0 }}>
        <div
          style={{
            height: 6,
            background: '#1a1a1a',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${barWidth}%`,
              background: color,
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Advances */}
      <span style={{ fontSize: 12, color: '#34d399', flexShrink: 0, width: 56, textAlign: 'center' }}>
        {stat.advances > 0 ? `${stat.advances} av.` : '—'}
      </span>

      {/* Advance % */}
      <span style={{ fontSize: 12, color: stat.advancePct > 0 ? '#34d399' : '#555', flexShrink: 0, width: 42, textAlign: 'center' }}>
        {stat.advancePct > 0 ? `${stat.advancePct}%` : '—'}
      </span>

      {/* Total */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: stat.total > 0 ? '#aaa' : '#333',
          flexShrink: 0,
          minWidth: 28,
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
    <div style={{ padding: '28px 20px', textAlign: 'center' }}>
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

export default function CanaisPage() {
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

  // Data
  const [channelStats, setChannelStats] = React.useState<ChannelStat[]>([])
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

      const stats = buildChannelStats(
        (data ?? []) as RawEvent[],
        dateStart,
        dateEnd,
        selectedSellerId,
        isAdmin,
        currentUserId,
        selectedStage,
      )
      setChannelStats(stats)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ==========================================================================
  // Derived values
  // ==========================================================================
  const activeStats = channelStats.filter(s => s.total > 0)
  const grandTotal = channelStats.reduce((s, c) => s + c.total, 0)
  const maxTotal = Math.max(...channelStats.map(s => s.total), 1)

  const topChannel = activeStats.length > 0
    ? activeStats.reduce((best, s) => (s.total > best.total ? s : best), activeStats[0])
    : null

  const topAdvanceChannel = activeStats.length > 0
    ? activeStats.reduce((best, s) => (s.advances > best.advances ? s : best), activeStats[0])
    : null

  // ==========================================================================
  // Loading / Error states
  // ==========================================================================
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#666', fontSize: 14 }}>
          <IconLoader />
          Carregando...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#0f0f0f', border: '1px solid #333', borderRadius: 12, padding: '24px 32px', maxWidth: 420, textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: 14, margin: 0 }}>{error}</p>
          <a href="/login" style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: '#60a5fa', textDecoration: 'none' }}>
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
            <span style={{ color: '#f472b6' }}>
              <IconShare2 />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Canais
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Performance por canal de contato: ligação, WhatsApp, e-mail, presencial e outros
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
            { label: 'Visão Executiva', href: '/relatorios/operacao/visao-executiva', active: false, comingSoon: false },
            { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa', active: false, comingSoon: false },
            { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao', active: false, comingSoon: false },
            { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas', active: false, comingSoon: false },
            { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes', active: false, comingSoon: false },
            { label: 'Canais', href: null, active: true, comingSoon: false },
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
                    borderBottom: '2px solid #f472b6',
                    cursor: 'default',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#f472b6',
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

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
          <SummaryCard
            label="Canal mais usado"
            value={topChannel ? (CHANNEL_LABELS[topChannel.channel] ?? topChannel.channel) : '—'}
            sub={topChannel ? `${topChannel.total} contato(s) no período` : 'sem dados'}
            accent={topChannel ? CHANNEL_COLORS[topChannel.channel] : undefined}
            icon={<IconShare2 />}
          />
          <SummaryCard
            label="Total de contatos por canal"
            value={grandTotal > 0 ? grandTotal : '—'}
            sub={grandTotal > 0 ? `${activeStats.length} canal(is) ativo(s)` : 'sem dados'}
          />
          <SummaryCard
            label="Canal com mais avanço"
            value={topAdvanceChannel && topAdvanceChannel.advances > 0
              ? (CHANNEL_LABELS[topAdvanceChannel.channel] ?? topAdvanceChannel.channel)
              : '—'}
            sub={topAdvanceChannel && topAdvanceChannel.advances > 0
              ? `${topAdvanceChannel.advances} avanço(s) — ${topAdvanceChannel.advancePct}% de conversão`
              : 'sem dados'}
            accent="#34d399"
            icon={<IconTrendUp />}
          />
          {/* Distribution mini-bar card */}
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
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' }}>
              Distribuição
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
              {activeStats.map((s) => (
                <div key={s.channel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: CHANNEL_COLORS[s.channel] ?? '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#666', minWidth: 70 }}>{CHANNEL_LABELS[s.channel] ?? s.channel}</span>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>
                    {grandTotal > 0 ? Math.round((s.total / grandTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
              {activeStats.length === 0 && (
                <span style={{ fontSize: 11, color: '#444' }}>sem dados</span>
              )}
            </div>
            {/* Distribution bar */}
            {grandTotal > 0 && (
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
                {activeStats.map((s) => (
                  <div
                    key={s.channel}
                    style={{
                      height: '100%',
                      width: `${(s.total / grandTotal) * 100}%`,
                      background: CHANNEL_COLORS[s.channel] ?? '#6b7280',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Channel table */}
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
              <span style={{ color: '#f472b6' }}>
                <IconShare2 />
              </span>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'white' }}>
                  Por Canal
                </h2>
                <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>
                  Volume de contatos e taxa de avanço por canal de comunicação
                </p>
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
              {grandTotal}{' '}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>contato(s)</span>
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
            <span style={{ flex: '1 1 120px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
              Canal
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, width: 80 }}>
              Etapas
            </span>
            <span style={{ flex: '2 1 80px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
              Volume
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, width: 56, textAlign: 'center' }}>
              Avanços
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, width: 42, textAlign: 'center' }}>
              % Av.
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
              Qtd
            </span>
          </div>

          {activeStats.length > 0 ? (
            channelStats
              .filter(s => s.total > 0)
              .map((stat) => (
                <ChannelRow key={stat.channel} stat={stat} maxTotal={maxTotal} />
              ))
          ) : (
            <EmptyState message="Nenhum evento com canal registrado no período." />
          )}
        </div>

      </div>
    </div>
  )
}
