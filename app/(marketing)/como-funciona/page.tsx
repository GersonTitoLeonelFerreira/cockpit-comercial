import type { Metadata } from 'next'
import Link from 'next/link'
import { IconArrowRight, IconBrain, IconUser } from '../../components/icons/UiIcons'
import {
  CopilotStoryVisual,
  GoalStoryVisual,
  ManagementStoryVisual,
} from '../../components/marketing/ProductStoryVisuals'
import styles from '../marketing.module.css'

export const metadata: Metadata = {
  title: 'Como funciona',
  description:
    'Conheça como a Yolen conecta inteligência artificial, execução comercial, metas, faturamento e gestão do resultado.',
}

const WORKFLOW = [
  {
    title: 'A oportunidade ganha contexto',
    description:
      'Histórico, etapa, método, produto, responsável e conteúdo da interação formam uma leitura comercial organizada.',
  },
  {
    title: 'O Copiloto interpreta o momento da venda',
    description:
      'A inteligência identifica interesses, objeções, riscos, sinais de avanço e pontos que ainda precisam ser explorados.',
  },
  {
    title: 'O vendedor transforma orientação em ação',
    description:
      'Com sugestão de próxima abordagem, mensagem, estágio e compromisso, o vendedor revisa e decide como conduzir a oportunidade.',
  },
  {
    title: 'A execução atualiza meta e resultado',
    description:
      'O Simulador de Meta traduz o objetivo em ritmo; o faturamento mostra o que foi vendido por produto, vendedor e período.',
  },
  {
    title: 'A gestão atua com evidência',
    description:
      'Relatórios, alertas e indicadores revelam gargalos, perdas, aderência e oportunidades de coaching enquanto ainda há tempo de agir.',
  },
]

const FAQS = [
  {
    question: 'O que o Copiloto Comercial faz atualmente?',
    answer:
      'Ele analisa o conteúdo disponibilizado na oportunidade, como conversas e resumos de atendimento, identifica sinais comerciais e sugere estágio, próxima ação, mensagem, riscos e pontos de melhoria. O vendedor pode revisar a orientação antes de aplicá-la.',
  },
  {
    question: 'A inteligência artificial decide ou altera a venda sozinha?',
    answer:
      'Não. A Yolen usa a inteligência para ampliar a capacidade de análise do vendedor. Sugestões de abordagem e mudanças na oportunidade permanecem sob revisão e decisão humana.',
  },
  {
    question: 'O Yolen Companion já está disponível?',
    answer:
      'O Companion faz parte da evolução do produto e ainda está em desenvolvimento. A proposta é aproximar a inteligência do WhatsApp Web, preservar o contexto relevante da conversa e reduzir trabalho manual. Ele não é apresentado como uma capacidade totalmente lançada neste momento.',
  },
  {
    question: 'Como o Simulador de Meta ajuda a equipe?',
    answer:
      'Ele combina meta, realizado, gap, ticket médio, conversão e calendário operacional para mostrar o esforço necessário, o ritmo diário e os riscos do período. Assim, a meta deixa de ser apenas um número de fechamento e passa a orientar decisões durante o mês.',
  },
  {
    question: 'A gestão consegue relacionar execução e faturamento?',
    answer:
      'Sim. A Yolen permite acompanhar vendas por produto, vendedor e período e cruzar essa leitura com indicadores de funil, próximas ações, canais, perdas, SLA e desempenho da equipe.',
  },
]

