import type { Candle, MarketPrice, MarketRegime } from '../core/types.js';
import type { MarketDataProvider, SymbolInfo } from './interfaces.js';

interface SymbolSeed extends SymbolInfo {
  start: number;
  vol: number; // base volatility per tick (in price units)
  spreadPoints: number;
}

const SEEDS: SymbolSeed[] = [
  s('EURUSD', 'Euro vs US Dollar', 1.17342, 5, 0.00004, 8, 'FOREX', 100000),
  s('GBPUSD', 'Great Britain Pound vs US Dollar', 1.26815, 5, 0.00005, 10, 'FOREX', 100000),
  s('USDJPY', 'US Dollar vs Japanese Yen', 151.482, 3, 0.006, 9, 'FOREX', 100000),
  s('AUDUSD', 'Australian Dollar vs US Dollar', 0.65412, 5, 0.00004, 11, 'FOREX', 100000),
  s('USDCAD', 'US Dollar vs Canadian Dollar', 1.36128, 5, 0.00004, 12, 'FOREX', 100000),
  s('USDCHF', 'US Dollar vs Swiss Franc', 0.88245, 5, 0.00004, 12, 'FOREX', 100000),
  s('NZDUSD', 'New Zealand Dollar vs US Dollar', 0.59874, 5, 0.00004, 14, 'FOREX', 100000),
  s('EURJPY', 'Euro vs Japanese Yen', 177.731, 3, 0.008, 13, 'FOREX', 100000),
  s('GBPJPY', 'Pound vs Japanese Yen', 192.106, 3, 0.012, 18, 'FOREX', 100000),
  s('XAUUSD', 'Gold vs US Dollar', 2648.42, 2, 0.35, 22, 'METAL', 100),
  s('XAGUSD', 'Silver vs US Dollar', 31.284, 3, 0.012, 25, 'METAL', 5000),
  s('USOIL', 'Crude Oil WTI', 71.42, 2, 0.05, 30, 'ENERGY', 1000),
  s('US500', 'S&P 500 Index', 5842.5, 1, 1.4, 40, 'INDEX', 1),
  s('US30', 'Dow Jones 30', 43210, 0, 9, 200, 'INDEX', 1),
  s('NAS100', 'Nasdaq 100', 20412, 0, 8, 150, 'INDEX', 1),
  s('DXY', 'US Dollar Index', 104.812, 3, 0.012, 20, 'INDEX', 1),
  s('US10Y', 'US 10Y Treasury Yield', 4.282, 3, 0.004, 10, 'INDEX', 1),
  s('VIX', 'Volatility Index', 14.62, 2, 0.08, 10, 'INDEX', 1),
  s('BTCUSD', 'Bitcoin vs US Dollar', 96412, 2, 48, 400, 'CRYPTO', 1),
];

function s(
  symbol: string,
  description: string,
  start: number,
  digits: number,
  vol: number,
  spreadPoints: number,
  category: SymbolInfo['category'],
  contractSize: number,
): SymbolSeed {
  return {
    symbol,
    description,
    digits,
    point: Math.pow(10, -digits),
    contractSize,
    category,
    tradable: !['DXY', 'US10Y', 'VIX'].includes(symbol),
    start,
    vol,
    spreadPoints,
  };
}

interface SeriesState {
  seed: SymbolSeed;
  price: number;
  open: number;
  trend: number; // drift in price units per tick
  candles: Candle[];
  working?: Candle;
  volume: number;
  volatilityMult: number;
  shock: number;
}

const CANDLE_MS = 60_000; // 1 minute of simulated time

/**
 * A deterministic-ish stochastic market. Produces ticks, candles, spreads and
 * regime driven behaviour. Zero real money, clearly flagged as SIMULATION.
 */
export class SimulatedMarketDataProvider implements MarketDataProvider {
  readonly name = 'Axe Capital Simulation Engine';
  readonly mode = 'SIMULATION' as const;
  private series = new Map<string, SeriesState>();
  private subs = new Set<string>();
  regime: MarketRegime = 'TRENDING';

