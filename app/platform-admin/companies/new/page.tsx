import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { CSSProperties } from 'react'

export const metadata = {
  title: 'Nova Empresa | Administração da Plataforma',
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
  red: '#ef4444',
} as const

type PageSearchParams = {
  ok?: string
  error?: string
  company_id?: string
}

function onlyDigits(value: string) {
  return (value || '').replace(/\D/g, '')
}

function enc(value: string) {
  return encodeURIComponent(value)
}

function fieldStyle(): CSSProperties {
  return {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: '#0b0d12',
    color: C.text,
    outline: 'none',
    fontSize: 13,
  }
}

function labelStyle(): CSSProperties {
  return {
    display: 'grid',
    gap: 6,
    color: C.textSoft,
    fontSize: 13,
    fontWeight: 700,
  }
}

function sectionStyle(): CSSProperties {
  return {
    border: `1px solid ${C.border}`,
    background: C.panel,
    borderRadius: 16,
    padding: 18,
  }
}

async function requirePlatformAdmin() {
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
    .select('is_active, is_platform_admin')
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

  return auth.user.id
}

export default async function PlatformAdminNewCompanyPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>
}) {
  const actorId = await requirePlatformAdmin()
  const params = (await searchParams) ?? {}

  async function createCompany(formData: FormData) {
    'use server'

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      redirect(
        `/platform-admin/companies/new?error=${enc(
          'ENV ausente: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        )}`,
      )
    }

    const admin = createClient(url!, serviceKey!)

    const legal_name = String(formData.get('legal_name') || '').trim()
    const trade_name = String(formData.get('trade_name') || '').trim()
    const cnpj = onlyDigits(String(formData.get('cnpj') || ''))
    const segment = String(formData.get('segment') || '').trim() || null
    const email = String(formData.get('email') || '').trim() || null
    const phone = onlyDigits(String(formData.get('phone') || '')) || null
    const city = String(formData.get('city') || '').trim() || null
    const state = String(formData.get('state') || '').trim().toUpperCase() || null
    const cep = onlyDigits(String(formData.get('cep') || '')) || null
    const address = String(formData.get('address') || '').trim() || null
    const plan = String(formData.get('plan') || '').trim() || 'free'

    if (!legal_name || !trade_name || !cnpj) {
      redirect(
        `/platform-admin/companies/new?error=${enc(
          'Preencha Razão social, Nome fantasia e CNPJ.',
        )}`,
      )
    }

    if (cnpj.length !== 14) {
      redirect(`/platform-admin/companies/new?error=${enc('CNPJ deve ter 14 dígitos.')}`)
    }

    const { data: existingCompany, error: existingError } = await admin
      .from('companies')
      .select('id')
      .eq('cnpj', cnpj)
      .maybeSingle()

    if (existingError) {
      redirect(
        `/platform-admin/companies/new?error=${enc(
          'Falha ao validar CNPJ existente: ' + existingError.message,
        )}`,
      )
    }

    if (existingCompany?.id) {
      redirect(
        `/platform-admin/companies/new?error=${enc(
          'Já existe uma empresa cadastrada com este CNPJ.',
        )}`,
      )
    }

    const { data: createdCompany, error: insertError } = await admin
      .from('companies')
      .insert({
        name: trade_name || legal_name,
        legal_name,
        trade_name,
        cnpj,
        segment,
        email,
        phone,
        city,
        state,
        cep,
        address,
        plan,
        platform_status: 'active',
        onboarding_status: 'admin_invite_pending',
        platform_status_updated_at: new Date().toISOString(),
        onboarding_status_updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      redirect(
        `/platform-admin/companies/new?error=${enc(
          'Falha ao criar empresa: ' + insertError.message,
        )}`,
      )
    }

    const companyId = createdCompany?.id

    if (!companyId) {
      redirect(`/platform-admin/companies/new?error=${enc('Empresa criada sem ID.')}`)
    }

    await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: actorId,
      target_user_id: null,
      event_type: 'platform_company_created',
      metadata: {
        source: 'platform_admin_companies_new',
        legal_name,
        trade_name,
        cnpj,
        platform_status: 'active',
        onboarding_status: 'admin_invite_pending',
      },
    })

    redirect(`/platform-admin/companies/new?ok=1&company_id=${enc(companyId!)}`)
  }

  const ok = params.ok === '1'
  const error = params.error ? decodeURIComponent(params.error) : null
  const companyId = params.company_id

  return (
    <main style={{ minHeight: '100%', background: C.page, color: C.text }}>
      <section
        style={{
          border: `1px solid ${C.border}`,
          background:
            'linear-gradient(135deg, rgba(34,197,94,0.13) 0%, rgba(59,130,246,0.05) 55%, #0d0f14 100%)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 2px 18px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ maxWidth: 980 }}>
          <div
            style={{
              display: 'inline-flex',
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
            Nova empresa
          </h1>

          <p style={{ margin: '10px 0 0', color: C.textSoft, fontSize: 14, lineHeight: 1.7 }}>
            Cadastre a empresa cliente na plataforma. Nesta etapa, nenhum administrador da empresa
            será criado. O convite do primeiro administrador será feito em uma próxima etapa.
          </p>
        </div>
      </section>

      {error ? (
        <section
          style={{
            marginTop: 18,
            border: '1px solid rgba(239,68,68,0.28)',
            background: 'rgba(239,68,68,0.10)',
            color: '#fecaca',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <strong>Erro:</strong> {error}
        </section>
      ) : null}

      {ok ? (
        <section
          style={{
            marginTop: 18,
            border: '1px solid rgba(34,197,94,0.28)',
            background: 'rgba(34,197,94,0.10)',
            color: '#bbf7d0',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <strong>Empresa criada com sucesso.</strong>
          <div style={{ marginTop: 6, color: C.textSoft, fontSize: 13 }}>
            ID da empresa: <code>{companyId}</code>
          </div>
          <div style={{ marginTop: 10 }}>
            <Link
              href="/platform-admin/companies"
              style={{ color: '#93c5fd', fontWeight: 800, textDecoration: 'none' }}
            >
              Ver empresas cadastradas
            </Link>
          </div>
        </section>
      ) : null}

      <form action={createCompany} style={{ display: 'grid', gap: 16, marginTop: 18 }}>
        <section style={sectionStyle()}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Dados principais</div>
          <div style={{ marginTop: 6, color: C.textMuted, fontSize: 12 }}>
            Esses dados definem a empresa cliente dentro do SaaS.
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            <label style={labelStyle()}>
              Razão social *
              <input name="legal_name" style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              Nome fantasia *
              <input name="trade_name" style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              CNPJ *
              <input name="cnpj" style={fieldStyle()} placeholder="00.000.000/0000-00" />
            </label>

            <label style={labelStyle()}>
              Segmento
              <input name="segment" style={fieldStyle()} placeholder="Ex: Academia" />
            </label>

            <label style={labelStyle()}>
              Plano
              <select name="plan" defaultValue="free" style={fieldStyle()}>
                <option value="free">free</option>
                <option value="starter">starter</option>
                <option value="pro">pro</option>
                <option value="enterprise">enterprise</option>
              </select>
            </label>
          </div>
        </section>

        <section style={sectionStyle()}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Contato e localização</div>
          <div style={{ marginTop: 6, color: C.textMuted, fontSize: 12 }}>
            Dados usados para contato, suporte e acompanhamento comercial.
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            <label style={labelStyle()}>
              E-mail da empresa
              <input name="email" type="email" style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              Telefone/WhatsApp
              <input name="phone" style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              Cidade
              <input name="city" style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              UF
              <input name="state" maxLength={2} style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              CEP
              <input name="cep" style={fieldStyle()} />
            </label>

            <label style={labelStyle()}>
              Endereço
              <input name="address" style={fieldStyle()} />
            </label>
          </div>
        </section>

        <section
          style={{
            border: '1px solid rgba(245,158,11,0.28)',
            background: 'rgba(245,158,11,0.08)',
            borderRadius: 16,
            padding: 16,
            color: '#fde68a',
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          Esta etapa cria apenas a empresa. O primeiro administrador será convidado depois, para
          ativar a própria conta de forma segura.
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="submit"
            style={{
              border: `1px solid ${C.green}`,
              background:
                'linear-gradient(90deg, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.12) 100%)',
              color: '#86efac',
              padding: '11px 15px',
              borderRadius: 12,
              fontWeight: 950,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Criar empresa
          </button>

          <Link
            href="/platform-admin/companies"
            style={{
              border: `1px solid ${C.border}`,
              background: C.panelSoft,
              color: C.textSoft,
              padding: '11px 15px',
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  )
}