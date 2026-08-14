'use client'

import * as React from 'react'
import Link from 'next/link'
import SalesCyclesKanban from './components/SalesCyclesKanban'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import { getActiveCompetency, getRevenueGoal, getRevenueSummary } from '@/app/lib/services/simulator'
import {
  CompactMetaSummaryHeader,
  buildMetaSummaryKpis,
} from '@/app/components/meta/MetaSummaryCard'

function toYMD(v: string) {
  return (v ?? '').split('T')[0].split(' ')[0]
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return fallback
}

function countBusinessDaysInRange(startYMD: string, endYMD: string) {
  const s = new Date(toYMD(startYMD) + 'T00:00:00')
  const e = new Date(toYMD(endYMD) + 'T00:00:00')
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  if (e < s) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function countBusinessDaysUntilToday(startYMD: string, endYMD: string) {
  const s = new Date(toYMD(startYMD) + 'T00:00:00')
  const e = new Date(toYMD(endYMD) + 'T00:00:00')
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
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function countBusinessDaysRemaining(endYMD: string) {
  const today = new Date()
  const e = new Date(toYMD(endYMD) + 'T00:00:00')

  today.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)

  if (e < today) return 0

  let count = 0
  const cur = new Date(today)

  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }

  return count
}

type GoalView = 'company' | 'mine'
type CockpitView = 'funil' | 'prioridades'

