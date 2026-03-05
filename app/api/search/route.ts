import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ leads: [] })

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

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) return NextResponse.json({ leads: [] }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', auth.user.id)
    .single()

  if (!profile?.company_id) return NextResponse.json({ leads: [] })

  const digits = q.replace(/\D/g, '')
  const hasDigits = digits.length >= 6

  let query = supabase
    .from('leads')
    .select('id,name,phone')
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })
    .limit(8)

  query = hasDigits ? query.or(`phone_norm.ilike.%${digits}%,phone.ilike.%${q}%`) : query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ leads: [] })

  return NextResponse.json({ leads: data ?? [] })
}
