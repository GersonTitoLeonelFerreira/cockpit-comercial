'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import AuthButton from '../components/AuthButton.client'
import GlobalSearch from '../components/GlobalSearch.client'

import styles from './YolenShellChrome.module.css'

export type YolenDestination =
  | 'operation'
  | 'opportunities'
  | 'agenda'
  | 'results'
  | 'management'

type YolenShellFrameProps = {
  children: ReactNode
  activeCompanyName: string | null
  contextLabel: string
  activeDestination: YolenDestination
  showManagement: boolean
  onYolenAction?: () => void
}

type DockIconName =
  | 'operation'
  | 'opportunities'
  | 'agenda'
  | 'results'
  | 'management'
  | 'yolen'

const DOCK_ITEMS: ReadonlyArray<{
  id: YolenDestination
  label: string
  href: string
  icon: DockIconName
}> = [
  {
    id: 'operation',
    label: 'Operação',
    href: '/leads?view=frentes',
    icon: 'operation',
  },
  {
    id: 'opportunities',
    label: 'Oportunidades',
    href: '/leads?view=lista',
    icon: 'opportunities',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    href: '/agenda',
    icon: 'agenda',
  },
  {
    id: 'results',
    label: 'Resultados',
    href: '/dashboard',
    icon: 'results',
  },
  {
    id: 'management',
    label: 'Gestão',
    href: '/platform',
    icon: 'management',
  },
]

function DockIcon({ name }: { name: DockIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  } as const

  switch (name) {
    case 'operation':
      return (
        <svg {...common}>
          <path
            d="M5 7.5h14M5 12h9M5 16.5h6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M18 14.5v5m-2.5-2.5h5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'opportunities':
      return (
        <svg {...common}>
          <rect
            x="4"
            y="4"
            width="6"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <rect
            x="14"
            y="4"
            width="6"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      )

    case 'agenda':
      return (
        <svg {...common}>
          <rect
            x="4"
            y="5.5"
            width="16"
            height="14"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8 3.5v4M16 3.5v4M4 9.5h16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M8 13h3M8 16h5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'results':
      return (
        <svg {...common}>
          <path
            d="M5 19V11M12 19V5M19 19v-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M3.5 19.5h17"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'management':
      return (
        <svg {...common}>
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M19 13.4a7.6 7.6 0 0 0 .05-2.8l2-1.55-2-3.46-2.46 1a7.8 7.8 0 0 0-2.4-1.4L13.8 2h-4l-.4 3.2A7.8 7.8 0 0 0 7 6.6l-2.45-1-2 3.46 2 1.55a7.6 7.6 0 0 0 0 2.8l-2 1.55 2 3.46 2.45-1a7.8 7.8 0 0 0 2.4 1.4l.4 3.2h4l.4-3.2a7.8 7.8 0 0 0 2.4-1.4l2.46 1 2-3.46-2.06-1.56Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'yolen':
      return (
        <svg {...common}>
          <path
            d="M5 5.5 12 12l7-6.5M12 12v7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

function YolenTopBar({
  activeCompanyName,
  contextLabel,
}: {
  activeCompanyName: string | null
  contextLabel: string
}) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Link href="/leads?view=frentes" className={styles.brand}>
          <span className={styles.brandMark}>
            <Image
              src="/brand/yolen-mark.png"
              alt=""
              width={24}
              height={24}
              priority
            />
          </span>

          <span className={styles.brandName}>yolen</span>
        </Link>

        <span className={styles.topbarDivider} />

        <div
          className={styles.company}
          title={
            activeCompanyName
              ? `Empresa ativa: ${activeCompanyName}`
              : 'Empresa ativa não selecionada'
          }
        >
          <span
            className={
              activeCompanyName
                ? styles.companyStatusActive
                : styles.companyStatusInactive
            }
          />

          <span className={styles.companyName}>
            {activeCompanyName ?? 'Sem empresa ativa'}
          </span>
        </div>
      </div>

      <div className={styles.contextLabel}>{contextLabel}</div>

      <div className={styles.topbarRight}>
        <div className={styles.search}>
          <GlobalSearch />
        </div>

        <AuthButton />
      </div>
    </header>
  )
}

function YolenDock({
  activeDestination,
  showManagement,
  onYolenAction,
}: {
  activeDestination: YolenDestination
  showManagement: boolean
  onYolenAction?: () => void
}) {
  return (
    <div className={styles.dockArea}>
      <nav className={styles.dock} aria-label="Navegação principal">
        {DOCK_ITEMS.filter(
          (item) => item.id !== 'management' || showManagement,
        ).map((item) => {
          const active = item.id === activeDestination

          return (
            <Link
              key={item.id}
              href={item.href}
              className={
                active
                  ? `${styles.dockItem} ${styles.dockItemActive}`
                  : styles.dockItem
              }
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.dockIcon}>
                <DockIcon name={item.icon} />
              </span>

              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {onYolenAction ? (
        <button
          type="button"
          className={styles.yolenAction}
          onClick={onYolenAction}
          aria-label="Abrir assistência Yolen"
          title="Yolen"
        >
          <DockIcon name="yolen" />
        </button>
      ) : null}
    </div>
  )
}

export default function YolenShellFrame({
  children,
  activeCompanyName,
  contextLabel,
  activeDestination,
  showManagement,
  onYolenAction,
}: YolenShellFrameProps) {
  return (
    <div className={`yolen-v2 ${styles.shell}`}>
      <YolenTopBar
        activeCompanyName={activeCompanyName}
        contextLabel={contextLabel}
      />

      <main className={styles.content}>{children}</main>

      <YolenDock
        activeDestination={activeDestination}
        showManagement={showManagement}
        onYolenAction={onYolenAction}
      />
    </div>
  )
}
