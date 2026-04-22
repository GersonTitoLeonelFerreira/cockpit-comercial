'use client'

import * as React from 'react'
import SalesCyclesKanban from './components/SalesCyclesKanban'
import CreateLeadModal from './components/CreateLeadModal'
import ImportExcelDialog from './components/ImportExcelDialog'
import DeleteLeadsDialog from './components/DeleteLeadsDialog'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import { getActiveCompetency, getRevenueGoal, getRevenueSummary } from '@/app/lib/services/simulator'
import MetaSummaryHeader, { buildMetaSummaryKpis } from '@/app/components/meta/MetaSummaryCard'

function toYMD(v: string) {
  return (v ?? '').split('T')[0].split(' ')[0]
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

type GoalView = 'company' | 'mine'

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
  const [showCreateLeadModal, setShowCreateLeadModal] = React.useState(false)

  const [period, setPeriod] = React.useState<{ start: string; end: string } | null>(null)

  const [goalView, setGoalView] = React.useState<GoalView>('company')

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
  const [refreshVersion, setRefreshVersion] = React.useState(0)

  const handleRefresh = React.useCallback(() => {
    setRefreshVersion((v) => v + 1)
  }, [])

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
      } catch (e: any) {
        setGoalError(e?.message ?? 'Erro ao carregar metas.')
        setGoalCompany(0)
        setGoalMine(0)
      } finally {
        setGoalLoading(false)
      }
    }

    void loadGoals()
  }, [companyId, userId, period, refreshVersion])

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
        const bdRemaining = Math.max(0, bdTotal - bdElapsed)

        const avgDaily = bdElapsed > 0 ? totalReal / bdElapsed : 0
        const projection = avgDaily * Math.max(1, bdTotal)

        setRevenueTotalReal(totalReal)
        setRevenueProjection(projection)
        setRevenueBDRemaining(bdRemaining)
      } catch (e: any) {
        setRevenueError(e?.message ?? 'Erro ao carregar faturamento do período.')
        setRevenueTotalReal(0)
        setRevenueProjection(0)
        setRevenueBDRemaining(0)
      } finally {
        setRevenueLoading(false)
      }
    }

    void loadRevenueKpi()
  }, [companyId, period, refreshVersion])

  return (
    <div style={{ color: '#edf2f7', background: '#090b0f', minHeight: '100vh', padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#546070', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Meta exibida:
        </div>
        <select
          value={goalView}
          onChange={(e) => setGoalView(e.target.value as GoalView)}
          style={{
            padding: '8px 12px',
            borderRadius: 7,
            border: '1px solid #1a1d2e',
            background: '#111318',
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

      <div style={{ marginBottom: 16 }}>
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
          <MetaSummaryHeader
            title={goalView === 'mine' ? 'Minha meta (comparada ao Real da empresa)' : 'Empresa (todos)'}
            kpis={buildMetaSummaryKpis(revenueTotalReal, activeGoal, revenueBDRemaining, revenueProjection)}
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 18,
          paddingBottom: 18,
          borderBottom: '1px solid #1a1d2e',
        }}
      >
        <button
          onClick={() => setShowCreateLeadModal(true)}
          style={{
            padding: '9px 16px',
            borderRadius: 7,
            border: '1px solid rgba(34,197,94,0.3)',
            background: 'rgba(22,163,74,0.12)',
            color: '#86efac',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            transition: 'all 200ms ease',
          }}
        >
          + Criar Lead
        </button>

        {isAdmin && (
          <ImportExcelDialog
            userId={userId}
            companyId={companyId}
            onImported={handleRefresh}
            trigger={
              <button
                style={{
                  padding: '9px 16px',
                  borderRadius: 7,
                  border: '1px solid #1a1d2e',
                  background: '#111318',
                  color: '#8fa3bc',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 200ms ease',
                }}
              >
                Importar Excel
              </button>
            }
          />
        )}

        {isAdmin && (
          <DeleteLeadsDialog
            companyId={companyId}
            isAdmin={isAdmin}
            onDeleted={handleRefresh}
            trigger={
              <button
                style={{
                  padding: '9px 16px',
                  borderRadius: 7,
                  border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 200ms ease',
                }}
              >
                Deletar Leads
              </button>
            }
          />
        )}

        <button
          onClick={handleRefresh}
          style={{
            padding: '9px 16px',
            borderRadius: 7,
            border: '1px solid #1a1d2e',
            background: '#111318',
            color: '#546070',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            marginLeft: 'auto',
            transition: 'all 200ms ease',
          }}
        >
          ↻ Atualizar
        </button>
      </div>

      <div style={{ marginTop: 0, marginLeft: -24, marginRight: -24 }}>
      <SalesCyclesKanban
  key={`kanban-${refreshVersion}`}
  userId={userId}
  companyId={companyId}
  isAdmin={isAdmin}
  defaultOwnerId={defaultOwnerId ?? undefined}
/>
      </div>

      {showCreateLeadModal && (
        <CreateLeadModal
          companyId={companyId}
          userId={userId}
          isAdmin={isAdmin}
          groups={[]}
          onLeadCreated={() => {
            setShowCreateLeadModal(false)
            handleRefresh()
          }}
          onClose={() => setShowCreateLeadModal(false)}
        />
      )}
    </div>
  )
}