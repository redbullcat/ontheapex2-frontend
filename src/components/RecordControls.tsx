import { useState } from 'react'
import type { FinalizeOptions, RecordAspect } from '../hooks/useSvgRecorder'
import type { RaceMoment } from '../lib/raceMoments'
import { RecordFinalizeModal } from './RecordFinalizeModal'

const ASPECT_OPTIONS: { value: RecordAspect; label: string }[] = [
  { value: 'landscape', label: 'Landscape (16:9)' },
  { value: 'portrait', label: 'Portrait (9:16) — Reels/Shorts/Stories' },
  { value: 'square', label: 'Square (1:1)' },
  { value: 'portrait-4-5', label: 'Portrait (4:5) — feed post' },
]

interface RecorderLike {
  recording: boolean
  elapsedSeconds: number
  processing: boolean
  awaitingFinalize: boolean
  previewSource: { blob: Blob; backgroundColor: string } | null
  moments: RaceMoment[]
  setMoments: (moments: RaceMoment[] | ((prev: RaceMoment[]) => RaceMoment[])) => void
  submitFinalize: (options: FinalizeOptions) => void
  cancelFinalize: () => void
  start: (aspect?: RecordAspect) => void
  stop: () => void
}

// Shared by every chart with a Record button (ReplayTrendChart,
// LapPositionChart, GapEvolutionChart) — an aspect-ratio picker plus the
// record/stop button and a recording-time indicator. Portrait/square modes
// crop-and-track a moving window of the chart rather than squashing the
// whole (wide) chart into a tall frame — see useSvgRecorder's
// findRevealEdgeX for how the tracked window follows the reveal animation.
export function RecordControls({ recorder }: { recorder: RecorderLike }) {
  const [aspect, setAspect] = useState<RecordAspect>('landscape')

  return (
    <>
      {recorder.recording && (
        <span className="chart-record-indicator">
          <span className="chart-record-dot" /> {String(Math.floor(recorder.elapsedSeconds / 60)).padStart(2, '0')}:
          {String(recorder.elapsedSeconds % 60).padStart(2, '0')}
        </span>
      )}
      {recorder.processing && (
        <span className="chart-record-indicator" title="Re-encoding with your chosen title/logo — this takes about as long as the recording itself">
          <span className="chart-record-dot" /> Finalizing…
        </span>
      )}
      {!recorder.recording && !recorder.processing && (
        <select
          className="chart-record-aspect"
          value={aspect}
          onChange={(e) => setAspect(e.target.value as RecordAspect)}
          title="Video shape — portrait/square crop and follow the current lap instead of shrinking the whole chart"
        >
          {ASPECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="chart-record-btn"
        disabled={recorder.processing}
        onClick={() => (recorder.recording ? recorder.stop() : recorder.start(aspect))}
        title={
          recorder.recording
            ? 'Stop recording — you\'ll be asked for a title and logo before it downloads'
            : 'Record this chart as a video — play/scrub normally while recording'
        }
      >
        {recorder.recording ? '⏹ Stop' : '⏺ Record'}
      </button>
      {recorder.awaitingFinalize && (
        <RecordFinalizeModal
          preview={recorder.previewSource}
          moments={recorder.moments}
          onMomentsChange={recorder.setMoments}
          onSubmit={recorder.submitFinalize}
          onCancel={recorder.cancelFinalize}
        />
      )}
    </>
  )
}
