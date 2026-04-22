'use client'

import { useState } from 'react'
import {
  AuthField,
  AuthInfoCard,
  AuthInlineMessage,
  AuthPrimaryButton,
  AuthScaffold,
  AuthSecondaryLink,
  AuthSelect,
  AuthTextArea,
  AuthTextInput,
} from '../components/auth/AuthUI'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

export default function CadastroLeadPage() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [segment, setSegment] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (loading) return

    setErrorMessage(null)
    setDoneMessage(null)

    if (!name.trim()) {
      setErrorMessage('Informe seu nome.')
      return
    }

    if (!whatsapp.trim() && !email.trim()) {
      setErrorMessage('Informe WhatsApp ou email para contato.')
      return
    }

    setLoading(true)

    const r = await fetch('/api/public/demo-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        company: company.trim() || null,
        whatsapp: onlyDigits(whatsapp) || null,
        email: email.trim() || null,
        segment: segment.trim() || null,
        message: message.trim() || null,
      }),
    })

    const json = await r.json().catch(() => ({}))
    setLoading(false)

    if (!r.ok) {
      setErrorMessage(json?.error || 'Falha ao enviar solicitação.')
      return
    }

    setDoneMessage('Solicitação recebida. Sua equipe comercial pode avançar esse contato a partir daqui.')
    setName('')
    setCompany('')
    setWhatsapp('')
    setEmail('')
    setSegment('')
    setMessage('')
  }

  return (
    <AuthScaffold
      pageBadge="Demonstração"
      title="Quero conhecer o Cockpit"
      subtitle="Deixe seus dados para que a equipe entre em contato e apresente a plataforma."
      sideBadge="Contato comercial"
      heroTitle="Página comercial com a mesma identidade visual do sistema, sem parecer formulário improvisado."
      asideSubtitle="A tela de demonstração também precisa vender percepção de produto. Aqui a ideia é clara: padrão premium, leitura limpa e captação organizada."
      footerLinks={[
        { label: 'Voltar para login', href: '/login' },
        { label: 'Esqueci minha senha', href: '/esqueci-senha' },
      ]}
    >
      <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }}>
        <AuthInlineMessage variant="error" message={errorMessage} />
        <AuthInlineMessage variant="success" message={doneMessage} />

        <AuthField label="Nome" required>
          <AuthTextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
          />
        </AuthField>

        <AuthField label="Empresa">
          <AuthTextInput
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nome da empresa"
          />
        </AuthField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <AuthField label="WhatsApp">
            <AuthTextInput
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </AuthField>

          <AuthField label="Email">
            <AuthTextInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              type="email"
              autoComplete="email"
            />
          </AuthField>
        </div>

        <AuthField label="Segmento">
          <AuthSelect value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="">Selecione um segmento</option>
            <option value="academia">Academia</option>
            <option value="imobiliaria">Imobiliária</option>
            <option value="automotivo">Automotivo</option>
            <option value="educacao">Educação</option>
            <option value="servicos">Serviços</option>
            <option value="varejo">Varejo</option>
            <option value="outro">Outro</option>
          </AuthSelect>
        </AuthField>

        <AuthField label="Mensagem">
          <AuthTextArea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Descreva brevemente o cenário comercial da sua empresa."
          />
        </AuthField>

        <AuthPrimaryButton type="submit" disabled={loading}>
          {loading ? 'Enviando...' : 'Solicitar demonstração'}
        </AuthPrimaryButton>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AuthSecondaryLink href="/login">Voltar para login</AuthSecondaryLink>
        </div>

        <AuthInfoCard
          title="O que acontece depois"
          description={
            <>
              A solicitação entra no fluxo comercial para contato e qualificação. A ideia aqui é transformar essa
              página em uma porta de entrada com aparência de produto sério, não um formulário genérico.
            </>
          }
        />
      </form>
    </AuthScaffold>
  )
}