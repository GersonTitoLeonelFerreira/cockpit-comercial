'use client'

import * as React from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '../lib/supabaseBrowser'

type RpcStats = {
  start_date: string
  end_date: string

  leads_disponiveis: number

  contatados: number
  respondeu: number
  negociacao: number
  fechado: number
  perdido: number

  taxa_resposta: number
  taxa_negociacao: number
  taxa_fechamento: number
  taxa_final_real: number

  ticket_medio_real_periodo: number | null
  ticket_medio_real_90d: number | null
  ticket_medio_real_all_time: number | null
}

type TicketSource = 'configured' | 'real_period' | 'real_90d' | 'real_all_time'
type ViewMode = 'general' | 'seller'
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
type SellerView = 'team' | 'me'

type Seller = { id: string; label: string }

type SellerOverride = {
  meta_brl?: number
  taxa_pct?: number
  ticket_medio?: number
}

type GoalsDefaults = {
  meta_brl: number
  ticket_medio: number
  taxa_pct: number
}

function toISODateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODateInput(v: string) {
  const [y, m, d] = v.split('-').map((x) => Number(x))
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
}

function parsePtNumber(v: string) {
  return parseFloat((v || '').replace(',', '.'))
}

function moneyBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return `${Math.round(v * 100)}%`
}

