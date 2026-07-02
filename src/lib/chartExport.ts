// Snapshot-based SVG/PNG/embed export. Chart marks are drawn with CSS
// custom-property colors (var(--axis), var(--surface-1), ...) that only
// resolve while the SVG is still mounted inside the app's stylesheet
// context — a raw exported file has no access to that context, so every
// property is baked to its live computed value before serializing.
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

function inlineComputedStyles(liveRoot: SVGSVGElement, cloneRoot: SVGSVGElement) {
  const liveAll = [liveRoot, ...Array.from(liveRoot.querySelectorAll('*'))]
  const cloneAll = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))]
  liveAll.forEach((liveEl, i) => {
    const cloneEl = cloneAll[i]
    if (!cloneEl || !(liveEl instanceof Element)) return
    const cs = getComputedStyle(liveEl)
    for (const prop of INLINE_PROPS) {
      const val = cs.getPropertyValue(prop)
      if (val) cloneEl.setAttribute(prop, val)
    }
  })
}

function serializeSvg(svgEl: SVGSVGElement): { svgString: string; width: number; height: number } {
  const rect = svgEl.getBoundingClientRect()
  const width = Math.round(rect.width || Number(svgEl.getAttribute('width')) || 800)
  const height = Math.round(rect.height || Number(svgEl.getAttribute('height')) || 400)

  const clone = svgEl.cloneNode(true) as SVGSVGElement
  inlineComputedStyles(svgEl, clone)

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)

  const container = svgEl.closest('.viz-root')
  const bg = container ? getComputedStyle(container).backgroundColor : '#ffffff'
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bgRect.setAttribute('x', '0')
  bgRect.setAttribute('y', '0')
  bgRect.setAttribute('width', String(width))
  bgRect.setAttribute('height', String(height))
  bgRect.setAttribute('fill', bg || '#ffffff')
  clone.insertBefore(bgRect, clone.firstChild)

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

export function exportSvg(svgEl: SVGSVGElement, filename: string) {
  const { svgString } = serializeSvg(svgEl)
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
