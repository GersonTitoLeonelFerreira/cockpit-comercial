import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Cadastrar empresa | Cockpit Comercial',
}

export default function NovaEmpresaPage() {
  redirect('/platform-admin/companies/new')
}