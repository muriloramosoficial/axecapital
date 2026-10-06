import { uid } from '../core/event-bus.js';
import type { Order, OrderResult, Position } from '../core/types.js';
import type { SimulatedMarketDataProvider } from '../market/SimulatedMarketDataProvider.js';
import type { BrokerAccount, TradingBroker } from './interfaces.js';

export class SimulatedBroker implements TradingBroker {
  readonly name = 'Axe Capital Paper Desk';
  readonly mode = 'SIMULATION' as const;
  balance = 100_000;
  startBalance = 100_000;
  private positions = new Map<string, Position>();

  constructor(private market: SimulatedMarketDataProvider) {}

  async isConnected() {
    return true;
  }

  async getAccount(): Promise<BrokerAccount> {
    const equity = this.equity();
    return {
      login: 'SIM-884210',
      server: 'AxeCapital-Demo',
      name: 'Axe Capital Autonomous Desk',
      company: 'Axe Capital Simulation',
      currency: 'USD',
      balance: round2(this.balance),
      equity: round2(equity),
      margin: round2(this.usedMargin()),
      freeMargin: round2(equity - this.usedMargin()),
      leverage: 100,
      mode: 'SIMULATION',
    };
  }

  async listSymbols() {
    return this.market.listSymbols();
  }

  private usedMargin() {
    let m = 0;
    for (const p of this.positions.values()) {
      const info = this.market.info(p.symbol);
      m += (p.lots * (info?.contractSize ?? 100000) * p.entry) / 100;
    }
    return m;
  }

  equity() {
    let pnl = 0;
    for (const p of this.positions.values()) pnl += p.pnl;
    return this.balance + pnl;
  }

  async placeOrder(order: Order): Promise<OrderResult> {
    const price = this.market.getPrice(order.symbol);
    if (!price) return { ok: false, message: `Unknown symbol ${order.symbol}` };
    const fill = order.side === 'BUY' ? price.ask : price.bid;
    const id = uid('pos');
    const pos: Position = {
      id,
      symbol: order.symbol,
      side: order.side,
      lots: order.lots,
      entry: fill,
      current: fill,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      pnl: 0,
      openedAt: Date.now(),
    };
    this.positions.set(id, pos);
    return { ok: true, orderId: id, dealId: id, filledPrice: fill, message: 'filled', retcode: 10009 };
  }

  async closePosition(id: string): Promise<OrderResult> {
    const pos = this.positions.get(id);
    if (!pos) return { ok: false, message: 'position not found' };
    const price = this.market.getPrice(pos.symbol)!;
    const exit = pos.side === 'BUY' ? price.bid : price.ask;
    this.balance += pos.pnl;
    this.positions.delete(id);
    return { ok: true, orderId: id, filledPrice: exit, message: 'closed' };
  }

  async getPositions(): Promise<Position[]> {
    return [...this.positions.values()];
  }

  /** Called by the simulation loop: mark positions to market. */
  mark(): Position[] {
    for (const p of this.positions.values()) {
      const price = this.market.getPrice(p.symbol);
      if (!price) continue;
      p.current = p.side === 'BUY' ? price.bid : price.ask;
      const info = this.market.info(p.symbol);
      const contract = info?.contractSize ?? 100_000;
      const diff = p.side === 'BUY' ? p.current - p.entry : p.entry - p.current;
      // USD-quoted approximation — good enough for a visual simulation
      const usdPerUnit = p.symbol.endsWith('JPY') ? 1 / p.current : 1;
      p.pnl = round2(diff * p.lots * contract * usdPerUnit);
    }
    return [...this.positions.values()];
  }

  reset() {
    this.positions.clear();
    this.balance = this.startBalance;
  }
}

const round2 = (v: number) => Number(v.toFixed(2));
