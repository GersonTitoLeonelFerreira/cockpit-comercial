import Image from 'next/image'
import Link from 'next/link'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBrain,
  IconCalendar,
  IconCircleCheck,
  IconClipboard,
  IconTarget,
  IconUser,
  IconZap,
} from '../components/icons/UiIcons'
import styles from './marketing.module.css'

const OUTCOMES = [
  {
    title: 'Prioridade clara todos os dias',
    description: 'O time sabe quais oportunidades exigem ação agora — e por quê.',
  },
  {
    title: 'Gestão antes do atraso virar perda',
    description: 'SLA, agenda e gargalos ficam visíveis para uma intervenção mais rápida.',
  },
  {
    title: 'Meta conectada à execução',
    description: 'O resultado esperado deixa de ser um número isolado e orienta a rotina comercial.',
  },
]

const PILLARS = [
  {
    icon: <IconTarget size={22} />,
    title: 'Priorize o que move o resultado',
    description:
      'Atrasos, compromissos e oportunidades sem próxima ação ganham visibilidade operacional.',
  },
  {
    icon: <IconZap size={22} />,
    title: 'Transforme processo em ritmo',
    description:
      'O funil organiza o trabalho, enquanto agenda, SLA e método mantêm a equipe em movimento.',
  },
  {
    icon: <IconBrain size={22} />,
    title: 'Decida com contexto',
    description:
      'Gestores acompanham avanço, perdas, execução e meta sem montar a história em várias planilhas.',
  },
]

const STEPS = [
  ['Entrada organizada', 'Leads chegam ao lugar certo, com responsável, grupo e contexto preservados.'],
  ['Prioridade operacional', 'O Yolen evidencia o que está atrasado, parado ou precisa de decisão.'],
  ['Execução orientada', 'Próxima ação, agenda e método comercial guiam o trabalho do vendedor.'],
  ['Gestão previsível', 'O gestor acompanha ritmo, funil e meta para agir antes do fechamento do período.'],
]

