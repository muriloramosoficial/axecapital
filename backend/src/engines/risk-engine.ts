import type { NewsEvent, Opportunity, Position } from '../core/types.js';

export interface RiskVerdict {
  approved: boolean;
  reason: string;
  exposurePct: number;
  correlation: 'LOW' | 'MEDIUM' | 'HIGH';
  volatility: 'NORMAL' | 'ELEVATED' | 'EXTREME';
  upcomingNews?: string;
  riskPct: number;
  lots: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

const CURRENCIES = (symbol: string) => [symbol.slice(0, 3), symbol.slice(3, 6)];

export interface RiskContext {
  opportunity: Opportunity;
  price: number;
  atr: number;
  digits: number;
  contractSize: number;
  equity: number;
  positions: Position[];
  news: NewsEvent[];
  simNow: number;
  maxRiskPct: number;
  maxExposurePct: number;
  volatility: number;
  dayPnlPct: number;
}

/** Deterministic, auditable risk gate. The Risk Manager can always veto. */
export function evaluateRisk(ctx: RiskContext): RiskVerdict {
  const { opportunity: op, price, atr, equity, positions } = ctx;
  const notional = positions.reduce((s, p) => s + p.lots * p.entry * (p.symbol.includes('JPY') ? 1000 : 100000), 0);
  const exposurePct = Math.min(100, (notional / Math.max(1, equity * 100)) * 100);

  const opCur = CURRENCIES(op.symbol);
  const overlapping = positions.filter((p) => CURRENCIES(p.symbol).some((c) => opCur.includes(c)));
  const correlation: RiskVerdict['correlation'] = overlapping.length >= 3 ? 'HIGH' : overlapping.length >= 1 ? 'MEDIUM' : 'LOW';

  const vol: RiskVerdict['volatility'] = ctx.volatility > 0.75 ? 'EXTREME' : ctx.volatility > 0.45 ? 'ELEVATED' : 'NORMAL';

  const nextNews = ctx.news
    .filter((n) => !n.released && n.at > ctx.simNow && n.impact === 'HIGH')
    .sort((a, b) => a.at - b.at)[0];
  const minutesToNews = nextNews ? (nextNews.at - ctx.simNow) / 60000 : null;

  // position sizing from ATR stop
  const stopDistance = Math.max(atr * 1.4, price * 0.0006);
  const riskPct = Math.min(ctx.maxRiskPct, vol === 'EXTREME' ? ctx.maxRiskPct * 0.5 : ctx.maxRiskPct);
  const riskCash = equity * (riskPct / 100);
  const perLot = stopDistance * ctx.contractSize * (op.symbol.endsWith('JPY') ? 1 / price : 1);
  const lots = Math.max(0.01, Math.min(3, Number((riskCash / Math.max(1e-6, perLot)).toFixed(2))));
  const rrTarget = 1.8 + Math.random() * 1.1;
  const dir = op.side === 'BUY' ? 1 : -1;
  const stopLoss = round(price - dir * stopDistance, ctx.digits);
  const takeProfit = round(price + dir * stopDistance * rrTarget, ctx.digits);

  const reasons: string[] = [];
  if (exposurePct > ctx.maxExposurePct) reasons.push(`exposure ${exposurePct.toFixed(0)}% above ${ctx.maxExposurePct}% limit`);
  if (correlation === 'HIGH') reasons.push(`correlation HIGH on ${opCur.join('/')} book`);
  if (minutesToNews !== null && minutesToNews < 5) reasons.push(`${nextNews!.currency} ${nextNews!.title} in ${minutesToNews.toFixed(1)}m`);
  if (vol === 'EXTREME') reasons.push('volatility extreme, spread unstable');
  if ((op.scores.confidence ?? 0) < 58) reasons.push(`confidence ${op.scores.confidence ?? 0}% below desk floor`);
  if (ctx.dayPnlPct < -2.5) reasons.push('daily drawdown limit reached');
  if (positions.length >= 8) reasons.push('max concurrent positions');

  const approved = reasons.length === 0;
  return {
    approved,
    reason: approved
      ? `Exposure ${exposurePct.toFixed(0)}%, correlation ${correlation.toLowerCase()}, risk ${riskPct.toFixed(2)}% — cleared.`
      : reasons[0],
    exposurePct,
    correlation,
    volatility: vol,
    upcomingNews: nextNews ? `${nextNews.currency} ${nextNews.title} in ${minutesToNews!.toFixed(1)}m` : undefined,
    riskPct,
    lots,
    stopLoss,
    takeProfit,
    riskReward: Number(rrTarget.toFixed(1)),
  };
}

const round = (v: number, d: number) => Number(v.toFixed(d));
