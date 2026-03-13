'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

interface EditLeadProfileModalProps {
  leadId: string
  companyId: string
  profile: any
  onClose: () => void
  onSave: () => void
}

export default function EditLeadProfileModal({
  leadId,
  companyId,
  profile,
  onClose,
  onSave,
}: EditLeadProfileModalProps) {
  const supabase = supabaseBrowser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cpf, setCpf] = useState(profile?.cpf || '')
  const [email, setEmail] = useState(profile?.email || '')
  const [cep, setCep] = useState(profile?.cep || '')
  const [street, setStreet] = useState(profile?.address_street || '')
  const [number, setNumber] = useState(profile?.address_number || '')
  const [complement, setComplement] = useState(profile?.address_complement || '')
  const [neighborhood, setNeighborhood] = useState(profile?.address_neighborhood || '')
  const [city, setCity] = useState(profile?.address_city || '')
  const [state, setState] = useState(profile?.address_state || '')
  const [country, setCountry] = useState(profile?.address_country || 'Brasil')

  const handleCepBlur = async () => {
    if (!cep || cep.length !== 8) return

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await response.json()

      if (data.erro) {
        setError('CEP não encontrado')
        return
      }

      setStreet(data.logradouro || '')
      setNeighborhood(data.bairro || '')
      setCity(data.localidade || '')
      setState(data.uf || '')
    } catch (err) {
      console.error('Erro ao buscar CEP:', err)
      setError('Erro ao buscar CEP')
    }
  }

  const handleSave = async () => {
    setError(null)
    setLoading(true)

    try {
      const { error: updateErr } = await supabase
        .from('lead_profiles')
        .update({
          cpf: cpf.trim() || null,
          email: email.trim() || null,
          cep: cep.trim() || null,
          address_street: street.trim() || null,
          address_number: number.trim() || null,
          address_complement: complement.trim() || null,
          address_neighborhood: neighborhood.trim() || null,
          address_city: city.trim() || null,
          address_state: state.trim() || null,
          address_country: country.trim() || null,
        })
        .eq('lead_id', leadId)
        .eq('company_id', companyId)

      if (updateErr) throw updateErr

      alert('Dados atualizados com sucesso!')
      onSave()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: 12,
          border: '1px solid #2a2a2a',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, color: 'white', marginBottom: 20 }}>Editar Dados</h2>

        {error && (
          <div style={{ padding: 12, backgroundColor: '#8B0000', borderRadius: 8, color: '#FFB6C6', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>CEP</label>
            <input
              type="text"
              value={cep}
              onChange={(e) => setCep(e.target.value.replace(/\D/g, ''))}
              onBlur={handleCepBlur}
              maxLength={8}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Rua</label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Número</label>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Complemento</label>
            <input
              type="text"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Bairro</label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Cidade</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>Estado</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#999', marginBottom: 6 }}>País</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: 'white',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: '#333',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}   