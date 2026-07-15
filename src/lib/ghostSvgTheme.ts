// DOM manipulation for the "Edit as SVG" editor's output — turns a live,
// off-screen re-render of a chart into a detached, Ghost-CMS-ready SVG:
// var(--x) custom-property colors become theme-text/theme-line classes
// (matching the exact class names + light/dark rule the user's Ghost theme
// already defines site-wide), chart chrome becomes toggle-able, and a title
// can be inserted. All of this operates on a detached clone — the live
// chart mounted in the app is never touched.
import { SVG_EDITOR_GOOGLE_FONTS_IMPORT, svgEditorFontStack, type SvgEditorFontFamily } from './svgEditorFonts'

// A plain `font-family` attribute loses to ANY external CSS rule that also
// targets this element (even a generic inherited `body { font-family }`)
// — presentation attributes count as the lowest-priority origin in the
// cascade, weaker than a real author stylesheet rule. Both this app's own
// global font rule and a typical Ghost theme's body font rule are exactly
// that kind of rule, so the attribute alone silently loses in both places.
// An inline `style` declaration outranks any external stylesheet short of
// `!important`, so every font-family write in this module goes through
// this helper instead of `setAttribute('font-family', ...)`.
export function setFontFamilyStyle(el: Element, family: SvgEditorFontFamily | null) {
  if (family) {
    el.setAttribute('style', `font-family: ${svgEditorFontStack(family)} !important;`)
  } else {
    el.removeAttribute('style')
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// Exact CSS the user's Ghost theme already ships site-wide — embedded
// verbatim (plus the font import) so a pasted SVG is self-contained even
// before the site stylesheet loads, and still matches it exactly once it
// does.
export const GHOST_STYLE_CSS = `
${SVG_EDITOR_GOOGLE_FONTS_IMPORT}
.theme-text { fill: #111111; }
.theme-line { stroke: #cccccc; fill: none; }
.theme-line-bg { fill: #cccccc; }
[data-theme="dark"] .theme-text { fill: white; }
[data-theme="dark"] .theme-line { stroke: #444444; fill: none; }
[data-theme="dark"] .theme-line-bg { fill: black; }
`

type Role = 'text' | 'grid' | 'axis'

// Every chart in the app paints its theme-dependent chrome with one of
// these literal var(...) attribute values (see e.g. PaceChart.tsx's
// `.attr('fill', 'var(--text-secondary)')`) — reading the raw attribute
// (not the resolved computed style) is what lets us tell "this is a themed
// chrome element" apart from a data-identity color baked to its own hex.
const VAR_ROLE: Record<string, Role> = {
  'var(--text-primary)': 'text',
  'var(--text-secondary)': 'text',
  'var(--text-muted)': 'text',
  'var(--axis)': 'axis',
  'var(--grid)': 'grid',
}

const ROLE_CLASSES: Record<Role, string> = {
  text: 'theme-text',
  grid: 'theme-line gse-grid',
  axis: 'theme-line gse-axis',
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `gse-${idCounter}`
}

// A stroke inherits `.theme-line`'s `fill: none` — correct for a bare
// gridline/axis stroke, but it would blank out an element that also carries
// its own real fill (a data-color mark that happens to use a themed stroke
// for a background-matching ring). Only reclassify when there's no
// meaningful fill of its own — the same rule that fixed the same bug in the
// uploaded-file batch.
function hasMeaningfulFill(fill: string | null): boolean {
  return !!fill && fill.trim() !== 'none'
}

function applyThemeClasses(liveRoot: SVGSVGElement, cloneRoot: SVGSVGElement) {
  const liveAll = [liveRoot, ...Array.from(liveRoot.querySelectorAll('*'))]
  const cloneAll = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))]
  liveAll.forEach((liveEl, i) => {
    const cloneEl = cloneAll[i]
    if (!cloneEl || !(liveEl instanceof Element)) return

    const rawFill = liveEl.getAttribute('fill')
    const fillRole = rawFill ? VAR_ROLE[rawFill.trim()] : undefined
    const rawStroke = liveEl.getAttribute('stroke')
    const strokeRole = rawStroke ? VAR_ROLE[rawStroke.trim()] : undefined

    const classes: string[] = []
    if (fillRole === 'text') {
      cloneEl.setAttribute('fill', '#111111')
      classes.push(ROLE_CLASSES.text)
      // var(--text-muted) is what every chart's D3 axis-tick text uses
      // (see e.g. PaceChart's `.tick text`); var(--text-primary/secondary)
      // is everything else text-role — row/category labels, value labels.
      // Kept as a separate marker class (not a style difference) purely so
      // the editor can offer "resize axis labels" and "resize chart
      // labels" as two independent batch controls.
      classes.push(rawFill?.trim() === 'var(--text-muted)' ? 'gse-axis-label' : 'gse-body-label')
    }
    if (strokeRole && (strokeRole === 'axis' || strokeRole === 'grid') && !hasMeaningfulFill(rawFill)) {
      cloneEl.setAttribute('stroke', '#cccccc')
      classes.push(ROLE_CLASSES[strokeRole])
    }

    if (classes.length > 0) {
      const existing = cloneEl.getAttribute('class')
      cloneEl.setAttribute('class', existing ? `${existing} ${classes.join(' ')}` : classes.join(' '))
    }

    // Every element that ends up in the editor's element list (text
    // editable, or a chrome group that can be hidden) needs a stable
    // handle a click/toggle can look it up by later.
    if (classes.length > 0 || cloneEl.tagName === 'text') {
      cloneEl.setAttribute('data-gse-id', nextId())
    }
  })
}

