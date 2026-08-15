import type { Metadata } from 'next'
import Link from 'next/link'
import { IconArrowRight } from '../../components/icons/UiIcons'
import {
  ARTICLE_CATEGORIES,
  HIGHLIGHT_ARTICLES,
  formatArticleDate,
  type ArticleCategory,
} from './articles'
import styles from './destaques.module.css'

export const metadata: Metadata = {
  title: 'Destaques',
  description:
    'Conteúdos sobre inteligência comercial, gestão, Método Yolen e evolução da plataforma.',
}

type Props = {
  searchParams: Promise<{ categoria?: string }>
}

export default async function DestaquesPage({ searchParams }: Props) {
  const { categoria } = await searchParams
  const validCategory = ARTICLE_CATEGORIES.some((item) => item.id === categoria)
    ? (categoria as ArticleCategory | 'todos')
    : 'todos'
  const articles =
    validCategory === 'todos'
      ? HIGHLIGHT_ARTICLES
      : HIGHLIGHT_ARTICLES.filter((article) => article.category === validCategory)
  const featured = articles.find((article) => article.featured) ?? articles[0]
  const remaining = articles.filter((article) => article.slug !== featured?.slug)

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.container}>
          <div className={styles.eyebrow}>Inteligência para vender e liderar</div>
          <h1 className={styles.title}>Conteúdo que transforma análise em decisão comercial.</h1>
          <p className={styles.subtitle}>
            Leituras de mercado, práticas de gestão, Método Yolen e novidades da plataforma para ampliar a
            capacidade de vendedores e gestores.
          </p>

          <nav className={styles.filters} aria-label="Categorias dos destaques">
            {ARTICLE_CATEGORIES.map((category) => {
              const href = category.id === 'todos' ? '/destaques' : `/destaques?categoria=${category.id}`
              return (
                <Link
                  key={category.id}
                  href={href}
                  className={validCategory === category.id ? styles.filterActive : styles.filter}
                >
                  {category.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.container}>
          {!featured ? (
            <div className={styles.empty}>Nenhum conteúdo publicado nesta categoria.</div>
          ) : (
            <>
              <Link href={`/destaques/${featured.slug}`} className={styles.featuredCard}>
                <div>
                  <div className={styles.articleCategory}>{featured.categoryLabel}</div>
                  <h2>{featured.title}</h2>
                  <p>{featured.summary}</p>
                  <span className={styles.readLink}>
                    Ler destaque <IconArrowRight size={17} />
                  </span>
                </div>
                <div className={styles.featuredAside}>
                  <strong>Destaque editorial</strong>
                  <span>
                    {formatArticleDate(featured.publishedAt)} · {featured.readingTime}
                  </span>
                </div>
              </Link>

              {remaining.length > 0 ? (
                <div className={styles.grid}>
                  {remaining.map((article) => (
                    <Link key={article.slug} href={`/destaques/${article.slug}`} className={styles.articleCard}>
                      <div className={styles.articleCategory}>{article.categoryLabel}</div>
                      <h2>{article.title}</h2>
                      <p>{article.summary}</p>
                      <div className={styles.articleMeta}>
                        <span>{formatArticleDate(article.publishedAt)}</span>
                        <span>{article.readingTime}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
