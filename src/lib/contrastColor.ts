// Picks black or white text for legibility against an SVG element's own
// *painted* fill color — reading getComputedStyle rather than trying to
// parse the fill attribute ourselves means this works the same whether the
// color came in as a hex string, a named color, or a var(--...) custom
// property (team colors, class colors, and the single-car "focus" color
// are a mix of all three across these charts).
export function contrastTextColor(el: Element): string {
  const fill = getComputedStyle(el).fill
  const channels = fill.match(/[\d.]+/g)
  if (!channels || channels.length < 3) return '#000000'
  const [r, g, b] = channels.map(Number)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#000000' : '#ffffff'
}
