'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

type CompanyStatusControlProps = {
  companyId: string
  companyName: string
  platformStatus: string
}

const C = {
  border: '#1a1d2e',
  panel: '#0d0f14',
  panelSoft: '#111318',
  text: '#edf2f7',
  textSoft: '#8fa3bc',
  textMuted: '#546070',
  green: '#22c55e',
  red: '#ef4444',
} as const

export default function CompanyStatusControl({
  companyId,
  companyName,
  platformStatus,
}: CompanyStatusControlProps) {
  const router = useRouter()

  const [confirming, setConfirming] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isBlocked = platformStatus === 'blocked'
  const canToggle = platformStatus === 'active' || platformStatus === 'blocked'
  const nextStatus = isBlocked ? 'active' : 'blocked'
  const actionLabel = isBlocked ? 'Reativar empresa' : 'Inativar empresa'

  async function handleChangeStatus() {
    if (!canToggle || loading) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/platform-admin/companies/${companyId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform_status: nextStatus,
          }),
        },
      )

      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }

      if (!response.ok || json.ok !== true) {
        throw new Error(
          json.error || 'Não foi possível alterar o status da empresa.',
        )
      }

      setConfirming(false)
      router.refresh()
    } catch (changeError: unknown) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : 'Erro inesperado ao alterar o status da empresa.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (!canToggle) {
    return (
      <section
        style={{
          marginTop: 18,
          border: `1px solid ${C.border}`,
          background: C.panel,
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ color: C.text, fontSize: 16, fontWeight: 900 }}>
          Controle de acesso indisponível
        </div>

        <div
          style={{
            marginTop: 6,
            color: C.textSoft,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Esta empresa está com status <strong>{platformStatus}</strong>. O
          controle direto nesta tela é permitido apenas para empresas ativas ou
          inativas.
        </div>
      </section>
    )
  }

  return (
    <section
      style={{
        marginTop: 18,
        border: isBlocked
          ? '1px solid rgba(239,68,68,0.30)'
          : '1px solid rgba(34,197,94,0.28)',
        background: isBlocked
          ? 'rgba(239,68,68,0.08)'
          : 'rgba(34,197,94,0.07)',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div
            style={{
              color: isBlocked ? '#fecaca' : '#86efac',
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            {isBlocked ? 'Empresa inativa' : 'Empresa ativa'}
          </div>

          <div
            style={{
              marginTop: 6,
              color: C.textSoft,
              fontSize: 13,
              lineHeight: 1.6,
              maxWidth: 760,
            }}
          >
            {isBlocked
              ? 'Ao reativar, os acessos que existiam antes da inativação serão restaurados.'
              : 'Ao inativar, admins, gestores e vendedores perdem acesso a esta empresa. Os dados comerciais permanecem preservados.'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
          disabled={loading}
          style={{
            border: `1px solid ${isBlocked ? C.green : C.red}`,
            background: isBlocked
              ? 'rgba(34,197,94,0.12)'
              : 'rgba(239,68,68,0.12)',
            color: isBlocked ? '#86efac' : '#fecaca',
            borderRadius: 10,
            padding: '10px 13px',
            fontWeight: 900,
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1,
          }}
        >
          {actionLabel}
        </button>
      </div>

      {confirming ? (
        <div
          style={{
            marginTop: 14,
            border: `1px solid ${C.border}`,
            background: C.panelSoft,
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>
            Confirmar {isBlocked ? 'reativação' : 'inativação'} de{' '}
            {companyName}?
          </div>

          <div
            style={{
              marginTop: 6,
              color: C.textSoft,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {isBlocked
              ? 'Os usuários voltarão a ter apenas os acessos que possuíam antes do bloqueio.'
              : 'A operação da empresa será interrompida imediatamente para todos os usuários vinculados.'}
          </div>

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => void handleChangeStatus()}
              disabled={loading}
              style={{
                border: `1px solid ${isBlocked ? C.green : C.red}`,
                background: isBlocked
                  ? 'rgba(34,197,94,0.16)'
                  : 'rgba(239,68,68,0.16)',
                color: isBlocked ? '#86efac' : '#fecaca',
                borderRadius: 10,
                padding: '9px 12px',
                fontWeight: 900,
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.65 : 1,
              }}
            >
              {loading
                ? 'Processando...'
                : isBlocked
                  ? 'Confirmar reativação'
                  : 'Confirmar inativação'}
            </button>

            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              style={{
                border: `1px solid ${C.border}`,
                background: C.panel,
                color: C.textSoft,
                borderRadius: 10,
                padding: '9px 12px',
                fontWeight: 800,
                fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 14,
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
    </section>
  )
}