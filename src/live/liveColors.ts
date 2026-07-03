import type { LiveTimeColor } from '../api/types'

// Maps Griiip's own color classification onto the badge-session/badge-personal
// CSS classes Replay already defines (purple = session best, green = personal
// best) — reusing the existing visual language rather than inventing a new one.
export function colorBadgeClass(color: LiveTimeColor): string {
  if (color === 'Purple') return ' badge-session'
  if (color === 'Green') return ' badge-personal'
  return ''
}
