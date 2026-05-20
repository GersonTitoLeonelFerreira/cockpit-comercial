'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { PlatformAdminUser } from './page'

const C = {
  page: '#090b0f',
  panel: '#0d0f14',
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
} as const

function formatDateBR(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('pt-BR')
}

function metricCard(label: string, value: number, hint: string) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        background:
          'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 60%, #0d0f14 100%)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, color: C.text, fontSize: 26, fontWeight: 950 }}>{value}</div>
      <div style={{ marginTop: 6, color: C.textSoft, fontSize: 12 }}>{hint}</div>
    </div>
  )
}

function adminName(admin: PlatformAdminUser) {
  return admin.full_name || admin.email || 'Admin sem nome'
}

function adminEmail(admin: PlatformAdminUser) {
  return admin.email || 'Sem e-mail'
}

export default function PlatformAdminsClient({
  currentUserId,
  initialAdmins,
  initialError,
}: {
  currentUserId: string
  initialAdmins: PlatformAdminUser[]
  initialError: string | null
}) {
  const router = useRouter()

  const [admins, setAdmins] = React.useState(initialAdmins)
  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(initialError)
  const [messageType, setMessageType] = React.useState<'success' | 'error'>(initialError ? 'error' : 'success')

  const activeAdmins = admins.filter((admin) => admin.is_active_global !== false)

  async function createPlatformAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setMessage(null)
    setLoading(true)

    try {
      const res = await fetch('/api/platform-admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        admin?: PlatformAdminUser
      }

      if (!res.ok || !json.ok || !json.admin) {
        throw new Error(json.error || `Falha ao criar admin. HTTP ${res.status}`)
      }

      setAdmins((current) => [json.admin as PlatformAdminUser, ...current])
      setFullName('')
      setEmail('')
      setPassword('')

      setMessageType('success')
      setMessage('Admin da plataforma criado com sucesso.')
      router.refresh()
    } catch (error: unknown) {
      setMessageType('error')
      setMessage(error instanceof Error ? error.message : 'Erro inesperado ao criar admin da plataforma.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100%', background: C.page, color: C.text }}>
      <section
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.13) 0%, rgba(34,197,94,0.06) 50%, #0d0f14 100%)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 2px 18px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ maxWidth: 980 }}>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid rgba(59,130,246,0.28)',
              background: 'rgba(59,130,246,0.10)',
              color: '#93c5fd',
              borderRadius: 999,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 900,
              marginBottom: 14,
            }}
          >
            Administração Global
          </div>

          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 950, letterSpacing: '-0.04em' }}>
            Admins da Plataforma
          </h1>

          <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
            Crie usuários exclusivos para administrar o SaaS em nível global. Esta tela não promove
            usuários de empresas clientes.
          </p>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginTop: 18,
        }}
      >
        {metricCard('Admins globais', admins.length, 'Usuários com acesso à plataforma')}
        {metricCard('Admins ativos', activeAdmins.length, 'Admins globais ativos')}
        {metricCard('Usuário atual', currentUserId ? 1 : 0, 'Sessão validada como platform admin')}
      </section>

      {message ? (
        <section
          style={{
            marginTop: 18,
            border:
              messageType === 'success'
                ? '1px solid rgba(34,197,94,0.28)'
                : '1px solid rgba(239,68,68,0.28)',
            background:
              messageType === 'success'
                ? 'rgba(34,197,94,0.10)'
                : 'rgba(239,68,68,0.10)',
            color: messageType === 'success' ? '#86efac' : '#fecaca',
            borderRadius: 16,
            padding: 16,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {message}
        </section>
      ) : null}

      <section
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 420px) 1fr',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <form
          onSubmit={createPlatformAdmin}
          style={{
            border: `1px solid ${C.border}`,
            background: C.panel,
            borderRadius: 16,
            padding: 18,
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Criar admin da plataforma</div>
            <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              Cria um usuário global novo, sem vínculo com empresa cliente.
            </div>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.textSoft }}>Nome</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nome do administrador"
              style={{
                height: 42,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: '#090b0f',
                color: C.text,
                padding: '0 12px',
                outline: 'none',
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.textSoft }}>E-mail *</span>
            <input
              value={email}
              type="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@empresa.com"
              style={{
                height: 42,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: '#090b0f',
                color: C.text,
                padding: '0 12px',
                outline: 'none',
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.textSoft }}>Senha provisória *</span>
            <input
              value={password}
              type="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{
                height: 42,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: '#090b0f',
                color: C.text,
                padding: '0 12px',
                outline: 'none',
                fontSize: 13,
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              border: `1px solid ${C.blue}`,
              background:
                'linear-gradient(90deg, rgba(59,130,246,0.30) 0%, rgba(59,130,246,0.14) 100%)',
              color: '#93c5fd',
              padding: '11px 12px',
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.65 : 1,
            }}
          >
            {loading ? 'Criando...' : 'Criar admin da plataforma'}
          </button>
        </form>

        <section
          style={{
            border: `1px solid ${C.border}`,
            background: C.panel,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${C.border}`,
              background: C.panelSoft,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900 }}>Admins existentes</div>
            <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
              Somente usuários com is_platform_admin ativo aparecem aqui.
            </div>
          </div>

          {admins.length === 0 ? (
            <div style={{ padding: 18, color: C.textSoft, fontSize: 13 }}>
              Nenhum admin da plataforma encontrado.
            </div>
          ) : (
            <div style={{ display: 'grid' }}>
              {admins.map((admin) => (
                <article
                  key={admin.id}
                  style={{
                    padding: 16,
                    borderBottom: `1px solid ${C.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>{adminName(admin)}</div>
                    <div style={{ marginTop: 4, color: C.textSoft, fontSize: 13 }}>
                      {adminEmail(admin)}
                    </div>
                    <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>
                      Criado em: {formatDateBR(admin.created_at)}
                      {admin.id === currentUserId ? ' • usuário atual' : ''}
                    </div>
                  </div>

                  <span
                    style={{
                      border:
                        admin.is_active_global === false
                          ? '1px solid rgba(239,68,68,0.35)'
                          : '1px solid rgba(34,197,94,0.35)',
                      background:
                        admin.is_active_global === false
                          ? 'rgba(239,68,68,0.12)'
                          : 'rgba(34,197,94,0.12)',
                      color: admin.is_active_global === false ? '#fecaca' : '#86efac',
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {admin.is_active_global === false ? 'Inativo global' : 'Admin global'}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}