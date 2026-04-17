'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type SearchCycle = { id: string; name: string; phone: string | null }
type SearchResult =
  | { type: 'page'; label: string; href: string }
  | { type: 'cycle'; label: string; href: string; meta?: string }

const PAGES: SearchResult[] = [
  { type: 'page', label: 'Dashboard', href: '/dashboard' },
  { type: 'page', label: 'Cockpit Comercial', href: '/leads' },
  { type: 'page', label: 'Pool', href: '/pool' },
  { type: 'page', label: 'Relatórios', href: '/relatorios' },
  { type: 'page', label: 'Configurações', href: '/platform' },
]

function pageMatches(query: string) {
  const qLower = query.toLowerCase()
  return PAGES.filter((p) => p.type === 'page' && p.label.toLowerCase().includes(qLower))
}

export default function GlobalSearch() {
  const pathname = usePathname()

  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [results, setResults] = React.useState<SearchResult[]>([])

  const abortRef = React.useRef<AbortController | null>(null)
  const lastQueryRef = React.useRef<string>('')
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  async function doSearch(query: string) {
    const trimmed = query.trim()
    lastQueryRef.current = trimmed

    if (!trimmed) {
      abortRef.current?.abort()
      abortRef.current = null
      setLoading(false)
      setResults([])
      return
    }

    const pages = pageMatches(trimmed)
    setResults(pages.slice(0, 12))

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
      const json = (await res.json()) as { leads?: SearchCycle[] }

      if (lastQueryRef.current !== trimmed) return

      const cycleMatches: SearchResult[] = (json.leads ?? []).map((l) => ({
        type: 'cycle',
        label: l.name,
        href: `/sales-cycles/${l.id}`,
        meta: l.phone ?? undefined,
      }))

      setResults([...pages, ...cycleMatches].slice(0, 12))
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setResults(pageMatches(trimmed).slice(0, 12))
    } finally {
      if (lastQueryRef.current === trimmed) setLoading(false)
    }
  }

  React.useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => void doSearch(q), 350)
    return () => window.clearTimeout(handle)
  }, [q, open])

  React.useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    lastQueryRef.current = ''
    setQ('')
    setOpen(false)
    setLoading(false)
    setResults([])
  }, [pathname])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 'min(320px, 45vw)' }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void doSearch(q)
          if (e.key === 'Escape') {
            setOpen(false)
            setQ('')
            setResults([])
          }
        }}
        placeholder="Pesquisar…"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            border: '1px solid #2a2a2a',
            background: '#0b0b0b',
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 2000,
            boxShadow: '0 20px 50px rgba(0,0,0,.55)',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid #1f1f1f', fontSize: 12, opacity: 0.75 }}>
            {q.trim() ? (loading ? 'Buscando…' : `${results.length} resultado(s)`) : 'Digite para pesquisar'}
          </div>

          {q.trim() && results.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, opacity: 0.75 }}>Nenhum resultado.</div>
          ) : (
            results.map((r, idx) => (
              <Link
                key={`${r.type}-${idx}-${r.href}`}
                href={r.href}
                onClick={() => {
                  setQ('')
                  setOpen(false)
                  setLoading(false)
                  setResults([])
                }}
                style={{
                  display: 'block',
                  padding: '10px 12px',
                  textDecoration: 'none',
                  color: 'white',
                  borderTop: idx === 0 ? 'none' : '1px solid #121212',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>{r.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>
                    {r.type === 'page' ? 'Página' : 'Ciclo'}
                  </div>
                </div>
                {'meta' in r && r.meta ? (
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{r.meta}</div>
                ) : null}
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}