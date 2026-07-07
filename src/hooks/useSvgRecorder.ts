import { useCallback, useRef, useState } from 'react'
import JSZip from 'jszip'
import logoWhiteRaw from '../assets/logo-white.svg?raw'
import logoBlackRaw from '../assets/logo-black.svg?raw'
import { contrastTextColorForColor } from '../lib/contrastColor'
import { DEFAULT_TITLE_FONT, ensureTitleFontLoaded, titleFontCss, type TitleFontFamily, type TitleFontOptions } from '../lib/fonts'
import { drawMomentOverlay, MomentPlayer, type MomentOverlayState, type RaceMoment } from '../lib/raceMoments'

// Records an <svg> element as a video by continuously rasterizing it onto
// an offscreen canvas and feeding that canvas's own MediaStream to a
// MediaRecorder — canvas.captureStream() needs no permission prompt (unlike
// getDisplayMedia/screen-share) and captures nothing but the canvas we
// control, so the output is exactly the chart with no surrounding UI.
// Crucially, this captures the *actual* live-playing chart exactly as it
// renders — not a reconstruction — so it's as smooth as watching it play.
//
// Every selected aspect ratio records *simultaneously* from this one live
// playthrough (one canvas + one MediaRecorder per aspect, all fed from the
// same per-tick SVG rasterization) rather than one at a time — sitting
// through the same real-time animation multiple times to get multiple
// output shapes would be a poor tradeoff for what's ultimately the same
// underlying capture.
//
// Render at a fixed multiple of the SVG's own displayed size for a
// crisper-than-screen result without needing a separate "resolution" UI.
const RESOLUTION_SCALE = 2
const CAPTURE_FPS = 30

// The logo/title (when included) live in their own reserved strips of the
// *finalized* video rather than painted over the chart — these are how
// much of the frame each strip takes, as a fraction of the raw recording's
// own height. See finalizeVideo.
const LOGO_BAND_FRACTION = 0.09
const TITLE_BAND_FRACTION = 0.16

export type RecordAspect = 'landscape' | 'portrait' | 'square' | 'portrait-4-5'

// null (landscape) keeps the original behavior: the whole chart, upscaled
// to a crisper size, same shape as it's displayed on screen. The others
// are real social-video target resolutions — cropping a wide chart down to
// one of these needs a source window narrower than the full chart, which
// is what the tracking logic below computes every frame.
const ASPECT_PRESETS: Record<RecordAspect, { width: number; height: number } | null> = {
  landscape: null,
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  'portrait-4-5': { width: 1080, height: 1350 },
}

// Where the current reveal position sits within the crop window, as a
// fraction of the window's width — 0.5 keeps the cars centered as the
// window tracks them through the race, rather than pinned to one edge.
const TRACK_POSITION_FRACTION = 0.5

// Finds how far into the chart's own (unscaled) coordinate space the
// reveal animation has currently progressed, by reading a data-reveal-x
// attribute the chart keeps up to date on its own <svg> root every tick
// (see ReplayTrendChart.tsx/LapPositionChart.tsx/GapEvolutionChart.tsx's
// per-tick effects). This deliberately does NOT measure the clip-path
// rect's geometry directly (e.g. via getBoundingClientRect): clipPath
// contents are never laid out or painted the way normal elements are, so
// browsers report their bounding rect as all-zero — the crop window would
// silently never move (exactly the "not tracking the cars" bug this was
// built to fix in the first place).
function findRevealEdgeX(svg: SVGSVGElement): number | null {
  const raw = svg.getAttribute('data-reveal-x')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

// Visual properties a chart's paths/text can pick up from an external
// stylesheet (a CSS class, or a var(--replay-muted)-style custom property)
// rather than an inline attribute — axis ticks and gridlines in particular
// are styled this way. A cloned SVG serialized on its own has no access to
// the page's stylesheets, so left alone these come out as CSS defaults
// (black text, invisible against a dark chart) instead of their real
// themed color. Baking the resolved value in as an inline style before
// serializing fixes that regardless of where the original rule lived.
const INLINE_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
] as const

