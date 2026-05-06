import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

export const metadata = {
  title: 'Administração da Plataforma | Cockpit Comercial',
}

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
} as const

function cardStyle(): React.CSSProperties {
  return {
    border: `1px solid ${C.border}`,
    background:
      'linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0.03) 60%, #0d0f14 100%)',
    borderRadius: 16,
    padding: 18,
    minHeight: 140,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  }
}

function disabledActionStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'fit-content',
    border: `1px solid ${C.border}`,
    background: '#111318',
    color: C.textMuted,
    padding: '9px 12px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 12,
  }
}

export default async function PlatformAdminPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Server component de leitura.
        },
      },
    },
  )

  const { data: auth } = await supabase.auth.getUser()

  if (!auth?.user?.id) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, email, role, is_active, is_platform_admin')
    .eq('id', auth.user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login')
  }

  if (profile.is_active === false) {
    redirect('/login')
  }

  if (profile.is_platform_admin !== true) {
    redirect('/leads')
  }

  return (
    <main
      style={{
        minHeight: '100%',
        background: C.page,
        color: C.text,
      }}
    >
      <section
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(34,197,94,0.13) 0%, rgba(59,130,246,0.07) 45%, #0d0f14 100%)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 2px 18px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ maxWidth: 920 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid rgba(34,197,94,0.28)',
              background: 'rgba(34,197,94,0.10)',
              color: '#86efac',
              borderRadius: 999,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 900,
              marginBottom: 14,
            }}
          >
            Administração da Plataforma
          </div>

          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 950, letterSpacing: '-0.04em' }}>
            Cockpit da Plataforma
          </h1>

          <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
            Área reservada para governar empresas, solicitações de demonstração, convites do
            primeiro administrador e administração global do SaaS.
          </p>

          <div style={{ marginTop: 14, color: C.textMuted, fontSize: 12 }}>
            Logado como{' '}
            <strong style={{ color: C.text }}>
              {profile.full_name || profile.email || auth.user.email}
            </strong>{' '}
            • acesso de plataforma ativo
          </div>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
          marginTop: 18,
        }}
      >
        <div style={cardStyle()}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Solicitações de demonstração</div>
            <div style={{ marginTop: 8, color: C.textSoft, fontSize: 13, lineHeight: 1.6 }}>
              Central para visualizar empresas interessadas, origem dos pedidos e status comercial.
            </div>
          </div>

          <div style={disabledActionStyle()}>Próxima etapa</div>
        </div>

        <div style={cardStyle()}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Empresas cadastradas</div>
            <div style={{ marginTop: 8, color: C.textSoft, fontSize: 13, lineHeight: 1.6 }}>
              Lista global de empresas clientes, status de implantação, plano e dados cadastrais.
            </div>
          </div>

          <div style={disabledActionStyle()}>Próxima etapa</div>
        </div>

        <div style={cardStyle()}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Nova empresa</div>
            <div style={{ marginTop: 8, color: C.textSoft, fontSize: 13, lineHeight: 1.6 }}>
              Fluxo futuro para cadastrar empresa e enviar convite ao primeiro administrador.
            </div>
          </div>

          <div style={disabledActionStyle()}>Próxima etapa</div>
        </div>

        <div style={cardStyle()}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>Admins da plataforma</div>
            <div style={{ marginTop: 8, color: C.textSoft, fontSize: 13, lineHeight: 1.6 }}>
              Controle dos usuários que podem administrar o SaaS em nível global.
            </div>
          </div>

          <div style={disabledActionStyle()}>Próxima etapa</div>
        </div>
      </section>

      <section
        style={{
          marginTop: 18,
          border: `1px solid ${C.border}`,
          background: C.panel,
          borderRadius: 16,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900 }}>Ordem correta da plataforma</div>

        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          {[
            'Dono da plataforma cria a empresa.',
            'Dono da plataforma convida o primeiro administrador.',
            'Primeiro administrador ativa a própria conta.',
            'Primeiro administrador cria usuários internos.',
            'Usuários recebem tipos de colaborador e permissões.',
          ].map((item, index) => (
            <div
              key={item}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                border: `1px solid ${C.border}`,
                background: C.panelSoft,
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: 'rgba(59,130,246,0.18)',
                  color: '#93c5fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </div>

              <div style={{ color: C.textSoft, fontSize: 13 }}>{item}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 16 }}>
        <Link
          href="/dashboard"
          style={{
            color: '#93c5fd',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          Voltar ao sistema
        </Link>
      </div>
    </main>
  )
}