export default function MarketingHomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Sistema operacional comercial
            </div>

            <h1 className={styles.heroTitle}>
              Menos lead esquecido. <span className={styles.gradientText}>Mais execução.</span>
            </h1>

            <p className={styles.heroText}>
              O Yolen transforma pipeline, follow-up e meta em uma rotina comercial clara — para o time agir
              melhor e o gestor decidir antes.
            </p>

            <div className={styles.actions}>
              <Link href="/cadastro" className={styles.primaryButton}>
                Solicitar demonstração <IconArrowRight size={18} />
              </Link>
              <Link href="/como-funciona" className={styles.secondaryButton}>
                Entender como funciona
              </Link>
            </div>

            <div className={styles.heroProof} aria-label="Diferenciais do Yolen">
              <span>Implantação orientada</span>
              <span>Operação por empresa</span>
              <span>Sem promessa genérica</span>
            </div>
          </div>

          <div className={styles.productVisual}>
            <div className={styles.visualGlow} />
            <div className={styles.visualFrame}>
              <div className={styles.visualTopbar}>
                <i />
                <i />
                <i />
                <span>Cockpit comercial</span>
              </div>
              <Image
                src="/branding/login-kanban.png"
                alt="Fluxo visual do Yolen conectando a operação comercial à previsibilidade"
                width={1672}
                height={941}
                className={styles.visualImage}
                priority
                sizes="(max-width: 1020px) 100vw, 54vw"
              />
              <div className={styles.visualSignal}>
                <strong>Operação com próximo passo</strong>
                <span>Prioridade visível para vendedor e gestor</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.outcomeStrip} aria-label="Resultados operacionais">
          {OUTCOMES.map((outcome) => (
            <div key={outcome.title} className={styles.outcomeItem}>
              <strong>{outcome.title}</strong>
              <span>{outcome.description}</span>
            </div>
          ))}
        </section>
      </div>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Uma categoria diferente</div>
            <h2 className={styles.sectionTitle}>Seu CRM registra. O Yolen organiza a execução.</h2>
            <p className={styles.sectionText}>
              Registrar dados é necessário, mas não resolve sozinho o problema comercial. A Yolen foi desenhada
              para transformar informação em prioridade, rotina e decisão gerencial.
            </p>
          </div>

          <div className={styles.contrastGrid}>
            <article className={styles.contrastCard}>
              <div className={styles.iconBox}>
                <IconClipboard size={22} />
              </div>
              <h3>Quando o sistema apenas registra</h3>
              <p>O time alimenta dados, mas ainda depende de memória, cobrança e planilhas paralelas.</p>
              <ul className={styles.contrastList}>
                <li>Leads ficam parados sem sinalização clara.</li>
                <li>A próxima ação depende da disciplina individual.</li>
                <li>O gestor descobre o problema depois do resultado.</li>
              </ul>
            </article>

            <article className={`${styles.contrastCard} ${styles.contrastCardFeatured}`}>
              <div className={styles.iconBox}>
                <IconCircleCheck size={22} />
              </div>
              <h3>Quando a operação trabalha com orientação</h3>
              <p>
                O funil continua visual e movimentável, mas passa a mostrar onde agir, o que está atrasado e como a
                execução conversa com a meta.
              </p>
              <ul className={styles.contrastList}>
                <li>Prioridades do dia aparecem antes da lista inteira.</li>
                <li>Agenda, SLA e método comercial operam no mesmo fluxo.</li>
                <li>Gestão acompanha ritmo e intervém enquanto ainda há tempo.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>O que muda na prática</div>
            <h2 className={styles.sectionTitle}>Três capacidades. Uma operação mais madura.</h2>
          </div>

          <div className={styles.pillarGrid}>
            {PILLARS.map((pillar) => (
              <article key={pillar.title} className={styles.pillarCard}>
                <div className={styles.iconBox}>{pillar.icon}</div>
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Da entrada à decisão</div>
            <h2 className={styles.sectionTitle}>Um fluxo que conecta vendedor, gerente e meta.</h2>
            <p className={styles.sectionText}>
              A experiência foi desenhada para reduzir improviso sem engessar a operação.
            </p>
          </div>

          <div className={styles.stepList}>
            {STEPS.map(([title, description], index) => (
              <article key={title} className={styles.stepCard}>
                <div className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>

          <div className={styles.actions}>
            <Link href="/como-funciona" className={styles.secondaryButton}>
              Ver o funcionamento completo <IconArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Para quem faz sentido</div>
            <h2 className={styles.sectionTitle}>Feito para operações que precisam ganhar consistência.</h2>
          </div>

          <div className={styles.audienceGrid}>
            <article className={styles.audienceCard}>
              <div className={styles.iconBox}>
                <IconUser size={22} />
              </div>
              <h3>Gerentes comerciais</h3>
              <p>Que precisam enxergar atrasos, ritmo e gargalos sem microgerenciar cada vendedor.</p>
            </article>
            <article className={styles.audienceCard}>
              <div className={styles.iconBox}>
                <IconCalendar size={22} />
              </div>
              <h3>Equipes com alto volume de follow-up</h3>
              <p>Que trabalham com WhatsApp, agenda e múltiplas prioridades ao longo do dia.</p>
            </article>
            <article className={styles.audienceCard}>
              <div className={styles.iconBox}>
                <IconAlertTriangle size={22} />
              </div>
              <h3>Operações presas em planilhas</h3>
              <p>Que já perceberam que controle manual não escala com pessoas, unidades e metas.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.ctaPanel}>
            <div>
              <h2>A demonstração começa pelo seu gargalo, não por um roteiro genérico.</h2>
              <p>
                Conte como sua operação funciona hoje. A apresentação do Yolen será direcionada ao problema que
                mais compromete sua execução comercial.
              </p>
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
