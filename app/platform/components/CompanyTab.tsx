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

type CompanyData = {
  id: string
  name?: string | null
  legal_name?: string | null
  trade_name?: string | null
  cnpj?: string | null
  segment?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  state?: string | null
  cep?: string | null
  address?: string | null
} | null

function fieldStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.panelSoft,
    color: C.text,
    fontSize: 13,
    outline: 'none',
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

export default function CompanyTab({ company }: { company: CompanyData }) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  const [form, setForm] = React.useState({
    name: company?.name ?? '',
    legal_name: company?.legal_name ?? '',
    trade_name: company?.trade_name ?? '',
    cnpj: company?.cnpj ?? '',
    segment: company?.segment ?? '',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    cep: company?.cep ?? '',
    address: company?.address ?? '',
  })

  React.useEffect(() => {
    setForm({
      name: company?.name ?? '',
      legal_name: company?.legal_name ?? '',
      trade_name: company?.trade_name ?? '',
      cnpj: company?.cnpj ?? '',
      segment: company?.segment ?? '',
      email: company?.email ?? '',
      phone: company?.phone ?? '',
      city: company?.city ?? '',
      state: company?.state ?? '',
      cep: company?.cep ?? '',
      address: company?.address ?? '',
    })
  }, [company])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/platform/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar empresa.')

      setSuccess('Dados da empresa salvos com sucesso.')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar empresa.')
    } finally {
      setSaving(false)
    }
  }

  if (!company?.id) {
    return (
      <section
        style={{
          border: `1px solid ${C.border}`,
          background: '#0d0f14',
          borderRadius: 16,
          padding: 18,
          color: C.textSoft,
        }}
      >
        Empresa não encontrada para o admin atual.
      </section>
    )
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
      <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>Empresa</div>
      <div style={{ marginTop: 6, fontSize: 13, color: C.textSoft }}>
        Cadastro estrutural da organização dentro do sistema.
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

      {success ? (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.22)',
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
          <label style={labelStyle()}>Nome operacional</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>Segmento</label>
          <input
            value={form.segment}
            onChange={(e) => setForm((p) => ({ ...p, segment: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>Razão social</label>
          <input
            value={form.legal_name}
            onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>Nome fantasia</label>
          <input
            value={form.trade_name}
            onChange={(e) => setForm((p) => ({ ...p, trade_name: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>CNPJ</label>
          <input
            value={form.cnpj}
            onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>E-mail comercial</label>
          <input
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>Telefone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>CEP</label>
          <input
            value={form.cep}
            onChange={(e) => setForm((p) => ({ ...p, cep: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>Cidade</label>
          <input
            value={form.city}
            onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>UF</label>
          <input
            value={form.state}
            onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
            style={fieldStyle()}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle()}>Endereço</label>
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            style={fieldStyle()}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{
            border: `1px solid ${C.blue}`,
            background:
              'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
            color: '#93c5fd',
            padding: '10px 16px',
            borderRadius: 10,
            fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Salvando...' : 'Salvar empresa'}
        </button>
      </div>
    </section>
  )
}