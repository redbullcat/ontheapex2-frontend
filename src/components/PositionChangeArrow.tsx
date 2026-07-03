// Shown in place of a car's position number for 10s after it changes —
// green up-arrow for gaining places, red down-arrow for losing them, with
// the number of places gained/lost. Deliberately replaces the position
// number for that window rather than sitting alongside it (small next to
// small was easy to miss) — reverts to the plain number once it expires.
// Shared by Live (usePositionArrow) and Replay (replayEngine's
// positionDirection/positionDelta), which track the underlying change
// differently but land on the same shape here.
export function PositionChangeArrow({ direction, delta }: { direction: 'up' | 'down' | null; delta: number }) {
  if (!direction) return null
  return (
    <span className={`position-arrow position-arrow-${direction}`}>
      {direction === 'up' ? '▲' : '▼'}
      {delta}
    </span>
  )
}