  constructor() {
    for (const seed of SEEDS) {
      this.series.set(seed.symbol, {
        seed,
        price: seed.start,
        open: seed.start,
        trend: (Math.random() - 0.5) * seed.vol * 0.35,
        candles: [],
        volume: 0,
        volatilityMult: 1,
        shock: 0,
      });
    }
    // warm-up history so charts are never empty
    for (const st of this.series.values()) this.warmup(st, 180);
  }

  private warmup(st: SeriesState, bars: number) {
    let t = Date.now() - bars * CANDLE_MS;
    let p = st.seed.start;
    for (let i = 0; i < bars; i++) {
      const o = p;
      let h = p;
      let l = p;
      for (let k = 0; k < 20; k++) {
        p += (Math.random() - 0.5) * st.seed.vol * 3 + st.trend;
        h = Math.max(h, p);
        l = Math.min(l, p);
      }
      st.candles.push({ t, o, h, l, c: p, v: Math.round(400 + Math.random() * 900) });
      t += CANDLE_MS;
    }
    st.price = p;
    st.open = st.candles[Math.max(0, st.candles.length - 60)].o;
  }

  /**
   * Register an instrument that is not part of the built-in universe (e.g. a
   * broker-specific MT5 symbol such as EURUSD.m). Optionally seeded with a
   * real price coming from the terminal.
   */
  ensure(symbol: string, opts: { digits?: number; point?: number; contractSize?: number; price?: number; description?: string } = {}) {
    if (this.series.has(symbol)) {
      if (opts.price) this.syncReal(symbol, opts.price);
      return;
    }
    const digits = opts.digits ?? (symbol.toUpperCase().includes('JPY') ? 3 : 5);
    const start = opts.price ?? (digits <= 2 ? 100 : 1.1);
    const seed: SymbolSeed = {
      symbol,
      description: opts.description ?? symbol,
      digits,
      point: opts.point ?? Math.pow(10, -digits),
      contractSize: opts.contractSize ?? 100000,
      category: 'OTHER',
      tradable: true,
      start,
      vol: start * 0.00004,
      spreadPoints: 12,
    };
    const st: SeriesState = {
      seed,
      price: start,
      open: start,
      trend: (Math.random() - 0.5) * seed.vol * 0.35,
      candles: [],
      volume: 0,
      volatilityMult: 1,
      shock: 0,
    };
    this.series.set(symbol, st);
    this.warmup(st, 180);
  }

  /** Blend the simulated series towards a real price coming from MT5. */
  syncReal(symbol: string, mid: number) {
    const st = this.series.get(symbol);
    if (!st || !Number.isFinite(mid) || mid <= 0) return;
    st.price = st.price * 0.15 + mid * 0.85;
  }

  async listSymbols(): Promise<SymbolInfo[]> {
    return SEEDS.map(({ start, vol, spreadPoints, ...rest }) => rest);
  }

  isConnected() {
    return true;
  }

  subscribe(symbol: string) {
    this.subs.add(symbol);
  }
  unsubscribe(symbol: string) {
    this.subs.delete(symbol);
  }
  symbols() {
    return [...this.series.keys()];
  }

  setRegime(regime: MarketRegime) {
    this.regime = regime;
    for (const st of this.series.values()) {
      switch (regime) {
        case 'TRENDING':
          st.volatilityMult = 1;
          st.trend = (Math.random() < 0.5 ? -1 : 1) * st.seed.vol * (0.25 + Math.random() * 0.4);
          break;
        case 'RANGING':
          st.volatilityMult = 0.7;
          st.trend = 0;
          break;
        case 'HIGH_VOLATILITY':
          st.volatilityMult = 2.6;
          break;
        case 'LOW_VOLATILITY':
          st.volatilityMult = 0.4;
          st.trend *= 0.3;
          break;
        case 'NEWS_SHOCK':
          st.volatilityMult = 3.6;
          st.shock = (Math.random() < 0.5 ? -1 : 1) * st.seed.vol * 70;
          break;
        case 'LIQUIDITY_DROP':
          st.volatilityMult = 1.8;
          break;
      }
    }
  }

