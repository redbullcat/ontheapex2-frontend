import type { StaffRole } from './session'

// Default permission tiers by Ghost staff role — chart traces/data are
// never affected by this, only which export/edit actions are offered.
// "Owner" is Ghost's legacy single-site-owner role; treated the same as
// Administrator since there's no meaningful difference for this app.
export type ExportCapability = 'png' | 'svg' | 'embed' | 'editSvg'

const CAPABILITIES_BY_ROLE: Record<StaffRole, ExportCapability[]> = {
  Owner: ['png', 'svg', 'embed', 'editSvg'],
  Administrator: ['png', 'svg', 'embed', 'editSvg'],
  Editor: ['png'],
  Author: ['png'],
  Contributor: [],
}

export function canExport(role: StaffRole, capability: ExportCapability): boolean {
  return CAPABILITIES_BY_ROLE[role]?.includes(capability) ?? false
}

export function hasAnyExportCapability(role: StaffRole): boolean {
  return (CAPABILITIES_BY_ROLE[role]?.length ?? 0) > 0
}
