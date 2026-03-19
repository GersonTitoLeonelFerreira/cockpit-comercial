'use client'

import * as React from 'react'

type PessoaTipo = 'fisica' | 'juridica' | 'estrangeiro'
type Role = 'member' | 'manager' | 'admin'

type SellerGetResponse = {
  ok: true
  profile: {
    id: string
    role: Role | string | null
    full_name: string | null
    email: string | null
    phone: string | null
    job_title: string | null
    status: string | null
    username: string | null
    cpf: string | null
    birth_date: string | null
    is_active: boolean | null
    created_at: string | null
  }
  details: null | {
    profile_id: string
    tipo_pessoa: PessoaTipo
    legal_name: string
    birth_date: string
    cpf: string
    nacionalidade: string | null
    naturalidade: string | null
    rg: string | null
    orgao_emissor: string | null
    estado_emissao: string | null
    sexo_biologico: string | null
    genero: string | null
    estado_civil: string | null
    profissao: string | null
    grau_instrucao: string | null
    contato_emergencia: string | null
    telefone_emergencia: string | null
    pais: string | null
    estado: string | null
    cidade: string | null
    logradouro: string | null
    numero: string | null
    cep?: string | null
    web_page: string | null
  }
}

function onlyDigits(s: string) {
  return (s ?? '').replace(/\D/g, '')
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-emerald-400/40 disabled:opacity-70 ${props.className ?? ''}`}
    />
  )
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none focus:border-emerald-400/40 disabled:opacity-70 ${props.className ?? ''}`}
    />
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-black text-white/60">{label}</div>
      {children}
    </label>
  )
}

export default function SellerEditClient({ sellerId }: { sellerId: string }) {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<SellerGetResponse | null>(null)

  // profiles
  const [fullName, setFullName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [jobTitle, setJobTitle] = React.useState('')
  const [role, setRole] = React.useState<Role>('member')
  const [isActive, setIsActive] = React.useState(true)

  // details
  const [legalName, setLegalName] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')

  // init-only (quando details não existe)
  const [initTipoPessoa, setInitTipoPessoa] = React.useState<PessoaTipo>('fisica')
  const [initCpf, setInitCpf] = React.useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/sellers/${sellerId}`, { method: 'GET' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Erro ao carregar (HTTP ${res.status})`)

      const payload = json as SellerGetResponse
      setData(payload)

      setFullName(payload.profile.full_name ?? '')
      setPhone(payload.profile.phone ?? '')
      setJobTitle(payload.profile.job_title ?? '')
      setRole((payload.profile.role as Role) ?? 'member')
      setIsActive(!!payload.profile.is_active)

      setLegalName(payload.details?.legal_name ?? payload.profile.full_name ?? '')
      setBirthDate(payload.details?.birth_date ?? payload.profile.birth_date ?? '')

      // se não existir details, deixa preparar init
      setInitCpf(payload.profile.cpf ?? '')
      setInitTipoPessoa('fisica')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar vendedor.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId])

  const detailsExists = !!data?.details

  async function save() {
    setError(null)

    // valida obrigatórios
    if (!fullName.trim()) return setError('Nome é obrigatório.')
    if (!legalName.trim()) return setError('Nome Registro é obrigatório.')
    if (!birthDate) return setError('Data de nascimento é obrigatória.')

    if (!detailsExists) {
      if (!initTipoPessoa) return setError('Tipo de pessoa é obrigatório para inicializar.')
      if (!onlyDigits(initCpf)) return setError('CPF é obrigatório para inicializar.')
    }

    setSaving(true)
    try {
      const body: any = {
        full_name: fullName,
        phone,
        job_title: jobTitle,
        role,
        is_active: isActive,

        legal_name: legalName,
        birth_date: birthDate,
      }

      // ✅ inicialização: só envia se details não existe
      if (!detailsExists) {
        body.tipo_pessoa = initTipoPessoa
        body.cpf = onlyDigits(initCpf)
      }

      const res = await fetch(`/api/admin/sellers/${sellerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Erro ao salvar (HTTP ${res.status})`)

      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const email = data?.profile?.email ?? ''
  const lockedTipoPessoa = data?.details?.tipo_pessoa ?? initTipoPessoa
  const lockedCpf = data?.details?.cpf ?? data?.profile?.cpf ?? initCpf

  return (
    <div className="text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/admin/vendedores" className="text-sm text-white/60 hover:text-white">
            ← Voltar
          </a>
          <h1 className="mt-2 text-2xl font-black">{loading ? 'Carregando…' : fullName || '—'}</h1>
          <div className="mt-1 text-sm text-white/70">{email}</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading || saving}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black hover:bg-white/10 disabled:opacity-60"
          >
            Atualizar
          </button>

          <button
            onClick={save}
            disabled={loading || saving}
            className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-black text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* ✅ Inicialização (vendedor antigo) */}
      {!detailsExists && !loading ? (
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="text-sm font-black text-amber-200">Cadastro incompleto</div>
          <div className="mt-1 text-sm text-amber-100/80">
            Este vendedor foi criado antes do novo cadastro. Informe Tipo de pessoa e CPF e clique em <b>Salvar</b>.
            Depois disso, ficarão travados.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Tipo de pessoa *">
              <Select value={initTipoPessoa} onChange={(e) => setInitTipoPessoa(e.target.value as PessoaTipo)}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
                <option value="estrangeiro">Estrangeiro</option>
              </Select>
            </Field>

            <Field label="CPF *">
              <Input value={initCpf} onChange={(e) => setInitCpf(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}

      {/* Dados básicos */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-black">Dados básicos</div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tipo de pessoa (travado)">
            <Select disabled value={lockedTipoPessoa ?? ''} onChange={() => {}}>
              <option value="">—</option>
              <option value="fisica">Física</option>
              <option value="juridica">Jurídica</option>
              <option value="estrangeiro">Estrangeiro</option>
            </Select>
          </Field>

          <Field label="CPF (travado)">
            <Input disabled value={lockedCpf ?? ''} onChange={() => {}} />
          </Field>

          <Field label="Nome *">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>

          <Field label="Nome Registro *">
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Field>

          <Field label="Data de nascimento *">
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>

          <Field label="Telefone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <Field label="Cargo (interno)">
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </Field>

          <Field label="Status">
            <Select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </Select>
          </Field>

          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">member (vendedor)</option>
              <option value="manager">manager (gestor)</option>
              <option value="admin">admin</option>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  )
}