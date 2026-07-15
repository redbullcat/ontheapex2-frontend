import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { exportEmbedJs, exportPng, exportSvg } from '../lib/chartExport'
import { canExport, hasAnyExportCapability } from '../lib/permissions'
import { getSession } from '../lib/session'
import { ChartTitleModal } from './ChartTitleModal'
import { SvgEditorModal } from './SvgEditorModal'

export function ChartExportButtons({
  svgRef,
  filename,
  defaultTitle,
  renderChart,
}: {
  svgRef: RefObject<SVGSVGElement | null>
  filename: string
  // Pre-fills the title prompt shown before an SVG download; falls back to
  // a humanized version of `filename` (e.g. "pace_chart" -> "Pace chart").
  defaultTitle?: string
  // Lets the "Edit as SVG" modal re-render this exact chart off-screen at
  // an arbitrary width (true reflow via the chart's own D3 code) instead
  // of scaling a static snapshot. See SvgEditorModal for how it's driven.
  renderChart: (forcedWidth: number, onRendered: (svg: SVGSVGElement) => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [titlePromptOpen, setTitlePromptOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const run = (fn: (svg: SVGSVGElement, filename: string) => void) => {
    const svg = svgRef.current
    if (svg) fn(svg, filename)
    setOpen(false)
  }

  function handleSvgClick() {
    setOpen(false)
    setTitlePromptOpen(true)
  }

  function handleTitleSubmit(title: string) {
    setTitlePromptOpen(false)
    const svg = svgRef.current
    if (svg) exportSvg(svg, filename, title || undefined)
  }

  const humanizedDefault = filename.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  // No session at all means this is a public, unauthenticated context
  // (a shared Live Timing Replay/live-now link, which never goes through
  // the login gate — see main.tsx) — those keep exporting exactly as
  // before. Restrictions only apply once someone actually has a Ghost
  // staff role attached, i.e. inside the gated main dashboard.
  const role = getSession()?.role ?? null
  const allow = (capability: Parameters<typeof canExport>[1]) => role == null || canExport(role, capability)
  if (role != null && !hasAnyExportCapability(role)) return null

  return (
    <div className="chart-export" ref={rootRef}>
      <button type="button" className="chart-export-trigger" onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <div className="chart-export-menu">
          {allow('svg') && (
            <button type="button" onClick={handleSvgClick}>
              SVG
            </button>
          )}
          {allow('png') && (
            <button type="button" onClick={() => run((svg, name) => exportPng(svg, name, 3))}>
              High-res PNG
            </button>
          )}
          {allow('embed') && (
            <button type="button" onClick={() => run(exportEmbedJs)}>
              Embeddable JS
            </button>
          )}
          {allow('editSvg') && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setEditorOpen(true)
              }}
            >
              Edit as SVG
            </button>
          )}
        </div>
      )}
      {titlePromptOpen && (
        <ChartTitleModal
          defaultTitle={defaultTitle ?? humanizedDefault}
          onSubmit={handleTitleSubmit}
          onCancel={() => setTitlePromptOpen(false)}
        />
      )}
      {editorOpen && (
        <SvgEditorModal
          filename={filename}
          initialWidth={svgRef.current?.getBoundingClientRect().width || 800}
          renderChart={renderChart}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  )
}
