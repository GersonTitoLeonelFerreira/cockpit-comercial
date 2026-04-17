'use client'

import LeadCopilotPanel from '@/app/components/leads/LeadCopilotPanel'
import type { SalesCycle } from '@/app/types/sales_cycles'

type SalesCycleWithLead = SalesCycle & {
  leads?: {
    id?: string
    name?: string
    phone?: string | null
    email?: string | null
  }
}

interface ConversationCopilotProps {
  cycle: SalesCycleWithLead
}

export default function ConversationCopilot({ cycle }: ConversationCopilotProps) {
  return <LeadCopilotPanel cycle={cycle} variant="full" />
}