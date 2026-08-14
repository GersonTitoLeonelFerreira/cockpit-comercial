'use client'

import React, { useMemo, useState } from 'react'
import {
  buildCockpitPriorityBuckets,
  type CockpitPriorityBucket,
  type CockpitPriorityStatus,
} from './cockpit-priorities'
import styles from './CockpitPrioritiesView.module.css'

export type CockpitPriorityViewItem = {
  id: string
  owner_id: string | null
  status: CockpitPriorityStatus
  stage_entered_at: string
  name: string
  phone: string | null
  next_action: string | null
  next_action_date: string | null
  lead_groups?: { name: string } | null
}

type CockpitPrioritySeller = {
  id: string
  full_name: string | null
  email: string | null
}

type CockpitPrioritiesViewProps = {
  items: CockpitPriorityViewItem[]
  totals: Record<CockpitPriorityStatus, number>
  sellers: CockpitPrioritySeller[]
  now: Date
  onOpenCycle: (cycleId: string) => void
}

const BUCKET_META: Record<
  CockpitPriorityBucket,
  { label: string; shortLabel: string; accent: string; icon: string; activeClass: string }
> = {
  overdue: {
    label: 'Atrasados',
    shortLabel: 'atrasados',
    accent: '#ef4444',
    icon: '!',
    activeClass: styles.tabActiveOverdue,
  },
  today: {
    label: 'Para hoje',
    shortLabel: 'para hoje',
    accent: '#f59e0b',
    icon: '◷',
    activeClass: styles.tabActiveToday,
  },
  missing: {
    label: 'Sem próxima ação',
    shortLabel: 'sem próxima ação',
    accent: '#94a3b8',
    icon: '…',
    activeClass: styles.tabActiveMissing,
  },
}

const STAGE_META: Record<CockpitPriorityStatus, { label: string; accent: string }> = {
  novo: { label: 'Novo', accent: '#1685ff' },
  contato: { label: 'Contato', accent: '#06d6e8' },
  respondeu: { label: 'Agenda', accent: '#f5c400' },
  negociacao: { label: 'Negociação', accent: '#a855f7' },
  ganho: { label: 'Ganho', accent: '#00e889' },
  perdido: { label: 'Perdido', accent: '#ff4d5e' },
}

const STAGE_ORDER: CockpitPriorityStatus[] = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'ganho',
]

function formatPhone(phone: string | null) {
  return phone?.trim() || 'Telefone não informado'
}

function formatOwnerInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatPriorityDue(
  bucket: CockpitPriorityBucket,
  item: CockpitPriorityViewItem,
  now: Date,
) {
  if (bucket === 'missing' || !item.next_action_date) return 'Sem agenda'
  if (bucket === 'today') return `Hoje ${formatTime(item.next_action_date)}`

  const elapsedMs = Math.max(0, now.getTime() - new Date(item.next_action_date).getTime())
  const elapsedHours = Math.floor(elapsedMs / 3_600_000)

  if (elapsedHours < 24) return `Atrasado ${Math.max(1, elapsedHours)}h`
  return `Atrasado ${Math.floor(elapsedHours / 24)}d`
}

