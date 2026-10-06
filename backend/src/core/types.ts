/**
 * Domain types shared by every engine. Pure data — no UI, no framework.
 */

export type AgentRole =
  | 'MARKET_SCOUT'
  | 'TECHNICAL_ANALYST'
  | 'MACRO_ANALYST'
  | 'QUANT_ANALYST'
  | 'RISK_MANAGER'
  | 'PORTFOLIO_MANAGER'
  | 'TRADER'
  | 'NEWS_ANALYST'
  | 'BACKTEST_ANALYST'
  | 'STRATEGY_DEVELOPER';

export type AgentState =
  | 'IDLE'
  | 'SCANNING'
  | 'ANALYZING'
  | 'WAITING'
  | 'ALERT'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'ERROR';

export type MarketRegime =
  | 'TRENDING'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'NEWS_SHOCK'
  | 'LIQUIDITY_DROP';

export type Side = 'BUY' | 'SELL';

export interface MarketPrice {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  change: number; // % since session open
  volume: number;
  volatility: number; // normalized 0..1
  ts: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface MarketState {
  symbol: string;
  price: MarketPrice;
  candles: Candle[];
  regime: MarketRegime;
  trendBias: number; // -1..1
}

export interface Signal {
  symbol: string;
  side: Side;
  strength: number; // 0..100
  reason: string;
}

export interface Opportunity {
  id: string;
  number: number;
  symbol: string;
  side: Side;
  price: number;
  createdAt: number;
  stage: PipelineStage;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'EXPIRED';
  scores: {
    technical?: number;
    macro?: number;
    quant?: number;
    confidence?: number;
  };
  momentum?: 'Bullish' | 'Bearish' | 'Neutral';
  volatility?: 'Low' | 'Moderate' | 'Elevated' | 'Extreme';
  liquidity?: 'Low' | 'Normal' | 'High';
  riskPct?: number;
  riskReward?: number;
  expectedMovePct?: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  lots?: number;
  rejectionReason?: string;
  /** scout that owns the idea — only one live entry per owner/symbol */
  ownerAgentId?: string;
  /** what the owner's learning brain thinks about this setup */
  brain?: { delta: number; verdict: 'TAKE' | 'NEUTRAL' | 'AVOID'; reason: string; support: number };
  /** setup campeão da sala de backtest aplicado a esta oportunidade */
  setup?: { name: string; id: string; aligned: boolean; delta: number; winRate: number };
  agentTrail: { role: AgentRole; agentId: string; at: number }[];
  aiAssisted?: boolean;
}

export type PipelineStage =
  | 'DETECTED'
  | 'TECHNICAL'
  | 'MACRO'
  | 'QUANT'
  | 'RISK'
  | 'PORTFOLIO'
  | 'EXECUTION'
  | 'DONE';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  symbol?: string;
  deskId: string;
  state: AgentState;
  statusLine: string;
  busyUntil: number;
  stats: { analyses: number; approvals: number; rejections: number; trades: number };
  /** realised result of the day for this agent (shown on the desk) */
  daily: { realized: number; trades: number; wins: number; losses: number };
  /** live mark-to-market of the single position this agent is managing */
  openPnl: number;
  openSymbol?: string;
  config: {
    aggressiveness: number; // 0..1
    maxRiskPct: number;
    useAI: boolean;
  };
  avatar: { skin: string; shirt: string; hair: string; build: number };
  hiredAt: number;
  activity: string; // micro-behaviour: TYPING | PHONE | WRITING | COFFEE | WALKING | POINTING | TALKING | IDLE
}

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  lots: number;
  type: 'MARKET' | 'LIMIT';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  dealId?: string;
  filledPrice?: number;
  message: string;
  retcode?: number;
}

export interface Position {
  id: string;
  ticket?: number;
  symbol: string;
  side: Side;
  lots: number;
  entry: number;
  current: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl: number;
  openedAt: number;
  opportunityId?: string;
  agentId?: string;
}

export interface ClosedTrade {
  id: string;
  number: number;
  symbol: string;
  side: Side;
  lots: number;
  entry: number;
  exit: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
  durationMs: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'RISK_FLATTEN';
  agentId?: string;
}

export interface AccountSnapshot {
  broker: string;
  mode: 'SIMULATION' | 'MT5_LIVE';
  login: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  dayPnl: number;
  openPositions: number;
  tradesToday: number;
  winRate: number;
  riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  exposurePct: number;
}

export interface NewsEvent {
  id: string;
  currency: string;
  title: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  at: number; // sim timestamp
  forecast?: string;
  previous?: string;
  actual?: string;
  released: boolean;
}

export interface ChatMessage {
  id: string;
  at: number;
  agentId: string;
  agentName: string;
  role: AgentRole;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

export type EventType =
  | 'MARKET_TICK'
  | 'MARKET_MOVEMENT'
  | 'REGIME_CHANGED'
  | 'OPPORTUNITY_DETECTED'
  | 'TECHNICAL_ANALYSIS_STARTED'
  | 'TECHNICAL_ANALYSIS_COMPLETED'
  | 'MACRO_ANALYSIS_STARTED'
  | 'MACRO_ANALYSIS_COMPLETED'
  | 'QUANT_ANALYSIS_STARTED'
  | 'QUANT_ANALYSIS_COMPLETED'
  | 'RISK_REVIEW_STARTED'
  | 'TRADE_APPROVED'
  | 'TRADE_REJECTED'
  | 'ORDER_SUBMITTED'
  | 'ORDER_FILLED'
  | 'ORDER_REJECTED'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'STOP_LOSS_TRIGGERED'
  | 'TAKE_PROFIT_TRIGGERED'
  | 'LESSON_LEARNED'
  | 'LAB_EXPERIMENT'
  | 'SETUP_PROMOTED'
  | 'NEWS_EVENT'
  | 'NEWS_RELEASED'
  | 'AGENT_STATE'
  | 'AGENT_ACTIVITY'
  | 'AGENT_HIRED'
  | 'AGENT_FIRED'
  | 'AGENT_SPEAK'
  | 'AMBIENT'
  | 'CAMERA_FOCUS'
  | 'SIM_CONTROL'
  | 'SNAPSHOT';

export interface SystemEvent<T = any> {
  id: string;
  type: EventType;
  at: number;
  payload: T;
}
