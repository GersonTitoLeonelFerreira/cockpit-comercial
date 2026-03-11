'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlobalSearch from './GlobalSearch.client'
import AuthButton from './AuthButton.client'

function NavBtn({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '10px 12px',
        borderRadius: 10,
        textDecoration: 'none',
        border: '1px solid #2a2a2a',
        background: active ? '#151515' : 'transparent',
        color: 'white',
        fontSize: 13,
        opacity: active ? 1 : 0.85,
      }}
    >
      {label}
    </Link>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname?.startsWith(href)
  }

  const topTitle =
    pathname?.startsWith('/leads')
      ? 'Pipeline Comercial'
      : pathname?.startsWith('/relatorios')
      ? 'Relatórios'
      : pathname?.startsWith('/platform')
      ? 'Configurações'
      : pathname?.startsWith('/dashboard/simulador-meta')
      ? 'Simulador de Meta'
      : 'Dashboard'

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        background: '#0b0b0b',
        color: 'white',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? 72 : 260,
          transition: 'width 160ms ease',
          borderRight: '1px solid #222',
          background: '#0f0f0f',
          padding: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 10,
            padding: '10px 8px',
          }}
        >
          {!collapsed ? (
            <div style={{ fontWeight: 800 }}>Cockpit Comercial</div>
          ) : (
            <div style={{ fontWeight: 800 }}>CC</div>
          )}

          <button
            onClick={() => setCollapsed((v) => !v)}
            style={{
              border: '1px solid #2a2a2a',
              background: '#111',
              color: 'white',
              borderRadius: 10,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            {collapsed ? '>' : '<'}
          </button>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <NavBtn
            href="/dashboard"
            label="Dashboard"
            active={isActive('/dashboard')}
          />
          <NavBtn
            href="/leads"
            label="Pipeline (Kanban)"
            active={isActive('/leads')}
          />
          <NavBtn
            href="/relatorios"
            label="Relatórios"
            active={isActive('/relatorios')}
          />
          <NavBtn
            href="/dashboard/simulador-meta"
            label="Simulador de Meta"
            active={isActive('/dashboard/simulador-meta')}
          />
          <NavBtn
            href="/platform"
            label="Configurações"
            active={isActive('/platform')}
          />
        </div>
      </aside>

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Topbar FIXA */}
        <header
          style={{
            flexShrink: 0,
            borderBottom: '1px solid #222',
            background: '#0f0f0f',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div style={{ minWidth: 220 }}>
            <div style={{ fontWeight: 800 }}>{topTitle}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Navegação governada por menu lateral (estilo SaaS).
            </div>
          </div>

          {/* Meio: pesquisar */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <GlobalSearch />
          </div>

          {/* Direita: ações */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 220,
              justifyContent: 'flex-end',
            }}
          >
            {!pathname?.startsWith('/leads') ? (
              <Link
                href="/leads"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #2a2a2a',
                  background: '#111',
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                Ir para Pipeline
              </Link>
            ) : null}

            <AuthButton />
          </div>
        </header>

        {/* CONTEÚDO ROLÁVEL */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 18,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}