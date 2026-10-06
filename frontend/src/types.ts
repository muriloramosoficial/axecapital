export type AgentRole =
  | 'MARKET_SCOUT'
  | 'TECHNICAL_ANALYST'
  | 'MACRO_ANALYST'
  | 'QUANT_ANALYST'
  | 'RISK_MANAGER'
  | 'PORTFOLIO_MANAGER'
  | 'TRADER'
  | 'NEWS_ANALYST';

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

export interface Desk {
  id: string;
  label: string;
  sector: 'MARKET_INTELLIGENCE' | 'RESEARCH' | 'RISK' | 'EXECUTION' | 'NEWSROOM';
  x: number;
  z: number;
  rot: number;
  monitors: number;
  width: number;
  depth: number;
  preferred: AgentRole[];
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  symbol?: string;
  deskId: string;
  state: AgentState;
  statusLine: string;
  stats: { analyses: number; approvals: number; rejections: number; trades: number };
  daily: { realized: number; trades: number; wins: number; losses: number };
  openPnl: number;
  openSymbol?: string;
  config: { aggressiveness: number; maxRiskPct: number; useAI: boolean };
  avatar: { skin: string; shirt: string; hair: string; build: number };
  activity: string;
}

export interface MarketPrice {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  change: number;
  volume: number;
  volatility: number;
  ts: number;
}

export interface Opportunity {
  id: string;
  number: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  createdAt: number;
  stage: string;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'EXPIRED';
  scores: { technical?: number; macro?: number; quant?: number; confidence?: number };
  momentum?: string;
  volatility?: string;
  liquidity?: string;
  riskPct?: number;
  riskReward?: number;
  expectedMovePct?: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  lots?: number;
  rejectionReason?: string;
  ownerAgentId?: string;
  brain?: { delta: number; verdict: 'TAKE' | 'NEUTRAL' | 'AVOID'; reason: string; support: number };
  agentTrail: { role: AgentRole; agentId: string; at: number }[];
  aiAssisted?: boolean;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  lots: number;
  entry: number;
  current: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl: number;
  openedAt: number;
}

export interface ClosedTrade {
  id: string;
  number: number;
  symbol: string;
  side: 'BUY' | 'SELL';
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
  reason: string;
}

export interface NewsEvent {
  id: string;
  currency: string;
  title: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  at: number;
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
  riskLevel: string;
  exposurePct: number;
}

export interface SimConfig {
  speed: number;
  running: boolean;
  regime: MarketRegime;
  autoRegime: boolean;
  maxExposurePct: number;
  executionMode: 'SIMULATION' | 'MT5_LIVE';
}

export interface SymbolInfo {
  symbol: string;
  description: string;
  digits: number;
  point: number;
  contractSize: number;
  category: string;
  tradable: boolean;
}

export interface AIConfig {
  enabled: boolean;
  provider: 'lmstudio' | 'ollama' | 'openai' | 'nvidia' | 'groq' | 'openrouter' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface RoleMeta {
  label: string;
  emoji: string;
  accent: string;
  blurb: string;
}

export interface Lesson {
  id: string;
  at: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  pnl: number;
  rMultiple: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: string;
  holdMs: number;
  right: string[];
  wrong: string[];
  verdict: string;
  features: Record<string, unknown>;
}

export interface BrainSummary {
  key: string;
  name: string;
  role: AgentRole;
  symbol?: string;
  samples: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  expectancyR: number;
  profitFactor: number;
  best: { key: string; label: string; n: number; winRate: number; pnl: number; r: number }[];
  worst: { key: string; label: string; n: number; winRate: number; pnl: number; r: number }[];
  calibration: { band: string; n: number; realized: number }[];
  lessons: Lesson[];
}
