import { supabase } from '@/lib/supabase'

type LeadEventInput = {
  companyId: string
  leadId: string
  userId: string
  eventType: 'lead_created' | 'stage_changed' | 'note_updated' | 'value_updated' | string
  fromStage?: string | null
  toStage?: string | null
  metadata?: Record<string, any>
}

export async function logLeadEvent(input: LeadEventInput) {
  const { companyId, leadId, userId, eventType, fromStage = null, toStage = null, metadata = {} } = input

  const { error } = await supabase.from('lead_events').insert({
    company_id: companyId,
    lead_id: leadId,
    user_id: userId,
    event_type: eventType,
    from_stage: fromStage,
    to_stage: toStage,
    metadata,
  })

  if (error) throw error
}
