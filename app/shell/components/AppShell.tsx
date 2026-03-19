'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlobalSearch from './GlobalSearch.client'
import AuthButton from './AuthButton.client'

type IconName =
  | 'dashboard'
  | 'target'
  | 'kanban'
  | 'reports'
  | 'users'
  | 'money'
  | 'settings'

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  } as const

  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <path
            d="M4 13.5V6.8c0-1.1.9-2 2-2h3.7c1.1 0 2 .9 2 2v6.7c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2Zm10.3 5.7H18c1.1 0 2-.9 2-2v-3.7c0-1.1-.9-2-2-2h-3.7c-1.1 0-2 .9-2 2v3.7c0 1.1.9 2 2 2ZM12.3 8.5V6.8c0-1.1.9-2 2-2H18c1.1 0 2 .9 2 2v1.7c0 1.1-.9 2-2 2h-3.7c-1.1 0-2-.9-2-2ZM4 17.2v-1.7c0-1.1.9-2 2-2h3.7c1.1 0 2 .9 2 2v1.7c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'target':
      return (
        <svg {...common}>
          <path
            d="M12 22a10 10 0 1 1 7.07-2.93A9.96 9.96 0 0 1 12 22Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 18a6 6 0 1 1 4.24-1.76A5.98 5.98 0 0 1 12 18Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 14a2 2 0 1 1 1.41-.59A2 2 0 0 1 12 14Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      )

    case 'kanban':
      return (
        <svg {...common}>
          <path
            d="M6.5 20h-1A2.5 2.5 0 0 1 3 17.5v-11A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11A2.5 2.5 0 0 1 18.5 20h-1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M7 8.2c0-.7.6-1.2 1.2-1.2h1.6c.7 0 1.2.6 1.2 1.2v7.6c0 .7-.6 1.2-1.2 1.2H8.2c-.7 0-1.2-.6-1.2-1.2V8.2Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M13 8.2c0-.7.6-1.2 1.2-1.2h1.6c.7 0 1.2.6 1.2 1.2v4.6c0 .7-.6 1.2-1.2 1.2h-1.6c-.7 0-1.2-.6-1.2-1.2V8.2Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      )

    case 'reports':
      return (
        <svg {...common}>
          <path
            d="M7 21h10a2 2 0 0 0 2-2V8.5L14.5 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M14 4v4a1 1 0 0 0 1 1h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 13h8M8 16.5h6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'users':
      return (
        <svg {...common}>
          <path
            d="M16 21v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 19.8V21"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M20 21v-1.1a3.4 3.4 0 0 0-2.4-3.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M16.6 4.7a4 4 0 0 1 0 7.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'money':
      return (
        <svg {...common}>
          <path
            d="M4.5 7.5h15A2.5 2.5 0 0 1 22 10v4A2.5 2.5 0 0 1 19.5 16.5h-15A2.5 2.5 0 0 1 2 14v-4A2.5 2.5 0 0 1 4.5 7.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M12 14a2 2 0 1 0-2-2 2 2 0 0 0 2 2Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M6 10.5h.01M18 13.5h.01"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'settings':
      return (
        <svg {...common}>
          <path
            d="M12 15.5a3.5 3.5 0 1 0-3.5-3.5 3.5 3.5 0 0 0 3.5 3.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M19.4 15a1.9 1.9 0 0 0 .4 2.1l.1.1a2.3 2.3 0 0 1-1.6 3.9h-.2a2.2 2.2 0 0 1-1.5-.6l-.1-.1a1.9 1.9 0 0 0-2.1-.4 1.9 1.9 0 0 0-1.1 1.8V21a2.3 2.3 0 0 1-4.6 0v-.2a1.9 1.9 0 0 0-1.1-1.8 1.9 1.9 0 0 0-2.1.4l-.1.1a2.2 2.2 0 0 1-1.5.6h-.2a2.3 2.3 0 0 1-1.6-3.9l.1-.1a1.9 1.9 0 0 0 .4-2.1 1.9 1.9 0 0 0-1.8-1.1H3a2.3 2.3 0 0 1 0-4.6h.2a1.9 1.9 0 0 0 1.8-1.1 1.9 1.9 0 0 0-.4-2.1l-.1-.1A2.3 2.3 0 0 1 6.4 1h.2a2.2 2.2 0 0 1 1.5.6l.1.1a1.9 1.9 0 0 0 2.1.4 1.9 1.9 0 0 0 1.1-1.8V3a2.3 2.3 0 0 1 4.6 0v.2a1.9 1.9 0 0 0 1.1 1.8 1.9 1.9 0 0 0 2.1-.4l.1-.1A2.2 2.2 0 0 1 20.8 6l-.1.1a1.9 1.9 0 0 0-.4 2.1 1.9 1.9 0 0 0 1.8 1.1H21a2.3 2.3 0 0 1 0 4.6h-.2a1.9 1.9 0 0 0-1.4.7Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

function NavBtn({
  href,
  label,
  active,
  collapsed,
  icon,
}: {
  href: string
  label: string
  active: boolean
  collapsed: boolean
  icon: IconName
}) {
  const content = collapsed ? (
    <div
      style={{
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <NavIcon name={icon} />
    </div>
  ) : (
    label
  )

  return (
    <Link
      href={href}
      title={label}
      style={{
        display: 'block',
        padding: collapsed ? '8px 8px' : '10px 12px',
        borderRadius: 10,
        textDecoration: 'none',
        border: '1px solid #2a2a2a',
        background: active ? '#151515' : 'transparent',
        color: 'white',
        fontSize: 13,
        opacity: active ? 1 : 0.85,
      }}
    >
      {content}
    </Link>
  )
}

function NavGroup({
  label,
  collapsed,
}: {
  label: string
  collapsed: boolean
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 900,
        opacity: 0.6,
        paddingLeft: collapsed ? 0 : 10,
        marginTop: 12,
        marginBottom: 6,
        textAlign: collapsed ? 'center' : 'left',
      }}
    >
      {collapsed ? '─' : label}
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  const isActive = (href: string) => {
    if (!pathname) return false
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/admin/vendedores') {
      return pathname === '/admin/vendedores' || pathname.startsWith('/admin/vendedores/')
    }
    return pathname.startsWith(href)
  }

  const topTitle =
    pathname?.startsWith('/admin')
      ? 'Admin'
      : pathname?.startsWith('/leads')
        ? 'Pipeline Comercial'
        : pathname?.startsWith('/relatorios')
          ? 'Relatórios'
          : pathname?.startsWith('/dashboard/simulador-meta')
            ? 'Simulador de Meta'
            : pathname?.startsWith('/platform')
              ? 'Configurações'
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
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? '>' : '<'}
          </button>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <NavBtn
            href="/dashboard"
            label="Dashboard"
            icon="dashboard"
            collapsed={collapsed}
            active={isActive('/dashboard')}
          />

          <NavBtn
            href="/dashboard/simulador-meta"
            label="Simulador de Meta"
            icon="target"
            collapsed={collapsed}
            active={isActive('/dashboard/simulador-meta')}
          />

          <NavBtn
            href="/leads"
            label="Pipeline (Kanban)"
            icon="kanban"
            collapsed={collapsed}
            active={isActive('/leads')}
          />

          <NavBtn
            href="/relatorios"
            label="Relatórios"
            icon="reports"
            collapsed={collapsed}
            active={isActive('/relatorios')}
          />

          <NavGroup label="Admin" collapsed={collapsed} />

          <NavBtn
            href="/admin/vendedores"
            label="Gestão de Vendedores"
            icon="users"
            collapsed={collapsed}
            active={isActive('/admin/vendedores')}
          />

          <NavBtn
            href="/admin/faturamento"
            label="Gestão de Faturamento"
            icon="money"
            collapsed={collapsed}
            active={isActive('/admin/faturamento')}
          />

          <NavBtn
            href="/platform"
            label="Configurações"
            icon="settings"
            collapsed={collapsed}
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

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <GlobalSearch />
          </div>

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

        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>{children}</div>
      </main>
    </div>
  )
} 