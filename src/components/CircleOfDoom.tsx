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

function pointOnCircle(fraction: number, radius = RADIUS): { x: number; y: number } {
  const angle = fraction * 2 * Math.PI - Math.PI / 2
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) }
}

// A short radial tick + label at a given fraction, matching the
// start/finish marker's style — used for both that and the sector splits.
function RadialTick({ fraction, label, className }: { fraction: number; label: string; className: string }) {
  const inner = pointOnCircle(fraction, RADIUS - 8)
  const outer = pointOnCircle(fraction, RADIUS + 8)
  const labelPos = pointOnCircle(fraction, RADIUS + 20)
  return (
    <g>
      <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className={className} />
      <text x={labelPos.x} y={labelPos.y} dy="0.32em" textAnchor="middle" className="circle-of-doom-tick-label">
        {label}
      </text>
    </g>
  )
}

export function CircleOfDoom({
  cars,
  focusCarNumber,
  sectorFractions,
}: {
  cars: CircleOfDoomCar[]
  focusCarNumber?: string
  // [s1EndFraction, s2EndFraction] — see lib/trackFraction.ts's
  // computeSectorFractions for how these are derived.
  sectorFractions?: [number, number] | null
}) {
  const anyLive = cars.some((c) => c.isLive)
  return (
    <div className="circle-of-doom">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label="Circle of doom">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} className="circle-of-doom-track" />
        <RadialTick fraction={0} label="S/F" className="circle-of-doom-start" />
        {sectorFractions && (
          <>
            <RadialTick fraction={sectorFractions[0]} label="S1" className="circle-of-doom-sector-tick" />
            <RadialTick fraction={sectorFractions[1]} label="S2" className="circle-of-doom-sector-tick" />
          </>
        )}
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
        {' '}Sector splits are the field's typical share of lap time, not physical distance — a car in the pits is pinned to S/F.
      </p>
    </div>
  )
}
