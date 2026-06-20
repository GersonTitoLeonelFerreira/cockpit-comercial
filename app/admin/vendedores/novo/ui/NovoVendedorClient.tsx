'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Role = 'member' | 'manager' | 'admin'
type PessoaTipo = 'fisica' | 'juridica' | 'estrangeiro'
type ToastType = 'success' | 'error' | 'info'

const DS = {
  contentBg: '#090b0f',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',

  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',

  blueLight: '#60a5fa',
  blueSoft: '#93c5fd',

  greenSoft: '#86efac',
  yellowSoft: '#fef3c7',
  redSoft: '#fca5a5',

  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

type InviteResponse = {
  user_id?: string
  warning?: string
  error?: string
}

function cardStyle(): React.CSSProperties {
  return {
    background: DS.cardBg,
    border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusContainer,
    boxShadow: DS.shadowCard,
  }
}

const fieldLabelStyle: React.CSSProperties = {
  color: DS.textLabel,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  background: DS.surfaceBg,
  border: `1px solid ${DS.border}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  fontSize: 13,
  height: 40,
  outline: 'none',
  padding: '0 11px',
  width: '100%',
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function Toast({
  open,
  type,
  message,
  onClose,
}: {
  open: boolean
  type: ToastType
  message: string
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!open) {
      return
    }

    const timeout = window.setTimeout(onClose, 3500)

    return () => window.clearTimeout(timeout)
  }, [onClose, open])

  if (!open) {
    return null
  }

  const colors = {
    success: {
      background: 'rgba(34,197,94,0.14)',
      border: 'rgba(134,239,172,0.28)',
      color: DS.greenSoft,
      label: 'Sucesso',
    },
    error: {
      background: 'rgba(239,68,68,0.14)',
      border: 'rgba(252,165,165,0.28)',
      color: DS.redSoft,
      label: 'Erro',
    },
    info: {
      background: 'rgba(59,130,246,0.14)',
      border: 'rgba(147,197,253,0.28)',
      color: DS.blueSoft,
      label: 'Aviso',
    },
  } as const

  const style = colors[type]

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: style.background,
        border: `1px solid ${style.border}`,
        borderRadius: DS.radiusContainer,
        bottom: 22,
        boxShadow: '0 12px 35px rgba(0,0,0,0.45)',
        color: DS.textPrimary,
        maxWidth: 440,
        padding: '13px 14px',
        position: 'fixed',
        right: 22,
        width: 'calc(100% - 44px)',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          gap: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              color: style.color,
              fontSize: 10,
              fontWeight: 850,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {style.label}
          </div>

          <div
            style={{
              color: DS.textPrimary,
              fontSize: 13,
              lineHeight: 1.5,
              marginTop: 5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            background: 'transparent',
            border: 'none',
            color: DS.textSecondary,
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label
      style={{
        display: 'grid',
        gap: 5,
      }}
    >
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  )
}

export default function NovoVendedorClient() {
  const router = useRouter()

  const [tipoPessoa, setTipoPessoa] =
    React.useState<PessoaTipo>('fisica')

  const [fullName, setFullName] = React.useState('')
  const [legalName, setLegalName] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')
  const [cpf, setCpf] = React.useState('')

  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [role, setRole] = React.useState<Role>('member')
  const [password, setPassword] = React.useState('')

  const [loading, setLoading] = React.useState(false)

  const [toastOpen, setToastOpen] = React.useState(false)
  const [toastType, setToastType] =
    React.useState<ToastType>('info')

  const [toastMessage, setToastMessage] = React.useState('')

  const closeToast = React.useCallback(() => {
    setToastOpen(false)
  }, [])

  const showToast = React.useCallback(
    (type: ToastType, message: string) => {
      setToastType(type)
      setToastMessage(message)
      setToastOpen(true)
    },
    [],
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) {
      return
    }

    const emailNorm = email.trim().toLowerCase()
    const fullNameNorm = fullName.trim()
    const legalNameNorm = legalName.trim()
    const cpfNorm = onlyDigits(cpf)
    const phoneNorm = phone.trim()

    if (!emailNorm) {
      showToast('error', 'Informe o e-mail de acesso.')
      return
    }

    if (!fullNameNorm) {
      showToast('error', 'Informe o nome do vendedor.')
      return
    }

    if (!legalNameNorm) {
      showToast('error', 'Informe o nome de registro.')
      return
    }

    if (!birthDate) {
      showToast('error', 'Informe a data de nascimento.')
      return
    }

    if (!cpfNorm) {
      showToast('error', 'Informe o CPF.')
      return
    }

    if (!password || password.length < 6) {
      showToast(
        'error',
        'A senha temporária deve ter no mínimo 6 caracteres.',
      )
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/admin/sellers/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: emailNorm,
          full_name: fullNameNorm,
          role,
          password,
          details: {
            tipo_pessoa: tipoPessoa,
            legal_name: legalNameNorm,
            birth_date: birthDate,
            cpf: cpfNorm,
            phone: phoneNorm || null,
          },
        }),
      })

      const json = (await response
        .json()
        .catch(() => ({}))) as InviteResponse

      if (!response.ok) {
        throw new Error(
          json.error || `Erro ao cadastrar vendedor. HTTP ${response.status}`,
        )
      }

      if (!json.user_id) {
        throw new Error(
          'O vendedor foi criado, mas o sistema não retornou o identificador para abrir o cadastro.',
        )
      }

      showToast(
        json.warning ? 'info' : 'success',
        json.warning
          ? `Vendedor criado com aviso:\n${json.warning}`
          : 'Vendedor criado com sucesso. Informe a senha temporária para o primeiro acesso.',
      )

      window.setTimeout(() => {
        router.replace(`/admin/vendedores/${json.user_id}`)
      }, 900)
    } catch (error: unknown) {
      showToast(
        'error',
        getErrorMessage(error, 'Falha inesperada ao cadastrar vendedor.'),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100%',
        padding: '32px 24px 80px',
      }}
    >
      <Toast
        open={toastOpen}
        type={toastType}
        message={toastMessage}
        onClose={closeToast}
      />

      <div
        style={{
          margin: '0 auto',
          maxWidth: 1040,
        }}
      >
        <Link
          href="/admin/vendedores"
          style={{
            color: DS.textSecondary,
            display: 'inline-flex',
            fontSize: 13,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← Voltar para Gestão de Vendedores
        </Link>

        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 10,
              marginBottom: 7,
            }}
          >
            <span
              style={{
                color: DS.blueLight,
                fontSize: 19,
                lineHeight: 1,
              }}
            >
              ◫
            </span>

            <h1
              style={{
                fontSize: 23,
                fontWeight: 850,
                letterSpacing: '-0.015em',
                margin: 0,
              }}
            >
              Cadastrar Vendedor
            </h1>
          </div>

          <p
            style={{
              color: DS.textSecondary,
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
              maxWidth: 720,
            }}
          >
            Crie o acesso do vendedor, registre os dados obrigatórios e defina
            o nível de permissão dentro da empresa ativa.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <section
            style={{
              ...cardStyle(),
              marginBottom: 20,
              padding: '20px',
            }}
          >
            <div
              style={{
                alignItems: 'flex-start',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 850,
                    margin: 0,
                  }}
                >
                  Dados de Identificação
                </h2>

                <p
                  style={{
                    color: DS.textSecondary,
                    fontSize: 12,
                    lineHeight: 1.5,
                    margin: '6px 0 0',
                  }}
                >
                  Informações obrigatórias para criar o cadastro individual.
                </p>
              </div>

              <span
                style={{
                  background: 'rgba(59,130,246,0.09)',
                  border: '1px solid rgba(147,197,253,0.18)',
                  borderRadius: 6,
                  color: DS.blueSoft,
                  fontSize: 10,
                  fontWeight: 850,
                  padding: '6px 9px',
                }}
              >
                CAMPOS COM * SÃO OBRIGATÓRIOS
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 14,
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(260px, 1fr))',
              }}
            >
              <Field label="Tipo de Pessoa *">
                <select
                  value={tipoPessoa}
                  onChange={(event) =>
                    setTipoPessoa(event.target.value as PessoaTipo)
                  }
                  style={inputStyle}
                >
                  <option value="fisica">Pessoa física</option>
                  <option value="juridica">Pessoa jurídica</option>
                  <option value="estrangeiro">Estrangeiro</option>
                </select>
              </Field>

              <Field label="CPF *">
                <input
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  inputMode="numeric"
                  placeholder="Somente números"
                  style={inputStyle}
                />
              </Field>

              <Field label="Nome de Uso *">
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Ex.: Ana Maria Teixeira"
                  style={inputStyle}
                />
              </Field>

              <Field label="Nome de Registro *">
                <input
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  placeholder="Nome completo do documento"
                  style={inputStyle}
                />
              </Field>

              <Field label="Data de Nascimento *">
                <input
                  type="date"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                  style={{
                    ...inputStyle,
                    colorScheme: 'dark',
                  }}
                />
              </Field>

              <Field label="Telefone">
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Ex.: 47999999999"
                  inputMode="tel"
                  style={inputStyle}
                />
              </Field>
            </div>
          </section>

          <section
            style={{
              ...cardStyle(),
              marginBottom: 20,
              padding: '20px',
            }}
          >
            <div
              style={{
                alignItems: 'flex-start',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 850,
                    margin: 0,
                  }}
                >
                  Acesso ao Sistema
                </h2>

                <p
                  style={{
                    color: DS.textSecondary,
                    fontSize: 12,
                    lineHeight: 1.5,
                    margin: '6px 0 0',
                  }}
                >
                  Defina o login inicial, a senha temporária e a permissão
                  operacional do novo usuário.
                </p>
              </div>

              <span
                style={{
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(134,239,172,0.18)',
                  borderRadius: 6,
                  color: DS.greenSoft,
                  fontSize: 10,
                  fontWeight: 850,
                  padding: '6px 9px',
                }}
              >
                ACESSO SERÁ CRIADO ATIVO
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 14,
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(260px, 1fr))',
              }}
            >
              <Field label="E-mail de Login *">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@empresa.com"
                  style={inputStyle}
                />
              </Field>

              <Field label="Senha Temporária *">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  style={inputStyle}
                />
              </Field>

              <Field label="Permissão">
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as Role)
                  }
                  style={inputStyle}
                >
                  <option value="member">Vendedor</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </Field>
            </div>
          </section>

          <section
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                color: DS.blueSoft,
                fontSize: 12,
                fontWeight: 850,
                marginBottom: 7,
              }}
            >
              Critério de acesso
            </div>

            <div
              style={{
                color: DS.textSecondary,
                fontSize: 12,
                lineHeight: 1.65,
              }}
            >
              O vendedor será vinculado à empresa ativa. A senha temporária deve
              ser entregue ao usuário para o primeiro acesso ao sistema.
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 16,
              }}
            >
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: '#166534',
                  border: '1px solid rgba(134,239,172,0.22)',
                  borderRadius: DS.radius,
                  color: '#f0fdf4',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 850,
                  height: 40,
                  opacity: loading ? 0.6 : 1,
                  padding: '0 17px',
                }}
              >
                {loading ? 'Criando vendedor...' : 'Cadastrar vendedor'}
              </button>
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}