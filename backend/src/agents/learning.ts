import type { AgentRole, MarketRegime, Side } from '../core/types.js';

/**
 * Per-agent learning brain
 * ========================
 * Explainable, incremental learning — no black box. Every closed trade becomes
 * a *lesson*: the setup is decomposed into discrete features, each feature keeps
 * running statistics (sample size, win rate, expectancy in R) and the agent uses
 * that memory to bias — or veto — the next setup of the same family.
 *
 * Design goals:
 *  - works from the very first trade (Laplace smoothing + confidence by sample);
 *  - always able to explain *why* ("regime:RANGING is 2/9 for me");
 *  - serialisable so the knowledge survives restarts and updates.
 */

export interface SetupFeatures {
  symbol: string;
  side: Side;
  regime: MarketRegime;
  volatility: 'Low' | 'Moderate' | 'Elevated' | 'Extreme';
  momentum: 'Bullish' | 'Bearish' | 'Neutral';
  liquidity: 'Low' | 'Normal' | 'High';
  technical?: number;
  macro?: number;
  quant?: number;
  confidence?: number;
  spreadRatio: number; // spread / typical spread
  sessionHour: number; // 0..23 UTC
  newsInMinutes: number | null;
  riskReward?: number;
}

export interface Lesson {
  id: string;
  at: number;
  symbol: string;
  side: Side;
  pnl: number;
  rMultiple: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: string;
  holdMs: number;
  features: SetupFeatures;
  right: string[];
  wrong: string[];
  verdict: string;
}

interface Bucket {
  n: number;
  wins: number;
  pnl: number;
  r: number;
}

export interface BrainEvaluation {
  /** confidence points to add/remove (−20..+20) */
  delta: number;
  /** 'TAKE' | 'NEUTRAL' | 'AVOID' */
  verdict: 'TAKE' | 'NEUTRAL' | 'AVOID';
  support: number; // how many historical samples back this opinion
  positives: { key: string; winRate: number; n: number }[];
  negatives: { key: string; winRate: number; n: number }[];
  reason: string;
}

const SESSION = (h: number) => (h < 7 ? 'asia' : h < 12 ? 'london' : h < 17 ? 'london-ny' : h < 21 ? 'newyork' : 'late');
const band = (v: number | undefined, size = 10) => (v === undefined ? null : `${Math.floor(v / size) * size}-${Math.floor(v / size) * size + size - 1}`);

/** Decompose a setup into the discrete features the agent reasons about. */
export function featureKeys(f: SetupFeatures): string[] {
  const keys = [
    `regime:${f.regime}`,
    `side:${f.side}`,
    `vol:${f.volatility}`,
    `momentum:${f.momentum}`,
    `liquidity:${f.liquidity}`,
    `session:${SESSION(f.sessionHour)}`,
    `spread:${f.spreadRatio > 1.8 ? 'wide' : f.spreadRatio > 1.1 ? 'normal' : 'tight'}`,
    `news:${f.newsInMinutes === null ? 'clear' : f.newsInMinutes < 15 ? 'imminent' : f.newsInMinutes < 60 ? 'near' : 'clear'}`,
    `aligned:${(f.side === 'BUY' && f.momentum === 'Bullish') || (f.side === 'SELL' && f.momentum === 'Bearish') ? 'yes' : 'no'}`,
  ];
  const t = band(f.technical);
  const m = band(f.macro);
  const c = band(f.confidence);
  if (t) keys.push(`technical:${t}`);
  if (m) keys.push(`macro:${m}`);
  if (c) keys.push(`confidence:${c}`);
  if (f.riskReward) keys.push(`rr:${f.riskReward >= 2.5 ? 'high' : f.riskReward >= 1.8 ? 'mid' : 'low'}`);
  return keys;
}

