/**
 * Thin HTTP client for the local MetaTrader 5 bridge (see /mt5-bridge).
 * The bridge runs on the same machine as the MT5 terminal and uses the
 * ALREADY LOGGED-IN account — no credentials are ever requested by this app.
 */
export interface MT5Status {
  connected: boolean;
  terminal?: Record<string, unknown>;
  account?: {
    login: number;
    name: string;
    server: string;
    company: string;
    currency: string;
    balance: number;
    equity: number;
    margin: number;
    margin_free: number;
    leverage: number;
    trade_allowed?: boolean;
  };
  error?: string;
}

export class MT5Bridge {
  constructor(public baseUrl = process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:8788') {}

  private async call<T>(path: string, init?: RequestInit, timeoutMs = 4000): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
      if (!res.ok) {
        // a ponte devolve { detail: "AutoTrading desligado..." } — sem isto a
        // mensagem real do MetaTrader se perdia e tudo virava "HTTP 409"
        const body = await res.text().catch(() => '');
        let detail = body;
        try {
          const j = JSON.parse(body);
          detail = j?.detail ?? j?.error ?? body;
        } catch {
          /* corpo não-JSON: usa o texto cru */
        }
        throw new Error(detail ? `${detail}` : `bridge ${path} -> HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  }

  status() {
    return this.call<MT5Status>('/status');
  }
  symbols() {
    return this.call<{ symbols: any[] }>('/symbols', undefined, 15000);
  }
  tick(symbol: string) {
    return this.call<any>(`/tick/${encodeURIComponent(symbol)}`);
  }
  ticks(symbols: string[]) {
    return this.call<{ ticks: any[] }>(`/ticks?symbols=${encodeURIComponent(symbols.join(','))}`);
  }
  candles(symbol: string, timeframe = 'M1', count = 200) {
    return this.call<{ candles: any[] }>(
      `/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}&count=${count}`,
      undefined,
      8000,
    );
  }
  positions() {
    return this.call<{ positions: any[] }>('/positions');
  }
  order(body: unknown) {
    return this.call<any>('/order', { method: 'POST', body: JSON.stringify(body) }, 15000);
  }
  diagnose(symbol = 'EURUSD', volume = 0.01) {
    return this.call<{ ok: boolean; checks: { id: string; label: string; ok: boolean; detail: string }[] }>(
      `/diagnose?symbol=${encodeURIComponent(symbol)}&volume=${volume}`,
      undefined,
      20000,
    );
  }
  testOrder(body: unknown) {
    return this.call<any>('/test-order', { method: 'POST', body: JSON.stringify(body) }, 20000);
  }
  close(ticket: number) {
    return this.call<any>('/close', { method: 'POST', body: JSON.stringify({ ticket }) }, 15000);
  }
}
