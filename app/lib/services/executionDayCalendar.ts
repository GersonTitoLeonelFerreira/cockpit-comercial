import { supabaseBrowser } from '../supabaseBrowser'
import {
  normalizeExecutionDayOverrides,
  normalizeWorkDays,
  type ExecutionDayOverrides,
  type WorkDays,
} from './executionDayMath'

export type { ExecutionDayOverrides, WorkDays } from './executionDayMath'

export type ExecutionDayCalendarRecord = {
  id: string
  company_id: string
  period_start: string
  period_end: string
  work_days: WorkDays
  execution_day_overrides: ExecutionDayOverrides
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
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
        work_days,
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
    work_days: normalizeWorkDays(data.work_days),
    execution_day_overrides: normalizeExecutionDayOverrides(data.execution_day_overrides),
    created_by: data.created_by,
    updated_by: data.updated_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

export async function getExecutionDayCalendarsForRange(params: {
  companyId: string
  dateStart: string
  dateEnd: string
}): Promise<ExecutionDayCalendarRecord[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('execution_day_calendars')
    .select(
      `
        id,
        company_id,
        period_start,
        period_end,
        work_days,
        execution_day_overrides,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
    )
    .eq('company_id', params.companyId)
    .lte('period_start', params.dateEnd)
    .gte('period_end', params.dateStart)
    .order('period_start', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    period_start: row.period_start,
    period_end: row.period_end,
    work_days: normalizeWorkDays(row.work_days),
    execution_day_overrides: normalizeExecutionDayOverrides(row.execution_day_overrides),
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export async function saveExecutionDayCalendar(params: {
  companyId: string
  periodStart: string
  periodEnd: string
  workDays: WorkDays
  executionDayOverrides: ExecutionDayOverrides
}): Promise<ExecutionDayCalendarRecord> {
  const supabase = supabaseBrowser()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError

  const userId = user?.id ?? null
  const normalizedWorkDays = normalizeWorkDays(params.workDays)
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
        work_days: normalizedWorkDays,
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
          work_days,
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
      work_days: normalizeWorkDays(data.work_days),
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
      work_days: normalizedWorkDays,
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
        work_days,
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
    work_days: normalizeWorkDays(data.work_days),
    execution_day_overrides: normalizeExecutionDayOverrides(data.execution_day_overrides),
    created_by: data.created_by,
    updated_by: data.updated_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}
