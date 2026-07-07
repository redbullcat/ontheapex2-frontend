import { useMemo, useRef, useState } from 'react'
import type { FinalizeOptions } from '../hooks/useSvgRecorder'
import { DEFAULT_TITLE_FONT, TITLE_FONT_FAMILIES, stylesForFamily, type TitleFontFamily } from '../lib/fonts'
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
export function RecordFinalizeModal({
  preview,
  moments,
  onMomentsChange,
  onSubmit,
  onCancel,
}: {
  preview: { blob: Blob; backgroundColor: string } | null
  moments: RaceMoment[]
  onMomentsChange: (moments: RaceMoment[]) => void
  onSubmit: (options: FinalizeOptions) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [includeLogo, setIncludeLogo] = useState(true)
  const [family, setFamily] = useState<TitleFontFamily>(DEFAULT_TITLE_FONT.family)
  const [weight, setWeight] = useState(DEFAULT_TITLE_FONT.weight)
  const [italic, setItalic] = useState(DEFAULT_TITLE_FONT.italic)
  const [size, setSize] = useState(DEFAULT_TITLE_FONT.size)
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)

  const previewRef = useRef<RecordPreviewHandle>(null)

  const styleOptions = useMemo(() => stylesForFamily(family), [family])

  const font = { family, weight, italic, size }
  const options: FinalizeOptions = { title: title.trim() || null, includeLogo, font, moments }
  const editingMoment = moments.find((m) => m.id === editingMomentId) ?? null

  function handleFamilyChange(next: TitleFontFamily) {
    setFamily(next)
    // Saira Condensed has no italic cut — fall back to the same weight,
    // upright, rather than silently rendering upright anyway while the
    // dropdown still claims "Italic".
    const nextOptions = stylesForFamily(next)
    if (!nextOptions.some((opt) => opt.weight === weight && opt.italic === italic)) {
      setItalic(false)
    }
  }

  function handleStyleChange(key: string) {
    const opt = styleOptions.find((o) => styleKey(o.weight, o.italic) === key)
    if (!opt) return
    setWeight(opt.weight)
    setItalic(opt.italic)
  }

  function stopEditing() {
    setEditingMomentId(null)
    previewRef.current?.setPlaying(true)
  }

  function handleAddMoment() {
    const m = createMoment(previewTime)
    onMomentsChange([...moments, m])
    setEditingMomentId(m.id)
    previewRef.current?.setPlaying(false)
    previewRef.current?.seek(previewTime)
  }

  function handlePositionToggle(m: RaceMoment) {
    if (editingMomentId === m.id) {
      stopEditing()
      return
    }
    setEditingMomentId(m.id)
    previewRef.current?.setPlaying(false)
    previewRef.current?.seek(m.atSeconds)
  }

  function handleRemove(id: string) {
    onMomentsChange(moments.filter((m) => m.id !== id))
    if (editingMomentId === id) stopEditing()
  }

  function handleMomentPatch(id: string, patch: Partial<Pick<RaceMoment, 'text' | 'fontSize' | 'holdSeconds'>>) {
    onMomentsChange(moments.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function handleMomentDrag(id: string, patch: Partial<Pick<RaceMoment, 'textPos' | 'anchorPos'>>) {
    onMomentsChange(moments.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function handleScrub(seconds: number) {
    previewRef.current?.setPlaying(false)
    previewRef.current?.seek(seconds)
    setPreviewTime(seconds)
  }

  const sortedMoments = [...moments].sort((a, b) => a.atSeconds - b.atSeconds)

  return (
    <div className="record-finalize-backdrop" onClick={onCancel}>
      <div className="record-finalize-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Finish recording</h3>
        {preview && (
          <RecordPreview
            ref={previewRef}
            blob={preview.blob}
            backgroundColor={preview.backgroundColor}
            options={options}
            editingMoment={editingMoment}
            onMomentDrag={handleMomentDrag}
            onTimeUpdate={(t, d) => {
              setPreviewTime(t)
              setPreviewDuration(d)
            }}
          />
        )}
        {preview && (
          <div className="record-finalize-scrub">
            <button
              type="button"
              className="btn icon"
              onClick={() => previewRef.current?.setPlaying(true)}
              title="Resume auto-play"
            >
              ▶
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 2026 Spa 6H lap chart — Hypercar"
            autoFocus
          />
        </label>
        <div className="record-finalize-font-row">
          <label className="record-finalize-field">
            Font
            <select value={family} onChange={(e) => handleFamilyChange(e.target.value as TitleFontFamily)}>
              {TITLE_FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="record-finalize-field">
            Style
            <select value={styleKey(weight, italic)} onChange={(e) => handleStyleChange(e.target.value)}>
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
              value={size}
              list="record-finalize-size-presets"
              onChange={(e) => {
                const next = Number(e.target.value)
                if (Number.isFinite(next)) setSize(next)
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
          <input type="checkbox" checked={includeLogo} onChange={(e) => setIncludeLogo(e.target.checked)} />
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
          <button type="button" className="record-finalize-primary" onClick={() => onSubmit(options)}>
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
