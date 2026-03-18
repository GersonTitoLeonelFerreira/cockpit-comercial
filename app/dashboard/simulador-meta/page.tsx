'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  getActiveCompetency,
  getSalesCycleMetrics,
  calculateSimulatorResult,
  getGroupConversion,
} from '@/app/lib/services/simulator'
import {
  getCloseRateReal,
  percentToRate,
} from '@/app/lib/services/simulatorRateReal'
import {
  SimulatorMetrics,
  SimulatorResult,
  GroupConversionRow,
} from '@/app/types/simulator'
import { CloseRateRealResponse } from '@/app/types/simulatorRateReal'

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${Math.round(v * 100)}%`
}

function countRemainingBusinessDays(endDate: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)

  if (endDate < today) return 0

  let count = 0
  const cur = new Date(today)
  while (cur <= endDate) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function Card({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string
  value: React.ReactNode
  subtitle?: React.ReactNode
  tone?: 'neutral' | 'good' | 'bad'
}) {
  const border =
    tone === 'good' ? '1px solid #1f5f3a' : tone === 'bad' ? '1px solid #5f1f1f' : '1px solid #2a2a2a'
  const bg = tone === 'good' ? '#07140c' : tone === 'bad' ? '#140707' : '#0f0f0f'

  return (
    <div style={{ border, background: bg, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 8 }}>{title}</div>
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
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ border: '1px solid #202020', background: '#0c0c0c', borderRadius: 16, padding: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 900 }}>{title}</div>
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

  const [targetWins, setTargetWins] = useState(20)
  const [closeRatePercent, setCloseRatePercent] = useState(20)
  const [remainingBusinessDays, setRemainingBusinessDays] = useState(15)

  const [isAdmin, setIsAdmin] = useState(false)
  const [sellers, setSellers] = useState<Array<{ id: string; label: string }>>([])
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const [rateRealData, setRateRealData] = useState<CloseRateRealResponse | null>(null)
  const [rateRealLoading, setRateRealLoading] = useState(false)
  const [daysWindow, setDaysWindow] = useState(90)

  const [groupConversion, setGroupConversion] = useState<GroupConversionRow[]>([])
  const [groupConversionLoading, setGroupConversionLoading] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

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

        const endDate = new Date(comp.month_end)
        const remainingDays = countRemainingBusinessDays(endDate)
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

        const metrics = await getSalesCycleMetrics(null, comp.month_start)
        setMetrics(metrics)

        const res = calculateSimulatorResult(metrics, {
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

    init()
  }, [supabase])

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

    if (competency) {
      loadRateReal()
    }
  }, [selectedSellerId, daysWindow, competency])

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

    refetch()
  }, [competency, selectedSellerId])

  useEffect(() => {
    if (!competency || !companyId || selectedSellerId === undefined) return

    const cid = companyId
    const dateEnd = competency.month_end
      ? competency.month_end.split('T')[0]
      : competency.month_end

    async function loadGroupConversion() {
      setGroupConversionLoading(true)
      try {
        const rows = await getGroupConversion({
          companyId: cid,
          ownerId: selectedSellerId,
          dateStart: competency.month_start,
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

    loadGroupConversion()
  }, [competency, selectedSellerId, companyId])

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
        <div style={{ padding: 12, borderRadius: 12, border: '1px solid #3a2222', background: '#160b0b', color: '#ffb3b3' }}>
          {error}
        </div>
      </div>
    )
  }

  const progressPct = result?.progress_pct ?? 0
  const progressTone = progressPct >= 100 ? 'good' : progressPct >= 50 ? 'neutral' : 'bad'

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
        <Section title="Configuração" description="Defina sua meta de ganhos e taxa de conversão.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Meta de Ganhos</div>
              <input
                type="number"
                value={targetWins}
                onChange={(e) => setTargetWins(Math.max(1, parseInt(e.target.value) || 1))}
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
          </div>

          {competency ? (
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
              Período: {competency.month_start} até {competency.month_end?.split('T')[0]}
            </div>
          ) : null}
        </Section>

        {rateRealData ? (
          <Section title="Taxa Real (Histórico 90d)" description="Baseado em dados históricos do vendedor/empresa.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Card
                title="Taxa Vendedor"
                value={
                  rateRealData.vendor.close_rate
                    ? `${(rateRealData.vendor.close_rate * 100).toFixed(1)}%`
                    : '—'
                }
                subtitle={
                  rateRealData.vendor.worked >= 30
                    ? `${rateRealData.vendor.wins} ganhos / ${rateRealData.vendor.worked} trabalhados`
                    : `⚠️ Amostra pequena (${rateRealData.vendor.worked})`
                }
                tone={rateRealData.vendor.worked >= 30 ? 'neutral' : 'bad'}
              />

              <Card
                title="Taxa Empresa"
                value={
                  rateRealData.company.close_rate
                    ? `${(rateRealData.company.close_rate * 100).toFixed(1)}%`
                    : '—'
                }
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
                    }
                  }}
                  disabled={!rateRealData.vendor.close_rate || rateRealData.vendor.worked < 30}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background:
                      rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                        ? '#1f5f3a'
                        : '#1a1a1a',
                    color: 'white',
                    cursor:
                      rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30
                        ? 'pointer'
                        : 'not-allowed',
                    fontWeight: 900,
                    opacity:
                      rateRealData.vendor.close_rate && rateRealData.vendor.worked >= 30 ? 1 : 0.5,
                  }}
                >
                  Usar taxa real
                </button>
              </div>
            </div>

            {rateRealLoading ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Carregando taxa real...</div>
            ) : null}
          </Section>
        ) : null}

        <Section title="Resultado" description="Números para bater sua meta.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Card
              title="Ciclos Necessários"
              value={result?.needed_worked_cycles ?? '—'}
              subtitle={
                result ? `${result.needed_wins} ganhos ÷ ${closeRatePercent}% taxa` : undefined
              }
            />
            <Card
              title="Ciclos Restantes"
              value={result?.remaining_worked_cycles ?? '—'}
              subtitle={
                result
                  ? `${result.remaining_wins} ganhos restantes ÷ ${closeRatePercent}%`
                  : undefined
              }
            />
            <Card
              title="Ciclos/Dia (período)"
              value={result?.daily_worked_needed ?? '—'}
              subtitle={result ? `${result.needed_worked_cycles} ciclos ÷ 22 dias` : undefined}
            />
            <Card
              title="Ciclos/Dia (restante)"
              value={result?.daily_worked_remaining ?? '—'}
              subtitle={
                result ? `${result.remaining_worked_cycles} ciclos ÷ ${remainingBusinessDays} dias` : undefined
              }
            />
          </div>
        </Section>

        <Section title="Progresso" description="Seu desempenho atual no mês.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Card
              title="Ganhos Atuais"
              value={metrics?.current_wins ?? '—'}
              subtitle={
                result ? `${pct(result.progress_pct)} da meta (${result.needed_wins} alvo)` : undefined
              }
              tone={progressTone}
            />
            <Card
              title="Ciclos Trabalhados"
              value={metrics?.worked_count ?? '—'}
              subtitle={
                metrics && result
                  ? `Taxa real: ${pct(metrics.current_wins / Math.max(1, metrics.worked_count))}`
                  : undefined
              }
            />
            <Card
              title="Status"
              value={result?.on_track ? '✅ No ritmo!' : '⚠️ Acelerar'}
              tone={result?.on_track ? 'good' : 'bad'}
            />
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

        <Section
          title="Conversão por Grupo (no período)"
          description="Trabalhados → Ganhos por grupo de leads."
        >
          {groupConversionLoading ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Carregando conversão por grupo...</div>
          ) : groupConversion.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Nenhum dado encontrado para o período.</div>
          ) : (() => {
            const ganhoTotal = groupConversion.reduce((s, r) => s + r.ganho, 0)
            const trabalhadosTotal = groupConversion.reduce((s, r) => s + r.trabalhados, 0)
            const pctTotal = trabalhadosTotal > 0 ? ganhoTotal / trabalhadosTotal : 0
            const fmtPct = (v: number) =>
              (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'

            return (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <Card
                    title="% Total (Conversão Geral do Período)"
                    value={fmtPct(pctTotal)}
                    subtitle={`${ganhoTotal} ganhos / ${trabalhadosTotal} trabalhados`}
                    tone={pctTotal >= 0.25 ? 'good' : pctTotal >= 0.1 ? 'neutral' : 'bad'}
                  />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', opacity: 0.75, fontWeight: 700 }}>Grupo</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', opacity: 0.75, fontWeight: 700 }}>Vendas</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', opacity: 0.75, fontWeight: 700 }}>Trabalhados</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', opacity: 0.75, fontWeight: 700 }}>% do Grupo</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', opacity: 0.75, fontWeight: 700 }}>% Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupConversion.map((row, i) => (
                        <tr
                          key={row.group_id ?? `sem-grupo-${i}`}
                          style={{ borderBottom: '1px solid #1a1a1a' }}
                        >
                          <td style={{ padding: '8px 10px' }}>{row.group_name}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6ee7b7', fontWeight: 700 }}>
                            {row.ganho}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{row.trabalhados}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtPct(row.pct_grupo)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', opacity: 0.85 }}>
                            {fmtPct(row.pct_participacao)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </Section>

        <Section title="E se..." description="Simulações com taxas diferentes.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Card
              title="Se taxa for 15%"
              value={result?.simulation_15pct ?? '—'}
              subtitle={`${targetWins} ganhos ÷ 15%`}
            />
            <Card
              title={`Atual (${closeRatePercent}%)`}
              value={result?.needed_worked_cycles ?? '—'}
              subtitle={`${targetWins} ganhos ÷ ${closeRatePercent}%`}
              tone="neutral"
            />
            <Card
              title="Se taxa for 25%"
              value={result?.simulation_25pct ?? '—'}
              subtitle={`${targetWins} ganhos ÷ 25%`}
              tone="good"
            />
          </div>
        </Section>
      </div>
    </div>
  )
}