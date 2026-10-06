import * as THREE from 'three';
import { useStore } from '../state/store';

/**
 * Shared pool of canvas "screens". Every monitor on the floor samples one of
 * these textures, so a 60-monitor office costs ~14 canvases instead of 60.
 */

export type ScreenKind =
  | 'CHART'
  | 'DOM'
  | 'RISK'
  | 'QUANT'
  | 'NEWS'
  | 'WATCHLIST'
  | 'EXEC'
  | 'TERMINAL'
  | 'EQUITY'
  | 'BACKTEST'
  | 'OPTIMIZER';

/** espaço lógico de desenho (o canvas é SCALE vezes maior, para nitidez) */
const W = 512;
const H = 320;
const SCALE = 2;

const GREEN = '#2ee08a';
const RED = '#ff4d5e';
const BLUE = '#5aa9ff';
const AMBER = '#f5a524';
const DIM = '#5b6b80';

interface Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  kind: ScreenKind;
  symbol?: string;
}

const screens = new Map<string, Screen>();
const history = new Map<string, number[]>();

function make(key: string, kind: ScreenKind, symbol?: string): Screen {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const s: Screen = { canvas, ctx, texture, kind, symbol };
  screens.set(key, s);
  return s;
}

export function getScreen(kind: ScreenKind, symbol?: string): THREE.CanvasTexture {
  const key = `${kind}:${symbol ?? ''}`;
  return (screens.get(key) ?? make(key, kind, symbol)).texture;
}

function pushHistory(symbol: string, price: number) {
  let arr = history.get(symbol);
  if (!arr) {
    arr = Array.from({ length: 160 }, () => price);
    history.set(symbol, arr);
  }
  arr.push(price);
  if (arr.length > 220) arr.shift();
}

export function candlesFor(symbol: string, group = 4) {
  const arr = history.get(symbol) ?? [];
  const out: { o: number; h: number; l: number; c: number }[] = [];
  for (let i = 0; i + group <= arr.length; i += group) {
    const slice = arr.slice(i, i + group);
    out.push({ o: slice[0], h: Math.max(...slice), l: Math.min(...slice), c: slice[slice.length - 1] });
  }
  return out;
}

let lastUpdate = 0;
let blink = 0;

/** Called from the render loop; repaints every screen at ~8 fps. */
export function updateScreens(now: number) {
  const st = useStore.getState();
  for (const [sym, p] of Object.entries(st.prices)) pushHistory(sym, p.bid);
  if (now - lastUpdate < 110) return;
  lastUpdate = now;
  blink = (blink + 1) % 1000;

  for (const s of screens.values()) {
    const ctx = s.ctx;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    paintFrame(ctx, s);
    switch (s.kind) {
      case 'CHART':
        paintChart(ctx, s.symbol ?? 'EURUSD');
        break;
      case 'DOM':
        paintDom(ctx, s.symbol ?? 'EURUSD');
        break;
      case 'RISK':
        paintRisk(ctx);
        break;
      case 'QUANT':
        paintQuant(ctx);
        break;
      case 'NEWS':
        paintNews(ctx);
        break;
      case 'WATCHLIST':
        paintWatchlist(ctx);
        break;
      case 'EXEC':
        paintExec(ctx);
        break;
      case 'TERMINAL':
        paintTerminal(ctx);
        break;
      case 'EQUITY':
        paintEquity(ctx);
        break;
      case 'BACKTEST':
        paintBacktest(ctx);
        break;
      case 'OPTIMIZER':
        paintOptimizer(ctx);
        break;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    s.texture.needsUpdate = true;
  }
}

// ──────────────────────────────────────────────────────────── primitives ──
function paintFrame(ctx: CanvasRenderingContext2D, s: Screen) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070c14');
  g.addColorStop(1, '#040810');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(90,169,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.font = '600 13px JetBrains Mono, monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('AXE CAPITAL · SIMULATION', 12, 20);
  const t = new Date().toISOString().slice(11, 19);
  ctx.textAlign = 'right';
  ctx.fillText(t, W - 12, 20);
  ctx.textAlign = 'left';
  ctx.fillStyle = blink % 6 < 3 ? GREEN : '#1c3b2c';
  ctx.beginPath();
  ctx.arc(W - 112, 15, 3.5, 0, Math.PI * 2);
  ctx.fill();
  void s;
}

function grid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = 'rgba(120,160,200,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const yy = y + (h / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    const xx = x + (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
}

