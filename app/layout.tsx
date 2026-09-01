import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import ShellGate from './shell/ShellGate'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Yolen | Inteligência e execução comercial',
    template: '%s | Yolen',
  },
  description:
    'Plataforma de inteligência e execução comercial com Copiloto, metas, faturamento e gestão conectados à rotina de vendas.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ShellGate>{children}</ShellGate>
      </body>
    </html>
  )
}
