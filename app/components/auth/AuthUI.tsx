'use client'

import Link from 'next/link'
import * as React from 'react'

type AuthLinkItem = { label: string; href: string }

type AuthStat = {
  value: string
  label: string
}

type AuthFeature = {
  title: string
  description: string
}

type AuthScaffoldProps = {
  pageBadge?: string
  title: string
  subtitle: string
  children: React.ReactNode
  footerLinks?: AuthLinkItem[]
  asideTitle?: string
  heroTitle?: string
  asideSubtitle?: string
  sideBadge?: string
  stats?: AuthStat[]
  features?: AuthFeature[]
}

const AUTH = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#111318',
  surfaceBg: '#141722',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  radius: 16,
  radiusInner: 12,
} as const

const DEFAULT_STATS: AuthStat[] = [
  { value: 'Pipeline vivo', label: 'execução orientada' },
  { value: 'Leitura rápida', label: 'decisão no detalhe' },
  { value: 'Padronização', label: 'ritmo comercial' },
]

const DEFAULT_FEATURES: AuthFeature[] = [
  {
    title: 'Kanban operacional de verdade',
    description: 'Etapas claras, leitura rápida, prioridades visíveis e ação imediata sem ruído visual.',
  },
  {
    title: 'Gestão com profundidade',
    description: 'SLA, agenda, ganhos, perdas e acompanhamento da execução comercial no mesmo fluxo.',
  },
  {
    title: 'Experiência alinhada ao Cockpit',
    description: 'Acesso, recuperação e contato comercial seguindo o mesmo design system escuro e executivo.',
  },
]

