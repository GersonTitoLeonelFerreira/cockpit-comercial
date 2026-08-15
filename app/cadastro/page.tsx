'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import {
  MarketingViewport,
  PublicFooter,
  PublicHeader,
} from '../components/marketing/MarketingChrome'
import {
  IconArrowRight,
  IconBrain,
  IconCircleCheck,
  IconTarget,
} from '../components/icons/UiIcons'
import styles from './cadastro.module.css'

function onlyDigits(value: string) {
  return (value || '').replace(/\D/g, '')
}

export default function CadastroLeadPage() {
  const [step, setStep] = useState<1 | 2>(1)
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

  const advanceToContact = () => {
    setErrorMessage(null)

    if (!currentControl.trim()) {
      setErrorMessage('Selecione como os leads são controlados hoje.')
      return
    }

    if (!mainBottleneck.trim()) {
      setErrorMessage('Selecione o principal gargalo comercial.')
      return
    }

    setStep(2)
  }

  const enviar = async (event?: FormEvent) => {
    event?.preventDefault()
    if (loading) return

    setErrorMessage(null)
    setDoneMessage(null)

    if (!currentControl.trim() || !mainBottleneck.trim()) {
      setStep(1)
      setErrorMessage('Complete o contexto da operação antes de enviar.')
      return
    }

    if (!name.trim()) {
      setErrorMessage('Informe seu nome.')
      return
    }

    if (!whatsapp.trim() && !email.trim()) {
      setErrorMessage('Informe WhatsApp ou email para contato.')
      return
    }

    setLoading(true)

    const response = await fetch('/api/public/demo-request', {
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

    const json = await response.json().catch(() => ({}))
    setLoading(false)

    if (!response.ok) {
      setErrorMessage(json?.error || 'Não foi possível enviar sua solicitação.')
      return
    }

    setDoneMessage(
      'Solicitação recebida. A demonstração será preparada com base no seu cenário comercial.',
    )
  }

  return (
    <MarketingViewport>
      <PublicHeader compact />

      <main className={styles.main}>
        <div className={styles.layout}>
          <section className={styles.pitch}>
            <div className={styles.eyebrow}>Demonstração aplicada à sua operação</div>
            <h1>Veja a Yolen trabalhando sobre o desafio real da sua equipe.</h1>
            <p>
              Conte qual resultado precisa destravar. A demonstração conecta seu cenário à inteligência do
              Copiloto, ao plano de meta e à visão gerencial da plataforma.
            </p>

            <div className={styles.valueList}>
              <div>
                <span className={styles.valueIcon}>
                  <IconBrain size={20} />
                </span>
                <div>
                  <strong>Inteligência aplicada à sua venda</strong>
                  <p>Veja como o Copiloto interpreta oportunidades e ajuda o vendedor a preparar a próxima abordagem.</p>
                </div>
              </div>
              <div>
                <span className={styles.valueIcon}>
                  <IconTarget size={20} />
                </span>
                <div>
                  <strong>Meta transformada em plano</strong>
                  <p>Entenda como objetivo, realizado, gap e capacidade viram ritmo e decisão durante o período.</p>
                </div>
              </div>
              <div>
                <span className={styles.valueIcon}>
                  <IconCircleCheck size={20} />
                </span>
                <div>
                  <strong>Resultado transformado em direção</strong>
                  <p>Faturamento e relatórios mostram onde a gestão pode atuar para melhorar o desempenho comercial.</p>
                </div>
              </div>
            </div>

            <div className={styles.pitchNote}>
              Já conhece o produto? <Link href="/como-funciona">Veja como o Yolen funciona</Link> antes de enviar.
            </div>
          </section>

          <section className={styles.formCard} aria-labelledby="demo-form-title">
            {doneMessage ? (
              <div className={styles.successState} role="status">
                <span className={styles.successIcon}>
                  <IconCircleCheck size={30} />
                </span>
                <div className={styles.formKicker}>Solicitação concluída</div>
                <h2 id="demo-form-title">Sua demonstração já começa com contexto.</h2>
                <p>{doneMessage}</p>
                <Link href="/" className={styles.secondaryButton}>
                  Voltar à página inicial
                </Link>
              </div>
            ) : (
              <form onSubmit={enviar}>
                <div className={styles.formHeader}>
                  <div>
                    <div className={styles.formKicker}>Solicitar demonstração</div>
                    <h2 id="demo-form-title">
                      {step === 1
                        ? 'Qual resultado sua operação precisa destravar?'
                        : 'Como podemos continuar esta conversa?'}
                    </h2>
                  </div>
                  <span>Etapa {step} de 2</span>
                </div>

                <div className={styles.progress} aria-label={`Etapa ${step} de 2`}>
                  <span className={styles.progressActive} />
                  <span className={step === 2 ? styles.progressActive : undefined} />
                </div>

                {errorMessage ? (
                  <div className={styles.errorMessage} role="alert">
                    {errorMessage}
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className={styles.formBody}>
                    <label className={styles.field}>
                      <span>Como vocês controlam os leads hoje? *</span>
                      <select value={currentControl} onChange={(event) => setCurrentControl(event.target.value)}>
                        <option value="">Selecione</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Planilha">Planilha</option>
                        <option value="CRM">CRM</option>
                        <option value="Sistema próprio">Sistema próprio</option>
                        <option value="Misturado">Misturado</option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Qual é o principal gargalo comercial? *</span>
                      <select value={mainBottleneck} onChange={(event) => setMainBottleneck(event.target.value)}>
                        <option value="">Selecione</option>
                        <option value="Vendedores sem orientação">Vendedores sem orientação</option>
                        <option value="Meta sem plano de execução">Meta sem plano de execução</option>
                        <option value="Gestão sem visão do resultado">Gestão sem visão do resultado</option>
                        <option value="Baixa conversão">Baixa conversão</option>
                        <option value="Oportunidades sem próxima ação">Oportunidades sem próxima ação</option>
                        <option value="Faturamento sem acompanhamento">Faturamento sem acompanhamento</option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Quantas pessoas existem no time comercial?</span>
                      <select value={teamSize} onChange={(event) => setTeamSize(event.target.value)}>
                        <option value="">Selecione</option>
                        <option value="1 pessoa">1 pessoa</option>
                        <option value="2 a 5 pessoas">2 a 5 pessoas</option>
                        <option value="6 a 10 pessoas">6 a 10 pessoas</option>
                        <option value="11+ pessoas">11+ pessoas</option>
                      </select>
                    </label>

                    <button type="button" className={styles.primaryButton} onClick={advanceToContact}>
                      Continuar <IconArrowRight size={18} />
                    </button>

                    <p className={styles.privacyNote}>Nenhum dado de acesso ao seu sistema é solicitado.</p>
                  </div>
                ) : (
                  <div className={styles.formBody}>
                    <div className={styles.twoColumns}>
                      <label className={styles.field}>
                        <span>Seu nome *</span>
                        <input
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="Nome completo"
                          autoComplete="name"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Empresa</span>
                        <input
                          value={company}
                          onChange={(event) => setCompany(event.target.value)}
                          placeholder="Nome da empresa"
                          autoComplete="organization"
                        />
                      </label>
                    </div>

                    <div className={styles.twoColumns}>
                      <label className={styles.field}>
                        <span>WhatsApp</span>
                        <input
                          value={whatsapp}
                          onChange={(event) => setWhatsapp(event.target.value)}
                          placeholder="(00) 00000-0000"
                          autoComplete="tel"
                          inputMode="tel"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Email</span>
                        <input
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="voce@empresa.com"
                          type="email"
                          autoComplete="email"
                        />
                      </label>
                    </div>

                    <p className={styles.contactHint}>Informe pelo menos WhatsApp ou email.</p>

                    <details className={styles.optionalDetails}>
                      <summary>Adicionar mais contexto à demonstração</summary>
                      <div className={styles.optionalGrid}>
                        <label className={styles.field}>
                          <span>Segmento</span>
                          <select value={segment} onChange={(event) => setSegment(event.target.value)}>
                            <option value="">Selecione</option>
                            <option value="Academia">Academia</option>
                            <option value="Imobiliária">Imobiliária</option>
                            <option value="Automotivo">Automotivo</option>
                            <option value="Educação">Educação</option>
                            <option value="Serviços">Serviços</option>
                            <option value="Varejo">Varejo</option>
                            <option value="Outro">Outro</option>
                          </select>
                        </label>

                        <div className={styles.twoColumns}>
                          <label className={styles.field}>
                            <span>Volume de leads por mês</span>
                            <select value={leadsVolume} onChange={(event) => setLeadsVolume(event.target.value)}>
                              <option value="">Selecione</option>
                              <option value="Até 100 leads">Até 100 leads</option>
                              <option value="100 a 500 leads">100 a 500 leads</option>
                              <option value="500 a 2000 leads">500 a 2000 leads</option>
                              <option value="2000+ leads">2000+ leads</option>
                            </select>
                          </label>
                          <label className={styles.field}>
                            <span>Prazo para estruturar</span>
                            <select value={timeline} onChange={(event) => setTimeline(event.target.value)}>
                              <option value="">Selecione</option>
                              <option value="Imediato">Imediato</option>
                              <option value="Este mês">Este mês</option>
                              <option value="Próximos 3 meses">Próximos 3 meses</option>
                              <option value="Só pesquisando">Só pesquisando</option>
                            </select>
                          </label>
                        </div>

                        <label className={styles.field}>
                          <span>Contexto adicional</span>
                          <textarea
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                            placeholder="Conte o que sua equipe precisa melhorar ou qual decisão comercial precisa de mais clareza."
                          />
                        </label>
                      </div>
                    </details>

                    <div className={styles.formActions}>
                      <button type="button" className={styles.secondaryButton} onClick={() => setStep(1)}>
                        Voltar
                      </button>
                      <button type="submit" className={styles.primaryButton} disabled={loading}>
                        {loading ? 'Enviando...' : 'Solicitar demonstração'}
                        {!loading ? <IconArrowRight size={18} /> : null}
                      </button>
                    </div>

                    <p className={styles.privacyNote}>
                      Seus dados serão usados apenas para responder à solicitação comercial.
                    </p>
                  </div>
                )}
              </form>
            )}
          </section>
        </div>
      </main>

      <PublicFooter />
    </MarketingViewport>
  )
}
