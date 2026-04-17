import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function LegacyLeadDetailRedirect(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  const leadId = params?.id

  if (!leadId || !UUID_RE.test(leadId)) {
    redirect('/leads')
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    redirect('/leads')
  }

  const { data: latestCycle } = await supabase
    .from('sales_cycles')
    .select('id')
    .eq('lead_id', leadId)
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestCycle?.id) {
    redirect(`/sales-cycles/${latestCycle.id}`)
  }

  redirect('/leads')
}