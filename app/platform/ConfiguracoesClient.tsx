'use client'

import * as React from 'react'

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
  profile: { full_name?: string | null; role?: string | null; company_id?: string | null }
  company: any | null
}) {
  const isAdmin = (userRole ?? profile?.role ?? '').toLowerCase() === 'admin'

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Configurações</h1>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Logado como: <b>{userEmail}</b> • role: <b>{userRole ?? profile?.role ?? '—'}</b>
      </div>

      {!isAdmin ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #3a2222',
            background: '#160b0b',
            color: '#ffb3b3',
            fontSize: 13,
          }}
        >
          Você não tem permissão para acessar esta página.
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <section style={{ border: '1px solid #202020', background: '#0c0c0c', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Usuário</div>
            <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
              <div>
                <b>ID:</b> {userId}
              </div>
              <div>
                <b>Nome:</b> {profile?.full_name ?? '—'}
              </div>
              <div>
                <b>Company:</b> {profile?.company_id ?? '—'}
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid #202020', background: '#0c0c0c', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Empresa</div>
            {company ? (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  background: '#0f0f0f',
                  padding: 12,
                  fontSize: 12,
                  opacity: 0.95,
                }}
              >
                {JSON.stringify(company, null, 2)}
              </pre>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.8 }}>Sem dados (somente admin vê os dados da empresa).</div>
            )}
          </section>

          {/* Se você tinha a lista de usuários/roles aqui, cole o seu código antigo e eu reencaixo sem quebrar. */}
        </div>
      )}
    </div>
  )
}