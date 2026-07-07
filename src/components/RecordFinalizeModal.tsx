import { useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultAspectOptions,
  toFinalizeOptions,
  type EditableAspectOptions,
  type FinalizeOptions,
  type PreviewSource,
  type RecordAspect,
} from '../hooks/useSvgRecorder'
import { ASPECT_OPTIONS } from '../lib/recordAspects'
import { TITLE_FONT_FAMILIES, stylesForFamily, type TitleFontFamily } from '../lib/fonts'
import { createMoment, type RaceMoment } from '../lib/raceMoments'
import { RecordPreview, type RecordPreviewHandle } from './RecordPreview'

const FONT_SIZE_PRESETS = [16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96]

function styleKey(weight: number, italic: boolean): string {
  return italic ? `${weight}-italic` : `${weight}`
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Shown once a recording stops — asks for an optional title (with font
// family/weight/size), whether to include the On The Apex logo, and any
// "race moments" (a caption + arrow baked in at a specific instant, e.g.
// "Habsburg passes Duval at Les Combes") — all applied in a quick re-encode
// pass right before the video downloads (see useSvgRecorder's
// finalizeVideo), and all reflected live in the preview above the fields
// via RecordPreview/composeFrame. Deliberately shown *after* recording
// rather than before: none of these choices need to be locked in until
// you've actually seen how the clip turned out.
//
// When more than one aspect ratio was recorded at once, a tab bar switches
// between them — each has its own independent preview, title/font/logo,
// and moments, seeded as a clone of a shared starting point the first time
// it's ever shown (see the effect below) and free to diverge from there.
export function RecordFinalizeModal({
  previewSources,
  perAspectOptions,
  onAspectOptionsChange,
  onSubmit,
  onCancel,
}: {
  previewSources: PreviewSource[]
  perAspectOptions: Partial<Record<RecordAspect, EditableAspectOptions>>
  onAspectOptionsChange: (aspect: RecordAspect, options: EditableAspectOptions) => void
  onSubmit: (optionsByAspect: Partial<Record<RecordAspect, FinalizeOptions>>) => void
  onCancel: () => void
}) {
  const [activeAspect, setActiveAspect] = useState<RecordAspect>(previewSources[0]?.aspect ?? 'landscape')
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  const previewRef = useRef<RecordPreviewHandle>(null)

  // Every pending aspect without its own persisted options (see
  // useSvgRecorder's perAspectOptions) starts as a clone of whichever
  // pending aspect already has some — or a fresh default if none do —
  // rather than blank. From here each aspect's edits are independent.
  useEffect(() => {
    if (previewSources.length === 0) return
    const aspects = previewSources.map((p) => p.aspect)
    const missing = aspects.filter((a) => !perAspectOptions[a])
    if (missing.length === 0) return
    const seedAspect = aspects.find((a) => perAspectOptions[a])
    const seed = seedAspect ? perAspectOptions[seedAspect]! : defaultAspectOptions()
    for (const aspect of missing) {
      onAspectOptionsChange(aspect, structuredClone(seed))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSources])

  const active = perAspectOptions[activeAspect] ?? defaultAspectOptions()
  const preview = previewSources.find((p) => p.aspect === activeAspect) ?? null
  const multiAspect = previewSources.length > 1

  const styleOptions = useMemo(() => stylesForFamily(active.family), [active.family])
  const editingMoment = active.moments.find((m) => m.id === editingMomentId) ?? null

  function patchActive(patch: Partial<EditableAspectOptions>) {
    onAspectOptionsChange(activeAspect, { ...active, ...patch })
  }

  function switchAspect(aspect: RecordAspect) {
    if (aspect === activeAspect) return
    setActiveAspect(aspect)
    setEditingMomentId(null)
    setIsPlaying(true)
    setPreviewTime(0)
    setPreviewDuration(0)
  }

  function handleFamilyChange(next: TitleFontFamily) {
    // Saira Condensed has no italic cut — fall back to the same weight,
    // upright, rather than silently rendering upright anyway while the
    // dropdown still claims "Italic".
    const nextOptions = stylesForFamily(next)
    const stillValid = nextOptions.some((opt) => opt.weight === active.weight && opt.italic === active.italic)
    patchActive({ family: next, italic: stillValid ? active.italic : false })
  }

  function handleStyleChange(key: string) {
    const opt = styleOptions.find((o) => styleKey(o.weight, o.italic) === key)
    if (!opt) return
    patchActive({ weight: opt.weight, italic: opt.italic })
  }

  function stopEditing() {
    setEditingMomentId(null)
    setIsPlaying(true)
    previewRef.current?.setPlaying(true)
  }

  function handleAddMoment() {
    const m = createMoment(previewTime)
    patchActive({ moments: [...active.moments, m] })
    setEditingMomentId(m.id)
    setIsPlaying(false)
    previewRef.current?.setPlaying(false)
    previewRef.current?.seek(previewTime)
  }

  function handlePositionToggle(m: RaceMoment) {
    if (editingMomentId === m.id) {
      stopEditing()
      return
    }
    setEditingMomentId(m.id)
    setIsPlaying(false)
    previewRef.current?.setPlaying(false)
    previewRef.current?.seek(m.atSeconds)
  }

  function handleRemove(id: string) {
    patchActive({ moments: active.moments.filter((m) => m.id !== id) })
    if (editingMomentId === id) stopEditing()
  }

  function handleMomentPatch(id: string, patch: Partial<Pick<RaceMoment, 'text' | 'fontSize' | 'holdSeconds'>>) {
    patchActive({ moments: active.moments.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  }

  function handleMomentDrag(id: string, patch: Partial<Pick<RaceMoment, 'textPos' | 'anchorPos'>>) {
    patchActive({ moments: active.moments.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  }

  // Called continuously while positioning a moment and playback/scrubbing
  // moves it away from its current time — see RecordPreview's editing
  // branch. Scrubbing or playing while positioning *is* how you retime it.
  function handleMomentRetime(id: string, atSeconds: number) {
    patchActive({ moments: active.moments.map((m) => (m.id === id ? { ...m, atSeconds } : m)) })
  }

  function handleScrub(seconds: number) {
    setIsPlaying(false)
    previewRef.current?.setPlaying(false)
    previewRef.current?.seek(seconds)
    setPreviewTime(seconds)
  }

  function togglePlaying() {
    const next = !isPlaying
    setIsPlaying(next)
    previewRef.current?.setPlaying(next)
  }

  function handleDownload() {
    const optionsByAspect: Partial<Record<RecordAspect, FinalizeOptions>> = {}
    for (const p of previewSources) {
      const e = perAspectOptions[p.aspect] ?? defaultAspectOptions()
      optionsByAspect[p.aspect] = toFinalizeOptions(e)
    }
    onSubmit(optionsByAspect)
  }

  const sortedMoments = [...active.moments].sort((a, b) => a.atSeconds - b.atSeconds)

  return (
    <div className="record-finalize-backdrop" onClick={onCancel}>
      <div className="record-finalize-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Finish recording</h3>

        {multiAspect && (
          <div className="record-finalize-aspect-tabs">
            {previewSources.map((p) => (
              <button
                key={p.aspect}
                type="button"
                className={p.aspect === activeAspect ? 'active' : ''}
                onClick={() => switchAspect(p.aspect)}
              >
                {ASPECT_OPTIONS.find((o) => o.value === p.aspect)?.shortLabel ?? p.aspect}
              </button>
            ))}
          </div>
        )}

        {preview && (
          <RecordPreview
            key={activeAspect}
            ref={previewRef}
            blob={preview.blob}
            backgroundColor={preview.backgroundColor}
            options={toFinalizeOptions(active)}
            editingMoment={editingMoment}
            onMomentDrag={handleMomentDrag}
            onMomentRetime={handleMomentRetime}
            onTimeUpdate={(t, d) => {
              setPreviewTime(t)
              setPreviewDuration(d)
            }}
          />
        )}
        {preview && (
          <div className="record-finalize-scrub">
            <button type="button" className="btn icon" onClick={togglePlaying} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(previewDuration, 0.1)}
              step={0.05}
              value={Math.min(previewTime, Math.max(previewDuration, 0.1))}
              onChange={(e) => handleScrub(Number(e.target.value))}
            />
            <span className="record-finalize-scrub-time">{formatTime(previewTime)}</span>
          </div>
        )}

        <label className="record-finalize-field">
          Title (optional)
          <input
            type="text"
            value={active.title}
            onChange={(e) => patchActive({ title: e.target.value })}
            placeholder="e.g. 2026 Spa 6H lap chart — Hypercar"
            autoFocus
          />
        </label>
        <div className="record-finalize-font-row">
          <label className="record-finalize-field">
            Font
            <select value={active.family} onChange={(e) => handleFamilyChange(e.target.value as TitleFontFamily)}>
              {TITLE_FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="record-finalize-field">
            Style
            <select value={styleKey(active.weight, active.italic)} onChange={(e) => handleStyleChange(e.target.value)}>
              {styleOptions.map((opt) => (
                <option key={styleKey(opt.weight, opt.italic)} value={styleKey(opt.weight, opt.italic)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="record-finalize-field record-finalize-size">
            Size
            <input
              type="number"
              min={8}
              max={200}
              value={active.size}
              list="record-finalize-size-presets"
              onChange={(e) => {
                const next = Number(e.target.value)
                if (Number.isFinite(next)) patchActive({ size: next })
              }}
            />
            <datalist id="record-finalize-size-presets">
              {FONT_SIZE_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="record-finalize-checkbox">
          <input type="checkbox" checked={active.includeLogo} onChange={(e) => patchActive({ includeLogo: e.target.checked })} />
          Include OTA logo?
        </label>

        <div className="record-finalize-section-head">
          <h4>Race moments</h4>
          <button type="button" className="record-finalize-add-moment" onClick={handleAddMoment} disabled={!preview}>
            + Add new moment
          </button>
        </div>
        {sortedMoments.length > 0 && (
          <div className="record-finalize-moments">
            {sortedMoments.map((m, i) => (
              <div className="record-finalize-moment" key={m.id}>
                <span className="record-finalize-moment-idx">{i + 1}</span>
                <input
                  type="text"
                  value={m.text}
                  placeholder="What happened here?"
                  onChange={(e) => handleMomentPatch(m.id, { text: e.target.value })}
                />
                <div className="record-finalize-moment-meta">
                  <span className="record-finalize-moment-time">at {formatTime(m.atSeconds)}</span>
                  <label>
                    Size
                    <input
                      type="number"
                      min={10}
                      max={200}
                      value={m.fontSize}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (Number.isFinite(next)) handleMomentPatch(m.id, { fontSize: next })
                      }}
                    />
                  </label>
                  <label>
                    Hold
                    <input
                      type="number"
                      min={0.5}
                      max={30}
                      step={0.5}
                      value={m.holdSeconds}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (Number.isFinite(next)) handleMomentPatch(m.id, { holdSeconds: next })
                      }}
                    />
                    s
                  </label>
                </div>
                <div className="record-finalize-moment-actions">
                  <button type="button" className="btn" onClick={() => handlePositionToggle(m)}>
                    {editingMomentId === m.id ? 'Done' : 'Position it'}
                  </button>
                  <button type="button" className="btn icon" title="Remove" onClick={() => handleRemove(m.id)}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="record-finalize-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="record-finalize-primary" onClick={handleDownload}>
            {multiAspect ? `Download ${previewSources.length} videos (.zip)` : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
