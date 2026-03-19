'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inviteSeller } from '@/app/lib/services/admin-sellers'

type Role = 'admin' | 'member'

export default function NovoVendedorClient() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setErrorMsg('Email é obrigatório.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      await inviteSeller({ email: email.trim(), full_name: fullName.trim(), role })
      setSuccessMsg('Vendedor cadastrado com sucesso! Redirecionando...')
      setTimeout(() => router.push('/admin/vendedores'), 1500)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Erro ao cadastrar vendedor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      {/* Voltar */}
      <button
        onClick={() => router.push('/admin/vendedores')}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          opacity: 0.7,
          cursor: 'pointer',
          fontSize: 13,
          marginBottom: 20,
          padding: 0,
        }}
      >
        ← Voltar
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        Cadastrar Vendedor
      </h1>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 24 }}>
        Um convite será enviado para o email informado.
      </p>

      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#0d2a1a',
            border: '1px solid #166534',
            color: '#4ade80',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          ✅ {successMsg}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#2a0a0a',
            border: '1px solid #6b2020',
            color: '#f87171',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Nome completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex: João Silva"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Email / Login *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendedor@empresa.com"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Função / Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            >
              <option value="member">Vendedor (member)</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 18px',
              borderRadius: 10,
              border: 'none',
              background: loading ? '#1a4a2a' : '#1a6b3c',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {loading ? 'Cadastrando...' : 'Cadastrar vendedor'}
          </button>
        </div>
      </form>
    </div>
  )
}
