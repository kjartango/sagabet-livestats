// Canonical statistic keys.
//
// Each provider speaks its own dialect (SofaScore: `totalShotsOnGoal`; FotMob:
// `total_shots`), so every connector translates into the vocabulary below. The
// renderer and the options page only ever see these keys, which is what makes
// providers swappable.

/** Team-level statistics, in display order. */
export const TEAM_STATS = [
  { key: 'shotsTotal', label: 'Shots', group: 'Shots' },
  { key: 'shotsOn', label: 'On target', group: 'Shots' },
  { key: 'shotsOff', label: 'Off target', group: 'Shots' },
  { key: 'shotsBlocked', label: 'Blocked', group: 'Shots' },
  { key: 'shotsInBox', label: 'In box', group: 'Shots' },
  { key: 'shotsOutBox', label: 'Outside box', group: 'Shots' },
  { key: 'woodwork', label: 'Woodwork', group: 'Shots' },
  { key: 'xg', label: 'xG', group: 'Shots' },
  { key: 'bigChances', label: 'Big chances', group: 'Shots' },
  { key: 'corners', label: 'Corners', group: 'Match' },
  { key: 'possession', label: 'Possession', group: 'Match' },
  { key: 'passes', label: 'Passes', group: 'Match' },
  { key: 'touchesInBox', label: 'Touches in box', group: 'Match' },
  { key: 'offsides', label: 'Offsides', group: 'Match' },
  { key: 'fouls', label: 'Fouls', group: 'Discipline' },
  { key: 'yellow', label: 'Yellow cards', group: 'Discipline' },
  { key: 'red', label: 'Red cards', group: 'Discipline' },
  { key: 'tackles', label: 'Tackles', group: 'Defence' },
  { key: 'interceptions', label: 'Interceptions', group: 'Defence' },
  { key: 'clearances', label: 'Clearances', group: 'Defence' },
  { key: 'saves', label: 'Saves', group: 'Defence' },
  { key: 'duelsWon', label: 'Duels won', group: 'Defence' },
];

/** Player-level statistics, in display order. */
export const PLAYER_STATS = [
  { key: 'shots', label: 'Shots', short: 'Sh' },
  { key: 'shotsOn', label: 'On target', short: 'SoT' },
  { key: 'shotsOff', label: 'Off target', short: 'Soff' },
  { key: 'shotsBlocked', label: 'Blocked', short: 'Blk' },
  { key: 'goals', label: 'Goals', short: 'G' },
  { key: 'assists', label: 'Assists', short: 'A' },
  { key: 'xg', label: 'xG', short: 'xG' },
  { key: 'fouls', label: 'Fouls', short: 'Fls' },
  { key: 'fouled', label: 'Fouled', short: 'Fld' },
  { key: 'tackles', label: 'Tackles', short: 'Tkl' },
  { key: 'interceptions', label: 'Interceptions', short: 'Int' },
  { key: 'offsides', label: 'Offsides', short: 'Off' },
  { key: 'saves', label: 'Saves', short: 'Sv' },
  { key: 'keyPasses', label: 'Key passes', short: 'KP' },
  { key: 'touches', label: 'Touches', short: 'Tch' },
  { key: 'minutes', label: 'Minutes', short: 'Min' },
  { key: 'rating', label: 'Rating', short: 'Rtg' },
];

export const TEAM_LABELS = Object.fromEntries(TEAM_STATS.map((s) => [s.key, s.label]));
export const PLAYER_LABELS = Object.fromEntries(PLAYER_STATS.map((s) => [s.key, s.label]));
export const PLAYER_SHORT = Object.fromEntries(PLAYER_STATS.map((s) => [s.key, s.short]));

/** Parse "228 (79%)", "76%", "1.92" into a number; null when there isn't one. */
export function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Build a canonical stat entry the renderer can display. */
export function stat(key, home, away, { homeText, awayText } = {}) {
  return {
    key,
    label: TEAM_LABELS[key] || key,
    home: toNumber(home),
    away: toNumber(away),
    homeText: homeText ?? (home == null ? null : String(home)),
    awayText: awayText ?? (away == null ? null : String(away)),
  };
}
