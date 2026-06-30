export function getExcludedUserIds(): string[] {
  return (process.env.ANALYTICS_EXCLUDE_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Appends `AND column NOT IN ($n…)` when exclusions are configured. */
export function userExclusionClause(
  column: string,
  excluded: string[],
  paramStart = 1,
): { clause: string; params: string[] } {
  if (excluded.length === 0) {
    return { clause: '', params: [] };
  }
  const placeholders = excluded.map((_, i) => `$${paramStart + i}`).join(', ');
  return {
    clause: ` AND ${column} NOT IN (${placeholders})`,
    params: excluded,
  };
}
