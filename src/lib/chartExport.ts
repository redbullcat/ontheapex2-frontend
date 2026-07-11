// Snapshot-based SVG/PNG/embed export. Chart marks are drawn with CSS
// custom-property colors (var(--axis), var(--surface-1), ...) that only
// resolve while the SVG is still mounted inside the app's stylesheet
// context — a raw exported file has no access to that context, so every
// property is baked to its live computed value before serializing.
//
// The plain ".svg" download (exportSvg) is the exception: rather than baking
// a single static color snapshot, it swaps the small set of theme-dependent
// colors (text, axis, gridlines, background) for CSS classes plus an
// embedded <style> block carrying both a light and a `[data-theme="dark"]`
// variant — the same convention used for the hand-themed reference SVGs
// embedded on the marketing site. That lets a downloaded chart flip with the
// page it's pasted into instead of being locked to whichever theme was
// active in the browser at export time. PNG/embeddable-JS exports keep the
// old baked-snapshot behavior, since a raster image can't react to theme
// anyway and the embed script is meant to look identical everywhere it's
// dropped.
const INLINE_PROPS = [
  'fill',
  'stroke',
  'stop-color',
  'color',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'font-size',
  'font-weight',
  'font-family',
  'text-anchor',
  'dominant-baseline',
]

// Only the props themed exports swap for a class instead of baking — kept
// out of the generic computed-style inlining pass so the class survives.
const THEMED_PROPS = new Set(['fill', 'stroke'])

// var(--x) name -> theme class + light/dark fallback color. Values mirror
// each chart component's local light/dark custom-property block (e.g.
// PaceChart.tsx's `.viz-root[data-theme='dark'] { --axis: #383835; ... }`).
// --text-muted and the rare --caution/--replay-accent vars are the same hex
// in both themes, so they're left to the normal computed-value bake below.
const THEME_VAR_MAP: Record<string, { className: string; light: string; dark: string }> = {
  'var(--text-primary)': { className: 'ota-text', light: '#0b0b0b', dark: '#ffffff' },
  'var(--text-secondary)': { className: 'ota-text-secondary', light: '#52514e', dark: '#c3c2b7' },
  'var(--axis)': { className: 'ota-axis', light: '#c3c2b7', dark: '#383835' },
  'var(--grid)': { className: 'ota-grid', light: '#e1e0d9', dark: '#2c2c2a' },
}

const THEME_BG = { light: '#fcfcfb', dark: '#1a1a19' }

