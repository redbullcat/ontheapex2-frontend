import { useEffect, useRef, useState } from 'react'
import type { RowState } from './replayEngine'
import { getTeamDisplayName } from '../lib/identityColors'
import { formatGap, formatLapTime, formatSplit } from './format'

// True for ~700ms of real wall-clock time whenever `value` changes —
// deliberately real time, not sim time, so the flash reads the same at 1x
// or 30x replay speed even though many sim-seconds can pass in one frame.
function useFlash(value: number): boolean {
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 700)
    return () => clearTimeout(t)
  }, [value])
  return flash
}

function ReplayRow({ row }: { row: RowState }) {
  const s1Flash = useFlash(row.s1UpdatedAt)
  const s2Flash = useFlash(row.s2UpdatedAt)
  const s3Flash = useFlash(row.s3UpdatedAt)
  const moved = useFlash(row.positionChangedAt)

  const rowClass = ['replay-row', row.inPit ? 'in-pit' : '', moved ? 'moved' : ''].filter(Boolean).join(' ')

  return (
    <tr className={rowClass}>
      <td className="num pos">{row.position}</td>
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
          <td className={s1Flash ? 'num flash' : 'num'}>{formatSplit(row.s1)}</td>
          <td className={s2Flash ? 'num flash' : 'num'}>{formatSplit(row.s2)}</td>
          <td className={s3Flash ? 'num flash' : 'num'}>{formatSplit(row.s3)}</td>
        </>
      )}
      <td className="num best">{formatLapTime(row.bestLap)}</td>
      <td className="num last">{formatLapTime(row.lastLap)}</td>
      <td className="num">{row.pits}</td>
      <td className="num">{row.sincePit ?? '—'}</td>
    </tr>
  )
}

export function ReplayLeaderboard({ rows }: { rows: RowState[] }) {
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
          {rows.map((r) => (
            <ReplayRow key={r.car_number} row={r} />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="replay-hint">No cars have started this session yet at this point.</p>}
    </div>
  )
}
