import type { Candle, MarketRegime, Side, Signal } from '../core/types.js';

/** Future-proof hook: real strategies will implement this. */
export interface Strategy {
  readonly name: string;
  analyze(input: { symbol: string; candles: Candle[]; regime: MarketRegime }): Signal | null;
}

export const sma = (c: Candle[], n: number) => {
  const slice = c.slice(-n);
  return slice.reduce((s, x) => s + x.c, 0) / Math.max(1, slice.length);
};

export function rsi(c: Candle[], n = 14) {
  if (c.length < n + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = c.length - n; i < c.length; i++) {
    const diff = c[i].c - c[i - 1].c;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function atr(c: Candle[], n = 14) {
  if (c.length < 2) return 0;
  const slice = c.slice(-n);
  let sum = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].c;
    sum += Math.max(slice[i].h - slice[i].l, Math.abs(slice[i].h - prev), Math.abs(slice[i].l - prev));
  }
  return sum / Math.max(1, slice.length - 1);
}

/** Momentum-breakout strategy used by the scouts in v1. */
export class MomentumBreakoutStrategy implements Strategy {
  readonly name = 'Momentum Breakout v1';
  constructor(private sensitivity = 0.5) {}

  analyze({ symbol, candles, regime }: { symbol: string; candles: Candle[]; regime: MarketRegime }): Signal | null {
    if (candles.length < 30) return null;
    const fast = sma(candles, 8);
    const slow = sma(candles, 21);
    const r = rsi(candles, 14);
    const a = atr(candles, 14) || 1e-9;
    const last = candles[candles.length - 1].c;
    const trendScore = ((fast - slow) / a) * 55;
    const rsiScore = (r - 50) * 1.1;
    const breakout = ((last - sma(candles, 34)) / a) * 25;
    let raw = trendScore + rsiScore * 0.6 + breakout * 0.5;
    if (regime === 'RANGING') raw *= 0.45;
    if (regime === 'HIGH_VOLATILITY' || regime === 'NEWS_SHOCK') raw *= 1.35;
    if (regime === 'LOW_VOLATILITY') raw *= 0.6;

    const threshold = 34 - this.sensitivity * 16; // aggressive scouts fire earlier
    if (Math.abs(raw) < threshold) return null;
    const side: Side = raw > 0 ? 'BUY' : 'SELL';
    const strength = Math.min(97, 48 + Math.abs(raw) * 0.75);
    const reason =
      side === 'BUY'
        ? `fast MA above slow MA (+${(fast - slow).toFixed(5)}), RSI ${r.toFixed(0)}`
        : `fast MA below slow MA (${(fast - slow).toFixed(5)}), RSI ${r.toFixed(0)}`;
    return { symbol, side, strength, reason };
  }
}

export interface AnalysisInputs {
  candles: Candle[];
  regime: MarketRegime;
  side: Side;
  volatility: number;
  spreadRatio: number;
  newsInMinutes: number | null;
  aggressiveness: number;
}

export function technicalScore(i: AnalysisInputs) {
  const r = rsi(i.candles, 14);
  const fast = sma(i.candles, 8);
  const slow = sma(i.candles, 21);
  const aligned = i.side === 'BUY' ? fast > slow : fast < slow;
  const rsiAligned = i.side === 'BUY' ? r > 50 : r < 50;
  let score = 42 + (aligned ? 20 : -14) + (rsiAligned ? 14 : -10);
  score += (Math.random() - 0.4) * 16;
  if (i.regime === 'RANGING') score -= 8;
  if (i.regime === 'TRENDING') score += 7;
  return clamp(score);
}

export function macroScore(i: AnalysisInputs) {
  let score = 50 + (Math.random() - 0.45) * 34;
  if (i.newsInMinutes !== null && i.newsInMinutes < 10) score -= 18;
  if (i.regime === 'NEWS_SHOCK') score -= 10;
  return clamp(score);
}

export function quantScore(i: AnalysisInputs, technical: number, macro: number) {
  const blend = technical * 0.55 + macro * 0.3 + (1 - i.spreadRatio) * 15;
  const volPenalty = i.volatility > 0.7 ? 10 : 0;
  const liquidity = i.regime === 'LIQUIDITY_DROP' ? 12 : 0;
  return clamp(blend - volPenalty - liquidity + (Math.random() - 0.5) * 10);
}

const clamp = (v: number) => Math.round(Math.max(1, Math.min(99, v)));
