import { bus, uid } from '../core/event-bus.js';
import type {
  AccountSnapshot,
  Agent,
  AgentRole,
  ChatMessage,
  ClosedTrade,
  MarketRegime,
  NewsEvent,
  Opportunity,
  Position,
} from '../core/types.js';
import { agents } from '../agents/registry.js';
import { DESKS, ROLE_META } from '../agents/office-layout.js';
import { SimulatedMarketDataProvider } from '../market/SimulatedMarketDataProvider.js';
import { SimulatedBroker } from '../broker/SimulatedBroker.js';
import { MT5Broker } from '../broker/MT5Broker.js';
import type { TradingBroker } from '../broker/interfaces.js';
import { ai } from '../ai/provider.js';
import { atr, MomentumBreakoutStrategy, macroScore, quantScore, technicalScore } from './strategy-engine.js';
import { evaluateRisk } from './risk-engine.js';
import { actualFor, buildCalendar, makeBreakingNews } from './news-engine.js';

const TICK_MS = 200;

export interface SimConfig {
  speed: number;
  running: boolean;
  regime: MarketRegime;
  autoRegime: boolean;
  maxExposurePct: number;
  executionMode: 'SIMULATION' | 'MT5_LIVE';
}

export class SimulationEngine {
  market = new SimulatedMarketDataProvider();
  simBroker = new SimulatedBroker(this.market);
  mt5Broker = new MT5Broker();
  config: SimConfig = {
    speed: 1,
    running: true,
    regime: 'TRENDING',
    autoRegime: true,
    maxExposurePct: 65,
    executionMode: 'SIMULATION',
  };
  simNow = Date.now();
  watchlist: string[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'];
  opportunities = new Map<string, Opportunity>();
  closed: ClosedTrade[] = [];
  chat: ChatMessage[] = [];
  news: NewsEvent[] = [];
  positions: Position[] = [];
  mt5Connected = false;

  private timer?: NodeJS.Timeout;
  private opCounter = 4820;
  private tradeCounter = 4820;
  private lastScan = 0;
  private lastAmbient = 0;
  private lastRegimeChange = 0;
  private strategy = new MomentumBreakoutStrategy();
  private cooldown = new Map<string, number>();
  private stageQueue: { opId: string; at: number; fn: () => void }[] = [];
  private dayStartEquity = 100_000;
  private positionTrader = new Map<string, string>();
  private lastMonitor = 0;

  get broker(): TradingBroker {
    return this.config.executionMode === 'MT5_LIVE' && this.mt5Connected ? this.mt5Broker : this.simBroker;
  }

  start() {
    this.news = buildCalendar(this.simNow);
    this.seedDesk();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.pollMT5();
    setInterval(() => this.pollMT5(), 10_000);
    setInterval(() => void this.syncMT5Prices(), 1500);
  }

  private async pollMT5() {
    try {
      this.mt5Connected = await this.mt5Broker.isConnected();
    } catch {
      this.mt5Connected = false;
    }
  }

  /** Default staffing so the floor is alive on first load. */
  private seedDesk() {
    if (agents.list().length) return;
    this.watchlist.forEach((symbol, i) => {
      if (i >= 6) return;
      agents.hire({ role: 'MARKET_SCOUT', symbol, aggressiveness: 0.35 + Math.random() * 0.4 });
      // stagger the first scan so the floor wakes up gradually
      this.cooldown.set(symbol, this.simNow + i * 90_000 + Math.random() * 120_000);
    });
    agents.hire({ role: 'TECHNICAL_ANALYST' });
    agents.hire({ role: 'QUANT_ANALYST' });
    agents.hire({ role: 'MACRO_ANALYST' });
    agents.hire({ role: 'NEWS_ANALYST' });
    agents.hire({ role: 'RISK_MANAGER', maxRiskPct: 0.5 });
    agents.hire({ role: 'PORTFOLIO_MANAGER' });
    agents.hire({ role: 'TRADER' });
  }

  // ──────────────────────────────────────────────────────────── main loop ──
  private tick() {
    const speed = this.config.running ? this.config.speed : 0;
    const dt = TICK_MS * speed;
    if (dt > 0) {
      this.simNow += dt;
      this.market.step(this.simNow, dt);
      this.updatePositions();
      this.handleNews();
      this.maybeScan();
      this.maybeRegimeShift();
    }
    this.runStageQueue();
    this.maybeAmbient();
  }

  private runStageQueue() {
    const now = Date.now();
    const due = this.stageQueue.filter((s) => s.at <= now);
    if (!due.length) return;
    this.stageQueue = this.stageQueue.filter((s) => s.at > now);
    for (const s of due) {
      try {
        s.fn();
      } catch (err) {
        console.error('[pipeline]', err);
      }
    }
  }

  private schedule(opId: string, delayMs: number, fn: () => void) {
    const compress = Math.min(4, Math.sqrt(Math.max(1, this.config.speed)));
    this.stageQueue.push({ opId, at: Date.now() + delayMs / compress, fn });
  }

  // ───────────────────────────────────────────────────────────── scanning ──
  private maybeScan() {
    if (Date.now() - this.lastScan < 900) return;
    this.lastScan = Date.now();
    const scouts = agents.byRole('MARKET_SCOUT').filter((a) => a.symbol && this.watchlist.includes(a.symbol));
    for (const scout of scouts) {
      if (scout.busyUntil > Date.now()) continue;
      if ((this.cooldown.get(scout.symbol!) ?? 0) > this.simNow) continue;
      // ── ONE ENTRY AT A TIME: this agent is already managing a live position ──
      if (this.positions.some((p) => p.agentId === scout.id || p.symbol === scout.symbol)) continue;
      if (Math.random() > 0.22) continue;
      agents.setState(scout.id, 'SCANNING', `Scanning ${scout.symbol}`);
      const candles = this.market.getCandles(scout.symbol!, 60);
      const strat = new MomentumBreakoutStrategy(scout.config.aggressiveness);
      const signal = strat.analyze({ symbol: scout.symbol!, candles, regime: this.config.regime });
      if (!signal) continue;
      if (this.activeForSymbol(scout.symbol!)) continue;
      this.cooldown.set(scout.symbol!, this.simNow + (3 + Math.random() * 6) * 60_000);
      this.openOpportunity(scout, signal.side, signal.strength, signal.reason);
    }
  }

  private activeForSymbol(symbol: string) {
    return [...this.opportunities.values()].some(
      (o) => o.symbol === symbol && !['REJECTED', 'EXECUTED', 'EXPIRED'].includes(o.status),
    );
  }

  private openOpportunity(scout: Agent, side: 'BUY' | 'SELL', strength: number, reason: string) {
    const price = this.market.getPrice(scout.symbol!)!;
    const op: Opportunity = {
      id: uid('op'),
      number: ++this.opCounter,
      symbol: scout.symbol!,
      side,
      price: side === 'BUY' ? price.ask : price.bid,
      createdAt: this.simNow,
      stage: 'DETECTED',
      status: 'UNDER_REVIEW',
      scores: {},
      ownerAgentId: scout.id,
      agentTrail: [{ role: 'MARKET_SCOUT', agentId: scout.id, at: this.simNow }],
      momentum: this.market.momentum(scout.symbol!) > 0 ? 'Bullish' : 'Bearish',
      volatility: price.volatility > 0.7 ? 'Extreme' : price.volatility > 0.45 ? 'Elevated' : price.volatility > 0.2 ? 'Moderate' : 'Low',
      liquidity: this.config.regime === 'LIQUIDITY_DROP' ? 'Low' : price.volatility > 0.6 ? 'Normal' : 'High',
    };
    this.opportunities.set(op.id, op);
    this.trim();

    agents.setState(scout.id, 'ALERT', `${side} setup on ${op.symbol}`, 2500);
    agents.setActivity(scout.id, 'POINTING');
    this.say(scout, `Unusual ${op.momentum!.toLowerCase()} momentum on ${op.symbol} — ${reason}.`, 'info');
    bus.emit('MARKET_MOVEMENT', { symbol: op.symbol, side, strength });
    bus.emit('OPPORTUNITY_DETECTED', op);
    this.focus(scout.deskId, scout.id, op.id, 'Scout detection');
    this.aiColor(scout, op, 'MARKET_SCOUT');

    this.schedule(op.id, 1500, () => this.stageTechnical(op.id));
  }

  // ───────────────────────────────────────────────────────────── pipeline ──
  private stageTechnical(opId: string) {
    const op = this.opportunities.get(opId);
    if (!op) return;
    const agent = agents.pick('TECHNICAL_ANALYST', Date.now());
    if (!agent) return this.abort(op, 'No technical analyst on the floor');
    op.stage = 'TECHNICAL';
    op.agentTrail.push({ role: 'TECHNICAL_ANALYST', agentId: agent.id, at: this.simNow });
    agents.setState(agent.id, 'ANALYZING', `Structure check ${op.symbol}`, 2200);
    agents.setActivity(agent.id, 'TYPING');
    bus.emit('TECHNICAL_ANALYSIS_STARTED', { opId, agentId: agent.id });
    this.focus(agent.deskId, agent.id, op.id, 'Technical analysis');
    this.say(agent, `Pulling ${op.symbol} structure — checking ${op.side === 'BUY' ? 'bullish' : 'bearish'} continuation.`, 'info');

    this.schedule(opId, 2200, () => {
      const score = technicalScore(this.inputs(op));
      op.scores.technical = score;
      agent.stats.analyses++;
      agents.setState(agent.id, score >= 60 ? 'SUCCESS' : 'WAITING', `Technical ${score}/100`, 800);
      bus.emit('TECHNICAL_ANALYSIS_COMPLETED', { opId, score });
      this.say(agent, score >= 60 ? `Confirming ${op.side === 'BUY' ? 'bullish' : 'bearish'} structure, technical ${score}/100.` : `Structure is weak, technical only ${score}/100.`, score >= 60 ? 'good' : 'warn');
      this.aiEnrich(agent, op, 'TECHNICAL_ANALYST', (v) => (op.scores.technical = Math.round((score + v) / 2)));
      bus.emit('OPPORTUNITY_UPDATED' as any, op);
      this.schedule(opId, 700, () => this.stageMacro(opId));
    });
  }

  private stageMacro(opId: string) {
    const op = this.opportunities.get(opId);
    if (!op) return;
    const agent = agents.pick('MACRO_ANALYST', Date.now()) ?? agents.pick('NEWS_ANALYST', Date.now());
    if (!agent) return this.stageQuant(opId);
    op.stage = 'MACRO';
    op.agentTrail.push({ role: agent.role, agentId: agent.id, at: this.simNow });
    agents.setState(agent.id, 'ANALYZING', `Macro context ${op.symbol}`, 2000);
    agents.setActivity(agent.id, Math.random() < 0.4 ? 'PHONE' : 'WRITING');
    bus.emit('MACRO_ANALYSIS_STARTED', { opId, agentId: agent.id });
    this.focus(agent.deskId, agent.id, op.id, 'Macro context');

    this.schedule(opId, 2000, () => {
      const score = macroScore(this.inputs(op));
      op.scores.macro = score;
      agent.stats.analyses++;
      const nextNews = this.nextHighImpact();
      agents.setState(agent.id, score >= 55 ? 'SUCCESS' : 'ALERT', `Macro ${score}/100`, 600);
      bus.emit('MACRO_ANALYSIS_COMPLETED', { opId, score });
      this.say(
        agent,
        nextNews
          ? `${nextNews.currency} ${nextNews.title} ahead — macro ${score}/100.`
          : `${op.symbol.slice(3)} weakness supports the move, macro ${score}/100.`,
        score >= 55 ? 'good' : 'warn',
      );
      this.aiEnrich(agent, op, 'MACRO_ANALYST', (v) => (op.scores.macro = Math.round((score + v) / 2)));
      this.schedule(opId, 600, () => this.stageQuant(opId));
    });
  }

  private stageQuant(opId: string) {
    const op = this.opportunities.get(opId);
    if (!op) return;
    const agent = agents.pick('QUANT_ANALYST', Date.now());
    if (!agent) return this.stageRisk(opId);
    op.stage = 'QUANT';
    op.agentTrail.push({ role: 'QUANT_ANALYST', agentId: agent.id, at: this.simNow });
    agents.setState(agent.id, 'ANALYZING', `Modelling ${op.symbol}`, 2200);
    agents.setActivity(agent.id, 'TYPING');
    bus.emit('QUANT_ANALYSIS_STARTED', { opId, agentId: agent.id });
    this.focus(agent.deskId, agent.id, op.id, 'Quant modelling');

    this.schedule(opId, 2200, () => {
      const score = quantScore(this.inputs(op), op.scores.technical ?? 50, op.scores.macro ?? 50);
      op.scores.quant = score;
      op.scores.confidence = Math.round((score * 0.5 + (op.scores.technical ?? 50) * 0.3 + (op.scores.macro ?? 50) * 0.2));
      op.expectedMovePct = Number((((op.scores.confidence - 40) / 100) * (0.25 + Math.random() * 0.45)).toFixed(2));
      agent.stats.analyses++;
      agents.setState(agent.id, 'SUCCESS', `Edge ${score}/100`, 600);
      bus.emit('QUANT_ANALYSIS_COMPLETED', { opId, score, confidence: op.scores.confidence });
      this.say(agent, `Expected probability ${op.scores.confidence}%, projected move ${op.expectedMovePct}%.`, 'info');
      this.aiEnrich(agent, op, 'QUANT_ANALYST', (v) => {
        op.scores.quant = Math.round((score + v) / 2);
        op.scores.confidence = Math.round((op.scores.confidence! + v) / 2);
      });
      this.schedule(opId, 600, () => this.stageRisk(opId));
    });
  }

  private stageRisk(opId: string) {
    const op = this.opportunities.get(opId);
    if (!op) return;
    const agent = agents.pick('RISK_MANAGER', Date.now());
    if (!agent) return this.abort(op, 'No risk manager on duty');
    op.stage = 'RISK';
    op.agentTrail.push({ role: 'RISK_MANAGER', agentId: agent.id, at: this.simNow });
    agents.setState(agent.id, 'ANALYZING', `Reviewing ${op.symbol} exposure`, 2200);
    agents.setActivity(agent.id, 'WRITING');
    bus.emit('RISK_REVIEW_STARTED', { opId, agentId: agent.id });
    this.focus(agent.deskId, agent.id, op.id, 'Risk review');
    this.say(agent, `Reviewing exposure and correlation for ${op.symbol}.`, 'info');

    this.schedule(opId, 2300, () => {
      const info = this.market.info(op.symbol);
      const price = this.market.getPrice(op.symbol)!;
      const equity = this.accountEquity();
      const verdict = evaluateRisk({
        opportunity: op,
        price: op.side === 'BUY' ? price.ask : price.bid,
        atr: atr(this.market.getCandles(op.symbol, 40), 14),
        digits: price.digits,
        contractSize: info?.contractSize ?? 100_000,
        equity,
        positions: this.positions,
        news: this.news,
        simNow: this.simNow,
        maxRiskPct: agent.config.maxRiskPct,
        maxExposurePct: this.config.maxExposurePct,
        volatility: price.volatility,
        dayPnlPct: ((equity - this.dayStartEquity) / this.dayStartEquity) * 100,
      });
      op.riskPct = Number(verdict.riskPct.toFixed(2));
      op.riskReward = verdict.riskReward;
      op.stopLoss = verdict.stopLoss;
      op.takeProfit = verdict.takeProfit;
      op.lots = verdict.lots;

      if (!verdict.approved) {
        op.status = 'REJECTED';
        op.stage = 'DONE';
        op.rejectionReason = verdict.reason;
        agent.stats.rejections++;
        agents.setState(agent.id, 'REJECTED', `REJECT ${op.symbol}`, 2500);
        bus.emit('TRADE_REJECTED', { op, verdict });
        this.say(agent, `Rejected. ${verdict.reason}`, 'bad');
        return;
      }
      agent.stats.approvals++;
      agents.setState(agent.id, 'APPROVED', `Approved ${op.symbol}`, 1500);
      this.say(agent, `Approved — ${verdict.reason}`, 'good');
      bus.emit('TRADE_APPROVED', { op, verdict });
      this.schedule(opId, 700, () => this.stagePortfolio(opId));
    });
  }

  private stagePortfolio(opId: string) {
    const op = this.opportunities.get(opId);
    if (!op) return;
    const agent = agents.pick('PORTFOLIO_MANAGER', Date.now());
    if (!agent) return this.stageExecution(opId);
    op.stage = 'PORTFOLIO';
    op.agentTrail.push({ role: 'PORTFOLIO_MANAGER', agentId: agent.id, at: this.simNow });
    agents.setState(agent.id, 'ANALYZING', `Sizing ${op.symbol}`, 1500);
    agents.setActivity(agent.id, 'TALKING');
    this.focus(agent.deskId, agent.id, op.id, 'Portfolio sizing');
    this.schedule(opId, 1500, () => {
      const scale = 0.7 + Math.random() * 0.5;
      op.lots = Math.max(0.01, Number(((op.lots ?? 0.1) * scale).toFixed(2)));
      agents.setState(agent.id, 'APPROVED', `Sized ${op.lots} lots`, 800);
      this.say(agent, `Allocating ${op.lots} lots on ${op.symbol}, book stays balanced.`, 'good');
      this.schedule(opId, 500, () => this.stageExecution(opId));
    });
  }

  private async stageExecution(opId: string) {
    const op = this.opportunities.get(opId);
    if (!op) return;
    const agent = agents.pick('TRADER', Date.now());
    if (!agent) return this.abort(op, 'No trader available');
    op.stage = 'EXECUTION';
    op.status = 'APPROVED';
    op.agentTrail.push({ role: 'TRADER', agentId: agent.id, at: this.simNow });
    agents.setState(agent.id, 'EXECUTING', `Executing ${op.side} ${op.symbol}`, 2200);
    agents.setActivity(agent.id, 'TYPING');
    this.focus(agent.deskId, agent.id, op.id, 'Execution');
    this.say(agent, `Executing ${op.side} ${op.symbol} ${op.lots} lots.`, 'info');
    bus.emit('ORDER_SUBMITTED', { op, agentId: agent.id, venue: this.broker.name });

    const price = this.market.getPrice(op.symbol)!;
    op.entry = op.side === 'BUY' ? price.ask : price.bid;

    try {
      const result = await this.broker.placeOrder({
        id: uid('ord'),
        symbol: op.symbol,
        side: op.side,
        lots: op.lots ?? 0.1,
        type: 'MARKET',
        stopLoss: op.stopLoss,
        takeProfit: op.takeProfit,
        comment: `Axe#${op.number}`,
      });
      if (!result.ok) {
        op.status = 'REJECTED';
        op.rejectionReason = result.message;
        agents.setState(agent.id, 'ERROR', `Order rejected: ${result.message}`, 2000);
        bus.emit('ORDER_REJECTED', { op, message: result.message });
        this.say(agent, `Order rejected by broker: ${result.message}`, 'bad');
        return;
      }
      op.entry = result.filledPrice ?? op.entry;
      op.status = 'EXECUTED';
      op.stage = 'DONE';
      agent.stats.trades++;
      agents.setState(agent.id, 'SUCCESS', `FILLED ${op.symbol} @ ${op.entry}`, 1800);
      bus.emit('ORDER_FILLED', { op, orderId: result.orderId, price: op.entry });
      bus.emit('POSITION_OPENED', { op, positionId: result.orderId });
      this.say(agent, `Filled ${op.side} ${op.symbol} at ${op.entry}. SL ${op.stopLoss} / TP ${op.takeProfit}.`, 'good');
      if (this.config.executionMode === 'MT5_LIVE' && this.mt5Connected) {
        this.systemSay(`Order routed to MetaTrader 5 terminal — ticket ${result.orderId}.`);
      }
      // attach metadata to the simulated position for the journal
      const pos = (await this.broker.getPositions()).find((p) => p.id === result.orderId);
      if (pos) {
        pos.opportunityId = op.id;
        pos.agentId = op.ownerAgentId ?? agent.id;
      }
      if (result.orderId) this.positionTrader.set(result.orderId, agent.id);
      const owner = op.ownerAgentId ? agents.get(op.ownerAgentId) : undefined;
      if (owner) {
        owner.openSymbol = op.symbol;
        owner.openPnl = 0;
        agents.setState(owner.id, 'WAITING', `Managing ${op.side} ${op.symbol} · $0.00`, 0);
        this.say(owner, `Position is live on ${op.symbol}. I own this one until it closes.`, 'info');
      }
    } catch (err: any) {
      agents.setState(agent.id, 'ERROR', `Execution error`, 2000);
      this.say(agent, `Execution error: ${err?.message ?? err}`, 'bad');
    }
  }

  private abort(op: Opportunity, reason: string) {
    op.status = 'EXPIRED';
    op.stage = 'DONE';
    op.rejectionReason = reason;
    this.systemSay(reason);
  }

  // ─────────────────────────────────────────────────────────── positions ──
  private updatePositions() {
    if (this.config.executionMode === 'MT5_LIVE' && this.mt5Connected) {
      this.mt5Broker
        .getPositions()
        .then((p) => (this.positions = p))
        .catch(() => void 0);
      return;
    }
    this.positions = this.simBroker.mark();
    this.monitorOwners();
    for (const p of [...this.positions]) {
      const price = this.market.getPrice(p.symbol);
      if (!price) continue;
      const hitTp = p.takeProfit && (p.side === 'BUY' ? price.bid >= p.takeProfit : price.ask <= p.takeProfit);
      const hitSl = p.stopLoss && (p.side === 'BUY' ? price.bid <= p.stopLoss : price.ask >= p.stopLoss);
      if (!hitTp && !hitSl) continue;
      const exit = p.side === 'BUY' ? price.bid : price.ask;
      const pnl = p.pnl;
      this.simBroker.closePosition(p.id);
      const trade: ClosedTrade = {
        id: p.id,
        number: ++this.tradeCounter,
        symbol: p.symbol,
        side: p.side,
        lots: p.lots,
        entry: p.entry,
        exit,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        pnl: Number(pnl.toFixed(2)),
        openedAt: p.openedAt,
        closedAt: Date.now(),
        durationMs: Date.now() - p.openedAt,
        result: pnl > 0.5 ? 'WIN' : pnl < -0.5 ? 'LOSS' : 'BREAKEVEN',
        reason: hitTp ? 'TAKE_PROFIT' : 'STOP_LOSS',
        agentId: p.agentId,
      };
      this.closed.unshift(trade);
      this.closed = this.closed.slice(0, 120);

      // ── daily P&L lands on the desk of the agent that owned the idea ──
      const ownerId = p.agentId;
      const owner = ownerId ? agents.get(ownerId) : undefined;
      if (owner) {
        agents.settle(owner.id, trade.pnl);
        agents.setState(
          owner.id,
          trade.pnl >= 0 ? 'SUCCESS' : 'REJECTED',
          `${trade.symbol} ${trade.result} ${fmtMoney(trade.pnl)} · day ${fmtMoney(owner.daily.realized)}`,
          2600,
        );
        agents.setActivity(owner.id, trade.pnl >= 0 ? 'STRETCH' : 'WRITING');
        this.say(
          owner,
          `${trade.symbol} closed ${trade.result.toLowerCase()} ${fmtMoney(trade.pnl)} — my day is now ${fmtMoney(owner.daily.realized)}.`,
          trade.pnl >= 0 ? 'good' : 'bad',
        );
        bus.emit('CAMERA_FOCUS', { deskId: owner.deskId, agentId: owner.id, label: 'Trade result' });
      }
      const traderId = this.positionTrader.get(p.id);
      const traderAgent = traderId ? agents.get(traderId) : undefined;
      if (traderAgent && traderAgent.id !== owner?.id) {
        traderAgent.daily.realized = Number((traderAgent.daily.realized + trade.pnl).toFixed(2));
        traderAgent.daily.trades++;
        if (trade.pnl > 0) traderAgent.daily.wins++;
        else if (trade.pnl < 0) traderAgent.daily.losses++;
      }
      this.positionTrader.delete(p.id);
      bus.emit(hitTp ? 'TAKE_PROFIT_TRIGGERED' : 'STOP_LOSS_TRIGGERED', trade);
      bus.emit('POSITION_CLOSED', trade);
      const trader = agents.pick('TRADER', Date.now());
      if (trader) {
        agents.setState(trader.id, hitTp ? 'SUCCESS' : 'ALERT', `${trade.symbol} ${trade.result}`, 1500);
        this.say(
          trader,
          `${trade.symbol} closed at ${trade.exit} — ${hitTp ? 'take profit' : 'stop loss'} ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}.`,
          hitTp ? 'good' : 'bad',
        );
      }
      this.positions = this.simBroker.mark();
    }
  }

  /** Live mark-to-market shown on the desk of whoever owns each position. */
  private monitorOwners() {
    const open = new Map<string, { symbol: string; pnl: number }>();
    for (const p of this.positions) {
      if (!p.agentId) continue;
      const cur = open.get(p.agentId);
      open.set(p.agentId, { symbol: p.symbol, pnl: (cur?.pnl ?? 0) + p.pnl });
    }
    for (const a of agents.list()) {
      const live = open.get(a.id);
      a.openPnl = live ? Number(live.pnl.toFixed(2)) : 0;
      a.openSymbol = live?.symbol;
    }
    if (Date.now() - this.lastMonitor < 1200) return;
    this.lastMonitor = Date.now();
    for (const [agentId, live] of open) {
      const a = agents.get(agentId);
      if (!a || a.busyUntil > Date.now()) continue;
      agents.setState(agentId, 'WAITING', `Managing ${live.symbol} · ${fmtMoney(live.pnl)}`);
      if (Math.random() < 0.12) agents.setActivity(agentId, Math.random() < 0.5 ? 'TYPING' : 'POINTING', 3000);
    }
  }

  // ───────────────────────────────────────────────────────────────── news ──
  private handleNews() {
    for (const n of this.news) {
      if (n.released) continue;
      const delta = n.at - this.simNow;
      if (delta <= 0) {
        n.released = true;
        n.actual = actualFor();
        bus.emit('NEWS_RELEASED', n);
        if (n.impact === 'HIGH') {
          this.market.shock(null, 1);
          const macro = agents.pick('MACRO_ANALYST', Date.now()) ?? agents.pick('NEWS_ANALYST', Date.now());
          if (macro) {
            agents.setState(macro.id, 'ALERT', `${n.currency} ${n.title} released`, 3000);
            this.say(macro, `${n.currency} ${n.title} out at ${n.actual} vs ${n.forecast} forecast.`, 'warn');
          }
          const risk = agents.pick('RISK_MANAGER', Date.now());
          if (risk) {
            agents.setState(risk.id, 'ALERT', 'Post-news volatility', 3000);
            this.say(risk, 'Volatility spike — tightening new entries for a few minutes.', 'warn');
          }
        }
      } else if (n.impact === 'HIGH' && delta < 5 * 60_000 && !(n as any)._warned) {
        (n as any)._warned = true;
        bus.emit('NEWS_EVENT', n);
        const macro = agents.pick('MACRO_ANALYST', Date.now()) ?? agents.pick('NEWS_ANALYST', Date.now());
        if (macro) {
          agents.setState(macro.id, 'ALERT', `${n.currency} event in <5m`, 2500);
          agents.setActivity(macro.id, 'PHONE');
          this.say(macro, `High impact ${n.currency} event approaching: ${n.title}.`, 'warn');
        }
        const risk = agents.pick('RISK_MANAGER', Date.now());
        if (risk) {
          this.schedule('news', 1800, () => {
            agents.setState(risk.id, 'ALERT', 'Reducing exposure', 2500);
            this.say(risk, 'Reducing exposure ahead of the print.', 'warn');
          });
        }
      }
    }
    if (this.news.filter((n) => !n.released).length < 3) {
      this.news.push(...buildCalendar(this.simNow, 4));
      this.news = this.news.slice(-40);
    }
  }

  // ──────────────────────────────────────────────────────────── ambience ──
  private maybeAmbient() {
    if (Date.now() - this.lastAmbient < 4500) return;
    this.lastAmbient = Date.now();
    if (Math.random() > 0.55) return;
    const pool = agents.list().filter((a) => a.busyUntil < Date.now());
    if (!pool.length) return;
    const a = pool[Math.floor(Math.random() * pool.length)];
    const kinds = ['COFFEE', 'PHONE', 'WRITING', 'TYPING', 'WALKING', 'TALKING', 'STRETCH'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    agents.setActivity(a.id, kind, 5000);
    bus.emit('AMBIENT', { agentId: a.id, kind, deskId: a.deskId });
    if (kind === 'PHONE' && Math.random() < 0.4) this.say(a, randomSmallTalk(a.role), 'info');
  }

  private maybeRegimeShift() {
    if (!this.config.autoRegime) return;
    if (this.simNow - this.lastRegimeChange < 18 * 60_000) return;
    if (Math.random() > 0.25) return;
    this.lastRegimeChange = this.simNow;
    const options: MarketRegime[] = ['TRENDING', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'LIQUIDITY_DROP'];
    this.setRegime(options[Math.floor(Math.random() * options.length)]);
  }

  // ────────────────────────────────────────────────────────────── helpers ──
  private inputs(op: Opportunity) {
    const price = this.market.getPrice(op.symbol)!;
    const next = this.nextHighImpact();
    return {
      candles: this.market.getCandles(op.symbol, 60),
      regime: this.config.regime,
      side: op.side,
      volatility: price.volatility,
      spreadRatio: Math.min(1, price.spread / (price.bid * 0.0004)),
      newsInMinutes: next ? (next.at - this.simNow) / 60_000 : null,
      aggressiveness: 0.5,
    };
  }

  nextHighImpact() {
    return this.news
      .filter((n) => !n.released && n.at > this.simNow && n.impact === 'HIGH')
      .sort((a, b) => a.at - b.at)[0];
  }

  private aiColor(agent: Agent, op: Opportunity, role: AgentRole) {
    this.aiEnrich(agent, op, role, () => void 0);
  }

  /** Fire-and-forget local-LLM enrichment; the desk never blocks on the model. */
  private aiEnrich(agent: Agent, op: Opportunity, role: AgentRole, apply: (score: number) => void) {
    if (!agent.config.useAI || !ai.ready) return;
    const price = this.market.getPrice(op.symbol);
    ai.analyse(role, {
      symbol: op.symbol,
      side: op.side,
      price: price?.bid,
      spread: price?.spread,
      regime: this.config.regime,
      momentum: op.momentum,
      volatility: op.volatility,
      technical: op.scores.technical,
      macro: op.scores.macro,
      upcomingNews: this.nextHighImpact()?.title,
    })
      .then((res) => {
        if (!res) return;
        op.aiAssisted = true;
        apply(res.score);
        this.say(agent, `${res.comment} (local model, ${res.bias.toLowerCase()})`, res.bias === 'NEUTRAL' ? 'info' : 'good');
      })
      .catch(() => void 0);
  }

  say(agent: Agent, text: string, tone: ChatMessage['tone']) {
    const msg: ChatMessage = {
      id: uid('msg'),
      at: this.simNow,
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      text,
      tone,
    };
    this.chat.unshift(msg);
    this.chat = this.chat.slice(0, 200);
    bus.emit('AGENT_SPEAK', msg);
  }

  systemSay(text: string, tone: ChatMessage['tone'] = 'info') {
    const msg: ChatMessage = {
      id: uid('msg'),
      at: this.simNow,
      agentId: 'system',
      agentName: 'Desk Ops',
      role: 'PORTFOLIO_MANAGER',
      text,
      tone,
    };
    this.chat.unshift(msg);
    this.chat = this.chat.slice(0, 200);
    bus.emit('AGENT_SPEAK', msg);
  }

  private focus(deskId: string, agentId: string, opportunityId: string, label: string) {
    bus.emit('CAMERA_FOCUS', { deskId, agentId, opportunityId, label });
  }

  private trim() {
    if (this.opportunities.size > 40) {
      const sorted = [...this.opportunities.values()].sort((a, b) => a.createdAt - b.createdAt);
      for (const o of sorted.slice(0, 10)) this.opportunities.delete(o.id);
    }
  }

  accountEquity() {
    return this.config.executionMode === 'MT5_LIVE' && this.mt5Connected
      ? this.simBroker.equity()
      : this.simBroker.equity();
  }

  // ─────────────────────────────────────────────────────────── public API ──
  setRegime(regime: MarketRegime) {
    this.config.regime = regime;
    this.market.setRegime(regime);
    bus.emit('REGIME_CHANGED', { regime });
    this.systemSay(`Market regime switched to ${regime.replace('_', ' ')}.`, regime === 'NEWS_SHOCK' ? 'warn' : 'info');
  }

  setSpeed(speed: number) {
    this.config.speed = Math.max(0.25, Math.min(100, speed));
    bus.emit('SIM_CONTROL', { ...this.config });
  }

  setRunning(running: boolean) {
    this.config.running = running;
    bus.emit('SIM_CONTROL', { ...this.config });
  }

  setExecutionMode(mode: 'SIMULATION' | 'MT5_LIVE') {
    this.config.executionMode = mode;
    bus.emit('SIM_CONTROL', { ...this.config });
    this.systemSay(
      mode === 'MT5_LIVE'
        ? 'Execution routed to the local MetaTrader 5 terminal (logged-in account).'
        : 'Execution routed to the internal paper desk (simulation).',
      mode === 'MT5_LIVE' ? 'warn' : 'info',
    );
  }

  /** Make sure every traded symbol exists in the price engine (MT5 names included). */
  async ensureSymbol(symbol: string) {
    if (this.market.info(symbol)) return;
    let seedPrice: number | undefined;
    let digits: number | undefined;
    let contractSize: number | undefined;
    if (this.mt5Connected) {
      try {
        const t = await this.mt5Broker.bridge.tick(symbol);
        seedPrice = (t.bid + t.ask) / 2;
        digits = t.digits;
      } catch {
        /* keep defaults */
      }
    }
    this.market.ensure(symbol, { price: seedPrice, digits, contractSize });
  }

  /** Pull real quotes from the terminal for the watchlist (when available). */
  private async syncMT5Prices() {
    if (!this.mt5Connected) return;
    try {
      const { ticks } = await this.mt5Broker.bridge.ticks(this.watchlist);
      for (const t of ticks) this.market.syncReal(t.symbol, (t.bid + t.ask) / 2);
    } catch {
      /* terminal busy — keep simulating */
    }
  }

  setWatchlist(symbols: string[]) {
    this.watchlist = symbols;
    symbols.forEach((s) => void this.ensureSymbol(s));
    bus.emit('SIM_CONTROL', { ...this.config, watchlist: symbols });
  }

  injectEvent() {
    const n = makeBreakingNews(this.simNow, ['USD', 'EUR', 'GBP', 'JPY'][Math.floor(Math.random() * 4)]);
    this.news.push(n);
    bus.emit('NEWS_EVENT', n);
    this.setRegime('NEWS_SHOCK');
    this.systemSay(`Breaking: ${n.currency} — ${n.title}.`, 'warn');
    return n;
  }

  resetDay() {
    this.simBroker.reset();
    this.positionTrader.clear();
    this.cooldown.clear();
    agents.resetDaily();
    this.closed = [];
    this.opportunities.clear();
    this.positions = [];
    this.chat = [];
    this.market.resetDay();
    this.news = buildCalendar(this.simNow);
    this.dayStartEquity = this.simBroker.equity();
    this.systemSay('New trading day started. Book flat, journal cleared.');
    bus.emit('SIM_CONTROL', { ...this.config });
  }

  account(): AccountSnapshot {
    const equity = this.simBroker.equity();
    const wins = this.closed.filter((t) => t.result === 'WIN').length;
    const exposure = Math.min(
      100,
      (this.positions.reduce((s, p) => s + p.lots * 100_000 * p.entry, 0) / Math.max(1, equity * 100)) * 100,
    );
    return {
      broker: this.broker.name,
      mode: this.config.executionMode === 'MT5_LIVE' && this.mt5Connected ? 'MT5_LIVE' : 'SIMULATION',
      login: this.config.executionMode === 'MT5_LIVE' ? 'MT5 terminal account' : 'SIM-884210',
      currency: 'USD',
      balance: Number(this.simBroker.balance.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      margin: 0,
      freeMargin: Number(equity.toFixed(2)),
      dayPnl: Number((equity - this.dayStartEquity).toFixed(2)),
      openPositions: this.positions.length,
      tradesToday: this.closed.length,
      winRate: this.closed.length ? Math.round((wins / this.closed.length) * 100) : 0,
      riskLevel: exposure > 60 ? 'HIGH' : exposure > 35 ? 'ELEVATED' : exposure > 15 ? 'MODERATE' : 'LOW',
      exposurePct: Number(exposure.toFixed(1)),
    };
  }

  prices() {
    const syms = new Set([...this.watchlist, 'DXY', 'US10Y', 'VIX', 'XAUUSD', 'USOIL', 'US500']);
    const out: Record<string, any> = {};
    for (const s of syms) {
      const p = this.market.getPrice(s);
      if (p) out[s] = p;
    }
    return out;
  }

  snapshot() {
    return {
      config: this.config,
      simNow: this.simNow,
      watchlist: this.watchlist,
      desks: DESKS,
      roleMeta: ROLE_META,
      agents: agents.list(),
      opportunities: [...this.opportunities.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12),
      positions: this.positions,
      closed: this.closed.slice(0, 40),
      chat: this.chat.slice(0, 60),
      news: this.news.filter((n) => n.at > this.simNow - 30 * 60_000).slice(0, 14),
      account: this.account(),
      prices: this.prices(),
      mt5Connected: this.mt5Connected,
      ai: { ...ai.config, apiKey: ai.config.apiKey ? '***' : '' },
    };
  }
}

export const fmtMoney = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`;

function randomSmallTalk(role: AgentRole) {
  const lines: Record<string, string[]> = {
    MARKET_SCOUT: ['Order book thinning out on my pair.', 'Spread widened for a second, watching it.'],
    TECHNICAL_ANALYST: ['Daily level still holding.', 'Retest looks clean so far.'],
    MACRO_ANALYST: ['Rates desk says front end is bid.', 'Calendar is heavy this afternoon.'],
    QUANT_ANALYST: ['Rerunning the fit on the last 400 bars.', 'Sharpe on the sim book looks fine.'],
    RISK_MANAGER: ['Keeping correlation under control today.', 'Book exposure is comfortable.'],
    PORTFOLIO_MANAGER: ['Rebalancing allocation across pairs.', 'Trimming size into the event.'],
    TRADER: ['Liquidity is decent at the moment.', 'Working the order quietly.'],
    NEWS_ANALYST: ['Wires are quiet for now.', 'Watching the CPI preview notes.'],
  };
  const arr = lines[role] ?? ['Monitoring.'];
  return arr[Math.floor(Math.random() * arr.length)];
}

export const sim = new SimulationEngine();
