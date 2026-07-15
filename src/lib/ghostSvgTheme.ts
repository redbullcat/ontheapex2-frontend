// DOM manipulation for the "Edit as SVG" editor's output — turns a live,
// off-screen re-render of a chart into a detached, Ghost-CMS-ready SVG:
// var(--x) custom-property colors become theme-text/theme-line classes
// (matching the exact class names + light/dark rule the user's Ghost theme
// already defines site-wide), chart chrome becomes toggle-able, and a title
// can be inserted. All of this operates on a detached clone — the live
// chart mounted in the app is never touched.
import { SVG_EDITOR_GOOGLE_FONTS_IMPORT, svgEditorFontFamilyCss, type SvgEditorFontFamily } from './svgEditorFonts'

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

export interface TitleOptions {
  text: string
  fontFamily: SvgEditorFontFamily
  fontWeight: number
  italic: boolean
  fontSize: number
}

const TITLE_SELECTOR = '.gse-title'

// Idempotent — safe to call on every edit (font/size/text change), removes
// and re-inserts so the reserved header space always matches the current
// size instead of drifting after repeated edits.
export function setTitle(svgEl: SVGSVGElement, baseHeight: number, baseWidth: number, opts: TitleOptions | null) {
  const existingTitle = svgEl.querySelector(TITLE_SELECTOR)
  const existingWrapper = svgEl.querySelector('.gse-title-wrapper')
  if (existingTitle) existingTitle.remove()
  if (existingWrapper) {
    while (existingWrapper.firstChild) svgEl.insertBefore(existingWrapper.firstChild, existingWrapper)
    existingWrapper.remove()
  }

  if (!opts || !opts.text.trim()) {
    svgEl.setAttribute('height', String(baseHeight))
    svgEl.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`)
    return
  }

  const titleHeight = Math.ceil(opts.fontSize * 1.8)
  const wrapper = document.createElementNS(SVG_NS, 'g')
  wrapper.setAttribute('class', 'gse-title-wrapper')
  wrapper.setAttribute('transform', `translate(0, ${titleHeight})`)
  while (svgEl.firstChild) wrapper.appendChild(svgEl.firstChild)
  svgEl.appendChild(wrapper)

  const totalHeight = baseHeight + titleHeight
  svgEl.setAttribute('height', String(totalHeight))
  svgEl.setAttribute('viewBox', `0 0 ${baseWidth} ${totalHeight}`)

  const titleEl = document.createElementNS(SVG_NS, 'text')
  titleEl.setAttribute('class', 'theme-text gse-title')
  titleEl.setAttribute('data-gse-id', nextId())
  titleEl.setAttribute('x', '4')
  titleEl.setAttribute('y', String(Math.round(titleHeight / 2 + opts.fontSize * 0.36)))
  titleEl.setAttribute('font-family', svgEditorFontFamilyCss(opts.fontFamily))
  titleEl.setAttribute('font-weight', String(opts.fontWeight))
  if (opts.italic) titleEl.setAttribute('font-style', 'italic')
  titleEl.setAttribute('font-size', String(opts.fontSize))
  titleEl.setAttribute('fill', '#111111')
  titleEl.textContent = opts.text
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
    if (family) el.setAttribute('font-family', svgEditorFontFamilyCss(family))
    else el.removeAttribute('font-family')
  })
}

// Final output: clones once more (so repeated calls never mutate the
// editor's working copy), strips editor-only bookkeeping attributes, embeds
// the Ghost theme <style>, and serializes. A bare "&" in the Google Fonts
// query string is valid CSS but not valid bare XML text, so it's escaped
// before being written out as literal markup.
export function serializeForExport(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-gse-id]').forEach((el) => el.removeAttribute('data-gse-id'))

  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = GHOST_STYLE_CSS.replace(/&/g, '&amp;')
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
