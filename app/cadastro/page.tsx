'use client'

import { useState } from 'react'
import Link from 'next/link'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

export default function CadastroLeadPage() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [segment, setSegment] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const enviar = async () => {
    if (loading) return
    if (!name) return alert('Informe seu nome.')
    if (!whatsapp && !email) return alert('Informe WhatsApp ou Email para contato.')

    setLoading(true)

    const r = await fetch('/api/public/demo-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        company: company.trim() || null,
        whatsapp: onlyDigits(whatsapp) || null,
        email: email.trim() || null,
        segment: segment.trim() || null,
        message: message.trim() || null,
      }),
    })

    const json = await r.json().catch(() => ({}))
    setLoading(false)

    if (!r.ok) {
      return alert('Erro: ' + (json?.error || 'Falha ao enviar solicitação.'))
    }

    setDone(true)
    setName('')
    setCompany('')
    setWhatsapp('')
    setEmail('')
    setSegment('')
    setMessage('')
  }

  return (
    <div style={{ width: 420, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ textAlign: 'center' }}>Quero conhecer o Cockpit Comercial</h2>
      <div style={{ opacity: 0.8, fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
        Deixe seus dados e a gente entra em contato para uma demonstração.
      </div>

      {done ? (
        <div style={{ padding: 12, borderRadius: 8, background: '#102a12' }}>
          Recebido. Vamos entrar em contato.
        </div>
      ) : null}

      <label>
        Nome *
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: 10 }} />
      </label>

      <label>
        Empresa
        <input value={company} onChange={(e) => setCompany(e.target.value)} style={{ width: '100%', padding: 10 }} />
      </label>

      <label>
        WhatsApp
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={{ width: '100%', padding: 10 }} />
      </label>

      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: 10 }} />
      </label>

      <label>
        Segmento
        <input
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          style={{ width: '100%', padding: 10 }}
          placeholder="Ex: Academia, Imobiliária..."
        />
      </label>

      <label>
        Mensagem (opcional)
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', padding: 10, minHeight: 80 }} />
      </label>

      <button onClick={enviar} disabled={loading} style={{ padding: 12, fontWeight: 800, cursor: 'pointer' }}>
        {loading ? 'Enviando...' : 'Solicitar demonstração'}
      </button>

      <Link href="/login" style={{ textDecoration: 'underline', textAlign: 'center', fontSize: 14 }}>
        Voltar para login
      </Link>
    </div>
  )
}