export const PRETTY: Record<string, string> = {
  regime: 'market regime',
  side: 'direction',
  vol: 'volatility',
  momentum: 'momentum',
  liquidity: 'liquidity',
  session: 'session',
  spread: 'spread',
  news: 'event proximity',
  aligned: 'momentum alignment',
  technical: 'technical score',
  macro: 'macro score',
  confidence: 'confidence band',
  rr: 'risk/reward',
};

export const humanKey = (key: string) => {
  const [k, v] = key.split(':');
  return `${PRETTY[k] ?? k} = ${v}`;
};

export class AgentBrain {
  key: string;
  role: AgentRole;
  name: string;
  symbol?: string;
  samples = 0;
  wins = 0;
  losses = 0;
  pnl = 0;
  rSum = 0;
  grossWin = 0;
  grossLoss = 0;
  buckets = new Map<string, Bucket>();
  lessons: Lesson[] = [];
  /** predicted confidence vs realised win rate, for calibration */
  calibration = new Map<string, { n: number; wins: number }>();

  constructor(key: string, role: AgentRole, name: string, symbol?: string) {
    this.key = key;
    this.role = role;
    this.name = name;
    this.symbol = symbol;
  }

  private bucket(k: string) {
    let b = this.buckets.get(k);
    if (!b) {
      b = { n: 0, wins: 0, pnl: 0, r: 0 };
      this.buckets.set(k, b);
    }
    return b;
  }

  /** Smoothed win rate — unknown features gravitate to 50%. */
  winRateOf(k: string) {
    const b = this.buckets.get(k);
    if (!b || b.n === 0) return 0.5;
    return (b.wins + 1.5) / (b.n + 3); // Laplace smoothing
  }

  get winRate() {
    return this.samples ? this.wins / this.samples : 0;
  }
  get expectancyR() {
    return this.samples ? this.rSum / this.samples : 0;
  }
  get profitFactor() {
    return this.grossLoss > 0 ? this.grossWin / this.grossLoss : this.grossWin > 0 ? 99 : 0;
  }

  /**
   * What the memory says about a setup *before* taking it.
   * Weighting: a feature only moves the needle once it has samples behind it.
   */
  evaluate(features: SetupFeatures): BrainEvaluation {
    const keys = featureKeys(features);
    let score = 0;
    let support = 0;
    const positives: BrainEvaluation['positives'] = [];
    const negatives: BrainEvaluation['negatives'] = [];

    for (const k of keys) {
      const b = this.buckets.get(k);
      if (!b || b.n < 2) continue;
      const wr = this.winRateOf(k);
      const weight = Math.min(1, b.n / 10); // full trust at 10 samples
      score += (wr - 0.5) * weight;
      support += b.n;
      const entry = { key: k, winRate: wr, n: b.n };
      if (wr >= 0.58 && b.n >= 3) positives.push(entry);
      if (wr <= 0.42 && b.n >= 3) negatives.push(entry);
    }
    positives.sort((a, b) => b.winRate * b.n - a.winRate * a.n);
    negatives.sort((a, b) => a.winRate * b.n - b.winRate * a.n);

    const delta = Math.max(-20, Math.min(20, Math.round(score * 26)));
    const strongNegative = negatives.some((n) => n.n >= 6 && n.winRate <= 0.3);
    const verdict: BrainEvaluation['verdict'] =
      strongNegative || delta <= -12 ? 'AVOID' : delta >= 8 ? 'TAKE' : 'NEUTRAL';

    const reason =
      verdict === 'AVOID' && negatives[0]
        ? `memory: ${humanKey(negatives[0].key)} is ${(negatives[0].winRate * 100).toFixed(0)}% over ${negatives[0].n} trades`
        : verdict === 'TAKE' && positives[0]
          ? `memory: ${humanKey(positives[0].key)} is ${(positives[0].winRate * 100).toFixed(0)}% over ${positives[0].n} trades`
          : this.samples < 5
            ? `still learning (${this.samples} trades recorded)`
            : 'no strong historical edge either way';

    return { delta, verdict, support, positives: positives.slice(0, 4), negatives: negatives.slice(0, 4), reason };
  }