// Set as a <style> element's textContent (not parsed as markup), so a plain
// "&" here is correct — XMLSerializer escapes it to "&amp;" on output.
const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Saira:wght@600;700&display=swap');
text { font-family: 'Inter', sans-serif; }
.ota-title { font-family: 'Saira', sans-serif; }
.ota-text { fill: ${THEME_VAR_MAP['var(--text-primary)'].light}; }
.ota-text-secondary { fill: ${THEME_VAR_MAP['var(--text-secondary)'].light}; }
.ota-axis { stroke: ${THEME_VAR_MAP['var(--axis)'].light}; fill: none; }
.ota-grid { stroke: ${THEME_VAR_MAP['var(--grid)'].light}; fill: none; }
.ota-bg { fill: ${THEME_BG.light}; }
[data-theme="dark"] .ota-text { fill: ${THEME_VAR_MAP['var(--text-primary)'].dark}; }
[data-theme="dark"] .ota-text-secondary { fill: ${THEME_VAR_MAP['var(--text-secondary)'].dark}; }
[data-theme="dark"] .ota-axis { stroke: ${THEME_VAR_MAP['var(--axis)'].dark}; }
[data-theme="dark"] .ota-grid { stroke: ${THEME_VAR_MAP['var(--grid)'].dark}; }
[data-theme="dark"] .ota-bg { fill: ${THEME_BG.dark}; }
`

const TITLE_HEIGHT = 44
const TITLE_PADDING_X = 4

function inlineComputedStyles(liveRoot: SVGSVGElement, cloneRoot: SVGSVGElement, themed: boolean) {
  const liveAll = [liveRoot, ...Array.from(liveRoot.querySelectorAll('*'))]
  const cloneAll = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))]
  liveAll.forEach((liveEl, i) => {
    const cloneEl = cloneAll[i]
    if (!cloneEl || !(liveEl instanceof Element)) return
    const cs = getComputedStyle(liveEl)
    const classes: string[] = []
    for (const prop of INLINE_PROPS) {
      if (themed && THEMED_PROPS.has(prop)) {
        const raw = liveEl.getAttribute(prop)
        const themeVar = raw ? THEME_VAR_MAP[raw.trim()] : undefined
        if (themeVar) {
          cloneEl.setAttribute(prop, themeVar.light)
          classes.push(themeVar.className)
          continue
        }
      }
      const val = cs.getPropertyValue(prop)
      if (val) cloneEl.setAttribute(prop, val)
    }
    if (classes.length > 0) {
      const existing = cloneEl.getAttribute('class')
      cloneEl.setAttribute('class', existing ? `${existing} ${classes.join(' ')}` : classes.join(' '))
    }
  })
}

function serializeSvg(
  svgEl: SVGSVGElement,
  options: { themed?: boolean; title?: string } = {},
): { svgString: string; width: number; height: number } {
  const { themed = false, title } = options
  const rect = svgEl.getBoundingClientRect()
  const width = Math.round(rect.width || Number(svgEl.getAttribute('width')) || 800)
  const chartHeight = Math.round(rect.height || Number(svgEl.getAttribute('height')) || 400)
  const titleSpace = themed && title ? TITLE_HEIGHT : 0
  const height = chartHeight + titleSpace

  const clone = svgEl.cloneNode(true) as SVGSVGElement
  inlineComputedStyles(svgEl, clone, themed)

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  if (themed) {
    clone.setAttribute('width', '100%')
    clone.removeAttribute('height')
  } else {
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))
  }

  // Push the cloned chart content itself (nothing else has been added to
  // `clone` yet at this point) down to leave room for the title above it.
  if (titleSpace > 0) {
    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    wrapper.setAttribute('transform', `translate(0, ${titleSpace})`)
    while (clone.firstChild) wrapper.appendChild(clone.firstChild)
    clone.appendChild(wrapper)
  }

  const container = svgEl.closest('.viz-root')
  const bg = container ? getComputedStyle(container).backgroundColor : '#ffffff'
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bgRect.setAttribute('x', '0')
  bgRect.setAttribute('y', '0')
  bgRect.setAttribute('width', String(width))
  bgRect.setAttribute('height', String(height))
  if (themed) {
    bgRect.setAttribute('class', 'ota-bg')
    bgRect.setAttribute('fill', THEME_BG.light)
  } else {
    bgRect.setAttribute('fill', bg || '#ffffff')
  }
  clone.insertBefore(bgRect, clone.firstChild)

  if (themed) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = THEME_CSS
    clone.insertBefore(style, clone.firstChild)
  }

  if (titleSpace > 0 && title) {
    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    titleText.setAttribute('x', String(TITLE_PADDING_X))
    titleText.setAttribute('y', String(Math.round(titleSpace / 2 + 7)))
    titleText.setAttribute('class', 'ota-title ota-text')
    titleText.setAttribute('fill', THEME_VAR_MAP['var(--text-primary)'].light)
    titleText.setAttribute('font-size', '20')
    titleText.setAttribute('font-weight', '600')
    titleText.textContent = title
    clone.appendChild(titleText)
  }

  const svgString = new XMLSerializer().serializeToString(clone)
  return { svgString, width, height }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportSvg(svgEl: SVGSVGElement, filename: string, title?: string) {
  const { svgString } = serializeSvg(svgEl, { themed: true, title })
  triggerDownload(new Blob([svgString], { type: 'image/svg+xml' }), `${filename}.svg`)
}

export function exportPng(svgEl: SVGSVGElement, filename: string, scale = 3) {
  const { svgString, width, height } = serializeSvg(svgEl)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `${filename}.png`)
      }, 'image/png')
    }
    URL.revokeObjectURL(url)
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

// A single <script> tag a user can paste into any page: it replaces itself
// with the chart's (fully self-contained, style-inlined) SVG markup.
export function exportEmbedJs(svgEl: SVGSVGElement, filename: string) {
  const { svgString } = serializeSvg(svgEl)
  const js = `(function(){
  var svgMarkup = ${JSON.stringify(svgString)};
  var host = document.createElement('div');
  host.innerHTML = svgMarkup;
  var script = document.currentScript;
  if (script && script.parentNode) {
    script.parentNode.insertBefore(host, script.nextSibling);
  } else {
    document.body.appendChild(host);
  }
})();
`
  triggerDownload(new Blob([js], { type: 'text/javascript' }), `${filename}.js`)
}
