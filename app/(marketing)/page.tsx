import Link from 'next/link'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBrain,
  IconCalendar,
  IconUser,
  IconZap,
} from '../components/icons/UiIcons'
import {
  CopilotStoryVisual,
  GoalStoryVisual,
  IntelligenceHeroVisual,
  ManagementStoryVisual,
} from '../components/marketing/ProductStoryVisuals'
import styles from './marketing.module.css'

const OUTCOMES = [
  {
    title: 'Orientação para cada oportunidade',
    description: 'A inteligência interpreta o contexto e ajuda o vendedor a escolher a melhor próxima abordagem.',
  },
  {
    title: 'Meta convertida em ação diária',
    description: 'O objetivo financeiro se transforma em ritmo, volume necessário e decisões para o período.',
  },
  {
    title: 'Gestão com visão do resultado',
    description: 'Execução, faturamento e indicadores mostram ao gestor onde agir enquanto ainda há tempo.',
  },
]

const STEPS = [
  ['Contexto reunido', 'Oportunidade, histórico, conversa, método e produto formam uma visão comercial única.'],
  ['Inteligência aplicada', 'O Copiloto identifica sinais, riscos, objeções e caminhos possíveis para a venda.'],
  ['Vendedor no comando', 'A pessoa revisa a orientação, decide a abordagem e confirma qualquer atualização.'],
  ['Gestão conectada', 'Meta, faturamento e relatórios transformam a execução do time em decisão gerencial.'],
]