export default function ComoFuncionaPage() {
  return (
    <main className={styles.main}>
      <section className={styles.pageHero}>
        <div className={`${styles.container} ${styles.pageHeroGrid}`}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Como funciona
            </div>
            <h1 className={styles.pageTitle}>
              Uma inteligência comercial que acompanha a venda do{' '}
              <span className={styles.gradientText}>contexto ao resultado.</span>
            </h1>
            <p className={styles.pageText}>
              A Yolen reúne a orientação que o vendedor precisa para agir e a leitura que o gestor precisa para
              decidir. Tudo conectado à mesma operação comercial.
            </p>
          </div>

          <aside className={styles.pageHeroAside}>
            <strong>Princípio da plataforma</strong>
            A inteligência interpreta e orienta. O vendedor decide e executa. A gestão acompanha o efeito de cada
            movimento sobre a meta e o resultado.
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Da oportunidade à decisão</div>
            <h2 className={styles.sectionTitle}>Cinco movimentos conectam conversa, execução e gestão.</h2>
            <p className={styles.sectionText}>
              O valor da plataforma está na continuidade: o contexto não termina na conversa, e a meta não fica
              isolada da rotina que precisa realizá-la.
            </p>
          </div>

          <div className={styles.workflow}>
            {WORKFLOW.map((step, index) => (
              <article key={step.title} className={styles.workflowRow}>
                <div className={styles.workflowNumber}>{String(index + 1).padStart(2, '0')}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Capacidades conectadas</div>
            <h2 className={styles.sectionTitle}>Cada recurso responde a uma decisão comercial real.</h2>
          </div>

          <div className={styles.showcaseGrid}>
            <article className={styles.showcaseCard}>
              <CopilotStoryVisual />
              <div className={styles.showcaseCopy}>
                <span>Entender e conduzir</span>
                <h3>Copiloto Comercial</h3>
                <p>
                  Interpreta a oportunidade, evidencia sinais e ajuda o vendedor a preparar uma abordagem mais
                  relevante para o cliente.
                </p>
              </div>
            </article>

            <article className={styles.showcaseCard}>
              <GoalStoryVisual />
              <div className={styles.showcaseCopy}>
                <span>Planejar e corrigir</span>
                <h3>Simulador de Meta</h3>
                <p>
                  Mostra onde a operação está, o que falta entregar e qual esforço precisa entrar na rotina para
                  recuperar ou sustentar o resultado.
                </p>
              </div>
            </article>

            <article className={styles.showcaseCard}>
              <ManagementStoryVisual />
              <div className={styles.showcaseCopy}>
                <span>Medir e decidir</span>
                <h3>Faturamento e inteligência gerencial</h3>
                <p>
                  Revela o que está sendo vendido e transforma dados de execução, produtos, equipe e funil em
                  direção para a gestão.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Valor para a operação</div>
            <h2 className={styles.sectionTitle}>
              A mesma inteligência fortalece vendedor e gestor de formas diferentes.
            </h2>
          </div>

          <div className={styles.roleGrid}>
            <article className={styles.roleCard}>
              <div className={styles.iconBox}><IconUser size={22} /></div>
              <h3>Para quem vende</h3>
              <ul>
                <li>Mais contexto para entender a necessidade e o momento do cliente.</li>
                <li>Orientação de próxima abordagem sem retirar a autonomia comercial.</li>
                <li>Coaching sobre o que foi bem conduzido e o que pode melhorar.</li>
                <li>Prioridade, agenda e histórico disponíveis na mesma rotina.</li>
              </ul>
            </article>

            <article className={styles.roleCard}>
              <div className={styles.iconBox}><IconBrain size={22} /></div>
              <h3>Para quem lidera</h3>
              <ul>
                <li>Meta transformada em ritmo, capacidade e decisão para o período.</li>
                <li>Visão de faturamento por produto, vendedor e dia.</li>
                <li>Diagnóstico de gargalos, perdas, SLA, conversão e aderência.</li>
                <li>Oportunidades de coaching identificadas a partir da execução real.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Perguntas frequentes</div>
            <h2 className={styles.sectionTitle}>
              Clareza sobre o que a Yolen entrega hoje e o que está em evolução.
            </h2>
          </div>

          <div className={styles.faqList}>
            {FAQS.map((faq) => (
              <details key={faq.question} className={styles.faqItem}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.ctaPanel}>
            <div>
              <h2>Veja a Yolen aplicada ao desafio real da sua operação comercial.</h2>
              <p>A demonstração conecta seu cenário ao Copiloto, ao plano de meta e à leitura gerencial do resultado.</p>
            </div>
            <Link href="/cadastro" className={styles.primaryButton}>
              Solicitar demonstração <IconArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
