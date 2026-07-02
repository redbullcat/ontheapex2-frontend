// Rough monospace-ish character-width heuristic (no canvas text
// measurement available inside a D3 render effect) used to keep row
// labels (team/car names) from visually overlapping the plot area when a
// chart's left margin has to shrink to fit a narrow mobile screen.
export function truncateLabel(text: string, maxWidthPx: number, charWidthPx = 6.2): string {
  const maxChars = Math.max(1, Math.floor(maxWidthPx / charWidthPx))
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`
}
