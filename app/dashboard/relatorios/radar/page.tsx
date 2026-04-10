'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { getPeriodRadar } from '@/app/lib/services/periodRadar'
import type {
  PeriodRadarSummary,
  PeriodRadarSignal,
  PeriodRadarReason,
  SignalDirection,
} from '@/app/types/periodRadar'

// ============================================================================
// DESIGN TOKENS — mesmos do shell/kanban
// ============================================================================
const DS = {
  contentBg:     '#090b0f',
  panelBg:       '#0d0f14',
  cardBg:        '#141722',
  surfaceBg:     '#111318',
  border:        '#1a1d2e',
  borderSubtle:  '#13162a',
  textPrimary:   '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted:     '#546070',
  textLabel:     '#4a5569',
  blue:          '#3b82f6',
  blueSoft:      '#93c5fd',
  blueLight:     '#60a5fa',
  greenBg:       'rgba(22,163,74,0.10)',
  greenBorder:   'rgba(34,197,94,0.25)',
  greenText:     '#86efac',
  amberBg:       'rgba(245,158,11,0.12)',
  amberBorder:   'rgba(245,158,11,0.3)',
  amberText:     '#fef3c7',
  redBg:         'rgba(239,68,68,0.10)',
  redBorder:     'rgba(239,68,68,0.3)',
  redText:       '#fca5a5',
  selectBg:      '#0d0f14',
  shadowCard:    '0 1px 4px rgba(0,0,0,0.4)',
  radius:        7,
  radiusContainer: 9,
} as const

// ==============================================================================
// Helpers
// ==============================================================================

function getSixMonthsAgo(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getTodayDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ==============================================================================
// Sub-components
// ==============================================================================

interface SellerOption {
  id: string
  label: string
}

interface SellerProfileRow {
  id: string
  full_name: string | null
}

function DirectionIcon({ direction }: { direction: SignalDirection }) {
  if (direction === 'positivo') {
    return <span style={{ color: '#22c55e', fontSize: 18, fontWeight: 700 }}>↑</span>
  }
  if (direction === 'negativo') {
    return <span style={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }}>↓</span>
  }
  return <span style={{ color: '#fbbf24', fontSize: 18, fontWeight: 700 }}>→</span>
}

function SignalCard({ signal }: { signal: PeriodRadarSignal }) {
  const [hovered, setHovered] = React.useState(false)
  const dirColor =
    signal.direction === 'positivo' ? '#22c55e'
    : signal.direction === 'negativo' ? '#ef4444'
    : '#fbbf24'

  const borderColor = signal.available ? (hovered ? `${dirColor}70` : `${dirColor}35`) : DS.border

  return (
    <div
      style={{
        background: hovered
          ? `linear-gradient(135deg, ${dirColor}08, ${dirColor}14)`
          : DS.cardBg,
        border: `1px solid ${borderColor}`,
        borderRadius: DS.radiusContainer,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: signal.available ? 1 : 0.5,
        transition: 'all 200ms ease',
        transform: hovered && signal.available ? 'translateY(-2px)' : 'none',
        boxShadow: hovered && signal.available
          ? `0 4px 16px rgba(0,0,0,0.4), 0 0 8px ${dirColor}18`
          : DS.shadowCard,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {signal.available ? (
          <DirectionIcon direction={signal.direction} />
        ) : (
          <span style={{ color: DS.textMuted, fontSize: 18 }}>–</span>
        )}
        <span style={{ fontWeight: 700, fontSize: 14, color: signal.available ? DS.textPrimary : DS.textMuted }}>
          {signal.label}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 20,
            background:
              signal.confidence === 'alta' ? 'rgba(22,163,74,0.15)'
              : signal.confidence === 'moderada' ? 'rgba(217,119,6,0.15)'
              : 'rgba(102,102,102,0.15)',
            color:
              signal.confidence === 'alta' ? '#4ade80'
              : signal.confidence === 'moderada' ? '#fb923c'
              : '#999',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 700,
          }}
        >
          {signal.confidence}
        </span>
      </div>
      <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>
        {signal.available ? signal.description : signal.fallback_reason}
      </div>
      <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
        Fonte: {signal.source}
      </div>
    </div>
  )
}

