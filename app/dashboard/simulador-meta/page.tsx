'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  getActiveCompetency,
  getSalesCycleMetrics,
  calculateSimulatorResult,
  calculateTheory10020,
  getGroupConversion,
  getRevenueSummary,
  getRevenueGoal,
  upsertRevenueGoal,
  getHistoricalTicket,
} from '@/app/lib/services/simulator'
import { getCloseRateReal, percentToRate } from '@/app/lib/services/simulatorRateReal'
import type {
  GroupConversionRow,
  HistoricalTicketResponse,
  RevenueDayPoint,
  RevenueSummaryResponse,
  SimulatorMetrics,
  SimulatorMode,
  SimulatorResult,
  Theory10020Result,
} from '@/app/types/simulator'
import type { CloseRateRealResponse } from '@/app/types/simulatorRateReal'
import { InfoTip } from '@/app/components/InfoTip'
import { RevenueChart } from './components/RevenueChart'
import MetaSummaryHeader, { toBRL, getRevenueStatus, statusLabel, statusTone } from '@/app/components/meta/MetaSummaryCard'
import { buildCalendarDistribution } from '@/app/lib/services/calendarDistribution'
import { getWeekdayVocation } from '@/app/lib/services/weekdayVocation'
import { getMonthlySeasonalityPerformance } from '@/app/lib/services/monthlySeasonalityPerformance'
import { getPeriodRadar } from '@/app/lib/services/periodRadar'
import type { DailyGoalDistribution, DistributionInputSignals } from '@/app/types/distribution'
import SimulatorDistributionSummary from './components/SimulatorDistributionSummary'
import SimulatorDailyDistributionTable from './components/SimulatorDailyDistributionTable'

