// Raw FLAG_AT_FL codes seen across timing feeds: GF/FF are green-flag
// running, FCY is full-course yellow, SF/SC mark a safety car period, RF is
// a red flag, CH is the live-only chequered-flag code (see app/live/state.py
// on the backend — not a historical FLAG_AT_FL value). Anything else is
// bucketed as unknown rather than assumed safe.
export type FlagCategory = 'green' | 'fcy' | 'safety-car' | 'red' | 'chequered' | 'unknown'

export function classifyFlag(flag: string | null): FlagCategory {
  if (!flag) return 'green'
  const f = flag.toUpperCase()
  if (f === 'GF' || f === 'FF') return 'green'
  if (f === 'FCY' || f === 'YF' || f === 'YC') return 'fcy'
  if (f === 'SF' || f === 'SC') return 'safety-car'
  if (f === 'RF' || f === 'RC') return 'red'
  if (f === 'CH') return 'chequered'
  return 'unknown'
}

// Canonical raw code per category — for synthesizing a race-log `flag`
// value (see replay/raceLogSynth.ts) that will round-trip cleanly back
// through classifyFlag, rather than the human-readable FLAG_LABELS text
// which classifyFlag doesn't recognize (it would come back 'unknown').
export const FLAG_CODES: Record<FlagCategory, string> = {
  green: 'GF',
  fcy: 'FCY',
  'safety-car': 'SC',
  red: 'RF',
  chequered: 'CH',
  unknown: 'UNKNOWN',
}

export const FLAG_LABELS: Record<FlagCategory, string> = {
  green: 'Green',
  fcy: 'Full Course Yellow',
  'safety-car': 'Safety Car',
  red: 'Red Flag',
  chequered: 'Chequered Flag',
  unknown: 'Unknown',
}

export const FLAG_COLORS: Record<FlagCategory, string> = {
  green: '#3fae56',
  fcy: '#fab219',
  'safety-car': '#ff8a00',
  red: '#e34948',
  chequered: '#1a1a1a',
  unknown: '#898781',
}

// Severity order used to pick one flag per lap when different cars on track
// report different codes for the same lap (e.g. cars crossing the line just
// before/after a flag change) — the more severe condition wins.
const SEVERITY: FlagCategory[] = ['green', 'unknown', 'fcy', 'safety-car', 'red', 'chequered']

interface FlagLapLike {
  lap_number: number
  flag_at_fl: string | null
  elapsed_seconds: number | null
}

function dominantCategory<T extends FlagLapLike>(rows: T[]): FlagCategory {
  let best: FlagCategory = 'green'
  for (const row of rows) {
    const cat = classifyFlag(row.flag_at_fl)
    if (SEVERITY.indexOf(cat) > SEVERITY.indexOf(best)) best = cat
  }
  return best
}

export interface FlagPeriod {
  startLap: number
  endLap: number
  category: FlagCategory
  startElapsedSeconds: number
  endElapsedSeconds: number
}

// Endurance races run several classes at once, and at any real-world moment
// they can be dozens of laps apart — so grouping by raw lap_number (as this
// used to) conflates unrelated moments across the field and fragments a
// single caution into several spurious periods. Bucketing by elapsed time
// instead groups laps that actually happened at (roughly) the same instant,
// regardless of which class or how many laps down a car is.
const BUCKET_SECONDS = 30

// Generic over the lap shape so both Replay's LapRead[] and Live's
// LiveLap[] work unmodified — only lap_number/flag_at_fl/elapsed_seconds
// are ever read.
export function computeFlagPeriods<T extends FlagLapLike>(laps: T[]): FlagPeriod[] {
  const relevant = laps.filter((l) => l.lap_number != null && l.elapsed_seconds != null)
  if (relevant.length === 0) return []

  const byBucket = new Map<number, T[]>()
  for (const lap of relevant) {
    const bucket = Math.floor(lap.elapsed_seconds! / BUCKET_SECONDS)
    const arr = byBucket.get(bucket)
    if (arr) arr.push(lap)
    else byBucket.set(bucket, [lap])
  }
  const buckets = [...byBucket.keys()].sort((a, b) => a - b)

  const periods: FlagPeriod[] = []
  let current: FlagPeriod | null = null
  for (const bucket of buckets) {
    const rows = byBucket.get(bucket)!
    const category = dominantCategory(rows)
    const minLap = Math.min(...rows.map((r) => r.lap_number))
    const maxLap = Math.max(...rows.map((r) => r.lap_number))
    const minElapsed = Math.min(...rows.map((r) => r.elapsed_seconds!))
    const maxElapsed = Math.max(...rows.map((r) => r.elapsed_seconds!))
    if (current && current.category === category) {
      // Different classes can be dozens of laps apart, so a later bucket in
      // the same merged period can have either a smaller min or a larger max
      // than buckets seen so far — widen the range both ways rather than
      // just extending endLap upward (which could otherwise show something
      // nonsensical like "Laps 137-118" if a back-marker class's lap number
      // came in lower than the period's original startLap).
      current.startLap = Math.min(current.startLap, minLap)
      current.endLap = Math.max(current.endLap, maxLap)
      current.endElapsedSeconds = maxElapsed
    } else {
      if (current) periods.push(current)
      current = { startLap: minLap, endLap: maxLap, category, startElapsedSeconds: minElapsed, endElapsedSeconds: maxElapsed }
    }
  }
  if (current) periods.push(current)
  return periods
}
