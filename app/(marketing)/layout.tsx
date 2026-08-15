import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  MarketingViewport,
  PublicFooter,
  PublicHeader,
} from '../components/marketing/MarketingChrome'

export const metadata: Metadata = {
  title: {
    default: 'Yolen | Inteligência e execução comercial',
    template: '%s | Yolen',
  },
  description:
    'A Yolen conecta inteligência artificial, execução, metas, faturamento e gestão para orientar cada venda e melhorar decisões comerciais.',
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