function countWorkingDaysInclusive(start: Date, end: Date, workingDays: Set<Weekday>) {
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  if (e < s) return 0

  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay() as Weekday
    if (workingDays.has(dow)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function weekdayLabelPt(d: Weekday) {
  switch (d) {
    case 0:
      return 'Dom'
    case 1:
      return 'Seg'
    case 2:
      return 'Ter'
    case 3:
      return 'Qua'
    case 4:
      return 'Qui'
    case 5:
      return 'Sex'
    case 6:
      return 'Sáb'
  }
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function clampNum(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function coerceNum(v: any, fallback: number) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parsePtNumber(v) : NaN
  return Number.isFinite(n) ? n : fallback
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
  right,
}: {
  title: string
  description?: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <section style={{ border: '1px solid #202020', background: '#0c0c0c', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{title}</div>
          {description ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{description}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  )
}

function normalizeSellerOverrides(v: unknown): Record<string, SellerOverride> {
  if (!v || typeof v !== 'object') return {}
  const inObj = v as Record<string, any>
  const out: Record<string, SellerOverride> = {}

  for (const [k, raw] of Object.entries(inObj)) {
    if (!raw || typeof raw !== 'object') continue

    const meta_brl = raw.meta_brl
    const taxa_pct = raw.taxa_pct
    const ticket_medio = raw.ticket_medio

    const o: SellerOverride = {}
    if (typeof meta_brl === 'number' && Number.isFinite(meta_brl)) o.meta_brl = meta_brl
    if (typeof taxa_pct === 'number' && Number.isFinite(taxa_pct)) o.taxa_pct = taxa_pct
    if (typeof ticket_medio === 'number' && Number.isFinite(ticket_medio)) o.ticket_medio = ticket_medio

    if (Object.keys(o).length > 0) out[k] = o
  }

  return out
}

function normalizeDefaults(v: unknown): GoalsDefaults | null {
  if (!v || typeof v !== 'object') return null
  const obj = v as Record<string, any>
  const meta_brl = coerceNum(obj.meta_brl, NaN)
  const ticket_medio = coerceNum(obj.ticket_medio, NaN)
  const taxa_pct = coerceNum(obj.taxa_pct, NaN)
  if (!Number.isFinite(meta_brl) || !Number.isFinite(ticket_medio) || !Number.isFinite(taxa_pct)) return null
  return {
    meta_brl: meta_brl,
    ticket_medio: ticket_medio,
    taxa_pct: taxa_pct,
  }
}

export default function SimularMetaPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [metaBRL, setMetaBRL] = React.useState<number>(500000)
  const [ticketConfigurado, setTicketConfigurado] = React.useState<number>(2000)
  const [ticketSource, setTicketSource] = React.useState<TicketSource>('configured')
  const [taxaPct, setTaxaPct] = React.useState<number>(20)

  const [companyDefaults, setCompanyDefaults] = React.useState<GoalsDefaults | null>(null)

  const [role, setRole] = React.useState<string>('member')
  const [companyId, setCompanyId] = React.useState<string>('')
  const [userId, setUserId] = React.useState<string>('')
  const isAdmin = role === 'admin'

  // vendedor: toggle Equipe/Eu
  const [sellerView, setSellerView] = React.useState<SellerView>('team')

  const [viewMode, setViewMode] = React.useState<ViewMode>('general')
  const [sellers, setSellers] = React.useState<Seller[]>([])
  const [selectedSellerId, setSelectedSellerId] = React.useState<string>('')

  const [membersCount, setMembersCount] = React.useState<number>(1)

  const [savedOverrides, setSavedOverrides] = React.useState<Record<string, SellerOverride>>({})
  const [draftOverrides, setDraftOverrides] = React.useState<Record<string, SellerOverride>>({})
  const [saving, setSaving] = React.useState(false)

  const [workingDays, setWorkingDays] = React.useState<Record<Weekday, boolean>>({
    0: false,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: false,
  })

  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const [stats, setStats] = React.useState<RpcStats | null>(null)
  const [debug, setDebug] = React.useState<any>(null)
  const [showDebug, setShowDebug] = React.useState(false)

  const ranRef = React.useRef(false)

  const now = React.useMemo(() => new Date(), [])
  const defaultStart = React.useMemo(() => {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])
  const defaultEnd = React.useMemo(() => {
    const d = new Date(defaultStart)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    d.setHours(0, 0, 0, 0)
    return d
  }, [defaultStart])

  const [startDate, setStartDate] = React.useState<string>(toISODateInput(defaultStart))
  const [endDate, setEndDate] = React.useState<string>(toISODateInput(defaultEnd))

  const hasDirtyOverrides = React.useMemo(
    () => JSON.stringify(savedOverrides) !== JSON.stringify(draftOverrides),
    [savedOverrides, draftOverrides]
  )

  const workingDaysSet = React.useMemo(() => {
    const s = new Set<Weekday>()
    ;(Object.keys(workingDays) as any).forEach((k: any) => {
      const wd = Number(k) as Weekday
      if (workingDays[wd]) s.add(wd)
    })
    return s
  }, [workingDays])

  const start = React.useMemo(() => parseISODateInput(startDate), [startDate])
  const end = React.useMemo(() => parseISODateInput(endDate), [endDate])

  const diasTrabalhadosNoPeriodo = React.useMemo(
    () => countWorkingDaysInclusive(start, end, workingDaysSet),
    [start, end, workingDaysSet]
  )

  const diasTrabalhadosRestantes = React.useMemo(() => {
    const today = startOfDay(new Date())
    const from = maxDate(start, today)
    return countWorkingDaysInclusive(from, end, workingDaysSet)
  }, [start, end, workingDaysSet])

  const selectedOverride: SellerOverride | null = React.useMemo(() => {
    if (!selectedSellerId) return null
    return draftOverrides[selectedSellerId] ?? null
  }, [draftOverrides, selectedSellerId])

  const sellersCount = React.useMemo(
    () => Math.max(1, membersCount || sellers.length || 1),
    [membersCount, sellers.length]
  )

  const suggestedMyMeta = React.useMemo(() => (metaBRL > 0 ? metaBRL / sellersCount : 0), [metaBRL, sellersCount])

  // meta efetiva para cálculo (Resultado)
  const metaCalcBRL = React.useMemo(() => {
    if (!isAdmin) return sellerView === 'me' ? suggestedMyMeta : metaBRL
    if (viewMode === 'general') return metaBRL
    if (selectedOverride?.meta_brl != null) return selectedOverride.meta_brl
    return suggestedMyMeta
  }, [isAdmin, metaBRL, selectedOverride, sellerView, suggestedMyMeta, viewMode])

  const canEditOfficialMeta = isAdmin
  const showSave = isAdmin
  const canSave = isAdmin

  const effectiveTaxaPct = React.useMemo(() => taxaPct, [taxaPct])
  const taxa = React.useMemo(() => Math.min(1, Math.max(0.0001, (effectiveTaxaPct || 0) / 100)), [effectiveTaxaPct])

  const selectedTicket = React.useMemo(() => {
    if (!stats) return ticketConfigurado

    const realPeriod = stats.ticket_medio_real_periodo ?? 0
    const real90d = stats.ticket_medio_real_90d ?? 0
    const realAll = stats.ticket_medio_real_all_time ?? 0

    switch (ticketSource) {
      case 'real_period':
        return realPeriod > 0 ? realPeriod : ticketConfigurado
      case 'real_90d':
        return real90d > 0 ? real90d : ticketConfigurado
      case 'real_all_time':
        return realAll > 0 ? realAll : ticketConfigurado
      case 'configured':
      default:
        return ticketConfigurado
    }
  }, [stats, ticketConfigurado, ticketSource])

  const fechamentosNecessarios = React.useMemo(
    () => (selectedTicket > 0 ? Math.ceil(metaCalcBRL / selectedTicket) : null),
    [metaCalcBRL, selectedTicket]
  )

  const contatosNecessarios = React.useMemo(
    () => (fechamentosNecessarios == null ? null : Math.ceil(fechamentosNecessarios / taxa)),
    [fechamentosNecessarios, taxa]
  )

  // regra: contatos = soma por status (não acumulativo)
  const contatosRealizadosNoPeriodo = React.useMemo(() => {
    if (!stats) return 0

    const worked = (stats as any)?.trabalhados_no_periodo
    if (typeof worked === 'number' && Number.isFinite(worked)) return worked

    // fallback (se v2 não estiver populando ainda)
    const contatados = stats.contatados ?? 0
    const respondeu = stats.respondeu ?? 0
    const negociacao = stats.negociacao ?? 0
    const fechado = stats.fechado ?? 0
    const perdido = stats.perdido ?? 0
    return contatados + respondeu + negociacao + fechado + perdido
  }, [stats])

  const contatosFaltantes = React.useMemo(() => {
    if (!stats || contatosNecessarios == null) return null
    return Math.max(0, contatosNecessarios - contatosRealizadosNoPeriodo)
  }, [contatosNecessarios, contatosRealizadosNoPeriodo, stats])

  const contatosPorDia = React.useMemo(() => {
    if (contatosNecessarios == null) return null
    if (diasTrabalhadosNoPeriodo <= 0) return null
    return Math.ceil(contatosNecessarios / diasTrabalhadosNoPeriodo)
  }, [contatosNecessarios, diasTrabalhadosNoPeriodo])

  const contatosPorDiaRestante = React.useMemo(() => {
    if (contatosFaltantes == null) return null
    if (diasTrabalhadosRestantes <= 0) return null
    return Math.ceil(contatosFaltantes / diasTrabalhadosRestantes)
  }, [contatosFaltantes, diasTrabalhadosRestantes])

  const taxaFinalTone = React.useMemo(() => {
    if (!stats) return 'neutral' as const
    const alvo = (effectiveTaxaPct || 0) / 100
    const real = stats.taxa_final_real ?? 0
    return real >= alvo ? 'good' : 'bad'
  }, [effectiveTaxaPct, stats])

  function setSelectedOverride(next: SellerOverride) {
    if (!selectedSellerId) return
    setDraftOverrides((prev) => ({ ...(prev ?? {}), [selectedSellerId]: next }))
  }

  function clearSelectedOverrideField(field: keyof SellerOverride) {
    if (!selectedSellerId) return
    setDraftOverrides((prev) => {
      const cur = { ...(prev ?? {}) }
      const base = { ...(cur[selectedSellerId] ?? {}) }
      delete (base as any)[field]
      if (Object.keys(base).length === 0) delete cur[selectedSellerId]
      else cur[selectedSellerId] = base
      return cur
    })
  }

  async function loadCompanyContext() {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) throw sessionErr
    if (!sessionData.session) throw new Error('Você está deslogado. Faça login novamente.')

    const uid = sessionData.session.user.id

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('id', uid)
      .maybeSingle()

    if (profileErr) throw profileErr
    if (!profile?.company_id) throw new Error('Não achei company_id em profiles.')

    const COMPANY_ID = String(profile.company_id)
    const ROLE = String(profile.role ?? 'member')

    setUserId(uid)
    setCompanyId(COMPANY_ID)
    setRole(ROLE)

    const { data: companies, error: companyErr } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', COMPANY_ID)
      .limit(1)

    if (companyErr) throw companyErr

    const settings = (companies?.[0]?.settings ?? {}) as any

    const defaults = normalizeDefaults(settings?.goals?.defaults)
    setCompanyDefaults(defaults)

    if (defaults) {
      setMetaBRL(defaults.meta_brl)
      setTicketConfigurado(defaults.ticket_medio)
      setTaxaPct(defaults.taxa_pct)
    }

    const overrides = normalizeSellerOverrides(settings?.goals?.seller_overrides)
    setSavedOverrides(overrides)
    setDraftOverrides(overrides)

    // ✅ membersCount via RPC SECURITY DEFINER (contorna RLS do vendedor)
    const { data: mc, error: mcErr } = await supabase.rpc('get_company_members_count', {
      p_company_id: COMPANY_ID,
    })
    if (mcErr) throw mcErr
    const n = Array.isArray(mc) ? mc[0]?.members_count : null
    setMembersCount(Math.max(1, Number(n || 1)))

    if (ROLE === 'admin') {
      const { data: sellersData, error: sellersErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', COMPANY_ID)
        .eq('role', 'member')
        .order('created_at', { ascending: true })

      if (sellersErr) throw sellersErr

      const list: Seller[] = (sellersData ?? []).map((s: any) => ({
        id: String(s.id),
        label: String(s.full_name || s.email || s.id),
      }))

      setSellers(list)
      setSelectedSellerId((prev) => prev || list[0]?.id || '')
      setViewMode('general')
    } else {
      setViewMode('seller')
      setSelectedSellerId(uid)
      setSellerView('team')
    }

    return { COMPANY_ID, ROLE, uid }
  }

  async function run() {
    setLoading(true)
    setErr(null)

    try {
      const ctx =
        companyId && userId
          ? { COMPANY_ID: companyId, uid: userId, ROLE: role }
          : await loadCompanyContext()

      const COMPANY_ID = ctx.COMPANY_ID
      const uid = ctx.uid
      const ROLE = ctx.ROLE

      const s = parseISODateInput(startDate)
      const e = parseISODateInput(endDate)
      if (e < s) throw new Error('Data final precisa ser >= data inicial.')

      const ownerIdForRpc = (() => {
        if (ROLE !== 'admin') return sellerView === 'me' ? uid : null
        if (viewMode === 'general') return null
        if (!selectedSellerId) throw new Error('Selecione um vendedor.')
        return selectedSellerId
      })()

      const { data: r, error: rpcErr } = await supabase.rpc('get_goal_simulation_stats_v2', {
        p_company_id: COMPANY_ID,
        p_start_date: startDate,
        p_end_date: endDate,
        p_owner_id: ownerIdForRpc,
      })
      if (rpcErr) throw rpcErr

      setDebug({
        owner: ownerIdForRpc,
        membersCount,
        sellersCount,
        metaBRL,
        suggestedMyMeta,
        metaCalcBRL,
        result: r,
      })
      setStats((r?.[0] as RpcStats) ?? null)
    } catch (e2: any) {
      setErr(e2?.message ?? 'Erro ao calcular.')
      setStats(null)
      setDebug(null)
    } finally {
      setLoading(false)
    }
  }

  async function saveMeta() {
    if (!canSave) return
    setSaving(true)
    setErr(null)

    try {
      const nextDefaults: GoalsDefaults = {
        meta_brl: Math.max(0, metaBRL || 0),
        ticket_medio: Math.max(0, ticketConfigurado || 0),
        taxa_pct: clampNum(taxaPct || 0, 0.0001, 100),
      }

      if (nextDefaults.meta_brl <= 0) throw new Error('Informe uma meta válida (> 0).')
      if (nextDefaults.ticket_medio <= 0) throw new Error('Informe um ticket médio válido (> 0).')
      if (nextDefaults.taxa_pct <= 0 || nextDefaults.taxa_pct > 100) throw new Error('Informe uma taxa válida (1..100).')

      const nextOverrides = (() => {
        if (viewMode !== 'seller') return {}
        if (!selectedSellerId) throw new Error('Selecione um vendedor.')
        const cur = { ...(draftOverrides ?? {}) }
        if (!cur[selectedSellerId] || typeof cur[selectedSellerId] !== 'object') {
          cur[selectedSellerId] = { meta_brl: suggestedMyMeta }
        } else if (cur[selectedSellerId].meta_brl == null) {
          cur[selectedSellerId] = { ...cur[selectedSellerId], meta_brl: suggestedMyMeta }
        }
        return cur
      })()

      const r = await fetch('/api/settings/update-goals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal_scope: viewMode === 'general' ? 'group' : 'seller',
          defaults: nextDefaults,
          seller_overrides: viewMode === 'seller' ? nextOverrides : {},
        }),
      })

      const text = await r.text()
      let j: any = null
      try {
        j = text ? JSON.parse(text) : null
      } catch {}

      if (!r.ok) {
        if (r.status === 404) throw new Error('Endpoint /api/settings/update-goals não encontrado (404).')
        if (r.status === 405) {
          throw new Error(
            'Endpoint existe, mas não aceita POST (405). Confira export POST no route.ts e reinicie o dev server.'
          )
        }
        throw new Error(j?.error || `Falha ao salvar (HTTP ${r.status}).`)
      }

      setCompanyDefaults(nextDefaults)
      if (viewMode === 'seller') {
        setSavedOverrides(nextOverrides)
        setDraftOverrides(nextOverrides)
      } else {
        setSavedOverrides(savedOverrides)
        setDraftOverrides(savedOverrides)
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  function resetToCompanyDefaults() {
    if (!companyDefaults) return
    setMetaBRL(companyDefaults.meta_brl)
    setTicketConfigurado(companyDefaults.ticket_medio)
    setTaxaPct(companyDefaults.taxa_pct)
  }

  function resetOverridesToSaved() {
    setDraftOverrides(savedOverrides)
  }

  React.useEffect(() => {
    if (!ranRef.current) return
    if (!isAdmin) return
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedSellerId])

  React.useEffect(() => {
    if (!ranRef.current) return
    if (isAdmin) return
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerView])

  React.useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    void (async () => {
      try {
        await loadCompanyContext()
        await run()
      } catch (e: any) {
        setErr(e?.message ?? 'Falha ao carregar.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chip: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
    fontSize: 12,
    cursor: 'pointer',
  }

  const metaInputDisabled = !canEditOfficialMeta
  const metaInputTitle = !canEditOfficialMeta ? 'A meta oficial é definida pelo admin.' : 'Defina a meta oficial do período.'
  const canEditTicketConfigurado = ticketSource === 'configured'

  const dirtyDefaults = React.useMemo(() => {
    if (!companyDefaults) return true
    return (
      (companyDefaults.meta_brl ?? 0) !== (metaBRL ?? 0) ||
      (companyDefaults.ticket_medio ?? 0) !== (ticketConfigurado ?? 0) ||
      (companyDefaults.taxa_pct ?? 0) !== (taxaPct ?? 0)
    )
  }, [companyDefaults, metaBRL, ticketConfigurado, taxaPct])

  const dirtyToSave = React.useMemo(() => {
    if (!isAdmin) return false
    if (viewMode === 'general') return dirtyDefaults
    return dirtyDefaults || hasDirtyOverrides
  }, [dirtyDefaults, hasDirtyOverrides, isAdmin, viewMode])

  const showSellerOverridePanel = isAdmin && viewMode === 'seller'

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Simular meta</h1>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Meta (R$) → fechamentos = meta ÷ ticket → contatos = fechamentos ÷ taxa de conversão (%)
          </div>

          {isAdmin ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setViewMode('general')}
                style={{
                  ...chip,
                  background: viewMode === 'general' ? '#151515' : '#111',
                  borderColor: viewMode === 'general' ? '#3a3a3a' : '#2a2a2a',
                  fontWeight: 900,
                }}
              >
                Geral
              </button>
              <button
                type="button"
                onClick={() => setViewMode('seller')}
                style={{
                  ...chip,
                  background: viewMode === 'seller' ? '#151515' : '#111',
                  borderColor: viewMode === 'seller' ? '#3a3a3a' : '#2a2a2a',
                  fontWeight: 900,
                }}
              >
                Vendedor
              </button>

              <select
                value={selectedSellerId}
                onChange={(e) => setSelectedSellerId(e.target.value)}
                disabled={viewMode !== 'seller'}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#111',
                  color: 'white',
                  minWidth: 260,
                  opacity: viewMode === 'seller' ? 1 : 0.6,
                }}
                title={viewMode === 'seller' ? 'Selecione o vendedor' : 'Mude para "Vendedor" para habilitar'}
              >
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <Link
                href={
                  viewMode === 'seller' && selectedSellerId
                    ? `/leads?owner=${encodeURIComponent(selectedSellerId)}`
                    : '/leads?owner=ALL'
                }
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  cursor: 'pointer',
                  minWidth: 120,
                  textAlign: 'center',
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
                  borderRadius: 12,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  cursor: 'pointer',
                  minWidth: 120,
                  textAlign: 'center',
                  textDecoration: 'none',
                  fontWeight: 900,
                }}
              >
                Pipeline →
              </Link>

              <button
                type="button"
                onClick={() => setSellerView('team')}
                style={{
                  ...chip,
                  background: sellerView === 'team' ? '#151515' : '#111',
                  borderColor: sellerView === 'team' ? '#3a3a3a' : '#2a2a2a',
                  fontWeight: 900,
                }}
              >
                Equipe (geral)
              </button>
              <button
                type="button"
                onClick={() => setSellerView('me')}
                style={{
                  ...chip,
                  background: sellerView === 'me' ? '#151515' : '#111',
                  borderColor: sellerView === 'me' ? '#3a3a3a' : '#2a2a2a',
                  fontWeight: 900,
                }}
              >
                Eu (minha parte)
              </button>

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {sellerView === 'team'
                  ? 'Você está vendo a meta geral e o progresso do time.'
                  : `Minha parte (sugestão): ${moneyBRL(suggestedMyMeta)} • Vendedores: ${sellersCount}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #3a2222',
            background: '#160b0b',
            color: '#ffb3b3',
            fontSize: 13,
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <Section
          title="Configuração"
          description={
            isAdmin
              ? 'Defina período, meta oficial, ticket padrão e taxa padrão. Depois clique em Calcular.'
              : 'Defina período, ticket e taxa para planejar ações do dia. Depois clique em Calcular.'
          }
          right={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {showSave ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      resetToCompanyDefaults()
                      resetOverridesToSaved()
                    }}
                    disabled={!dirtyToSave || saving}
                    style={{ ...chip, opacity: !dirtyToSave ? 0.6 : 1 }}
                    title="Descarta alterações pendentes (volta para o último salvo)."
                  >
                    Restaurar
                  </button>

                  <button
                    type="button"
                    onClick={saveMeta}
                    disabled={!dirtyToSave || saving}
                    style={{
                      ...chip,
                      background: dirtyToSave ? '#1b3a1f' : '#111',
                      borderColor: dirtyToSave ? '#2f6f3a' : '#2a2a2a',
                      opacity: saving ? 0.7 : 1,
                      fontWeight: 900,
                    }}
                    title={
                      viewMode === 'general'
                        ? 'Salva a meta geral e parâmetros padrão da empresa.'
                        : 'Salva a meta individual do vendedor + parâmetros padrão.'
                    }
                  >
                    {saving ? 'Salvando…' : 'Salvar meta'}
                  </button>
                </>
              ) : null}

              <button
                onClick={run}
                disabled={loading}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #2a2a2a',
                  background: '#151515',
                  color: 'white',
                  cursor: 'pointer',
                  minWidth: 120,
                }}
              >
                {loading ? 'Calculando...' : 'Calcular'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ border: '1px solid #1f1f1f', borderRadius: 14, padding: 12, background: '#0f0f0f' }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Período</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: 160,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    color: 'white',
                  }}
                />
                <span style={{ opacity: 0.7 }}>até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: 160,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    color: 'white',
                  }}
                />
                <button
                  onClick={() => {
                    setStartDate(toISODateInput(defaultStart))
                    setEndDate(toISODateInput(defaultEnd))
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #2a2a2a',
                    background: '#101010',
                    color: 'white',
                    cursor: 'pointer',
                    opacity: 0.95,
                  }}
                >
                  Mês atual
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid #1f1f1f', borderRadius: 14, padding: 12, background: '#0f0f0f' }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Parâmetros</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Meta do período (R$)</div>
                  <input
                    type="number"
                    value={metaBRL}
                    onChange={(e) => setMetaBRL(parseFloat(e.target.value || '0'))}
                    disabled={metaInputDisabled}
                    title={metaInputTitle}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: metaInputDisabled ? '#0b0b0b' : '#111',
                      color: 'white',
                      opacity: metaInputDisabled ? 0.75 : 1,
                    }}
                  />

                  {!isAdmin && companyDefaults ? (
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
                      Meta oficial da empresa: <b>{moneyBRL(companyDefaults.meta_brl)}</b>
                      {sellerView === 'me' ? (
                        <>
                          <br />
                          Minha parte (sugestão): <b>{moneyBRL(suggestedMyMeta)}</b>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Taxa de conversão (ganho/contato)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(taxaPct)}
                      onChange={(e) => {
                        const v = parsePtNumber(e.target.value || '0')
                        if (!Number.isFinite(v)) return
                        setTaxaPct(v)
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                      }}
                    />
                    <div style={{ opacity: 0.75 }}>%</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Ticket médio (fonte)</div>
                  <select
                    value={ticketSource}
                    onChange={(e) => setTicketSource(e.target.value as TicketSource)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: '#111',
                      color: 'white',
                    }}
                  >
                    <option value="configured">Configurado</option>
                    <option value="real_period">Real (período)</option>
                    <option value="real_90d">Real (90 dias)</option>
                    <option value="real_all_time">Real (all time)</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Ticket médio (valor)</div>

                  <input
                    type="number"
                    value={ticketConfigurado}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value || '0')
                      if (!Number.isFinite(v)) return
                      setTicketConfigurado(v)
                    }}
                    disabled={!canEditTicketConfigurado}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #2a2a2a',
                      background: canEditTicketConfigurado ? '#111' : '#0b0b0b',
                      color: 'white',
                      opacity: canEditTicketConfigurado ? 1 : 0.6,
                    }}
                  />
                </div>
              </div>

              {stats ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                  Ticket real (período): {moneyBRL(stats.ticket_medio_real_periodo ?? 0)} | 90d: {moneyBRL(stats.ticket_medio_real_90d ?? 0)} | all:{' '}
                  {moneyBRL(stats.ticket_medio_real_all_time ?? 0)}
                </div>
              ) : null}

              {showSellerOverridePanel ? (
                <div style={{ marginTop: 10, borderTop: '1px solid #1f1f1f', paddingTop: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Meta do vendedor (override)</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      value={metaCalcBRL}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value || '0')
                        if (!Number.isFinite(v)) return
                        const cur = { ...(selectedOverride ?? {}) }
                        cur.meta_brl = v
                        setSelectedOverride(cur)
                      }}
                      style={{
                        width: 240,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #2a2a2a',
                        background: '#111',
                        color: 'white',
                      }}
                    />

                    <button type="button" onClick={() => clearSelectedOverrideField('meta_brl')} style={chip}>
                      Sugerida ({moneyBRL(suggestedMyMeta)})
                    </button>

                    {hasDirtyOverrides ? (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Alterações pendentes • clique em <b>Salvar meta</b>.
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Sem alterações pendentes.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              border: '1px solid #1f1f1f',
              borderRadius: 14,
              padding: 12,
              background: '#0f0f0f',
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Dias trabalhados</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => (
                <label
                  key={d}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid #2a2a2a',
                    background: '#111',
                    padding: '8px 10px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontSize: 12,
                    opacity: 0.95,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!workingDays[d]}
                    onChange={(e) =>
                      setWorkingDays((prev) => ({
                        ...prev,
                        [d]: e.target.checked,
                      }))
                    }
                  />
                  {weekdayLabelPt(d)}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
              <div>
                Dias trabalhados no período: <b>{diasTrabalhadosNoPeriodo}</b>
              </div>
              <div>
                Dias trabalhados restantes (a partir de hoje): <b>{diasTrabalhadosRestantes}</b>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Resultado"
          description={
            !isAdmin
              ? sellerView === 'team'
                ? 'Visão da equipe (meta geral).'
                : 'Sua parte sugerida da meta geral + seu funil no período.'
              : viewMode === 'seller'
                ? 'Visão do vendedor selecionado (meta individual). Ticket/taxa são os padrões da empresa.'
                : 'Resumo do que você precisa fazer para bater a meta.'
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Card
              title={
                !isAdmin && sellerView === 'team'
                  ? 'Fechamentos necessários (equipe)'
                  : !isAdmin && sellerView === 'me'
                    ? 'Fechamentos necessários (minha parte)'
                    : 'Fechamentos necessários'
              }
              value={fechamentosNecessarios ?? '—'}
              subtitle={
                selectedTicket > 0 ? (
                  <>
                    Meta {moneyBRL(metaCalcBRL)} ÷ ticket {moneyBRL(selectedTicket)}
                  </>
                ) : undefined
              }
            />
            <Card
              title={
                !isAdmin && sellerView === 'team'
                  ? 'Contatos necessários (equipe)'
                  : !isAdmin && sellerView === 'me'
                    ? 'Contatos necessários (minha parte)'
                    : 'Contatos necessários'
              }
              value={contatosNecessarios ?? '—'}
              subtitle={
                fechamentosNecessarios != null ? (
                  <>
                    {fechamentosNecessarios} ÷ {round2((taxa || 0) * 100)}% (taxa alvo)
                  </>
                ) : undefined
              }
            />
            <Card
              title={!isAdmin && sellerView === 'me' ? 'Faltam contatos (minha parte)' : 'Faltam contatos'}
              value={contatosFaltantes ?? '—'}
              subtitle={stats ? <>Já trabalhados no período: {contatosRealizadosNoPeriodo}</> : undefined}
            />
            <Card
              title={!isAdmin && sellerView === 'me' ? 'Contatos por dia (minha parte)' : 'Contatos por dia (a partir de hoje)'}
              value={contatosPorDiaRestante ?? '—'}
              subtitle={
                diasTrabalhadosRestantes > 0 ? (
                  <>
                    {contatosFaltantes ?? '—'} ÷ {diasTrabalhadosRestantes} dias restantes
                    {contatosPorDia != null ? (
                      <>
                        <br />
                        Média no período: {contatosPorDia}/dia
                      </>
                    ) : null}
                  </>
                ) : (
                  <>Sem dias trabalhados restantes no período</>
                )
              }
            />
          </div>
        </Section>

        <Section
          title="Detalhes do período"
          description="Dados reais do funil no período selecionado (para referência)."
          right={
            <button
              onClick={() => setShowDebug((v) => !v)}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#101010',
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              {showDebug ? 'Ocultar debug' : 'Mostrar debug'}
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            <Card title="Contato" value={stats?.contatados ?? '—'} />
            <Card title="Respondeu" value={stats?.respondeu ?? '—'} />
            <Card title="Negociação" value={stats?.negociacao ?? '—'} />
            <Card title="Ganho" value={(stats as any)?.ganho ?? stats?.fechado ?? '—'} />
            <Card title="Perdido" value={stats?.perdido ?? '—'} />
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <Card title="Taxa resposta" value={stats ? pct(stats.taxa_resposta) : '—'} />
            <Card title="Taxa negociação" value={stats ? pct(stats.taxa_negociacao) : '—'} />
            <Card title="Taxa fechamento" value={stats ? pct(stats.taxa_fechamento) : '—'} />
            <Card
              title="Taxa de conversão (ganho/contato)"
              value={stats ? pct(stats.taxa_final_real) : '—'}
              tone={taxaFinalTone}
              subtitle={
                stats ? (
                  <>
                    Alvo: {round2((taxa || 0) * 100)}% • Real: {round2((stats.taxa_final_real ?? 0) * 100)}%
                  </>
                ) : undefined
              }
            />
          </div>

          {showDebug ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Debug</div>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  background: '#0f0f0f',
                  padding: 12,
                  fontSize: 12,
                  opacity: 0.95,
                }}
              >
                {JSON.stringify(debug, null, 2)}
              </pre>
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  )
}