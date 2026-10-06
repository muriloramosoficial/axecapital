import type { Order, OrderResult, Position } from '../core/types.js';
import type { SymbolInfo } from '../market/interfaces.js';
import { MT5Bridge } from '../mt5/client.js';
import type { BrokerAccount, TradingBroker } from './interfaces.js';

/**
 * Execution against the local MetaTrader 5 terminal, using the account that is
 * already logged in. Symbols are discovered from Market Watch / the account.
 */
export class MT5Broker implements TradingBroker {
  readonly name = 'MetaTrader 5 (local terminal)';
  readonly mode = 'MT5_LIVE' as const;
  constructor(public bridge = new MT5Bridge()) {}

  async isConnected() {
    try {
      const s = await this.bridge.status();
      return !!s.connected;
    } catch {
      return false;
    }
  }

  async getAccount(): Promise<BrokerAccount> {
    const s = await this.bridge.status();
    const a = s.account;
    if (!a) throw new Error(s.error || 'MT5 not connected');
    return {
      login: String(a.login),
      server: a.server,
      name: a.name,
      company: a.company,
      currency: a.currency,
      balance: a.balance,
      equity: a.equity,
      margin: a.margin,
      freeMargin: a.margin_free,
      leverage: a.leverage,
      mode: 'MT5_LIVE',
    };
  }

  async listSymbols(): Promise<SymbolInfo[]> {
    const { symbols } = await this.bridge.symbols();
    return symbols.map((s: any) => ({
      symbol: s.name,
      description: s.description || s.name,
      digits: s.digits,
      point: s.point,
      contractSize: s.trade_contract_size ?? 100000,
      category: categorise(s.path || '', s.name),
      tradable: s.trade_mode !== 0,
    }));
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    const r = await this.bridge.order({
      symbol: order.symbol,
      side: order.side,
      volume: order.lots,
      sl: order.stopLoss,
      tp: order.takeProfit,
      comment: order.comment?.slice(0, 28) || 'AxeCapital',
    });
    return {
      ok: !!r.ok,
      orderId: r.order ? String(r.order) : undefined,
      dealId: r.deal ? String(r.deal) : undefined,
      filledPrice: r.price,
      message: r.comment || r.message || (r.ok ? 'filled' : 'rejected'),
      retcode: r.retcode,
    };
  }

  async closePosition(id: string): Promise<OrderResult> {
    const r = await this.bridge.close(Number(id));
    return { ok: !!r.ok, orderId: id, filledPrice: r.price, message: r.comment || 'closed', retcode: r.retcode };
  }

  async getPositions(): Promise<Position[]> {
    const { positions } = await this.bridge.positions();
    return positions.map((p: any) => ({
      id: String(p.ticket),
      ticket: p.ticket,
      symbol: p.symbol,
      side: p.type === 0 ? 'BUY' : 'SELL',
      lots: p.volume,
      entry: p.price_open,
      current: p.price_current,
      stopLoss: p.sl || undefined,
      takeProfit: p.tp || undefined,
      pnl: p.profit,
      openedAt: p.time * 1000,
    }));
  }
}

function categorise(path: string, name: string): SymbolInfo['category'] {
  const p = (path + ' ' + name).toUpperCase();
  if (p.includes('XAU') || p.includes('XAG') || p.includes('METAL')) return 'METAL';
  if (p.includes('BTC') || p.includes('ETH') || p.includes('CRYPTO')) return 'CRYPTO';
  if (p.includes('OIL') || p.includes('GAS') || p.includes('ENERG')) return 'ENERGY';
  if (p.includes('INDIC') || p.includes('INDEX') || /US\d{2,3}|NAS|SPX|GER|UK100/.test(p)) return 'INDEX';
  return 'FOREX';
}
