'use client'

import * as React from 'react'

const C = {
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
} as const

type MeResponse = {
  ok: true
  profile: {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    job_title: string | null
    birth_date: string | null
    role: string | null
  }
}

function fieldStyle(disabled = false): React.CSSProperties {
  return {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: disabled ? '#0b0d12' : C.panelSoft,
    color: C.text,
    fontSize: 13,
    outline: 'none',
    opacity: disabled ? 0.7 : 1,
  }
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: 6,
    display: 'block',
  }
}

export default function MyAccountTab({
  userId,
  userEmail,
}: {
  userId: string
  userEmail: string
}) {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  const [form, setForm] = React.useState({
    full_name: '',
    email: userEmail,
    phone: '',
    job_title: '',
    birth_date: '',
    role: '',
  })

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/platform/me', { method: 'GET' })
      const json = (await res.json()) as MeResponse | { error?: string }

      if (!res.ok || !('ok' in json)) {
        throw new Error((json as any)?.error || 'Erro ao carregar sua conta.')
      }

      setForm({
        full_name: json.profile.full_name ?? '',
        email: json.profile.email ?? userEmail,
        phone: json.profile.phone ?? '',
        job_title: json.profile.job_title ?? '',
        birth_date: json.profile.birth_date ?? '',
        role: json.profile.role ?? '',
      })
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar sua conta.')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/platform/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone,
          job_title: form.job_title,
          birth_date: form.birth_date || null,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar sua conta.')

      setSuccess('Dados da sua conta salvos com sucesso.')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar sua conta.')
    } finally {
      setSaving(false)
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
      <div style={{ fontSize: 20, fontWeight: 900 }}>Minha Conta</div>
      <div style={{ marginTop: 6, fontSize: 13, color: C.textSoft }}>
        Edite os seus dados operacionais dentro do sistema.
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
        ID do usuário: {userId}
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.12)',
            border: `1px solid rgba(239,68,68,0.22)`,
            color: '#fecaca',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(34,197,94,0.12)',
            border: `1px solid rgba(34,197,94,0.22)`,
            color: '#bbf7d0',
            fontSize: 13,
          }}
        >
          {success}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 14,
        }}
      >
        <div>
          <label style={labelStyle()}>Nome</label>
          <input
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            style={fieldStyle()}
            disabled={loading}
          />
        </div>

        <div>
          <label style={labelStyle()}>E-mail</label>
          <input value={form.email} style={fieldStyle(true)} disabled />
        </div>

        <div>
          <label style={labelStyle()}>Telefone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            style={fieldStyle()}
            disabled={loading}
          />
        </div>

        <div>
          <label style={labelStyle()}>Cargo interno</label>
          <input
            value={form.job_title}
            onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
            style={fieldStyle()}
            disabled={loading}
          />
        </div>

        <div>
          <label style={labelStyle()}>Data de nascimento</label>
          <input
            type="date"
            value={form.birth_date || ''}
            onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))}
            style={fieldStyle()}
            disabled={loading}
          />
        </div>

        <div>
          <label style={labelStyle()}>Role</label>
          <input value={form.role} style={fieldStyle(true)} disabled />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          onClick={() => void save()}
          disabled={loading || saving}
          style={{
            border: `1px solid ${C.blue}`,
            background:
              'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
            color: '#93c5fd',
            padding: '10px 16px',
            borderRadius: 10,
            fontWeight: 800,
            cursor: loading || saving ? 'not-allowed' : 'pointer',
            opacity: loading || saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Salvando...' : 'Salvar minha conta'}
        </button>
      </div>
    </section>
  )
}