  /** Inject a directional shock, e.g. after a news release. */
  shock(symbol: string | null, magnitude = 1) {
    const targets = symbol ? [this.series.get(symbol)!].filter(Boolean) : [...this.series.values()];
    for (const st of targets) {
      st.shock += (Math.random() < 0.5 ? -1 : 1) * st.seed.vol * 60 * magnitude;
      st.volatilityMult = Math.max(st.volatilityMult, 2.4);
    }
  }

  /** Advance the world by `dtMs` of *simulated* time. */
  step(simNow: number, dtMs: number) {
    const steps = Math.max(1, Math.min(40, Math.round(dtMs / 250)));
    for (const st of this.series.values()) {
      for (let i = 0; i < steps; i++) {
        const noise = (Math.random() - 0.5) * st.seed.vol * 4 * st.volatilityMult;
        const meanRevert = this.regime === 'RANGING' ? (st.open - st.price) * 0.0015 : 0;
        const shockPart = st.shock * 0.18;
        st.shock *= 0.82;
        st.price = Math.max(st.seed.point, st.price + noise + st.trend + meanRevert + shockPart);
        st.volume += Math.random() * 14;
      }
      // slow drift of trend + volatility normalisation
      st.trend += (Math.random() - 0.5) * st.seed.vol * 0.05;
      st.trend = clamp(st.trend, -st.seed.vol * 1.1, st.seed.vol * 1.1);
      st.volatilityMult += (1 - st.volatilityMult) * 0.01;

      const bucket = Math.floor(simNow / CANDLE_MS) * CANDLE_MS;
      const last = st.candles[st.candles.length - 1];
      if (!last || last.t !== bucket) {
        st.candles.push({ t: bucket, o: st.price, h: st.price, l: st.price, c: st.price, v: 0 });
        if (st.candles.length > 400) st.candles.shift();
      } else {
        last.h = Math.max(last.h, st.price);
        last.l = Math.min(last.l, st.price);
        last.c = st.price;
        last.v = Math.round(st.volume);
      }
    }
  }

  getPrice(symbol: string): MarketPrice | undefined {
    const st = this.series.get(symbol);
    if (!st) return undefined;
    const liquidityPenalty = this.regime === 'LIQUIDITY_DROP' ? 3.2 : 1;
    const spread = st.seed.point * st.seed.spreadPoints * st.volatilityMult * liquidityPenalty;
    const mid = st.price;
    return {
      symbol,
      bid: round(mid - spread / 2, st.seed.digits),
      ask: round(mid + spread / 2, st.seed.digits),
      spread: round(spread, st.seed.digits + 1),
      digits: st.seed.digits,
      change: ((mid - st.open) / st.open) * 100,
      volume: Math.round(st.volume),
      volatility: clamp(st.volatilityMult / 3.6, 0.02, 1),
      ts: Date.now(),
    };
  }

  getCandles(symbol: string, limit = 120): Candle[] {
    const st = this.series.get(symbol);
    if (!st) return [];
    return st.candles.slice(-limit);
  }

  /** Momentum over the last n candles, normalised roughly to -1..1 */
  momentum(symbol: string, bars = 14): number {
    const c = this.getCandles(symbol, bars + 1);
    if (c.length < 3) return 0;
    const first = c[0].c;
    const last = c[c.length - 1].c;
    const range = Math.max(...c.map((x) => x.h)) - Math.min(...c.map((x) => x.l)) || 1e-9;
    return clamp((last - first) / range, -1, 1);
  }

  info(symbol: string): SymbolInfo | undefined {
    return this.series.get(symbol)?.seed;
  }

  resetDay() {
    for (const st of this.series.values()) st.open = st.price;
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round = (v: number, d: number) => Number(v.toFixed(d));
