import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconArrowRight,
  IconBrain,
  IconCircleCheck,
  IconClipboard,
  IconUser,
} from '../../components/icons/UiIcons'
import styles from '../marketing.module.css'

export const metadata: Metadata = {
  title: 'Segurança e dados',
  description:
    'Conheça os princípios de acesso, separação por empresa, permissões e uso responsável de inteligência artificial na Yolen.',
}

export default function SegurancaPage() {
  return (
    <main className={styles.main}>
      <section className={styles.pageHero}>
        <div className={`${styles.container} ${styles.pageHeroGrid}`}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Segurança e responsabilidade
            </div>
            <h1 className={styles.pageTitle}>
              Inteligência com contexto, acesso e <span className={styles.gradientText}>limites claros.</span>
            </h1>
            <p className={styles.pageText}>
              A Yolen organiza quem pode acessar a operação, em qual empresa e com qual responsabilidade. As
              orientações da inteligência permanecem visíveis e sujeitas à decisão do usuário.
            </p>
          </div>

          <aside className={styles.pageHeroAside}>
            <strong>Compromisso objetivo</strong>
            Comunicamos as práticas existentes no produto e só apresentamos certificações ou compromissos formais
            quando estiverem tecnicamente validados e comprovados.
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Princípios aplicados</div>
            <h2 className={styles.sectionTitle}>Confiança incorporada à rotina comercial.</h2>
          </div>

          <div className={styles.securityGrid}>
            <article className={styles.securityCard}>
              <div className={styles.iconBox}><IconUser size={22} /></div>
              <h3>Acesso autenticado</h3>
              <p>
                O ambiente operacional exige autenticação. Sessão, recuperação de acesso e áreas públicas seguem
                fluxos separados.
              </p>
            </article>
            <article className={styles.securityCard}>
              <div className={styles.iconBox}><IconClipboard size={22} /></div>
              <h3>Contexto por empresa e função</h3>
              <p>
                O usuário atua nas empresas às quais está vinculado, dentro do contexto ativo e das permissões
                correspondentes ao seu papel.
              </p>
            </article>
            <article className={styles.securityCard}>
              <div className={styles.iconBox}><IconCircleCheck size={22} /></div>
              <h3>Decisão humana preservada</h3>
              <p>
                A inteligência pode sugerir análises e próximos movimentos, mas o vendedor revisa antes de aplicar
                alterações na oportunidade.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Inteligência responsável</div>
            <h2 className={styles.sectionTitle}>A IA apoia a decisão sem esconder como a orientação será usada.</h2>
            <p className={styles.sectionText}>
              O Copiloto transforma o contexto disponibilizado na oportunidade em sinais, riscos, sugestões e
              coaching comercial. A orientação é apresentada para revisão, mantendo a pessoa no comando da venda.
            </p>
          </div>

          <div className={styles.contrastGrid}>
            <article className={`${styles.contrastCard} ${styles.contrastCardFeatured}`}>
              <div className={styles.iconBox}><IconBrain size={22} /></div>
              <h3>Contexto aplicado à oportunidade</h3>
              <p>
                A análise é construída a partir do conteúdo associado à venda para gerar uma orientação comercial
                relevante, e não uma resposta genérica desconectada do atendimento.
              </p>
            </article>
            <article className={styles.contrastCard}>
              <div className={styles.iconBox}><IconCircleCheck size={22} /></div>
              <h3>Evolução comunicada com transparência</h3>
              <p>
                Recursos em desenvolvimento, como o Yolen Companion, são identificados como evolução do produto até
                estarem prontos para uso operacional.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.ctaPanel}>
            <div>
              <h2>Quer avaliar a Yolen dentro dos requisitos da sua empresa?</h2>
              <p>Inclua suas dúvidas de acesso, dados e inteligência artificial no diagnóstico da demonstração.</p>
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
