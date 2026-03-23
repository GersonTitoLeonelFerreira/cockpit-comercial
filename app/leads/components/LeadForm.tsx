'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

interface LeadFormProps {
  companyId: string
  userId: string
  onClose?: () => void
}

/**
 * Form para criar novo lead
 * Automaticamente cria sales_cycle e evento
 */
export default function LeadForm({ companyId, userId, onClose }: LeadFormProps) {
  const router = useRouter()
  const supabase = supabaseBrowser()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // 1) Criar lead
      const { data: newLead, error: leadErr } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          owner_id: userId,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          status: 'novo',
          entry_mode: 'manual',
        })
        .select('id')
        .single()

      if (leadErr) throw leadErr
      if (!newLead?.id) throw new Error('Lead criado sem ID')

      const leadId = newLead.id

      // 2) Criar sales_cycle automaticamente
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
      if (!newCycle?.id) throw new Error('Ciclo criado sem ID')

      const cycleId = newCycle.id

      // 3) Registrar evento cycle_created
      const { error: eventErr } = await supabase
        .from('cycle_events')
        .insert({
          company_id: companyId,
          cycle_id: cycleId,
          event_type: 'cycle_created',
          created_by: userId,
          metadata: { lead_id: leadId },
        })

      if (eventErr) {
        console.warn('[LeadForm] Erro ao registrar evento:', eventErr)
        // Não aborta - evento é não-crítico
      }

      // ✅ Sucesso
      alert('Lead criado com sucesso!')
      setName('')
      setPhone('')
      setEmail('')
      onClose?.()
      router.refresh()

      // Opcional: redirecionar para detalhe do ciclo
      // router.push(`/sales-cycles/${cycleId}`)
    } catch (err: any) {
      const message = err?.message || 'Erro ao criar lead'
      setError(message)
      console.error('[LeadForm] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Nome *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Nome do lead"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Telefone
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(11) 98765-4321"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemplo.com"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          disabled={loading}
        />
      </div>

      <div className="flex gap-3 pt-4">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50"
            disabled={loading}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-semibold transition-colors disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Criando...' : '+ Criar Lead'}
        </button>
      </div>
    </form>
  )
}