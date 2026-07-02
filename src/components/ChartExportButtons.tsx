import { useEffect, useRef, useState, type RefObject } from 'react'
import { exportEmbedJs, exportPng, exportSvg } from '../lib/chartExport'

export function ChartExportButtons({
  svgRef,
  filename,
}: {
  svgRef: RefObject<SVGSVGElement | null>
  filename: string
}) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="chart-export" ref={rootRef}>
      <button type="button" className="chart-export-trigger" onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <div className="chart-export-menu">
          <button type="button" onClick={() => run(exportSvg)}>
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
    </div>
  )
}
