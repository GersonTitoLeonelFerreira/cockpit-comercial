'use client'

import * as React from 'react'
import Link from 'next/link'

type PessoaTipo = 'fisica' | 'juridica' | 'estrangeiro'
type Role = 'member' | 'manager' | 'admin'

type SellerGetResponse = {
  ok: true
  profile: {
    id: string
    role: Role | string | null
    full_name: string | null
    email: string | null
    phone: string | null
    job_title: string | null
    status: string | null
    username: string | null
    cpf: string | null
    birth_date: string | null
    is_active: boolean | null
    created_at: string | null
  }
  details: null | {
    profile_id: string
    tipo_pessoa: PessoaTipo
    legal_name: string
    birth_date: string
    cpf: string
    nacionalidade: string | null
    naturalidade: string | null
    rg: string | null
    orgao_emissor: string | null
    estado_emissao: string | null
    sexo_biologico: string | null
    genero: string | null
    estado_civil: string | null
    profissao: string | null
    grau_instrucao: string | null
    contato_emergencia: string | null
    telefone_emergencia: string | null
    pais: string | null
    estado: string | null
    cidade: string | null
    logradouro: string | null
    numero: string | null
    cep?: string | null
    web_page: string | null
  }
}

type ApiErrorResponse = {
  error?: string
}

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

function normalizeRole(value: Role | string | null): Role {
  if (value === 'manager' || value === 'admin' || value === 'member') {
    return value
  }

  return 'member'
}

