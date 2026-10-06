import type { AgentRole } from '../core/types.js';

export type Sector = 'MARKET_INTELLIGENCE' | 'RESEARCH' | 'RISK' | 'EXECUTION' | 'NEWSROOM';

export interface Desk {
  id: string;
  label: string;
  sector: Sector;
  /** world position on the office floor (x = left/right, z = depth) */
  x: number;
  z: number;
  /** rotation around Y, radians. 0 = agent faces -Z (towards the video wall) */
  rot: number;
  monitors: number;
  width: number;
  depth: number;
  preferred: AgentRole[];
}

const d = (
  id: string,
  label: string,
  sector: Sector,
  x: number,
  z: number,
  rot: number,
  monitors: number,
  preferred: AgentRole[],
  width = 3.2,
  depth = 1.7,
): Desk => ({ id, label, sector, x, z, rot, monitors, width, depth, preferred });

const PI = Math.PI;

/** Fixed floor plan of the Axe Capital trading floor. Shared with the 3D view. */
export const DESKS: Desk[] = [
  // ── Market Intelligence pit: two rows facing the video wall ──────────────
  d('scout-1', 'Scout Desk 01', 'MARKET_INTELLIGENCE', -9.5, -7.5, 0, 3, ['MARKET_SCOUT']),
  d('scout-2', 'Scout Desk 02', 'MARKET_INTELLIGENCE', -3.2, -7.5, 0, 3, ['MARKET_SCOUT']),
  d('scout-3', 'Scout Desk 03', 'MARKET_INTELLIGENCE', 3.2, -7.5, 0, 3, ['MARKET_SCOUT']),
  d('scout-4', 'Scout Desk 04', 'MARKET_INTELLIGENCE', 9.5, -7.5, 0, 3, ['MARKET_SCOUT']),
  d('scout-5', 'Scout Desk 05', 'MARKET_INTELLIGENCE', -6.3, -3.4, 0, 2, ['MARKET_SCOUT']),
  d('scout-6', 'Scout Desk 06', 'MARKET_INTELLIGENCE', 0, -3.4, 0, 2, ['MARKET_SCOUT']),
  d('scout-7', 'Scout Desk 07', 'MARKET_INTELLIGENCE', 6.3, -3.4, 0, 2, ['MARKET_SCOUT']),

  // ── Research wing (left) ────────────────────────────────────────────────
  d('research-1', 'Technical Research', 'RESEARCH', -14.2, -0.5, PI / 2, 3, ['TECHNICAL_ANALYST']),
  d('research-2', 'Quant Lab', 'RESEARCH', -14.2, 3.4, PI / 2, 4, ['QUANT_ANALYST']),
  d('research-3', 'Macro Research', 'RESEARCH', -14.2, 7.3, PI / 2, 3, ['MACRO_ANALYST']),

  // ── News room (left/top corner) ─────────────────────────────────────────
  d('news-1', 'News Room', 'NEWSROOM', -14.2, -5.6, PI / 2, 3, ['NEWS_ANALYST', 'MACRO_ANALYST']),

  // ── Risk & portfolio wing (right) ───────────────────────────────────────
  d('risk-1', 'Risk Control', 'RISK', 14.2, -0.5, -PI / 2, 3, ['RISK_MANAGER']),
  d('risk-2', 'Portfolio Management', 'RISK', 14.2, 3.4, -PI / 2, 3, ['PORTFOLIO_MANAGER']),
  d('risk-3', 'Compliance / Backup', 'RISK', 14.2, 7.3, -PI / 2, 2, ['RISK_MANAGER', 'PORTFOLIO_MANAGER']),

  // ── Execution island (centre south) ─────────────────────────────────────
  d('trader-1', 'Execution Station Alpha', 'EXECUTION', 0, 6.4, 0, 6, ['TRADER'], 6.4, 2.2),
  d('trader-2', 'Execution Station Beta', 'EXECUTION', -7.4, 9.8, 0, 4, ['TRADER'], 4.2, 1.9),
  d('trader-3', 'Execution Station Gamma', 'EXECUTION', 7.4, 9.8, 0, 4, ['TRADER'], 4.2, 1.9),
];

export const deskById = (id: string) => DESKS.find((x) => x.id === id);

export function pickDesk(role: AgentRole, taken: Set<string>): Desk | undefined {
  return (
    DESKS.find((x) => !taken.has(x.id) && x.preferred[0] === role) ??
    DESKS.find((x) => !taken.has(x.id) && x.preferred.includes(role)) ??
    DESKS.find((x) => !taken.has(x.id))
  );
}

export const ROLE_META: Record<AgentRole, { label: string; emoji: string; accent: string; blurb: string }> = {
  MARKET_SCOUT: { label: 'Market Scout', emoji: '👁', accent: '#38bdf8', blurb: 'Watches tick flow for unusual momentum on one instrument.' },
  TECHNICAL_ANALYST: { label: 'Technical Analyst', emoji: '📈', accent: '#a78bfa', blurb: 'Reads structure, momentum and key levels.' },
  MACRO_ANALYST: { label: 'Macro Analyst', emoji: '🌎', accent: '#34d399', blurb: 'Weighs rates, central banks and the calendar.' },
  QUANT_ANALYST: { label: 'Quant Analyst', emoji: '🧮', accent: '#22d3ee', blurb: 'Estimates probability, edge and expected move.' },
  RISK_MANAGER: { label: 'Risk Manager', emoji: '🛡', accent: '#f87171', blurb: 'Has veto power over every single trade.' },
  PORTFOLIO_MANAGER: { label: 'Portfolio Manager', emoji: '📊', accent: '#fbbf24', blurb: 'Sizes the position and balances the book.' },
  TRADER: { label: 'Trader / Execution', emoji: '🤖', accent: '#4ade80', blurb: 'Works the order into the market via MetaTrader 5.' },
  NEWS_ANALYST: { label: 'News Analyst', emoji: '📰', accent: '#fb923c', blurb: 'Tracks CPI, NFP, FOMC and breaking headlines.' },
};
