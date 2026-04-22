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

function useIsMobile(breakpoint = 980) {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoint)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [breakpoint])

  return isMobile
}

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
  const isMobile = useIsMobile()

  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 32%), radial-gradient(circle at bottom right, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0) 28%), linear-gradient(180deg, #090b0f 0%, #07090d 100%)',
        color: AUTH.textPrimary,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          minHeight: '100%',
          padding: isMobile ? 20 : 28,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.08fr) minmax(420px, 488px)',
          gap: isMobile ? 20 : 28,
          alignItems: 'start',
          boxSizing: 'border-box',
        }}
      >
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            order: isMobile ? 2 : 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 0 18px',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(145deg, #2563eb 0%, #1d4ed8 100%)',
                color: 'white',
                fontSize: 18,
                fontWeight: 800,
                boxShadow: '0 10px 24px rgba(37,99,235,0.28)',
                flexShrink: 0,
              }}
            >
              C
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: AUTH.textPrimary,
                }}
              >
                {asideTitle}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 13,
                  color: AUTH.textSecondary,
                }}
              >
                Plataforma comercial com padrão executivo
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: isMobile ? 24 : 28,
              border: `1px solid ${AUTH.border}`,
              background:
                'linear-gradient(180deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 20%, rgba(17,19,24,0.98) 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
              padding: isMobile ? 24 : 34,
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              position: 'relative',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, rgba(96,165,250,0.08) 0%, transparent 45%)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 30,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(59,130,246,0.28)',
                  background: 'rgba(59,130,246,0.10)',
                  color: AUTH.blueSoft,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                }}
              >
                {sideBadge}
              </div>

              <h1
                style={{
                  marginTop: 18,
                  marginBottom: 0,
                  fontSize: isMobile ? 32 : 42,
                  lineHeight: 1.02,
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  maxWidth: 620,
                  overflowWrap: 'anywhere',
                }}
              >
                {heroTitle}
              </h1>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  maxWidth: 620,
                  fontSize: 16,
                  lineHeight: 1.65,
                  color: AUTH.textSecondary,
                  overflowWrap: 'anywhere',
                }}
              >
                {asideSubtitle}
              </p>

              <div
                style={{
                  marginTop: 28,
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {stats.map((item) => (
                  <div
                    key={item.value + item.label}
                    style={{
                      borderRadius: 18,
                      border: '1px solid rgba(59,130,246,0.12)',
                      background: 'rgba(9,11,15,0.72)',
                      padding: 16,
                      minWidth: 0,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: AUTH.textPrimary,
                        letterSpacing: '-0.02em',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {item.value}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: AUTH.textSecondary,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'grid',
                gap: 12,
              }}
            >
              {features.map((feature) => (
                <div
                  key={feature.title}
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${AUTH.border}`,
                    background: 'rgba(9,11,15,0.72)',
                    padding: 18,
                    minWidth: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: AUTH.textPrimary,
                      letterSpacing: '-0.02em',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {feature.title}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: AUTH.textSecondary,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {feature.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            minHeight: 0,
            order: isMobile ? 1 : 2,
          }}
        >
          <div
            style={{
              width: '100%',
              borderRadius: isMobile ? 24 : 28,
              border: `1px solid ${AUTH.border}`,
              background:
                'linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
              padding: isMobile ? 24 : 30,
              position: 'relative',
              zIndex: 2,
              boxSizing: 'border-box',
              minWidth: 0,
            }}
          >
            {pageBadge ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 28,
                  padding: '0 11px',
                  borderRadius: 999,
                  border: '1px solid rgba(59,130,246,0.24)',
                  background: 'rgba(59,130,246,0.10)',
                  color: AUTH.blueSoft,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {pageBadge}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 18,
                fontSize: 32,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                overflowWrap: 'anywhere',
              }}
            >
              {title}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 14,
                lineHeight: 1.7,
                color: AUTH.textSecondary,
                overflowWrap: 'anywhere',
              }}
            >
              {subtitle}
            </div>

            <div style={{ marginTop: 24, position: 'relative', zIndex: 4 }}>
              {children}
            </div>

            {footerLinks && footerLinks.length > 0 ? (
              <div
                style={{
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: `1px solid ${AUTH.borderSubtle}`,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  position: 'relative',
                  zIndex: 5,
                }}
              >
                {footerLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 38,
                      padding: '0 14px',
                      borderRadius: 10,
                      border: `1px solid ${AUTH.border}`,
                      background: 'rgba(17,19,24,0.84)',
                      color: AUTH.textSecondary,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 6,
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
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
    <label style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.02em',
            color: AUTH.textPrimary,
            overflowWrap: 'anywhere',
          }}
        >
          {label} {required ? <span style={{ color: '#f87171' }}>*</span> : null}
        </span>

        {hint ? (
          <span
            style={{
              fontSize: 11,
              color: AUTH.textMuted,
              overflowWrap: 'anywhere',
            }}
          >
            {hint}
          </span>
        ) : null}
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
        minWidth: 0,
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
        minWidth: 0,
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
        minWidth: 0,
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
        position: 'relative',
        zIndex: 10,
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
        cursor: 'pointer',
        position: 'relative',
        zIndex: 30,
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ flex: 1, height: 1, background: AUTH.borderSubtle }} />
      {label ? (
        <span
          style={{
            fontSize: 11,
            color: AUTH.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}
        >
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
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: AUTH.textPrimary,
          overflowWrap: 'anywhere',
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          lineHeight: 1.7,
          color: AUTH.textSecondary,
          overflowWrap: 'anywhere',
        }}
      >
        {description}
      </div>
    </div>
  )
}