export function AuthScaffold({
  pageBadge,
  title,
  subtitle,
  children,
  footerLinks,
  asideTitle = 'Cockpit Comercial',
  heroTitle = 'Acesso, suporte e contato comercial no mesmo padrão visual do produto.',
  asideSubtitle = 'Execução comercial com padrão, previsibilidade e leitura rápida da operação.',
  sideBadge = 'Acesso seguro',
  stats = DEFAULT_STATS,
  features = DEFAULT_FEATURES,
}: AuthScaffoldProps) {
  return (
    <>
      <style jsx>{`
        .auth-shell {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 32%),
            radial-gradient(circle at bottom right, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0) 28%),
            linear-gradient(180deg, ${AUTH.contentBg} 0%, #07090d 100%);
          color: ${AUTH.textPrimary};
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .auth-frame {
          max-width: 1240px;
          margin: 0 auto;
          min-height: 100vh;
          padding: 28px;
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(420px, 488px);
          gap: 28px;
          align-items: stretch;
        }

        .auth-hero {
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .auth-brandbar {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 0 18px;
        }

        .auth-brandmark {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          font-size: 18px;
          font-weight: 800;
          box-shadow: 0 10px 24px rgba(37,99,235,0.28);
        }

        .auth-brandtext {
          min-width: 0;
        }

        .auth-brandtitle {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: ${AUTH.textPrimary};
        }

        .auth-brandsubtitle {
          margin-top: 3px;
          font-size: 13px;
          color: ${AUTH.textSecondary};
        }

        .auth-hero-card {
          flex: 1;
          min-height: 0;
          border-radius: 28px;
          border: 1px solid ${AUTH.border};
          background:
            linear-gradient(180deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 20%, rgba(17,19,24,0.98) 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.03),
            0 24px 80px rgba(0,0,0,0.34);
          padding: 34px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
        }

        .auth-hero-card::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(96,165,250,0.08) 0%, transparent 45%);
          pointer-events: none;
        }

        .auth-side-badge {
          align-self: flex-start;
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(59,130,246,0.28);
          background: rgba(59,130,246,0.10);
          color: ${AUTH.blueSoft};
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .auth-side-title {
          position: relative;
          z-index: 1;
          margin-top: 18px;
          font-size: 42px;
          line-height: 1.02;
          font-weight: 800;
          letter-spacing: -0.04em;
          max-width: 620px;
        }

        .auth-side-subtitle {
          position: relative;
          z-index: 1;
          margin-top: 14px;
          max-width: 620px;
          font-size: 16px;
          line-height: 1.65;
          color: ${AUTH.textSecondary};
        }

        .auth-stats {
          position: relative;
          z-index: 1;
          margin-top: 28px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .auth-stat {
          border-radius: 18px;
          border: 1px solid rgba(59,130,246,0.12);
          background: rgba(9,11,15,0.72);
          padding: 16px;
        }

        .auth-stat-value {
          font-size: 16px;
          font-weight: 800;
          color: ${AUTH.textPrimary};
          letter-spacing: -0.02em;
        }

        .auth-stat-label {
          margin-top: 6px;
          font-size: 12px;
          color: ${AUTH.textSecondary};
        }

        .auth-features {
          position: relative;
          z-index: 1;
          margin-top: 24px;
          display: grid;
          gap: 12px;
        }

        .auth-feature {
          border-radius: 18px;
          border: 1px solid ${AUTH.border};
          background: rgba(9,11,15,0.72);
          padding: 18px;
        }

        .auth-feature-title {
          font-size: 15px;
          font-weight: 800;
          color: ${AUTH.textPrimary};
          letter-spacing: -0.02em;
        }

        .auth-feature-description {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.65;
          color: ${AUTH.textSecondary};
        }

        .auth-panel {
          display: flex;
          align-items: center;
          min-height: 0;
        }

        .auth-panel-card {
          width: 100%;
          border-radius: 28px;
          border: 1px solid ${AUTH.border};
          background:
            linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.03),
            0 24px 80px rgba(0,0,0,0.34);
          padding: 30px;
        }

        .auth-panel-badge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(59,130,246,0.24);
          background: rgba(59,130,246,0.10);
          color: ${AUTH.blueSoft};
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .auth-panel-title {
          margin-top: 18px;
          font-size: 32px;
          line-height: 1.08;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .auth-panel-subtitle {
          margin-top: 10px;
          font-size: 14px;
          line-height: 1.7;
          color: ${AUTH.textSecondary};
        }

        .auth-panel-body {
          margin-top: 24px;
        }

        .auth-footer-links {
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid ${AUTH.borderSubtle};
          display: flex;
          flex-wrap: wrap;
          gap: 10px 16px;
        }

        .auth-footer-link {
          color: ${AUTH.textSecondary};
          font-size: 12px;
          text-decoration: none;
        }

        .auth-footer-link:hover {
          color: ${AUTH.blueSoft};
        }

        @media (max-width: 980px) {
          .auth-frame {
            grid-template-columns: 1fr;
            padding: 20px;
            gap: 20px;
          }

          .auth-hero {
            order: 2;
          }

          .auth-panel {
            order: 1;
          }

          .auth-side-title {
            font-size: 32px;
          }

          .auth-stats {
            grid-template-columns: 1fr;
          }

          .auth-hero-card,
          .auth-panel-card {
            padding: 24px;
            border-radius: 24px;
          }
        }
      `}</style>

      <div className="auth-shell">
        <div className="auth-frame">
          <section className="auth-hero">
            <div className="auth-brandbar">
              <div className="auth-brandmark">C</div>
              <div className="auth-brandtext">
                <div className="auth-brandtitle">{asideTitle}</div>
                <div className="auth-brandsubtitle">Plataforma comercial com padrão executivo</div>
              </div>
            </div>

            <div className="auth-hero-card">
              <div>
                <div className="auth-side-badge">{sideBadge}</div>
                <h1 className="auth-side-title">{heroTitle}</h1>
                <p className="auth-side-subtitle">{asideSubtitle}</p>

                <div className="auth-stats">
                  {stats.map((item) => (
                    <div className="auth-stat" key={item.value + item.label}>
                      <div className="auth-stat-value">{item.value}</div>
                      <div className="auth-stat-label">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="auth-features">
                {features.map((feature) => (
                  <div className="auth-feature" key={feature.title}>
                    <div className="auth-feature-title">{feature.title}</div>
                    <div className="auth-feature-description">{feature.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="auth-panel">
            <div className="auth-panel-card">
              {pageBadge ? <div className="auth-panel-badge">{pageBadge}</div> : null}
              <div className="auth-panel-title">{title}</div>
              <div className="auth-panel-subtitle">{subtitle}</div>

              <div className="auth-panel-body">{children}</div>

              {footerLinks && footerLinks.length > 0 ? (
                <div className="auth-footer-links">
                  {footerLinks.map((item) => (
                    <Link key={item.href} href={item.href} className="auth-footer-link">
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

export function AuthField({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.02em', color: AUTH.textPrimary }}>
          {label} {required ? <span style={{ color: '#f87171' }}>*</span> : null}
        </span>
        {hint ? <span style={{ fontSize: 11, color: AUTH.textMuted }}>{hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

export function AuthTextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props
  return (
    <input
      {...rest}
      style={{
        width: '100%',
        height: 48,
        borderRadius: AUTH.radiusInner,
        border: `1px solid ${AUTH.border}`,
        background: 'rgba(9,11,15,0.92)',
        color: AUTH.textPrimary,
        padding: '0 14px',
        outline: 'none',
        fontSize: 14,
        boxSizing: 'border-box',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        ...style,
      }}
    />
  )
}

export function AuthTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { style, ...rest } = props
  return (
    <textarea
      {...rest}
      style={{
        width: '100%',
        minHeight: 108,
        borderRadius: AUTH.radiusInner,
        border: `1px solid ${AUTH.border}`,
        background: 'rgba(9,11,15,0.92)',
        color: AUTH.textPrimary,
        padding: '14px',
        outline: 'none',
        fontSize: 14,
        boxSizing: 'border-box',
        resize: 'vertical',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        ...style,
      }}
    />
  )
}

export function AuthSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, children, ...rest } = props
  return (
    <select
      {...rest}
      style={{
        width: '100%',
        height: 48,
        borderRadius: AUTH.radiusInner,
        border: `1px solid ${AUTH.border}`,
        background: 'rgba(9,11,15,0.92)',
        color: AUTH.textPrimary,
        padding: '0 14px',
        outline: 'none',
        fontSize: 14,
        boxSizing: 'border-box',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        ...style,
      }}
    >
      {children}
    </select>
  )
}

export function AuthPrimaryButton({
  children,
  disabled,
  type = 'button',
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: React.MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 50,
        borderRadius: AUTH.radiusInner,
        border: '1px solid rgba(59,130,246,0.38)',
        background: disabled
          ? 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(29,78,216,0.12) 100%)'
          : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#f8fbff',
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 14px 28px rgba(37,99,235,0.28)',
      }}
    >
      {children}
    </button>
  )
}

export function AuthSecondaryLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 46,
        borderRadius: AUTH.radiusInner,
        border: `1px solid ${AUTH.border}`,
        background: 'rgba(17,19,24,0.84)',
        color: AUTH.textSecondary,
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: 700,
        padding: '0 16px',
      }}
    >
      {children}
    </Link>
  )
}

export function AuthInlineMessage({
  variant,
  message,
}: {
  variant: 'success' | 'error' | 'info'
  message: string | null
}) {
  if (!message) return null

  const map = {
    success: {
      background: 'rgba(34,197,94,0.10)',
      border: 'rgba(34,197,94,0.25)',
      color: '#bbf7d0',
    },
    error: {
      background: 'rgba(239,68,68,0.10)',
      border: 'rgba(239,68,68,0.24)',
      color: '#fecaca',
    },
    info: {
      background: 'rgba(59,130,246,0.10)',
      border: 'rgba(59,130,246,0.24)',
      color: '#bfdbfe',
    },
  }[variant]

  return (
    <div
      style={{
        borderRadius: AUTH.radiusInner,
        border: `1px solid ${map.border}`,
        background: map.background,
        color: map.color,
        padding: '12px 14px',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {message}
    </div>
  )
}

export function AuthDivider({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, height: 1, background: AUTH.borderSubtle }} />
      {label ? (
        <span style={{ fontSize: 11, color: AUTH.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
      ) : null}
      <div style={{ flex: 1, height: 1, background: AUTH.borderSubtle }} />
    </div>
  )
}

export function AuthInfoCard({
  title,
  description,
}: {
  title: string
  description: React.ReactNode
}) {
  return (
    <div
      style={{
        borderRadius: AUTH.radiusInner,
        border: `1px solid ${AUTH.border}`,
        background: 'rgba(9,11,15,0.58)',
        padding: 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: AUTH.textPrimary }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: AUTH.textSecondary }}>{description}</div>
    </div>
  )
}