import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  MarketingViewport,
  PublicFooter,
  PublicHeader,
} from '../components/marketing/MarketingChrome'

export const metadata: Metadata = {
  title: {
    default: 'Yolen | Execução comercial com previsibilidade',
    template: '%s | Yolen',
  },
  description:
    'O Yolen organiza prioridades, follow-up, operação e meta para equipes comerciais que precisam executar com método e previsibilidade.',
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingViewport>
      <PublicHeader />
      {children}
      <PublicFooter />
    </MarketingViewport>
  )
}