export default function CockpitPrioritiesView({
  items,
  totals,
  sellers,
  now,
  onOpenCycle,
}: CockpitPrioritiesViewProps) {
  const [activeBucket, setActiveBucket] = useState<CockpitPriorityBucket>('overdue')
  const buckets = useMemo(() => buildCockpitPriorityBuckets(items, now), [items, now])
  const sellersById = useMemo(
    () =>
      new Map(
        sellers.map((seller) => [
          seller.id,
          seller.full_name || seller.email || 'Responsável não identificado',
        ]),
      ),
    [sellers],
  )

  const visibleItems = buckets[activeBucket].slice(0, 12)
  const attentionCount =
    buckets.overdue.length + buckets.today.length + buckets.missing.length
  const largestStageTotal = Math.max(1, ...STAGE_ORDER.map((status) => totals[status] ?? 0))

  return (
    <div className={styles.viewport}>
      <div className={styles.layout}>
        <section className={`${styles.panel} ${styles.mainPanel}`} aria-labelledby="priorities-title">
        <div className={styles.headingRow}>
          <div>
            <h2 id="priorities-title" className={styles.title}>
              Prioridades de hoje
            </h2>
            <p className={styles.subtitle}>
              {attentionCount === 1
                ? '1 oportunidade precisa de atenção'
                : `${attentionCount} oportunidades precisam de atenção`}
            </p>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Tipos de prioridade">
          {(Object.keys(BUCKET_META) as CockpitPriorityBucket[]).map((bucket) => {
            const meta = BUCKET_META[bucket]
            const active = bucket === activeBucket

            return (
              <button
                key={bucket}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.tab} ${active ? meta.activeClass : ''}`}
                onClick={() => setActiveBucket(bucket)}
              >
                {meta.label}
                <span className={styles.count}>{buckets[bucket].length}</span>
              </button>
            )
          })}
        </div>

        <div className={styles.list} role="tabpanel">
          {visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>Nenhuma oportunidade nesta prioridade</strong>
              <span>O Funil continua disponível para visualizar todas as etapas.</span>
            </div>
          ) : (
            visibleItems.map((item) => {
              const stage = STAGE_META[item.status]
              const bucket = BUCKET_META[activeBucket]
              const ownerName = item.owner_id
                ? sellersById.get(item.owner_id) ?? 'Responsável não identificado'
                : 'Sem responsável'

              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.leadRow}
                  style={
                    {
                      '--stage-accent': stage.accent,
                      '--priority-accent': bucket.accent,
                    } as React.CSSProperties
                  }
                  onClick={() => onOpenCycle(item.id)}
                  aria-label={`Abrir oportunidade de ${item.name}`}
                >
                  <span className={styles.leadIdentity}>
                    <span className={styles.leadName}>{item.name}</span>
                    <span className={styles.secondaryText}>{formatPhone(item.phone)}</span>
                  </span>

                  <span className={styles.nextAction}>
                    <span className={styles.actionText}>
                      {item.next_action?.trim() || 'Definir próxima ação comercial'}
                    </span>
                    <span className={styles.metaLine}>
                      <span className={styles.stageBadge}>{stage.label}</span>
                      <span className={styles.dueBadge}>
                        {formatPriorityDue(activeBucket, item, now)}
                      </span>
                      {item.lead_groups?.name ? (
                        <span className={styles.groupBadge}>{item.lead_groups.name}</span>
                      ) : null}
                    </span>
                  </span>

                  <span className={styles.owner}>
                    <span className={styles.avatar}>{formatOwnerInitials(ownerName)}</span>
                    <span className={styles.ownerName}>{ownerName}</span>
                  </span>

                  <span className={styles.openAction}>Abrir →</span>
                </button>
              )
            })
          )}
        </div>

        {buckets[activeBucket].length > visibleItems.length ? (
          <div className={styles.listFooter}>
            Exibindo as 12 prioridades mais antigas de {buckets[activeBucket].length}.
          </div>
        ) : null}
        </section>

        <aside className={`${styles.panel} ${styles.radarPanel}`} aria-labelledby="radar-title">
        <h2 id="radar-title" className={styles.radarTitle}>
          Radar da operação
        </h2>

        <div className={styles.radarList}>
          {(Object.keys(BUCKET_META) as CockpitPriorityBucket[]).map((bucket) => {
            const meta = BUCKET_META[bucket]

            return (
              <button
                key={bucket}
                type="button"
                className={styles.radarItem}
                style={{ '--priority-accent': meta.accent } as React.CSSProperties}
                onClick={() => setActiveBucket(bucket)}
              >
                <span className={styles.radarIcon}>{meta.icon}</span>
                <span className={styles.radarCount}>{buckets[bucket].length}</span>
                <span className={styles.radarLabel}>{meta.shortLabel}</span>
                <span className={styles.radarArrow}>›</span>
              </button>
            )
          })}
        </div>

        <div className={styles.stageSection}>
          <div className={styles.sectionLabel}>Avanço do Funil</div>
          <div className={styles.stageBars}>
            {STAGE_ORDER.map((status) => {
              const stage = STAGE_META[status]
              const value = totals[status] ?? 0
              const width = value > 0 ? Math.max(4, (value / largestStageTotal) * 100) : 0

              return (
                <div key={status} className={styles.stageBarRow}>
                  <span className={styles.stageLabel}>{stage.label}</span>
                  <span className={styles.stageTrack}>
                    <span
                      className={styles.stageFill}
                      style={
                        {
                          width: `${width}%`,
                          '--stage-accent': stage.accent,
                        } as React.CSSProperties
                      }
                    />
                  </span>
                  <span className={styles.stageValue}>{value}</span>
                </div>
              )
            })}
          </div>
        </div>
        </aside>
      </div>
    </div>
  )
}