function ema(values: number[], n: number) {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  values.forEach((v, i) => {
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

function paintChart(ctx: CanvasRenderingContext2D, symbol: string) {
  const st = useStore.getState();
  const price = st.prices[symbol];
  const candles = candlesFor(symbol).slice(-54);
  const x = 12;
  const y = 58;
  const w = W - 70;
  const h = 168;

  // cabeçalho estilo terminal
  ctx.fillStyle = 'rgba(90,169,255,0.07)';
  ctx.fillRect(0, 28, W, 26);
  ctx.font = '700 18px JetBrains Mono, monospace';
  ctx.fillStyle = '#e8f0fb';
  ctx.fillText(symbol, 12, 47);
  ctx.font = '500 11px JetBrains Mono, monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('M1', 12 + ctx.measureText(symbol).width + 46, 47);

  grid(ctx, x, y, w, h);

  if (candles.length > 4 && price) {
    const hi = Math.max(...candles.map((c) => c.h));
    const lo = Math.min(...candles.map((c) => c.l));
    const pad = (hi - lo) * 0.12 || 1e-6;
    const top = hi + pad;
    const bottom = lo - pad;
    const span = top - bottom || 1e-9;
    const cw = w / candles.length;
    const yOf = (v: number) => y + h - ((v - bottom) / span) * h;

    // escala de preço à direita
    ctx.font = '500 10px JetBrains Mono, monospace';
    for (let i = 0; i <= 4; i++) {
      const v = bottom + (span / 4) * i;
      ctx.fillStyle = 'rgba(140,170,200,0.45)';
      ctx.fillText(v.toFixed(price.digits), x + w + 6, yOf(v) + 3);
    }

    // candles
    candles.forEach((c, i) => {
      const cx = x + i * cw + cw / 2;
      const up = c.c >= c.o;
      ctx.strokeStyle = up ? GREEN : RED;
      ctx.fillStyle = up ? GREEN : RED;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, yOf(c.h));
      ctx.lineTo(cx, yOf(c.l));
      ctx.stroke();
      const t2 = yOf(Math.max(c.o, c.c));
      const b2 = yOf(Math.min(c.o, c.c));
      if (up) {
        ctx.globalAlpha = 0.9;
        ctx.fillRect(cx - cw * 0.32, t2, cw * 0.64, Math.max(1.3, b2 - t2));
        ctx.globalAlpha = 1;
      } else {
        ctx.fillRect(cx - cw * 0.32, t2, cw * 0.64, Math.max(1.3, b2 - t2));
      }
    });

    // médias móveis rápida/lenta
    const closes = candles.map((c) => c.c);
    const fast = ema(closes, 9);
    const slow = ema(closes, 21);
    const line = (series: number[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      series.forEach((v, i) => {
        const px = x + i * cw + cw / 2;
        const py = yOf(v);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    line(fast, 'rgba(245,165,36,0.85)', 1.5);
    line(slow, 'rgba(90,169,255,0.75)', 1.5);

    // volume
    const vh = 26;
    const vy = y + h + 6;
    const maxV = Math.max(...candles.map((c) => Math.abs(c.c - c.o))) || 1e-9;
    candles.forEach((c, i) => {
      const cx = x + i * cw + cw / 2;
      const bh = (Math.abs(c.c - c.o) / maxV) * vh;
      ctx.fillStyle = c.c >= c.o ? 'rgba(46,224,138,0.35)' : 'rgba(255,77,94,0.35)';
      ctx.fillRect(cx - cw * 0.32, vy + vh - bh, cw * 0.64, bh);
    });

    // etiqueta do último preço
    const lastY = yOf(candles[candles.length - 1].c);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(200,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, lastY);
    ctx.lineTo(x + w, lastY);
    ctx.stroke();
    ctx.setLineDash([]);
    const up = price.change >= 0;
    ctx.fillStyle = up ? GREEN : RED;
    ctx.fillRect(x + w + 2, lastY - 9, 58, 18);
    ctx.fillStyle = '#04070c';
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.fillText(price.bid.toFixed(price.digits), x + w + 6, lastY + 4);
  }

  // rodapé de dados
  if (price) {
    const up = price.change >= 0;
    ctx.font = '700 22px JetBrains Mono, monospace';
    ctx.fillStyle = up ? GREEN : RED;
    ctx.textAlign = 'right';
    ctx.fillText(price.bid.toFixed(price.digits), W - 12, 47);
    ctx.font = '500 11px JetBrains Mono, monospace';
    ctx.fillText(`${up ? '+' : ''}${price.change.toFixed(2)}%`, W - 12, 300);
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText(
      `BID ${price.bid.toFixed(price.digits)}  ASK ${price.ask.toFixed(price.digits)}  SPREAD ${(price.spread * Math.pow(10, price.digits)).toFixed(1)}p`,
      12,
      286,
    );
    ctx.fillStyle = price.volatility > 0.6 ? AMBER : BLUE;
    ctx.fillText(`VOL ${(price.volatility * 100).toFixed(0)}%  ·  ${useStore.getState().config.regime}`, 12, 300);
  }
}

function paintDom(ctx: CanvasRenderingContext2D, symbol: string) {
  const st = useStore.getState();
  const p = st.prices[symbol];
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#dbe6f5';
  ctx.fillText(`DEPTH · ${symbol}`, 14, 48);
  if (!p) return;
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const yy = 68 + i * 24;
    const isAsk = i < rows / 2;
    const level = isAsk ? p.ask + (rows / 2 - i) * p.spread : p.bid - (i - rows / 2) * p.spread;
    const size = 0.4 + Math.abs(Math.sin((blink + i * 13) / 7)) * 9;
    ctx.fillStyle = isAsk ? 'rgba(255,77,94,0.16)' : 'rgba(46,224,138,0.14)';
    ctx.fillRect(14, yy - 13, (size / 9.4) * (W - 180), 18);
    ctx.font = '500 13px JetBrains Mono, monospace';
    ctx.fillStyle = isAsk ? RED : GREEN;
    ctx.fillText(level.toFixed(p.digits), 20, yy);
    ctx.textAlign = 'right';
    ctx.fillStyle = DIM;
    ctx.fillText(`${size.toFixed(2)}M`, W - 18, yy);
    ctx.textAlign = 'left';
  }
}

function paintRisk(ctx: CanvasRenderingContext2D) {
  const st = useStore.getState();
  const acc = st.account;
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#ffd3d3';
  ctx.fillText('RISK CONTROL', 14, 48);
  if (!acc) return;
  const rows: [string, string, string][] = [
    ['EXPOSURE', `${acc.exposurePct.toFixed(1)}%`, acc.exposurePct > 50 ? RED : GREEN],
    ['OPEN POS', String(acc.openPositions), BLUE],
    ['DAY P&L', `${acc.dayPnl >= 0 ? '+' : ''}${acc.dayPnl.toFixed(2)}`, acc.dayPnl >= 0 ? GREEN : RED],
    ['WIN RATE', `${acc.winRate}%`, AMBER],
    ['RISK LEVEL', acc.riskLevel, acc.riskLevel === 'LOW' ? GREEN : AMBER],
    ['REGIME', st.config.regime.replace('_', ' '), BLUE],
  ];
  rows.forEach(([k, v, c], i) => {
    const yy = 80 + i * 32;
    ctx.font = '500 13px JetBrains Mono, monospace';
    ctx.fillStyle = DIM;
    ctx.fillText(k, 18, yy);
    ctx.textAlign = 'right';
    ctx.font = '700 16px JetBrains Mono, monospace';
    ctx.fillStyle = c;
    ctx.fillText(v, W - 18, yy);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(18, yy + 7, W - 36, 1);
  });
}

function paintQuant(ctx: CanvasRenderingContext2D) {
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#9fe7ff';
  ctx.fillText('MODEL · MONTE CARLO', 14, 48);
  const x = 14;
  const y = 64;
  const w = W - 28;
  const h = 180;
  grid(ctx, x, y, w, h);
  for (let p = 0; p < 7; p++) {
    ctx.strokeStyle = `rgba(90,200,255,${0.12 + p * 0.06})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const v = Math.sin((i + blink * 0.6 + p * 9) / 6) * (i / 40) * 0.5 + (i / 40) * (p - 3) * 0.22;
      const px = x + (i / 40) * w;
      const py = y + h / 2 - v * h * 0.42;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.font = '500 12px JetBrains Mono, monospace';
  ctx.fillStyle = DIM;
  const op = useStore.getState().opportunities[0];
  ctx.fillText(`PATHS 10,000   HORIZON 30m   SEED ${1000 + (blink % 900)}`, 14, 268);
  ctx.fillStyle = GREEN;
  ctx.fillText(`P(target) ${op?.scores?.confidence ?? 62}%   EV ${(op?.expectedMovePct ?? 0.28).toFixed(2)}%`, 14, 290);
}

function paintNews(ctx: CanvasRenderingContext2D) {
  const st = useStore.getState();
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#ffd9a8';
  ctx.fillText('ECONOMIC CALENDAR', 14, 48);
  st.news.slice(0, 7).forEach((n, i) => {
    const yy = 76 + i * 30;
    const color = n.impact === 'HIGH' ? RED : n.impact === 'MEDIUM' ? AMBER : DIM;
    ctx.fillStyle = color;
    ctx.fillRect(14, yy - 10, 4, 14);
    ctx.font = '500 13px JetBrains Mono, monospace';
    ctx.fillStyle = n.released ? DIM : '#d8e3f2';
    ctx.fillText(`${n.currency}  ${n.title.slice(0, 26)}`, 26, yy);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    const delta = n.at - st.simNow;
    ctx.fillText(n.released ? (n.actual ?? 'OUT') : `${Math.max(0, Math.round(delta / 60000))}m`, W - 16, yy);
    ctx.textAlign = 'left';
  });
}

function paintWatchlist(ctx: CanvasRenderingContext2D) {
  const st = useStore.getState();
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#dbe6f5';
  ctx.fillText('MARKET WATCH', 14, 48);
  Object.values(st.prices)
    .slice(0, 8)
    .forEach((p, i) => {
      const yy = 76 + i * 29;
      ctx.font = '500 14px JetBrains Mono, monospace';
      ctx.fillStyle = '#c3cfe0';
      ctx.fillText(p.symbol, 16, yy);
      ctx.textAlign = 'right';
      ctx.fillStyle = p.change >= 0 ? GREEN : RED;
      ctx.fillText(p.bid.toFixed(p.digits), W - 92, yy);
      ctx.fillText(`${p.change >= 0 ? '+' : ''}${p.change.toFixed(2)}%`, W - 16, yy);
      ctx.textAlign = 'left';
    });
}

function paintExec(ctx: CanvasRenderingContext2D) {
  const st = useStore.getState();
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#b9ffd2';
  ctx.fillText(st.config.executionMode === 'MT5_LIVE' ? 'MT5 EXECUTION' : 'EXECUTION BLOTTER', 14, 48);
  const rows = [...st.positions.map((p) => ({ ...p, open: true })), ...st.closed.slice(0, 6).map((t) => ({ ...t, open: false, current: t.exit }))];
  rows.slice(0, 7).forEach((r: any, i) => {
    const yy = 78 + i * 30;
    ctx.font = '500 13px JetBrains Mono, monospace';
    ctx.fillStyle = r.side === 'BUY' ? GREEN : RED;
    ctx.fillText(`${r.side === 'BUY' ? '▲' : '▼'} ${r.symbol}`, 16, yy);
    ctx.fillStyle = DIM;
    ctx.fillText(`${r.lots.toFixed(2)}`, 150, yy);
    ctx.fillText(r.open ? 'OPEN' : 'CLOSED', 210, yy);
    ctx.textAlign = 'right';
    ctx.fillStyle = r.pnl >= 0 ? GREEN : RED;
    ctx.fillText(`${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(2)}`, W - 16, yy);
    ctx.textAlign = 'left';
  });
  if (!rows.length) {
    ctx.fillStyle = DIM;
    ctx.font = '500 13px JetBrains Mono, monospace';
    ctx.fillText('awaiting approved orders…', 16, 90);
  }
}

const CODE = [
  'def edge(df):',
  '  z = (df.c - df.c.rolling(34).mean())',
  '  return z / df.c.rolling(34).std()',
  'sig = edge(m1).clip(-3, 3)',
  'pos = sizing(sig, risk=0.005)',
  'bt  = backtest(pos, costs=spread)',
  'print(bt.sharpe, bt.maxdd)',
  '>> sharpe 1.84  maxdd -3.2%',
];
function paintTerminal(ctx: CanvasRenderingContext2D) {
  ctx.font = '500 13px JetBrains Mono, monospace';
  ctx.fillStyle = GREEN;
  CODE.forEach((line, i) => {
    ctx.globalAlpha = i * 4 < blink % 60 ? 1 : 0.35;
    ctx.fillText(line, 16, 60 + i * 24);
  });
  ctx.globalAlpha = 1;
  if (blink % 8 < 4) ctx.fillRect(16 + ctx.measureText(CODE[7]).width + 6, 60 + 7 * 24 - 10, 7, 13);
}

// ──────────────────────────────────────────────── telas do laboratório ─────
function paintEquity(ctx: CanvasRenderingContext2D) {
  const st = useStore.getState();
  const lab = st.lab;
  const champ = lab?.champions?.[0];
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#dbe6f5';
  ctx.fillText('EQUITY CURVE · BACKTEST', 14, 48);
  const x = 14;
  const y = 64;
  const w = W - 28;
  const h = 176;
  grid(ctx, x, y, w, h);

  // curva sintética coerente com a expectância do campeão
  const trades = champ?.trades ?? 40;
  const exp = champ?.expectancyR ?? 0.1;
  const wr = champ?.winRate ?? 0.5;
  let eq = 0;
  let peak = 0;
  const pts: number[] = [];
  let seed = (champ?.name?.length ?? 7) * 13;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < Math.max(20, Math.min(trades, 90)); i++) {
    eq += rand() < wr ? exp + 0.8 : exp - 0.9;
    peak = Math.max(peak, eq);
    pts.push(eq);
  }
  const hi = Math.max(...pts, 1);
  const lo = Math.min(...pts, -1);
  const span = hi - lo || 1;
  ctx.strokeStyle = eq >= 0 ? GREEN : RED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const px = x + (i / (pts.length - 1)) * w;
    const py = y + h - ((v - lo) / span) * h;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.font = '500 12px JetBrains Mono, monospace';
  ctx.fillStyle = DIM;
  ctx.fillText(champ ? `${champ.symbol} · ${champ.name}`.slice(0, 48) : 'aguardando primeiro setup aprovado', 14, 262);
  ctx.fillStyle = BLUE;
  ctx.fillText(
    champ
      ? `HIT ${(champ.winRate * 100).toFixed(0)}%   EXP ${champ.expectancyR.toFixed(2)}R   PF ${champ.profitFactor.toFixed(2)}   DD ${champ.maxDdR.toFixed(1)}R`
      : 'rodando experimentos…',
    14,
    284,
  );
  ctx.fillStyle = DIM;
  ctx.fillText(`EXPERIMENTOS ${lab?.experiments ?? 0}   PROMOÇÕES ${lab?.promotions ?? 0}`, 14, 304);
}

function paintBacktest(ctx: CanvasRenderingContext2D) {
  const lab = useStore.getState().lab;
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#dbe6f5';
  ctx.fillText('SETUP LEADERBOARD', 14, 48);
  ctx.font = '500 11px JetBrains Mono, monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('SETUP', 14, 70);
  ctx.textAlign = 'right';
  ctx.fillText('HIT', W - 150, 70);
  ctx.fillText('EXP', W - 96, 70);
  ctx.fillText('PF', W - 48, 70);
  ctx.fillText('N', W - 14, 70);
  ctx.textAlign = 'left';
  (lab?.leaderboard ?? []).slice(0, 8).forEach((row: any, i: number) => {
    const yy = 92 + i * 25;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(90,169,255,0.05)';
    ctx.fillRect(10, yy - 15, W - 20, 22);
    ctx.font = '500 11px JetBrains Mono, monospace';
    ctx.fillStyle = '#c9d8ea';
    ctx.fillText(`${row.symbol} ${row.name}`.slice(0, 40), 14, yy);
    ctx.textAlign = 'right';
    ctx.fillStyle = row.winRate >= 0.55 ? GREEN : row.winRate >= 0.45 ? AMBER : RED;
    ctx.fillText(`${(row.winRate * 100).toFixed(0)}%`, W - 150, yy);
    ctx.fillStyle = row.expectancyR > 0 ? GREEN : RED;
    ctx.fillText(`${row.expectancyR.toFixed(2)}R`, W - 96, yy);
    ctx.fillStyle = DIM;
    ctx.fillText(row.profitFactor.toFixed(2), W - 48, yy);
    ctx.fillText(String(row.trades), W - 14, yy);
    ctx.textAlign = 'left';
  });
  if (!lab?.leaderboard?.length) {
    ctx.fillStyle = DIM;
    ctx.fillText('nenhum experimento concluído ainda…', 14, 100);
  }
}

function paintOptimizer(ctx: CanvasRenderingContext2D) {
  const lab = useStore.getState().lab;
  ctx.font = '700 16px JetBrains Mono, monospace';
  ctx.fillStyle = '#dbe6f5';
  ctx.fillText('OPTIMIZER · GERAÇÃO ' + (lab?.generation ?? 1), 14, 48);
  const x = 40;
  const y = 70;
  const w = W - 60;
  const h = 150;
  grid(ctx, x, y, w, h);
  ctx.font = '500 10px JetBrains Mono, monospace';
  ctx.fillStyle = DIM;
  ctx.fillText('EXP R', 8, y + 10);
  ctx.fillText('HIT %', x + w - 34, y + h + 18);
  (lab?.leaderboard ?? []).forEach((row: any) => {
    const px = x + Math.min(1, Math.max(0, row.winRate)) * w;
    const py = y + h - Math.min(1, Math.max(0, (row.expectancyR + 0.5) / 2)) * h;
    ctx.fillStyle = row.expectancyR > 0.1 ? 'rgba(46,224,138,0.8)' : 'rgba(245,165,36,0.7)';
    ctx.beginPath();
    ctx.arc(px, py, 3 + Math.min(6, row.trades / 12), 0, Math.PI * 2);
    ctx.fill();
  });
  const f = (lab?.findings ?? [])[0];
  ctx.font = '500 11px JetBrains Mono, monospace';
  ctx.fillStyle = '#9fb6cc';
  const text = f ? `${f.author}: ${f.text}` : 'bancada livre — iniciando varredura de parâmetros…';
  wrap(ctx, text, 14, 250, W - 28, 15, 4);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y + lines * lh);
      lines++;
      line = word;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y + lines * lh);
}
