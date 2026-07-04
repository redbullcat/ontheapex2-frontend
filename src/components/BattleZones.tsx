import { computeBattleZones, type BattleRow } from '../lib/battleZones'
import { getTeamDisplayName } from '../lib/identityColors'

export function BattleZones({ rows, thresholdSeconds = 2 }: { rows: BattleRow[]; thresholdSeconds?: number }) {
  const zones = computeBattleZones(rows, thresholdSeconds)

  if (zones.length === 0) {
    return <p className="replay-hint">No battles within {thresholdSeconds}s right now.</p>
  }

  return (
    <div className="battle-zones">
      {zones.map((zone, i) => (
        <div className="battle-zone" key={i}>
          <div className="battle-zone-header">
            <span>
              Battle for P{zone.cars[0].position}–P{zone.cars[zone.cars.length - 1].position}
            </span>
            <span className="battle-zone-gap">{zone.closestGapSeconds.toFixed(1)}s covers it</span>
          </div>
          <div className="battle-zone-cars">
            {zone.cars.map((car, idx) => (
              <span className="battle-zone-car" key={car.car_number}>
                <span className="car-num">#{car.car_number}</span> {getTeamDisplayName(car.team)}
                {idx < zone.cars.length - 1 && <span className="battle-zone-arrow"> → </span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
