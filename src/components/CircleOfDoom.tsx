import { useCallback, useRef } from 'react'
import { getTeamColor } from '../lib/identityColors'
import { useFractionAnimation } from '../hooks/useFractionAnimation'

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

  // Car dots/labels move via direct DOM writes (see useFractionAnimation),
  // never through React re-renders — cx/cy/x/y below are only the initial
  // placement at mount, set once via the ref callbacks and then owned
  // exclusively by the animation tick from then on. Two separate maps
  // (rather than one keyed to a {circle, text} pair) because ref callbacks
  // fire independently per element.
  const circleRefs = useRef(new Map<string, SVGCircleElement>())
  const textRefs = useRef(new Map<string, SVGTextElement>())

  const onTick = useCallback((carNumber: string, fraction: number) => {
    const { x, y } = pointOnCircle(fraction)
    const circle = circleRefs.current.get(carNumber)
    if (circle) {
      circle.setAttribute('cx', String(x))
      circle.setAttribute('cy', String(y))
    }
    const text = textRefs.current.get(carNumber)
    if (text) {
      text.setAttribute('x', String(x))
      text.setAttribute('y', String(y))
    }
  }, [])

  useFractionAnimation(cars, onTick)

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
          const isFocus = c.car_number === focusCarNumber
          // cx/cy/x/y are deliberately NOT passed as JSX props — if they
          // were, React would reset them to c.fraction's raw position on
          // every re-render (cars is a fresh array every frame while
          // Replay plays), overwriting whatever the animation tick wrote
          // in between and defeating the smoothing entirely. Set once
          // here, guarded so ref-callback churn (a new inline closure
          // every render) doesn't re-trigger it, then owned exclusively
          // by useFractionAnimation's onTick from then on.
          const initPosition = (el: Element | null, xAttr: string, yAttr: string) => {
            if (!el || (el as HTMLElement).dataset.inited === '1') return
            const { x, y } = pointOnCircle(c.fraction)
            el.setAttribute(xAttr, String(x))
            el.setAttribute(yAttr, String(y))
            ;(el as HTMLElement).dataset.inited = '1'
          }
          return (
            <g key={c.car_number} className={isFocus ? 'circle-of-doom-car circle-of-doom-car-focus' : 'circle-of-doom-car'}>
              <circle
                ref={(el) => {
                  if (el) circleRefs.current.set(c.car_number, el)
                  else circleRefs.current.delete(c.car_number)
                  initPosition(el, 'cx', 'cy')
                }}
                r={isFocus ? 12 : 9}
                fill={getTeamColor(c.team)}
                stroke="#fff"
                strokeWidth={1.5}
              />
              <text
                ref={(el) => {
                  if (el) textRefs.current.set(c.car_number, el)
                  else textRefs.current.delete(c.car_number)
                  initPosition(el, 'x', 'y')
                }}
                dy="0.32em"
                textAnchor="middle"
                className="circle-of-doom-label"
              >
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
