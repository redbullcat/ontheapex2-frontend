// Odd-sized centered moving average, softening a per-position mean into a
// LOESS-like trend without pulling in a stats dependency for a true
// regression. Shared by any chart trending lap time against a stint/tyre-age
// position (LongRunPaceByManufacturer, TyreDegradationChart) — generic over
// the caller's own point shape so neither has to rename its fields to match
// the other's convention.
export function movingAverage<T>(points: T[], window: number, valueOf: (p: T) => number): number[] {
  const half = Math.floor(window / 2)
  return points.map((_, i) => {
    const w = points.slice(Math.max(0, i - half), Math.min(points.length, i + half + 1))
    return w.reduce((sum, p) => sum + valueOf(p), 0) / w.length
  })
}
