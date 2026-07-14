// Picks black or white text for legibility against a given color, however
// it's expressed — "rgb(r, g, b)" from getComputedStyle, a hex string, etc
// — since anywhere this is needed, all we actually have is CSS's own
// resolved color string, not structured r/g/b values.
export function contrastTextColorForColor(color: string): string {
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 150 ? '#000000' : '#ffffff'
  }
  const channels = color.match(/[\d.]+/g)
  if (!channels || channels.length < 3) return '#000000'
  const [r, g, b] = channels.map(Number)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#000000' : '#ffffff'
}

// Same, but for an SVG element's own *painted* fill color — reading
// getComputedStyle rather than trying to parse the fill attribute
// ourselves means this works the same whether the color came in as a hex
// string, a named color, or a var(--...) custom property (team colors,
// class colors, and the single-car "focus" color are a mix of all three
// across these charts).
export function contrastTextColor(el: Element): string {
  return contrastTextColorForColor(getComputedStyle(el).fill)
}
