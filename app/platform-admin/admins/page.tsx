import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import PlatformAdminsClient from './PlatformAdminsClient'

export const metadata = {
  title: 'Admins da Plataforma | Administração da Plataforma',
}

export type PlatformAdminUser = {
  id: string
  full_name: string | null
  email: string | null
  is_platform_admin: boolean
  is_active_global: boolean | null
  created_at: string | null
}

const C = {
  page: '#090b0f',
  text: '#edf2f7',
  red: '#ef4444',
} as const

export default async function PlatformAdminsPage() {
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
    .select('is_active_global, is_platform_admin')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    redirect('/login')
  }

  if (profile.is_active_global === false) {
    redirect('/login')
  }

  if (profile.is_platform_admin !== true) {
    redirect('/leads')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return (
      <main style={{ minHeight: '100%', background: C.page, color: C.text }}>
        <h1>Admins da Plataforma</h1>
        <p style={{ color: C.red }}>
          ENV ausente: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </main>
    )
  }

  const admin = createClient(url, serviceKey)

  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, email, is_platform_admin, is_active_global, created_at')
    .eq('is_platform_admin', true)
    .order('created_at', { ascending: false })
    .limit(100)

  const platformAdmins = (data ?? []) as PlatformAdminUser[]

  return (
    <PlatformAdminsClient
      currentUserId={auth.user.id}
      initialAdmins={platformAdmins}
      initialError={error?.message ?? null}
    />
  )
}