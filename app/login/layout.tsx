import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse sua operação comercial no Yolen.',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
