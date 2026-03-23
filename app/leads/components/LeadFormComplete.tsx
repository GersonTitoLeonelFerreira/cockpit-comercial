'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

interface LeadFormCompleteProps {
  companyId: string
  userId: string
  onClose?: () => void
}

// Validar CPF - Versão simplificada
function isValidCPF(cpf: string): boolean {
    const cleanCpf = cpf.replace(/\D/g, '')
    
    // Verificar se tem 11 dígitos
    if (cleanCpf.length !== 11) {
      return false
    }
    
    // Verificar se todos os dígitos são iguais (CPF inválido)
    if (/^(\d)\1{10}$/.test(cleanCpf)) {
      return false
    }
    
    // Validação básica do primeiro dígito
    let sum = 0
    let multiplier = 10
    
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanCpf[i]) * multiplier
      multiplier--
    }
    
    let remainder = sum % 11
    let digit1 = remainder < 2 ? 0 : 11 - remainder
    
    if (parseInt(cleanCpf[9]) !== digit1) {
      return false
    }
    
    // Validação do segundo dígito
    sum = 0
    multiplier = 11
    
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleanCpf[i]) * multiplier
      multiplier--
    }
    
    remainder = sum % 11
    let digit2 = remainder < 2 ? 0 : 11 - remainder
    
    if (parseInt(cleanCpf[10]) !== digit2) {
      return false
    }
    
    return true
  }

