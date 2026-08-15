import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  HIGHLIGHT_ARTICLES,
  formatArticleDate,
  getArticleBySlug,
} from '../articles'
import styles from '../destaques.module.css'

type Props = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return HIGHLIGHT_ARTICLES.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)

  if (!article) return { title: 'Conteúdo não encontrado' }

  return {
    title: article.title,
    description: article.summary,
  }
}

export default async function DestaqueArticlePage({ params }: Props) {
  const { slug } = await params
  const article = getArticleBySlug(slug)

  if (!article) notFound()

  return (
    <main className={styles.main}>
      <header className={styles.articleHero}>
        <div className={styles.container}>
          <Link href="/destaques" className={styles.backLink}>
            ← Voltar para Destaques
          </Link>
          <div className={styles.articleCategory} style={{ marginTop: 30 }}>
            {article.categoryLabel}
          </div>
          <h1 className={styles.articleTitle}>{article.title}</h1>
          <p className={styles.articleSummary}>{article.summary}</p>
          <div className={styles.articleHeaderMeta}>
            <span>{formatArticleDate(article.publishedAt)}</span>
            <span>{article.readingTime}</span>
            <span>Yolen</span>
          </div>
        </div>
      </header>

      <article className={styles.articleBody}>
        {article.sections.map((section) => (
          <section key={section.title} className={styles.articleSection}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <div className={styles.articleCta}>
          <strong>Quer ver essa lógica aplicada à sua operação?</strong>
          <p>A demonstração do Yolen parte do processo e do gargalo comercial da sua empresa.</p>
          <Link href="/cadastro">Solicitar demonstração</Link>
        </div>
      </article>
    </main>
  )
}
