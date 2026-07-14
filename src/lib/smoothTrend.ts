// Odd-sized centered moving average, softening a per-position mean into a
// LOESS-like trend without pulling in a stats dependency for a true
// regression. Shared by any chart trending lap time against a stint/tyre-age
// position (LongRunPaceByManufacturer, TyreDegradationChart) — generic over
// the caller's own point shape so neither has to rename its fields to match
// the other's convention.
// A fixed small window (e.g. 3) barely dents lap-to-lap noise once a
// series has 50+ points — the "trend" ends up tracking almost every
// wiggle in the raw data instead of reading as smoothed. Scaling the
// window with the series length keeps short stints close to their raw
// shape (nothing to smooth over) while long ones actually flatten out,
// capped so it never grows large enough to erase real degradation
// trends into a flat mean. Always odd so the average stays centered.
export function adaptiveSmoothWindow(pointCount: number): number {
  const raw = Math.round(pointCount * 0.12)
  const odd = raw % 2 === 0 ? raw + 1 : raw
  return Math.min(15, Math.max(3, odd))
}

export function movingAverage<T>(points: T[], window: number, valueOf: (p: T) => number): number[] {
  const half = Math.floor(window / 2)
  return points.map((_, i) => {
    const w = points.slice(Math.max(0, i - half), Math.min(points.length, i + half + 1))
    return w.reduce((sum, p) => sum + valueOf(p), 0) / w.length
  })
}
