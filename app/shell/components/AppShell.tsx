'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlobalSearch from './GlobalSearch.client'
import AuthButton from './AuthButton.client'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  sidebarBg: '#0d0f14',
  headerBg: '#111318',
  contentBg: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  navGroupLabel: '#4a5569',
  activeItemBg: 'linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.06) 100%)',
  activeItemBorder: '#3b82f6',
  activeItemText: '#93c5fd',
  hoverItemBg: 'rgba(18,22,40,0.9)',
  collapseBtn: '#13151f',
  collapseBtnBorder: '#1e2236',
  iconColor: '#4a5d75',
  iconActiveColor: '#60a5fa',
  quickLinkBg: '#161924',
  quickLinkBorder: '#1e2438',
  brandSeparator: '#15172a',
  adminSeparator: '#171a2c',
} as const

// ─── Icon set ──────────────────────────────────────────────────────────────────
type IconName =
  | 'dashboard'
  | 'target'
  | 'kanban'
  | 'reports'
  | 'users'
  | 'money'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'pipeline'

function NavIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    style: { flexShrink: 0 } as React.CSSProperties,
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

    case 'chevron-left':
      return (
        <svg {...common}>
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'chevron-right':
      return (
        <svg {...common}>
          <path
            d="M9 18l6-6-6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'pipeline':
      return (
        <svg {...common}>
          <path
            d="M5 12h14M12 5l7 7-7 7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )

    default:
      return null
  }
}

// ─── NavBtn ────────────────────────────────────────────────────────────────────
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
  const [hovered, setHovered] = React.useState(false)

  return (
    <Link
      href={href}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 0' : active ? '9px 12px 9px 11px' : '9px 12px',
        borderRadius: 7,
        textDecoration: 'none',
        background: active ? C.activeItemBg : hovered ? C.hoverItemBg : 'transparent',
        color: active ? C.activeItemText : hovered ? C.textPrimary : C.textSecondary,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        transition: 'background 200ms ease, color 200ms ease',
        borderLeft: active ? `3px solid ${C.activeItemBorder}` : '3px solid transparent',
        justifyContent: collapsed ? 'center' : 'flex-start',
        letterSpacing: '0.01em',
        position: 'relative',
      }}
    >
      <span
        style={{
          color: active ? C.iconActiveColor : hovered ? C.textPrimary : C.iconColor,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <NavIcon name={icon} size={16} />
      </span>
      {!collapsed && (
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
    </Link>
  )
}

// ─── NavGroup ─────────────────────────────────────────────────────────────────
function NavGroup({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <div
      style={{
        marginTop: 20,
        marginBottom: 4,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {!collapsed ? (
        <div
          style={{
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.025)',
            borderRadius: 6,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.navGroupLabel,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            height: 1,
            background: C.adminSeparator,
            opacity: 0.5,
          }}
        />
      )}
    </div>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
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

  const topSubtitle =
    pathname?.startsWith('/admin')
      ? 'Gestão e administração do sistema'
      : pathname?.startsWith('/leads')
        ? 'Visualize e gerencie o funil de vendas'
        : pathname?.startsWith('/relatorios')
          ? 'Análise e inteligência comercial'
          : pathname?.startsWith('/dashboard/simulador-meta')
            ? 'Projeção e planejamento de metas'
            : pathname?.startsWith('/platform')
              ? 'Configurações da plataforma'
              : 'Visão geral da operação comercial'

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        background: C.contentBg,
        color: C.textPrimary,
        overflow: 'hidden',
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: collapsed ? 64 : 252,
          minWidth: collapsed ? 64 : 252,
          transition: 'width 220ms cubic-bezier(.4,0,.2,1), min-width 220ms cubic-bezier(.4,0,.2,1)',
          boxShadow: '2px 0 16px rgba(0,0,0,0.4)',
          background: C.sidebarBg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {/* Brand header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '18px 0' : '18px 14px 18px 16px',
            background: 'linear-gradient(180deg, rgba(37,99,235,0.07) 0%, transparent 100%)',
            boxShadow: `0 1px 0 ${C.brandSeparator}`,
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                onClick={() => setCollapsed(true)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'linear-gradient(140deg, #1e40af 0%, #1d4ed8 60%, #2563eb 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 3px 10px rgba(37,99,235,0.38)',
                  cursor: 'pointer',
                }}
                title="Recolher menu"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 22V12h6v10"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: C.textPrimary,
                    letterSpacing: '-0.025em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                  }}
                >
                  Cockpit Comercial
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: '#6a7d96',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                  }}
                >
                  Plataforma Comercial
                </div>
              </div>
            </div>
          )}

          {collapsed && (
            <div
              onClick={() => setCollapsed(false)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: 'linear-gradient(140deg, #1e40af 0%, #1d4ed8 60%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 3px 10px rgba(37,99,235,0.38)',
                cursor: 'pointer',
              }}
              title="Expandir menu"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 22V12h6v10"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}

          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              style={{
                border: `1px solid ${C.collapseBtnBorder}`,
                background: C.collapseBtn,
                color: C.textMuted,
                borderRadius: 7,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'color   200ms ease, background 200ms ease',
              }}
              title="Recolher menu"
            >
              <NavIcon name="chevron-left" size={13} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: collapsed ? '14px 8px' : '14px 10px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
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
        </nav>
        
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Header / Topbar */}
        <header
          style={{
            flexShrink: 0,
            height: 62,
            boxShadow: `0 1px 0 ${C.border}, 0 2px 12px rgba(0,0,0,0.28)`,
            background: C.headerBg,
            padding: '0 20px 0 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 5,
          }}
        >
          {/* Page title */}
          <div
            style={{
              flexShrink: 0,
              paddingLeft: 12,
              borderLeft: `2px solid ${C.activeItemBorder}`,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.textPrimary,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              {topTitle}
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.textSecondary,
                letterSpacing: '0.01em',
                lineHeight: 1.3,
                marginTop: 2,
                whiteSpace: 'nowrap',
                opacity: 0.75,
              }}
            >
              {topSubtitle}
            </div>
          </div>

          {/* Global search */}
          <div style={{ flex: '1 1 0', maxWidth: 160, minWidth: 100 }}>
            <GlobalSearch />
          </div>

          {/* Right actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              marginLeft: 'auto',
            }}
          >
            {!pathname?.startsWith('/leads') && (
              <Link
                href="/leads"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 7,
                  border: `1px solid ${C.quickLinkBorder}`,
                  background: C.quickLinkBg,
                  color: C.textSecondary,
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'color 200ms ease, border-color 200ms ease, background 200ms ease',
                  letterSpacing: '0.01em',
                }}
              >
                <NavIcon name="pipeline" size={13} />
                Pipeline
              </Link>
            )}
            <AuthButton />
          </div>
        </header>

        {/* Content area */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '32px 36px',
            background: C.contentBg,
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}