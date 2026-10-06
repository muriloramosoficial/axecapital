import type { Order, OrderResult, Position } from '../core/types.js';
import type { SymbolInfo } from '../market/interfaces.js';

export interface BrokerAccount {
  login: string;
  server: string;
  name: string;
  company: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  mode: 'SIMULATION' | 'MT5_LIVE';
}

/**
 * Trading abstraction. `SimulatedBroker` fulfils it today, `MT5Broker` talks to
 * the local MetaTrader 5 terminal (already logged-in account) through the
 * Python bridge. Nothing above this interface knows the difference.
 */
export interface TradingBroker {
  readonly name: string;
  readonly mode: 'SIMULATION' | 'MT5_LIVE';
  isConnected(): Promise<boolean>;
  getAccount(): Promise<BrokerAccount>;
  listSymbols(): Promise<SymbolInfo[]>;
  placeOrder(order: Order): Promise<OrderResult>;
  closePosition(id: string): Promise<OrderResult>;
  getPositions(): Promise<Position[]>;
}
