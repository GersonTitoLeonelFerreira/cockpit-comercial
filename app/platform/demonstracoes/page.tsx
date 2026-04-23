import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { ensurePlatformAdmin } from '@/app/lib/supabase/server'
import DemoRequestsClient, { type DemoRequestRow } from './DemoRequestsClient'

export const dynamic = 'force-dynamic'

export default async function PlatformDemonstracoesPage() {
  try {
    await ensurePlatformAdmin()
  } catch {
    redirect('/dashboard')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Env NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.')
  }

  const admin = createClient(url, serviceKey)

  const { data, error } = await admin
    .from('demo_requests')
    .select('id, created_at, name, company, whatsapp, email, segment, message, status')
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    throw new Error(error.message)
  }

  const initialRows = ((data ?? []) as DemoRequestRow[]).map((row) => ({
    ...row,
    status: row.status || 'new',
  }))

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: '#edf2f7',
          }}
        >
          Gestão de solicitações de demonstração
        </h1>

        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 14,
            lineHeight: 1.7,
            color: '#8fa3bc',
            maxWidth: 760,
          }}
        >
          Aqui ficam as entradas da página de cadastro. Você pode pesquisar, filtrar e atualizar o status comercial
          sem depender do Supabase Dashboard ou do e-mail.
        </p>
      </div>

      <DemoRequestsClient initialRows={initialRows} />
    </div>
  )
}