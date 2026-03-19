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

  const bg = type === 'success' ? '#065f46' : type === 'error' ? '#7f1d1d' : '#1f2937'
  const border = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#374151'

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9999,
        background: bg,
        border: `1px solid ${border}`,
        color: 'white',
        padding: '12px 14px',
        borderRadius: 12,
        minWidth: 280,
        maxWidth: 420,
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 12, opacity: 0.9 }}>
          {type}
        </div>

        <div style={{ flex: 1, whiteSpace: 'pre-wrap', fontSize: 14 }}>{message}</div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            opacity: 0.9,
          }}
          aria-label="Fechar"
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  )
}

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
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

  // form
  const [userCode, setUserCode] = React.useState<number | null>(null)
  const [fullName, setFullName] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [jobTitle, setJobTitle] = React.useState('')

  const [legalName, setLegalName] = React.useState('')
  const [birthDate, setBirthDate] = React.useState('')

  // init if details not exist
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

  // email change (Auth)
  const [emailDraft, setEmailDraft] = React.useState('')
  const [changingEmail, setChangingEmail] = React.useState(false)

  const detailsExists = !!data?.details

  async function load() {
    setErr(null)
    setLoading(true)
    try {
      const res = await fetch('/api/settings/profile', { method: 'GET' })
      const json = (await res.json()) as any
      if (!res.ok) throw new Error(json?.error || `Erro ao carregar (HTTP ${res.status})`)

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
    } catch (e: any) {
      setErr(e?.message ?? 'Erro ao carregar perfil.')
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
      setErr('Informe um CEP válido (8 dígitos).')
      return
    }

    setCepLoading(true)
    setErr(null)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const j = await res.json()
      if (j?.erro) throw new Error('CEP não encontrado.')
      setPais('Brasil')
      setEstado(j.uf ?? '')
      setCidade(j.localidade ?? '')
      setLogradouro(j.logradouro ?? '')
    } catch (e: any) {
      setErr(e?.message ?? 'Falha ao consultar CEP.')
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
      const body: any = {
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

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Erro ao salvar (HTTP ${res.status})`)

      showToast('success', 'Perfil atualizado.')
await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Erro ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  async function changeEmail() {
    setErr(null)

    const em = emailDraft.trim().toLowerCase()
    if (!isValidEmail(em)) return setErr('E-mail inválido.')

    setChangingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: em })
      if (error) throw error
      showToast('info', 'Enviamos um link para confirmar seu novo e-mail. Verifique sua caixa de entrada.')
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setChangingEmail(false)
    }
  }

  const lockedTipoPessoa = data?.details?.tipo_pessoa ?? initTipoPessoa
  const lockedCpf = data?.details?.cpf ?? data?.profile?.cpf ?? initCpf

  return (
    <div>
      <Toast open={toastOpen} type={toastType} message={toastMessage} onClose={() => setToastOpen(false)} />

      <h1 className="text-2xl font-black">Meu Perfil</h1>

      {/* Top actions (ÚNICO lugar para salvar) */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black hover:bg-white/10 disabled:opacity-60"
        >
          Atualizar
        </button>

        <button
          type="button"
          onClick={saveProfile}
          disabled={loading || saving}
          className="h-10 rounded-xl bg-emerald-500 px-4 text-sm font-black text-black hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {data?.profile?.id ? (
        <div className="mt-2 text-xs text-white/60">
          ID: <b>{data.profile.id}</b>
        </div>
      ) : null}

      {err ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
      ) : null}

      {!detailsExists && !loading ? (
        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="text-sm font-black text-amber-200">Complete seu cadastro</div>
          <div className="mt-1 text-sm text-amber-100/80">
            Para inicializar, informe Tipo de pessoa e CPF e clique em <b>Salvar</b>. Depois disso ficarão travados.
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-black text-white/60">Tipo de pessoa *</div>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
                value={initTipoPessoa}
                onChange={(e) => setInitTipoPessoa(e.target.value as PessoaTipo)}
              >
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
                <option value="estrangeiro">Estrangeiro</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">CPF *</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={initCpf}
                onChange={(e) => setInitCpf(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-black">Dados</div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-black text-white/60">Cod. Usuário</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm opacity-70"
                value={userCode ?? ''}
                disabled
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Telefone</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Nome *</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Nome Registro *</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Data de nascimento *</div>
              <input
                type="date"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Username *</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <div className="mt-1 text-xs text-white/50">Deve ser único dentro da empresa.</div>
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Tipo de pessoa (travado)</div>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none opacity-70"
                value={lockedTipoPessoa ?? ''}
                disabled
                onChange={() => {}}
              >
                <option value="">—</option>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
                <option value="estrangeiro">Estrangeiro</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">CPF (travado)</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm opacity-70"
                value={lockedCpf ?? ''}
                disabled
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Profissão</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={profissao}
                onChange={(e) => setProfissao(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Grau de Instrução</div>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
                value={grauInstrucao}
                onChange={(e) => setGrauInstrucao(e.target.value)}
              >
                {GRAU_INSTRUCAO.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Estado Civil</div>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
                value={estadoCivil}
                onChange={(e) => setEstadoCivil(e.target.value)}
              >
                <option value="">—</option>
                {ESTADO_CIVIL.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Web Page</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={webPage}
                onChange={(e) => setWebPage(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black">Endereço</div>
            <button
              type="button"
              onClick={buscarCep}
              disabled={cepLoading}
              className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black hover:bg-white/10 disabled:opacity-60"
            >
              {cepLoading ? 'Buscando…' : 'Buscar CEP'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-black text-white/60">CEP</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                placeholder="00000-000"
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">País</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={pais}
                onChange={(e) => setPais(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">UF (Estado)</div>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold outline-none"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Cidade</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Logradouro</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={logradouro}
                onChange={(e) => setLogradouro(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-black text-white/60">Número</div>
              <input
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div style={{ fontWeight: 900, marginBottom: 12 }}>E-mail</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>E-mail *</div>
              <input
                style={{
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  color: 'white',
                  padding: '10px 12px',
                  borderRadius: 10,
                  outline: 'none',
                  width: '100%',
                }}
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
              />
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Para trocar, você precisa confirmar pelo link enviado ao novo e-mail.
              </div>
            </div>

            <button
              type="button"
              onClick={changeEmail}
              disabled={changingEmail}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#111',
                color: 'white',
                cursor: changingEmail ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 900,
                whiteSpace: 'nowrap',
                opacity: changingEmail ? 0.7 : 1,
              }}
            >
              {changingEmail ? 'Enviando...' : 'Alterar e-mail'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}