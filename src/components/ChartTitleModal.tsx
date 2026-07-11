import { useState } from 'react'

// Shown when downloading a chart as SVG: lets the viewer set (or clear) the
// title baked into the file above the chart, since a downloaded SVG has no
// surrounding page to carry the on-screen heading with it.
export function ChartTitleModal({
  defaultTitle,
  onSubmit,
  onCancel,
}: {
  defaultTitle: string
  onSubmit: (title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(defaultTitle)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(title.trim())
  }

  return (
    <div className="chart-title-backdrop" onClick={onCancel}>
      <form className="chart-title-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Chart title</h3>
        <label className="chart-title-field">
          Shown above the chart in the downloaded SVG — leave blank for none
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. FIA WEC 2026 Sao Paulo 6H FP1/FP2"
            autoFocus
          />
        </label>
        <div className="chart-title-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="chart-title-primary">
            Download
          </button>
        </div>
      </form>
    </div>
  )
}
