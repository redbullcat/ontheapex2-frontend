import type { RaceLogEntry } from '../api/types'
import { classifyFlag, type FlagCategory } from './flags'

export interface FlagEvent {
  category: FlagCategory
  // 1-based count of this category so far this session — "FCY #2", "SC #1".
  occurrence: number
  startLap: number
  // Null when the session/data ends mid-caution (e.g. a red flag that stops
  // the session early) — there's no lap to report as the end since one
  // never arrived.
  endLap: number | null
  startElapsedSeconds: number
  endElapsedSeconds: number | null
}

export interface RestartEvent {
  lapNumber: number
  elapsedSeconds: number
}

// Flag periods come from the timing feed's own race-log channel (raw
// `RaceLogEntry[]` for Live, synthesized from computeFlagPeriods for Replay
// — see replay/raceLogSynth.ts) rather than grouping laps by lap_number:
// endurance races run several classes at once, wildly different lap counts
// apart at the same real-world moment, so a lap-number-keyed grouping
// conflates unrelated moments across the field into spurious extra periods.
// Walking the race log chronologically by elapsedTimeMillis instead gives
// exactly one period per actual real-time flag change.
export function computeFlagTimeline(entries: RaceLogEntry[]): { cautions: FlagEvent[]; restarts: RestartEvent[] } {
  const flagEntries = entries
    .filter((e) => e.type === 'RaceFlag')
    .slice()
    .sort((a, b) => a.elapsedTimeMillis - b.elapsedTimeMillis)

  const cautions: FlagEvent[] = []
  const restarts: RestartEvent[] = []
  const counts = new Map<FlagCategory, number>()
  let open: FlagEvent | null = null

  function closeOpen(entry: RaceLogEntry) {
    if (!open) return
    open.endLap = entry.lapNumber
    open.endElapsedSeconds = entry.elapsedTimeMillis / 1000
    cautions.push(open)
    open = null
  }

  for (const entry of flagEntries) {
    const category: FlagCategory = classifyFlag(entry.flag ?? null)
    if (category === 'green' || category === 'chequered') {
      const wasOpen = open != null
      closeOpen(entry)
      if (category === 'green' && wasOpen) {
        restarts.push({ lapNumber: entry.lapNumber, elapsedSeconds: entry.elapsedTimeMillis / 1000 })
      }
      continue
    }
    if (open && open.category === category) continue
    closeOpen(entry)
    const occurrence: number = (counts.get(category) ?? 0) + 1
    counts.set(category, occurrence)
    open = {
      category,
      occurrence,
      startLap: entry.lapNumber,
      endLap: null,
      startElapsedSeconds: entry.elapsedTimeMillis / 1000,
      endElapsedSeconds: null,
    }
  }
  // A session can end mid-caution with no closing green entry ever arriving
  // (the exact real-world case this was built for — a red flag minutes from
  // the end that stopped the session early) — flush it as still-open rather
  // than silently dropping the final period.
  if (open) cautions.push(open)

  return { cautions, restarts }
}
