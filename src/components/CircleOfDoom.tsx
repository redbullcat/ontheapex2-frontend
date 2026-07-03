import { getTeamColor } from '../lib/identityColors'

// Modelled on PACETEQ ONE TIMING's "Circle of Doom": a linearized track laid
// out as a circle, with each car placed by how far around the lap it's
// estimated to be (interpolated between known crossings — see
// lib/trackFraction.ts / live/liveTrackPosition.ts), not real telemetry
// unless isLive is set. Start/finish sits at 12 o'clock, cars proceed
// clockwise.
export interface CircleOfDoomCar {
  car_number: string
  team: string | null
  fraction: number
  isLive?: boolean
}

const SIZE = 320
const CENTER = SIZE / 2
const RADIUS = SIZE / 2 - 28

function pointOnCircle(fraction: number): { x: number; y: number } {
  const angle = fraction * 2 * Math.PI - Math.PI / 2
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) }
}

export function CircleOfDoom({ cars, focusCarNumber }: { cars: CircleOfDoomCar[]; focusCarNumber?: string }) {
  const anyLive = cars.some((c) => c.isLive)
  return (
    <div className="circle-of-doom">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label="Circle of doom">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} className="circle-of-doom-track" />
        <line x1={CENTER} y1={CENTER - RADIUS - 8} x2={CENTER} y2={CENTER - RADIUS + 8} className="circle-of-doom-start" />
        {cars.map((c) => {
          const { x, y } = pointOnCircle(c.fraction)
          const isFocus = c.car_number === focusCarNumber
          return (
            <g key={c.car_number} className={isFocus ? 'circle-of-doom-car circle-of-doom-car-focus' : 'circle-of-doom-car'}>
              <circle cx={x} cy={y} r={isFocus ? 12 : 9} fill={getTeamColor(c.team)} stroke="#fff" strokeWidth={1.5} />
              <text x={x} y={y} dy="0.32em" textAnchor="middle" className="circle-of-doom-label">
                {c.car_number}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="replay-hint circle-of-doom-hint">
        {anyLive
          ? 'Car positions from live GPS where available, estimated between timing crossings otherwise.'
          : 'Car positions estimated between timing-loop crossings, not real telemetry — same principle as PACETEQ ONE TIMING’s Circle of Doom.'}
      </p>
    </div>
  )
}