// getComputedStyle forces the browser to resolve the full cascaded style
// (a real cost, not a free property read) — only worth paying for an
// element that actually has one of these properties set to a CSS custom
// property reference (e.g. attr('fill', 'var(--text-muted)') on axis tick
// text), since that's the one thing cloneNode can't carry over correctly
// on its own. Everything else here (car paths, playback markers, end
// labels, ...) gets every one of these properties set to an already-
// resolved literal value directly via d3's own .attr() calls, which
// cloneNode(true) copies verbatim — recomputing style for those elements
// every single animation frame would just reproduce what's already on the
// clone. For a chart with dozens of cars recording for minutes at 30fps,
// skipping the needless majority of these calls is what keeps a long
// recording from drowning the main thread (and the *live* chart sharing
// that same thread — see usePlayback) in avoidable GC pressure as it runs.
function needsStyleInline(el: Element): boolean {
  for (const prop of INLINE_STYLE_PROPS) {
    if (el.getAttribute(prop)?.includes('var(')) return true
  }
  return false
}

function inlineComputedStyles(original: Element, clone: Element) {
  if (needsStyleInline(original)) {
    const cs = getComputedStyle(original)
    const declarations = INLINE_STYLE_PROPS.map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';')
    clone.setAttribute('style', `${clone.getAttribute('style') ?? ''};${declarations}`)
  }

  const originalChildren = original.children
  const cloneChildren = clone.children
  for (let i = 0; i < originalChildren.length; i++) {
    inlineComputedStyles(originalChildren[i], cloneChildren[i])
  }
}

// --- On The Apex watermark, added at finalize time if requested --------

function svgToDataUri(raw: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image()
  img.src = src
  return img
}

// Both logo files share this viewBox (see src/assets/logo-*.svg).
const LOGO_ASPECT = 1731 / 390
// White-on-transparent for dark chart backgrounds, black-on-transparent
// for light ones — loaded once and reused across every recording rather
// than per-frame.
const logoWhiteImg = loadImage(svgToDataUri(logoWhiteRaw))
const logoBlackImg = loadImage(svgToDataUri(logoBlackRaw))

