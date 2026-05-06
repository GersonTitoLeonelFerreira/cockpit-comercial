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

type AcceptInviteSuccess = {
  ok: true
  user: {
    id: string
    email: string
    full_name: string
  }
  company: {
    id: string
    name: string
    onboarding_status: string
  }
}

type InviteState =
  | { status: 'loading' }
  | { status: 'valid'; data: InviteValidationSuccess }
  | { status: 'invalid'; error: string }
  | { status: 'accepted'; data: AcceptInviteSuccess }

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

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

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

function getUnknownErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function isInviteValidationSuccess(value: unknown): value is InviteValidationSuccess {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<InviteValidationSuccess>

  return candidate.ok === true && !!candidate.invitation && !!candidate.company
}

function isAcceptInviteSuccess(value: unknown): value is AcceptInviteSuccess {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<AcceptInviteSuccess>

  return candidate.ok === true && !!candidate.user && !!candidate.company
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 13px',
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: '#0b0d12',
    color: C.text,
    outline: 'none',
    fontSize: 14,
  }
}

function labelStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: 6,
    color: C.textSoft,
    fontSize: 13,
    fontWeight: 800,
  }
}

export default function InviteAdminActivationClient({ token }: { token: string }) {
  const [state, setState] = React.useState<InviteState>({ status: 'loading' })

  const [fullName, setFullName] = React.useState('')
  const [cpf, setCpf] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

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
        setFullName(json.invitation.full_name ?? '')
      } catch (error: unknown) {
        if (!active) return

        setState({
          status: 'invalid',
          error: getUnknownErrorMessage(error, 'Falha ao validar convite.'),
        })
      }
    }

    void validateInvite()

    return () => {
      active = false
    }
  }, [token])

  async function handleActivation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting || state.status !== 'valid') return

    const fullNameNormalized = fullName.trim()
    const cpfDigits = onlyDigits(cpf)
    const phoneDigits = onlyDigits(phone)

    if (!fullNameNormalized) {
      setSubmitError('Informe seu nome completo.')
      return
    }

    if (cpfDigits.length !== 11) {
      setSubmitError('Informe um CPF válido com 11 dígitos.')
      return
    }

    if (!birthDate) {
      setSubmitError('Informe sua data de nascimento.')
      return
    }

    if (!password || password.length < 6) {
      setSubmitError('A senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setSubmitError('A confirmação de senha não confere.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch(`/api/invitations/admin/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullNameNormalized,
          cpf: cpfDigits,
          birth_date: birthDate,
          phone: phoneDigits || null,
          password,
        }),
      })

      const json: unknown = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(getErrorMessage(json))
      }

      if (!isAcceptInviteSuccess(json)) {
        throw new Error('Resposta inválida da API de ativação.')
      }

      setState({ status: 'accepted', data: json })
      setPassword('')
      setConfirmPassword('')
    } catch (error: unknown) {
      setSubmitError(getUnknownErrorMessage(error, 'Falha ao ativar conta.'))
    } finally {
      setSubmitting(false)
    }
  }

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
          maxWidth: 760,
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
          Valide seu convite e crie a primeira conta administrativa da empresa.
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

        {state.status === 'accepted' ? (
          <div
            style={{
              marginTop: 22,
              border: '1px solid rgba(34,197,94,0.28)',
              background: 'rgba(34,197,94,0.10)',
              borderRadius: 16,
              padding: 18,
              color: '#bbf7d0',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            <strong>Conta ativada com sucesso.</strong>

            <div style={{ marginTop: 8, color: C.textSoft }}>
              Sua conta administrativa foi criada para a empresa{' '}
              <strong style={{ color: C.text }}>{state.data.company.name}</strong>.
            </div>

            <div style={{ marginTop: 16 }}>
              <Link
                href="/login"
                style={{
                  display: 'inline-flex',
                  border: `1px solid ${C.green}`,
                  background:
                    'linear-gradient(90deg, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.10) 100%)',
                  color: '#86efac',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontWeight: 950,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                Entrar no sistema
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

            <form onSubmit={handleActivation} style={{ display: 'grid', gap: 14 }}>
              <div
                style={{
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900 }}>Dados de ativação</div>

                <div style={{ marginTop: 6, color: C.textMuted, fontSize: 12 }}>
                  Preencha os dados mínimos para ativar sua conta administrativa.
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                  }}
                >
                  <label style={labelStyle()}>
                    Nome completo *
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    CPF *
                    <input
                      value={cpf}
                      onChange={(event) => setCpf(event.target.value)}
                      placeholder="000.000.000-00"
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Data de nascimento *
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(event) => setBirthDate(event.target.value)}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Telefone
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="(00) 00000-0000"
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Senha *
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Confirmar senha *
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      style={inputStyle()}
                    />
                  </label>
                </div>
              </div>

              {submitError ? (
                <div
                  style={{
                    border: '1px solid rgba(239,68,68,0.28)',
                    background: 'rgba(239,68,68,0.10)',
                    borderRadius: 14,
                    padding: 14,
                    color: '#fecaca',
                    fontSize: 13,
                  }}
                >
                  {submitError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: 'fit-content',
                  border: `1px solid ${C.green}`,
                  background:
                    'linear-gradient(90deg, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.10) 100%)',
                  color: '#86efac',
                  padding: '11px 15px',
                  borderRadius: 12,
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.65 : 1,
                }}
              >
                {submitting ? 'Ativando conta...' : 'Ativar conta'}
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  )
}