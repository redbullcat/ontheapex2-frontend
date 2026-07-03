// Griiip's live sessionType field (see session_meta_from_bootstrap on the
// backend) has never actually been observed for a real race session — only
// practice, in every capture so far — so this is a conservative best-effort
// classifier rather than a confirmed mapping: only returns true when the
// string clearly says "race", and defaults to false (hide the charts)
// otherwise. Same fallback direction as Replay's bucketFor, which treats
// anything ambiguous as practice rather than assuming race.
export function isLiveRaceSession(sessionType: string | null | undefined): boolean {
  if (!sessionType) return false
  const t = sessionType.toLowerCase()
  if (t.includes('practice') || t.includes('qualif') || t.includes('warm')) return false
  return t.includes('race')
}
