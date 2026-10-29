/**
 * Score how well `query` matches `text` (0 = no match). Prefix and word
 * matches rank highest, then substrings, then in-order subsequences.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 - Math.min(t.length - q.length, 40) * 0.1;
  if (t.split(/[\s\-_./]+/).some((w) => w.startsWith(q))) return 80;
  const idx = t.indexOf(q);
  if (idx >= 0) return 60 - Math.min(idx, 20) * 0.5;
  // Subsequence match: every query character appears in order.
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    gaps += found - ti;
    ti = found + 1;
  }
  return Math.max(1, 35 - gaps);
}

/** Best score of `query` against several fields, weighting the first highest. */
export function bestScore(query: string, fields: string[]): number {
  let best = 0;
  fields.forEach((f, i) => {
    const s = fuzzyScore(query, f) * (i === 0 ? 1 : 0.7);
    if (s > best) best = s;
  });
  return best;
}
