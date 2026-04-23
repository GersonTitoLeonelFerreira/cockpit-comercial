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
    .select(`
      id,
      created_at,
      name,
      company,
      whatsapp,
      email,
      segment,
      team_size,
      current_control,
      main_bottleneck,
      leads_volume,
      timeline,
      message,
      status
    `)
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
          Demonstrações
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
          Gestão interna das solicitações vindas da página pública de diagnóstico comercial.
        </p>
      </div>

      <DemoRequestsClient initialRows={initialRows} />
    </div>
  )
}