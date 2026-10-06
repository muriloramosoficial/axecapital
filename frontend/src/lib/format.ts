export const money = (v: number, digits = 2) =>
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const signed = (v: number, digits = 2) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(digits)}`;

export const px = (v: number | undefined, digits = 5) => (v === undefined ? '—' : v.toFixed(digits));

export const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19);

export const countdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export const duration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export const STATE_COLOR: Record<string, string> = {
  IDLE: '#64748b',
  SCANNING: '#38bdf8',
  ANALYZING: '#f5a524',
  WAITING: '#60a5fa',
  ALERT: '#fb923c',
  APPROVED: '#4ade80',
  REJECTED: '#f05252',
  EXECUTING: '#a855f7',
  SUCCESS: '#22c55e',
  ERROR: '#ef4444',
};

export const TONE_COLOR: Record<string, string> = {
  info: 'text-slate-300',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
};

/** TradingView symbol mapping for broker-specific names (EURUSD.m, XAUUSDc, ...) */
export function tvSymbol(symbol: string) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = clean.replace(/(M|C|PRO|ECN|RAW|MICRO)$/i, '');
  const map: Record<string, string> = {
    DXY: 'TVC:DXY',
    US10Y: 'TVC:US10Y',
    VIX: 'TVC:VIX',
    XAUUSD: 'OANDA:XAUUSD',
    XAGUSD: 'OANDA:XAGUSD',
    USOIL: 'TVC:USOIL',
    US500: 'OANDA:SPX500USD',
    US30: 'OANDA:US30USD',
    NAS100: 'OANDA:NAS100USD',
    BTCUSD: 'BITSTAMP:BTCUSD',
  };
  if (map[base]) return map[base];
  if (/^[A-Z]{6}$/.test(base)) return `FX:${base}`;
  return base;
}
