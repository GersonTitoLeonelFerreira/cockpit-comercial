import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ADMIN_ROUTES = ['/pool', '/admin']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

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
    }
  )

  const { data } = await supabase.auth.getUser()
  const user = data?.user

  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_active === false) {
    return NextResponse.redirect(new URL('/conta-desativada', req.url))
  }

  const isAdminRoute = ADMIN_ROUTES.some((route) =>
    req.nextUrl.pathname.startsWith(route)
  )

  if (isAdminRoute && profile.role !== 'admin') {
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
    '/cadastro/:path*',
    '/importar/:path*',
    '/perfil/:path*',
    '/platform/:path*',
    '/pool/:path*',
    '/relatorios/:path*',
    '/sales-cycles/:path*',
  ],
}