function toYMD(v: string) {
  return (v ?? '').split('T')[0].split(' ')[0]
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${Math.round(v * 100)}%`
}

function safeNumber(v: any) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const n = parseFloat(s || '0')
  return Number.isFinite(n) ? n : 0
}

// ============================
// Dias trabalhados
// ============================

// 0=Dom,1=Seg,...6=Sáb
type WorkDays = Record<number, boolean>

function defaultWorkDays(): WorkDays {
  return {
    0: false, // Dom
    1: true, // Seg
    2: true, // Ter
    3: true, // Qua
    4: true, // Qui
    5: true, // Sex
    6: false, // Sáb
  }
}

function countRemainingWorkDays(endDate: Date, workDays: WorkDays): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)

  if (endDate < today) return 0

  let count = 0
  const cur = new Date(today)
  while (cur <= endDate) {
    const dow = cur.getDay()
    if (workDays[dow]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function countWorkDaysInRange(start: string, end: string, workDays: WorkDays): number {
  const s = new Date(toYMD(start) + 'T00:00:00')
  const e = new Date(toYMD(end) + 'T00:00:00')
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  if (e < s) return 0

  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (workDays[dow]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function countWorkDaysUntilToday(start: string, end: string, workDays: WorkDays): number {
  const s = new Date(toYMD(start) + 'T00:00:00')
  const e = new Date(toYMD(end) + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  const last = today < e ? today : e
  if (last < s) return 0

  let count = 0
  const cur = new Date(s)
  while (cur <= last) {
    const dow = cur.getDay()
    if (workDays[dow]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// ============================

function TitleWithTip({
  label,
  tipTitle,
  ariaLabel,
  children,
  width,
}: {
  label: string
  tipTitle: string
  ariaLabel?: string
  children: React.ReactNode
  width?: number
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <span>{label}</span>
      <InfoTip title={tipTitle} ariaLabel={ariaLabel ?? `Ajuda: ${label}`} width={width}>
        {children}
      </InfoTip>
    </span>
  )
}

function Card({
  title,
  value,
  subtitle,
  tone,
}: {
  title: React.ReactNode
  value: React.ReactNode
  subtitle?: React.ReactNode
  tone?: 'neutral' | 'good' | 'bad'
}) {
  const valueColor =
    tone === 'good' ? '#86efac' : tone === 'bad' ? '#fca5a5' : '#edf2f7'
  const accentBorder =
    tone === 'good' ? '#22c55e' : tone === 'bad' ? '#ef4444' : '#1a1d2e'

  return (
    <div style={{
      border: '1px solid #1a1d2e',
      borderLeft: `3px solid ${accentBorder}`,
      background: '#0d0f14',
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#8fa3bc', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.2, color: valueColor }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 8, fontSize: 12, color: '#546070', lineHeight: 1.5 }}>{subtitle}</div> : null}
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: string
  children: React.ReactNode
}) {
  return (
    <section style={{
      border: '1px solid rgba(59,130,246,0.18)',
      background: 'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 60%, rgba(13,15,20,0.95) 100%)',
      borderRadius: 14,
      padding: '18px 18px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(59,130,246,0.06)',
    }}>
      <div>
        <div style={{
          fontSize: 13,
          fontWeight: 900,
          color: '#edf2f7',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 10,
          borderLeft: '2px solid rgba(59,130,246,0.4)',
        }}>{title}</div>
        {description ? <div style={{ marginTop: 4, fontSize: 12, color: '#546070', paddingLeft: 12 }}>{description}</div> : null}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  )
}

function tabStyle(isActive: boolean) {
  return {
    padding: '8px 18px',
    background: isActive
      ? 'linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.06) 100%)'
      : '#0d0f14',
    color: isActive ? '#93c5fd' : '#8fa3bc',
    border: isActive ? '1px solid #3b82f6' : '1px solid #1a1d2e',
    borderRadius: 8,
    cursor: 'pointer' as const,
    fontSize: 13,
    fontWeight: isActive ? 700 : 400,
    transition: 'all 200ms ease',
  }
}

function IconUsers({ size = 14, color = '#8fa3bc' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconBarChart({ size = 14, color = '#8fa3bc' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  )
}

function IconTag({ size = 14, color = '#a78bfa' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconCrosshair({ size = 14, color = '#22d3ee' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  )
}

function IconTrophy({ size = 14, color = '#10b981' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function IconZap({ size = 14, color = '#22d3ee' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function IconCheckCircle({ size = 14, color = '#10b981' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export default function SimuladorMetaPage() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [competency, setCompetency] = useState<any>(null)
  const [metrics, setMetrics] = useState<SimulatorMetrics | null>(null)
  const [result, setResult] = useState<SimulatorResult | null>(null)

  const [mode, setMode] = useState<SimulatorMode>('faturamento')

  // Dias trabalhados (checkbox)
  const [workDays, setWorkDays] = useState<WorkDays>(defaultWorkDays())
  const [autoRemainingDays, setAutoRemainingDays] = useState(true)

  // Ganhos
  const [targetWins, setTargetWins] = useState(20)
  const [closeRatePercent, setCloseRatePercent] = useState(20)
  const [remainingBusinessDays, setRemainingBusinessDays] = useState(15)

  // Revenue (dados)
  const [revenueCompany, setRevenueCompany] = useState<RevenueSummaryResponse | null>(null)
  const [revenueSeller, setRevenueSeller] = useState<RevenueSummaryResponse | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueError, setRevenueError] = useState<string | null>(null)

  // Revenue (meta do banco + input digitável)
  const [revenueGoalDb, setRevenueGoalDb] = useState<number>(0)
  const [revenueGoalInputText, setRevenueGoalInputText] = useState<string>('0')
  const [goalLoading, setGoalLoading] = useState(false)
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [goalSuccess, setGoalSuccess] = useState<string | null>(null)

  const [isAdmin, setIsAdmin] = useState(false)
  const [sellers, setSellers] = useState<Array<{ id: string; label: string }>>([])
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const [rateRealData, setRateRealData] = useState<CloseRateRealResponse | null>(null)
  const [rateRealLoading, setRateRealLoading] = useState(false)
  const [daysWindow, setDaysWindow] = useState(90)

  const [groupConversion, setGroupConversion] = useState<GroupConversionRow[]>([])
  const [groupConversionLoading, setGroupConversionLoading] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  // Teoria 100/20
  const [ticketMedioText, setTicketMedioText] = useState<string>('5000')
  const [theory10020Result, setTheory10020Result] = useState<Theory10020Result | null>(null)

  // Rate source: 'real' uses historical vendor rate, 'planejada' uses closeRatePercent
  const [rateSource, setRateSource] = useState<'real' | 'planejada'>('planejada')

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'teoria' | 'evolucao' | 'taxa-resultado' | 'funil' | 'distribuicao'>('teoria')

  // Distribuição inteligente (Fase 6.6)
  const [distribution, setDistribution] = useState<DailyGoalDistribution | null>(null)
  const [distributionLoading, setDistributionLoading] = useState(false)
  const [distributionError, setDistributionError] = useState<string | null>(null)
  const [distributionOnlyWorking, setDistributionOnlyWorking] = useState(true)

    // Período editável
    const [periodStart, setPeriodStart] = useState<string>('')
    const [periodEnd, setPeriodEnd] = useState<string>('')

  // Ticket source
  const [ticketSource, setTicketSource] = useState<'manual' | 'historico'>('manual')
  const [historicalTicket, setHistoricalTicket] = useState<HistoricalTicketResponse | null>(null)
  const [historicalTicketLoading, setHistoricalTicketLoading] = useState(false)

  // init
  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)

      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Você está deslogado.')

        const uid = userData.user.id

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, company_id')
          .eq('id', uid)
          .maybeSingle()
        if (!profile?.role) throw new Error('Perfil não encontrado.')

        const isAdminUser = profile.role === 'admin'
        setIsAdmin(isAdminUser)
        setCompanyId(profile.company_id)

                const comp = await getActiveCompetency()
        setCompetency(comp)

        // Corrigir month_end: a RPC retorna o 1º dia do próximo mês (exclusivo)
        // Converter para o último dia do mês (inclusivo) para exibição
        const rawEnd = new Date(toYMD(comp.month_end) + 'T00:00:00')
        rawEnd.setDate(rawEnd.getDate() - 1)
        const correctedEnd = rawEnd.toISOString().slice(0, 10)

        setPeriodStart(toYMD(comp.month_start))
        setPeriodEnd(correctedEnd)

        const endDate = new Date(toYMD(comp.month_end) + 'T00:00:00')
        const remainingDays = countRemainingWorkDays(endDate, workDays)
        setRemainingBusinessDays(remainingDays)

        if (isAdminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

          const sellersList = (sellersData ?? []).map((s: any) => ({
            id: s.id,
            label: s.full_name || s.id,
          }))

          setSellers(sellersList)
          setSelectedSellerId(null)
        } else {
          setSelectedSellerId(uid)
        }

        const m = await getSalesCycleMetrics(null, comp.month_start)
        setMetrics(m)

        const res = calculateSimulatorResult(m, {
          target_wins: targetWins,
          close_rate: percentToRate(closeRatePercent),
          ticket_medio: 0,
          remaining_business_days: remainingDays,
        })
        setResult(res)
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao carregar simulador.')
      } finally {
        setLoading(false)
      }
    }

    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // ✅ useEffect correto (fora do init): auto recalcular dias restantes
  useEffect(() => {
    if (!periodEnd) return
    if (!autoRemainingDays) return

    const endDate = new Date(periodEnd + 'T00:00:00')
    const remainingDays = countRemainingWorkDays(endDate, workDays)
    setRemainingBusinessDays(remainingDays)
  }, [periodEnd, workDays, autoRemainingDays])

  // taxa real
  useEffect(() => {
    async function loadRateReal() {
      setRateRealLoading(true)
      try {
        const data = await getCloseRateReal(selectedSellerId, daysWindow)
        setRateRealData(data)
      } catch (e: any) {
        console.warn('Erro ao carregar taxa real:', e.message)
        setRateRealData(null)
      } finally {
        setRateRealLoading(false)
      }
    }
    if (competency) void loadRateReal()
  }, [selectedSellerId, daysWindow, competency])

  // recalcula ganhos
  useEffect(() => {
    if (!metrics) return
    const newResult = calculateSimulatorResult(metrics, {
      target_wins: targetWins,
      close_rate: percentToRate(closeRatePercent),
      ticket_medio: 0,
      remaining_business_days: remainingBusinessDays,
    })
    setResult(newResult)
  }, [targetWins, closeRatePercent, remainingBusinessDays, metrics])

    // refetch metrics quando muda vendedor ou período
    useEffect(() => {
      if (!periodStart || selectedSellerId === undefined) return
      async function refetch() {
        try {
          const newMetrics = await getSalesCycleMetrics(selectedSellerId, periodStart)
          setMetrics(newMetrics)
        } catch (e: any) {
          setError(e?.message ?? 'Erro ao atualizar métricas.')
        }
      }
      void refetch()
    }, [periodStart, selectedSellerId])

  // conversão por grupo
  useEffect(() => {
    if (!periodStart || !periodEnd || !companyId || selectedSellerId === undefined) return

    const cid = companyId

    async function loadGroupConversion() {
      setGroupConversionLoading(true)
      try {
        const rows = await getGroupConversion({
          companyId: cid,
          ownerId: selectedSellerId,
          dateStart: periodStart,
          dateEnd: periodEnd,
        })
        setGroupConversion(rows)
      } catch (e: any) {
        console.warn('Erro ao carregar conversão por grupo:', e.message)
        setGroupConversion([])
      } finally {
        setGroupConversionLoading(false)
      }
    }

    void loadGroupConversion()
  }, [periodStart, periodEnd, selectedSellerId, companyId])

  const revenueDates = useMemo(() => {
    if (!periodStart || !periodEnd) return { start: '', end: '' }
    return {
      start: periodStart,
      end: periodEnd,
    }
  }, [periodStart, periodEnd])

  const revenueGoalOwnerId = useMemo(() => {
    if (!competency) return null
    if (isAdmin) return selectedSellerId
    return selectedSellerId
  }, [isAdmin, selectedSellerId, competency])

  const revenueGoalContextLabel = useMemo(() => {
    if (!isAdmin) return 'Meta do vendedor (definida pelo admin)'
    return revenueGoalOwnerId ? 'Meta do vendedor' : 'Meta da empresa'
  }, [isAdmin, revenueGoalOwnerId])

  const revenueGoalInputNumber = useMemo(
    () => Math.max(0, safeNumber(revenueGoalInputText)),
    [revenueGoalInputText],
  )

  const activeGoalForKpis = isAdmin ? revenueGoalInputNumber : revenueGoalDb

  // Computed: taxa usada no cálculo da teoria
  const taxaUsadaNoCalculo = useMemo(() => {
    const taxaRealDecimal = rateRealData?.vendor?.close_rate ?? null
    if (rateSource === 'real' && taxaRealDecimal !== null) {
      return taxaRealDecimal
    }
    return closeRatePercent / 100
  }, [rateSource, rateRealData, closeRatePercent])

  // Teoria 100/20 — recalcular quando inputs mudam
  useEffect(() => {
    if (mode !== 'faturamento') {
      setTheory10020Result(null)
      return
    }

    const ticketValue = ticketSource === 'historico' && historicalTicket?.is_sufficient
      ? historicalTicket.ticket_medio
      : Math.max(0, safeNumber(ticketMedioText))
    if (ticketValue <= 0) {
      setTheory10020Result(null)
      return
    }

    const totalReal = Number(revenueSeller?.total_real || revenueCompany?.total_real || 0)

    const result = calculateTheory10020({
      meta_total: activeGoalForKpis,
      ticket_medio: ticketValue,
      close_rate: taxaUsadaNoCalculo,
      remaining_business_days: remainingBusinessDays,
      total_real: totalReal,
    })
    setTheory10020Result(result)
  }, [mode, ticketMedioText, ticketSource, historicalTicket, activeGoalForKpis, taxaUsadaNoCalculo, remainingBusinessDays, revenueSeller, revenueCompany])

  // Carregar meta do banco
  useEffect(() => {
    if (!companyId || !competency) return
    if (mode === 'ganhos') return

    async function loadGoal() {
      setGoalLoading(true)
      setGoalError(null)
      setGoalSuccess(null)

      try {
        const res = await getRevenueGoal({
          companyId,
          ownerId: revenueGoalOwnerId ?? null,
          startDate: revenueDates.start,
          endDate: revenueDates.end,
        })

        const dbValue = Number(res?.goal_value || 0)
        setRevenueGoalDb(dbValue)
        setRevenueGoalInputText(String(dbValue))
      } catch (e: any) {
        setGoalError(e?.message ?? 'Erro ao carregar meta.')
        setRevenueGoalDb(0)
        setRevenueGoalInputText('0')
      } finally {
        setGoalLoading(false)
      }
    }

    void loadGoal()
  }, [companyId, competency, mode, revenueDates.start, revenueDates.end, revenueGoalOwnerId])

  // Load historical ticket
  useEffect(() => {
    if (!companyId || !competency) return
    if (mode !== 'faturamento') return

    async function loadHistoricalTicket() {
      setHistoricalTicketLoading(true)
      try {
        const data = await getHistoricalTicket({
          companyId: companyId!,
          ownerId: selectedSellerId ?? null,
          dateStart: toYMD(competency!.month_start),
          dateEnd: toYMD(competency!.month_end),
        })
        setHistoricalTicket(data)
      } catch (e: any) {
        console.warn('Erro ao carregar ticket histórico:', e.message)
        setHistoricalTicket(null)
      } finally {
        setHistoricalTicketLoading(false)
      }
    }

    void loadHistoricalTicket()
  }, [companyId, competency, mode, selectedSellerId])

  // Distribuição inteligente — carrega quando a aba é ativada
  useEffect(() => {
    if (activeTab !== 'distribuicao') return
    if (!companyId || !competency) return

    const cid = companyId
    const dateStart = periodStart
    const dateEnd = periodEnd

    const histEnd = dateEnd
    const histStartDate = new Date(histEnd + 'T00:00:00')
    histStartDate.setFullYear(histStartDate.getFullYear() - 2)
    const histStart = histStartDate.toISOString().slice(0, 10)

    async function loadDistribution() {
      setDistributionLoading(true)
      setDistributionError(null)

      try {
        const [wdVocationSummary, monthlyPerfSummary, radarSummary] = await Promise.allSettled([
          getWeekdayVocation({
            companyId: cid,
            ownerId: selectedSellerId ?? null,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
          getMonthlySeasonalityPerformance({
            companyId: cid,
            ownerId: selectedSellerId ?? null,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
          getPeriodRadar({
            companyId: cid,
            ownerId: selectedSellerId ?? null,
            dateStart: histStart,
            dateEnd: histEnd,
          }),
        ])

        const inputSignals: DistributionInputSignals = {}

        if (wdVocationSummary.status === 'fulfilled') {
          const summary = wdVocationSummary.value
          const wdMap: DistributionInputSignals['weekdayVocation'] = {}
          for (const row of summary.rows) {
            const pSignal = row.signals.find((s) => s.type === 'prospeccao')
            const fSignal = row.signals.find((s) => s.type === 'fechamento')
            const fuSignal = row.signals.find((s) => s.type === 'followup')
            const nSignal = row.signals.find((s) => s.type === 'negociacao')
            wdMap[row.weekday] = {
              dominant_vocation: row.dominant_vocation,
              dominant_confidence: row.dominant_confidence,
              prospeccao_strength: pSignal?.strength ?? 0,
              fechamento_strength: fSignal?.strength ?? 0,
              followup_strength: fuSignal?.strength ?? 0,
              negociacao_strength: nSignal?.strength ?? 0,
            }
          }
          inputSignals.weekdayVocation = wdMap
        }

        if (monthlyPerfSummary.status === 'fulfilled') {
          const summary = monthlyPerfSummary.value
          const currentMonth = new Date(dateStart + 'T00:00:00').getMonth() + 1
          const monthRow = summary.rows.find((r) => r.month === currentMonth) ?? null
          if (monthRow) {
            inputSignals.monthlySeasonality = {
              month: monthRow.month,
              leads_trabalhados: monthRow.leads_trabalhados,
              ganhos: monthRow.ganhos,
              base_suficiente_trabalho: monthRow.base_suficiente_trabalho,
              base_suficiente_ganho: monthRow.base_suficiente_ganho,
              taxa_ganho: monthRow.taxa_ganho,
            }
          }
        }

        if (radarSummary.status === 'fulfilled') {
          const r = radarSummary.value
          inputSignals.periodRadar = {
            status: r.status,
            confidence: r.confidence,
            score_interno: r.score_interno,
          }
        }

        const totalLeadsForDist = theory10020Result?.leads_para_contatar
          ?? Math.ceil(targetWins / Math.max(0.01, percentToRate(closeRatePercent)))

        const totalWinsForDist = targetWins

        const dist = buildCalendarDistribution(
          {
            dateStart,
            dateEnd,
            workDays,
            totalLeads: Math.max(0, totalLeadsForDist),
            totalWins: Math.max(0, totalWinsForDist),
            closeRate: percentToRate(closeRatePercent),
          },
          inputSignals,
        )

        setDistribution(dist)
      } catch (e: any) {
        setDistributionError(e?.message ?? 'Erro ao gerar distribuição.')
        setDistribution(null)
      } finally {
        setDistributionLoading(false)
      }
    }

    void loadDistribution()
  }, [activeTab, companyId, periodStart, periodEnd, selectedSellerId, targetWins, closeRatePercent, workDays, theory10020Result?.leads_para_contatar])

  async function handleSaveGoal() {
    if (!isAdmin) return
    if (!companyId || !competency) return

    const goalValue = Math.max(0, safeNumber(revenueGoalInputText))

    setGoalSaving(true)
    setGoalError(null)
    setGoalSuccess(null)

    try {
      await upsertRevenueGoal({
        companyId,
        ownerId: revenueGoalOwnerId ?? null,
        startDate: revenueDates.start,
        endDate: revenueDates.end,
        goalValue,
      })

      setRevenueGoalDb(goalValue)
      setRevenueGoalInputText(String(goalValue))
      setGoalSuccess('✓ Meta salva!')
    } catch (e: any) {
      setGoalError(e?.message ?? 'Erro ao salvar meta.')
    } finally {
      setGoalSaving(false)
    }
  }

  // revenue (dados)
  useEffect(() => {
    if (!competency || !companyId) return

    async function loadRevenue() {
      if (mode === 'ganhos') {
        setRevenueCompany(null)
        setRevenueSeller(null)
        setRevenueError(null)
        return
      }

      setRevenueLoading(true)
      setRevenueError(null)

      const cid = companyId
      const metric = mode === 'faturamento' ? 'faturamento' : 'recebimento'
      const startDate = revenueDates.start
      const endDate = revenueDates.end

      try {
        const fetches: Array<Promise<void>> = []

        if (isAdmin) {
          fetches.push(
            (async () => {
              const companyRes = await getRevenueSummary({
                companyId: cid,
                ownerId: null,
                startDate,
                endDate,
                metric,
              })
              setRevenueCompany(companyRes)
            })(),
          )
        } else {
          setRevenueCompany(null)
        }

        const ownerIdForSeller = selectedSellerId ?? null
        if (ownerIdForSeller) {
          fetches.push(
            (async () => {
              const sellerRes = await getRevenueSummary({
                companyId: cid,
                ownerId: ownerIdForSeller,
                startDate,
                endDate,
                metric,
              })
              setRevenueSeller(sellerRes)
            })(),
          )
        } else {
          setRevenueSeller(null)
        }

        await Promise.all(fetches)
      } catch (e: any) {
        console.warn('Erro ao carregar revenue:', e?.message ?? String(e))
        setRevenueError(e?.message ?? 'Erro ao carregar faturamento/recebimento.')
        setRevenueCompany(null)
        setRevenueSeller(null)
      } finally {
        setRevenueLoading(false)
      }
    }

    void loadRevenue()
  }, [mode, competency, companyId, isAdmin, selectedSellerId, revenueDates.start, revenueDates.end])

  function buildRevenueKpis(totalReal: number, goal: number) {
    const safeGoal = Math.max(0, Number(goal) || 0)

    const businessDaysTotal = countWorkDaysInRange(revenueDates.start, revenueDates.end, workDays)
    const businessDaysElapsed = countWorkDaysUntilToday(revenueDates.start, revenueDates.end, workDays)
    const businessDaysRemaining = Math.max(0, businessDaysTotal - businessDaysElapsed)

    const gap = Math.max(0, safeGoal - totalReal)
    const requiredPerBD = businessDaysRemaining > 0 ? gap / businessDaysRemaining : gap

    const avgDaily = businessDaysElapsed > 0 ? totalReal / businessDaysElapsed : 0
    const projection = avgDaily * Math.max(1, businessDaysTotal)

    const pacingRatio = safeGoal > 0 ? projection / safeGoal : 0
    const status = getRevenueStatus(pacingRatio)

    return {
      goal: safeGoal,
      businessDaysTotal,
      businessDaysElapsed,
      businessDaysRemaining,
      totalReal,
      gap,
      required_per_business_day: requiredPerBD,
      projection,
      pacingRatio,
      status,
    }
  }

  const revenueCompanyKpis = useMemo(() => {
    if (!revenueCompany?.success) return null
    return buildRevenueKpis(Number(revenueCompany.total_real || 0), activeGoalForKpis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueCompany, activeGoalForKpis, revenueDates.start, revenueDates.end, workDays])

  const revenueSellerKpis = useMemo(() => {
    if (!revenueSeller?.success) return null
    return buildRevenueKpis(Number(revenueSeller.total_real || 0), activeGoalForKpis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueSeller, activeGoalForKpis, revenueDates.start, revenueDates.end, workDays])

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 18, opacity: 0.7 }}>Carregando simulador...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid #3a2222',
            background: '#160b0b',
            color: '#ffb3b3',
          }}
        >
          {error}
        </div>
      </div>
    )
  }

  const progressTone =
    (result?.progress_pct ?? 0) >= 1 ? 'good' : (result?.progress_pct ?? 0) >= 0.5 ? 'neutral' : 'bad'

  const revenueMetricLabel = mode === 'faturamento' ? 'Faturamento' : 'Recebimento'
  const showRevenueMode = mode !== 'ganhos'
  const showCompanyChart = showRevenueMode && isAdmin
  const showSellerChart = showRevenueMode && selectedSellerId !== null


  const daysLabels: Array<{ dow: number; label: string }> = [
    { dow: 1, label: 'Seg' },
    { dow: 2, label: 'Ter' },
    { dow: 3, label: 'Qua' },
    { dow: 4, label: 'Qui' },
    { dow: 5, label: 'Sex' },
    { dow: 6, label: 'Sáb' },
    { dow: 0, label: 'Dom' },
  ]

  return (
    <div style={{ maxWidth: 1200, marginLeft: 'auto', marginRight: 'auto', padding: '0 0 40px' }}>

      {/* ================================================================ */}
      {/* COMPACT HEADER — sempre visível acima das abas                   */}
      {/* ================================================================ */}
      <div style={{
        borderBottom: '1px solid rgba(59,130,246,0.18)',
        paddingBottom: 16,
        marginBottom: 12,
        padding: '16px 18px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 60%, rgba(13,15,20,0.95) 100%)',
        border: '1px solid rgba(59,130,246,0.18)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(59,130,246,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Simulador de Meta</h1>
          {periodStart && periodEnd ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#546070' }}>Período:</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #1a1d2e',
                  background: '#111318',
                  color: '#edf2f7',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 11, color: '#546070' }}>a</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #1a1d2e',
                  background: '#111318',
                  color: '#edf2f7',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              />
              {competency ? (
                <button
                  onClick={() => {
                    const rawEnd = new Date(toYMD(competency.month_end) + 'T00:00:00')
                    rawEnd.setDate(rawEnd.getDate() - 1)
                    setPeriodStart(toYMD(competency.month_start))
                    setPeriodEnd(rawEnd.toISOString().slice(0, 10))
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #1a1d2e',
                    background: '#0d0f14',
                    color: '#8fa3bc',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                  title="Voltar ao período da competência ativa"
                >
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

                {/* ── ROW 1: Seller + Mode + Ticket + Meta ────────────── */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

{/* Seller selector (admin only) */}
{isAdmin ? (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
    <IconUsers size={15} color="#60a5fa" />
    <select
      value={selectedSellerId ?? 'all'}
      onChange={(e) => {
        const val = e.target.value
        setSelectedSellerId(val === 'all' ? null : val)
      }}
      style={{
        padding: '8px 12px 8px 8px',
        borderRadius: 8,
        border: '1px solid #1a1d2e',
        background: '#0d0f14',
        color: '#edf2f7',
        fontSize: 13,
        fontWeight: 600,
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238fa3bc' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        paddingRight: 28,
        cursor: 'pointer',
        outline: 'none',
        transition: 'border-color 150ms ease',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
      onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1d2e' }}
    >
      <option value="all">Empresa (todos)</option>
      {sellers.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  </div>
) : null}

{/* Mode selector */}
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <IconBarChart size={15} color="#60a5fa" />
  <select
    value={mode}
    onChange={(e) => {
      const newMode = e.target.value as SimulatorMode
      setMode(newMode)
      if (newMode === 'ganhos' && (activeTab === 'evolucao' || activeTab === 'teoria')) {
        setActiveTab('taxa-resultado')
      }
    }}
    style={{
      padding: '8px 12px 8px 8px',
      borderRadius: 8,
      border: '1px solid #1a1d2e',
      background: '#0d0f14',
      color: '#edf2f7',
      fontSize: 13,
      fontWeight: 600,
      appearance: 'none',
      WebkitAppearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238fa3bc' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 8px center',
      paddingRight: 28,
      cursor: 'pointer',
      outline: 'none',
      transition: 'border-color 150ms ease',
    }}
    onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
    onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1d2e' }}
  >
    <option value="ganhos">Ganhos (ciclos)</option>
    <option value="faturamento">Faturamento (R$)</option>
  </select>
</div>

{/* Ticket Médio (quando mode === faturamento) */}
{mode === 'faturamento' && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 130 }}>
    <span style={{ fontSize: 12, color: '#8fa3bc' }}>Ticket Médio:</span>
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        onClick={() => setTicketSource('manual')}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: ticketSource === 'manual' ? '1px solid #3b82f6' : '1px solid #1a1d2e',
          background: ticketSource === 'manual' ? 'rgba(59,130,246,0.15)' : '#111318',
          color: ticketSource === 'manual' ? '#93c5fd' : '#8fa3bc',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: ticketSource === 'manual' ? 700 : 400,
        }}
      >
        Manual
      </button>
      <button
        onClick={() => setTicketSource('historico')}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: ticketSource === 'historico' ? '1px solid #10b981' : '1px solid #1a1d2e',
          background: ticketSource === 'historico' ? 'rgba(16,185,129,0.15)' : '#111318',
          color: ticketSource === 'historico' ? '#6ee7b7' : '#8fa3bc',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: ticketSource === 'historico' ? 700 : 400,
        }}
      >
        Histórico
      </button>
    </div>
    {ticketSource === 'manual' ? (
      <input
        type="text"
        inputMode="decimal"
        value={ticketMedioText}
        onChange={(e) => setTicketMedioText(e.target.value)}
        onFocus={() => {
          const n = Math.max(0, safeNumber(ticketMedioText))
          setTicketMedioText(String(n))
        }}
        onBlur={() => {
          const n = Math.max(0, safeNumber(ticketMedioText))
          setTicketMedioText(toBRL(n))
        }}
        style={{
          width: 120,
          padding: '6px 8px',
          borderRadius: 8,
          border: '1px solid #1a1d2e',
          background: '#111318',
          color: 'white',
          fontWeight: 700,
          fontSize: 13,
        }}
      />
    ) : (
      <span style={{ fontSize: 13, fontWeight: 700, color: historicalTicket?.is_sufficient ? '#6ee7b7' : '#fca5a5' }}>
        {historicalTicketLoading
          ? '...'
          : historicalTicket?.is_sufficient
            ? toBRL(historicalTicket.ticket_medio)
            : 'Insuficiente'}
      </span>
    )}
    {ticketSource === 'historico' && historicalTicket?.is_sufficient && (
      <span style={{ fontSize: 10, color: '#546070' }}>
        ({historicalTicket.sample_size} vendas)
      </span>
    )}
    {ticketSource === 'historico' && !historicalTicketLoading && !historicalTicket?.is_sufficient && (
      <button
        onClick={() => setTicketSource('manual')}
        style={{
          padding: '3px 8px',
          borderRadius: 6,
          border: '1px solid #1a1d2e',
          background: '#111318',
          color: '#8fa3bc',
          cursor: 'pointer',
          fontSize: 10,
        }}
      >
        Usar manual
      </button>
    )}
  </div>
)}
</div>

{/* ── BLOCO: TAXA DE CONVERSÃO ────────────── */}
{(() => {
const taxaRealDecimal = rateRealData?.vendor?.close_rate ?? null
const taxaPlanejadaDecimal = closeRatePercent / 100
const diferencaPp = taxaRealDecimal !== null
  ? (taxaPlanejadaDecimal - taxaRealDecimal) * 100
  : null

let diagnostico = ''
let diagnosticoColor = '#a78bfa'
if (taxaRealDecimal !== null) {
  if (taxaPlanejadaDecimal > taxaRealDecimal * 1.1) {
    diagnostico = 'Plano otimista'
    diagnosticoColor = '#f59e0b'
  } else if (taxaPlanejadaDecimal >= taxaRealDecimal * 0.9) {
    diagnostico = 'Plano realista'
    diagnosticoColor = '#10b981'
  } else {
    diagnostico = 'Plano conservador'
    diagnosticoColor = '#60a5fa'
  }
}

return (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '8px 14px',
    marginTop: 10,
    borderRadius: 10,
    border: '1px solid rgba(59,130,246,0.25)',
    background: 'linear-gradient(90deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 100%)',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: '#8fa3bc' }}>Real:</span>
      <span style={{ fontWeight: 900, color: taxaRealDecimal !== null ? '#22d3ee' : 'rgba(255,255,255,0.25)' }}>
        {taxaRealDecimal !== null ? `${(taxaRealDecimal * 100).toFixed(1)}%` : '—'}
      </span>
      {rateRealData?.vendor?.worked ? (
        <span style={{ fontSize: 10, opacity: 0.4 }}>({rateRealData.vendor.worked} ciclos)</span>
      ) : null}
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: '#8fa3bc' }}>Planejada:</span>
      <input
        type="number"
        step="1"
        min="1"
        max="90"
        value={closeRatePercent}
        onChange={(e) => {
          const val = parseFloat(e.target.value) || 1
          setCloseRatePercent(Math.max(1, Math.min(90, val)))
        }}
        style={{
          width: 48,
          padding: '3px 6px',
          borderRadius: 6,
          border: '1px solid rgba(59,130,246,0.3)',
          background: 'rgba(17,19,24,0.8)',
          color: '#f59e0b',
          fontSize: 13,
          fontWeight: 900,
        }}
      />
      <span style={{ fontWeight: 900, color: '#f59e0b' }}>%</span>
    </div>

    {diferencaPp !== null ? (
      <span style={{ opacity: 0.7 }}>
        <strong style={{ color: diferencaPp > 0 ? '#f59e0b' : diferencaPp < 0 ? '#60a5fa' : '#10b981' }}>
          {diferencaPp > 0 ? '+' : ''}{diferencaPp.toFixed(1)}pp
        </strong>
      </span>
    ) : null}

    {diagnostico ? (
      <span style={{ fontWeight: 700, color: diagnosticoColor }}>{diagnostico}</span>
    ) : null}

    <div style={{ height: 18, width: 1, background: 'rgba(59,130,246,0.2)', flexShrink: 0 }} />

    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#8fa3bc' }}>Usar:</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
        <input
          type="radio"
          name="rateSourceHeader"
          value="planejada"
          checked={rateSource === 'planejada'}
          onChange={() => setRateSource('planejada')}
          style={{ accentColor: '#f59e0b' }}
        />
        <span style={{ fontWeight: rateSource === 'planejada' ? 700 : 400 }}>Planejada</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: taxaRealDecimal !== null ? 'pointer' : 'not-allowed', opacity: taxaRealDecimal !== null ? 1 : 0.4 }}>
        <input
          type="radio"
          name="rateSourceHeader"
          value="real"
          checked={rateSource === 'real'}
          onChange={() => setRateSource('real')}
          disabled={taxaRealDecimal === null}
          style={{ accentColor: '#22d3ee' }}
        />
        <span style={{ fontWeight: rateSource === 'real' ? 700 : 400 }}>Real</span>
      </label>
    </div>

    <span style={{ fontSize: 11, opacity: 0.5 }}>
      Mult: <strong style={{ color: '#f59e0b' }}>×{taxaUsadaNoCalculo > 0 ? (1 / taxaUsadaNoCalculo).toFixed(2) : '—'}</strong>
    </span>
  </div>
)
})()}

{/* ��─ BLOCO: DIAS DA SEMANA + AUTO DIAS + DIAS REST. ────────────── */}
<div style={{
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
gap: 12,
flexWrap: 'wrap',
padding: '8px 14px',
marginTop: 6,
borderRadius: 10,
border: '1px solid rgba(59,130,246,0.25)',
background: 'linear-gradient(90deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 100%)',
fontSize: 12,
width: '100%',
boxSizing: 'border-box',
}}>
<div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
  {daysLabels.map(({ dow, label }) => {
    const isActive = !!workDays[dow]
    return (
      <button
        key={dow}
        type="button"
        onClick={() => setWorkDays((prev) => ({ ...prev, [dow]: !prev[dow] }))}
        style={{
          padding: '5px 10px',
          borderRadius: 6,
          border: isActive ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
          background: isActive
            ? 'linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.08) 100%)'
            : 'transparent',
          color: isActive ? '#93c5fd' : '#546070',
          fontSize: 12,
          fontWeight: isActive ? 700 : 400,
          cursor: 'pointer',
          transition: 'all 150ms ease',
          lineHeight: 1,
        }}
      >
        {label}
      </button>
    )
  })}
</div>

<button
  type="button"
  onClick={() => setAutoRemainingDays((prev) => !prev)}
  style={{
    padding: '5px 10px',
    borderRadius: 6,
    border: autoRemainingDays ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
    background: autoRemainingDays
      ? 'linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.08) 100%)'
      : 'transparent',
    color: autoRemainingDays ? '#93c5fd' : '#546070',
    fontSize: 11,
    fontWeight: autoRemainingDays ? 700 : 400,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    lineHeight: 1,
  }}
>
  Auto dias
</button>

<div style={{ height: 18, width: 1, background: 'rgba(59,130,246,0.2)', flexShrink: 0 }} />

<div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
  <span style={{ color: '#8fa3bc' }}>Dias rest.:</span>
  <input
    type="number"
    value={remainingBusinessDays}
    onChange={(e) => setRemainingBusinessDays(Math.max(0, parseInt(e.target.value) || 0))}
    disabled={autoRemainingDays}
    style={{
      width: 48,
      padding: '3px 6px',
      borderRadius: 6,
      border: '1px solid rgba(59,130,246,0.3)',
      background: autoRemainingDays ? 'rgba(13,15,20,0.8)' : 'rgba(17,19,24,0.8)',
      color: 'white',
      fontSize: 13,
      fontWeight: 900,
      opacity: autoRemainingDays ? 0.65 : 1,
      cursor: autoRemainingDays ? 'not-allowed' : 'text',
    }}
  />
</div>
<div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
  <span style={{ color: '#8fa3bc' }}>Dias rest.:</span>
  <input
    type="number"
    value={remainingBusinessDays}
    onChange={(e) => setRemainingBusinessDays(Math.max(0, parseInt(e.target.value) || 0))}
    disabled={autoRemainingDays}
    style={{
      width: 48,
      padding: '3px 6px',
      borderRadius: 6,
      border: '1px solid rgba(59,130,246,0.3)',
      background: autoRemainingDays ? 'rgba(13,15,20,0.8)' : 'rgba(17,19,24,0.8)',
      color: 'white',
      fontSize: 13,
      fontWeight: 900,
      opacity: autoRemainingDays ? 0.65 : 1,
      cursor: autoRemainingDays ? 'not-allowed' : 'text',
    }}
  />
</div>
</div>

{/* ── Meta R$ (esquerda) + Salvar/Desfazer (direita) ── */}
{showRevenueMode ? (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8fa3bc' }}>Meta R$:</span>
      <input
        type="text"
        inputMode="decimal"
        value={revenueGoalInputText}
        onChange={(e) => setRevenueGoalInputText(e.target.value)}
        onFocus={() => {
          const n = Math.max(0, safeNumber(revenueGoalInputText))
          setRevenueGoalInputText(String(n))
        }}
        onBlur={() => {
          const n = Math.max(0, safeNumber(revenueGoalInputText))
          setRevenueGoalInputText(toBRL(n))
        }}
        disabled={!isAdmin || goalLoading || goalSaving}
        style={{
          width: 130,
          padding: '6px 8px',
          borderRadius: 8,
          border: '1px solid #1a1d2e',
          background: !isAdmin ? '#0d0f14' : '#111318',
          color: 'white',
          fontWeight: 700,
          fontSize: 13,
        }}
      />
      {goalLoading ? <span style={{ fontSize: 11, color: '#8fa3bc' }}>Carregando...</span> : null}
      {goalError ? <span style={{ fontSize: 11, color: '#ffb3b3' }}>{goalError}</span> : null}
      {goalSuccess ? <span style={{ fontSize: 11, color: '#6ee7b7' }}>{goalSuccess}</span> : null}
    </div>
    {isAdmin ? (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => void handleSaveGoal()}
          disabled={goalSaving || goalLoading}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: '1px solid rgba(59,130,246,0.4)',
            background: 'linear-gradient(90deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.12) 100%)',
            color: '#93c5fd',
            fontWeight: 700,
            fontSize: 12,
            cursor: goalSaving || goalLoading ? 'not-allowed' : 'pointer',
            opacity: goalSaving || goalLoading ? 0.5 : 1,
            transition: 'all 150ms ease',
            letterSpacing: '0.02em',
          }}
        >
          {goalSaving ? '...' : 'Salvar'}
        </button>
        <button
          onClick={() => setRevenueGoalInputText(String(revenueGoalDb))}
          disabled={goalSaving || goalLoading}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid #1a1d2e',
            background: '#0d0f14',
            color: '#8fa3bc',
            fontSize: 12,
            fontWeight: 500,
            cursor: goalSaving || goalLoading ? 'not-allowed' : 'pointer',
            opacity: goalSaving || goalLoading ? 0.5 : 1,
            transition: 'all 150ms ease',
          }}
        >
          Desfazer
        </button>
      </div>
    ) : null}
  </div>
) : null}
      </div>

      {/* ================================================================ */}
      {/* TAB NAVIGATION                                                    */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <button onClick={() => setActiveTab('teoria')} style={tabStyle(activeTab === 'teoria')}>
          Esforço Máximo
        </button>
        {showRevenueMode ? (
          <button onClick={() => setActiveTab('evolucao')} style={tabStyle(activeTab === 'evolucao')}>
            Evolução
          </button>
        ) : null}
        <button onClick={() => setActiveTab('taxa-resultado')} style={tabStyle(activeTab === 'taxa-resultado')}>
          Taxa e Resultado
        </button>
        <button onClick={() => setActiveTab('funil')} style={tabStyle(activeTab === 'funil')}>
          Funil do Período
        </button>
        <button onClick={() => setActiveTab('distribuicao')} style={tabStyle(activeTab === 'distribuicao')}>
          Distribuição
        </button>
      </div>

      {/* ================================================================ */}
      {/* TAB CONTENT                                                       */}
      {/* ================================================================ */}
      <div style={{ display: 'grid', gap: 16 }}>

        {/* ============================================================ */}
        {/* ABA 1: ESFORÇO MÁXIMO                                         */}
        {/* ============================================================ */}
        {activeTab === 'teoria' && (
          mode === 'faturamento' ? (
            <Section
              title={
                <TitleWithTip label="Esforço Máximo — Planejamento Operacional" tipTitle="O que é o Esforço Máximo?" width={480}>
                  <div style={{ display: 'grid', gap: 8 }}>
                  <div>O cálculo usa <strong>1 ÷ taxa de conversão</strong> como multiplicador. Com 20% → ×5, com 15% → ×6.67, com 25% → ×4.</div>
                    <div>Meta × Multiplicador = Esforço → Esforço ÷ Ticket = Leads → Leads × Taxa = Ganhos</div>
                    <div>Os resultados finais mostram quantos leads e ganhos você precisa por dia.</div>
                  </div>
                </TitleWithTip>
              }
              description="Converte sua meta de faturamento em volume de leads e ganhos diários usando o multiplicador dinâmico (1 ÷ taxa)"
            >
              <div style={{ display: 'grid', gap: 28 }}>

              

                {/* ── BLOCO 2: RESULTADO DO ESFORÇO MÁXIMO ──────────────── */}
                {theory10020Result ? (() => {
                  const t = theory10020Result
                  return (
                    <>
                      <div style={{
                        padding: '20px 18px',
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.03) 60%, rgba(13,15,20,0.95) 100%)',
                        border: '1px solid rgba(59,130,246,0.20)',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(59,130,246,0.06)',
                      }}>
                        <div style={{
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.12em',
                          color: 'rgba(147,197,253,0.5)',
                          marginBottom: 14,
                          paddingLeft: 10,
                          borderLeft: '2px solid rgba(59,130,246,0.4)',
                        }}>
                          Resultado do Esforço Máximo
                        </div>

                        {/* Row 2: Steps 5 → 9 */}
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                          {/* Step 5 — Ticket médio */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: '#0d0f14', borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #8b5cf6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <IconTag size={16} color="#a78bfa" />
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Ticket médio</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#a78bfa', lineHeight: 1 }}>{toBRL(t.ticket_medio)}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>ticket médio</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 8, color: 'rgba(255,255,255,0.18)', fontSize: 20, fontWeight: 300, flexShrink: 0 }}>÷</div>

                          {/* Step 6 — Leads para contatar */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: '#0d0f14', borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #06b6d4' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <IconCrosshair size={16} color="#22d3ee" />
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Leads para contatar</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#22d3ee', lineHeight: 1 }}>{t.leads_para_contatar}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>esforço ÷ ticket</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 6, color: 'rgba(16,185,129,0.5)', fontSize: 12, fontWeight: 300, flexShrink: 0, flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>×taxa</span>
                            <span style={{ fontSize: 14 }}>→</span>
                          </div>

                          {/* Step 7 — Ganhos esperados */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: '#0d0f14', borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #10b981' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <IconTrophy size={16} color="#10b981" />
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Ganhos esperados</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#10b981', lineHeight: 1 }}>{t.ganhos_esperados}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>leads × conversão</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 6, color: 'rgba(255,255,255,0.18)', fontSize: 12, fontWeight: 300, flexShrink: 0, flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>÷dias</span>
                            <span style={{ fontSize: 14 }}>→</span>
                          </div>

                          {/* Step 8 — Leads por dia útil */}
                          {(() => {
                            const lpdColor = t.leads_por_dia > 15 ? '#ef4444' : '#22d3ee'
                            return (
                              <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: '#0d0f14', borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: `3px solid ${lpdColor}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <IconZap size={16} color={lpdColor} />
                                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Leads por dia útil</div>
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: lpdColor, lineHeight: 1 }}>{t.leads_por_dia}</div>
                                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>leads ÷ dias úteis</div>
                              </div>
                            )
                          })()}

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 8, color: 'rgba(255,255,255,0.10)', fontSize: 20, fontWeight: 100, flexShrink: 0 }}>|</div>

                          {/* Step 9 — Ganhos por dia útil */}
                          {(() => {
                            const gpdColor = t.ganhos_por_dia > 5 ? '#ef4444' : '#10b981'
                            return (
                              <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: '#0d0f14', borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: `3px solid ${gpdColor}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <IconCheckCircle size={16} color={gpdColor} />
                                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Ganhos por dia útil</div>
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: gpdColor, lineHeight: 1 }}>{t.ganhos_por_dia}</div>
                                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>ganhos ÷ dias úteis</div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>

                      {/* ── BLOCO 3: SITUAÇÃO ATUAL ─────────────────────────── */}
                      {!t.meta_atingida && t.gap > 0 ? (
                        <div style={{
                          padding: '20px 18px',
                          borderRadius: 14,
                          background: 'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 50%, rgba(13,15,20,0.95) 100%)',
                          border: '1px solid rgba(59,130,246,0.18)',
                          boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(59,130,246,0.05)',
                        }}>
                          <div style={{
                            fontSize: 10,
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            color: 'rgba(147,197,253,0.5)',
                            marginBottom: 14,
                            paddingLeft: 10,
                            borderLeft: '2px solid rgba(239,68,68,0.4)',
                          }}>
                            Situação atual
                          </div>
                          {(() => {
                            const progressPct = t.progress_pct
                            const pctRounded = Math.round(progressPct * 100)
                            const barColor = progressPct >= 0.8 ? '#10b981' : progressPct >= 0.5 ? '#f59e0b' : '#ef4444'
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={{ padding: '18px 20px', borderRadius: 14, background: 'rgba(13,15,20,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
                                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 8 }}>Realizado</div>
                                  <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.5px', color: barColor, lineHeight: 1 }}>{toBRL(t.total_real)}</div>
                                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6, marginBottom: 16 }}>de {toBRL(t.meta_total)} ({pctRounded}%)</div>
                                  <div style={{ height: 8, borderRadius: 4, background: '#1a1d2e', overflow: 'hidden' }}>
                                    <div
                                      role="progressbar"
                                      aria-valuenow={Math.min(pctRounded, 100)}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                      aria-label={`Progresso: ${pctRounded}%`}
                                      style={{
                                        height: '100%',
                                        borderRadius: 4,
                                        width: `${Math.min(pctRounded, 100)}%`,
                                        background: `linear-gradient(90deg, #ef4444, ${barColor})`,
                                        transition: 'width 0.6s ease',
                                      }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                                    <span>0%</span>
                                    <span style={{ color: barColor, fontWeight: 700 }}>{pctRounded}%</span>
                                    <span>100%</span>
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                  <div style={{ gridColumn: '1 / -1', padding: '14px 16px', borderRadius: 12, background: 'rgba(13,15,20,0.7)', borderTop: '1px solid rgba(59,130,246,0.12)', borderRight: '1px solid rgba(59,130,246,0.12)', borderBottom: '1px solid rgba(59,130,246,0.12)', borderLeft: '3px solid #ef4444' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Falta para a meta</div>
                                    <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#ef4444', lineHeight: 1 }}>{toBRL(t.gap)}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.6)', marginTop: 4 }}>Meta − Realizado</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(13,15,20,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Leads restantes</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#22d3ee', lineHeight: 1 }}>{t.leads_restantes}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>gap × {t.multiplicador.toFixed(2)} ÷ ticket</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(13,15,20,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Ganhos restantes</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{t.ganhos_restantes}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>leads rest. × conversão</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(13,15,20,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Leads restantes/dia</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#22d3ee', lineHeight: 1 }}>{t.leads_restantes_por_dia}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>leads rest. ÷ dias úteis</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(13,15,20,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Ganhos restantes/dia</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{t.ganhos_restantes_por_dia}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>ganhos rest. ÷ dias úteis</div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      ) : null}

                      {/* ── BANNER META ATINGIDA ────────────────────────────── */}
                      {t.meta_atingida && (
                        <div style={{
                          padding: '24px 28px',
                          borderRadius: 16,
                          background: 'linear-gradient(135deg, #064e3b, #065f46, #047857)',
                          border: '1px solid rgba(110,231,183,0.3)',
                          boxShadow: '0 0 40px rgba(16,185,129,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                        }}>
                          <div style={{ fontSize: 40 }} aria-label="Celebração">🎉</div>
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: '#6ee7b7', letterSpacing: '-0.3px' }}>Meta atingida!</div>
                            <div style={{ fontSize: 13, color: 'rgba(110,231,183,0.7)', marginTop: 4 }}>
                              Realizado <strong style={{ color: '#6ee7b7' }}>{toBRL(t.total_real)}</strong> de <strong style={{ color: '#6ee7b7' }}>{toBRL(t.meta_total)}</strong> — parabéns pelo resultado!
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── BLOCO 4: DIAGNÓSTICO OPERACIONAL ───────────────── */}
                      {!t.meta_atingida && t.gap > 0 ? (
                        <div style={{
                          padding: '20px 18px',
                          borderRadius: 14,
                          background: 'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 50%, rgba(13,15,20,0.95) 100%)',
                          border: '1px solid rgba(59,130,246,0.18)',
                          boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(59,130,246,0.05)',
                        }}>
                          <div style={{
                            fontSize: 10,
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            color: 'rgba(147,197,253,0.5)',
                            marginBottom: 14,
                            paddingLeft: 10,
                            borderLeft: '2px solid rgba(245,158,11,0.4)',
                          }}>
                            Diagnóstico operacional
                          </div>
                          <div style={{
                            padding: '20px 20px 20px 24px',
                            borderRadius: 14,
                            background: 'rgba(13,15,20,0.6)',
                            borderTop: '1px solid rgba(59,130,246,0.10)',
                            borderRight: '1px solid rgba(59,130,246,0.10)',
                            borderBottom: '1px solid rgba(59,130,246,0.10)',
                            borderLeft: '4px solid #f59e0b',
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.15)',
                          }}>
                            <div style={{ fontSize: 13, lineHeight: 1.9, color: 'rgba(255,255,255,0.8)' }}>
                              <div>
                                Para atingir a meta de{' '}
                                <strong style={{ color: '#3b82f6' }}>{toBRL(t.meta_total)}</strong>,
                                com conversão de{' '}
                                <strong style={{ color: '#22d3ee' }}>{(t.close_rate * 100).toFixed(1)}%</strong>{' '}
                                (fonte: {rateSource === 'real' && (rateRealData?.vendor?.close_rate ?? null) !== null ? 'histórica' : 'planejada'}),
                                 o multiplicador é{' '}
                                <strong style={{ color: '#f59e0b' }}>{t.multiplicador > 0 ? `×${t.multiplicador.toFixed(2)}` : '—'}</strong>.
                              </div>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
                                O esforço bruto necessário é{' '}
                                <strong style={{ color: '#fbbf24' }}>{toBRL(t.esforco_bruto)}</strong>.
                              </div>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
                                Com ticket médio de{' '}
                                <strong style={{ color: '#a78bfa' }}>{toBRL(t.ticket_medio)}</strong>,
                                são necessários{' '}
                                <strong style={{ color: '#22d3ee' }}>{t.leads_para_contatar} leads para contatar</strong>.
                              </div>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
                                Com conversão de{' '}
                                <strong style={{ color: '#22d3ee' }}>{(t.close_rate * 100).toFixed(1)}%</strong>,
                                os ganhos esperados são{' '}
                                <strong style={{ color: '#10b981' }}>{t.ganhos_esperados} fechamentos</strong>.
                              </div>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
                                Faltando{' '}
                                <strong style={{ color: '#f59e0b' }}>{remainingBusinessDays} dias úteis</strong>,
                                o ritmo necessário é{' '}
                                <strong style={{ color: '#22d3ee' }}>{t.leads_restantes_por_dia} leads/dia</strong>{' '}
                                e{' '}
                                <strong style={{ color: '#10b981' }}>{t.ganhos_restantes_por_dia} ganhos/dia</strong>{' '}
                                para fechar o gap de{' '}
                                <strong style={{ color: '#ef4444' }}>{toBRL(t.gap)}</strong>.
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )
                })() : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Informe um ticket médio maior que zero para gerar o plano operacional.
                  </div>
                )}
              </div>
            </Section>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 14, opacity: 0.5 }}>
                            Esforço Máximo disponível apenas no modo Faturamento.
            </div>
          )
        )}

        {/* ============================================================ */}
        {/* ABA 2: EVOLUÇÃO                                               */}
        {/* ============================================================ */}
        {activeTab === 'evolucao' && showRevenueMode && (
          <div style={{ display: 'grid', gap: 16 }}>
            {revenueLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando faturamento...</div> : null}
            {revenueError ? <div style={{ fontSize: 12, color: '#ffb3b3' }}>{revenueError}</div> : null}

            {showCompanyChart && revenueCompanyKpis ? (
              <MetaSummaryHeader
                title="Empresa (todos)"
                kpis={{
                  totalReal: revenueCompanyKpis.totalReal,
                  goal: revenueCompanyKpis.goal,
                  gap: revenueCompanyKpis.gap,
                  requiredPerBD: revenueCompanyKpis.required_per_business_day,
                  businessDaysRemaining: revenueCompanyKpis.businessDaysRemaining,
                  projection: revenueCompanyKpis.projection,
                  pacingRatio: revenueCompanyKpis.pacingRatio,
                  status: revenueCompanyKpis.status,
                }}
              />
            ) : null}

            {showCompanyChart && revenueCompany?.success ? (
              <RevenueChart
                title={`Evolução — Empresa (Faturamento)`}
                series={(revenueCompany.days ?? []) as RevenueDayPoint[]}
                goal={activeGoalForKpis}
                startDate={revenueDates.start}
                endDate={revenueDates.end}
              />
            ) : null}

            {showSellerChart && revenueSeller?.success ? (
              <RevenueChart
                title={`Evolução — Vendedor (Faturamento)`}
                series={(revenueSeller.days ?? []) as RevenueDayPoint[]}
                goal={activeGoalForKpis}
                startDate={revenueDates.start}
                endDate={revenueDates.end}
              />
            ) : null}

            {!showCompanyChart && !showSellerChart && !revenueLoading && !revenueError ? (
              <div style={{ fontSize: 13, opacity: 0.5, padding: 20, textAlign: 'center' }}>
                Nenhum dado de evolução disponível para o modo/seleção atual.
              </div>
            ) : null}
          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 3: TAXA E RESULTADO                                       */}
        {/* ============================================================ */}
        {activeTab === 'taxa-resultado' && (
          <div style={{ display: 'grid', gap: 16 }}>

            {/* Taxa Real */}
            {rateRealData ? (
              <Section
                title={
                  <TitleWithTip label="Taxa Histórica" tipTitle="Como ler a Taxa Histórica" width={420}>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                    <li>Taxa calculada com base no histórico de ciclos (janela selecionada).</li>
                    <li>Se a amostra for pequena (&lt;30 ciclos), a taxa pode oscilar bastante.</li>
                  </ul>
                </TitleWithTip>
                }
                description="Calculada a partir dos ciclos ganhos vs trabalhados no período selecionado."
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Card
                    title={
                      <TitleWithTip label="Taxa histórica (vendedor)" tipTitle="Taxa histórica do vendedor" width={380}>
                      <div>Ganhos ÷ Trabalhados do vendedor selecionado no período.</div>
                    </TitleWithTip>
                    }
                    value={rateRealData.vendor.close_rate ? `${(rateRealData.vendor.close_rate * 100).toFixed(1)}%` : '—'}
                    subtitle={
                      rateRealData.vendor.worked >= 30
                        ? `${rateRealData.vendor.wins} ganhos / ${rateRealData.vendor.worked} trabalhados`
                        : `Amostra pequena (${rateRealData.vendor.worked} ciclos)`
                    }
                    tone={rateRealData.vendor.worked >= 30 ? 'neutral' : 'bad'}
                  />

                  <Card
                    title={
                      <TitleWithTip label="Taxa histórica (empresa)" tipTitle="Taxa histórica da empresa" width={380}>
                      <div>Ganhos ÷ Trabalhados de toda a empresa no período.</div>
                    </TitleWithTip>
                    }
                    value={rateRealData.company.close_rate ? `${(rateRealData.company.close_rate * 100).toFixed(1)}%` : '—'}
                    subtitle={`${rateRealData.company.wins} ganhos / ${rateRealData.company.worked} trabalhados`}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select
                      value={daysWindow}
                      onChange={(e) => setDaysWindow(parseInt(e.target.value))}
                      style={{
                        padding: '8px 12px 8px 8px',
                        borderRadius: 8,
                        border: '1px solid #1a1d2e',
                        background: '#0d0f14',
                        color: '#edf2f7',
                        fontSize: 13,
                        fontWeight: 600,
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238fa3bc' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 8px center',
                        paddingRight: 28,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'border-color 150ms ease',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1d2e' }}
                    >
                      <option value={30}>Últimos 30 dias</option>
                      <option value={60}>Últimos 60 dias</option>
                      <option value={90}>Últimos 90 dias</option>
                    </select>

                    <button
                      onClick={() => {
                        if (rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30) {
                          const newPercent = Math.round(rateRealData.vendor.close_rate * 1000) / 10
                          setCloseRatePercent(newPercent)
                          setMode('ganhos')
                        }
                      }}
                      disabled={!rateRealData.vendor.close_rate || rateRealData.vendor.worked < 30}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                          ? '1px solid rgba(59,130,246,0.4)'
                          : '1px solid #1a1d2e',
                        background: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                          ? 'linear-gradient(90deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.12) 100%)'
                          : '#0d0f14',
                        color: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                          ? '#93c5fd'
                          : '#546070',
                        cursor: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 'pointer' : 'not-allowed',
                        fontWeight: 700,
                        fontSize: 12,
                        opacity: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 1 : 0.5,
                        transition: 'all 150ms ease',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Usar taxa real
                    </button>
                  </div>
                </div>

                {rateRealLoading ? <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Carregando taxa real...</div> : null}
              </Section>
            ) : null}

            {/* Resultado */}
            <Section title="Resultado" description="Números para bater sua meta.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <Card title="Ciclos Necessários" value={result?.needed_worked_cycles ?? '—'} subtitle={result ? `${result.needed_wins} ganhos ÷ ${closeRatePercent}% taxa` : undefined} />
                <Card title="Ciclos Restantes" value={result?.remaining_worked_cycles ?? '—'} subtitle={result ? `${result.remaining_wins} ganhos restantes ÷ ${closeRatePercent}%` : undefined} />
                <Card title="Ciclos/Dia (período)" value={result?.daily_worked_needed ?? '—'} subtitle={result ? `${result.needed_worked_cycles} ciclos ÷ 22 dias` : undefined} />
                <Card title="Ciclos/Dia (restante)" value={result?.daily_worked_remaining ?? '—'} subtitle={result ? `${result.remaining_worked_cycles} ciclos ÷ ${remainingBusinessDays} dias` : undefined} />
              </div>
            </Section>

            {/* Progresso */}
            <Section title="Progresso" description="Seu desempenho atual no mês.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <Card title="Ganhos Atuais" value={metrics?.current_wins ?? '—'} subtitle={result ? `${pct(result.progress_pct)} da meta (${result.needed_wins} alvo)` : undefined} tone={progressTone} />
                <Card title="Ciclos Trabalhados" value={metrics?.worked_count ?? '—'} subtitle={metrics && result ? `Taxa real: ${pct(metrics.current_wins / Math.max(1, metrics.worked_count))}` : undefined} tone="neutral" />
                <Card title="Status" value={result?.on_track ? 'No ritmo' : 'Acelerar'} tone={result?.on_track ? 'good' : 'bad'} />
              </div>
            </Section>

          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 4: FUNIL DO PERÍODO                                       */}
        {/* ============================================================ */}
        {activeTab === 'funil' && (
          <div style={{ display: 'grid', gap: 16 }}>

            <Section title="Funil do Período" description="Distribuição dos ciclos por estágio.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #3b82f6', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Novo</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#3b82f6' }}>{metrics?.counts_by_status.novo ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #06b6d4', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Contato</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#06b6d4' }}>{metrics?.counts_by_status.contato ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #eab308', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Respondeu</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#eab308' }}>{metrics?.counts_by_status.respondeu ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #8b5cf6', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Negociação</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#8b5cf6' }}>{metrics?.counts_by_status.negociacao ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #22c55e', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Ganho</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#22c55e' }}>{metrics?.counts_by_status.ganho ?? '—'}</div>
                </div>
                <div style={{ borderTop: '1px solid #1a1d2e', borderRight: '1px solid #1a1d2e', borderBottom: '1px solid #1a1d2e', borderLeft: '3px solid #ef4444', background: '#0d0f14', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: '#8fa3bc', marginBottom: 4 }}>Perdido</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#ef4444' }}>{metrics?.counts_by_status.perdido ?? '—'}</div>
                </div>
              </div>
            </Section>

            {/* Conversão por grupo */}
            {groupConversionLoading ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando funil por grupo...</div>
            ) : groupConversion.length > 0 ? (
              <Section title="Conversão por Grupo" description="Taxa de conversão por grupo de leads no período.">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1a1d2e' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Grupo</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Trabalhados</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Ganhos</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Taxa</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: '#4a5569', fontWeight: 700 }}>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupConversion.map((row, i) => (
                        <tr
                          key={row.group_id ?? i}
                          style={{ borderBottom: '1px solid #1a1d2e' }}
                        >
                          <td style={{ padding: '8px 12px' }}>{row.group_name || '—'}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.8 }}>{row.trabalhados}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', color: '#10b981' }}>{row.ganho}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', color: '#06b6d4' }}>{pct(row.pct_grupo)}</td>
                          <td style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.7 }}>{pct(row.pct_participacao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            ) : null}

          </div>
        )}

        {/* ============================================================ */}
        {/* ABA 5: DISTRIBUIÇÃO INTELIGENTE (Fase 6.6)                    */}
        {/* ============================================================ */}
        {activeTab === 'distribuicao' && (
          <div style={{ display: 'grid', gap: 16 }}>

            <Section
              title="Distribuição Inteligente da Meta"
              description="Meta diária distribuída com base na vocação operacional, sazonalidade e radar do período (Fases 6.1–6.5)."
            >
              {/* Controles */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={distributionOnlyWorking}
                    onChange={(e) => setDistributionOnlyWorking(e.target.checked)}
                  />
                  Mostrar apenas dias úteis
                </label>
                {distribution ? (
                  <span style={{ fontSize: 12, opacity: 0.5 }}>
                    {distribution.summary.total_working_days} dias úteis · {periodStart} a {periodEnd}
                  </span>
                ) : null}
              </div>

              {distributionLoading ? (
                <div style={{ fontSize: 13, opacity: 0.6, padding: '12px 0' }}>
                  Carregando distribuição...
                </div>
              ) : distributionError ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#160b0b',
                    border: '1px solid #3a2222',
                    color: '#ffb3b3',
                    fontSize: 13,
                  }}
                >
                  {distributionError}
                </div>
              ) : distribution ? (
                <SimulatorDistributionSummary distribution={distribution} />
              ) : (
                <div style={{ fontSize: 13, opacity: 0.5, padding: '12px 0' }}>
                  Selecione a aba Distribuição para gerar o calendário de metas.
                </div>
              )}
            </Section>

            {distribution && !distributionLoading ? (
              <Section
                title="Calendário Diário"
                description="Meta de leads e ganhos por dia útil. Clique em uma linha para ver o motivo da distribuição."
              >
                <SimulatorDailyDistributionTable
                  distribution={distribution}
                  onlyWorkingDays={distributionOnlyWorking}
                />
              </Section>
            ) : null}

          </div>
        )}

      </div>
    </div>
  )
}