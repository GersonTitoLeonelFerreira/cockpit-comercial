import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Solicitar demonstração',
  description:
    'Veja a Yolen aplicada ao seu desafio comercial, com inteligência, meta, faturamento e gestão conectados à sua operação.',
}

export default function CadastroLayout({ children }: { children: ReactNode }) {
  return children
}
