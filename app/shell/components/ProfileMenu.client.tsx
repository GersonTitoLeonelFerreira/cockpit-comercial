'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

type MeResponse =
  | { ok: true; full_name: string | null; email: string | null; role: string | null }
  | { error: string }

export default function ProfileMenu() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [label, setLabel] = React.useState<string>('Perfil')
  const [isAuthed, setIsAuthed] = React.useState<boolean | null>(null)

  async function refreshLabelFromProfile(sessionEmail?: string) {
    try {
      const res = await fetch('/api/me', { method: 'GET' })
      const json = (await res.json()) as MeResponse
      if (res.ok && 'ok' in json && json.ok) {
        const name = (json.full_name ?? '').trim()
        const email = (json.email ?? sessionEmail ?? '').trim()
        setLabel(name || email || 'Perfil')
        return
      }
    } catch {
      // ignore
    }
    setLabel(sessionEmail || 'Perfil')
  }

  React.useEffect(() => {
    let alive = true

    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!alive) return
      setIsAuthed(!!data.user)
      const email = data.user?.email ?? ''
      setLabel(email || 'Perfil')
      await refreshLabelFromProfile(email)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      setIsAuthed(!!session)
      const email = session?.user?.email ?? ''
      await refreshLabelFromProfile(email)
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [supabase])

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  async function logout() {
    if (loading) return
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } finally {
      setLoading(false)
      setOpen(false)
      router.replace('/login')
      router.refresh()
    }
  }

  if (isAuthed === null) {
    return (
      <button
        type="button"
        disabled
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          opacity: 0.7,
        }}
      >
        …
      </button>
    )
  }

  if (!isAuthed) {
    return (
      <Link
        href="/login"
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          textDecoration: 'none',
          fontSize: 13,
        }}
      >
        Entrar
      </Link>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid #2a2a2a',
          background: '#111',
          color: 'white',
          cursor: 'pointer',
          fontSize: 13,
          maxWidth: 260,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        {label}
      </button>

      {open ? (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 280,
            border: '1px solid #2a2a2a',
            background: '#0f0f0f',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,.55)',
            zIndex: 9999,
          }}
        >
          <div style={{ padding: 12, borderBottom: '1px solid #1f1f1f' }}>
            <div style={{ fontWeight: 900 }}>Perfil</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{label}</div>
          </div>

          <div style={{ padding: 8, display: 'grid', gap: 6 }}>
            <Link
              href="/perfil"
              onClick={() => setOpen(false)}
              style={{
                padding: '10px 10px',
                borderRadius: 10,
                textDecoration: 'none',
                color: 'white',
                border: '1px solid #1f1f1f',
                background: '#0b0b0b',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Editar Perfil →
            </Link>

            <button
              type="button"
              onClick={logout}
              disabled={loading}
              style={{
                padding: '10px 10px',
                borderRadius: 10,
                color: '#fecaca',
                border: '1px solid #7f1d1d',
                background: '#1a0b0b',
                fontSize: 13,
                fontWeight: 900,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Saindo…' : 'Sair do sistema'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
