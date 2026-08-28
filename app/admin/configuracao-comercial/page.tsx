import { redirect } from 'next/navigation'

import CommercialConfigExperience from './CommercialConfigExperience'
import { requireCommercialConfigAdmin } from '@/app/lib/server/require-commercial-config-admin'

export const metadata = {
  title: 'Método Comercial | Yolen',
}

export const dynamic = 'force-dynamic'

export default async function CommercialConfigPage() {
  const context = await requireCommercialConfigAdmin()

  if (!context.ok) {
    if (context.status === 401) {
      redirect('/login')
    }

    if (context.status === 400) {
      redirect('/select-company')
    }

    redirect('/leads')
  }

  return <CommercialConfigExperience />
}
