'use client'

import * as React from 'react'
import {
  adminListSellersStats,
  adminUpdateSellerAccess,
  type AdminSellerStatsRow,
} from '@/app/lib/services/admin-sellers'

type Tab = 'cadastro' | 'metricas'
type Role = 'member' | 'manager' | 'admin'

function toBRDateTime(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR')
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-black text-white/60">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-black text-white/60">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-white/50">{hint}</div> : null}
    </label>
  )
}

export default function SellerDetailsClient({ sellerId }: { sellerId: string }) {
  const [tab, setTab] = React.useState<Tab>('cadastro')

  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [row, setRow] = React.useState<AdminSellerStatsRow | null>(null)

  // form state (editar cadastro/permissões)
  const [fullName, setFullName] = React.useState('')
  const [role, setRole] = React.useState<Role>('member')
  const [isActive, setIsActive] = React.useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // usando o mesmo endpoint da listagem por enquanto
      const data = await adminListSellersStats(90)
      const found = data.find((r) => r.seller_id === sellerId) ?? null
      setRow(found)

      if (!found) {
        setError('Vendedor não encontrado.')
        return
      }

      setFullName(found.full_name ?? '')
      setRole((found.role as Role) ?? 'member')
      setIsActive(!!found.is_active)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar vendedor.')
      setRow(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId])

  async function salvarAcesso() {
    if (!row) return
    setSaving(true)
    setError(null)
    try {
      // hoje seu backend já tem um método para update de role/isActive
      await adminUpdateSellerAccess({
        sellerId: row.seller_id,
        role,
        isActive,
      })

      // Observação: full_name ainda não está sendo persistido aqui,
      // porque não temos um endpoint "adminUpdateSellerProfile".
      // Mesmo assim, deixo o campo no form para já preparar a UX.
      // Se você quiser, eu crio o endpoint e salva full_name também.
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar alterações.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActiveQuick() {
    if (!row) return
    const next = !row.is_active
    const label = row.full_name ?? row.email ?? row.seller_id
    if (!confirm(`${next ? 'Ativar' : 'Desativar'} ${label}?`)) return

    setSaving(true)
    setError(null)
    try {
      await adminUpdateSellerAccess({
        sellerId: row.seller_id,
        role: (row.role as Role) ?? 'member',
        isActive: next,
      })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao atualizar acesso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="text-white">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/admin/vendedores" className="text-sm text-white/60 hover:text-white">
            ← Voltar
          </a>

          <h1 className="mt-2 text-2xl font-black">
            {row?.full_name ?? (loading ? 'Carregando…' : '—')}
          </h1>
          <div className="mt-1 text-sm text-white/70">{row?.email ?? ''}</div>

          {row ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">
                Role: {row.role ?? '—'}
              </span>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-black ${
                  row.is_active
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/20 bg-red-500/10 text-red-200'
                }`}
              >
                {row.is_active ? 'Ativo' : 'Inativo'}
              </span>

              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white/70">
                Última atividade: {toBRDateTime(row.last_activity_at)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black hover:bg-white/10 disabled:opacity-60"
            disabled={loading || saving}
          >
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>

          <button
            onClick={toggleActiveQuick}
            disabled={!row || loading || saving}
            className={`h-10 rounded-xl border px-4 text-sm font-black disabled:opacity-60 ${
              row?.is_active
                ? 'border-red-500/20 bg-red-500/10 hover:bg-red-500/15 text-red-100'
                : 'border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-100'
            }`}
          >
            {row?.is_active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex w-full gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
        <button
          type="button"
          onClick={() => setTab('cadastro')}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-black ${
            tab === 'cadastro' ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
        >
          Cadastro
        </button>
        <button
          type="button"
          onClick={() => setTab('metricas')}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-black ${
            tab === 'metricas' ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
        >
          Métricas (opcional)
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Cadastro */}
      {tab === 'cadastro' ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-black">Dados do vendedor</div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Nome"
                hint="(Ainda não está salvando no banco — se você quiser eu crio o endpoint para persistir.)"
              >
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-emerald-400/40"
                />
              </Field>

              <Field label="Email" hint="Email vem do Auth; normalmente não editamos por aqui.">
                <input
                  value={row?.email ?? ''}
                  disabled
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/70 opacity-80"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-black">Acesso e permissões</div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Role">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
                >
                  <option value="member">member (vendedor)</option>
                  <option value="manager">manager (gestor)</option>
                  <option value="admin">admin</option>
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(e) => setIsActive(e.target.value === 'active')}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </Field>

              <div className="flex items-end">
                <button
                  onClick={salvarAcesso}
                  disabled={!row || saving || loading}
                  className="h-11 w-full rounded-xl bg-emerald-500 px-4 text-sm font-black text-black hover:bg-emerald-400 disabled:opacity-60"
                >
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Métricas (secundário) */}
      {tab === 'metricas' && row ? (
        <div className="mt-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-black text-white/80">Métricas (secundário)</div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Carteira (ciclos ativos)" value={row.active_cycles_count} />
              <StatCard label="Novo" value={row.novo_count} />
              <StatCard label="Contato" value={row.contato_count} />
              <StatCard label="Respondeu" value={row.respondeu_count} />
              <StatCard label="Negociação" value={row.negociacao_count} />
              <StatCard
                label="Ganhos / Perdidos"
                value={
                  <span>
                    {row.ganho_count_period} / {row.perdido_count_period}
                  </span>
                }
              />
            </div>
            <div className="mt-3 text-xs text-white/50">
              As métricas já existem em outro lugar; aqui ficam só como referência.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}