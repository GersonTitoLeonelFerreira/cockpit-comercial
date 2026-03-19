'use client'

import * as React from 'react'
import SalesCyclesKanban from './components/SalesCyclesKanban'
import CreateLeadModal from './components/CreateLeadModal'
import ImportExcelDialog from './components/ImportExcelDialog'
import DeleteLeadsDialog from './components/DeleteLeadsDialog'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import { getActiveCompetency, getRevenueGoal, getRevenueSummary } from '@/app/lib/services/simulator'

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

// ============================================================================
// KPI Row (inline)
// ============================================================================

function toBRL(v: number) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Tone = 'neutral' | 'good' | 'bad'

function RevenueCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: React.ReactNode
  value: React.ReactNode
  subtitle?: React.ReactNode
  tone?: Tone
}) {
  const border =
    tone === 'good'
      ? '1px solid #1f5f3a'
      : tone === 'bad'
        ? '1px solid #5f1f1f'
        : '1px solid #2a2a2a'
  const bg = tone === 'good' ? '#07140c' : tone === 'bad' ? '#140707' : '#0f0f0f'

  return (
    <div style={{ border, background: bg, borderRadius: 14, padding: 14, minHeight: 92 }}>
      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.2 }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>{subtitle}</div> : null}
    </div>
  )
}

function getRevenueStatus(pacingRatio: number): 'no_ritmo' | 'atencao' | 'acelerar' {
  if (pacingRatio >= 1) return 'no_ritmo'
  if (pacingRatio >= 0.9) return 'atencao'
  return 'acelerar'
}

function statusLabel(s: 'no_ritmo' | 'atencao' | 'acelerar') {
  if (s === 'no_ritmo') return '✅ No ritmo'
  if (s === 'atencao') return '⚠️ Atenção'
  return '🚨 Acelerar'
}

function statusTone(s: 'no_ritmo' | 'atencao' | 'acelerar'): Tone {
  if (s === 'no_ritmo') return 'good'
  if (s === 'atencao') return 'neutral'
  return 'bad'
}

function RevenueMetaKpiRow({
  title,
  totalReal,
  goal,
  businessDaysRemaining,
  projection,
}: {
  title: string
  totalReal: number
  goal: number
  businessDaysRemaining: number
  projection: number
}) {
  const safeGoal = Math.max(0, Number(goal) || 0)
  const safeReal = Math.max(0, Number(totalReal) || 0)

  const gap = Math.max(0, safeGoal - safeReal)
  const requiredPerBD = businessDaysRemaining > 0 ? gap / businessDaysRemaining : gap

  const pacingRatio = safeGoal > 0 ? projection / safeGoal : 0
  const status = getRevenueStatus(pacingRatio)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 900, opacity: 0.9 }}>{title}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <RevenueCard title="Real no período" value={toBRL(safeReal)} />
        <RevenueCard title="Meta do período" value={toBRL(safeGoal)} />
        <RevenueCard title="Gap (falta)" value={toBRL(gap)} tone={gap <= 0 ? 'good' : 'neutral'} />
        <RevenueCard
          title="R$/dia útil (restante)"
          value={toBRL(requiredPerBD)}
          subtitle={`${businessDaysRemaining} dias úteis restantes`}
        />
        <RevenueCard
          title="Status (pacing)"
          value={statusLabel(status)}
          subtitle={`Projeção: ${toBRL(projection)} (${Math.round(pacingRatio * 100)}% da meta)`}
          tone={statusTone(status)}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

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

  React.useEffect(() => {
    async function loadCompetency() {
      try {
        const comp = await getActiveCompetency()
        setPeriod({
          start: toYMD(comp.month_start),
          end: toYMD(comp.month_end),
        })
      } catch (e: any) {
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
  }, [companyId, period])

  return (
    <div style={{ color: 'white' }}>
      {/* ... resto do seu JSX igual ... */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Pipeline Comercial</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Logado como: {userLabel} ({role})
        </div>
        {period ? (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
            Período: {period.start} até {period.end}
          </div>
        ) : null}
      </div>

      {/* seletor de meta exibida */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Meta exibida:</div>
        <select
          value={goalView}
          onChange={(e) => setGoalView(e.target.value as GoalView)}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2a2a2a',
            background: '#111',
            color: 'white',
            minWidth: 240,
            fontWeight: 900,
          }}
        >
          <option value="company">Meta da empresa</option>
          <option value="mine">Minha meta</option>
        </select>

        {goalLoading ? <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando metas...</div> : null}
        {goalError ? <div style={{ fontSize: 12, color: '#ffb3b3' }}>{goalError}</div> : null}

        {goalView === 'mine' && goalMine <= 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>(Minha meta ainda não foi definida pelo admin — exibindo 0)</div>
        ) : null}
      </div>

      {/* KPI */}
      <div style={{ marginTop: 10 }}>
        {revenueError ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: '1px solid #3a2222',
              background: '#160b0b',
              color: '#ffb3b3',
            }}
          >
            {revenueError}
          </div>
        ) : revenueLoading ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Carregando faturamento do período...</div>
        ) : (
          <RevenueMetaKpiRow
            title={goalView === 'mine' ? 'Minha meta (comparada ao Real da empresa)' : 'Empresa (todos)'}
            totalReal={revenueTotalReal}
            goal={activeGoal}
            businessDaysRemaining={revenueBDRemaining}
            projection={revenueProjection}
          />
        )}
      </div>

      {/* BOTÕES */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <button
          onClick={() => setShowCreateLeadModal(true)}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#10b981',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          + Criar Lead
        </button>
        {isAdmin && (
          <ImportExcelDialog
            userId={userId}
            companyId={companyId}
            onImported={() => window.location.reload() /* TODO: substituir por router.refresh() */}
            trigger={
              <button
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #10b981',
                  background: 'transparent',
                  color: '#10b981',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Importar Excel
              </button>
            }
          />
        )}

        {/* Deletar Leads - ADMIN ONLY */}
        {isAdmin && (
          <DeleteLeadsDialog
            companyId={companyId}
            isAdmin={isAdmin}
            onDeleted={() => window.location.reload() /* TODO: substituir por router.refresh() */}
            trigger={
              <button
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #ef4444',
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Deletar Leads
              </button>
            }
          />
        )}

        {/* Atualizar (Refresh) */}
        <button
          onClick={() => window.location.reload() /* TODO: substituir por router.refresh() */}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid #444',
            background: 'transparent',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            marginLeft: 'auto',
          }}
        >
          Refresh
        </button>
      </div>

      {/* KANBAN */}
      <div style={{ marginTop: 18 }}>
        <SalesCyclesKanban
          userId={userId}
          companyId={companyId}
          isAdmin={isAdmin}
          defaultOwnerId={defaultOwnerId ?? undefined}
        />
      </div>

      {/* MODAL CRIAR LEAD */}
      {showCreateLeadModal && (
        <CreateLeadModal
          companyId={companyId}
          userId={userId}
          isAdmin={isAdmin}
          groups={[]}
          onLeadCreated={() => {
            setShowCreateLeadModal(false)
            window.location.reload() // TODO: substituir por router.refresh()
          }}
          onClose={() => setShowCreateLeadModal(false)}
        />
      )}
    </div>
  )
}
