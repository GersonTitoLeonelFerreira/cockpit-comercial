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
  AuthTextInput,
} from '../components/auth/AuthUI'

const COMMERCIAL_STATS = [
  {
    value: 'Menos lead parado',
    label: 'SLA, agenda e follow-up sob controle',
  },
  {
    value: 'Mais clareza gerencial',
    label: 'visão diária da execução do time',
  },
  {
    value: 'Mais previsibilidade',
    label: 'meta conectada à operação',
  },
]

const COMMERCIAL_FEATURES = [
  {
    title: 'Copiloto comercial com IA',
    description:
      'Lê conversa, sugere estágio, próxima ação e ajuda o vendedor a sair do improviso.',
  },
  {
    title: 'Kanban com prioridade real',
    description:
      'Agenda, atrasos, filtros e execução comercial em um fluxo operacional de verdade.',
  },
  {
    title: 'Meta conectada ao dia a dia',
    description:
      'Simulador, taxa de conversão, ticket e leitura de esforço para o gerente corrigir rota antes do fim do mês.',
  },
]

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
    <AuthScaffold
      asideTitle="Yolen"
      pageBadge="Entrar"
      title="Acesse sua operação"
      subtitle="Entre para acompanhar a equipe, priorizar os leads certos e transformar rotina comercial em resultado."
      sideBadge="Cockpit comercial"
      heroTitle="Yolen é o cockpit comercial para equipes que precisam parar de perder lead na operação."
      asideSubtitle="O Yolen organiza o pipeline, orienta a próxima ação, dá visão diária ao gerente e conecta a rotina comercial com a meta. Menos improviso. Mais execução. Mais previsibilidade."
      stats={COMMERCIAL_STATS}
      features={COMMERCIAL_FEATURES}
      footerLinks={[
        { label: 'Solicitar demonstração', href: '/cadastro' },
        { label: 'Esqueci minha senha', href: '/esqueci-senha' },
      ]}
    >
      <form onSubmit={entrar} style={{ display: 'grid', gap: 16 }}>
        <AuthInlineMessage variant="error" message={errorMessage} />

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 34,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid rgba(59,130,246,0.18)',
            background: 'rgba(59,130,246,0.08)',
            color: '#93c5fd',
            fontSize: 12,
            fontWeight: 700,
            width: 'fit-content',
          }}
        >
          Ideal para gestores e equipes comerciais com operação ativa
        </div>

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
          {loading ? 'Entrando...' : 'Entrar no Yolen'}
        </AuthPrimaryButton>

        <AuthDivider label="ou" />

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 50,
          }}
        >
          <button
            type="button"
            onClick={() => router.push('/cadastro')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 46,
              borderRadius: 12,
              border: '1px solid #1a1d2e',
              background: 'rgba(17,19,24,0.92)',
              color: '#8fa3bc',
              fontSize: 14,
              fontWeight: 700,
              padding: '0 16px',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 60,
            }}
          >
            Solicitar demonstração
          </button>
        </div>

        <AuthInfoCard
          title="Por que o Yolen chama atenção"
          description={
            <>
              <div>• Direciona a próxima ação comercial com mais clareza.</div>
              <div>• Dá visão diária da operação para o gerente agir antes.</div>
              <div>• Conecta pipeline, rotina e meta no mesmo sistema.</div>
            </>
          }
        />
      </form>
    </AuthScaffold>
  )
}