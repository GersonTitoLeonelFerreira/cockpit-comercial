'use client'

import * as React from 'react'

const C = {
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  green: '#22c55e',
} as const

type CompanyData = {
  settings?: Record<string, any> | null
} | null

function normalizeSettings(settings: Record<string, any> | null | undefined) {
  return {
    goal_scope: settings?.goal_scope === 'company' ? 'company' : 'seller',
    goal_label_singular: settings?.goal_label_singular ?? 'Fechamento',
    goal_label_plural: settings?.goal_label_plural ?? 'Fechamentos',
  }
}

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

export default function CommercialRulesTab({ company }: { company: CompanyData }) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  const [form, setForm] = React.useState(normalizeSettings(company?.settings))

  React.useEffect(() => {
    setForm(normalizeSettings(company?.settings))
  }, [company?.settings])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/platform/company-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erro ao salvar regras comerciais.')

      setSuccess('Regras comerciais salvas com sucesso.')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar regras comerciais.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background:
          'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.03) 60%, #0d0f14 100%)',
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>Regras Comerciais</div>
      <div style={{ marginTop: 6, fontSize: 13, color: C.textSoft }}>
        Somente o que realmente altera comportamento do sistema.
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
          <label style={labelStyle()}>Escopo da meta</label>
          <select
            value={form.goal_scope}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                goal_scope: e.target.value === 'company' ? 'company' : 'seller',
              }))
            }
            style={fieldStyle()}
          >
            <option value="seller">Por vendedor</option>
            <option value="company">Por empresa</option>
          </select>
        </div>

        <div>
          <label style={labelStyle()}>Leitura operacional</label>
          <input
            disabled
            value={
              form.goal_scope === 'company'
                ? 'Meta consolidada na empresa'
                : 'Meta distribuída por vendedor'
            }
            style={{ ...fieldStyle(), opacity: 0.75 }}
          />
        </div>

        <div>
          <label style={labelStyle()}>Rótulo singular</label>
          <input
            value={form.goal_label_singular}
            onChange={(e) =>
              setForm((p) => ({ ...p, goal_label_singular: e.target.value }))
            }
            style={fieldStyle()}
          />
        </div>

        <div>
          <label style={labelStyle()}>Rótulo plural</label>
          <input
            value={form.goal_label_plural}
            onChange={(e) =>
              setForm((p) => ({ ...p, goal_label_plural: e.target.value }))
            }
            style={fieldStyle()}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          background: C.panelSoft,
          color: C.textSoft,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        Esta aba atualiza apenas:
        <br />
        <strong>goal_scope</strong>
        <br />
        <strong>goal_label_singular</strong>
        <br />
        <strong>goal_label_plural</strong>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{
            border: `1px solid ${C.green}`,
            background:
              'linear-gradient(90deg, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.10) 100%)',
            color: '#86efac',
            padding: '10px 16px',
            borderRadius: 10,
            fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Salvando...' : 'Salvar regras comerciais'}
        </button>
      </div>
    </section>
  )
}