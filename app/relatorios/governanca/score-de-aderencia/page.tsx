'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { classifyEvent } from '@/app/config/eventClassification'
import * as faturamentoService from '@/app/lib/services/faturamento'
import { getExecutionDayCalendarsForRange } from '@/app/lib/services/executionDayCalendar'
import {
  countExecutionDaysAcrossCalendars,
  getBusinessDateKey,
} from '@/app/lib/services/executionDayMath'

// ==============================================================================
// Design system
// ==============================================================================

const DS = {
  contentBg: '#090b0f',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

  blueLight: '#60a5fa',
  blueSoft: '#93c5fd',

  greenSoft: '#86efac',
  yellowSoft: '#fef3c7',
  redSoft: '#fca5a5',

  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

const SCORE_SAUDAVEL = 70
const SCORE_ATENCAO = 40
const STALE_DAYS = 14


const SYSTEM_EVENT_TYPES = new Set([
  'cycle_created',
  'lead_created',
  'assigned',
  'reassigned',
  'owner_assigned',
  'owner_reassigned',
  'returned_to_pool',
  'group_attached',
  'group_changed',
  'group_assigned',
  'group_detached',
  'lead_reactivated_from_import',
  'lead_reactivated_from_manual_create',
  'lead_reactivated_by_admin',
  'ai_analysis_generated',
  'ai_suggestion_applied',
  'ai_suggestion_rejected',
])

// ==============================================================================
// Helpers
// ==============================================================================

function getThirtyDaysAgo(): string {
  const date = new Date(`${getBusinessDateKey()}T12:00:00Z`)

  date.setUTCDate(date.getUTCDate() - 30)

  return date.toISOString().slice(0, 10)
}

function getTodayDate(): string {
  return getBusinessDateKey()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)

  date.setUTCDate(date.getUTCDate() + amount)

  return date.toISOString().slice(0, 10)
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function dateKeyInBrazil(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = new Map(parts.map((part) => [part.type, part.value]))

  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')

  if (!year || !month || !day) {
    return null
  }

  return `${year}-${month}-${day}`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function scoreClassification(
  score: number,
): 'saudavel' | 'atencao' | 'critico' {
  if (score >= SCORE_SAUDAVEL) {
    return 'saudavel'
  }

  if (score >= SCORE_ATENCAO) {
    return 'atencao'
  }

  return 'critico'
}

function classificationLabel(
  classification: 'saudavel' | 'atencao' | 'critico',
): string {
  if (classification === 'saudavel') {
    return 'Saudável'
  }

  if (classification === 'atencao') {
    return 'Atenção'
  }

  return 'Crítico'
}

function classificationColor(
  classification: 'saudavel' | 'atencao' | 'critico',
): string {
  if (classification === 'saudavel') {
    return DS.greenSoft
  }

  if (classification === 'atencao') {
    return DS.yellowSoft
  }

  return DS.redSoft
}

function classificationBackground(
  classification: 'saudavel' | 'atencao' | 'critico',
): string {
  if (classification === 'saudavel') {
    return 'rgba(34,197,94,0.09)'
  }

  if (classification === 'atencao') {
    return 'rgba(245,158,11,0.09)'
  }

  return 'rgba(239,68,68,0.09)'
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    boxShadow: DS.shadowCard,
  }
}

const fieldLabelStyle: React.CSSProperties = {
  color: DS.textLabel,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  background: DS.surfaceBg,
  border: `1px solid ${DS.border}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  fontSize: 13,
  height: 38,
  outline: 'none',
  padding: '0 11px',
}

// ==============================================================================
// Types
// ==============================================================================

type MeResponse = {
  user_id?: string
  active_company_id?: string | null
  active_role?: string | null
  is_platform_admin?: boolean
  error?: string
}

type SellerOption = {
  id: string
  label: string
}

type RawEvent = {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

type RawCycle = {
  id: string
  owner_user_id: string | null
  status: string | null
  updated_at: string | null
  next_action_date: string | null
}

type SellerScore = {
  sellerId: string
  sellerName: string
  initials: string

  activities: number
  daysWithActivity: number
  workingDays: number
  advances: number
  workedCycles: number

  activeCycles: number
  agendaCovered: number
  agendaOverdue: number
  staleCycles: number

  registration: number
  agenda: number
  portfolio: number
  process: number

  score: number
  classification: 'saudavel' | 'atencao' | 'critico'
}

// ==============================================================================
// Fetch helpers
// ==============================================================================

// ==============================================================================
// Score engine
// ==============================================================================

function isCommercialActivity(event: RawEvent): boolean {
  if (SYSTEM_EVENT_TYPES.has(event.event_type.trim().toLowerCase())) {
    return false
  }

  return (
    classifyEvent({
      event_type: event.event_type,
      metadata: event.metadata ?? {},
    }) === 'activity'
  )
}

function isStageAdvance(event: RawEvent): boolean {
  if (SYSTEM_EVENT_TYPES.has(event.event_type.trim().toLowerCase())) {
    return false
  }

  return (
    classifyEvent({
      event_type: event.event_type,
      metadata: event.metadata ?? {},
    }) === 'stage_move'
  )
}

function calculateRegistrationScore(
  activities: number,
  daysWithActivity: number,
  workingDays: number,
): number {
  const activitiesPerDay = activities / workingDays

  const volumeScore = clamp((activitiesPerDay / 2) * 60, 0, 60)
  const frequencyScore = clamp(
    (daysWithActivity / workingDays) * 40,
    0,
    40,
  )

  return Math.round(volumeScore + frequencyScore)
}

function calculateAgendaScore(
  activeCycles: number,
  agendaCovered: number,
  agendaOverdue: number,
): number {
  if (activeCycles === 0) {
    return 50
  }

  const coverage = (agendaCovered / activeCycles) * 100
  const overduePenalty = (agendaOverdue / activeCycles) * 50

  return Math.round(clamp(coverage - overduePenalty, 0, 100))
}

function calculatePortfolioScore(
  activeCycles: number,
  staleCycles: number,
  agendaCovered: number,
): number {
  if (activeCycles === 0) {
    return 50
  }

  const freshness = (activeCycles - staleCycles) / activeCycles
  const coverage = agendaCovered / activeCycles

  return Math.round(clamp(freshness * 70 + coverage * 30, 0, 100))
}

function calculateProcessScore(
  activities: number,
  advances: number,
  workedCycles: number,
  activeCycles: number,
): number {
  if (workedCycles === 0) {
    return activeCycles === 0 ? 50 : 0
  }

  const activitiesPerCycle = activities / workedCycles
  const activityScore = clamp((activitiesPerCycle / 3) * 80, 0, 80)

  const advanceRate = advances / workedCycles
  const advanceScore = clamp((advanceRate / 0.3) * 20, 0, 20)

  return Math.round(activityScore + advanceScore)
}

function buildScores({
  events,
  openCycles,
  sellers,
  selectedSellerId,
  dateStart,
  dateEnd,
  executionDays,
}: {
  events: RawEvent[]
  openCycles: RawCycle[]
  sellers: SellerOption[]
  selectedSellerId: string | null
  dateStart: string
  dateEnd: string
  executionDays: number
}): SellerScore[] {
  const workingDays = Math.max(executionDays, 1)
  const today = getTodayDate()
  const staleDate = addDays(today, -STALE_DAYS)

  const scopedSellers = selectedSellerId
    ? sellers.filter((seller) => seller.id === selectedSellerId)
    : sellers

  const sellerIds = new Set(scopedSellers.map((seller) => seller.id))

  const activitiesBySeller = new Map<string, number>()
  const activityDaysBySeller = new Map<string, Set<string>>()
  const advancesBySeller = new Map<string, number>()
  const workedCyclesBySeller = new Map<string, Set<string>>()

  for (const event of events) {
    const sellerId = event.created_by
    const eventDate = dateKeyInBrazil(event.occurred_at)

    if (!sellerId || !sellerIds.has(sellerId) || !eventDate) {
      continue
    }

    if (eventDate < dateStart || eventDate > dateEnd) {
      continue
    }

    const activity = isCommercialActivity(event)
    const advance = isStageAdvance(event)

    if (!activity && !advance) {
      continue
    }

    if (event.cycle_id) {
      const cycles = workedCyclesBySeller.get(sellerId) ?? new Set<string>()
      cycles.add(event.cycle_id)
      workedCyclesBySeller.set(sellerId, cycles)
    }

    if (activity) {
      activitiesBySeller.set(
        sellerId,
        (activitiesBySeller.get(sellerId) ?? 0) + 1,
      )

      const days = activityDaysBySeller.get(sellerId) ?? new Set<string>()
      days.add(eventDate)
      activityDaysBySeller.set(sellerId, days)
    }

    if (advance) {
      advancesBySeller.set(
        sellerId,
        (advancesBySeller.get(sellerId) ?? 0) + 1,
      )
    }
  }

  const activeCyclesBySeller = new Map<string, number>()
  const agendaCoveredBySeller = new Map<string, number>()
  const agendaOverdueBySeller = new Map<string, number>()
  const staleCyclesBySeller = new Map<string, number>()

  for (const cycle of openCycles) {
    const sellerId = cycle.owner_user_id

    if (!sellerId || !sellerIds.has(sellerId)) {
      continue
    }

    activeCyclesBySeller.set(
      sellerId,
      (activeCyclesBySeller.get(sellerId) ?? 0) + 1,
    )

    const nextActionDate = dateKeyInBrazil(cycle.next_action_date)

    if (nextActionDate) {
      agendaCoveredBySeller.set(
        sellerId,
        (agendaCoveredBySeller.get(sellerId) ?? 0) + 1,
      )

      if (nextActionDate < today) {
        agendaOverdueBySeller.set(
          sellerId,
          (agendaOverdueBySeller.get(sellerId) ?? 0) + 1,
        )
      }
    }

    const updatedDate = dateKeyInBrazil(cycle.updated_at)

    if (!updatedDate || updatedDate < staleDate) {
      staleCyclesBySeller.set(
        sellerId,
        (staleCyclesBySeller.get(sellerId) ?? 0) + 1,
      )
    }
  }

  return scopedSellers
    .map((seller) => {
      const activities = activitiesBySeller.get(seller.id) ?? 0
      const daysWithActivity = activityDaysBySeller.get(seller.id)?.size ?? 0
      const advances = advancesBySeller.get(seller.id) ?? 0
      const workedCycles = workedCyclesBySeller.get(seller.id)?.size ?? 0

      const activeCycles = activeCyclesBySeller.get(seller.id) ?? 0
      const agendaCovered = agendaCoveredBySeller.get(seller.id) ?? 0
      const agendaOverdue = agendaOverdueBySeller.get(seller.id) ?? 0
      const staleCycles = staleCyclesBySeller.get(seller.id) ?? 0

      const registration = calculateRegistrationScore(
        activities,
        daysWithActivity,
        workingDays,
      )

      const agenda = calculateAgendaScore(
        activeCycles,
        agendaCovered,
        agendaOverdue,
      )

      const portfolio = calculatePortfolioScore(
        activeCycles,
        staleCycles,
        agendaCovered,
      )

      const process = calculateProcessScore(
        activities,
        advances,
        workedCycles,
        activeCycles,
      )

      const score = Math.round(
        (registration + agenda + portfolio + process) / 4,
      )

      return {
        sellerId: seller.id,
        sellerName: seller.label,
        initials: getInitials(seller.label),

        activities,
        daysWithActivity,
        workingDays,
        advances,
        workedCycles,

        activeCycles,
        agendaCovered,
        agendaOverdue,
        staleCycles,

        registration,
        agenda,
        portfolio,
        process,

        score,
        classification: scoreClassification(score),
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.sellerName.localeCompare(b.sellerName, 'pt-BR'),
    )
}

// ==============================================================================
// Components
// ==============================================================================

function SectionLabel({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        color: DS.blueSoft,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        marginBottom: 12,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function MetricCard({
  label,
  value,
  description,
  accent = DS.blueSoft,
}: {
  label: string
  value: string
  description: string
  accent?: string
}) {
  return (
    <div
      style={{
        ...cardStyle(),
        display: 'flex',
        flex: '1 1 200px',
        flexDirection: 'column',
        minHeight: 126,
        padding: '17px 18px',
      }}
    >
      <div
        style={{
          color: DS.textLabel,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: accent,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: '-0.025em',
          lineHeight: 1,
          marginTop: 12,
        }}
      >
        {value}
      </div>

      <div
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          lineHeight: 1.45,
          marginTop: 'auto',
          paddingTop: 10,
        }}
      >
        {description}
      </div>
    </div>
  )
}

function ScoreBar({
  value,
  color,
}: {
  value: number
  color: string
}) {
  return (
    <div
      style={{
        background: DS.borderSubtle,
        borderRadius: 999,
        height: 5,
        overflow: 'hidden',
        width: 66,
      }}
    >
      <div
        style={{
          background: color,
          borderRadius: 999,
          height: '100%',
          width: `${clamp(value, 0, 100)}%`,
        }}
      />
    </div>
  )
}

function DimensionCell({
  value,
}: {
  value: number
}) {
  const classification = scoreClassification(value)
  const color = classificationColor(classification)

  return (
    <div
      style={{
        alignItems: 'flex-end',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <span
        style={{
          color,
          fontSize: 13,
          fontWeight: 850,
        }}
      >
        {value}
      </span>

      <ScoreBar value={value} color={color} />
    </div>
  )
}

function ScoreRow({
  row,
}: {
  row: SellerScore
}) {
  const color = classificationColor(row.classification)

  return (
    <tr
      style={{
        borderBottom: `1px solid ${DS.borderSubtle}`,
      }}
    >
      <td style={{ padding: '15px 18px' }}>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 10,
          }}
        >
          <div
            style={{
              alignItems: 'center',
              background: classificationBackground(row.classification),
              border: `1px solid ${color}30`,
              borderRadius: '50%',
              color,
              display: 'flex',
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 900,
              height: 30,
              justifyContent: 'center',
              width: 30,
            }}
          >
            {row.initials || '—'}
          </div>

          <div>
            <div
              style={{
                color: DS.textPrimary,
                fontSize: 13,
                fontWeight: 850,
              }}
            >
              {row.sellerName}
            </div>

            <div
              style={{
                color,
                fontSize: 10,
                fontWeight: 800,
                marginTop: 3,
                textTransform: 'uppercase',
              }}
            >
              {classificationLabel(row.classification)}
            </div>
          </div>
        </div>
      </td>

      <td style={{ padding: '15px 12px', textAlign: 'right' }}>
        <div
          style={{
            color,
            fontSize: 21,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          {row.score}
        </div>
      </td>

      <td style={{ padding: '15px 12px', textAlign: 'right' }}>
        <DimensionCell value={row.registration} />
      </td>

      <td style={{ padding: '15px 12px', textAlign: 'right' }}>
        <DimensionCell value={row.agenda} />
      </td>

      <td style={{ padding: '15px 12px', textAlign: 'right' }}>
        <DimensionCell value={row.portfolio} />
      </td>

      <td style={{ padding: '15px 12px', textAlign: 'right' }}>
        <DimensionCell value={row.process} />
      </td>

      <td
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          fontWeight: 700,
          padding: '15px 12px',
          textAlign: 'right',
        }}
      >
        {row.activities}
      </td>

      <td
        style={{
          color: row.agendaOverdue > 0 ? DS.redSoft : DS.textSecondary,
          fontSize: 13,
          fontWeight: row.agendaOverdue > 0 ? 800 : 500,
          padding: '15px 12px',
          textAlign: 'right',
        }}
      >
        {row.agendaOverdue}
      </td>

      <td
        style={{
          color: DS.textSecondary,
          fontSize: 13,
          padding: '15px 18px',
          textAlign: 'right',
        }}
      >
        {row.activeCycles}
      </td>
    </tr>
  )
}

// ==============================================================================
// Main page
// ==============================================================================

export default function ScoreDeAderenciaPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [pageError, setPageError] = React.useState<string | null>(null)

  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [canFilterSellers, setCanFilterSellers] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(
    null,
  )

  const [scores, setScores] = React.useState<SellerScore[]>([])
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)
  const [executionDaysEvaluated, setExecutionDaysEvaluated] = React.useState(0)

  React.useEffect(() => {
    async function initialize() {
      setLoading(true)
      setPageError(null)

      try {
        const response = await fetch('/api/me', {
          cache: 'no-store',
        })

        const me = (await response.json()) as MeResponse

        if (!response.ok) {
          throw new Error(
            me.error ?? 'Não foi possível identificar a empresa ativa.',
          )
        }

        const currentUserId = me.user_id
        const activeCompanyId = me.active_company_id

        if (!currentUserId) {
          throw new Error('Sessão expirada. Faça login novamente.')
        }

        if (!activeCompanyId) {
          throw new Error('Nenhuma empresa ativa foi selecionada.')
        }

        const activeRole = String(me.active_role ?? '').toLowerCase()

        const canManage =
          me.is_platform_admin === true ||
          activeRole === 'admin' ||
          activeRole === 'manager'

        const sellerRows = await faturamentoService.getSellers(
          supabase,
          activeCompanyId,
        )

        const commercialSellers = sellerRows
          .filter((seller) =>
            ['member', 'seller', 'consultor'].includes(
              String(seller.role ?? '').toLowerCase(),
            ),
          )
          .map((seller) => ({
            id: seller.id,
            label: seller.full_name || seller.email || seller.id,
          }))

        setCompanyId(activeCompanyId)
        setCanFilterSellers(canManage)
        setSellers(commercialSellers)
        setSelectedSellerId(canManage ? null : currentUserId)
      } catch (cause: unknown) {
        setPageError(
          getErrorMessage(
            cause,
            'Erro ao carregar empresa ativa e consultores.',
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [supabase])

  React.useEffect(() => {
    if (!companyId) {
      return
    }

    let cancelled = false

    async function loadScores() {
      setDataLoading(true)
      setDataError(null)

      try {
        const params = new URLSearchParams({
          date_start: dateStart,
          date_end: dateEnd,
        })

        if (selectedSellerId) {
          params.set('seller_id', selectedSellerId)
        }

        const [response, calendars] = await Promise.all([
          fetch(`/api/reports/governance/adherence?${params.toString()}`, {
            cache: 'no-store',
          }),
          getExecutionDayCalendarsForRange({
            companyId,
            dateStart,
            dateEnd,
          }),
        ])

        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean
          events?: RawEvent[]
          open_cycles?: RawCycle[]
          error?: string
        }

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ?? 'Erro ao carregar dados do Score de Aderência.',
          )
        }

        if (cancelled) {
          return
        }

        const executionDays = countExecutionDaysAcrossCalendars(
          dateStart,
          dateEnd,
          calendars.map((calendar) => ({
            periodStart: calendar.period_start,
            periodEnd: calendar.period_end,
            workDays: calendar.work_days,
            executionDayOverrides: calendar.execution_day_overrides,
          })),
        )

        const data = buildScores({
          events: payload.events ?? [],
          openCycles: payload.open_cycles ?? [],
          sellers,
          selectedSellerId,
          dateStart,
          dateEnd,
          executionDays,
        })

        setExecutionDaysEvaluated(executionDays)
        setScores(data)
      } catch (cause: unknown) {
        if (!cancelled) {
          setDataError(
            getErrorMessage(
              cause,
              'Erro ao calcular o Score de Aderência.',
            ),
          )
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false)
        }
      }
    }

    void loadScores()

    return () => {
      cancelled = true
    }
  }, [
    companyId,
    dateEnd,
    dateStart,
    selectedSellerId,
    sellers,
  ])

  const summary = React.useMemo(() => {
    const total = scores.length

    return {
      sellers: total,
      average:
        total > 0
          ? Math.round(
              scores.reduce((sum, score) => sum + score.score, 0) / total,
            )
          : 0,
      healthy: scores.filter((score) => score.classification === 'saudavel')
        .length,
      attention: scores.filter((score) => score.classification === 'atencao')
        .length,
      critical: scores.filter((score) => score.classification === 'critico')
        .length,
      activities: scores.reduce((sum, score) => sum + score.activities, 0),
      overdue: scores.reduce((sum, score) => sum + score.agendaOverdue, 0),
    }
  }, [scores])

  if (loading) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        Carregando Score de Aderência...
      </div>
    )
  }

  if (pageError) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div
          style={{
            ...cardStyle(),
            maxWidth: 480,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <strong style={{ color: DS.redSoft }}>
            Não foi possível carregar o Score de Aderência.
          </strong>

          <div style={{ fontSize: 13, marginTop: 8 }}>
            {pageError}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100vh',
        padding: '32px 24px 80px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a
          href="/relatorios"
          style={{
            color: DS.textSecondary,
            display: 'inline-flex',
            fontSize: 13,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 10,
              marginBottom: 7,
            }}
          >
            <span
              style={{
                color: DS.blueLight,
                fontSize: 19,
                lineHeight: 1,
              }}
            >
              ◫
            </span>

            <h1
              style={{
                fontSize: 23,
                fontWeight: 850,
                letterSpacing: '-0.015em',
                margin: 0,
              }}
            >
              Score de Aderência
            </h1>
          </div>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              maxWidth: 800,
            }}
          >
            Mede a consistência da execução comercial, disciplina de agenda,
            saúde da carteira e aderência ao processo de cada consultor.
          </p>
        </header>

        <section
          style={{
            ...cardStyle(),
            alignItems: 'flex-end',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
            padding: '16px 20px',
          }}
        >
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>De</span>

            <input
              type="date"
              value={dateStart}
              onChange={(event) => setDateStart(event.target.value)}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Até</span>

            <input
              type="date"
              value={dateEnd}
              onChange={(event) => setDateEnd(event.target.value)}
              style={{
                ...inputStyle,
                colorScheme: 'dark',
              }}
            />
          </label>

          {canFilterSellers ? (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={fieldLabelStyle}>Consultor</span>

              <select
                value={selectedSellerId ?? ''}
                onChange={(event) =>
                  setSelectedSellerId(event.target.value || null)
                }
                style={{
                  ...inputStyle,
                  minWidth: 225,
                }}
              >
                <option value="">Todos os consultores</option>

                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div
            style={{
              color: dataLoading ? DS.blueSoft : DS.textMuted,
              fontSize: 12,
              fontWeight: 700,
              marginLeft: 'auto',
              paddingBottom: 10,
            }}
          >
            {dataLoading
              ? 'Atualizando score...'
              : 'Dados atualizados automaticamente'}
          </div>
        </section>

        {dataError ? (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {dataError}
          </div>
        ) : null}

        {dataLoading && scores.length === 0 ? (
          <div
            style={{
              ...cardStyle(),
              color: DS.textSecondary,
              fontSize: 13,
              padding: '40px 24px',
              textAlign: 'center',
            }}
          >
            Calculando Score de Aderência...
          </div>
        ) : null}

        {!dataLoading || scores.length > 0 ? (
          <>
            <section style={{ marginBottom: 28 }}>
              <SectionLabel>Panorama da Aderência</SectionLabel>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                }}
              >
                <MetricCard
                  label="Score Médio"
                  value={String(summary.average)}
                  description="Média dos quatro pilares de aderência."
                  accent={
                    summary.average >= SCORE_SAUDAVEL
                      ? DS.greenSoft
                      : summary.average >= SCORE_ATENCAO
                        ? DS.yellowSoft
                        : DS.redSoft
                  }
                />

                <MetricCard
                  label="Saudáveis"
                  value={String(summary.healthy)}
                  description="Consultores com score igual ou acima de 70."
                  accent={DS.greenSoft}
                />

                <MetricCard
                  label="Em Atenção"
                  value={String(summary.attention)}
                  description="Consultores entre 40 e 69 pontos."
                  accent={DS.yellowSoft}
                />

                <MetricCard
                  label="Críticos"
                  value={String(summary.critical)}
                  description="Consultores abaixo de 40 pontos."
                  accent={DS.redSoft}
                />
              </div>
            </section>

            <section
              style={{
                ...cardStyle(),
                marginBottom: 20,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  alignItems: 'flex-start',
                  borderBottom: `1px solid ${DS.border}`,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  justifyContent: 'space-between',
                  padding: '18px 20px',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 850,
                      margin: 0,
                    }}
                  >
                    Ranking de Aderência
                  </h2>

                  <p
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.5,
                      margin: '6px 0 0',
                    }}
                  >
                    Leitura individual da execução e da qualidade operacional da
                    carteira.
                  </p>
                </div>

                <div
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(34,197,94,0.09)',
                      border: '1px solid rgba(134,239,172,0.16)',
                      borderRadius: 6,
                      color: DS.greenSoft,
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '6px 8px',
                    }}
                  >
                    ≥ 70 saudável
                  </span>

                  <span
                    style={{
                      background: 'rgba(245,158,11,0.09)',
                      border: '1px solid rgba(254,243,199,0.14)',
                      borderRadius: 6,
                      color: DS.yellowSoft,
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '6px 8px',
                    }}
                  >
                    40–69 atenção
                  </span>

                  <span
                    style={{
                      background: 'rgba(239,68,68,0.09)',
                      border: '1px solid rgba(252,165,165,0.14)',
                      borderRadius: 6,
                      color: DS.redSoft,
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '6px 8px',
                    }}
                  >
                    &lt; 40 crítico
                  </span>
                </div>
              </div>

              {scores.length === 0 ? (
                <div
                  style={{
                    color: DS.textSecondary,
                    fontSize: 13,
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  Nenhum consultor comercial ativo foi encontrado na empresa
                  selecionada.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      borderCollapse: 'collapse',
                      minWidth: 1100,
                      width: '100%',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#0f1118',
                          color: DS.textMuted,
                          fontSize: 10,
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <th
                          style={{
                            padding: '12px 18px',
                            textAlign: 'left',
                          }}
                        >
                          Consultor
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Score
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Registro
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Agenda
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Carteira
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Processo
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Atividades
                        </th>

                        <th style={{ padding: '12px', textAlign: 'right' }}>
                          Vencidas
                        </th>

                        <th
                          style={{
                            padding: '12px 18px',
                            textAlign: 'right',
                          }}
                        >
                          Carteira Ativa
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {scores.map((score) => (
                        <ScoreRow key={score.sellerId} row={score} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                marginBottom: 20,
              }}
            >
              <MetricCard
                label="Atividades Registradas"
                value={String(summary.activities)}
                description="Atividades comerciais reais no período filtrado."
              />

              <MetricCard
                label="Próximas Ações Vencidas"
                value={String(summary.overdue)}
                description="Ações da carteira ativa que já ultrapassaram a data."
                accent={summary.overdue > 0 ? DS.redSoft : DS.greenSoft}
              />

              <MetricCard
                label="Janela Avaliada"
                value={`${executionDaysEvaluated} ${executionDaysEvaluated === 1 ? 'dia de execução' : 'dias de execução'}`}
                description="Calendário operacional usado para avaliar frequência de registro."
              />

              <MetricCard
                label="Consultores Avaliados"
                value={String(summary.sellers)}
                description="Consultores comerciais ativos no escopo selecionado."
              />
            </section>

            <section
              style={{
                ...cardStyle(),
                marginBottom: 20,
                padding: '18px 20px',
              }}
            >
              <div
                style={{
                  color: DS.textPrimary,
                  fontSize: 15,
                  fontWeight: 850,
                  marginBottom: 12,
                }}
              >
                Como o Score é calculado
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                <div>
                  <div
                    style={{
                      color: DS.blueSoft,
                      fontSize: 12,
                      fontWeight: 850,
                      marginBottom: 5,
                    }}
                  >
                    Registro
                  </div>

                  <div
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    Mede atividades comerciais por dia de execução e frequência de dias
                    com execução registrada.
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      color: DS.blueSoft,
                      fontSize: 12,
                      fontWeight: 850,
                      marginBottom: 5,
                    }}
                  >
                    Agenda
                  </div>

                  <div
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    Mede a proporção da carteira aberta com próxima ação e reduz
                    a nota conforme existem ações vencidas.
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      color: DS.blueSoft,
                      fontSize: 12,
                      fontWeight: 850,
                      marginBottom: 5,
                    }}
                  >
                    Carteira
                  </div>

                  <div
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    Mede atualização da carteira aberta nos últimos 14 dias e
                    cobertura de próxima ação.
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      color: DS.blueSoft,
                      fontSize: 12,
                      fontWeight: 850,
                      marginBottom: 5,
                    }}
                  >
                    Processo
                  </div>

                  <div
                    style={{
                      color: DS.textSecondary,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    Mede atividades e avanços de etapa por ciclo efetivamente
                    trabalhado no período.
                  </div>
                </div>
              </div>
            </section>

            <section
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusContainer,
                padding: '16px 18px',
              }}
            >
              <div
                style={{
                  color: DS.blueSoft,
                  fontSize: 12,
                  fontWeight: 850,
                  marginBottom: 7,
                }}
              >
                Critério de leitura
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.65,
                }}
              >
                Registro e Processo usam eventos reais de{' '}
                <strong style={{ color: DS.textPrimary }}>
                  cycle_events
                </strong>
                . Agenda e Carteira usam o estado atual da carteira aberta em{' '}
                <strong style={{ color: DS.textPrimary }}>
                  sales_cycles
                </strong>
                .
              </div>

              <div
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.65,
                  marginTop: 6,
                }}
              >
                O campo <strong style={{ color: DS.textPrimary }}>updated_at</strong>{' '}
                é utilizado somente para medir atualização recente da carteira.
                Ele não é usado como proxy de perda, fechamento ou faturamento.
              </div>

              <div
                style={{
                  color: DS.yellowSoft,
                  fontSize: 12,
                  lineHeight: 1.65,
                  marginTop: 8,
                }}
              >
                O score é uma leitura de aderência operacional, não um ranking
                de faturamento. Um resultado baixo aponta exatamente onde a
                gestão deve atuar: execução, agenda, carteira ou processo.
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
