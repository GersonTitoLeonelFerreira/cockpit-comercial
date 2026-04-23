import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { ensurePlatformAdmin } from '@/app/lib/supabase/server'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function enc(v: string) {
  return encodeURIComponent(v)
}

export default async function NovaEmpresaPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; company_id?: string; admin_user_id?: string }
}) {
  try {
    await ensurePlatformAdmin()
  } catch {
    redirect('/dashboard')
  }

  // ✅ Server Action: roda no servidor (não expõe chaves)
  async function provisionar(formData: FormData) {
    'use server'

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!url || !serviceKey) {
        redirect(`/platform/empresas/nova?error=${enc('Env do Supabase ausente (URL ou SERVICE_ROLE).')}`)
      }

      const admin = createClient(url!, serviceKey!)

      const legal_name = String(formData.get('legal_name') || '').trim()
      const trade_name = String(formData.get('trade_name') || '').trim()
      const cnpj = onlyDigits(String(formData.get('cnpj') || ''))

      const segment = String(formData.get('segment') || '').trim() || null
      const email = String(formData.get('company_email') || '').trim() || null
      const phone = onlyDigits(String(formData.get('company_phone') || '')) || null
      const city = String(formData.get('city') || '').trim() || null
      const state = String(formData.get('state') || '').trim() || null
      const cep = onlyDigits(String(formData.get('cep') || '')) || null
      const address = String(formData.get('address') || '').trim() || null

      const admin_full_name = String(formData.get('admin_full_name') || '').trim()
      const admin_email = String(formData.get('admin_email') || '').trim()
      const admin_password = String(formData.get('admin_password') || '')

      if (!legal_name || !trade_name || !cnpj) {
        redirect(`/platform/empresas/nova?error=${enc('Preencha: Razão social, Nome fantasia e CNPJ.')}`)
      }
      if (!admin_email || !admin_password) {
        redirect(`/platform/empresas/nova?error=${enc('Preencha: Email e senha do Admin.')}`)
      }
      if (admin_password.length < 6) {
        redirect(`/platform/empresas/nova?error=${enc('Senha do Admin precisa ter pelo menos 6 caracteres.')}`)
      }

      // 1) Cria company (compatível com seu schema antigo: name NOT NULL)
      const { data: createdCompany, error: companyErr } = await admin
        .from('companies')
        .insert({
          name: trade_name || legal_name, // ✅ coluna antiga obrigatória
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
        })
        .select('id')
        .single()

      if (companyErr) {
        redirect(`/platform/empresas/nova?error=${enc('Falha ao criar empresa: ' + companyErr.message)}`)
      }

      const company_id = createdCompany?.id
      if (!company_id) {
        redirect(`/platform/empresas/nova?error=${enc('Empresa criada sem ID.')}`)
      }

      // 2) Cria usuário admin no Auth
      const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true,
        user_metadata: {
          full_name: admin_full_name || admin_email,
          role: 'admin',
          company_id,
        },
      })

      if (authErr) {
        // rollback company
        await admin.from('companies').delete().eq('id', company_id)
        redirect(`/platform/empresas/nova?error=${enc('Falha ao criar admin no Auth: ' + authErr.message)}`)
      }

      const admin_user_id = createdAuth.user?.id
      if (!admin_user_id) {
        await admin.from('companies').delete().eq('id', company_id)
        redirect(`/platform/empresas/nova?error=${enc('Admin criado sem ID.')}`)
      }

      // 3) Cria profile do admin
      const { error: profileErr } = await admin.from('profiles').upsert({
        id: admin_user_id,
        company_id,
        role: 'admin',
        full_name: admin_full_name || admin_email,
      })

      if (profileErr) {
        await admin.auth.admin.deleteUser(admin_user_id!)
        await admin.from('companies').delete().eq('id', company_id)
        redirect(`/platform/empresas/nova?error=${enc('Falha ao criar profile: ' + profileErr.message)}`)
      }

      redirect(
        `/platform/empresas/nova?ok=1&company_id=${enc(company_id!)}&admin_user_id=${enc(admin_user_id!)}`
      )
    } catch (e: any) {
      redirect(`/platform/empresas/nova?error=${enc(e?.message || 'Erro inesperado')}`)
    }
  }

  const ok = searchParams?.ok === '1'
  const err = searchParams?.error
  const companyId = searchParams?.company_id
  const adminUserId = searchParams?.admin_user_id

  return (
    <div style={{ padding: 30, maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Cadastrar empresa + Admin</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Esta tela cria uma empresa (tenant) e o usuário Admin principal dessa empresa.
      </div>

      {err ? (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: '#2a1212' }}>
          <b>Erro:</b> {decodeURIComponent(err)}
        </div>
      ) : null}

      {ok ? (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, background: '#102a12' }}>
          <b>Criado com sucesso.</b>
          <div style={{ marginTop: 8 }}>
            <div>company_id: <code>{companyId}</code></div>
            <div>admin_user_id: <code>{adminUserId}</code></div>
          </div>
        </div>
      ) : null}

      <form action={provisionar} style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid #333' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Empresa</h2>

          <div style={{ display: 'grid', gap: 10 }}>
            <label>
              Razão social *
              <input name="legal_name" style={{ width: '100%', padding: 10 }} />
            </label>

            <label>
              Nome fantasia *
              <input name="trade_name" style={{ width: '100%', padding: 10 }} />
            </label>

            <label>
              CNPJ * (somente números ou com máscara)
              <input name="cnpj" style={{ width: '100%', padding: 10 }} />
            </label>

            <label>
              Segmento
              <input name="segment" placeholder="Ex: Academia, Imobiliária..." style={{ width: '100%', padding: 10 }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                Email da empresa
                <input name="company_email" style={{ width: '100%', padding: 10 }} />
              </label>
              <label>
                Telefone/WhatsApp
                <input name="company_phone" style={{ width: '100%', padding: 10 }} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                Cidade
                <input name="city" style={{ width: '100%', padding: 10 }} />
              </label>
              <label>
                UF
                <input name="state" style={{ width: '100%', padding: 10 }} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <label>
                CEP
                <input name="cep" style={{ width: '100%', padding: 10 }} />
              </label>
              <label>
                Endereço
                <input name="address" style={{ width: '100%', padding: 10 }} />
              </label>
            </div>
          </div>
        </div>

        <div style={{ padding: 14, borderRadius: 10, border: '1px solid #333' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Admin (acesso principal)</h2>

          <div style={{ display: 'grid', gap: 10 }}>
            <label>
              Nome do admin
              <input name="admin_full_name" style={{ width: '100%', padding: 10 }} />
            </label>

            <label>
              Email do admin *
              <input name="admin_email" style={{ width: '100%', padding: 10 }} />
            </label>

            <label>
              Senha do admin * (mín. 6)
              <input name="admin_password" type="password" style={{ width: '100%', padding: 10 }} />
            </label>
          </div>
        </div>

        <button style={{ padding: 12, fontWeight: 800, cursor: 'pointer' }}>
          Criar empresa + Admin
        </button>
      </form>
    </div>
  )
}
