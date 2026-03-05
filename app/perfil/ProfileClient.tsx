'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

type ProfileRow = {
  id: string
  company_id: string
  role: string
  full_name: string | null
  email: string | null
  job_title: string | null
  status: string | null
  username: string | null
  birth_date: string | null
  cpf: string | null
  phone: string | null
  user_code: number | null
}

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function isValidEmail(email: string) {
  const v = (email || '').trim()
  if (!v) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

function isValidCPF(input: string) {
  const cpf = onlyDigits(input)
  if (cpf.length !== 11) return false
  if (/^(\d)\1+$/.test(cpf)) return false

  const calcDigit = (base: string, factor: number) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const d1 = calcDigit(cpf.slice(0, 9), 10)
  const d2 = calcDigit(cpf.slice(0, 9) + String(d1), 11)
  return cpf.endsWith(`${d1}${d2}`)
}

export default function ProfileClient({
  userId,
  authEmail,
  initialProfile,
}: {
  userId: string
  authEmail: string
  initialProfile: ProfileRow
}) {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [saving, setSaving] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  const [userCode] = React.useState<number | null>(initialProfile.user_code ?? null)
  const [fullName, setFullName] = React.useState(initialProfile.full_name ?? '')
  const [birthDate, setBirthDate] = React.useState(initialProfile.birth_date ?? '')
  const [cpf, setCpf] = React.useState(initialProfile.cpf ?? '')
  const [username, setUsername] = React.useState(initialProfile.username ?? '')
  const [phone, setPhone] = React.useState(initialProfile.phone ?? '')

  const [emailDraft, setEmailDraft] = React.useState(authEmail || initialProfile.email || '')
  const [changingEmail, setChangingEmail] = React.useState(false)

  async function saveProfile() {
    setMsg(null)
    setErr(null)

    const n = fullName.trim()
    const u = username.trim()

    if (!n) return setErr('Nome é obrigatório.')
    if (!birthDate) return setErr('Data de nascimento é obrigatória.')
    if (!u) return setErr('Username é obrigatório.')

    const cpfDigits = onlyDigits(cpf)
    if (cpfDigits && !isValidCPF(cpfDigits)) return setErr('CPF inválido.')

    const phoneDigits = onlyDigits(phone)

    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: n,
          birth_date: birthDate,
          cpf: cpfDigits || null,
          username: u,
          phone: phoneDigits || null,
        })
        .eq('id', userId)

      if (error) throw error
      setMsg('Perfil atualizado.')
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  async function changeEmail() {
    setMsg(null)
    setErr(null)

    const em = emailDraft.trim().toLowerCase()
    if (!isValidEmail(em)) return setErr('E-mail inválido.')

    setChangingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: em })
      if (error) throw error
      setMsg('Enviamos um link para confirmar seu novo e-mail. Verifique sua caixa de entrada.')
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setChangingEmail(false)
    }
  }

  const card: React.CSSProperties = {
    border: '1px solid #202020',
    background: '#0c0c0c',
    borderRadius: 16,
    padding: 16,
  }

  const label: React.CSSProperties = { fontSize: 12, opacity: 0.75, fontWeight: 800 }
  const input: React.CSSProperties = {
    background: '#111',
    border: '1px solid #2a2a2a',
    color: 'white',
    padding: '10px 12px',
    borderRadius: 10,
    outline: 'none',
    width: '100%',
  }

  const btn: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 900,
  }

  return (
    <div style={{ maxWidth: 980, color: 'white' }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Meu Perfil</h1>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        ID: <b>{userId}</b>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #3a2222',
            background: '#160b0b',
            color: '#ffb3b3',
          }}
        >
          {err}
        </div>
      ) : null}

      {msg ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #1f3a22',
            background: '#0b160b',
            color: '#bbffb3',
          }}
        >
          {msg}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Dados</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label}>Cod. Usuário</div>
              <input style={{ ...input, opacity: 0.7 }} value={userCode ?? ''} disabled />
            </div>

            <div>
              <div style={label}>Telefone</div>
              <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(DDD) + número" />
            </div>

            <div>
              <div style={label}>Nome *</div>
              <input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div>
              <div style={label}>Data de nascimento *</div>
              <input type="date" style={input} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>

            <div>
              <div style={label}>CPF</div>
              <input style={input} value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Somente números" />
              {cpf.trim() ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{isValidCPF(cpf) ? 'CPF válido' : 'CPF inválido'}</div>
              ) : null}
            </div>

            <div>
              <div style={label}>Nome do Usuário (Username) *</div>
              <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex: gerson.contato" />
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Deve ser único dentro da empresa.</div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={saveProfile} disabled={saving} style={{ ...btn, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>E-mail</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={label}>E-mail *</div>
              <input style={input} value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Para trocar, você precisa confirmar pelo link enviado ao novo e-mail.
              </div>
            </div>

            <button
              type="button"
              onClick={changeEmail}
              disabled={changingEmail}
              style={{ ...btn, whiteSpace: 'nowrap', opacity: changingEmail ? 0.7 : 1 }}
            >
              {changingEmail ? 'Enviando...' : 'Alterar e-mail'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
