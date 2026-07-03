import type { RowState } from './replayEngine'
import { getTeamDisplayName } from '../lib/identityColors'
import { formatGap, formatLapTime, formatSplit } from './format'
import { useFlash } from '../hooks/useFlash'
import { PositionChangeArrow } from '../components/PositionChangeArrow'

// Arrow shown for much longer (10s) than the cell's own 700ms flash pulse —
// the flash draws the eye the instant it happens, the arrow gives a few
// extra seconds to actually notice which way and confirm it before it fades.
const ARROW_VISIBLE_MS = 10000

function badgeClass(badge: RowState['s1Badge']): string {
  if (badge === 'session') return ' badge-session'
  if (badge === 'personal') return ' badge-personal'
  return ''
}

function ReplayRow({
  row,
  highlighted,
  onClick,
}: {
  row: RowState
  highlighted: boolean
  onClick?: (carNumber: string) => void
}) {
  const s1Flash = useFlash(row.s1UpdatedAt)
  const s2Flash = useFlash(row.s2UpdatedAt)
  const s3Flash = useFlash(row.s3UpdatedAt)
  const moved = useFlash(row.positionChangedAt)
  const arrowVisible = useFlash(row.positionChangedAt, ARROW_VISIBLE_MS)

  const rowClass = [
    'replay-row',
    row.inPit ? 'in-pit' : '',
    moved ? 'moved' : '',
    highlighted ? 'highlighted' : '',
    onClick ? 'clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <tr className={rowClass} onClick={onClick ? () => onClick(row.car_number) : undefined}>
      <td className="num pos">
        {row.position}
        {arrowVisible && <PositionChangeArrow direction={row.positionDirection} />}
      </td>
      <td className="num cls-pos">{row.classPosition}</td>
      <td className="al">
        <span className="class-chip">{row.class}</span>
      </td>
      <td className="al">
        <span className="car-num">#{row.car_number}</span>
      </td>
      <td className="al driver">{row.driver_name ?? '—'}</td>
      <td className="al team">{getTeamDisplayName(row.team)}</td>
      <td className="num gap">{formatGap(row.gap)}</td>
      <td className="num interval">{formatGap(row.interval)}</td>
      <td className="num">{row.lap || ''}</td>
      {row.inPit ? (
        <td className="num s-merged" colSpan={3}>
          <span className="pit-label">IN PIT</span>
        </td>
      ) : (
        <>
          <td className={(s1Flash ? 'num flash' : 'num') + badgeClass(row.s1Badge)}>{formatSplit(row.s1)}</td>
          <td className={(s2Flash ? 'num flash' : 'num') + badgeClass(row.s2Badge)}>{formatSplit(row.s2)}</td>
          <td className={(s3Flash ? 'num flash' : 'num') + badgeClass(row.s3Badge)}>{formatSplit(row.s3)}</td>
        </>
      )}
      <td className="num best">{formatLapTime(row.bestLap)}</td>
      <td className={'num last' + badgeClass(row.lastLapBadge)}>{formatLapTime(row.lastLap)}</td>
      <td className="num">{row.pits}</td>
      <td className="num">{row.sincePit ?? '—'}</td>
    </tr>
  )
}

export function ReplayLeaderboard({
  rows,
  activeClasses,
  highlightedCars,
  onRowClick,
}: {
  rows: RowState[]
  activeClasses: Set<string>
  highlightedCars?: Set<string>
  onRowClick?: (carNumber: string) => void
}) {
  const visible = rows.filter((r) => activeClasses.has(r.class))
  return (
    <div className="replay-board-wrap">
      <table className="replay-board">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Cls&nbsp;Pos</th>
            <th className="al">Class</th>
            <th className="al">Car</th>
            <th className="al">Driver</th>
            <th className="al">Team</th>
            <th>Gap</th>
            <th>Int</th>
            <th>Lap</th>
            <th>S1</th>
            <th>S2</th>
            <th>S3</th>
            <th>Best</th>
            <th>Last</th>
            <th>Pits</th>
            <th>Since&nbsp;pit</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <ReplayRow key={r.car_number} row={r} highlighted={highlightedCars?.has(r.car_number) ?? false} onClick={onRowClick} />
          ))}
        </tbody>
      </table>
      {visible.length === 0 && <p className="replay-hint">No cars in this class have started yet at this point.</p>}
    </div>
  )
}
