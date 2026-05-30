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

const DS = {
  overlay: 'rgba(0,0,0,0.72)',
  panel: '#0d0f14',
  surface: '#111318',
  field: '#090b0f',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  text: '#edf2f7',
  muted: '#8fa3bc',
  weak: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  danger: '#fca5a5',
  success: '#86efac',
} as const

function Field({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  maxLength,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  type?: string
  maxLength?: number
  onBlur?: () => void
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: DS.muted,
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={maxLength}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 11px',
          background: DS.field,
          border: `1px solid ${DS.border}`,
          borderRadius: 10,
          color: DS.text,
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  )
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
  const [success, setSuccess] = useState<string | null>(null)

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
    const cleanCep = cep.replace(/\D/g, '')

    if (!cleanCep || cleanCep.length !== 8) return

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
      const data = await response.json()

      if (data.erro) {
        setError('CEP não encontrado.')
        return
      }

      setCep(cleanCep)
      setStreet(data.logradouro || '')
      setNeighborhood(data.bairro || '')
      setCity(data.localidade || '')
      setState(data.uf || '')
      setError(null)
    } catch (err) {
      console.error('Erro ao buscar CEP:', err)
      setError('Erro ao buscar CEP.')
    }
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const { error: updateErr } = await supabase
        .from('lead_profiles')
        .update({
          cpf: cpf.replace(/\D/g, '').trim() || null,
          email: email.trim() || null,
          cep: cep.replace(/\D/g, '').trim() || null,
          address_street: street.trim() || null,
          address_number: number.trim() || null,
          address_complement: complement.trim() || null,
          address_neighborhood: neighborhood.trim() || null,
          address_city: city.trim() || null,
          address_state: state.trim().toUpperCase() || null,
          address_country: country.trim() || null,
        })
        .eq('lead_id', leadId)
        .eq('company_id', companyId)

      if (updateErr) throw updateErr

      setSuccess('Dados atualizados com sucesso.')
      onSave()

      setTimeout(() => {
        onClose()
      }, 450)
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar dados.')
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
        background: DS.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 18,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: DS.panel,
          borderRadius: 18,
          border: `1px solid ${DS.border}`,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 28px 90px rgba(0,0,0,0.62)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '18px 20px',
            borderBottom: `1px solid ${DS.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                color: DS.blue,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 7,
              }}
            >
              Cadastro completo
            </div>

            <h2
              style={{
                margin: 0,
                color: DS.text,
                fontSize: 18,
                fontWeight: 900,
                lineHeight: 1.2,
              }}
            >
              Editar dados do lead
            </h2>

            <p
              style={{
                margin: '7px 0 0',
                color: DS.muted,
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              Atualize documentos, contato e endereço vinculados ao lead.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar"
            style={{
              border: `1px solid ${DS.border}`,
              background: DS.surface,
              color: DS.muted,
              borderRadius: 10,
              width: 34,
              height: 34,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {error && (
            <div
              style={{
                padding: '11px 12px',
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.28)',
                borderRadius: 12,
                color: DS.danger,
                marginBottom: 14,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: '11px 12px',
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.28)',
                borderRadius: 12,
                color: DS.success,
                marginBottom: 14,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {success}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 14,
              marginBottom: 18,
            }}
          >
            <Field
              label="CPF"
              value={cpf}
              disabled={loading}
              onChange={(value) => setCpf(value.replace(/\D/g, ''))}
            />

            <Field
              label="Email"
              value={email}
              disabled={loading}
              type="email"
              onChange={setEmail}
            />

            <Field
              label="CEP"
              value={cep}
              disabled={loading}
              maxLength={9}
              onBlur={handleCepBlur}
              onChange={(value) => setCep(value)}
            />

            <Field
              label="Rua"
              value={street}
              disabled={loading}
              onChange={setStreet}
            />

            <Field
              label="Número"
              value={number}
              disabled={loading}
              onChange={setNumber}
            />

            <Field
              label="Complemento"
              value={complement}
              disabled={loading}
              onChange={setComplement}
            />

            <Field
              label="Bairro"
              value={neighborhood}
              disabled={loading}
              onChange={setNeighborhood}
            />

            <Field
              label="Cidade"
              value={city}
              disabled={loading}
              onChange={setCity}
            />

            <Field
              label="Estado"
              value={state}
              disabled={loading}
              maxLength={2}
              onChange={(value) => setState(value.toUpperCase())}
            />

            <Field
              label="País"
              value={country}
              disabled={loading}
              onChange={setCountry}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
              borderTop: `1px solid ${DS.border}`,
              paddingTop: 16,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '10px 16px',
                background: DS.surface,
                color: DS.muted,
                border: `1px solid ${DS.border}`,
                borderRadius: 10,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontSize: 13,
                fontWeight: 800,
                minWidth: 130,
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              style={{
                padding: '10px 16px',
                background: '#2563eb',
                color: 'white',
                border: '1px solid rgba(147,197,253,0.18)',
                borderRadius: 10,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.65 : 1,
                fontSize: 13,
                fontWeight: 900,
                minWidth: 130,
              }}
            >
              {loading ? 'Salvando...' : 'Salvar dados'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}