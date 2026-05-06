import InviteAdminActivationClient from './InviteAdminActivationClient'

export const metadata = {
  title: 'Ativar conta administrativa | Cockpit Comercial',
}

export default async function AdminInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return <InviteAdminActivationClient token={token} />
}