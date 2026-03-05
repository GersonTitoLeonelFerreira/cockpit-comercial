'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type SellerOption = {
  id: string
  label: string
}

function buildHref(pathname: string, params: URLSearchParams) {
  const q = params.toString()
  return q ? `${pathname}?${q}` : pathname
}

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

  function setDateParam(key: 'from' | 'to', value: string) {
    const params = new URLSearchParams(sp?.toString())

    if (!value) params.delete(key)
    else params.set(key, value)

    router.push(buildHref(pathname, params))
    router.refresh()
  }

  // mantém input coerente quando troca owner pela URL
  React.useEffect(() => {
    if (!ownerFilter) {
      setQuery('')
      return
    }
    const current = sellers.find((s) => s.id === ownerFilter)
    if (current) setQuery(current.label)
  }, [ownerFilter, sellers])

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

  function navigate(nextParams: URLSearchParams) {
    router.push(buildHref(pathname, nextParams))
    router.refresh() // ✅ força re-render do Server Component com novos searchParams
  }

  function setDays(nextDays: 7 | 30 | 90) {
    const params = new URLSearchParams(sp?.toString())
    params.set('days', String(nextDays))
    navigate(params)
  }

  function clearOwner() {
    const params = new URLSearchParams(sp?.toString())
    params.delete('owner')
    navigate(params)
    setOpen(false)
  }

  function selectOwner(ownerId: string) {
    const params = new URLSearchParams(sp?.toString())
    params.set('owner', ownerId)
    navigate(params)
    setOpen(false)
  }

  const normalizedQuery = query.trim().toLowerCase()
  const suggestions =
    normalizedQuery.length === 0
      ? sellers.slice(0, 8)
      : sellers
          .filter((s) => s.label.toLowerCase().includes(normalizedQuery))
          .slice(0, 10)

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ color: 'yellow', fontSize: 12 }}>DEBUG: filtros v2</div>
      {/* Período: seleção */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900 }}>Período:</div>
        <button type="button" style={days === 7 ? chipActive : chip} onClick={() => setDays(7)}>
          7 dias
        </button>
        <button type="button" style={days === 30 ? chipActive : chip} onClick={() => setDays(30)}>
          30 dias
        </button>
        <button type="button" style={days === 90 ? chipActive : chip} onClick={() => setDays(90)}>
          90 dias
        </button>

        <div style={{ opacity: 0.55, padding: '0 4px' }}>ou</div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>De</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setDateParam('from', e.target.value)}
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
            onChange={(e) => setDateParam('to', e.target.value)}
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

        {(from || to) ? (
          <button
            type="button"
            onClick={() => {
              setDateParam('from', '')
              setDateParam('to', '')
            }}
            style={chip}
            title="Limpar período customizado"
          >
            Limpar datas
          </button>
        ) : null}
      </div>

      {/* Vendedor: pesquisa */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900 }}>Vendedor:</div>

        <button
          type="button"
          style={!ownerFilter ? chipActive : chip}
          onClick={clearOwner}
          title="Remover filtro de vendedor"
        >
          Todos
        </button>

        <div style={{ position: 'relative', width: '100%', maxWidth: 420, flex: '1 1 260px' }}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // pequeno delay para permitir click na sugestão
              window.setTimeout(() => setOpen(false), 120)
            }}
            placeholder="Buscar vendedor..."
            style={{
              width: '100%',
              fontSize: 13,
              padding: '9px 10px',
              borderRadius: 12,
              border: '1px solid #2a2a2a',
              background: '#0f0f0f',
              color: 'white',
              outline: 'none',
            }}
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
                <div style={{ padding: 10, fontSize: 13, opacity: 0.75 }}>
                  Nenhum vendedor encontrado.
                </div>
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
    </div>
  )
}