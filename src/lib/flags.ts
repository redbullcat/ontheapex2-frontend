import type { LapRead } from '../api/types'

// Raw FLAG_AT_FL codes seen across timing feeds: GF/FF are green-flag
// running, FCY is full-course yellow, SF/SC mark a safety car period, RF is
// a red flag. Anything else is bucketed as unknown rather than assumed safe.
export type FlagCategory = 'green' | 'fcy' | 'safety-car' | 'red' | 'unknown'

export function classifyFlag(flag: string | null): FlagCategory {
  if (!flag) return 'green'
  const f = flag.toUpperCase()
  if (f === 'GF' || f === 'FF') return 'green'
  if (f === 'FCY' || f === 'YF' || f === 'YC') return 'fcy'
  if (f === 'SF' || f === 'SC') return 'safety-car'
  if (f === 'RF' || f === 'RC') return 'red'
  return 'unknown'
}

export const FLAG_LABELS: Record<FlagCategory, string> = {
  green: 'Green',
  fcy: 'Full Course Yellow',
  'safety-car': 'Safety Car',
  red: 'Red Flag',
  unknown: 'Unknown',
}

export const FLAG_COLORS: Record<FlagCategory, string> = {
  green: '#3fae56',
  fcy: '#fab219',
  'safety-car': '#ff8a00',
  red: '#e34948',
  unknown: '#898781',
}

// Severity order used to pick one flag per lap when different cars on track
// report different codes for the same lap (e.g. cars crossing the line just
// before/after a flag change) — the more severe condition wins.
const SEVERITY: FlagCategory[] = ['green', 'unknown', 'fcy', 'safety-car', 'red']

function dominantCategory(rows: LapRead[]): FlagCategory {
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
}

export function computeFlagPeriods(laps: LapRead[]): FlagPeriod[] {
  const byLap = new Map<number, LapRead[]>()
  for (const lap of laps) {
    if (lap.lap_number == null) continue
    const arr = byLap.get(lap.lap_number)
    if (arr) arr.push(lap)
    else byLap.set(lap.lap_number, [lap])
  }
  const lapNumbers = [...byLap.keys()].sort((a, b) => a - b)

  const periods: FlagPeriod[] = []
  let current: FlagPeriod | null = null
  for (const lapNumber of lapNumbers) {
    const category = dominantCategory(byLap.get(lapNumber)!)
    if (current && current.category === category) {
      current.endLap = lapNumber
    } else {
      if (current) periods.push(current)
      current = { startLap: lapNumber, endLap: lapNumber, category }
    }
  }
  if (current) periods.push(current)
  return periods
}
