import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Solicitar demonstração',
  description:
    'Conte seu cenário comercial e receba uma demonstração do Yolen orientada ao gargalo da sua operação.',
}

export default function CadastroLayout({ children }: { children: ReactNode }) {
  return children
}
