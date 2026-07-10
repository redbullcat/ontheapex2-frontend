import { getTeamColor } from '../lib/identityColors'
import { tyreCompoundColor } from '../lib/tyreColors'
import './TyresPanel.css'

export interface TyreRow {
  car_number: string
  team: string | null
  position: number | null
  tire_fl_compound: string | null
  tire_fl_age_laps: number | null
  tire_fr_compound: string | null
  tire_fr_age_laps: number | null
  tire_rl_compound: string | null
  tire_rl_age_laps: number | null
  tire_rr_compound: string | null
  tire_rr_age_laps: number | null
}

function wheelTitle(compound: string | null, age: number | null): string {
  if (!compound) return 'No tyre data'
  return age != null ? `${compound} — ${age} lap${age === 1 ? '' : 's'} old` : compound
}

function Wheel({ compound, age }: { compound: string | null; age: number | null }) {
  return <span className="tyre-wheel" style={{ background: tyreCompoundColor(compound) }} title={wheelTitle(compound, age)} />
}

// Same 2x2 layout every car's tyre indicator uses on real timing screens:
// front pair on top (FL/FR), rear pair below (RL/RR).
export function TyresPanel({ rows }: { rows: TyreRow[] }) {
  const sorted = [...rows].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))

  if (sorted.length === 0) {
    return <p className="replay-hint">No tyre data yet.</p>
  }

  return (
    <div className="tyres-panel-wrap">
      {sorted.map((row) => (
        <div className="tyres-panel-row" key={row.car_number}>
          <span className="tyres-panel-badge" style={{ background: getTeamColor(row.team), color: '#fff' }}>
            #{row.car_number}
          </span>
          <div className="tyres-panel-grid">
            <Wheel compound={row.tire_fl_compound} age={row.tire_fl_age_laps} />
            <Wheel compound={row.tire_fr_compound} age={row.tire_fr_age_laps} />
            <Wheel compound={row.tire_rl_compound} age={row.tire_rl_age_laps} />
            <Wheel compound={row.tire_rr_compound} age={row.tire_rr_age_laps} />
          </div>
        </div>
      ))}
    </div>
  )
}