export interface ToggleGroup {
  key: string
  label: string
  selector: string
}

const KNOWN_TOGGLE_GROUPS: ToggleGroup[] = [
  { key: 'grid', label: 'Gridlines', selector: '.gse-grid' },
  { key: 'axis', label: 'Axis line & ticks', selector: '.gse-axis' },
]

// Only offer a toggle for chrome that's actually present on this
// particular chart — a chart with no gridlines simply doesn't show that
// checkbox, rather than every chart listing every possible category.
export function discoverToggleGroups(svgEl: SVGSVGElement): ToggleGroup[] {
  return KNOWN_TOGGLE_GROUPS.filter((g) => svgEl.querySelector(g.selector) != null)
}

export function setGroupVisible(svgEl: SVGSVGElement, selector: string, visible: boolean) {
  svgEl.querySelectorAll(selector).forEach((el) => {
    if (visible) el.removeAttribute('display')
    else el.setAttribute('display', 'none')
  })
}

export interface LabelSizeGroup {
  key: string
  label: string
  selector: string
}

const KNOWN_LABEL_SIZE_GROUPS: LabelSizeGroup[] = [
  { key: 'axis-labels', label: 'Axis tick labels', selector: '.gse-axis-label' },
  { key: 'body-labels', label: 'Chart labels', selector: '.gse-body-label' },
]

export function discoverLabelSizeGroups(svgEl: SVGSVGElement): LabelSizeGroup[] {
  return KNOWN_LABEL_SIZE_GROUPS.filter((g) => svgEl.querySelector(g.selector) != null)
}

// `size == null` leaves each element's own original font-size alone —
// this is a one-shot "set them all to X", not a persistent scale factor,
// so there's nothing to "reset" back to; the caller just stops calling it
// with a value once the user clears the input.
export function setLabelGroupFontSize(svgEl: SVGSVGElement, selector: string, size: number | null) {
  if (size == null) return
  svgEl.querySelectorAll(selector).forEach((el) => el.setAttribute('font-size', String(size)))
}

const BG_SELECTOR = '.gse-bg'

export function setBackgroundVisible(svgEl: SVGSVGElement, visible: boolean) {
  const existing = svgEl.querySelector(BG_SELECTOR)
  if (visible) {
    if (existing) return
    const width = svgEl.getAttribute('width') || '800'
    const height = svgEl.getAttribute('height') || '400'
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('class', 'theme-line-bg gse-bg')
    rect.setAttribute('x', '0')
    rect.setAttribute('y', '0')
    rect.setAttribute('width', width)
    rect.setAttribute('height', height)
    svgEl.insertBefore(rect, svgEl.firstChild)
  } else if (existing) {
    existing.remove()
  }
}

export type TitleAlign = 'left' | 'center' | 'right'

export interface TitleOptions {
  text: string
  fontFamily: SvgEditorFontFamily
  fontWeight: number
  italic: boolean
  fontSize: number
  align: TitleAlign
}

const TITLE_SELECTOR = '.gse-title'

// Reserved vertical space pushes the chart content down rather than
// wrapping/unwrapping the DOM each time — content lives in the permanent
// `.gse-content-root` group (see buildEditableSvg), which just gets a
// y-offset. fitOverflow reads this same offset back (via
// data-gse-title-offset) so it can compose its own left/top overflow
// shift on top without the two stepping on each other's transform.
function setContentYOffset(contentRoot: SVGGElement, offset: number) {
  contentRoot.setAttribute('data-gse-title-offset', String(offset))
  contentRoot.setAttribute('transform', `translate(0, ${offset})`)
}

