// What each state says about prices set from your personal data.
// Checked against public law summaries in September 2026. Not legal advice.

export interface LawInfo {
  /** short headline */
  status: 'banned' | 'must-disclose' | 'coming' | 'none';
  headline: string;
  detail: string;
  report: { label: string; url: string };
}

const FTC = { label: 'Report it to the FTC', url: 'https://reportfraud.ftc.gov' };

export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const SPECIAL: Record<string, LawInfo> = {
  NY: {
    status: 'must-disclose',
    headline: 'Stores must warn you',
    detail:
      'Since Nov 10, 2025, a store that uses your personal data to set a price has to show: "This price was set by an algorithm using your personal data." A full ban (the One Fair Price Act) passed the legislature in June 2026 but is not law yet.',
    report: { label: 'Report it to the NY Attorney General', url: 'https://ag.ny.gov' },
  },
  MD: {
    status: 'banned',
    headline: 'Banned on groceries',
    detail:
      'Since Oct 1, 2026, large grocery stores and food delivery apps cannot use your personal data to charge you more for food.',
    report: { label: 'Report it to the MD Attorney General', url: 'https://www.marylandattorneygeneral.gov' },
  },
  CT: {
    status: 'coming',
    headline: 'Ban starts July 1, 2027',
    detail:
      'From July 1, 2027, stores and delivery apps cannot charge you more using your personal data, and other online sellers must show: "This price was increased using your personal data."',
    report: { label: 'Contact the CT Attorney General', url: 'https://portal.ct.gov/ag' },
  },
  NJ: {
    status: 'coming',
    headline: 'Grocery ban starts Aug 1, 2027',
    detail: 'From Aug 1, 2027, stores cannot use your personal data to charge you more for groceries.',
    report: { label: 'Contact NJ Consumer Affairs', url: 'https://www.njconsumeraffairs.gov' },
  },
};

const DEFAULT: LawInfo = {
  status: 'none',
  headline: 'No state law yet',
  detail:
    'Your state has no specific rule on this yet. The FTC proposed in Aug 2026 that stores must clearly tell you when a price is personalized, and that is expected to apply from 2027.',
  report: FTC,
};

export function lawFor(code: string | null | undefined): LawInfo | null {
  if (!code || !Object.hasOwn(STATES, code)) return null;
  return Object.hasOwn(SPECIAL, code) ? (SPECIAL[code] ?? DEFAULT) : DEFAULT;
}
