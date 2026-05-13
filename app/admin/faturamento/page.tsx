import { cookies } from 'next/headers'
import FaturamentoPage from './components/FaturamentoPage'

export const metadata = {
  title: 'Gestão de Faturamento | Cockpit Comercial',
}

export default async function Page() {
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  return (
    <>
      <FaturamentoPage activeCompanyId={activeCompanyId} />
    </>
  )
}