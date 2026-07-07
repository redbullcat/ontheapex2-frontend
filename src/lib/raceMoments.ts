import { contrastTextColorForColor } from './contrastColor'

export interface Point {
  x: number
  y: number
}

// A caption + arrow annotation baked into the finalized video at a specific
// instant — "Habsburg passes Duval at Les Combes" and the like. `atSeconds`
// is a timestamp within the *raw recorded clip itself*, not a lap number:
// the recording is whatever the user actually played/scrubbed in real time,
// so there's no fixed lap->time formula to invert afterwards, but the clip's
// own timeline is exact and simple to scrub against directly. `textPos`/
// `anchorPos` are fractions (0..1) of the chart area (see chartRectFor in
// useSvgRecorder.ts) rather than raw pixels, so a moment placed once is at
// least approximately still in the right place after a resolution change —
// and, best-effort, even after switching aspect ratio (landscape/portrait/
// square crop the chart differently, so this isn't exact, but "same relative
// spot in the frame" is a reasonable default until proven otherwise).
export interface RaceMoment {
  id: string
  atSeconds: number
  text: string
  textPos: Point
  anchorPos: Point
  holdSeconds: number
}

export const DEFAULT_HOLD_SECONDS = 3
// How long the arrow/caption take to draw in and fade out — kept short and
// fixed (not per-moment) since these are a house style, not something worth
// a control for.
const ENTER_SECONDS = 0.45
const EXIT_SECONDS = 0.3

