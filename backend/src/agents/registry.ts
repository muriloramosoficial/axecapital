import { bus, uid } from '../core/event-bus.js';
import type { Agent, AgentRole, AgentState } from '../core/types.js';
import { DESKS, pickDesk, ROLE_META } from './office-layout.js';

const FIRST = ['Mara', 'Dante', 'Kiera', 'Yuri', 'Noor', 'Caio', 'Ingrid', 'Axel', 'Lena', 'Hugo', 'Sora', 'Vera', 'Enzo', 'Talia', 'Marcus', 'Ayla', 'Rafa', 'Nadia'];
const LAST = ['Vance', 'Okafor', 'Lindqvist', 'Barros', 'Haddad', 'Moreau', 'Kaneko', 'Duarte', 'Novak', 'Castillo', 'Ferreira', 'Weiss', 'Aoki', 'Mendes'];
const SKIN = ['#e8c39e', '#c68863', '#8d5524', '#f2d6bd', '#a66a3f', '#5c3a21'];
const HAIR = ['#1b1b1f', '#2f2118', '#55402b', '#6b6b73', '#8c3b1a', '#120f0d'];

export class AgentRegistry {
  private agents = new Map<string, Agent>();

  list() {
    return [...this.agents.values()];
  }
  get(id: string) {
    return this.agents.get(id);
  }
  byRole(role: AgentRole) {
    return this.list().filter((a) => a.role === role);
  }
  takenDesks() {
    return new Set(this.list().map((a) => a.deskId));
  }
  freeDesks() {
    const taken = this.takenDesks();
    return DESKS.filter((d) => !taken.has(d.id));
  }

  /** Pick the least busy agent of a role (the pipeline always needs someone). */
  pick(role: AgentRole, now: number): Agent | undefined {
    const pool = this.byRole(role);
    if (!pool.length) return undefined;
    const free = pool.filter((a) => a.busyUntil <= now);
    return (free.length ? free : pool).sort((a, b) => a.busyUntil - b.busyUntil)[0];
  }

  scoutFor(symbol: string, now: number) {
    const pool = this.byRole('MARKET_SCOUT').filter((a) => a.symbol === symbol);
    return pool.find((a) => a.busyUntil <= now) ?? pool[0];
  }

  hire(input: {
    role: AgentRole;
    name?: string;
    symbol?: string;
    deskId?: string;
    aggressiveness?: number;
    maxRiskPct?: number;
    useAI?: boolean;
  }): Agent {
    const taken = this.takenDesks();
    const desk = (input.deskId && !taken.has(input.deskId) ? DESKS.find((d) => d.id === input.deskId) : undefined) ?? pickDesk(input.role, taken);
    if (!desk) throw new Error('No free desk available on the floor.');
    const id = uid('agent');
    const agent: Agent = {
      id,
      name: input.name?.trim() || randomName(),
      role: input.role,
      symbol: input.symbol,
      deskId: desk.id,
      state: 'IDLE',
      statusLine: `${ROLE_META[input.role].label} ready`,
      busyUntil: 0,
      stats: { analyses: 0, approvals: 0, rejections: 0, trades: 0 },
      daily: { realized: 0, trades: 0, wins: 0, losses: 0 },
      openPnl: 0,
      config: {
        aggressiveness: input.aggressiveness ?? 0.5,
        maxRiskPct: input.maxRiskPct ?? 0.5,
        useAI: input.useAI ?? false,
      },
      avatar: {
        skin: pick(SKIN),
        shirt: pick(['#1f2937', '#0f172a', '#334155', '#1e293b', '#3f3f46', '#273549', '#422006']),
        hair: pick(HAIR),
        build: 0.9 + Math.random() * 0.25,
      },
      hiredAt: Date.now(),
      activity: 'IDLE',
    };
    this.agents.set(id, agent);
    bus.emit('AGENT_HIRED', agent);
    return agent;
  }

  fire(id: string) {
    const a = this.agents.get(id);
    if (!a) return false;
    this.agents.delete(id);
    bus.emit('AGENT_FIRED', { id, name: a.name, role: a.role });
    return true;
  }

  update(id: string, patch: Partial<Pick<Agent, 'name' | 'symbol' | 'config' | 'deskId'>>) {
    const a = this.agents.get(id);
    if (!a) return undefined;
    if (patch.name) a.name = patch.name;
    if (patch.symbol !== undefined) a.symbol = patch.symbol;
    if (patch.deskId && !this.takenDesks().has(patch.deskId)) a.deskId = patch.deskId;
    if (patch.config) a.config = { ...a.config, ...patch.config };
    bus.emit('AGENT_STATE', { id: a.id, state: a.state, statusLine: a.statusLine, activity: a.activity });
    return a;
  }

  setState(id: string, state: AgentState, statusLine?: string, busyForMs = 0, now = Date.now()) {
    const a = this.agents.get(id);
    if (!a) return;
    a.state = state;
    if (statusLine) a.statusLine = statusLine;
    if (busyForMs) a.busyUntil = now + busyForMs;
    bus.emit('AGENT_STATE', { id, state, statusLine: a.statusLine, activity: a.activity, stats: a.stats });
  }

  setActivity(id: string, activity: string, ttlMs = 4000) {
    const a = this.agents.get(id);
    if (!a) return;
    a.activity = activity;
    bus.emit('AGENT_ACTIVITY', { id, activity, ttlMs });
  }

  /** Credit a realised result to the agent that owned the idea. */
  settle(id: string, pnl: number) {
    const a = this.agents.get(id);
    if (!a) return;
    a.daily.realized = Number((a.daily.realized + pnl).toFixed(2));
    a.daily.trades++;
    if (pnl > 0) a.daily.wins++;
    else if (pnl < 0) a.daily.losses++;
    a.openPnl = 0;
    a.openSymbol = undefined;
  }

  resetDaily() {
    for (const a of this.agents.values()) {
      a.daily = { realized: 0, trades: 0, wins: 0, losses: 0 };
      a.openPnl = 0;
      a.openSymbol = undefined;
      a.state = 'IDLE';
      a.statusLine = 'New session';
      a.busyUntil = 0;
    }
  }

  clear() {
    this.agents.clear();
  }
}

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randomName = () => `${pick(FIRST)} ${pick(LAST)}`;
export const agents = new AgentRegistry();
