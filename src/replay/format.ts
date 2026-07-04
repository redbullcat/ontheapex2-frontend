export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

// `lapsDown` is optional — only Live's gap_to_first_laps/gap_to_next_laps
// carry it (see api/types.ts). Once a car's actually a lap or more behind,
// a seconds-based gap stops meaning much (endurance races routinely rack up
// hundreds/thousands of seconds), so the conventional "+N Lap(s)" form wins
// over the raw figure whenever it applies.
export function formatGap(seconds: number | null, lapsDown?: number | null): string {
  if (lapsDown != null && lapsDown > 0) return `+${lapsDown} Lap${lapsDown === 1 ? '' : 's'}`
  if (seconds == null) return '—'
  const sign = seconds > 0 ? '+' : seconds < 0 ? '-' : ''
  return `${sign}${Math.abs(seconds).toFixed(3)}s`
}

export function formatLapTime(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export function formatSplit(seconds: number | null): string {
  if (seconds == null) return ''
  return seconds.toFixed(3)
}
