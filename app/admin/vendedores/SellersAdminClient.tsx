'use client'

import * as React from 'react'
import {
  adminListSellersStats,
  adminUpdateSellerAccess,
  type AdminSellerStatsRow,
} from '@/app/lib/services/admin-sellers'

type FilterActive = 'all' | 'active' | 'inactive'

function toBRDateTime(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR')
}

export default function SellersAdminClient() {
  const [q, setQ] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<FilterActive>('active')
  const [days, setDays] = React.useState<7 | 30 | 90>(30)

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<AdminSellerStatsRow[]>([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await adminListSellersStats(days)
      setRows(data)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar vendedores.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase()

    return rows.filter((r) => {
      const name = (r.full_name ?? '').toLowerCase()
      const email = (r.email ?? '').toLowerCase()

      const matchQ = !qq || name.includes(qq) || email.includes(qq)
      const matchActive =
        activeFilter === 'all' ? true : activeFilter === 'active' ? r.is_active : !r.is_active

      return matchQ && matchActive
    })
  }, [rows, q, activeFilter])

  async function toggleActive(r: AdminSellerStatsRow) {
    const next = !r.is_active
    const label = r.full_name ?? r.email ?? r.seller_id

    if (!confirm(`${next ? 'Ativar' : 'Desativar'} ${label}?`)) return

    try {
      await adminUpdateSellerAccess({
        sellerId: r.seller_id,
        role: r.role ?? 'member',
        isActive: next,
      })
      await load()
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao atualizar acesso.')
    }
  }

  return (
    <div className="text-white">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome/email..."
          className="h-10 w-full sm:w-[320px] rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-emerald-400/40"
        />

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as FilterActive)}
          className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>

        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value) as any)}
          className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
        >
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
        </select>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-black hover:bg-white/10 disabled:opacity-60"
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>

        <a
          href="/admin/vendedores/novo"
          className="ml-auto inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-black text-black hover:bg-emerald-400"
        >
          + Cadastrar vendedor
        </a>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <div className="min-w-[860px]">
            <div
              className="grid border-b border-white/10 bg-white/5 px-4 py-3 text-xs font-black text-white/70"
              style={{ gridTemplateColumns: '260px 1fr 110px 110px 190px 220px' }}
            >
              <div>Nome</div>
              <div>Email</div>
              <div>Role</div>
              <div>Status</div>
              <div>Última atividade</div>
              <div className="text-right">Ações</div>
            </div>

            {filtered.map((r) => (
              <div
                key={r.seller_id}
                className="grid items-center border-b border-white/5 px-4 py-3 text-sm"
                style={{ gridTemplateColumns: '260px 1fr 110px 110px 190px 220px' }}
              >
                <a
                  href={`/admin/vendedores/${r.seller_id}`}
                  className="font-black truncate hover:underline"
                  title={r.full_name ?? r.email ?? ''}
                >
                  {r.full_name ?? '—'}
                </a>

                <div className="truncate text-white/75" title={r.email ?? ''}>
                  {r.email ?? '—'}
                </div>

                <div className="whitespace-nowrap">{r.role ?? '—'}</div>

                <div className="whitespace-nowrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-black ${
                      r.is_active
                        ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/20'
                        : 'bg-red-500/15 text-red-200 border border-red-500/20'
                    }`}
                  >
                    {r.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="whitespace-nowrap text-white/70 text-xs">
                  {toBRDateTime(r.last_activity_at)}
                </div>

                <div className="flex justify-end gap-2">
                  <a
                    href={`/admin/vendedores/${r.seller_id}`}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10 whitespace-nowrap"
                  >
                    Ver detalhes
                  </a>

                  <button
                    onClick={() => void toggleActive(r)}
                    className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-black whitespace-nowrap ${
                      r.is_active
                        ? 'border-red-500/20 bg-red-500/10 hover:bg-red-500/15 text-red-100'
                        : 'border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-100'
                    }`}
                  >
                    {r.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}

            {!loading && filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-white/60">Nenhum vendedor encontrado.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}