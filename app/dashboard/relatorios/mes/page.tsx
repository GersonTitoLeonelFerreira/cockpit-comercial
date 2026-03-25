// Redireciona para a rota canônica de Sazonalidade Mensal (Fase 6.4).
// Mantido para retrocompatibilidade com links existentes.
import { redirect } from 'next/navigation'

export default function MesRedirectPage() {
  redirect('/dashboard/relatorios/sazonalidade-mensal')
}