export default function LeadsClient({
  userId,
  companyId,
  role,
  userLabel,
  defaultOwnerId,
}: {
  userId: string
  companyId: string
  role: string
  userLabel: string
  defaultOwnerId?: string | null
}) {
  const supabase = React.useMemo(() => supabaseBrowser(), [])
  void supabase
  void userLabel

  const isAdmin = role === 'admin'
  const canManageReactivation = role === 'admin' || role === 'manager'

  const [period, setPeriod] = React.useState<{ start: string; end: string } | null>(null)

  const [goalView, setGoalView] = React.useState<GoalView>('company')
  const [cockpitView, setCockpitView] = React.useState<CockpitView>('funil')

  const [goalCompany, setGoalCompany] = React.useState<number>(0)
  const [goalMine, setGoalMine] = React.useState<number>(0)
  const [goalLoading, setGoalLoading] = React.useState(false)
  const [goalError, setGoalError] = React.useState<string | null>(null)

  const activeGoal = goalView === 'mine' ? goalMine : goalCompany

  const [revenueTotalReal, setRevenueTotalReal] = React.useState<number>(0)
  const [revenueProjection, setRevenueProjection] = React.useState<number>(0)
  const [revenueBDRemaining, setRevenueBDRemaining] = React.useState<number>(0)
  const [revenueLoading, setRevenueLoading] = React.useState(false)
  const [revenueError, setRevenueError] = React.useState<string | null>(null)

  const metaKpis = React.useMemo(
    () =>
      buildMetaSummaryKpis(
        revenueTotalReal,
        activeGoal,
        revenueBDRemaining,
        revenueProjection,
      ),
    [revenueTotalReal, activeGoal, revenueBDRemaining, revenueProjection],
  )

  React.useEffect(() => {
    async function loadCompetency() {
      try {
        const comp = await getActiveCompetency()
        setPeriod({
          start: toYMD(comp.month_start),
          end: toYMD(comp.month_end),
        })
      } catch {
        setPeriod(null)
      }
    }
    void loadCompetency()
  }, [])

  React.useEffect(() => {
    if (!period) return
    const { start, end } = period

    async function loadGoals() {
      setGoalLoading(true)
      setGoalError(null)

      try {
        const [companyRes, mineRes] = await Promise.all([
          getRevenueGoal({
            companyId,
            ownerId: null,
            startDate: start,
            endDate: end,
          }),
          getRevenueGoal({
            companyId,
            ownerId: userId,
            startDate: start,
            endDate: end,
          }),
        ])

        setGoalCompany(Number(companyRes?.goal_value || 0))
        setGoalMine(Number(mineRes?.goal_value || 0))
      } catch (e: unknown) {
        setGoalError(getErrorMessage(e, 'Erro ao carregar metas.'))
        setGoalCompany(0)
        setGoalMine(0)
      } finally {
        setGoalLoading(false)
      }
    }

    void loadGoals()
  }, [companyId, userId, period])

  React.useEffect(() => {
    if (!period) return
    const { start, end } = period

    async function loadRevenueKpi() {
      setRevenueLoading(true)
      setRevenueError(null)

      try {
        const res = await getRevenueSummary({
          companyId,
          ownerId: null,
          startDate: start,
          endDate: end,
          metric: 'faturamento',
        })

        const totalReal = Number(res?.total_real || 0)

        const bdTotal = countBusinessDaysInRange(start, end)
        const bdElapsed = countBusinessDaysUntilToday(start, end)
        const bdRemaining = countBusinessDaysRemaining(end)

        const avgDaily = bdElapsed > 0 ? totalReal / bdElapsed : 0
        const projection = avgDaily * Math.max(1, bdTotal)

        setRevenueTotalReal(totalReal)
        setRevenueProjection(projection)
        setRevenueBDRemaining(bdRemaining)
      } catch (e: unknown) {
        setRevenueError(getErrorMessage(e, 'Erro ao carregar faturamento do período.'))
        setRevenueTotalReal(0)
        setRevenueProjection(0)
        setRevenueBDRemaining(0)
      } finally {
        setRevenueLoading(false)
      }
    }

    void loadRevenueKpi()
  }, [companyId, period])

  return (
    <div style={{ color: '#edf2f7', background: '#090b0f', minHeight: '100vh', padding: '16px 24px 24px' }}>
      <div
        style={{
          display: 'flex',
          gap: 9,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 10,
          padding: '8px 10px',
          border: '1px solid #1f2635',
          borderRadius: 12,
          background: 'linear-gradient(145deg, rgba(17,21,29,0.94), rgba(13,15,20,0.96))',
        }}
      >
        <div
          role="tablist"
          aria-label="Visualização do Cockpit Comercial"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: 3,
            borderRadius: 9,
            border: '1px solid #22293a',
            background: '#0a0d13',
          }}
        >
          {(['funil', 'prioridades'] as CockpitView[]).map((view) => {
            const active = cockpitView === view
            const label = view === 'funil' ? 'Funil' : 'Prioridades'

            return (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCockpitView(view)}
                style={{
                  minHeight: 30,
                  padding: '0 14px',
                  borderRadius: 7,
                  border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
                  background: active ? 'linear-gradient(145deg, rgba(59,130,246,0.2), rgba(59,130,246,0.08))' : 'transparent',
                  color: active ? '#93c5fd' : '#738096',
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {canManageReactivation ? (
          <Link
            href="/leads/reativacao"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 34,
              padding: '0 12px',
              borderRadius: 9,
              border: '1px solid #253047',
              background: '#111722',
              color: '#93c5fd',
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Reativar oportunidades
          </Link>
        ) : null}

        <div
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: '#65738a',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Meta exibida:
        </div>
        <select
          value={goalView}
          onChange={(e) => setGoalView(e.target.value as GoalView)}
          style={{
            padding: '8px 12px',
            borderRadius: 9,
            border: '1px solid #22293a',
            background: '#0c0f15',
            color: '#edf2f7',
            minWidth: 220,
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="company">Meta da empresa</option>
          <option value="mine">Minha meta</option>
        </select>

        {goalLoading ? <div style={{ fontSize: 12, color: '#546070' }}>Carregando metas...</div> : null}
        {goalError ? <div style={{ fontSize: 12, color: '#fca5a5' }}>{goalError}</div> : null}

        {goalView === 'mine' && goalMine <= 0 ? (
          <div style={{ fontSize: 11, color: '#546070' }}>Meta pessoal não definida — exibindo 0</div>
        ) : null}
      </div>

      <div style={{ marginBottom: 12 }}>
        {revenueError ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 9,
              border: '1px solid #3a1515',
              background: '#130a0a',
              color: '#fca5a5',
              fontSize: 12,
            }}
          >
            {revenueError}
          </div>
        ) : revenueLoading ? (
          <div style={{ fontSize: 12, color: '#546070' }}>Carregando faturamento do período...</div>
        ) : (
          <CompactMetaSummaryHeader
            title={goalView === 'mine' ? 'Minha meta (comparada ao Real da empresa)' : 'Empresa (todos)'}
            kpis={metaKpis}
          />
        )}
      </div>
      <div style={{ marginTop: 0 }}>
        <SalesCyclesKanban
          userId={userId}
          companyId={companyId}
          isAdmin={isAdmin}
          defaultOwnerId={defaultOwnerId ?? undefined}
          viewMode={cockpitView}
        />
      </div>
    </div>
  )
}
