import { useEffect, useRef, useState, type RefObject } from 'react'
import { exportEmbedJs, exportPng, exportSvg } from '../lib/chartExport'
import { ChartTitleModal } from './ChartTitleModal'

export function ChartExportButtons({
  svgRef,
  filename,
  defaultTitle,
}: {
  svgRef: RefObject<SVGSVGElement | null>
  filename: string
  // Pre-fills the title prompt shown before an SVG download; falls back to
  // a humanized version of `filename` (e.g. "pace_chart" -> "Pace chart").
  defaultTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const [titlePromptOpen, setTitlePromptOpen] = useState(false)
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

  return (
    <div className="chart-export" ref={rootRef}>
      <button type="button" className="chart-export-trigger" onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <div className="chart-export-menu">
          <button type="button" onClick={handleSvgClick}>
            SVG
          </button>
          <button type="button" onClick={() => run((svg, name) => exportPng(svg, name, 3))}>
            High-res PNG
          </button>
          <button type="button" onClick={() => run(exportEmbedJs)}>
            Embeddable JS
          </button>
        </div>
      )}
      {titlePromptOpen && (
        <ChartTitleModal
          defaultTitle={defaultTitle ?? humanizedDefault}
          onSubmit={handleTitleSubmit}
          onCancel={() => setTitlePromptOpen(false)}
        />
      )}
    </div>
  )
}
