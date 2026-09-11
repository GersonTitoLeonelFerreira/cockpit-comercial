import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

import { simulatorScenarioList } from '@/app/lib/companion/message-intelligence/simulator/scenarios'

import MieSimulatorClient from './MieSimulatorClient'

export const metadata = {
  title: 'Simulador Técnico MIE V1 | Cockpit Comercial',
}

export default async function MieSimulatorPage() {
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
    .select('full_name, email, is_active_global, is_platform_admin')
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

  return (
    <MieSimulatorClient
      scenarios={simulatorScenarioList().map((scenario) => ({
        key: scenario.key,
        label: scenario.label,
        short_description: scenario.short_description,
        default_seller_intent: scenario.default_seller_intent,
      }))}
    />
  )
}
