/**
 * RESEARCH LAB — backtesting & training desk.
 *
 * Uma sala separada do pregão onde os agentes de pesquisa NÃO operam: eles
 * montam combinações de indicadores clássicos (EMA, SMA, RSI, estocástico,
 * TRIX, MACD, Bollinger, ADX, momentum), testam em cima do histórico de
 * candles, medem taxa de acerto / expectância / profit factor / drawdown e
 * promovem o melhor setup a "campeão". O pregão usa o campeão como filtro de
 * confirmação e devolve o resultado real de cada trade para a sala, que segue
 * iterando (mutação + cruzamento) para melhorar.
 */

import type { Candle, Side } from '../core/types.js';

// ───────────────────────────────────────────────────── indicadores ──────────

export const emaSeries = (c: Candle[], n: number): number[] => {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = c.length ? c[0].c : 0;
  for (let i = 0; i < c.length; i++) {
    prev = i === 0 ? c[0].c : c[i].c * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
};

export const smaAt = (c: Candle[], i: number, n: number) => {
  const from = Math.max(0, i - n + 1);
  let s = 0;
  for (let k = from; k <= i; k++) s += c[k].c;
  return s / (i - from + 1);
};

export function rsiAt(c: Candle[], i: number, n = 14) {
  if (i < n) return 50;
  let gain = 0;
  let loss = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const d = c[k].c - c[k - 1].c;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export function stochAt(c: Candle[], i: number, n = 14) {
  const from = Math.max(0, i - n + 1);
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = from; k <= i; k++) {
    hi = Math.max(hi, c[k].h);
    lo = Math.min(lo, c[k].l);
  }
  if (hi === lo) return 50;
  return ((c[i].c - lo) / (hi - lo)) * 100;
}

export function atrAt(c: Candle[], i: number, n = 14) {
  const from = Math.max(1, i - n + 1);
  let s = 0;
  let count = 0;
  for (let k = from; k <= i; k++) {
    const prev = c[k - 1].c;
    s += Math.max(c[k].h - c[k].l, Math.abs(c[k].h - prev), Math.abs(c[k].l - prev));
    count++;
  }
  return count ? s / count : 0;
}

/** TRIX: taxa de variação da tripla EMA (em %). */
export function trixSeries(c: Candle[], n = 9): number[] {
  const e1 = emaSeries(c, n);
  const e2 = emaOfSeries(e1, n);
  const e3 = emaOfSeries(e2, n);
  return e3.map((v, i) => (i === 0 || e3[i - 1] === 0 ? 0 : ((v - e3[i - 1]) / Math.abs(e3[i - 1])) * 10000));
}

function emaOfSeries(src: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = src.length ? src[0] : 0;
  for (let i = 0; i < src.length; i++) {
    prev = i === 0 ? src[0] : src[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function bollAt(c: Candle[], i: number, n = 20, mult = 2) {
  const from = Math.max(0, i - n + 1);
  let sum = 0;
  let count = 0;
  for (let k = from; k <= i; k++) {
    sum += c[k].c;
    count++;
  }
  const mean = sum / count;
  let varr = 0;
  for (let k = from; k <= i; k++) varr += (c[k].c - mean) ** 2;
  const sd = Math.sqrt(varr / count);
  return { mean, upper: mean + sd * mult, lower: mean - sd * mult, sd };
}

export function adxAt(c: Candle[], i: number, n = 14) {
  if (i < n + 1) return 0;
  let plus = 0;
  let minus = 0;
  let tr = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const up = c[k].h - c[k - 1].h;
    const dn = c[k - 1].l - c[k].l;
    if (up > dn && up > 0) plus += up;
    if (dn > up && dn > 0) minus += dn;
    tr += Math.max(c[k].h - c[k].l, Math.abs(c[k].h - c[k - 1].c), Math.abs(c[k].l - c[k - 1].c));
  }
  if (tr === 0) return 0;
  const di = Math.abs(plus - minus) / (plus + minus || 1);
  return Math.min(100, di * 100 * (tr > 0 ? 1 : 0));
}

/** Agrega candles para um timeframe maior (fator 5 = M1 → M5). */
export function aggregate(c: Candle[], factor: number): Candle[] {
  if (factor <= 1) return c;
  const out: Candle[] = [];
  for (let i = 0; i < c.length; i += factor) {
    const slice = c.slice(i, i + factor);
    if (!slice.length) break;
    out.push({
      t: slice[0].t,
      o: slice[0].o,
      h: Math.max(...slice.map((x) => x.h)),
      l: Math.min(...slice.map((x) => x.l)),
      c: slice[slice.length - 1].c,
      v: slice.reduce((s, x) => s + x.v, 0),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────── genes ──────────

export type RuleKind = 'EMA_CROSS' | 'SMA_SLOPE' | 'RSI' | 'STOCH' | 'TRIX' | 'MACD' | 'BOLL' | 'ADX' | 'MOMENTUM';

export interface Rule {
  kind: RuleKind;
  a: number;
  b: number;
  /** limiar auxiliar (RSI/estocástico/ADX) */
  t?: number;
}

export interface SetupGene {
  id: string;
  name: string;
  rules: Rule[];
  /** confirmação em timeframe maior (fator de agregação) */
  htf: { factor: number; rule: Rule } | null;
  slAtr: number;
  tpAtr: number;
  maxBars: number;
}

export interface SetupMetrics {
  trades: number;
  wins: number;
  winRate: number;
  expectancyR: number;
  profitFactor: number;
  maxDdR: number;
  score: number;
}

export interface Setup {
  gene: SetupGene;
  symbol: string;
  /** in-sample (70% mais antigo do histórico) */
  metrics: SetupMetrics;
  /** out-of-sample / walk-forward (30% mais recente, nunca usado na busca) */
  validation: SetupMetrics;
  generation: number;
  createdAt: number;
  author: string;
  live: { trades: number; wins: number; pnl: number; rSum: number };
}

export interface LabFinding {
  at: number;
  author: string;
  symbol: string;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
  promoted?: boolean;
}

const RULE_LABEL: Record<RuleKind, (r: Rule) => string> = {
  EMA_CROSS: (r) => `EMA ${r.a}/${r.b}`,
  SMA_SLOPE: (r) => `SMA ${r.a} inclinação ${r.b}b`,
  RSI: (r) => `RSI ${r.a} (${r.t})`,
  STOCH: (r) => `Estocástico ${r.a} (${r.t})`,
  TRIX: (r) => `TRIX ${r.a}`,
  MACD: (r) => `MACD ${r.a}/${r.b}`,
  BOLL: (r) => `Bollinger ${r.a}·${(r.b / 10).toFixed(1)}σ`,
  ADX: (r) => `ADX ${r.a}>${r.t}`,
  MOMENTUM: (r) => `Momentum ${r.a}b`,
};

const rnd = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

function randomRule(): Rule {
  const kind = rnd<RuleKind>(['EMA_CROSS', 'SMA_SLOPE', 'RSI', 'STOCH', 'TRIX', 'MACD', 'BOLL', 'ADX', 'MOMENTUM']);
  switch (kind) {
    case 'EMA_CROSS':
      return { kind, a: ri(5, 14), b: ri(18, 55) };
    case 'SMA_SLOPE':
      return { kind, a: ri(10, 60), b: ri(2, 8) };
    case 'RSI':
      return { kind, a: ri(7, 21), b: 0, t: ri(45, 62) };
    case 'STOCH':
      return { kind, a: ri(8, 21), b: 0, t: ri(45, 75) };
    case 'TRIX':
      return { kind, a: ri(6, 18), b: 0 };
    case 'MACD':
      return { kind, a: ri(8, 14), b: ri(20, 34) };
    case 'BOLL':
      return { kind, a: ri(14, 34), b: ri(15, 28) };
    case 'ADX':
      return { kind, a: ri(10, 20), b: 0, t: ri(18, 35) };
    default:
      return { kind: 'MOMENTUM', a: ri(3, 14), b: 0 };
  }
}

function geneName(rules: Rule[], htf: SetupGene['htf']) {
  const core = rules.map((r) => RULE_LABEL[r.kind](r)).join(' + ');
  return htf ? `${core} + MTF x${htf.factor}` : core;
}

export function randomGene(): SetupGene {
  const n = ri(2, 3);
  const rules: Rule[] = [];
  while (rules.length < n) {
    const r = randomRule();
    if (!rules.some((x) => x.kind === r.kind)) rules.push(r);
  }
  const htf = Math.random() < 0.55 ? { factor: rnd([3, 5, 15]), rule: randomRule() } : null;
  const slAtr = Number((0.8 + Math.random() * 1.6).toFixed(2));
  const gene: SetupGene = {
    id: Math.random().toString(36).slice(2, 9),
    name: '',
    rules,
    htf,
    slAtr,
    tpAtr: Number((slAtr * (1.1 + Math.random() * 1.6)).toFixed(2)),
    maxBars: ri(14, 60),
  };
  gene.name = geneName(rules, htf);
  return gene;
}

export function mutate(src: SetupGene): SetupGene {
  const gene: SetupGene = JSON.parse(JSON.stringify(src));
  gene.id = Math.random().toString(36).slice(2, 9);
  const roll = Math.random();
  if (roll < 0.3) {
    gene.rules[ri(0, gene.rules.length - 1)] = randomRule();
  } else if (roll < 0.5 && gene.rules.length < 3) {
    gene.rules.push(randomRule());
  } else if (roll < 0.6 && gene.rules.length > 2) {
    gene.rules.splice(ri(0, gene.rules.length - 1), 1);
  } else if (roll < 0.75) {
    gene.htf = gene.htf ? null : { factor: rnd([3, 5, 15]), rule: randomRule() };
  } else if (roll < 0.9) {
    gene.slAtr = Number(Math.max(0.5, gene.slAtr * (0.8 + Math.random() * 0.5)).toFixed(2));
    gene.tpAtr = Number(Math.max(0.6, gene.tpAtr * (0.8 + Math.random() * 0.6)).toFixed(2));
  } else {
    gene.maxBars = Math.max(10, Math.round(gene.maxBars * (0.75 + Math.random() * 0.7)));
  }
  gene.name = geneName(gene.rules, gene.htf);
  return gene;
}

export function crossover(a: SetupGene, b: SetupGene): SetupGene {
  const rules = [...a.rules.slice(0, 1), ...b.rules.slice(0, 2)].filter(
    (r, i, arr) => arr.findIndex((x) => x.kind === r.kind) === i,
  );
  const gene: SetupGene = {
    id: Math.random().toString(36).slice(2, 9),
    name: '',
    rules: rules.slice(0, 3),
    htf: Math.random() < 0.5 ? a.htf : b.htf,
    slAtr: Number(((a.slAtr + b.slAtr) / 2).toFixed(2)),
    tpAtr: Number(((a.tpAtr + b.tpAtr) / 2).toFixed(2)),
    maxBars: Math.round((a.maxBars + b.maxBars) / 2),
  };
  gene.name = geneName(gene.rules, gene.htf);
  return gene;
}

// ─────────────────────────────────────────────────── avaliação de regras ────

/** +1 = compra, -1 = venda, 0 = neutro */
function evalRule(r: Rule, c: Candle[], i: number, cache: Map<string, number[]>): number {
  const key = (k: string) => `${k}:${r.kind}:${r.a}:${r.b}`;
  switch (r.kind) {
    case 'EMA_CROSS': {
      let fast = cache.get(key('f'));
      if (!fast) {
        fast = emaSeries(c, r.a);
        cache.set(key('f'), fast);
      }
      let slow = cache.get(key('s'));
      if (!slow) {
        slow = emaSeries(c, r.b);
        cache.set(key('s'), slow);
      }
      const d = fast[i] - slow[i];
      return Math.abs(d) < 1e-12 ? 0 : d > 0 ? 1 : -1;
    }
    case 'SMA_SLOPE': {
      const now = smaAt(c, i, r.a);
      const before = smaAt(c, Math.max(0, i - r.b), r.a);
      return now === before ? 0 : now > before ? 1 : -1;
    }
    case 'RSI': {
      const v = rsiAt(c, i, r.a);
      const t = r.t ?? 50;
      return v > t ? 1 : v < 100 - t ? -1 : 0;
    }
    case 'STOCH': {
      const v = stochAt(c, i, r.a);
      const t = r.t ?? 60;
      return v > t ? 1 : v < 100 - t ? -1 : 0;
    }
    case 'TRIX': {
      let series = cache.get(key('t'));
      if (!series) {
        series = trixSeries(c, r.a);
        cache.set(key('t'), series);
      }
      const v = series[i];
      return Math.abs(v) < 0.05 ? 0 : v > 0 ? 1 : -1;
    }
    case 'MACD': {
      let fast = cache.get(key('mf'));
      if (!fast) {
        fast = emaSeries(c, r.a);
        cache.set(key('mf'), fast);
      }
      let slow = cache.get(key('ms'));
      if (!slow) {
        slow = emaSeries(c, r.b);
        cache.set(key('ms'), slow);
      }
      const macd = fast.map((v, k) => v - slow![k]);
      const signal = emaOfSeries(macd, 9);
      const h = macd[i] - signal[i];
      return Math.abs(h) < 1e-12 ? 0 : h > 0 ? 1 : -1;
    }
    case 'BOLL': {
      const b = bollAt(c, i, r.a, r.b / 10);
      if (c[i].c > b.upper) return 1;
      if (c[i].c < b.lower) return -1;
      return 0;
    }
    case 'ADX': {
      const v = adxAt(c, i, r.a);
      if (v < (r.t ?? 25)) return 0;
      return c[i].c > smaAt(c, i, r.a) ? 1 : -1;
    }
    default: {
      const prev = c[Math.max(0, i - r.a)].c;
      const d = c[i].c - prev;
      return Math.abs(d) < 1e-12 ? 0 : d > 0 ? 1 : -1;
    }
  }
}

/** Sinal do setup na barra i: todas as regras precisam concordar. */
export function geneSignal(gene: SetupGene, c: Candle[], i: number, cache: Map<string, number[]>, htfCache?: Map<string, number[]>, htfCandles?: Candle[]): Side | null {
  if (i < 60) return null;
  let sum = 0;
  for (const r of gene.rules) {
    const v = evalRule(r, c, i, cache);
    if (v === 0) return null;
    sum += v;
  }
  if (Math.abs(sum) !== gene.rules.length) return null; // precisa ser unânime
  const side: Side = sum > 0 ? 'BUY' : 'SELL';
  if (gene.htf && htfCandles && htfCandles.length > 60) {
    // usa apenas o último candle de timeframe maior JÁ FECHADO (evita lookahead)
    const hi = Math.min(htfCandles.length - 1, Math.floor(i / gene.htf.factor) - 1);
    if (hi < 30) return null;
    const v = evalRule(gene.htf.rule, htfCandles, hi, htfCache ?? new Map());
    if (v === 0) return null;
    if ((side === 'BUY' && v < 0) || (side === 'SELL' && v > 0)) return null;
  }
  return side;
}

// ──────────────────────────────────────────────────────── backtest ──────────

/** custo por trade em múltiplos de R (spread + slippage) */
const COST_R = 0.12;

export function backtest(gene: SetupGene, all: Candle[], fromFrac = 0, toFrac = 1): SetupMetrics {
  const empty: SetupMetrics = { trades: 0, wins: 0, winRate: 0, expectancyR: 0, profitFactor: 0, maxDdR: 0, score: -99 };
  const candles = all.slice(Math.floor(all.length * fromFrac), Math.ceil(all.length * toFrac));
  if (candles.length < 90) return empty;
  const cache = new Map<string, number[]>();
  const htfCandles = gene.htf ? aggregate(candles, gene.htf.factor) : undefined;
  const htfCache = new Map<string, number[]>();

  let trades = 0;
  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let i = 50;

  while (i < candles.length - 2) {
    const side = geneSignal(gene, candles, i, cache, htfCache, htfCandles);
    if (!side) {
      i++;
      continue;
    }
    const entry = candles[i].c;
    const a = atrAt(candles, i, 14) || Math.abs(entry) * 0.0005;
    const sl = side === 'BUY' ? entry - a * gene.slAtr : entry + a * gene.slAtr;
    const tp = side === 'BUY' ? entry + a * gene.tpAtr : entry - a * gene.tpAtr;
    const rr = gene.tpAtr / gene.slAtr;
    let r = 0;
    let k = i + 1;
    for (; k < Math.min(candles.length, i + gene.maxBars); k++) {
      const bar = candles[k];
      const hitSl = side === 'BUY' ? bar.l <= sl : bar.h >= sl;
      const hitTp = side === 'BUY' ? bar.h >= tp : bar.l <= tp;
      if (hitSl && hitTp) {
        r = -1; // conservador: assume o stop primeiro
        break;
      }
      if (hitSl) {
        r = -1;
        break;
      }
      if (hitTp) {
        r = rr;
        break;
      }
    }
    if (r === 0) {
      const exit = candles[Math.min(k, candles.length - 1)].c;
      const moved = (exit - entry) * (side === 'BUY' ? 1 : -1);
      r = moved / (a * gene.slAtr || 1e-9);
    }
    r -= COST_R; // spread + slippage
    trades++;
    if (r > 0) {
      wins++;
      grossWin += r;
    } else {
      grossLoss += Math.abs(r);
    }
    equity += r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    i = k + 1;
  }

  if (!trades) return empty;
  const winRate = wins / trades;
  const expectancyR = equity / trades;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0;
  // score penaliza amostra pequena e drawdown
  const score = Number(
    (expectancyR * Math.sqrt(Math.min(trades, 120)) * Math.min(2.5, Math.max(0.2, profitFactor)) - maxDd * 0.04).toFixed(3),
  );
  return {
    trades,
    wins,
    winRate: Number(winRate.toFixed(3)),
    expectancyR: Number(expectancyR.toFixed(3)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxDdR: Number(maxDd.toFixed(2)),
    score,
  };
}

// ───────────────────────────────────────────────────────── a sala ───────────

const MIN_TRADES = 14;
const MIN_WINRATE = 0.5;
const MIN_EXPECTANCY = 0.08;

export class ResearchLab {
  /** melhores candidatos por símbolo (ordenados por score) */
  private pool = new Map<string, Setup[]>();
  champions = new Map<string, Setup>();
  findings: LabFinding[] = [];
  experiments = 0;
  promotions = 0;
  generation = 1;

  /** Roda UM experimento e devolve o que foi descoberto (para o agente falar). */
  runExperiment(symbol: string, candles: Candle[], author: string, now: number): LabFinding | null {
    if (candles.length < 140) return null;
    this.experiments++;
    const pool = this.pool.get(symbol) ?? [];
    const champ = this.champions.get(symbol);

    let gene: SetupGene;
    let how: string;
    if (!pool.length || Math.random() < 0.35) {
      gene = randomGene();
      how = 'ideia nova';
    } else if (pool.length >= 2 && Math.random() < 0.35) {
      gene = crossover(pool[0].gene, pool[ri(1, Math.min(3, pool.length - 1))].gene);
      how = 'cruzamento';
    } else {
      gene = mutate((champ ?? pool[0]).gene);
      how = 'refinamento';
    }

    const metrics = backtest(gene, candles, 0, 0.65);
    const validation = backtest(gene, candles, 0.65, 1);
    const setup: Setup = {
      gene,
      symbol,
      metrics,
      validation,
      generation: this.generation,
      createdAt: now,
      author,
      live: { trades: 0, wins: 0, pnl: 0, rSum: 0 },
    };

    const next = [...pool, setup].sort((a, b) => b.metrics.score - a.metrics.score).slice(0, 8);
    this.pool.set(symbol, next);
    if (this.experiments % 25 === 0) this.generation++;

    const qualifies =
      metrics.trades >= MIN_TRADES &&
      metrics.winRate >= MIN_WINRATE &&
      metrics.expectancyR >= MIN_EXPECTANCY &&
      // precisa sobreviver ao período que nunca foi usado na busca
      validation.trades >= 3 &&
      validation.expectancyR > 0;
    const beatsChampion = !champ || metrics.score > champ.metrics.score * 1.05;

    let finding: LabFinding;
    if (qualifies && beatsChampion) {
      this.champions.set(symbol, setup);
      this.promotions++;
      finding = {
        at: now,
        author,
        symbol,
        promoted: true,
        tone: 'good',
        text: `Novo setup campeão em ${symbol}: ${gene.name} · ${(metrics.winRate * 100).toFixed(0)}% de acerto em ${metrics.trades} trades (validação ${(validation.winRate * 100).toFixed(0)}% / ${validation.expectancyR.toFixed(2)}R), expectância ${metrics.expectancyR.toFixed(2)}R, PF ${metrics.profitFactor.toFixed(2)}, SL ${gene.slAtr}·ATR / TP ${gene.tpAtr}·ATR.`,
      };
    } else if (metrics.trades < MIN_TRADES) {
      finding = {
        at: now,
        author,
        symbol,
        tone: 'info',
        text: `${how}: ${gene.name} gerou só ${metrics.trades} entradas em ${symbol} — amostra pequena, descartado.`,
      };
    } else if (metrics.winRate >= MIN_WINRATE && validation.expectancyR <= 0) {
      finding = {
        at: now,
        author,
        symbol,
        tone: 'warn',
        text: `${how}: ${gene.name} ia bem em ${symbol} (${(metrics.winRate * 100).toFixed(0)}%), mas quebrou na validação fora da amostra — overfitting, descartado.`,
      };
    } else if (metrics.winRate < MIN_WINRATE) {
      finding = {
        at: now,
        author,
        symbol,
        tone: 'warn',
        text: `${how}: ${gene.name} acertou ${(metrics.winRate * 100).toFixed(0)}% em ${symbol} (${metrics.trades} trades) — abaixo do corte, vou mexer nos parâmetros.`,
      };
    } else {
      finding = {
        at: now,
        author,
        symbol,
        tone: 'info',
        text: `${how}: ${gene.name} ficou em ${(metrics.winRate * 100).toFixed(0)}% / ${metrics.expectancyR.toFixed(2)}R em ${symbol} — bom, mas não bate o campeão atual.`,
      };
    }
    this.findings.unshift(finding);
    this.findings = this.findings.slice(0, 40);
    return finding;
  }

  /** Confirmação do campeão para o pregão (usada no estágio técnico). */
  confirm(symbol: string, side: Side, candles: Candle[]) {
    const champ = this.champions.get(symbol);
    if (!champ || candles.length < 80) return null;
    const cache = new Map<string, number[]>();
    const htfCandles = champ.gene.htf ? aggregate(candles, champ.gene.htf.factor) : undefined;
    const sig = geneSignal(champ.gene, candles, candles.length - 1, cache, new Map(), htfCandles);
    const aligned = sig === side;
    const strength = Math.min(16, Math.round((champ.metrics.winRate - 0.45) * 60 + champ.metrics.expectancyR * 12));
    return {
      setup: champ.gene.name,
      setupId: champ.gene.id,
      aligned,
      neutral: sig === null,
      delta: sig === null ? 0 : aligned ? Math.max(4, strength) : -Math.max(6, strength),
      winRate: champ.metrics.winRate,
      expectancyR: champ.metrics.expectancyR,
      slAtr: champ.gene.slAtr,
      tpAtr: champ.gene.tpAtr,
    };
  }

  /** Resultado real de um trade volta para a sala. */
  recordLive(symbol: string, setupId: string | undefined, rMultiple: number, pnl: number, now: number) {
    const champ = this.champions.get(symbol);
    if (!champ || (setupId && champ.gene.id !== setupId)) return;
    champ.live.trades++;
    champ.live.rSum += rMultiple;
    champ.live.pnl = Number((champ.live.pnl + pnl).toFixed(2));
    if (rMultiple > 0) champ.live.wins++;

    const { trades, wins } = champ.live;
    if (trades >= 8) {
      const liveWr = wins / trades;
      if (liveWr < champ.metrics.winRate - 0.25) {
        this.champions.delete(symbol);
        this.findings.unshift({
          at: now,
          author: champ.author,
          symbol,
          tone: 'bad',
          text: `Rebaixei ${champ.gene.name} em ${symbol}: ${(liveWr * 100).toFixed(0)}% ao vivo contra ${(champ.metrics.winRate * 100).toFixed(0)}% no backtest. Voltando para a bancada.`,
        });
      } else if (trades % 10 === 0) {
        this.findings.unshift({
          at: now,
          author: champ.author,
          symbol,
          tone: liveWr >= champ.metrics.winRate ? 'good' : 'info',
          text: `${champ.gene.name} em ${symbol}: ${(liveWr * 100).toFixed(0)}% ao vivo em ${trades} trades (${champ.live.pnl >= 0 ? '+' : ''}$${champ.live.pnl.toFixed(2)}).`,
        });
      }
      this.findings = this.findings.slice(0, 40);
    }
  }

  summary() {
    const champions = [...this.champions.entries()].map(([symbol, s]) => ({
      symbol,
      name: s.gene.name,
      id: s.gene.id,
      winRate: s.metrics.winRate,
      trades: s.metrics.trades,
      expectancyR: s.metrics.expectancyR,
      profitFactor: s.metrics.profitFactor,
      maxDdR: s.metrics.maxDdR,
      validation: s.validation,
      slAtr: s.gene.slAtr,
      tpAtr: s.gene.tpAtr,
      htf: s.gene.htf ? `x${s.gene.htf.factor}` : null,
      author: s.author,
      live: s.live,
    }));
    const leaderboard = [...this.pool.values()]
      .flat()
      .sort((a, b) => b.metrics.score - a.metrics.score)
      .slice(0, 8)
      .map((s) => ({
        symbol: s.symbol,
        name: s.gene.name,
        winRate: s.metrics.winRate,
        trades: s.metrics.trades,
        expectancyR: s.metrics.expectancyR,
        profitFactor: s.metrics.profitFactor,
        score: s.metrics.score,
        validationWinRate: s.validation.winRate,
        validationTrades: s.validation.trades,
        author: s.author,
      }));
    return {
      experiments: this.experiments,
      promotions: this.promotions,
      generation: this.generation,
      champions,
      leaderboard,
      findings: this.findings.slice(0, 12),
    };
  }
}

export const lab = new ResearchLab();
