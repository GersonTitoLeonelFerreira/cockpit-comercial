import type { ReactNode } from 'react'

import SiteLeadPriorityDecorator from './SiteLeadPriorityDecorator'

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteLeadPriorityDecorator />
      {children}
    </>
  )
}
