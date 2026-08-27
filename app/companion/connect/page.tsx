import { createHmac } from 'crypto'
import { cookies, headers } from 'next/headers'
import Link from 'next/link'

import { getAuthedSupabase } from '@/app/lib/supabase/server'

export const dynamic = 'force-dynamic'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanyMembershipRow = {
  company_id: string
  role: CompanionRole
  is_active: boolean
  companies:
    | {
        name: string | null
        trade_name: string | null
        legal_name: string | null
      }
    | {
        name: string | null
        trade_name: string | null
        legal_name: string | null
      }[]
    | null
}

type ConnectResult =
  | {
      ok: true
      whatsappUrl: string
      companyName: string
      userName: string
      expiresAt: string
    }
  | {
      ok: false
      status: string
      error: string
    }

const PRODUCTION_COMPANION_BASE_URL =
  'https://cockpit-comercial-vocn.vercel.app'

const LOCAL_COMPANION_BASE_URL =
  'http://localhost:3000'

// TEMP-TEST-ENV — alias estável do preview consolidado desta branch.
// Mantém a sessão e o backend do Companion no mesmo estado de código durante a validação real.
const TEMP_TEST_COMPANION_BASE_URL =
  'https://cockpit-comercial-vocn-git-chatgpt-companion-custo-773c3b-yolen.vercel.app'

async function getCompanionBaseUrl() {
  const headerStore =
    await headers()

  const forwardedHost =
    headerStore
      .get('x-forwarded-host')
      ?.split(',')[0]
      ?.trim()

  const host =
    forwardedHost ||
    headerStore
      .get('host')
      ?.trim() ||
    ''

  const forwardedProtocol =
    headerStore
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()

  const protocol =
    forwardedProtocol ||
    (
      host.startsWith(
        'localhost:',
      )
        ? 'http'
        : 'https'
    )

  const candidate =
    host
      ? `${protocol}://${host}`
      : ''

  if (
    candidate ===
      LOCAL_COMPANION_BASE_URL ||
    candidate ===
      PRODUCTION_COMPANION_BASE_URL ||
    candidate ===
      TEMP_TEST_COMPANION_BASE_URL
  ) {
    return candidate
  }

  return PRODUCTION_COMPANION_BASE_URL
}

