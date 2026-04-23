'use client'

import type { FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../lib/supabaseBrowser'

function useIsMobile(breakpoint = 980) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoint)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [breakpoint])

  return isMobile
}

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  cardBg: '#141722',
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
} as const

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 34,
        padding: '0 12px',
        borderRadius: 999,
        border: '1px solid rgba(59,130,246,0.20)',
        background: 'rgba(59,130,246,0.08)',
        color: DS.blueSoft,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

function VisualPill({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: `1px solid ${DS.border}`,
        background: 'rgba(9,11,15,0.76)',
        padding: 16,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: DS.textPrimary,
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: 1.6,
          color: DS.textSecondary,
        }}
      >
        {subtitle}
      </div>
    </div>
  )
}

function MiniPreviewCard({
  label,
  title,
  lines,
}: {
  label: string
  title: string
  lines: string[]
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${DS.border}`,
        background: 'linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(9,11,15,0.96) 100%)',
        boxShadow: '0 16px 36px rgba(0,0,0,0.28)',
        padding: 18,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 26,
          padding: '0 10px',
          borderRadius: 999,
          border: '1px solid rgba(59,130,246,0.22)',
          background: 'rgba(59,130,246,0.08)',
          color: DS.blueSoft,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 18,
          fontWeight: 800,
          color: DS.textPrimary,
          lineHeight: 1.15,
        }}
      >
        {title}
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {lines.map((line) => (
          <div
            key={line}
            style={{
              borderRadius: 12,
              border: `1px solid ${DS.borderSubtle}`,
              background: 'rgba(255,255,255,0.015)',
              padding: '10px 12px',
              fontSize: 13,
              color: DS.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewBoard({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      style={{
        borderRadius: 24,
        border: '1px solid rgba(59,130,246,0.16)',
        background:
          'linear-gradient(180deg, rgba(59,130,246,0.08) 0%, rgba(17,19,24,0.98) 24%, rgba(9,11,15,0.98) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
        padding: isMobile ? 18 : 22,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: DS.blueSoft,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            cockpit comercial
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 24,
              fontWeight: 900,
              color: DS.textPrimary,
              letterSpacing: '-0.03em',
            }}
          >
            Execução comercial em andamento
          </div>
        </div>
      </div>

      <div
  style={{
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
    gap: 16,
    alignItems: 'start',
  }}
>
<div
  style={{
    borderRadius: 20,
    border: `1px solid ${DS.border}`,
    background: 'rgba(9,11,15,0.82)',
    padding: 16,
    minWidth: 0,
    alignSelf: 'start',
    height: 'fit-content',
  }}
>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {[
              { label: 'Novo', color: '#3b82f6' },
              { label: 'Contato', color: '#06b6d4' },
              { label: 'Negociação', color: '#8b5cf6' },
              { label: 'Ganho', color: '#22c55e' },
            ].map((col) => (
              <div
                key={col.label}
                style={{
                  borderRadius: 16,
                  border: `1px solid ${DS.border}`,
                  background: 'rgba(17,19,24,0.76)',
                  minHeight: 158,
                  padding: 12,
                  boxSizing: 'border-box',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    color: DS.textPrimary,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: col.color,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  {col.label}
                </div>

                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${DS.borderSubtle}`,
                        background: 'rgba(255,255,255,0.015)',
                        padding: 10,
                        minHeight: 34,
                      }}
                    >
                      <div
                        style={{
                          width: n === 2 ? '78%' : n === 3 ? '64%' : '88%',
                          height: 8,
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.10)',
                        }}
                      />
                      <div
                        style={{
                          marginTop: 8,
                          width: n === 2 ? '52%' : '44%',
                          height: 6,
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.05)',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <MiniPreviewCard
            label="IA comercial"
            title="IA que orienta o vendedor"
            lines={[
              'Analisa conversa e sinaliza o estágio mais coerente.',
              'Recomenda próxima ação para evitar improviso e travamento.',
            ]}
          />

          <MiniPreviewCard
            label="meta + execução"
            title="Meta acompanhada como operação"
            lines={[
              'O gerente enxerga ritmo, prioridade e atraso antes do problema estourar.',
              'A equipe conecta follow-up, pipeline e meta no mesmo cockpit.',
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function InputLabel({
  label,
  required,
  hint,
}: {
  label: string
  required?: boolean
  hint?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: DS.textPrimary,
          letterSpacing: '0.02em',
        }}
      >
        {label} {required ? <span style={{ color: '#f87171' }}>*</span> : null}
      </span>

      {hint ? (
        <span
          style={{
            fontSize: 11,
            color: DS.textMuted,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props
  return (
    <input
      {...rest}
      style={{
        width: '100%',
        height: 48,
        borderRadius: 14,
        border: `1px solid ${DS.border}`,
        background: 'rgba(9,11,15,0.92)',
        color: DS.textPrimary,
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

function MessageBox({
  message,
}: {
  message: string | null
}) {
  if (!message) return null

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(239,68,68,0.22)',
        background: 'rgba(239,68,68,0.10)',
        color: '#fecaca',
        padding: '12px 14px',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {message}
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])
  const isMobile = useIsMobile()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'demo'>('login')

  const entrar = async (e?: FormEvent) => {
    e?.preventDefault()
    if (loading) return

    setErrorMessage(null)

    if (!email || !senha) {
      setErrorMessage('Preencha email e senha para acessar o Yolen.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })

    setLoading(false)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    if (!data?.session) {
      setErrorMessage('O login respondeu sem sessão válida. Verifique a confirmação do usuário no Supabase.')
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.20) 0%, rgba(59,130,246,0) 28%), radial-gradient(circle at right center, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0) 24%), linear-gradient(180deg, #090b0f 0%, #06080c 100%)',
        color: DS.textPrimary,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          minHeight: '100%',
          padding: isMobile ? 20 : 28,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
          gap: isMobile ? 22 : 28,
          alignItems: 'start',
          boxSizing: 'border-box',
        }}
      >
        <section style={{ display: 'grid', gap: 18 }}>
          <div
            style={{
              display: 'grid',
              gap: 10,
              justifyContent: 'start',
              alignSelf: 'start',
            }}
          >
            <Image
              src="/branding/yolen-logo-principal.png"
              alt="Yolen"
              width={340}
              height={82}
              priority
              style={{
                width: isMobile ? 200 : 340,
                height: 'auto',
                display: 'block',
                objectFit: 'contain',
              }}
            />

            <div
              style={{
                width: 56,
                height: 2,
                borderRadius: 999,
                background: 'linear-gradient(90deg, rgba(59,130,246,0.9) 0%, rgba(59,130,246,0.18) 100%)',
                marginLeft: 2,
              }}
            />

            <div
              style={{
                fontSize: 14,
                color: DS.textSecondary,
                lineHeight: 1.45,
                maxWidth: 360,
                marginLeft: 2,
              }}
            >
              Cockpit comercial para equipes de vendas
            </div>
          </div>

          <div>
            <h1
              style={{
                margin: 0,
                fontSize: isMobile ? 42 : 62,
                lineHeight: 0.98,
                fontWeight: 900,
                letterSpacing: '-0.05em',
                maxWidth: 760,
              }}
            >
              Pare de perder lead na operação.
            </h1>

            <p
              style={{
                marginTop: 18,
                marginBottom: 0,
                maxWidth: 760,
                fontSize: isMobile ? 17 : 20,
                lineHeight: 1.55,
                color: DS.textSecondary,
              }}
            >
              O Yolen organiza sua operação, orienta a próxima ação e conecta a rotina da equipe com a meta.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <Chip>IA que orienta a próxima ação</Chip>
            <Chip>SLA e follow-up sob controle</Chip>
            <Chip>Meta conectada à execução</Chip>
          </div>

          <div
            style={{
              borderRadius: 24,
              overflow: 'hidden',
              border: '1px solid rgba(59,130,246,0.16)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
            }}
          >
            <Image
              src="/branding/login-kanban.png"
              alt="Visão do cockpit comercial"
              width={1600}
              height={900}
              priority
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                objectFit: 'cover',
              }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            <VisualPill
              title="Menos lead parado"
              subtitle="A equipe trabalha com prioridade, cadência e próximo passo claro."
            />
            <VisualPill
              title="Mais controle gerencial"
              subtitle="O gestor enxerga atraso, ritmo e execução antes do problema estourar."
            />
            <VisualPill
              title="Mais previsibilidade"
              subtitle="A meta deixa de ser cobrança solta e passa a ser operação diária."
            />
          </div>
        </section>

        <aside
          style={{
            position: isMobile ? 'static' : 'sticky',
            top: isMobile ? undefined : 24,
            alignSelf: 'start',
          }}
        >
          <div
            style={{
              borderRadius: 26,
              border: `1px solid ${DS.border}`,
              background:
                'linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
              padding: isMobile ? 22 : 28,
            }}
          >
            <div
  style={{
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 18,
  }}
>
  <button
    type="button"
    onClick={() => setAuthMode('login')}
    style={{
      minHeight: 32,
      padding: '0 12px',
      borderRadius: 999,
      border: '1px solid rgba(59,130,246,0.24)',
      background: authMode === 'login' ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.02)',
      color: authMode === 'login' ? DS.blueSoft : DS.textSecondary,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      cursor: 'pointer',
    }}
  >
    Entrar
  </button>

  <button
    type="button"
    onClick={() => setAuthMode('demo')}
    style={{
      minHeight: 32,
      padding: '0 12px',
      borderRadius: 999,
      border: '1px solid rgba(59,130,246,0.24)',
      background: authMode === 'demo' ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.02)',
      color: authMode === 'demo' ? DS.blueSoft : DS.textSecondary,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      cursor: 'pointer',
    }}
  >
    Demonstração
  </button>
</div>

            <div
              style={{
                marginTop: 18,
                fontSize: 26,
                lineHeight: 1.05,
                fontWeight: 900,
                letterSpacing: '-0.04em',
              }}
            >
              {authMode === 'login' ? 'Acesse sua operação' : 'Conheça o Yolen'}
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 14,
                lineHeight: 1.7,
                color: DS.textSecondary,
              }}
            >
              {authMode === 'login'
  ? 'Entre para acompanhar equipe, prioridades e execução comercial.'
  : 'Veja como o Yolen ajuda sua equipe a executar melhor, com mais controle e previsibilidade.'}
            </div>

            {authMode === 'login' ? (
  <form onSubmit={entrar} style={{ marginTop: 22, display: 'grid', gap: 16 }}>
    <MessageBox message={errorMessage} />

    <div style={{ display: 'grid', gap: 8 }}>
      <InputLabel label="Email" required />
      <TextInput
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@empresa.com"
        autoComplete="email"
        type="email"
      />
    </div>

    <div style={{ display: 'grid', gap: 8 }}>
      <InputLabel label="Senha" required hint="acesso autenticado por email/senha" />
      <div style={{ position: 'relative' }}>
        <TextInput
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Digite sua senha"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          style={{ paddingRight: 108 }}
        />

        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            height: 34,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid rgba(59,130,246,0.18)',
            background: 'rgba(59,130,246,0.08)',
            color: DS.blueSoft,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showPassword ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>

    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 30,
          padding: '0 10px',
          borderRadius: 999,
          border: '1px solid rgba(59,130,246,0.18)',
          background: 'rgba(59,130,246,0.08)',
          color: DS.blueSoft,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Conexão protegida
      </div>

      <Link
        href="/esqueci-senha"
        style={{
          color: DS.textSecondary,
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Esqueci minha senha
      </Link>
    </div>

    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        minHeight: 52,
        borderRadius: 14,
        border: '1px solid rgba(59,130,246,0.38)',
        background: loading
          ? 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(29,78,216,0.12) 100%)'
          : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#f8fbff',
        fontSize: 15,
        fontWeight: 900,
        letterSpacing: '-0.01em',
        cursor: loading ? 'not-allowed' : 'pointer',
        boxShadow: loading ? 'none' : '0 14px 28px rgba(37,99,235,0.28)',
      }}
    >
      {loading ? 'Entrando...' : 'Entrar no Yolen'}
    </button>

    <button
      type="button"
      onClick={() => router.push('/cadastro')}
      style={{
        width: '100%',
        minHeight: 48,
        borderRadius: 14,
        border: `1px solid ${DS.border}`,
        background: 'rgba(17,19,24,0.92)',
        color: DS.textSecondary,
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      Solicitar demonstração
    </button>
  </form>
) : (
  <div style={{ marginTop: 22, display: 'grid', gap: 16 }}>
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${DS.border}`,
        background: 'rgba(9,11,15,0.60)',
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: DS.textPrimary,
        }}
      >
        O que o Yolen entrega
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gap: 8,
          fontSize: 13,
          color: DS.textSecondary,
          lineHeight: 1.65,
        }}
      >
        <div>• Direciona a próxima ação comercial com mais clareza.</div>
        <div>• Dá visão diária da operação para o gerente agir antes.</div>
        <div>• Conecta execução, follow-up e meta no mesmo cockpit.</div>
      </div>
    </div>

    <button
      type="button"
      onClick={() => router.push('/cadastro')}
      style={{
        width: '100%',
        minHeight: 48,
        borderRadius: 14,
        border: '1px solid rgba(59,130,246,0.38)',
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#f8fbff',
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: '0 14px 28px rgba(37,99,235,0.28)',
      }}
    >
      Solicitar demonstração
    </button>

    <button
      type="button"
      onClick={() => setAuthMode('login')}
      style={{
        width: '100%',
        minHeight: 46,
        borderRadius: 14,
        border: `1px solid ${DS.border}`,
        background: 'rgba(17,19,24,0.92)',
        color: DS.textSecondary,
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      Já tenho acesso
    </button>
  </div>
)}
          </div>
        </aside>
      </div>
    </div>
  )
}