function isDarkTheme(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Draws the logo inside its own reserved band (from y=bandTop to the
// bottom of the canvas) — never on top of the chart, which is drawn only
// above bandTop (see finalizeVideo).
function drawLogo(ctx: CanvasRenderingContext2D, width: number, bandTop: number, canvasHeight: number) {
  const logoImg = isDarkTheme() ? logoWhiteImg : logoBlackImg
  if (!logoImg.complete || logoImg.naturalWidth === 0) return
  const bandHeight = canvasHeight - bandTop
  let logoHeight = bandHeight * 0.6
  let logoWidth = logoHeight * LOGO_ASPECT
  const maxWidth = width * 0.42
  if (logoWidth > maxWidth) {
    logoWidth = maxWidth
    logoHeight = logoWidth / LOGO_ASPECT
  }
  const x = (width - logoWidth) / 2
  const y = bandTop + (bandHeight - logoHeight) / 2
  ctx.drawImage(logoImg, x, y, logoWidth, logoHeight)
}

// --- Optional title band, added at finalize time if given --------------

function wrapTitleLines(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string[] {
  const words = title.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

// Draws the title centered inside its own reserved band (y=0 to bandHeight)
// — never on top of the chart, which is placed below this band. Text
// color follows the band's own background (the chart's real background
// color, same as everywhere else) rather than a fixed white, which would
// vanish against a light theme. The requested font size is honored as-is
// where it fits; it's only shrunk below that if the wrapped title would
// otherwise overflow the band (a very long title at a large chosen size).
function drawTitleInBand(
  ctx: CanvasRenderingContext2D,
  title: string,
  width: number,
  bandHeight: number,
  bandBackground: string,
  font: TitleFontOptions,
) {
  let fontSize = font.size
  let lines: string[] = []
  for (; fontSize >= 12; fontSize -= 2) {
    ctx.font = titleFontCss(font, fontSize)
    lines = wrapTitleLines(ctx, title, width * 0.9)
    const lineHeight = fontSize * 1.3
    if (lines.length * lineHeight <= bandHeight * 0.86) break
  }
  ctx.font = titleFontCss(font, fontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lineHeight = fontSize * 1.3
  const totalTextHeight = lines.length * lineHeight
  const startY = (bandHeight - totalTextHeight) / 2 + lineHeight / 2
  ctx.fillStyle = contrastTextColorForColor(bandBackground)
  lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lineHeight))
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface FinalizeOptions {
  title: string | null
  includeLogo: boolean
  font: TitleFontOptions
  moments: RaceMoment[]
}

// The editable form of FinalizeOptions used while a recording's still being
// set up in RecordFinalizeModal — title as a plain (possibly-empty) string
// rather than string | null, so a text input can bind to it directly.
// toFinalizeOptions below is the one place that trims/nullifies it.
export interface EditableAspectOptions {
  title: string
  family: TitleFontFamily
  weight: number
  italic: boolean
  size: number
  includeLogo: boolean
  moments: RaceMoment[]
}

export function defaultAspectOptions(): EditableAspectOptions {
  return {
    title: '',
    family: DEFAULT_TITLE_FONT.family,
    weight: DEFAULT_TITLE_FONT.weight,
    italic: DEFAULT_TITLE_FONT.italic,
    size: DEFAULT_TITLE_FONT.size,
    includeLogo: true,
    moments: [],
  }
}

export function toFinalizeOptions(e: EditableAspectOptions): FinalizeOptions {
  return {
    title: e.title.trim() || null,
    includeLogo: e.includeLogo,
    font: { family: e.family, weight: e.weight, italic: e.italic, size: e.size },
    moments: e.moments,
  }
}

// The rectangle (in canvas-pixel space) the chart itself occupies once the
// title/logo bands are carved out — everything moment-related is positioned
// relative to this, not the full canvas, so toggling a band on/off doesn't
// shift where a moment's arrow points relative to the chart content, and a
// moment placed while looking at one recording still lands in the same
// relative spot in another (see raceMoments.ts).
export function chartRectFor(srcWidth: number, srcHeight: number, options: Pick<FinalizeOptions, 'title' | 'includeLogo'>) {
  const titleBandHeight = options.title ? Math.round(srcHeight * TITLE_BAND_FRACTION) : 0
  const logoBandHeight = options.includeLogo ? Math.round(srcHeight * LOGO_BAND_FRACTION) : 0
  const availableHeight = srcHeight - titleBandHeight - logoBandHeight
  const scale = availableHeight / srcHeight
  const scaledWidth = srcWidth * scale
  const offsetX = (srcWidth - scaledWidth) / 2
  return { x: offsetX, y: titleBandHeight, width: scaledWidth, height: availableHeight }
}

// Draws one composited frame — the already-recorded frame uniformly scaled
// down (never stretched) into whatever space is left, plus the title/logo
// bands, whichever are requested, plus a moment's arrow/caption if one is
// currently active — onto ctx. Shared by the actual finalize/re-encode pass
// below and by RecordPreview's live preview, so the preview is guaranteed
// to look exactly like the real export.
export function composeFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  srcWidth: number,
  srcHeight: number,
  backgroundColor: string,
  options: FinalizeOptions,
  momentOverlay?: MomentOverlayState | null,
) {
  const chartRect = chartRectFor(srcWidth, srcHeight, options)

  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, srcWidth, srcHeight)
  ctx.drawImage(video, chartRect.x, chartRect.y, chartRect.width, chartRect.height)
  if (options.title) drawTitleInBand(ctx, options.title, srcWidth, chartRect.y, backgroundColor, options.font)
  if (options.includeLogo) drawLogo(ctx, srcWidth, chartRect.y + chartRect.height, srcHeight)
  if (momentOverlay) drawMomentOverlay(ctx, chartRect, momentOverlay, backgroundColor)
}

// Re-encodes an already-recorded clip with an optional title band and/or
// logo added — done as a second pass (replay the recorded blob through a
// <video>, redraw each frame via composeFrame onto a fresh canvas of the
// same size, re-capture that) rather than during the original recording,
// since the title/font/logo choice is only made *after* recording finishes.
// onProgress is fed video.currentTime/video.duration each frame — the one
// meaningful proxy for "how much of this re-encode is left" available here.
async function finalizeVideo(
  sourceBlob: Blob,
  options: FinalizeOptions,
  mimeType: string,
  backgroundColor: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  if (options.title) await ensureTitleFontLoaded(options.font)

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const sourceUrl = URL.createObjectURL(sourceBlob)
    video.src = sourceUrl

    video.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('Failed to load recorded video for finalizing'))
    }

    video.onloadedmetadata = () => {
      const srcWidth = video.videoWidth
      const srcHeight = video.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = srcWidth
      canvas.height = srcHeight
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) {
        URL.revokeObjectURL(sourceUrl)
        return reject(new Error('2D canvas context unavailable'))
      }

      const stream = canvas.captureStream(CAPTURE_FPS)
      const outRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      const outChunks: Blob[] = []
      outRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) outChunks.push(e.data)
      }
      outRecorder.onstop = () => {
        URL.revokeObjectURL(sourceUrl)
        resolve(new Blob(outChunks, { type: mimeType }))
      }

      const momentPlayer = new MomentPlayer()
      let rafId: number | null = null
      const drawFrame = () => {
        const overlay = options.moments.length > 0 ? momentPlayer.update(options.moments, video, performance.now()) : null
        composeFrame(ctx, video, srcWidth, srcHeight, backgroundColor, options, overlay)
        if (Number.isFinite(video.duration) && video.duration > 0) {
          onProgress?.(Math.min(1, video.currentTime / video.duration))
        }
        if (!video.ended) rafId = requestAnimationFrame(drawFrame)
      }
      video.onended = () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        onProgress?.(1)
        outRecorder.stop()
      }

      outRecorder.start()
      video
        .play()
        .then(drawFrame)
        .catch((err) => {
          URL.revokeObjectURL(sourceUrl)
          reject(err)
        })
    }
  })
}

