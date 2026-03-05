'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type LeadProfileRow = {
  lead_id: string
  lead_type: 'PF' | 'PJ'
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
  email: string | null
  cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  address_country: string | null
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

export default function LeadProfileTabs({
  leadId,
  companyId,
  initialProfile,
}: {
  leadId: string
  companyId: string
  initialProfile: LeadProfileRow | null
}) {
  const [tab, setTab] = useState<'pessoal' | 'endereco'>('pessoal')
  const [saving, setSaving] = useState(false)

  // Form state
  const [leadType, setLeadType] = useState<'PF' | 'PJ'>(initialProfile?.lead_type ?? 'PF')
  const [cpf, setCpf] = useState(initialProfile?.cpf ?? '')
  const [cnpj, setCnpj] = useState(initialProfile?.cnpj ?? '')
  const [razaoSocial, setRazaoSocial] = useState(initialProfile?.razao_social ?? '')
  const [email, setEmail] = useState(initialProfile?.email ?? '')

  // CEP fica em ENDEREÇO
  const [cep, setCep] = useState(initialProfile?.cep ?? '')
  const [street, setStreet] = useState(initialProfile?.address_street ?? '')
  const [number, setNumber] = useState(initialProfile?.address_number ?? '')
  const [complement, setComplement] = useState(initialProfile?.address_complement ?? '')
  const [neighborhood, setNeighborhood] = useState(initialProfile?.address_neighborhood ?? '')
  const [city, setCity] = useState(initialProfile?.address_city ?? '')
  const [stateUF, setStateUF] = useState(initialProfile?.address_state ?? '')
  const [country, setCountry] = useState(initialProfile?.address_country ?? 'Brasil')

  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)

  const nCpf = useMemo(() => onlyDigits(cpf), [cpf])
  const nCnpj = useMemo(() => onlyDigits(cnpj), [cnpj])
  const nCep = useMemo(() => onlyDigits(cep), [cep])

  // Busca ViaCEP quando CEP tiver 8 dígitos
  useEffect(() => {
    const run = async () => {
      setCepError(null)
      if (!nCep || nCep.length !== 8) return

      setCepLoading(true)
      try {
        const res = await fetch(`https://viacep.com.br/ws/${nCep}/json/`)
        if (!res.ok) {
          setCepError('Falha ao consultar CEP.')
          return
        }
        const data: any = await res.json()
        if (data?.erro) {
          setCepError('CEP não encontrado.')
          return
        }

        setStreet(data?.logradouro ?? '')
        setNeighborhood(data?.bairro ?? '')
        setCity(data?.localidade ?? '')
        setStateUF(data?.uf ?? '')
        setCountry('Brasil')
      } catch {
        setCepError('Falha ao consultar CEP.')
      } finally {
        setCepLoading(false)
      }
    }

    run()
  }, [nCep])

  const pill = (active: boolean) =>
    ({
      padding: '8px 10px',
      borderRadius: 999,
      border: '1px solid #333',
      background: active ? '#111' : 'transparent',
      color: active ? 'white' : '#9aa',
      cursor: 'pointer',
      fontSize: 12,
    }) as const

  const validate = () => {
    // PF/PJ
    if (leadType === 'PF' && nCpf) {
      if (!isValidCPF(nCpf)) return 'CPF inválido.'
    }
    if (leadType === 'PJ' && nCnpj) {
      if (nCnpj.length !== 14) return 'CNPJ inválido (precisa ter 14 dígitos).'
    }

    // Email
    if (email.trim() && !isValidEmail(email)) return 'E-mail inválido.'

    // CEP completo (quando preenchido)
    if (nCep) {
      if (nCep.length !== 8) return 'CEP inválido (precisa ter 8 dígitos).'
      if (cepError) return `CEP inválido: ${cepError}`
      if (!street.trim() || !city.trim() || !stateUF.trim())
        return 'Endereço incompleto: confirme Rua, Cidade e Estado.'
      if (!number.trim()) return 'Endereço incompleto: informe o número.'
      if (!country.trim()) return 'Endereço incompleto: informe o país.'
    }

    return null
  }

  const salvar = async () => {
    const err = validate()
    if (err) {
      alert(err)
      return
    }

    if (saving) return
    setSaving(true)
    try {
      const payload: any = {
        lead_id: leadId,
        company_id: companyId,
        lead_type: leadType,
        email: email.trim() ? email.trim() : null,

        // CEP + Endereço
        cep: nCep ? nCep : null,
        address_street: street.trim() ? street.trim() : null,
        address_number: number.trim() ? number.trim() : null,
        address_complement: complement.trim() ? complement.trim() : null,
        address_neighborhood: neighborhood.trim() ? neighborhood.trim() : null,
        address_city: city.trim() ? city.trim() : null,
        address_state: stateUF.trim() ? stateUF.trim() : null,
        address_country: country.trim() ? country.trim() : null,
      }

      if (leadType === 'PF') {
        payload.cpf = nCpf ? nCpf : null
        payload.cnpj = null
        payload.razao_social = null
      } else {
        payload.cnpj = nCnpj ? nCnpj : null
        payload.razao_social = razaoSocial.trim() ? razaoSocial.trim() : null
        payload.cpf = null
      }

      const { error } = await supabase.from('lead_profiles').upsert(payload, {
        onConflict: 'lead_id',
      })

      if (error) {
        alert('Erro ao salvar cadastro: ' + error.message)
        return
      }

      alert('Cadastro salvo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 18,
        padding: 16,
        border: '1px solid #333',
        borderRadius: 10,
        background: '#0f0f0f',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={pill(tab === 'pessoal')} onClick={() => setTab('pessoal')}>
            Dados pessoais
          </button>
          <button type="button" style={pill(tab === 'endereco')} onClick={() => setTab('endereco')}>
            Endereço
          </button>
        </div>

        <button
          type="button"
          onClick={salvar}
          disabled={saving}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #333',
            background: '#111',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? 'Salvando…' : 'Salvar cadastro'}
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        {tab === 'pessoal' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Tipo:</span>

              <button
                type="button"
                onClick={() => setLeadType('PF')}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: leadType === 'PF' ? '#111' : 'transparent',
                  color: leadType === 'PF' ? 'white' : '#9aa',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                PF
              </button>

              <button
                type="button"
                onClick={() => setLeadType('PJ')}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: leadType === 'PJ' ? '#111' : 'transparent',
                  color: leadType === 'PJ' ? 'white' : '#9aa',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                PJ
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {leadType === 'PF' ? (
                <input
                  placeholder="CPF (somente números)"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  inputMode="numeric"
                  style={{ width: 280 }}
                />
              ) : (
                <>
                  <input
                    placeholder="CNPJ (somente números)"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    inputMode="numeric"
                    style={{ width: 280 }}
                  />
                  <input
                    placeholder="Razão social"
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    style={{ flex: 1, minWidth: 260 }}
                  />
                </>
              )}

              <input
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ flex: 1, minWidth: 260 }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="CEP (8 dígitos)"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                inputMode="numeric"
                style={{ width: 200 }}
              />
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {cepLoading ? 'Consultando CEP…' : cepError ? (
                  <span style={{ color: '#ef4444' }}>{cepError}</span>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                placeholder="Rua/Av."
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                style={{ flex: 1, minWidth: 280 }}
              />
              <input
                placeholder="Número"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                style={{ width: 160 }}
              />
              <input
                placeholder="Complemento"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                placeholder="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
              <input
                placeholder="Cidade"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
              <input
                placeholder="Estado (UF)"
                value={stateUF}
                onChange={(e) => setStateUF(e.target.value)}
                style={{ width: 160 }}
              />
              <input
                placeholder="País"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ width: 200 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
