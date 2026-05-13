import { cookies } from 'next/headers'
import SimulatorMetaClient from './SimulatorMetaClient'

export default async function Page() {
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  return <SimulatorMetaClient activeCompanyId={activeCompanyId} />
}