// Shared "interval" logic for time-ranked bar charts (avg pace, fastest
// lap, pit loss, consistency, etc.) — mirrors timing-tower conventions:
// 'ahead' is the gap to the next-fastest entry above this one, 'leader' is
// the gap to the fastest entry in the current view. The fastest entry
// itself always shows no gap.
export type GapMode = 'ahead' | 'leader'

// `values` must already be sorted ascending (index 0 = fastest/leader).
export function computeGaps(values: number[], mode: GapMode): (number | null)[] {
  return values.map((v, i) => {
    if (i === 0) return null
    return mode === 'leader' ? v - values[0] : v - values[i - 1]
  })
}

export function formatGap(gap: number | null): string {
  if (gap == null) return ''
  return `+${gap.toFixed(3)}`
}
