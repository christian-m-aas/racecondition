export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '–'
  const minutes = Math.floor(ms / 60000)
  const seconds = (ms % 60000) / 1000
  const s = seconds.toFixed(3).padStart(6, '0')
  return minutes > 0 ? `${minutes}:${s}` : seconds.toFixed(3)
}

/** Parses "41.928", "1:02.345" or "41,928" into milliseconds. */
export function parseTime(input: string): number | null {
  const v = input.trim().replace(',', '.')
  if (!v) return null
  const m = v.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/)
  if (!m) return null
  return Math.round((Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000)
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function daysUntil(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(date + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const MEDALS = ['🥇', '🥈', '🥉']

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
