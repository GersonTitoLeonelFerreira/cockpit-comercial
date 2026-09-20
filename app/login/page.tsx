'use client'

import type { FormEvent } from 'react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import { PublicHeader } from '../components/marketing/MarketingChrome'
import { IntelligenceHeroVisual } from '../components/marketing/ProductStoryVisuals'

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

    try {
      await fetch('/api/session/company', {
        method: 'DELETE',
        cache: 'no-store',
      })

      const sessionRes = await fetch('/api/me', { method: 'GET', cache: 'no-store' })
      const sessionJson = (await sessionRes.json()) as {
        ok?: boolean
        companies_count?: number
        requires_company_selection?: boolean
        active_company_id?: string | null
      }

      if (sessionRes.ok && sessionJson.ok && sessionJson.companies_count && sessionJson.companies_count > 1) {
        router.replace('/select-company')
        router.refresh()
        return
      }

      if (sessionRes.ok && sessionJson.ok && sessionJson.requires_company_selection) {
        router.replace('/select-company')
        router.refresh()
        return
      }

      router.replace('/dashboard')
      router.refresh()
    } catch {
      router.replace('/dashboard')
      router.refresh()
    }
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
      <PublicHeader compact />

      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          minHeight: 'calc(100% - 72px)',
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
              Inteligência comercial aplicada à operação
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
              Inteligência para quem vende. Clareza para quem lidera.
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
              A Yolen trabalha ao lado do vendedor para interpretar oportunidades, orientar abordagens e manter a
              venda em movimento. Para a gestão, conecta execução, meta e faturamento em uma leitura única.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <Chip>Copiloto em cada oportunidade</Chip>
            <Chip>Meta traduzida em ação</Chip>
            <Chip>Resultado visível para a gestão</Chip>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Link
              href="/como-funciona"
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 12,
                border: `1px solid ${DS.border}`,
                display: 'inline-flex',
                alignItems: 'center',
                color: DS.textPrimary,
                background: 'rgba(17,19,24,0.72)',
                fontSize: 12,
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              Conhecer a plataforma
            </Link>
            <Link
              href="/destaques"
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                color: DS.textSecondary,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: 'none',
              }}
            >
              Conteúdos e novidades →
            </Link>
          </div>

          <div
            style={{
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
            }}
          >
            <IntelligenceHeroVisual compact />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 12,
            }}
          >
            <VisualPill
              title="Mais capacidade para vender"
              subtitle="A IA ajuda a interpretar o momento da oportunidade e preparar a próxima abordagem."
            />
            <VisualPill
              title="Mais direção para executar"
              subtitle="A meta se transforma em ritmo, esforço necessário e decisões para o período."
            />
            <VisualPill
              title="Mais inteligência para gerir"
              subtitle="Faturamento e relatórios mostram o que impulsiona ou limita o resultado."
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
              {authMode === 'login' ? 'Acesse sua operação' : 'Veja a Yolen trabalhando'}
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
  ? 'Entre para acompanhar oportunidades, equipe, metas e resultado comercial.'
  : 'Conheça como a inteligência da Yolen acompanha a venda e conecta cada ação à gestão do resultado.'}
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
        O que você verá
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
        <div>• O Copiloto interpreta sinais da conversa e sugere a melhor próxima abordagem.</div>
        <div>• O Simulador de Meta traduz o objetivo em esforço e ritmo de execução.</div>
        <div>• Faturamento e relatórios mostram ao gestor onde agir para melhorar o resultado.</div>
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
