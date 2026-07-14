// Driver (and other free-text identity) names arrive with inconsistent
// casing across cars/sessions in the same race (e.g. "Dries VANTHOOR" vs
// "Dries Vanthoor") — a plain `Set` doesn't dedupe case variants, so a
// joined "Drivers" list ends up showing the same person twice. Dedupes on
// a normalized (trimmed, lowercased) key while keeping the first-seen
// original-cased value, same approach as PaceChart's team-name fix.
export function dedupeNamesCaseInsensitive(names: string[]): string[] {
  const seen = new Map<string, string>()
  for (const name of names) {
    const key = name.trim().toLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()]
}
