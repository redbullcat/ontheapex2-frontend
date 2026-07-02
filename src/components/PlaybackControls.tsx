import { PLAYBACK_SPEEDS, type Playback } from '../hooks/usePlayback'

export function PlaybackControls({
  playback,
  min,
  max,
  formatValue = (v) => `Lap ${Math.round(v)}`,
}: {
  playback: Playback
  min: number
  max: number
  formatValue?: (v: number) => string
}) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null

  return (
    <div className="playback-controls">
      <button
        type="button"
        className="playback-btn"
        onClick={playback.toggle}
        aria-label={playback.playing ? 'Pause replay' : 'Play replay'}
        title={playback.playing ? 'Pause replay' : 'Play replay'}
      >
        {playback.playing ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={playback.current}
        onChange={(e) => playback.scrubTo(Number(e.target.value))}
        className="playback-scrubber"
        aria-label="Replay position"
      />
      <span className="playback-readout">{formatValue(playback.current)}</span>
      <select
        className="playback-speed"
        value={playback.speed}
        onChange={(e) => playback.setSpeed(Number(e.target.value))}
        aria-label="Playback speed"
      >
        {PLAYBACK_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
    </div>
  )
}
