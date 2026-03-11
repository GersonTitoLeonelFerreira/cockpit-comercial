'use client'

import * as React from 'react'
import {
  getActiveCompetency,
  getSalesCycleMetrics,
  calculateSimulatorResult,
} from '../../lib/services/simulator'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import type { SimulatorConfig, SimulatorMetrics, SimulatorResult } from '../../types/simulator'

// ─── helpers ────────────────────────────────────────────────────────────────

function remainingBusinessDaysThisMonth(): number {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  let count = 0
  const cur = new Date(today)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`
}

/** Format a YYYY-MM-DD string as "mês ano" in pt-BR without timezone issues */
function formatMonthYear(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number)
  const d = new Date(year, (month ?? 1) - 1, 1)
  return d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: '#151515',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#888', marginBottom: 14 }}>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? 'white' }}>{value}</div>
    </div>
  )
}

function FunnelRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 8, alignItems: 'center' }}>
      <div style={{ fontSize: 12, color: '#aaa' }}>{label}</div>
      <div style={{ background: '#222', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, pct)}%`,
            background: '#4ade80',
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: '#ccc', textAlign: 'right' }}>{value}</div>
    </div>
  )
}

function SimRow({
  label,
  cycles,
  dailyNeeded,
}: {
  label: string
  cycles: number
  dailyNeeded: number
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
        padding: '10px 0',
        borderBottom: '1px solid #1f1f1f',
      }}
    >
      <div style={{ fontSize: 13, color: '#aaa' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>{cycles} ciclos</div>
      <div style={{ fontSize: 13, color: '#facc15' }}>{dailyNeeded}/dia</div>
    </div>
  )
}

/** Extract email from Supabase joined relation (may be array or object) */
function extractEmail(usersField: unknown, fallback: string): string {
  if (!usersField) return fallback
  if (Array.isArray(usersField)) return (usersField[0] as { email?: string })?.email ?? fallback
  return (usersField as { email?: string }).email ?? fallback
}

// ─── main component ──────────────────────────────────────────────────────────

type Seller = { id: string; email: string }

