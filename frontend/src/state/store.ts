import { create } from 'zustand';
import type {
  AccountSnapshot,
  Agent,
  AIConfig,
  ChatMessage,
  ClosedTrade,
  Desk,
  MarketPrice,
  NewsEvent,
  Opportunity,
  Position,
  RoleMeta,
  SimConfig,
} from '../types';

export type HudMode = 'full' | 'broadcast' | 'clean';
/** director = roteiro cinematográfico automático · follow = só segue eventos · manual = usuário no controle */
export type CameraMode = 'director' | 'follow' | 'manual';

const HUD_MODES: HudMode[] = ['full', 'broadcast', 'clean'];

/** Painéis que o backoffice pode ligar/desligar individualmente. */
export type HudKey =
  | 'topHud'
  | 'pipeline'
  | 'news'
  | 'briefing'
  | 'wire'
  | 'inspector'
  | 'scoreboard'
  | 'comms'
  | 'lab'
  | 'journal'
  | 'marketRail'
  | 'controlBar'
  | 'captions'
  | 'resultCard'
  | 'spotlight'
  | 'modeNotice'
  | 'watermark';

export const HUD_CATALOG: { key: HudKey; label: string; hint: string; group: string }[] = [
  { key: 'topHud', label: 'Barra da conta', hint: 'Saldo, equity, P&L do dia, posições, win rate', group: 'Topo' },
  { key: 'pipeline', label: 'Pipeline de análise', hint: 'Scout → Technical → … → Execution, com os scores', group: 'Coluna esquerda' },
  { key: 'news', label: 'Calendário macro', hint: 'Agenda de CPI/NFP/FOMC com contagem regressiva', group: 'Coluna esquerda' },
  { key: 'briefing', label: 'Market briefing', hint: 'Resumo da IA sobre as manchetes', group: 'Coluna esquerda' },
  { key: 'wire', label: 'News wire', hint: 'Manchetes do crawler de notícias', group: 'Coluna esquerda' },
  { key: 'inspector', label: 'Inspetor do agente', hint: 'Ficha do agente selecionado', group: 'Coluna esquerda' },
  { key: 'scoreboard', label: 'Placar rotativo', hint: 'Ranking de P&L, precisão, produção e setups', group: 'Coluna esquerda' },
  { key: 'comms', label: 'Desk comms', hint: 'Conversa entre os agentes', group: 'Coluna direita' },
  { key: 'lab', label: 'Research lab', hint: 'Setups campeões, candidatos e descobertas', group: 'Coluna direita' },
  { key: 'journal', label: 'Trade journal', hint: 'Histórico de trades encerrados', group: 'Coluna direita' },
  { key: 'marketRail', label: 'Faixa de preços', hint: 'Ticker de pares no rodapé', group: 'Rodapé' },
  { key: 'controlBar', label: 'Barra de controles', hint: 'Start/pause, velocidade, regime, câmera', group: 'Rodapé' },
  { key: 'captions', label: 'Legendas das falas', hint: 'Lower-third com o que o agente está dizendo', group: 'Transmissão' },
  { key: 'resultCard', label: 'Card de resultado', hint: 'WIN/LOSS com R e assinatura do agente', group: 'Transmissão' },
  { key: 'spotlight', label: 'Spotlight', hint: 'Destaque do agente em foco da câmera', group: 'Transmissão' },
  { key: 'modeNotice', label: 'Aviso de modo', hint: 'Lembrete de simulação / MT5 papel / MT5 live', group: 'Transmissão' },
  { key: 'watermark', label: "Marca d'água", hint: 'Logo Axe Capital no canto (some com a HUD desligada? não)', group: 'Transmissão' },
];

const DEFAULT_HUD_PREFS = Object.fromEntries(HUD_CATALOG.map((h) => [h.key, true])) as Record<HudKey, boolean>;

function readHudPrefs(): Record<HudKey, boolean> {
  try {
    const raw = localStorage.getItem('axe.hud.prefs');
    if (!raw) return { ...DEFAULT_HUD_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_HUD_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_HUD_PREFS };
  }
}