  /** Record the outcome and write down what went right / wrong. */
  record(input: {
    id: string;
    at: number;
    features: SetupFeatures;
    pnl: number;
    rMultiple: number;
    exitReason: string;
    holdMs: number;
  }): Lesson {
    const win = input.pnl > 0;
    this.samples++;
    this.pnl = Number((this.pnl + input.pnl).toFixed(2));
    this.rSum += input.rMultiple;
    if (win) {
      this.wins++;
      this.grossWin += input.pnl;
    } else {
      this.losses++;
      this.grossLoss += Math.abs(input.pnl);
    }

    const keys = featureKeys(input.features);
    for (const k of keys) {
      const b = this.bucket(k);
      b.n++;
      if (win) b.wins++;
      b.pnl = Number((b.pnl + input.pnl).toFixed(2));
      b.r += input.rMultiple;
    }

    // confidence calibration
    const cband = band(input.features.confidence);
    if (cband) {
      const c = this.calibration.get(cband) ?? { n: 0, wins: 0 };
      c.n++;
      if (win) c.wins++;
      this.calibration.set(cband, c);
    }

    const { right, wrong, verdict } = this.explain(input.features, win, input.rMultiple, keys);
    const lesson: Lesson = {
      id: input.id,
      at: input.at,
      symbol: input.features.symbol,
      side: input.features.side,
      pnl: Number(input.pnl.toFixed(2)),
      rMultiple: Number(input.rMultiple.toFixed(2)),
      result: input.pnl > 0.5 ? 'WIN' : input.pnl < -0.5 ? 'LOSS' : 'BREAKEVEN',
      exitReason: input.exitReason,
      holdMs: input.holdMs,
      features: input.features,
      right,
      wrong,
      verdict,
    };
    this.lessons.unshift(lesson);
    this.lessons = this.lessons.slice(0, 60);
    return lesson;
  }

  /** Human readable post-mortem of a single trade. */
  private explain(f: SetupFeatures, win: boolean, r: number, keys: string[]) {
    const right: string[] = [];
    const wrong: string[] = [];
    const aligned = (f.side === 'BUY' && f.momentum === 'Bullish') || (f.side === 'SELL' && f.momentum === 'Bearish');

    const note = (good: boolean, text: string) => (good ? right : wrong).push(text);

    note(aligned, aligned ? `traded with the ${f.momentum.toLowerCase()} momentum` : `faded the ${f.momentum.toLowerCase()} momentum`);
    if (f.technical !== undefined) note(f.technical >= 60, `technical score ${f.technical}/100`);
    if (f.macro !== undefined) note(f.macro >= 55, `macro context ${f.macro}/100`);
    if (f.confidence !== undefined) note(f.confidence >= 65, `desk confidence ${f.confidence}%`);
    note(f.spreadRatio <= 1.4, `spread ${f.spreadRatio.toFixed(2)}x normal at entry`);
    note(f.newsInMinutes === null || f.newsInMinutes > 30, f.newsInMinutes === null ? 'clean calendar window' : `high impact event ${f.newsInMinutes.toFixed(0)}m away`);
    note(f.volatility !== 'Extreme', `volatility ${f.volatility.toLowerCase()}`);
    note(f.regime !== 'RANGING' || f.riskReward === undefined || f.riskReward < 2, `regime ${f.regime.replace('_', ' ').toLowerCase()}`);

    // what the memory already knew
    const known = keys
      .map((k) => ({ k, b: this.buckets.get(k) }))
      .filter((x) => x.b && x.b.n >= 4)
      .sort((a, b) => (win ? this.winRateOf(b.k) - this.winRateOf(a.k) : this.winRateOf(a.k) - this.winRateOf(b.k)))[0];
    if (known) {
      const wr = (this.winRateOf(known.k) * 100).toFixed(0);
      (win ? right : wrong).push(`${humanKey(known.k)} now ${wr}% across ${known.b!.n} trades`);
    }

    const verdict = win
      ? r >= 1.5
        ? `Clean ${r.toFixed(1)}R — repeat this setup family.`
        : `Positive but thin (${r.toFixed(1)}R) — size can stay the same.`
      : r <= -1
        ? `Full stop (${r.toFixed(1)}R). Avoid this combination until it proves itself again.`
        : `Small loss (${r.toFixed(1)}R). Acceptable cost of doing business.`;

    return { right: right.slice(0, 4), wrong: wrong.slice(0, 4), verdict };
  }

