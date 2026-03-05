'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../lib/supabaseBrowser'

export default function ResetSenhaPage() {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)

  const salvar = async () => {
    if (loading) return
    if (!senha || senha.length < 6) return alert('Use uma senha com pelo menos 6 caracteres.')

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password: senha })

    setLoading(false)

    if (error) return alert('Erro: ' + error.message)

    alert('Senha atualizada. Faça login novamente.')
    router.replace('/login')
    router.refresh()
  }

  return (
    <div style={{ width: 360, margin: '120px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ textAlign: 'center' }}>Redefinir senha</h2>

      <input
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Nova senha"
        type="password"
        autoComplete="new-password"
      />

      <button onClick={salvar} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar nova senha'}
      </button>
    </div>
  )
}