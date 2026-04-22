'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import {
  AuthDivider,
  AuthField,
  AuthInfoCard,
  AuthInlineMessage,
  AuthPrimaryButton,
  AuthScaffold,
  AuthSecondaryLink,
  AuthTextInput,
} from '../components/auth/AuthUI'

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const entrar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (loading) return

    setErrorMessage(null)

    if (!email || !senha) {
      setErrorMessage('Preencha email e senha para acessar o Cockpit Comercial.')
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
    <AuthScaffold
      pageBadge="Entrar"
      title="Acesse sua operação"
      subtitle="Entre com sua credencial para continuar sua execução comercial no mesmo padrão visual do Cockpit."
      sideBadge="Ambiente seguro"
      heroTitle="Login com padrão executivo, leitura limpa e identidade alinhada ao restante do sistema."
      asideSubtitle="A área de autenticação agora segue a mesma linguagem premium do produto: dark mode, profundidade sutil, contraste forte e foco total em clareza operacional."
      footerLinks={[
        { label: 'Quero uma demonstração', href: '/cadastro' },
        { label: 'Esqueci minha senha', href: '/esqueci-senha' },
      ]}
    >
      <form onSubmit={entrar} style={{ display: 'grid', gap: 16 }}>
        <AuthInlineMessage variant="error" message={errorMessage} />

        <AuthField label="Email" required>
          <AuthTextInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            autoComplete="email"
            type="email"
          />
        </AuthField>

        <AuthField label="Senha" required hint="acesso autenticado por email/senha">
          <div style={{ position: 'relative' }}>
            <AuthTextInput
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
                color: '#93c5fd',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </AuthField>

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
              gap: 8,
              minHeight: 30,
              padding: '0 10px',
              borderRadius: 999,
              border: '1px solid rgba(59,130,246,0.18)',
              background: 'rgba(59,130,246,0.08)',
              color: '#93c5fd',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Conexão protegida
          </div>

          <Link
            href="/esqueci-senha"
            style={{
              color: '#8fa3bc',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Esqueci minha senha
          </Link>
        </div>

        <AuthPrimaryButton type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar no Cockpit'}
        </AuthPrimaryButton>

        <AuthDivider label="ou" />

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AuthSecondaryLink href="/cadastro">Quero uma demonstração</AuthSecondaryLink>
        </div>

        <AuthInfoCard
          title="Acesso focado no que importa"
          description={
            <>
              Esta tela foi desenhada para seguir o mesmo padrão executivo do sistema. Menos ruído visual, mais
              clareza de leitura e percepção de produto premium.
            </>
          }
        />
      </form>
    </AuthScaffold>
  )
}