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
} from '@/app/lib/services/simulator'
import { getCloseRateReal, percentToRate } from '@/app/lib/services/simulatorRateReal'
import type {
  GroupConversionRow,
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

  // Teoria 100/20 — recalcular quando inputs mudam
  useEffect(() => {
    if (mode !== 'faturamento') {
      setTheory10020Result(null)
      return
    }

    const ticketValue = Math.max(0, safeNumber(ticketMedioText))
    if (ticketValue <= 0) {
      setTheory10020Result(null)
      return
    }

    const totalReal = Number(revenueSeller?.total_real || revenueCompany?.total_real || 0)

    const result = calculateTheory10020({
      meta_total: activeGoalForKpis,
      ticket_medio: ticketValue,
      close_rate: percentToRate(closeRatePercent),
      remaining_business_days: remainingBusinessDays,
      total_real: totalReal,
    })
    setTheory10020Result(result)
  }, [mode, ticketMedioText, activeGoalForKpis, closeRatePercent, remainingBusinessDays, revenueSeller, revenueCompany])

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
    <div style={{ maxWidth: 1200, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Simulador de Meta</h1>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Meta (ganhos) → ciclos necessários = meta ÷ taxa de conversão
          </div>

          {isAdmin ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedSellerId ?? 'all'}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedSellerId(val === 'all' ? null : val)
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#111',
                  color: 'white',
                  minWidth: 260,
                }}
              >
                <option value="all">👥 Empresa (todos os vendedores)</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <Link
                href="/leads"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  textDecoration: 'none',
                  fontWeight: 900,
                }}
              >
                Pipeline →
              </Link>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/leads"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  textDecoration: 'none',
                  fontWeight: 900,
                }}
              >
                Pipeline →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 16 }}>
        <Section
          title={
            <TitleWithTip label="Configuração" tipTitle="Como usar a Configuração" width={520}>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                <li>Agora você pode marcar os dias da semana trabalhados.</li>
                <li>Isso influencia o cálculo automático dos dias restantes e os KPIs financeiros.</li>
              </ul>
            </TitleWithTip>
          }
          description="Defina o modo e os parâmetros."
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Modo:</div>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as SimulatorMode)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#111',
                  color: 'white',
                  minWidth: 260,
                  fontWeight: 900,
                }}
              >
                <option value="ganhos">Ganhos (ciclos)</option>
                <option value="faturamento">Faturamento (R$)</option>
              </select>

              <div style={{ fontSize: 12, opacity: 0.65 }}>
                {mode === 'ganhos' ? 'Modo atual (sem mudanças).' : `Modo financeiro: ${revenueMetricLabel} (R$).`}
              </div>
            </div>

            {/* ✅ dias trabalhados */}
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Dias trabalhados:</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {daysLabels.map(({ dow, label }) => (
                  <label key={dow} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!!workDays[dow]}
                      onChange={(e) => setWorkDays((prev) => ({ ...prev, [dow]: e.target.checked }))}
                    />
                    <span style={{ opacity: 0.85 }}>{label}</span>
                  </label>
                ))}

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, marginLeft: 8 }}>
                  <input
                    type="checkbox"
                    checked={autoRemainingDays}
                    onChange={(e) => setAutoRemainingDays(e.target.checked)}
                  />
                  <span style={{ opacity: 0.85 }}>Auto calcular “dias restantes”</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ opacity: mode === 'ganhos' ? 1 : 0.55 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Meta de Ganhos</div>
                <input
                  type="number"
                  value={targetWins}
                  onChange={(e) => setTargetWins(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={mode !== 'ganhos'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    color: 'white',
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Taxa de Conversão (Manual)</div>
                <div style={{ display: 'flex', gap: 8 }}>
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
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                    }}
                  />
                  <div style={{ padding: '10px 12px', opacity: 0.7 }}>({closeRatePercent}%)</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Dias Úteis Restantes</div>
                <input
                  type="number"
                  value={remainingBusinessDays}
                  onChange={(e) => setRemainingBusinessDays(Math.max(0, parseInt(e.target.value) || 0))}
                  disabled={autoRemainingDays}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: autoRemainingDays ? '#0f0f0f' : '#111',
                    color: 'white',
                    opacity: autoRemainingDays ? 0.75 : 1,
                    cursor: autoRemainingDays ? 'not-allowed' : 'text',
                  }}
                />
              </div>
            </div>

            {competency ? (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
                Período: {toYMD(competency.month_start)} até {toYMD(competency.month_end)}
              </div>
            ) : null}
          </div>
        </Section>

        {/* A partir daqui, mantive o resto igual ao seu arquivo (Meta Financeira, Taxa Real, Resultado, etc.) */}
        {showRevenueMode ? (
          <Section title="Meta Financeira" description="Cockpit financeiro do período.">
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>{revenueGoalContextLabel} (R$)</div>

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
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: !isAdmin ? '#0f0f0f' : '#111',
                      color: 'white',
                      fontWeight: 900,
                    }}
                  />

                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isAdmin ? (
                      <>
                        <button
                          onClick={() => void handleSaveGoal()}
                          disabled={goalSaving || goalLoading}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: 'none',
                            background: '#10b981',
                            color: 'white',
                            fontWeight: 900,
                          }}
                        >
                          {goalSaving ? 'Salvando...' : 'Salvar meta'}
                        </button>

                        <button
                          onClick={() => setRevenueGoalInputText(String(revenueGoalDb))}
                          disabled={goalSaving || goalLoading}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid #2a2a2a',
                            background: '#111',
                            color: 'white',
                            fontWeight: 900,
                          }}
                        >
                          Desfazer
                        </button>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Meta definida pelo admin.</div>
                    )}

                    {goalLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando meta...</div> : null}
                    {goalError ? <div style={{ fontSize: 12, color: '#ffb3b3' }}>{goalError}</div> : null}
                    {goalSuccess ? <div style={{ fontSize: 12, color: '#6ee7b7' }}>{goalSuccess}</div> : null}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Fonte</div>
                  <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.4 }}>
                    Real diário vindo da Gestão de Faturamento.
                  </div>
                  {revenueLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando faturamento...</div> : null}
                  {revenueError ? <div style={{ fontSize: 12, color: '#ffb3b3' }}>{revenueError}</div> : null}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
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
              </div>
            </div>
          </Section>
        ) : null}

        {/* resto (ganhos) mantém igual ao que você já tinha antes */}
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

        <Section title="Resultado" description="Números para bater sua meta.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Card title="Ciclos Necessários" value={result?.needed_worked_cycles ?? '—'} subtitle={result ? `${result.needed_wins} ganhos ÷ ${closeRatePercent}% taxa` : undefined} />
            <Card title="Ciclos Restantes" value={result?.remaining_worked_cycles ?? '—'} subtitle={result ? `${result.remaining_wins} ganhos restantes ÷ ${closeRatePercent}%` : undefined} />
            <Card title="Ciclos/Dia (período)" value={result?.daily_worked_needed ?? '—'} subtitle={result ? `${result.needed_worked_cycles} ciclos ÷ 22 dias` : undefined} />
            <Card title="Ciclos/Dia (restante)" value={result?.daily_worked_remaining ?? '—'} subtitle={result ? `${result.remaining_worked_cycles} ciclos ÷ ${remainingBusinessDays} dias` : undefined} />
          </div>
        </Section>

        <Section title="Progresso" description="Seu desempenho atual no mês.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Card title="Ganhos Atuais" value={metrics?.current_wins ?? '—'} subtitle={result ? `${pct(result.progress_pct)} da meta (${result.needed_wins} alvo)` : undefined} tone={progressTone} />
            <Card title="Ciclos Trabalhados" value={metrics?.worked_count ?? '—'} subtitle={metrics && result ? `Taxa real: ${pct(metrics.current_wins / Math.max(1, metrics.worked_count))}` : undefined} />
            <Card title="Status" value={result?.on_track ? '✅ No ritmo!' : '⚠️ Acelerar'} tone={result?.on_track ? 'good' : 'bad'} />
          </div>
        </Section>

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

        <Section title="E se..." description="Simulações com taxas diferentes.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Card title="Se taxa for 15%" value={result?.simulation_15pct ?? '—'} subtitle={`${targetWins} ganhos ÷ 15%`} />
            <Card title={`Atual (${closeRatePercent}%)`} value={result?.needed_worked_cycles ?? '—'} subtitle={`${targetWins} ganhos ÷ ${closeRatePercent}%`} tone="neutral" />
            <Card title="Se taxa for 25%" value={result?.simulation_25pct ?? '—'} subtitle={`${targetWins} ganhos ÷ 25%`} tone="good" />
          </div>
        </Section>

        {/* ============================================================ */}
        {/* TEORIA 100/20 — PLANEJAMENTO OPERACIONAL                     */}
        {/* ============================================================ */}
        {mode === 'faturamento' && (
          <Section
            title={
              <TitleWithTip label="Teoria 100/20 — Planejamento Operacional" tipTitle="O que é a Teoria 100/20?" width={480}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div>A Teoria 100/20 diz: para cada R$ 1 de meta, você precisa gerar R$ 5 de esforço bruto em leads trabalhados.</div>
                  <div>Se você contatar todos os leads necessários, a taxa de conversão natural vai gerar os ganhos que cobrem sua meta.</div>
                  <div><strong>Fórmula:</strong> Esforço Bruto = Meta × 5 → Leads = Esforço ÷ Ticket → Ganhos = Leads × Taxa</div>
                </div>
              </TitleWithTip>
            }
            description="Converte sua meta de faturamento em volume de leads e ganhos diários usando o multiplicador ×5"
          >
            <div style={{ display: 'grid', gap: 20 }}>

              {/* BLOCK 1: INPUTS */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, marginBottom: 10 }}>
                  Entradas
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <Card title="Meta desejada" value={toBRL(activeGoalForKpis)} subtitle="Valor definido na seção Meta Financeira" />
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Ticket Médio (R$)</div>
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
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                        fontWeight: 900,
                      }}
                    />
                  </div>
                  <Card title="Taxa de conversão" value={`${closeRatePercent}%`} subtitle="Definida na Configuração" />
                  <Card title="Dias úteis restantes" value={remainingBusinessDays} subtitle="Calculado automaticamente" />
                </div>
              </div>

              {/* BLOCK 2: THEORY 100/20 LADDER */}
              {theory10020Result ? (
                <>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, marginBottom: 10 }}>
                      Escada da Teoria 100/20
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                      <Card
                        title="1. Meta desejada"
                        value={toBRL(theory10020Result.meta_total)}
                        subtitle="Quanto você quer faturar"
                      />
                      <Card
                        title="2. Esforço bruto (×5)"
                        value={toBRL(theory10020Result.esforco_bruto)}
                        subtitle={`${toBRL(theory10020Result.meta_total)} × 5`}
                        tone="neutral"
                      />
                      <Card
                        title="3. Ticket médio"
                        value={toBRL(theory10020Result.ticket_medio)}
                        subtitle="Valor médio por venda"
                      />
                      <Card
                        title="4. Leads para contatar"
                        value={theory10020Result.leads_para_contatar}
                        subtitle={`${toBRL(theory10020Result.esforco_bruto)} ÷ ${toBRL(theory10020Result.ticket_medio)}`}
                      />
                      <Card
                        title="5. Ganhos esperados"
                        value={theory10020Result.ganhos_esperados}
                        subtitle={`${theory10020Result.leads_para_contatar} leads × ${closeRatePercent}%`}
                        tone="good"
                      />
                      <Card
                        title="6. Leads/dia útil"
                        value={theory10020Result.leads_por_dia}
                        subtitle={`${theory10020Result.leads_para_contatar} leads ÷ ${remainingBusinessDays} dias`}
                      />
                      <Card
                        title="7. Ganhos/dia útil"
                        value={theory10020Result.ganhos_por_dia}
                        subtitle={`${theory10020Result.ganhos_esperados} ganhos ÷ ${remainingBusinessDays} dias`}
                        tone={theory10020Result.ganhos_por_dia > 15 ? 'bad' : 'neutral'}
                      />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, opacity: 0.45, lineHeight: 1.5 }}>
                      O multiplicador ×5 garante margem de segurança. Contatando {theory10020Result.leads_para_contatar} leads com taxa de {closeRatePercent}%, o retorno esperado é {theory10020Result.ganhos_esperados} ganhos — que com ticket de {toBRL(theory10020Result.ticket_medio)} representam {toBRL(theory10020Result.ganhos_esperados * theory10020Result.ticket_medio)} em faturamento.
                    </div>
                  </div>

                  {/* BLOCK 3: CURRENT STATUS */}
                  {!theory10020Result.meta_atingida && theory10020Result.gap > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, marginBottom: 10 }}>
                        Situação atual
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        <Card title="Realizado" value={toBRL(theory10020Result.total_real)} subtitle={`${Math.round(theory10020Result.progress_pct * 100)}% da meta`} tone={theory10020Result.progress_pct >= 0.8 ? 'good' : 'neutral'} />
                        <Card title="Falta para a meta" value={toBRL(theory10020Result.gap)} subtitle="Meta − Realizado" tone="bad" />
                        <Card title="Ganhos restantes" value={theory10020Result.ganhos_restantes} subtitle={`${toBRL(theory10020Result.gap)} ÷ ${toBRL(theory10020Result.ticket_medio)}`} />
                        <Card title="Leads restantes/dia" value={theory10020Result.leads_restantes_por_dia} subtitle={`Para fechar o gap de ${toBRL(theory10020Result.gap)}`} tone={theory10020Result.leads_restantes_por_dia > 50 ? 'bad' : 'neutral'} />
                      </div>
                    </div>
                  ) : null}

                  {/* Goal reached banner */}
                  {theory10020Result.meta_atingida && (
                    <div style={{ padding: 14, borderRadius: 12, background: '#07140c', border: '1px solid #1f5f3a', color: '#6ee7b7', fontWeight: 900, textAlign: 'center' }}>
                      Meta atingida! Realizado: {toBRL(theory10020Result.total_real)} / Meta: {toBRL(theory10020Result.meta_total)}
                    </div>
                  )}

                  {/* BLOCK 4: OPERATIONAL DIAGNOSIS */}
                  {!theory10020Result.meta_atingida && theory10020Result.gap > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, marginBottom: 10 }}>
                        Diagnóstico operacional
                      </div>
                      <div style={{
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid #2a2a2a',
                        background: '#0f0f0f',
                        fontSize: 13,
                        lineHeight: 1.8,
                        opacity: 0.85,
                      }}>
                        <div>Para atingir a meta de <strong>{toBRL(theory10020Result.meta_total)}</strong>, o esforço bruto necessário (×5) é <strong>{toBRL(theory10020Result.esforco_bruto)}</strong>.</div>
                        <div>Com ticket médio de <strong>{toBRL(theory10020Result.ticket_medio)}</strong>, sua equipe precisa contatar <strong>{theory10020Result.leads_para_contatar} leads</strong> no período.</div>
                        <div>Com a conversão de <strong>{closeRatePercent}%</strong>, isso deve gerar <strong>{theory10020Result.ganhos_esperados} ganhos</strong>.</div>
                        <div style={{ marginTop: 8, borderTop: '1px solid #222', paddingTop: 8 }}>
                          Faltando <strong>{remainingBusinessDays} dias úteis</strong>, o ritmo necessário é <strong>{theory10020Result.leads_restantes_por_dia} leads/dia</strong> e <strong>{theory10020Result.ganhos_restantes_por_dia} ganhos/dia</strong> para fechar o gap de <strong>{toBRL(theory10020Result.gap)}</strong>.
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Informe um ticket médio maior que zero para gerar o plano operacional.
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}