export default function LeadFormComplete({ companyId, userId, onClose }: LeadFormCompleteProps) {
  const router = useRouter()
  const supabase = supabaseBrowser()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Dados básicos
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [biologicalSex, setBiologicalSex] = useState('M')
  const [cpf, setCpf] = useState('')
  const [isMinor, setIsMinor] = useState(false)

  // Pais (se menor)
  const [motherName, setMotherName] = useState('')
  const [motherCpf, setMotherCpf] = useState('')
  const [fatherName, setFatherName] = useState('')
  const [fatherCpf, setFatherCpf] = useState('')

  // Documentos
  const [rg, setRg] = useState('')
  const [rgIssuer, setRgIssuer] = useState('')
  const [rgState, setRgState] = useState('')
  const [rne, setRne] = useState('')
  const [passport, setPassport] = useState('')

  // Profissional
  const [profession, setProfession] = useState('')
  const [educationLevel, setEducationLevel] = useState('')
  const [maritalStatus, setMaritalStatus] = useState('')

  // Contatos
  const [phoneResidential, setPhoneResidential] = useState('')
  const [phoneResidentialDesc, setPhoneResidentialDesc] = useState('')
  const [phoneCommercial, setPhoneCommercial] = useState('')
  const [phoneCommercialDesc, setPhoneCommercialDesc] = useState('')
  const [phoneMobile, setPhoneMobile] = useState('')
  const [phoneMobileDesc, setPhoneMobileDesc] = useState('')
  const [email, setEmail] = useState('')

  // Emergência
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')

  // Endereço
  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [country, setCountry] = useState('Brasil')

  // Calcular se é menor de idade
  useEffect(() => {
    if (birthDate) {
      const birth = new Date(birthDate)
      const today = new Date()
      const age = today.getFullYear() - birth.getFullYear()
      const monthDiff = today.getMonth() - birth.getMonth()
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        setIsMinor(age - 1 < 18)
      } else {
        setIsMinor(age < 18)
      }
    }
  }, [birthDate])

  // Buscar CEP
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

  // Validar com CPF check
  const validate = async (): Promise<boolean> => {
    if (!name.trim()) {
      setError('Nome é obrigatório')
      return false
    }
    if (!birthDate) {
      setError('Data de nascimento é obrigatória')
      return false
    }
    if (!cpf.trim()) {
      setError('CPF é obrigatório')
      return false
    }
    if (!biologicalSex) {
      setError('Sexo biológico é obrigatório')
      return false
    }

    if (isMinor) {
      if (!motherName.trim() && !fatherName.trim()) {
        setError('Pelo menos um responsável é obrigatório para menores')
        return false
      }
    }

    if (!phoneResidential.trim() && !phoneCommercial.trim() && !phoneMobile.trim()) {
      setError('Pelo menos um telefone é obrigatório')
      return false
    }

    if (!cep.trim()) {
      setError('CEP é obrigatório')
      return false
    }

    // Validar CPF
    if (!isValidCPF(cpf)) {
      setError('CPF inválido')
      return false
    }

 // Verificar duplicata no banco
const { data: existingCpf, error: cpfCheckErr } = await supabase
.from('lead_profiles')
.select('lead_id, id')
.eq('company_id', companyId)
.eq('cpf', cpf.replace(/\D/g, ''))
.single()

// Verificar duplicata no banco
try {
    const { data: existingCpf } = await supabase
      .from('lead_profiles')
      .select('lead_id')
      .eq('company_id', companyId)
      .eq('cpf', cpf.replace(/\D/g, ''))
      .maybeSingle()
  
    if (existingCpf) {
      localStorage.setItem('existingLeadId', existingCpf.lead_id)
      setError('Este CPF já está cadastrado')
      return false
    }
  } catch (err) {
    console.error('Erro ao verificar CPF:', err)
    setError('Erro ao verificar CPF')
    return false
  }

if (existingCpf) {
// CPF já existe - guardar o ID do lead existente
localStorage.setItem('existingLeadId', existingCpf.lead_id)
setError('Este CPF já está cadastrado')
return false
}

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!(await validate())) return

    setLoading(true)

    try {
      // 1) Criar lead
      const { data: newLead, error: leadErr } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          owner_id: userId,
          name: name.trim(),
          phone: phoneMobile.trim() || phoneCommercial.trim() || phoneResidential.trim() || null,
          email: email.trim() || null,
          status: 'novo',
          entry_mode: 'manual',
        })
        .select('id')
        .single()

      if (leadErr) throw leadErr
      if (!newLead?.id) throw new Error('Lead criado sem ID')

      const leadId = newLead.id

      // 2) Criar lead_profile
      const { error: profileErr } = await supabase
        .from('lead_profiles')
        .insert({
          lead_id: leadId,
          company_id: companyId,
          lead_type: 'PF',
          cpf: cpf.replace(/\D/g, ''),
          email: email.trim() || null,
          cep: cep.trim(),
          address_street: street.trim(),
          address_number: number.trim(),
          address_complement: complement.trim() || null,
          address_neighborhood: neighborhood.trim(),
          address_city: city.trim(),
          address_state: state.trim(),
          address_country: country.trim(),
          birth_date: birthDate,
          biological_sex: biologicalSex,
          mother_name: motherName.trim() || null,
          mother_cpf: motherCpf.replace(/\D/g, '') || null,
          father_name: fatherName.trim() || null,
          father_cpf: fatherCpf.replace(/\D/g, '') || null,
          rg: rg.trim() || null,
          rg_issuer: rgIssuer.trim() || null,
          rg_state: rgState.trim() || null,
          rne: rne.trim() || null,
          passport: passport.trim() || null,
          profession: profession.trim() || null,
          education_level: educationLevel || null,
          marital_status: maritalStatus || null,
          phone_residential: phoneResidential.trim() || null,
          phone_residential_desc: phoneResidentialDesc.trim() || null,
          phone_commercial: phoneCommercial.trim() || null,
          phone_commercial_desc: phoneCommercialDesc.trim() || null,
          phone_mobile: phoneMobile.trim() || null,
          phone_mobile_desc: phoneMobileDesc.trim() || null,
          emergency_contact_name: emergencyContactName.trim() || null,
          emergency_contact_phone: emergencyContactPhone.trim() || null,
        })

      if (profileErr) throw profileErr

      // 3) Criar sales_cycle automaticamente
      const { data: newCycle, error: cycleErr } = await supabase
        .from('sales_cycles')
        .insert({
          company_id: companyId,
          lead_id: leadId,
          owner_user_id: userId,
          status: 'novo',
        })
        .select('id')
        .single()

      if (cycleErr) throw cycleErr

      // ✅ Sucesso
      alert('Lead criado com sucesso!')
      onClose?.()
      router.refresh()
    } catch (err: any) {
      const message = err?.message || 'Erro ao criar lead'
      setError(message)
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-gray-800 rounded-lg">
      <h2 className="text-2xl font-bold text-white mb-6">Cadastro de Lead</h2>

      {error && (
  <div className="p-3 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
    <p className="mb-2">{error}</p>
    {error.includes('já está cadastrado') && (
      <button
        type="button"
        onClick={() => {
          const leadId = localStorage.getItem('existingLeadId')
          if (leadId) {
            window.location.href = `/leads/${leadId}`
          }
        }}
        className="mt-2 px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-sm font-semibold transition-colors"
      >
        → Ir para o cadastro existente
      </button>
    )}
  </div>
)}

      {/* DADOS BÁSICOS */}
      <fieldset className="border border-gray-600 p-4 rounded">
        <legend className="text-lg font-semibold text-white mb-4">Dados Básicos *</legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Data de Nascimento *</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Sexo Biológico *</label>
            <select
              value={biologicalSex}
              onChange={(e) => setBiologicalSex(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">CPF * (somente números)</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              required
              disabled={loading}
              placeholder="12345678901"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      {/* RESPONSÁVEIS (se menor) */}
      {isMinor && (
        <fieldset className="border border-yellow-600 p-4 rounded bg-yellow-900 bg-opacity-20">
          <legend className="text-lg font-semibold text-yellow-300 mb-4">Responsáveis * (Menor de 18 anos)</legend>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome da Mãe</label>
              <input
                type="text"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">CPF da Mãe (somente números)</label>
              <input
                type="text"
                value={motherCpf}
                onChange={(e) => setMotherCpf(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Pai</label>
              <input
                type="text"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">CPF do Pai (somente números)</label>
              <input
                type="text"
                value={fatherCpf}
                onChange={(e) => setFatherCpf(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </fieldset>
      )}

      {/* DOCUMENTOS */}
      <fieldset className="border border-gray-600 p-4 rounded">
        <legend className="text-lg font-semibold text-white mb-4">Documentos</legend>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">RG</label>
            <input
              type="text"
              value={rg}
              onChange={(e) => setRg(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Órgão Expedidor</label>
            <input
              type="text"
              value={rgIssuer}
              onChange={(e) => setRgIssuer(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">UF</label>
            <input
              type="text"
              value={rgState}
              onChange={(e) => setRgState(e.target.value.toUpperCase())}
              maxLength={2}
              disabled={loading}
              placeholder="SP"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">RNE</label>
            <input
              type="text"
              value={rne}
              onChange={(e) => setRne(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Passaporte</label>
            <input
              type="text"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      {/* PROFISSIONAL */}
      <fieldset className="border border-gray-600 p-4 rounded">
        <legend className="text-lg font-semibold text-white mb-4">Informações Profissionais</legend>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Profissão</label>
            <input
              type="text"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Grau de Instrução</label>
            <select
              value={educationLevel}
              onChange={(e) => setEducationLevel(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Selecionar...</option>
              <option value="Fundamental">Fundamental</option>
              <option value="Médio">Médio</option>
              <option value="Superior">Superior</option>
              <option value="Pós-graduação">Pós-graduação</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Estado Civil</label>
            <select
              value={maritalStatus}
              onChange={(e) => setMaritalStatus(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Selecionar...</option>
              <option value="Solteiro">Solteiro</option>
              <option value="Casado">Casado</option>
              <option value="Divorciado">Divorciado</option>
              <option value="Viúvo">Viúvo</option>
              <option value="Separado">Separado</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* CONTATOS */}
      <fieldset className="border border-gray-600 p-4 rounded">
        <legend className="text-lg font-semibold text-white mb-4">Contatos * (Obrigatório pelo menos 1 telefone)</legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tel. Residencial</label>
            <input
              type="tel"
              value={phoneResidential}
              onChange={(e) => setPhoneResidential(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
            <input
              type="text"
              value={phoneResidentialDesc}
              onChange={(e) => setPhoneResidentialDesc(e.target.value)}
              disabled={loading}
              placeholder="Ex: Atender após 18h"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tel. Comercial</label>
            <input
              type="tel"
              value={phoneCommercial}
              onChange={(e) => setPhoneCommercial(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
            <input
              type="text"
              value={phoneCommercialDesc}
              onChange={(e) => setPhoneCommercialDesc(e.target.value)}
              disabled={loading}
              placeholder="Ex: Ramal 123"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tel. Celular</label>
            <input
              type="tel"
              value={phoneMobile}
              onChange={(e) => setPhoneMobile(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
            <input
              type="text"
              value={phoneMobileDesc}
              onChange={(e) => setPhoneMobileDesc(e.target.value)}
              disabled={loading}
              placeholder="Ex: WhatsApp"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      {/* EMERGÊNCIA */}
      <fieldset className="border border-gray-600 p-4 rounded">
        <legend className="text-lg font-semibold text-white mb-4">Contato de Emergência</legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
            <input
              type="text"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Telefone</label>
            <input
              type="tel"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      {/* ENDEREÇO */}
      <fieldset className="border border-gray-600 p-4 rounded">
        <legend className="text-lg font-semibold text-white mb-4">Endereço Residencial *</legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">CEP * (somente números)</label>
            <input
              type="text"
              value={cep}
              onChange={(e) => setCep(e.target.value.replace(/\D/g, ''))}
              onBlur={handleCepBlur}
              maxLength={8}
              required
              disabled={loading}
              placeholder="12345678"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Endereço</label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Número</label>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Complemento</label>
            <input
              type="text"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              disabled={loading}
              placeholder="Apto, Sala, etc"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Bairro</label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Cidade</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Estado</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              disabled={loading}
              placeholder="SP"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">País</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      {/* BOTÕES */}
      <div className="flex gap-3 pt-4">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Criando...' : '✓ Criar Lead'}
        </button>
      </div>
    </form>
  )
}