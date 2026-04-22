'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../lib/supabaseBrowser'
import {
  AuthField,
  AuthInfoCard,
  AuthInlineMessage,
  AuthPrimaryButton,
  AuthScaffold,
  AuthSecondaryLink,
  AuthTextInput,
} from '../components/auth/AuthUI'

export default function ResetSenhaPage() {
  const router = useRouter()
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (loading) return

    setErrorMessage(null)
    setSuccessMessage(null)

    if (!senha || senha.length < 6) {
      setErrorMessage('Use uma senha com pelo menos 6 caracteres.')
      return
    }

    if (senha !== confirmacao) {
      setErrorMessage('A confirmação de senha não confere.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password: senha })

    setLoading(false)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Senha atualizada com sucesso. Você será redirecionado para o login.')

    window.setTimeout(() => {
      router.replace('/login')
      router.refresh()
    }, 1200)
  }

  return (
    <AuthScaffold
      pageBadge="Nova senha"
      title="Defina sua nova senha"
      subtitle="Escolha uma nova credencial para voltar ao Cockpit Comercial com segurança."
      sideBadge="Atualização segura"
      heroTitle="Redefinição de senha com a mesma linguagem visual premium do restante da plataforma."
      asideSubtitle="Essa etapa precisa transmitir controle e segurança. Por isso a tela segue o mesmo padrão escuro, limpo e executivo do produto principal."
      footerLinks={[{ label: 'Voltar para login', href: '/login' }]}
    >
      <form onSubmit={salvar} style={{ display: 'grid', gap: 16 }}>
        <AuthInlineMessage variant="error" message={errorMessage} />
        <AuthInlineMessage variant="success" message={successMessage} />

        <AuthField label="Nova senha" required hint="mínimo de 6 caracteres">
          <AuthTextInput
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite sua nova senha"
            type="password"
            autoComplete="new-password"
          />
        </AuthField>

        <AuthField label="Confirmar nova senha" required>
          <AuthTextInput
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder="Repita a nova senha"
            type="password"
            autoComplete="new-password"
          />
        </AuthField>

        <AuthPrimaryButton type="submit" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </AuthPrimaryButton>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AuthSecondaryLink href="/login">Voltar para login</AuthSecondaryLink>
        </div>

        <AuthInfoCard
          title="Boa prática"
          description={
            <>
              Use uma senha diferente da anterior e fácil de lembrar para você, mas difícil de adivinhar por terceiros.
            </>
          }
        />
      </form>
    </AuthScaffold>
  )
}