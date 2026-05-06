'use client'

import * as React from 'react'
import Link from 'next/link'

type InviteValidationSuccess = {
  ok: true
  invitation: {
    id: string
    email: string
    full_name: string | null
    expires_at: string
  }
  company: {
    id: string
    name: string
    onboarding_status: string | null
  }
}

type InviteValidationError = {
  error?: string
  status?: string
}

type InviteState =
  | { status: 'loading' }
  | { status: 'valid'; data: InviteValidationSuccess }
  | { status: 'invalid'; error: string }

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
  amber: '#f59e0b',
  red: '#ef4444',
} as const

function formatDateBR(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function getErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return 'Convite inválido ou indisponível.'
  }

  const candidate = value as InviteValidationError

  return candidate.error || 'Convite inválido ou indisponível.'
}

function isInviteValidationSuccess(value: unknown): value is InviteValidationSuccess {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<InviteValidationSuccess>

  return candidate.ok === true && !!candidate.invitation && !!candidate.company
}

export default function InviteAdminActivationClient({ token }: { token: string }) {
  const [state, setState] = React.useState<InviteState>({ status: 'loading' })

  React.useEffect(() => {
    let active = true

    async function validateInvite() {
      try {
        const res = await fetch(`/api/invitations/admin/${token}`, {
          method: 'GET',
          cache: 'no-store',
        })

        const json: unknown = await res.json().catch(() => ({}))

        if (!active) return

        if (!res.ok) {
          setState({ status: 'invalid', error: getErrorMessage(json) })
          return
        }

        if (!isInviteValidationSuccess(json)) {
          setState({ status: 'invalid', error: 'Resposta inválida da API de convite.' })
          return
        }

        setState({ status: 'valid', data: json })
      } catch (error: unknown) {
        if (!active) return

        setState({
          status: 'invalid',
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Falha ao validar convite.',
        })
      }
    }

    void validateInvite()

    return () => {
      active = false
    }
  }, [token])

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 32%), #090b0f',
        color: C.text,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 720,
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.04) 55%, #0d0f14 100%)',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 20px 70px rgba(0,0,0,0.45)',
        }}
      >
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
            marginBottom: 16,
          }}
        >
          Convite administrativo
        </div>

        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 950, letterSpacing: '-0.04em' }}>
          Ativar conta no Cockpit Comercial
        </h1>

        <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
          Valide seu convite para ativar a primeira conta administrativa da empresa.
        </p>

        {state.status === 'loading' ? (
          <div
            style={{
              marginTop: 22,
              border: `1px solid ${C.border}`,
              background: C.panel,
              borderRadius: 16,
              padding: 18,
              color: C.textSoft,
              fontSize: 14,
            }}
          >
            Validando convite...
          </div>
        ) : null}

        {state.status === 'invalid' ? (
          <div
            style={{
              marginTop: 22,
              border: '1px solid rgba(239,68,68,0.28)',
              background: 'rgba(239,68,68,0.10)',
              borderRadius: 16,
              padding: 18,
              color: '#fecaca',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            <strong>Convite indisponível.</strong>
            <div style={{ marginTop: 6 }}>{state.error}</div>

            <div style={{ marginTop: 16 }}>
              <Link
                href="/login"
                style={{
                  color: '#93c5fd',
                  textDecoration: 'none',
                  fontWeight: 900,
                }}
              >
                Ir para o login
              </Link>
            </div>
          </div>
        ) : null}

        {state.status === 'valid' ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
            <div
              style={{
                border: '1px solid rgba(34,197,94,0.28)',
                background: 'rgba(34,197,94,0.10)',
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div style={{ color: '#86efac', fontSize: 15, fontWeight: 900 }}>
                Convite válido
              </div>

              <div style={{ marginTop: 8, color: C.textSoft, fontSize: 13, lineHeight: 1.7 }}>
                Este convite está ativo e pode ser usado para criar a primeira conta administrativa
                da empresa.
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    color: C.textMuted,
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  Empresa
                </div>

                <div style={{ marginTop: 7, color: C.text, fontSize: 16, fontWeight: 900 }}>
                  {state.data.company.name}
                </div>
              </div>

              <div
                style={{
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    color: C.textMuted,
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  E-mail convidado
                </div>

                <div style={{ marginTop: 7, color: C.text, fontSize: 16, fontWeight: 900 }}>
                  {state.data.invitation.email}
                </div>
              </div>

              <div
                style={{
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    color: C.textMuted,
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  Expira em
                </div>

                <div style={{ marginTop: 7, color: C.text, fontSize: 16, fontWeight: 900 }}>
                  {formatDateBR(state.data.invitation.expires_at)}
                </div>
              </div>
            </div>

            <div
              style={{
                border: '1px solid rgba(245,158,11,0.28)',
                background: 'rgba(245,158,11,0.08)',
                borderRadius: 16,
                padding: 16,
                color: '#fde68a',
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              A próxima etapa será ativar a conta com nome, senha e dados mínimos. Esta tela ainda
              está em modo de validação do convite.
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}