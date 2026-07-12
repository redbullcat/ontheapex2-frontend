import { useMemo, useState } from 'react'
import type { LiveLap } from '../api/types'
import { liveLapToLapRead } from '../lib/liveLapAdapter'
import { computeClassLeadHistory, computeOverallLeadHistory } from '../lib/classLeadHistory'
import { LeadHistoryChart } from '../components/LeadHistoryChart'
import { computeLedRows } from './liveLeadStats'

function LedTable({ title, rows, labelHeader, subHeader }: { title: string; rows: ReturnType<typeof computeLedRows>; labelHeader: string; subHeader: string }) {
  return (
    <div className="lead-stats-block">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="replay-hint">No laps led yet.</p>
      ) : (
        <div className="replay-board-wrap">
          <table className="replay-board">
            <thead>
              <tr>
                <th className="al">{labelHeader}</th>
                <th className="al">{subHeader}</th>
                <th>Laps led</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="replay-row">
                  <td className="al">{r.label}</td>
                  <td className="al">{r.sub}</td>
                  <td className="num">{r.lapsLed}</td>
                  <td className="num">{r.percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function LiveLeadHistoryPanel({ laps }: { laps: LiveLap[] }) {
  const adaptedLaps = useMemo(() => laps.map((lap, i) => liveLapToLapRead(lap, i)), [laps])

  const classes = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const [view, setView] = useState<'overall' | string>('overall')

  const stints = useMemo(
    () => (view === 'overall' ? computeOverallLeadHistory(adaptedLaps) : computeClassLeadHistory(adaptedLaps, view)),
    [adaptedLaps, view],
  )

  const carRows = useMemo(() => computeLedRows(laps, 'car'), [laps])
  const driverRows = useMemo(() => computeLedRows(laps, 'driver'), [laps])

  return (
    <div className="live-lead-history-panel">
      <style>{`
        .live-lead-history-panel .lead-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 16px;
        }
        @container (max-width: 500px) {
          .live-lead-history-panel .lead-stats-grid { grid-template-columns: 1fr; }
        }
        .live-lead-history-panel .lead-stats-block h4 {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #52514e);
        }
      `}</style>
      {classes.length > 1 && (
        <div className="color-mode-toggle" role="radiogroup" aria-label="Lead history view">
          <button type="button" className={view === 'overall' ? 'active' : ''} onClick={() => setView('overall')}>
            Overall
          </button>
          {classes.map((cls) => (
            <button key={cls} type="button" className={view === cls ? 'active' : ''} onClick={() => setView(cls)}>
              {cls}
            </button>
          ))}
        </div>
      )}
      {stints.length > 0 ? <LeadHistoryChart stints={stints} /> : <p className="replay-hint">No lead-history data yet.</p>}
      <div className="lead-stats-grid">
        <LedTable title="Laps led — by car" rows={carRows} labelHeader="Car" subHeader="Team" />
        <LedTable title="Laps led — by driver" rows={driverRows} labelHeader="Driver" subHeader="Car" />
      </div>
    </div>
  )
}
