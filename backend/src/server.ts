import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { bus } from './core/event-bus.js';
import { sim } from './engines/simulation-engine.js';
import { agents } from './agents/registry.js';
import { DESKS, ROLE_META } from './agents/office-layout.js';
import { ai } from './ai/provider.js';
import { brains } from './agents/learning.js';
import type { AgentRole, MarketRegime } from './core/types.js';

const PORT = Number(process.env.PORT || 8787);
const app = express();
app.use(cors());
app.use(express.json());

const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true, mode: sim.config.executionMode, mt5: sim.mt5Connected }));
api.get('/snapshot', (_req, res) => res.json(sim.snapshot()));
api.get('/layout', (_req, res) => res.json({ desks: DESKS, roleMeta: ROLE_META }));
api.get('/events', (_req, res) => res.json(bus.recent(150)));

// ── symbols: MT5 account symbols when the terminal is up, simulation otherwise
api.get('/symbols', async (_req, res) => {
  try {
    if (sim.mt5Connected) {
      const symbols = await sim.mt5Broker.listSymbols();
      return res.json({ source: 'MT5', symbols });
    }
  } catch (err: any) {
    console.warn('[symbols] MT5 unavailable:', err?.message);
  }
  const symbols = await sim.market.listSymbols();
  res.json({ source: 'SIMULATION', symbols });
});

api.get('/mt5/status', async (_req, res) => {
  try {
    const status = await sim.mt5Broker.bridge.status();
    sim.mt5Connected = !!status.connected;
    res.json({ ...status, bridgeUrl: sim.mt5Broker.bridge.baseUrl });
  } catch (err: any) {
    sim.mt5Connected = false;
    res.json({
      connected: false,
      error: `MetaTrader 5 bridge não encontrada em ${sim.mt5Broker.bridge.baseUrl} — o escritório segue rodando em simulação (${err?.message ?? 'offline'}).`,
      bridgeUrl: sim.mt5Broker.bridge.baseUrl,
    });
  }
});

api.post('/mt5/bridge-url', (req, res) => {
  const { url } = req.body ?? {};
  if (typeof url === 'string' && url.startsWith('http')) {
    sim.mt5Broker.bridge.baseUrl = url.replace(/\/$/, '');
    sim.persist();
  }
  res.json({ bridgeUrl: sim.mt5Broker.bridge.baseUrl });
});

// ── agents ───────────────────────────────────────────────────────────────
api.get('/agents', (_req, res) =>
  res.json({ agents: agents.list(), freeDesks: agents.freeDesks(), roleMeta: ROLE_META }),
);

api.post('/agents', async (req, res) => {
  try {
    const { role, name, symbol, deskId, aggressiveness, maxRiskPct, useAI } = req.body ?? {};
    if (!role || !(role in ROLE_META)) return res.status(400).json({ error: 'invalid role' });
    if (symbol) await sim.ensureSymbol(symbol);
    const agent = agents.hire({ role: role as AgentRole, name, symbol, deskId, aggressiveness, maxRiskPct, useAI });
    sim.persist();
    if (agent.symbol && !sim.watchlist.includes(agent.symbol)) sim.setWatchlist([...sim.watchlist, agent.symbol]);
    sim.systemSay(`${agent.name} joined the floor as ${ROLE_META[agent.role].label}${agent.symbol ? ` on ${agent.symbol}` : ''}.`, 'good');
    res.json(agent);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'cannot hire' });
  }
});

api.patch('/agents/:id', (req, res) => {
  const a = agents.update(req.params.id, req.body ?? {});
  if (!a) return res.status(404).json({ error: 'not found' });
  if (a.symbol && !sim.watchlist.includes(a.symbol)) sim.setWatchlist([...sim.watchlist, a.symbol]);
  sim.persist();
  res.json(a);
});

api.delete('/agents/:id', (req, res) => {
  const a = agents.get(req.params.id);
  const ok = agents.fire(req.params.id);
  if (ok && a) sim.systemSay(`${a.name} left the ${ROLE_META[a.role].label} desk.`, 'warn');
  sim.persist();
  res.json({ ok });
});

// ── learning brains ──────────────────────────────────────────────────────
api.get('/agents/:id/brain', (req, res) => {
  const a = agents.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'agent not found' });
  const brain = brains.for(a.role, a.name, a.symbol);
  res.json({ agent: { id: a.id, name: a.name, role: a.role, symbol: a.symbol }, brain: brain.summary() });
});