function ReasonItem({ reason, index }: { reason: PeriodRadarReason; index: number }) {
  const dirColor =
    reason.direction === 'positivo' ? '#22c55e'
    : reason.direction === 'negativo' ? '#ef4444'
    : '#fbbf24'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radius,
        transition: 'background 200ms ease',
      }}
    >
      <span
        style={{
          minWidth: 22,
          height: 22,
          borderRadius: '50%',
          background: DS.surfaceBg,
          border: `1px solid ${DS.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: DS.textMuted,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      <DirectionIcon direction={reason.direction} />
      <span style={{ fontSize: 13, lineHeight: 1.5, color: DS.textSecondary }}>{reason.text}</span>
    </div>
  )
}
// ==============================================================================
// ReportNavDropdown — navegação compacta com dropdown agrupado
// ==============================================================================

const REPORT_NAV_GROUPS = [
  {
    title: 'Visão Executiva',
    accent: '#3b82f6',
    items: [
      { label: 'Radar do Período', href: '/dashboard/relatorios/radar' },
      { label: 'Relatórios Gerais', href: '/relatorios/gerais' },
    ],
  },
  {
    title: 'Operação',
    accent: '#06b6d4',
    items: [
      { label: 'Visão Executiva', href: '/relatorios/operacao/visao-executiva' },
      { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
      { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
      { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
      { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
      { label: 'Canais', href: '/relatorios/operacao/canais' },
      { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
    ],
  },
  {
    title: 'Comercial',
    accent: '#8b5cf6',
    items: [
      { label: 'Performance por Produto', href: '/dashboard/relatorios/produto' },
    ],
  },
  {
    title: 'Sazonalidade',
    accent: '#f59e0b',
    items: [
      { label: 'Dia da Semana', href: '/dashboard/relatorios/dia-semana' },
      { label: 'Semana do Mês', href: '/dashboard/relatorios/semana-mes' },
      { label: 'Sazonalidade Mensal', href: '/dashboard/relatorios/sazonalidade-mensal' },
    ],
  },
  {
    title: 'Cadastros',
    accent: '#22c55e',
    items: [
      { label: 'Cadastro de Produtos', href: '/admin/produtos' },
    ],
  },
  {
    title: 'Governança',
    accent: '#ef4444',
    items: [
      { label: 'Score de Aderência', href: '/relatorios/governanca/score-de-aderencia' },
    ],
  },
]

function ReportNavDropdown({ currentPath }: { currentPath: string }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Encontrar nome da página atual
  const currentLabel = REPORT_NAV_GROUPS
    .flatMap((g) => g.items)
    .find((item) => item.href === currentPath)?.label ?? 'Relatórios'

  // Fechar ao clicar fora
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
      {/* Botão principal */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a
          href="/relatorios"
          style={{
            color: DS.textSecondary,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 12px',
            borderRadius: DS.radius,
            border: `1px solid ${DS.border}`,
            background: DS.panelBg,
            transition: 'all 200ms ease',
          }}
        >
          Hub
        </a>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            borderRadius: DS.radius,
            border: `1px solid ${open ? 'rgba(59,130,246,0.4)' : DS.border}`,
            background: open ? 'rgba(59,130,246,0.14)' : DS.panelBg,
            color: open ? DS.blueSoft : DS.textSecondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 200ms ease',
            outline: 'none',
          }}
        >
          <span>{currentLabel}</span>
          <span style={{ fontSize: 10, transition: 'transform 200ms ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: DS.surfaceBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer + 3,
            padding: '12px 0',
            zIndex: 9000,
            minWidth: 560,
            boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
          }}
        >
          {REPORT_NAV_GROUPS.map((group) => (
            <div key={group.title} style={{ padding: '8px 16px' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: group.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: `1px solid ${group.accent}20`,
                }}
              >
                {group.title}
              </div>
              {group.items.map((item) => {
                const isActive = item.href === currentPath
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'block',
                      padding: '6px 10px',
                      borderRadius: DS.radius - 1,
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? DS.blueSoft : DS.textSecondary,
                      background: isActive ? 'rgba(59,130,246,0.10)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 150ms ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = `${DS.border}`
                        ;(e.currentTarget as HTMLElement).style.color = DS.textPrimary
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent'
                        ;(e.currentTarget as HTMLElement).style.color = DS.textSecondary
                      }
                    }}
                  >
                    {item.label}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==============================================================================
// Main page
// ==============================================================================

export default function RadarRelatorioPg() {
  const supabase = supabaseBrowser()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // User/profile state
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters — default: 6 months back to today
  const [dateStart, setDateStart] = React.useState(getSixMonthsAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  // Radar data
  const [radar, setRadar] = React.useState<PeriodRadarSummary | null>(null)
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

  // Init: load profile + sellers
  React.useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Sessão expirada. Faça login novamente.')

        const uid = userData.user.id

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, company_id')
          .eq('id', uid)
          .maybeSingle()

        if (!profile?.company_id) throw new Error('Perfil não encontrado.')

        const adminUser = profile.role === 'admin'
        setIsAdmin(adminUser)
        setCompanyId(profile.company_id)

        if (adminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

          setSellers(
            (sellersData ?? []).map((s: SellerProfileRow) => ({
              id: s.id,
              label: s.full_name || s.id,
            }))
          )
          setSelectedSellerId(null)
        } else {
          setSelectedSellerId(uid)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro ao carregar perfil.'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load radar data
  React.useEffect(() => {
    if (!companyId) return

    async function load() {
      setDataLoading(true)
      setDataError(null)
      try {
        const result = await getPeriodRadar({
          companyId: companyId!,
          ownerId: selectedSellerId,
          dateStart,
          dateEnd,
        })
        setRadar(result)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro ao buscar dados do radar.'
        setDataError(msg)
      } finally {
        setDataLoading(false)
      }
    }
    void load()
  }, [companyId, selectedSellerId, dateStart, dateEnd])

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: DS.contentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: DS.textSecondary, fontSize: 13 }}>Carregando perfil...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: DS.contentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: DS.redText, fontSize: 13 }}>Erro: {error}</div>
      </div>
    )
  }

  const statusColor =
    radar?.status === 'favoravel' ? '#22c55e'
    : radar?.status === 'arriscado' ? '#ef4444'
    : '#fbbf24'

  const statusBg =
    radar?.status === 'favoravel' ? 'rgba(22,163,74,0.08)'
    : radar?.status === 'arriscado' ? 'rgba(239,68,68,0.08)'
    : 'rgba(245,158,11,0.08)'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: DS.contentBg,
        color: DS.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* HEADER com degradê azul */}
      <div
        style={{
          background: `linear-gradient(135deg, ${DS.blue}18 0%, ${DS.contentBg} 60%)`,
          borderBottom: `1px solid ${DS.border}`,
          padding: '28px 24px 24px',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            Radar do Período
          </h1>
          <p style={{ fontSize: 13, color: DS.textSecondary, margin: '0 auto 20px', maxWidth: 600 }}>
            Classificação do cenário atual como favorável, neutro ou arriscado — com base real, auditável e explicável.
          </p>

                              {/* Navegação de relatórios — dropdown agrupado */}
          <ReportNavDropdown currentPath="/dashboard/relatorios/radar" />
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 80px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>

          {/* Filters */}
          <div
            style={{
              background: DS.cardBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              padding: '14px 18px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-end',
              marginBottom: 28,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: DS.textLabel, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Data Início
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                style={{
                  background: DS.selectBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  color: DS.textPrimary,
                  padding: '8px 10px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: DS.textLabel, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                Data Fim
              </label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                style={{
                  background: DS.selectBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radius,
                  color: DS.textPrimary,
                  padding: '8px 10px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: DS.textLabel, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Vendedor
                </label>
                <select
                  value={selectedSellerId ?? ''}
                  onChange={(e) => setSelectedSellerId(e.target.value || null)}
                  style={{
                    background: DS.selectBg,
                    border: `1px solid ${DS.border}`,
                    borderRadius: DS.radius,
                    color: DS.textPrimary,
                    padding: '8px 10px',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Empresa toda</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ fontSize: 11, color: DS.textMuted, alignSelf: 'center' }}>
              Período histórico para comparação. O radar sempre avalia o momento atual (hoje).
            </div>
          </div>

          {/* Loading / Error */}
          {dataLoading && (
            <div style={{ textAlign: 'center', color: DS.textSecondary, padding: 20, fontSize: 13 }}>
              Calculando radar do período...
            </div>
          )}
          {dataError && (
            <div
              style={{
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: '3px solid #ef4444',
                borderRadius: DS.radius,
                padding: 14,
                color: DS.redText,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              Erro: {dataError}
            </div>
          )}

          {!dataLoading && radar && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

              {/* ================================================================ */}
              {/* BLOCO A — Status do Radar                                         */}
              {/* ================================================================ */}
              <section>
                <div
                  style={{
                    background: statusBg,
                    border: `1px solid ${statusColor}30`,
                    borderLeft: `4px solid ${statusColor}`,
                    borderRadius: DS.radiusContainer + 3,
                    padding: '28px 32px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {/* Status principal */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div
                      style={{
                        fontSize: 40,
                        fontWeight: 900,
                        color: statusColor,
                        letterSpacing: -1,
                        textTransform: 'uppercase',
                      }}
                    >
                      {radar.status_label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          padding: '3px 10px',
                          borderRadius: 20,
                          fontWeight: 700,
                          background:
                            radar.confidence === 'alta' ? 'rgba(22,163,74,0.15)'
                            : radar.confidence === 'moderada' ? 'rgba(217,119,6,0.15)'
                            : 'rgba(102,102,102,0.15)',
                          color:
                            radar.confidence === 'alta' ? '#4ade80'
                            : radar.confidence === 'moderada' ? '#fb923c'
                            : '#999',
                        }}
                      >
                        Confiança: {radar.confidence_label}
                      </div>
                    </div>
                  </div>

                  {/* Síntese operacional */}
                  <div
                    style={{
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: DS.textSecondary,
                      maxWidth: 700,
                      borderLeft: `3px solid ${statusColor}50`,
                      paddingLeft: 16,
                    }}
                  >
                    {radar.sintese_operacional}
                  </div>

                  {/* Metadados contextuais */}
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 4 }}>
                    {[
                      { label: 'Data de referência', value: radar.reference_date },
                      { label: 'Dia da semana', value: radar.current_weekday },
                      { label: 'Semana do mês', value: `${radar.current_month_week}ª semana` },
                      { label: 'Mês atual', value: radar.current_month },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 10, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary }}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Aviso confiança baixa */}
                  {radar.confidence === 'baixa' && (
                    <div
                      style={{
                        background: DS.amberBg,
                        border: `1px solid ${DS.amberBorder}`,
                        borderRadius: DS.radius,
                        padding: '10px 14px',
                        fontSize: 12,
                        color: DS.amberText,
                        marginTop: 4,
                      }}
                    >
                      ⚠️ Confiança baixa — menos de 2 sinais com base histórica suficiente. A
                      classificação foi conservadoramente definida como Neutro para evitar leituras
                      artificiais. Amplie o período de análise para melhorar a precisão.
                    </div>
                  )}
                </div>

                {/* Contadores de sinais */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                  {[
                    { label: 'Sinais disponíveis', value: radar.signals_available, color: DS.textPrimary },
                    { label: 'Positivos', value: radar.signals_positive, color: '#22c55e' },
                    { label: 'Negativos', value: radar.signals_negative, color: '#ef4444' },
                    { label: 'Neutros', value: radar.signals_neutral, color: '#fbbf24' },
                    { label: 'Indisponíveis', value: radar.signals_unavailable, color: DS.textMuted },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        background: DS.cardBg,
                        border: `1px solid ${DS.border}`,
                        borderRadius: DS.radius,
                        padding: '8px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        minWidth: 100,
                      }}
                    >
                      <span style={{ fontSize: 10, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                        {item.label}
                      </span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: item.color }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ================================================================ */}
              {/* BLOCO B — Sinais do Radar                                         */}
              {/* ================================================================ */}
              <section>
                <h2
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: DS.blueSoft,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: 14,
                  }}
                >
                  Sinais do Radar
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 12,
                  }}
                >
                  {radar.signals.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              </section>

              {/* ================================================================ */}
              {/* BLOCO C — Motivos Principais                                       */}
              {/* ================================================================ */}
              {radar.reasons.length > 0 && (
                <section>
                  <h2
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: DS.blueSoft,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: 14,
                    }}
                  >
                    Motivos Principais
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {radar.reasons.map((reason, i) => (
                      <ReasonItem key={reason.signal_id} reason={reason} index={i} />
                    ))}
                  </div>
                </section>
              )}

              {/* ================================================================ */}
              {/* BLOCO D — Diagnóstico Completo                                    */}
              {/* ================================================================ */}
              <section>
                <h2
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: DS.blueSoft,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: 14,
                  }}
                >
                  Diagnóstico Completo
                </h2>
                <div
                  style={{
                    background: DS.cardBg,
                    border: `1px solid ${DS.border}`,
                    borderRadius: DS.radiusContainer,
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {/* Diagnóstico textual */}
                  <pre
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: DS.textSecondary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                    }}
                  >
                    {radar.diagnostico}
                  </pre>

                  {/* Grid de metadados */}
                  <div
                    style={{
                      borderTop: `1px solid ${DS.border}`,
                      paddingTop: 14,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {[
                      { label: 'Período analisado', value: `${radar.period_start} a ${radar.period_end}` },
                      { label: 'Sinais disponíveis', value: `${radar.signals_available} de ${radar.signals.length}` },
                      { label: 'Sinais positivos', value: String(radar.signals_positive) },
                      { label: 'Sinais negativos', value: String(radar.signals_negative) },
                      { label: 'Confiança geral', value: radar.confidence_label },
                      { label: 'Status classificado', value: radar.status_label },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 10, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 13, color: DS.textSecondary, fontWeight: 600 }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Nota de fonte */}
                  <div
                    style={{
                      borderTop: `1px solid ${DS.border}`,
                      paddingTop: 12,
                      fontSize: 11,
                      color: DS.textMuted,
                      lineHeight: 1.5,
                    }}
                  >
                    Fontes: sales_cycles.first_worked_at (prospecção/trabalho), sales_cycles.won_at +
                    won_total (ganhos/faturamento), sales_cycles.status (pipeline ativo). Dados
                    agregados no client-side. O score interno é usado apenas para classificação e não é
                    exibido ao usuário.
                  </div>
                </div>
              </section>
            </div>
          )}

          {!dataLoading && !radar && !dataError && (
            <div style={{ textAlign: 'center', color: DS.textMuted, padding: 40, fontSize: 13 }}>
              Selecione um período para calcular o radar.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}