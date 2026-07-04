import { computeSectorLeaders } from '../lib/sectorLeaders'
import { getTeamDisplayName } from '../lib/identityColors'
import { formatSplit } from '../replay/format'

interface SectorLapLike {
  car_number: string
  class: string | null
  team: string | null
  s1_seconds: number | null
  s2_seconds: number | null
  s3_seconds: number | null
}

const SECTOR_LABELS = ['S1', 'S2', 'S3'] as const

// Current purple (session-best) time per class per sector — see
// lib/sectorLeaders.ts for why this shows only the current holder rather
// than a scrolling feed of "just went purple" events.
export function SectorLeaderboardTicker({ laps }: { laps: SectorLapLike[] }) {
  const leaders = computeSectorLeaders(laps)
  const classes = [...new Set(leaders.map((l) => l.cls))].sort()

  if (classes.length === 0) return <p className="replay-hint">No sector data yet.</p>

  return (
    <div className="sector-ticker">
      {classes.map((cls) => {
        const bySector = new Map(leaders.filter((l) => l.cls === cls).map((l) => [l.sector, l]))
        return (
          <div className="sector-ticker-class" key={cls}>
            <span className="class-chip">{cls}</span>
            <div className="sector-ticker-row">
              {([1, 2, 3] as const).map((sector) => {
                const leader = bySector.get(sector)
                return (
                  <div className="sector-ticker-cell" key={sector}>
                    <span className="sector-ticker-label">{SECTOR_LABELS[sector - 1]}</span>
                    {leader ? (
                      <>
                        <span className="sector-ticker-time badge-session">{formatSplit(leader.seconds)}</span>
                        <span className="sector-ticker-car">
                          #{leader.car_number} · {getTeamDisplayName(leader.team)}
                        </span>
                      </>
                    ) : (
                      <span className="sector-ticker-time">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