function getTokenSecret() {
  const secret =
    process.env.COMPANION_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!secret) {
    throw new Error(
      'ENV faltando: COMPANION_TOKEN_SECRET, SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  return secret
}

function encodeBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getTokenSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function createCompanionToken(payload: {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}) {
  const encodedPayload = encodeBase64Url(payload)
  const signature = signPayload(encodedPayload)

  return `${encodedPayload}.${signature}`
}

function getCompanyName(membership: CompanyMembershipRow) {
  const rawCompany = Array.isArray(membership.companies)
    ? membership.companies[0] ?? null
    : membership.companies

  return (
    rawCompany?.trade_name ||
    rawCompany?.name ||
    rawCompany?.legal_name ||
    'Empresa sem nome'
  )
}

async function buildCompanionConnection(): Promise<ConnectResult> {
  try {
    const { supabase, user } =
      await getAuthedSupabase()

    const cookieStore =
      await cookies()

    const companionBaseUrl =
      await getCompanionBaseUrl()

    const activeCompanyId =
      cookieStore
        .get(
          'cockpit_active_company_id',
        )
        ?.value ??
      null

    if (!activeCompanyId) {
      return {
        ok: false,
        status: 'NO_ACTIVE_COMPANY',
        error: 'Empresa ativa não selecionada.',
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_active_global, is_platform_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return {
        ok: false,
        status: 'PROFILE_ERROR',
        error: profileError.message,
      }
    }

    if (!profile?.id || profile.is_active_global === false) {
      return {
        ok: false,
        status: 'USER_INACTIVE',
        error: 'Usuário globalmente inativo ou sem perfil válido.',
      }
    }

    const { data: membership, error: membershipError } = await supabase
      .from('company_memberships')
      .select(
        `
        company_id,
        role,
        is_active,
        companies (
          name,
          trade_name,
          legal_name
        )
      `,
      )
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle<CompanyMembershipRow>()

    if (membershipError) {
      return {
        ok: false,
        status: 'MEMBERSHIP_ERROR',
        error: membershipError.message,
      }
    }

    if (!membership?.company_id) {
      return {
        ok: false,
        status: 'NO_COMPANY_PERMISSION',
        error: 'Usuário sem vínculo ativo com a empresa selecionada.',
      }
    }

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + 60 * 60 * 6
    const companyName = getCompanyName(membership)

    const companionToken = createCompanionToken({
      sub: user.id,
      company_id: membership.company_id,
      role: membership.role,
      iat: issuedAt,
      exp: expiresAt,
    })

    const session = {
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        status: 'CONNECTED',
        companion_token: companionToken,
        expires_at: new Date(expiresAt * 1000).toISOString(),
        user: {
          id: user.id,
          full_name: profile.full_name ?? null,
          email: profile.email ?? user.email ?? null,
          is_platform_admin: profile.is_platform_admin === true,
        },
        active_company: {
          id: membership.company_id,
          name: companyName,
          role: membership.role,
          is_active: membership.is_active === true,
        },
        companion: {
          can_read_whatsapp_screen: true,
          can_create_lead_inside_extension: false,
          can_assign_pool_inside_extension: false,
          can_transfer_owner_inside_extension: false,
          can_apply_cycle_action_without_approval: false,
        },
      },
      origin:
        companionBaseUrl,
      capturedAt: new Date().toISOString(),
    }

    const encodedSession = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
    const whatsappUrl = `https://web.whatsapp.com/#yolen_companion_session=${encodeURIComponent(
      encodedSession,
    )}`

    return {
      ok: true,
      whatsappUrl,
      companyName,
      userName: profile.full_name ?? profile.email ?? user.email ?? 'Usuário Yolen',
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    }
  } catch (error) {
    return {
      ok: false,
      status: 'UNAUTHENTICATED',
      error:
        error instanceof Error && error.message
          ? error.message
          : 'Não autenticado.',
    }
  }
}

export default async function CompanionConnectPage() {
  const result = await buildCompanionConnection()

  if (!result.ok) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.logo}>Y</div>

          <h1 style={styles.title}>Companion não conectado</h1>

          <p style={styles.description}>{result.error}</p>

          <div style={styles.actions}>
            <Link href="/login" style={styles.primaryButton}>
              Fazer login na Yolen
            </Link>

            <Link href="/dashboard" style={styles.secondaryButton}>
              Voltar para a Yolen
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.logo}>Y</div>

        <p style={styles.eyebrow}>Yolen Companion</p>

        <h1 style={styles.title}>Conexão pronta</h1>

        <p style={styles.description}>
          Sua sessão do Companion foi gerada para a empresa{' '}
          <strong>{result.companyName}</strong>.
        </p>

        <div style={styles.infoBox}>
          <div>
            <span style={styles.infoLabel}>Usuário</span>
            <strong style={styles.infoValue}>{result.userName}</strong>
          </div>

          <div>
            <span style={styles.infoLabel}>Expira em</span>
            <strong style={styles.infoValue}>
              {new Date(result.expiresAt).toLocaleString('pt-BR')}
            </strong>
          </div>
        </div>

        <a href={result.whatsappUrl} style={styles.primaryButton}>
          Conectar no WhatsApp Web
        </a>

        <p style={styles.helpText}>
          Depois de abrir o WhatsApp Web, o painel da direita deve mudar para
          “Yolen conectada”.
        </p>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.setTimeout(function () {
                window.location.href = ${JSON.stringify(result.whatsappUrl)};
              }, 1200);
            `,
          }}
        />
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background:
      'radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 30%), #070b12',
    color: '#e5edf8',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 28,
    padding: 32,
    border: '1px solid rgba(126,153,194,0.18)',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.95))',
    boxShadow: '0 28px 80px rgba(0,0,0,0.42)',
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #2563eb 0%, #0f8bff 100%)',
    marginBottom: 18,
  },
  eyebrow: {
    margin: 0,
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  title: {
    margin: '8px 0 12px',
    color: '#f8fbff',
    fontSize: 34,
    lineHeight: 1.05,
    letterSpacing: '-0.04em',
  },
  description: {
    margin: 0,
    color: '#a8b6ca',
    fontSize: 15,
    lineHeight: 1.6,
  },
  infoBox: {
    display: 'grid',
    gap: 12,
    margin: '22px 0',
    padding: 16,
    borderRadius: 18,
    background: 'rgba(2,6,23,0.62)',
    border: '1px solid rgba(126,153,194,0.14)',
  },
  infoLabel: {
    display: 'block',
    color: '#8ea0b8',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    display: 'block',
    color: '#f8fbff',
    fontSize: 14,
  },
  actions: {
    display: 'grid',
    gap: 10,
    marginTop: 22,
  },
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    color: '#fff',
    background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
    fontSize: 14,
    fontWeight: 900,
    textDecoration: 'none',
    border: 0,
  },
  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    color: '#dce8fb',
    background: 'rgba(15,23,42,0.85)',
    fontSize: 14,
    fontWeight: 900,
    textDecoration: 'none',
    border: '1px solid rgba(126,153,194,0.18)',
  },
  helpText: {
    margin: '16px 0 0',
    color: '#8ea0b8',
    fontSize: 12,
    lineHeight: 1.5,
  },
}