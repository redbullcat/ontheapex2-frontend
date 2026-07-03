import { REPLAY_SPEEDS, type ReplayClock } from './useReplayClock'
import { formatClock } from './format'

export function ReplayTransport({ clock, min, max }: { clock: ReplayClock; min: number; max: number }) {
  return (
    <div className="replay-transport">
      <div className="replay-scrub-row">
        <span className="replay-scrub-time">{formatClock(clock.current)}</span>
        <div className="replay-scrubber">
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={clock.current}
            onChange={(e) => clock.scrubTo(Number(e.target.value))}
            aria-label="Replay position"
          />
        </div>
        <span className="replay-scrub-time end">{formatClock(max)}</span>
      </div>
      <div className="replay-controls-row">
        <div className="replay-transport-btns">
          <button type="button" className="replay-btn" onClick={() => clock.skip(-600)}>
            -10m
          </button>
          <button type="button" className="replay-btn" onClick={() => clock.skip(-60)}>
            -1m
          </button>
          <button
            type="button"
            className="replay-btn replay-play"
            onClick={clock.toggle}
            aria-label={clock.playing ? 'Pause' : 'Play'}
          >
            {clock.playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="replay-btn" onClick={() => clock.skip(60)}>
            +1m
          </button>
          <button type="button" className="replay-btn" onClick={() => clock.skip(600)}>
            +10m
          </button>
        </div>
        <span className="replay-clock-readout">{formatClock(clock.current)}</span>
        <div className="replay-speed-group">
          {REPLAY_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={clock.speed === s ? 'active' : ''}
              onClick={() => clock.setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
