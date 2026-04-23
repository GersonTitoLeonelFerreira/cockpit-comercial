'use client'

import { useState, type FormEvent } from 'react'
import {
  AuthDivider,
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

  const [teamSize, setTeamSize] = useState('')
  const [currentControl, setCurrentControl] = useState('')
  const [mainBottleneck, setMainBottleneck] = useState('')
  const [leadsVolume, setLeadsVolume] = useState('')
  const [timeline, setTimeline] = useState('')

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const enviar = async (e?: FormEvent) => {
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

    if (!currentControl.trim()) {
      setErrorMessage('Selecione como vocês controlam os leads hoje.')
      return
    }

    if (!mainBottleneck.trim()) {
      setErrorMessage('Selecione o principal gargalo comercial.')
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
        teamSize: teamSize.trim() || null,
        currentControl: currentControl.trim() || null,
        mainBottleneck: mainBottleneck.trim() || null,
        leadsVolume: leadsVolume.trim() || null,
        timeline: timeline.trim() || null,
        message: message.trim() || null,
      }),
    })

    const json = await r.json().catch(() => ({}))
    setLoading(false)

    if (!r.ok) {
      setErrorMessage(json?.error || 'Falha ao enviar solicitação.')
      return
    }

    setDoneMessage(
      'Diagnóstico solicitado com sucesso. O próximo contato já pode acontecer com contexto comercial real, não de forma genérica.'
    )

    setName('')
    setCompany('')
    setWhatsapp('')
    setEmail('')
    setSegment('')
    setTeamSize('')
    setCurrentControl('')
    setMainBottleneck('')
    setLeadsVolume('')
    setTimeline('')
    setMessage('')
  }

  return (
    <AuthScaffold
      pageBadge="Diagnóstico"
      title="Quero diagnosticar meu comercial"
      subtitle="Preencha os dados para que nossa equipe entenda seu cenário e apresente o Cockpit com base no seu processo real."
      sideBadge="Diagnóstico comercial"
      heroTitle="Organize o funil, elimine gargalos e ganhe previsibilidade no comercial."
      asideSubtitle="O Cockpit Comercial ajuda sua operação a enxergar travas, padronizar execução e transformar volume em resultado com leitura clara do pipeline."
      brandVariant="logo"
      brandLogoSrc="/branding/yolen-logo-principal.png"
      brandLogoAlt="Yolen"
      brandLogoWidth={340}
      brandLogoHeight={82}
      brandTagline="Cockpit comercial para equipes de vendas"
      desktopSplitScroll
      topAction={<AuthSecondaryLink href="/login">Voltar para login</AuthSecondaryLink>}
      stats={[
        { value: 'Pipeline executivo', label: 'visão clara por etapa' },
        { value: 'Follow-up controlado', label: 'menos lead parado' },
        { value: 'Prioridade operacional', label: 'ação rápida no que importa' },
      ]}
      features={[
        {
          title: 'Leitura real da operação',
          description:
            'Não é só armazenar contatos. É enxergar gargalos, conversão, perdas e ritmo comercial com clareza.',
        },
        {
          title: 'Execução com padrão',
          description:
            'A equipe trabalha com processo visível, prioridades organizadas e menos improviso no dia a dia.',
        },
        {
          title: 'Demonstração mais assertiva',
          description:
            'Sua solicitação já entra com contexto comercial, o que torna a conversa mais consultiva e menos genérica.',
        },
      ]}
    >
      <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }}>
        <AuthInlineMessage variant="error" message={errorMessage} />
        <AuthInlineMessage variant="success" message={doneMessage} />

        <AuthDivider label="Dados principais" />

        <AuthField label="Nome" required>
          <AuthTextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            autoComplete="name"
          />
        </AuthField>

        <AuthField label="Empresa">
          <AuthTextInput
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nome da empresa"
            autoComplete="organization"
          />
        </AuthField>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <AuthField label="WhatsApp">
            <AuthTextInput
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(00) 00000-0000"
              autoComplete="tel"
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
            <option value="Academia">Academia</option>
            <option value="Imobiliária">Imobiliária</option>
            <option value="Automotivo">Automotivo</option>
            <option value="Educação">Educação</option>
            <option value="Serviços">Serviços</option>
            <option value="Varejo">Varejo</option>
            <option value="Outro">Outro</option>
          </AuthSelect>
        </AuthField>

        <AuthDivider label="Leitura do cenário comercial" />

        <AuthField
          label="Quantas pessoas existem no time comercial?"
          hint="Ajuda a entender maturidade operacional"
        >
          <AuthSelect value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
            <option value="">Selecione</option>
            <option value="1 pessoa">1 pessoa</option>
            <option value="2 a 5 pessoas">2 a 5 pessoas</option>
            <option value="6 a 10 pessoas">6 a 10 pessoas</option>
            <option value="11+ pessoas">11+ pessoas</option>
          </AuthSelect>
        </AuthField>

        <AuthField
          label="Hoje vocês controlam os leads por onde?"
          required
          hint="Campo central para entender a operação atual"
        >
          <AuthSelect value={currentControl} onChange={(e) => setCurrentControl(e.target.value)}>
            <option value="">Selecione</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Planilha">Planilha</option>
            <option value="CRM">CRM</option>
            <option value="Sistema próprio">Sistema próprio</option>
            <option value="Misturado">Misturado</option>
          </AuthSelect>
        </AuthField>

        <AuthField label="Principal gargalo do comercial" required>
          <AuthSelect value={mainBottleneck} onChange={(e) => setMainBottleneck(e.target.value)}>
            <option value="">Selecione</option>
            <option value="Falta de follow-up">Falta de follow-up</option>
            <option value="Baixa conversão">Baixa conversão</option>
            <option value="Falta de gestão do funil">Falta de gestão do funil</option>
            <option value="Time sem padrão">Time sem padrão</option>
            <option value="Falta de previsibilidade">Falta de previsibilidade</option>
            <option value="Leads parados">Leads parados</option>
          </AuthSelect>
        </AuthField>

        <AuthField label="Volume de leads por mês">
          <AuthSelect value={leadsVolume} onChange={(e) => setLeadsVolume(e.target.value)}>
            <option value="">Selecione</option>
            <option value="Até 100 leads">Até 100 leads</option>
            <option value="100 a 500 leads">100 a 500 leads</option>
            <option value="500 a 2000 leads">500 a 2000 leads</option>
            <option value="2000+ leads">2000+ leads</option>
          </AuthSelect>
        </AuthField>

        <AuthField label="Prazo para estruturar isso">
          <AuthSelect value={timeline} onChange={(e) => setTimeline(e.target.value)}>
            <option value="">Selecione</option>
            <option value="Imediato">Imediato</option>
            <option value="Este mês">Este mês</option>
            <option value="Próximos 3 meses">Próximos 3 meses</option>
            <option value="Só pesquisando">Só pesquisando</option>
          </AuthSelect>
        </AuthField>

        <AuthField label="Contexto do comercial">
          <AuthTextArea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Descreva rapidamente como o time comercial opera hoje, onde os leads travam e o que mais compromete a conversão."
          />
        </AuthField>

        <AuthPrimaryButton type="submit" disabled={loading}>
          {loading ? 'Enviando diagnóstico...' : 'Quero meu diagnóstico'}
        </AuthPrimaryButton>

        <AuthInfoCard
          title="O que acontece depois"
          description={
            <>
              Sua solicitação entra no fluxo comercial com contexto do cenário atual. Isso permite uma abordagem mais
              consultiva, com demonstração mais alinhada ao seu processo real.
            </>
          }
        />

        <AuthInfoCard
          title="Nossa equipe comercial estará pronta para:"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Analisar o contexto de sua operação.</li>
              <li>Apontar as melhorias no seu processo de vendas.</li>
              <li>Entregar a solução para alcançar suas metas com previsibilidade.</li>
            </ul>
          }
        />
      </form>
    </AuthScaffold>
  )
}


