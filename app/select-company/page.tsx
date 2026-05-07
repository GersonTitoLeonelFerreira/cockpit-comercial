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

export default function SelectCompanyPage() {
  const router = useRouter()

  const [loading, setLoading] = React.useState(true)
  const [submittingCompanyId, setSubmittingCompanyId] = React.useState<string | null>(null)
  const [companies, setCompanies] = React.useState<CompanyOption[]>([])
  const [userLabel, setUserLabel] = React.useState<string>('Usuário')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

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
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 30%), linear-gradient(180deg, #090b0f 0%, #06080c 100%)',
        color: DS.textPrimary,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 860,
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
            maxWidth: 640,
          }}
        >
          {userLabel}, seu e-mail possui acesso a mais de uma operação. Selecione
          o contexto correto para carregar dashboard, Pool, Kanban, relatórios e permissões.
        </p>

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
            marginTop: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {loading ? (
            <div
              style={{
                borderRadius: 18,
                border: `1px solid ${DS.borderSubtle}`,
                background: 'rgba(9,11,15,0.72)',
                padding: 18,
                color: DS.textSecondary,
                fontSize: 14,
              }}
            >
              Carregando empresas...
            </div>
          ) : (
            companies.map((company) => {
              const submitting = submittingCompanyId === company.company_id

              return (
                <button
                  key={company.company_id}
                  type="button"
                  onClick={() => void selectCompany(company.company_id)}
                  disabled={Boolean(submittingCompanyId)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 20,
                    border: `1px solid ${DS.border}`,
                    background: submitting
                      ? 'rgba(59,130,246,0.14)'
                      : 'rgba(9,11,15,0.72)',
                    padding: 18,
                    cursor: submittingCompanyId ? 'not-allowed' : 'pointer',
                    boxShadow: submitting
                      ? '0 14px 34px rgba(37,99,235,0.18)'
                      : 'none',
                  }}
                >
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 850,
                      color: DS.textPrimary,
                      lineHeight: 1.25,
                    }}
                  >
                    {company.display_name}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
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
                      marginTop: 12,
                      color: DS.textMuted,
                      fontSize: 12,
                      lineHeight: 1.5,
                      wordBreak: 'break-all',
                    }}
                  >
                    ID: {company.company_id}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      color: submitting ? DS.blueSoft : DS.textSecondary,
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    {submitting ? 'Selecionando...' : 'Acessar esta empresa'}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}