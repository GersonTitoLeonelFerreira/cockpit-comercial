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
  const dirColor =
    signal.direction === 'positivo' ? '#22c55e'
    : signal.direction === 'negativo' ? '#ef4444'
    : '#fbbf24'

  const borderColor = signal.available ? dirColor + '44' : '#333'

  return (
    <div
      style={{
        background: '#0f0f0f',
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: signal.available ? 1 : 0.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {signal.available ? (
          <DirectionIcon direction={signal.direction} />
        ) : (
          <span style={{ color: '#666', fontSize: 18 }}>–</span>
        )}
        <span style={{ fontWeight: 700, fontSize: 14, color: signal.available ? 'white' : '#888' }}>
          {signal.label}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 20,
            background:
              signal.confidence === 'alta' ? '#16a34a33'
              : signal.confidence === 'moderada' ? '#d9770633'
              : '#66666633',
            color:
              signal.confidence === 'alta' ? '#4ade80'
              : signal.confidence === 'moderada' ? '#fb923c'
              : '#999',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {signal.confidence}
        </span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
        {signal.available ? signal.description : signal.fallback_reason}
      </div>
      <div style={{ fontSize: 10, opacity: 0.45, marginTop: 2 }}>
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
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 8,
      }}
    >
      <span
        style={{
          minWidth: 22,
          height: 22,
          borderRadius: '50%',
          background: '#1a1a1a',
          border: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#666',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      <DirectionIcon direction={reason.direction} />
      <span style={{ fontSize: 13, lineHeight: 1.5, color: '#ccc' }}>{reason.text}</span>
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

  const navLinkBase: React.CSSProperties = {
    color: '#9aa',
    textDecoration: 'none',
    fontSize: 13,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #333',
    background: 'transparent',
  }

  const navLinkActive: React.CSSProperties = {
    ...navLinkBase,
    color: 'white',
    background: '#111',
  }

  if (loading) {
    return <div style={{ padding: 40, color: 'white', opacity: 0.7 }}>Carregando perfil...</div>
  }

  if (error) {
    return <div style={{ padding: 40, color: '#ef4444' }}>Erro: {error}</div>
  }

  const statusColor =
    radar?.status === 'favoravel' ? '#22c55e'
    : radar?.status === 'arriscado' ? '#ef4444'
    : '#fbbf24'

  const statusBg =
    radar?.status === 'favoravel' ? '#052e1622'
    : radar?.status === 'arriscado' ? '#450a0a22'
    : '#451a0322'

  return (
    <div style={{ width: '100%', padding: 40, color: 'white' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Radar do Período</h1>
      <p
        style={{
          textAlign: 'center',
          fontSize: 13,
          opacity: 0.5,
          marginBottom: 20,
          maxWidth: 600,
          margin: '0 auto 20px',
        }}
      >
        Classificação do cenário atual como favorável, neutro ou arriscado — com base real,
        auditável e explicável.
      </p>

      {/* Sub-navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginTop: 10,
          marginBottom: 30,
          flexWrap: 'wrap',
        }}
      >
        <a href="/relatorios" style={navLinkBase} title="Hub de Relatórios">
          Relatórios
        </a>
        <a href="/dashboard/relatorios/produto" style={navLinkBase} title="Performance por Produto">
          Performance por Produto
        </a>
        <a
          href="/dashboard/relatorios/dia-semana"
          style={navLinkBase}
          title="Sazonalidade por dia da semana"
        >
          Dia da Semana
        </a>
        <a
          href="/dashboard/relatorios/semana-mes"
          style={navLinkBase}
          title="Sazonalidade por semana do mês"
        >
          Semana do Mês
        </a>
        <a href="/dashboard/relatorios/mes" style={navLinkBase} title="Sazonalidade mensal">
          Mês
        </a>
        <a
          href="/dashboard/relatorios/radar"
          style={navLinkActive}
          title="Radar do Período"
        >
          🎯 Radar
        </a>
      </div>

      {/* Filters */}
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto 28px',
          background: '#0f0f0f',
          border: '1px solid #202020',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
            Data Início
          </label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              color: 'white',
              padding: '8px 10px',
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
            Data Fim
          </label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            style={{
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              color: 'white',
              padding: '8px 10px',
              fontSize: 13,
            }}
          />
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
              Vendedor
            </label>
            <select
              value={selectedSellerId ?? ''}
              onChange={(e) => setSelectedSellerId(e.target.value || null)}
              style={{
                background: '#111',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                padding: '8px 10px',
                fontSize: 13,
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

        <div style={{ fontSize: 11, opacity: 0.45, alignSelf: 'center' }}>
          Período histórico para comparação. O radar sempre avalia o momento atual (hoje).
        </div>
      </div>

      {/* Loading / Error */}
      {dataLoading && (
        <div style={{ textAlign: 'center', opacity: 0.6, padding: 20 }}>
          Calculando radar do período...
        </div>
      )}
      {dataError && (
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto 20px',
            background: '#450a0a',
            border: '1px solid #ef4444',
            borderRadius: 10,
            padding: 14,
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          Erro: {dataError}
        </div>
      )}

      {!dataLoading && radar && (
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ================================================================ */}
          {/* BLOCO A — Status do Radar                                         */}
          {/* ================================================================ */}
          <section>
            <div
              style={{
                background: statusBg,
                border: `2px solid ${statusColor}44`,
                borderRadius: 16,
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
                      background:
                        radar.confidence === 'alta' ? '#16a34a33'
                        : radar.confidence === 'moderada' ? '#d9770633'
                        : '#66666633',
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
                  color: '#ddd',
                  maxWidth: 700,
                  borderLeft: `3px solid ${statusColor}66`,
                  paddingLeft: 16,
                }}
              >
                {radar.sintese_operacional}
              </div>

              {/* Metadados contextuais */}
              <div
                style={{
                  display: 'flex',
                  gap: 24,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                {[
                  { label: 'Data de referência', value: radar.reference_date },
                  { label: 'Dia da semana', value: radar.current_weekday },
                  { label: 'Semana do mês', value: `${radar.current_month_week}ª semana` },
                  { label: 'Mês atual', value: radar.current_month },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Aviso confiança baixa */}
              {radar.confidence === 'baixa' && (
                <div
                  style={{
                    background: '#2a2000',
                    border: '1px solid #fbbf2444',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#fbbf24',
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
            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              {[
                { label: 'Sinais disponíveis', value: radar.signals_available, color: '#e8e8e8' },
                { label: 'Positivos', value: radar.signals_positive, color: '#22c55e' },
                { label: 'Negativos', value: radar.signals_negative, color: '#ef4444' },
                { label: 'Neutros', value: radar.signals_neutral, color: '#fbbf24' },
                { label: 'Indisponíveis', value: radar.signals_unavailable, color: '#555' },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #202020',
                    borderRadius: 8,
                    padding: '8px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    minWidth: 100,
                  }}
                >
                  <span style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
                fontSize: 16,
                fontWeight: 700,
                color: '#bbb',
                textTransform: 'uppercase',
                letterSpacing: 1,
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
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#bbb',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
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
                fontSize: 16,
                fontWeight: 700,
                color: '#bbb',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 14,
              }}
            >
              Diagnóstico Completo
            </h2>
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 12,
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
                  color: '#aaa',
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
                  borderTop: '1px solid #1e1e1e',
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
                    <span style={{ fontSize: 10, opacity: 0.45, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 13, color: '#ccc', fontWeight: 600 }}>{item.value}</span>
                  </div>
                ))}
              </div>

              {/* Nota de fonte */}
              <div
                style={{
                  borderTop: '1px solid #1e1e1e',
                  paddingTop: 12,
                  fontSize: 11,
                  opacity: 0.4,
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
        <div style={{ textAlign: 'center', opacity: 0.5, padding: 40 }}>
          Selecione um período para calcular o radar.
        </div>
      )}
    </div>
  )
}
