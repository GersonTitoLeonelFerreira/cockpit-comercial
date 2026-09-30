import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

const PAGE_SIZE = 1000

export type VocationWorkedRow = {
  id: string
  first_worked_at: string
}

export type VocationWonRow = {
  id: string
  won_at: string
}

export type VocationStageEventRow = {
  id: string
  occurred_at: string
  event_type: string
  metadata: Record<string, unknown> | null
}

export async function getVocationSignalData(params: {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
}): Promise<{
  workedRows: VocationWorkedRow[]
  wonRows: VocationWonRow[]
  stageEventRows: VocationStageEventRow[]
}> {
  const supabase = supabaseBrowser()
  const dateStartIso = `${params.dateStart}T00:00:00-03:00`
  const dateEndIso = `${params.dateEnd}T23:59:59.999-03:00`

  const fetchWorkedRows = async () => {
    const rows: VocationWorkedRow[] = []

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('sales_cycles')
        .select('id, first_worked_at')
        .eq('company_id', params.companyId)
        .not('first_worked_at', 'is', null)
        .gte('first_worked_at', dateStartIso)
        .lte('first_worked_at', dateEndIso)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (params.ownerId) query = query.eq('owner_user_id', params.ownerId)

      const { data, error } = await query
      if (error) throw new Error(`Erro ao buscar prospecções: ${error.message}`)

      const page = (data ?? []) as VocationWorkedRow[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    return rows
  }

  const fetchWonRows = async () => {
    const rows: VocationWonRow[] = []

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('sales_cycles')
        .select('id, won_at')
        .eq('company_id', params.companyId)
        .eq('status', 'ganho')
        .not('won_at', 'is', null)
        .gte('won_at', dateStartIso)
        .lte('won_at', dateEndIso)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (params.ownerId) {
        query = query.or(
          `won_owner_user_id.eq.${params.ownerId},and(won_owner_user_id.is.null,owner_user_id.eq.${params.ownerId})`,
        )
      }

      const { data, error } = await query
      if (error) throw new Error(`Erro ao buscar fechamentos: ${error.message}`)

      const page = (data ?? []) as VocationWonRow[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    return rows
  }

  const fetchStageEventRows = async () => {
    const rows: VocationStageEventRow[] = []

    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from('cycle_events')
        .select('id, occurred_at, event_type, metadata')
        .eq('company_id', params.companyId)
        .eq('event_type', 'stage_changed')
        .gte('occurred_at', dateStartIso)
        .lte('occurred_at', dateEndIso)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (params.ownerId) query = query.eq('created_by', params.ownerId)

      const { data, error } = await query
      if (error) throw new Error(`Erro ao buscar mudanças de etapa: ${error.message}`)

      const page = (data ?? []) as VocationStageEventRow[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    return rows
  }

  const [workedRows, wonRows, stageEventRows] = await Promise.all([
    fetchWorkedRows(),
    fetchWonRows(),
    fetchStageEventRows(),
  ])

  return { workedRows, wonRows, stageEventRows }
}
