'use client'

import {
  statusLabel,
  toBRL,
  type MetaSummaryKpis,
} from '@/app/components/meta/MetaSummaryCard'

import styles from './MetaSummaryV2.module.css'

function statusClass(status: MetaSummaryKpis['status']) {
  if (status === 'no_ritmo') return styles.statusGood
  if (status === 'atencao') return styles.statusWarning
  return styles.statusDanger
}

function Metric({
  label,
  value,
  supporting,
  emphasis = false,
}: {
  label: string
  value: string
  supporting?: string
  emphasis?: boolean
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>

      <strong
        className={
          emphasis
            ? `${styles.metricValue} ${styles.metricValueEmphasis}`
            : styles.metricValue
        }
      >
        {value}
      </strong>

      {supporting ? (
        <span className={styles.metricSupporting}>{supporting}</span>
      ) : null}
    </div>
  )
}

export default function MetaSummaryV2({
  title,
  kpis,
}: {
  title: string
  kpis: MetaSummaryKpis
}) {
  return (
    <section className={styles.summary} aria-label="Resumo da meta comercial">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Ritmo comercial</span>
          <h2 className={styles.title}>{title}</h2>
        </div>

        <div className={`${styles.status} ${statusClass(kpis.status)}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>{statusLabel(kpis.status)}</span>
        </div>
      </header>

      <div className={styles.metrics}>
        <Metric
          label="Real no período"
          value={toBRL(kpis.totalReal)}
          emphasis
        />

        <Metric
          label="Meta do período"
          value={toBRL(kpis.goal)}
        />

        <Metric
          label="Gap restante"
          value={toBRL(kpis.gap)}
        />

        <Metric
          label="Ritmo necessário"
          value={toBRL(kpis.requiredPerBD)}
          supporting="por dia de execução"
        />
      </div>

      <footer className={styles.footer}>
        <div className={styles.projection}>
          <span className={styles.footerLabel}>Projeção atual</span>

          <strong className={styles.projectionValue}>
            {toBRL(kpis.projection)}
          </strong>

          <span className={styles.projectionPercent}>
            {Math.round(kpis.pacingRatio * 100)}% da meta
          </span>
        </div>

        <div className={styles.days}>
          <strong>{kpis.businessDaysRemaining}</strong>

          <span>
            {kpis.businessDaysRemaining === 1
              ? 'dia de execução restante'
              : 'dias de execução restantes'}
          </span>
        </div>
      </footer>
    </section>
  )
}
