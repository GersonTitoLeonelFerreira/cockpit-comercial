'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import AppShell from './components/AppShell'

export default function ShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const noShellRoutes = [
    '/login',
    '/esqueci-senha',
    '/reset-senha',
    '/cadastro',
    '/conta-desativada',
  ]

  const noShell =
    noShellRoutes.includes(pathname || '') ||
    pathname?.startsWith('/auth') ||
    pathname?.startsWith('/_next') ||
    pathname?.startsWith('/api')

  if (noShell) return <>{children}</>

  return <AppShell>{children}</AppShell>
}