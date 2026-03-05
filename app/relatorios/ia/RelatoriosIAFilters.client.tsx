'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type SellerOption = { id: string; label: string }

function buildHref(pathname: string, params: URLSearchParams) {
  const q = params.toString()
  return q ? `${pathname}?${q}` : pathname
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizePeriod(input: { from?: string; to?: string }) {
  let f = (input.from ?? '').trim()
  let t = (input.to ?? '').trim()

  f = isYmd(f) ? f : ''
  t = isYmd(t) ? t : ''

  if (f && !t) t = todayYmd()
  if (!f && t) f = t

  if (f && t && f > t) {
    const tmp = f
    f = t
    t = tmp
  }

  return { from: f, to: t }
}

type SentimentFilter = '' | 'positivo' | 'neutro' | 'negativo'

export default function RelatoriosIAFilters({
  days,
  ownerFilter,
  sellers,
}: {
  days: 7 | 30 | 90
  ownerFilter: string
  sellers: SellerOption[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const from = sp?.get('from') ?? ''
  const to = sp?.get('to') ?? ''

  const minScore = sp?.get('minScore') ?? '' // string no input
  const sentiment = (sp?.get('sentiment') ?? '') as SentimentFilter
  const lead = sp?.get('lead') ?? ''
  const [leadDraft, setLeadDraft] = React.useState(lead)

  const [minScoreDraft, setMinScoreDraft] = React.useState(minScore)

  React.useEffect(() => {
    setMinScoreDraft(minScore)
  }, [minScore])

  // mantém o draft sincronizado quando a URL muda (ex.: back/forward, limpar filtros)
  React.useEffect(() => {
    setLeadDraft(lead)
  }, [lead])

  const chip: React.CSSProperties = {
    display: 'inline-block',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: '#cbd5e1',
    textDecoration: 'none',
    cursor: 'pointer',
    userSelect: 'none',
  }

  const chipActive: React.CSSProperties = {
    ...chip,
    border: '1px solid #444',
    background: '#0b1220',
    color: 'white',
  }

  const section: React.CSSProperties = {
    display: 'grid',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    background: '#0b0b0b',
  }

  const sectionTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 14,
    marginBottom: 4,
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.8,
    fontWeight: 800,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: 13,
    padding: '9px 10px',
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    background: '#0f0f0f',
    color: 'white',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const navigate = React.useCallback(
    (params: URLSearchParams) => {
      router.push(buildHref(pathname, params))
      router.refresh()
    },
    [router, pathname]
  )

  function setDays(nextDays: 7 | 30 | 90) {
    const params = new URLSearchParams(sp?.toString())
    params.set('days', String(nextDays))
    params.delete('from')
    params.delete('to')
    // quando muda período, reseta paginação
    params.delete('limit')
    navigate(params)
  }

  function setPeriod(next: { from?: string; to?: string }) {
    const normalized = normalizePeriod(next)
    const params = new URLSearchParams(sp?.toString())

    if (normalized.from) params.set('from', normalized.from)
    else params.delete('from')

    if (normalized.to) params.set('to', normalized.to)
    else params.delete('to')

    // ao mudar período, reseta paginação
    params.delete('limit')

    navigate(params)
  }

  function setFrom(value: string) {
    setPeriod({ from: value, to })
  }

  function setTo(value: string) {
    setPeriod({ from, to: value })
  }

  function clearDates() {
    const params = new URLSearchParams(sp?.toString())
    params.delete('from')
    params.delete('to')
    params.delete('limit')
    navigate(params)
  }

  function clearOwner() {
    const params = new URLSearchParams(sp?.toString())
    params.delete('owner')
    params.delete('limit')
    navigate(params)
    setOpen(false)
  }

  function selectOwner(ownerId: string) {
    const params = new URLSearchParams(sp?.toString())
    params.set('owner', ownerId)
    params.delete('limit')
    navigate(params)
    setOpen(false)
  }

  const setMinScore = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams(sp?.toString())

      const trimmed = next.trim()
      if (!trimmed) params.delete('minScore')
      else {
        // validação simples no client
        const n = Math.max(0, Math.min(100, Math.floor(Number(trimmed))))
        if (Number.isFinite(n)) params.set('minScore', String(n))
        else params.delete('minScore')
      }

      params.delete('limit')
      navigate(params)
    },
    [sp, navigate]
  )

  function setSentiment(next: SentimentFilter) {
    const params = new URLSearchParams(sp?.toString())
    if (!next) params.delete('sentiment')
    else params.set('sentiment', next)
    params.delete('limit')
    navigate(params)
  }

  const setLead = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams(sp?.toString())
      const trimmed = next.trim()
      if (!trimmed) params.delete('lead')
      else params.set('lead', trimmed)
      params.delete('limit')
      navigate(params)
    },
    [sp, navigate]
  )

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      // só aplica se realmente mudou
      if (leadDraft !== lead) setLead(leadDraft)
    }, 500)

    return () => window.clearTimeout(handle)
  }, [leadDraft, lead, setLead])

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      if (minScoreDraft !== minScore) setMinScore(minScoreDraft)
    }, 500)

    return () => window.clearTimeout(handle)
  }, [minScoreDraft, minScore, setMinScore])

  function clearExtraFilters() {
    const params = new URLSearchParams(sp?.toString())
    params.delete('minScore')
    params.delete('sentiment')
    params.delete('lead')
    params.delete('limit')
    navigate(params)
  }

  React.useEffect(() => {
    if (!ownerFilter) {
      setQuery('')
      return
    }
    const current = sellers.find((s) => s.id === ownerFilter)
    if (current) setQuery(current.label)
  }, [ownerFilter, sellers])

  const normalizedQuery = query.trim().toLowerCase()
  const suggestions =
    normalizedQuery.length === 0
      ? sellers.slice(0, 8)
      : sellers.filter((s) => s.label.toLowerCase().includes(normalizedQuery)).slice(0, 10)

  const hasExtraFilters = Boolean((minScore && minScore !== '0') || sentiment || lead)

  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      {/* PERÍODO */}
      <div style={section}>
        <div style={sectionTitle}>Período</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={days === 7 ? chipActive : chip} onClick={() => setDays(7)}>
            7 dias
          </button>
          <button type="button" style={days === 30 ? chipActive : chip} onClick={() => setDays(30)}>
            30 dias
          </button>
          <button type="button" style={days === 90 ? chipActive : chip} onClick={() => setDays(90)}>
            90 dias
          </button>
        </div>

        <div style={{ height: 12 }} />

        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: 10,
            borderRadius: 12,
            border: '1px solid #222',
            background: '#0f0f0f',
            maxWidth: '100%',
          }}
        >
          <div style={fieldLabel}>Customizado</div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>De</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                fontSize: 13,
                padding: '7px 10px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#0f0f0f',
                color: 'white',
              }}
            />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Até</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                fontSize: 13,
                padding: '7px 10px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#0f0f0f',
                color: 'white',
              }}
            />
          </label>

          {from || to ? (
            <button type="button" onClick={clearDates} style={chip} title="Limpar período customizado">
              Limpar datas
            </button>
          ) : null}
        </div>
      </div>

      {/* DIVISÓRIA */}
      <div
        style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, #2a2a2a, transparent)',
          margin: '2px 0',
        }}
      />

      {/* VENDEDOR */}
      <div style={section}>
        <div style={sectionTitle}>Vendedor</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={!ownerFilter ? chipActive : chip} onClick={clearOwner}>
            Todos
          </button>

          {ownerFilter ? (
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              Selecionado: <b style={{ opacity: 1 }}>{query || ownerFilter}</b>
            </span>
          ) : (
            <span style={{ fontSize: 12, opacity: 0.65 }}>Selecione um vendedor para filtrar.</span>
          )}
        </div>

        <div style={{ height: 10 }} />

        <div style={{ position: 'relative', width: '100%', maxWidth: 520 }}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="Buscar vendedor..."
            style={inputStyle}
          />

          {open ? (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                border: '1px solid #2a2a2a',
                background: '#0b0b0b',
                borderRadius: 12,
                overflow: 'hidden',
                zIndex: 50,
                boxShadow: '0 10px 30px rgba(0,0,0,.45)',
              }}
            >
              {suggestions.length === 0 ? (
                <div style={{ padding: 10, fontSize: 13, opacity: 0.75 }}>Nenhum vendedor encontrado.</div>
              ) : (
                suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectOwner(s.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 10px',
                      border: 0,
                      background: s.id === ownerFilter ? '#111827' : 'transparent',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                    title={s.id}
                  >
                    {s.label}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* FILTROS EXTRAS */}
      <div style={section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={sectionTitle}>Filtros</div>

          {hasExtraFilters ? (
            <button type="button" style={chip} onClick={clearExtraFilters} title="Limpar score mínimo, sentimento e lead">
              Limpar filtros
            </button>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>Score mínimo (0–100)</span>
            <input
              inputMode="numeric"
              value={minScoreDraft}
              onChange={(e) => setMinScoreDraft(e.target.value)}
              placeholder="Ex.: 70"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>Sentimento</span>
            <select
              value={sentiment}
              onChange={(e) => setSentiment((e.target.value ?? '') as SentimentFilter)}
              style={inputStyle}
            >
              <option value="">Todos</option>
              <option value="positivo">Positivo</option>
              <option value="neutro">Neutro</option>
              <option value="negativo">Negativo</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabel}>Lead (nome ou ID)</span>
            <input
              value={leadDraft}
              onChange={(e) => setLeadDraft(e.target.value)}
              placeholder="Ex.: Maria / CPF / Telefone / 3fa85f64-..."
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ fontSize: 12, opacity: 0.65 }}>
          Dica: ao alterar filtros, a lista volta para os primeiros 50 resultados.
        </div>
      </div>
    </div>
  )
}