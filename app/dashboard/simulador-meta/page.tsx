'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
  const border =
    tone === 'good' ? '1px solid #1f5f3a' : tone === 'bad' ? '1px solid #5f1f1f' : '1px solid #2a2a2a'
  const bg = tone === 'good' ? '#07140c' : tone === 'bad' ? '#140707' : '#0f0f0f'

  return (
    <div style={{ border, background: bg, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.2 }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>{subtitle}</div> : null}
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
    <section style={{ border: '1px solid #202020', background: '#0c0c0c', borderRadius: 16, padding: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>{title}</div>
        {description ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{description}</div> : null}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  )
}

function tabStyle(isActive: boolean) {
  return {
    padding: '8px 18px',
    background: isActive ? '#1d4ed8' : '#1a1a1a',
    color: isActive ? '#fff' : '#aaa',
    border: isActive ? '1px solid #3b82f6' : '1px solid #333',
    borderRadius: 8,
    cursor: 'pointer' as const,
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
  }
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
    if (!competency) return
    if (!autoRemainingDays) return

    const endDate = new Date(toYMD(competency.month_end) + 'T00:00:00')
    const remainingDays = countRemainingWorkDays(endDate, workDays)
    setRemainingBusinessDays(remainingDays)
  }, [competency, workDays, autoRemainingDays])

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

  // refetch metrics quando muda vendedor
  useEffect(() => {
    if (!competency || selectedSellerId === undefined) return
    async function refetch() {
      try {
        const newMetrics = await getSalesCycleMetrics(selectedSellerId, competency.month_start)
        setMetrics(newMetrics)
      } catch (e: any) {
        setError(e?.message ?? 'Erro ao atualizar métricas.')
      }
    }
    void refetch()
  }, [competency, selectedSellerId])

  // conversão por grupo
  useEffect(() => {
    if (!competency || !companyId || selectedSellerId === undefined) return

    const cid = companyId
    const dateEnd = toYMD(competency.month_end)

    async function loadGroupConversion() {
      setGroupConversionLoading(true)
      try {
        const rows = await getGroupConversion({
          companyId: cid,
          ownerId: selectedSellerId,
          dateStart: toYMD(competency.month_start),
          dateEnd,
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
  }, [competency, selectedSellerId, companyId])

  const revenueDates = useMemo(() => {
    if (!competency) return { start: '', end: '' }
    return {
      start: toYMD(competency.month_start),
      end: toYMD(competency.month_end),
    }
  }, [competency])

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
  // rateSource === 'real' uses the historical vendor rate; 'planejada' uses closeRatePercent
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
    const dateStart = toYMD(competency.month_start)
    const dateEnd = toYMD(competency.month_end)

    // Lookback histórico: 2 anos para ter sazonalidade robusta
    const histEnd = dateEnd
    const histStartDate = new Date(histEnd + 'T00:00:00')
    histStartDate.setFullYear(histStartDate.getFullYear() - 2)
    const histStart = histStartDate.toISOString().slice(0, 10)

    async function loadDistribution() {
      setDistributionLoading(true)
      setDistributionError(null)

      try {
        // Carregar sinais das Fases anteriores em paralelo
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

        // Construir sinais de entrada
        const inputSignals: DistributionInputSignals = {}

        // Vocação por dia da semana
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

        // Sazonalidade do mês atual
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

        // Radar do período
        if (radarSummary.status === 'fulfilled') {
          const r = radarSummary.value
          inputSignals.periodRadar = {
            status: r.status,
            confidence: r.confidence,
            score_interno: r.score_interno,
          }
        }

        // Calcular total de leads a partir da Teoria 100/20 ou da meta simples
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
  }, [activeTab, companyId, competency, selectedSellerId, targetWins, closeRatePercent, workDays, theory10020Result?.leads_para_contatar])

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
      <div style={{ borderBottom: '1px solid #202020', paddingBottom: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Simulador de Meta</h1>
          {competency ? (
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              Período: {toYMD(competency.month_start)} a {toYMD(competency.month_end)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Seller selector (admin only) */}
          {isAdmin ? (
            <select
              value={selectedSellerId ?? 'all'}
              onChange={(e) => {
                const val = e.target.value
                setSelectedSellerId(val === 'all' ? null : val)
              }}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
              }}
            >
              <option value="all">👥 Empresa (todos)</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          ) : null}

          {/* Pipeline link */}
          <Link
            href="/leads"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #2a2a2a',
              background: '#151515',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            Pipeline →
          </Link>

          {/* Mode selector */}
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
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <option value="ganhos">Ganhos (ciclos)</option>
            <option value="faturamento">Faturamento (R$)</option>
          </select>

          {/* Dias trabalhados */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', borderRadius: 8, border: '1px solid #1e1e1e', background: '#0d0d0d' }}>
            {daysLabels.map(({ dow, label }) => (
              <label key={dow} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!workDays[dow]}
                  onChange={(e) => setWorkDays((prev) => ({ ...prev, [dow]: e.target.checked }))}
                />
                <span style={{ opacity: 0.8 }}>{label}</span>
              </label>
            ))}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', marginLeft: 4, borderLeft: '1px solid #2a2a2a', paddingLeft: 8 }}>
              <input
                type="checkbox"
                checked={autoRemainingDays}
                onChange={(e) => setAutoRemainingDays(e.target.checked)}
              />
              <span style={{ opacity: 0.7 }}>Auto dias</span>
            </label>
          </div>

          {/* Taxa de Conversão */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>Taxa:</span>
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
                width: 54,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
              }}
            />
            <span style={{ fontSize: 12, opacity: 0.6 }}>%</span>
          </div>

          {/* Dias Úteis Restantes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>Dias rest.:</span>
            <input
              type="number"
              value={remainingBusinessDays}
              onChange={(e) => setRemainingBusinessDays(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={autoRemainingDays}
              style={{
                width: 54,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: autoRemainingDays ? '#0f0f0f' : '#111',
                color: 'white',
                fontSize: 13,
                opacity: autoRemainingDays ? 0.65 : 1,
                cursor: autoRemainingDays ? 'not-allowed' : 'text',
              }}
            />
          </div>

          {/* Meta Financeira (quando mode !== 'ganhos') */}
          {showRevenueMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Meta R$:</span>
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
                  border: '1px solid #2a2a2a',
                  background: !isAdmin ? '#0f0f0f' : '#111',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              />
              {isAdmin ? (
                <>
                  <button
                    onClick={() => void handleSaveGoal()}
                    disabled={goalSaving || goalLoading}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#10b981',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: goalSaving || goalLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {goalSaving ? '...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setRevenueGoalInputText(String(revenueGoalDb))}
                    disabled={goalSaving || goalLoading}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                      fontSize: 12,
                      cursor: goalSaving || goalLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Desfazer
                  </button>
                </>
              ) : null}
              {goalLoading ? <span style={{ fontSize: 11, opacity: 0.6 }}>Carregando...</span> : null}
              {goalError ? <span style={{ fontSize: 11, color: '#ffb3b3' }}>{goalError}</span> : null}
              {goalSuccess ? <span style={{ fontSize: 11, color: '#6ee7b7' }}>{goalSuccess}</span> : null}
            </div>
          ) : null}

        </div>
      </div>

      {/* ================================================================ */}
      {/* TAB NAVIGATION                                                    */}
      {/* ================================================================ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('teoria')} style={tabStyle(activeTab === 'teoria')}>
          Teoria 100/20
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
        {/* ABA 1: TEORIA 100/20                                          */}
        {/* ============================================================ */}
        {activeTab === 'teoria' && (
          mode === 'faturamento' ? (
            <Section
              title={
                <TitleWithTip label="Teoria 100/20 — Planejamento Operacional" tipTitle="O que é a Teoria 100/20?" width={480}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div>O multiplicador da teoria é <strong>1 ÷ taxa de conversão</strong>. Com 20% → ×5, com 15% → ×6.67, com 25% → ×4.</div>
                    <div>Esforço Bruto = Meta × Multiplicador → Leads = Esforço ÷ Ticket → Ganhos = Leads × Taxa</div>
                    <div>O multiplicador varia conforme a taxa — apenas quando a taxa é 20% o multiplicador é ×5.</div>
                  </div>
                </TitleWithTip>
              }
              description="Converte sua meta de faturamento em volume de leads e ganhos diários usando o multiplicador dinâmico (1 ÷ taxa)"
            >
              <div style={{ display: 'grid', gap: 24 }}>

                {/* ── TICKET SOURCE SELECTOR ────────────────────────────── */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
                    Fonte do Ticket Médio
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setTicketSource('manual')}
                      style={{
                        padding: '6px 16px',
                        borderRadius: 8,
                        border: ticketSource === 'manual' ? '1px solid #3b82f6' : '1px solid #333',
                        background: ticketSource === 'manual' ? '#1e3a5f' : '#111',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: ticketSource === 'manual' ? 700 : 400,
                      }}
                    >
                      ✏️ Manual
                    </button>
                    <button
                      onClick={() => setTicketSource('historico')}
                      style={{
                        padding: '6px 16px',
                        borderRadius: 8,
                        border: ticketSource === 'historico' ? '1px solid #10b981' : '1px solid #333',
                        background: ticketSource === 'historico' ? '#0a2e1f' : '#111',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: ticketSource === 'historico' ? 700 : 400,
                      }}
                    >
                      📊 Histórico
                    </button>
                  </div>

                  {/* Historical ticket info card */}
                  {ticketSource === 'historico' && (
                    <div style={{
                      marginTop: 12,
                      padding: 14,
                      borderRadius: 12,
                      border: historicalTicket?.is_sufficient
                        ? '1px solid #1f5f3a'
                        : '1px solid #5f3f1f',
                      background: historicalTicket?.is_sufficient
                        ? '#07140c'
                        : '#140f07',
                    }}>
                      {historicalTicketLoading ? (
                        <div style={{ fontSize: 13, opacity: 0.6 }}>Calculando ticket histórico...</div>
                      ) : !historicalTicket ? (
                        <div style={{ fontSize: 13, opacity: 0.6 }}>Erro ao carregar ticket histórico.</div>
                      ) : !historicalTicket.is_sufficient ? (
                        <div>
                          <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>
                            ⚠️ Base insuficiente
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                            Menos de 5 vendas ganhas encontradas. Use o ticket manual ou aguarde mais vendas.
                          </div>
                          <button
                            onClick={() => setTicketSource('manual')}
                            style={{
                              marginTop: 8,
                              padding: '4px 12px',
                              borderRadius: 6,
                              border: '1px solid #333',
                              background: '#1a1a1a',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Usar manual →
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <div>
                              <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Ticket Médio Histórico
                              </div>
                              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>
                                {toBRL(historicalTicket.ticket_medio)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 11, opacity: 0.6 }}>
                                Base: {historicalTicket.sample_size} vendas
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                                Total: {toBRL(historicalTicket.total_won)}
                              </div>
                            </div>
                          </div>
                          <div style={{
                            marginTop: 8,
                            fontSize: 11,
                            opacity: 0.5,
                            display: 'flex',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}>
                            <span>
                              {historicalTicket.fallback_level === 'period'
                                ? '📅 Período atual'
                                : '📅 Últimos 90 dias'}
                            </span>
                            <span>
                              {historicalTicket.owner_id
                                ? '👤 Vendedor'
                                : '🏢 Empresa'}
                            </span>
                            {historicalTicket.fallback_level === 'last_90_days' && (
                              <span style={{ color: '#f59e0b' }}>
                                ⚠️ Fallback (base do período insuficiente)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual input - only show when manual is selected */}
                  {ticketSource === 'manual' && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 12, opacity: 0.7 }}>Ticket Médio (R$)</label>
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
                          display: 'block',
                          width: '100%',
                          marginTop: 4,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #333',
                          background: '#111',
                          color: '#fff',
                          fontSize: 16,
                          fontWeight: 700,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* ── BLOCO 1: ENTRADAS ─────────────────────────────────── */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
                    Entradas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {/* Meta desejada */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px dashed rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 20 }} aria-hidden="true">🎯</div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>Meta desejada</div>
                      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#3b82f6' }}>{toBRL(activeGoalForKpis)}</div>
                    </div>

                    {/* Ticket médio */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px dashed rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 20 }} aria-hidden="true">💰</div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>Ticket médio</div>
                      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#f59e0b' }}>
                        {theory10020Result ? toBRL(theory10020Result.ticket_medio) : toBRL(Math.max(0, safeNumber(ticketMedioText)))}
                      </div>
                    </div>

                    {/* Taxa de conversão */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px dashed rgba(6,182,212,0.35)', background: 'rgba(6,182,212,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 20 }} aria-hidden="true">📊</div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>Taxa de conversão</div>
                      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#06b6d4' }}>{(taxaUsadaNoCalculo * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: 10, color: 'rgba(6,182,212,0.6)' }}>fonte: {rateSource === 'real' && (rateRealData?.vendor?.close_rate ?? null) !== null ? 'real' : 'planejada'}</div>
                    </div>

                    {/* Dias úteis restantes */}
                    <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px dashed rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 20 }} aria-hidden="true">📅</div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>Dias úteis restantes</div>
                      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', color: '#10b981' }}>{remainingBusinessDays}</div>
                    </div>
                  </div>
                </div>

                {/* ── BLOCO DE TAXA DE CONVERSÃO: REAL vs PLANEJADA ────────── */}
                {(() => {
                  const taxaRealDecimal = rateRealData?.vendor?.close_rate ?? null
                  const taxaPlanejadaDecimal = closeRatePercent / 100
                  const diferencaPp = taxaRealDecimal !== null
                    ? (taxaPlanejadaDecimal - taxaRealDecimal) * 100
                    : null

                  let diagnostico = ''
                  let diagnosticoColor = '#a78bfa'
                  let diagnosticoIcon = ''
                  if (taxaRealDecimal !== null) {
                    if (taxaPlanejadaDecimal > taxaRealDecimal * 1.1) {
                      diagnostico = 'Plano otimista'
                      diagnosticoColor = '#f59e0b'
                      diagnosticoIcon = '⚠️'
                    } else if (taxaPlanejadaDecimal >= taxaRealDecimal * 0.9) {
                      diagnostico = 'Plano realista'
                      diagnosticoColor = '#10b981'
                      diagnosticoIcon = '✅'
                    } else {
                      diagnostico = 'Plano conservador'
                      diagnosticoColor = '#60a5fa'
                      diagnosticoIcon = '🔵'
                    }
                  }

                  return (
                    <div style={{ padding: '16px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                        Taxa de Conversão
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {/* Left: rates display */}
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Taxa real (histórico)</div>
                              <div style={{ fontSize: 20, fontWeight: 900, color: taxaRealDecimal !== null ? '#22d3ee' : 'rgba(255,255,255,0.25)' }}>
                                {taxaRealDecimal !== null ? `${(taxaRealDecimal * 100).toFixed(1)}%` : '—'}
                              </div>
                              {rateRealData?.vendor?.worked ? (
                                <div style={{ fontSize: 10, opacity: 0.45, marginTop: 2 }}>
                                  base: {rateRealData.vendor.worked} ciclos · origem: vendedor
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Taxa planejada</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                    width: 64,
                                    padding: '4px 8px',
                                    borderRadius: 8,
                                    border: '1px solid #333',
                                    background: '#111',
                                    color: '#f59e0b',
                                    fontSize: 18,
                                    fontWeight: 900,
                                  }}
                                />
                                <span style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>%</span>
                              </div>
                            </div>
                          </div>

                          {/* Diferença */}
                          {diferencaPp !== null ? (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              Diferença:{' '}
                              <strong style={{ color: diferencaPp > 0 ? '#f59e0b' : diferencaPp < 0 ? '#60a5fa' : '#10b981' }}>
                                {diferencaPp > 0 ? '+' : ''}{diferencaPp.toFixed(1)}pp
                              </strong>{' '}
                              {diferencaPp > 0 ? '(planejada acima da real)' : diferencaPp < 0 ? '(planejada abaixo da real)' : '(igual à real)'}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.45 }}>Taxa real não disponível para este vendedor.</div>
                          )}

                          {/* Diagnóstico */}
                          {diagnostico ? (
                            <div style={{ fontSize: 13, fontWeight: 700, color: diagnosticoColor }}>
                              {diagnosticoIcon} Diagnóstico: {diagnostico}
                            </div>
                          ) : null}
                        </div>

                        {/* Right: radio selector */}
                        <div>
                          <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Usar no cálculo</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                              <input
                                type="radio"
                                name="rateSource"
                                value="planejada"
                                checked={rateSource === 'planejada'}
                                onChange={() => setRateSource('planejada')}
                                style={{ accentColor: '#f59e0b' }}
                              />
                              <span style={{ fontWeight: rateSource === 'planejada' ? 700 : 400 }}>
                                Taxa planejada ({closeRatePercent}%)
                              </span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: taxaRealDecimal !== null ? 'pointer' : 'not-allowed', fontSize: 13, opacity: taxaRealDecimal !== null ? 1 : 0.4 }}>
                              <input
                                type="radio"
                                name="rateSource"
                                value="real"
                                checked={rateSource === 'real'}
                                onChange={() => setRateSource('real')}
                                disabled={taxaRealDecimal === null}
                                style={{ accentColor: '#22d3ee' }}
                              />
                              <span style={{ fontWeight: rateSource === 'real' ? 700 : 400 }}>
                                Taxa real {taxaRealDecimal !== null ? `(${(taxaRealDecimal * 100).toFixed(1)}%)` : '(indisponível)'}
                              </span>
                            </label>
                          </div>
                          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', fontSize: 11, opacity: 0.6, lineHeight: 1.5 }}>
                            Multiplicador atual:{' '}
                            <strong style={{ color: '#f59e0b' }}>
                              ×{taxaUsadaNoCalculo > 0 ? (1 / taxaUsadaNoCalculo).toFixed(2) : '—'}
                            </strong>
                            {' '}(1 ÷ {(taxaUsadaNoCalculo * 100).toFixed(1)}%)
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* ── BLOCO 2: ESCADA DA TEORIA 100/20 ─────────────────── */}
                {theory10020Result ? (() => {
                  const t = theory10020Result
                  return (
                    <>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                          Escada da Teoria 100/20
                        </div>

                        {/* Row 1: Steps 1 → 4 */}
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 8 }}>
                          {/* Step 1 — Meta desejada */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(59,130,246,0.04))', border: '1px solid rgba(59,130,246,0.25)', borderLeft: '3px solid #3b82f6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: 'white', flexShrink: 0 }}>1</div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Meta desejada</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#3b82f6', lineHeight: 1 }}>{toBRL(t.meta_total)}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>meta total</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 6, color: 'rgba(255,255,255,0.18)', fontSize: 16, fontWeight: 300, flexShrink: 0 }}>→</div>

                          {/* Step 2 — Taxa de conversão */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(6,182,212,0.04))', border: '1px solid rgba(6,182,212,0.25)', borderLeft: '3px solid #06b6d4' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#0a0a0a', flexShrink: 0 }}>2</div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Taxa de conversão</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#22d3ee', lineHeight: 1 }}>{(t.close_rate * 100).toFixed(1)}%</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(6,182,212,0.5)', marginTop: 6 }}>fonte: {rateSource === 'real' && (rateRealData?.vendor?.close_rate ?? null) !== null ? 'real' : 'planejada'}</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 6, color: 'rgba(255,255,255,0.18)', fontSize: 12, fontWeight: 300, flexShrink: 0, flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>1÷taxa</span>
                            <span style={{ fontSize: 14 }}>→</span>
                          </div>

                          {/* Step 3 — Multiplicador */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(245,158,11,0.06))', border: '2px solid rgba(245,158,11,0.5)', borderLeft: '3px solid #f59e0b', boxShadow: '0 0 20px rgba(245,158,11,0.10)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#0a0a0a', flexShrink: 0 }}>3</div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(245,158,11,0.8)', fontWeight: 700 }}>Multiplicador da teoria</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#f59e0b', lineHeight: 1 }}>{t.multiplicador > 0 ? `×${t.multiplicador.toFixed(2)}` : '—'}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(245,158,11,0.5)', marginTop: 6 }}>1 ÷ taxa</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 6, color: 'rgba(245,158,11,0.6)', fontSize: 14, fontWeight: 700, flexShrink: 0, flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 9, opacity: 0.7 }}>×mult</span>
                            <span>→</span>
                          </div>

                          {/* Step 4 — Esforço bruto */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(251,191,36,0.10), rgba(251,191,36,0.04))', border: '1px solid rgba(251,191,36,0.25)', borderLeft: '3px solid #fbbf24' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#0a0a0a', flexShrink: 0 }}>4</div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Esforço bruto</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#fbbf24', lineHeight: 1 }}>{toBRL(t.esforco_bruto)}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(251,191,36,0.5)', marginTop: 6 }}>meta × multiplicador</div>
                          </div>
                        </div>

                        {/* Row 2: Steps 5 → 9 */}
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                          {/* Step 5 — Ticket médio */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(139,92,246,0.04))', border: '1px solid rgba(139,92,246,0.25)', borderLeft: '3px solid #8b5cf6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: 'white', flexShrink: 0 }}>5</div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Ticket médio</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#a78bfa', lineHeight: 1 }}>{toBRL(t.ticket_medio)}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>ticket médio</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 8, color: 'rgba(255,255,255,0.18)', fontSize: 20, fontWeight: 300, flexShrink: 0 }}>÷</div>

                          {/* Step 6 — Leads para contatar */}
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(6,182,212,0.04))', border: '1px solid rgba(6,182,212,0.25)', borderLeft: '3px solid #06b6d4' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#0a0a0a', flexShrink: 0 }}>6</div>
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
                          <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))', border: '1px solid rgba(16,185,129,0.30)', borderLeft: '3px solid #10b981' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#0a0a0a', flexShrink: 0 }}>7</div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(16,185,129,0.8)', fontWeight: 700 }}>Ganhos esperados</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#10b981', lineHeight: 1 }}>{t.ganhos_esperados}</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(16,185,129,0.5)', marginTop: 6 }}>leads × conversão</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', paddingInline: 6, color: 'rgba(255,255,255,0.18)', fontSize: 12, fontWeight: 300, flexShrink: 0, flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>÷dias</span>
                            <span style={{ fontSize: 14 }}>→</span>
                          </div>

                          {/* Step 8 — Leads por dia útil */}
                          {(() => {
                            const lpdColor = t.leads_por_dia > 15 ? '#ef4444' : '#22d3ee'
                            const lpdBg = t.leads_por_dia > 15 ? 'rgba(239,68,68,0.10)' : 'rgba(6,182,212,0.08)'
                            const lpdBorder = t.leads_por_dia > 15 ? 'rgba(239,68,68,0.25)' : 'rgba(6,182,212,0.25)'
                            return (
                              <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: `linear-gradient(135deg, ${lpdBg}, rgba(0,0,0,0))`, border: `1px solid ${lpdBorder}`, borderLeft: `3px solid ${lpdColor}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: lpdColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: 'white', flexShrink: 0 }}>8</div>
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
                            const gpdBg = t.ganhos_por_dia > 5 ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)'
                            const gpdBorder = t.ganhos_por_dia > 5 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'
                            return (
                              <div style={{ flex: 1, padding: '16px 14px', borderRadius: 12, background: `linear-gradient(135deg, ${gpdBg}, rgba(0,0,0,0))`, border: `1px solid ${gpdBorder}`, borderLeft: `3px solid ${gpdColor}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: gpdColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: 'white', flexShrink: 0 }}>9</div>
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
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                            Situação atual
                          </div>
                          {(() => {
                            const progressPct = t.progress_pct
                            const pctRounded = Math.round(progressPct * 100)
                            const barColor = progressPct >= 0.8 ? '#10b981' : progressPct >= 0.5 ? '#f59e0b' : '#ef4444'
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={{ padding: '18px 20px', borderRadius: 14, background: '#0f0f0f', border: '1px solid #1e1e1e' }}>
                                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 8 }}>Realizado</div>
                                  <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.5px', color: barColor, lineHeight: 1 }}>{toBRL(t.total_real)}</div>
                                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6, marginBottom: 16 }}>de {toBRL(t.meta_total)} ({pctRounded}%)</div>
                                  <div style={{ height: 8, borderRadius: 4, background: '#1a1a1a', overflow: 'hidden' }}>
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
                                  <div style={{ gridColumn: '1 / -1', padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderLeft: '3px solid #ef4444' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Falta para a meta</div>
                                    <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px', color: '#ef4444', lineHeight: 1 }}>{toBRL(t.gap)}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.6)', marginTop: 4 }}>Meta − Realizado</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: '#0f0f0f', border: '1px solid #1e1e1e' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Leads restantes</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#22d3ee', lineHeight: 1 }}>{t.leads_restantes}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>gap × {t.multiplicador.toFixed(2)} ÷ ticket</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: '#0f0f0f', border: '1px solid #1e1e1e' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Ganhos restantes</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{t.ganhos_restantes}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>leads rest. × conversão</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: '#0f0f0f', border: '1px solid #1e1e1e' }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 6 }}>Leads restantes/dia</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#22d3ee', lineHeight: 1 }}>{t.leads_restantes_por_dia}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>leads rest. ÷ dias úteis</div>
                                  </div>
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: '#0f0f0f', border: '1px solid #1e1e1e' }}>
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
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                            Diagnóstico operacional
                          </div>
                          <div style={{
                            padding: '20px 20px 20px 24px',
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.05), rgba(59,130,246,0.04), rgba(0,0,0,0))',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderLeft: '4px solid #f59e0b',
                            position: 'relative',
                            overflow: 'hidden',
                          }}>
                            <div style={{ position: 'absolute', top: 16, right: 18, fontSize: 28, opacity: 0.2 }} aria-hidden="true">💡</div>
                            <div style={{ fontSize: 13, lineHeight: 1.9, color: 'rgba(255,255,255,0.8)' }}>
                              <div>
                                Para atingir a meta de{' '}
                                <strong style={{ color: '#3b82f6' }}>{toBRL(t.meta_total)}</strong>,
                                com conversão de{' '}
                                <strong style={{ color: '#22d3ee' }}>{(t.close_rate * 100).toFixed(1)}%</strong>{' '}
                                (fonte: {rateSource === 'real' && (rateRealData?.vendor?.close_rate ?? null) !== null ? 'real' : 'planejada'}),
                                o multiplicador da teoria é{' '}
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
              Teoria 100/20 disponível apenas no modo Faturamento.
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
                  <TitleWithTip label="Taxa Real (Histórico 90d)" tipTitle="Como ler a Taxa Real" width={420}>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                      <li>Taxa baseada em histórico (janela selecionada).</li>
                      <li>Se a amostra for pequena, a taxa pode oscilar bastante.</li>
                    </ul>
                  </TitleWithTip>
                }
                description="Baseado em dados históricos do vendedor/empresa."
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Card
                    title={
                      <TitleWithTip label="Taxa Vendedor" tipTitle="Taxa Vendedor" width={380}>
                        <div>Taxa histórica do vendedor selecionado (worked → wins).</div>
                      </TitleWithTip>
                    }
                    value={rateRealData.vendor.close_rate ? `${(rateRealData.vendor.close_rate * 100).toFixed(1)}%` : '—'}
                    subtitle={
                      rateRealData.vendor.worked >= 30
                        ? `${rateRealData.vendor.wins} ganhos / ${rateRealData.vendor.worked} trabalhados`
                        : `⚠️ Amostra pequena (${rateRealData.vendor.worked})`
                    }
                    tone={rateRealData.vendor.worked >= 30 ? 'neutral' : 'bad'}
                  />

                  <Card
                    title={
                      <TitleWithTip label="Taxa Empresa" tipTitle="Taxa Empresa" width={380}>
                        <div>Taxa histórica agregada da empresa (worked → wins).</div>
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
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                      }}
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
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #2a2a2a',
                        background: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? '#1f5f3a' : '#1a1a1a',
                        color: 'white',
                        cursor: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 'pointer' : 'not-allowed',
                        fontWeight: 900,
                        opacity: rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 1 : 0.5,
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
                <Card title="Ciclos Trabalhados" value={metrics?.worked_count ?? '—'} subtitle={metrics && result ? `Taxa real: ${pct(metrics.current_wins / Math.max(1, metrics.worked_count))}` : undefined} />
                <Card title="Status" value={result?.on_track ? '✅ No ritmo!' : '⚠️ Acelerar'} tone={result?.on_track ? 'good' : 'bad'} />
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
                <Card title="Novo" value={metrics?.counts_by_status.novo ?? '—'} />
                <Card title="Contato" value={metrics?.counts_by_status.contato ?? '—'} />
                <Card title="Respondeu" value={metrics?.counts_by_status.respondeu ?? '—'} />
                <Card title="Negociação" value={metrics?.counts_by_status.negociacao ?? '—'} />
                <Card title="Ganho" value={metrics?.counts_by_status.ganho ?? '—'} tone="good" />
                <Card title="Perdido" value={metrics?.counts_by_status.perdido ?? '—'} tone="bad" />
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
                      <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', opacity: 0.6, fontWeight: 700 }}>Grupo</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.6, fontWeight: 700 }}>Trabalhados</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.6, fontWeight: 700 }}>Ganhos</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.6, fontWeight: 700 }}>Taxa</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', opacity: 0.6, fontWeight: 700 }}>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupConversion.map((row, i) => (
                        <tr
                          key={row.group_id ?? i}
                          style={{ borderBottom: '1px solid #1a1a1a' }}
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
                    {distribution.summary.total_working_days} dias úteis · {toYMD(competency?.month_start ?? '')} a {toYMD(competency?.month_end ?? '')}
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
