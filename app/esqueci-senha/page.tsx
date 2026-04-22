'use client'

import { useMemo, useState } from 'react'
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

export default function EsqueciSenhaPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (loading) return

    setErrorMessage(null)
    setSuccessMessage(null)

    if (!email) {
      setErrorMessage('Digite seu email para receber o link de redefinição.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-senha`,
    })

    setLoading(false)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Se esse email existir na base, enviamos um link de redefinição de senha.')
  }

  return (
    <AuthScaffold
      pageBadge="Recuperação"
      title="Recupere seu acesso"
      subtitle="Informe o email vinculado à sua conta para receber o link de redefinição."
      sideBadge="Recuperação segura"
      heroTitle="Fluxo de recuperação claro, limpo e alinhado ao padrão executivo do sistema."
      asideSubtitle="A recuperação de senha precisa transmitir segurança e continuidade visual. A proposta aqui é simples: menos ruído, mais orientação e sensação de produto maduro."
      footerLinks={[
        { label: 'Voltar para login', href: '/login' },
        { label: 'Quero uma demonstração', href: '/cadastro' },
      ]}
    >
      <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }}>
        <AuthInlineMessage variant="error" message={errorMessage} />
        <AuthInlineMessage variant="success" message={successMessage} />

        <AuthField label="Email" required>
          <AuthTextInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            autoComplete="email"
            type="email"
          />
        </AuthField>

        <AuthPrimaryButton type="submit" disabled={loading}>
          {loading ? 'Enviando link...' : 'Enviar link de redefinição'}
        </AuthPrimaryButton>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AuthSecondaryLink href="/login">Voltar para login</AuthSecondaryLink>
        </div>

        <AuthInfoCard
          title="O que acontece agora"
          description={
            <>
              Verifique sua caixa de entrada e também o spam. O link recebido levará você para a página de redefinição
              de senha do sistema.
            </>
          }
        />
      </form>
    </AuthScaffold>
  )
}