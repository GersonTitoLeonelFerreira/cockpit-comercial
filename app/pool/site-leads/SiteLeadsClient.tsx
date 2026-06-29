'use client'

import * as React from 'react'
import Link from 'next/link'

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blueSoft: '#bfdbfe',
  blueBg: 'rgba(59,130,246,0.10)',
  blueBorder: 'rgba(59,130,246,0.30)',
  greenBg: 'rgba(22,163,74,0.10)',
  greenBorder: 'rgba(34,197,94,0.25)',
  greenText: '#86efac',
  amberBg: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.30)',
  amberText: '#fef3c7',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.30)',
  redText: '#fca5a5',
  radius: 7,
  radiusContainer: 10,
} as const

const PAGE_SIZE = 30

type AssignedTo = {
  id: string
  name: string
}

type SiteLead = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  status: string
  lead_origin_at: string | null
  created_at: string
  owner_id: string | null
  assigned_to: AssignedTo | null
}

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    novo: 'Novo',
    contato: 'Contato',
    respondeu: 'Agenda',
    negociacao: 'Negociação',
    ganho: 'Ganho',
    perdido: 'Perdido',
  }

  return labels[status] ?? status
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export default function SiteLeadsClient() {
  const [keys, setKeys] = React.useState<ApiKey[]>([])
  const [items, setItems] = React.useState<SiteLead[]>([])
  const [total, setTotal] = React.useState(0)
  const [waitingCount, setWaitingCount] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [showCreateKey, setShowCreateKey] = React.useState(false)
  const [keyName, setKeyName] = React.useState('')
  const [creatingKey, setCreatingKey] = React.useState(false)
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null)
  const [revealedKeyName, setRevealedKeyName] = React.useState<string | null>(null)
  const [revokingId, setRevokingId] = React.useState<string | null>(null)
  const [baseUrl, setBaseUrl] = React.useState('')

  React.useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  const loadData = React.useCallback(async (targetPage = 1) => {
    setLoading(true)
    setError(null)

    try {
      const [keysResponse, leadsResponse] = await Promise.all([
        fetch('/api/pool/site-leads/api-keys', { cache: 'no-store' }),
        fetch(`/api/pool/site-leads?page=${targetPage}&page_size=${PAGE_SIZE}`, { cache: 'no-store' }),
      ])

      const keysJson = (await keysResponse.json()) as { ok?: boolean; error?: string; keys?: ApiKey[] }
      const leadsJson = (await leadsResponse.json()) as {
        ok?: boolean
        error?: string
        items?: SiteLead[]
        total?: number
        waiting_count?: number
        hasMore?: boolean
      }

      if (!keysResponse.ok || !keysJson.ok) {
        throw new Error(keysJson.error ?? 'Erro ao carregar as chaves de integração.')
      }

      if (!leadsResponse.ok || !leadsJson.ok) {
        throw new Error(leadsJson.error ?? 'Erro ao carregar os leads recebidos pelo site.')
      }

      setKeys(keysJson.keys ?? [])
      setItems(leadsJson.items ?? [])
      setTotal(leadsJson.total ?? 0)
      setWaitingCount(leadsJson.waiting_count ?? 0)
      setHasMore(leadsJson.hasMore ?? false)
      setPage(targetPage)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Erro ao carregar a integração do site.'))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadData(1)
  }, [loadData])

  const activeKeys = React.useMemo(() => keys.filter((key) => !key.revoked_at), [keys])
  const distributedCount = Math.max(0, total - waitingCount)
  const endpoint = `${baseUrl || 'https://seu-dominio.yolen.app'}/api/public/site-leads`
  const example = `fetch('${endpoint}', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'X-Yolen-Api-Key': 'SUA_CHAVE_AQUI'\n  },\n  body: JSON.stringify({\n    name: 'João Silva',\n    phone: '47999999999',\n    email: 'joao@email.com',\n    external_id: 'formulario-12345',\n    form_name: 'Contato do site',\n    page_url: 'https://seusite.com/contato',\n    utm_source: 'google',\n    utm_campaign: 'campanha-junho'\n  })\n})`

  async function handleCreateKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = keyName.trim()

    if (!name) {
      setError('Informe um nome para identificar o site ou formulário.')
      return
    }

    setCreatingKey(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/pool/site-leads/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = (await response.json()) as { ok?: boolean; error?: string; api_key?: string }

      if (!response.ok || !json.ok || !json.api_key) {
        throw new Error(json.error ?? 'Não foi possível gerar a chave de integração.')
      }

      setRevealedKey(json.api_key)
      setRevealedKeyName(name)
      setKeyName('')
      setShowCreateKey(false)
      setSuccess('Chave criada. Copie e armazene agora: ela não será exibida novamente.')
      await loadData(1)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível gerar a chave de integração.'))
    } finally {
      setCreatingKey(false)
    }
  }

  async function handleRevokeKey(key: ApiKey) {
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/pool/site-leads/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key.id }),
      })
      const json = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? 'Não foi possível revogar a chave.')
      }

      setRevokingId(null)
      setSuccess(`A chave “${key.name}” foi revogada. O site não poderá mais enviar leads por ela.`)
      await loadData(page)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível revogar a chave.'))
    }
  }

  return (
    <div style={{ minHeight: '100%', background: DS.contentBg, color: DS.textPrimary }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Leads do site</h1>
          <p style={{ margin: '6px 0 0', maxWidth: 720, color: DS.textSecondary, fontSize: 13, lineHeight: 1.45 }}>
            Entradas por formulário, landing page ou qualquer site integrado. Cada lead é entregue automaticamente a um vendedor ativo e aparece no início do Kanban em <strong style={{ color: DS.blueSoft }}>Novo</strong>.
          </p>
        </div>
        <button type="button" onClick={() => { setShowCreateKey((current) => !current); setError(null) }} style={primaryButtonStyle}>
          + Conectar site
        </button>
      </header>

      <section style={{ marginBottom: 16, padding: 14, borderRadius: DS.radiusContainer, border: `1px solid ${DS.blueBorder}`, background: DS.blueBg }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: DS.blueSoft }}>Distribuição automática ativa</div>
        <div style={{ marginTop: 4, fontSize: 12, color: DS.textSecondary, lineHeight: 1.45 }}>
          O sistema faz rodízio entre vendedores ativos. O Pool só é usado como contingência quando não há nenhum vendedor elegível para receber o lead.
        </div>
      </section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {revealedKey ? (
        <section style={{ marginBottom: 16, padding: 16, borderRadius: DS.radiusContainer, border: `1px solid ${DS.blueBorder}`, background: DS.blueBg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <strong style={{ fontSize: 13, color: DS.blueSoft }}>Chave pronta para {revealedKeyName}</strong>
              <div style={{ marginTop: 4, fontSize: 12, color: DS.textSecondary }}>Esta é a única vez em que a chave completa será exibida.</div>
            </div>
            <button type="button" onClick={() => { void copyText(revealedKey).then((copied) => setSuccess(copied ? 'Chave copiada.' : 'Não foi possível copiar automaticamente. Copie o valor manualmente.')) }} style={secondaryButtonStyle}>
              Copiar chave
            </button>
          </div>
          <code style={codeStyle}>{revealedKey}</code>
          <button type="button" onClick={() => setRevealedKey(null)} style={linkButtonStyle}>Já copiei a chave. Ocultar agora.</button>
        </section>
      ) : null}

      {showCreateKey ? (
        <section style={sectionStyle}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>Nova conexão</div>
          <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 14 }}>Dê um nome que identifique a origem. Ex.: Site institucional, Landing Page de verão ou Formulário de avaliação.</div>
          <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input autoFocus value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={80} placeholder="Nome da conexão" style={inputStyle} />
            <button type="submit" disabled={creatingKey || !keyName.trim()} style={{ ...primaryButtonStyle, opacity: creatingKey || !keyName.trim() ? 0.55 : 1 }}>
              {creatingKey ? 'Gerando...' : 'Gerar chave'}
            </button>
            <button type="button" onClick={() => setShowCreateKey(false)} disabled={creatingKey} style={secondaryButtonStyle}>Cancelar</button>
          </form>
        </section>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        <MetricCard label="Leads recebidos" value={String(total)} />
        <MetricCard label="Entregues a vendedores" value={String(distributedCount)} tone="success" />
        <MetricCard label="Contingência no Pool" value={String(waitingCount)} tone={waitingCount > 0 ? 'warning' : 'neutral'} />
        <MetricCard label="Conexões ativas" value={String(activeKeys.length)} />
      </section>

      <section style={{ ...sectionStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Contrato da API</div>
            <div style={{ marginTop: 4, fontSize: 12, color: DS.textSecondary }}>Chame pelo servidor do site, automação ou backend. Nunca exponha a chave em JavaScript público no navegador.</div>
          </div>
          <button type="button" onClick={() => { void copyText(example).then((copied) => setSuccess(copied ? 'Exemplo copiado.' : 'Não foi possível copiar automaticamente.')) }} style={secondaryButtonStyle}>Copiar exemplo</button>
        </div>
        <code style={{ ...codeStyle, whiteSpace: 'pre', lineHeight: 1.55 }}>{example}</code>
      </section>

      <section style={{ ...sectionStyle, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Conexões do site</div>
        <div style={{ marginTop: 4, marginBottom: 12, fontSize: 12, color: DS.textSecondary }}>A chave identifica a origem do lead e pode ser revogada sem afetar as outras conexões.</div>
        {keys.length === 0 ? (
          <div style={{ color: DS.textSecondary, fontSize: 12 }}>Nenhuma chave foi criada. Conecte o primeiro site para liberar a API.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {keys.map((key) => (
              <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 12, borderRadius: DS.radius, border: `1px solid ${DS.border}`, background: DS.panelBg }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{key.name}</span>
                    <StatusChip revoked={Boolean(key.revoked_at)} />
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, color: DS.textMuted }}>{key.key_prefix}•••• · criada em {formatDateTime(key.created_at)} · {key.last_used_at ? `último uso ${formatDateTime(key.last_used_at)}` : 'ainda sem uso'}</div>
                </div>
                {!key.revoked_at ? (revokingId === key.id ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => void handleRevokeKey(key)} style={dangerButtonStyle}>Confirmar revogação</button>
                    <button type="button" onClick={() => setRevokingId(null)} style={secondaryButtonStyle}>Cancelar</button>
                  </div>
                ) : <button type="button" onClick={() => setRevokingId(key.id)} style={dangerButtonStyle}>Revogar</button>) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ borderRadius: DS.radiusContainer, border: `1px solid ${DS.border}`, overflow: 'hidden', background: DS.surfaceBg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', borderBottom: `1px solid ${DS.border}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Acompanhamento dos leads recebidos</div>
            <div style={{ marginTop: 4, fontSize: 12, color: DS.textSecondary }}>Confira quem recebeu cada lead. Os que ficaram sem vendedor aparecem como contingência no Pool.</div>
          </div>
          {waitingCount > 0 ? <Link href="/pool" style={{ color: DS.amberText, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>Abrir contingência do Pool →</Link> : null}
        </div>

        {loading ? <div style={{ padding: 24, color: DS.textSecondary, fontSize: 12 }}>Carregando leads recebidos...</div> : items.length === 0 ? (
          <div style={{ padding: 24, color: DS.textSecondary, fontSize: 12 }}>Nenhum lead foi recebido por integração ainda.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
              <thead><tr>{['Lead', 'Origem', 'Vendedor', 'Etapa', 'Recebido em', 'Ação'].map((label) => <th key={label} style={headerCellStyle}>{label}</th>)}</tr></thead>
              <tbody>
                {items.map((lead) => (
                  <tr key={lead.id}>
                    <td style={tableCellStrong}>{lead.name}<div style={{ marginTop: 3, fontWeight: 500, color: DS.textMuted, fontSize: 11 }}>{lead.phone || lead.email || 'Sem contato'}</div></td>
                    <td style={tableCell}>{lead.source || 'Integração do site'}</td>
                    <td style={tableCell}>{lead.assigned_to ? <span style={{ color: DS.greenText, fontWeight: 800 }}>{lead.assigned_to.name}</span> : <span style={{ color: DS.amberText, fontWeight: 800 }}>No Pool</span>}</td>
                    <td style={tableCell}>{statusLabel(lead.status)}</td>
                    <td style={tableCell}>{formatDateTime(lead.lead_origin_at ?? lead.created_at)}</td>
                    <td style={tableCell}><Link href={`/sales-cycles/${lead.id}`} style={{ color: DS.blueSoft, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>Abrir ciclo</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 14, borderTop: `1px solid ${DS.border}` }}>
          <span style={{ color: DS.textMuted, fontSize: 12 }}>Página {page}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={loading || page <= 1} onClick={() => void loadData(page - 1)} style={secondaryButtonStyle}>Anterior</button>
            <button type="button" disabled={loading || !hasMore} onClick={() => void loadData(page + 1)} style={secondaryButtonStyle}>Próxima</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const success = tone === 'success'
  return <div style={{ marginBottom: 14, padding: '11px 13px', borderRadius: DS.radius, border: `1px solid ${success ? DS.greenBorder : DS.redBorder}`, background: success ? DS.greenBg : DS.redBg, color: success ? DS.greenText : DS.redText, fontSize: 12 }}>{children}</div>
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warning' }) {
  const color = tone === 'success' ? DS.greenText : tone === 'warning' ? DS.amberText : DS.textPrimary
  return <div style={{ padding: 14, borderRadius: DS.radiusContainer, border: `1px solid ${DS.border}`, background: DS.panelBg }}><div style={{ fontSize: 11, color: DS.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color }}>{value}</div></div>
}

function StatusChip({ revoked }: { revoked: boolean }) {
  return <span style={{ padding: '3px 7px', borderRadius: 999, background: revoked ? DS.redBg : DS.greenBg, color: revoked ? DS.redText : DS.greenText, fontSize: 10, fontWeight: 800 }}>{revoked ? 'REVOGADA' : 'ATIVA'}</span>
}

const sectionStyle: React.CSSProperties = { padding: 16, borderRadius: DS.radiusContainer, border: `1px solid ${DS.border}`, background: DS.surfaceBg }
const codeStyle: React.CSSProperties = { display: 'block', overflowX: 'auto', padding: 14, borderRadius: DS.radius, background: '#080a0e', color: '#cbd5e1', fontSize: 12 }
const inputStyle: React.CSSProperties = { flex: '1 1 260px', minHeight: 40, padding: '0 12px', borderRadius: DS.radius, border: `1px solid ${DS.border}`, background: DS.panelBg, color: DS.textPrimary, outline: 'none', fontSize: 12 }
const primaryButtonStyle: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: DS.radius, border: `1px solid ${DS.greenBorder}`, background: DS.greenBg, color: DS.greenText, cursor: 'pointer', fontWeight: 800, fontSize: 12 }
const secondaryButtonStyle: React.CSSProperties = { minHeight: 36, padding: '0 11px', borderRadius: DS.radius, border: `1px solid ${DS.border}`, background: DS.panelBg, color: DS.textSecondary, cursor: 'pointer', fontWeight: 800, fontSize: 11 }
const dangerButtonStyle: React.CSSProperties = { minHeight: 36, padding: '0 10px', borderRadius: DS.radius, border: `1px solid ${DS.redBorder}`, background: DS.redBg, color: DS.redText, cursor: 'pointer', fontWeight: 800, fontSize: 11 }
const linkButtonStyle: React.CSSProperties = { marginTop: 10, padding: 0, border: 0, background: 'transparent', color: DS.textSecondary, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }
const headerCellStyle: React.CSSProperties = { textAlign: 'left', padding: '11px 16px', color: DS.textMuted, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, borderBottom: `1px solid ${DS.border}` }
const tableCell: React.CSSProperties = { padding: '13px 16px', borderBottom: `1px solid ${DS.border}`, color: DS.textSecondary, fontSize: 12 }
const tableCellStrong: React.CSSProperties = { ...tableCell, color: DS.textPrimary, fontWeight: 800 }