  /** Compact view for the UI. */
  summary() {
    const rank = [...this.buckets.entries()]
      .filter(([, b]) => b.n >= 3)
      .map(([key, b]) => ({ key, label: humanKey(key), n: b.n, winRate: this.winRateOf(key), pnl: b.pnl, r: b.r / b.n }));
    rank.sort((a, b) => b.winRate - a.winRate);
    return {
      key: this.key,
      name: this.name,
      role: this.role,
      symbol: this.symbol,
      samples: this.samples,
      wins: this.wins,
      losses: this.losses,
      winRate: this.winRate,
      pnl: this.pnl,
      expectancyR: this.expectancyR,
      profitFactor: this.profitFactor,
      best: rank.slice(0, 5),
      worst: rank.slice(-5).reverse(),
      calibration: [...this.calibration.entries()]
        .map(([band, c]) => ({ band, n: c.n, realized: c.wins / c.n }))
        .sort((a, b) => a.band.localeCompare(b.band)),
      lessons: this.lessons.slice(0, 20),
    };
  }

  toJSON() {
    return {
      key: this.key,
      role: this.role,
      name: this.name,
      symbol: this.symbol,
      samples: this.samples,
      wins: this.wins,
      losses: this.losses,
      pnl: this.pnl,
      rSum: this.rSum,
      grossWin: this.grossWin,
      grossLoss: this.grossLoss,
      buckets: [...this.buckets.entries()],
      calibration: [...this.calibration.entries()],
      lessons: this.lessons.slice(0, 40),
    };
  }

  static fromJSON(raw: any): AgentBrain {
    const b = new AgentBrain(raw.key, raw.role, raw.name, raw.symbol);
    Object.assign(b, {
      samples: raw.samples ?? 0,
      wins: raw.wins ?? 0,
      losses: raw.losses ?? 0,
      pnl: raw.pnl ?? 0,
      rSum: raw.rSum ?? 0,
      grossWin: raw.grossWin ?? 0,
      grossLoss: raw.grossLoss ?? 0,
      lessons: raw.lessons ?? [],
    });
    b.buckets = new Map(raw.buckets ?? []);
    b.calibration = new Map(raw.calibration ?? []);
    return b;
  }
}

/** Keyed by a stable identity so knowledge survives restarts/updates. */
export const brainKey = (role: AgentRole, name: string, symbol?: string) => `${role}|${name}|${symbol ?? '-'}`;

export class BrainBank {
  private brains = new Map<string, AgentBrain>();

  for(role: AgentRole, name: string, symbol?: string): AgentBrain {
    const key = brainKey(role, name, symbol);
    let b = this.brains.get(key);
    if (!b) {
      b = new AgentBrain(key, role, name, symbol);
      this.brains.set(key, b);
    }
    return b;
  }

  get(key: string) {
    return this.brains.get(key);
  }
  list() {
    return [...this.brains.values()];
  }
  reset(key: string) {
    const old = this.brains.get(key);
    if (!old) return false;
    this.brains.set(key, new AgentBrain(key, old.role, old.name, old.symbol));
    return true;
  }
  toJSON() {
    return this.list().map((b) => b.toJSON());
  }
  load(raw: any[]) {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      try {
        const b = AgentBrain.fromJSON(item);
        this.brains.set(b.key, b);
      } catch {
        /* ignore corrupt entry */
      }
    }
  }
}

export const brains = new BrainBank();
