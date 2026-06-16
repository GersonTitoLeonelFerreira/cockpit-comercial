import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PLATFORM_ADMIN_ROUTES = ['/platform-admin', '/platform']
const COMPANY_ROUTES = [
  '/dashboard',
  '/leads',
  '/admin',
  '/agenda',
  '/importar',
  '/pool',
  '/pulso-comercial',
  '/relatorios',
  '/sales-cycles',
]
const COMPANY_ADMIN_ROUTES = ['/pool', '/admin']

function startsWithAny(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  const user = data?.user

  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active_global, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.is_active_global === false) {
    return NextResponse.redirect(new URL('/conta-desativada', req.url))
  }

  const isPlatformAdminRoute = startsWithAny(pathname, PLATFORM_ADMIN_ROUTES)

  if (isPlatformAdminRoute) {
    if (profile.is_platform_admin !== true) {
      return NextResponse.redirect(new URL('/leads', req.url))
    }

    return res
  }

  const isCompanyRoute = startsWithAny(pathname, COMPANY_ROUTES)

  if (!isCompanyRoute) {
    return res
  }

  const activeCompanyId = req.cookies.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    return NextResponse.redirect(new URL('/select-company', req.url))
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!membership?.company_id) {
    return NextResponse.redirect(new URL('/select-company', req.url))
  }

  const isCompanyAdminRoute = startsWithAny(pathname, COMPANY_ADMIN_ROUTES)

  if (isCompanyAdminRoute && membership.role !== 'admin') {
    return NextResponse.redirect(new URL('/leads', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/leads/:path*',
    '/admin/:path*',
    '/agenda/:path*',
    '/importar/:path*',
    '/perfil/:path*',
    '/platform/:path*',
    '/platform-admin/:path*',
    '/pool/:path*',
    '/pulso-comercial/:path*',
    '/relatorios/:path*',
    '/sales-cycles/:path*',
  ],
}
