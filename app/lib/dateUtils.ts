/**
 * Converts a stored UTC ISO date string to the value format required by
 * <input type="datetime-local"> (YYYY-MM-DDTHH:mm in the user's local timezone).
 *
 * Using toISOString() would produce UTC time, which would show the wrong hour
 * in the input for users in non-UTC timezones.
 */
export function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
