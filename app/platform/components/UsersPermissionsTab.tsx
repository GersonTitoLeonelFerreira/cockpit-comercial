'use client'

import * as React from 'react'

type Role = 'member' | 'manager' | 'admin'

type UserRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  role: Role
  is_active: boolean
  created_at: string | null
}

type UsersResponse = {
  ok: true
  users: UserRow[]
}

const C = {
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#22c55e',
} as const

function toBR(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export default function UsersPermissionsTab() {
  const [rows, setRows] = React.useState<UserRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/platform/users', { method: 'GET' })
      const json = (await res.json()) as UsersResponse | { error?: string }

      if (!res.ok || !('ok' in json)) {
        throw new Error((json as any)?.error || 'Erro ao carregar usuários.')
      }

      setRows(json.users)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
  }, [])

  function updateLocal(id: string, patch: Partial<UserRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function saveAccess(row: UserRow) {
    setBusyId(row.id)
    setError(null)

    try {
      const res = await fetch(`/api/platform/users/${row.id}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: row.role,
          is_active: row.is_active,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar acesso.')

      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar acesso.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background:
          'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 60%, #0d0f14 100%)',
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>Usuários e Permissões</div>
          <div style={{ marginTop: 6, fontSize: 13, color: C.textSoft }}>
            Aqui você controla apenas acesso: role e ativo/inativo.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/admin/vendedores/novo"
            style={{
              textDecoration: 'none',
              border: `1px solid ${C.blue}`,
              background:
                'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
              color: '#93c5fd',
              padding: '10px 14px',
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            Novo usuário
          </a>

          <button
            onClick={() => void load()}
            style={{
              border: `1px solid ${C.border}`,
              background: '#111318',
              color: C.textSoft,
              padding: '10px 14px',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.22)',
            color: '#fecaca',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#0d0f14',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr',
            gap: 12,
            padding: '12px 14px',
            borderBottom: `1px solid ${C.border}`,
            background: '#111318',
            color: C.textMuted,
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          <div>Nome</div>
          <div>E-mail</div>
          <div>Role</div>
          <div>Acesso</div>
          <div>Criado em</div>
          <div>Ações</div>
        </div>

        {loading ? (
          <div style={{ padding: 16, color: C.textSoft, fontSize: 13 }}>Carregando usuários...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 16, color: C.textSoft, fontSize: 13 }}>Nenhum usuário encontrado.</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr',
                gap: 12,
                padding: '14px',
                borderBottom: `1px solid ${C.border}`,
                alignItems: 'center',
                color: C.text,
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{row.full_name || '—'}</div>
                <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
                  {row.job_title || 'Sem cargo'}
                </div>
              </div>

              <div>
                <div>{row.email || '—'}</div>
                <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
                  {row.phone || 'Sem telefone'}
                </div>
              </div>

              <div>
                <select
                  value={row.role}
                  onChange={(e) => updateLocal(row.id, { role: e.target.value as Role })}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: '#111318',
                    color: C.text,
                    fontSize: 13,
                  }}
                >
                  <option value="member">Vendedor</option>
                  <option value="manager">Gestor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <select
                  value={row.is_active ? 'active' : 'inactive'}
                  onChange={(e) => updateLocal(row.id, { is_active: e.target.value === 'active' })}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: '#111318',
                    color: C.text,
                    fontSize: 13,
                  }}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>

              <div style={{ color: C.textSoft }}>{toBR(row.created_at)}</div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void saveAccess(row)}
                  disabled={busyId === row.id}
                  style={{
                    border: `1px solid ${C.blue}`,
                    background:
                      'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
                    color: '#93c5fd',
                    padding: '8px 10px',
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: busyId === row.id ? 'not-allowed' : 'pointer',
                    opacity: busyId === row.id ? 0.6 : 1,
                  }}
                >
                  {busyId === row.id ? 'Salvando...' : 'Salvar'}
                </button>

                <a
                  href={`/admin/vendedores/${row.id}`}
                  style={{
                    textDecoration: 'none',
                    border: `1px solid ${C.border}`,
                    background: '#111318',
                    color: C.textSoft,
                    padding: '8px 10px',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Editar cadastro
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}