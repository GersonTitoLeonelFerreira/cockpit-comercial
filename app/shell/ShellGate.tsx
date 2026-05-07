'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import AppShell from './components/AppShell'

export default function ShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const currentPathname = pathname || ''

  const noShellRoutes = [
    '/login',
    '/esqueci-senha',
    '/reset-senha',
    '/cadastro',
    '/select-company',
  ]

  const noShell =
    noShellRoutes.includes(currentPathname) ||
    currentPathname.startsWith('/auth') ||
    currentPathname.startsWith('/convites') ||
    currentPathname.startsWith('/_next') ||
    currentPathname.startsWith('/api')

  if (noShell) return <>{children}</>

  return <AppShell>{children}</AppShell>
}