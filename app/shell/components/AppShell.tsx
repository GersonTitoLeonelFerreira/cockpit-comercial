'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlobalSearch from './GlobalSearch.client'
import AuthButton from './AuthButton.client'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  sidebarBg: '#111318',
  headerBg: '#13151a',
  contentBg: '#0e1015',
  border: '#1e2130',
  borderSubtle: '#181c28',
  textPrimary: '#f1f5f9',
  textSecondary: '#8892a4',
  textMuted: '#4a5568',
  activeItemBg: 'rgba(59,130,246,0.10)',
  activeItemBorder: '#3b82f6',
  activeItemText: '#93c5fd',
  hoverItemBg: '#1a1f2e',
  collapseBtn: '#1a1f2e',
  collapseBtnBorder: '#262d40',
  iconColor: '#6b7a99',
  iconActiveColor: '#93c5fd',
  quickLinkBg: '#1a1f2e',
  quickLinkBorder: '#262d40',
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
  return (
    <Link
      href={href}
      title={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 0' : '9px 12px',
        borderRadius: 8,
        textDecoration: 'none',
        background: active ? C.activeItemBg : 'transparent',
        color: active ? C.activeItemText : C.textSecondary,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        transition: 'background 140ms ease, color 140ms ease',
        borderLeft: active ? `2px solid ${C.activeItemBorder}` : '2px solid transparent',
        justifyContent: collapsed ? 'center' : 'flex-start',
        letterSpacing: '0.01em',
        position: 'relative',
      }}
    >
      <span
        style={{
          color: active ? C.iconActiveColor : C.iconColor,
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
        paddingLeft: collapsed ? 0 : 14,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {!collapsed ? (
        <>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: C.textMuted,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: C.borderSubtle,
            }}
          />
        </>
      ) : (
        <div
          style={{
            width: '100%',
            height: 1,
            background: C.borderSubtle,
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
          width: collapsed ? 68 : 248,
          minWidth: collapsed ? 68 : 248,
          transition: 'width 180ms cubic-bezier(.4,0,.2,1), min-width 180ms cubic-bezier(.4,0,.2,1)',
          borderRight: `1px solid ${C.border}`,
          background: C.sidebarBg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Brand header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '18px 0' : '18px 16px 18px 20px',
            borderBottom: `1px solid ${C.borderSubtle}`,
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="14"
                  height="14"
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
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.textPrimary,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Cockpit Comercial
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.textMuted,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Plataforma Comercial
                </div>
              </div>
            </div>
          )}

          {collapsed && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg
                width="14"
                height="14"
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
                borderRadius: 6,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'color 140ms ease',
              }}
              title="Recolher menu"
            >
              <NavIcon name="chevron-left" size={14} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: collapsed ? '12px 8px' : '12px 10px',
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

        {/* Collapse toggle (expanded → collapsed only via brand area, collapsed → expand here) */}
        {collapsed && (
          <div
            style={{
              borderTop: `1px solid ${C.borderSubtle}`,
              padding: '10px 8px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setCollapsed(false)}
              style={{
                border: `1px solid ${C.collapseBtnBorder}`,
                background: C.collapseBtn,
                color: C.textMuted,
                borderRadius: 6,
                width: '100%',
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'color 140ms ease',
              }}
              title="Expandir menu"
            >
              <NavIcon name="chevron-right" size={14} />
            </button>
          </div>
        )}
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
            height: 60,
            borderBottom: `1px solid ${C.border}`,
            background: C.headerBg,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Page title */}
          <div style={{ flexShrink: 0, minWidth: 200 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.textPrimary,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
              }}
            >
              {topTitle}
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.textMuted,
                letterSpacing: '0.01em',
                lineHeight: 1.3,
                marginTop: 1,
              }}
            >
              {topSubtitle}
            </div>
          </div>

          {/* Separator */}
          <div
            style={{
              width: 1,
              height: 28,
              background: C.border,
              flexShrink: 0,
            }}
          />

          {/* Global search (centered) */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <GlobalSearch />
          </div>

          {/* Right actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
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
                  transition: 'color 140ms ease, border-color 140ms ease',
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
            padding: '28px 32px',
            background: C.contentBg,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
} 