// Saira and Saira Condensed, self-hosted via @fontsource rather than a
// Google Fonts CDN link — works offline and needs no external request at
// runtime. Each @fontsource package's own index.css only ships the 400
// (Regular) weight, so every other weight/style needs its own import; the
// title-recording feature (RecordFinalizeModal) offers the full range each
// family actually has, so all of them are pulled in here. Saira Condensed
// has no italic cut on Google Fonts, so only the upright weights exist for
// it.
import '@fontsource/saira/100.css'
import '@fontsource/saira/100-italic.css'
import '@fontsource/saira/200.css'
import '@fontsource/saira/200-italic.css'
import '@fontsource/saira/300.css'
import '@fontsource/saira/300-italic.css'
import '@fontsource/saira/400.css'
import '@fontsource/saira/400-italic.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/500-italic.css'
import '@fontsource/saira/600.css'
import '@fontsource/saira/600-italic.css'
import '@fontsource/saira/700.css'
import '@fontsource/saira/700-italic.css'
import '@fontsource/saira/800.css'
import '@fontsource/saira/800-italic.css'
import '@fontsource/saira/900.css'
import '@fontsource/saira/900-italic.css'
import '@fontsource/saira-condensed/100.css'
import '@fontsource/saira-condensed/200.css'
import '@fontsource/saira-condensed/300.css'
import '@fontsource/saira-condensed/400.css'
import '@fontsource/saira-condensed/500.css'
import '@fontsource/saira-condensed/600.css'
import '@fontsource/saira-condensed/700.css'
import '@fontsource/saira-condensed/800.css'
import '@fontsource/saira-condensed/900.css'

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
// the resource happens to finish loading in the background.
export async function ensureTitleFontLoaded(font: TitleFontOptions): Promise<void> {
  try {
    await document.fonts.load(titleFontCss(font, 48))
  } catch {
    // Fall through and let the canvas use whatever's already available —
    // a missed preload just means one frame with a fallback font, not a
    // broken recording.
  }
}