export default function SimuladorMetaPage() {
  const [config, setConfig] = React.useState<SimulatorConfig>({
    target_wins: 10,
    close_rate: 0.2,
    ticket_medio: 0,
    remaining_business_days: remainingBusinessDaysThisMonth(),
  })

  const [metrics, setMetrics] = React.useState<SimulatorMetrics | null>(null)
  const [result, setResult] = React.useState<SimulatorResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<Seller[]>([])
  const [selectedSeller, setSelectedSeller] = React.useState<string>('')
  const [activeMonth, setActiveMonth] = React.useState<string>('')

  // ── load sellers for admin ─────────────────────────────────────────────────
  React.useEffect(() => {
    async function loadSellers() {
      try {
        const supabase = supabaseBrowser()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('company_members')
          .select('role')
          .eq('user_id', user.id)
          .single()

        const admin = profile?.role === 'admin'
        setIsAdmin(admin)

        if (admin) {
          const { data: members } = await supabase
            .from('company_members')
            .select('user_id, users(email)')
            .eq('role', 'seller')

          if (members) {
            setSellers(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (members as any[]).map((m) => ({
                id: m.user_id as string,
                email: extractEmail(m.users, m.user_id as string),
              }))
            )
          }
        }
      } catch {
        // ignore
      }
    }
    loadSellers()
  }, [])

  // ── fetch metrics ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const competency = await getActiveCompetency()
        setActiveMonth(competency.month_start)

        const m = await getSalesCycleMetrics(selectedSeller || null, competency.month_start)
        setMetrics(m)
        setResult(calculateSimulatorResult(m, config))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar métricas')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedSeller]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── recalculate when config or metrics change ──────────────────────────────
  React.useEffect(() => {
    if (metrics) {
      setResult(calculateSimulatorResult(metrics, config))
    }
  }, [config, metrics])

  // ── config helpers ─────────────────────────────────────────────────────────
  function setTargetWins(v: number) {
    setConfig((c) => ({ ...c, target_wins: Math.max(1, v) }))
  }
  function setCloseRate(v: number) {
    setConfig((c) => ({ ...c, close_rate: Math.min(1, Math.max(0.01, v)) }))
  }
  function setRemainingDays(v: number) {
    setConfig((c) => ({ ...c, remaining_business_days: Math.max(1, v) }))
  }

  const funnelTotal = metrics
    ? Object.values(metrics.counts_by_status).reduce((a, b) => a + b, 0)
    : 0

  const progressBar = result ? Math.min(100, result.progress_pct) : 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 20 }}>
      {/* header */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Simulador de Meta</div>
        {activeMonth && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Competência: {formatMonthYear(activeMonth)}
          </div>
        )}
      </div>

      {/* admin seller selector */}
      {isAdmin && (
        <Card>
          <SectionTitle>VISÃO</SectionTitle>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#aaa' }}>Vendedor:</label>
            <select
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              style={{
                background: '#111',
                border: '1px solid #333',
                color: 'white',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <option value="">Toda a empresa</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {error && (
        <Card style={{ borderColor: '#7f1d1d', background: '#1c0a0a' }}>
          <div style={{ color: '#f87171', fontSize: 13 }}>⚠ {error}</div>
        </Card>
      )}

      {loading && (
        <Card>
          <div style={{ color: '#666', fontSize: 13 }}>Carregando métricas…</div>
        </Card>
      )}

      {!loading && result && metrics && (
        <>
          {/* 1. Configuration */}
          <Card>
            <SectionTitle>1. CONFIGURAÇÃO</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#888' }}>Meta de ganhos (mês)</label>
                <input
                  type="number"
                  min={1}
                  value={config.target_wins}
                  onChange={(e) => setTargetWins(Number(e.target.value))}
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #333',
                    color: 'white',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 16,
                    fontWeight: 700,
                    width: '100%',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#888' }}>Taxa de conversão (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(config.close_rate * 100)}
                  onChange={(e) => setCloseRate(Number(e.target.value) / 100)}
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #333',
                    color: 'white',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 16,
                    fontWeight: 700,
                    width: '100%',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#888' }}>Dias úteis restantes</label>
                <input
                  type="number"
                  min={1}
                  value={config.remaining_business_days}
                  onChange={(e) => setRemainingDays(Number(e.target.value))}
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #333',
                    color: 'white',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 16,
                    fontWeight: 700,
                    width: '100%',
                  }}
                />
              </div>
            </div>
          </Card>

          {/* 2. Results */}
          <Card>
            <SectionTitle>2. RESULTADOS CALCULADOS</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              <Stat label="Ciclos necessários (total)" value={result.needed_worked_cycles} />
              <Stat
                label="Ciclos restantes a trabalhar"
                value={result.remaining_worked_cycles}
                accent="#facc15"
              />
              <Stat
                label="Ritmo diário necessário"
                value={`${result.daily_worked_remaining}/dia`}
                accent="#60a5fa"
              />
            </div>
          </Card>

          {/* 3. Progress */}
          <Card>
            <SectionTitle>3. PROGRESSO ATUAL</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 18 }}>
              <Stat
                label="Ganhos no mês"
                value={metrics.current_wins}
                accent="#4ade80"
              />
              <Stat
                label="Ciclos trabalhados"
                value={metrics.worked_count}
              />
              <Stat
                label="Status"
                value={result.on_track ? '✓ No ritmo' : '↓ Abaixo'}
                accent={result.on_track ? '#4ade80' : '#f87171'}
              />
            </div>
            {/* progress bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                <span>Progresso da meta</span>
                <span>{result.progress_pct.toFixed(1)}%</span>
              </div>
              <div style={{ background: '#222', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progressBar}%`,
                    background: result.on_track ? '#4ade80' : '#facc15',
                    borderRadius: 6,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>
                {metrics.current_wins} de {config.target_wins} ganhos
              </div>
            </div>
          </Card>

          {/* 4. Funnel */}
          <Card>
            <SectionTitle>4. FUNIL DO MÊS</SectionTitle>
            <div style={{ display: 'grid', gap: 10 }}>
              <FunnelRow label="Novo" value={metrics.counts_by_status.novo} total={funnelTotal} />
              <FunnelRow label="Contato" value={metrics.counts_by_status.contato} total={funnelTotal} />
              <FunnelRow label="Respondeu" value={metrics.counts_by_status.respondeu} total={funnelTotal} />
              <FunnelRow label="Negociação" value={metrics.counts_by_status.negociacao} total={funnelTotal} />
              <FunnelRow label="Ganho" value={metrics.counts_by_status.ganho} total={funnelTotal} />
              <FunnelRow label="Perdido" value={metrics.counts_by_status.perdido} total={funnelTotal} />
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid #222',
                display: 'flex',
                gap: 24,
                fontSize: 12,
                color: '#666',
              }}
            >
              <span>Total no funil: {funnelTotal}</span>
              <span>Em aberto: {metrics.total_open}</span>
              {isAdmin && metrics.total_pool > 0 && <span>Pool sem dono: {metrics.total_pool}</span>}
            </div>
          </Card>

          {/* 5. Simulations */}
          <Card>
            <SectionTitle>5. SIMULAÇÕES (E SE…)</SectionTitle>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
                paddingBottom: 10,
                borderBottom: '1px solid #1f1f1f',
                fontSize: 11,
                color: '#555',
              }}
            >
              <span>Taxa</span>
              <span>Ciclos necessários</span>
              <span>Ritmo diário (restante)</span>
            </div>
            <SimRow
              label={`15% ${config.close_rate === 0.15 ? '← atual' : ''}`}
              cycles={result.simulation_15pct}
              dailyNeeded={Math.ceil(
                Math.ceil(Math.max(0, config.target_wins - metrics.current_wins) / 0.15) /
                  Math.max(1, config.remaining_business_days)
              )}
            />
            <SimRow
              label={`20%`}
              cycles={Math.ceil(config.target_wins / 0.2)}
              dailyNeeded={Math.ceil(
                Math.ceil(Math.max(0, config.target_wins - metrics.current_wins) / 0.2) /
                  Math.max(1, config.remaining_business_days)
              )}
            />
            <SimRow
              label={`25% ${config.close_rate === 0.25 ? '← atual' : ''}`}
              cycles={result.simulation_25pct}
              dailyNeeded={Math.ceil(
                Math.ceil(Math.max(0, config.target_wins - metrics.current_wins) / 0.25) /
                  Math.max(1, config.remaining_business_days)
              )}
            />
            <div style={{ marginTop: 12, fontSize: 12, color: '#555' }}>
              Taxa atual configurada: {fmtPct(config.close_rate)} →{' '}
              {result.needed_worked_cycles} ciclos totais /{' '}
              {result.daily_worked_remaining} por dia restante
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
