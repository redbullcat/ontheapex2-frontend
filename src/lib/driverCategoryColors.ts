// Real-world FIA driver-category colors (Platinum/Gold/Silver/Bronze), the
// same convention broadcast graphics and Griiip's own official WEC live
// timing use — not an arbitrary categorical palette, so no reason to pick
// different hues. Always pair with a text label too, never color-alone.
export const DRIVER_CATEGORY_COLORS: Record<string, string> = {
  platinum: '#e5e4e2',
  gold: '#d4af37',
  silver: '#a8a9ad',
  bronze: '#b08d57',
}

export const DRIVER_CATEGORY_ORDER = ['platinum', 'gold', 'silver', 'bronze'] as const
export type DriverCategory = (typeof DRIVER_CATEGORY_ORDER)[number]

export function driverCategoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()
}

export function driverCategoryColor(category: string | null | undefined): string {
  if (!category) return '#7a7a76'
  return DRIVER_CATEGORY_COLORS[category.toLowerCase()] ?? '#7a7a76'
}