function readLS<T>(key: string, fallback: T, parse: (raw: string) => T | null): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
const writeLS = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export interface Headline {
  id: string;
  title: string;
  source: string;
  url: string;
  at: number;
  currencies: string[];
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  live: boolean;
}
export interface WireSummary {
  online: boolean;
  lastFetch: number;
  nextFetch: number;
  sources: { name: string; ok: boolean; items: number; error?: string }[];
  headlines: Headline[];
  version: number;
}
export interface Briefing {
  at: number;
  source: 'AI' | 'RULES';
  model?: string;
  headline: string;
  text: string;
  bias: { currency: string; stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; why: string }[];
  watch: string[];
  version: number;
}
export interface LabChampion {
  symbol: string;
  name: string;
  id: string;
  winRate: number;
  trades: number;
  expectancyR: number;
  profitFactor: number;
  maxDdR: number;
  slAtr: number;
  tpAtr: number;
  htf: string | null;
  author: string;
  validation: { trades: number; winRate: number; expectancyR: number };
  live: { trades: number; wins: number; pnl: number; rSum: number };
}

export interface LabSummary {
  experiments: number;
  promotions: number;
  generation: number;
  champions: LabChampion[];
  leaderboard: {
    symbol: string;
    name: string;
    winRate: number;
    trades: number;
    expectancyR: number;
    profitFactor: number;
    score: number;
    validationWinRate: number;
    validationTrades: number;
    author: string;
  }[];
  findings: { at: number; author: string; symbol: string; text: string; tone: string; promoted?: boolean }[];
}

export interface FocusTarget {
  deskId: string;
  agentId: string;
  label: string;
  at: number;
  opportunityId?: string;
}

interface AmbientPing {
  agentId: string;
  kind: string;
  at: number;
}

interface State {
  connected: boolean;
  desks: Desk[];
  roleMeta: Record<string, RoleMeta>;
  agents: Agent[];
  prices: Record<string, MarketPrice>;
  account: AccountSnapshot | null;
  positions: Position[];
  closed: ClosedTrade[];
  opportunities: Opportunity[];
  chat: ChatMessage[];
  news: NewsEvent[];
  nextNews: NewsEvent | null;
  config: SimConfig;
  simNow: number;
  mt5Connected: boolean;
  ai: AIConfig | null;
  lab: LabSummary | null;
  wire: WireSummary | null;
  briefing: Briefing | null;
  watchlist: string[];
  focus: FocusTarget | null;
  autoCamera: boolean;
  tvEnabled: boolean;
  /** 'full' = todos os painéis · 'broadcast' = só HUD + ticker · 'clean' = só o escritório */
  hudMode: HudMode;
  uiScale: number;
  cameraMode: CameraMode;
  /** agente destacado pela direção de câmera (usado no lower-third da live) */
  spotlight: { agentId: string; shot: string; reason: string; at: number } | null;
  selectedAgentId: string | null;
  ambient: AmbientPing[];
  flash: { deskId: string; tone: string; at: number } | null;
  banner: { text: string; tone: string; at: number } | null;

  setAutoCamera: (v: boolean) => void;
  setTv: (v: boolean) => void;
  setHudMode: (v: HudMode) => void;
  setCameraMode: (v: CameraMode) => void;
  setSpotlight: (v: { agentId: string; shot: string; reason: string } | null) => void;
  cycleHud: () => void;
  setUiScale: (v: number) => void;
  hudOn: boolean;
  hudPrefs: Record<HudKey, boolean>;
  setHudOn: (v: boolean) => void;
  toggleHudOn: () => void;
  setHudPref: (key: HudKey, value: boolean) => void;
  setAllHudPrefs: (value: boolean) => void;
  reloadHudFromStorage: () => void;
  select: (id: string | null) => void;
  focusDesk: (deskId: string, agentId: string, label: string) => void;
  applySnapshot: (s: any) => void;
  applyFrame: (f: any) => void;
  applyEvent: (e: any) => void;
}

const defaultConfig: SimConfig = {
  speed: 1,
  running: true,
  regime: 'TRENDING',
  autoRegime: true,
  maxExposurePct: 65,
  executionMode: 'SIMULATION',
};

