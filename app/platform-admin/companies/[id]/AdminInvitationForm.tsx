'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

type AdminInvitationFormProps = {
  companyId: string
  hasActiveAdmin: boolean
  onboardingStatus: string | null
}

type InviteSuccessResponse = {
  ok: true
  invitation: {
    id: string
    email: string
    expires_at: string
  }
  invite_url: string
}

type InviteErrorResponse = {
  error?: string
  pending_invitation?: {
    id: string
    email: string
    expires_at: string
  }
}

const C = {
  panel: '#0d0f14',
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
} as const

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function isInviteSuccessResponse(value: unknown): value is InviteSuccessResponse {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<InviteSuccessResponse>

  return candidate.ok === true && typeof candidate.invite_url === 'string'
}

function isInviteErrorResponse(value: unknown): value is InviteErrorResponse {
  return !!value && typeof value === 'object'
}

export default function AdminInvitationForm({
  companyId,
  hasActiveAdmin,
  onboardingStatus,
}: AdminInvitationFormProps) {
  const router = useRouter()

  const [email, setEmail] = React.useState('')
  const [fullName, setFullName] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<InviteSuccessResponse | null>(null)
  const [copied, setCopied] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = fullName.trim()

    if (!normalizedEmail) {
      setError('Informe o e-mail do primeiro administrador.')
      return
    }

    if (!normalizedEmail.includes('@')) {
      setError('Informe um e-mail válido.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setCopied(false)

    try {
      const res = await fetch(`/api/platform-admin/companies/${companyId}/admin-invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          full_name: normalizedName || null,
        }),
      })

      const json: unknown = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (isInviteErrorResponse(json) && json.error) {
          throw new Error(json.error)
        }

        throw new Error(`Erro ao gerar convite. HTTP ${res.status}`)
      }

      if (!isInviteSuccessResponse(json)) {
        throw new Error('Resposta inesperada da API de convite.')
      }

      setSuccess(json)
      setEmail('')
      setFullName('')
      router.refresh()
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, 'Falha inesperada ao gerar convite.'))
    } finally {
      setLoading(false)
    }
  }

  async function copyInviteUrl() {
    if (!success?.invite_url) return

    try {
      await navigator.clipboard.writeText(success.invite_url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  if (hasActiveAdmin) {
    return (
      <section
        style={{
          border: '1px solid rgba(34,197,94,0.28)',
          background: 'rgba(34,197,94,0.08)',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ color: '#86efac', fontSize: 15, fontWeight: 900 }}>
          Primeiro administrador ativo
        </div>

        <div style={{ marginTop: 6, color: C.textSoft, fontSize: 13, lineHeight: 1.6 }}>
          Esta empresa já possui pelo menos um administrador ativo. O convite inicial não é mais
          necessário.
        </div>
      </section>
    )
  }

  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background:
          'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(59,130,246,0.04) 60%, #0d0f14 100%)',
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 900 }}>
            Convite do primeiro administrador
          </div>

          <div style={{ marginTop: 6, color: C.textSoft, fontSize: 13, lineHeight: 1.6 }}>
            Gere o convite para o responsável da empresa ativar a primeira conta administrativa.
          </div>

          <div style={{ marginTop: 8, color: C.textMuted, fontSize: 12 }}>
            Onboarding atual: <strong style={{ color: C.textSoft }}>{onboardingStatus || '—'}</strong>
          </div>
        </div>

        <div
          style={{
            border: '1px solid rgba(245,158,11,0.28)',
            background: 'rgba(245,158,11,0.10)',
            color: '#fde68a',
            borderRadius: 999,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 900,
            height: 'fit-content',
          }}
        >
          Sem admin ativo
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 6, color: C.textSoft, fontSize: 13, fontWeight: 800 }}>
            E-mail do primeiro admin *
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="responsavel@empresa.com"
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: '#0b0d12',
                color: C.text,
                outline: 'none',
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6, color: C.textSoft, fontSize: 13, fontWeight: 800 }}>
            Nome do responsável
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nome opcional"
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: '#0b0d12',
                color: C.text,
                outline: 'none',
                fontSize: 13,
              }}
            />
          </label>
        </div>

        {error ? (
          <div
            style={{
              border: '1px solid rgba(239,68,68,0.28)',
              background: 'rgba(239,68,68,0.10)',
              color: '#fecaca',
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            style={{
              border: '1px solid rgba(34,197,94,0.28)',
              background: 'rgba(34,197,94,0.10)',
              color: '#bbf7d0',
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
              display: 'grid',
              gap: 10,
            }}
          >
            <div>
              <strong>Convite gerado com sucesso.</strong>
            </div>

            <div style={{ color: C.textSoft }}>
              E-mail: <strong style={{ color: C.text }}>{success.invitation.email}</strong>
            </div>

            <div
              style={{
                border: `1px solid ${C.border}`,
                background: C.panelSoft,
                borderRadius: 10,
                padding: 10,
                color: C.textSoft,
                wordBreak: 'break-all',
              }}
            >
              {success.invite_url}
            </div>

            <button
              type="button"
              onClick={copyInviteUrl}
              style={{
                width: 'fit-content',
                border: `1px solid ${C.green}`,
                background:
                  'linear-gradient(90deg, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.10) 100%)',
                color: '#86efac',
                padding: '9px 12px',
                borderRadius: 10,
                fontWeight: 900,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: 'fit-content',
            border: `1px solid ${C.blue}`,
            background:
              'linear-gradient(90deg, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.10) 100%)',
            color: '#93c5fd',
            padding: '10px 14px',
            borderRadius: 12,
            fontWeight: 950,
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? 'Gerando convite...' : 'Gerar convite'}
        </button>
      </form>
    </section>
  )
}