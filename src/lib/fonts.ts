// Saira/Saira Condensed's @font-face CSS (all 27 weight/style files) lives
// in lib/fontFaces.ts, not here — it's only ever needed by the canvas-only
// title-recording feature (see ensureTitleFontLoaded below, the only place
// that actually renders text in these fonts), so it's dynamically imported
// there instead of being bundled into the app's one global stylesheet that
// every visitor loads regardless of whether they ever touch that feature.
//
// Inter, self-hosted the same way, for chart axis/label text (matches the
// font used in the manually-themed reference SVG exports embedded on the
// marketing site — see chartExport.ts, which also references the
// Google-hosted Inter/Saira for downloaded SVGs, since those leave the app's
// own stylesheet context).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'

export type TitleFontFamily = 'Saira' | 'Saira Condensed'

export const TITLE_FONT_FAMILIES: TitleFontFamily[] = ['Saira', 'Saira Condensed']

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

// Saira Condensed has no italic cut, so its style list is upright-only.
const FAMILIES_WITH_ITALIC = new Set<TitleFontFamily>(['Saira'])

export interface TitleFontStyleOption {
  weight: number
  italic: boolean
  label: string
}

export function stylesForFamily(family: TitleFontFamily): TitleFontStyleOption[] {
  const hasItalic = FAMILIES_WITH_ITALIC.has(family)
  const options: TitleFontStyleOption[] = []
  for (const weight of WEIGHTS) {
    options.push({ weight, italic: false, label: WEIGHT_LABELS[weight] })
    if (hasItalic) {
      options.push({ weight, italic: true, label: `${WEIGHT_LABELS[weight]} Italic` })
    }
  }
  return options
}

export interface TitleFontOptions {
  family: TitleFontFamily
  weight: number
  italic: boolean
  size: number
}

export const DEFAULT_TITLE_FONT: TitleFontOptions = {
  family: 'Saira',
  weight: 700,
  italic: false,
  size: 48,
}

export function titleFontCss(font: TitleFontOptions, size: number = font.size): string {
  const style = font.italic ? 'italic' : 'normal'
  const family = font.family.includes(' ') ? `"${font.family}"` : font.family
  return `${style} ${font.weight} ${size}px ${family}`
}

// Canvas text rendering doesn't trigger @font-face loading the way normal
// DOM layout does — without this, the very first draw of a given
// weight/style can silently fall back to the browser default font until
// the resource happens to finish loading in the background. The dynamic
// import is what actually registers the @font-face rules in the first
// place (see lib/fontFaces.ts) — deferred to here, the one place this
// feature is actually exercised, rather than a static import anywhere
// upstream that every visitor's bundle would carry regardless.
export async function ensureTitleFontLoaded(font: TitleFontOptions): Promise<void> {
  try {
    await import('./fontFaces')
    await document.fonts.load(titleFontCss(font, 48))
  } catch {
    // Fall through and let the canvas use whatever's already available —
    // a missed preload just means one frame with a fallback font, not a
    // broken recording.
  }
}
