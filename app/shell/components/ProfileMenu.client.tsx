'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

type MeResponse =
  | { ok: true; full_name: string | null; email: string | null; role: string | null }
  | { error: string }

const TEXT_MUTED = '#3d4b62'
const TEXT_SECONDARY = '#7d8ea8'
const TEXT_PRIMARY = '#edf2f7'
const TEXT_LABEL = '#b8c4d8'

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

  // Initials avatar derived from name/email
  const initials = React.useMemo(() => {
    const src = label || ''
    if (src.includes('@')) {
      const username = src.split('@')[0]
      const alpha = username.replace(/[^a-zA-Z]/g, '')
      return (alpha.slice(0, 2) || username.slice(0, 2) || '??').toUpperCase()
    }
    const parts = src.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    const alpha = src.replace(/[^a-zA-Z]/g, '')
    return (alpha.slice(0, 2) || src.slice(0, 2) || '??').toUpperCase()
  }, [label])

  if (isAuthed === null) {
    return (
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: '#161829',
          border: '1px solid #212840',
          opacity: 0.5,
        }}
      />
    )
  }

  if (!isAuthed) {
    return (
      <Link
        href="/login"
        style={{
          padding: '7px 14px',
          borderRadius: 7,
          border: '1px solid #212840',
          background: '#161829',
          color: TEXT_SECONDARY,
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.01em',
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
        title={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px 5px 5px',
          borderRadius: 8,
          border: `1px solid ${open ? '#2a3350' : '#212840'}`,
          background: open ? '#1c2238' : '#161829',
          color: TEXT_SECONDARY,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          maxWidth: 200,
          transition: 'background 200ms ease, border-color 200ms ease',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: 'linear-gradient(140deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#bfdbfe',
            flexShrink: 0,
            letterSpacing: '0.02em',
            boxShadow: '0 1px 4px rgba(37,99,235,0.25)',
          }}
        >
          {initials}
        </div>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: TEXT_LABEL,
            fontSize: 12,
          }}
        >
          {label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 140ms ease',
          }}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 264,
            border: '1px solid #1c2034',
            background: '#12141c',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 20px 56px rgba(0,0,0,.72), 0 4px 16px rgba(0,0,0,.4)',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              padding: '14px 14px',
              borderBottom: '1px solid #181b2c',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#13161f',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'linear-gradient(140deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#bfdbfe',
                flexShrink: 0,
                letterSpacing: '0.02em',
                boxShadow: '0 2px 8px rgba(37,99,235,0.30)',
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: TEXT_PRIMARY,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 1 }}>Usuário do sistema</div>
            </div>
          </div>

          <div style={{ padding: '8px', display: 'grid', gap: 3 }}>
            <Link
              href="/perfil"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 10px',
                borderRadius: 7,
                textDecoration: 'none',
                color: TEXT_SECONDARY,
                border: '1px solid transparent',
                background: 'transparent',
                fontSize: 12,
                fontWeight: 500,
                transition: 'background 200ms ease, color 200ms ease',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              Editar Perfil
            </Link>

            <button
              type="button"
              onClick={logout}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 10px',
                borderRadius: 7,
                color: '#f87171',
                border: '1px solid transparent',
                background: 'transparent',
                fontSize: 12,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                textAlign: 'left',
                transition: 'background 200ms ease',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <polyline
                  points="16 17 21 12 16 7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="21"
                  y1="12"
                  x2="9"
                  y2="12"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {loading ? 'Saindo…' : 'Sair do sistema'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
