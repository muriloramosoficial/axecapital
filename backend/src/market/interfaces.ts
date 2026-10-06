import type { Candle, MarketPrice } from '../core/types.js';

export interface SymbolInfo {
  symbol: string;
  description: string;
  digits: number;
  point: number;
  contractSize: number;
  category: 'FOREX' | 'METAL' | 'INDEX' | 'CRYPTO' | 'ENERGY' | 'OTHER';
  tradable: boolean;
}

/** Abstraction that will later be fulfilled by MT5 / any real market data vendor. */
export interface MarketDataProvider {
  readonly name: string;
  readonly mode: 'SIMULATION' | 'MT5_LIVE';
  listSymbols(): Promise<SymbolInfo[]>;
  getPrice(symbol: string): MarketPrice | undefined;
  getCandles(symbol: string, limit?: number): Candle[];
  subscribe(symbol: string): void;
  unsubscribe(symbol: string): void;
  isConnected(): boolean;
}