function roleLabel(role: Role) {
  if (role === 'admin') {
    return 'Administrador'
  }

  if (role === 'manager') {
    return 'Gerente'
  }

  return 'Vendedor'
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

function StatusBadge({
  active,
}: {
  active: boolean
}) {
  return (
    <span
      style={{
        background: active
          ? 'rgba(34,197,94,0.09)'
          : 'rgba(239,68,68,0.09)',
        border: `1px solid ${
          active
            ? 'rgba(134,239,172,0.18)'
            : 'rgba(252,165,165,0.18)'
        }`,
        borderRadius: 999,
        color: active ? DS.greenSoft : DS.redSoft,
        display: 'inline-flex',
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: '0.04em',
        padding: '5px 9px',
        textTransform: 'uppercase',
      }}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

export default function SellerEditClient({
  sellerId,
}: {
  sellerId: string
}) {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] =
    React.useState<string | null>(null)

  const [data, setData] =
    React.useState<SellerGetResponse | null>(null)

  const [fullName, setFullName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [jobTitle, setJobTitle] = React.useState('')
  const [role, setRole] = React.useState<Role>('member')
  const [isActive, setIsActive] = React.useState(true)

  const [legalName, setLegalName] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')

  const [initTipoPessoa, setInitTipoPessoa] =
    React.useState<PessoaTipo>('fisica')

  const [initCpf, setInitCpf] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/sellers/${sellerId}`, {
        method: 'GET',
      })

      const json = (await response
        .json()
        .catch(() => ({}))) as SellerGetResponse & ApiErrorResponse

      if (!response.ok) {
        throw new Error(
          json.error || `Erro ao carregar vendedor. HTTP ${response.status}`,
        )
      }

      const payload = json as SellerGetResponse

      setData(payload)
      setFullName(payload.profile.full_name ?? '')
      setPhone(payload.profile.phone ?? '')
      setJobTitle(payload.profile.job_title ?? '')
      setRole(normalizeRole(payload.profile.role))
      setIsActive(Boolean(payload.profile.is_active))

      setLegalName(
        payload.details?.legal_name ?? payload.profile.full_name ?? '',
      )

      setBirthDate(
        payload.details?.birth_date ?? payload.profile.birth_date ?? '',
      )

      setInitCpf(payload.profile.cpf ?? '')
      setInitTipoPessoa('fisica')
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Erro ao carregar vendedor.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [sellerId])

  React.useEffect(() => {
    void load()
  }, [load])

  const detailsExists = Boolean(data?.details)

  const email = data?.profile.email ?? ''

  const lockedTipoPessoa =
    data?.details?.tipo_pessoa ?? initTipoPessoa

  const lockedCpf =
    data?.details?.cpf ?? data?.profile.cpf ?? initCpf

  async function save() {
    setError(null)
    setSuccessMessage(null)

    if (!fullName.trim()) {
      setError('Nome é obrigatório.')
      return
    }

    if (!legalName.trim()) {
      setError('Nome de registro é obrigatório.')
      return
    }

    if (!birthDate) {
      setError('Data de nascimento é obrigatória.')
      return
    }

    if (!detailsExists) {
      if (!initTipoPessoa) {
        setError('Tipo de pessoa é obrigatório para completar o cadastro.')
        return
      }

      if (!onlyDigits(initCpf)) {
        setError('CPF é obrigatório para completar o cadastro.')
        return
      }
    }

    setSaving(true)

    try {
      const body: Record<string, unknown> = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        job_title: jobTitle.trim(),
        role,
        is_active: isActive,
        legal_name: legalName.trim(),
        birth_date: birthDate,
      }

      if (!detailsExists) {
        body.tipo_pessoa = initTipoPessoa
        body.cpf = onlyDigits(initCpf)
      }

      const response = await fetch(`/api/admin/sellers/${sellerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const json = (await response
        .json()
        .catch(() => ({}))) as ApiErrorResponse

      if (!response.ok) {
        throw new Error(
          json.error || `Erro ao salvar alterações. HTTP ${response.status}`,
        )
      }

      await load()

      setSuccessMessage('Dados do vendedor atualizados com sucesso.')
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Erro ao salvar alterações.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100%',
          padding: '40px 24px',
        }}
      >
        Carregando cadastro do vendedor...
      </div>
    )
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

        <header
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 8,
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
                {fullName || 'Editar Vendedor'}
              </h1>

              <StatusBadge active={isActive} />
            </div>

            <p
              style={{
                color: DS.textSecondary,
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {email || 'E-mail não informado'}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radius,
                color: DS.textSecondary,
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 800,
                height: 38,
                opacity: loading || saving ? 0.55 : 1,
                padding: '0 13px',
              }}
            >
              Atualizar
            </button>

            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving}
              style={{
                background: '#166534',
                border: '1px solid rgba(134,239,172,0.22)',
                borderRadius: DS.radius,
                color: '#f0fdf4',
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 850,
                height: 38,
                opacity: loading || saving ? 0.55 : 1,
                padding: '0 14px',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </header>

        {error ? (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div
            style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(134,239,172,0.18)',
              borderRadius: DS.radius,
              color: DS.greenSoft,
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 20,
              padding: '12px 14px',
            }}
          >
            {successMessage}
          </div>
        ) : null}

        {!detailsExists && !loading ? (
          <section
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(254,243,199,0.18)',
              borderRadius: DS.radiusContainer,
              marginBottom: 20,
              padding: '18px 20px',
            }}
          >
            <div
              style={{
                color: DS.yellowSoft,
                fontSize: 12,
                fontWeight: 850,
                marginBottom: 7,
              }}
            >
              CADASTRO HISTÓRICO INCOMPLETO
            </div>

            <p
              style={{
                color: DS.textSecondary,
                fontSize: 13,
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              Este vendedor foi cadastrado antes da estrutura atual. Complete
              Tipo de Pessoa e CPF para consolidar o cadastro. Após salvar,
              esses dados ficarão travados.
            </p>

            <div
              style={{
                display: 'grid',
                gap: 14,
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(240px, 1fr))',
                marginTop: 16,
              }}
            >
              <Field label="Tipo de Pessoa *">
                <select
                  value={initTipoPessoa}
                  onChange={(event) =>
                    setInitTipoPessoa(event.target.value as PessoaTipo)
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
                  value={initCpf}
                  onChange={(event) => setInitCpf(event.target.value)}
                  inputMode="numeric"
                  placeholder="Somente números"
                  style={inputStyle}
                />
              </Field>
            </div>
          </section>
        ) : null}

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
                Dados pessoais e informações internas do vendedor.
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
              E-MAIL DE LOGIN NÃO É EDITÁVEL
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 14,
              gridTemplateColumns:
                'repeat(auto-fit, minmax(250px, 1fr))',
            }}
          >
            <Field label="Tipo de Pessoa">
              <select
                disabled
                value={lockedTipoPessoa}
                onChange={() => undefined}
                style={{
                  ...inputStyle,
                  color: DS.textSecondary,
                  cursor: 'not-allowed',
                  opacity: 0.7,
                }}
              >
                <option value="fisica">Pessoa física</option>
                <option value="juridica">Pessoa jurídica</option>
                <option value="estrangeiro">Estrangeiro</option>
              </select>
            </Field>

            <Field label="CPF">
              <input
                disabled
                value={lockedCpf}
                onChange={() => undefined}
                style={{
                  ...inputStyle,
                  color: DS.textSecondary,
                  cursor: 'not-allowed',
                  opacity: 0.7,
                }}
              />
            </Field>

            <Field label="Nome de Uso *">
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Nome de Registro *">
              <input
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
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
                style={inputStyle}
              />
            </Field>

            <Field label="Cargo Interno">
              <input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Ex.: Consultor comercial"
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
                Acesso e Permissão
              </h2>

              <p
                style={{
                  color: DS.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.5,
                  margin: '6px 0 0',
                }}
              >
                Controle o perfil de acesso e o status operacional do vendedor.
              </p>
            </div>

            <StatusBadge active={isActive} />
          </div>

          <div
            style={{
              display: 'grid',
              gap: 14,
              gridTemplateColumns:
                'repeat(auto-fit, minmax(250px, 1fr))',
            }}
          >
            <Field label="E-mail de Login">
              <input
                disabled
                value={email}
                onChange={() => undefined}
                style={{
                  ...inputStyle,
                  color: DS.textSecondary,
                  cursor: 'not-allowed',
                  opacity: 0.7,
                }}
              />
            </Field>

            <Field label="Status">
              <select
                value={isActive ? 'active' : 'inactive'}
                onChange={(event) =>
                  setIsActive(event.target.value === 'active')
                }
                style={inputStyle}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
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

          <div
            style={{
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radius,
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.65,
              marginTop: 18,
              padding: '12px 13px',
            }}
          >
            Perfil atual: <strong style={{ color: DS.textPrimary }}>{roleLabel(role)}</strong>.
            {' '}Desativar o vendedor remove o acesso à empresa ativa, sem apagar
            histórico, carteira ou resultados já registrados.
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
            Critério de gestão
          </div>

          <div
            style={{
              color: DS.textSecondary,
              fontSize: 12,
              lineHeight: 1.65,
            }}
          >
            Tipo de Pessoa e CPF são dados de identificação travados após a
            criação. Nome, telefone, cargo, status e permissão podem ser
            atualizados conforme a necessidade da operação.
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 16,
            }}
          >
            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving}
              style={{
                background: '#166534',
                border: '1px solid rgba(134,239,172,0.22)',
                borderRadius: DS.radius,
                color: '#f0fdf4',
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 850,
                height: 40,
                opacity: loading || saving ? 0.55 : 1,
                padding: '0 17px',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}