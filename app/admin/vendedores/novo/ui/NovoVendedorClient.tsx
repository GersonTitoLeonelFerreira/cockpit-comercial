'use client'

import { useEffect, useState } from 'react'

type Role = 'member' | 'manager' | 'admin'
type PessoaTipo = 'fisica' | 'juridica' | 'estrangeiro'
type ToastType = 'success' | 'error' | 'info'

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
  useEffect(() => {
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

function onlyDigits(s: string) {
  return (s ?? '').replace(/\D/g, '')
}

export default function NovoVendedorClient() {
  const [tipoPessoa, setTipoPessoa] = useState<PessoaTipo>('fisica')

  // obrigatórios (*)
  const [fullName, setFullName] = useState('') // Nome (uso interno)
  const [legalName, setLegalName] = useState('') // Nome Registro
  const [birthDate, setBirthDate] = useState('') // yyyy-mm-dd
  const [cpf, setCpf] = useState('')

  // login
  const [email, setEmail] = useState('')

  // outros
  const [phone, setPhone] = useState('')

  // acesso
  const [role, setRole] = useState<Role>('member')

  const [loading, setLoading] = useState(false)

  const [toastOpen, setToastOpen] = useState(false)
  const [toastType, setToastType] = useState<ToastType>('info')
  const [toastMessage, setToastMessage] = useState('')

  const showToast = (type: ToastType, message: string) => {
    setToastType(type)
    setToastMessage(message)
    setToastOpen(true)
  }

  const enviarConvite = async () => {
    if (loading) return

    const emailNorm = email.trim().toLowerCase()
    const fullNameNorm = fullName.trim()
    const legalNameNorm = legalName.trim()
    const cpfNorm = onlyDigits(cpf)
    const phoneNorm = phone.trim()

    if (!emailNorm) return showToast('error', 'Informe o email.')
    if (!fullNameNorm) return showToast('error', 'Informe o Nome.')
    if (!legalNameNorm) return showToast('error', 'Informe o Nome Registro.')
    if (!birthDate) return showToast('error', 'Informe a Data de nascimento.')
    if (!cpfNorm) return showToast('error', 'Informe o CPF.')

    setLoading(true)

    try {
      const res = await fetch('/api/admin/sellers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailNorm,
          full_name: fullNameNorm,
          role,

          // details
          details: {
            tipo_pessoa: tipoPessoa,
            legal_name: legalNameNorm,
            birth_date: birthDate,
            cpf: cpfNorm,
            phone: phoneNorm || null,
          },
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setLoading(false)
        showToast('error', json?.error || `Erro ao enviar (HTTP ${res.status})`)
        return
      }

      setLoading(false)

      if (json?.warning) {
        showToast('info', `Criado com aviso:\n${json.warning}`)
      } else {
        showToast('success', 'Vendedor criado com sucesso!')
      }

      setTimeout(() => {
        window.location.href = `/admin/vendedores/${json.user_id}`
      }, 900)
    } catch (e: any) {
      setLoading(false)
      showToast('error', e?.message || 'Falha inesperada ao chamar a API.')
    }
  }

  const inputStyle = {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: 'white',
  } as const

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Toast open={toastOpen} type={toastType} message={toastMessage} onClose={() => setToastOpen(false)} />

      <div style={{ fontWeight: 900, opacity: 0.9 }}>Dados obrigatórios (*)</div>

      <label>
        Tipo de pessoa *
        <select value={tipoPessoa} onChange={(e) => setTipoPessoa(e.target.value as any)} style={inputStyle}>
          <option value="fisica">Física</option>
          <option value="juridica">Jurídica</option>
          <option value="estrangeiro">Estrangeiro</option>
        </select>
      </label>

      <label>
        Nome *
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
      </label>

      <label>
        Nome Registro *
        <input value={legalName} onChange={(e) => setLegalName(e.target.value)} style={inputStyle} />
      </label>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        <label>
          Data de nascimento *
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={inputStyle} />
        </label>

        <label>
          CPF *
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} style={inputStyle} />
        </label>
      </div>

      <div style={{ marginTop: 8, fontWeight: 900, opacity: 0.9 }}>Acesso</div>

      <label>
        Email (login) *
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </label>

      <label>
        Telefone
        <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      </label>

      <label>
        Permissão (role)
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={inputStyle}>
          <option value="member">member (vendedor)</option>
          <option value="manager">manager (gestor)</option>
          <option value="admin">admin</option>
        </select>
      </label>

      <button
        onClick={enviarConvite}
        disabled={loading}
        style={{
          padding: 12,
          borderRadius: 10,
          border: 'none',
          background: '#10b981',
          color: 'white',
          fontWeight: 900,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Enviando…' : 'Cadastrar vendedor'}
      </button>
    </div>
  )
}