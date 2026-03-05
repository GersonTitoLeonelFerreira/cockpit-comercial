import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

export async function POST(req: Request) {
  try {
    // ✅ 1) Trava (a tal "chave")
    const incomingKey = req.headers.get('x-platform-key')
    const expectedKey = process.env.PLATFORM_PROVISION_KEY

    if (!expectedKey) {
      return NextResponse.json(
        { error: 'PLATFORM_PROVISION_KEY não configurada no .env.local' },
        { status: 500 }
      )
    }

    if (!incomingKey || incomingKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Acesso negado (chave inválida).' },
        { status: 401 }
      )
    }

    // ✅ 2) Env do Supabase (service role)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'Env NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente' },
        { status: 500 }
      )
    }

    const admin = createClient(url, serviceKey)

    // ✅ 3) Payload
    const body = await req.json()
    const company = body?.company || {}
    const adminUser = body?.admin || {}

    const legal_name = (company.legal_name || '').trim()
    const trade_name = (company.trade_name || '').trim()
    const cnpj = onlyDigits(company.cnpj || '')

    const segment = (company.segment || '').trim() || null
    const email = (company.email || '').trim() || null
    const phone = onlyDigits(company.phone || '') || null
    const city = (company.city || '').trim() || null
    const state = (company.state || '').trim() || null
    const cep = onlyDigits(company.cep || '') || null
    const address = (company.address || '').trim() || null

    const full_name = (adminUser.full_name || '').trim()
    const admin_email = (adminUser.email || '').trim()
    const password = adminUser.password || ''

    if (!legal_name || !trade_name || !cnpj) {
      return NextResponse.json(
        { error: 'Empresa: obrigatórios legal_name, trade_name, cnpj' },
        { status: 400 }
      )
    }

    if (!admin_email || !password) {
      return NextResponse.json(
        { error: 'Admin: obrigatórios email e password' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter pelo menos 6 caracteres.' },
        { status: 400 }
      )
    }

    // ✅ 4) Cria a empresa
    const { data: createdCompany, error: companyErr } = await admin
      .from('companies')
      .insert({
        name: trade_name || legal_name,   // ✅ preenche o campo antigo obrigatório
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
      return NextResponse.json(
        { error: `Falha ao criar empresa: ${companyErr.message}` },
        { status: 400 }
      )
    }

    const company_id = createdCompany?.id
    if (!company_id) {
      return NextResponse.json(
        { error: 'Empresa criada sem ID.' },
        { status: 500 }
      )
    }

    // ✅ 5) Cria usuário admin no Auth
    const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
      email: admin_email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || admin_email,
        role: 'admin',
        company_id,
      },
    })

    if (authErr) {
      // rollback da empresa
      await admin.from('companies').delete().eq('id', company_id)
      return NextResponse.json(
        { error: `Falha ao criar usuário no Auth: ${authErr.message}` },
        { status: 400 }
      )
    }

    const user_id = createdAuth.user?.id
    if (!user_id) {
      await admin.from('companies').delete().eq('id', company_id)
      return NextResponse.json(
        { error: 'Usuário criado sem ID.' },
        { status: 500 }
      )
    }

    // ✅ 6) Cria profile do admin (bypass RLS via service role)
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: user_id,
      company_id,
      role: 'admin',
      full_name: full_name || admin_email,
    })

    if (profileErr) {
      // rollback total
      await admin.auth.admin.deleteUser(user_id)
      await admin.from('companies').delete().eq('id', company_id)

      return NextResponse.json(
        { error: `Falha ao criar profile: ${profileErr.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      company_id,
      admin_user_id: user_id,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erro inesperado' },
      { status: 500 }
    )
  }
}
