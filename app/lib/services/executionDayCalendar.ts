import { supabaseBrowser } from '../supabaseBrowser'

export type ExecutionDayOverrides = Record<string, boolean>
export type WorkDays = Record<number, boolean>

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

function defaultWorkDays(): WorkDays {
  return {
    0: false,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: false,
  }
}

function normalizeWorkDays(value: unknown): WorkDays {
  const fallback = defaultWorkDays()

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback
  }

  const source = value as Record<string, unknown>
  const normalized: WorkDays = { ...fallback }

  for (const key of Object.keys(fallback)) {
    const valueForDay = source[key]

    if (typeof valueForDay === 'boolean') {
      normalized[Number(key)] = valueForDay
    }
  }

  return normalized
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