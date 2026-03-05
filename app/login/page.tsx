'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser } from '../lib/supabaseBrowser'

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)

  const entrar = async () => {
    if (loading) return

    if (!email || !senha) {
      alert('Preencha email e senha.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    setLoading(false)

    if (error) {
      alert('Erro: ' + error.message)
      return
    }

    if (!data?.session) {
      alert('Login respondeu sem sessão. Verifique se o usuário está confirmado no Supabase.')
      return
    }

    // importante: garante re-render/SSR do App Router com cookie atualizado
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div
      style={{
        width: 320,
        margin: '120px auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <h2 style={{ textAlign: 'center' }}>Login</h2>

      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />

      <input
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Senha"
        type="password"
        autoComplete="current-password"
      />

      <button onClick={entrar} disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 14 }}>
        <Link href="/cadastro" style={{ textDecoration: 'underline' }}>
          Quero uma demonstração
        </Link>

        <Link href="/esqueci-senha" style={{ textDecoration: 'underline' }}>
          Esqueci minha senha
        </Link>
      </div>
    </div>
  )
}