let momentCounter = 0
export function createMoment(atSeconds: number): RaceMoment {
  momentCounter += 1
  return {
    id: `moment-${Date.now()}-${momentCounter}`,
    atSeconds,
    text: '',
    textPos: { x: 0.5, y: 0.16 },
    anchorPos: { x: 0.5, y: 0.5 },
    holdSeconds: DEFAULT_HOLD_SECONDS,
  }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Where a moment's anchor/text points sit in canvas-pixel space, given the
// chart rect they're fractions of — the one place this math happens, shared
// by the canvas-drawn overlay (drawMomentOverlay) and the drag-to-position
// editor's DOM overlay (RecordPreview), so a handle you see on screen while
// dragging is exactly where the arrow ends up pointing in the export.
export function momentAnchorPx(chartRect: Rect, moment: RaceMoment): Point {
  return { x: chartRect.x + moment.anchorPos.x * chartRect.width, y: chartRect.y + moment.anchorPos.y * chartRect.height }
}
export function momentTextPx(chartRect: Rect, moment: RaceMoment): Point {
  return { x: chartRect.x + moment.textPos.x * chartRect.width, y: chartRect.y + moment.textPos.y * chartRect.height }
}

export interface MomentOverlayState {
  moment: RaceMoment
  // Arrow reveal, 0 (nothing drawn) -> 1 (fully drawn) — only ever ramps up,
  // since once drawn the arrow stays fully drawn through the hold and exit.
  dashProgress: number
  // Overall opacity of the whole overlay (arrow + bubble) — ramps 0->1 on
  // entry alongside dashProgress, holds at 1, then ramps back to 0 on exit.
  opacity: number
}

// Drives the pause/hold/resume behavior shared by the real finalize
// re-encode pass and RecordPreview's live preview, so both look identical.
// Tracks fired moments by id (not by array index/reference) so it stays
// correct across the moments array being edited (text/position tweaks,
// additions, removals) while a recording plays.
export class MomentPlayer {
  private fired = new Set<string>()
  private active: { moment: RaceMoment; startedAtMs: number } | null = null

  reset() {
    this.fired.clear()
    this.active = null
  }

  // True for exactly as long as this player itself is holding the video
  // paused for a moment — callers that otherwise want to keep the video
  // playing (e.g. RecordPreview's normal loop) need this so they don't
  // immediately un-pause a hold the instant it starts.
  isHolding(): boolean {
    return this.active !== null
  }

  update(moments: RaceMoment[], video: HTMLVideoElement, nowMs: number): MomentOverlayState | null {
    if (this.active) {
      // If the moment was deleted mid-hold (editing while playing), just
      // end the hold early rather than getting stuck.
      const live = moments.find((m) => m.id === this.active!.moment.id)
      if (!live) {
        this.active = null
        video.play().catch(() => {})
        return null
      }
      const elapsed = (nowMs - this.active.startedAtMs) / 1000
      const total = ENTER_SECONDS + live.holdSeconds + EXIT_SECONDS
      if (elapsed >= total) {
        this.active = null
        video.play().catch(() => {})
        return null
      }
      let dashProgress: number
      let opacity: number
      if (elapsed < ENTER_SECONDS) {
        dashProgress = elapsed / ENTER_SECONDS
        opacity = dashProgress
      } else if (elapsed < ENTER_SECONDS + live.holdSeconds) {
        dashProgress = 1
        opacity = 1
      } else {
        dashProgress = 1
        opacity = 1 - (elapsed - ENTER_SECONDS - live.holdSeconds) / EXIT_SECONDS
      }
      return { moment: live, dashProgress, opacity }
    }

    const next = moments
      .filter((m) => !this.fired.has(m.id) && m.atSeconds <= video.currentTime)
      .sort((a, b) => a.atSeconds - b.atSeconds)[0]
    if (!next) return null

    this.fired.add(next.id)
    video.pause()
    this.active = { moment: next, startedAtMs: nowMs }
    return { moment: next, dashProgress: 0, opacity: 0 }
  }
}

// Perpendicular-offset control point, same curvature convention as the
// wireframe prototype, so the drag-time preview and the baked-in export
// arrow are visually identical.
export function curveControlPoint(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1
  const nx = -dy / dist
  const ny = dx / dist
  const bend = Math.min(46, dist * 0.32)
  return { cx: mx + nx * bend, cy: my + ny * bend }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
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

// Draws one moment's arrow + caption bubble onto an already-composited
// frame. `chartRect` is the on-canvas rectangle the chart itself occupies
// (see chartRectFor) — textPos/anchorPos are fractions of that rect, not of
// the full canvas, so bands toggling on/off doesn't shift where a moment
// points relative to the chart content.
export function drawMomentOverlay(
  ctx: CanvasRenderingContext2D,
  chartRect: Rect,
  overlay: MomentOverlayState,
  backgroundColor: string,
) {
  const { moment, dashProgress, opacity } = overlay
  if (opacity <= 0.002) return

  const { x: ax, y: ay } = momentAnchorPx(chartRect, moment)
  const { x: tx, y: ty } = momentTextPx(chartRect, moment)

  const fontSize = Math.max(12, Math.round(chartRect.height * 0.032))
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`
  const maxTextWidth = chartRect.width * 0.4
  const lines = wrapLines(ctx, moment.text || ' ', maxTextWidth)
  const lineHeight = fontSize * 1.35
  const padX = fontSize * 0.7
  const padY = fontSize * 0.55
  const textWidth = Math.min(maxTextWidth, Math.max(...lines.map((l) => ctx.measureText(l).width), 1))
  const bubbleW = textWidth + padX * 2
  const bubbleH = lines.length * lineHeight + padY * 2
  // Settles in from slightly below during the entry animation, same feel as
  // the wireframe's CSS "slide up while fading in".
  const bubbleY = ty - bubbleH / 2 + (1 - opacity) * fontSize * 0.6
  const bubbleX = tx - bubbleW / 2

  // Arrow start: the point on the bubble's own edge closest to the anchor,
  // not the bubble's center — otherwise the line would visibly cut across
  // the caption text itself.
  const dx = ax - tx
  const dy = ay - ty
  let startX = tx
  let startY = ty
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    const scaleX = bubbleW / 2 / (Math.abs(dx) || 1)
    const scaleY = bubbleH / 2 / (Math.abs(dy) || 1)
    const s = Math.min(scaleX, scaleY, 1)
    startX = tx + dx * s
    startY = ty + dy * s
  }

  ctx.save()
  ctx.globalAlpha = opacity

  // Arrow, revealed via a dash offset that shrinks the "gap" as dashProgress
  // grows toward 1 — approximated with the straight-line distance (not the
  // curve's true arclength) since a small visual error here is unnoticeable.
  const { cx, cy } = curveControlPoint(startX, startY, ax, ay)
  const approxLen = Math.hypot(ax - startX, ay - startY) * 1.15 + 1
  ctx.strokeStyle = contrastTextColorForColor(backgroundColor)
  ctx.lineWidth = Math.max(2, fontSize * 0.12)
  ctx.lineCap = 'round'
  ctx.setLineDash([approxLen, approxLen])
  ctx.lineDashOffset = approxLen * (1 - dashProgress)
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.quadraticCurveTo(cx, cy, ax, ay)
  ctx.stroke()
  ctx.setLineDash([])

  if (dashProgress >= 0.999) {
    const angle = Math.atan2(ay - cy, ax - cx)
    const back = fontSize * 0.5
    const spread = 0.4
    ctx.fillStyle = contrastTextColorForColor(backgroundColor)
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax - back * Math.cos(angle - spread), ay - back * Math.sin(angle - spread))
    ctx.lineTo(ax - back * Math.cos(angle + spread), ay - back * Math.sin(angle + spread))
    ctx.closePath()
    ctx.fill()
  }

  // Caption bubble — same background/contrast-text convention as the title
  // band, so it stays legible and visually consistent regardless of theme.
  const radius = 8
  ctx.fillStyle = backgroundColor
  ctx.strokeStyle = contrastTextColorForColor(backgroundColor)
  ctx.globalAlpha = opacity * 0.96
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(bubbleX + radius, bubbleY)
  ctx.arcTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + bubbleH, radius)
  ctx.arcTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH, radius)
  ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY, radius)
  ctx.arcTo(bubbleX, bubbleY, bubbleX + bubbleW, bubbleY, radius)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.globalAlpha = opacity
  ctx.fillStyle = contrastTextColorForColor(backgroundColor)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textStartY = bubbleY + padY + lineHeight / 2
  lines.forEach((line, i) => ctx.fillText(line, bubbleX + bubbleW / 2, textStartY + i * lineHeight))

  ctx.restore()
}
