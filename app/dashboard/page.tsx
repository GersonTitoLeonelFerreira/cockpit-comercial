'use client'

import { useMemo } from 'react'
import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'

type DashboardTone = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate'

type AnyRecord = Record<string, any>

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('pt-BR')

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const statusLabels: Record<string, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  negociação: 'Negociação',
  fechado: 'Fechado',
  ganho: 'Ganho',
  won: 'Ganho',
  perdido: 'Perdido',
  lost: 'Perdido',
}

const statusOrder = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'negociação',
  'fechado',
  'ganho',
  'won',
  'perdido',
  'lost',
]

const toneClasses: Record<
  DashboardTone,
  {
    card: string
    badge: string
    value: string
    border: string
    soft: string
    bar: string
  }
> = {
  blue: {
    card: 'from-blue-500/14 to-blue-500/5',
    badge: 'bg-blue-500/12 text-blue-200 ring-blue-400/20',
    value: 'text-blue-100',
    border: 'border-blue-400/20',
    soft: 'bg-blue-500/10 text-blue-200',
    bar: 'bg-blue-400',
  },
  green: {
    card: 'from-emerald-500/14 to-emerald-500/5',
    badge: 'bg-emerald-500/12 text-emerald-200 ring-emerald-400/20',
    value: 'text-emerald-100',
    border: 'border-emerald-400/20',
    soft: 'bg-emerald-500/10 text-emerald-200',
    bar: 'bg-emerald-400',
  },
  amber: {
    card: 'from-amber-500/14 to-amber-500/5',
    badge: 'bg-amber-500/12 text-amber-200 ring-amber-400/20',
    value: 'text-amber-100',
    border: 'border-amber-400/20',
    soft: 'bg-amber-500/10 text-amber-200',
    bar: 'bg-amber-400',
  },
  red: {
    card: 'from-red-500/14 to-red-500/5',
    badge: 'bg-red-500/12 text-red-200 ring-red-400/20',
    value: 'text-red-100',
    border: 'border-red-400/20',
    soft: 'bg-red-500/10 text-red-200',
    bar: 'bg-red-400',
  },
  purple: {
    card: 'from-violet-500/14 to-violet-500/5',
    badge: 'bg-violet-500/12 text-violet-200 ring-violet-400/20',
    value: 'text-violet-100',
    border: 'border-violet-400/20',
    soft: 'bg-violet-500/10 text-violet-200',
    bar: 'bg-violet-400',
  },
  slate: {
    card: 'from-slate-500/14 to-slate-500/5',
    badge: 'bg-slate-500/12 text-slate-200 ring-slate-400/20',
    value: 'text-slate-100',
    border: 'border-slate-400/20',
    soft: 'bg-slate-500/10 text-slate-200',
    bar: 'bg-slate-400',
  },
}

function normalizeStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase()
}

function getStatusLabel(status?: string | null) {
  const normalized = normalizeStatus(status)
  return statusLabels[normalized] || status || 'Sem status'
}

