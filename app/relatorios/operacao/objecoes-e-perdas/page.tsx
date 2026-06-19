'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import {
  STAGE_LABELS,
  resolveActionId,
  resolveCheckpointData,
} from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import * as faturamentoService from '@/app/lib/services/faturamento'

type SellerOption = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

type RawEvent = {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

type ObjectionStat = {
  text: string
  total: number
  byStage: Record<string, number>
}

type LossStat = {
  reason: string
  total: number
  byStage: Record<string, number>
}

type ReportData = {
  objections: ObjectionStat[]
  losses: LossStat[]
  totalLost: number
  totalWon: number
  totalObjectionEvents: number
}

type ViewType = 'both' | 'objections' | 'losses'

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const STAGE_COLORS: Record<string, string> = {
  novo: '#60a5fa',
  contato: '#a78bfa',
  respondeu: '#34d399',
  negociacao: '#fbbf24',
}

const OBJECTION_ACTION_ID = 'negociacao_objecao_registrada'

const SUBNAV = [
  { label: 'Visão Executiva', href: '/relatorios/operacao/visao-executiva' },
  { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: null },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
]

const fieldLabelStyle: React.CSSProperties = {
  color: '#4a5569',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  background: '#0d0f14',
  border: '1px solid #1a1d2e',
  borderRadius: 7,
  color: '#edf2f7',
  colorScheme: 'dark',
  fontSize: 13,
  outline: 'none',
  padding: '7px 10px',
}

function getThirtyDaysAgo() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function safePct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function cardStyle(): React.CSSProperties {
  return {
    background: '#141722',
    border: '1px solid #1a1d2e',
    borderRadius: 9,
  }
}

function buildReportData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string,
  stageFilter: string,
): ReportData {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  const objectionMap = new Map<
    string,
    { total: number; byStage: Record<string, number> }
  >()

  const lossMap = new Map<
    string,
    { total: number; byStage: Record<string, number> }
  >()

  let totalLost = 0
  let totalWon = 0

  for (const event of events) {
    if (event.occurred_at < rangeStart || event.occurred_at > rangeEnd) continue
    if (isAdmin && selectedSellerId && event.created_by !== selectedSellerId) continue
    if (!isAdmin && event.created_by !== currentUserId) continue

    const metadata = event.metadata ?? {}
    const checkpoint = resolveCheckpointData(metadata)
    const kind = classifyEvent(event)

    if (kind === 'won') {
      const stage = String(
        metadata.from_status ??
          metadata.from_stage ??
          metadata.stage ??
          'negociacao',
      ).toLowerCase()

      if (stageFilter && stage !== stageFilter) continue

      totalWon += 1
      continue
    }

    if (kind === 'lost') {
      const stage = String(
        metadata.from_status ??
          metadata.from_stage ??
          metadata.stage ??
          'negociacao',
      ).toLowerCase()

      if (stageFilter && stage !== stageFilter) continue

      const reason =
        String(
          metadata.reason ??
            checkpoint.reason ??
            metadata.loss_reason ??
            checkpoint.lost_reason ??
            checkpoint.loss_reason ??
            checkpoint.note ??
            metadata.detail ??
            metadata.details ??
            checkpoint.details ??
            '',
        ).trim() || 'Sem motivo registrado'

      const existing = lossMap.get(reason) ?? { total: 0, byStage: {} }
      existing.total += 1
      existing.byStage[stage] = (existing.byStage[stage] ?? 0) + 1
      lossMap.set(reason, existing)
      totalLost += 1
      continue
    }

    const rawActionId = String(
      metadata.action_id ?? metadata.quick_action ?? event.event_type ?? '',
    ).trim()

    const resolvedActionId = rawActionId ? resolveActionId(rawActionId) : ''
    const hasObjectionText =
      typeof metadata.objection === 'string' &&
      metadata.objection.trim().length > 0
    const hasCheckpointObjection =
      checkpoint.action_result === 'Objeção identificada'

    if (
      resolvedActionId !== OBJECTION_ACTION_ID &&
      !hasObjectionText &&
      !hasCheckpointObjection
    ) {
      continue
    }

    const stage = String(
      metadata.to_status ??
        metadata.from_status ??
        metadata.from_stage ??
        metadata.stage ??
        'negociacao',
    ).toLowerCase()

    if (stageFilter && stage !== stageFilter) continue

    const text =
      String(
        checkpoint.result_detail ??
          metadata.result_detail ??
          metadata.objection ??
          metadata.detail ??
          metadata.details ??
          '',
      ).trim() || 'Sem detalhe registrado'

    const existing = objectionMap.get(text) ?? { total: 0, byStage: {} }
    existing.total += 1
    existing.byStage[stage] = (existing.byStage[stage] ?? 0) + 1
    objectionMap.set(text, existing)
  }

  const objections = Array.from(objectionMap.entries())
    .map(([text, value]) => ({
      text,
      total: value.total,
      byStage: value.byStage,
    }))
    .sort((a, b) => b.total - a.total)

  const losses = Array.from(lossMap.entries())
    .map(([reason, value]) => ({
      reason,
      total: value.total,
      byStage: value.byStage,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    objections,
    losses,
    totalLost,
    totalWon,
    totalObjectionEvents: objections.reduce((sum, item) => sum + item.total, 0),
  }
}

function KpiCard({
  label,
  value,
  detail,
  accent = '#edf2f7',
}: {
  label: string
  value: React.ReactNode
  detail: string
  accent?: string
}) {
  return (
    <div style={{ ...cardStyle(), minWidth: 0, padding: 18 }}>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{ color: accent, fontSize: 26, fontWeight: 900, lineHeight: 1.1, marginTop: 10 }}>
        {value}
      </div>
      <div style={{ color: '#8fa3bc', fontSize: 11, lineHeight: 1.45, marginTop: 8 }}>
        {detail}
      </div>
    </div>
  )
}

function StageBadges({ byStage }: { byStage: Record<string, number> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {STAGE_ORDER.filter((stage) => (byStage[stage] ?? 0) > 0).map((stage) => (
        <span
          key={stage}
          style={{
            background: `${STAGE_COLORS[stage]}16`,
            border: `1px solid ${STAGE_COLORS[stage]}33`,
            borderRadius: 4,
            color: STAGE_COLORS[stage],
            fontSize: 10,
            fontWeight: 800,
            padding: '3px 6px',
          }}
        >
          {STAGE_LABELS[stage] ?? stage}: {byStage[stage]}
        </span>
      ))}
    </div>
  )
}

function RankingCard({
  title,
  detail,
  accent,
  items,
  itemLabel,
}: {
  title: string
  detail: string
  accent: string
  items: Array<{ text: string; total: number; byStage: Record<string, number> }>
  itemLabel: string
}) {
  const maxTotal = items[0]?.total ?? 1

  return (
    <section style={{ ...cardStyle(), padding: '18px 20px' }}>
      <div style={{ borderBottom: '1px solid #13162a', paddingBottom: 14 }}>
        <div style={{ color: accent, fontSize: 14, fontWeight: 900 }}>{title}</div>
        <div style={{ color: '#8fa3bc', fontSize: 12, marginTop: 4 }}>{detail}</div>
      </div>

      {items.length === 0 ? (
        <div style={{ color: '#546070', fontSize: 12, paddingTop: 18 }}>
          Nenhum registro encontrado com os filtros selecionados.
        </div>
      ) : (
        <div>
          {items.map((item, index) => {
            const width = (item.total / maxTotal) * 100

            return (
              <div
                key={`${itemLabel}-${item.text}-${index}`}
                style={{ borderBottom: '1px solid #13162a', padding: '15px 0' }}
              >
                <div style={{ alignItems: 'flex-start', display: 'flex', gap: 10 }}>
                  <span
                    style={{
                      color: accent,
                      fontSize: 12,
                      fontWeight: 900,
                      minWidth: 20,
                      paddingTop: 1,
                    }}
                  >
                    {index + 1}.
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#edf2f7', fontSize: 13, lineHeight: 1.45 }}>
                      {item.text}
                    </div>
                    <StageBadges byStage={item.byStage} />
                  </div>
                  <div style={{ color: '#edf2f7', fontSize: 15, fontWeight: 900 }}>
                    {item.total}
                  </div>
                </div>
                <div style={{ background: '#1a1d2e', borderRadius: 99, height: 5, marginLeft: 30, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ background: accent, borderRadius: 99, height: '100%', width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function ObjecoesEPerdasPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [data, setData] = React.useState<ReportData | null>(null)

  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)
  const [selectedStage, setSelectedStage] = React.useState('')
  const [viewType, setViewType] = React.useState<ViewType>('both')

  React.useEffect(() => {
    async function initialize() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/me', { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('Não foi possível identificar a empresa ativa.')
        }

        const me = (await response.json()) as {
          user_id?: string
          active_company_id?: string | null
          active_role?: string | null
          active_company_role?: string | null
          is_platform_admin?: boolean
        }

        if (!me.user_id) throw new Error('Sessão expirada. Faça login novamente.')
        if (!me.active_company_id) throw new Error('Nenhuma empresa ativa foi encontrada.')

        const activeSellers = await faturamentoService.getSellers(
          supabase,
          me.active_company_id,
        )

        const role = String(
          me.active_role ?? me.active_company_role ?? '',
        ).toLowerCase()

        const adminUser =
          me.is_platform_admin === true ||
          ['admin', 'owner', 'manager'].includes(role)

        setCurrentUserId(me.user_id)
        setCompanyId(me.active_company_id)
        setIsAdmin(adminUser)
        setSellers(activeSellers as SellerOption[])
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar a página.')
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [supabase])

  React.useEffect(() => {
    if (companyId === null || currentUserId === null) return

    const resolvedCompanyId: string = companyId
    const resolvedCurrentUserId: string = currentUserId

    async function loadReport() {
      setLoadingData(true)
      setError(null)

      try {
        const events = await fetchAllCycleEvents(supabase, {
          companyId: resolvedCompanyId,
          dateStart,
          dateEnd,
          columns: 'id, cycle_id, event_type, metadata, occurred_at, created_by',
        })

        setData(
          buildReportData(
            events as RawEvent[],
            dateStart,
            dateEnd,
            selectedSellerId,
            isAdmin,
            resolvedCurrentUserId,
            selectedStage,
          ),
        )
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar dados.')
      } finally {
        setLoadingData(false)
      }
    }

    void loadReport()
  }, [
    companyId,
    currentUserId,
    dateStart,
    dateEnd,
    selectedSellerId,
    selectedStage,
    isAdmin,
    supabase,
  ])

  if (loading) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh' }}>
        Carregando Objeções e Perdas...
      </div>
    )
  }

  if (error && data === null) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <div style={{ ...cardStyle(), maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <strong style={{ color: '#fca5a5' }}>Não foi possível carregar o relatório.</strong>
          <div style={{ fontSize: 13, marginTop: 8 }}>{error}</div>
        </div>
      </div>
    )
  }

  const totalClosed = (data?.totalLost ?? 0) + (data?.totalWon ?? 0)
  const lossRate = safePct(data?.totalLost ?? 0, totalClosed)
  const topObjection = data?.objections[0] ?? null
  const topLoss = data?.losses[0] ?? null
  const objections = viewType === 'losses' ? [] : data?.objections ?? []
  const losses = viewType === 'objections' ? [] : data?.losses ?? []

  return (
    <div style={{ background: '#090b0f', color: '#edf2f7', minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a href="/relatorios" style={{ color: '#8fa3bc', display: 'inline-flex', fontSize: 13, marginBottom: 28, textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Objeções e Perdas</h1>
          <p style={{ color: '#8fa3bc', fontSize: 13, margin: '7px 0 0' }}>
            Por que os leads estão travando, recuando ou sendo perdidos no funil.
          </p>
        </header>

        <nav style={{ borderBottom: '1px solid #1a1d2e', display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 26 }}>
          {SUBNAV.map((tab) =>
            tab.href === null ? (
              <span key={tab.label} style={{ borderBottom: '2px solid #fb923c', color: '#fb923c', fontSize: 13, fontWeight: 800, marginBottom: -1, padding: '9px 14px' }}>
                {tab.label}
              </span>
            ) : (
              <a key={tab.label} href={tab.href} style={{ borderBottom: '2px solid transparent', color: '#8fa3bc', fontSize: 13, marginBottom: -1, padding: '9px 14px', textDecoration: 'none' }}>
                {tab.label}
              </a>
            ),
          )}
        </nav>

        <section style={{ ...cardStyle(), alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, padding: '16px 20px' }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>De</span>
            <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Até</span>
            <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} style={inputStyle} />
          </label>

          {isAdmin && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={fieldLabelStyle}>Consultor</span>
              <select value={selectedSellerId ?? ''} onChange={(event) => setSelectedSellerId(event.target.value || null)} style={{ ...inputStyle, minWidth: 215 }}>
                <option value="">Todos os consultores</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.full_name || seller.email || seller.id}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Etapa</span>
            <select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
              <option value="">Todas as etapas</option>
              {STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage] ?? stage}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Tipo</span>
            <select value={viewType} onChange={(event) => setViewType(event.target.value as ViewType)} style={{ ...inputStyle, minWidth: 175 }}>
              <option value="both">Objeções e perdas</option>
              <option value="objections">Só objeções</option>
              <option value="losses">Só perdas</option>
            </select>
          </label>

          {loadingData && <span style={{ color: '#8fa3bc', fontSize: 12, paddingBottom: 8 }}>Atualizando...</span>}
        </section>

        {error && (
          <div style={{ background: '#ef444414', border: '1px solid #ef444440', borderRadius: 7, color: '#fca5a5', fontSize: 13, marginBottom: 20, padding: '10px 14px' }}>
            {error}
          </div>
        )}

        <section style={{ marginBottom: 28 }}>
          <div style={{ color: '#fdba74', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>
            Leitura do período
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <KpiCard label="Objeções registradas" value={data?.totalObjectionEvents ?? 0} detail="objeções identificadas durante as ações" accent="#fdba74" />
            <KpiCard label="Perdas" value={data?.totalLost ?? 0} detail={totalClosed > 0 ? `${lossRate}% dos fechamentos foram perdas` : 'sem fechamentos no período'} accent="#fca5a5" />
            <KpiCard label="Principal objeção" value={topObjection?.text ?? '—'} detail={topObjection ? `${topObjection.total} ocorrência(s)` : 'sem objeções registradas'} accent="#fdba74" />
            <KpiCard label="Principal motivo de perda" value={topLoss?.reason ?? '—'} detail={topLoss ? `${topLoss.total} ocorrência(s)` : 'sem perdas registradas'} accent="#fca5a5" />
          </div>
        </section>

        {objections.length === 0 && losses.length === 0 && !loadingData ? (
          <section style={{ ...cardStyle(), color: '#8fa3bc', padding: '48px 24px', textAlign: 'center' }}>
            <strong style={{ color: '#edf2f7' }}>Nenhuma objeção ou perda encontrada no período.</strong>
            <div style={{ fontSize: 12, marginTop: 7 }}>
              Ajuste o período, o consultor ou a etapa selecionada.
            </div>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
            {viewType !== 'losses' && (
              <RankingCard
                title="Objeções mais recorrentes"
                detail="Textos registrados nas ações e checkpoints do funil."
                accent="#fb923c"
                items={objections.map((item) => ({
                  text: item.text,
                  total: item.total,
                  byStage: item.byStage,
                }))}
                itemLabel="objection"
              />
            )}

            {viewType !== 'objections' && (
              <RankingCard
                title="Motivos de perda"
                detail="Motivos informados quando o ciclo é encerrado como perdido."
                accent="#ef4444"
                items={losses.map((item) => ({
                  text: item.reason,
                  total: item.total,
                  byStage: item.byStage,
                }))}
                itemLabel="loss"
              />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
