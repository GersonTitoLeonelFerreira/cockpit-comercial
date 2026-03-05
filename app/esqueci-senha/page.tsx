'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '../lib/supabaseBrowser'

export default function EsqueciSenhaPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const enviar = async () => {
    if (loading) return
    if (!email) return alert('Digite seu email.')

    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-senha`,
    })

    setLoading(false)

    if (error) return alert('Erro: ' + error.message)

    alert('Se esse email existir, enviamos um link para redefinir a senha.')
  }

  return (
    <div style={{ width: 360, margin: '120px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ textAlign: 'center' }}>Esqueci minha senha</h2>

      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />

      <button onClick={enviar} disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar link'}
      </button>

      <Link href="/login" style={{ textDecoration: 'underline', fontSize: 14, textAlign: 'center' }}>
        Voltar para login
      </Link>
    </div>
  )
}