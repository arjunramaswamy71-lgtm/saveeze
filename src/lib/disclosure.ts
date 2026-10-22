/** The warning lines state laws make stores show when your data set the price. */
const NOTICES: { re: RegExp; law: string }[] = [
  { re: /price\s+was\s+set\s+by\s+an\s+algorithm\s+using\s+your\s+personal\s+data/i, law: 'New York' },
  { re: /price\s+was\s+increased\s+using\s+your\s+personal\s+data/i, law: 'Connecticut' },
  { re: /(price|pricing)\s+(is|was)\s+(personalized|customized)\s+(for you\s+)?(using|based on)\s+(your\s+)?(personal\s+)?data/i, law: 'general' },
];

export interface Notice {
  law: string;
  text: string;
}

/** Looks through the visible page text for one of those warnings. */
export function findNotice(text: string): Notice | null {
  const flat = text.replace(/\s+/g, ' ');
  for (const n of NOTICES) {
    const m = flat.match(n.re);
    if (m) {
      const start = Math.max(0, (m.index ?? 0) - 40);
      return { law: n.law, text: flat.slice(start, (m.index ?? 0) + m[0].length + 40).trim() };
    }
  }
  return null;
}
