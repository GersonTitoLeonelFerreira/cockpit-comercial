'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

type CompanyOption = {
  company_id: string
  company_name: string | null
  trade_name: string | null
  legal_name: string | null
  display_name: string
  role: 'admin' | 'manager' | 'member'
  is_active: boolean
}

type MeResponse =
  | {
      ok: true
      full_name: string | null
      email: string | null
      companies: CompanyOption[]
      companies_count: number
      active_company_id: string | null
      requires_company_selection: boolean
    }
  | { error: string }

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  red: '#ef4444',
} as const

function roleLabel(role: CompanyOption['role']) {
  if (role === 'admin') return 'Administrador'
  if (role === 'manager') return 'Gestor'
  return 'Membro'
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function SelectCompanyPage() {
  const router = useRouter()

  const [loading, setLoading] = React.useState(true)
  const [submittingCompanyId, setSubmittingCompanyId] = React.useState<string | null>(null)
  const [companies, setCompanies] = React.useState<CompanyOption[]>([])
  const [userLabel, setUserLabel] = React.useState<string>('Usuário')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')

  const filteredCompanies = React.useMemo(() => {
    const query = normalizeSearch(search)

    if (!query) return companies

    return companies.filter((company) => {
      const haystack = normalizeSearch(
        [
          company.display_name,
          company.company_name,
          company.trade_name,
          company.legal_name,
          company.company_id,
          roleLabel(company.role),
        ]
          .filter(Boolean)
          .join(' '),
      )

      return haystack.includes(query)
    })
  }, [companies, search])

  React.useEffect(() => {
    let active = true

    async function loadSession() {
      try {
        const res = await fetch('/api/me', { method: 'GET', cache: 'no-store' })
        const json = (await res.json()) as MeResponse

        if (!active) return

        if (!res.ok || !('ok' in json) || !json.ok) {
          router.replace('/login')
          return
        }

        const nextCompanies = json.companies ?? []

        setCompanies(nextCompanies)
        setUserLabel(json.full_name || json.email || 'Usuário')

        if (nextCompanies.length === 0) {
          setErrorMessage('Nenhuma empresa ativa foi encontrada para este usuário.')
          setLoading(false)
          return
        }

        if (nextCompanies.length === 1 && json.active_company_id) {
          router.replace('/dashboard')
          return
        }

        setLoading(false)
      } catch {
        if (!active) return
        setErrorMessage('Não foi possível carregar suas empresas.')
        setLoading(false)
      }
    }

    void loadSession()

    return () => {
      active = false
    }
  }, [router])

  async function selectCompany(companyId: string) {
    if (submittingCompanyId) return

    setErrorMessage(null)
    setSubmittingCompanyId(companyId)

    try {
      const res = await fetch('/api/session/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })

      const json = (await res.json()) as { ok?: boolean; error?: string }

      if (!res.ok || !json.ok) {
        setErrorMessage(json.error || 'Não foi possível selecionar a empresa.')
        setSubmittingCompanyId(null)
        return
      }

      router.replace('/dashboard')
      router.refresh()
    } catch {
      setErrorMessage('Erro inesperado ao selecionar empresa.')
      setSubmittingCompanyId(null)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        maxHeight: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 30%), linear-gradient(180deg, #090b0f 0%, #06080c 100%)',
        color: DS.textPrimary,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '36px 24px',
        boxSizing: 'border-box',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 980,
          borderRadius: 28,
          border: `1px solid ${DS.border}`,
          background:
            'linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
          padding: 28,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid rgba(59,130,246,0.24)',
            background: 'rgba(59,130,246,0.10)',
            color: DS.blueSoft,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Contexto da operação
        </div>

        <h1
          style={{
            margin: '18px 0 0',
            fontSize: 34,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: '-0.04em',
          }}
        >
          Escolha a empresa que deseja acessar
        </h1>

        <p
          style={{
            margin: '12px 0 0',
            color: DS.textSecondary,
            fontSize: 15,
            lineHeight: 1.7,
            maxWidth: 720,
          }}
        >
          {userLabel}, selecione o contexto correto para carregar dashboard, Pool, Kanban,
          relatórios e permissões.
        </p>

        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar empresa por nome, razão social, ID ou papel..."
            autoFocus
            style={{
              width: '100%',
              border: `1px solid ${DS.border}`,
              background: '#0b0d12',
              color: DS.textPrimary,
              borderRadius: 14,
              padding: '13px 14px',
              outline: 'none',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />

          <div
            style={{
              border: `1px solid ${DS.border}`,
              background: DS.surfaceBg,
              color: DS.textSecondary,
              borderRadius: 14,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {filteredCompanies.length}/{companies.length} empresas
          </div>
        </div>

        {errorMessage ? (
          <div
            style={{
              marginTop: 20,
              borderRadius: 14,
              border: '1px solid rgba(239,68,68,0.22)',
              background: 'rgba(239,68,68,0.10)',
              color: '#fecaca',
              padding: '12px 14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 20,
            border: `1px solid ${DS.borderSubtle}`,
            borderRadius: 18,
            background: 'rgba(9,11,15,0.56)',
            overflow: 'hidden',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 18,
                color: DS.textSecondary,
                fontSize: 14,
              }}
            >
              Carregando empresas...
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div
              style={{
                padding: 18,
                color: DS.textSecondary,
                fontSize: 14,
              }}
            >
              Nenhuma empresa encontrada para a busca informada.
            </div>
          ) : (
            <div
              style={{
                maxHeight: '52vh',
                overflowY: 'auto',
                display: 'grid',
              }}
            >
              {filteredCompanies.map((company) => {
                const submitting = submittingCompanyId === company.company_id

                return (
                  <button
                    key={company.company_id}
                    type="button"
                    onClick={() => void selectCompany(company.company_id)}
                    disabled={Boolean(submittingCompanyId)}
                    style={{
                      textAlign: 'left',
                      border: 0,
                      borderBottom: `1px solid ${DS.borderSubtle}`,
                      background: submitting ? 'rgba(59,130,246,0.14)' : 'transparent',
                      padding: '16px 18px',
                      cursor: submittingCompanyId ? 'not-allowed' : 'pointer',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 850,
                          color: DS.textPrimary,
                          lineHeight: 1.25,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {company.display_name}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          color: DS.textMuted,
                          fontSize: 12,
                          lineHeight: 1.5,
                          wordBreak: 'break-all',
                        }}
                      >
                        ID: {company.company_id}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: 28,
                          padding: '0 10px',
                          borderRadius: 999,
                          border: '1px solid rgba(59,130,246,0.20)',
                          background: 'rgba(59,130,246,0.08)',
                          color: DS.blueSoft,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {roleLabel(company.role)}
                      </div>

                      <div
                        style={{
                          color: submitting ? DS.blueSoft : DS.textSecondary,
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        {submitting ? 'Selecionando...' : 'Acessar'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}