// Idempotent — safe to call on every edit (font/size/text change), removes
// and re-inserts so the reserved header space always matches the current
// size instead of drifting after repeated edits.
export function setTitle(svgEl: SVGSVGElement, baseHeight: number, baseWidth: number, opts: TitleOptions | null) {
  svgEl.querySelectorAll(TITLE_SELECTOR).forEach((el) => el.remove())
  const contentRoot = svgEl.querySelector<SVGGElement>('.gse-content-root')

  if (!opts || !opts.text.trim()) {
    if (contentRoot) setContentYOffset(contentRoot, 0)
    svgEl.setAttribute('width', String(baseWidth))
    svgEl.setAttribute('height', String(baseHeight))
    svgEl.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`)
    return
  }

  const lines = opts.text.split('\n')
  const lineHeight = Math.ceil(opts.fontSize * 1.2)
  const titleHeight = Math.ceil(opts.fontSize * 0.6) + lines.length * lineHeight

  if (contentRoot) setContentYOffset(contentRoot, titleHeight)

  const totalHeight = baseHeight + titleHeight
  // Reset width alongside height/viewBox even though this branch never
  // changes it — fitOverflow (which runs later in the same applySettings
  // pass) only re-expands when the width attribute differs from what it
  // computes, so leaving a stale, previously-expanded width attribute here
  // would make it skip re-syncing viewBox to match on the next call.
  svgEl.setAttribute('width', String(baseWidth))
  svgEl.setAttribute('height', String(totalHeight))
  svgEl.setAttribute('viewBox', `0 0 ${baseWidth} ${totalHeight}`)

  const titleEl = document.createElementNS(SVG_NS, 'text')
  titleEl.setAttribute('class', 'theme-text gse-title')
  titleEl.setAttribute('data-gse-id', nextId())
  const { x, anchor } =
    opts.align === 'center'
      ? { x: baseWidth / 2, anchor: 'middle' }
      : opts.align === 'right'
        ? { x: baseWidth - 4, anchor: 'end' }
        : { x: 4, anchor: 'start' }
  titleEl.setAttribute('x', String(x))
  titleEl.setAttribute('text-anchor', anchor)
  setFontFamilyStyle(titleEl, opts.fontFamily)
  titleEl.setAttribute('font-family', svgEditorFontStack(opts.fontFamily))
  titleEl.setAttribute('font-weight', String(opts.fontWeight))
  if (opts.italic) titleEl.setAttribute('font-style', 'italic')
  titleEl.setAttribute('font-size', String(opts.fontSize))
  titleEl.setAttribute('fill', '#111111')
  const firstLineY = Math.round(opts.fontSize * 0.6 + opts.fontSize * 0.36)
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan')
    tspan.setAttribute('x', String(x))
    tspan.setAttribute('y', String(firstLineY + i * lineHeight))
    tspan.textContent = line
    titleEl.appendChild(tspan)
  })
  svgEl.insertBefore(titleEl, svgEl.firstChild)
}

// Builds the detached, class-annotated SVG the editor works on, from a
// live (possibly off-screen) chart SVG. Pure snapshot — no visibility
// toggles, title, or body-font override applied yet.
export function buildEditableSvg(liveSvgEl: SVGSVGElement): { svg: SVGSVGElement; width: number; height: number } {
  const rect = liveSvgEl.getBoundingClientRect()
  const width = Math.round(rect.width || Number(liveSvgEl.getAttribute('width')) || 800)
  const height = Math.round(rect.height || Number(liveSvgEl.getAttribute('height')) || 400)

  const clone = liveSvgEl.cloneNode(true) as SVGSVGElement
  applyThemeClasses(liveSvgEl, clone)

  // Some charts position content (e.g. a row label right-aligned to
  // x="-10" relative to a shifted plot origin) that legitimately extends
  // left of x=0 or above y=0 — invisible in the app only because the live
  // chart happens to have enough margin there, but not guaranteed at
  // every width the editor can choose. Wrapping the actual chart content
  // in its own permanent group gives fitOverflow something it can shift
  // right/down without disturbing title positioning (which is anchored to
  // baseWidth/baseHeight, not to this content).
  const contentRoot = document.createElementNS(SVG_NS, 'g')
  contentRoot.setAttribute('class', 'gse-content-root')
  while (clone.firstChild) contentRoot.appendChild(clone.firstChild)
  clone.appendChild(contentRoot)

  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.removeAttribute('style')

  return { svg: clone, width, height }
}

// Applies a body-font override to every text element that isn't the
// dedicated title (which carries its own font choice).
export function setBodyFont(svgEl: SVGSVGElement, family: SvgEditorFontFamily | null) {
  svgEl.querySelectorAll('text').forEach((el) => {
    if (el.classList.contains('gse-title')) return
    setFontFamilyStyle(el, family)
    if (family) el.setAttribute('font-family', svgEditorFontStack(family))
    else el.removeAttribute('font-family')
  })
}

// Grows (never shrinks) the SVG's own width/height + viewBox to cover
// whatever actually got drawn — a narrow chosen width can leave a bar's
// trailing value label past the right edge, and since the SVG's own
// viewport clips anything outside it, that label would otherwise be
// permanently cut off in the downloaded file, not just visually
// overflowing in the editor's scrollable preview pane.
export function fitOverflow(svgEl: SVGSVGElement) {
  // The content root (see buildEditableSvg) is the only thing that can
  // legitimately extend left of x=0/above y=0 — title text is always
  // positioned relative to baseWidth/baseHeight and never goes negative on
  // its own, so shifting is scoped to just that group rather than the
  // whole SVG (which would also drag the title off its intended position).
  const contentRoot = svgEl.querySelector<SVGGElement>('.gse-content-root')
  if (contentRoot) {
    const titleOffset = Number(contentRoot.getAttribute('data-gse-title-offset')) || 0
    // Reset to the known baseline (just the title's reserved space, no
    // extra shift) before re-measuring — otherwise a shift applied by a
    // previous call would already be baked into the geometry getBBox()
    // reports, compounding further on every subsequent call.
    contentRoot.setAttribute('transform', `translate(0, ${titleOffset})`)
    let contentBBox: DOMRect
    try {
      contentBBox = contentRoot.getBBox()
    } catch {
      return // not attached/rendered yet — nothing to measure
    }
    const shiftX = contentBBox.x < 0 ? Math.ceil(-contentBBox.x) + 4 : 0
    const extraShiftY = contentBBox.y < 0 ? Math.ceil(-contentBBox.y) + 4 : 0
    if (shiftX > 0 || extraShiftY > 0) {
      contentRoot.setAttribute('transform', `translate(${shiftX}, ${titleOffset + extraShiftY})`)
    }
  }

  let bbox: DOMRect
  try {
    bbox = svgEl.getBBox()
  } catch {
    return // not attached/rendered yet — nothing to measure
  }
  const currentWidth = Number(svgEl.getAttribute('width')) || 0
  const currentHeight = Number(svgEl.getAttribute('height')) || 0
  const neededWidth = Math.ceil(bbox.x + bbox.width) + 4
  const neededHeight = Math.ceil(bbox.y + bbox.height) + 4
  const w = Math.max(currentWidth, neededWidth)
  const h = Math.max(currentHeight, neededHeight)
  if (w !== currentWidth || h !== currentHeight) {
    svgEl.setAttribute('width', String(w))
    svgEl.setAttribute('height', String(h))
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
}

// The Ghost site's color theming (the .theme-text/.theme-line/.theme-line-bg
// rules) is confirmed to survive being pasted into a Ghost post — so the
// <style> tag itself isn't getting stripped there. What doesn't survive is
// specifically the Google Fonts @import inside it: an @import is a second
// network fetch triggered from within a dynamically-inserted stylesheet,
// which is exactly the kind of thing a CMS's iframe/CSP sandboxing or a
// same-origin-only font policy blocks even when the <style> tag itself is
// left alone. Embedding the actual font bytes as base64 data URIs removes
// that fetch entirely — nothing left to block. Bytes come from our own
// already-loaded self-hosted @fontsource files (see svgEditorFonts.ts),
// via the @font-face rules those imports already injected into
// document.styleSheets, so this never has its own network dependency.
function findSelfHostedFontUrl(family: string, weight: number, italic: boolean): string | null {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin stylesheet — can't introspect, not one of ours anyway
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const style = rule.style
      const ruleFamily = style.getPropertyValue('font-family').replace(/^['"]|['"]$/g, '').trim()
      const ruleWeight = Number.parseInt(style.getPropertyValue('font-weight'), 10)
      const ruleStyle = style.getPropertyValue('font-style').trim() || 'normal'
      if (ruleFamily !== family || ruleWeight !== weight || ruleStyle !== (italic ? 'italic' : 'normal')) continue
      const match = style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/)
      if (match) return match[1]
    }
  }
  return null
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  } catch {
    return null
  }
}

interface FontInstance {
  family: SvgEditorFontFamily
  weight: number
  italic: boolean
}

function collectUsedFonts(svgEl: SVGSVGElement): FontInstance[] {
  const seen = new Map<string, FontInstance>()
  const families = new Set(['Inter', 'Saira', 'Saira Condensed', 'Spline Sans Mono'])
  svgEl.querySelectorAll('text').forEach((el) => {
    const styleFamily = (el as SVGElement).style.fontFamily.replace(/^['"]|['"]$/g, '').trim()
    const attrFamily = (el.getAttribute('font-family') || '').split(',')[0].replace(/^['"]|['"]$/g, '').trim()
    const family = (families.has(styleFamily) ? styleFamily : families.has(attrFamily) ? attrFamily : null) as
      | SvgEditorFontFamily
      | null
    if (!family) return
    const weight = Number.parseInt(el.getAttribute('font-weight') || '400', 10) || 400
    const italic = el.getAttribute('font-style') === 'italic'
    const key = `${family}-${weight}-${italic}`
    if (!seen.has(key)) seen.set(key, { family, weight, italic })
  })
  return [...seen.values()]
}

// Typical size of one @fontsource woff2 file for a single weight/style —
// used only to approximate the size embedded fonts will add once actually
// fetched, without doing a real fetch on every keystroke while editing.
const APPROX_FONT_FILE_BYTES = 20_000

// Cheap, synchronous "roughly how big will this end up" for the sidebar —
// serializes without fetching/embedding font bytes (that only happens in
// serializeForExport, on actual download/copy) and adds a flat estimate
// per unique font instance in use instead.
export function estimateExportSizeBytes(svgEl: SVGSVGElement): number {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-gse-id]').forEach((el) => el.removeAttribute('data-gse-id'))
  clone.querySelectorAll('[data-gse-font]').forEach((el) => el.removeAttribute('data-gse-font'))
  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = GHOST_STYLE_CSS.trim()
  clone.insertBefore(style, clone.firstChild)
  const baseSize = new Blob([new XMLSerializer().serializeToString(clone)]).size
  const fontCount = collectUsedFonts(svgEl).length
  return baseSize + fontCount * APPROX_FONT_FILE_BYTES
}

async function buildEmbeddedFontFaces(svgEl: SVGSVGElement): Promise<string> {
  const instances = collectUsedFonts(svgEl)
  const rules = await Promise.all(
    instances.map(async ({ family, weight, italic }) => {
      const url = findSelfHostedFontUrl(family, weight, italic)
      if (!url) return null
      const base64 = await fetchAsBase64(url)
      if (!base64) return null
      return `@font-face {
  font-family: '${family}';
  font-style: ${italic ? 'italic' : 'normal'};
  font-weight: ${weight};
  src: url(data:font/woff2;base64,${base64}) format('woff2');
}`
    }),
  )
  return rules.filter((r): r is string => r != null).join('\n')
}

// Final output: clones once more (so repeated calls never mutate the
// editor's working copy), strips editor-only bookkeeping attributes, embeds
// the Ghost theme <style> (with self-contained font data in place of the
// Google Fonts @import — see buildEmbeddedFontFaces above), and serializes.
export async function serializeForExport(svgEl: SVGSVGElement): Promise<string> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-gse-id]').forEach((el) => el.removeAttribute('data-gse-id'))
  clone.querySelectorAll('[data-gse-font]').forEach((el) => el.removeAttribute('data-gse-font'))

  const fontFaces = await buildEmbeddedFontFaces(svgEl)
  // Keep the @import as a fallback only if embedding came up empty (e.g. a
  // font whose file couldn't be fetched) — with at least one real
  // @font-face embedded, the @import would be redundant dead weight for
  // fonts that already work, and worse, a second, differently-sourced
  // definition of the SAME family if it partially failed.
  const themeCss = fontFaces
    ? `${fontFaces}\n${GHOST_STYLE_CSS.replace(SVG_EDITOR_GOOGLE_FONTS_IMPORT, '').trim()}`
    : GHOST_STYLE_CSS.trim()
  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = themeCss.replace(/&/g, '&amp;')
  clone.insertBefore(style, clone.firstChild)

  return new XMLSerializer().serializeToString(clone)
}

export function downloadSvgString(svgString: string, filename: string) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
