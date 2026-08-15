import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconArrowRight,
  IconCircleCheck,
  IconClipboard,
  IconUser,
} from '../../components/icons/UiIcons'
import styles from '../marketing.module.css'

export const metadata: Metadata = {
  title: 'Segurança e dados',
  description:
    'Conheça os princípios de acesso, isolamento por empresa e integridade operacional adotados pelo Yolen.',
}

export default function SegurancaPage() {
  return (
    <main className={styles.main}>
      <section className={styles.pageHero}>
        <div className={`${styles.container} ${styles.pageHeroGrid}`}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Confiança e transparência
            </div>
            <h1 className={styles.pageTitle}>
              Segurança começa por <span className={styles.gradientText}>limites claros.</span>
            </h1>
            <p className={styles.pageText}>
              A Yolen separa acesso, empresa e responsabilidade para que cada operação trabalhe dentro do seu
              contexto autorizado.
            </p>
          </div>

          <aside className={styles.pageHeroAside}>
            <strong>Transparência sem selo inventado</strong>
            Esta página descreve práticas reais do produto. Certificações e compromissos regulatórios só serão
            publicados quando estiverem formalmente comprovados.
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Princípios aplicados</div>
            <h2 className={styles.sectionTitle}>Confiança incorporada à operação.</h2>
          </div>

          <div className={styles.securityGrid}>
            <article className={styles.securityCard}>
              <div className={styles.iconBox}>
                <IconUser size={22} />
              </div>
              <h3>Acesso autenticado</h3>
              <p>O ambiente operacional exige autenticação. Recuperação de acesso e sessão permanecem separadas da experiência pública.</p>
            </article>
            <article className={styles.securityCard}>
              <div className={styles.iconBox}>
                <IconClipboard size={22} />
              </div>
              <h3>Escopo por empresa</h3>
              <p>Usuários operam dentro das empresas às quais estão vinculados, com validação do contexto ativo antes do acesso.</p>
            </article>
            <article className={styles.securityCard}>
              <div className={styles.iconBox}>
                <IconCircleCheck size={22} />
              </div>
              <h3>Permissões por função</h3>
              <p>Áreas administrativas e operacionais respeitam papéis distintos para reduzir acessos indevidos.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Compromisso de produto</div>
            <h2 className={styles.sectionTitle}>Evoluir sem esconder o que ainda está em construção.</h2>
            <p className={styles.sectionText}>
              Segurança, privacidade e governança são capacidades contínuas. A Yolen não apresenta como concluída
              uma proteção que ainda não foi validada técnica e operacionalmente.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.ctaPanel}>
            <div>
              <h2>Quer entender como o acesso funciona na sua operação?</h2>
              <p>Inclua suas dúvidas de segurança no diagnóstico para tratarmos o contexto da sua empresa.</p>
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
