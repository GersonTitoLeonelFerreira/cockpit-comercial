import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './MarketingChrome.module.css'

const PRIMARY_NAVIGATION = [
  { href: '/como-funciona', label: 'Como funciona' },
  { href: '/destaques', label: 'Destaques' },
  { href: '/seguranca', label: 'Segurança' },
]

export function MarketingViewport({ children }: { children: ReactNode }) {
  return <div className={styles.viewport}>{children}</div>
}

export function PublicHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Yolen — página inicial">
          <Image
            src="/branding/yolen-logo-principal.png"
            alt="Yolen"
            width={154}
            height={37}
            priority
            className={styles.brandLogo}
          />
          {!compact ? <span className={styles.brandDescriptor}>Inteligência e execução comercial</span> : null}
        </Link>

        <nav className={styles.desktopNav} aria-label="Navegação principal">
          {PRIMARY_NAVIGATION.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link href="/login" className={styles.loginLink}>
            Entrar
          </Link>
          <Link href="/cadastro" className={styles.primaryAction}>
            Solicitar demonstração
          </Link>
        </div>

        <details className={styles.mobileMenu}>
          <summary aria-label="Abrir menu">Menu</summary>
          <div className={styles.mobileMenuPanel}>
            {PRIMARY_NAVIGATION.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            <Link href="/login">Entrar</Link>
            <Link href="/cadastro" className={styles.mobileCta}>
              Solicitar demonstração
            </Link>
          </div>
        </details>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Image
            src="/branding/yolen-logo-principal.png"
            alt="Yolen"
            width={132}
            height={32}
            className={styles.footerLogo}
          />
          <p>Inteligência comercial para orientar vendas, executar metas e liderar com evidência.</p>
        </div>

        <div className={styles.footerLinks}>
          <div>
            <strong>Produto</strong>
            <Link href="/como-funciona">Plataforma</Link>
            <Link href="/cadastro">Demonstração</Link>
            <Link href="/login">Acessar a Yolen</Link>
          </div>
          <div>
            <strong>Conteúdo</strong>
            <Link href="/destaques">Destaques</Link>
            <Link href="/destaques?categoria=gestao-comercial">Gestão comercial</Link>
            <Link href="/destaques?categoria=produto">Novidades do produto</Link>
          </div>
          <div>
            <strong>Segurança</strong>
            <Link href="/seguranca">Acesso e dados</Link>
            <span>Ambiente autenticado</span>
            <span>Contexto separado por empresa</span>
          </div>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} Yolen.</span>
        <span>Construído para ampliar a capacidade de vendedores, gestores e operações comerciais.</span>
      </div>
    </footer>
  )
}
