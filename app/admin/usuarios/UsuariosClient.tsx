'use client'

import { useState } from 'react'

type Role = 'admin' | 'manager' | 'member'

export default function UsuariosClient() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [loading, setLoading] = useState(false)

  const criar = async () => {
    if (loading) return
    if (!email || !password) return alert('Informe email e senha.')

    setLoading(true)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        role,
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) return alert(json?.error || 'Erro ao criar usuário.')

    alert(`Usuário criado! ID: ${json.user_id}`)
    setEmail('')
    setPassword('')
    setFullName('')
    setRole('member')
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          Nome
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>

        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>

        <label>
          Permissão (role)
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={{ width: '100%', padding: 8 }}
          >
            <option value="member">member (operacional/vendedor)</option>
            <option value="manager">manager (gestor)</option>
            <option value="admin">admin (dono)</option>
          </select>
        </label>

        <button
          onClick={criar}
          disabled={loading}
          style={{ padding: 10, cursor: 'pointer' }}
        >
          {loading ? 'Criando…' : 'Criar usuário'}
        </button>
      </div>
    </div>
  )
}
