'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

type PessoaTipo = 'fisica' | 'juridica' | 'estrangeiro'
type ToastType = 'success' | 'error' | 'info'

type ProfilePayload = {
  ok: true
  profile: {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    job_title: string | null
    username: string | null
    birth_date: string | null
    cpf: string | null
    user_code: number | null
  }
  details: null | {
    profile_id: string
    tipo_pessoa: PessoaTipo
    cpf: string
    legal_name: string
    birth_date: string

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
    cep: string | null

    web_page: string | null
  }
}

function onlyDigits(s: string) {
  return (s ?? '').replace(/\D/g, '')
}

function isValidEmail(email: string) {
  const v = (email || '').trim()
  if (!v) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

type ProfileUpdateBody = {
  full_name: string
  username: string
  phone: string
  job_title: string | null

  legal_name: string
  birth_date: string

  profissao: string | null
  grau_instrucao: string | null
  estado_civil: string | null

  cep: string | null
  pais: string | null
  estado: string | null
  cidade: string | null
  logradouro: string | null
  numero: string | null

  web_page: string | null

  tipo_pessoa?: PessoaTipo
  cpf?: string
}

type ViaCepResponse = {
  erro?: boolean
  uf?: string
  localidade?: string
  logradouro?: string
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

function getResponseError(json: unknown, fallback: string) {
  if (
    typeof json === 'object' &&
    json !== null &&
    'error' in json &&
    typeof json.error === 'string'
  ) {
    return json.error
  }

  return fallback
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const cardClass =
  'rounded-[24px] border border-[#1a1d2e] bg-[#0d0f14] shadow-[0_20px_60px_rgba(0,0,0,0.28)]'

const sectionClass =
  'rounded-[22px] border border-[#1a1d2e] bg-[#0d0f14] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]'

const inputClass =
  'h-11 w-full rounded-xl border border-[#1a1d2e] bg-[#090b0f] px-3 text-sm font-medium text-zinc-100 outline-none transition placeholder:text-zinc-600 hover:border-[#24283a] focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60'

const selectClass =
  'h-11 w-full rounded-xl border border-[#1a1d2e] bg-[#090b0f] px-3 text-sm font-semibold text-zinc-100 outline-none transition hover:border-[#24283a] focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60'

const labelClass = 'mb-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-zinc-500'

const helperClass = 'mt-1.5 text-xs leading-relaxed text-zinc-500'

const neutralButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl border border-[#1a1d2e] bg-[#111318] px-4 text-sm font-black text-zinc-200 transition hover:border-[#252a3d] hover:bg-[#151823] disabled:cursor-not-allowed disabled:opacity-60'

const primaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl border border-blue-400/20 bg-gradient-to-b from-blue-500 to-blue-600 px-4 text-sm font-black text-white shadow-[0_14px_35px_rgba(37,99,235,0.22)] transition hover:from-blue-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-60'

const subtleButtonClass =
  'inline-flex h-9 items-center justify-center rounded-xl border border-[#1a1d2e] bg-[#090b0f] px-3 text-xs font-black text-zinc-200 transition hover:border-[#252a3d] hover:bg-[#121521] disabled:cursor-not-allowed disabled:opacity-60'

function Toast({
  open,
  type,
  message,
  onClose,
}: {
  open: boolean
  type: ToastType
  message: string
  onClose: () => void
}) {
  React.useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [open, onClose])

  if (!open) return null

  const tone =
    type === 'success'
      ? {
          border: 'border-emerald-400/25',
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-100',
          label: 'Sucesso',
        }
      : type === 'error'
        ? {
            border: 'border-red-400/25',
            bg: 'bg-red-500/10',
            text: 'text-red-100',
            label: 'Erro',
          }
        : {
            border: 'border-blue-400/25',
            bg: 'bg-blue-500/10',
            text: 'text-blue-100',
            label: 'Aviso',
          }

  return (
    <div
      className={cx(
        'fixed bottom-5 right-5 z-[9999] w-[min(420px,calc(100vw-40px))] rounded-2xl border p-4 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl',
        tone.border,
        tone.bg,
        tone.text,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
          {tone.label}
        </div>

        <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{message}</div>

        <button
          onClick={onClose}
          className="rounded-lg px-2 text-lg leading-none text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className={labelClass}>{label}</div>
      {children}
      {hint ? <div className={helperClass}>{hint}</div> : null}
    </div>
  )
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={sectionClass}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[#15172a] pb-4">
        <div>
          <h2 className="text-base font-black text-zinc-100">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">{description}</p> : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {children}
    </section>
  )
}

const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

const ESTADO_CIVIL = [
  'Solteiro(a)',
  'Casado(a)',
  'União estável',
  'Divorciado(a)',
  'Viúvo(a)',
  'Separado(a)',
  'Outro',
] as const

const GRAU_INSTRUCAO = [
  'Não informado',
  'Fundamental incompleto',
  'Fundamental completo',
  'Médio incompleto',
  'Médio completo',
  'Superior incompleto',
  'Superior completo',
  'Pós-graduação',
  'Mestrado',
  'Doutorado',
] as const

export default function ProfileClient() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [cepLoading, setCepLoading] = React.useState(false)

  const [toastOpen, setToastOpen] = React.useState(false)
  const [toastType, setToastType] = React.useState<ToastType>('info')
  const [toastMessage, setToastMessage] = React.useState('')

  const showToast = (type: ToastType, message: string) => {
    setToastType(type)
    setToastMessage(message)
    setToastOpen(true)
  }

  const [err, setErr] = React.useState<string | null>(null)
  const [data, setData] = React.useState<ProfilePayload | null>(null)

  const [userCode, setUserCode] = React.useState<number | null>(null)
  const [fullName, setFullName] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [jobTitle, setJobTitle] = React.useState('')

  const [legalName, setLegalName] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')

  const [initTipoPessoa, setInitTipoPessoa] = React.useState<PessoaTipo>('fisica')
  const [initCpf, setInitCpf] = React.useState('')

  const [profissao, setProfissao] = React.useState('')
  const [grauInstrucao, setGrauInstrucao] = React.useState('Não informado')
  const [estadoCivil, setEstadoCivil] = React.useState('')

  const [cep, setCep] = React.useState('')
  const [pais, setPais] = React.useState('Brasil')
  const [estado, setEstado] = React.useState('')
  const [cidade, setCidade] = React.useState('')
  const [logradouro, setLogradouro] = React.useState('')
  const [numero, setNumero] = React.useState('')

  const [webPage, setWebPage] = React.useState('')

  const [emailDraft, setEmailDraft] = React.useState('')
  const [changingEmail, setChangingEmail] = React.useState(false)

  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [changingPassword, setChangingPassword] = React.useState(false)

  const detailsExists = !!data?.details

  async function load() {
    setErr(null)
    setLoading(true)

    try {
      const res = await fetch('/api/settings/profile', { method: 'GET' })
      const json: unknown = await res.json()

      if (!res.ok) {
        throw new Error(getResponseError(json, `Erro ao carregar (HTTP ${res.status})`))
      }

      const payload = json as ProfilePayload
      setData(payload)

      setUserCode(payload.profile.user_code ?? null)
      setFullName(payload.profile.full_name ?? '')
      setUsername(payload.profile.username ?? '')
      setPhone(payload.profile.phone ?? '')
      setJobTitle(payload.profile.job_title ?? '')

      setLegalName(payload.details?.legal_name ?? '')
      setBirthDate(payload.details?.birth_date ?? payload.profile.birth_date ?? '')

      setInitCpf(payload.details?.cpf ?? payload.profile.cpf ?? '')

      setProfissao(payload.details?.profissao ?? '')
      setGrauInstrucao(payload.details?.grau_instrucao ?? 'Não informado')
      setEstadoCivil(payload.details?.estado_civil ?? '')

      setCep(payload.details?.cep ?? '')
      setPais(payload.details?.pais ?? 'Brasil')
      setEstado(payload.details?.estado ?? '')
      setCidade(payload.details?.cidade ?? '')
      setLogradouro(payload.details?.logradouro ?? '')
      setNumero(payload.details?.numero ?? '')

      setWebPage(payload.details?.web_page ?? '')

      setEmailDraft(payload.profile.email ?? '')
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Erro ao carregar perfil.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
  }, [])

  async function buscarCep() {
    const c = onlyDigits(cep)

    if (c.length !== 8) {
      setErr('Informe um CEP válido com 8 dígitos.')
      return
    }

    setCepLoading(true)
    setErr(null)

    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const j = (await res.json()) as ViaCepResponse

      if (j.erro) throw new Error('CEP não encontrado.')

      setPais('Brasil')
      setEstado(j.uf ?? '')
      setCidade(j.localidade ?? '')
      setLogradouro(j.logradouro ?? '')
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Falha ao consultar CEP.'))
    } finally {
      setCepLoading(false)
    }
  }

  function validateRequired() {
    if (!fullName.trim()) return 'Nome é obrigatório.'
    if (!legalName.trim()) return 'Nome Registro é obrigatório.'
    if (!birthDate) return 'Data de nascimento é obrigatória.'
    if (!username.trim()) return 'Username é obrigatório.'

    if (!detailsExists) {
      const cpfDigits = onlyDigits(initCpf)
      if (!cpfDigits) return 'CPF é obrigatório para inicializar seu cadastro.'
      if (!initTipoPessoa) return 'Tipo de pessoa é obrigatório para inicializar seu cadastro.'
    }

    return null
  }

  async function saveProfile() {
    setErr(null)

    const v = validateRequired()
    if (v) {
      setErr(v)
      return
    }

    setSaving(true)

    try {
      const body: ProfileUpdateBody = {
        full_name: fullName.trim(),
        username: username.trim(),
        phone: onlyDigits(String(phone ?? '')),
        job_title: jobTitle.trim() || null,

        legal_name: legalName.trim(),
        birth_date: birthDate,

        profissao: profissao.trim() || null,
        grau_instrucao: grauInstrucao || null,
        estado_civil: estadoCivil || null,

        cep: onlyDigits(String(cep ?? '')) || null,
        pais: pais.trim() || null,
        estado: estado.trim() || null,
        cidade: cidade.trim() || null,
        logradouro: logradouro.trim() || null,
        numero: numero.trim() || null,

        web_page: webPage.trim() || null,
      }

      if (!detailsExists) {
        body.tipo_pessoa = initTipoPessoa
        body.cpf = onlyDigits(initCpf)
      }

      const res = await fetch('/api/settings/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json: unknown = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(getResponseError(json, `Erro ao salvar (HTTP ${res.status})`))
      }

      showToast('success', 'Perfil atualizado.')
      await load()
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Erro ao salvar perfil.'))
    } finally {
      setSaving(false)
    }
  }

  async function changeEmail() {
    setErr(null)

    const em = emailDraft.trim().toLowerCase()
    if (!isValidEmail(em)) {
      setErr('E-mail inválido.')
      return
    }

    setChangingEmail(true)

    try {
      const { error } = await supabase.auth.updateUser({ email: em })
      if (error) throw error

      showToast('info', 'Enviamos um link para confirmar seu novo e-mail. Verifique sua caixa de entrada.')
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Erro ao alterar e-mail.'))
    } finally {
      setChangingEmail(false)
    }
  }

  async function changePassword() {
    setErr(null)

    if (!newPassword || newPassword.length < 6) {
      setErr('Nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErr('A confirmação de senha não confere.')
      return
    }

    setChangingPassword(true)

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      showToast('success', 'Senha alterada com sucesso.')
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Erro ao alterar senha.'))
    } finally {
      setChangingPassword(false)
    }
  }

  const lockedTipoPessoa = data?.details?.tipo_pessoa ?? initTipoPessoa
  const lockedCpf = data?.details?.cpf ?? data?.profile?.cpf ?? initCpf

  return (
    <div className="space-y-6 text-zinc-100">
      <Toast open={toastOpen} type={toastType} message={toastMessage} onClose={() => setToastOpen(false)} />

      <header className={cx(cardClass, 'relative overflow-hidden p-5')}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_30%)]" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-300/80">
              Configurações da conta
            </div>

            <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Meu Perfil</h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Mantenha seus dados cadastrais atualizados. Informações travadas preservam a rastreabilidade da conta.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading || saving} className={neutralButtonClass}>
              {loading ? 'Atualizando…' : 'Atualizar'}
            </button>

            <button type="button" onClick={saveProfile} disabled={loading || saving} className={primaryButtonClass}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 border-t border-[#15172a] pt-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#15172a] bg-[#090b0f]/70 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Status</div>
            <div className="mt-1 text-sm font-black text-emerald-300">{loading ? 'Carregando' : 'Perfil ativo'}</div>
          </div>

          <div className="rounded-2xl border border-[#15172a] bg-[#090b0f]/70 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Código</div>
            <div className="mt-1 truncate text-sm font-black text-zinc-200">{userCode ?? '—'}</div>
          </div>

          <div className="rounded-2xl border border-[#15172a] bg-[#090b0f]/70 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">ID do perfil</div>
            <div className="mt-1 truncate text-xs font-bold text-zinc-400">{data?.profile?.id ?? '—'}</div>
          </div>
        </div>
      </header>

      {err ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-semibold leading-relaxed text-red-100">
          {err}
        </div>
      ) : null}

      {loading && !data ? (
        <div className={cx(sectionClass, 'animate-pulse')}>
          <div className="h-4 w-40 rounded bg-white/10" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="h-11 rounded-xl bg-white/5" />
            <div className="h-11 rounded-xl bg-white/5" />
            <div className="h-11 rounded-xl bg-white/5" />
            <div className="h-11 rounded-xl bg-white/5" />
          </div>
        </div>
      ) : null}

      {!detailsExists && !loading ? (
        <section className="rounded-[22px] border border-amber-400/20 bg-amber-500/10 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-black text-amber-100">Complete seu cadastro</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-amber-100/75">
                Para inicializar, informe Tipo de pessoa e CPF e clique em Salvar alterações. Depois disso, esses
                campos ficam travados.
              </p>
            </div>

            <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100">
              Ação necessária
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Tipo de pessoa *">
              <select
                className={selectClass}
                value={initTipoPessoa}
                onChange={(e) => setInitTipoPessoa(e.target.value as PessoaTipo)}
              >
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
                <option value="estrangeiro">Estrangeiro</option>
              </select>
            </Field>

            <Field label="CPF *">
              <input className={inputClass} value={initCpf} onChange={(e) => setInitCpf(e.target.value)} />
            </Field>
          </div>
        </section>
      ) : null}

      <Section
        title="Dados pessoais"
        description="Informações principais do usuário. Nome, telefone e dados profissionais podem ser atualizados quando necessário."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cód. usuário">
            <input className={inputClass} value={userCode ?? ''} disabled />
          </Field>

          <Field label="Telefone">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <Field label="Nome *">
            <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>

          <Field label="Nome Registro *">
            <input className={inputClass} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Field>

          <Field label="Data de nascimento *">
            <input
              type="date"
              className={inputClass}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </Field>

          <Field label="Username *" hint="Deve ser único dentro da empresa.">
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>

          <Field label="Tipo de pessoa travado">
            <select className={selectClass} value={lockedTipoPessoa ?? ''} disabled onChange={() => {}}>
              <option value="">—</option>
              <option value="fisica">Física</option>
              <option value="juridica">Jurídica</option>
              <option value="estrangeiro">Estrangeiro</option>
            </select>
          </Field>

          <Field label="CPF travado">
            <input className={inputClass} value={lockedCpf ?? ''} disabled />
          </Field>

          <Field label="Profissão">
            <input className={inputClass} value={profissao} onChange={(e) => setProfissao(e.target.value)} />
          </Field>

          <Field label="Grau de instrução">
            <select className={selectClass} value={grauInstrucao} onChange={(e) => setGrauInstrucao(e.target.value)}>
              {GRAU_INSTRUCAO.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Estado civil">
            <select className={selectClass} value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)}>
              <option value="">—</option>
              {ESTADO_CIVIL.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Web page">
            <input
              className={inputClass}
              value={webPage}
              onChange={(e) => setWebPage(e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Endereço"
        description="Use o CEP para preencher automaticamente UF, cidade e logradouro quando disponível."
        action={
          <button type="button" onClick={buscarCep} disabled={cepLoading} className={subtleButtonClass}>
            {cepLoading ? 'Buscando…' : 'Buscar CEP'}
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="CEP">
            <input className={inputClass} value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
          </Field>

          <Field label="País">
            <input className={inputClass} value={pais} onChange={(e) => setPais(e.target.value)} />
          </Field>

          <Field label="UF">
            <select className={selectClass} value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cidade">
            <input className={inputClass} value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </Field>

          <Field label="Logradouro">
            <input className={inputClass} value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
          </Field>

          <Field label="Número">
            <input className={inputClass} value={numero} onChange={(e) => setNumero(e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section
        title="Segurança da conta"
        description="Alterações de e-mail e senha usam a autenticação oficial da conta. O e-mail novo precisa ser confirmado."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#15172a] bg-[#090b0f] p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-zinc-100">E-mail</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Ao alterar, o Supabase envia um link de confirmação para o novo endereço.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <Field label="E-mail *">
                <input className={inputClass} value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
              </Field>

              <button type="button" onClick={changeEmail} disabled={changingEmail} className={neutralButtonClass}>
                {changingEmail ? 'Enviando…' : 'Alterar e-mail'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#15172a] bg-[#090b0f] p-4">
            <div className="mb-4">
              <h3 className="text-sm font-black text-zinc-100">Senha</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Use no mínimo 6 caracteres. A confirmação precisa ser igual à nova senha.
              </p>
            </div>

            <div className="grid gap-3">
              <Field label="Nova senha *">
                <input
                  type="password"
                  placeholder="Mín. 6 caracteres"
                  className={inputClass}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>

              <Field label="Confirmar nova senha *">
                <input
                  type="password"
                  placeholder="Repita a nova senha"
                  className={inputClass}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>

              <button type="button" onClick={changePassword} disabled={changingPassword} className={neutralButtonClass}>
                {changingPassword ? 'Alterando…' : 'Alterar senha'}
              </button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}