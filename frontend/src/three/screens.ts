import * as THREE from 'three';
import { useStore } from '../state/store';

/**
 * Shared pool of canvas "screens". Every monitor on the floor samples one of
 * these textures, so a 60-monitor office costs ~14 canvases instead of 60.
 */

export type ScreenKind = 'CHART' | 'DOM' | 'RISK' | 'QUANT' | 'NEWS' | 'WATCHLIST' | 'EXEC' | 'TERMINAL';

const W = 512;
const H = 320;

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
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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
    }
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

function paintChart(ctx: CanvasRenderingContext2D, symbol: string) {
  const st = useStore.getState();
  const price = st.prices[symbol];
  const candles = candlesFor(symbol).slice(-42);
  const x = 14;
  const y = 64;
  const w = W - 28;
  const h = 176;
  grid(ctx, x, y, w, h);

  if (candles.length > 2 && price) {
    const hi = Math.max(...candles.map((c) => c.h));
    const lo = Math.min(...candles.map((c) => c.l));
    const span = hi - lo || 1e-9;
    const cw = w / candles.length;
    candles.forEach((c, i) => {
      const cx = x + i * cw + cw / 2;
      const up = c.c >= c.o;
      ctx.strokeStyle = up ? GREEN : RED;
      ctx.fillStyle = up ? GREEN : RED;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y + h - ((c.h - lo) / span) * h);
      ctx.lineTo(cx, y + h - ((c.l - lo) / span) * h);
      ctx.stroke();
      const top = y + h - ((Math.max(c.o, c.c) - lo) / span) * h;
      const bot = y + h - ((Math.min(c.o, c.c) - lo) / span) * h;
      ctx.fillRect(cx - cw * 0.3, top, cw * 0.6, Math.max(1.4, bot - top));
      ctx.globalAlpha = 1;
    });
    // moving average
    ctx.strokeStyle = 'rgba(245,165,36,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    candles.forEach((_, i) => {
      const slice = candles.slice(Math.max(0, i - 7), i + 1);
      const avg = slice.reduce((a, b) => a + b.c, 0) / slice.length;
      const px = x + i * cw + cw / 2;
      const py = y + h - ((avg - lo) / span) * h;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    // last price line
    const lastY = y + h - ((candles[candles.length - 1].c - lo) / span) * h;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(90,169,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x, lastY);
    ctx.lineTo(x + w, lastY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.font = '700 26px JetBrains Mono, monospace';
  ctx.fillStyle = '#e6eef9';
  ctx.fillText(symbol, 14, 50);
  if (price) {
    const up = price.change >= 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = up ? GREEN : RED;
    ctx.fillText(price.bid.toFixed(price.digits), W - 14, 50);
    ctx.font = '500 13px JetBrains Mono, monospace';
    ctx.fillText(`${up ? '+' : ''}${price.change.toFixed(2)}%`, W - 14, 252);
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText(`BID ${price.bid.toFixed(price.digits)}   ASK ${price.ask.toFixed(price.digits)}`, 14, 252);
    ctx.fillText(`SPREAD ${(price.spread * Math.pow(10, price.digits)).toFixed(1)}p`, 14, 272);
    ctx.fillText(`VOL ${price.volume.toLocaleString()}`, 14, 292);
    ctx.textAlign = 'right';
    ctx.fillStyle = price.volatility > 0.6 ? AMBER : BLUE;
    ctx.fillText(`VOLATILITY ${(price.volatility * 100).toFixed(0)}%`, W - 14, 272);
    ctx.fillStyle = DIM;
    ctx.fillText(`M1 · ${useStore.getState().config.regime}`, W - 14, 292);
    ctx.textAlign = 'left';
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
