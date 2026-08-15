import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconArrowRight,
  IconBrain,
  IconCalendar,
  IconClipboard,
  IconTarget,
  IconUser,
} from '../../components/icons/UiIcons'
import styles from '../marketing.module.css'

export const metadata: Metadata = {
  title: 'Como funciona',
  description:
    'Entenda como o Yolen organiza entrada, prioridade, execução, acompanhamento e gestão da meta comercial.',
}

const WORKFLOW = [
  {
    title: 'Organize a entrada',
    description:
      'Leads entram com contexto, origem, grupo e responsável. A operação começa estruturada, sem depender de uma planilha paralela.',
  },
  {
    title: 'Enxergue a prioridade',
    description:
      'O time visualiza oportunidades atrasadas, compromissos do dia e cards sem próxima ação antes de navegar pela carteira inteira.',
  },
  {
    title: 'Execute no funil',
    description:
      'O Kanban continua sendo o centro da operação: movimentação entre etapas, agenda, histórico e próximos passos no mesmo fluxo.',
  },
  {
    title: 'Acompanhe o método',
    description:
      'SLA, cadência e critérios comerciais tornam o processo visível e reduzem a dependência de cobrança individual.',
  },
  {
    title: 'Gerencie a meta',
    description:
      'Meta, realizado, gap e ritmo necessário ajudam o gerente a corrigir a rota enquanto o período ainda está em andamento.',
  },
]

const FAQS = [
  {
    question: 'O Yolen substitui o Kanban?',
    answer:
      'Não. O Kanban continua sendo a visão operacional e mantém a movimentação dos leads entre as etapas. A visão de prioridades complementa o funil para indicar onde agir primeiro.',
  },
  {
    question: 'A equipe precisa abandonar o WhatsApp?',
    answer:
      'Não. O objetivo é conectar a rotina comercial ao sistema e reduzir perda de contexto. A implantação respeita o processo real da equipe e evolui de forma controlada.',
  },
  {
    question: 'O gerente consegue acompanhar a operação inteira?',
    answer:
      'Sim. O acesso administrativo permite acompanhar equipe, grupos, funil, atrasos, faturamento e meta dentro do escopo da empresa.',
  },
  {
    question: 'A implantação é igual para todas as empresas?',
    answer:
      'Não. A demonstração parte do gargalo e do processo atual. Configuração, método e adoção precisam refletir a realidade comercial de cada operação.',
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
              Da entrada do lead à <span className={styles.gradientText}>decisão gerencial.</span>
            </h1>
            <p className={styles.pageText}>
              O Yolen organiza a operação em um fluxo contínuo: captar, priorizar, executar, acompanhar e corrigir a
              rota.
            </p>
          </div>

          <aside className={styles.pageHeroAside}>
            <strong>Princípio do produto</strong>
            Informação só tem valor quando ajuda alguém a tomar uma decisão ou executar uma próxima ação.
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Fluxo operacional</div>
            <h2 className={styles.sectionTitle}>Cinco movimentos que sustentam a rotina comercial.</h2>
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
            <div className={styles.sectionLabel}>Uma operação, duas perspectivas</div>
            <h2 className={styles.sectionTitle}>O vendedor executa. O gerente remove obstáculos.</h2>
          </div>

          <div className={styles.roleGrid}>
            <article className={styles.roleCard}>
              <div className={styles.iconBox}>
                <IconUser size={22} />
              </div>
              <h3>Para quem vende</h3>
              <ul>
                <li>Carteira e prioridades no mesmo ambiente.</li>
                <li>Próxima ação e agenda visíveis no contexto do lead.</li>
                <li>Menos tempo procurando informação e mais clareza para agir.</li>
                <li>Histórico preservado ao longo da oportunidade.</li>
              </ul>
            </article>

            <article className={styles.roleCard}>
              <div className={styles.iconBox}>
                <IconBrain size={22} />
              </div>
              <h3>Para quem gerencia</h3>
              <ul>
                <li>Visão da empresa, grupos e responsáveis.</li>
                <li>Alertas de atraso, SLA e falta de próxima ação.</li>
                <li>Meta conectada ao realizado e ao ritmo necessário.</li>
                <li>Leitura de funil, perdas e execução para orientar o time.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Capacidades centrais</div>
            <h2 className={styles.sectionTitle}>Tudo conversa com a mesma operação.</h2>
          </div>

          <div className={styles.pillarGrid}>
            <article className={styles.pillarCard}>
              <div className={styles.iconBox}>
                <IconClipboard size={22} />
              </div>
              <h3>Funil e prioridades</h3>
              <p>Visualize a carteira inteira ou concentre a equipe apenas no que precisa de atenção agora.</p>
            </article>
            <article className={styles.pillarCard}>
              <div className={styles.iconBox}>
                <IconCalendar size={22} />
              </div>
              <h3>Agenda e cadência</h3>
              <p>Próximos passos, compromissos e atrasos deixam de depender da memória individual.</p>
            </article>
            <article className={styles.pillarCard}>
              <div className={styles.iconBox}>
                <IconTarget size={22} />
              </div>
              <h3>Meta e previsibilidade</h3>
              <p>O período, o calendário operacional e o realizado compõem uma leitura única de ritmo.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Perguntas frequentes</div>
            <h2 className={styles.sectionTitle}>O que você precisa saber antes da demonstração.</h2>
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
              <h2>Veja o Yolen aplicado ao seu cenário comercial.</h2>
              <p>A demonstração usa seu processo atual como ponto de partida.</p>
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