export const useStore = create<State>((set, get) => ({
  connected: false,
  desks: [],
  roleMeta: {},
  agents: [],
  prices: {},
  account: null,
  positions: [],
  closed: [],
  opportunities: [],
  chat: [],
  news: [],
  nextNews: null,
  config: defaultConfig,
  simNow: Date.now(),
  mt5Connected: false,
  ai: null,
  lab: null,
  wire: null,
  briefing: null,
  watchlist: [],
  focus: null,
  autoCamera: true,
  tvEnabled: true,
  cameraMode: readLS<CameraMode>('axe.cameraMode', 'director', (r) =>
    ['director', 'follow', 'manual'].includes(r) ? (r as CameraMode) : null,
  ),
  spotlight: null,
  hudMode: readLS<HudMode>('axe.hudMode', 'full', (r) => (HUD_MODES.includes(r as HudMode) ? (r as HudMode) : null)),
  hudOn: readLS<boolean>('axe.hud.on', true, (r) => (r === '0' ? false : r === '1' ? true : null)),
  hudPrefs: readHudPrefs(),
  uiScale: readLS<number>('axe.uiScale', 1, (r) => {
    const n = Number(r);
    return Number.isFinite(n) && n >= 0.7 && n <= 1.4 ? n : null;
  }),
  selectedAgentId: null,
  ambient: [],
  flash: null,
  banner: null,

  setAutoCamera: (v) => set({ autoCamera: v }),
  setTv: (v) => set({ tvEnabled: v }),
  setCameraMode: (v) => {
    writeLS('axe.cameraMode', v);
    set({ cameraMode: v, autoCamera: v !== 'manual', spotlight: v === 'manual' ? null : get().spotlight });
  },
  setSpotlight: (v) => set({ spotlight: v ? { ...v, at: Date.now() } : null }),
  setHudMode: (v) => {
    writeLS('axe.hudMode', v);
    set({ hudMode: v });
  },
  cycleHud: () => {
    const next = HUD_MODES[(HUD_MODES.indexOf(get().hudMode) + 1) % HUD_MODES.length];
    writeLS('axe.hudMode', next);
    set({ hudMode: next });
  },
  setHudOn: (v) => {
    writeLS('axe.hud.on', v ? '1' : '0');
    set({ hudOn: v });
  },
  toggleHudOn: () => {
    const v = !get().hudOn;
    writeLS('axe.hud.on', v ? '1' : '0');
    set({ hudOn: v });
  },
  setHudPref: (key, value) => {
    const next = { ...get().hudPrefs, [key]: value };
    writeLS('axe.hud.prefs', JSON.stringify(next));
    set({ hudPrefs: next });
  },
  setAllHudPrefs: (value) => {
    const next = Object.fromEntries(HUD_CATALOG.map((h) => [h.key, value])) as Record<HudKey, boolean>;
    writeLS('axe.hud.prefs', JSON.stringify(next));
    set({ hudPrefs: next });
  },
  /** Chamado quando a outra aba (backoffice) altera as preferências. */
  reloadHudFromStorage: () => {
    set({
      hudPrefs: readHudPrefs(),
      hudOn: localStorage.getItem('axe.hud.on') !== '0',
      uiScale: Number(localStorage.getItem('axe.uiScale') ?? '1') || 1,
    });
  },
  setUiScale: (v) => {
    const clamped = Math.min(1.4, Math.max(0.7, Number(v.toFixed(2))));
    writeLS('axe.uiScale', String(clamped));
    set({ uiScale: clamped });
  },
  select: (id) => set({ selectedAgentId: id }),
  focusDesk: (deskId, agentId, label) => set({ focus: { deskId, agentId, label, at: Date.now() } }),

  applySnapshot: (s) =>
    set({
      connected: true,
      desks: s.desks,
      roleMeta: s.roleMeta,
      agents: s.agents,
      prices: s.prices,
      account: s.account,
      positions: s.positions,
      closed: s.closed,
      opportunities: s.opportunities,
      chat: s.chat,
      news: s.news,
      config: s.config,
      simNow: s.simNow,
      mt5Connected: s.mt5Connected,
      ai: s.ai,
      lab: s.lab ?? null,
      wire: s.wire ?? null,
      briefing: s.briefing ?? null,
      watchlist: s.watchlist,
    }),

  applyFrame: (f) => {
    const prev = get().agents;
    // keep object identity stable so the 3D floor only re-renders on real changes
    let dirty = false;
    const patched = prev.map((a) => {
      const u = f.agents.find((x: any) => x.id === a.id);
      if (!u) return a;
      if (
        a.state === u.state &&
        a.statusLine === u.statusLine &&
        a.activity === u.activity &&
        a.symbol === u.symbol &&
        a.stats.analyses === u.stats.analyses &&
        a.stats.trades === u.stats.trades &&
        a.openPnl === u.openPnl &&
        a.openSymbol === u.openSymbol &&
        a.daily?.realized === u.daily?.realized &&
        a.config?.useAI === u.config?.useAI
      )
        return a;
      dirty = true;
      return { ...a, ...u };
    });
    set({
      prices: f.prices,
      account: f.account,
      positions: f.positions,
      opportunities: f.opportunities,
      news: f.news,
      nextNews: f.nextNews,
      simNow: f.simNow,
      mt5Connected: f.mt5Connected,
      config: f.config,
      ai: f.ai ? ({ ...(get().ai ?? {}), ...f.ai } as any) : get().ai,
      lab: f.lab ?? get().lab,
      wire: f.wire ?? get().wire,
      briefing: f.briefing ?? get().briefing,
      agents: dirty ? patched : prev,
    });
  },

  applyEvent: (e) => {
    const s = get();
    switch (e.type) {
      case 'AGENT_SPEAK':
        set({ chat: [e.payload, ...s.chat].slice(0, 120) });
        break;
      case 'AGENT_HIRED':
        set({ agents: [...s.agents.filter((a) => a.id !== e.payload.id), e.payload] });
        break;
      case 'AGENT_FIRED':
        set({ agents: s.agents.filter((a) => a.id !== e.payload.id) });
        break;
      case 'AGENT_ACTIVITY':
        set({
          agents: s.agents.map((a) => (a.id === e.payload.id ? { ...a, activity: e.payload.activity } : a)),
          ambient: [{ agentId: e.payload.id, kind: e.payload.activity, at: Date.now() }, ...s.ambient].slice(0, 12),
        });
        break;
      case 'AGENT_STATE':
        set({
          agents: s.agents.map((a) =>
            a.id === e.payload.id
              ? { ...a, state: e.payload.state, statusLine: e.payload.statusLine, activity: e.payload.activity ?? a.activity }
              : a,
          ),
        });
        break;
      case 'CAMERA_FOCUS': {
        if (s.cameraMode === 'manual') break;
        set({ focus: { ...e.payload, at: Date.now() } });
        break;
      }
      case 'POSITION_CLOSED':
        set({ closed: [e.payload, ...s.closed].slice(0, 80) });
        break;
      case 'ORDER_FILLED':
        set({
          banner: { text: `FILLED ${e.payload.op.side} ${e.payload.op.symbol} @ ${e.payload.price}`, tone: 'good', at: Date.now() },
        });
        break;
      case 'TRADE_REJECTED':
        set({ banner: { text: `RISK VETO — ${e.payload.op.symbol}: ${e.payload.verdict.reason}`, tone: 'bad', at: Date.now() } });
        break;
      case 'TRADE_APPROVED':
        set({ banner: { text: `TRADE APPROVED — ${e.payload.op.side} ${e.payload.op.symbol}`, tone: 'good', at: Date.now() } });
        break;
      case 'NEWS_EVENT':
        set({ banner: { text: `HIGH IMPACT — ${e.payload.currency} ${e.payload.title}`, tone: 'warn', at: Date.now() } });
        break;
      case 'OPPORTUNITY_DETECTED':
        set({ opportunities: [e.payload, ...s.opportunities].slice(0, 12) });
        break;
      default:
        break;
    }
  },
}));

let socket: WebSocket | null = null;
export function connect() {
  if (socket && socket.readyState <= 1) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${proto}://${location.host}/ws`);
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'snapshot') useStore.getState().applySnapshot(msg.payload);
    else if (msg.type === 'frame') useStore.getState().applyFrame(msg.payload);
    else if (msg.type === 'event') useStore.getState().applyEvent(msg.payload);
  };
  socket.onopen = () => useStore.setState({ connected: true });
  socket.onclose = () => {
    useStore.setState({ connected: false });
    setTimeout(connect, 1500);
  };
  socket.onerror = () => socket?.close();
}


// O backoffice roda em outra aba: refletimos as mudanças de HUD na hora.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key.startsWith('axe.hud') || e.key === 'axe.uiScale' || e.key.startsWith('axe.watermark')) {
      useStore.getState().reloadHudFromStorage();
    }
  });
}
