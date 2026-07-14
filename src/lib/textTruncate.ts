// Actual canvas text measurement rather than a fixed average char-width
// guess — the old heuristic (6.2px/char) under-measured labels with many
// wide capitals (team names are almost all-caps), letting text overflow
// past the chart's left margin and get hard-clipped by the SVG's own
// viewport instead of ending in a clean "…". A <canvas> 2D context can
// measure text with zero DOM/SVG involvement, so this works fine inside a
// D3 render effect.
let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureContext(font: string): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  const ctx = measureCtx!
  ctx.font = font
  return ctx
}

export function truncateLabel(text: string, maxWidthPx: number, font = '12px Inter, sans-serif'): string {
  const ctx = getMeasureContext(font)
  if (ctx.measureText(text).width <= maxWidthPx) return text

  // Longest prefix (plus the ellipsis) that still fits, found by binary
  // search rather than character-by-character trimming.
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid)}…`
    if (ctx.measureText(candidate).width <= maxWidthPx) lo = mid
    else hi = mid - 1
  }
  return lo === 0 ? '…' : `${text.slice(0, lo)}…`
}
