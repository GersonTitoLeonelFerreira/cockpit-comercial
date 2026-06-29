import Link from 'next/link'

type PoolTabsProps = {
  active: 'pool' | 'site-leads'
}

export default function PoolTabs({ active }: PoolTabsProps) {
  const tabStyle = (isActive: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 36,
    padding: '0 14px',
    borderRadius: 8,
    border: isActive ? '1px solid rgba(59,130,246,0.6)' : '1px solid transparent',
    background: isActive ? 'rgba(59,130,246,0.14)' : 'transparent',
    color: isActive ? '#bfdbfe' : '#8fa3bc',
    fontSize: 12,
    fontWeight: 800,
    textDecoration: 'none',
  })

  return (
    <nav
      aria-label="Áreas do Pool"
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        width: 'fit-content',
        maxWidth: '100%',
        padding: 4,
        marginBottom: 18,
        border: '1px solid #1a1d2e',
        borderRadius: 10,
        background: '#0d0f14',
        overflowX: 'auto',
      }}
    >
      <Link href="/pool" style={tabStyle(active === 'pool')}>
        Operação do Pool
      </Link>
      <Link href="/pool/site-leads" style={tabStyle(active === 'site-leads')}>
        Leads Inbound
      </Link>
    </nav>
  )
}