api.post('/agents/:id/brain/reset', (req, res) => {
  const a = agents.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'agent not found' });
  const brain = brains.for(a.role, a.name, a.symbol);
  brains.reset(brain.key);
  sim.persistMemory();
  sim.systemSay(`${a.name} wiped their trading memory and starts learning from scratch.`, 'warn');
  res.json({ ok: true });
});

api.get('/brains', (_req, res) =>
  res.json({
    brains: brains
      .list()
      .map((b) => ({ key: b.key, name: b.name, role: b.role, symbol: b.symbol, samples: b.samples, winRate: b.winRate, pnl: b.pnl, expectancyR: b.expectancyR, profitFactor: b.profitFactor }))
      .sort((a, b) => b.pnl - a.pnl),
  }),
);

// ── simulation control ───────────────────────────────────────────────────
api.post('/sim/control', (req, res) => {
  const { running, speed, regime, autoRegime, executionMode, watchlist, maxExposurePct } = req.body ?? {};
  if (typeof running === 'boolean') sim.setRunning(running);
  if (typeof speed === 'number') sim.setSpeed(speed);
  if (regime) sim.setRegime(regime as MarketRegime);
  if (typeof autoRegime === 'boolean') sim.config.autoRegime = autoRegime;
  if (typeof maxExposurePct === 'number') sim.config.maxExposurePct = maxExposurePct;
  if (typeof autoRegime === 'boolean' || typeof maxExposurePct === 'number') sim.persist();
  if (executionMode) sim.setExecutionMode(executionMode);
  if (Array.isArray(watchlist)) sim.setWatchlist(watchlist);
  res.json(sim.config);
});

api.post('/sim/reset', (_req, res) => {
  sim.resetDay();
  res.json({ ok: true });
});

api.post('/sim/event', (_req, res) => res.json(sim.injectEvent()));

api.post('/positions/:id/close', async (req, res) => {
  const r = await sim.broker.closePosition(req.params.id);
  res.json(r);
});

// ── AI provider (LM Studio / Ollama / OpenAI-compatible custom) ───────────
api.get('/ai/config', (_req, res) => res.json({ ...ai.config, apiKey: ai.config.apiKey ? '***' : '' }));

api.post('/ai/config', (req, res) => {
  const patch = { ...req.body };
  if (patch.apiKey === '***') delete patch.apiKey;
  const cfg = ai.update(patch);
  sim.persist();
  sim.systemSay(
    cfg.enabled ? `AI layer enabled — ${cfg.provider} @ ${cfg.baseUrl} (${cfg.model}).` : 'AI layer disabled, running on heuristics.',
  );
  res.json({ ...cfg, apiKey: cfg.apiKey ? '***' : '' });
});

api.get('/ai/models', async (_req, res) => {
  try {
    res.json({ models: await ai.listModels() });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'cannot reach provider', models: [] });
  }
});

api.post('/ai/test', async (_req, res) => {
  try {
    const text = await ai.chat('You are a trading desk assistant. Answer in one short sentence.', 'Say hello to the Axe Capital desk.');
    res.json({ ok: true, text });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message ?? 'failed' });
  }
});

app.use('/api', api);

// serve the built frontend if present (single-process production mode)
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
}

wss.on('connection', (ws) => {
  send(ws, 'snapshot', sim.snapshot());
  const off = bus.on('*', (evt) => send(ws, 'event', evt));
  ws.on('close', off);
  ws.on('error', off);
});

// market frames at ~8 Hz for every client
setInterval(() => {
  const frame = {
    simNow: sim.simNow,
    prices: sim.prices(),
    account: sim.account(),
    positions: sim.positions,
    opportunities: [...sim.opportunities.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    news: sim.news.filter((n) => n.at > sim.simNow - 20 * 60_000).slice(0, 10),
    nextNews: sim.nextHighImpact() ?? null,
    mt5Connected: sim.mt5Connected,
    config: sim.config,
    agents: agents.list().map((a) => ({
      id: a.id,
      state: a.state,
      statusLine: a.statusLine,
      activity: a.activity,
      stats: a.stats,
      daily: a.daily,
      openPnl: a.openPnl,
      openSymbol: a.openSymbol,
      symbol: a.symbol,
    })),
  };
  const data = JSON.stringify({ type: 'frame', payload: frame });
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(data);
}, 125);

sim.start();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[axe-capital] engine listening on http://0.0.0.0:${PORT}`);
  console.log(`[axe-capital] MT5 bridge expected at ${sim.mt5Broker.bridge.baseUrl}`);
});
