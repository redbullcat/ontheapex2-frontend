import { useMemo, useState } from 'react'
import type { FinalizeOptions } from '../hooks/useSvgRecorder'
import { DEFAULT_TITLE_FONT, TITLE_FONT_FAMILIES, stylesForFamily, type TitleFontFamily } from '../lib/fonts'
import { RecordPreview } from './RecordPreview'

const FONT_SIZE_PRESETS = [16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96]

function styleKey(weight: number, italic: boolean): string {
  return italic ? `${weight}-italic` : `${weight}`
}

// Shown once a recording stops — asks for an optional title (with font
// family/weight/size) and whether to include the On The Apex logo, all
// applied in a quick re-encode pass right before the video downloads (see
// useSvgRecorder's finalizeVideo), and all reflected live in the preview
// above the fields via RecordPreview/composeFrame. Deliberately shown
// *after* recording rather than before: none of these choices need to be
// locked in until you've actually seen how the clip turned out.
export function RecordFinalizeModal({
  preview,
  onSubmit,
  onCancel,
}: {
  preview: { blob: Blob; backgroundColor: string } | null
  onSubmit: (options: FinalizeOptions) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [includeLogo, setIncludeLogo] = useState(true)
  const [family, setFamily] = useState<TitleFontFamily>(DEFAULT_TITLE_FONT.family)
  const [weight, setWeight] = useState(DEFAULT_TITLE_FONT.weight)
  const [italic, setItalic] = useState(DEFAULT_TITLE_FONT.italic)
  const [size, setSize] = useState(DEFAULT_TITLE_FONT.size)

  const styleOptions = useMemo(() => stylesForFamily(family), [family])

  const font = { family, weight, italic, size }
  const options: FinalizeOptions = { title: title.trim() || null, includeLogo, font }

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

  return (
    <div className="record-finalize-backdrop" onClick={onCancel}>
      <div className="record-finalize-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Finish recording</h3>
        {preview && <RecordPreview blob={preview.blob} backgroundColor={preview.backgroundColor} options={options} />}
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
