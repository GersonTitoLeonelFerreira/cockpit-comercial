import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse a inteligência e a operação comercial da sua empresa na Yolen.',
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
