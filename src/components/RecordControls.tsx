import { useState } from 'react'
import type { EditableAspectOptions, FinalizeOptions, PreviewSource, RecordAspect } from '../hooks/useSvgRecorder'
import { ASPECT_OPTIONS } from '../lib/recordAspects'
import { RecordFinalizeModal } from './RecordFinalizeModal'

interface RecorderLike {
  recording: boolean
  elapsedSeconds: number
  processing: boolean
  processingProgress: number | null
  awaitingFinalize: boolean
  previewSources: PreviewSource[]
  perAspectOptions: Partial<Record<RecordAspect, EditableAspectOptions>>
  setPerAspectOptions: (
    update:
      | Partial<Record<RecordAspect, EditableAspectOptions>>
      | ((prev: Partial<Record<RecordAspect, EditableAspectOptions>>) => Partial<Record<RecordAspect, EditableAspectOptions>>),
  ) => void
  submitFinalize: (optionsByAspect: Partial<Record<RecordAspect, FinalizeOptions>>) => void
  cancelFinalize: () => void
  start: (aspects: RecordAspect[]) => void
  stop: () => void
}

// Shared by every chart with a Record button (ReplayTrendChart,
// LapPositionChart, GapEvolutionChart) — an aspect-ratio picker (one or
// more shapes, all recorded simultaneously from a single live playthrough)
// plus the record/stop button and a recording-time indicator.
// Portrait/square modes crop-and-track a moving window of the chart rather
// than squashing the whole (wide) chart into a tall frame — see
// useSvgRecorder's findRevealEdgeX for how the tracked window follows the
// reveal animation.
export function RecordControls({ recorder }: { recorder: RecorderLike }) {
  const [selectedAspects, setSelectedAspects] = useState<RecordAspect[]>(['landscape'])
  const [pickerOpen, setPickerOpen] = useState(false)

  function toggleAspect(aspect: RecordAspect) {
    setSelectedAspects((prev) => {
      if (prev.includes(aspect)) {
        // Always leave at least one selected — there's nothing to record
        // with zero shapes chosen.
        if (prev.length === 1) return prev
        return prev.filter((a) => a !== aspect)
      }
      return [...prev, aspect]
    })
  }

  const summary =
    selectedAspects.length === 1
      ? (ASPECT_OPTIONS.find((o) => o.value === selectedAspects[0])?.shortLabel ?? selectedAspects[0])
      : `${selectedAspects.length} formats`

  return (
    <>
      {recorder.recording && (
        <span className="chart-record-indicator">
          <span className="chart-record-dot" /> {String(Math.floor(recorder.elapsedSeconds / 60)).padStart(2, '0')}:
          {String(recorder.elapsedSeconds % 60).padStart(2, '0')}
        </span>
      )}
      {recorder.processing && (
        <span
          className="chart-record-indicator"
          title="Re-encoding with your chosen title/logo/moments — this can take about as long as the recording itself, per format"
        >
          <span className="chart-record-dot" />
          Finalizing{recorder.processingProgress != null ? `… ${Math.round(recorder.processingProgress * 100)}%` : '…'}
        </span>
      )}
      {!recorder.recording && !recorder.processing && (
        <div className="chart-record-aspect-picker">
          <button
            type="button"
            className="chart-record-aspect-btn"
            onClick={() => setPickerOpen((v) => !v)}
            title="Video shape(s) — pick more than one to export several sizes from the same recording"
          >
            {summary} ▾
          </button>
          {pickerOpen && (
            <>
              <div className="chart-record-aspect-backdrop" onClick={() => setPickerOpen(false)} />
              <div className="chart-record-aspect-menu">
                {ASPECT_OPTIONS.map((opt) => (
                  <label key={opt.value} className="chart-record-aspect-option">
                    <input
                      type="checkbox"
                      checked={selectedAspects.includes(opt.value)}
                      onChange={() => toggleAspect(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        className="chart-record-btn"
        disabled={recorder.processing}
        onClick={() => (recorder.recording ? recorder.stop() : recorder.start(selectedAspects))}
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
          previewSources={recorder.previewSources}
          perAspectOptions={recorder.perAspectOptions}
          onAspectOptionsChange={(aspect, options) =>
            recorder.setPerAspectOptions((prev) => ({ ...prev, [aspect]: options }))
          }
          onSubmit={recorder.submitFinalize}
          onCancel={recorder.cancelFinalize}
        />
      )}
    </>
  )
}
