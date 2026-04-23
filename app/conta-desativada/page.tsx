'use client'

import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.28)',
  redText: '#fca5a5',
}

export default function ContaDesativadaPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleRetry() {
    router.push('/dashboard')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0) 32%), radial-gradient(circle at bottom right, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0) 28%), linear-gradient(180deg, #090b0f 0%, #07090d 100%)',
        color: DS.textPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 24,
          border: `1px solid ${DS.border}`,
          background: 'linear-gradient(180deg, rgba(17,19,24,0.98) 0%, rgba(13,15,20,0.98) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 24px 80px rgba(0,0,0,0.34)',
          padding: 32,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, transparent 42%)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 30,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid rgba(239,68,68,0.22)',
              background: 'rgba(239,68,68,0.10)',
              color: DS.redText,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Acesso bloqueado
          </div>

          <div
            style={{
              marginTop: 18,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 999,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 8px rgba(239,68,68,0.04)',
              }}
            >
              <svg
                width="38"
                height="38"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: DS.redText }}
              >
                <path
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              textAlign: 'center',
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 34,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: DS.textPrimary,
              }}
            >
              Conta desativada
            </h1>

            <p
              style={{
                marginTop: 14,
                marginBottom: 0,
                fontSize: 15,
                lineHeight: 1.75,
                color: DS.textSecondary,
                maxWidth: 430,
                marginInline: 'auto',
              }}
            >
              Sua conta foi desativada pelo administrador da empresa. Entre em contato com o responsável para reativar
              seu acesso ao sistema.
            </p>
          </div>

          <div
            style={{
              marginTop: 26,
              display: 'grid',
              gap: 12,
            }}
          >
            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${DS.border}`,
                background: 'rgba(9,11,15,0.58)',
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: DS.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                O que isso significa
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: DS.textSecondary,
                }}
              >
                Seu login continua identificado, mas seu acesso operacional está bloqueado até nova liberação.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: 4,
              }}
            >
              <button
                onClick={handleRetry}
                style={{
                  minWidth: 160,
                  minHeight: 48,
                  borderRadius: 12,
                  border: `1px solid ${DS.border}`,
                  background: 'rgba(17,19,24,0.84)',
                  color: DS.textPrimary,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>

              <button
                onClick={handleSignOut}
                style={{
                  minWidth: 120,
                  minHeight: 48,
                  borderRadius: 12,
                  border: '1px solid rgba(239,68,68,0.28)',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 12px 28px rgba(185,28,28,0.28)',
                }}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}