export default function MarketingHomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Inteligência e execução comercial
            </div>

            <h1 className={styles.heroTitle}>
              Cada venda acompanhada. <span className={styles.gradientText}>Cada decisão melhor orientada.</span>
            </h1>

            <p className={styles.heroText}>
              A Yolen conecta inteligência artificial, método, metas, faturamento e gestão para trabalhar ao lado
              do vendedor em cada oportunidade — e dar ao gestor clareza para agir antes do resultado.
            </p>

            <div className={styles.actions}>
              <Link href="/cadastro" className={styles.primaryButton}>
                Ver a Yolen em ação <IconArrowRight size={18} />
              </Link>
              <Link href="/como-funciona" className={styles.secondaryButton}>
                Conhecer a plataforma
              </Link>
            </div>

            <div className={styles.heroProof} aria-label="Princípios da Yolen">
              <span>IA com contexto comercial</span>
              <span>Decisão final sempre humana</span>
              <span>Gestão do lead ao faturamento</span>
            </div>
          </div>

          <div className={styles.productVisual}>
            <div className={styles.visualGlow} />
            <IntelligenceHeroVisual />
          </div>
        </section>

        <section className={styles.outcomeStrip} aria-label="Resultados que a Yolen conecta">
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
            <div className={styles.sectionLabel}>Inteligência aplicada à venda</div>
            <h2 className={styles.sectionTitle}>Não é IA falando sobre vendas. É IA trabalhando dentro delas.</h2>
            <p className={styles.sectionText}>
              A inteligência da Yolen usa o contexto da oportunidade para apoiar a condução comercial. Ela não
              substitui o vendedor: amplia sua capacidade de entender, decidir e agir.
            </p>
          </div>

          <div className={styles.contrastGrid}>
            <article className={`${styles.contrastCard} ${styles.contrastCardFeatured}`}>
              <div className={styles.featureHeading}>
                <div className={styles.iconBox}><IconBrain size={22} /></div>
                <span className={styles.statusBadge}>Disponível</span>
              </div>
              <h3>Copiloto Comercial</h3>
              <p>
                Analisa conversas e resumos de atendimento para transformar sinais dispersos em uma orientação
                comercial que o vendedor consegue revisar e usar.
              </p>
              <ul className={styles.contrastList}>
                <li>Identifica interesses, objeções, riscos e pontos fortes da abordagem.</li>
                <li>Sugere próxima ação, estágio, mensagem e melhor caminho para retomar.</li>
                <li>Gera coaching comercial e preserva a decisão final com o vendedor.</li>
              </ul>
            </article>

            <article className={styles.contrastCard}>
              <div className={styles.featureHeading}>
                <div className={styles.iconBox}><IconZap size={22} /></div>
                <span className={`${styles.statusBadge} ${styles.statusBadgeEvolution}`}>Em evolução</span>
              </div>
              <h3>Yolen Companion</h3>
              <p>
                É a evolução que aproxima a inteligência do ambiente onde a conversa acontece. O Companion está
                sendo desenvolvido para acompanhar o contexto comercial no WhatsApp Web e reduzir trabalho manual.
              </p>
              <ul className={styles.contrastList}>
                <li>Captura estruturada do histórico relevante da conversa.</li>
                <li>Continuidade do contexto entre atendimentos e análises.</li>
                <li>Orientação cada vez mais próxima do momento real da venda.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Uma plataforma conectada</div>
            <h2 className={styles.sectionTitle}>A orientação não termina na conversa. Ela chega ao resultado.</h2>
            <p className={styles.sectionText}>
              A Yolen une três níveis que normalmente ficam separados: a venda que está acontecendo, o plano que
              precisa ser executado e a leitura que permite ao gestor corrigir a rota.
            </p>
          </div>

          <div className={styles.showcaseGrid}>
            <article className={styles.showcaseCard}>
              <CopilotStoryVisual />
              <div className={styles.showcaseCopy}>
                <span>Para conduzir melhor</span>
                <h3>Copiloto que lê a oportunidade com o vendedor</h3>
                <p>Menos improviso na abordagem e mais clareza sobre o que o cliente demonstrou, o que falta descobrir e como avançar.</p>
              </div>
            </article>

            <article className={styles.showcaseCard}>
              <GoalStoryVisual />
              <div className={styles.showcaseCopy}>
                <span>Para transformar objetivo em execução</span>
                <h3>Simulador de Meta que mostra o esforço necessário</h3>
                <p>Meta, realizado, gap, ticket, conversão e calendário viram um plano diário com leitura de risco e decisão recomendada.</p>
              </div>
            </article>

            <article className={styles.showcaseCard}>
              <ManagementStoryVisual />
              <div className={styles.showcaseCopy}>
                <span>Para decidir com evidência</span>
                <h3>Faturamento e relatórios que revelam o que move o resultado</h3>
                <p>Acompanhe vendas por produto, vendedor e período e investigue gargalos, perdas, canais, cadência, desempenho e aderência.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Como a Yolen trabalha</div>
            <h2 className={styles.sectionTitle}>Uma jornada contínua entre cliente, vendedor e gestão.</h2>
            <p className={styles.sectionText}>
              Cada interação fortalece a leitura da oportunidade. Cada execução atualiza a visão do gestor. Cada
              resultado ajuda a empresa a decidir o próximo movimento comercial.
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
              Explorar todas as capacidades <IconArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Valor para toda a operação</div>
            <h2 className={styles.sectionTitle}>Mais capacidade para quem vende. Mais poder de decisão para quem lidera.</h2>
          </div>

          <div className={styles.audienceGrid}>
            <article className={styles.audienceCard}>
              <div className={styles.iconBox}><IconUser size={22} /></div>
              <h3>Vendedores mais bem orientados</h3>
              <p>Recebem apoio para interpretar a conversa, preparar a próxima abordagem e manter cada oportunidade em movimento.</p>
            </article>
            <article className={styles.audienceCard}>
              <div className={styles.iconBox}><IconCalendar size={22} /></div>
              <h3>Gerentes presentes sem microgerenciar</h3>
              <p>Enxergam risco, ritmo, desempenho e oportunidades de coaching para atuar no ponto que realmente precisa de liderança.</p>
            </article>
            <article className={styles.audienceCard}>
              <div className={styles.iconBox}><IconAlertTriangle size={22} /></div>
              <h3>Empresas com mais previsibilidade</h3>
              <p>Conectam processo, pessoas, produtos, faturamento e meta em uma operação capaz de aprender com o próprio resultado.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.ctaPanel}>
            <div>
              <h2>Veja a Yolen trabalhando sobre o desafio real da sua operação.</h2>
              <p>
                A demonstração conecta seu cenário às capacidades da plataforma: orientação com IA, plano de meta,
                faturamento, gestão e inteligência sobre o que está acontecendo nas vendas.
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
