import { supabaseBrowser } from '../supabaseBrowser'

export type ExecutionDayOverrides = Record<string, boolean>

export type ExecutionDayCalendarRecord = {
  id: string
  company_id: string
  period_start: string
  period_end: string
  execution_day_overrides: ExecutionDayOverrides
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

function normalizeExecutionDayOverrides(value: unknown): ExecutionDayOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const normalized: ExecutionDayOverrides = {}

  for (const [date, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    if (typeof enabled === 'boolean') {
      normalized[date] = enabled
    }
  }

  return normalized
}

export async function getExecutionDayCalendar(params: {
  companyId: string
  periodStart: string
  periodEnd: string
}): Promise<ExecutionDayCalendarRecord | null> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('execution_day_calendars')
    .select(
      `
        id,
        company_id,
        period_start,
        period_end,
        execution_day_overrides,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
    )
    .eq('company_id', params.companyId)
    .eq('period_start', params.periodStart)
    .eq('period_end', params.periodEnd)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    company_id: data.company_id,
    period_start: data.period_start,
    period_end: data.period_end,
    execution_day_overrides: normalizeExecutionDayOverrides(data.execution_day_overrides),
    created_by: data.created_by,
    updated_by: data.updated_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

export async function saveExecutionDayCalendar(params: {
  companyId: string
  periodStart: string
  periodEnd: string
  executionDayOverrides: ExecutionDayOverrides
}): Promise<ExecutionDayCalendarRecord> {
  const supabase = supabaseBrowser()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError

  const userId = user?.id ?? null
  const normalizedOverrides = normalizeExecutionDayOverrides(params.executionDayOverrides)

  const existing = await getExecutionDayCalendar({
    companyId: params.companyId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  })

  if (existing) {
    const { data, error } = await supabase
      .from('execution_day_calendars')
      .update({
        execution_day_overrides: normalizedOverrides,
        updated_by: userId,
      })
      .eq('id', existing.id)
      .select(
        `
          id,
          company_id,
          period_start,
          period_end,
          execution_day_overrides,
          created_by,
          updated_by,
          created_at,
          updated_at
        `,
      )
      .single()

    if (error) throw error

    return {
      id: data.id,
      company_id: data.company_id,
      period_start: data.period_start,
      period_end: data.period_end,
      execution_day_overrides: normalizeExecutionDayOverrides(data.execution_day_overrides),
      created_by: data.created_by,
      updated_by: data.updated_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  }

  const { data, error } = await supabase
    .from('execution_day_calendars')
    .insert({
      company_id: params.companyId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      execution_day_overrides: normalizedOverrides,
      created_by: userId,
      updated_by: userId,
    })
    .select(
      `
        id,
        company_id,
        period_start,
        period_end,
        execution_day_overrides,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
    )
    .single()

  if (error) throw error

  return {
    id: data.id,
    company_id: data.company_id,
    period_start: data.period_start,
    period_end: data.period_end,
    execution_day_overrides: normalizeExecutionDayOverrides(data.execution_day_overrides),
    created_by: data.created_by,
    updated_by: data.updated_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}