interface PendingRecording {
  aspect: RecordAspect
  blob: Blob
  mimeType: string
  filename: string
}

export interface PreviewSource {
  aspect: RecordAspect
  blob: Blob
  backgroundColor: string
}

export function useSvgRecorder(svgRef: React.RefObject<SVGSVGElement | null>, filenameBase: string) {
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [processing, setProcessing] = useState(false)
  // 0..1 while processing; null the rest of the time, including right
  // before the first frame of a re-encode pass has reported in.
  const [processingProgress, setProcessingProgress] = useState<number | null>(null)
  const [awaitingFinalize, setAwaitingFinalize] = useState(false)
  const [previewSources, setPreviewSources] = useState<PreviewSource[]>([])
  // Deliberately lives here rather than inside RecordFinalizeModal's own
  // state: the modal unmounts between recordings (each Stop press mounts a
  // fresh one), but title/font/logo/moments set up for one aspect ratio
  // should still be there — carried over best-effort — when you record the
  // same chart again, rather than starting over. Keyed by aspect so each
  // one can diverge independently once edited.
  const [perAspectOptions, setPerAspectOptions] = useState<Partial<Record<RecordAspect, EditableAspectOptions>>>({})
  const recordersRef = useRef<Map<RecordAspect, MediaRecorder>>(new Map())
  const chunksRef = useRef<Map<RecordAspect, Blob[]>>(new Map())
  const canvasesRef = useRef<Map<RecordAspect, HTMLCanvasElement>>(new Map())
  // getContext('2d', ...) is idempotent (same object every call) but isn't
  // free — cached once per canvas at start() instead of re-fetched every
  // single frame for every aspect, one more small cut into the per-frame
  // overhead a long recording pays 30 times a second (see drawOnce/
  // inlineComputedStyles for the bigger ones).
  const ctxsRef = useRef<Map<RecordAspect, CanvasRenderingContext2D>>(new Map())
  // Reused across every frame of a recording instead of `new Image()` each
  // time — drawOnce always awaits the previous call before the next is
  // scheduled (see loop), so there's never more than one decode in flight
  // to race against reassigning .onload/.src here.
  const imgRef = useRef<HTMLImageElement | null>(null)
  // getBoundingClientRect() forces the browser to synchronously flush any
  // pending layout before it can answer — and there's *always* pending
  // layout to flush here, since the chart's own per-frame effect (see
  // LapPositionChart's clip-rect/marker update) mutates this same <svg> on
  // every animation frame too. Calling it fresh every drawOnce() therefore
  // means a forced synchronous reflow of the whole page 30 times a second
  // for the entire length of a recording — one of the biggest single costs
  // in this loop, and the main reason a long recording visibly stutters
  // (it shares the main thread with the chart's own rAF-driven playback)
  // and can even end up with less recorded video than wall-clock time
  // elapsed. The chart's on-screen size essentially never changes mid-
  // recording, so this is measured once per recording instead.
  const rectRef = useRef<DOMRect | null>(null)
  const activeAspectsRef = useRef<RecordAspect[]>([])
  const stoppedCountRef = useRef(0)
  const loopTimerRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const bgColorRef = useRef('#ffffff')
  const pendingRef = useRef<PendingRecording[]>([])

  // Renders exactly one frame into every currently-recording aspect's own
  // canvas; resolves once they're actually painted. Used both to pre-warm
  // the canvases before recording starts (so the saved videos don't open on
  // a blank/incomplete first frame while the very first async SVG-decode is
  // still in flight) and, in a loop, for every frame while recording. No
  // logo/title here — those are only ever added at finalize time (see
  // finalizeVideo), since whether to include the logo and what the title
  // should be are both asked after the fact, once per aspect.
  const drawOnce = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const svg = svgRef.current
      const aspects = activeAspectsRef.current
      if (!svg || aspects.length === 0) return resolve()

      if (!rectRef.current) rectRef.current = svg.getBoundingClientRect()
      const rect = rectRef.current
      // The chart's own width/height attributes ARE its coordinate system
      // (no viewBox — see the note on drawImage below), so that's what
      // source crop math needs to work in, not the on-screen CSS size.
      const naturalWidth = Number(svg.getAttribute('width')) || rect.width
      const naturalHeight = Number(svg.getAttribute('height')) || rect.height
      const edge = findRevealEdgeX(svg)

      // Deliberately NOT overriding the clone's width/height to some scaled
      // canvas size here: these charts size their <svg> in raw pixels with
      // no viewBox, so the width/height attributes ARE the coordinate
      // system every path was drawn in. Forcing them to a bigger number
      // doesn't rescale existing content — it just declares a bigger,
      // mostly-blank canvas around the same small drawing. Leaving them at
      // the SVG's own real size and letting drawImage's source/destination
      // rects below do the crop-and-scale is what actually renders it
      // correctly, and doing it once per tick (not once per aspect) is why
      // recording several aspect ratios at once costs one SVG serialize +
      // decode per frame, not several.
      const clone = svg.cloneNode(true) as SVGSVGElement
      inlineComputedStyles(svg, clone)
      const serialized = new XMLSerializer().serializeToString(clone)
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      // The svg's own immediate parent is the chart's actual themed
      // container in every chart this hook is used from (ReplayTrendChart's
      // .replay-trend-chart, LapPositionChart's .position-chart, etc) —
      // reading it directly here means this hook doesn't need to know any
      // particular chart's class names.
      const bg = getComputedStyle(svg.parentElement ?? svg).backgroundColor
      const resolvedBg = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff'
      bgColorRef.current = resolvedBg

      if (!imgRef.current) imgRef.current = new Image()
      const img = imgRef.current
      const proceed = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      img.onload = () => {
        for (const aspect of aspects) {
          const canvas = canvasesRef.current.get(aspect)
          if (!canvas) continue
          let ctx = ctxsRef.current.get(aspect)
          if (!ctx) {
            const created = canvas.getContext('2d', { alpha: false })
            if (!created) continue
            ctx = created
            ctxsRef.current.set(aspect, ctx)
          }

          const preset = ASPECT_PRESETS[aspect]
          let destWidth: number
          let destHeight: number
          let srcX = 0
          let srcY = 0
          let srcWidth = naturalWidth
          let srcHeight = naturalHeight

          if (preset) {
            destWidth = preset.width
            destHeight = preset.height
            // Full chart height, but only as much width as this
            // destination's aspect ratio needs — cropping a wide lap chart
            // down to a tall frame instead of squashing it into an
            // illegible sliver.
            srcHeight = naturalHeight
            srcWidth = Math.min(naturalWidth, srcHeight * (destWidth / destHeight))
            if (edge !== null) {
              srcX = Math.min(Math.max(0, edge - srcWidth * TRACK_POSITION_FRACTION), Math.max(0, naturalWidth - srcWidth))
            }
          } else {
            destWidth = Math.max(1, Math.round(rect.width * RESOLUTION_SCALE))
            destHeight = Math.max(1, Math.round(rect.height * RESOLUTION_SCALE))
          }

          if (canvas.width !== destWidth || canvas.height !== destHeight) {
            canvas.width = destWidth
            canvas.height = destHeight
          }

          // alpha:false already makes every pixel fully opaque, but the
          // fill still matters so the chart's own background shows through
          // wherever the SVG itself is transparent (empty margins etc).
          ctx.fillStyle = resolvedBg
          ctx.fillRect(0, 0, destWidth, destHeight)
          ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, destWidth, destHeight)
        }
        proceed()
      }
      img.onerror = proceed
      img.src = url
    })
  }, [svgRef])

  const loop = useCallback(async () => {
    await drawOnce()
    // setTimeout, not requestAnimationFrame: rAF callbacks are throttled to
    // near-zero (often fully paused) by the browser the moment a tab isn't
    // the focused/visible one — which used to mean a recording silently
    // stopped updating (and so came out with a frozen, cut-off-looking
    // tail) the instant you looked away or switched tabs while it ran.
    // setTimeout keeps firing in a background tab, so the recording keeps
    // progressing regardless of whether the tab is actively being watched.
    const stillRecording = [...recordersRef.current.values()].some((r) => r.state === 'recording')
    if (stillRecording) {
      loopTimerRef.current = window.setTimeout(() => loop(), 1000 / CAPTURE_FPS)
    }
  }, [drawOnce])

  const start = useCallback(async (aspects: RecordAspect[]) => {
    const svg = svgRef.current
    if (!svg || recordersRef.current.size > 0 || aspects.length === 0) return

    activeAspectsRef.current = aspects
    canvasesRef.current = new Map(aspects.map((a) => [a, document.createElement('canvas')]))
    ctxsRef.current = new Map()
    rectRef.current = null
    // Pre-warm: paint a real frame before any recorder (and the capture
    // timer) starts, so the saved videos don't open on a blank frame while
    // the first async SVG-decode is still in flight.
    await drawOnce()

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    chunksRef.current = new Map(aspects.map((a) => [a, []]))
    recordersRef.current = new Map()
    stoppedCountRef.current = 0

    for (const aspect of aspects) {
      const canvas = canvasesRef.current.get(aspect)!
      const stream = canvas.captureStream(CAPTURE_FPS)
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.get(aspect)?.push(e.data)
      }
      // Each aspect's own MediaRecorder stops independently, but they were
      // all told to stop at the same instant (see stop() below) — waiting
      // for every one of them before surfacing anything means
      // RecordFinalizeModal always sees a complete, consistent set of
      // pending recordings, never a partial one from whichever happened to
      // finish encoding first.
      recorder.onstop = () => {
        stoppedCountRef.current += 1
        if (stoppedCountRef.current < aspects.length) return
        const pending: PendingRecording[] = aspects.map((a) => {
          const blob = new Blob(chunksRef.current.get(a) ?? [], { type: mimeType })
          const aspectSuffix = a === 'landscape' ? '' : `_${a}`
          return { aspect: a, blob, mimeType, filename: `${filenameBase}${aspectSuffix}.webm` }
        })
        pendingRef.current = pending
        setPreviewSources(pending.map((p) => ({ aspect: p.aspect, blob: p.blob, backgroundColor: bgColorRef.current })))
        setAwaitingFinalize(true)
      }
      recordersRef.current.set(aspect, recorder)
    }

    for (const recorder of recordersRef.current.values()) recorder.start()
    setRecording(true)
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 250)
    loop()
  }, [svgRef, filenameBase, drawOnce, loop])

  const stop = useCallback(() => {
    for (const recorder of recordersRef.current.values()) recorder.stop()
    recordersRef.current = new Map()
    canvasesRef.current = new Map()
    ctxsRef.current = new Map()
    setRecording(false)
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current)
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
  }, [])

  // Called by RecordFinalizeModal's Cancel — discards the recording(s)
  // entirely rather than downloading them.
  const cancelFinalize = useCallback(() => {
    pendingRef.current = []
    setAwaitingFinalize(false)
    setPreviewSources([])
  }, [])

  // Called by RecordFinalizeModal's Download button — one FinalizeOptions
  // per pending aspect. A single aspect downloads as its own .webm exactly
  // as before; more than one bundles into a single .zip, since prompting
  // for N separate browser save dialogs in a row is worse than one archive.
  const submitFinalize = useCallback(async (optionsByAspect: Partial<Record<RecordAspect, FinalizeOptions>>) => {
    const pending = pendingRef.current
    pendingRef.current = []
    setAwaitingFinalize(false)
    setPreviewSources([])
    if (pending.length === 0) return

    setProcessing(true)
    setProcessingProgress(0)
    const results: { filename: string; blob: Blob }[] = []
    try {
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i]
        const options = optionsByAspect[item.aspect]
        const needsFinalize = !!(options && (options.title || options.includeLogo || options.moments.length > 0))

        if (!needsFinalize) {
          results.push({ filename: item.filename, blob: item.blob })
          setProcessingProgress((i + 1) / pending.length)
          continue
        }

        const finalBlob = await finalizeVideo(item.blob, options, item.mimeType, bgColorRef.current, (fraction) => {
          setProcessingProgress((i + fraction) / pending.length)
        })
        results.push({ filename: item.filename, blob: finalBlob })
      }
    } catch (err) {
      console.error('Failed to finalize one or more videos — downloading the plain recording(s) instead', err)
      results.length = 0
      for (const item of pending) results.push({ filename: item.filename, blob: item.blob })
    }

    try {
      if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].filename)
      } else {
        const zip = new JSZip()
        for (const r of results) zip.file(r.filename, r.blob)
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(zipBlob, `${filenameBase}.zip`)
      }
    } finally {
      setProcessing(false)
      setProcessingProgress(null)
    }
  }, [filenameBase])

  return {
    recording,
    elapsedSeconds,
    processing,
    processingProgress,
    awaitingFinalize,
    previewSources,
    perAspectOptions,
    setPerAspectOptions,
    submitFinalize,
    cancelFinalize,
    start,
    stop,
  }
}
