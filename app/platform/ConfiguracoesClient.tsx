'use client'

import * as React from 'react'
import MyAccountTab from './components/MyAccountTab'
import CompanyTab from './components/CompanyTab'
import UsersPermissionsTab from './components/UsersPermissionsTab'

type TabKey = 'my-account' | 'company' | 'users'

type ProfileData = {
  full_name?: string | null
  role?: string | null
  company_id?: string | null
}

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

const C = {
  panel: '#0d0f14',
  panelSoft: '#111318',
  border: '#1a1d2e',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
} as const

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 10,
    border: active ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
    background: active
      ? 'linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.06) 100%)'
      : C.panelSoft,
    color: active ? '#93c5fd' : C.textSoft,
    fontWeight: active ? 800 : 600,
    fontSize: 13,
    cursor: 'pointer',
  }
}

export default function ConfiguracoesClient({
  userId,
  userEmail,
  userRole,
  profile,
  company,
}: {
  userId: string
  userEmail: string
  userRole: string | null
  profile: ProfileData
  company: CompanyData
}) {
  const role = (userRole ?? profile?.role ?? '').toLowerCase()
  const isAdmin = role === 'admin'

  const availableTabs: Array<{ key: TabKey; label: string }> = [
    { key: 'my-account', label: 'Minha Conta' },
    ...(isAdmin ? [{ key: 'company' as TabKey, label: 'Empresa' }] : []),
    ...(isAdmin ? [{ key: 'users' as TabKey, label: 'Usuários e Permissões' }] : []),
  ]

  const [activeTab, setActiveTab] = React.useState<TabKey>('my-account')

  React.useEffect(() => {
    if (!availableTabs.find((t) => t.key === activeTab)) {
      setActiveTab('my-account')
    }
  }, [activeTab, availableTabs])

  return (
    <div style={{ maxWidth: 1240, color: C.text }}>
      <div
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.03) 60%, #0d0f14 100%)',
          borderRadius: 18,
          padding: 20,
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Configurações</h1>

        <div style={{ marginTop: 8, fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
          Aqui ficam apenas controles reais do sistema: conta, empresa e permissões.
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
          Logado como <b style={{ color: C.text }}>{userEmail}</b> • role{' '}
          <b style={{ color: C.text }}>{role || '—'}</b>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        {availableTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={tabBtn(activeTab === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {activeTab === 'my-account' && <MyAccountTab userId={userId} userEmail={userEmail} />}

        {activeTab === 'company' && isAdmin && <CompanyTab company={company} />}

        {activeTab === 'users' && isAdmin && <UsersPermissionsTab />}
      </div>
    </div>
  )
}