import { useMemo, useState } from 'react'
import type { LapRead, LeadStint } from '../api/types'
import { LeadHistoryChart } from './LeadHistoryChart'
import { computeClassLeadHistory } from '../lib/classLeadHistory'

// "Overall" reuses the backend-computed stints (authoritative for the whole
// field); each class tab is derived client-side since the API only exposes
// the overall leader history.
export function LeadHistoryPanel({ laps, overallStints }: { laps: LapRead[]; overallStints: LeadStint[] }) {
  const classes = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const [view, setView] = useState<'overall' | string>('overall')

  const classStints = useMemo(
    () => (view === 'overall' ? null : computeClassLeadHistory(laps, view)),
    [laps, view],
  )

  const stints = view === 'overall' ? overallStints : (classStints ?? [])

  if (classes.length <= 1) {
    return overallStints.length > 0 ? <LeadHistoryChart stints={overallStints} /> : null
  }

  return (
    <div className="lead-history-panel">
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
      {stints.length > 0 ? (
        <LeadHistoryChart stints={stints} />
      ) : (
        <p className="hint">No lead-history data for this selection.</p>
      )}
    </div>
  )
}