function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatNumber(value: number) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatPercent(value: number) {
  return `${percentFormatter.format(Number.isFinite(value) ? value : 0)}%`
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getLeadName(deal: AnyRecord) {
  return (
    deal.lead_name ||
    deal.name ||
    deal.nome ||
    deal.razao_social ||
    deal.company_name ||
    deal.lead_id ||
    deal.id ||
    'Lead sem identificação'
  )
}

function getOwnerLabel(item: AnyRecord) {
  return (
    item.owner_email ||
    item.email ||
    item.seller_email ||
    item.user_email ||
    item.owner_id ||
    'Sem responsável'
  )
}

function getConversionTone(conversion: number): DashboardTone {
  if (conversion >= 20) return 'green'
  if (conversion >= 12) return 'amber'
  return 'red'
}

function getPipelineTone(status: string): DashboardTone {
  const normalized = normalizeStatus(status)

  if (['ganho', 'fechado', 'won'].includes(normalized)) return 'green'
  if (['perdido', 'lost'].includes(normalized)) return 'red'
  if (['negociacao', 'negociação'].includes(normalized)) return 'amber'
  if (['respondeu'].includes(normalized)) return 'purple'
  if (['contato'].includes(normalized)) return 'blue'

  return 'slate'
}

function MetricCard({
  label,
  value,
  description,
  tone,
  helper,
}: {
  label: string
  value: string
  description: string
  tone: DashboardTone
  helper?: string
}) {
  const classes = toneClasses[tone]

  return (
    <div
      className={`rounded-2xl border ${classes.border} bg-gradient-to-br ${classes.card} p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className={`mt-3 text-2xl font-semibold tracking-tight ${classes.value}`}>
            {value}
          </p>
        </div>

        {helper ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${classes.badge}`}
          >
            {helper}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-5 text-slate-400">{description}</p>
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-800/80 bg-[#0d0f14] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-3 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="p-5">{children}</div>
    </section>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center">
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#090b0f] p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-28 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="h-96 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
          <div className="h-96 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
        </div>
      </div>
    </div>
  )
}

function ProgressLine({
  label,
  value,
  max,
  tone,
  helper,
}: {
  label: string
  value: number
  max: number
  tone: DashboardTone
  helper?: string
}) {
  const safeMax = max > 0 ? max : 1
  const width = Math.max(4, Math.min(100, (value / safeMax) * 100))
  const classes = toneClasses[tone]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
        </div>

        <p className="text-sm font-semibold text-slate-300">{formatNumber(value)}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-900">
        <div
          className={`h-full rounded-full ${classes.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function StatusPill({ status }: { status?: string | null }) {
  const tone = getPipelineTone(status || '')
  const classes = toneClasses[tone]

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${classes.badge}`}
    >
      {getStatusLabel(status)}
    </span>
  )
}

export default function DashboardPage() {
  const {
    funnel,
    performance,
    monthly,
    lost,
    upcomingDeals,
    loading,
    error,
  } = useKPIsAndAnalytics()

  const totals = useMemo(() => {
    const hasPerformance = performance.length > 0

    const totalDealsByPerformance = performance.reduce(
      (sum, item) => sum + Number(item.total_deals || 0),
      0
    )

    const wonDealsByPerformance = performance.reduce(
      (sum, item) => sum + Number(item.deals_ganhos || 0),
      0
    )

    const lostDealsByPerformance = performance.reduce(
      (sum, item) => sum + Number(item.deals_perdidos || 0),
      0
    )

    const activeDealsByPerformance = performance.reduce(
      (sum, item) => sum + Number(item.deals_ativos || 0),
      0
    )

    const revenueByPerformance = performance.reduce(
      (sum, item) => sum + Number(item.valor_total_ganho || 0),
      0
    )

    const totalDealsByFunnel = funnel.reduce(
      (sum, item) => sum + Number(item.total_deals || 0),
      0
    )

    const wonDealsByFunnel = funnel.reduce(
      (sum, item) => sum + Number(item.deals_ganhos || 0),
      0
    )

    const lostDealsByFunnel = funnel.reduce(
      (sum, item) => sum + Number(item.deals_perdidos || 0),
      0
    )

    const revenueByFunnel = funnel.reduce(
      (sum, item) => sum + Number(item.valor_total_ganho || 0),
      0
    )

    const activeDealsByFunnel = funnel.reduce((sum, item) => {
      const status = normalizeStatus(item.status)
      const isClosed = ['perdido', 'lost', 'ganho', 'won', 'fechado'].includes(status)

      return isClosed ? sum : sum + Number(item.total_deals || 0)
    }, 0)

    const totalDeals = hasPerformance ? totalDealsByPerformance : totalDealsByFunnel
    const wonDeals = hasPerformance ? wonDealsByPerformance : wonDealsByFunnel
    const lostDeals = hasPerformance ? lostDealsByPerformance : lostDealsByFunnel
    const activeDeals = hasPerformance ? activeDealsByPerformance : activeDealsByFunnel
    const revenue = hasPerformance ? revenueByPerformance : revenueByFunnel

    const conversion = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0
    const lossRate = totalDeals > 0 ? (lostDeals / totalDeals) * 100 : 0
    const averageTicket = wonDeals > 0 ? revenue / wonDeals : 0

    return {
      totalDeals,
      wonDeals,
      lostDeals,
      activeDeals,
      revenue,
      conversion,
      lossRate,
      averageTicket,
    }
  }, [performance, funnel])

  const orderedPipeline = useMemo(() => {
    return [...funnel]
      .map((item) => ({
        status: String(item.status || 'sem_status'),
        total: Number(item.total_deals || 0),
        won: Number(item.deals_ganhos || 0),
        lost: Number(item.deals_perdidos || 0),
      }))
      .sort((a, b) => {
        const indexA = statusOrder.indexOf(normalizeStatus(a.status))
        const indexB = statusOrder.indexOf(normalizeStatus(b.status))

        return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB)
      })
  }, [funnel])

  const maxPipelineValue = useMemo(() => {
    return Math.max(...orderedPipeline.map((item) => item.total), 1)
  }, [orderedPipeline])

  const topPerformers = useMemo(() => {
    return [...performance]
      .sort(
        (a, b) =>
          Number(b.valor_total_ganho || 0) - Number(a.valor_total_ganho || 0)
      )
      .slice(0, 5)
  }, [performance])

  const monthlyTrend = useMemo(() => {
    return [...monthly]
      .sort((a, b) => String(a.mes || '').localeCompare(String(b.mes || '')))
      .slice(-6)
  }, [monthly])

  const maxMonthlyRevenue = useMemo(() => {
    return Math.max(
      ...monthlyTrend.map((item) => Number(item.receita_total || 0)),
      1
    )
  }, [monthlyTrend])

  const topLostReasons = useMemo(() => {
    return [...lost]
      .sort(
        (a, b) =>
          Number(b.total_deals_perdidos || 0) -
          Number(a.total_deals_perdidos || 0)
      )
      .slice(0, 5)
  }, [lost])

  const dashboardDiagnosis = useMemo(() => {
    if (totals.totalDeals === 0) {
      return {
        tone: 'slate' as DashboardTone,
        title: 'Base comercial ainda sem leitura',
        description:
          'A dashboard precisa de ciclos de venda registrados para gerar diagnóstico operacional.',
      }
    }

    if (totals.activeDeals > 0 && upcomingDeals.length === 0) {
      return {
        tone: 'red' as DashboardTone,
        title: 'Risco de follow-up invisível',
        description:
          'Existem ciclos ativos, mas nenhum próximo contato aparece na agenda. Isso indica possível falha de disciplina comercial.',
      }
    }

    if (totals.conversion >= 20) {
      return {
        tone: 'green' as DashboardTone,
        title: 'Conversão dentro da zona saudável',
        description:
          'A operação está próxima ou acima da referência de 20%. O foco agora deve ser escala, ticket médio e consistência.',
      }
    }

    if (totals.conversion >= 12) {
      return {
        tone: 'amber' as DashboardTone,
        title: 'Conversão em zona de atenção',
        description:
          'Existe tração, mas a eficiência ainda não está madura. Revise abordagem, follow-up e qualidade dos leads trabalhados.',
      }
    }

    return {
      tone: 'red' as DashboardTone,
      title: 'Conversão abaixo do mínimo operacional',
      description:
        'O funil está gerando esforço, mas pouco fechamento. A prioridade é auditar perda, objeções e passagem entre etapas.',
    }
  }, [totals, upcomingDeals.length])

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <main className="min-h-screen bg-[#090b0f] p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.22),transparent_34%),linear-gradient(135deg,#0d0f14,#111318)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                Cockpit Comercial
              </span>

              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Dashboard executivo da operação comercial
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
                Visão direta de receita, conversão, pipeline, próximos contatos,
                performance por vendedor e perdas. O foco aqui é decisão rápida,
                não gráfico decorativo.
              </p>
            </div>

            <div
              className={`max-w-xl rounded-2xl border ${
                toneClasses[dashboardDiagnosis.tone].border
              } bg-slate-950/45 p-4`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    toneClasses[dashboardDiagnosis.tone].bar
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {dashboardDiagnosis.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-400">
                    {dashboardDiagnosis.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            Erro ao carregar os dados da dashboard: {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Receita gerada"
            value={formatCurrency(totals.revenue)}
            description="Valor ganho registrado nos ciclos fechados."
            tone="green"
            helper={`${formatNumber(totals.wonDeals)} ganhos`}
          />

          <MetricCard
            label="Conversão real"
            value={formatPercent(totals.conversion)}
            description="Ganhos sobre o total de ciclos analisados."
            tone={getConversionTone(totals.conversion)}
            helper="meta 20%"
          />

          <MetricCard
            label="Ciclos ativos"
            value={formatNumber(totals.activeDeals)}
            description="Volume vivo que ainda precisa de ação comercial."
            tone="blue"
            helper={`${formatNumber(totals.totalDeals)} total`}
          />

          <MetricCard
            label="Ticket médio"
            value={formatCurrency(totals.averageTicket)}
            description="Receita média por ciclo ganho."
            tone="purple"
            helper={`${formatPercent(totals.lossRate)} perda`}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard
            title="Pipeline vivo"
            description="Distribuição dos ciclos por etapa. Aqui aparece onde a operação concentra esforço."
          >
            {orderedPipeline.length > 0 ? (
              <div className="space-y-5">
                {orderedPipeline.map((item) => (
                  <ProgressLine
                    key={item.status}
                    label={getStatusLabel(item.status)}
                    value={item.total}
                    max={maxPipelineValue}
                    tone={getPipelineTone(item.status)}
                    helper={
                      item.won > 0 || item.lost > 0
                        ? `${formatNumber(item.won)} ganhos · ${formatNumber(
                            item.lost
                          )} perdidos`
                        : 'Etapa ativa do funil'
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem dados de funil"
                description="Quando houver ciclos cadastrados, a distribuição por etapa aparecerá aqui."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Próximas ações"
            description="Agenda comercial dos próximos contatos registrados."
            action={
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-slate-700">
                {formatNumber(upcomingDeals.length)} pendências
              </span>
            }
          >
            {upcomingDeals.length > 0 ? (
              <div className="space-y-3">
                {upcomingDeals.slice(0, 6).map((deal, index) => (
                  <div
                    key={`${deal.id || deal.sales_cycle_id || deal.lead_id}-${index}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/45 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {getLeadName(deal)}
                        </p>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          {deal.next_action || 'Próxima ação não descrita'}
                        </p>
                      </div>

                      <StatusPill status={deal.status} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{formatDate(deal.next_action_date)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" />
                      <span>{getOwnerLabel(deal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhuma próxima ação encontrada"
                description="Isso pode ser bom se não houver ciclos ativos. Se houver ciclos ativos, é um sinal de falha de follow-up."
              />
            )}
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            title="Ranking de performance"
            description="Leitura objetiva de vendedor, receita, conversão e ciclos ativos."
          >
            {topPerformers.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/80 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Vendedor</th>
                      <th className="px-4 py-3 font-semibold">Receita</th>
                      <th className="px-4 py-3 font-semibold">Conv.</th>
                      <th className="px-4 py-3 font-semibold">Ativos</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800">
                    {topPerformers.map((seller, index) => (
                      <tr
                        key={`${seller.owner_id || seller.owner_email}-${index}`}
                        className="bg-slate-950/30"
                      >
                        <td className="max-w-[220px] px-4 py-3">
                          <p className="truncate font-medium text-slate-200">
                            {getOwnerLabel(seller)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatNumber(Number(seller.total_deals || 0))} ciclos
                          </p>
                        </td>

                        <td className="px-4 py-3 font-semibold text-emerald-200">
                          {formatCurrency(Number(seller.valor_total_ganho || 0))}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {formatPercent(Number(seller.taxa_conversao_pct || 0))}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {formatNumber(Number(seller.deals_ativos || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Sem performance por vendedor"
                description="A tabela será preenchida quando houver ciclos vinculados a responsáveis."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Evolução mensal"
            description="Receita e volume de ganhos nos últimos meses disponíveis."
          >
            {monthlyTrend.length > 0 ? (
              <div className="space-y-4">
                {monthlyTrend.map((item) => {
                  const revenue = Number(item.receita_total || 0)
                  const width = Math.max(
                    4,
                    Math.min(100, (revenue / maxMonthlyRevenue) * 100)
                  )

                  return (
                    <div key={String(item.mes)} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            {String(item.mes || 'Mês não informado')}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatNumber(Number(item.deals_ganhos || 0))} ganhos ·{' '}
                            {formatPercent(Number(item.taxa_conversao_pct || 0))}
                          </p>
                        </div>

                        <p className="text-sm font-semibold text-emerald-200">
                          {formatCurrency(revenue)}
                        </p>
                      </div>

                      <div className="h-9 overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-800">
                        <div
                          className="flex h-full items-center justify-end rounded-xl bg-gradient-to-r from-blue-500 to-emerald-400 pr-3 text-xs font-semibold text-slate-950"
                          style={{ width: `${width}%` }}
                        >
                          {width > 22 ? formatCurrency(revenue) : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                title="Sem histórico mensal"
                description="Quando houver ciclos ganhos com data de fechamento, a evolução mensal aparecerá aqui."
              />
            )}
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <SectionCard
            title="Motivos de perda"
            description="O que está bloqueando fechamento. Sem motivo registrado, a gestão fica cega."
          >
            {topLostReasons.length > 0 ? (
              <div className="space-y-4">
                {topLostReasons.map((reason, index) => (
                  <ProgressLine
                    key={`${reason.lost_reason || 'sem-motivo'}-${index}`}
                    label={reason.lost_reason || 'Sem motivo registrado'}
                    value={Number(reason.total_deals_perdidos || 0)}
                    max={Math.max(
                      ...topLostReasons.map((item) =>
                        Number(item.total_deals_perdidos || 0)
                      ),
                      1
                    )}
                    tone={index === 0 ? 'red' : 'amber'}
                    helper={`${formatPercent(
                      Number(reason.percentual_pct || 0)
                    )} das perdas · ${formatNumber(
                      Number(reason.dias_ate_perda || 0)
                    )} dias até perda`}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem perdas registradas"
                description="Quando houver ciclos perdidos, os motivos mais recorrentes aparecerão aqui."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Leitura gerencial"
            description="Resumo para tomada de decisão rápida."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Eficiência
                </p>
                <p className="mt-3 text-lg font-semibold text-slate-100">
                  {totals.conversion >= 20
                    ? 'Boa'
                    : totals.conversion >= 12
                      ? 'Atenção'
                      : 'Crítica'}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  A conversão atual está em {formatPercent(totals.conversion)}.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Execução
                </p>
                <p className="mt-3 text-lg font-semibold text-slate-100">
                  {upcomingDeals.length > 0 ? 'Com agenda' : 'Sem agenda'}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  Existem {formatNumber(upcomingDeals.length)} próximas ações
                  registradas.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Prioridade
                </p>
                <p className="mt-3 text-lg font-semibold text-slate-100">
                  {totals.activeDeals > 0 ? 'Trabalhar pipeline' : 'Gerar demanda'}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  A base ativa atual tem {formatNumber(totals.activeDeals)} ciclos
                  vivos.
                </p>
              </div>
            </div>
          </SectionCard>
        </section>
      </div>
    </main>
  )
}